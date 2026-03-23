'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getMyAccount,
  listActiveSessions,
  listApiTokens,
  updateProfile,
  revokeSession,
  revokeAllOtherSessions,
  generateApiToken,
  revokeApiToken,
} from '@/app/actions/account';
import { logout } from '@/app/actions/auth';
import { useRouter } from 'next/navigation';
import {
  User, ShieldCheck, Key, LogOut, Plus, Trash2,
  Loader2, Copy, Check, Monitor, Zap, Crown, Settings, Mail
} from 'lucide-react';
import { Card, Button, Badge, Spinner, cn } from "@catest/ui";

const PLAN_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode; border: string }> = {
  free:       { label: 'Free Tier',   color: 'text-[#c9a84c] bg-[#c9a84c]/10',      icon: <Zap size={14} />, border: 'border-[#c9a84c]/20' },
  pro:        { label: 'Professional', color: 'text-[#4a8b6e] bg-[#4a8b6e]/10',     icon: <ShieldCheck size={14} />, border: 'border-[#4a8b6e]/20' },
  enterprise: { label: 'Enterprise',   color: 'text-[#e8a050] bg-[#e8a050]/10',      icon: <Crown size={14} />, border: 'border-[#e8a050]/20' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="ml-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-zinc-400 hover:text-white">
      {copied ? <Check size={14} className="text-[#4a8b6e]" /> : <Copy size={14} />}
    </button>
  );
}

