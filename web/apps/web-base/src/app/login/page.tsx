'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, startRegistration, completeRegistration, requestPasswordReset, resetPassword } from '../actions/auth';
import { Mail, KeyRound, Loader2, ArrowLeft, Lock, ShieldCheck, Zap, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { Button, Card, Badge, cn, CursorEffect } from "@catest/ui";

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify_register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'login') {
        const res = await loginUser(email, password);
        if (res.error) setError(res.error);
        else {
          localStorage.setItem('user', JSON.stringify({ email }));
          router.push('/');
        }
      } else if (mode === 'register') {
        const res = await startRegistration(email, password);
        if (res.error) setError(res.error);
        else {
          setMessage('Verification code dispatched to node.');
          setMode('verify_register');
        }
      } else if (mode === 'verify_register') {
        const res = await completeRegistration(email, code);
        if (res.error) setError(res.error);
        else {
          localStorage.setItem('user', JSON.stringify({ email }));
          router.push('/');
        }
      } else if (mode === 'forgot') {
        const res = await requestPasswordReset(email);
        if (res.error) setError(res.error);
        else {
          setMessage('Identity recovery code sent.');
          setMode('reset');
        }
      } else if (mode === 'reset') {
        const res = await resetPassword(email, code, password);
        if (res.error) setError(res.error);
        else {
          setMessage('Credentials updated successfully.');
          setMode('login');
          setPassword('');
          setCode('');
        }
      }
    } catch (err) {
      setError('Communication failed: Identity node unreachable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-6 sm:p-10 overflow-hidden bg-[#050505]">
      {/* Custom steampunk cursor */}
      <CursorEffect />
      {/* Background System */}
      <div className="bg-mesh" />
      <div className="bg-grid opacity-20" />
      
      {/* Dynamic Background Halo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#b87333]/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />

      <Card variant="glass" className="w-full max-w-[480px] p-0 relative z-10 border-white/10 shadow-[0_32px_128px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in-95 duration-1000">
        
        {/* Top Feature Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-transparent via-[#b87333] to-transparent opacity-50" />

        {/* Header */}
        <div className="relative p-10 text-center border-b border-white/5 bg-white/[0.01]">
          {(mode === 'forgot' || mode === 'reset' || mode === 'verify_register') && (
            <button 
              onClick={() => { setMode(mode === 'verify_register' ? 'register' : 'login'); setError(''); setMessage(''); setPassword(''); }}
              className="absolute left-8 top-10 p-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all group"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}
          
          <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6 group">
            <div className="absolute inset-0 bg-[#b87333]/20 rounded-[32px] blur-2xl group-hover:bg-[#b87333]/30 transition-all duration-700"></div>
            <div className="relative w-24 h-24 rounded-[32px] bg-white border border-white/20 flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform duration-500 overflow-hidden">
               <Image 
                src="/icon.png" 
                alt="CATEST" 
                width={56}
                height={56}
                className="object-contain" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
            </div>
          </div>

          <h1 className="text-4xl font-black text-white tracking-tighter mb-2 flex items-center justify-center gap-3">
            CATEST
          </h1>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.3em] px-8 leading-relaxed opacity-80 text-center">
            {mode === 'login' && 'Intelligent Language Model Workspace'}
            {mode === 'register' && 'Distributed Code Review Ecosystem'}
            {mode === 'verify_register' && 'Identity Verification Required'}
            {mode === 'forgot' && 'Account Recovery Protocol'}
            {mode === 'reset' && 'Security Policy Update'}
          </p>
        </div>

        {/* Tab Switcher */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex border-b border-[#3e1b0d]/30 p-2 gap-2" style={{ background: 'linear-gradient(180deg, rgba(26,17,8,0.6), rgba(13,10,4,0.4))' }}>
            {[
              { id: 'login', label: 'Authorized Access' },
              { id: 'register', label: 'Create Identity' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setMode(tab.id as any); setError(''); }}
                type="button"
                className={cn(
                  "flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-sm",
                  mode === tab.id
                    ? "glass-card text-[#c9a84c] shadow-lg border border-[#b87333]/20"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Form Body */}
        <div className="p-10 space-y-8">
          {error && (
            <div className="p-5 bg-[#8b2252]/10 border-2 border-[#6b1c23]/30 rounded-sm text-[#c9384a] text-[11px] font-bold text-center flex items-center justify-center gap-3 animate-in shake-in duration-500">
              <Lock className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {message && (
            <div className="p-5 bg-[#4a8b6e]/10 border-2 border-[#4a8b6e]/20 rounded-sm text-[#4a8b6e] text-[11px] font-bold text-center flex items-center justify-center gap-3">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {message}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-8">
            <div className="space-y-6">
              {/* Email Field */}
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Identity (Email)</label>
                <div className="group/field flex items-center w-full bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm focus-within:border-[#b87333]/50 transition-all">
                  <div className="flex-shrink-0 pl-5 flex items-center pointer-events-none text-[var(--text-muted)] group-focus-within/field:text-[#c9a84c] transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    disabled={mode === 'reset' || mode === 'verify_register'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent pl-3 pr-6 py-5 text-sm text-zinc-200 placeholder-zinc-700 outline-none font-medium disabled:opacity-40"
                    placeholder="name@system.node"
                  />
                </div>
              </div>

              {/* Password Field */}
              {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Security Key (Password)</label>
                  <div className="group/field flex items-center w-full bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm focus-within:border-[#b87333]/50 transition-all">
                    <div className="flex-shrink-0 pl-5 flex items-center pointer-events-none text-[var(--text-muted)] group-focus-within/field:text-[#c9a84c] transition-colors">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent pl-3 pr-6 py-5 text-sm text-zinc-200 placeholder-zinc-700 outline-none font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              {/* Verification Code Field */}
              {(mode === 'reset' || mode === 'verify_register') && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Audit Code</label>
                  <div className="group/field flex items-center w-full bg-black/50 border-2 border-[#3e1b0d]/60 rounded-sm focus-within:border-[#b87333]/50 transition-all">
                    <div className="flex-shrink-0 pl-5 flex items-center pointer-events-none text-[var(--text-muted)] group-focus-within/field:text-[#c9a84c] transition-colors">
                      <KeyRound size={18} />
                    </div>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent pl-3 pr-4 py-5 text-center tracking-[0.5em] text-xl font-mono text-white placeholder-zinc-700 outline-none"
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>
                </div>
              )}
            </div>

            {mode === 'login' && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); }}
                  className="text-[10px] font-bold text-zinc-600 hover:text-[#c9a84c] uppercase tracking-widest transition-colors"
                >
                  Retrieve Account
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden group/submit rounded-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#8b5e34] via-[#b87333] to-[#8b5e34] group-hover/submit:scale-x-110 transition-transform duration-500" />
              <div className="relative py-5 px-6 flex justify-center items-center gap-3">
                {loading ? <Loader2 size={20} className="animate-spin text-white/50" /> : (
                  <>
                    <span className="text-white text-[11px] font-black uppercase tracking-[0.4em]">
                      {mode === 'login' && 'Establish Connection'}
                      {mode === 'register' && 'Request Verification'}
                      {mode === 'verify_register' && 'Verify & Sync'}
                      {mode === 'forgot' && 'Begin Recovery'}
                      {mode === 'reset' && 'Update Protocol'}
                    </span>
                    <Zap className="w-4 h-4 text-white group-hover/submit:rotate-12 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="p-10 border-t border-white/5 bg-black/20 text-center">
            <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
              <Sparkles className="w-3 h-3" />
              Distributed Cryptographic Workload
            </p>
        </div>
      </Card>
    </div>
  );
}
