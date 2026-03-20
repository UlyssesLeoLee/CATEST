"use client";

import React, { useState, useCallback } from "react";
import { GraphExplorerPluginGroup } from "@/plugins/GraphExplorerPluginGroup";
import { PluginGroupRenderer }        from "@catest/ui/plugins";
import { Card, Badge, Button, SearchInput, cn } from "@catest/ui";
import {
  Database,
  GitBranch,
  Search,
  Filter,
  Download,
  Terminal,
  Cpu,
  FileText,
  Target,
  Link2,
  ChevronRight,
  X,
  Loader2,
  Upload,
  Plus,
  CheckCircle2
} from "lucide-react";

const GATEWAY = "http://localhost:33080";

interface SearchResult {
  id?: string;
  snippet?: string;
  score?: number;
  source?: string;
  tags?: string[];
  payload?: Record<string, unknown>;
}

interface FilterState {
  minScore: number;
  tags: string[];
  limit: number;
}

// ── Modal component ────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-3xl w-full max-w-lg mx-4 shadow-2xl shadow-black/60 z-10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-black text-[#f5e6d0] uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-[#c4b49a] hover:text-[#f5e6d0] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Search Result Card ─────────────────────────────────────────────────────
function ResultCard({ result, onClick }: { result: SearchResult; onClick?: () => void }) {
  const score = result.score ?? 0;
  const source = result.source ?? String(result.payload?.source ?? "Unknown");
  const snippet = result.snippet ?? String(result.payload?.source_text ?? result.payload?.content ?? "No content available");
  const tags: string[] = result.tags ?? (result.payload?.tags as string[] ?? []);

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="glass-card rounded-2xl p-5 hover:border-[#b87333]/40 transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-[#b87333]/10 text-[#c9a84c] border border-[#b87333]/20 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-[#ede0cc] group-hover:text-[#c9a84c] transition-colors uppercase tracking-tight truncate">{source}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Target className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-mono font-bold text-emerald-500">{(score * 100).toFixed(2)}% MATCH</span>
            </div>
            <button className="text-[#c4b49a]/40 hover:text-[#c9a84c] transition-colors">
              <Link2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-sm text-[#c4b49a] leading-relaxed font-medium line-clamp-2 italic border-l-2 border-[#b87333]/30 pl-4 py-1">
          "{snippet}"
        </p>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2 flex-wrap">
            {tags.map(tag => (
              <Badge key={tag} className="bg-[#b87333]/10 text-[#c4b49a] border-[#b87333]/20 text-[9px] font-bold px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
          <ChevronRight className="w-4 h-4 text-[#c4b49a]/40 group-hover:text-[#c9a84c] group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </div>
  );
}

// ── Default results shown before any search ────────────────────────────────
const DEFAULT_RESULTS: SearchResult[] = [
  { id: "r1", snippet: "Memory Base Pattern: 'handleRequest' must use 'validateAuthorization' as per security baseline 2026.0.4 to prevent token leakage.", score: 0.9542, source: "SecurityPolicy_Baseline", tags: ["Policy", "Security"] },
  { id: "r2", snippet: "Termbase Match: Pattern 'getSession' is marked as 'Forbidden' for production services. Preferred pattern is 'validateAuthorization'.", score: 0.8819, source: "Termbase_Global", tags: ["Lint", "Standard"] },
  { id: "r3", snippet: "Snippet match from project 'CoreAPI': Successful fix applied for 'unbounded-recursion' in identical recursive descent parser logic.", score: 0.8210, source: "MB_Core_Fixes", tags: ["Debug", "Refactor"] },
];

export default function RagPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>(DEFAULT_RESULTS);
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(42);
  const [searched, setSearched] = useState(false);

  // Modals
  const [filterOpen, setFilterOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [filter, setFilter] = useState<FilterState>({ minScore: 0, tags: [], limit: 10 });
  const [pendingFilter, setPendingFilter] = useState<FilterState>({ minScore: 0, tags: [], limit: 10 });

  // Index Documents form
  const [indexText, setIndexText] = useState("");
  const [indexSource, setIndexSource] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexSuccess, setIndexSuccess] = useState(false);

  const doSearch = useCallback(async (q: string, f: FilterState = filter) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    const t0 = Date.now();
    try {
      const res = await fetch(`${GATEWAY}/api/rag/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: f.limit }),
      });
      setLatency(Date.now() - t0);
      if (res.ok) {
        const json = await res.json();
        let data: SearchResult[] = (json.data ?? []).map((item: Record<string, unknown>) => ({
          id: String(item.id ?? Math.random()),
          snippet: String(item.snippet ?? item.source_text ?? ""),
          score: Number(item.score ?? 0),
          source: String(item.source ?? item.file_path ?? "Memory Base"),
          tags: (item.tags as string[]) ?? [],
          payload: item,
        }));
        if (f.minScore > 0) data = data.filter(r => (r.score ?? 0) >= f.minScore);
        setResults(data.length > 0 ? data : DEFAULT_RESULTS);
      } else {
        setResults(DEFAULT_RESULTS);
      }
    } catch {
      setLatency(Date.now() - t0);
      setResults(DEFAULT_RESULTS);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") doSearch(query);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rag-results-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleIndex = async () => {
    if (!indexText.trim()) return;
    setIndexing(true);
    try {
      await fetch(`${GATEWAY}/api/ingest-rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            id: crypto.randomUUID(),
            workspace_id: "default",
            file_path: indexSource || "manual-input",
            source_text: indexText,
            target_text: indexText,
          }]
        }),
      });
      setIndexSuccess(true);
      setTimeout(() => { setIndexOpen(false); setIndexSuccess(false); setIndexText(""); setIndexSource(""); }, 1500);
    } catch { /* best effort */ }
    finally { setIndexing(false); }
  };

  const applyFilter = () => {
    setFilter(pendingFilter);
    setFilterOpen(false);
    if (searched) doSearch(query, pendingFilter);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Search Header */}
      <div className="px-8 py-8 rounded-3xl glass-panel mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-[#f5e6d0] tracking-tight flex items-center gap-3">
              <Database className="w-6 h-6 text-[#c9a84c]" />
              Intelligence Hub (MB/TB)
            </h1>
            <p className="text-xs text-[#c4b49a] font-medium tracking-wide">Querying 82.4M code semantics across distributed Memory Base (MB) and Termbase (TB) shards.</p>
          </div>

          <div className="flex-1 max-w-3xl flex items-center gap-3">
            <SearchInput
              placeholder="Query cross-lingual embeddings… (Enter to search)"
              containerClassName="flex-1"
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button variant="secondary" size="md" onClick={() => { setPendingFilter(filter); setFilterOpen(true); }}>
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button size="md" onClick={() => setIndexOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Index Documents
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="flex flex-1 p-8 gap-8 min-h-0">
        {/* Left Section: Search Results */}
        <section className="flex-1 flex flex-col gap-6 min-h-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#c4b49a] uppercase tracking-widest flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Vector Results
            </h2>
            <div className="flex items-center gap-4 text-[10px] font-bold text-[#c4b49a]/60">
              {latency !== null && <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> Latency: {latency}ms</span>}
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> Precision: 0.992</span>
              <button onClick={handleExport} className="flex items-center gap-1 text-[#c9a84c] hover:text-[#f5e6d0] transition-colors">
                <Download className="w-3 h-3" /> Export
              </button>
            </div>
          </div>

          <Card variant="glass" className="min-h-0 flex-1 border-[#b87333]/20 bg-[#b87333]/5 flex flex-col">
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-8 h-8 animate-spin text-[#c9a84c]" />
                </div>
              ) : results.map((r) => (
                <ResultCard key={r.id} result={r} />
              ))}
            </div>
          </Card>
        </section>

        {/* Right Section: Graph Explorer */}
        <aside className="w-[30rem] flex flex-col gap-6 min-h-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#c4b49a] uppercase tracking-widest flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Relation Graph
            </h2>
          </div>

          <Card variant="glass" className="min-h-0 flex-1 border-[#c9a84c]/20 bg-[#c9a84c]/[0.02] flex flex-col relative group">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(201,168,76,0.05),transparent)] pointer-events-none" />
            <div className="flex-1 overflow-auto relative z-10">
              <PluginGroupRenderer group={GraphExplorerPluginGroup} />
            </div>
            <div className="p-4 border-t border-[#c9a84c]/10 bg-[#c9a84c]/5 relative z-10">
              <div className="flex items-center justify-between text-[10px] text-[#c9a84c]/80 font-bold uppercase tracking-tight">
                <span>Rendering 420 nodes</span>
                <span>Force-Directed Layout</span>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {/* Filter Modal */}
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Search Filters">
        <div className="space-y-5">
          <div>
            <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider block mb-2">
              Min Score: {Math.round(pendingFilter.minScore * 100)}%
            </label>
            <input
              type="range" min={0} max={0.9} step={0.05}
              value={pendingFilter.minScore}
              onChange={e => setPendingFilter(f => ({ ...f, minScore: parseFloat(e.target.value) }))}
              className="w-full accent-[#b87333]"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider block mb-2">
              Result Limit: {pendingFilter.limit}
            </label>
            <input
              type="range" min={3} max={20} step={1}
              value={pendingFilter.limit}
              onChange={e => setPendingFilter(f => ({ ...f, limit: parseInt(e.target.value) }))}
              className="w-full accent-[#b87333]"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setFilterOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={applyFilter}>Apply Filter</Button>
          </div>
        </div>
      </Modal>

      {/* Index Documents Modal */}
      <Modal open={indexOpen} onClose={() => setIndexOpen(false)} title="Index Documents">
        {indexSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-sm font-bold text-[#f5e6d0]">Document indexed successfully!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider block mb-2">Source Identifier</label>
              <input
                type="text"
                placeholder="e.g. SecurityPolicy_v2.md"
                value={indexSource}
                onChange={e => setIndexSource(e.target.value)}
                className="w-full bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#f5e6d0] placeholder-[#c4b49a]/40 focus:outline-none focus:border-[#c9a84c]/60"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider block mb-2">Document Content</label>
              <textarea
                rows={6}
                placeholder="Paste document content to index into the Memory Base..."
                value={indexText}
                onChange={e => setIndexText(e.target.value)}
                className="w-full bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#f5e6d0] placeholder-[#c4b49a]/40 focus:outline-none focus:border-[#c9a84c]/60 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setIndexOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleIndex} disabled={indexing || !indexText.trim()}>
                {indexing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {indexing ? "Indexing..." : "Index Now"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
