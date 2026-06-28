import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from core.parser import extract_text_from_pdf, extract_text_from_docx, extract_text_from_txt
from core.chunker import chunk_parsed_documents
from core.embedder import generate_embeddings
from core.supabase_db import SupabaseVectorStore
from core.generator import generate_answer, contextualize_query, generate_conversational_answer, generate_study_materials
from pydantic import BaseModel
from typing import List, Dict

class ChatMessagePayload(BaseModel):
    role: str
    content: str
class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessagePayload]


app = FastAPI(
    title="AI Study Hub Service",
    description="Python RAG backend for document parsing, chunking, and search.",
    version="1.0.0"
)

# Enable CORS to allow your Next.js gateway to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the Supabase Vector Store
supabase_store = SupabaseVectorStore()


@app.post("/parse", summary="Parse and chunk an uploaded document")
async def parse_document(file: UploadFile = File(...)):
    filename = file.filename
    file_bytes = await file.read()
    ext = os.path.splitext(filename)[1].lower()
    
    try:
        # 1. Parse text based on file format
        if ext == ".pdf":
            parsed_data = extract_text_from_pdf(file_bytes, filename)
        elif ext in [".docx", ".doc"]:
            parsed_data = extract_text_from_docx(file_bytes, filename)
        elif ext == ".txt":
            parsed_data = extract_text_from_txt(file_bytes, filename)
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: {ext}. Only PDF, DOCX, and TXT are supported."
            )
            
        if not parsed_data:
            raise HTTPException(status_code=422, detail="No readable text could be extracted.")
            
        # 2. Chunk parsed text
        chunks = chunk_parsed_documents(parsed_data)
        
        return {
            "filename": filename,
            "total_chunks": len(chunks),
            "chunks": chunks
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Run uvicorn on localhost port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)


