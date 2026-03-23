"use client";

import React, { useState } from "react";
import { ProjectPluginGroup } from "@/plugins/ProjectPluginGroup";
import { PluginGroupRenderer } from "@catest/ui/plugins";
import { Card, Badge, Button, getAppUrl, VictorianDivider } from "@catest/ui";
import { Layers, Cpu, Network, Plus, ArrowRight, X, Loader2, CheckCircle2, Server, Link, Tag } from "lucide-react";

const GATEWAY = "http://localhost:33080";

function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content glass-panel rounded-3xl shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const [deployOpen, setDeployOpen] = useState(false);
  const [nodeUrl, setNodeUrl] = useState("");
  const [nodeName, setNodeName] = useState("");
  const [nodeTag, setNodeTag] = useState("production");
  const [deploying, setDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const handleDeploy = async () => {
    if (!nodeUrl.trim() || !nodeName.trim()) return;
    setDeploying(true);
    try {
      await fetch(`${GATEWAY}/api/ingest-rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            id: crypto.randomUUID(),
            workspace_id: nodeName,
            file_path: nodeUrl,
            source_text: `Node: ${nodeName} | URL: ${nodeUrl} | Tag: ${nodeTag}`,
            target_text: `Deployed node ${nodeName}`,
          }]
        }),
      });
      setDeploySuccess(true);
      setTimeout(() => { setDeployOpen(false); setDeploySuccess(false); setNodeUrl(""); setNodeName(""); }, 1800);
    } catch { /* best effort */ }
    finally { setDeploying(false); }
  };

  return (
    <div className="space-y-[var(--section-gap)] animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* ── Header ──────────────────────────────────────────── */}
      <section className="app-page-header flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#c9a84c]/10 text-[var(--text-brass)] border-[#c9a84c]/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Management</Badge>
            <div className="w-1 h-1 rounded-full bg-[#b87333]/30" />
            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Workspace v1.2</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-[var(--text-brass)]" />
            Project Workspace
          </h1>
          <p className="text-[var(--text-secondary)] text-sm font-medium max-w-xl">
            Centralized orchestration for distributed translation assets, node topology, and ingestion pipelines.
          </p>
        </div>

        <div className="flex gap-4 items-center justify-center h-fit">
          <Button variant="shabby" size="md" onClick={() => window.location.href = getAppUrl('review')}>
            <ArrowRight className="w-3.5 h-3.5 mr-2" />
            Start Global Audit
          </Button>
          <Button variant="shabby" size="md" onClick={() => setDeployOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-2" />
            Deploy Node
          </Button>
        </div>
      </section>

      {/* ── Workspace Stats ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Active Project Nodes", value: "24", icon: Cpu, color: "text-[var(--text-brass)]" },
          { label: "Connected Slaves",     value: "112", icon: Network, color: "text-[var(--verdigris)]" },
          { label: "Total Asset Load",     value: "4.2 TB", icon: Layers, color: "text-[var(--text-ember)]" },
        ].map((stat, i) => (
          <Card key={i} variant="glass" className="p-4 flex items-center gap-4 group stat-card">
            <div className={`p-2.5 rounded-xl bg-[#b87333]/10 border border-[#b87333]/20 ${stat.color} group-hover:bg-[#b87333] group-hover:text-[var(--text-primary)] transition-all duration-300`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">{stat.value}</h3>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <Card variant="glass" className="bg-[#b87333]/5 border-[#b87333]/20">
        <div className="p-1 bg-gradient-to-r from-transparent via-[#c9a84c]/10 to-transparent" />
        <div className="p-6">
          <PluginGroupRenderer group={ProjectPluginGroup} />
        </div>
      </Card>

      {/* ── Deploy Node Modal ──────────────────────────────── */}
      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Deploy New Node">
        {deploySuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-12 h-12 text-[#4a8b6e]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Node deployed & registered to pipeline!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2 mb-2">
                <Tag className="w-3 h-3" /> Node Name
              </label>
              <input
                type="text"
                placeholder="e.g. EU-Legal-Node-03"
                value={nodeName}
                onChange={e => setNodeName(e.target.value)}
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2 mb-2">
                <Link className="w-3 h-3" /> Repository URL
              </label>
              <input
                type="text"
                placeholder="https://github.com/org/repo.git"
                value={nodeUrl}
                onChange={e => setNodeUrl(e.target.value)}
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 focus:outline-none focus:border-[#c9a84c]/60"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2 mb-2">
                <Server className="w-3 h-3" /> Environment
              </label>
              <select
                value={nodeTag}
                onChange={e => setNodeTag(e.target.value)}
                className="w-full bg-[var(--coal)] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#c9a84c]/60"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="dev">Development</option>
              </select>
            </div>
            <VictorianDivider />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeployOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleDeploy} disabled={deploying || !nodeUrl.trim() || !nodeName.trim()}>
                {deploying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {deploying ? "Deploying..." : "Deploy"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
