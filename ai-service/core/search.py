import re
from typing import List, Dict, Any
from rank_bm25 import BM25Okapi
from core.vector_db import VectorStore
from core.embedder import generate_embeddings

# A simple tokenizer using regular expressions
def clean_tokenize(text: str) -> List[str]:
    return re.findall(r'\w+', text.lower())

def hybrid_search(query: str, vector_store: VectorStore, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Performs hybrid retrieval using BM25 and FAISS vector search, fused using RRF.
    """
    # Safety check: if no documents are stored, return empty
    if not vector_store.chunks:
        return []
    
    # We will retrieve a larger set of candidates from both systems to fuse them
    candidate_limit = max(top_k * 3, 20)
    
    # ----------------------------------------------------
    # 1. Lexical Search (BM25)
    # ----------------------------------------------------
    # Prepare tokenized corpus from currently indexed document chunks
    corpus_texts = [chunk["text"] for chunk in vector_store.chunks]
    tokenized_corpus = [clean_tokenize(text) for text in corpus_texts]
    
    # Initialize BM25 with the corpus
    bm25 = BM25Okapi(tokenized_corpus)
    tokenized_query = clean_tokenize(query)
    
    # Get scores for the query terms
    bm25_scores = bm25.get_scores(tokenized_query)
    
    # Zip chunks with their BM25 scores and sort (higher score is better)
    bm25_results = []
    for idx, score in enumerate(bm25_scores):
        if score > 0:  # Only consider documents with at least one matching term
            bm25_results.append((vector_store.chunks[idx], score))
            
    bm25_results = sorted(bm25_results, key=lambda x: x[1], reverse=True)[:candidate_limit]
    
    # ----------------------------------------------------
    # 2. Semantic Search (FAISS)
    # ----------------------------------------------------
    # Generate query embedding vector
    query_vector = generate_embeddings([query])[0]
    
    # Search FAISS index (returns list of (chunk, distance_score))
    faiss_raw_results = vector_store.search(query_vector, top_k=candidate_limit)
    
    # Sort semantic results (lower distance score is better)
    semantic_results = sorted(faiss_raw_results, key=lambda x: x[1])

    # ----------------------------------------------------
    # 3. Reciprocal Rank Fusion (RRF)
    # ----------------------------------------------------
    rrf_scores = {}
    k_constant = 60.0
    
    # Helper structure to uniquely identify chunks (using a tuple or text hash)
    # We will map unique strings (chunk text) back to their metadata
    chunk_lookup = {}

    # Rank semantic hits (1-indexed)
    for rank, (chunk, _) in enumerate(semantic_results, 1):
        text_id = chunk["text"]
        chunk_lookup[text_id] = chunk
        
        if text_id not in rrf_scores:
            rrf_scores[text_id] = 0.0
        rrf_scores[text_id] += 1.0 / (k_constant + rank)
        
    # Rank BM25 hits (1-indexed)
    for rank, (chunk, _) in enumerate(bm25_results, 1):
        text_id = chunk["text"]
        chunk_lookup[text_id] = chunk
        
        if text_id not in rrf_scores:
            rrf_scores[text_id] = 0.0
        rrf_scores[text_id] += 1.0 / (k_constant + rank)
        
    # Sort all candidate chunks by their RRF score descending
    sorted_rrf = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
    
    # Compile the final top_k results
    final_results = []
    for text_id, score in sorted_rrf[:top_k]:
        original_chunk = chunk_lookup[text_id]
        final_results.append({
            "text": original_chunk["text"],
            "metadata": original_chunk["metadata"],
            "rrf_score": score
        })
        
    return final_results
