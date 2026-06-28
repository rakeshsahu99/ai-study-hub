"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

interface DocumentItem {
  filename: string;
  total_chunks: number;
  total_pages: number;
}

interface SearchResult {
  text: string;
  metadata: {
    source: string;
    page: number;
  };
  rrf_score: number;
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
  sources?: any[];
}

const API_BASE = "http://127.0.0.1:8000";

export default function Home() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedChunk, setSelectedChunk] = useState<SearchResult | null>(null);
  const [backendOnline, setBackendOnline] = useState<"checking" | "online" | "offline">("checking");

  const [activeTab, setActiveTab] = useState<"search" | "chat">("search");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatQuery, setChatQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);



  const loadDocuments = useCallback(async () => {
    try {
      setLoadingDocs(true);
      const res = await fetch(`${API_BASE}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotalChunks(data.total_chunks || 0);
      setBackendOnline("online");
    } catch (err) {
      console.error(err);
      setBackendOnline("offline");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Upload failed");
      }

      await loadDocuments();
    } catch (err: any) {
      setUploadError(err.message || "Something went wrong during upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const res = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&top_k=6`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Search execution failed");
      }
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err: any) {
      setSearchError(err.message || "Connection to retrieval API failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleClearIndex = async () => {
    if (!confirm("Are you sure you want to clear the vector index? All document chunks will be deleted.")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/documents/clear`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to clear index");
      setSearchResults([]);
      setQuery("");
      setHasSearched(false);
      await loadDocuments();
    } catch (err: any) {
      alert(err.message || "Error clearing index");
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || chatLoading) return;
    const userMessageText = chatQuery.trim();
    setChatQuery("");
    setChatError(null);
    setChatLoading(true);
    // 1. Add current user message to message thread
    const newUserMessage: ChatMessage = { role: "user", content: userMessageText };
    const updatedHistory = [...messages, newUserMessage];
    setMessages(updatedHistory);
    try {
      // 2. Map history to API payload format
      const formattedHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessageText,
          history: formattedHistory,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to get answer from AI Assistant");
      }
      const data = await res.json();
      // 3. Append assistant response containing sources
      const aiResponse: ChatMessage = {
        role: "model",
        content: data.answer,
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (err: any) {
      setChatError(err.message || "Something went wrong.");
    } finally {
      setChatLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setChatError(null);
  };
  // Auto-scroll chat window when new messages are added
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

  const getProgressWidth = (rrfScore: number) => {
    const minVal = 0.01;
    const maxVal = 0.033;
    const percent = ((rrfScore - minVal) / (maxVal - minVal)) * 100;
    return Math.min(Math.max(percent, 10), 100);
  };

  return (
    <div className="min-h-screen bg-bg-custom text-fg-custom flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-40 w-full glass-panel border-b py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-accent to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-500/20">
            A
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight tracking-tight">AI Study Hub</h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">RAG Document System</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="text-neutral-500 dark:text-neutral-400">Service:</span>
          {backendOnline === "checking" && (
            <span className="flex items-center gap-1.5 text-yellow-500">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
              Checking...
            </span>
          )}
          {backendOnline === "online" && (
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Online
            </span>
          )}
          {backendOnline === "offline" && (
            <span className="flex items-center gap-1.5 text-red-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping absolute duration-1000" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 relative" />
              Offline
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Document Ingestion Left Panel */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="rounded-2xl p-6 glass-panel flex flex-col gap-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Document Hub</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Index study resources into the vector database.</p>
            </div>

            <div
              className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${dragActive
                ? "border-accent bg-indigo-500/5 scale-[1.02]"
                : "border-card-border hover:border-accent/40 hover:bg-neutral-500/5"
                }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <input
                id="file-upload-input"
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center w-full h-full">
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm text-neutral-600 dark:text-neutral-300 font-medium">Extracting & Chunking...</span>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-accent mb-4">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Upload PDF, DOCX or TXT</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Drag and drop or click to choose</span>
                  </>
                )}
              </label>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-lg flex gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{uploadError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-card-border bg-neutral-500/5">
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Total Files</p>
                <p className="text-xl font-bold mt-1 text-neutral-900 dark:text-zinc-50">{documents.length}</p>
              </div>
              <div className="p-4 rounded-xl border border-card-border bg-neutral-500/5">
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Index Chunks</p>
                <p className="text-xl font-bold mt-1 text-neutral-900 dark:text-zinc-50">{totalChunks}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Indexed Files</h3>
                {documents.length > 0 && (
                  <button
                    onClick={handleClearIndex}
                    className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {loadingDocs ? (
                <div className="flex flex-col gap-2">
                  <div className="h-10 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded-lg" />
                  <div className="h-10 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded-lg" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-6 border border-card-border border-dashed rounded-xl bg-neutral-500/5">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">No documents indexed yet.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-card-border bg-neutral-500/5 hover:bg-neutral-500/10 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <svg className="w-4 h-4 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-xs font-medium truncate text-neutral-700 dark:text-neutral-300">
                          {doc.filename}
                        </span>
                      </div>
                      <div className="text-[10px] shrink-0 font-semibold text-neutral-500 dark:text-neutral-400 px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
                        {doc.total_chunks} chunks
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Retrieval Search & AI Assistant Right Panel */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          <div className="rounded-2xl p-6 glass-panel shadow-sm flex flex-col gap-6">

            {/* Tab Swapper */}
            <div className="flex border-b border-card-border pb-4 gap-6">
              <button
                onClick={() => setActiveTab("search")}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all ${activeTab === "search"
                  ? "border-accent text-accent"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  }`}
              >
                Search Engine
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all ${activeTab === "chat"
                  ? "border-accent text-accent"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  }`}
              >
                AI Study Assistant
              </button>
            </div>

            {activeTab === "search" ? (
              /* --- Hybrid Search Content --- */
              <>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Study Hybrid Retrieval</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Retrieve relevant course content instantly using combined Semantic (FAISS) + Lexical (BM25) search.</p>
                </div>

                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Enter a topic, question, or concept to search..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-neutral-500/5 hover:bg-neutral-500/10 focus:bg-transparent rounded-xl border border-card-border focus:border-accent focus:outline-none transition-all duration-200 text-sm placeholder-neutral-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searching || !query.trim()}
                    className="px-5 py-3 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Search
                  </button>
                </form>

                <div className="flex flex-col gap-4">
                  {searching ? (
                    <div className="flex flex-col gap-4">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="p-5 border border-card-border rounded-xl flex flex-col gap-3 animate-pulse">
                          <div className="flex justify-between">
                            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-1/3" />
                            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-12" />
                          </div>
                          <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-full" />
                          <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-5/6" />
                        </div>
                      ))}
                    </div>
                  ) : searchError ? (
                    <div className="text-center py-12 border border-red-500/10 rounded-xl bg-red-500/5">
                      <p className="text-sm font-semibold text-red-500">{searchError}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Make sure the Python API is running.</p>
                    </div>
                  ) : !hasSearched ? (
                    <div className="text-center py-20 border border-dashed border-card-border rounded-2xl bg-neutral-500/5 flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-500/10 flex items-center justify-center text-neutral-400 mb-4">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Ready to search</h3>
                      <p className="text-xs text-neutral-500 mt-1 max-w-xs px-4">Upload document materials to begin searching, or run queries to fetch matching concepts.</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-card-border rounded-2xl bg-neutral-500/5">
                      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">No matches found</h3>
                      <p className="text-xs text-neutral-500 mt-1 px-4">Try checking your spelling or search for alternative key terms.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center text-xs text-neutral-500 dark:text-neutral-400">
                        <span>Ranked Results ({searchResults.length})</span>
                        <span>Relevance fusion using RRF</span>
                      </div>

                      <div className="flex flex-col gap-4">
                        {searchResults.map((result, idx) => (
                          <div
                            key={idx}
                            onClick={() => setSelectedChunk(result)}
                            className="p-5 border border-card-border rounded-xl bg-neutral-500/5 hover:bg-neutral-500/10 cursor-pointer transition-all duration-200 hover:scale-[1.005] active:scale-[0.998] flex flex-col gap-3 group relative overflow-hidden"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent/0 group-hover:bg-accent transition-colors" />

                            <div className="flex justify-between items-start gap-4">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-[10px] font-bold text-accent px-2 py-0.5 rounded bg-indigo-500/10">
                                  RANK #{idx + 1}
                                </span>
                                <span className="text-xs font-semibold truncate text-neutral-600 dark:text-neutral-300">
                                  {result.metadata.source}
                                </span>
                                <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 shrink-0">
                                  • Page {result.metadata.page}
                                </span>
                              </div>

                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-[10px] font-semibold text-neutral-500">
                                  RRF: {result.rrf_score.toFixed(4)}
                                </span>
                                <div className="w-16 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-accent rounded-full"
                                    style={{ width: `${getProgressWidth(result.rrf_score)}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 line-clamp-3">
                              {result.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* --- AI Q&A Study Assistant Content --- */
              <>
                <div className="flex justify-between items-center pb-2 border-b border-card-border">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">AI Study Companion</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Have a continuous conversation grounded in your uploaded materials.</p>
                  </div>
                  {messages.length > 0 && (
                    <button
                      onClick={handleClearChat}
                      className="px-3.5 py-1.5 rounded-xl border border-card-border hover:bg-red-500/10 text-xs font-semibold text-neutral-500 hover:text-red-500 dark:hover:text-red-400 transition-all active:scale-[0.98]"
                    >
                      Clear Chat
                    </button>
                  )}
                </div>

                {/* Message History Thread */}
                <div className="flex-1 min-h-[350px] max-h-[500px] overflow-y-auto border border-card-border rounded-2xl p-4 bg-neutral-500/5 flex flex-col gap-4 shadow-inner">
                  {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-accent mb-4">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">AI Assistant Ready</h3>
                      <p className="text-xs text-neutral-500 mt-1 max-w-xs px-4">Ask a question to have the LLM analyze your study corpus and discuss concepts.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {messages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex flex-col gap-1.5 max-w-[85%] ${
                            msg.role === "user" ? "self-end items-end" : "self-start items-start"
                          }`}
                        >
                          <div className="text-[10px] text-neutral-400 font-semibold px-2 uppercase tracking-wider">
                            {msg.role === "user" ? "You" : "Study Companion"}
                          </div>
                          
                          {/* Chat Bubble */}
                          <div
                            className={`p-4 rounded-2xl text-sm leading-relaxed ${
                              msg.role === "user"
                                ? "bg-accent text-white rounded-tr-none shadow-sm shadow-indigo-500/10"
                                : "bg-neutral-500/10 dark:bg-zinc-900/60 border border-card-border rounded-tl-none text-neutral-800 dark:text-neutral-100"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>

                          {/* Citations block for AI messages */}
                          {msg.role === "model" && msg.sources && msg.sources.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1 px-1">
                              <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider self-center mr-1">
                                Context:
                              </span>
                              {msg.sources.map((src, srcIdx) => (
                                <button
                                  key={srcIdx}
                                  onClick={() => setSelectedChunk({
                                    text: src.snippet,
                                    metadata: { source: src.source, page: src.page },
                                    rrf_score: 1.0
                                  })}
                                  className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-[10px] text-accent font-medium border border-accent/15 transition-all truncate max-w-[150px]"
                                  title={`${src.source} - Page ${src.page}`}
                                >
                                  {src.source} (p.{src.page})
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Typing indicator placeholder */}
                      {chatLoading && (
                        <div className="flex flex-col gap-1.5 max-w-[85%] self-start items-start animate-pulse">
                          <div className="text-[10px] text-neutral-400 font-semibold px-2 uppercase tracking-wider">
                            Companion is typing
                          </div>
                          <div className="p-4 rounded-2xl rounded-tl-none bg-neutral-500/10 dark:bg-zinc-900/40 border border-card-border flex flex-col gap-2 w-48">
                            <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-full" />
                            <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-5/6" />
                            <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-2/3" />
                          </div>
                        </div>
                      )}

                      {chatError && (
                        <div className="text-center py-3 px-4 border border-red-500/10 rounded-xl bg-red-500/5 text-xs text-red-500 font-semibold self-center max-w-[90%]">
                          {chatError}
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Chat Submit Form */}
                <form onSubmit={handleChatSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder={chatLoading ? "Assistant is formulating an answer..." : "Ask a follow-up about the study materials..."}
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                      disabled={chatLoading}
                      className="w-full pl-11 pr-4 py-3 bg-neutral-500/5 hover:bg-neutral-500/10 focus:bg-transparent rounded-xl border border-card-border focus:border-accent focus:outline-none transition-all duration-200 text-sm placeholder-neutral-500 disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={chatLoading || !chatQuery.trim()}
                    className="px-5 py-3 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                  >
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </section>

      </main>

      {/* Detail Slide-over Modal */}
      {selectedChunk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setSelectedChunk(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl glass-panel p-6 md:p-8 flex flex-col gap-6 shadow-2xl overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start gap-4 pb-4 border-b border-card-border">
              <div>
                <h3 className="font-bold text-lg text-neutral-900 dark:text-zinc-50 truncate max-w-md">
                  {selectedChunk.metadata.source}
                </h3>
                <div className="flex gap-3 text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  <span>Page {selectedChunk.metadata.page}</span>
                  <span>•</span>
                  <span>RRF fusion score: {selectedChunk.rrf_score.toFixed(6)}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedChunk(null)}
                className="p-1 rounded-lg hover:bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[50vh] pr-2">
              <p className="text-sm md:text-base leading-relaxed text-neutral-700 dark:text-neutral-200 whitespace-pre-wrap">
                {selectedChunk.text}
              </p>
            </div>

            <div className="pt-4 border-t border-card-border flex justify-end">
              <button
                onClick={() => setSelectedChunk(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
