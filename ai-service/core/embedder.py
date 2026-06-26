from sentence_transformers import SentenceTransformer
from typing import List

# Initialize the model globally to avoid loading it repeatedly on each request
# 'all-MiniLM-L6-v2' maps sentences/paragraphs to 384-dimensional dense vector space
# It is extremely fast, lightweight (~80MB), and runs 100% locally with zero API costs.
model = SentenceTransformer('all-MiniLM-L6-v2')

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Converts a list of text chunks into a list of 384-dimensional floats.
    """
    if not texts:
        return []
    
    # Generate numerical vectors. convert_to_numpy returns matrices for performance
    embeddings_np = model.encode(texts, convert_to_numpy=True)
    
    # Convert numpy array back to list of floats for easy JSON serialization
    return embeddings_np.tolist()
