import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from core.parser import extract_text_from_pdf, extract_text_from_docx, extract_text_from_txt
from core.chunker import chunk_parsed_documents
from core.embedder import generate_embeddings
from core.vector_db import VectorStore

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