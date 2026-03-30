"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, Button, Badge, cn, VictorianDivider } from "@catest/ui";
import {
  BookMarked, Plus, Trash2, Search, Download, Upload, Edit3, Save, X,
  Database, RefreshCw, Loader2, ChevronDown, ArrowRight, Check,
  AlertTriangle, History, Ban, Tag, FileText,
} from "lucide-react";
import {
  listBanks, createBank, updateBank, deleteBank,
  getEntries, addEntry, updateEntry, deleteEntry, bulkDeleteEntries,
  exportTBX, exportCSV, importCSV, importTBX, getImportHistory,
  type TBBank, type TBEntry,
} from "@/app/actions/tb-actions";
import { getCurrentRole } from "@/lib/permissions";

export default function TBPage() {
  const [role, setRole] = useState<"admin" | "user" | "viewer" | "guest">("guest");
  const [banks, setBanks] = useState<TBBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<TBBank | null>(null);
  const [entries, setEntries] = useState<TBEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TBEntry | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Bank form
  const [newBankName, setNewBankName] = useState("");
  const [newBankDesc, setNewBankDesc] = useState("");

  // Entry form
  const [newSource, setNewSource] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newDef, setNewDef] = useState("");
  const [newPos, setNewPos] = useState("");
  const [newForbidden, setNewForbidden] = useState(false);
  const [newNote, setNewNote] = useState("");

  // Edit form
  const [editSource, setEditSource] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editDef, setEditDef] = useState("");
  const [editForbidden, setEditForbidden] = useState(false);

  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = role === "admin";
  const isEditor = role === "admin" || role === "user";
  const PAGE_SIZE = 50;

  useEffect(() => { getCurrentRole().then(setRole); }, []);

  const loadBanks = useCallback(async () => {
    const b = await listBanks();
    setBanks(b);
    if (b.length > 0 && !selectedBank) setSelectedBank(b[0]);
  }, [selectedBank]);

  const loadEntries = useCallback(async () => {
    if (!selectedBank) return;
    setLoading(true);
    const res = await getEntries(selectedBank.id, PAGE_SIZE, page * PAGE_SIZE, search || undefined);
    setEntries(res.entries);
    setTotal(res.total);
    setSelected(new Set());
    setLoading(false);
  }, [selectedBank, page, search]);

  useEffect(() => { loadBanks(); }, [loadBanks]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreateBank = async () => {
    if (!newBankName.trim()) return;
    setBusy(true);
    const res = await createBank(newBankName, newBankDesc);
    setBusy(false);
    if (res.success) { flash("success", "Bank created"); setShowAddBank(false); setNewBankName(""); setNewBankDesc(""); loadBanks(); }
    else flash("error", res.error || "Failed");
  };

  const handleDeleteBank = async (id: string) => {
    if (!confirm("Delete this bank and ALL entries?")) return;
    const res = await deleteBank(id);
    if (res.success) { flash("success", "Bank deleted"); if (selectedBank?.id === id) setSelectedBank(null); loadBanks(); }
    else flash("error", res.error || "Failed");
  };

  const handleAddEntry = async () => {
    if (!selectedBank || !newSource.trim() || !newTarget.trim()) return;
    setBusy(true);
    const res = await addEntry(selectedBank.id, newSource.trim(), newTarget.trim(), {
      definition: newDef.trim() || undefined, domain: newDomain.trim() || undefined,
      pos: newPos.trim() || undefined, forbidden: newForbidden, note: newNote.trim() || undefined,
    });
    setBusy(false);
    if (res.success) {
      flash("success", "Term added");
      setShowAddEntry(false); setNewSource(""); setNewTarget(""); setNewDomain(""); setNewDef(""); setNewPos(""); setNewForbidden(false); setNewNote("");
      loadEntries(); loadBanks();
    } else flash("error", res.error || "Failed");
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;
    setBusy(true);
    const res = await updateEntry(editingEntry.id, {
      source_term: editSource, target_term: editTarget, domain: editDomain, definition: editDef, forbidden: editForbidden,
    });
    setBusy(false);
    if (res.success) { flash("success", "Term updated"); setEditingEntry(null); loadEntries(); }
    else flash("error", res.error || "Failed");
  };

  const handleDeleteEntry = async (id: string) => {
    const res = await deleteEntry(id);
    if (res.success) { loadEntries(); loadBanks(); }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} terms?`)) return;
    const res = await bulkDeleteEntries([...selected]);
    if (res.success) { flash("success", `Deleted ${res.deleted} terms`); loadEntries(); loadBanks(); }
  };

  const handleExportTBX = async () => {
    if (!selectedBank) return;
    const res = await exportTBX(selectedBank.id);
    if (res.success && res.tbx) {
      const blob = new Blob([res.tbx], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${res.bankName || "tb"}.tbx`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportCSV = async () => {
    if (!selectedBank) return;
    const res = await exportCSV(selectedBank.id);
    if (res.success && res.csv) {
      const blob = new Blob([res.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${res.bankName || "tb"}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBank) return;
    setBusy(true);
    const content = await file.text();
    const isTbx = file.name.endsWith(".tbx");
    const res = isTbx
      ? await importTBX(selectedBank.id, content, file.name)
      : await importCSV(selectedBank.id, content, file.name);
    setBusy(false);
    if (res.success) { flash("success", `Imported ${res.imported}, skipped ${res.skipped}`); setShowImport(false); loadEntries(); loadBanks(); }
    else flash("error", res.error || "Import failed");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleShowHistory = async () => {
    if (!selectedBank) return;
    const h = await getImportHistory(selectedBank.id);
    setImportHistory(h);
    setShowHistory(true);
  };

  const startEdit = (entry: TBEntry) => {
    setEditingEntry(entry);
    setEditSource(entry.source_term);
    setEditTarget(entry.target_term);
    setEditDomain(entry.domain || "");
    setEditDef(entry.definition || "");
    setEditForbidden(entry.forbidden);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map(e => e.id)));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-[var(--section-gap)] animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header */}
      <section className="app-page-header flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#c9a84c]/10 text-[var(--text-brass)] border-[#c9a84c]/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
              Terminology Base
            </Badge>
            <div className="w-1 h-1 rounded-full bg-[#b87333]/30" />
            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">TBX ISO 30042 Compatible</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <BookMarked className="w-6 h-6 text-[var(--text-brass)]" />
            Terminology Base
          </h1>
          <p className="text-[var(--text-secondary)] text-sm font-medium max-w-xl">
            Manage term banks and entries. Import/export in TBX or CSV format. Enforce naming conventions.
          </p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <Button variant="secondary" onClick={() => setShowAddBank(true)}>
              <Plus className="w-4 h-4 mr-2" />New Bank
            </Button>
          )}
        </div>
      </section>

      {/* Toast */}
      {message && (
        <div className={cn(
          "fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-bold animate-in slide-in-from-right-4 duration-300",
          message.type === "success" ? "bg-[#4a8b6e]/90 text-white" : "bg-[#8b2500]/90 text-white"
        )}>
          {message.type === "success" ? <Check className="w-4 h-4 inline mr-2" /> : <AlertTriangle className="w-4 h-4 inline mr-2" />}
          {message.text}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-[calc(2rem*var(--phi-inv))]">
        {/* Left: Bank List */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Database className="w-4 h-4 text-[var(--text-brass)]" />
            TB Banks
          </h2>
          <VictorianDivider />
          <div className="space-y-2">
            {banks.map(b => (
              <Card key={b.id} variant="glass"
                className={cn("p-3 cursor-pointer transition-all group", selectedBank?.id === b.id && "ring-1 ring-[#c9a84c]/40")}
                onClick={() => { setSelectedBank(b); setPage(0); }}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{b.name}</h4>
                    {b.description && <p className="text-[9px] text-[var(--text-muted)] truncate">{b.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="bg-[#b87333]/10 text-[var(--text-muted)] border-[#b87333]/20 text-[8px] px-1.5 py-0">{b.entry_count}</Badge>
                    {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteBank(b.id); }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#8b2500]/20 text-[var(--text-muted)] hover:text-[#8b2500] transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-1.5 text-[8px] text-[var(--text-muted)]">
                  <span>{b.source_lang} → {b.target_lang}</span>
                </div>
              </Card>
            ))}
            {banks.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No TB banks yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Entry Table */}
        <div className="space-y-4">
          {selectedBank ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">{selectedBank.name}</h2>
                  <Badge className="text-[9px]">{total} terms</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search terms..."
                      className="bg-black/30 border border-[#3e1b0d]/30 rounded-sm pl-7 pr-2.5 py-1.5 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[#b87333]/40 w-48" />
                  </div>
                  <Button size="sm" variant="secondary" onClick={loadEntries}><RefreshCw className="w-3 h-3" /></Button>
                  <Button size="sm" variant="secondary" onClick={handleExportTBX}><Download className="w-3 h-3 mr-1" />TBX</Button>
                  <Button size="sm" variant="secondary" onClick={handleExportCSV}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}><Upload className="w-3 h-3 mr-1" />Import</Button>
                      <Button size="sm" variant="secondary" onClick={handleShowHistory}><History className="w-3 h-3" /></Button>
                    </>
                  )}
                  {isEditor && (
                    <Button size="sm" onClick={() => setShowAddEntry(true)}><Plus className="w-3 h-3 mr-1" />Add</Button>
                  )}
                </div>
              </div>

              {/* Bulk actions */}
              {isAdmin && selected.size > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-sm bg-[#8b2500]/10 border border-[#8b2500]/20">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)]">{selected.size} selected</span>
                  <Button size="sm" variant="secondary" className="!text-[#8b2500]" onClick={handleBulkDelete}>
                    <Trash2 className="w-3 h-3 mr-1" />Delete Selected
                  </Button>
                </div>
              )}

              {/* Entry list */}
              {loading ? (
                <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /><span className="text-xs">Loading...</span>
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-16">
                  <BookMarked className="w-10 h-10 text-[var(--text-muted)]/20 mx-auto mb-3" />
                  <p className="text-xs text-[var(--text-muted)]">{search ? "No matches" : "No terms yet"}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Select all */}
                  {isAdmin && (
                    <div className="flex items-center gap-2 px-1">
                      <input type="checkbox" checked={selected.size === entries.length && entries.length > 0} onChange={toggleAll} className="accent-[#c9a84c]" />
                      <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase">Select All</span>
                    </div>
                  )}

                  {entries.map(e => (
                    <div key={e.id} className={cn(
                      "p-3 rounded-sm border transition-colors group",
                      e.forbidden ? "border-[#8b2500]/20 hover:border-[#8b2500]/40" : "border-[#3e1b0d]/20 hover:border-[#b87333]/20"
                    )} style={{ background: e.forbidden ? "rgba(139,37,0,0.04)" : "linear-gradient(135deg, rgba(14,11,8,0.8), rgba(10,8,5,0.9))" }}>
                      {editingEntry?.id === e.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editSource} onChange={ev => setEditSource(ev.target.value)} placeholder="Source"
                              className="bg-black/30 border border-[#c9a84c]/30 rounded px-2 py-1.5 text-[10px] text-[var(--text-primary)] outline-none" />
                            <input value={editTarget} onChange={ev => setEditTarget(ev.target.value)} placeholder="Target"
                              className="bg-black/30 border border-[#c9a84c]/30 rounded px-2 py-1.5 text-[10px] text-[#c9a84c] outline-none" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editDomain} onChange={ev => setEditDomain(ev.target.value)} placeholder="Domain"
                              className="bg-black/30 border border-[#c9a84c]/30 rounded px-2 py-1.5 text-[10px] text-[var(--text-muted)] outline-none" />
                            <label className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                              <input type="checkbox" checked={editForbidden} onChange={ev => setEditForbidden(ev.target.checked)} className="accent-[#8b2500]" />
                              <Ban className="w-3 h-3" /> Forbidden
                            </label>
                          </div>
                          <input value={editDef} onChange={ev => setEditDef(ev.target.value)} placeholder="Definition"
                            className="w-full bg-black/30 border border-[#c9a84c]/30 rounded px-2 py-1.5 text-[10px] text-[var(--text-muted)] outline-none" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdateEntry} disabled={busy}><Save className="w-3 h-3 mr-1" />Save</Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingEntry(null)}><X className="w-3 h-3 mr-1" />Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {isAdmin && <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="accent-[#c9a84c] shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("text-[11px] font-bold", e.forbidden ? "text-[#8b2500] line-through" : "text-[var(--text-primary)]")}>{e.source_term}</span>
                              <ArrowRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                              <span className={cn("text-[11px] font-bold", e.forbidden ? "text-[#8b2500] line-through" : "text-[#c9a84c]")}>{e.target_term}</span>
                              {e.forbidden && <Ban className="w-3 h-3 text-[#8b2500] shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {e.domain && <Badge className="bg-[#b87333]/10 text-[var(--text-muted)] border-[#b87333]/20 text-[7px] px-1 py-0">{e.domain}</Badge>}
                              {e.pos && <Badge className="bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20 text-[7px] px-1 py-0">{e.pos}</Badge>}
                              {e.definition && <span className="text-[9px] text-[var(--text-muted)] italic truncate max-w-xs">{e.definition}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isAdmin && <button onClick={() => startEdit(e)} className="p-1 rounded hover:bg-[#c9a84c]/20 text-[var(--text-muted)] hover:text-[#c9a84c]"><Edit3 className="w-3 h-3" /></button>}
                            {isAdmin && <button onClick={() => handleDeleteEntry(e.id)} className="p-1 rounded hover:bg-[#8b2500]/20 text-[var(--text-muted)] hover:text-[#8b2500]"><Trash2 className="w-3 h-3" /></button>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <span className="text-[10px] text-[var(--text-muted)]">{page + 1} / {totalPages}</span>
                  <Button size="sm" variant="secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-24">
              <BookMarked className="w-12 h-12 text-[var(--text-muted)]/20 mx-auto mb-3" />
              <p className="text-sm text-[var(--text-muted)]">Select a TB bank to manage terms</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Bank Modal ─────────────────────────── */}
      {showAddBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddBank(false)} />
          <div className="relative glass-panel rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">New TB Bank</h3>
            <div className="space-y-3">
              <input value={newBankName} onChange={e => setNewBankName(e.target.value)} placeholder="Bank name"
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
              <input value={newBankDesc} onChange={e => setNewBankDesc(e.target.value)} placeholder="Description (optional)"
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
              <VictorianDivider />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowAddBank(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleCreateBank} disabled={busy || !newBankName.trim()}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Entry Modal ───────────────────────────── */}
      {showAddEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddEntry(false)} />
          <div className="relative glass-panel rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">Add Term</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Source Term</label>
                  <input value={newSource} onChange={e => setNewSource(e.target.value)}
                    className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">Target Term</label>
                  <input value={newTarget} onChange={e => setNewTarget(e.target.value)}
                    className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#c9a84c] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Domain"
                  className="bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
                <input value={newPos} onChange={e => setNewPos(e.target.value)} placeholder="POS (noun, verb...)"
                  className="bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
                <label className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--text-muted)]">
                  <input type="checkbox" checked={newForbidden} onChange={e => setNewForbidden(e.target.checked)} className="accent-[#8b2500]" />
                  <Ban className="w-3.5 h-3.5" /> Forbidden
                </label>
              </div>
              <input value={newDef} onChange={e => setNewDef(e.target.value)} placeholder="Definition"
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
              <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note (optional)"
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60" />
              <VictorianDivider />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowAddEntry(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleAddEntry} disabled={busy || !newSource.trim() || !newTarget.trim()}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}Add Term
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ──────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowImport(false)} />
          <div className="relative glass-panel rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">Import to {selectedBank?.name}</h3>
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Supported: <strong>.tbx</strong> (TBX ISO 30042) or <strong>.csv</strong> (source_term, target_term, domain, definition, pos, forbidden, note)
              </p>
              <div className="border-2 border-dashed border-[#b87333]/30 rounded-xl p-8 text-center hover:border-[#c9a84c]/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-8 h-8 text-[var(--text-brass)] mx-auto mb-3" />
                <p className="text-xs text-[var(--text-secondary)] font-bold">Click to select file</p>
                <p className="text-[9px] text-[var(--text-muted)] mt-1">.tbx or .csv</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".tbx,.csv,.tsv,.txt" className="hidden" onChange={handleImportFile} />
              {busy && (
                <div className="flex items-center justify-center gap-2 text-[var(--text-brass)]">
                  <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs font-bold">Importing...</span>
                </div>
              )}
              <Button variant="secondary" className="w-full" onClick={() => setShowImport(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import History Modal ──────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative glass-panel rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wider mb-4">Import History</h3>
            <div className="space-y-2 max-h-80 overflow-auto">
              {importHistory.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-4">No import history</p>
              ) : importHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-sm border border-[#3e1b0d]/20 text-xs">
                  <div>
                    <span className="font-bold text-[var(--text-primary)]">{h.file_name}</span>
                    <Badge className="ml-2 text-[8px]">{h.format.toUpperCase()}</Badge>
                  </div>
                  <div className="text-right text-[var(--text-muted)]">
                    <div>+{h.imported_count} imported, {h.skipped_count} skipped</div>
                    <div className="text-[9px]">{new Date(h.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="w-full mt-4" onClick={() => setShowHistory(false)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}
