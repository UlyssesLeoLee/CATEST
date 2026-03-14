'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code2,
  Play,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  Terminal,
  LogOut,
  ChevronRight,
  MessageSquareDiff,
  Bot
} from 'lucide-react';
import { logout } from '../actions/auth';
import { runAgentReview } from '../actions/agent';

// Mock Data for the MVP
const MOCK_FILES = [
  { id: '1', name: 'auth.service.ts', status: 'pending', errors: 2 },
  { id: '2', name: 'user.controller.ts', status: 'passed', errors: 0 },
  { id: '3', name: 'database.config.ts', status: 'pending', errors: 1 },
];

const MOCK_SEGMENTS = [
  {
    id: 's1',
    lineInfo: 'L12-L18',
    content: 'async function verifyToken(token: string) {\n  const decoded = jwt.decode(token);\n  // Missing signature verification!\n  return decoded;\n}',
    severity: 'error',
    message: 'JWT token decoded without signature verification. Use jwt.verify() instead.'
  },
  {
    id: 's2',
    lineInfo: 'L45-L50',
    content: 'function hashPassword(password: string) {\n  return crypto.createHash("md5").update(password).digest("hex");\n}',
    severity: 'warning',
    message: 'MD5 is deprecated and insecure for password hashing. Use bcrypt or argon2.'
  }
];

