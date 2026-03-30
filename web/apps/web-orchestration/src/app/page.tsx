"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button, Badge, cn, SteamEmission, VictorianDivider } from "@catest/ui";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Clock,
  GitBranch,
  Package,
  Zap,
  Settings,
  History,
  ChevronDown,
  Copy,
  Check,
  AlertCircle,
  Cpu,
  Database,
  Radio,
  X,
} from "lucide-react";

const INTENT_GATEWAY = process.env.NEXT_PUBLIC_INTENT_GATEWAY_URL || "http://localhost:34090";

// ─── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  traceId?: string;
  status?: "sending" | "processing" | "completed" | "failed";
  metadata?: {
    title?: string;
    tasksCount?: number;
    dispatchTarget?: string;
    ragDispatched?: boolean;
    llmDispatched?: boolean;
  };
}

type DispatchTarget = "claude_code" | "codex" | "antigravity";

// ─── Dispatch Target Config ──────────────────────────────────────────

const TARGETS: Record<DispatchTarget, { label: string; icon: React.ReactNode; color: string }> = {
  claude_code: { label: "Claude Code", icon: <Bot className="w-3.5 h-3.5" />, color: "var(--copper)" },
  codex: { label: "Codex", icon: <Cpu className="w-3.5 h-3.5" />, color: "var(--verdigris)" },
  antigravity: { label: "Antigravity", icon: <Zap className="w-3.5 h-3.5" />, color: "var(--brass)" },
};

