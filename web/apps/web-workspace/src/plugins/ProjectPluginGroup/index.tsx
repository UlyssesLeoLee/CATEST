"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button, cn } from "@catest/ui";
import {
  FolderPlus,
  FolderUp,
  FolderOpen,
  ExternalLink,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Database,
  Package,
  Archive,
  FileCode,
  File,
  X,
  Loader2,
  Download,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
} from "lucide-react";
import {
  importFolder,
  importFromCatestGroup,
  exportProject,
  listWorkspaceProjects,
  deleteProject,
  type ImportFileEntry,
  type ImportResult,
  type ProjectInfo,
} from "@/app/actions/import-folder";
import { isCodeFile, shouldSkip, detectLanguage } from "@/lib/segment-parser";
import { Upload, Share2 } from "lucide-react";

// ── Language color mapping ───────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6", javascript: "#f0db4f", python: "#3776ab",
  rust: "#dea584", go: "#00add8", java: "#b07219", csharp: "#178600",
  cpp: "#f34b7d", c: "#555555", ruby: "#cc342d", php: "#4f5d95",
  swift: "#f05138", kotlin: "#a97bff", sql: "#e38c00", json: "#292929",
  yaml: "#cb171e", html: "#e34c26", css: "#563d7c", shell: "#89e051",
  powershell: "#012456", markdown: "#083fa1",
};

function langColor(lang: string | null): string {
  return lang ? LANG_COLORS[lang] || "#b87333" : "#666";
}

// ── File tree ────────────────────────────────────────────────────────

interface TreeNode {
  name: string; path: string; isDir: boolean; language: string | null;
  size: number; children: TreeNode[]; included: boolean;
}

