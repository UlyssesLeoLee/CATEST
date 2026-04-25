"use client";

import React, { useState, useCallback } from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button, cn } from "@catest/ui";
import {
  GitBranch,
  Info,
  Database,
  Search,
  Layers,
  Fingerprint,
  Tag,
  Code2,
  Play,
  Eye,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Trash2,
} from "lucide-react";

const VECTOR_OPS = (() => {
  if (typeof window === "undefined") return "http://localhost:34085";
  const { hostname, port } = window.location;
  if (hostname === "localhost" && port !== "33088") return "http://localhost:34085";
  return "/api/vectors";
})();

// ── Types ──

interface CypherStatement {
  cypher: string;
  description: string;
}

interface AnalysisResult {
  statements: CypherStatement[];
  node_count: number;
  edge_count: number;
  raw_cypher: string;
  errors: string[];
}

// ── Plugin: Relationship Map (existing) ──

function RelationshipMapPlugin() {
  return (
    <div className="relative h-full min-h-[400px] flex items-center justify-center bg-[#050505] rounded-xl border border-[#3e1b0d]/30 overflow-hidden group">
      {/* Mock Graph Visualization Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full border border-[#b87333]/40 blur-sm" />
        <div className="absolute bottom-1/3 right-1/4 w-24 h-24 rounded-full border border-[#4a8b6e]/40 blur-sm" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-[#b87333]/25 blur-md" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-full bg-[#b87333]/10 border border-[#b87333]/20 flex items-center justify-center text-[#c9a84c] animate-pulse">
           <GitBranch className="w-8 h-8" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Memgraph Integration Layer</h4>
          <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1">Real-time Entity Relationship Mapping</p>
        </div>
        <Badge className="bg-black/40 border-[#3e1b0d]/30 text-[var(--text-muted)] text-[10px]">CYPHER: MATCH (n)-[r]-{'>'}(m) RETURN n,r,m</Badge>
      </div>


      {/* Floating UI Elements */}
      <div className="absolute top-4 left-4 flex gap-2">
         <div className="px-2 py-1 rounded bg-black/60 border border-[#3e1b0d]/20 backdrop-blur-md text-[9px] font-bold text-[var(--text-muted)] uppercase">Clustering: ON</div>
         <div className="px-2 py-1 rounded bg-black/60 border border-[#3e1b0d]/20 backdrop-blur-md text-[9px] font-bold text-[var(--text-muted)] uppercase">Physics: Stable</div>
      </div>
    </div>
  );
}

// ── Plugin: Node Inspector ──

interface InspectNode {
  id: string;
  label: string;
  display_name: string;
  payload: Record<string, unknown>;
}

