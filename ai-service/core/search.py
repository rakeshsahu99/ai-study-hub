import re
from typing import List, Dict, Any
from sentence_transformers import CrossEncoder

# Lazy load CrossEncoder model to avoid slow FastAPI startup times
rerank_model = None

def clean_tokenize(text: str) -> List[str]:
    return re.findall(r'\w+', text.lower())

def get_reranker():
    global rerank_model
    if rerank_model is None:
        # Downloads a lightweight MS-MARCO model (~80MB) during the first run
        rerank_model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
    return rerank_model

def rerank_documents(query: str, retrieved_chunks: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Re-ranks retrieved chunks against the search query using a local Cross-Encoder.
    Returns the top_k re-ranked chunks sorted by similarity.
    """
    if not retrieved_chunks:
        return []
        
    try:
        model = get_reranker()
        
        # 1. Prepare pairs for cross-encoder matching
        pairs = [(query, chunk.get("text", "")) for chunk in retrieved_chunks]
        
        # 2. Predict relevance scores (higher is better)
        scores = model.predict(pairs)
        
        # 3. Zip scores with original chunks and sort descending
        scored_chunks = []
        for chunk, score in zip(retrieved_chunks, scores):
            chunk_copy = dict(chunk)
            chunk_copy["rerank_score"] = float(score)
            scored_chunks.append(chunk_copy)
            
        scored_chunks.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored_chunks[:top_k]
        
    except Exception as e:
        print(f"Error during Cross-Encoder re-ranking: {e}. Falling back to default retrieval.")
        return retrieved_chunks[:top_k]
