"use client";

import React, { useState, useCallback } from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button, cn } from "@catest/ui";
import {
  Check,
  X,
  MessageSquare,
  Code2,
  ChevronRight,
  ChevronDown,
  Plus,
  History,
  Cpu,
  Loader2,
  Globe,
  Sparkles,
} from "lucide-react";
import { analyzeCodeWithAI } from "@/app/actions/ai-review";

// ── Segment type ─────────────────────────────────────────────────────
interface Segment {
  id: number;
  source: string;
  target: string;
  remark: string;
  status: "verified" | "review" | "draft";
  match: string;
}

const SEGMENTS: Segment[] = [
  {
    id: 1,
    source: 'export async function handleRequest(req: Request) {',
    target: 'export async function handleRequest(req: Request) {',
    remark: "Entry point verified against Security Policy v2.1.",
    status: "verified",
    match: "100% MB",
  },
  {
    id: 2,
    source: "  const session = await getSession(req);",
    target: "  const auth = await validateAuthorization(req);",
    remark: "Non-compliant with 'Auth-Standard-2026'. Termbase suggests using centralized validator.",
    status: "review",
    match: "92% TB",
  },
  {
    id: 3,
    source: "  if (!auth.isValid) return new Response('Unauthorized', { status: 401 });",
    target: "  if (!auth.isValid) return new Response('Unauthorized', { status: 401 });",
    remark: "Standard error guard. Complies with Global Exception Pattern.",
    status: "verified",
    match: "100% MB",
  },
  {
    id: 4,
    source: "  return processTask(auth.user);",
    target: "  return processSyncTask(auth.user, req.signal);",
    remark: "Proposed change: Add cancellation signal for better resource lifecycle management.",
    status: "draft",
    match: "Fuzzy",
  },
  {
    id: 5,
    source: "}",
    target: "}",
    remark: "",
    status: "verified",
    match: "Static",
  },
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

// ── Main CAT-style Diff Editor with AI Comments ─────────────────────
function DiffEditorPlugin({ taskId }: { taskId?: string }) {
  const [commentLang, setCommentLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [aiComments, setAiComments] = useState<Record<number, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const lines = SEGMENTS.map((s) => ({
        id: s.id,
        source: s.source,
        target: s.target,
      }));
      const result = await analyzeCodeWithAI(lines, commentLang);
      const map: Record<number, string> = {};
      for (const c of result.comments) {
        map[c.lineId] = c.comment;
      }
      setAiComments(map);
      if (result.error) setAiError(result.error);
    } catch (err) {
      setAiError("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [commentLang]);

  const hasComments = Object.keys(aiComments).length > 0;
  const selectedLang = LANGUAGES.find((l) => l.code === commentLang) || LANGUAGES[0];

  return (
    <div className="flex flex-col gap-px glass-card border border-[rgba(184,115,51,0.15)] rounded-sm overflow-hidden shadow-2xl">
      {/* Header grid */}
      <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[1100px]">
          <div
            className={cn(
              "grid px-4 py-3 border-b border-[#3e1b0d]/40 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]",
              hasComments
                ? "grid-cols-[50px_1fr_1fr_minmax(200px,1.2fr)_80px]"
                : "grid-cols-[50px_1fr_1fr_80px]"
            )}
            style={{ background: 'linear-gradient(180deg, rgba(26,17,8,0.9), rgba(13,10,4,0.95))' }}
          >
            <div className="flex items-center justify-center">ID</div>
            <div className="flex items-center gap-2 pl-4">
              <Code2 className="w-3.5 h-3.5" />
              Source Code
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-[#3e1b0d]/30">
              <MessageSquare className="w-3.5 h-3.5" />
              Proposed Fix / Target
            </div>
            {hasComments && (
              <div className="flex items-center gap-2 pl-4 border-l border-[#3e1b0d]/30">
                {/* Language dropdown — left of COMMENT label */}
                <div className="relative">
                  <button
                    onClick={() => setLangOpen(!langOpen)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-[#b87333]/30 bg-black/30 hover:bg-[#b87333]/10 transition-colors text-[9px] font-bold text-[var(--text-brass)]"
                  >
                    <Globe className="w-2.5 h-2.5" />
                    {selectedLang.label}
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {langOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 min-w-[120px] rounded-sm border border-[#3e1b0d]/40 shadow-xl overflow-hidden"
                      style={{ background: 'linear-gradient(180deg, #1a1108, #0d0a04)' }}>
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => { setCommentLang(lang.code); setLangOpen(false); }}
                          className={cn(
                            "w-full text-left px-3 py-2 text-[10px] font-bold transition-colors",
                            commentLang === lang.code
                              ? "text-[#c9a84c] bg-[#b87333]/10"
                              : "text-[var(--text-secondary)] hover:text-[#c9a84c] hover:bg-[#b87333]/5"
                          )}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Sparkles className="w-3 h-3 text-[#c9a84c]" />
                <span>AI Comment</span>
              </div>
            )}
            <div className="flex items-center justify-center border-l border-[#3e1b0d]/30">Status</div>
          </div>

          {/* Segments */}
          <div className="divide-y divide-[#3e1b0d]/20">
            {SEGMENTS.map((seg) => (
              <div
                key={seg.id}
                className={cn(
                  "grid group hover:bg-[#b87333]/[0.03] transition-colors relative min-w-0",
                  hasComments
                    ? "grid-cols-[50px_1fr_1fr_minmax(200px,1.2fr)_80px]"
                    : "grid-cols-[50px_1fr_1fr_80px]"
                )}
              >
                {/* ID */}
                <div className="flex items-center justify-center text-[10px] font-mono font-bold text-[var(--text-muted)] bg-black/20 group-hover:text-[#c9a84c] transition-colors">
                  {seg.id.toString().padStart(3, "0")}
                </div>

                {/* Source */}
                <div className="p-4 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] border-l border-[#3e1b0d]/20 group-hover:text-[var(--text-primary)] transition-colors whitespace-pre-wrap break-all min-w-0 overflow-hidden">
                  {seg.source}
                </div>

                {/* Target + Remark */}
                <div className="p-0 border-l border-[#3e1b0d]/20 flex flex-col min-w-0 overflow-hidden">
                  <textarea
                    defaultValue={seg.target}
                    className="flex-1 w-full bg-transparent p-4 font-mono text-[11px] leading-relaxed text-[#e8d5b5] outline-none focus:bg-[#b87333]/5 transition-all resize-none min-h-[80px] break-all whitespace-pre-wrap"
                    spellCheck={false}
                  />
                  {seg.remark && (
                    <div className="px-4 pb-3 -mt-2 text-[9px] text-[var(--text-muted)] italic flex items-center gap-1.5 font-medium min-w-0">
                      <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{seg.remark}</span>
                    </div>
                  )}
                </div>

                {/* AI Comment Column */}
                {hasComments && (
                  <div className="p-3 border-l border-[#3e1b0d]/20 flex items-start min-w-0 overflow-hidden"
                    style={{ background: 'rgba(201,168,76,0.02)' }}>
                    {aiComments[seg.id] ? (
                      <div className="flex gap-2 items-start">
                        <Sparkles className="w-3 h-3 text-[#c9a84c]/60 shrink-0 mt-0.5" />
                        <p className="text-[10px] leading-relaxed text-[var(--text-secondary)] font-medium">
                          {aiComments[seg.id]}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[9px] text-[var(--text-muted)]/40 italic">—</span>
                    )}
                  </div>
                )}

                {/* Status */}
                <div className="flex flex-col items-center justify-center gap-2 border-l border-[#3e1b0d]/20 bg-black/10 min-w-[80px]">
                  <div
                    className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${
                      seg.status === "verified"
                        ? "bg-[#4a8b6e] shadow-[#4a8b6e]/50"
                        : seg.status === "review"
                          ? "bg-[#e67e22] shadow-[#e67e22]/50"
                          : "bg-[#3e1b0d]"
                    }`}
                  />
                  <span
                    className={`text-[8px] font-black uppercase tracking-tighter ${
                      seg.status === "verified"
                        ? "text-[#4a8b6e]"
                        : seg.status === "review"
                          ? "text-[#e67e22]"
                          : "text-[var(--text-muted)]"
                    }`}
                  >
                    {seg.status}
                    {seg.match && (
                      <div className="mt-0.5 opacity-60 font-mono italic">{seg.match}</div>
                    )}
                  </span>
                </div>

                {/* Focus indicator */}
                <div className="absolute inset-y-0 left-0 w-0.5 bg-[#c9a84c] opacity-0 group-focus-within:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 py-3 border-t border-[#3e1b0d]/30 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest"
        style={{ background: 'linear-gradient(180deg, rgba(13,10,4,0.8), rgba(26,17,8,0.6))' }}
      >
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#4a8b6e]" /> {SEGMENTS.length} Review Snippets
          </span>
          <span className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Memory Base Hash: 8F2A...
          </span>
        </div>
        {aiError && (
          <span className="text-[#e67e22] normal-case tracking-normal text-[9px]">{aiError}</span>
        )}
        {taskId && <span>Job ID: {taskId}</span>}
      </div>
    </div>
  );
}

// ── Toolbar with AI Analyze button + Language selector ───────────────
function EditorToolbarPlugin() {
  const [commentLang, setCommentLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const selectedLang = LANGUAGES.find((l) => l.code === commentLang) || LANGUAGES[0];

  return (
    <div className="flex items-center justify-between mb-6 glass-card p-2 rounded-sm border border-[rgba(184,115,51,0.15)]">
      <div className="flex gap-2">
        <Button size="sm" variant="copper" className="px-6 w-fit">
          <Check className="w-4 h-4 mr-1.5 shrink-0" />
          <span className="whitespace-nowrap">Accept All</span>
        </Button>
        <Button size="sm" variant="secondary" className="px-6 w-fit">
          <X className="w-4 h-4 mr-1.5 shrink-0" />
          <span className="whitespace-nowrap">Reject</span>
        </Button>
      </div>

      <div className="h-6 w-px bg-[#3e1b0d]/40 mx-2" />

      <div className="flex gap-2 items-center">
        {/* Language dropdown for AI comment */}
        <div className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-[#b87333]/30 bg-black/30 hover:bg-[#b87333]/10 transition-colors text-[9px] font-bold text-[var(--text-brass)] h-9"
          >
            <Globe className="w-3.5 h-3.5" />
            {selectedLang.label}
            <ChevronDown className="w-3 h-3" />
          </button>
          {langOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 min-w-[130px] rounded-sm border border-[#3e1b0d]/40 shadow-xl overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #1a1108, #0d0a04)' }}>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => { setCommentLang(lang.code); setLangOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[10px] font-bold transition-colors",
                    commentLang === lang.code
                      ? "text-[#c9a84c] bg-[#b87333]/10"
                      : "text-[var(--text-secondary)] hover:text-[#c9a84c] hover:bg-[#b87333]/5"
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button size="sm" variant="secondary" className="h-9">
          <MessageSquare className="w-4 h-4 mr-1.5" />
          Comment
        </Button>
        <Button size="sm" variant="secondary" className="w-9 px-0 h-9">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Combined: Toolbar + Editor share AI state ────────────────────────
function ReviewEditorCombined() {
  const [commentLang, setCommentLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [aiComments, setAiComments] = useState<Record<number, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const selectedLang = LANGUAGES.find((l) => l.code === commentLang) || LANGUAGES[0];

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const lines = SEGMENTS.map((s) => ({ id: s.id, source: s.source, target: s.target }));
      const result = await analyzeCodeWithAI(lines, commentLang);
      const map: Record<number, string> = {};
      for (const c of result.comments) map[c.lineId] = c.comment;
      setAiComments(map);
      if (result.error) setAiError(result.error);
    } catch {
      setAiError("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [commentLang]);

  const hasComments = Object.keys(aiComments).length > 0;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 glass-card p-2 rounded-sm border border-[rgba(184,115,51,0.15)]">
        <div className="flex gap-2">
          <Button size="sm" variant="copper" className="px-6 w-fit">
            <Check className="w-4 h-4 mr-1.5 shrink-0" />
            <span className="whitespace-nowrap">Accept All</span>
          </Button>
          <Button size="sm" variant="secondary" className="px-6 w-fit">
            <X className="w-4 h-4 mr-1.5 shrink-0" />
            <span className="whitespace-nowrap">Reject</span>
          </Button>
        </div>

        <div className="h-6 w-px bg-[#3e1b0d]/40 mx-2" />

        <div className="flex gap-2 items-center">
          {/* Language dropdown */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-[#b87333]/30 bg-black/30 hover:bg-[#b87333]/10 transition-colors text-[9px] font-bold text-[var(--text-brass)] h-9"
            >
              <Globe className="w-3.5 h-3.5" />
              {selectedLang.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            {langOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 min-w-[130px] rounded-sm border border-[#3e1b0d]/40 shadow-xl overflow-hidden"
                style={{ background: 'linear-gradient(180deg, #1a1108, #0d0a04)' }}>
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { setCommentLang(lang.code); setLangOpen(false); if (hasComments) handleAnalyze(); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[10px] font-bold transition-colors",
                      commentLang === lang.code
                        ? "text-[#c9a84c] bg-[#b87333]/10"
                        : "text-[var(--text-secondary)] hover:text-[#c9a84c] hover:bg-[#b87333]/5"
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI Analyze button */}
          <Button
            size="sm"
            variant="copper"
            className="h-9"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Cpu className="w-4 h-4 mr-1.5" />
            )}
            {analyzing ? "Analyzing..." : hasComments ? "Re-analyze" : "AI Analyze"}
          </Button>

          <div className="h-6 w-px bg-[#3e1b0d]/40 mx-1" />

          <Button size="sm" variant="secondary" className="h-9">
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Comment
          </Button>
          <Button size="sm" variant="secondary" className="w-9 px-0 h-9">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Editor Grid ─────────────────────────────────────── */}
      <div className="flex flex-col gap-px glass-card border border-[rgba(184,115,51,0.15)] rounded-sm overflow-hidden shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <div className={hasComments ? "min-w-[1100px]" : "min-w-[900px]"}>
            {/* Column Headers */}
            <div
              className={cn(
                "grid px-4 py-3 border-b border-[#3e1b0d]/40 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]",
                hasComments
                  ? "grid-cols-[50px_1fr_1fr_minmax(200px,1.2fr)_80px]"
                  : "grid-cols-[50px_1fr_1fr_80px]"
              )}
              style={{ background: 'linear-gradient(180deg, rgba(26,17,8,0.9), rgba(13,10,4,0.95))' }}
            >
              <div className="flex items-center justify-center">ID</div>
              <div className="flex items-center gap-2 pl-4">
                <Code2 className="w-3.5 h-3.5" />
                Source Code
              </div>
              <div className="flex items-center gap-2 pl-4 border-l border-[#3e1b0d]/30">
                <MessageSquare className="w-3.5 h-3.5" />
                Proposed Fix / Target
              </div>
              {hasComments && (
                <div className="flex items-center gap-2 pl-4 border-l border-[#3e1b0d]/30">
                  <Sparkles className="w-3 h-3 text-[#c9a84c]" />
                  <span>AI Comment ({selectedLang.label})</span>
                </div>
              )}
              <div className="flex items-center justify-center border-l border-[#3e1b0d]/30">Status</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#3e1b0d]/20">
              {SEGMENTS.map((seg) => (
                <div
                  key={seg.id}
                  className={cn(
                    "grid group hover:bg-[#b87333]/[0.03] transition-colors relative min-w-0",
                    hasComments
                      ? "grid-cols-[50px_1fr_1fr_minmax(200px,1.2fr)_80px]"
                      : "grid-cols-[50px_1fr_1fr_80px]"
                  )}
                >
                  {/* ID */}
                  <div className="flex items-center justify-center text-[10px] font-mono font-bold text-[var(--text-muted)] bg-black/20 group-hover:text-[#c9a84c] transition-colors">
                    {seg.id.toString().padStart(3, "0")}
                  </div>

                  {/* Source */}
                  <div className="p-4 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] border-l border-[#3e1b0d]/20 group-hover:text-[var(--text-primary)] transition-colors whitespace-pre-wrap break-all min-w-0 overflow-hidden">
                    {seg.source}
                  </div>

                  {/* Target + Remark */}
                  <div className="p-0 border-l border-[#3e1b0d]/20 flex flex-col min-w-0 overflow-hidden">
                    <textarea
                      defaultValue={seg.target}
                      className="flex-1 w-full bg-transparent p-4 font-mono text-[11px] leading-relaxed text-[#e8d5b5] outline-none focus:bg-[#b87333]/5 transition-all resize-none min-h-[80px] break-all whitespace-pre-wrap"
                      spellCheck={false}
                    />
                    {seg.remark && (
                      <div className="px-4 pb-3 -mt-2 text-[9px] text-[var(--text-muted)] italic flex items-center gap-1.5 font-medium min-w-0">
                        <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{seg.remark}</span>
                      </div>
                    )}
                  </div>

                  {/* AI Comment */}
                  {hasComments && (
                    <div
                      className="p-3 border-l border-[#3e1b0d]/20 flex items-start min-w-0 overflow-hidden"
                      style={{ background: "rgba(201,168,76,0.02)" }}
                    >
                      {aiComments[seg.id] ? (
                        <div className="flex gap-2 items-start">
                          <Sparkles className="w-3 h-3 text-[#c9a84c]/50 shrink-0 mt-0.5" />
                          <p className="text-[10px] leading-relaxed text-[var(--text-secondary)] font-medium">
                            {aiComments[seg.id]}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[9px] text-[var(--text-muted)]/40 italic">—</span>
                      )}
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex flex-col items-center justify-center gap-2 border-l border-[#3e1b0d]/20 bg-black/10 min-w-[80px]">
                    <div
                      className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${
                        seg.status === "verified" ? "bg-[#4a8b6e] shadow-[#4a8b6e]/50" :
                        seg.status === "review" ? "bg-[#e67e22] shadow-[#e67e22]/50" :
                        "bg-[#3e1b0d]"
                      }`}
                    />
                    <span className={`text-[8px] font-black uppercase tracking-tighter ${
                      seg.status === "verified" ? "text-[#4a8b6e]" :
                      seg.status === "review" ? "text-[#e67e22]" :
                      "text-[var(--text-muted)]"
                    }`}>
                      {seg.status}
                      {seg.match && <div className="mt-0.5 opacity-60 font-mono italic">{seg.match}</div>}
                    </span>
                  </div>

                  <div className="absolute inset-y-0 left-0 w-0.5 bg-[#c9a84c] opacity-0 group-focus-within:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t border-[#3e1b0d]/30 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest"
          style={{ background: 'linear-gradient(180deg, rgba(13,10,4,0.8), rgba(26,17,8,0.6))' }}
        >
          <div className="flex gap-6">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#4a8b6e]" /> {SEGMENTS.length} Review Snippets
            </span>
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Memory Base Hash: 8F2A...
            </span>
          </div>
          {aiError && (
            <span className="text-[#e67e22] normal-case tracking-normal text-[9px]">{aiError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const ReviewEditorPluginGroup: PluginGroup = {
  id: "review-editor",
  name: "Code Review Editor",
  plugins: [
    {
      id: "review-editor-combined",
      name: "Editor with AI Comments",
      component: ReviewEditorCombined as React.ComponentType<unknown>,
    },
  ],
};