type UserProfile = {
  id: string; email: string; display_name: string | null;
  role: string; status: string; last_login: string | null;
  plan: string; license_expires_at: string | null; created_at: string;
};
type Session = { id: string; user_agent: string | null; ip_address: string | null; created_at: string; expires_at: string; is_current: boolean };
type ApiToken = { id: string; name: string; token_prefix: string; created_at: string; last_used_at: string | null; expires_at: string | null };

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenSecret, setNewTokenSecret] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'security' | 'api'>('details');

  const loadData = useCallback(async () => {
    try {
      const [acct, sess, toks] = await Promise.all([getMyAccount(), listActiveSessions(), listApiTokens()]);
      if ('user' in acct && acct.user) { 
        setUser(acct.user as UserProfile); 
        setDisplayName((acct.user as UserProfile).display_name || ''); 
      }
      if ('sessions' in sess) setSessions((sess.sessions ?? []) as Session[]);
      if ('tokens' in toks) setTokens((toks.tokens ?? []) as ApiToken[]);
    } catch (err) {
      console.error('Failed to sync profile data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = async () => { 
    await logout(); 
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const handleSaveProfile = async () => {
    setSavingName(true);
    await updateProfile(displayName);
    await loadData();
    setSavingName(false);
  };

  const handleGenerateToken = async () => {
    if (!newTokenName.trim()) return;
    const res = await generateApiToken(newTokenName.trim());
    if ('rawToken' in res) { 
      setNewTokenSecret(res.rawToken); 
      setNewTokenName(''); 
      await loadData(); 
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Spinner size={40} />
        <p className="text-[var(--text-muted)] font-bold uppercase tracking-[0.2em] text-[10px]">Synchronizing Identity Node...</p>
      </div>
    );
  }

  const badge = PLAN_BADGE[user?.plan ?? 'free'] || PLAN_BADGE.free;

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-1000">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-10 border-b border-[#3e1b0d]/30">
        <div className="flex items-center gap-8">
          <div className="relative group">
            <div className="absolute inset-0 rounded-xl blur-2xl opacity-0 group-hover:opacity-60 transition-all duration-700" style={{ background: 'radial-gradient(circle, rgba(184,115,51,0.3), transparent)' }} />
            <div className="relative w-24 h-24 rounded-xl border-2 border-[#3e1b0d] flex items-center justify-center shadow-[0_8px_25px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,240,200,0.1)] group-hover:scale-105 transition-transform duration-500 overflow-hidden"
              style={{ background: 'radial-gradient(circle at 35% 30%, #2a1a11, #0d0805)' }}>
               <User className="w-12 h-12 text-[#c9a84c]/80 drop-shadow-lg" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-[var(--text-primary)] tracking-tighter">
              {user?.display_name || user?.email?.split('@')[0]}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={cn("px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border", badge.color, badge.border)}>
                {badge.icon} <span className="ml-2">{badge.label}</span>
              </Badge>
              <Badge className="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-900 border border-zinc-800 text-zinc-400">
                {user?.role} NODE
              </Badge>
              <span className="text-zinc-500 text-xs font-bold ml-2">Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={handleLogout} className="bg-[#8b2252]/10 hover:bg-[#8b2252]/20 border-[#6b1c23]/30 text-[#8b2252] font-black h-12 px-8 rounded-2xl">
          <LogOut className="w-4 h-4 mr-2" />
          TERMINATE SESSION
        </Button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'details', label: 'Identity Details', icon: User },
            { id: 'security', label: 'Active Sessions', icon: ShieldCheck },
            { id: 'api', label: 'Access Tokens', icon: Key },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border",
                activeTab === t.id
                  ? "glass-card border-[#b87333]/30 text-[#c9a84c]"
                  : "bg-transparent border-transparent text-[var(--text-muted)] hover:bg-[#b87333]/5 hover:text-[var(--text-secondary)]"
              )}
            >
              <t.icon className="w-5 h-5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 space-y-8">
          {activeTab === 'details' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <Card variant="glass" className="p-10 space-y-8">
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-3">
                    <Settings className="w-5 h-5 text-[#c9a84c]" />
                    Identity Protocol
                  </h2>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Update your node identification and credentials.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Universal ID (Email)</label>
                    <div className="flex items-center gap-4 px-6 py-4 bg-black/40 border-2 border-[#3e1b0d]/40 rounded-sm text-[var(--text-secondary)] font-bold">
                       <Mail className="w-4 h-4 text-[var(--text-muted)]" />
                       {user?.email}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Alias / Display Name</label>
                    <div className="flex gap-4">
                      <input 
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="Human Alias"
                        className="flex-1 px-6 py-4 bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm outline-none focus:border-[#b87333]/60 text-[var(--text-primary)] font-bold transition-all"
                      />
                      <Button onClick={handleSaveProfile} disabled={savingName} className="h-14 px-8 rounded-2xl">
                        {savingName ? <Loader2 className="animate-spin" /> : 'Save Alias'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card variant="glass" className="p-10 border-[#b87333]/20 bg-[#b87333]/[0.02]">
                 <div className="flex items-center justify-between">
                   <div className="space-y-2">
                     <h3 className="text-lg font-black text-[var(--text-primary)] flex items-center gap-3">
                        <Badge className={cn("p-1.5 rounded-lg", badge.color)}>
                           {badge.icon}
                        </Badge>
                        {badge.label} Plan
                     </h3>
                     <p className="text-xs text-zinc-500 font-medium">Your account is currently running on the {user?.plan} infrastructure.</p>
                   </div>
                   {user?.plan === 'free' && (
                     <Button className="industrial-copper h-12 px-8 rounded-2xl font-black">
                        UPGRADE NODE
                     </Button>
                   )}
                 </div>
              </Card>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Current Active Sessions</p>
                <Button variant="secondary" onClick={revokeAllOtherSessions} className="text-[10px] h-8 font-black uppercase tracking-widest bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-transparent">
                  Purge Other Nodes
                </Button>
              </div>
              {sessions.map(s => (
                <Card key={s.id} variant="glass" className={cn("p-6 flex items-center justify-between group", s.is_current && "border-[#c9a84c]/30 bg-[#c9a84c]/5")}>
                   <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-sm border-2 border-[#3e1b0d]/60 flex items-center justify-center text-[var(--text-muted)]">
                        <Monitor className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                           <span className="text-sm font-black text-[var(--text-primary)] font-mono tracking-tighter truncate max-w-xs">{s.user_agent || 'Unknown Identity'}</span>
                           {s.is_current && <Badge className="bg-[#4a8b6e]/10 text-[#4a8b6e] border-[#4a8b6e]/20 text-[9px] font-black px-2 py-0.5 rounded-lg">PRIMARY NODE</Badge>}
                        </div>
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                           {new Date(s.created_at).toLocaleString()} • IP: {s.ip_address || '---'}
                        </p>
                      </div>
                   </div>
                   {!s.is_current && (
                     <button onClick={() => revokeSession(s.id)} className="p-3 rounded-sm border border-transparent hover:border-[#3e1b0d]/40 text-[var(--text-muted)] hover:text-[#8b2252] transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                </Card>
              ))}
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <Card variant="glass" className="p-10 space-y-6">
                <div className="space-y-2">
                   <h2 className="text-xl font-black text-[var(--text-primary)]">Issue API Access Token</h2>
                   <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Automate your identity across external services.</p>
                </div>
                <div className="flex gap-4">
                  <input 
                    value={newTokenName}
                    onChange={e => setNewTokenName(e.target.value)}
                    placeholder="Token Label (e.g. CLI-Access)"
                    className="flex-1 px-6 py-4 bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm outline-none focus:border-[#b87333]/60 text-[var(--text-primary)] font-bold transition-all"
                  />
                  <Button onClick={handleGenerateToken} disabled={!newTokenName.trim()} className="h-14 px-8 rounded-2xl font-black">
                    GENERATE
                  </Button>
                </div>

                {newTokenSecret && (
                  <div className="mt-8 p-6 bg-[#e67e22]/8 border border-[#e67e22]/25 rounded-2xl space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-[#e67e22]/15 text-[#e67e22]">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-[#e67e22] font-black uppercase tracking-widest">Sensitive Secret Key</p>
                        <p className="text-[10px] text-[#e67e22]/70 font-bold leading-relaxed">This key will only be shown once. Secure it in your cryptographic vault immediately.</p>
                      </div>
                    </div>
                    <div className="flex items-center bg-black/60 border border-white/5 rounded-xl p-4">
                       <code className="flex-1 font-mono text-[#c9a84c] text-sm overflow-hidden text-ellipsis">{newTokenSecret}</code>
                       <CopyButton text={newTokenSecret} />
                    </div>
                    <Button variant="secondary" onClick={() => setNewTokenSecret(null)} className="w-full h-10 border-transparent bg-white/5 font-black text-[10px] uppercase">Acknowledged & Secured</Button>
                  </div>
                )}
              </Card>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Issued Tokens</p>
                {tokens.length === 0 && <p className="text-center py-10 text-[var(--text-muted)] text-sm italic">No active tokens found in this node.</p>}
                {tokens.map(t => (
                  <Card key={t.id} variant="glass" className="p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-sm border-2 border-[#3e1b0d]/60 flex items-center justify-center text-[#c9a84c]">
                        <Key className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-black text-[var(--text-primary)]">{t.name}</p>
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                           ct_{t.token_prefix}•••••••• • Issued {new Date(t.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => revokeApiToken(t.id)} className="p-3 rounded-sm border border-transparent hover:border-[#3e1b0d]/40 text-[var(--text-muted)] hover:text-[#8b2252] transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
