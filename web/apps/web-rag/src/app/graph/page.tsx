"use client";

import React, {
  useState, useCallback, useEffect, useRef, useMemo,
} from "react";
import {
  Database, GitBranch, Terminal, Code2, Play, Eye, Loader2,
  CheckCircle2, AlertTriangle, Copy, RefreshCw, ChevronDown,
  ChevronRight, Box, Link2, Zap, Maximize2, Minimize2,
  MousePointer, ZoomIn, ZoomOut, RotateCcw, Sparkles, X,
  Activity, FileCode2, Trash2,
} from "lucide-react";
import { Badge, Button, cn } from "@catest/ui";

const VECTOR_OPS =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api/vector-ops"   // k8s proxy — adjust if needed
    : "http://localhost:34085";

const LANGUAGES = ["auto","typescript","javascript","python","rust","go","java","c","cpp","csharp"];

// ── Types ──────────────────────────────────────────────────────────────────────

interface BackendStatus {
  backend: string;
  connected: boolean;
  collections: { name: string; point_count: number }[];
}

interface CypherStatement { cypher: string; description: string }

interface AnalysisResult {
  statements: CypherStatement[];
  node_count: number;
  edge_count: number;
  raw_cypher: string;
  errors: string[];
}

interface GraphNode {
  id: string;
  display_name: string;
  label: string;
  payload: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: number;
}

interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; node_count: number; edge_count: number }

// ── Force simulation ──────────────────────────────────────────────────────────

interface SimNode { id: string; x: number; y: number; vx: number; vy: number; data: GraphNode }

function useForceGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
) {
  const simRef = useRef<SimNode[]>([]);
  const rafRef = useRef<number>(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!width || !height || nodes.length === 0) { simRef.current = []; setTick(t => t + 1); return; }

    const cx = width / 2, cy = height / 2;
    const r = Math.min(width, height) * 0.32;
    const step = (2 * Math.PI) / nodes.length;

    // Preserve positions for existing nodes
    const prevMap = new Map(simRef.current.map(n => [n.id, n]));
    simRef.current = nodes.map((n, i) => {
      const prev = prevMap.get(n.id);
      return prev
        ? { ...prev, data: n }
        : { id: n.id, x: cx + r * Math.cos(i * step), y: cy + r * Math.sin(i * step), vx: 0, vy: 0, data: n };
    });

    let iter = 0;
    const maxIter = 250;
    const ideal = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 1.4;

    function simulate() {
      const S = simRef.current;
      if (!S.length) return;

      // Damping
      for (const n of S) { n.vx *= 0.82; n.vy *= 0.82; }

      // Repulsion
      for (let i = 0; i < S.length; i++) {
        for (let j = i + 1; j < S.length; j++) {
          const dx = S[j].x - S[i].x || 0.01;
          const dy = S[j].y - S[i].y || 0.01;
          const d2 = dx * dx + dy * dy;
          const d = Math.sqrt(d2) || 0.01;
          const f = (ideal * ideal * 1.8) / d2;
          const fx = (dx / d) * f * 0.06;
          const fy = (dy / d) * f * 0.06;
          S[i].vx -= fx; S[i].vy -= fy;
          S[j].vx += fx; S[j].vy += fy;
        }
      }

      // Attraction (edges)
      const nm = new Map(S.map(n => [n.id, n]));
      for (const e of edges) {
        const a = nm.get(e.source_id), b = nm.get(e.target_id);
        if (!a || !b || a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - ideal) * 0.011;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      // Center gravity
      const margin = 28;
      for (const n of S) {
        n.vx += (cx - n.x) * 0.0035;
        n.vy += (cy - n.y) * 0.0035;
        n.x = Math.max(margin, Math.min(width - margin, n.x + n.vx));
        n.y = Math.max(margin, Math.min(height - margin, n.y + n.vy));
      }

      setTick(t => t + 1);
      iter++;
      if (iter < maxIter) rafRef.current = requestAnimationFrame(simulate);
    }

    rafRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodes, edges, width, height]); // eslint-disable-line

  return { simNodes: simRef.current, tick };
}

// ── Node color palette ────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  module:   "#b87333",
  class:    "#c9a84c",
  function: "#4a8b6e",
  method:   "#5ba87e",
  variable: "#7b92a8",
  import:   "#8a7b6a",
  type:     "#9b6b9e",
  interface:"#6b9eb8",
};
function nodeColor(n: GraphNode) {
  const kind = String(n.payload?.kind ?? n.label ?? "");
  return KIND_COLORS[kind] ?? "#6b7280";
}

