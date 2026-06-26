import io
from typing import List, Dict, Any
import pdfplumber
from pypdf import PdfReader
from docx import Document

def extract_text_from_pdf(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Extracts text page-by-page from a PDF byte stream.
    Tries pdfplumber first, falling back to pypdf on error or empty text.
    """
    pages_data = []
    
    # 1. Try pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                try:
                    text = page.extract_text()
                    if text and text.strip():
                        pages_data.append({
                            "text": text.strip(),
                            "metadata": {
                                "source": filename,
                                "page": i + 1
                            }
                        })
                except Exception:
                    pass  # Fall back to page-by-page pypdf below if needed
    except Exception:
        pages_data = []

    # 2. Fallback to pypdf if pdfplumber failed or extracted no text
    if not pages_data:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for i, page in enumerate(reader.pages):
                text = page.extract_text()
                if text and text.strip():
                    pages_data.append({
                        "text": text.strip(),
                        "metadata": {
                            "source": filename,
                            "page": i + 1
                        }
                    })
        except Exception as e:
            raise ValueError(f"Failed to parse PDF file with all available parsers: {str(e)}")

    return pages_data

def extract_text_from_docx(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Extracts text from a Word document (.docx) byte stream, including paragraphs and tables.
    """
    try:
        doc = Document(io.BytesIO(file_bytes))
        full_text = []
        
        # Extract paragraph text
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text.strip())
                
        # Extract table text
        for table in doc.tables:
            for row in table.rows:
                row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_text:
                    full_text.append(" | ".join(row_text))
                    
        combined_text = "\n".join(full_text)
        if combined_text:
            return [{
                "text": combined_text,
                "metadata": {
                    "source": filename,
                    "page": 1
                }
            }]
    except Exception as e:
        raise ValueError(f"Failed to parse DOCX file: {str(e)}")
        
    return []

def extract_text_from_txt(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Extracts text from plain text (.txt) files.
    """
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")  # Fallback decode
        
    if text.strip():
        return [{
            "text": text.strip(),
            "metadata": {
                "source": filename,
                "page": 1
            }
        }]
    return []

