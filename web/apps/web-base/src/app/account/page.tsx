'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMyAccount,
  listActiveSessions,
  listApiTokens,
  updateProfile,
  revokeSession,
  revokeAllOtherSessions,
  generateApiToken,
  revokeApiToken,
} from '../actions/account';
import { logout } from '../actions/auth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  User, ShieldCheck, Key, LogOut, Plus, Trash2,
  Loader2, Copy, Check, Monitor, Zap, Crown
} from 'lucide-react';
import { Card, Button, Badge, Spinner, cn } from "@catest/ui";

const PLAN_BADGE: Record<string, { label: string; variant: "info" | "success" | "warning" | "danger"; icon: React.ReactNode }> = {
  free:       { label: 'Free',       variant: 'info',    icon: <Zap size={12} /> },
  pro:        { label: 'Pro',        variant: 'success', icon: <ShieldCheck size={12} /> },
  enterprise: { label: 'Enterprise', variant: 'warning', icon: <Crown size={12} /> },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="ml-2 p-1.5 rounded-sm border border-[#3e1b0d]/60 text-[#c9a84c]/60 hover:text-[#c9a84c] transition-colors"
      style={{ background: 'linear-gradient(135deg, rgba(26,15,10,0.8), rgba(13,8,5,0.9))' }}
      title="Copy">
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

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenSecret, setNewTokenSecret] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [tab, setTab] = useState<'profile' | 'sessions' | 'tokens'>('profile');

  const load = useCallback(async () => {
    setLoading(true);
    const [acct, sess, toks] = await Promise.all([getMyAccount(), listActiveSessions(), listApiTokens()]);
    if ('user' in acct && acct.user) { setUser(acct.user as UserProfile); setDisplayName((acct.user as UserProfile).display_name || ''); }
    if ('sessions' in sess) setSessions((sess.sessions ?? []) as Session[]);
    if ('tokens' in toks) setTokens((toks.tokens ?? []) as ApiToken[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => { await logout(); router.replace('/login'); };

  const handleSaveName = async () => {
    setSavingName(true);
    await updateProfile(displayName);
    setSavingName(false);
  };

  const handleGenerateToken = async () => {
    if (!newTokenName.trim()) return;
    const res = await generateApiToken(newTokenName.trim());
    if ('rawToken' in res) { setNewTokenSecret(res.rawToken); setNewTokenName(''); await load(); }
  };

  const handleRevokeToken = async (id: string) => { await revokeApiToken(id); load(); };
  const handleRevokeSession = async (id: string) => { await revokeSession(id); load(); };
  const handleRevokeAll = async () => { await revokeAllOtherSessions(); load(); };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Spinner size={40} />
    </div>
  );

  const plan = user?.plan ?? 'free';
  const badge = PLAN_BADGE[plan] ?? PLAN_BADGE.free;

  return (
    <div className="min-h-screen text-[var(--text-primary)]">
      {/* Top Bar — forged metal header */}
      <header className="sticky top-0 z-10 glass-panel border-b border-[#3e1b0d]/40 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 font-black text-lg text-[var(--text-brass)] uppercase tracking-wider">
          <Image src="/icon.png" alt="CATEST" width={24} height={24} className="object-contain" />
          CATEST
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a href="/workspace" className="text-[var(--text-secondary)] hover:text-[var(--text-brass)] transition-colors font-bold uppercase tracking-widest text-[10px]">Workspace</a>
          <a href="/rag" className="text-[var(--text-secondary)] hover:text-[var(--text-brass)] transition-colors font-bold uppercase tracking-widest text-[10px]">RAG</a>
          <button onClick={handleLogout} className="flex items-center gap-1 text-[#8b2252] hover:text-[#c9384a] transition-colors font-bold uppercase tracking-widest text-[10px]">
            <LogOut size={13} />Logout
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Profile Hero — forged metal avatar */}
        <div className="flex items-center gap-5 mb-10">
          <div className="w-16 h-16 rounded-xl border-2 border-[#3e1b0d] flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,240,200,0.1)] text-2xl font-black text-[var(--text-brass)]"
            style={{ background: 'radial-gradient(circle at 35% 30%, #2a1a11, #0d0805)' }}>
            {user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">{user?.display_name || user?.email}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[var(--text-secondary)] text-xs font-bold">{user?.email}</span>
              <Badge variant={badge.variant}>
                {badge.icon}<span className="ml-1">{badge.label}</span>
              </Badge>
              <Badge variant="info">{user?.role}</Badge>
            </div>
          </div>
        </div>

        {/* Tabs — engraved metal tab bar */}
        <div className="flex gap-1 border-b border-[#3e1b0d]/40 mb-8">
          {[
            { id: 'profile' as const, icon: <User size={13} />, label: 'Profile' },
            { id: 'sessions' as const, icon: <Monitor size={13} />, label: `Sessions (${sessions.length})` },
            { id: 'tokens' as const, icon: <Key size={13} />, label: `API Tokens (${tokens.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 -mb-px transition-all",
                tab === t.id
                  ? "border-[#c9a84c] text-[#c9a84c]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Profile Tab ────────────────────────────────────── */}
        {tab === 'profile' && (
          <div className="space-y-6">
            <Card variant="glass" className="p-6">
              <h2 className="font-black text-sm uppercase tracking-widest text-[var(--text-brass)] mb-4">Profile Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mb-1.5">Display Name</label>
                  <div className="flex gap-2">
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="flex-1 bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#b87333]/60 transition-colors"
                      style={{ boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.5)' }}
                    />
                    <Button onClick={handleSaveName} disabled={savingName} size="sm">
                      {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Save
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mb-1.5">Email</label>
                  <p className="bg-black/40 border-2 border-[#3e1b0d]/40 rounded-sm px-3 py-2 text-sm text-[var(--text-secondary)]"
                    style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }}>{user?.email}</p>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-6">
              <h2 className="font-black text-sm uppercase tracking-widest text-[var(--text-brass)] mb-4">License</h2>
              <div className="flex items-center justify-between">
                <div>
                  <Badge variant={badge.variant}>
                    {badge.icon}<span className="ml-1">{badge.label} Plan</span>
                  </Badge>
                  {user?.license_expires_at && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-2 font-bold">
                      Expires: {new Date(user.license_expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {plan === 'free' && (
                  <Button variant="copper" size="sm">Upgrade to Pro</Button>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Sessions Tab ───────────────────────────────────── */}
        {tab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={handleRevokeAll}>
                <LogOut size={13} className="mr-1" /> Revoke All Other Sessions
              </Button>
            </div>
            {sessions.map(s => (
              <Card key={s.id} variant="glass" className={cn("p-4 flex items-center justify-between group", s.is_current && "border-[#c9a84c]/30")}>
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Monitor size={13} className="text-[var(--text-muted)]" />
                    <span className="font-mono text-[10px] text-[var(--text-secondary)] truncate max-w-md">{s.user_agent || 'Unknown client'}</span>
                    {s.is_current && <Badge variant="success">Current</Badge>}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 font-bold">
                    Created: {new Date(s.created_at).toLocaleString()} · Expires: {new Date(s.expires_at).toLocaleDateString()}
                  </p>
                </div>
                {!s.is_current && (
                  <button onClick={() => handleRevokeSession(s.id)}
                    className="p-2 text-[var(--text-muted)] hover:text-[#8b2252] transition-colors rounded-sm border border-transparent hover:border-[#3e1b0d]/40">
                    <Trash2 size={14} />
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* ── API Tokens Tab ─────────────────────────────────── */}
        {tab === 'tokens' && (
          <div className="space-y-4">
            <Card variant="glass" className="p-6">
              <h3 className="font-black text-sm uppercase tracking-widest text-[var(--text-brass)] mb-3">Create New API Token</h3>
              <div className="flex gap-2">
                <input
                  value={newTokenName}
                  onChange={e => setNewTokenName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGenerateToken()}
                  placeholder="Token description (e.g. CI Pipeline)"
                  className="flex-1 bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[#b87333]/60 transition-colors"
                  style={{ boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.5)' }}
                />
                <Button onClick={handleGenerateToken} disabled={!newTokenName.trim()} size="sm">
                  <Plus size={14} className="mr-1" /> Generate
                </Button>
              </div>

              {newTokenSecret && (
                <div className="mt-4 p-4 rounded-sm border-2 border-[#e67e22]/30"
                  style={{ background: 'linear-gradient(135deg, rgba(230,126,34,0.08), rgba(13,8,5,0.9))' }}>
                  <p className="text-[10px] text-[#e67e22] font-black uppercase tracking-widest mb-2">Copy this token now — it will never be shown again!</p>
                  <div className="flex items-center bg-black/60 border border-[#3e1b0d]/40 rounded-sm px-3 py-2">
                    <code className="flex-1 font-mono text-xs text-[#4a8b6e] break-all">{newTokenSecret}</code>
                    <CopyButton text={newTokenSecret} />
                  </div>
                  <button onClick={() => setNewTokenSecret(null)} className="mt-2 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] font-bold uppercase tracking-widest">Dismiss</button>
                </div>
              )}
            </Card>

            {tokens.length === 0 && (
              <p className="text-center text-[var(--text-muted)] py-8 text-xs font-bold uppercase tracking-widest">No API tokens yet. Create one above.</p>
            )}
            {tokens.map(t => (
              <Card key={t.id} variant="glass" className="p-4 flex items-center justify-between group">
                <div>
                  <div className="flex items-center gap-2">
                    <Key size={13} className="text-[var(--text-muted)]" />
                    <span className="font-black text-sm text-[var(--text-primary)]">{t.name}</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono font-bold">
                    ct_{t.token_prefix}••••••• · Created {new Date(t.created_at).toLocaleDateString()}
                    {t.last_used_at && ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => handleRevokeToken(t.id)}
                  className="p-2 text-[var(--text-muted)] hover:text-[#8b2252] transition-colors rounded-sm border border-transparent hover:border-[#3e1b0d]/40 opacity-0 group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