function NodeInspectorPlugin() {
  const [node, setNode] = React.useState<InspectNode | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [empty, setEmpty] = React.useState(false);

  React.useEffect(() => {
    fetch(`${VECTOR_OPS}/v1/graph/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cypher: "MATCH (n) RETURN n LIMIT 1", max_nodes: 1, max_edges: 0 }),
    })
      .then(r => r.json())
      .then(data => {
        const n = (data.nodes ?? [])[0] ?? null;
        setNode(n);
        setEmpty(!n);
      })
      .catch(() => setEmpty(true))
      .finally(() => setLoading(false));
  }, []);

  const properties = node ? [
    { label: "Label",   value: node.label || "—",        icon: Tag,         color: "text-[#c9a84c]" },
    { label: "ID",      value: node.id.slice(0, 20),     icon: Fingerprint, color: "text-[var(--text-muted)]" },
    { label: "Name",    value: node.display_name || "—", icon: Layers,      color: "text-[#4a8b6e]" },
    ...Object.entries(node.payload ?? {}).slice(0, 2).map(([k, v]) => ({
      label: k,
      value: String(v ?? "").slice(0, 32),
      icon: Database,
      color: "text-[#b87333]" as const,
    })),
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Info className="w-3.5 h-3.5 text-[#c9a84c]" />
        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Entity Inspector</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]/40" />
        </div>
      ) : (empty || !node) ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Database className="w-8 h-8 text-[var(--text-muted)]/20" />
          <span className="text-[10px] text-[var(--text-muted)]/40">No nodes in graph yet</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            {properties.map((prop, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-black/30 border border-[#3e1b0d]/20 hover:border-[#b87333]/30 transition-colors">
                <div className="flex items-center gap-3">
                  <prop.icon className={cn("w-3.5 h-3.5", prop.color)} />
                  <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-tight">{prop.label}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate max-w-[130px]">{prop.value}</span>
              </div>
            ))}
          </div>

          <Button variant="secondary" size="sm" className="w-full h-8 text-[10px] font-bold border-[#3e1b0d]/30 bg-black/30 text-[var(--text-muted)] hover:text-[#c9a84c]">
            <Search className="w-3 h-3 mr-2" />
            Find Similar Entities
          </Button>
        </>
      )}
    </div>
  );
}

// ── Plugin: Code Structure Analyzer (NEW) ──

const LANGUAGES = ["auto", "typescript", "javascript", "python", "rust", "go", "java", "c", "cpp", "csharp"];

function CodeStructureAnalyzerPlugin() {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("auto");
  const [labelPrefix, setLabelPrefix] = useState("Code");
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = useCallback(async (preview: boolean) => {
    if (!code.trim()) return;
    setLoading(true);
    setPreviewMode(preview);
    setResult(null);

    try {
      const endpoint = preview ? "/v1/code/preview" : "/v1/code/analyze";
      const resp = await fetch(`${VECTOR_OPS}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, label_prefix: labelPrefix }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        setResult({
          statements: [],
          node_count: 0,
          edge_count: 0,
          raw_cypher: "",
          errors: [`API error ${resp.status}: ${errText.slice(0, 200)}`],
        });
        return;
      }

      const data: AnalysisResult = await resp.json();
      setResult(data);
    } catch (e) {
      setResult({
        statements: [],
        node_count: 0,
        edge_count: 0,
        raw_cypher: "",
        errors: [`Network error: ${e instanceof Error ? e.message : String(e)}`],
      });
    } finally {
      setLoading(false);
    }
  }, [code, language, labelPrefix]);

  const copyRawCypher = useCallback(() => {
    if (result?.raw_cypher) {
      navigator.clipboard.writeText(result.raw_cypher);
    }
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Code2 className="w-3.5 h-3.5 text-[#c9a84c]" />
        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
          AI Code Structure Analyzer
        </span>
      </div>

      {/* Settings row */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[9px] font-bold text-[var(--text-muted)]/60 uppercase tracking-wider block mb-1">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-[#0a0704] border border-[#3e1b0d]/30 rounded-lg px-2 py-1.5 text-[10px] font-mono text-[#e8d5b5] focus:outline-none focus:border-[#b87333]/50"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-[9px] font-bold text-[var(--text-muted)]/60 uppercase tracking-wider block mb-1">Label Prefix</label>
          <input
            type="text"
            value={labelPrefix}
            onChange={(e) => setLabelPrefix(e.target.value.replace(/\s/g, "_"))}
            placeholder="Code"
            className="w-full bg-[#0a0704] border border-[#3e1b0d]/30 rounded-lg px-2 py-1.5 text-[10px] font-mono text-[#e8d5b5] placeholder-[#8a7b6a]/40 focus:outline-none focus:border-[#b87333]/50"
          />
        </div>
      </div>

      {/* Code input */}
      <div className="relative">
        <textarea
          rows={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={"// Paste your code here...\nfunction hello() {\n  return 'world';\n}"}
          className="w-full font-mono text-xs leading-relaxed resize-none rounded-xl px-4 py-3 text-[#e8d5b5] placeholder-[#8a7b6a]/40 focus:outline-none transition-all"
          style={{
            background: '#0a0704',
            border: '1px solid rgba(184,115,51,0.2)',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,240,200,0.03)',
          }}
        />
        {/* Scanline effect */}
        <div
          className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden opacity-[0.03]"
          style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)' }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-8 text-[10px] font-bold border-[#3e1b0d]/30 bg-black/30 text-[var(--text-muted)] hover:text-[#c9a84c]"
          onClick={() => handleAnalyze(true)}
          disabled={loading || !code.trim()}
        >
          {loading && previewMode ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Eye className="w-3 h-3 mr-1.5" />}
          Preview Cypher
        </Button>
        <Button
          variant="copper"
          size="sm"
          className="flex-1 h-8 text-[10px] font-bold"
          onClick={() => handleAnalyze(false)}
          disabled={loading || !code.trim()}
        >
          {loading && !previewMode ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Play className="w-3 h-3 mr-1.5" />}
          Analyze & Import
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Stats bar */}
          {!previewMode && (result.node_count > 0 || result.edge_count > 0) && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#4a8b6e]/10 border border-[#4a8b6e]/20">
              <CheckCircle2 className="w-4 h-4 text-[#4a8b6e] shrink-0" />
              <span className="text-[10px] font-bold text-[#4a8b6e]">
                Imported: {result.node_count} nodes, {result.edge_count} relationships
              </span>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-[10px] font-mono text-red-300 break-all">{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cypher statements */}
          {result.statements.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-[var(--text-muted)]/60 uppercase tracking-wider">
                  Generated Cypher ({result.statements.length} statements)
                </span>
                <button
                  onClick={copyRawCypher}
                  className="flex items-center gap-1 text-[9px] font-bold text-[var(--text-brass)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Copy All
                </button>
              </div>
              <div
                className="max-h-48 overflow-y-auto rounded-xl p-3 space-y-1 steam-scroll"
                style={{
                  background: '#0a0704',
                  border: '1px solid rgba(184,115,51,0.15)',
                }}
              >
                {result.statements.map((stmt, i) => (
                  <div
                    key={i}
                    className="text-[10px] font-mono text-[#e8d5b5]/80 leading-relaxed py-0.5 border-b border-[#3e1b0d]/10 last:border-0"
                  >
                    <span className="text-[#b87333]/50 mr-2 select-none">{i + 1}.</span>
                    {stmt.cypher}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear button */}
          <Button
            variant="secondary"
            size="sm"
            className="w-full h-7 text-[9px] font-bold border-[#3e1b0d]/20 bg-black/20 text-[var(--text-muted)]/60 hover:text-red-400"
            onClick={() => { setResult(null); setCode(""); }}
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

export const GraphExplorerPluginGroup: PluginGroup = {
  id: "rag-graph",
  name: "Knowledge Graph Explorer",
  plugins: [
    { id: "code-structure",    name: "Code → Cypher",    component: CodeStructureAnalyzerPlugin as React.ComponentType<unknown> },
    { id: "relationship-map",  name: "Relationship Map",  component: RelationshipMapPlugin as React.ComponentType<unknown> },
    { id: "node-inspector",    name: "Node Inspector",    component: NodeInspectorPlugin as React.ComponentType<unknown> },
  ],
};
