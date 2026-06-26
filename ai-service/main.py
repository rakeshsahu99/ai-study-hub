import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from core.parser import extract_text_from_pdf, extract_text_from_docx, extract_text_from_txt
from core.chunker import chunk_parsed_documents

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
