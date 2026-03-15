'use client';

import { useState, useRef } from 'react';
import { createWorkspace, getWorkspaceData, updateSegmentTranslation, confirmAndSyncWorkspace } from '../actions/workspace';
import { Upload, CheckCircle2, FolderOpen, Loader2 } from 'lucide-react';
import Image from 'next/image';

type Segment = { id: string; source_text: string; target_text: string | null; status: string };

export default function WorkspacePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle local folder selection
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setLoading(true);

    const filesData: { path: string; content: string }[] = [];
    
    // Read all selected files
    for (const file of Array.from(e.target.files)) {
      // Basic filtering: skip massive files or binaries in MVP
      if (file.size > 1024 * 1024) continue; 
      const relativePath = (file as unknown as { webkitRelativePath: string }).webkitRelativePath || file.name;
      
      try {
        const content = await file.text();
        filesData.push({ path: relativePath, content });
      } catch {
        console.error('Failed to read file', relativePath);
      }
    }

    if (filesData.length > 0) {
      const { success, workspaceId: newWsId } = await createWorkspace(filesData);
      if (success && newWsId) {
        setWorkspaceId(newWsId);
        loadWorkspace(newWsId);
      }
    }
    setLoading(false);
  };

  const loadWorkspace = async (id: string) => {
    setLoading(true);
    const data = await getWorkspaceData(id);
    setSegments(data.segments as Segment[]);
    setLoading(false);
  };

  const syncWorkspace = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const res = await confirmAndSyncWorkspace(workspaceId);
    if (res.success) {
      alert(`Successfully synced ${res.count} segments to CATEST PostgreSQL Server!`);
      loadWorkspace(workspaceId); // Reload to show updated statuses
    } else {
      alert('Sync failed: ' + res.message);
    }
    setLoading(false);
  };

  const handleUpdateTranslation = async (id: string, targetValue: string) => {
    if (!workspaceId) return;
    // Optimistic update locally
    setSegments(prev => prev.map(s => s.id === id ? { ...s, target_text: targetValue, status: 'confirmed' } : s));
    // Persist to SQLite
    await updateSegmentTranslation(workspaceId, id, targetValue);
  };

  return (
    <div className="h-screen bg-slate-950 flex flex-col text-slate-200 overflow-hidden font-sans">
      
      {/* CATEST Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/icon.png" alt="CATEST" width={32} height={32} className="object-contain" />
          <span className="font-semibold tracking-wide">CATEST Workspace</span>
        </div>
        
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            // @ts-expect-error -- webkitdirectory is a valid non-standard attribute in modern browsers
            webkitdirectory="true" 
            directory=""
            multiple 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFolderSelect} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm transition-colors"
          >
            <FolderOpen size={16} />
            Import Folder to Local SQLite
          </button>
          
          <button 
            onClick={syncWorkspace}
            disabled={!workspaceId || loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Confirm & Sync to PostgreSQL
          </button>
        </div>
      </header>

      {/* Main CAT Workspace */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left: Source Text */}
        <div className="w-1/2 border-r border-slate-800 bg-slate-900/50 flex flex-col">
          <div className="p-3 bg-slate-900 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            Source Text (Original)
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {segments.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <FolderOpen size={48} className="mb-4 opacity-20" />
                <p>Import a folder to begin translation review.</p>
              </div>
            )}
            {segments.map((seg, idx) => (
              <div key={seg.id} className="p-3 bg-slate-900 border border-slate-800 rounded flex gap-4 hover:border-slate-700 transition-colors">
                <span className="text-slate-600 font-mono text-xs w-6">{idx + 1}</span>
                <span className="font-mono text-sm break-all text-slate-300">{seg.source_text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Target Translation */}
        <div className="w-1/2 bg-slate-950 flex flex-col">
          <div className="p-3 bg-slate-900 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Target Text (Review & Edit)</span>
            <span className="text-indigo-400 font-normal normal-case flex items-center gap-1">
              <CheckCircle2 size={14} /> Saved locally to SQLite
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {segments.map((seg, idx) => (
               <div key={seg.id} className="relative group">
                <textarea
                  defaultValue={seg.target_text || ''}
                  placeholder="Enter translation or review notes here..."
                  onBlur={(e) => {
                    if (e.target.value !== seg.target_text) {
                      handleUpdateTranslation(seg.id, e.target.value);
                    }
                  }}
                  className={`w-full p-3 pl-12 bg-slate-900 border rounded font-mono text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none min-h-[44px] overflow-hidden ${
                    seg.status === 'confirmed' ? 'border-green-500/30' : 
                    seg.status === 'synced' ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-800'
                  }`}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />
                
                {/* Status Indicator */}
                <div className="absolute left-3 top-3 text-slate-600">
                   {seg.status === 'confirmed' ? (
                     <CheckCircle2 size={16} className="text-green-400" />
                   ) : seg.status === 'synced' ? (
                     <Upload size={16} className="text-indigo-400" />
                   ) : (
                     <span className="text-xs font-mono">{idx + 1}</span>
                   )}
                </div>
               </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
