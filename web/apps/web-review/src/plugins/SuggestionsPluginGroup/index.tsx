"use client";

import React, { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Badge, Button, cn, useCookieState, COOKIE_KEYS } from "@catest/ui";
import {
  Sparkles,
  BookOpen,
  BookMarked,
  ShieldCheck,
  AlertTriangle,
  Info,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Search,
  Plus,
  Trash2,
  X,
  Database,
  ChevronDown,
  Check,
  Ban,
  Tag,
  RefreshCw,
  Loader2,
  ExternalLink,
  Shield,
} from "lucide-react";
import { getAppUrl } from "@catest/ui";
import {
  listTMBanks,
  getTMEntries,
  deleteTMEntry,
  semanticSearchTM,
  type TMEntry,
  type TMBank,
} from "@/app/actions/translation-memory";
import {
  listTBBanks,
  getTBEntries,
  addTBEntry,
  deleteTBEntry,
  getRelatedTerms,
  listTBDomains,
  getTermsInDomain,
  type TBEntry,
  type TBBank,
  type RelatedTerm,
} from "@/app/actions/terminology-base";
import { getCurrentRole } from "@/lib/permissions";
import { analysisStore, type AnalysisFinding, type TBViolation } from "@/lib/analysis-store";

// ── Tab definitions ──────────────────────────────────────────────────
type TabId = "analysis" | "memory" | "terminology" | "qa";

const TABS: { id: TabId; label: string; abbr: string; icon: any }[] = [
  { id: "analysis", label: "AI Analysis", abbr: "AI", icon: Sparkles },
  { id: "memory", label: "Translation Memory", abbr: "TM", icon: BookOpen },
  { id: "terminology", label: "Terminology Base", abbr: "TB", icon: BookMarked },
  { id: "qa", label: "QA Check", abbr: "QA", icon: ShieldCheck },
];

// ── AI Analysis Tab ──────────────────────────────────────────────────
const SEVERITY_CFG: Record<string, { color: string; glow: string; border: string; icon: any; label: string }> = {
  error:   { color: "text-[#dc2626]",               glow: "rgba(220,38,38,0.4)",   border: "rgba(220,38,38,0.25)",  icon: AlertCircle,   label: "Error" },
  danger:  { color: "text-[var(--burgundy-light)]", glow: "rgba(139,34,82,0.4)",   border: "rgba(107,28,35,0.3)",   icon: AlertCircle,   label: "Danger" },
  warning: { color: "text-[var(--amber-glow)]",     glow: "rgba(255,179,71,0.4)",  border: "rgba(255,179,71,0.25)", icon: AlertTriangle, label: "Warning" },
  info:    { color: "text-[var(--brass)]",          glow: "rgba(201,168,76,0.3)",  border: "rgba(201,168,76,0.2)",  icon: Info,          label: "Info" },
};

