"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { type PluginGroup } from "@catest/ui/plugins";
import { Badge, Button, cn } from "@catest/ui";
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
  AlertTriangle,
  Download,
  CheckCircle2,
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Upload,
  FolderOpen,
  FileCode,
  ChevronLeft,
  Search,
  FolderGit2,
  GitBranch,
  File,
} from "lucide-react";
import { analyzeCodeWithAI } from "@/app/actions/ai-review";
import { addToTM } from "@/app/actions/translation-memory";
import {
  listProjects,
  listSnapshots,
  listFiles,
  getFileContent,
  type ProjectSummary,
  type SnapshotSummary,
  type FileSummary,
} from "@/app/actions/project-files";

// ── Types ────────────────────────────────────────────────────────────
type SegmentStatus = "verified" | "review" | "draft" | "rejected";

interface Segment {
  id: number;
  source: string;
  target: string;
  remark: string;
  status: SegmentStatus;
  match: string;
}

const INITIAL_SEGMENTS: Segment[] = [
  { id: 1, source: 'export async function handleRequest(req: Request) {', target: 'export async function handleRequest(req: Request) {', remark: "Entry point verified against Security Policy v2.1.", status: "verified", match: "100% MB" },
  { id: 2, source: "  const session = await getSession(req);", target: "  const auth = await validateAuthorization(req);", remark: "Non-compliant with 'Auth-Standard-2026'. Termbase suggests using centralized validator.", status: "review", match: "92% TB" },
  { id: 3, source: "  if (!auth.isValid) return new Response('Unauthorized', { status: 401 });", target: "  if (!auth.isValid) return new Response('Unauthorized', { status: 401 });", remark: "Standard error guard. Complies with Global Exception Pattern.", status: "verified", match: "100% MB" },
  { id: 4, source: "  return processTask(auth.user);", target: "  return processSyncTask(auth.user, req.signal);", remark: "Proposed change: Add cancellation signal for better resource lifecycle management.", status: "draft", match: "Fuzzy" },
  { id: 5, source: "}", target: "}", remark: "", status: "verified", match: "Static" },
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

const STATUS_OPTIONS: { value: SegmentStatus; label: string; color: string; glow: string }[] = [
  { value: "verified", label: "Verified", color: "#4a8b6e", glow: "rgba(74,139,110,0.5)" },
  { value: "review",   label: "Review",   color: "#e67e22", glow: "rgba(230,126,34,0.5)" },
  { value: "draft",    label: "Draft",    color: "#3e1b0d", glow: "rgba(62,27,13,0.3)" },
  { value: "rejected", label: "Rejected", color: "#8b2500", glow: "rgba(139,37,0,0.5)" },
];

// ── Portal-based Overwrite Dialog ────────────────────────────────────
function OverwriteDialog({ open, onConfirm, onCancel }: {
  open: boolean;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}) {
  const [dontAsk, setDontAsk] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-sm border border-[#b87333]/30 shadow-2xl animate-in zoom-in-95 fade-in duration-200"
        style={{ background: "linear-gradient(180deg, #1a1108 0%, #0d0a04 100%)", boxShadow: "0 0 40px rgba(184,115,51,0.15), inset 0 1px 0 rgba(255,240,200,0.05)" }}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#b87333]/20">
          <div className="w-8 h-8 rounded-full bg-[#e67e22]/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-[#e67e22]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Overwrite COMMENT Column?</h3>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">The COMMENT column already contains data</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            AI analysis will replace the current content of the <strong className="text-[#c9a84c]">COMMENT</strong> column with AI-generated comments. This action cannot be undone.
          </p>
          <label className="flex items-center gap-3 mt-4 p-2.5 rounded-sm cursor-pointer hover:bg-[#b87333]/[0.04] transition-colors group">
            <div className="relative">
              <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="sr-only peer" />
              <div className="w-4 h-4 rounded-sm border-2 transition-all"
                style={{ borderColor: dontAsk ? "#c9a84c" : "rgba(62,27,13,0.5)", background: dontAsk ? "linear-gradient(135deg, rgba(201,168,76,0.2), rgba(184,115,51,0.1))" : "rgba(0,0,0,0.3)", boxShadow: dontAsk ? "inset 0 1px 2px rgba(0,0,0,0.3), 0 0 4px rgba(201,168,76,0.2)" : "inset 0 1px 3px rgba(0,0,0,0.5)" }}>
                {dontAsk && <Check className="w-3 h-3 text-[#c9a84c] absolute top-0 left-0" />}
              </div>
            </div>
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider group-hover:text-[var(--text-primary)] transition-colors">
              Don&apos;t ask again this session
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#3e1b0d]/30">
          <Button size="sm" variant="secondary" onClick={onCancel} className="px-5">Cancel</Button>
          <Button size="sm" variant="copper" onClick={() => onConfirm(dontAsk)} className="px-5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />Overwrite &amp; Analyze
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Status Dropdown (per-row) ────────────────────────────────────────
function StatusDropdown({ status, onChange, segId }: {
  status: SegmentStatus;
  onChange: (s: SegmentStatus) => void;
  segId: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[2];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex flex-col items-center justify-center gap-1.5 w-full h-full">
      <button
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center gap-1.5 py-2 px-1 rounded-sm hover:bg-[#b87333]/5 transition-colors w-full"
      >
        <div className="w-2.5 h-2.5 rounded-full transition-all" style={{ background: current.color, boxShadow: `0 0 8px ${current.glow}` }} />
        <span className="text-[8px] font-black uppercase tracking-tighter transition-colors" style={{ color: current.color }}>
          {current.label}
        </span>
        <ChevronDown className={cn("w-2.5 h-2.5 text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 z-[80] min-w-[110px] rounded-sm border border-[#3e1b0d]/40 shadow-2xl overflow-hidden"
          style={{ background: "linear-gradient(180deg, #1a1108, #0d0a04)", boxShadow: "0 8px 24px rgba(0,0,0,0.8)" }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-2 text-[10px] font-bold transition-colors flex items-center gap-2",
                status === opt.value ? "bg-[#b87333]/10" : "hover:bg-[#b87333]/5"
              )}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color, boxShadow: `0 0 6px ${opt.glow}` }} />
              <span style={{ color: opt.color }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project File Picker Modal ─────────────────────────────────────────
type PickerStep = "projects" | "snapshots" | "files";

function ProjectFilePicker({ open, onClose, onFileSelected }: {
  open: boolean;
  onFileSelected: (content: string, path: string, language: string | null) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<PickerStep>("projects");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Data
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);

  // Selection context
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotSummary | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Load projects when modal opens
  useEffect(() => {
    if (!open) return;
    setStep("projects");
    setSelectedProject(null);
    setSelectedSnapshot(null);
    setSearchQuery("");
    setError(null);
    setLoading(true);
    listProjects()
      .then((res) => {
        setProjects(res.projects);
        if (res.error) setError(res.error);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelectProject = useCallback(async (proj: ProjectSummary) => {
    setSelectedProject(proj);
    setStep("snapshots");
    setSearchQuery("");
    setError(null);
    setLoading(true);
    try {
      const res = await listSnapshots(proj.id);
      setSnapshots(res.snapshots);
      if (res.error) setError(res.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectSnapshot = useCallback(async (snap: SnapshotSummary) => {
    setSelectedSnapshot(snap);
    setStep("files");
    setSearchQuery("");
    setError(null);
    setLoading(true);
    try {
      const res = await listFiles(snap.id);
      setFiles(res.files);
      if (res.error) setError(res.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectFile = useCallback(async (file: FileSummary) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFileContent(file.id);
      if (res.file?.content_text) {
        onFileSelected(res.file.content_text, file.path, file.language);
        onClose();
      } else {
        setError(res.error || "No content available for this file");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onFileSelected, onClose]);

  const handleBack = useCallback(() => {
    setSearchQuery("");
    setError(null);
    if (step === "files") {
      setStep("snapshots");
      setSelectedSnapshot(null);
    } else if (step === "snapshots") {
      setStep("projects");
      setSelectedProject(null);
    }
  }, [step]);

  // Filter items by search query
  const filteredProjects = searchQuery
    ? projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : projects;
  const filteredSnapshots = searchQuery
    ? snapshots.filter((s) => s.commit_sha.includes(searchQuery) || (s.repo_git_url || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : snapshots;
  const filteredFiles = searchQuery
    ? files.filter((f) => f.path.toLowerCase().includes(searchQuery.toLowerCase()) || (f.language || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  if (!open || !mounted) return null;

  const breadcrumb = [
    "Projects",
    ...(selectedProject ? [selectedProject.name] : []),
    ...(selectedSnapshot ? [selectedSnapshot.commit_sha.slice(0, 8)] : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-2xl mx-4 rounded-sm border border-[#b87333]/30 shadow-2xl animate-in zoom-in-95 fade-in duration-200 flex flex-col"
        style={{ background: "linear-gradient(180deg, #1a1108 0%, #0d0a04 100%)", boxShadow: "0 0 40px rgba(184,115,51,0.15), inset 0 1px 0 rgba(255,240,200,0.05)", maxHeight: "70vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#b87333]/20 shrink-0">
          {step !== "projects" && (
            <button onClick={handleBack} className="w-7 h-7 rounded-sm flex items-center justify-center hover:bg-[#b87333]/10 transition-colors">
              <ChevronLeft className="w-4 h-4 text-[var(--text-brass)]" />
            </button>
          )}
          <div className="w-8 h-8 rounded-full bg-[#b87333]/10 flex items-center justify-center shrink-0">
            <FolderOpen className="w-4 h-4 text-[#b87333]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Select from Project Space</h3>
            <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] mt-0.5">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="w-2.5 h-2.5 shrink-0" />}
                  <span className={i === breadcrumb.length - 1 ? "text-[var(--text-brass)]" : ""}>{crumb}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-sm flex items-center justify-center hover:bg-[#b87333]/10 transition-colors">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-[#3e1b0d]/30 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={step === "projects" ? "Filter projects..." : step === "snapshots" ? "Filter snapshots..." : "Filter files by path or language..."}
              className="w-full pl-9 pr-3 py-2 bg-black/30 border border-[#3e1b0d]/40 rounded-sm text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40 transition-colors"
            />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#b87333] animate-spin" />
              <span className="ml-3 text-xs text-[var(--text-muted)]">Loading...</span>
            </div>
          ) : error && !projects.length && !snapshots.length && !files.length ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="w-6 h-6 text-[#e67e22]" />
              <p className="text-xs text-[#e67e22]">{error}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Check database connectivity and try again</p>
            </div>
          ) : step === "projects" ? (
            filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--text-muted)]">
                <FolderOpen className="w-8 h-8 opacity-30" />
                <p className="text-xs">No projects found</p>
                <p className="text-[10px] opacity-60">Import projects via Project Space first</p>
              </div>
            ) : (
              <div className="divide-y divide-[#3e1b0d]/20">
                {filteredProjects.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => handleSelectProject(proj)}
                    className="w-full text-left px-6 py-4 hover:bg-[#b87333]/[0.06] transition-colors group flex items-center gap-4"
                  >
                    <div className="w-9 h-9 rounded-sm bg-[#b87333]/[0.08] flex items-center justify-center shrink-0 group-hover:bg-[#b87333]/15 transition-colors">
                      <FolderGit2 className="w-4.5 h-4.5 text-[#b87333]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[#c9a84c] transition-colors">{proj.name}</div>
                      {proj.description && <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{proj.description}</div>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[9px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{proj.repo_count} repos</span>
                      <span className={cn("px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase",
                        proj.status === "active" ? "bg-[#4a8b6e]/10 text-[#4a8b6e]" : "bg-[#3e1b0d]/20 text-[var(--text-muted)]"
                      )}>{proj.status}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )
          ) : step === "snapshots" ? (
            filteredSnapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--text-muted)]">
                <GitBranch className="w-8 h-8 opacity-30" />
                <p className="text-xs">No ready snapshots</p>
                <p className="text-[10px] opacity-60">Run ingestion to create snapshots for this project</p>
              </div>
            ) : (
              <div className="divide-y divide-[#3e1b0d]/20">
                {filteredSnapshots.map((snap) => (
                  <button
                    key={snap.id}
                    onClick={() => handleSelectSnapshot(snap)}
                    className="w-full text-left px-6 py-4 hover:bg-[#b87333]/[0.06] transition-colors group flex items-center gap-4"
                  >
                    <div className="w-9 h-9 rounded-sm bg-[#4a8b6e]/[0.08] flex items-center justify-center shrink-0">
                      <GitBranch className="w-4.5 h-4.5 text-[#4a8b6e]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-bold text-[var(--text-primary)] group-hover:text-[#c9a84c] transition-colors">
                        {snap.commit_sha.slice(0, 12)}
                      </div>
                      {snap.repo_git_url && (
                        <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{snap.repo_git_url}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[9px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1"><File className="w-3 h-3" />{snap.file_count} files</span>
                      <span>{new Date(snap.created_at).toLocaleDateString()}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )
          ) : (
            filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-[var(--text-muted)]">
                <FileCode className="w-8 h-8 opacity-30" />
                <p className="text-xs">No files found</p>
              </div>
            ) : (
              <div className="divide-y divide-[#3e1b0d]/20">
                {filteredFiles.map((file) => {
                  const ext = file.path.split(".").pop() || "";
                  return (
                    <button
                      key={file.id}
                      onClick={() => handleSelectFile(file)}
                      className="w-full text-left px-6 py-3 hover:bg-[#b87333]/[0.06] transition-colors group flex items-center gap-3"
                    >
                      <FileCode className="w-4 h-4 text-[#c9a84c] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-mono text-[var(--text-primary)] truncate group-hover:text-[#c9a84c] transition-colors">{file.path}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[9px] text-[var(--text-muted)]">
                        {file.language && (
                          <span className="px-1.5 py-0.5 rounded-sm bg-[#b87333]/10 text-[#b87333] text-[8px] font-bold uppercase">{file.language}</span>
                        )}
                        <span>{(file.size_bytes / 1024).toFixed(1)}KB</span>
                      </div>
                      {loading ? (
                        <Loader2 className="w-3.5 h-3.5 text-[#b87333] animate-spin shrink-0" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#3e1b0d]/30 flex items-center justify-between text-[9px] text-[var(--text-muted)] shrink-0">
          <span>
            {step === "projects" && `${filteredProjects.length} project(s)`}
            {step === "snapshots" && `${filteredSnapshots.length} snapshot(s)`}
            {step === "files" && `${filteredFiles.length} file(s)`}
          </span>
          {error && <span className="text-[#e67e22]">{error}</span>}
          <span className="font-mono opacity-60">Project Space</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Export .catest — Source (left) + Comment (right) TSV ──────────────
function exportCatest(segments: Segment[], commentData: Record<number, string>, statusData: Record<number, SegmentStatus>, projectName: string) {
  const BOM = "\uFEFF";
  const header = `ID\tStatus\tSource Code\tComment`;
  const rows = segments.map((s) => `${s.id}\t${(statusData[s.id] ?? s.status).toUpperCase()}\t${s.source}\t${commentData[s.id] ?? ""}`);
  const summary = [``, `\t\tProject:\t${projectName}`, `\t\tDate:\t${new Date().toISOString()}`, `\t\tSegments:\t${segments.length}`, `\t\tGenerated by:\tCATEST Review Engine`];
  return BOM + [header, ...rows, ...summary].join("\n");
}

// ── Main Component ───────────────────────────────────────────────────
function ReviewEditorCombined() {
  const [commentLang, setCommentLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [activeSegId, setActiveSegId] = useState<number | null>(null);
  const skipOverwriteConfirm = useRef(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutable segment data
  const [commentData, setCommentData] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const seg of INITIAL_SEGMENTS) init[seg.id] = seg.target;
    return init;
  });
  const [statusData, setStatusData] = useState<Record<number, SegmentStatus>>(() => {
    const init: Record<number, SegmentStatus> = {};
    for (const seg of INITIAL_SEGMENTS) init[seg.id] = seg.status;
    return init;
  });

  const [isAiContent, setIsAiContent] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const selectedLang = LANGUAGES.find((l) => l.code === commentLang) || LANGUAGES[0];
  const segments = INITIAL_SEGMENTS;

  // Stats
  const statusCounts = {
    verified: Object.values(statusData).filter((s) => s === "verified").length,
    review: Object.values(statusData).filter((s) => s === "review").length,
    draft: Object.values(statusData).filter((s) => s === "draft").length,
    rejected: Object.values(statusData).filter((s) => s === "rejected").length,
  };

  // Close lang dropdown on outside click
  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  // ── Navigation helpers ──────────────────────────────────
  const focusSegment = useCallback((id: number) => {
    setActiveSegId(id);
    const ta = textareaRefs.current[id];
    if (ta) {
      ta.focus();
      ta.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  const getNextSegId = useCallback((currentId: number) => {
    const idx = segments.findIndex((s) => s.id === currentId);
    return idx < segments.length - 1 ? segments[idx + 1].id : null;
  }, [segments]);

  const getPrevSegId = useCallback((currentId: number) => {
    const idx = segments.findIndex((s) => s.id === currentId);
    return idx > 0 ? segments[idx - 1].id : null;
  }, [segments]);

  // ── Keyboard shortcuts (CAT-standard) ──────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeSegId) return;

      // Ctrl+Enter → Confirm (verified) + save to TM + move to next
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        setStatusData((prev) => ({ ...prev, [activeSegId]: "verified" }));
        // Auto-save source + comment pair to Translation Memory
        const seg = segments.find((s) => s.id === activeSegId);
        const comment = commentData[activeSegId];
        if (seg && comment?.trim()) {
          addToTM(seg.source, comment.trim()).catch(() => {/* silent */});
        }
        const next = getNextSegId(activeSegId);
        if (next) setTimeout(() => focusSegment(next), 50);
        return;
      }

      // Ctrl+Shift+Enter → Reject + move to next
      if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        setStatusData((prev) => ({ ...prev, [activeSegId]: "rejected" }));
        const next = getNextSegId(activeSegId);
        if (next) setTimeout(() => focusSegment(next), 50);
        return;
      }

      // Ctrl+↓ → Move to next segment
      if (e.ctrlKey && e.key === "ArrowDown") {
        e.preventDefault();
        const next = getNextSegId(activeSegId);
        if (next) focusSegment(next);
        return;
      }

      // Ctrl+↑ → Move to previous segment
      if (e.ctrlKey && e.key === "ArrowUp") {
        e.preventDefault();
        const prev = getPrevSegId(activeSegId);
        if (prev) focusSegment(prev);
        return;
      }

      // Escape → Deselect / blur
      if (e.key === "Escape") {
        e.preventDefault();
        setActiveSegId(null);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      // Ctrl+D → Toggle draft
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        setStatusData((prev) => ({
          ...prev,
          [activeSegId]: prev[activeSegId] === "draft" ? "review" : "draft",
        }));
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeSegId, getNextSegId, getPrevSegId, focusSegment, commentData, segments]);

  // ── AI Analysis ────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const lines = segments.map((s) => ({ id: s.id, source: s.source, target: s.target }));
      const result = await analyzeCodeWithAI(lines, commentLang);
      const newData: Record<number, string> = {};
      for (const c of result.comments) newData[c.lineId] = c.comment;
      setCommentData(newData);
      setIsAiContent(true);
      if (result.error) setAiError(result.error);
    } catch {
      setAiError("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [commentLang, segments]);

  const handleAnalyze = useCallback(() => {
    const hasExistingContent = Object.values(commentData).some((v) => v.trim().length > 0);
    if (hasExistingContent && !skipOverwriteConfirm.current) {
      setShowOverwriteDialog(true);
    } else {
      runAnalysis();
    }
  }, [commentData, runAnalysis]);

  const handleOverwriteConfirm = useCallback((dontAskAgain: boolean) => {
    if (dontAskAgain) skipOverwriteConfirm.current = true;
    setShowOverwriteDialog(false);
    runAnalysis();
  }, [runAnalysis]);

  const handleCommentChange = useCallback((segId: number, value: string) => {
    setCommentData((prev) => ({ ...prev, [segId]: value }));
  }, []);

  const handleStatusChange = useCallback((segId: number, value: SegmentStatus) => {
    setStatusData((prev) => ({ ...prev, [segId]: value }));
  }, []);

  // ── Batch actions ──────────────────────────────────────
  const handleAcceptAll = useCallback(() => {
    const updated: Record<number, SegmentStatus> = {};
    for (const seg of segments) updated[seg.id] = "verified";
    setStatusData(updated);
  }, [segments]);

  const handleRejectAll = useCallback(() => {
    const updated: Record<number, SegmentStatus> = {};
    for (const seg of segments) {
      updated[seg.id] = statusData[seg.id] === "verified" ? "verified" : "rejected";
    }
    setStatusData(updated);
  }, [segments, statusData]);

  // ── Export ─────────────────────────────────────────────
  const handleExport = useCallback(() => {
    setExporting(true);
    setTimeout(() => {
      const content = exportCatest(segments, commentData, statusData, "Auth-Logic-Review-2026");
      const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Auth-Logic-Review-2026.catest";
      a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
      setExported(true);
      setTimeout(() => setExported(false), 3000);
    }, 300);
  }, [commentData, statusData, segments]);

  // ── Import single file ────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;

      // Try to parse as TSV (.catest format) or plain text
      const lines = text.split("\n").filter((l) => l.trim());

      // Check if first line is a TSV header
      const firstLine = lines[0] ?? "";
      const isTsv = firstLine.includes("\t");

      if (isTsv) {
        // Parse TSV — look for Source Code and Comment columns
        const headers = firstLine.split("\t").map((h) => h.trim().replace(/^\uFEFF/, ""));
        const srcIdx = headers.findIndex((h) => /source/i.test(h));
        const commentIdx = headers.findIndex((h) => /comment|target/i.test(h));
        const statusIdx = headers.findIndex((h) => /status/i.test(h));

        const dataLines = lines.slice(1).filter((l) => l.split("\t").length >= 2 && !/^\t/.test(l.replace(/^\uFEFF/, "")));
        if (dataLines.length > 0) {
          const newComments: Record<number, string> = {};
          const newStatuses: Record<number, SegmentStatus> = {};

          dataLines.forEach((line, i) => {
            const cols = line.split("\t");
            const segId = i + 1;
            if (srcIdx >= 0 && commentIdx >= 0) {
              newComments[segId] = cols[commentIdx]?.trim() ?? "";
            } else {
              // Fallback: first col = source (ignored), second = comment
              newComments[segId] = cols[1]?.trim() ?? "";
            }
            if (statusIdx >= 0) {
              const st = cols[statusIdx]?.trim().toLowerCase();
              if (st === "verified" || st === "review" || st === "draft" || st === "rejected") {
                newStatuses[segId] = st;
              }
            }
          });
          setCommentData(newComments);
          if (Object.keys(newStatuses).length > 0) setStatusData((prev) => ({ ...prev, ...newStatuses }));
          setIsAiContent(false);
        }
      } else {
        // Plain text — each line becomes a comment for corresponding segment
        const newComments: Record<number, string> = {};
        lines.forEach((line, i) => {
          newComments[i + 1] = line.trim();
        });
        setCommentData(newComments);
        setIsAiContent(false);
      }
    };
    reader.readAsText(file, "utf-8");

    // Reset input so same file can be re-imported
    e.target.value = "";
  }, []);

  // ── Load file from Project Space ───────────────────────
  const handleProjectFileSelected = useCallback((content: string, path: string, language: string | null) => {
    const lines = content.split("\n");
    const newComments: Record<number, string> = {};
    const newStatuses: Record<number, SegmentStatus> = {};
    // Load each line as a segment comment (source code stays as-is in the grid)
    // For project files, we treat the file content as source code lines
    // and the comment column starts empty for review annotation
    lines.forEach((line, i) => {
      const segId = i + 1;
      newComments[segId] = ""; // Empty comment — ready for review
      newStatuses[segId] = "draft";
    });
    setCommentData(newComments);
    setStatusData(newStatuses);
    setIsAiContent(false);
    setActiveSegId(null);
  }, []);

  return (
    <div>
      <OverwriteDialog open={showOverwriteDialog} onConfirm={handleOverwriteConfirm} onCancel={() => setShowOverwriteDialog(false)} />
      <ProjectFilePicker open={projectPickerOpen} onClose={() => setProjectPickerOpen(false)} onFileSelected={handleProjectFileSelected} />

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="mb-4 glass-card rounded-sm border border-[rgba(184,115,51,0.15)] relative z-30 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 p-1.5 min-w-max">
          <Button size="sm" variant="copper" className="px-2 min-w-0 h-8 shrink-0" onClick={handleAcceptAll} title="Accept All">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] ml-1">All</span>
          </Button>
          <Button size="sm" variant="secondary" className="px-2 min-w-0 h-8 shrink-0" onClick={handleRejectAll} title="Reject Non-verified">
            <X className="w-3.5 h-3.5 shrink-0" />
          </Button>

          <div className="h-5 w-px bg-[#3e1b0d]/40 shrink-0" />

          {/* Language dropdown */}
          <div className="relative shrink-0" ref={langDropdownRef}>
            <button onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded-sm border border-[#b87333]/30 bg-black/30 hover:bg-[#b87333]/10 transition-colors text-[10px] font-bold text-[var(--text-brass)] h-8" title="Comment Language">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="max-w-[48px] truncate">{selectedLang.code.toUpperCase()}</span>
              <ChevronDown className={cn("w-2.5 h-2.5 shrink-0 transition-transform", langOpen && "rotate-180")} />
            </button>
            {langOpen && (
              <div className="absolute top-full right-0 mt-1 z-[100] min-w-[130px] rounded-sm border border-[#3e1b0d]/40 shadow-2xl overflow-hidden"
                style={{ background: "linear-gradient(180deg, #1a1108, #0d0a04)", boxShadow: "0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(184,115,51,0.15)" }}>
                {LANGUAGES.map((lang) => (
                  <button key={lang.code}
                    onClick={() => {
                      const changed = lang.code !== commentLang;
                      setCommentLang(lang.code);
                      setLangOpen(false);
                      if (changed && isAiContent) {
                        setTimeout(() => {
                          const lines = segments.map((s) => ({ id: s.id, source: s.source, target: s.target }));
                          setAnalyzing(true); setAiError(null);
                          analyzeCodeWithAI(lines, lang.code)
                            .then((result) => { const d: Record<number, string> = {}; for (const c of result.comments) d[c.lineId] = c.comment; setCommentData(d); if (result.error) setAiError(result.error); })
                            .catch(() => setAiError("Analysis failed"))
                            .finally(() => setAnalyzing(false));
                        }, 0);
                      }
                    }}
                    className={cn("w-full text-left px-3 py-2 text-[10px] font-bold transition-colors",
                      commentLang === lang.code ? "text-[#c9a84c] bg-[#b87333]/10" : "text-[var(--text-secondary)] hover:text-[#c9a84c] hover:bg-[#b87333]/5"
                    )}>{lang.label}</button>
                ))}
              </div>
            )}
          </div>

          <Button size="sm" variant="copper" className="px-2 min-w-0 h-8 shrink-0" onClick={handleAnalyze} disabled={analyzing} title="AI Analyze">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <Cpu className="w-3.5 h-3.5 shrink-0" />}
            <span className="text-[10px] ml-1">{analyzing ? "..." : isAiContent ? "Re-AI" : "AI"}</span>
          </Button>

          <div className="h-5 w-px bg-[#3e1b0d]/40 shrink-0" />

          <Button size="sm" variant="secondary" className="px-2 min-w-0 h-8 shrink-0" onClick={handleExport} disabled={exporting} title="Export .catest">
            {exporting ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : exported ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#4a8b6e]" /> : <Download className="w-3.5 h-3.5 shrink-0" />}
            <span className="text-[10px] ml-1">{exported ? "Done" : "EXP"}</span>
          </Button>

          {/* IMPORT button */}
          <input ref={fileInputRef} type="file" accept=".catest,.tsv,.txt,.csv,.xliff" className="hidden" onChange={handleImportFile} />
          <Button size="sm" variant="secondary" className="px-2 min-w-0 h-8 shrink-0" onClick={() => fileInputRef.current?.click()} title="Import File">
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] ml-1">IMP</span>
          </Button>

          {/* From Project Space button */}
          <Button size="sm" variant="secondary" className="px-2 min-w-0 h-8 shrink-0" onClick={() => setProjectPickerOpen(true)} title="Select from Project Space">
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] ml-1">Proj</span>
          </Button>

          {/* Spacer pushes shortcuts hint right */}
          <div className="flex-1 min-w-2" />

          {/* Keyboard shortcuts hint */}
          <div className="hidden xl:flex items-center gap-2 text-[8px] text-[var(--text-muted)] font-mono shrink-0">
            <span className="flex items-center gap-0.5"><kbd className="px-0.5 py-0.5 rounded border border-[#3e1b0d]/40 bg-black/30 text-[7px]">^↵</kbd><span className="text-[#4a8b6e]">OK</span></span>
            <span className="flex items-center gap-0.5"><kbd className="px-0.5 py-0.5 rounded border border-[#3e1b0d]/40 bg-black/30 text-[7px]">^↑↓</kbd>Nav</span>
            <span className="flex items-center gap-0.5"><kbd className="px-0.5 py-0.5 rounded border border-[#3e1b0d]/40 bg-black/30 text-[7px]">Esc</kbd>×</span>
          </div>
        </div>
      </div>

      {/* ── Editor Grid ──────────────────────────────────────── */}
      <div className="flex flex-col gap-px glass-card border border-[rgba(184,115,51,0.15)] rounded-sm overflow-visible shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[900px]">
            {/* Column Headers */}
            <div className="grid grid-cols-[50px_1fr_1fr_80px] px-4 py-3 border-b border-[#3e1b0d]/40 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]"
              style={{ background: "linear-gradient(180deg, rgba(26,17,8,0.9), rgba(13,10,4,0.95))" }}>
              <div className="flex items-center justify-center">ID</div>
              <div className="flex items-center gap-2 pl-4">
                <Code2 className="w-3.5 h-3.5" />Source Code
              </div>
              <div className="flex items-center gap-2 pl-4 border-l border-[#3e1b0d]/30">
                {isAiContent ? <Sparkles className="w-3.5 h-3.5 text-[#c9a84c]" /> : <MessageSquare className="w-3.5 h-3.5" />}
                <span>Comment</span>
                {isAiContent && <Badge className="bg-[#c9a84c]/10 text-[#c9a84c] border-[#c9a84c]/20 text-[8px] px-1 py-0 ml-1">AI · {selectedLang.label}</Badge>}
              </div>
              <div className="flex items-center justify-center border-l border-[#3e1b0d]/30">Status</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#3e1b0d]/20">
              {segments.map((seg) => {
                const isActive = activeSegId === seg.id;
                const segStatus = statusData[seg.id] ?? seg.status;
                const statusOpt = STATUS_OPTIONS.find((s) => s.value === segStatus) || STATUS_OPTIONS[2];

                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "grid grid-cols-[50px_1fr_1fr_80px] group transition-colors relative min-w-0",
                      isActive ? "bg-[#b87333]/[0.06]" : "hover:bg-[#b87333]/[0.03]"
                    )}
                    onClick={() => setActiveSegId(seg.id)}
                  >
                    {/* ID */}
                    <div className={cn(
                      "flex items-center justify-center text-[10px] font-mono font-bold bg-black/20 transition-colors",
                      isActive ? "text-[#c9a84c]" : "text-[var(--text-muted)] group-hover:text-[#c9a84c]"
                    )}>
                      {seg.id.toString().padStart(3, "0")}
                    </div>

                    {/* Source */}
                    <div className="p-4 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] border-l border-[#3e1b0d]/20 group-hover:text-[var(--text-primary)] transition-colors whitespace-pre-wrap break-all min-w-0 overflow-hidden">
                      {seg.source}
                    </div>

                    {/* COMMENT column */}
                    <div className="p-0 border-l border-[#3e1b0d]/20 flex flex-col min-w-0 overflow-hidden"
                      style={isAiContent ? { background: "rgba(201,168,76,0.02)" } : undefined}>
                      <textarea
                        ref={(el) => { textareaRefs.current[seg.id] = el; }}
                        value={commentData[seg.id] ?? ""}
                        onChange={(e) => handleCommentChange(seg.id, e.target.value)}
                        onFocus={() => setActiveSegId(seg.id)}
                        className={cn(
                          "flex-1 w-full bg-transparent p-4 text-[11px] leading-relaxed outline-none focus:bg-[#b87333]/5 transition-all resize-none min-h-[80px] break-all whitespace-pre-wrap",
                          isAiContent ? "font-sans text-[var(--text-secondary)]" : "font-mono text-[#e8d5b5]"
                        )}
                        spellCheck={false}
                      />
                      {!isAiContent && seg.remark && (
                        <div className="px-4 pb-3 -mt-2 text-[9px] text-[var(--text-muted)] italic flex items-center gap-1.5 font-medium min-w-0">
                          <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{seg.remark}</span>
                        </div>
                      )}
                    </div>

                    {/* Status — dropdown */}
                    <div className="border-l border-[#3e1b0d]/20 bg-black/10 min-w-[80px]">
                      <StatusDropdown
                        status={segStatus}
                        onChange={(v) => handleStatusChange(seg.id, v)}
                        segId={seg.id}
                      />
                      {seg.match && (
                        <div className="text-center text-[7px] font-mono italic text-[var(--text-muted)]/60 pb-1 -mt-1">
                          {seg.match}
                        </div>
                      )}
                    </div>

                    {/* Active segment indicator */}
                    <div className={cn(
                      "absolute inset-y-0 left-0 w-0.5 transition-opacity",
                      isActive ? "opacity-100 bg-[#c9a84c]" : "opacity-0 bg-[#c9a84c] group-focus-within:opacity-100"
                    )} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer with stats */}
        <div className="px-6 py-3 border-t border-[#3e1b0d]/30 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest"
          style={{ background: "linear-gradient(180deg, rgba(13,10,4,0.8), rgba(26,17,8,0.6))" }}>
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4a8b6e]" /> {statusCounts.verified} Verified
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#e67e22]" /> {statusCounts.review} Review
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3e1b0d]" /> {statusCounts.draft} Draft
            </span>
            {statusCounts.rejected > 0 && (
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8b2500]" /> {statusCounts.rejected} Rejected
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {aiError && <span className="text-[#e67e22] normal-case tracking-normal text-[9px]">{aiError}</span>}
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> {segments.length} Segments
            </span>
          </div>
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
