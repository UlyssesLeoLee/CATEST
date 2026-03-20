"use client";

import React, { useState } from "react";
import { Card, Button, Badge, cn, getAppUrl } from "@catest/ui";
import {
  Users, UserPlus, ShieldCheck, Clock,
  Filter, MessageSquare, X, Loader2, CheckCircle2,
  Mail, User, Shield, Hash, AlignLeft, Send
} from "lucide-react";

function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-3xl w-full max-w-lg mx-4 shadow-2xl shadow-black/60 z-10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-black text-[#f5e6d0] uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-[#c4b49a] hover:text-[#f5e6d0] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ROLES = ["Manager", "Auditor", "Contributor", "Reviewer", "Observer"];

export default function TeamPage() {
  const [teamMembers, setTeamMembers] = useState([
    { id: "1", name: "Leo Architect",  email: "leo@catest.io",    role: "Manager",     status: "Active", tasks: 4  },
    { id: "2", name: "Security Bot",   email: "sec@catest.io",    role: "Auditor",     status: "Active", tasks: 12 },
    { id: "3", name: "Reviewer Alpha", email: "alpha@team.org",   role: "Contributor", status: "Away",   tasks: 2  },
  ]);

  const activeAssignments = [
    { id: "a1", project: "E-Commerce-Core",  task: "Auth Logic Audit",  assignee: "Security Bot",   progress: 85, dueDate: "2h" },
    { id: "a2", project: "Payment-Gateway",  task: "Pattern Review",    assignee: "Leo Architect",  progress: 30, dueDate: "1d" },
  ];

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Contributor");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Create team modal
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);

  // Collaboration panel
  const [collabOpen, setCollabOpen] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    await new Promise(r => setTimeout(r, 800));
    const name = inviteEmail.split("@")[0];
    setTeamMembers(prev => [...prev, {
      id: String(Date.now()),
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: inviteEmail,
      role: inviteRole,
      status: "Pending",
      tasks: 0,
    }]);
    setInviteSuccess(true);
    setInviting(false);
    setTimeout(() => { setInviteOpen(false); setInviteSuccess(false); setInviteEmail(""); }, 1500);
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setCreating(true);
    await new Promise(r => setTimeout(r, 800));
    setCreateSuccess(true);
    setCreating(false);
    setTimeout(() => { setTeamOpen(false); setCreateSuccess(false); setTeamName(""); setTeamDesc(""); }, 1500);
  };

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
          <Button variant="secondary" onClick={() => setInviteOpen(true)}>
            <Mail className="w-4 h-4 mr-2" />
            邀请成员
          </Button>
          <Button onClick={() => setTeamOpen(true)}>
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
            <div className="flex items-center gap-2 text-xs text-[#c4b49a] cursor-pointer hover:text-[#c9a84c] transition-colors">
              <Filter className="w-3 h-3" />
              Filter Roles
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamMembers.map((m) => (
              <Card key={m.id} variant="glass" className="p-5 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#b87333] to-[#c9a84c] flex items-center justify-center text-[#f5e6d0] font-bold text-xs">
                      {m.name.substring(0, 2)}
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
                      <p className={cn("text-sm font-bold", m.status === "Active" ? "text-emerald-500" : m.status === "Pending" ? "text-amber-400" : "text-[#c4b49a]")}>{m.status}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => window.location.href = getAppUrl("base", "/profile")}>
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
                    <span>Progress</span><span>{a.progress}%</span>
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
            <Button size="sm" className="w-full" onClick={() => setCollabOpen(true)}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" />
              Open Collaboration Panel
            </Button>
          </Card>
        </div>
      </div>

      {/* Invite Member Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member">
        {inviteSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-sm font-bold text-[#f5e6d0]">Invitation sent successfully!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider flex items-center gap-2 mb-2">
                <Mail className="w-3 h-3" /> Email Address
              </label>
              <input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvite()}
                className="w-full bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#f5e6d0] placeholder-[#c4b49a]/40 focus:outline-none focus:border-[#c9a84c]/60"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider flex items-center gap-2 mb-2">
                <Shield className="w-3 h-3" /> Role
              </label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#f5e6d0] focus:outline-none focus:border-[#c9a84c]/60"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {inviting ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Team Modal */}
      <Modal open={teamOpen} onClose={() => setTeamOpen(false)} title="Create New Team">
        {createSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-sm font-bold text-[#f5e6d0]">Team "{teamName}" created!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider flex items-center gap-2 mb-2">
                <Hash className="w-3 h-3" /> Team Name
              </label>
              <input
                type="text"
                placeholder="e.g. Security Review Squad"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                className="w-full bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#f5e6d0] placeholder-[#c4b49a]/40 focus:outline-none focus:border-[#c9a84c]/60"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#c4b49a] uppercase tracking-wider flex items-center gap-2 mb-2">
                <AlignLeft className="w-3 h-3" /> Description
              </label>
              <textarea
                rows={3}
                placeholder="What does this team focus on?"
                value={teamDesc}
                onChange={e => setTeamDesc(e.target.value)}
                className="w-full bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-3 text-sm text-[#f5e6d0] placeholder-[#c4b49a]/40 focus:outline-none focus:border-[#c9a84c]/60 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setTeamOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleCreateTeam} disabled={creating || !teamName.trim()}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                {creating ? "Creating..." : "Create Team"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Collaboration Panel Modal */}
      <Modal open={collabOpen} onClose={() => setCollabOpen(false)} title="Collaboration Feed">
        <div className="space-y-3 max-h-80 overflow-auto">
          {[
            { user: "leo", action: "tagged the Security Team in", target: "Memory Base Match Analysis", time: "2m ago", color: "text-[#c9a84c]" },
            { user: "security-bot", action: "completed audit on", target: "E-Commerce-Core Auth Logic", time: "15m ago", color: "text-emerald-400" },
            { user: "reviewer-alpha", action: "requested review for", target: "Payment-Gateway Pattern", time: "1h ago", color: "text-[#b87333]" },
            { user: "leo", action: "approved PR in", target: "CoreAPI unbounded-recursion fix", time: "3h ago", color: "text-[#c9a84c]" },
          ].map((item, i) => (
            <div key={i} className="glass-card rounded-xl p-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#b87333] to-[#c9a84c] flex items-center justify-center text-[#f5e6d0] font-bold text-[9px] shrink-0">
                {item.user.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#c4b49a] leading-relaxed">
                  <span className={cn("font-bold", item.color)}>@{item.user}</span>
                  {" "}{item.action}{" "}
                  <span className="text-[#f5e6d0] font-semibold">'{item.target}'</span>
                </p>
                <span className="text-[9px] text-[#c4b49a]/50 font-bold">{item.time}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Post an update..."
            className="flex-1 bg-[#1a1408] border border-[#b87333]/30 rounded-xl px-4 py-2.5 text-sm text-[#f5e6d0] placeholder-[#c4b49a]/40 focus:outline-none focus:border-[#c9a84c]/60"
          />
          <Button size="sm">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Modal>
    </div>
  );
}
