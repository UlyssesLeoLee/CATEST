"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button, cn } from "@catest/ui";
import {
  FolderUp,
  File,
  FileCode,
  FolderOpen,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  ChevronRight,
  ChevronDown,
  Trash2,
  Package,
  Archive,
} from "lucide-react";
import {
  importFolder,
  listWorkspaceProjects,
  deleteProject,
  type ImportFileEntry,
  type ImportResult,
  type ProjectInfo,
} from "@/app/actions/import-folder";
import { isCodeFile, shouldSkip, detectLanguage } from "@/lib/segment-parser";

// ── Language color mapping ───────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f0db4f",
  python: "#3776ab",
  rust: "#dea584",
  go: "#00add8",
  java: "#b07219",
  csharp: "#178600",
  cpp: "#f34b7d",
  c: "#555555",
  ruby: "#cc342d",
  php: "#4f5d95",
  swift: "#f05138",
  kotlin: "#a97bff",
  sql: "#e38c00",
  json: "#292929",
  yaml: "#cb171e",
  html: "#e34c26",
  css: "#563d7c",
  shell: "#89e051",
  powershell: "#012456",
  markdown: "#083fa1",
};

function langColor(lang: string | null): string {
  return lang ? LANG_COLORS[lang] || "#b87333" : "#666";
}

// ── File tree node structure ─────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  language: string | null;
  size: number;
  children: TreeNode[];
  included: boolean;
}

