"use client";

import React from "react";
import { Card, Button, Badge, cn, getAppUrl } from "@catest/ui";
import { 
  Users, 
  UserPlus, 
  Mail, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  Filter,
  MessageSquare
} from "lucide-react";

export default function TeamPage() {
  const teamMembers = [
    { id: "1", name: "Leo Architect", email: "leo@catest.io", role: "Manager", status: "Active", tasks: 4 },
    { id: "2", name: "Security Bot", email: "sec@catest.io", role: "Auditor", status: "Active", tasks: 12 },
    { id: "3", name: "Reviewer Alpha", email: "alpha@team.org", role: "Contributor", status: "Away", tasks: 2 },
  ];

  const activeAssignments = [
    { id: "a1", project: "E-Commerce-Core", task: "Auth Logic Audit", assignee: "Security Bot", progress: 85, dueDate: "2h" },
    { id: "a2", project: "Payment-Gateway", task: "Pattern Review", assignee: "Leo Architect", progress: 30, dueDate: "1d" },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 p-8">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#b87333]/20 pb-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#c9a84c]/10 text-[#c9a84c] border-[#c9a84c]/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Collaboration</Badge>
            <div className="w-1 h-1 rounded-full bg-[#b87333]/30" />
            <span className="text-[10px] text-[#c4b49a] font-bold uppercase tracking-widest">CAT Org Portal v2.0</span>
          </div>
          <h1 className="text-4xl font-extrabold text-[#f5e6d0] tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-[#c9a84c]" />
            Team & Collaboration
          </h1>
          <p className="text-[#c4b49a] text-sm font-medium max-w-xl">
            Manage your code review workforce, assign tasks, and monitor collaborative progress in real-time.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary">
            邀请成员
          </Button>
          <Button>
            <UserPlus className="w-4 h-4 mr-2" />
            新建团队
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: Team Roster */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#f5e6d0] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#c9a84c]" />
              Resource Pool
            </h2>
            <div className="flex items-center gap-2 text-xs text-[#c4b49a]">
               <Filter className="w-3 h-3" />
               Filter Roles
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamMembers.map((m) => (
              <Card key={m.id} variant="glass" className="p-5 hover:border-[#c9a84c]/30 transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#b87333] to-[#c9a84c] flex items-center justify-center text-[#f5e6d0] font-bold text-xs">
                      {m.name.substring(0,2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#f5e6d0] group-hover:text-[#c9a84c] transition-colors">{m.name}</h4>
                      <p className="text-[10px] text-[#c4b49a] font-medium">{m.email}</p>
                    </div>
                  </div>
                  <Badge className="bg-[#b87333]/20 text-[9px] text-[#c4b49a]">{m.role}</Badge>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-[#b87333]/20">
                   <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-[#c4b49a] uppercase font-black">Tasks</p>
                        <p className="text-sm font-bold text-[#f5e6d0]">{m.tasks}</p>
                      </div>
                      <div className="w-px h-6 bg-[#b87333]/20" />
                      <div className="text-center">
                        <p className="text-[10px] text-[#c4b49a] uppercase font-black">Status</p>
                        <p className={cn("text-sm font-bold", m.status === 'Active' ? 'text-emerald-500' : 'text-[#c4b49a]')}>{m.status}</p>
                      </div>
                   </div>
                   <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => window.location.href = getAppUrl('base', '/profile')}
                   >
                      View Profile
                   </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Right Column: Live Assignments */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-[#f5e6d0] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#c9a84c]" />
            Live Assignments
          </h2>
          <div className="space-y-3">
            {activeAssignments.map((a) => (
              <Card key={a.id} variant="glass" className="p-4 bg-[#b87333]/5 border-[#b87333]/20">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[10px] font-black text-[#c9a84c] uppercase tracking-tighter">{a.project}</span>
                   <span className="text-[9px] font-bold text-[#c4b49a] flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> Due {a.dueDate}
                   </span>
                </div>
                <h4 className="text-xs font-bold text-[#f5e6d0] mb-3">{a.task}</h4>
                <div className="flex items-center gap-3 mb-3">
                   <div className="w-6 h-6 rounded-lg bg-[#b87333]/20 flex items-center justify-center">
                      <ShieldCheck className="w-3 h-3 text-[#c9a84c]" />
                   </div>
                   <span className="text-[10px] text-[#c4b49a] font-bold">Assignee: {a.assignee}</span>
                </div>
                <div className="space-y-1.5">
                   <div className="flex justify-between text-[10px] font-bold text-[#c4b49a]">
                      <span>Progress</span>
                      <span>{a.progress}%</span>
                   </div>
                   <div className="w-full h-1 bg-[#b87333]/20 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#b87333] to-[#c9a84c]" style={{ width: `${a.progress}%` }} />
                   </div>
                </div>
              </Card>
            ))}
          </div>
          
          <Card variant="glass" className="p-5 bg-[#c9a84c]/5 border-[#c9a84c]/20">
             <div className="flex items-start gap-4 mb-4">
                <MessageSquare className="w-5 h-5 text-[#c9a84c]" />
                <div>
                   <h5 className="text-[11px] font-black text-[#f5e6d0] uppercase tracking-wider">Collaboration Feed</h5>
                   <p className="text-[10px] text-[#c4b49a] font-medium leading-relaxed">@leo tagged the Security Team in 'Memory Base Match Analysis'.</p>
                </div>
             </div>
             <Button size="sm" className="w-full">
                Open Collaboration Panel
             </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
