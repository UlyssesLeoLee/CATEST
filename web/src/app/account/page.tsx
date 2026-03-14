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
import {
  User, ShieldCheck, Key, LogOut, Plus, Trash2,
  Loader2, Copy, Check, Monitor, Zap, Crown
} from 'lucide-react';

const PLAN_BADGE: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  free:       { label: 'Free',       color: 'bg-slate-700 text-slate-300',         icon: <Zap size={12} /> },
  pro:        { label: 'Pro',        color: 'bg-indigo-500/20 text-indigo-300',    icon: <ShieldCheck size={12} /> },
  enterprise: { label: 'Enterprise', color: 'bg-amber-500/20 text-amber-300',      icon: <Crown size={12} /> },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className="ml-2 p-1 text-slate-400 hover:text-slate-200 transition-colors" title="Copy">
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
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

  // Load data without triggering cascading renders:
  // We await `load` in a separate effect body to keep state updates async
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
    <div className="h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-indigo-400" />
    </div>
  );

  const plan = user?.plan ?? 'free';
  const badge = PLAN_BADGE[plan] ?? PLAN_BADGE.free;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 grid place-items-center border border-indigo-500/30 text-xs font-bold">C</div>
          CATEST
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a href="/workspace" className="text-slate-400 hover:text-slate-200 transition-colors">Workspace</a>
          <a href="/rag" className="text-slate-400 hover:text-slate-200 transition-colors">RAG</a>
          <button onClick={handleLogout} className="flex items-center gap-1 text-slate-400 hover:text-red-400 transition-colors">
            <LogOut size={15} />Logout
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Profile Hero */}
        <div className="flex items-center gap-5 mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-xl shadow-indigo-500/20 text-2xl font-bold">
            {user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user?.display_name || user?.email}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-400 text-sm">{user?.email}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-transparent ${badge.color}`}>
                {badge.icon}{badge.label}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 capitalize">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800 mb-8">
          {[
            { id: 'profile' as const, icon: <User size={15} />, label: 'Profile' },
            { id: 'sessions' as const, icon: <Monitor size={15} />, label: `Sessions (${sessions.length})` },
            { id: 'tokens' as const, icon: <Key size={15} />, label: `API Tokens (${tokens.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Profile Tab ────────────────────────────────────── */}
        {tab === 'profile' && (
          <div className="space-y-6">
            <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <h2 className="font-semibold mb-4">Profile Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Display Name</label>
                  <div className="flex gap-2">
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button onClick={handleSaveName} disabled={savingName}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                      {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Save
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Email</label>
                  <p className="bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-400">{user?.email}</p>
                </div>
              </div>
            </section>

            <section className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <h2 className="font-semibold mb-4">License</h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${badge.color}`}>
                    {badge.icon} {badge.label} Plan
                  </div>
                  {user?.license_expires_at && (
                    <p className="text-xs text-slate-500 mt-2">
                      Expires: {new Date(user.license_expires_at).toLocaleDateString()}
                    </p>
                  )}
                  {!user?.license_expires_at && plan !== 'free' && (
                    <p className="text-xs text-slate-500 mt-2">No expiry date</p>
                  )}
                </div>
                {plan === 'free' && (
                  <button className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg text-sm font-medium text-white shadow-lg shadow-indigo-500/20 hover:opacity-90 transition-opacity">
                    Upgrade to Pro
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ── Sessions Tab ───────────────────────────────────── */}
        {tab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={handleRevokeAll}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">
                <LogOut size={14} /> Revoke All Other Sessions
              </button>
            </div>
            {sessions.map(s => (
              <div key={s.id} className={`bg-slate-900 border rounded-xl p-4 flex items-center justify-between ${s.is_current ? 'border-indigo-500/40' : 'border-slate-800'}`}>
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Monitor size={15} className="text-slate-400" />
                    <span className="font-mono text-xs text-slate-400 truncate max-w-md">{s.user_agent || 'Unknown client'}</span>
                    {s.is_current && <span className="px-1.5 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-400 font-medium">Current</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Created: {new Date(s.created_at).toLocaleString()} · Expires: {new Date(s.expires_at).toLocaleDateString()}
                  </p>
                </div>
                {!s.is_current && (
                  <button onClick={() => handleRevokeSession(s.id)}
                    className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── API Tokens Tab ─────────────────────────────────── */}
        {tab === 'tokens' && (
          <div className="space-y-4">
            {/* Create new token */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="font-medium mb-3 text-sm">Create New API Token</h3>
              <div className="flex gap-2">
                <input
                  value={newTokenName}
                  onChange={e => setNewTokenName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGenerateToken()}
                  placeholder="Token description (e.g. CI Pipeline)"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={handleGenerateToken} disabled={!newTokenName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors">
                  <Plus size={14} /> Generate
                </button>
              </div>

              {/* Show raw token exactly once */}
              {newTokenSecret && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-400 font-medium mb-2">⚠ Copy this token now — it will never be shown again!</p>
                  <div className="flex items-center font-mono text-xs bg-slate-950 rounded px-3 py-2">
                    <span className="flex-1 break-all text-green-400">{newTokenSecret}</span>
                    <CopyButton text={newTokenSecret} />
                  </div>
                  <button onClick={() => setNewTokenSecret(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-300">Dismiss</button>
                </div>
              )}
            </div>

            {tokens.length === 0 && (
              <p className="text-center text-slate-500 py-8 text-sm">No API tokens yet. Create one above.</p>
            )}
            {tokens.map(t => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Key size={14} className="text-slate-400" />
                    <span className="font-medium text-sm">{t.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    ct_{t.token_prefix}••••••• · Created {new Date(t.created_at).toLocaleDateString()}
                    {t.last_used_at && ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => handleRevokeToken(t.id)}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