@app.post("/upload", summary="Parse, chunk, embed, and index an uploaded document in Supabase")
async def upload_document(
    file: UploadFile = File(...),
    mode: str = "local", # "local" | "gemini"
    x_user_id: str = Header(None)
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
        
    filename = file.filename
    file_bytes = await file.read()
    ext = os.path.splitext(filename)[1].lower()
    
    try:
        # 1. Parse text based on document type and mode
        if ext == ".pdf":
            if mode == "gemini":
                from core.parser import extract_text_multimodal_pdf
                parsed_data = extract_text_multimodal_pdf(file_bytes, filename)
            else:
                parsed_data = extract_text_from_pdf(file_bytes, filename)
        elif ext in [".docx", ".doc"]:
            parsed_data = extract_text_from_docx(file_bytes, filename)
        elif ext == ".txt":
            parsed_data = extract_text_from_txt(file_bytes, filename)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}.")
            
        if not parsed_data:
            raise HTTPException(status_code=422, detail="No extractable text content found.")
            
        # 2. Slice document text into chunks
        chunks = chunk_parsed_documents(parsed_data)
        
        # 3. Isolate raw strings to send to the embedding model
        texts_to_embed = [chunk["text"] for chunk in chunks]
        
        # 4. Generate local vectors (384 dimensions)
        embeddings = generate_embeddings(texts_to_embed)
        
        # 5. Insert into Supabase cloud table using user_id
        supabase_store.add_documents(x_user_id, chunks, embeddings)
        
        return {
            "status": "success",
            "filename": filename,
            "chunks_generated": len(chunks)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during indexing pipeline: {str(e)}")


@app.get("/search", summary="Search user documents using hybrid cloud search")
async def search_documents(
    query: str, 
    top_k: int = 5,
    x_user_id: str = Header(None)
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")
        
    try:
        # Embed user search query
        query_vector = generate_embeddings([query])[0]
        
        # Retrieve more candidates (e.g. top_k * 3) for the re-ranker to score
        candidate_count = max(top_k * 3, 15)
        results = supabase_store.search(user_id=x_user_id, query_embedding=query_vector, filename="all", top_k=candidate_count)
        
        # Re-rank results locally
        from core.search import rerank_documents
        reranked_results = rerank_documents(query, results, top_k=top_k)
        
        return {
            "query": query,
            "results_returned": len(reranked_results),
            "results": reranked_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing hybrid search: {str(e)}")


@app.get("/documents", summary="List user's uploaded documents and chunk statistics")
async def list_documents(x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
        
    try:
        docs = supabase_store.get_user_documents(x_user_id)
        total_chunks = sum(doc["total_chunks"] for doc in docs)
        return {
            "documents": docs,
            "total_documents": len(docs),
            "total_chunks": total_chunks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")


@app.post("/documents/clear", summary="Clear user's cloud index and metadata records")
async def clear_documents(x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
        
    try:
        supabase_store.clear_user_documents(x_user_id)
        return {
            "status": "success",
            "message": "User document index cleared successfully from the cloud."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear documents: {str(e)}")


@app.get("/query", summary="Query the cloud RAG pipeline")
async def query_rag(
    query: str, 
    top_k: int = 5,
    x_user_id: str = Header(None)
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")
        
    try:
        # Embed query
        query_vector = generate_embeddings([query])[0]
        candidate_count = max(top_k * 3, 15)
        retrieved_chunks = supabase_store.search(user_id=x_user_id, query_embedding=query_vector, filename="all", top_k=candidate_count)
        
        if not retrieved_chunks:
            return {
                "query": query,
                "answer": "No relevant document chunks found. Please upload learning materials first.",
                "sources": []
            }
            
        # Re-rank retrieved chunks
        from core.search import rerank_documents
        reranked_chunks = rerank_documents(query, retrieved_chunks, top_k=top_k)
        
        result = generate_answer(query, reranked_chunks)
        return {
            "query": query,
            "answer": result["answer"],
            "sources": result["sources"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG pipeline error: {str(e)}")


@app.post("/chat", summary="Conversational RAG using Supabase storage")
async def chat_rag(
    payload: ChatRequest, 
    top_k: int = 5,
    x_user_id: str = Header(None)
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
        
    query = payload.message
    history = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    
    if not query.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
        
    try:
        # Rephrase context query
        standalone_query = contextualize_query(query, history)
        query_vector = generate_embeddings([standalone_query])[0]
        
        candidate_count = max(top_k * 3, 15)
        retrieved_chunks = supabase_store.search(user_id=x_user_id, query_embedding=query_vector, filename="all", top_k=candidate_count)
        
        # Re-rank chunks using the standalone formulated query
        from core.search import rerank_documents
        reranked_chunks = rerank_documents(standalone_query, retrieved_chunks, top_k=top_k)
        
        result = generate_conversational_answer(query, history, reranked_chunks)
        
        return {
            "query": query,
            "standalone_query": standalone_query,
            "answer": result["answer"],
            "sources": result["sources"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversational RAG error: {str(e)}")


# --- Phase 7 Study Tools Models & Endpoints ---

class StudyToolsRequest(BaseModel):
    type: str  # "flashcards" | "quiz"
    filename: str = "all"  # "all" or specific indexed filename

@app.post("/study-tools/generate", summary="Generate study flashcards or quizzes from cloud storage")
async def generate_tools_endpoint(
    payload: StudyToolsRequest,
    x_user_id: str = Header(None)
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user credential header 'X-User-Id'")
        
    material_type = payload.type.lower()
    filename = payload.filename
    
    if material_type not in ["flashcards", "quiz"]:
        raise HTTPException(status_code=400, detail="Invalid tool type. Choose 'flashcards' or 'quiz'.")
        
    # Get user documents from Supabase
    docs = supabase_store.get_user_documents(x_user_id)
    if not docs:
        raise HTTPException(status_code=400, detail="No documents indexed. Please upload files in the Document Hub first.")
        
    try:
        # Retrieve chunks for target document (using a dummy zero vector since we want to query a block of chunks)
        test_vector = [0.0] * 384
        chunks = supabase_store.search(user_id=x_user_id, query_embedding=test_vector, filename=filename, top_k=10)
        
        if not chunks:
            raise HTTPException(status_code=404, detail="No indexed chunks found matching your request.")
            
        result = generate_study_materials(material_type, chunks)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Study Tool Generation Error: {str(e)}")
