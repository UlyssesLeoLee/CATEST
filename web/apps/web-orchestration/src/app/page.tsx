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
  Terminal,
  Wrench,
  Square,
} from "lucide-react";

function getGatewayUrl(): string {
  if (process.env.NEXT_PUBLIC_INTENT_GATEWAY_URL) return process.env.NEXT_PUBLIC_INTENT_GATEWAY_URL;
  if (typeof window !== "undefined") return `${window.location.origin}/api/orchestration`;
  return "http://localhost:34090";
}

function getBridgeUrl(): string {
  if (process.env.NEXT_PUBLIC_BRIDGE_URL) return process.env.NEXT_PUBLIC_BRIDGE_URL;
  if (typeof window !== "undefined") return `${window.location.origin}/api/bridge`;
  return "http://localhost:34099";
}

// ─── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  traceId?: string;
  status?: "sending" | "processing" | "streaming" | "completed" | "failed";
  metadata?: {
    title?: string;
    tasksCount?: number;
    dispatchTarget?: string;
    ragDispatched?: boolean;
    llmDispatched?: boolean;
  };
  streamEvents?: StreamEvent[];
}

interface StreamEvent {
  event: string;
  content?: string;
  tool?: string;
  input?: string;
  message?: string;
  subtype?: string;
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  target?: string;
  data?: string;
}

type DispatchTarget = "claude_code" | "codex" | "antigravity";

type ModelOption = { id: string; label: string; provider: string };

// ─── Model Config ───────────────────────────────────────────────────

