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
def contextualize_query(query: str, history: list) -> str:
    """
    Reformulates the user's latest follow-up question into a standalone query
    by summarizing it with the conversation history. This standalone query
    is then used for hybrid retrieval.
    """
    if not history or not client:
        return query
        
    # Format history for the summarizer prompt
    history_str = ""
    for msg in history:
        role = "User" if msg.get("role") == "user" else "Assistant"
        content = msg.get("content", "")
        history_str += f"{role}: {content}\n"
        
    prompt = f"""
Given the following conversation history and a follow-up question, rephrase the follow-up question to be a standalone question that can be understood without the conversation history. Do NOT answer the question. Just rephrase it and output nothing else.

CONVERSATION HISTORY:
{history_str}

FOLLOW-UP QUESTION:
{query}

Standalone Question:
"""
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,  # Zero temperature makes it deterministic
            ),
        )
        standalone = response.text.strip()
        if standalone:
            # Strip extra quotes if model returned them
            return standalone.strip('"').strip("'")
    except Exception as e:
        print(f"Error contextualizing query: {e}")
        
    return query


def generate_conversational_answer(query: str, history: list, retrieved_chunks: list) -> dict:
    """
    Formulates a prompt containing the retrieved context chunks and conversation history,
    and uses Gemini to generate a context-grounded response.
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
    
    # 2. Format chat history into a readable text block
    history_blocks = []
    for msg in history:
        role_label = "User" if msg.get("role") == "user" else "Assistant"
        history_blocks.append(f"{role_label}: {msg.get('content')}")
    history_str = "\n".join(history_blocks)
    
    # 3. System and User Prompt Design
    system_instruction = (
        "You are an expert AI academic study assistant for the AI Study Hub. "
        "Your task is to answer the user's question accurately using ONLY the provided document context. "
        "Refer to the conversation history to understand context if the user asks follow-up questions. "
        "If the answer cannot be found in the context, clearly state that the provided documents do not contain enough information to answer. "
        "Keep your response structured, concise, and educational. Use bullet points or headers where helpful. "
        "Do NOT use any external or training knowledge beyond what is provided in the context."
    )
    
    user_prompt = f"""
CONVERSATION HISTORY:
{history_str}

---
DOCUMENTATION CONTEXT:
{context_str}
---

User Query: {query}

Answer:
"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.2,  # Low temperature guarantees factuality and prevents hallucinations
            ),
        )
        return {
            "answer": response.text,
            "sources": sources
        }
    except Exception as e:
        return {
            "answer": f"Conversational LLM generation failed: {str(e)}",
            "sources": []
        }
