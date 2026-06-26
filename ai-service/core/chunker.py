from typing import List, Dict, Any
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Initialize LangChain's hierarchical recursive text splitter
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=150,
    length_function=len,
    separators=["\n\n", "\n", " ", ""]
)

def chunk_parsed_documents(parsed_docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Splits text from parsed pages while maintaining original source and page metadata.
    """
    chunks = []
    for doc in parsed_docs:
        raw_text = doc["text"]
        metadata = doc["metadata"]
        
        # Segment raw text
        split_texts = text_splitter.split_text(raw_text)
        
        for split_text in split_texts:
            chunks.append({
                "text": split_text,
                "metadata": metadata.copy()  # Create a copy to prevent reference bugs
            })
    return chunks

