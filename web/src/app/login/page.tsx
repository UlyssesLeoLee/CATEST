'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, startRegistration, completeRegistration, requestPasswordReset, resetPassword } from '../actions/auth';
import { Mail, KeyRound, Loader2, Code2, ArrowLeft, Lock } from 'lucide-react';

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

    if (mode === 'login') {
      const res = await loginUser(email, password);
      if (res.error) setError(res.error);
      else {
        localStorage.setItem('user', JSON.stringify({ email }));
        router.push('/review');
      }
    } else if (mode === 'register') {
      const res = await startRegistration(email, password);
      if (res.error) setError(res.error);
      else {
        setMessage('Verification code sent to your email.');
        setMode('verify_register');
      }
    } else if (mode === 'verify_register') {
      const res = await completeRegistration(email, code);
      if (res.error) setError(res.error);
      else {
        localStorage.setItem('user', JSON.stringify({ email }));
        router.push('/review');
      }
    } else if (mode === 'forgot') {
      const res = await requestPasswordReset(email);
      if (res.error) setError(res.error);
      else {
        setMessage('Check your email for the reset code.');
        setMode('reset');
      }
    } else if (mode === 'reset') {
      const res = await resetPassword(email, code, password);
      if (res.error) setError(res.error);
      else {
        setMessage('Password reset successfully. Please log in.');
        setMode('login');
        setPassword('');
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all">
        
        {/* Header */}
        <div className="relative p-8 text-center border-b border-slate-800">
          {(mode === 'forgot' || mode === 'reset' || mode === 'verify_register') && (
            <button 
              onClick={() => { setMode(mode === 'verify_register' ? 'register' : 'login'); setError(''); setMessage(''); setPassword(''); }}
              className="absolute left-6 top-8 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 mb-6 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            <Code2 size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">CATEST</h1>
          <p className="text-slate-400 text-sm">
            {mode === 'login' && 'Sign in to your intelligent CATEST workspace'}
            {mode === 'register' && 'Join the code review revolution'}
            {mode === 'verify_register' && 'Enter the code sent to your email'}
            {mode === 'forgot' && 'We will send you a verification code'}
            {mode === 'reset' && 'Enter the code and your new password'}
          </p>
        </div>

        {/* Tab Switcher (Login/Register) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-4 text-sm font-medium transition-colors ${
                mode === 'login' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-4 text-sm font-medium transition-colors ${
                mode === 'register' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm text-center">
              {message}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-6">
            
            {/* Email Field - Used in all modes */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  disabled={mode === 'reset' || mode === 'verify_register'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all disabled:opacity-50"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            {/* Password Field - Used in login, register, reset */}
            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex justify-between">
                  <span>{mode === 'reset' ? 'New Password' : 'Password'}</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            {/* Verification Code Field - Used in register, reset, verify_register and forgot */}
            {(mode === 'reset' || mode === 'verify_register' || mode === 'register' || mode === 'forgot') && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Verification Code</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                      <KeyRound size={18} />
                    </div>
                    <input
                      type="text"
                      required={mode === 'verify_register' || mode === 'reset'}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-center tracking-widest text-lg font-mono"
                      placeholder="------"
                      maxLength={6}
                    />
                  </div>
                  {(mode === 'register' || mode === 'forgot') && (
                    <button
                      type="button"
                      onClick={async () => {
                        setLoading(true);
                        setError('');
                        const res = mode === 'register' 
                          ? await startRegistration(email, password)
                          : await requestPasswordReset(email);
                        if (res.error) setError(res.error);
                        else {
                          setMessage('Code sent to ' + email);
                          if (mode === 'register') setMode('verify_register');
                          if (mode === 'forgot') setMode('reset');
                        }
                        setLoading(false);
                      }}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-400 rounded-xl text-xs font-medium transition-colors whitespace-nowrap flex items-center justify-center min-w-[100px]"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : 'Get Code'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Forgot Password Link */}
            {mode === 'login' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); }}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 flex justify-center items-center shadow-lg shadow-indigo-500/20"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : (
                mode === 'login' ? 'Sign In' :
                mode === 'register' ? 'Send Code' :
                mode === 'verify_register' ? 'Verify & Create Account' :
                mode === 'forgot' ? 'Send Reset Code' : 'Update Password'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