function buildTree(files: { path: string; size: number }[]): TreeNode {
  const root: TreeNode = { name: "root", path: "", isDir: true, language: null, size: 0, children: [], included: true };
  for (const file of files) {
    const parts = file.path.split(/[/\\]/);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      if (isLast) {
        const skip = shouldSkip(file.path);
        const isCode = isCodeFile(file.path);
        current.children.push({
          name: parts[i], path: file.path, isDir: false, language: detectLanguage(file.path),
          size: file.size, children: [], included: !skip && isCode,
        });
      } else {
        let dirNode = current.children.find((c) => c.isDir && c.name === parts[i]);
        if (!dirNode) {
          dirNode = { name: parts[i], path: parts.slice(0, i + 1).join("/"), isDir: true, language: null, size: 0, children: [], included: true };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }
  function sortTree(node: TreeNode) {
    node.children.sort((a, b) => { if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; return a.name.localeCompare(b.name); });
    node.children.forEach(sortTree);
  }
  sortTree(root);
  return root;
}

function countIncluded(node: TreeNode): number {
  if (!node.isDir) return node.included ? 1 : 0;
  return node.children.reduce((sum, c) => sum + countIncluded(c), 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Tree view ────────────────────────────────────────────────────────

function TreeView({ node, depth = 0, onToggle }: { node: TreeNode; depth?: number; onToggle: (path: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2);
  if (!node.isDir) {
    const lc = langColor(node.language);
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-0.5 px-2 rounded-md text-[11px] cursor-pointer transition-colors group",
          node.included ? "text-[var(--text-secondary)] hover:bg-[#b87333]/8" : "text-[var(--text-muted)]/40 line-through opacity-50"
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
        {childCount > 0 && <span className="text-[9px] text-[var(--text-muted)] font-normal ml-auto shrink-0">{childCount} files</span>}
      </div>
      {expanded && node.children.map((child) => <TreeView key={child.path} node={child} depth={depth + 1} onToggle={onToggle} />)}
    </div>
  );
}

// ── Import Modal ─────────────────────────────────────────────────────

function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [mode, setMode] = useState<"folder" | "catestgroup">("folder");
  const [step, setStep] = useState<"select" | "preview" | "importing" | "done">("select");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [rawFiles, setRawFiles] = useState<{ path: string; content: string; size: number }[]>([]);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // For .catestgroup import
  const [groupContent, setGroupContent] = useState<string>("");
  const [catestContents, setCatestContents] = useState<Record<string, string>>({});
  const [groupInfo, setGroupInfo] = useState<{ name: string; fileCount: number; segCount: number } | null>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setStep("select"); setMode("folder"); setProjectName(""); setDescription(""); setRawFiles([]); setTree(null); setResult(null); setGroupContent(""); setCatestContents({}); setGroupInfo(null); }
  }, [open]);

  const handleFilesSelected = useCallback(async (fileList: FileList) => {
    const entries: { path: string; content: string; size: number }[] = [];
    const promises: Promise<void>[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relativePath = (file as any).webkitRelativePath || file.name;
      if (file.size > 2 * 1024 * 1024) continue;
      if (shouldSkip(relativePath)) continue;
      promises.push(file.text().then((content) => { entries.push({ path: relativePath, content, size: file.size }); }));
    }
    await Promise.all(promises);
    setRawFiles(entries);
    const t = buildTree(entries.map((e) => ({ path: e.path, size: e.size })));
    setTree(t);
    if (t.children.length === 1 && t.children[0].isDir) setProjectName(t.children[0].name);
    else if (entries.length > 0) setProjectName(entries[0].path.split(/[/\\]/)[0] || "Imported Project");
    setStep("preview");
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.items) {
      const entries: { path: string; content: string; size: number }[] = [];
      async function readEntry(entry: FileSystemEntry, basePath: string): Promise<void> {
        if (entry.isFile) {
          const fe = entry as FileSystemFileEntry;
          return new Promise((resolve) => {
            fe.file(async (file) => {
              if (file.size <= 2 * 1024 * 1024) {
                const path = basePath + entry.name;
                if (!shouldSkip(path)) { const content = await file.text(); entries.push({ path, content, size: file.size }); }
              }
              resolve();
            });
          });
        } else if (entry.isDirectory) {
          const de = entry as FileSystemDirectoryEntry;
          const reader = de.createReader();
          return new Promise((resolve) => {
            reader.readEntries(async (subs) => { await Promise.all(subs.map((s) => readEntry(s, basePath + entry.name + "/"))); resolve(); });
          });
        }
      }
      const roots: Promise<void>[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const entry = e.dataTransfer.items[i].webkitGetAsEntry?.();
        if (entry) roots.push(readEntry(entry, ""));
      }
      await Promise.all(roots);
      if (entries.length > 0) {
        setRawFiles(entries);
        const t = buildTree(entries.map((e2) => ({ path: e2.path, size: e2.size })));
        setTree(t);
        if (t.children.length === 1 && t.children[0].isDir) setProjectName(t.children[0].name);
        setStep("preview");
      }
    }
  }, []);

  const handleToggleFile = useCallback((filePath: string) => {
    setTree((prev) => {
      if (!prev) return prev;
      const clone = JSON.parse(JSON.stringify(prev)) as TreeNode;
      function toggle(node: TreeNode) {
        if (!node.isDir && node.path === filePath) { node.included = !node.included; return; }
        node.children.forEach(toggle);
      }
      toggle(clone); return clone;
    });
  }, []);

  // Handle .catestgroup + .catest files selection
  const handleGroupFilesSelected = useCallback(async (fileList: FileList) => {
    let gContent = "";
    const cContents: Record<string, string> = {};
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const text = await file.text();
      if (file.name.endsWith(".catestgroup")) {
        gContent = text;
      } else if (file.name.endsWith(".catest")) {
        // Use the file name (without leading dir) as key; we'll match by basename
        cContents[file.name] = text;
      }
    }
    if (!gContent) return;
    setGroupContent(gContent);
    try {
      const parsed = JSON.parse(gContent);
      // Map .catest files by basename matching
      const mapped: Record<string, string> = {};
      for (const f of parsed.files || []) {
        const basename = f.catestPath.split("/").pop() || f.catestPath;
        // Try exact match first, then basename
        if (cContents[f.catestPath]) {
          mapped[f.catestPath] = cContents[f.catestPath];
        } else if (cContents[basename]) {
          mapped[f.catestPath] = cContents[basename];
        }
      }
      setCatestContents(mapped);
      setGroupInfo({
        name: parsed.project?.name || "Unknown",
        fileCount: parsed.files?.length || 0,
        segCount: parsed.stats?.totalSegments || 0,
      });
      setProjectName(parsed.project?.name || "Imported Project");
      setStep("preview");
    } catch {
      setGroupInfo(null);
    }
  }, []);

  const handleImport = useCallback(async () => {
    setStep("importing");

    if (mode === "catestgroup") {
      // Import from .catestgroup
      const res = await importFromCatestGroup(groupContent, catestContents);
      setResult(res); setStep("done");
      if (res.success) onImported();
      return;
    }

    // Import from folder
    if (!tree) return;
    const included: ImportFileEntry[] = [];
    function collect(node: TreeNode) {
      if (!node.isDir && node.included) {
        const raw = rawFiles.find((f) => f.path === node.path);
        if (raw) included.push({ path: raw.path, content: raw.content, sizeBytes: raw.size });
      }
      node.children.forEach(collect);
    }
    collect(tree);
    const res = await importFolder(projectName || "Untitled Project", description, included);
    setResult(res); setStep("done");
    if (res.success) onImported();
  }, [mode, tree, rawFiles, projectName, description, onImported, groupContent, catestContents]);

  const handleDownloadGroup = useCallback(() => {
    if (!result?.catestGroupContent) return;
    downloadFile(`${projectName || "project"}.catestgroup`, result.catestGroupContent, "application/json");
  }, [result, projectName]);

  const handleDownloadAll = useCallback(() => {
    if (!result?.catestFiles) return;
    for (const [path, content] of Object.entries(result.catestFiles)) {
      downloadFile(path, content, "text/tab-separated-values");
    }
  }, [result]);

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
              <h3 className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wider">Import Project</h3>
              <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                {step === "select" && (mode === "folder" ? "Select source code folder" : "Select .catestgroup files")}
                {step === "preview" && (mode === "folder" ? `${includedCount} code files ready` : `${groupInfo?.fileCount || 0} files from group`)}
                {step === "importing" && "Parsing segments..."}
                {step === "done" && (result?.success ? "Import complete" : "Import failed")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "select" && (
            <div className="space-y-4">
              {/* Mode tabs */}
              <div className="flex gap-1 p-1 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                <button
                  className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                    mode === "folder" ? "bg-[#b87333]/20 text-[#c9a84c] border border-[#b87333]/30" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  )}
                  onClick={() => setMode("folder")}
                ><FolderUp className="w-3.5 h-3.5" /> Source Folder</button>
                <button
                  className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                    mode === "catestgroup" ? "bg-[#b87333]/20 text-[#c9a84c] border border-[#b87333]/30" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  )}
                  onClick={() => setMode("catestgroup")}
                ><Share2 className="w-3.5 h-3.5" /> .catestgroup (Collab)</button>
              </div>

              {mode === "folder" ? (
                <div
                  className={cn(
                    "border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer",
                    dragOver ? "border-[#c9a84c] bg-[#c9a84c]/10" : "border-[#b87333]/30 hover:border-[#b87333]/50 hover:bg-[#b87333]/5"
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <FolderUp className="w-12 h-12 text-[#c9a84c] mx-auto mb-3 opacity-60" />
                  <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Drop a folder here, or click to browse</p>
                  <p className="text-[11px] text-[var(--text-muted)]">Code files will be parsed into .catest review segments</p>
                  <input ref={inputRef} type="file" className="hidden" {...{ webkitdirectory: "", directory: "" } as any} multiple onChange={(e) => e.target.files && handleFilesSelected(e.target.files)} />
                </div>
              ) : (
                <div
                  className="border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer border-[#b87333]/30 hover:border-[#b87333]/50 hover:bg-[#b87333]/5"
                  onClick={() => groupInputRef.current?.click()}
                >
                  <Share2 className="w-12 h-12 text-[#c9a84c] mx-auto mb-3 opacity-60" />
                  <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Select .catestgroup + .catest files</p>
                  <p className="text-[11px] text-[var(--text-muted)] mb-3">Import a shared project from a collaborator&apos;s export</p>
                  <p className="text-[10px] text-[var(--text-muted)]/60">Select the .catestgroup manifest and all accompanying .catest files together</p>
                  <input ref={groupInputRef} type="file" className="hidden" accept=".catestgroup,.catest" multiple onChange={(e) => e.target.files && handleGroupFilesSelected(e.target.files)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <div className="flex items-center gap-2 mb-1.5"><File className="w-3.5 h-3.5 text-[#c9a84c]" /><span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">.catest</span></div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Per-file review segments (TSV). Each code block becomes a reviewable segment.</p>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <div className="flex items-center gap-2 mb-1.5"><Archive className="w-3.5 h-3.5 text-[#c9a84c]" /><span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">.catestgroup</span></div>
                  <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Project manifest (JSON). Lists all .catest files with metadata and language stats.</p>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && mode === "folder" && tree && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Project Name</label>
                  <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="My Project"
                    className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional"
                    className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                <Badge className="bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20 text-[9px] px-1.5 py-0.5">{includedCount} included</Badge>
                <Badge className="bg-[#b87333]/10 text-[#b87333] border-[#b87333]/20 text-[9px] px-1.5 py-0.5">{rawFiles.length} total</Badge>
                <Badge className="bg-[#3e1b0d]/20 text-[var(--text-muted)] border-[#3e1b0d]/30 text-[9px] px-1.5 py-0.5">{rawFiles.length - includedCount} skipped</Badge>
                <span className="text-[9px] text-[var(--text-muted)] ml-auto">Click file to toggle</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto custom-scrollbar rounded-lg border border-[#3e1b0d]/30 bg-black/20 p-2">
                {tree.children.map((child) => <TreeView key={child.path} node={child} depth={0} onToggle={handleToggleFile} />)}
              </div>
            </div>
          )}

          {step === "preview" && mode === "catestgroup" && groupInfo && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-xl bg-[#b87333]/10 border border-[#b87333]/20 flex items-center justify-center">
                  <Share2 className="w-7 h-7 text-[#c9a84c]" />
                </div>
                <h4 className="text-base font-bold text-[var(--text-primary)]">{groupInfo.name}</h4>
                <p className="text-[11px] text-[var(--text-muted)]">Shared project ready for import</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{groupInfo.fileCount}</p>
                  <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Files</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{Object.keys(catestContents).length}</p>
                  <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Matched</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{groupInfo.segCount}</p>
                  <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Segments</p>
                </div>
              </div>
              {Object.keys(catestContents).length < groupInfo.fileCount && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#e67e22]/10 border border-[#e67e22]/20">
                  <AlertTriangle className="w-4 h-4 text-[#e67e22] shrink-0" />
                  <p className="text-[10px] text-[#e67e22] font-medium">
                    {groupInfo.fileCount - Object.keys(catestContents).length} .catest file(s) not found. Make sure you selected all files from the export.
                  </p>
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Project Name</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="My Project"
                  className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-[#c9a84c] animate-spin" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Parsing {includedCount} files into segments...</p>
              <p className="text-[11px] text-[var(--text-muted)]">Generating .catest files and project manifest</p>
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
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Files", value: result.stats?.totalFiles },
                      { label: "Segments", value: result.stats?.totalSegments },
                      { label: "Languages", value: Object.keys(result.stats?.languages || {}).length },
                    ].map((s) => (
                      <div key={s.label} className="text-center p-3 rounded-lg bg-black/30 border border-[#3e1b0d]/30">
                        <p className="text-2xl font-bold text-[var(--text-primary)]">{s.value}</p>
                        <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">{s.label}</p>
                      </div>
                    ))}
                  </div>
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
                  <div className="flex gap-3">
                    <Button variant="copper" className="flex-1" onClick={handleDownloadAll}><Download className="w-4 h-4 mr-2" />Download .catest Files</Button>
                    <Button variant="shabby" className="flex-1" onClick={handleDownloadGroup}><Archive className="w-4 h-4 mr-2" />Download .catestgroup</Button>
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

        {/* Footer */}
        {step === "preview" && (
          <div className="flex items-center gap-3 px-5 py-3 border-t border-[#b87333]/20 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setStep("select")}>← Back</Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            {mode === "folder" ? (
              <Button variant="copper" size="sm" onClick={handleImport} disabled={includedCount === 0 || !projectName.trim()}>
                <Package className="w-3.5 h-3.5 mr-1.5" />Import {includedCount} Files
              </Button>
            ) : (
              <Button variant="copper" size="sm" onClick={handleImport} disabled={Object.keys(catestContents).length === 0 || !projectName.trim()}>
                <Share2 className="w-3.5 h-3.5 mr-1.5" />Import {Object.keys(catestContents).length} Files
              </Button>
            )}
          </div>
        )}
        {step === "done" && (
          <div className="flex items-center justify-end px-5 py-3 border-t border-[#b87333]/20 shrink-0">
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Combined Plugin: Project List + Import ───────────────────────────

function ProjectListPlugin() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const list = await listWorkspaceProjects();
    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this project and all associated data?")) return;
    setDeleting(id);
    await deleteProject(id);
    await loadProjects();
    setDeleting(null);
  }, [loadProjects]);

  const handleExport = useCallback(async (project: ProjectInfo) => {
    setExporting(project.id);
    try {
      const res = await exportProject(project.id);
      if (res.success && res.catestGroupContent) {
        // Download .catestgroup
        downloadFile(`${project.name}.catestgroup`, res.catestGroupContent, "application/json");
        // Download all .catest files
        if (res.catestFiles) {
          for (const [path, content] of Object.entries(res.catestFiles)) {
            downloadFile(path.split("/").pop() || path, content, "text/tab-separated-values");
          }
        }
      }
    } catch { /* best effort */ }
    finally { setExporting(null); }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          <Database className="w-4 h-4" />
          Project Files
        </h3>
        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <span className="text-[10px] text-[var(--text-muted)] font-bold bg-black/40 px-2 py-0.5 rounded border border-[#3e1b0d]/40">
              {projects.length} PROJECTS
            </span>
          )}
          <Button variant="copper" size="sm" onClick={() => setImportOpen(true)}>
            <FolderUp className="w-3.5 h-3.5 mr-1.5" />
            Import Folder
          </Button>
        </div>
      </div>

      {/* Project list or empty state */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-[#c9a84c] animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        /* ─── Empty state: big import card ─── */
        <Card className="bg-[#b87333]/5 border-dashed border-[#b87333]/30 p-8 flex flex-col items-center text-center group hover:bg-[#b87333]/10 transition-all cursor-pointer"
          onClick={() => setImportOpen(true)}>
          <div className="w-16 h-16 rounded-full bg-[#b87333]/10 border border-[#b87333]/20 flex items-center justify-center text-[#c9a84c] mb-4 group-hover:scale-110 transition-transform">
            <FolderPlus className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Import Source Code Folder</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm">
            Select a folder to import. Code files will be parsed into segments and converted to .catest review files, just like a traditional CAT tool.
          </p>
          <Button variant="copper" className="px-8" onClick={() => setImportOpen(true)}>
            <Play className="w-4 h-4 mr-2" />
            Start Import
          </Button>
          <div className="mt-6 flex items-center gap-4 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#4a8b6e]" /> Auto-Parse</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#4a8b6e]" /> .catest Export</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#4a8b6e]" /> Segment DB</span>
          </div>
        </Card>
      ) : (
        /* ─── Project cards ─── */
        <div className="grid grid-cols-1 gap-3">
          {projects.map((p) => (
            <div key={p.id} className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#b87333]/15 to-[#c9a84c]/15 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur" />
              <div className="relative flex items-center justify-between rounded-xl border border-[#3e1b0d]/30 bg-black/40 hover:bg-[#b87333]/[0.04] px-5 py-4 transition-all">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0",
                    p.status === "active" ? "bg-[#4a8b6e]/10 border-[#4a8b6e]/20 text-[#4a8b6e]" : "bg-[#3e1b0d]/20 border-[#3e1b0d]/30 text-[var(--text-muted)]"
                  )}>
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[#c9a84c] transition-colors truncate">{p.name}</h4>
                    <div className="flex items-center gap-3 mt-0.5 text-[var(--text-muted)] font-medium">
                      {p.description && <span className="text-[10px] truncate max-w-[200px]">{p.description}</span>}
                      <span className="text-[10px] shrink-0"><Clock className="w-3 h-3 inline mr-1" />{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={cn("px-2 py-0.5 rounded-lg text-[9px] font-bold border",
                    p.status === "active" ? "bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20" : "bg-[#3e1b0d]/20 text-[var(--text-muted)] border-[#3e1b0d]/30"
                  )}>{p.status.toUpperCase()}</Badge>
                  <button onClick={() => handleExport(p)} disabled={exporting === p.id}
                    className="p-2 rounded-lg bg-black/40 border border-[#3e1b0d]/30 text-[var(--text-muted)] hover:text-[#c9a84c] hover:bg-[#c9a84c]/10 hover:border-[#c9a84c]/20 transition-colors"
                    title="Export &amp; share project">
                    {exporting === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                    className="p-2 rounded-lg bg-black/40 border border-[#3e1b0d]/30 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20 transition-colors"
                    title="Delete project">
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

// ── Export ────────────────────────────────────────────────────────────

export const ProjectPluginGroup: PluginGroup = {
  id: "workspace-projects",
  name: "Project Manager",
  plugins: [
    { id: "project-list", name: "Project List & Import", component: ProjectListPlugin as React.ComponentType<unknown> },
  ],
};