function AnalysisTab() {
  const { findings, tbViolations, isAnalyzing, streamingCount, error } = useSyncExternalStore(
    analysisStore.subscribe,
    analysisStore.getSnapshot,
  );

  // Loading state — no findings yet
  if (isAnalyzing && findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin text-[#c9a84c]" />
        <p className="text-[10px] font-black uppercase tracking-wider">Analyzing code…</p>
        {streamingCount > 0 && (
          <p className="text-[9px] text-[#c9a84c]">{streamingCount} finding{streamingCount !== 1 ? "s" : ""} streamed</p>
        )}
      </div>
    );
  }

  // Empty state
  if (!isAnalyzing && findings.length === 0 && tbViolations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-muted)]">
        <Sparkles className="w-6 h-6 opacity-30" />
        <p className="text-[11px]">No findings yet</p>
        <p className="text-[9px] opacity-60 text-center">Click the <strong className="text-[#c9a84c]">AI</strong> button in the editor to analyze code</p>
        {error && <p className="text-[9px] text-[#e67e22] mt-1 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">
          {isAnalyzing ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-[#c9a84c]" />
              <span className="text-[#c9a84c]">Streaming…</span>
              <span>{streamingCount} found</span>
            </span>
          ) : (
            `${findings.length} Finding${findings.length !== 1 ? "s" : ""}`
          )}
        </span>
        {error && <span className="text-[8px] text-[#e67e22] max-w-[130px] truncate" title={error}>{error}</span>}
      </div>

      {/* AI Findings */}
      {findings.length > 0 && (
        <ul className="space-y-2">
          {findings.map((f: AnalysisFinding, idx: number) => {
            const cfg = SEVERITY_CFG[f.severity] ?? SEVERITY_CFG.info;
            const Icon = cfg.icon;
            return (
              <li key={`${f.lineId}-${idx}`} className="group relative">
                <div className="absolute -inset-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition duration-500 pointer-events-none"
                  style={{ background: `linear-gradient(135deg, ${cfg.border}, transparent 60%)`, filter: "blur(4px)" }} />
                <div className="relative flex flex-col gap-2 p-3 rounded-sm border overflow-hidden transition-all"
                  style={{ borderColor: cfg.border, background: "linear-gradient(145deg, rgba(14,11,8,0.9), rgba(10,8,5,0.95))", boxShadow: "inset 0 1px 0 rgba(255,240,200,0.04)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className={cn("flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider shrink-0", cfg.color)}>
                      <Icon className="w-3 h-3" style={{ filter: `drop-shadow(0 0 4px ${cfg.glow})` }} />
                      {cfg.label}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={f.severity === "error" || f.severity === "danger" ? "danger" : f.severity === "warning" ? "warning" : "info"} className="text-[7px] px-1 py-0">
                        {f.category}
                      </Badge>
                      <span className="text-[8px] text-[var(--text-muted)] font-mono shrink-0">L{f.lineId}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{f.message}</p>
                  {f.suggestedFix && (
                    <div className="text-[9px] font-mono text-[#4a8b6e] bg-[#4a8b6e]/5 border border-[#4a8b6e]/15 rounded-sm px-2 py-1.5 leading-relaxed whitespace-pre-wrap break-all">
                      {f.suggestedFix}
                    </div>
                  )}
                  <div className="flex items-center justify-end pt-1" style={{ borderTop: "1px solid rgba(184,115,51,0.1)" }}>
                    <button
                      onClick={() => analysisStore.dismissFinding(f.lineId, f.message)}
                      className="text-[8px] font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors uppercase tracking-wider px-1 py-0.5 rounded hover:bg-[#3e1b0d]/20"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* TB Violations */}
      {tbViolations.length > 0 && (
        <div className="space-y-2">
          <div className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5 pt-1">
            <Shield className="w-3 h-3 text-[#e67e22]" />
            {tbViolations.length} Terminology Violation{tbViolations.length !== 1 ? "s" : ""}
          </div>
          {tbViolations.map((v: TBViolation, idx: number) => (
            <div key={idx} className={cn(
              "p-2.5 rounded-sm border",
              v.forbidden ? "border-[#8b2500]/30 bg-[#8b2500]/[0.04]" : "border-[#e67e22]/20 bg-[#e67e22]/[0.03]"
            )}>
              <div className="flex items-center gap-1.5 text-[9px] font-bold flex-wrap">
                {v.forbidden ? <Ban className="w-3 h-3 text-[#8b2500] shrink-0" /> : <Tag className="w-3 h-3 text-[#e67e22] shrink-0" />}
                <span className={v.forbidden ? "text-[#8b2500]" : "text-[#e67e22]"}>L{v.lineId}</span>
                <span className="text-[var(--text-muted)] font-mono">
                  &ldquo;{v.term}&rdquo;
                </span>
                <ArrowRight className="w-2.5 h-2.5 text-[var(--text-muted)] shrink-0" />
                <span className="text-[#c9a84c] font-mono">&ldquo;{v.suggestedTerm}&rdquo;</span>
                {v.forbidden && <Badge className="bg-[#8b2500]/10 text-[#8b2500] border-[#8b2500]/20 text-[7px] px-1 py-0 shrink-0">FORBIDDEN</Badge>}
              </div>
              {v.domain && <div className="mt-1 text-[8px] text-[var(--text-muted)]">domain: {v.domain}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Translation Memory Tab ───────────────────────────────────────────
function MemoryTab() {
  const [role, setRole] = useState<"admin" | "user" | "viewer" | "guest">("guest");
  const [banks, setBanks] = useState<TMBank[]>([]);
  const [selectedBank, setSelectedBank] = useCookieState(COOKIE_KEYS.REVIEW_TM_BANK, "default");
  const [entries, setEntries] = useState<TMEntry[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"list" | "semantic">("list");
  const searchDebounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdmin = role === "admin";

  useEffect(() => { getCurrentRole().then(setRole); }, []);

  const loadBanks = useCallback(async () => {
    const b = await listTMBanks();
    setBanks(b.length > 0 ? b : [{ name: "default", entry_count: 0 }]);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setScores({});
    const res = await getTMEntries(selectedBank as string, 30);
    setEntries(res.entries);
    setTotal(res.total);
    setLoading(false);
  }, [selectedBank]);

  const runSemanticSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchMode("list"); loadEntries(); return; }
    setLoading(true);
    setSearchMode("semantic");
    const res = await semanticSearchTM(q.trim(), selectedBank as string, 8);
    setEntries(res.entries);
    setScores(res.scores);
    setTotal(res.entries.length);
    setLoading(false);
  }, [selectedBank, loadEntries]);

  useEffect(() => { loadBanks(); }, [loadBanks]);
  useEffect(() => { if (searchMode === "list") loadEntries(); }, [loadEntries, searchMode]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => runSemanticSearch(q), 450);
  };

  const handleDelete = async (id: string) => {
    await deleteTMEntry(id);
    loadEntries();
  };

  const currentBank = banks.find((b) => b.name === selectedBank);

  return (
    <div className="space-y-4">
      {/* Bank selector */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button onClick={() => setBankOpen(!bankOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-[#b87333]/30 bg-black/30 hover:bg-[#b87333]/10 transition-colors text-[10px] font-bold text-[var(--text-brass)]">
            <Database className="w-3 h-3" />
            <span>{selectedBank}</span>
            <Badge className="bg-[#b87333]/10 text-[var(--text-muted)] border-[#b87333]/20 text-[8px] px-1 py-0 ml-1">
              {currentBank?.entry_count ?? 0}
            </Badge>
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", bankOpen && "rotate-180")} />
          </button>
          {bankOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-sm border border-[#3e1b0d]/40 shadow-2xl overflow-hidden"
              style={{ background: "linear-gradient(180deg, #1a1108, #0d0a04)" }}>
              {banks.map((b) => (
                <button key={b.name} onClick={() => { setSelectedBank(b.name); setBankOpen(false); }}
                  className={cn("w-full text-left px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-between",
                    selectedBank === b.name ? "text-[#c9a84c] bg-[#b87333]/10" : "text-[var(--text-secondary)] hover:text-[#c9a84c] hover:bg-[#b87333]/5")}>
                  <span>{b.name}</span>
                  <span className="text-[8px] text-[var(--text-muted)]">{b.entry_count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <a href={getAppUrl("tm")} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-sm hover:bg-[#c9a84c]/10 transition-colors text-[var(--text-muted)] hover:text-[#c9a84c]" title="Manage TM">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={loadEntries} className="p-1.5 rounded-sm hover:bg-[#b87333]/10 transition-colors text-[var(--text-muted)] hover:text-[#c9a84c]">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Semantic search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]" />
        <input
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Semantic search…"
          className="w-full bg-black/30 border border-[#3e1b0d]/30 rounded-sm pl-7 pr-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40"
        />
        {searchMode === "semantic" && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-[#c9a84c] uppercase tracking-wider">
            ✦ vector
          </span>
        )}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /><span className="text-[10px]">Loading...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="w-8 h-8 text-[var(--text-muted)]/30 mx-auto mb-3" />
          <p className="text-[11px] text-[var(--text-muted)]">
            {searchMode === "semantic" ? "No similar entries found" : "Translation Memory is empty"}
          </p>
          {searchMode === "list" && (
            <p className="text-[9px] text-[var(--text-muted)]/60 mt-1">Confirm segments with <kbd className="px-1 py-0.5 rounded border border-[#3e1b0d]/40 bg-black/30 text-[8px]">Ctrl+Enter</kbd> to auto-save</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
            {searchMode === "semantic" ? `${total} semantic match${total !== 1 ? "es" : ""}` : `${total} entries`}
          </div>
          {entries.map((e) => {
            const score = scores[e.id];
            return (
              <div key={e.id} className="p-3 rounded-sm border border-[#3e1b0d]/20 hover:border-[#b87333]/20 transition-colors group"
                style={{ background: "linear-gradient(135deg, rgba(14,11,8,0.8), rgba(10,8,5,0.9))" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] truncate">{e.source_text}</div>
                    <div className="text-[10px] font-mono text-[#c9a84c] truncate mt-1">{e.target_text}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {score !== undefined && (
                      <Badge className="bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20 text-[7px] px-1 py-0" title="Semantic similarity score">
                        {(score * 100).toFixed(0)}%
                      </Badge>
                    )}
                    <Badge className="bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20 text-[7px] px-1 py-0">×{e.usage_count}</Badge>
                    {isAdmin && (
                      <button onClick={() => handleDelete(e.id)} className="p-1 rounded hover:bg-[#8b2500]/20 text-[var(--text-muted)] hover:text-[#8b2500] transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Terminology Base Tab ─────────────────────────────────────────────
function TerminologyTab() {
  const [role, setRole] = useState<"admin" | "user" | "viewer" | "guest">("guest");
  const [banks, setBanks] = useState<TBBank[]>([]);
  const [selectedBank, setSelectedBank] = useCookieState(COOKIE_KEYS.REVIEW_TB_BANK, "default");
  const isAdmin = role === "admin";
  const isEditor = role === "admin" || role === "user";

  useEffect(() => { getCurrentRole().then(setRole); }, []);
  const [entries, setEntries] = useState<TBEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newDef, setNewDef] = useState("");
  const [newForbidden, setNewForbidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Graph state (Neo4j) ───────────────────────────────
  const [domains, setDomains] = useState<string[]>([]);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [relatedTerms, setRelatedTerms] = useState<RelatedTerm[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [focusTerm, setFocusTerm] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    const d = await listTBDomains(selectedBank as string);
    setDomains(d);
  }, [selectedBank]);

  const loadDomainTerms = useCallback(async (domain: string) => {
    setGraphLoading(true);
    setActiveDomain(domain);
    setFocusTerm(null);
    const terms = await getTermsInDomain(domain, selectedBank as string, 30);
    setRelatedTerms(terms);
    setGraphLoading(false);
  }, [selectedBank]);

  const loadRelatedTerms = useCallback(async (sourceTerm: string) => {
    setGraphLoading(true);
    setFocusTerm(sourceTerm);
    setActiveDomain(null);
    const terms = await getRelatedTerms(sourceTerm, selectedBank as string, 15);
    setRelatedTerms(terms);
    setGraphLoading(false);
  }, [selectedBank]);

  const loadBanks = useCallback(async () => {
    const b = await listTBBanks();
    setBanks(b.length > 0 ? b : [{ name: "default", entry_count: 0 }]);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const res = await getTBEntries(selectedBank as string, 50);
    setEntries(res.entries);
    setTotal(res.total);
    setLoading(false);
  }, [selectedBank]);

  useEffect(() => { loadBanks(); }, [loadBanks]);
  useEffect(() => { loadEntries(); loadDomains(); }, [loadEntries, loadDomains]);

  const handleAdd = async () => {
    if (!newSource.trim() || !newTarget.trim()) return;
    setAdding(true);
    await addTBEntry(newSource.trim(), newTarget.trim(), selectedBank, newDef.trim() || undefined, newDomain.trim() || undefined, newForbidden);
    setNewSource(""); setNewTarget(""); setNewDomain(""); setNewDef(""); setNewForbidden(false);
    setShowAdd(false); setAdding(false);
    loadEntries(); loadBanks();
  };

  const handleDelete = async (id: string) => {
    await deleteTBEntry(id);
    loadEntries(); loadBanks();
  };

  const filteredEntries = searchQuery.trim()
    ? entries.filter((e) => e.source_term.toLowerCase().includes(searchQuery.toLowerCase()) || e.target_term.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const currentBank = banks.find((b) => b.name === selectedBank);

  return (
    <div className="space-y-4">
      {/* Bank selector + Add button */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative">
          <button onClick={() => setBankOpen(!bankOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-[#b87333]/30 bg-black/30 hover:bg-[#b87333]/10 transition-colors text-[10px] font-bold text-[var(--text-brass)]">
            <Database className="w-3 h-3" />
            <span>{selectedBank}</span>
            <Badge className="bg-[#b87333]/10 text-[var(--text-muted)] border-[#b87333]/20 text-[8px] px-1 py-0 ml-1">
              {currentBank?.entry_count ?? 0}
            </Badge>
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", bankOpen && "rotate-180")} />
          </button>
          {bankOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-sm border border-[#3e1b0d]/40 shadow-2xl overflow-hidden"
              style={{ background: "linear-gradient(180deg, #1a1108, #0d0a04)" }}>
              {banks.map((b) => (
                <button key={b.name} onClick={() => { setSelectedBank(b.name); setBankOpen(false); }}
                  className={cn("w-full text-left px-3 py-2 text-[10px] font-bold transition-colors flex items-center justify-between",
                    selectedBank === b.name ? "text-[#c9a84c] bg-[#b87333]/10" : "text-[var(--text-secondary)] hover:text-[#c9a84c] hover:bg-[#b87333]/5")}>
                  <span>{b.name}</span>
                  <span className="text-[8px] text-[var(--text-muted)]">{b.entry_count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <a href={getAppUrl("tb")} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-sm hover:bg-[#c9a84c]/10 transition-colors text-[var(--text-muted)] hover:text-[#c9a84c]" title="Manage TB">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {isEditor && (
            <button onClick={() => setShowAdd(!showAdd)}
              className={cn("p-1.5 rounded-sm transition-colors", showAdd ? "bg-[#b87333]/20 text-[#c9a84c]" : "hover:bg-[#b87333]/10 text-[var(--text-muted)] hover:text-[#c9a84c]")}>
              {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Add term form */}
      {showAdd && (
        <div className="p-3 rounded-sm border border-[#c9a84c]/20 space-y-2 animate-in slide-in-from-top-2 duration-200"
          style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.04), rgba(14,11,8,0.9))" }}>
          <div className="grid grid-cols-2 gap-2">
            <input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="Source term"
              className="bg-black/30 border border-[#3e1b0d]/30 rounded-sm px-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40" />
            <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="Target term"
              className="bg-black/30 border border-[#3e1b0d]/30 rounded-sm px-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="Domain (e.g. security)"
              className="bg-black/30 border border-[#3e1b0d]/30 rounded-sm px-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40" />
            <label className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-[var(--text-muted)]">
              <input type="checkbox" checked={newForbidden} onChange={(e) => setNewForbidden(e.target.checked)} className="accent-[#8b2500]" />
              <Ban className="w-3 h-3" /> Forbidden
            </label>
          </div>
          <input value={newDef} onChange={(e) => setNewDef(e.target.value)} placeholder="Definition (optional)"
            className="w-full bg-black/30 border border-[#3e1b0d]/30 rounded-sm px-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40" />
          <Button size="sm" variant="copper" className="w-full h-8 text-[10px]" onClick={handleAdd} disabled={adding || !newSource.trim() || !newTarget.trim()}>
            {adding ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
            Add Term
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search terms..."
          className="w-full bg-black/30 border border-[#3e1b0d]/30 rounded-sm pl-7 pr-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40" />
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /><span className="text-[10px]">Loading...</span>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-8">
          <BookMarked className="w-8 h-8 text-[var(--text-muted)]/30 mx-auto mb-3" />
          <p className="text-[11px] text-[var(--text-muted)]">{searchQuery ? "No matching terms" : "Terminology Base is empty"}</p>
          <p className="text-[9px] text-[var(--text-muted)]/60 mt-1">Click <Plus className="w-2.5 h-2.5 inline" /> to add terms</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
            {filteredEntries.length}{searchQuery ? " matches" : ` of ${total}`}
          </div>
          {filteredEntries.map((e) => (
            <div key={e.id} className={cn(
              "p-2.5 rounded-sm border transition-colors group flex items-center gap-2",
              e.forbidden ? "border-[#8b2500]/20 hover:border-[#8b2500]/40" : "border-[#3e1b0d]/20 hover:border-[#b87333]/20"
            )} style={{ background: e.forbidden ? "rgba(139,37,0,0.04)" : "linear-gradient(135deg, rgba(14,11,8,0.8), rgba(10,8,5,0.9))" }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold", e.forbidden ? "text-[#8b2500] line-through" : "text-[var(--text-primary)]")}>{e.source_term}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-[var(--text-muted)] shrink-0" />
                  <span className={cn("text-[10px] font-bold", e.forbidden ? "text-[#8b2500] line-through" : "text-[#c9a84c]")}>{e.target_term}</span>
                </div>
                {(e.domain || e.definition) && (
                  <div className="flex items-center gap-2 mt-1">
                    {e.domain && (
                      <button
                        onClick={() => loadRelatedTerms(e.source_term)}
                        className="text-[7px] font-bold px-1 py-0 rounded-sm border bg-[#b87333]/10 text-[var(--text-muted)] border-[#b87333]/20 hover:bg-[#b87333]/20 hover:text-[#c9a84c] transition-colors"
                        title={`Show terms related to "${e.source_term}" via graph`}
                      >
                        {e.domain}
                      </button>
                    )}
                    {e.definition && <span className="text-[8px] text-[var(--text-muted)] italic truncate">{e.definition}</span>}
                  </div>
                )}
              </div>
              {e.forbidden && <Ban className="w-3 h-3 text-[#8b2500] shrink-0" />}
              {isAdmin && (
                <button onClick={() => handleDelete(e.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#8b2500]/20 text-[var(--text-muted)] hover:text-[#8b2500] transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Graph: Domain browser + related terms ───────────────────── */}
      {domains.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#3e1b0d]/20">
          <div className="flex items-center gap-1.5 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">
            <Tag className="w-3 h-3 text-[#c9a84c]" />
            Domains
            <span className="text-[8px] font-normal normal-case opacity-50 ml-0.5">Neo4j</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {domains.map((d) => (
              <button key={d} onClick={() => loadDomainTerms(d)}
                className={cn(
                  "text-[8px] font-bold px-1.5 py-0.5 rounded-sm border transition-colors",
                  activeDomain === d
                    ? "bg-[#c9a84c]/15 border-[#c9a84c]/40 text-[#c9a84c]"
                    : "bg-black/20 border-[#3e1b0d]/30 text-[var(--text-muted)] hover:border-[#b87333]/30 hover:text-[#c9a84c]",
                )}>
                {d}
              </button>
            ))}
          </div>

          {(activeDomain || focusTerm) && (
            <div className="rounded-sm border border-[#c9a84c]/15 p-2.5 space-y-1.5"
              style={{ background: "rgba(201,168,76,0.03)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-[#c9a84c]">
                  {focusTerm ? `Related to "${focusTerm}"` : `Domain: ${activeDomain}`}
                </span>
                <button onClick={() => { setActiveDomain(null); setFocusTerm(null); setRelatedTerms([]); }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {graphLoading ? (
                <div className="flex items-center gap-1.5 py-1 text-[var(--text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[9px]">Querying graph…</span>
                </div>
              ) : relatedTerms.length === 0 ? (
                <p className="text-[9px] text-[var(--text-muted)] italic">No related terms found</p>
              ) : relatedTerms.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 text-[9px] font-mono">
                  {t.forbidden
                    ? <Ban className="w-2.5 h-2.5 text-[#8b2500] shrink-0" />
                    : <Tag className="w-2.5 h-2.5 text-[#b87333] shrink-0" />}
                  <span className={cn(t.forbidden ? "text-[#8b2500] line-through" : "text-[var(--text-secondary)]")}>
                    {t.source_term}
                  </span>
                  <ArrowRight className="w-2 h-2 text-[var(--text-muted)] shrink-0" />
                  <span className={cn(t.forbidden ? "text-[#8b2500] line-through" : "text-[#c9a84c]")}>
                    {t.target_term}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── QA Check Tab ─────────────────────────────────────────────────────
function QACheckTab() {
  const qaRules = [
    { id: "q1", name: "Consistency Check", desc: "Identical source → same target", status: "pass", count: 4 },
    { id: "q2", name: "Terminology Compliance", desc: "All terms match TB entries", status: "warn", count: 1 },
    { id: "q3", name: "Untranslated Segments", desc: "Source = Target (no change)", status: "info", count: 2 },
    { id: "q4", name: "Number Format", desc: "Numbers preserved correctly", status: "pass", count: 0 },
    { id: "q5", name: "Tag Integrity", desc: "Code tags/brackets balanced", status: "pass", count: 0 },
    { id: "q6", name: "Whitespace Check", desc: "Leading/trailing spaces match", status: "pass", count: 0 },
  ];

  const statusIcon = { pass: Check, warn: AlertTriangle, info: Info, fail: AlertCircle };
  const statusColor = { pass: "#4a8b6e", warn: "#e67e22", info: "#c9a84c", fail: "#8b2500" };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Quality Assurance</span>
        <Button size="sm" variant="secondary" className="h-7 text-[9px] px-2.5">
          <RefreshCw className="w-3 h-3 mr-1" />Run All
        </Button>
      </div>
      {qaRules.map((r) => {
        const Icon = statusIcon[r.status as keyof typeof statusIcon];
        const color = statusColor[r.status as keyof typeof statusColor];
        return (
          <div key={r.id} className="flex items-center gap-3 p-3 rounded-sm border border-[#3e1b0d]/20 hover:border-[#b87333]/15 transition-colors"
            style={{ background: "linear-gradient(135deg, rgba(14,11,8,0.8), rgba(10,8,5,0.9))" }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
              <Icon className="w-3 h-3" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-[var(--text-primary)]">{r.name}</div>
              <div className="text-[8px] text-[var(--text-muted)]">{r.desc}</div>
            </div>
            {r.count > 0 && (
              <Badge className="text-[8px] px-1.5 py-0" style={{ background: `${color}15`, color, borderColor: `${color}30` }}>
                {r.count}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Tabbed Component ────────────────────────────────────────────
function ReviewPanelTabs() {
  const [activeTab, setActiveTab] = useCookieState(COOKIE_KEYS.REVIEW_ACTIVE_TAB, "analysis") as [TabId, (v: TabId) => void];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar — compact with abbreviations */}
      <div className="flex border-b border-[#3e1b0d]/30 shrink-0 overflow-x-auto custom-scrollbar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={cn(
                "flex-1 min-w-0 flex items-center justify-center gap-1 py-2 px-1.5 text-[9px] font-black uppercase tracking-wider transition-all border-b-2 -mb-px whitespace-nowrap",
                isActive
                  ? "text-[#c9a84c] border-[#c9a84c]"
                  : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:border-[#b87333]/30"
              )}
              style={isActive ? { background: "linear-gradient(180deg, rgba(201,168,76,0.06), transparent)" } : undefined}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span>{tab.abbr}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === "analysis" && <AnalysisTab />}
        {activeTab === "memory" && <MemoryTab />}
        {activeTab === "terminology" && <TerminologyTab />}
        {activeTab === "qa" && <QACheckTab />}
      </div>
    </div>
  );
}

export const SuggestionsPluginGroup: PluginGroup = {
  id: "review-panel",
  name: "Review Panel",
  plugins: [
    {
      id: "review-panel-tabs",
      name: "Review Panel Tabs",
      component: ReviewPanelTabs as React.ComponentType<unknown>,
    },
  ],
};
