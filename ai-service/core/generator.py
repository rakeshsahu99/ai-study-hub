import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import List

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

# --- Phase 7 Study Tools Schemas ---

class Flashcard(BaseModel):
    front: str = Field(description="A key question, concept, or term to test the user.")
    back: str = Field(description="The explanation, answer, or definition corresponding to the front.")

class FlashcardList(BaseModel):
    flashcards: List[Flashcard]

class QuizQuestion(BaseModel):
    question: str = Field(description="A multiple-choice question testing knowledge of the context.")
    options: List[str] = Field(description="Exactly 4 distinct plausible options.")
    correct_idx: int = Field(description="The correct option index (0 to 3).")
    explanation: str = Field(description="Short rationale explanation why correct_idx is the correct answer.")

class QuizList(BaseModel):
    questions: List[QuizQuestion]


def generate_study_materials(material_type: str, retrieved_chunks: list) -> dict:
    """
    Formulates a prompt with context and requests Gemini to output a structured 
    JSON response corresponding to Flashcards or Quizzes.
    """
    if not client:
        return {"error": "Error: GEMINI_API_KEY is not configured."}
        
    if not retrieved_chunks:
        return {"error": "No indexed content chunks found. Please upload documents first."}
        
    # Extract raw text from the context chunks
    context_blocks = []
    for idx, chunk in enumerate(retrieved_chunks, 1):
        text = chunk.get("text", "")
        context_blocks.append(text)
    context_str = "\n\n".join(context_blocks)
    
    # Define generation settings based on material type
    if material_type == "flashcards":
        response_schema = FlashcardList
        system_instruction = (
            "You are an expert tutor. Your task is to extract exactly 5 educational flashcards from the provided document context. "
            "Formulate challenging questions/terms on the front, and deep comprehensive explanations on the back. "
            "Use ONLY the facts in the provided context. Do NOT hallucinate external facts."
        )
        user_prompt = f"""
Based on the following document context, generate exactly 5 flashcards for study.

DOCUMENT CONTEXT:
{context_str}
"""
    else:  # quiz
        response_schema = QuizList
        system_instruction = (
            "You are an expert tutor. Your task is to generate a 5-question multiple-choice quiz based on the provided document context. "
            "Ensure questions test deep understanding. Provide exactly 4 options per question, label the correct index (0-3), "
            "and write a short, clear explanation explaining why the option is correct. Use ONLY the provided context."
        )
        user_prompt = f"""
Based on the following document context, generate a 5-question multiple-choice quiz.

DOCUMENT CONTEXT:
{context_str}
"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=response_schema,
                temperature=0.3,
            ),
        )
        import json
        return json.loads(response.text)
    except Exception as e:
        print(f"Error generating study materials: {e}")
        return {"error": f"Failed to generate study materials: {str(e)}"}
