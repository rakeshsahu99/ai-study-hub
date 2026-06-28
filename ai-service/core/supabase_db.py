import os
from typing import List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

class SupabaseVectorStore:
    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend environment.")
        self.client: Client = create_client(url, key)

    def add_documents(self, user_id: str, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """
        Inserts document chunks and corresponding embeddings into Supabase document_chunks table.
        """
        if not chunks or not embeddings:
            return
            
        payload = []
        for chunk, embedding in zip(chunks, embeddings):
            payload.append({
                "user_id": user_id,
                "filename": chunk.get("metadata", {}).get("source", "Unknown"),
                "page_number": chunk.get("metadata", {}).get("page", 1),
                "text_content": chunk.get("text", ""),
                "embedding": embedding
            })
            
        # Perform batch insertion
        try:
            self.client.table("document_chunks").insert(payload).execute()
        except Exception as e:
            print(f"Error inserting chunks into Supabase: {e}")
            raise e

    def search(self, user_id: str, query_embedding: List[float], filename: str = "all", top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Calls the PostgreSQL RPC match_document_chunks function to find similar text chunks.
        """
        try:
            response = self.client.rpc(
                "match_document_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": 0.2, # Minimum cosine similarity
                    "match_count": top_k,
                    "filter_user_id": user_id,
                    "filter_filename": filename
                }
            ).execute()
            
            results = []
            for item in response.data:
                # Structure returning values matching the search interface schema
                results.append({
                    "text": item.get("text_content"),
                    "metadata": {
                        "source": item.get("filename"),
                        "page": item.get("page_number")
                    },
                    "similarity": item.get("similarity")
                })
            return results
        except Exception as e:
            print(f"Error querying Supabase database: {e}")
            return []

    def get_user_documents(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Gathers list of unique uploaded files and chunk stats for a specific user.
        """
        try:
            response = self.client.table("document_chunks").select("filename, page_number").eq("user_id", user_id).execute()
            data = response.data
            
            doc_stats = {}
            for item in data:
                source = item.get("filename", "Unknown")
                page = item.get("page_number", 1)
                
                if source not in doc_stats:
                    doc_stats[source] = {
                        "filename": source,
                        "total_chunks": 0,
                        "pages": set()
                    }
                doc_stats[source]["total_chunks"] += 1
                doc_stats[source]["pages"].add(page)
                
            formatted = []
            for name, stats in doc_stats.items():
                formatted.append({
                    "filename": name,
                    "total_chunks": stats["total_chunks"],
                    "total_pages": len(stats["pages"])
                })
            return formatted
        except Exception as e:
            print(f"Error fetching user document list: {e}")
            return []

    def clear_user_documents(self, user_id: str):
        """
        Clears all document vector records matching the target user.
        """
        try:
            self.client.table("document_chunks").delete().eq("user_id", user_id).execute()
        except Exception as e:
            print(f"Error clearing user records: {e}")
            raise e