const MODELS: ModelOption[] = [
  { id: "claude-opus-4-6",   label: "Opus 4.6",   provider: "claude_code" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6",  provider: "claude_code" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "claude_code" },
  { id: "o4-mini",           label: "o4-mini",     provider: "codex" },
  { id: "o3",                label: "o3",          provider: "codex" },
  { id: "gpt-4.1",           label: "GPT-4.1",    provider: "codex" },
];

// ─── Dispatch Target Config ──────────────────────────────────────────

const TARGETS: Record<DispatchTarget, { label: string; icon: React.ReactNode; color: string }> = {
  claude_code: { label: "Claude Code", icon: <Bot className="w-3.5 h-3.5" />, color: "var(--copper)" },
  codex: { label: "Codex", icon: <Cpu className="w-3.5 h-3.5" />, color: "var(--verdigris)" },
  antigravity: { label: "Antigravity", icon: <Zap className="w-3.5 h-3.5" />, color: "var(--brass)" },
};

// ─── Stream Event Renderer ──────────────────────────────────────────

function StreamEventBlock({ ev }: { ev: StreamEvent }) {
  switch (ev.event) {
    case "status":
    case "system":
      return (
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-mono py-0.5">
          <Terminal className="w-3 h-3 shrink-0" />
          <span>{ev.message || ev.subtype}</span>
        </div>
      );
    case "text":
      return <div className="whitespace-pre-wrap">{ev.content}</div>;
    case "tool_use":
      return (
        <div className="flex items-start gap-2 my-1 p-2 rounded-lg bg-black/20 border border-[#b87333]/10">
          <Wrench className="w-3.5 h-3.5 text-[var(--text-brass)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-[10px] font-black text-[var(--text-brass)] uppercase tracking-wider">
              {ev.tool}
            </span>
            <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 truncate max-w-full">
              {ev.input}
            </div>
          </div>
        </div>
      );
    case "tool_result":
      return (
        <div className="text-[10px] text-[var(--text-muted)]/70 font-mono pl-5 py-0.5 border-l-2 border-[var(--verdigris)]/20 max-h-24 overflow-y-auto steam-scroll">
          {(ev.content || "").slice(0, 500)}
        </div>
      );
    case "output":
      return (
        <div className="text-sm font-mono text-[var(--text-secondary)] whitespace-pre-wrap">
          {ev.content}
        </div>
      );
    case "result":
      return (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[#b87333]/10">
          {ev.subtype && (
            <Badge className={cn(
              "text-[9px] font-bold",
              ev.subtype === "success"
                ? "bg-[var(--verdigris)]/10 text-[var(--verdigris)] border-[var(--verdigris)]/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            )}>
              {ev.subtype}
            </Badge>
          )}
          {ev.cost_usd != null && (
            <Badge className="bg-[#b87333]/10 text-[var(--text-brass)] border-[#b87333]/20 text-[9px] font-bold">
              ${ev.cost_usd.toFixed(4)}
            </Badge>
          )}
          {ev.duration_ms != null && (
            <Badge className="bg-[#b87333]/10 text-[var(--text-brass)] border-[#b87333]/20 text-[9px] font-bold">
              {(ev.duration_ms / 1000).toFixed(1)}s
            </Badge>
          )}
          {ev.num_turns != null && (
            <Badge className="bg-[#b87333]/10 text-[var(--text-brass)] border-[#b87333]/20 text-[9px] font-bold">
              {ev.num_turns} turns
            </Badge>
          )}
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-[10px] text-red-400 font-bold mt-1">
          <AlertCircle className="w-3 h-3" />
          {ev.message}
        </div>
      );
    default:
      return ev.data ? (
        <div className="text-[10px] text-[var(--text-muted)]/50 font-mono">{ev.data}</div>
      ) : null;
  }
}

// ─── Message Bubble ──────────────────────────────────────────────────

function MessageBubble({ message, onStop }: { message: ChatMessage; onStop?: () => void }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isStreaming = message.status === "streaming";

  const handleCopy = () => {
    const text = message.streamEvents
      ? message.streamEvents
          .filter(e => e.event === "text" || e.event === "output")
          .map(e => e.content)
          .join("\n")
      : message.content;
    navigator.clipboard.writeText(text);
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
      <div className={cn("max-w-[80%] relative", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed font-medium",
          isUser
            ? "glass-card bg-[#b87333]/8 border-[#b87333]/25 text-[var(--text-primary)]"
            : "glass-card bg-[var(--verdigris)]/5 border-[var(--verdigris)]/20 text-[var(--text-primary)]"
        )}>
          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-[10px] text-[var(--verdigris)] font-bold uppercase tracking-wider">
                <div className="w-2 h-2 rounded-full bg-[var(--verdigris)] animate-pulse" />
                Live streaming
              </div>
              {onStop && (
                <button
                  onClick={onStop}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 text-[9px] font-bold hover:bg-red-500/20 transition-colors"
                >
                  <Square className="w-2.5 h-2.5" />
                  Stop
                </button>
              )}
            </div>
          )}

          {/* Status indicator for processing (pipeline) */}
          {message.status === "processing" && (
            <div className="flex items-center gap-2 mb-2 text-[10px] text-[var(--text-brass)] font-bold uppercase tracking-wider">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing pipeline...
            </div>
          )}

          {/* Stream events */}
          {message.streamEvents && message.streamEvents.length > 0 ? (
            <div className="space-y-1">
              {message.streamEvents.map((ev, i) => (
                <StreamEventBlock key={i} ev={ev} />
              ))}
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}

          {/* Task metadata card */}
          {message.metadata && message.metadata.title && !message.streamEvents?.length && (
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
          {message.status === "failed" && !message.streamEvents?.length && (
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

// ─── Model Selector ─────────────────────────────────────────────────

function ModelSelector({ value, onChange, target }: { value: string; onChange: (v: string) => void; target: DispatchTarget }) {
  const [open, setOpen] = useState(false);
  const available = MODELS.filter(m => m.provider === target);
  const current = MODELS.find(m => m.id === value);

  if (available.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--verdigris)]/20 bg-[var(--verdigris)]/5 hover:bg-[var(--verdigris)]/10 transition-colors text-[10px] font-bold text-[var(--verdigris)]"
      >
        <Sparkles className="w-3 h-3" />
        {current?.label || value}
        <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-50 glass-panel rounded-xl p-1 min-w-[140px] shadow-xl shadow-black/50">
            {available.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[11px] font-bold transition-colors",
                  m.id === value ? "bg-[var(--verdigris)]/15 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--verdigris)]/10"
                )}
              >
                <Sparkles className="w-3 h-3" />
                {m.label}
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
                  : t.status === "streaming" ? "bg-[var(--verdigris)]/15 text-[var(--verdigris)] border-[var(--verdigris)]/30"
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

// ─── SSE Hook ────────────────────────────────────────────────────────

function useBridgeStream() {
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback((
    traceId: string,
    onEvent: (ev: StreamEvent) => void,
    onDone: () => void,
  ) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const url = `${getBridgeUrl()}/stream/${traceId}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok || !res.body) {
          onEvent({ event: "error", message: `Bridge returned ${res.status}` });
          onDone();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const ev: StreamEvent = JSON.parse(jsonStr);
              if (ev.event === "end" || ev.event === "timeout") {
                onDone();
                return;
              }
              onEvent(ev);
            } catch {
              // skip malformed JSON
            }
          }
        }
        onDone();
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          onEvent({ event: "error", message: err?.message || "Stream failed" });
          onDone();
        }
      }
    })();
  }, []);

  const stopStream = useCallback(async (traceId?: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (traceId) {
      try {
        await fetch(`${getBridgeUrl()}/stop/${traceId}`, { method: "POST" });
      } catch {}
    }
  }, []);

  return { startStream, stopStream };
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
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [project, setProject] = useState("default");

  // Auto-switch model when target changes
  const handleTargetChange = useCallback((t: DispatchTarget) => {
    setTarget(t);
    const defaultModel = MODELS.find(m => m.provider === t);
    if (defaultModel) setModel(defaultModel.id);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [traces, setTraces] = useState<{ traceId: string; title: string; time: string; status: string }[]>([]);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { startStream, stopStream } = useBridgeStream();

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

  const handleStopStream = useCallback(() => {
    if (activeTraceId) {
      stopStream(activeTraceId);
      setMessages(prev => prev.map(m =>
        m.traceId === activeTraceId && m.status === "streaming"
          ? { ...m, status: "completed" as const }
          : m
      ));
      setTraces(prev => prev.map(t =>
        t.traceId === activeTraceId ? { ...t, status: "completed" } : t
      ));
      setActiveTraceId(null);
      setIsLoading(false);
    }
  }, [activeTraceId, stopStream]);

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
      // 1) Call bridge (CLI execution) — this is the critical path.
      //    Also fire-and-forget to intent-gateway (audit/RAG pipeline) if available.
      const bridgePayload = { prompt: text, target, project, model };
      const gatewayPayload = {
        input: text,
        project,
        dispatch_target: target,
        metadata: { source: "web-orchestration" },
      };

      // Fire gateway call in background (best-effort, don't block on failure)
      fetch(`${getGatewayUrl()}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gatewayPayload),
      }).catch(() => { /* intent-gateway offline — non-fatal */ });

      // Bridge call is the critical path
      const bridgeRes = await fetch(`${getBridgeUrl()}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgePayload),
      });

      if (!bridgeRes.ok) {
        throw new Error(`Bridge returned ${bridgeRes.status}`);
      }

      const bd = await bridgeRes.json();
      const traceId = bd.trace_id;
      if (!traceId) {
        throw new Error("Bridge did not return a trace_id");
      }

      // 2) Add streaming assistant message
      const streamMsgId = crypto.randomUUID();
      const streamMsg: ChatMessage = {
        id: streamMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        traceId,
        status: "streaming",
        streamEvents: [],
        metadata: {
          title: text.slice(0, 60) + (text.length > 60 ? "..." : ""),
          dispatchTarget: target,
        },
      };
      setMessages(prev => [...prev, streamMsg]);
      setActiveTraceId(traceId);

      // Add to trace history
      setTraces(prev => [{
        traceId,
        title: text.slice(0, 40),
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "streaming",
      }, ...prev]);

      // 3) Subscribe to bridge SSE stream
      startStream(
        traceId,
        (ev) => {
          setMessages(prev => prev.map(m =>
            m.id === streamMsgId
              ? { ...m, streamEvents: [...(m.streamEvents || []), ev] }
              : m
          ));
        },
        () => {
          setMessages(prev => prev.map(m =>
            m.id === streamMsgId ? { ...m, status: "completed" as const } : m
          ));
          setTraces(prev => prev.map(t =>
            t.traceId === traceId ? { ...t, status: "completed" } : t
          ));
          setActiveTraceId(null);
          setIsLoading(false);
        },
      );

    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Failed to reach the orchestration gateway. The service may be starting up.\n\nError: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
        status: "failed",
      };
      setMessages(prev => [...prev, errorMsg]);
      setIsLoading(false);
    }
  }, [input, isLoading, target, model, project, startStream]);

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
                LangGraph pipeline &bull; Qdrant RAG &bull; Kafka dual-chain &bull; Live bridge
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
            <MessageBubble
              key={msg.id}
              message={msg}
              onStop={msg.status === "streaming" ? handleStopStream : undefined}
            />
          ))}

          {isLoading && !activeTraceId && <ThinkingIndicator />}
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
                <ModelSelector value={model} onChange={setModel} target={target} />
                <TargetSelector value={target} onChange={handleTargetChange} />
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
                <span>model: {MODELS.find(m => m.id === model)?.label || model}</span>
                <span>&bull;</span>
                <span>traces: {traces.length}</span>
                {activeTraceId && (
                  <>
                    <span>&bull;</span>
                    <span className="text-[var(--verdigris)]">streaming</span>
                  </>
                )}
              </div>
              <span className="text-[9px] text-[var(--text-muted)]/30 font-mono">
                Enter to send &bull; Shift+Enter for newline
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
