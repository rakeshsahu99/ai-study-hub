import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load key from .env file
load_dotenv()

# Initialize the Gemini Client. 
# It automatically picks up GEMINI_API_KEY from the environment/dotenv.
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

def generate_answer(query: str, retrieved_chunks: list) -> dict:
    """
    Formulates a prompt containing the retrieved context chunks and uses Gemini
    to generate an answer grounded strictly on the documents.
    """
    if not client:
        return {
            "answer": "Error: GEMINI_API_KEY is not configured in the backend .env file.",
            "sources": []
        }
        
    # 1. Format the context blocks and store source citations
    context_blocks = []
    sources = []
    
    for idx, chunk in enumerate(retrieved_chunks, 1):
        source_name = chunk.get("metadata", {}).get("source", "Unknown Source")
        page_num = chunk.get("metadata", {}).get("page", 1)
        text = chunk.get("text", "")
        
        context_blocks.append(f"[Source {idx}] File: {source_name}, Page: {page_num}\nContent: {text}")
        sources.append({
            "source": source_name,
            "page": page_num,
            "snippet": text
        })
        
    context_str = "\n\n".join(context_blocks)
    
    # 2. System and User Prompt Design
    system_instruction = (
        "You are an expert AI academic study assistant for the AI Study Hub. "
        "Your task is to answer the user's question accurately using ONLY the provided document context. "
        "If the answer cannot be found in the context, clearly state that the provided documents do not contain enough information to answer. "
        "Keep your response structured, concise, and educational. Use bullet points or headers where helpful. "
        "Do NOT use any external or training knowledge beyond what is provided in the context."
    )
    
    user_prompt = f"""
User Query: {query}

---
DOCUMENTATION CONTEXT:
{context_str}
---

Answer:
"""

    try:
        # We query the fast and highly capable gemini-2.5-flash model
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,  # Low temperature guarantees factuality and prevents creativity
            ),
        )
        return {
            "answer": response.text,
            "sources": sources
        }
    except Exception as e:
        return {
            "answer": f"LLM generation failed: {str(e)}",
            "sources": []
        }
