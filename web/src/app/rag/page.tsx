'use client';

import { useState, useEffect } from 'react';
import { getConfirmedTranslations, triggerRagIngestion } from '../actions/rag';
import { Database, FastForward, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

type TranslationItem = {
  id: string;
  workspace_id: string;
  file_path: string;
  source_text: string;
  target_text: string;
  rag_status: string;
  created_at: string;
};

export default function RagDashboard() {
  const [items, setItems] = useState<TranslationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    const res = await getConfirmedTranslations();
    if (res.success && res.data) {
      setItems(res.data as TranslationItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, []);



  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleIngest = async () => {
    if (selectedIds.size === 0) return;
    setIngesting(true);
    
    const ids = Array.from(selectedIds);
    const res = await triggerRagIngestion(ids);
    
    if (res.success) {
      alert(`Triggered Arroyo Pipeline for ${ids.length} items! Check Kafka logs.`);
      setSelectedIds(new Set());
      loadItems(); // Refresh statuses
    } else {
      alert('Failed to trigger ingestion: ' + res.error);
    }
    setIngesting(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans">
      <header className="max-w-6xl mx-auto mb-8 flex justify-between items-end border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <img src="/icon.png" alt="CATEST" className="w-8 h-8 object-contain" />
            CATEST RAG Ingestion Pipeline
          </h1>
          <p className="text-slate-400 mt-2">
            Select confirmed translations from PostgreSQL to run through the Arroyo streaming cleaner and into the local Small LLM for Neo4j/Qdrant indexing.
          </p>
        </div>
        
        <button
          onClick={handleIngest}
          disabled={selectedIds.size === 0 || ingesting}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/20"
        >
          {ingesting ? <Loader2 size={20} className="animate-spin" /> : <FastForward size={20} />}
          Ingest Selected ({selectedIds.size})
        </button>
      </header>

      <main className="max-w-6xl mx-auto">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 size={48} className="animate-spin text-indigo-500/50" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center p-12 border border-slate-800 rounded-2xl bg-slate-900/50">
            <CheckCircle2 size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">No confirmed translations found in PostgreSQL.</p>
            <p className="text-sm text-slate-500 mt-2">Go to the Workspace and confirm local segments first.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map(item => (
              <div 
                key={item.id} 
                onClick={() =>  item.rag_status === 'ready_for_ingestion' && toggleSelect(item.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-6 ${
                  selectedIds.has(item.id) 
                    ? 'bg-indigo-900/40 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                    : item.rag_status === 'processing'
                    ? 'bg-slate-900/30 border-slate-800 opacity-50 cursor-not-allowed'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex-shrink-0">
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                    selectedIds.has(item.id) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600'
                  }`}>
                    {selectedIds.has(item.id) && <CheckCircle2 size={14} />}
                  </div>
                </div>
                
                <div className="flex-1 grid grid-cols-2 gap-8 items-center">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Source</span>
                    <p className="text-sm font-mono text-slate-300 line-clamp-2">{item.source_text}</p>
                  </div>
                  
                  <div className="flex gap-4 items-center">
                    <ArrowRight size={20} className="text-slate-600 flex-shrink-0" />
                    <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Target</span>
                    <p className="text-sm text-indigo-200 line-clamp-2">{item.target_text}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right w-32">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    item.rag_status === 'processing' 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {item.rag_status === 'processing' ? 'Processing...' : 'Ready'}
                  </span>
                  <div className="text-xs text-slate-500 mt-2 font-mono truncate">
                    {item.file_path}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
