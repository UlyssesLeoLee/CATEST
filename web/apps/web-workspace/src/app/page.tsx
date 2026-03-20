"use client";

import { ProjectPluginGroup } from "@/plugins/ProjectPluginGroup";
import { PluginGroupRenderer } from "@catest/ui/plugins";
import { Card, Badge, Button, getAppUrl } from "@catest/ui";
import { Layers, Cpu, Network, Settings2, Plus, ArrowRight } from "lucide-react";

export default function WorkspacePage() {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#b87333]/20 pb-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#c9a84c]/10 text-[#c9a84c] border-[#c9a84c]/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Management</Badge>
            <div className="w-1 h-1 rounded-full bg-[#b87333]/30" />
            <span className="text-[10px] text-[#c4b49a] font-bold uppercase tracking-widest">Workspace v1.2</span>
          </div>
          <h1 className="text-4xl font-extrabold text-[#f5e6d0] tracking-tight flex items-center gap-3">
            <Layers className="w-8 h-8 text-[#c9a84c]" />
            Project Workspace
          </h1>
          <p className="text-[#c4b49a] text-sm font-medium max-w-xl">
            Centralized orchestration for distributed translation assets, node topology, and ingestion pipelines.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="border-[#b87333]/20 bg-[#b87333]/10 hover:bg-[#b87333]/20"
            onClick={() => window.location.href = getAppUrl('review')}
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Start Global Audit
          </Button>
          <Button className="bg-[#b87333] hover:bg-[#c9a84c] text-[#f5e6d0]">
            <Plus className="w-4 h-4 mr-2" />
            Deploy Node
          </Button>
        </div>
      </section>

      {/* Workspace Stats Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "Active Project Nodes", value: "24", icon: Cpu, color: "text-[#c9a84c]" },
          { label: "Connected Slaves", value: "112", icon: Network, color: "text-emerald-400" },
          { label: "Total Asset Load", value: "4.2 TB", icon: Layers, color: "text-[#b87333]" },
        ].map((stat, i) => (
          <Card key={i} variant="glass" className="p-6 flex items-center gap-5 hover:border-white/10 transition-colors group">
            <div className={`p-4 rounded-2xl bg-white/[0.03] border border-white/5 ${stat.color} group-hover:bg-white group-hover:text-zinc-950 transition-all duration-300`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#c4b49a] font-bold mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-[#f5e6d0] tracking-tight">{stat.value}</h3>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Content Area */}
      <Card variant="glass" className="bg-[#b87333]/5 border-[#b87333]/20 overflow-hidden">
        <div className="p-1 bg-gradient-to-r from-transparent via-[#c9a84c]/10 to-transparent" />
        <div className="p-6">
          <PluginGroupRenderer group={ProjectPluginGroup} />
        </div>
      </Card>
    </div>
  );
}


