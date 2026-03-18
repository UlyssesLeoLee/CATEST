"use client";

import React from "react";
import { type PluginGroup } from "@catest/ui/plugins";
import { Card, Badge, Button } from "@catest/ui";
import { 
  Check, 
  X, 
  MessageSquare, 
  Code2, 
  Maximize2, 
  Settings,
  ChevronRight,
  Plus,
  History
} from "lucide-react";


// Plugin: The main CAT-style segment editor panel (Code Quality Dashboard)
function DiffEditorPlugin({ taskId }: { taskId?: string }) {
  const segments = [
    { 
      id: 1, 
      source: "export async function handleRequest(req: Request) {", 
      target: "export async function handleRequest(req: Request) {", 
      remark: "Entry point verified against Security Policy v2.1.",
      status: "verified",
      match: "100% MB" // From Memory Base
    },
    { 
      id: 2, 
      source: "  const session = await getSession(req);", 
      target: "  const auth = await validateAuthorization(req);", 
      remark: "Non-compliant with 'Auth-Standard-2026'. Termbase suggests using centralized validator.",
      status: "review",
      match: "92% TB" // From Termbase
    },
    { 
      id: 3, 
      source: "  if (!auth.isValid) return new Response('Unauthorized', { status: 401 });", 
      target: "  if (!auth.isValid) return new Response('Unauthorized', { status: 401 });", 
      remark: "Standard error guard. Complies with Global Exception Pattern.",
      status: "verified",
      match: "100% MB"
    },
    { 
      id: 4, 
      source: "  return processTask(auth.user);", 
      target: "  return processSyncTask(auth.user, req.signal);", 
      remark: "Proposed change: Add cancellation signal for better resource lifecycle management.",
      status: "draft",
      match: "Fuzzy"
    },
    { 
      id: 5, 
      source: "}", 
      target: "}", 
      remark: "",
      status: "verified",
      match: "Static"
    },
  ];

  return (
    <div className="flex flex-col gap-px bg-zinc-900/50 border border-zinc-900 rounded-xl overflow-hidden shadow-2xl">
      {/* Header for the grid */}
      <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[900px]">
            <div className="grid grid-cols-[60px_1fr_1fr_100px] bg-zinc-900/80 px-4 py-3 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <div className="flex items-center justify-center">ID</div>
            <div className="flex items-center gap-2 pl-4">
              <Code2 className="w-3.5 h-3.5" />
              Production Code
            </div>
            <div className="flex items-center gap-2 pl-4 border-l border-zinc-800">
              <MessageSquare className="w-3.5 h-3.5" />
              Proposed Fix / Quality Notes
            </div>
            <div className="flex items-center justify-center border-l border-zinc-800">Quality</div>
          </div>

          {/* Segments List */}
          <div className="divide-y divide-zinc-900/80">
            {segments.map((seg) => (
              <div key={seg.id} className="grid grid-cols-[60px_1fr_1fr_100px] group hover:bg-white/[0.02] transition-colors relative min-w-0">
                {/* ID & Selection Indicator */}
                <div className="flex items-center justify-center text-[10px] font-mono font-bold text-zinc-600 bg-black/20 group-hover:text-indigo-400 transition-colors">
                  {seg.id.toString().padStart(3, '0')}
                </div>

                {/* Source Content */}
                <div className="p-4 font-mono text-[11px] leading-relaxed text-zinc-400 border-l border-zinc-900 group-hover:text-zinc-200 transition-colors whitespace-pre-wrap break-all min-w-0 overflow-hidden">
                  {seg.source}
                </div>

                {/* Target / Remarks Input Area */}
                <div className="p-0 border-l border-zinc-900 flex flex-col min-w-0 overflow-hidden">
                  <textarea 
                    defaultValue={seg.target} 
                    className="flex-1 w-full bg-transparent p-4 font-mono text-[11px] leading-relaxed text-indigo-100 outline-none focus:bg-indigo-500/5 transition-all resize-none min-h-[80px] break-all whitespace-pre-wrap"
                    spellCheck={false}
                  />
                  {seg.remark && (
                    <div className="px-4 pb-3 -mt-2 text-[9px] text-zinc-500 italic flex items-center gap-1.5 font-medium min-w-0">
                      <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{seg.remark}</span>
                    </div>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="flex flex-col items-center justify-center gap-2 border-l border-zinc-900 bg-black/10 min-w-[100px]">
                  <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${
                    seg.status === 'verified' ? 'bg-emerald-500 shadow-emerald-500/50' :
                    seg.status === 'review' ? 'bg-amber-500 shadow-amber-500/50' :
                    'bg-zinc-700'
                  }`} />
                  <span className={`text-[8px] font-black uppercase tracking-tighter ${
                    seg.status === 'verified' ? 'text-emerald-500' :
                    seg.status === 'review' ? 'text-amber-500' :
                    'text-zinc-500'
                  }`}>
                    {seg.status}
                    {seg.match && <div className="mt-0.5 opacity-60 font-mono italic">{seg.match}</div>}
                  </span>
                </div>
                
                {/* Focus Indicator */}
                <div className="absolute inset-y-0 left-0 w-0.5 bg-indigo-500 opacity-0 group-focus-within:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-zinc-900/40 px-6 py-3 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> 142 Review Snippets</span>
          <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Memory Base Hash: 8F2A...</span>
        </div>
        {taskId && <span>Job ID: {taskId}</span>}
      </div>
    </div>
  );
}

// Plugin: Toolbar for editor actions (accept, reject, comment)
function EditorToolbarPlugin() {
  return (
    <div className="flex items-center justify-between mb-6 bg-zinc-900/30 p-2 rounded-2xl border border-zinc-800/50">
      <div className="flex gap-2">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 w-fit">
          <Check className="w-4 h-4 mr-1.5 shrink-0" />
          <span className="whitespace-nowrap">Accept All</span>
        </Button>
        <Button size="sm" variant="secondary" className="border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:text-white px-6 w-fit">
          <X className="w-4 h-4 mr-1.5 shrink-0" />
          <span className="whitespace-nowrap">Reject</span>
        </Button>
      </div>

      <div className="h-6 w-px bg-zinc-800 mx-2" />

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:text-white h-9">
          <MessageSquare className="w-4 h-4 mr-1.5" />
          Comment
        </Button>
        <Button size="sm" variant="secondary" className="w-9 px-0 border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:text-white h-9">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export const ReviewEditorPluginGroup: PluginGroup = {
  id: "review-editor",
  name: "Code Review Editor",
  plugins: [
    { id: "editor-toolbar", name: "Toolbar", component: EditorToolbarPlugin as React.ComponentType<unknown> },
    { id: "diff-editor",    name: "Diff Editor", component: DiffEditorPlugin as React.ComponentType<unknown> },
  ],
};

