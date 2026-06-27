import os
import json
import faiss
import numpy as np
from typing import List, Dict, Any, Tuple

class VectorStore:
    def __init__(self, storage_dir: str = "storage/vector_store", dimension: int = 384):
        self.storage_dir = storage_dir
        self.dimension = dimension
        self.index_path = os.path.join(storage_dir, "index.faiss")
        self.metadata_path = os.path.join(storage_dir, "metadata.json")
        
        # Ensure target storage folder exists
        if not os.path.exists(self.storage_dir):
            os.makedirs(self.storage_dir)
            
        # Load existing index if it exists, otherwise initialize clean index
        if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
            self.load()
        else:
            # IndexFlatL2 measures similarity using Euclidean/L2 Distance
            self.index = faiss.IndexFlatL2(self.dimension)
            self.chunks: List[Dict[str, Any]] = []

    def add_documents(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """
        Adds text chunks and their embeddings to the FAISS index and updates the local storage.
        """
        if not chunks or not embeddings:
            return
            
        # Convert list of float vectors to a NumPy 32-bit float matrix
        embeddings_np = np.array(embeddings, dtype=np.float32)
        
        # 1. Add embedding vectors to FAISS index
        self.index.add(embeddings_np)
        
        # 2. Append corresponding text metadata (with same index order)
        self.chunks.extend(chunks)
        
        # 3. Persist modifications locally
        self.save()

    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[Dict[str, Any], float]]:
        """
        Queries FAISS for the nearest chunks. Returns a list of (chunk_metadata, distance_score) tuples.
        """
        if self.index.ntotal == 0:
            return []
            
        # Format single query vector as 2D NumPy array
        query_np = np.array([query_embedding], dtype=np.float32)
        
        # Perform similarity search
        distances, indices = self.index.search(query_np, top_k)
        
        results = []
        for i, idx in enumerate(indices[0]):
            # FAISS returns -1 if there are not enough items in the index
            if idx == -1 or idx >= len(self.chunks):
                continue
            
            chunk = self.chunks[idx]
            score = float(distances[0][i])
            results.append((chunk, score))
            
        return results

    def save(self):
        """
        Saves the FAISS index and the corresponding chunks text metadata to disk.
        """
        faiss.write_index(self.index, self.index_path)
        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump(self.chunks, f, ensure_ascii=False, indent=2)

    def load(self):
        """
        Loads the index and metadata JSON mapping files from disk.
        """
        self.index = faiss.read_index(self.index_path)
        with open(self.metadata_path, 'r', encoding='utf-8') as f:
            self.chunks = json.load(f)
    def clear(self):
        """
        Clears the active index memory and deletes the index files on disk.
        """
        self.index = faiss.IndexFlatL2(self.dimension)
        self.chunks = []
        if os.path.exists(self.index_path):
            os.remove(self.index_path)
        if os.path.exists(self.metadata_path):
            os.remove(self.metadata_path)
