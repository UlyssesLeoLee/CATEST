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
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-900 pb-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">Collaboration</Badge>
            <div className="w-1 h-1 rounded-full bg-zinc-700" />
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">CAT Org Portal v2.0</span>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            Team & Collaboration
          </h1>
          <p className="text-zinc-500 text-sm font-medium max-w-xl">
            Manage your code review workforce, assign tasks, and monitor collaborative progress in real-time.
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button variant="secondary" className="border-zinc-800 bg-zinc-900/50">
            邀请成员
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white">
            <UserPlus className="w-4 h-4 mr-2" />
            新建团队
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: Team Roster */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              Resource Pool
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
               <Filter className="w-3 h-3" />
               Filter Roles
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamMembers.map((m) => (
              <Card key={m.id} variant="glass" className="p-5 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                      {m.name.substring(0,2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{m.name}</h4>
                      <p className="text-[10px] text-zinc-500 font-medium">{m.email}</p>
                    </div>
                  </div>
                  <Badge className="bg-zinc-800/50 text-[9px] text-zinc-400">{m.role}</Badge>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-zinc-900">
                   <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-zinc-500 uppercase font-black">Tasks</p>
                        <p className="text-sm font-bold text-white">{m.tasks}</p>
                      </div>
                      <div className="w-px h-6 bg-zinc-800" />
                      <div className="text-center">
                        <p className="text-[10px] text-zinc-500 uppercase font-black">Status</p>
                        <p className={cn("text-sm font-bold", m.status === 'Active' ? 'text-emerald-500' : 'text-zinc-500')}>{m.status}</p>
                      </div>
                   </div>
                   <Button 
                    size="sm" 
                    variant="secondary" 
                    className="px-3 h-8 text-[10px] bg-zinc-900 border-zinc-800"
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
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Live Assignments
          </h2>
          <div className="space-y-3">
            {activeAssignments.map((a) => (
              <Card key={a.id} variant="glass" className="p-4 bg-zinc-900/10 border-zinc-800/30">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">{a.project}</span>
                   <span className="text-[9px] font-bold text-zinc-500 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> Due {a.dueDate}
                   </span>
                </div>
                <h4 className="text-xs font-bold text-zinc-100 mb-3">{a.task}</h4>
                <div className="flex items-center gap-3 mb-3">
                   <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center">
                      <ShieldCheck className="w-3 h-3 text-indigo-400" />
                   </div>
                   <span className="text-[10px] text-zinc-400 font-bold">Assignee: {a.assignee}</span>
                </div>
                <div className="space-y-1.5">
                   <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                      <span>Progress</span>
                      <span>{a.progress}%</span>
                   </div>
                   <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${a.progress}%` }} />
                   </div>
                </div>
              </Card>
            ))}
          </div>
          
          <Card variant="glass" className="p-5 bg-indigo-600/5 border-indigo-500/20">
             <div className="flex items-start gap-4 mb-4">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
                <div>
                   <h5 className="text-[11px] font-black text-white uppercase tracking-wider">Collaboration Feed</h5>
                   <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">@leo tagged the Security Team in 'Memory Base Match Analysis'.</p>
                </div>
             </div>
             <Button size="sm" className="w-full h-8 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-black">
                Open Collaboration Panel
             </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
