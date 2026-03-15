'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  FileCode2,
  LogOut,
  Bot,
  Plus,
  FolderOpen,
  FilePlus,
  Loader2,
  Upload,
  Zap,
  Monitor
} from 'lucide-react';
import { logout } from '../actions/auth';
import { runAgentReview } from '../actions/agent';
import { createWorkspace, getWorkspaceData, updateSegmentTranslation, confirmAndSyncWorkspace } from '../actions/workspace';
import Image from 'next/image';

type FileItem = {
  id: string;
  name: string;
  content?: string;
  status: string;
  errors?: number;
};

type CodeSegment = {
  id: string;
  file_id?: string;
  source: string;
  target: string;
  lineInfo: string;
  status: string; // 'pending', 'confirmed', 'synced'
  severity?: 'error' | 'warning' | 'info';
};

type RawFile = {
  id: string;
  path: string;
  status: string;
};

type RawSegment = {
  id: string;
  file_id: string;
  source_text: string;
  target_text?: string;
  status: string;
};

export default function ReviewDashboard() {
  const router = useRouter();
  const [userEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      const userData = localStorage.getItem('user');
      if (userData) {
        try {
          const parsed = JSON.parse(userData) as { email?: string };
          return parsed.email || '';
        } catch { return ''; }
      }
    }
    return '';
  });
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [segments, setSegments] = useState<CodeSegment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [execLogs, setExecLogs] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadWorkspace = async (wsId: string) => {
    const data = (await getWorkspaceData(wsId)) as { files: RawFile[]; segments: RawSegment[] };
    if (data && data.files) {
      setWorkspaceId(wsId);
      localStorage.setItem('active_workspace_id', wsId);
      
      const mappedFiles: FileItem[] = data.files.map((f: RawFile) => ({
        id: f.id,
        name: f.path,
        status: f.status
      }));
      setFiles(mappedFiles);

      // Load segments for the first file if none active
      if (mappedFiles.length > 0) {
        const firstFileId = mappedFiles[0].id;
        setActiveFileId(firstFileId);
        const fileSegments = data.segments
          .filter((s: RawSegment) => s.file_id === firstFileId)
          .map((s: RawSegment) => ({
            id: s.id,
            file_id: s.file_id,
            source: s.source_text,
            target: s.target_text || '',
            lineInfo: 'L', // Placeholder
            status: s.status,
            severity: 'info' as const
          }));
        
        // Recover line numbers
        const finalSegments = fileSegments.map((s, i) => ({
          ...s,
          lineInfo: `${i + 1}`
        }));

        setSegments(finalSegments);
        if (finalSegments.length > 0) setActiveSegmentId(finalSegments[0].id);
      }
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    // Try to load existing workspace from localStorage
    const savedWsId = localStorage.getItem('active_workspace_id');
    if (savedWsId) {
      // Use microtask to avoid "setState in effect" warning in strict configs
      queueMicrotask(() => {
        void loadWorkspace(savedWsId);
      });
    }
  }, [router]);

  const handleFiles = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    const filesToCreate: { path: string; content: string }[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        if (f.size > 2 * 1024 * 1024) continue; // Skip large files
        const content = await f.text();
        const webkitPath = (f as { webkitRelativePath?: string }).webkitRelativePath;
        const path = webkitPath || f.name;
        filesToCreate.push({
            path,
            content
        });
    }
    
    if (filesToCreate.length > 0) {
      const res = await createWorkspace(filesToCreate);
      if (res.success && res.workspaceId) {
        await loadWorkspace(res.workspaceId);
      }
    }
  };

  const selectFile = async (fileId: string) => {
    if (!workspaceId) return;
    setActiveFileId(fileId);
    
    const data = (await getWorkspaceData(workspaceId)) as { segments: RawSegment[] };
    const fileSegments = data.segments
      .filter((s: RawSegment) => s.file_id === fileId)
      .map((s: RawSegment) => ({
        id: s.id,
        file_id: s.file_id,
        source: s.source_text,
        target: s.target_text || '',
        lineInfo: 'L',
        status: s.status,
        severity: 'info' as const
      }));
    
    const finalSegments = fileSegments.map((s, i) => ({
      ...s,
      lineInfo: `${i + 1}`
    }));

    setSegments(finalSegments);
    if (finalSegments.length > 0) setActiveSegmentId(finalSegments[0].id);
  };

  const handleUpdateContent = async (segmentId: string, newTarget: string) => {
    if (!workspaceId) return;
    // Optimistic UI
    setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, target: newTarget, status: 'confirmed' } : s));
    await updateSegmentTranslation(workspaceId, segmentId, newTarget);
  };

  const handleSync = async () => {
    if (!workspaceId) return;
    setIsSyncing(true);
    const res = await confirmAndSyncWorkspace(workspaceId);
    if (res.success) {
      await loadWorkspace(workspaceId); // Refresh statuses
    }
    setIsSyncing(false);
  };

  const handleLogout = async () => {
    localStorage.removeItem('user');
    localStorage.removeItem('active_workspace_id');
    await logout();
    router.push('/login');
  };

  const activeSegment = segments.find(s => s.id === activeSegmentId);

  const handleAgentReview = async () => {
    if (!activeSegment) return;
    
    setIsAgentRunning(true);
    setExecLogs(['--- Starting LangGraph Agentic Review ---', 'Initializing Context...', `Reviewing line: ${activeSegment.lineInfo}`]);
    
    const res = await runAgentReview({
      query: "审查并给出优化建议",
      segmentSource: activeSegment.source,
      segmentTarget: activeSegment.target,
    });

    if (res.success && res.data) {
      setExecLogs(prev => [
        ...prev,
        `> Line Scan: ${activeSegment.lineInfo}`,
        `> Contextual Analysis Complete.`,
        '',
        '--- Agent Suggestion ---',
        res.data?.agentResponse || "Looks good.",
      ]);
    } else {
      setExecLogs(prev => [...prev, `[ERROR] Analysis failed: ${res.error}`]);
    }
    
    setIsAgentRunning(false);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-300 font-sans overflow-hidden">
      
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0 shadow-lg z-20">
        <div 
          onClick={() => router.push('/workspace')}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-all group relative"
          title="Back to Workspace"
        >
          <div className="relative">
            <Image src="/icon.png" alt="CATEST Logo" width={32} height={32} className="object-contain group-hover:scale-110 transition-transform relative z-10" />
            {/* Functional Integration: Pulse when background processes are active */}
            {(isSyncing || isAgentRunning) && (
              <div className="absolute inset-0 bg-indigo-500/60 blur-md rounded-full animate-ping z-0" />
            )}
            <div className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-slate-100 tracking-tighter text-lg leading-none">CATEST STUDIO</span>
            <span className="text-[10px] text-indigo-400 font-bold tracking-[0.2em] mt-1">CAT-POWERED CODE REVIEW</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            {['Review', 'Memory', 'Glossary'].map(tab => (
              <button key={tab} className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${tab === 'Review' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-600 hover:text-slate-400'}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-200 leading-none">{userEmail.split('@')[0]}</p>
              <p className="text-[9px] text-slate-500 font-mono mt-0.5">Professional Auditor</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Project Files */}
        <nav className="w-72 border-r border-slate-800 bg-slate-900/10 flex flex-col shrink-0">
          <div className="p-4 flex items-center justify-between border-b border-slate-800/50">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Project Files</h3>
            <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="group p-2 hover:bg-slate-800 rounded-lg transition-all" title="Add Files">
                    <FilePlus size={16} className="text-slate-500 group-hover:text-indigo-400" />
                </button>
                <button onClick={() => folderInputRef.current?.click()} className="group p-2 hover:bg-slate-800 rounded-lg transition-all" title="Add Project Folder">
                    <FolderOpen size={16} className="text-slate-500 group-hover:text-indigo-400" />
                </button>
            </div>
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
            <input type="file" multiple className="hidden" ref={folderInputRef} 
                // @ts-expect-error -- webkitdirectory
                webkitdirectory="true" directory="" onChange={(e) => handleFiles(e.target.files)} />
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
            {files.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-800/50 rounded-2xl opacity-40">
                    <Upload size={32} />
                    <p className="text-[11px] font-bold uppercase mt-4 tracking-widest">Workspace Empty</p>
                </div>
            )}
            {files.map(file => (
              <button
                key={file.id}
                onClick={() => selectFile(file.id)}
                className={`w-full group flex items-center gap-3 px-4 py-3 rounded-xl text-xs transition-all border ${
                  activeFileId === file.id 
                    ? 'bg-indigo-600/10 text-indigo-300 border-indigo-500/30 shadow-lg shadow-indigo-600/5' 
                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200 border-transparent'
                }`}
              >
                <FileCode2 size={16} className={activeFileId === file.id ? 'text-indigo-400' : 'text-slate-600'} />
                <div className="flex-1 text-left truncate font-mono text-[11px]">{file.name}</div>
                {file.status === 'confirmed' && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse ring-4 ring-green-500/10" />}
              </button>
            ))}
          </div>

          <div className="p-5 border-t border-slate-800/50 bg-slate-900/20">
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
                <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
                    <span>File Quality Score</span>
                    <span className="text-green-400">92%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-600 to-green-500" style={{ width: '92%' }} />
                </div>
            </div>
          </div>
        </nav>

        {/* Center: Professional CAT-Style Editor */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          {/* Status Overlay for Loading */}
          {segments.length === 0 && activeFileId && (
            <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <Loader2 size={48} className="text-indigo-500 animate-spin" />
                        <div className="absolute inset-0 blur-xl bg-indigo-500/20 animate-pulse"></div>
                    </div>
                    <p className="font-mono text-[10px] text-indigo-400 uppercase tracking-[0.5em] animate-pulse">Parsing Segments...</p>
                </div>
            </div>
          )}

          {/* Grid Header */}
          <div className="grid grid-cols-[3.5rem_1fr_1fr_4rem] border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 shadow-sm">
              <div className="p-3 text-[10px] font-black text-slate-600 text-center border-r border-slate-800">#</div>
              <div className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-6 border-r border-slate-800">Source Fragment (Original Code)</div>
              <div className="p-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-6 border-r border-slate-800">Target Segment (Review/Revision)</div>
              <div className="p-3 text-[10px] font-black text-slate-600 text-center uppercase">Status</div>
          </div>

          {/* Scrollable Grid Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {segments.map((seg, idx) => (
              <div 
                key={seg.id}
                onClick={() => setActiveSegmentId(seg.id)}
                className={`grid grid-cols-[3.5rem_1fr_1fr_4rem] min-h-[48px] border-b border-slate-800 group transition-all ${
                    activeSegmentId === seg.id ? 'bg-indigo-600/[0.03] ring-1 ring-inset ring-indigo-500/20' : 'hover:bg-slate-900/40'
                }`}
              >
                {/* ID Column */}
                <div className={`flex items-center justify-center border-r border-slate-800/50 text-[10px] font-mono ${activeSegmentId === seg.id ? 'text-indigo-400 font-bold' : 'text-slate-600'}`}>
                    {idx + 1}
                </div>
                
                {/* Source Fragment */}
                <div className="p-4 border-r border-slate-800/50 font-mono text-[12px] leading-relaxed text-slate-200 whitespace-pre overflow-hidden group-hover:text-slate-100 transition-colors text-wrap break-all">
                    {seg.source}
                </div>

                {/* Target Fragment */}
                <div className="p-0 border-r border-slate-800/50">
                    <textarea 
                        className="w-full h-full p-4 bg-transparent font-mono text-[12px] leading-relaxed text-indigo-300 placeholder:text-slate-800 focus:outline-none focus:bg-indigo-500/5 transition-all resize-none overflow-hidden"
                        placeholder="..."
                        defaultValue={seg.target}
                        onBlur={(e) => handleUpdateContent(seg.id, e.target.value)}
                    />
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-center gap-1.5">
                    {activeSegmentId === seg.id ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
                    ) : (
                        <div className={`w-1.5 h-1.5 rounded-full ${seg.status === 'confirmed' ? 'bg-green-500/50' : seg.status === 'synced' ? 'bg-indigo-500/50' : 'bg-slate-800'}`} />
                    )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer Bar */}
          <footer className="h-10 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between px-6 shrink-0 z-20">
             <div className="flex items-center gap-5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Project: <span className="text-slate-300">{workspaceId || 'None'}</span></span>
                <div className="h-3 w-px bg-slate-800" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Segs: <span className="text-slate-300">{segments.length}</span></span>
             </div>
             <div className="flex items-center gap-4">
                <span className="text-[9px] font-mono text-slate-600 uppercase">Auto-saved to Local SQLite</span>
                <button 
                  onClick={handleSync}
                  disabled={isSyncing || !workspaceId}
                  className="flex items-center gap-2 px-4 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md text-[10px] font-black uppercase tracking-widest transition-all">
                    {isSyncing ? <Loader2 size={10} className="animate-spin" /> : 'Apply Sync'}
                </button>
             </div>
          </footer>
        </main>

        {/* Right: AI Intelligence Panel */}
        <aside className="w-[420px] border-l border-slate-800 bg-slate-950 flex flex-col shrink-0">
          <div className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/20">
             <div className="flex items-center gap-2">
                <Bot size={18} className="text-indigo-400" />
                <h3 className="text-[11px] font-black text-slate-200 uppercase tracking-[0.2em]">Agent Audit</h3>
             </div>
             <button 
                onClick={handleAgentReview}
                disabled={!activeSegmentId || isAgentRunning}
                className="px-4 py-1.5 bg-indigo-600/10 border border-indigo-500/30 rounded-lg text-[10px] font-black text-indigo-400 uppercase tracking-[0.1em] hover:bg-indigo-500/20 transition-all disabled:opacity-20 flex items-center gap-2"
            >
                {isAgentRunning ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} fill="currentColor" />}
                Analyze Segment
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {!activeSegmentId ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                    <div className="p-8 rounded-full bg-slate-900 animate-pulse">
                        <Bot size={48} className="text-slate-800" />
                    </div>
                    <p className="text-[10px] uppercase font-bold text-slate-600 tracking-[0.3em]">Auditor Standby</p>
                </div>
            ) : (
                <>
                    {/* Focus Info */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Fragment</label>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 text-[9px] font-bold border border-indigo-500/20">L{activeSegment?.lineInfo}</span>
                        </div>
                        <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-5 font-mono text-[11px] text-slate-400 leading-relaxed shadow-inner">
                            {activeSegment?.source}
                        </div>
                    </div>

                    {/* AI Insights & Reasoning */}
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Monitor size={14} className="text-slate-600" /> Real-time Audit Log
                        </label>
                        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 font-mono text-[10px] h-[320px] overflow-y-auto space-y-3 shadow-xl">
                            {execLogs.length === 0 ? (
                                <div className="text-slate-700 italic border-l-2 border-slate-800 pl-3">Ready for segment analysis...</div>
                            ) : (
                                execLogs.map((log, i) => (
                                    <div key={i} className={`flex gap-3 ${log.includes('[ERROR]') ? 'text-red-400' : log.includes('---') ? 'text-indigo-500' : 'text-slate-500'}`}>
                                        <span className="text-slate-800 opacity-30 select-none">[{i+1}]</span>
                                        <div className="flex-1 whitespace-pre-wrap">{log}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3 pt-4">
                        <button className="flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all group">
                            <Plus size={14} className="text-slate-500 group-hover:text-indigo-400" />
                            <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-slate-200">Add Test</span>
                        </button>
                        <button className="flex items-center justify-center gap-2 py-3 bg-indigo-600/5 hover:bg-indigo-600/10 border border-indigo-500/20 rounded-xl transition-all group">
                             <CheckCircle2 size={14} className="text-indigo-400" />
                             <span className="text-[10px] font-black uppercase text-indigo-400">Approve</span>
                        </button>
                    </div>
                </>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
