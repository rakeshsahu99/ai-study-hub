from fastembed import TextEmbedding
from typing import List

# Initialize fastembed TextEmbedding with the same 'all-MiniLM-L6-v2' model
# This runs quantized on ONNX runtime under the hood, consuming minimal RAM (< 100MB)
# and avoiding PyTorch framework initialization.
model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Converts a list of text chunks into a list of 384-dimensional floats.
    """
    if not texts:
        return []
    
    # Generate embeddings. fastembed's model.embed returns a generator yielding numpy arrays.
    embeddings_generator = model.embed(texts)
    
    # Convert the generator results to a list of lists of floats
    return [emb.tolist() for emb in embeddings_generator]