export default function ReviewDashboard() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [activeFile, setActiveFile] = useState(MOCK_FILES[0].id);
  const [activeSegment, setActiveSegment] = useState(MOCK_SEGMENTS[0].id);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [execLogs, setExecLogs] = useState<string[]>([]);

  useEffect(() => {
    // Basic Auth Check — read email once on mount, no further re-renders
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
    } else {
      const parsed = JSON.parse(userData) as { email?: string };
      if (parsed.email) setUserEmail(parsed.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('user');
    await logout();
    router.push('/login');
  };

  const handleMockExecute = () => {
    setIsExecuting(true);
    setExecLogs(['Initializing Sandbox...', 'Compiling TypeScript...', 'Running analysis hooks...']);
    
    setTimeout(() => {
      setExecLogs(prev => [...prev, '► Executing segment s1: verifyToken()']);
    }, 800);

    setTimeout(() => {
      setExecLogs(prev => [...prev, '[ERROR] Insecure JWT decode detected in runtime sandbox!']);
    }, 1600);

    setTimeout(() => {
      setExecLogs(prev => [...prev, 'Execution completed in 1.42s']);
      setIsExecuting(false);
    }, 2400);
  };

  const handleAgentReview = async () => {
    const segment = MOCK_SEGMENTS.find(s => s.id === activeSegment);
    if (!segment) return;
    
    setIsAgentRunning(true);
    setExecLogs(['--- Starting LangGraph Agentic Review ---', 'Initializing Context...', `Querying segment: ${segment.lineInfo}`]);
    
    const res = await runAgentReview({
      query: "审查这段代码，检查命名、规则和历史记录。",
      segmentSource: segment.content, // Mocking source as the content itself for MVP
      segmentTarget: segment.content,
    });

    if (res.success && res.data) {
      setExecLogs(prev => [
        ...prev,
        `> Intents Detected: ${res.data?.intentsClassified?.join(", ") || "None"}`,
        `> Evidence Gathered: ${Object.keys(res.data?.evidenceGathered || {}).join(", ") || "None"}`,
        '',
        '--- Agent Response ---',
        res.data?.agentResponse || "No response generated.",
      ]);
    } else {
      setExecLogs(prev => [...prev, `[ERROR] Agent failed: ${res.error}`]);
    }
    
    setIsAgentRunning(false);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-300 font-sans overflow-hidden">
      
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <Code2 size={18} />
          </div>
          <span className="font-semibold text-slate-100">CATEST Workspace</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 ml-2">Snapshot #a9f2b</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{userEmail}</span>
          <button 
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-400 transition-colors"
            title="Sign Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Dual-Pane Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: File Tree */}
        <div className="w-64 border-r border-slate-800 bg-slate-900/30 flex flex-col shrink-0">
          <div className="p-4 uppercase text-xs font-semibold tracking-wider text-slate-500">
            Files under review
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {MOCK_FILES.map(file => (
              <button
                key={file.id}
                onClick={() => setActiveFile(file.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeFile === file.id 
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                }`}
              >
                <FileCode2 size={16} className={file.status === 'passed' ? 'text-green-500' : 'text-amber-500'} />
                <span className="truncate flex-1">{file.name}</span>
                {file.errors > 0 && (
                  <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded-full">
                    {file.errors}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Middle Column: Source Code Segments */}
        <div className="flex-1 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950">
          <div className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-900/50 shrink-0">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2">
              <ChevronRight size={16} className="text-slate-600" />
              Source Segments
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {MOCK_SEGMENTS.map(seg => (
              <div 
                key={seg.id}
                onClick={() => setActiveSegment(seg.id)}
                className={`rounded-xl border transition-all cursor-pointer overflow-hidden ${
                  activeSegment === seg.id 
                    ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' 
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center text-xs font-mono text-slate-500">
                  <span>{seg.lineInfo}</span>
                  <span className={`flex items-center gap-1 ${seg.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                    {seg.severity === 'error' ? <AlertCircle size={14} /> : <AlertCircle size={14} />}
                    {seg.severity.toUpperCase()}
                  </span>
                </div>
                <div className="p-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMDUwNTA1IjI+PC9yZWN0Pgo8cGF0aCBkPSJNMCAwTDAgNEwyIDRMMiAwWk0yIDJMNCAyTDQgMEwyIDBaIiBmaWxsPSIjMEEwQTBBIj48L3BhdGg+Cjwvc3ZnPg==')]">
                  <pre className="text-sm font-mono text-slate-300 leading-relaxed overflow-x-auto">
                    <code>{seg.content}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Review Tools & Execution */}
        <div className="w-[400px] flex flex-col bg-slate-900/40 shrink-0">
          
          {/* Finding Details */}
          <div className="h-1/2 border-b border-slate-800 flex flex-col">
            <div className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-900/50 shrink-0">
              <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <MessageSquareDiff size={16} className="text-indigo-400" />
                Review Finding
              </h2>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              {activeSegment === 's1' && (
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs border border-red-500/20 font-medium">
                    <AlertCircle size={14} /> Critical Security Flaw
                  </div>
                  <h3 className="text-lg font-semibold text-slate-200 leading-tight">
                    Unverified JWT Decode
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    The code decoded a JWT without verifying its signature. This allows an attacker to forge tokens and bypass authentication. 
                    Always use <code>jwt.verify()</code> with the correct secret key instead of <code>jwt.decode()</code>.
                  </p>
                  
                  <div className="mt-8 pt-4 border-t border-slate-800">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Auditor Notes</label>
                    <textarea 
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none h-24"
                      placeholder="Add resolution notes..."
                    />
                    <div className="flex justify-end mt-3 gap-2">
                      <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">Discard</button>
                      <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                        <CheckCircle2 size={16} /> Mark Resolved
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mock Execution Terminal */}
          <div className="h-1/2 flex flex-col bg-slate-950">
            <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50 shrink-0">
              <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <Terminal size={16} className="text-green-400" />
                Execution Sandbox & Agent
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAgentReview}
                  disabled={isExecuting || isAgentRunning}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-medium rounded border border-indigo-500/20 transition-all disabled:opacity-50"
                >
                  {isAgentRunning ? <span className="animate-pulse">Thinking...</span> : <><Bot size={12} fill="currentColor" /> AI Agent Review</>}
                </button>
                <button 
                  onClick={handleMockExecute}
                  disabled={isExecuting || isAgentRunning}
                  className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium rounded border border-green-500/20 transition-all disabled:opacity-50"
                >
                  {isExecuting ? <span className="animate-pulse">Running...</span> : <><Play size={12} fill="currentColor" /> Run Segment</>}
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed">
              {execLogs.length === 0 ? (
                <div className="text-slate-600 italic h-full flex items-center justify-center">
                  Sandbox ready. Click &quot;Run Segment&quot; to trace finding execution.
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-slate-500">$ npx codecat-runner sandbox</div>
                  {execLogs.map((log, i) => (
                    <div key={i} className={`${log.includes('[ERROR]') ? 'text-red-400 font-bold' : log.includes('►') ? 'text-indigo-400' : 'text-slate-400'}`}>
                      {log}
                    </div>
                  ))}
                  {isExecuting && <div className="text-slate-500 animate-pulse">_</div>}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
