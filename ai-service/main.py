import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from core.parser import extract_text_from_pdf, extract_text_from_docx, extract_text_from_txt
from core.chunker import chunk_parsed_documents
from core.embedder import generate_embeddings
from core.vector_db import VectorStore
from core.search import hybrid_search
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

# Initialize the Vector Store instance
vector_store = VectorStore()


@app.post("/parse", summary="Parse and chunk an uploaded document")
async def parse_document(file: UploadFile = File(...)):
    filename = file.filename
    
    # Load uploaded file content into memory
    file_bytes = await file.read()
    
    # Extract suffix to choose parser
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

@app.post("/upload", summary="Parse, chunk, embed, and index an uploaded document")
async def upload_document(file: UploadFile = File(...)):
    filename = file.filename
    file_bytes = await file.read()
    ext = os.path.splitext(filename)[1].lower()
    
    try:
        # 1. Parse text based on document type
        if ext == ".pdf":
            parsed_data = extract_text_from_pdf(file_bytes, filename)
        elif ext in [".docx", ".doc"]:
            parsed_data = extract_text_from_docx(file_bytes, filename)
        elif ext == ".txt":
            parsed_data = extract_text_from_txt(file_bytes, filename)
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file format: {ext}."
            )
            
        if not parsed_data:
            raise HTTPException(status_code=422, detail="No extractable text content found.")
            
        # 2. Slice document text into chunks
        chunks = chunk_parsed_documents(parsed_data)
        
        # 3. Isolate raw strings to send to the embedding model
        texts_to_embed = [chunk["text"] for chunk in chunks]
        
        # 4. Generate local vectors (384 dimensions)
        embeddings = generate_embeddings(texts_to_embed)
        
        # 5. Insert into FAISS Index & serialize files
        vector_store.add_documents(chunks, embeddings)
        
        return {
            "status": "success",
            "filename": filename,
            "chunks_generated": len(chunks),
            "total_vectors_in_db": len(vector_store.chunks)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during indexing pipeline: {str(e)}")


@app.get("/search", summary="Search indexed documents using Hybrid Retrieval (BM25 + Semantic)")
async def search_documents(query: str, top_k: int = 5):
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")
        
    try:
        results = hybrid_search(query=query, vector_store=vector_store, top_k=top_k)
        return {
            "query": query,
            "results_returned": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing hybrid search: {str(e)}")

@app.get("/documents", summary="List unique uploaded documents and chunk statistics")
async def list_documents():
    try:
        doc_stats = {}
        for chunk in vector_store.chunks:
            source = chunk.get("metadata", {}).get("source", "Unknown")
            page = chunk.get("metadata", {}).get("page", 1)
            
            if source not in doc_stats:
                doc_stats[source] = {
                    "filename": source,
                    "total_chunks": 0,
                    "pages": set()
                }
            doc_stats[source]["total_chunks"] += 1
            doc_stats[source]["pages"].add(page)
            
        formatted_docs = []
        for name, stats in doc_stats.items():
            formatted_docs.append({
                "filename": name,
                "total_chunks": stats["total_chunks"],
                "total_pages": len(stats["pages"])
            })
            
        return {
            "documents": formatted_docs,
            "total_documents": len(formatted_docs),
            "total_chunks": len(vector_store.chunks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")


@app.post("/documents/clear", summary="Clear the local vector store index and metadata")
async def clear_documents():
    try:
        vector_store.clear()
        return {
            "status": "success",
            "message": "Vector store and document indexes cleared successfully."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear documents: {str(e)}")

@app.get("/query", summary="Query the RAG pipeline (Retrieval + Generation)")
async def query_rag(query: str, top_k: int = 5):
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query string cannot be empty.")
        
    try:
        # 1. Retrieve the top relevant chunks using the existing hybrid search
        retrieved_chunks = hybrid_search(query=query, vector_store=vector_store, top_k=top_k)
        
        if not retrieved_chunks:
            return {
                "query": query,
                "answer": "No relevant document chunks found. Please upload learning materials first.",
                "sources": []
            }
            
        # 2. Generate answer based on these chunks
        result = generate_answer(query, retrieved_chunks)
        
        return {
            "query": query,
            "answer": result["answer"],
            "sources": result["sources"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG pipeline error: {str(e)}")

# 6. Conversational Endpoints

@app.post("/chat", summary="Conversational Multi-Turn RAG pipeline")
async def chat_rag(payload: ChatRequest, top_k: int = 5):
    query = payload.message
    
    # Convert list of Pydantic models to list of standard dictionaries
    history = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    
    if not query.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
        
    try:
        # 1. Rephrase the query if a context history exists
        standalone_query = contextualize_query(query, history)
        
        # 2. Retrieve top matching chunks using the standalone query
        retrieved_chunks = hybrid_search(query=standalone_query, vector_store=vector_store, top_k=top_k)
        
        # 3. Generate answer grounded in context and conversational history
        result = generate_conversational_answer(query, history, retrieved_chunks)
        
        return {
            "query": query,
            "standalone_query": standalone_query,
            "answer": result["answer"],
            "sources": result["sources"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversational RAG pipeline error: {str(e)}")


# --- Phase 7 Study Tools Models & Endpoints ---

class StudyToolsRequest(BaseModel):
    type: str  # "flashcards" | "quiz"
    filename: str = "all"  # "all" or specific indexed filename

@app.post("/study-tools/generate", summary="Generate structured study flashcards or quizzes")
async def generate_tools_endpoint(payload: StudyToolsRequest):
    material_type = payload.type.lower()
    filename = payload.filename
    
    if material_type not in ["flashcards", "quiz"]:
        raise HTTPException(status_code=400, detail="Invalid tool type. Choose 'flashcards' or 'quiz'.")
        
    if not vector_store.chunks:
        raise HTTPException(status_code=400, detail="No documents indexed. Please upload files in the Document Hub first.")
        
    # 1. Filter chunks by filename or load all
    if filename and filename != "all":
        chunks = [c for c in vector_store.chunks if c.get("metadata", {}).get("source") == filename]
    else:
        chunks = vector_store.chunks
        
    if not chunks:
        raise HTTPException(status_code=404, detail="No indexed chunks found matching your request.")
        
    # 2. Select a representative sample of up to 10 chunks to avoid prompt limit
    sample_size = min(len(chunks), 10)
    selected_chunks = chunks[:sample_size]
    
    try:
        # 3. Call the generator and return results
        result = generate_study_materials(material_type, selected_chunks)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Study Tool Generation Error: {str(e)}")
