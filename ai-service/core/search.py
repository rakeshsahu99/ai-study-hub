import re
from typing import List, Dict, Any
from fastembed.rerank.cross_encoder import TextCrossEncoder

# Lazy load CrossEncoder model to avoid slow FastAPI startup times
rerank_model = None

def clean_tokenize(text: str) -> List[str]:
    return re.findall(r'\w+', text.lower())

def get_reranker():
    global rerank_model
    if rerank_model is None:
        # Load the ONNX quantized ms-marco-MiniLM-L-6-v2 cross encoder (PyTorch-free)
        rerank_model = TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2")
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
        
        # Prepare list of text contents to rerank
        documents = [chunk.get("text", "") for chunk in retrieved_chunks]
        
        # Rerank returns an iterable of floats (scores corresponding to each index)
        scores = list(model.rerank(query, documents))
        
        # Zip scores with original chunks and sort descending
        scored_chunks = []
        for idx, score in enumerate(scores):
            chunk_copy = dict(retrieved_chunks[idx])
            score_val = float(score)
            chunk_copy["rerank_score"] = score_val
            chunk_copy["rrf_score"] = score_val
            scored_chunks.append(chunk_copy)
            
        scored_chunks.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored_chunks[:top_k]
        
    except Exception as e:
        print(f"Error during Cross-Encoder re-ranking: {e}. Falling back to default retrieval.")
        for chunk in retrieved_chunks:
            if "rrf_score" not in chunk:
                chunk["rrf_score"] = float(chunk.get("similarity", 0.0) or 0.0)
        return retrieved_chunks[:top_k]