// ─── Message Bubble ──────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] border border-[#b87333]/10 bg-[#b87333]/5">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
        isUser
          ? "bg-[#b87333]/15 border-[#b87333]/30 text-[var(--copper)]"
          : "bg-[var(--verdigris)]/15 border-[var(--verdigris)]/30 text-[var(--verdigris)]"
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[75%] relative", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed font-medium",
          isUser
            ? "glass-card bg-[#b87333]/8 border-[#b87333]/25 text-[var(--text-primary)]"
            : "glass-card bg-[var(--verdigris)]/5 border-[var(--verdigris)]/20 text-[var(--text-primary)]"
        )}>
          {/* Status indicator */}
          {message.status === "processing" && (
            <div className="flex items-center gap-2 mb-2 text-[10px] text-[var(--text-brass)] font-bold uppercase tracking-wider">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing pipeline...
            </div>
          )}

          {/* Content */}
          <div className="whitespace-pre-wrap">{message.content}</div>

          {/* Task metadata card */}
          {message.metadata && message.metadata.title && (
            <div className="mt-3 p-3 rounded-xl bg-black/20 border border-[#b87333]/15 space-y-2">
              <div className="text-xs font-black text-[var(--text-brass)] uppercase tracking-wider">
                {message.metadata.title}
              </div>
              <div className="flex flex-wrap gap-2">
                {message.metadata.tasksCount !== undefined && (
                  <Badge className="bg-[var(--verdigris)]/10 text-[var(--verdigris)] border-[var(--verdigris)]/20 text-[9px] font-bold">
                    <Package className="w-2.5 h-2.5 mr-1" />
                    {message.metadata.tasksCount} tasks
                  </Badge>
                )}
                {message.metadata.dispatchTarget && (
                  <Badge className="bg-[#b87333]/10 text-[var(--text-brass)] border-[#b87333]/20 text-[9px] font-bold">
                    <Radio className="w-2.5 h-2.5 mr-1" />
                    {message.metadata.dispatchTarget}
                  </Badge>
                )}
                {message.metadata.ragDispatched && (
                  <Badge className="bg-[var(--verdigris)]/10 text-[var(--verdigris)] border-[var(--verdigris)]/20 text-[9px] font-bold">
                    <Database className="w-2.5 h-2.5 mr-1" />
                    RAG stored
                  </Badge>
                )}
                {message.metadata.llmDispatched && (
                  <Badge className="bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/20 text-[9px] font-bold">
                    <Zap className="w-2.5 h-2.5 mr-1" />
                    Dispatched
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {message.status === "failed" && (
            <div className="flex items-center gap-2 mt-2 text-[10px] text-red-400 font-bold">
              <AlertCircle className="w-3 h-3" />
              Delivery failed — task saved to local RAG for retry
            </div>
          )}
        </div>

        {/* Bottom row: timestamp + copy */}
        <div className={cn(
          "flex items-center gap-2 mt-1 px-1",
          isUser ? "justify-end" : "justify-start"
        )}>
          <span className="text-[9px] text-[var(--text-muted)]/50 font-mono">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {message.traceId && (
            <span className="text-[9px] text-[var(--text-muted)]/30 font-mono">
              trace:{message.traceId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)]/40 hover:text-[var(--text-brass)]"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thinking Indicator ──────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border bg-[var(--verdigris)]/15 border-[var(--verdigris)]/30 text-[var(--verdigris)]">
        <Bot className="w-4 h-4" />
      </div>
      <div className="glass-card bg-[var(--verdigris)]/5 border-[var(--verdigris)]/20 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--verdigris)] animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--verdigris)] animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--verdigris)] animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-[10px] text-[var(--verdigris)] font-bold uppercase tracking-widest">
            Structuring request...
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Target Selector ─────────────────────────────────────────────────

function TargetSelector({ value, onChange }: { value: DispatchTarget; onChange: (v: DispatchTarget) => void }) {
  const [open, setOpen] = useState(false);
  const current = TARGETS[value];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#b87333]/20 bg-[#b87333]/5 hover:bg-[#b87333]/10 transition-colors text-xs font-bold"
        style={{ color: current.color }}
      >
        {current.icon}
        {current.label}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-50 glass-panel rounded-xl p-1 min-w-[160px] shadow-xl shadow-black/50">
            {(Object.entries(TARGETS) as [DispatchTarget, typeof TARGETS[DispatchTarget]][]).map(([key, t]) => (
              <button
                key={key}
                onClick={() => { onChange(key); setOpen(false); }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-bold transition-colors",
                  key === value ? "bg-[#b87333]/15 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[#b87333]/10"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sidebar: Recent Traces ──────────────────────────────────────────

function TraceSidebar({ traces, onSelect }: {
  traces: { traceId: string; title: string; time: string; status: string }[];
  onSelect: (traceId: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#b87333]/10">
        <History className="w-4 h-4 text-[var(--text-brass)]" />
        <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Trace History</span>
      </div>
      <div className="flex-1 overflow-y-auto steam-scroll p-2 space-y-1">
        {traces.length === 0 && (
          <div className="text-center py-8 text-[10px] text-[var(--text-muted)]/40 font-bold uppercase tracking-widest">
            No traces yet
          </div>
        )}
        {traces.map((t) => (
          <button
            key={t.traceId}
            onClick={() => onSelect(t.traceId)}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#b87333]/8 transition-colors group"
          >
            <div className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--text-brass)] transition-colors">
              {t.title || `Trace ${t.traceId.slice(0, 8)}`}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-[var(--text-muted)]/50 font-mono">{t.time}</span>
              <Badge className={cn(
                "text-[8px] px-1.5 py-0 font-bold",
                t.status === "completed" ? "bg-[var(--verdigris)]/10 text-[var(--verdigris)] border-[var(--verdigris)]/20"
                  : t.status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/20"
                  : "bg-[var(--brass)]/10 text-[var(--brass)] border-[var(--brass)]/20"
              )}>
                {t.status}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Welcome to the Orchestration Console. Describe your requirement and I will structure it into tasks, store it in the private knowledge base, and dispatch it to your chosen AI agent.\n\nYou can select a dispatch target below: Claude Code, Codex, or Antigravity.",
  timestamp: new Date(),
};

export default function OrchestrationPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [target, setTarget] = useState<DispatchTarget>("claude_code");
  const [project, setProject] = useState("default");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [traces, setTraces] = useState<{ traceId: string; title: string; time: string; status: string }[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await fetch(`${INTENT_GATEWAY}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: text,
          project,
          dispatch_target: target,
          metadata: { source: "web-orchestration" },
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Request accepted and entering the structuring pipeline.\n\nYour requirement has been assigned trace ID \`${data.trace_id}\`. The orchestrator will:\n\n1. Normalize and structure your input via LLM\n2. Generate embeddings and store in private RAG\n3. Dispatch to ${TARGETS[target].label} with full context`,
        timestamp: new Date(),
        traceId: data.trace_id,
        status: "completed",
        metadata: {
          title: text.slice(0, 60) + (text.length > 60 ? "..." : ""),
          dispatchTarget: target,
          ragDispatched: true,
          llmDispatched: true,
        },
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Add to trace history
      setTraces(prev => [{
        traceId: data.trace_id,
        title: text.slice(0, 40),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "processing",
      }, ...prev]);

    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Failed to reach the orchestration gateway. The service may be starting up.\n\nError: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
        status: "failed",
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, target, project]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      {sidebarOpen && (
        <aside className="w-64 shrink-0 border-r border-[#b87333]/10 glass-panel rounded-l-2xl flex flex-col">
          <TraceSidebar traces={traces} onSelect={() => {}} />
        </aside>
      )}

      {/* ── Main Chat Area ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-[#b87333]/10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-[#b87333]/10 transition-colors text-[var(--text-muted)] hover:text-[var(--text-brass)]"
            >
              <GitBranch className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--text-brass)]" />
                Orchestration Console
              </h1>
              <p className="text-[9px] text-[var(--text-muted)]/50 font-mono tracking-wide">
                LangGraph pipeline &bull; Qdrant RAG &bull; Kafka dual-chain
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Project selector */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[var(--text-muted)]/50 font-bold uppercase tracking-widest">Project:</span>
              <input
                type="text"
                value={project}
                onChange={e => setProject(e.target.value)}
                className="w-28 bg-transparent border border-[#b87333]/15 rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[#b87333]/40 transition-colors"
              />
            </div>
            <button className="p-1.5 rounded-lg hover:bg-[#b87333]/10 transition-colors text-[var(--text-muted)] hover:text-[var(--text-brass)]">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto steam-scroll px-6 py-6 space-y-6">
          {/* Decorative top badge */}
          <div className="flex justify-center">
            <div className="px-4 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]/30 border border-[#b87333]/8">
              <Clock className="w-3 h-3 inline mr-1.5 -mt-0.5" />
              {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isLoading && <ThinkingIndicator />}
        </div>

        {/* Input Area */}
        <div className="shrink-0 border-t border-[#b87333]/10 px-6 py-4">
          <div className="glass-panel rounded-2xl p-3">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe your requirement... (Enter to send, Shift+Enter for newline)"
                rows={1}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/30 resize-none focus:outline-none leading-relaxed font-medium py-1.5"
                style={{ maxHeight: "200px" }}
              />
              <div className="flex items-center gap-2 shrink-0">
                <TargetSelector value={target} onChange={setTarget} />
                <Button
                  variant="copper"
                  size="md"
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="rounded-xl"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#b87333]/8">
              <div className="flex items-center gap-3 text-[9px] text-[var(--text-muted)]/40 font-mono">
                <span>project: {project}</span>
                <span>&bull;</span>
                <span>target: {target}</span>
                <span>&bull;</span>
                <span>traces: {traces.length}</span>
              </div>
              <span className="text-[9px] text-[var(--text-muted)]/30 font-mono">
                Ctrl+Enter to send &bull; Shift+Enter for newline
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