// ── Force Graph Canvas ────────────────────────────────────────────────────────

function ForceGraphCanvas({
  nodes, edges, selectedId, onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 400 });
  const [tx, setTx] = useState({ x: 0, y: 0, s: 1 });
  const isPanning = useRef(false);
  const panOrigin = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });
  const draggingNode = useRef<string | null>(null);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setDims({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { simNodes, tick } = useForceGraph(nodes, edges, dims.w, dims.h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const posMap = useMemo(() => new Map(simNodes.map(n => [n.id, { x: n.x, y: n.y }])), [tick]);

  function toSVG(clientX: number, clientY: number) {
    const el = wrapRef.current!.querySelector("svg")!;
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left - tx.x) / tx.s,
      y: (clientY - rect.top - tx.y) / tx.s,
    };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const ns = Math.max(0.25, Math.min(5, tx.s * (e.deltaY > 0 ? 0.9 : 1.1)));
    setTx(t => ({ ...t, s: ns }));
  }

  function onMouseDown(e: React.MouseEvent) {
    const target = e.target as Element;
    // Check if clicking a node
    const nodeEl = target.closest("[data-nodeid]");
    if (nodeEl) {
      draggingNode.current = nodeEl.getAttribute("data-nodeid");
      return;
    }
    // Background pan
    isPanning.current = true;
    panOrigin.current = { mx: e.clientX, my: e.clientY, tx: tx.x, ty: tx.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (draggingNode.current) {
      const pos = toSVG(e.clientX, e.clientY);
      const node = simNodes.find(n => n.id === draggingNode.current);
      if (node) { node.x = pos.x; node.y = pos.y; node.vx = 0; node.vy = 0; }
      return;
    }
    if (!isPanning.current) return;
    setTx(t => ({
      ...t,
      x: panOrigin.current.tx + e.clientX - panOrigin.current.mx,
      y: panOrigin.current.ty + e.clientY - panOrigin.current.my,
    }));
  }

  function onMouseUp() { isPanning.current = false; draggingNode.current = null; }

  function fitView() {
    if (!simNodes.length) return;
    const xs = simNodes.map(n => n.x), ys = simNodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const gw = maxX - minX || 1, gh = maxY - minY || 1;
    const s = Math.min((dims.w - 80) / gw, (dims.h - 80) / gh, 2);
    setTx({
      x: (dims.w - gw * s) / 2 - minX * s,
      y: (dims.h - gh * s) / 2 - minY * s,
      s,
    });
  }

  const isEmpty = nodes.length === 0;

  return (
    <div ref={wrapRef} className="relative w-full h-full select-none" style={{ minHeight: 320 }}>
      {isEmpty ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]/30">
          <GitBranch className="w-12 h-12" />
          <span className="text-xs font-mono">Import code to visualize the graph</span>
        </div>
      ) : (
        <svg
          className="w-full h-full"
          style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <defs>
            <marker id="arr" markerWidth={8} markerHeight={8} refX={18} refY={3} orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="rgba(184,115,51,0.45)" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Background grid */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(184,115,51,0.04)" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${tx.x},${tx.y}) scale(${tx.s})`}>
            {/* Edges */}
            {edges.map(e => {
              const s = posMap.get(e.source_id), t = posMap.get(e.target_id);
              if (!s || !t || e.source_id === e.target_id) return null;
              const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
              return (
                <g key={e.id}>
                  <line
                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke="rgba(184,115,51,0.25)" strokeWidth={1.5}
                    markerEnd="url(#arr)"
                  />
                  <text x={mx} y={my - 5} fill="rgba(201,168,76,0.45)"
                    fontSize={7} textAnchor="middle" fontFamily="monospace" pointerEvents="none">
                    {e.edge_type}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {simNodes.map(sn => {
              const color = nodeColor(sn.data);
              const isSelected = sn.id === selectedId;
              const name = sn.data.display_name || String(sn.data.payload?.name ?? sn.id.slice(-6));
              const kind = String(sn.data.payload?.kind ?? sn.data.label ?? "");
              return (
                <g
                  key={sn.id}
                  data-nodeid={sn.id}
                  onClick={() => onSelect(isSelected ? null : sn.id)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Selection ring */}
                  {isSelected && (
                    <circle cx={sn.x} cy={sn.y} r={22} fill="none"
                      stroke={color} strokeWidth={1.5} opacity={0.6}
                      strokeDasharray="4 2" />
                  )}
                  {/* Glow halo */}
                  <circle cx={sn.x} cy={sn.y} r={18}
                    fill={`${color}18`}
                    stroke="none"
                    filter={isSelected ? "url(#glow)" : undefined}
                  />
                  {/* Node circle */}
                  <circle
                    cx={sn.x} cy={sn.y} r={15}
                    fill={`${color}28`}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  {/* Name label */}
                  <text x={sn.x} y={sn.y + 4}
                    fill={color} fontSize={8} textAnchor="middle"
                    fontFamily="monospace" fontWeight="bold" pointerEvents="none">
                    {name.length > 11 ? name.slice(0, 10) + "…" : name}
                  </text>
                  {/* Kind label below node */}
                  <text x={sn.x} y={sn.y + 28}
                    fill="rgba(255,255,255,0.25)" fontSize={6.5} textAnchor="middle"
                    fontFamily="monospace" pointerEvents="none">
                    {kind}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {/* Graph controls */}
      {!isEmpty && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
          <button onClick={() => setTx(t => ({ ...t, s: Math.min(5, t.s * 1.25) }))}
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-[#b87333]/20 bg-black/60 text-[var(--text-muted)] hover:text-[#c9a84c] hover:border-[#b87333]/40 transition-all">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setTx(t => ({ ...t, s: Math.max(0.25, t.s * 0.8) }))}
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-[#b87333]/20 bg-black/60 text-[var(--text-muted)] hover:text-[#c9a84c] hover:border-[#b87333]/40 transition-all">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={fitView}
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-[#b87333]/20 bg-black/60 text-[var(--text-muted)] hover:text-[#c9a84c] hover:border-[#b87333]/40 transition-all">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setTx({ x: 0, y: 0, s: 1 })}
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-[#b87333]/20 bg-black/60 text-[var(--text-muted)] hover:text-[#c9a84c] hover:border-[#b87333]/40 transition-all">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────────────────────────

function StatusBar({ statuses }: { statuses: BackendStatus[] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {statuses.map(s => {
        const isMG = s.backend === "memgraph";
        const color = s.connected ? "#4a8b6e" : "#8b4a4a";
        const pts = s.collections.reduce((a, c) => a + c.point_count, 0);
        return (
          <div key={s.backend} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
            style={{ background: `${color}08`, borderColor: `${color}25` }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
              {isMG ? "Memgraph" : "Qdrant"}
            </span>
            {s.connected && pts > 0 && (
              <span className="text-[9px] font-mono" style={{ color: `${color}80` }}>{pts} nodes</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function NodeDetail({
  node, onClose, onAskAI,
}: {
  node: GraphNode;
  onClose: () => void;
  onAskAI: (ctx: string) => void;
}) {
  const color = nodeColor(node);
  const name = node.display_name || String(node.payload?.name ?? node.id);
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${color}35`, background: "rgba(6,4,2,0.8)" }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: `${color}20`, background: `${color}08` }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
            {String(node.payload?.kind ?? node.label ?? "node")}
          </span>
          <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[120px]">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onAskAI(`Node: ${JSON.stringify({ name, ...node.payload }, null, 2)}`)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold border border-[#b87333]/20 bg-black/20 text-[#c9a84c]/60 hover:text-[#c9a84c] transition-all">
            <Sparkles className="w-2.5 h-2.5" /> Ask AI
          </button>
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
        {Object.entries(node.payload).map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[10px] font-mono">
            <span className="shrink-0 w-20 truncate" style={{ color: `${color}70` }}>{k}</span>
            <span className="text-[#e8d5b5]/70 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Chat Panel ─────────────────────────────────────────────────────────────

function AIChatPanel({
  context, onClose,
}: {
  context: string;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true); setAnswer("");
    try {
      const res = await fetch(`${VECTOR_OPS}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context }),
      });
      const data = await res.json();
      setAnswer(data.answer || JSON.stringify(data, null, 2));
    } catch (e) {
      setAnswer(`Error: ${e}`);
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(184,115,51,0.25)", background: "rgba(6,4,2,0.9)" }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "rgba(184,115,51,0.15)", background: "rgba(184,115,51,0.05)" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#c9a84c]" />
          <span className="text-[10px] font-black text-[#c9a84c] uppercase tracking-widest">AI Analysis</span>
        </div>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask about the selected node or code structure…"
          rows={2}
          className="w-full font-mono text-xs rounded-lg px-3 py-2 text-[#e8d5b5] placeholder-[#8a7b6a]/40 focus:outline-none resize-none"
          style={{ background: "#0a0704", border: "1px solid rgba(184,115,51,0.2)" }}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={ask} disabled={loading || !question.trim()}
            className="h-7 text-[10px] font-bold bg-[#b87333]/15 border-[#b87333]/30 text-[#c9a84c] hover:bg-[#b87333]/25">
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            {loading ? "Thinking…" : "Ask"}
          </Button>
        </div>
        {answer && (
          <pre className="text-[9px] font-mono text-[#e8d5b5]/70 bg-black/40 rounded-lg p-3 max-h-32 overflow-auto whitespace-pre-wrap border border-[#b87333]/10">
            {answer}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Left Input Panel (Code / Cypher tabs) ────────────────────────────────────

const QUICK_CYPHERS = [
  { label: "All nodes", q: "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100" },
  { label: "With edges", q: "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50" },
  { label: "By label…", q: "MATCH (n:Function) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 30" },
  { label: "Class tree", q: "MATCH (c)-[r]->(m) WHERE 'Class' IN labels(c) OR any(l IN labels(c) WHERE l ENDS WITH '_Class') RETURN c, r, m LIMIT 40" },
];

function LeftInputPanel({
  lang, setLang, prefix, setPrefix,
  code, setCode,
  analyzing, importing, autoImport, setAutoImport,
  preview, importResult, cypherAnnotation,
  memgraphOnline,
  onPreview, onImport, onRunCypher,
}: {
  lang: string; setLang: (v: string) => void;
  prefix: string; setPrefix: (v: string) => void;
  code: string; setCode: (v: string) => void;
  analyzing: boolean; importing: boolean;
  autoImport: boolean; setAutoImport: (v: boolean) => void;
  preview: AnalysisResult | null;
  importResult: AnalysisResult | null;
  cypherAnnotation: string;
  memgraphOnline: boolean;
  onPreview: () => void;
  onImport: () => void;
  onRunCypher: (cypher: string) => void;
}) {
  const [tab, setTab] = useState<"code" | "cypher">("code");
  const [cypher, setCypher] = useState("MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ node_count: number; edge_count: number } | null>(null);

  async function runCypher() {
    if (!cypher.trim()) return;
    setRunning(true); setRunResult(null);
    await onRunCypher(cypher);
    setRunning(false);
    setRunResult({ node_count: 0, edge_count: 0 }); // graph updates externally
  }

  const TAB_STYLE = (active: boolean) => cn(
    "flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all duration-200 border-b-2 relative",
    active
      ? "text-[var(--text-primary)] border-[#b87333]"
      : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:border-[#b87333]/30",
  );

  return (
    <div className="flex flex-col gap-3 w-[42%] shrink-0 min-h-0">
      <div className="flex-1 rounded-2xl border overflow-hidden flex flex-col"
        style={{ borderColor: "rgba(184,115,51,0.2)", background: "rgba(6,4,2,0.7)" }}>

        {/* Tab bar */}
        <div className="flex shrink-0 border-b" style={{ borderColor: "rgba(184,115,51,0.12)", background: "rgba(184,115,51,0.03)" }}>
          <button className={TAB_STYLE(tab === "code")} onClick={() => setTab("code")}>
            <FileCode2 className="w-3.5 h-3.5" />
            Code
            {tab === "code" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#b87333] to-[#c9a84c]" />}
          </button>
          <button className={TAB_STYLE(tab === "cypher")} onClick={() => setTab("cypher")}>
            <Terminal className="w-3.5 h-3.5" />
            Cypher
            {tab === "cypher" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#4a8b6e] to-[#5ba87e]" />}
          </button>
          <div className="flex-1" />
          {/* Active indicator */}
          <div className="flex items-center pr-4">
            <span className="text-[8px] font-mono text-[var(--text-muted)]/30">
              {tab === "code" ? "AI → Cypher → Graph" : "Cypher → Graph"}
            </span>
          </div>
        </div>

        {/* ── CODE TAB ── */}
        {tab === "code" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Controls row */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 block">Language</label>
                <select value={lang} onChange={e => setLang(e.target.value)}
                  className="w-full font-mono text-xs rounded-xl px-3 py-2 text-[#e8d5b5] focus:outline-none"
                  style={{ background: "#0a0704", border: "1px solid rgba(184,115,51,0.2)" }}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 block">Label Prefix</label>
                <input value={prefix} onChange={e => setPrefix(e.target.value)}
                  className="w-full font-mono text-xs rounded-xl px-3 py-2 text-[#e8d5b5] focus:outline-none"
                  style={{ background: "#0a0704", border: "1px solid rgba(184,115,51,0.2)" }} />
              </div>
            </div>

            {/* Code textarea */}
            <div className="relative">
              <textarea
                value={code} onChange={e => setCode(e.target.value)}
                placeholder="Paste source code here…"
                rows={10}
                className="w-full font-mono text-xs leading-relaxed rounded-xl px-4 py-3 text-[#e8d5b5] placeholder-[#8a7b6a]/40 focus:outline-none resize-none"
                style={{ background: "#0a0704", border: "1px solid rgba(184,115,51,0.2)", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6)" }}
              />
              <div className="absolute inset-0 pointer-events-none rounded-xl opacity-[0.025]"
                style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)" }} />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={onPreview} disabled={analyzing || !code.trim()}
                className="h-8 text-[10px] font-bold bg-[#b87333]/12 border-[#b87333]/30 text-[#c9a84c] hover:bg-[#b87333]/22 flex items-center gap-1.5">
                {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                Preview
              </Button>
              <Button onClick={onImport} disabled={importing || !code.trim() || !memgraphOnline}
                className="h-8 text-[10px] font-bold bg-[#4a8b6e]/12 border-[#4a8b6e]/30 text-[#4a8b6e] hover:bg-[#4a8b6e]/22 flex items-center gap-1.5">
                {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Import → Graph
              </Button>
              <button onClick={() => setAutoImport(!autoImport)}
                className={cn("flex items-center gap-1.5 h-8 px-3 rounded-xl border text-[10px] font-bold transition-all",
                  autoImport ? "bg-[#4a8b6e]/15 border-[#4a8b6e]/40 text-[#4a8b6e]" : "bg-black/20 border-[#3e1b0d]/30 text-[var(--text-muted)]")}>
                <span className={cn("w-2 h-2 rounded-full border-2 flex items-center justify-center",
                  autoImport ? "border-[#4a8b6e]" : "border-[var(--text-muted)]/40")}>
                  {autoImport && <span className="w-1 h-1 rounded-full bg-[#4a8b6e]" />}
                </span>
                Auto
              </button>
            </div>

            {importResult && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                style={{ background: "rgba(74,139,110,0.08)", borderColor: "rgba(74,139,110,0.25)" }}>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4a8b6e]" />
                <span className="text-[10px] font-bold text-[#4a8b6e]">
                  {importResult.node_count} nodes · {importResult.edge_count} edges imported
                </span>
                {importResult.errors?.length > 0 && (
                  <Badge className="bg-red-900/20 border-red-500/25 text-red-400 text-[9px]">
                    {importResult.errors.length} err
                  </Badge>
                )}
              </div>
            )}

            {cypherAnnotation && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Cypher Annotation</span>
                  <button onClick={() => navigator.clipboard?.writeText(cypherAnnotation)}
                    className="flex items-center gap-1 text-[9px] font-bold text-[var(--text-muted)] hover:text-[#c9a84c] transition-colors">
                    <Copy className="w-2.5 h-2.5" /> Copy
                  </button>
                </div>
                <pre className="font-mono text-[9px] text-[#4a8b6e]/70 bg-[#040302] rounded-xl p-3 max-h-36 overflow-auto border border-[#4a8b6e]/12 whitespace-pre-wrap leading-relaxed">
                  {cypherAnnotation}
                </pre>
              </div>
            )}

            {preview && (
              <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--text-muted)]/60">
                <Activity className="w-3 h-3" />
                <span>{preview.node_count}n · {preview.edge_count}e · {preview.statements.length} stmts</span>
              </div>
            )}
          </div>
        )}

        {/* ── CYPHER TAB ── */}
        {tab === "cypher" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Quick query chips */}
            <div>
              <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 block">Quick Queries</label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CYPHERS.map(({ label, q }) => (
                  <button key={label} onClick={() => setCypher(q)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold transition-all border-[#4a8b6e]/20 text-[#4a8b6e]/60 hover:text-[#4a8b6e] hover:border-[#4a8b6e]/45 bg-black/20">
                    <Terminal className="w-2.5 h-2.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cypher textarea */}
            <div>
              <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 block">Cypher Query</label>
              <div className="relative">
                <textarea
                  value={cypher} onChange={e => setCypher(e.target.value)}
                  placeholder="MATCH (n) RETURN n LIMIT 50"
                  rows={10}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runCypher(); }}
                  className="w-full font-mono text-xs leading-relaxed rounded-xl px-4 py-3 text-[#e8d5b5] placeholder-[#8a7b6a]/40 focus:outline-none resize-none"
                  style={{ background: "#060402", border: "1px solid rgba(74,139,110,0.2)", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6)" }}
                />
                <div className="absolute inset-0 pointer-events-none rounded-xl opacity-[0.025]"
                  style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)" }} />
              </div>
              <div className="text-[8px] font-mono text-[var(--text-muted)]/30 mt-1">Ctrl+Enter to run</div>
            </div>

            {/* Run button */}
            <Button onClick={runCypher} disabled={running || !cypher.trim() || !memgraphOnline}
              className="w-full h-9 text-[10px] font-bold bg-[#4a8b6e]/15 border-[#4a8b6e]/35 text-[#4a8b6e] hover:bg-[#4a8b6e]/25 flex items-center justify-center gap-2">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? "Running…" : "Run → Render Graph"}
            </Button>

            {!memgraphOnline && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                style={{ background: "rgba(139,74,74,0.08)", borderColor: "rgba(139,74,74,0.25)" }}>
                <AlertTriangle className="w-3.5 h-3.5 text-[#8b4a4a]" />
                <span className="text-[10px] font-bold text-[#8b4a4a]">Memgraph offline</span>
              </div>
            )}

            {runResult !== null && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-[#4a8b6e]/60">
                <CheckCircle2 className="w-3 h-3" />
                Query complete — graph updated
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cypher Console ────────────────────────────────────────────────────────────

function CypherConsole({ onGraphRefresh }: { onGraphRefresh: (cypher: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cypher, setCypher] = useState("MATCH (n) RETURN n LIMIT 30");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GraphData | null>(null);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch(`${VECTOR_OPS}/v1/graph/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cypher, max_nodes: 100, max_edges: 200 }),
      });
      const data = await res.json();
      setResult(data);
      onGraphRefresh(cypher);
    } catch { /* ignore */ }
    setRunning(false);
  }

  const QUICK = [
    "MATCH (n) RETURN n LIMIT 50",
    "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 30",
    "MATCH (n:Function) RETURN n LIMIT 20",
    "MATCH (n:Class)-[r]->(m) RETURN n, r, m LIMIT 20",
  ];

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "rgba(74,139,110,0.2)", background: "rgba(4,8,6,0.8)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#4a8b6e]/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-[#4a8b6e]" />
          <span className="text-xs font-black text-[#4a8b6e] uppercase tracking-widest">Cypher Console</span>
          {result && (
            <Badge className="bg-[#4a8b6e]/10 border-[#4a8b6e]/25 text-[#4a8b6e] text-[9px]">
              {result.node_count}n {result.edge_count}e
            </Badge>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3 border-t" style={{ borderColor: "rgba(74,139,110,0.12)" }}>
          {/* Quick queries */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(q => (
              <button key={q} onClick={() => setCypher(q)}
                className="text-[9px] font-mono px-2.5 py-1 rounded-lg border border-[#4a8b6e]/20 text-[#4a8b6e]/60 hover:text-[#4a8b6e] hover:border-[#4a8b6e]/40 bg-black/20 transition-all truncate max-w-[200px]">
                {q.slice(0, 35)}…
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={cypher}
              onChange={e => setCypher(e.target.value)}
              rows={2}
              className="flex-1 font-mono text-xs rounded-xl px-4 py-2.5 text-[#e8d5b5] placeholder-[#8a7b6a]/40 focus:outline-none resize-none"
              style={{ background: "#060402", border: "1px solid rgba(74,139,110,0.2)", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)" }}
            />
            <Button onClick={run} disabled={running}
              className="h-full px-4 bg-[#4a8b6e]/15 border-[#4a8b6e]/30 text-[#4a8b6e] hover:bg-[#4a8b6e]/25">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </Button>
          </div>
          {result && (
            <div className="text-[10px] font-mono text-[#4a8b6e]/60">
              → {result.node_count} nodes, {result.edge_count} edges — displayed in graph above
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GraphPage() {
  // Status
  const [statuses, setStatuses] = useState<BackendStatus[]>([]);

  // Code analyzer state
  const [lang, setLang] = useState("typescript");
  const [prefix, setPrefix] = useState("Test");
  const [code, setCode] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [autoImport, setAutoImport] = useState(false);
  const [preview, setPreview] = useState<AnalysisResult | null>(null);
  const [importResult, setImportResult] = useState<AnalysisResult | null>(null);
  const [cypherAnnotation, setCypherAnnotation] = useState("");

  // Graph visualization state
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], node_count: 0, edge_count: 0 });
  const [graphLoading, setGraphLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState<string | null>(null);

  // Fetch statuses on mount
  useEffect(() => {
    fetch(`${VECTOR_OPS}/v1/backends/status`)
      .then(r => r.json())
      .then(setStatuses)
      .catch(() => {});
  }, []);

  // Fetch graph data
  const fetchGraph = useCallback(async (cypher?: string) => {
    setGraphLoading(true);
    try {
      const q = cypher ?? `MATCH (n) WHERE any(l IN labels(n) WHERE l STARTS WITH '${prefix}_') OPTIONAL MATCH (n)-[r]->(m) WHERE any(l IN labels(m) WHERE l STARTS WITH '${prefix}_') RETURN n, r, m LIMIT 200`;
      const res = await fetch(`${VECTOR_OPS}/v1/graph/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cypher: q, max_nodes: 200, max_edges: 400 }),
      });
      const data = await res.json();
      setGraphData(data);
      setSelectedId(null);
    } catch { /* ignore */ }
    setGraphLoading(false);
  }, [prefix]);

  // Build annotation header
  function buildHeader(stmts: CypherStatement[]) {
    const now = new Date().toISOString().split("T")[0];
    return [
      "/*",
      " * ┌──────────────────────────────────────────────────────┐",
      ` * │  CATEST · Code Structure Annotation                  │`,
      ` * │  Prefix: ${prefix.padEnd(12)} Language: ${lang.padEnd(15)}│`,
      ` * │  Date:   ${now.padEnd(43)}│`,
      " * └──────────────────────────────────────────────────────┘",
      " *",
      ...stmts.map(s => ` * ${s.cypher}`),
      " */",
    ].join("\n");
  }

  async function handlePreview() {
    if (!code.trim()) return;
    setAnalyzing(true); setPreview(null); setImportResult(null);
    try {
      const res = await fetch(`${VECTOR_OPS}/v1/code/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: lang, label_prefix: prefix }),
      });
      const data: AnalysisResult = await res.json();
      setPreview(data);
      setCypherAnnotation(buildHeader(data.statements));
      if (autoImport) await doImport();
    } catch { /* ignore */ }
    setAnalyzing(false);
  }

  async function doImport() {
    if (!code.trim()) return;
    setImporting(true);
    try {
      const res = await fetch(`${VECTOR_OPS}/v1/code/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: lang, label_prefix: prefix }),
      });
      const data: AnalysisResult = await res.json();
      setImportResult(data);
      if (!preview && data.statements?.length) setCypherAnnotation(buildHeader(data.statements));
      // Auto-refresh graph
      await fetchGraph();
    } catch { /* ignore */ }
    setImporting(false);
  }

  const [deleting, setDeleting] = useState(false);

  async function deleteDisplayed() {
    if (!graphData.nodes.length || !memgraphOnline) return;
    setDeleting(true);
    try {
      const ids = graphData.nodes.map(n => n.id);
      await fetch(`${VECTOR_OPS}/v1/graph/delete-nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_ids: ids }),
      });
      setGraphData({ nodes: [], edges: [], node_count: 0, edge_count: 0 });
      setSelectedId(null);
    } catch { /* ignore */ }
    setDeleting(false);
  }

  const memgraphOnline = statuses.find(s => s.backend === "memgraph")?.connected ?? false;
  const selectedNode = graphData.nodes.find(n => n.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">

      {/* ── Top: Status + title ── */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl border border-[#b87333]/20"
            style={{ background: "linear-gradient(135deg, rgba(184,115,51,0.12), rgba(0,0,0,0.4))" }}>
            <GitBranch className="w-4 h-4 text-[var(--text-brass)]" />
          </div>
          <div>
            <h1 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-widest">Graph Operations</h1>
            <p className="text-[9px] font-mono text-[var(--text-muted)]/50">AI code → Cypher · Memgraph · Force graph</p>
          </div>
        </div>
        <StatusBar statuses={statuses} />
      </div>

      {/* ── Main: two-column ── */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 480 }}>

        {/* ── LEFT: Input Panel (Code / Cypher tabs) ── */}
        <LeftInputPanel
          lang={lang} setLang={setLang}
          prefix={prefix} setPrefix={setPrefix}
          code={code} setCode={setCode}
          analyzing={analyzing} importing={importing}
          autoImport={autoImport} setAutoImport={setAutoImport}
          preview={preview} importResult={importResult}
          cypherAnnotation={cypherAnnotation}
          memgraphOnline={memgraphOnline}
          onPreview={handlePreview}
          onImport={doImport}
          onRunCypher={fetchGraph}
        />

        {/* ── RIGHT: Graph Visualization ── */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 min-w-0">
          <div className="flex-1 rounded-2xl border overflow-hidden flex flex-col"
            style={{ borderColor: "rgba(184,115,51,0.2)", background: "rgba(4,3,2,0.85)" }}>

            {/* Graph panel header */}
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0"
              style={{ borderColor: "rgba(184,115,51,0.12)", background: "rgba(184,115,51,0.04)" }}>
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-[var(--text-brass)]" />
                <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">Graph Visualization</span>
                {graphData.node_count > 0 && (
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="text-[#4a8b6e]"><Box className="w-3 h-3 inline mr-0.5" />{graphData.node_count}</span>
                    <span className="text-[#b87333]"><Link2 className="w-3 h-3 inline mr-0.5" />{graphData.edge_count}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Legend */}
                <div className="hidden lg:flex items-center gap-2 mr-2">
                  {Object.entries(KIND_COLORS).slice(0, 4).map(([k, c]) => (
                    <div key={k} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span className="text-[8px] font-mono" style={{ color: `${c}90` }}>{k}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => fetchGraph()}
                  disabled={graphLoading}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-xl border text-[9px] font-bold border-[#b87333]/20 bg-black/20 text-[var(--text-muted)] hover:text-[#c9a84c] hover:border-[#b87333]/40 transition-all">
                  {graphLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Refresh
                </button>
                <button
                  onClick={deleteDisplayed}
                  disabled={deleting || !graphData.nodes.length || !memgraphOnline}
                  title="Delete displayed nodes from Memgraph (permanent)"
                  className="flex items-center gap-1.5 h-7 px-3 rounded-xl border text-[9px] font-bold border-red-500/20 bg-black/20 text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Delete DB
                </button>
                <button onClick={() => setGraphData({ nodes: [], edges: [], node_count: 0, edge_count: 0 })}
                  className="h-7 px-3 rounded-xl border text-[9px] font-bold border-[#b87333]/20 bg-black/20 text-[var(--text-muted)] hover:text-amber-400/70 hover:border-amber-500/20 transition-all"
                  title="Clear canvas only (nodes stay in Memgraph)">
                  Clear
                </button>
              </div>
            </div>

            {/* Graph canvas */}
            <div className="flex-1 min-h-0 relative">
              <ForceGraphCanvas
                nodes={graphData.nodes}
                edges={graphData.edges}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {graphLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="flex items-center gap-3 text-[#4a8b6e]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs font-mono">Querying Memgraph…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Node detail + AI panel */}
            {(selectedNode || aiContext) && (
              <div className="shrink-0 border-t p-3 space-y-2"
                style={{ borderColor: "rgba(184,115,51,0.12)" }}>
                {selectedNode && (
                  <NodeDetail
                    node={selectedNode}
                    onClose={() => setSelectedId(null)}
                    onAskAI={ctx => setAiContext(ctx)}
                  />
                )}
                {aiContext && (
                  <AIChatPanel context={aiContext} onClose={() => setAiContext(null)} />
                )}
              </div>
            )}

            {/* Empty-state: load all nodes button */}
            {!graphData.node_count && !graphLoading && (
              <div className="shrink-0 border-t p-4 flex items-center justify-center gap-3"
                style={{ borderColor: "rgba(184,115,51,0.08)" }}>
                <button onClick={() => fetchGraph("MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#b87333]/25 bg-[#b87333]/08 text-[#c9a84c] text-[10px] font-bold hover:bg-[#b87333]/15 transition-all">
                  <Database className="w-3.5 h-3.5" />
                  Load All Nodes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom: Cypher Console ── */}
      <div className="shrink-0">
        <CypherConsole onGraphRefresh={fetchGraph} />
      </div>
    </div>
  );
}