function buildTree(files: { path: string; size: number }[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", isDir: true, language: null, size: 0, children: [], included: true };

  for (const file of files) {
    const parts = file.path.split(/[/\\]/);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join("/");

      if (isLast) {
        const skip = shouldSkip(file.path);
        const isCode = isCodeFile(file.path);
        current.children.push({
          name: parts[i],
          path: file.path,
          isDir: false,
          language: detectLanguage(file.path),
          size: file.size,
          children: [],
          included: !skip && isCode,
        });
      } else {
        let dirNode = current.children.find((c) => c.isDir && c.name === parts[i]);
        if (!dirNode) {
          dirNode = { name: parts[i], path: partPath, isDir: true, language: null, size: 0, children: [], included: true };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  // Sort: dirs first, then by name
  function sortTree(node: TreeNode) {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  }
  sortTree(root);
  return root;
}

function countIncluded(node: TreeNode): number {
  if (!node.isDir) return node.included ? 1 : 0;
  return node.children.reduce((sum, c) => sum + countIncluded(c), 0);
}

// ── Tree view component ──────────────────────────────────────────────

function TreeView({
  node,
  depth = 0,
  onToggle,
}: {
  node: TreeNode;
  depth?: number;
  onToggle: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (!node.isDir) {
    const lc = langColor(node.language);
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-0.5 px-2 rounded-md text-[11px] cursor-pointer transition-colors group",
          node.included
            ? "text-[var(--text-secondary)] hover:bg-[#b87333]/8"
            : "text-[var(--text-muted)]/40 line-through opacity-50"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onToggle(node.path)}
        title={node.included ? "Click to exclude" : "Click to include"}
      >
        <FileCode className="w-3.5 h-3.5 shrink-0" style={{ color: lc }} />
        <span className="truncate flex-1">{node.name}</span>
        <span className="text-[9px] text-[var(--text-muted)] font-mono shrink-0">
          {node.language && <span className="px-1 py-0.5 rounded-sm mr-1" style={{ background: `${lc}20`, color: lc }}>{node.language}</span>}
          {formatBytes(node.size)}
        </span>
      </div>
    );
  }

  const childCount = countIncluded(node);
  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[11px] text-[var(--text-secondary)] hover:bg-[#b87333]/5 cursor-pointer font-semibold"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-3 h-3 shrink-0 text-[var(--text-muted)]" /> : <ChevronRight className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />}
        <FolderOpen className="w-3.5 h-3.5 text-[#c9a84c] shrink-0" />
        <span className="truncate">{node.name}</span>
        {childCount > 0 && (
          <span className="text-[9px] text-[var(--text-muted)] font-normal ml-auto shrink-0">{childCount} files</span>
        )}
      </div>
      {expanded && node.children.map((child) => (
        <TreeView key={child.path} node={child} depth={depth + 1} onToggle={onToggle} />
      ))}
    </div>
  );
}

// ── Import Modal ─────────────────────────────────────────────────────

function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"select" | "preview" | "importing" | "done">("select");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [rawFiles, setRawFiles] = useState<{ path: string; content: string; size: number }[]>([]);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("select");
      setProjectName("");
      setDescription("");
      setRawFiles([]);
      setTree(null);
      setResult(null);
    }
  }, [open]);

  // Handle folder selection via <input webkitdirectory>
  const handleFilesSelected = useCallback(async (fileList: FileList) => {
    const entries: { path: string; content: string; size: number }[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relativePath = (file as any).webkitRelativePath || file.name;

      // Skip binary / huge files
      if (file.size > 2 * 1024 * 1024) continue; // 2MB limit per file
      if (shouldSkip(relativePath)) continue;

      promises.push(
        file.text().then((content) => {
          entries.push({ path: relativePath, content, size: file.size });
        })
      );
    }

    await Promise.all(promises);
    setRawFiles(entries);

    // Build tree
    const t = buildTree(entries.map((e) => ({ path: e.path, size: e.size })));
    setTree(t);

    // Auto-detect project name from root folder
    if (t.children.length === 1 && t.children[0].isDir) {
      setProjectName(t.children[0].name);
    } else if (entries.length > 0) {
      const firstPart = entries[0].path.split(/[/\\]/)[0];
      setProjectName(firstPart || "Imported Project");
    }

    setStep("preview");
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    if (e.dataTransfer.items) {
      // Modern API: get file entries for directory support
      const entries: { path: string; content: string; size: number }[] = [];

      async function readEntry(entry: FileSystemEntry, basePath: string): Promise<void> {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          return new Promise((resolve) => {
            fileEntry.file(async (file) => {
              if (file.size <= 2 * 1024 * 1024) {
                const path = basePath + entry.name;
                if (!shouldSkip(path)) {
                  const content = await file.text();
                  entries.push({ path, content, size: file.size });
                }
              }
              resolve();
            });
          });
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          const reader = dirEntry.createReader();
          return new Promise((resolve) => {
            reader.readEntries(async (subEntries) => {
              await Promise.all(
                subEntries.map((sub) => readEntry(sub, basePath + entry.name + "/"))
              );
              resolve();
            });
          });
        }
      }

      const rootEntries: Promise<void>[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const entry = e.dataTransfer.items[i].webkitGetAsEntry?.();
        if (entry) rootEntries.push(readEntry(entry, ""));
      }
      await Promise.all(rootEntries);

      if (entries.length > 0) {
        setRawFiles(entries);
        const t = buildTree(entries.map((e2) => ({ path: e2.path, size: e2.size })));
        setTree(t);
        if (t.children.length === 1 && t.children[0].isDir) {
          setProjectName(t.children[0].name);
        }
        setStep("preview");
      }
    }
  }, []);

  const handleToggleFile = useCallback((filePath: string) => {
    setTree((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev)) as TreeNode;
      function toggle(node: TreeNode) {
        if (!node.isDir && node.path === filePath) {
          node.included = !node.included;
          return;
        }
        node.children.forEach(toggle);
      }
      toggle(clone);
      return clone;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!tree) return;
    setStep("importing");

    // Collect included files
    const included: ImportFileEntry[] = [];
    function collect(node: TreeNode) {
      if (!node.isDir && node.included) {
        const raw = rawFiles.find((f) => f.path === node.path);
        if (raw) {
          included.push({ path: raw.path, content: raw.content, sizeBytes: raw.size });
        }
      }
      node.children.forEach(collect);
    }
    collect(tree);

    const res = await importFolder(
      projectName || "Untitled Project",
      description,
      included
    );
    setResult(res);
    setStep("done");
    if (res.success) onImported();
  }, [tree, rawFiles, projectName, description, onImported]);

  const handleDownload = useCallback(() => {
    if (!result?.catestGroupContent || !result?.catestFiles) return;

    // Download .catestgroup
    downloadFile(`${projectName || "project"}.catestgroup`, result.catestGroupContent, "application/json");

    // Download each .catest file
    for (const [path, content] of Object.entries(result.catestFiles)) {
      downloadFile(path, content, "text/tab-separated-values");
    }
  }, [result, projectName]);

  const handleDownloadZip = useCallback(async () => {
    if (!result?.catestGroupContent || !result?.catestFiles) return;

    // Create a single combined download manifest
    const manifest = {
      group: JSON.parse(result.catestGroupContent),
      files: result.catestFiles,
    };
    downloadFile(
      `${projectName || "project"}.catestgroup`,
      result.catestGroupContent,
      "application/json"
    );
  }, [result, projectName]);

  if (!open) return null;

  const includedCount = tree ? countIncluded(tree) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-2xl shadow-2xl shadow-black/60 w-[90vw] max-w-[720px] max-h-[85vh] flex flex-col overflow-hidden border border-[#b87333]/30">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#b87333]/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#b87333]/10 border border-[#b87333]/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-[#c9a84c]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Import Folder</h3>
              <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                {step === "select" && "Select folder to import"}
                {step === "preview" && `${includedCount} files ready`}
                {step === "importing" && "Processing..."}
                {step === "done" && (result?.success ? "Import complete" : "Import failed")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "select" && (
            <div className="space-y-4">
              {/* Drag & drop zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer",
                  dragOver
                    ? "border-[#c9a84c] bg-[#c9a84c]/10"
                    : "border-[#b87333]/30 hover:border-[#b87333]/50 hover:bg-[#b87333]/5"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                <FolderUp className="w-12 h-12 text-[#c9a84c] mx-auto mb-3 opacity-60" />
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Drop a folder here, or click to browse
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Code files will be parsed into .catest review segments
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  {...{ webkitdirectory: "", directory: "" } as any}
                  multiple
                  onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                />
              </div>

              {/* Format info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <File className="w-3.5 h-3.5 text-[#c9a84c]" />
                    <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">.catest</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                    Per-file review segments (TSV). Each code block becomes a reviewable segment with source & comment columns.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Archive className="w-3.5 h-3.5 text-[#c9a84c]" />
                    <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">.catestgroup</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                    Project manifest (JSON). Lists all .catest files with metadata, stats, and language breakdown.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && tree && (
            <div className="space-y-4">
              {/* Project info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Project"
                    className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60"
                  />
                </div>
              </div>

              {/* Stats bar */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                <Badge className="bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20 text-[9px] px-1.5 py-0.5">
                  {includedCount} files
                </Badge>
                <Badge className="bg-[#b87333]/10 text-[#b87333] border-[#b87333]/20 text-[9px] px-1.5 py-0.5">
                  {rawFiles.length} total
                </Badge>
                <Badge className="bg-[#3e1b0d]/20 text-[var(--text-muted)] border-[#3e1b0d]/30 text-[9px] px-1.5 py-0.5">
                  {rawFiles.length - includedCount} skipped
                </Badge>
                <span className="text-[9px] text-[var(--text-muted)] ml-auto">Click file to toggle include/exclude</span>
              </div>

              {/* File tree */}
              <div className="max-h-[40vh] overflow-y-auto custom-scrollbar rounded-lg border border-[#3e1b0d]/30 bg-black/20 p-2">
                {tree.children.map((child) => (
                  <TreeView key={child.path} node={child} depth={0} onToggle={handleToggleFile} />
                ))}
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-[#c9a84c] animate-spin" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Parsing {includedCount} files into segments...</p>
              <p className="text-[11px] text-[var(--text-muted)]">Creating .catest files and project manifest</p>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-4">
              {result.success ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-6">
                    <CheckCircle2 className="w-12 h-12 text-[#4a8b6e]" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Import Successful!</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{result.stats?.totalFiles}</p>
                      <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Files</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{result.stats?.totalSegments}</p>
                      <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Segments</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                      <p className="text-2xl font-bold text-[var(--text-primary)]">
                        {Object.keys(result.stats?.languages || {}).length}
                      </p>
                      <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Languages</p>
                    </div>
                  </div>

                  {/* Language breakdown */}
                  {result.stats?.languages && (
                    <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-lg bg-black/20 border border-[#3e1b0d]/20">
                      {Object.entries(result.stats.languages).map(([lang, count]) => (
                        <span key={lang} className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm border"
                          style={{ color: langColor(lang), borderColor: `${langColor(lang)}30`, background: `${langColor(lang)}10` }}>
                          {lang}: {count}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Download */}
                  <div className="flex gap-3">
                    <Button variant="copper" className="flex-1" onClick={handleDownload}>
                      <Download className="w-4 h-4 mr-2" />
                      Download .catest Files
                    </Button>
                    <Button variant="shabby" className="flex-1" onClick={handleDownloadZip}>
                      <Archive className="w-4 h-4 mr-2" />
                      Download .catestgroup
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6">
                  <AlertTriangle className="w-12 h-12 text-[#e67e22]" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">Import Failed</p>
                  <p className="text-[11px] text-[var(--text-muted)] text-center max-w-sm">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {step === "preview" && (
          <div className="flex items-center gap-3 px-5 py-3 border-t border-[#b87333]/20 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setStep("select")}>
              ← Back
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="copper"
              size="sm"
              onClick={handleImport}
              disabled={includedCount === 0 || !projectName.trim()}
            >
              <Package className="w-3.5 h-3.5 mr-1.5" />
              Import {includedCount} Files
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="flex items-center justify-end px-5 py-3 border-t border-[#b87333]/20 shrink-0">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Utility ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Project List Plugin ──────────────────────────────────────────────

function ProjectListWithImport() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const list = await listWorkspaceProjects();
    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this project and all associated files?")) return;
    setDeleting(id);
    await deleteProject(id);
    await loadProjects();
    setDeleting(null);
  }, [loadProjects]);

  return (
    <div className="space-y-4">
      {/* Header with Import button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          <Package className="w-4 h-4" />
          Project Files
        </h3>
        <Button variant="copper" size="sm" onClick={() => setImportOpen(true)}>
          <FolderUp className="w-3.5 h-3.5 mr-1.5" />
          Import Folder
        </Button>
      </div>

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-[#c9a84c] animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <Card className="bg-[#b87333]/5 border-dashed border-[#b87333]/30 p-8 flex flex-col items-center text-center">
          <FolderOpen className="w-12 h-12 text-[#c9a84c] opacity-40 mb-3" />
          <p className="text-sm font-bold text-[var(--text-primary)] mb-1">No projects yet</p>
          <p className="text-[11px] text-[var(--text-muted)] mb-4">
            Import a folder to create your first .catest project
          </p>
          <Button variant="copper" size="sm" onClick={() => setImportOpen(true)}>
            <FolderUp className="w-3.5 h-3.5 mr-1.5" />
            Import Folder
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {projects.map((p) => (
            <div key={p.id} className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#b87333]/15 to-[#c9a84c]/15 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur" />
              <div className="relative flex items-center justify-between rounded-xl border border-[#3e1b0d]/30 bg-black/40 hover:bg-[#b87333]/[0.04] px-5 py-4 transition-all">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0",
                    p.status === "active"
                      ? "bg-[#4a8b6e]/10 border-[#4a8b6e]/20 text-[#4a8b6e]"
                      : "bg-[#3e1b0d]/20 border-[#3e1b0d]/30 text-[var(--text-muted)]"
                  )}>
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[#c9a84c] transition-colors truncate">
                      {p.name}
                    </h4>
                    <div className="flex items-center gap-3 mt-0.5 text-[var(--text-muted)] font-medium">
                      {p.description && (
                        <span className="text-[10px] truncate max-w-[200px]">{p.description}</span>
                      )}
                      <span className="text-[10px] shrink-0">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn(
                    "px-2 py-0.5 rounded-lg text-[9px] font-bold border",
                    p.status === "active"
                      ? "bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20"
                      : "bg-[#3e1b0d]/20 text-[var(--text-muted)] border-[#3e1b0d]/30"
                  )}>
                    {p.status.toUpperCase()}
                  </Badge>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={deleting === p.id}
                    className="p-2 rounded-lg bg-black/40 border border-[#3e1b0d]/30 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20 transition-colors"
                    title="Delete project"
                  >
                    {deleting === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={loadProjects} />
    </div>
  );
}

// ── Plugin Group Export ──────────────────────────────────────────────

export const ImportPluginGroup: PluginGroup = {
  id: "workspace-import",
  name: "Folder Import",
  plugins: [
    {
      id: "project-list-import",
      name: "Project Files & Import",
      component: ProjectListWithImport as React.ComponentType<unknown>,
    },
  ],
};
