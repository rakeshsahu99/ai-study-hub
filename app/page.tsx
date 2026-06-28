"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from '@/lib/supabaseClient';

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

  const [activeTab, setActiveTab] = useState<"search" | "chat" | "tools">("search");

  const [studyToolType, setStudyToolType] = useState<"flashcards" | "quiz">("flashcards");
  const [studyToolDoc, setStudyToolDoc] = useState("all");
  const [generatingTools, setGeneratingTools] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);

  const [flashcardsList, setFlashcardsList] = useState<any[]>([]);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [activeQuizQuestionIdx, setActiveQuizQuestionIdx] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);


  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatQuery, setChatQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Phase 8 Auth States ---
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [parserMode, setParserMode] = useState<"local" | "gemini">("local");

  useEffect(() => {
    // Fetch current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen to authentication changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;

    setAuthLoading(true);
    setAuthError(null);

    try {
      if (isRegistering) {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        alert("Registration successful! Check your email for confirmation (if enabled) or log in.");
        setIsRegistering(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Reset all local states
    setDocuments([]);
    setSearchResults([]);
    setMessages([]);
    setFlashcardsList([]);
    setQuizQuestions([]);
  };



  const loadDocuments = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingDocs(true);
      const res = await fetch(`${API_BASE}/documents`, {
        headers: {
          "X-User-Id": user.id,
        }
      });
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
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, loadDocuments]);

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
    if (!user) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload?mode=${parserMode}`, {
        method: "POST",
        headers: {
          "X-User-Id": user.id,
        },
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
    if (!query.trim() || !user) return;

    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const res = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&top_k=6`, {
        headers: {
          "X-User-Id": user.id,
        }
      });
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
    if (!user) return;
    if (!confirm("Are you sure you want to clear the vector index? All document chunks will be deleted.")) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/documents/clear`, {
        method: "POST",
        headers: {
          "X-User-Id": user.id,
        }
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
          "X-User-Id": user.id,
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

  // Study Tools Fetch Handler ---
  const handleGenerateTools = async () => {
    setGeneratingTools(true);
    setToolError(null);
    setFlashcardsList([]);
    setQuizQuestions([]);
    setActiveCardIdx(0);
    setIsCardFlipped(false);
    setActiveQuizQuestionIdx(0);
    setSelectedQuizOption(null);
    setQuizScore(0);
    setQuizCompleted(false);

    try {
      if (!user) return;
      const res = await fetch(`${API_BASE}/study-tools/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          type: studyToolType,
          filename: studyToolDoc,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to generate study tool.");
      }

      const data = await res.json();

      if (studyToolType === "flashcards") {
        setFlashcardsList(data.flashcards || []);
      } else {
        setQuizQuestions(data.questions || []);
      }
    } catch (err: any) {
      setToolError(err.message || "An unexpected error occurred.");
    } finally {
      setGeneratingTools(false);
    }
  };

  const handleQuizOptionClick = (optionIdx: number, correctIdx: number) => {
    if (selectedQuizOption !== null) return; // Prevent double clicking
    setSelectedQuizOption(optionIdx);
    if (optionIdx === correctIdx) {
      setQuizScore((prev) => prev + 1);
    }
  };

  const handleNextQuizQuestion = () => {
    setSelectedQuizOption(null);
    if (activeQuizQuestionIdx < quizQuestions.length - 1) {
      setActiveQuizQuestionIdx((prev) => prev + 1);
    } else {
      setQuizCompleted(true);
    }
  };

  const handleRestartQuiz = () => {
    setActiveQuizQuestionIdx(0);
    setSelectedQuizOption(null);
    setQuizScore(0);
    setQuizCompleted(false);
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

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-custom text-fg-custom flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 glass-panel border border-card-border rounded-3xl shadow-xl flex flex-col gap-6">
          <div className="text-center flex flex-col gap-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent to-purple-500 flex items-center justify-center text-white font-bold text-xl mx-auto shadow-md">
              A
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-2">AI Study Hub</h1>
            <p className="text-sm text-neutral-500">Sign in to sync your library and study tools.</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-neutral-500/5 hover:bg-neutral-500/10 focus:bg-transparent rounded-xl border border-card-border focus:border-accent focus:outline-none transition-all text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-neutral-500/5 hover:bg-neutral-500/10 focus:bg-transparent rounded-xl border border-card-border focus:border-accent focus:outline-none transition-all text-sm"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/15 text-xs text-red-500 text-center font-medium">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 rounded-xl bg-accent hover:bg-accent-light text-white font-semibold shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-2 text-sm flex items-center justify-center gap-2"
            >
              {authLoading ? "Processing..." : isRegistering ? "Register Account" : "Sign In"}
            </button>
          </form>

          <div className="text-center text-xs font-medium border-t border-card-border pt-4">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError(null);
              }}
              className="text-accent hover:underline focus:outline-none"
            >
              {isRegistering ? "Already have an account? Sign In" : "New to Study Hub? Create an account"}
            </button>
          </div>
        </div>
      </div>
    );
  }

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

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2">
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
          {user && (
            <div className="flex items-center gap-3 border-l border-card-border pl-4">
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{user.email}</span>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-lg border border-card-border hover:bg-red-500/10 hover:text-red-500 font-semibold transition-all active:scale-[0.97]"
              >
                Sign Out
              </button>
            </div>
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

            {/* Ingestion Engine Mode Selector */}
            <div className="flex flex-col gap-1.5 bg-neutral-500/5 p-3 rounded-xl border border-card-border">
              <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Ingestion Mode</label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setParserMode("local")}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all ${
                    parserMode === "local"
                      ? "bg-accent border-accent text-white"
                      : "bg-transparent border-card-border text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  Fast (Local)
                </button>
                <button
                  onClick={() => setParserMode("gemini")}
                  className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all ${
                    parserMode === "gemini"
                      ? "bg-accent border-accent text-white"
                      : "bg-transparent border-card-border text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  Smart (Gemini RAG)
                </button>
              </div>
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
                    <span className="text-sm text-neutral-600 dark:text-neutral-300 font-medium">
                      {parserMode === "gemini" 
                        ? "Performing Gemini Layout Analysis..." 
                        : "Extracting & Chunking locally..."}
                    </span>
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
              <button
                onClick={() => setActiveTab("tools")}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all ${activeTab === "tools"
                  ? "border-accent text-accent"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  }`}
              >
                Study Tools
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
            ) : activeTab === "chat" ? (
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
                          className={`flex flex-col gap-1.5 max-w-[85%] ${msg.role === "user" ? "self-end items-end" : "self-start items-start"
                            }`}
                        >
                          <div className="text-[10px] text-neutral-400 font-semibold px-2 uppercase tracking-wider">
                            {msg.role === "user" ? "You" : "Study Companion"}
                          </div>

                          {/* Chat Bubble */}
                          <div
                            className={`p-4 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
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
            ) : (
            /* --- AI Study Tools Content --- */
            <>
              <div className="flex flex-col gap-2 pb-4 border-b border-card-border">
                <h2 className="text-lg font-semibold tracking-tight">AI Study Tools</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Generate visual flashcards or multiple-choice quizzes custom-fit to your uploaded files.
                </p>
              </div>
              {/* Controls Bar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-neutral-500/5 p-4 rounded-2xl border border-card-border">
                <div className="md:col-span-4 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Source Material</label>
                  <select
                    value={studyToolDoc}
                    onChange={(e) => setStudyToolDoc(e.target.value)}
                    className="px-3 py-2 bg-neutral-500/5 dark:bg-zinc-900 border border-card-border rounded-xl text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="all">All Documents</option>
                    {documents.map((doc, idx) => (
                      <option key={idx} value={doc.filename}>{doc.filename}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-4 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Select Tool</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStudyToolType("flashcards")}
                      className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${studyToolType === "flashcards"
                        ? "bg-accent border-accent text-white"
                        : "bg-transparent border-card-border text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                        }`}
                    >
                      Flashcards
                    </button>
                    <button
                      onClick={() => setStudyToolType("quiz")}
                      className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${studyToolType === "quiz"
                        ? "bg-accent border-accent text-white"
                        : "bg-transparent border-card-border text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                        }`}
                    >
                      Practice Quiz
                    </button>
                  </div>
                </div>
                <div className="md:col-span-4 flex items-end">
                  <button
                    onClick={handleGenerateTools}
                    disabled={generatingTools || documents.length === 0}
                    className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {generatingTools ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      "Generate Study Material"
                    )}
                  </button>
                </div>
              </div>
              {/* Core Panel Content */}
              <div className="flex-1 flex flex-col gap-6 py-4 justify-center">
                {generatingTools ? (
                  /* Pulsing Loader */
                  <div className="flex flex-col items-center justify-center gap-4 py-20">
                    <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center animate-bounce">
                      <svg className="w-8 h-8 text-accent animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Formulating Study Items</h3>
                    <p className="text-xs text-neutral-500 text-center max-w-xs">
                      Reading the index chunks and instructing Gemini to design personalized structured materials.
                    </p>
                  </div>
                ) : toolError ? (
                  <div className="text-center py-12 border border-red-500/10 rounded-xl bg-red-500/5 max-w-md mx-auto">
                    <p className="text-sm font-semibold text-red-500">{toolError}</p>
                    <button
                      onClick={handleGenerateTools}
                      className="mt-4 px-4 py-2 rounded-xl bg-red-500/10 text-xs font-semibold text-red-500 hover:bg-red-500/20 transition-all"
                    >
                      Try Again
                    </button>
                  </div>
                ) : flashcardsList.length === 0 && quizQuestions.length === 0 ? (
                  /* Idle Placeholder */
                  <div className="text-center py-16 border border-dashed border-card-border rounded-2xl bg-neutral-500/5 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-accent mb-4">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Ready to Learn</h3>
                    <p className="text-xs text-neutral-500 mt-1 max-w-xs px-4">
                      {documents.length === 0
                        ? "Upload syllabus/notes in the Document Hub on the left to activate study tools."
                        : "Choose a target material, select either Flashcards or Quiz, and click generate above."}
                    </p>
                  </div>
                ) : studyToolType === "flashcards" ? (
                  /* --- FLASHCARD PLAYER INTERFACE --- */
                  <div className="flex flex-col gap-6 items-center">
                    <div
                      className="w-full max-w-md h-64 cursor-pointer"
                      onClick={() => setIsCardFlipped(!isCardFlipped)}
                      style={{ perspective: "1000px" }}
                    >
                      <div
                        className="relative w-full h-full text-center transition-transform duration-500"
                        style={{
                          transformStyle: "preserve-3d",
                          transform: isCardFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
                        }}
                      >
                        {/* Front Side */}
                        <div
                          className="absolute inset-0 w-full h-full rounded-2xl border border-card-border bg-card-bg p-8 flex flex-col items-center justify-center gap-4 shadow-sm"
                          style={{ backfaceVisibility: "hidden" }}
                        >
                          <span className="text-[9px] uppercase font-bold text-accent tracking-wider bg-indigo-500/10 px-2.5 py-1 rounded-full">
                            Question (Front)
                          </span>
                          <p className="text-base font-semibold text-neutral-800 dark:text-neutral-100 text-center leading-relaxed">
                            {flashcardsList[activeCardIdx]?.front}
                          </p>
                          <span className="text-[10px] text-neutral-400 font-semibold absolute bottom-4">
                            Click card to reveal answer
                          </span>
                        </div>
                        {/* Back Side */}
                        <div
                          className="absolute inset-0 w-full h-full rounded-2xl border border-accent/25 bg-indigo-500/5 p-8 flex flex-col items-center justify-center gap-4 shadow-sm"
                          style={{
                            backfaceVisibility: "hidden",
                            transform: "rotateY(180deg)"
                          }}
                        >
                          <span className="text-[9px] uppercase font-bold text-indigo-500 tracking-wider bg-indigo-500/10 px-2.5 py-1 rounded-full">
                            Explanation (Back)
                          </span>
                          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-200 text-center overflow-y-auto max-h-40 px-2">
                            {flashcardsList[activeCardIdx]?.back}
                          </p>
                          <span className="text-[10px] text-neutral-400 font-semibold absolute bottom-4">
                            Click card to flip back
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Flashcard Nav controls */}
                    <div className="flex justify-between items-center w-full max-w-md mt-4">
                      <button
                        onClick={() => {
                          setIsCardFlipped(false);
                          setTimeout(() => setActiveCardIdx((p) => Math.max(0, p - 1)), 150);
                        }}
                        disabled={activeCardIdx === 0}
                        className="px-4 py-2 rounded-xl border border-card-border hover:bg-neutral-500/10 text-xs font-semibold text-neutral-600 dark:text-neutral-300 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-[0.98]"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-semibold text-neutral-500">
                        Card {activeCardIdx + 1} of {flashcardsList.length}
                      </span>
                      <button
                        onClick={() => {
                          setIsCardFlipped(false);
                          setTimeout(() => setActiveCardIdx((p) => Math.min(flashcardsList.length - 1, p + 1)), 150);
                        }}
                        disabled={activeCardIdx === flashcardsList.length - 1}
                        className="px-4 py-2 rounded-xl border border-card-border hover:bg-neutral-500/10 text-xs font-semibold text-neutral-600 dark:text-neutral-300 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-[0.98]"
                      >
                        Next Card
                      </button>
                    </div>
                  </div>
                ) : (
                  /* --- QUIZ PRACTICE INTERFACE --- */
                  <div className="flex flex-col gap-6 w-full max-w-lg mx-auto">
                    {!quizCompleted ? (
                      <>
                        {/* Quiz Playing Frame */}
                        <div className="flex flex-col gap-4">
                          <div className="flex justify-between items-center text-xs font-bold text-neutral-400 uppercase tracking-wider">
                            <span>Question {activeQuizQuestionIdx + 1} of {quizQuestions.length}</span>
                            <span>Score: {quizScore}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-300"
                              style={{ width: `${((activeQuizQuestionIdx + 1) / quizQuestions.length) * 100}%` }}
                            />
                          </div>
                          <div className="p-6 border border-card-border bg-neutral-500/5 rounded-2xl">
                            <h3 className="font-semibold text-neutral-800 dark:text-neutral-100 text-sm md:text-base leading-relaxed">
                              {quizQuestions[activeQuizQuestionIdx]?.question}
                            </h3>
                          </div>
                          {/* Options List */}
                          <div className="flex flex-col gap-2.5">
                            {quizQuestions[activeQuizQuestionIdx]?.options.map((option: string, idx: number) => {
                              const correctIdx = quizQuestions[activeQuizQuestionIdx]?.correct_idx;
                              const isSelected = selectedQuizOption === idx;
                              const isCorrect = idx === correctIdx;
                              const hasAnswered = selectedQuizOption !== null;
                              let btnStyle = "bg-neutral-500/5 hover:bg-neutral-500/10 border-card-border text-neutral-700 dark:text-neutral-300";
                              if (hasAnswered) {
                                if (isCorrect) {
                                  btnStyle = "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold";
                                } else if (isSelected) {
                                  btnStyle = "bg-red-500/15 border-red-500 text-red-500 font-semibold";
                                } else {
                                  btnStyle = "opacity-50 border-card-border text-neutral-500";
                                }
                              }
                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleQuizOptionClick(idx, correctIdx)}
                                  disabled={hasAnswered}
                                  className={`w-full text-left p-4 rounded-xl border text-xs md:text-sm transition-all duration-200 flex justify-between items-center ${btnStyle}`}
                                >
                                  <span>{option}</span>
                                  {hasAnswered && isCorrect && (
                                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                  {hasAnswered && isSelected && !isCorrect && (
                                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {/* Explanation Frame */}
                          {selectedQuizOption !== null && (
                            <div className="p-4 border border-indigo-500/10 rounded-xl bg-indigo-500/5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                              <p className="font-bold text-accent mb-1 uppercase tracking-wider text-[10px]">Explanation:</p>
                              <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed">
                                {quizQuestions[activeQuizQuestionIdx]?.explanation}
                              </p>
                            </div>
                          )}
                          {/* Navigation controls */}
                          {selectedQuizOption !== null && (
                            <button
                              onClick={handleNextQuizQuestion}
                              className="mt-2 w-full py-3 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-xl shadow-sm transition-all active:scale-[0.98]"
                            >
                              {activeQuizQuestionIdx < quizQuestions.length - 1 ? "Next Question" : "Complete Quiz"}
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      /* --- SCORECARD SUMMARY TAB --- */
                      <div className="p-8 border border-card-border rounded-2xl bg-neutral-500/5 text-center flex flex-col items-center gap-6 shadow-inner animate-in zoom-in-95 duration-300">
                        <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center text-accent text-3xl font-bold">
                          {quizScore}/{quizQuestions.length}
                        </div>

                        <div>
                          <h3 className="text-lg font-bold text-neutral-800 dark:text-zinc-50">
                            {quizScore === quizQuestions.length
                              ? "Perfect Score! 🌟"
                              : quizScore >= 4
                                ? "Excellent Performance! 👏"
                                : "Good Effort! 👍"}
                          </h3>
                          <p className="text-xs text-neutral-500 mt-1 px-4 leading-relaxed">
                            You answered {((quizScore / quizQuestions.length) * 100).toFixed(0)}% of the questions correctly based on your study material.
                          </p>
                        </div>
                        <div className="flex gap-3 w-full">
                          <button
                            onClick={handleRestartQuiz}
                            className="flex-1 py-2.5 rounded-xl border border-card-border hover:bg-neutral-500/10 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-all"
                          >
                            Restart Quiz
                          </button>
                          <button
                            onClick={handleGenerateTools}
                            className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-white text-xs font-semibold shadow-sm transition-all"
                          >
                            Generate New Quiz
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
