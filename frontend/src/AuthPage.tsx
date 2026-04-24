import React, { useState } from 'react';
import { supabase } from './supabaseClient';

interface AuthPageProps {
  onAuthSuccess: () => void;
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });
        if (signupError) throw signupError;
        setSuccess('Account created! Check your email to confirm, then sign in.');
        setMode('login');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        onAuthSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050505] flex items-center justify-center overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
           style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      {/* Neon glow blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none opacity-10"
           style={{ background: 'radial-gradient(circle, #00e5ff 0%, transparent 70%)', filter: 'blur(60px)' }}></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none opacity-10"
           style={{ background: 'radial-gradient(circle, #bf00ff 0%, transparent 70%)', filter: 'blur(60px)' }}></div>

      {/* Auth Card */}
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0a0a0a] border border-[#00e5ff]/40 shadow-[0_0_25px_rgba(0,229,255,0.2)] mb-5">
            <svg className="w-7 h-7 text-[#00e5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.7-1.388 2.4l-2.092-.523m-9.444 3.317L5 14.5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">BRAINSYNC</h1>
          <p className="text-[11px] text-[#00e5ff] uppercase tracking-[0.3em] mt-2 font-mono">AI Command Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
             style={{ boxShadow: '0 0 0 1px rgba(0,229,255,0.05), 0 20px 60px rgba(0,0,0,0.6)' }}>
          
          {/* Mode Toggle */}
          <div className="flex bg-[#050505] border border-gray-800 rounded-xl p-1 mb-8">
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-[12px] font-bold uppercase tracking-widest rounded-lg transition-all duration-200 ${mode === 'login' ? 'bg-[#111] text-white border border-gray-700' : 'text-gray-600 hover:text-gray-400'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-[12px] font-bold uppercase tracking-widest rounded-lg transition-all duration-200 ${mode === 'signup' ? 'bg-[#111] text-white border border-gray-700' : 'text-gray-600 hover:text-gray-400'}`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Arjun Sharma"
                  required
                  className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors font-mono placeholder:text-gray-700"
                />
              </div>
            )}
            
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors font-mono placeholder:text-gray-700"
              />
            </div>

            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-[#050505] border border-gray-800 rounded-xl px-4 py-3.5 text-[14px] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors font-mono placeholder:text-gray-700"
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-900/20 border border-red-800/50 rounded-xl">
                <p className="text-[12px] text-red-400 font-mono">{error}</p>
              </div>
            )}
            
            {success && (
              <div className="px-4 py-3 bg-[#00ff80]/10 border border-[#00ff80]/30 rounded-xl">
                <p className="text-[12px] text-[#00ff80] font-mono">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-4 rounded-xl bg-[#111] border border-[#00e5ff]/30 text-white font-bold text-[13px] uppercase tracking-widest hover:border-[#00e5ff]/70 hover:shadow-[0_0_20px_rgba(0,229,255,0.1)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="font-mono animate-pulse">Processing...</span>
              ) : (
                mode === 'login' ? 'Sign In →' : 'Create Account →'
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-[10px] text-gray-700 font-mono uppercase tracking-widest">
          Powered by BrainSync AI
        </p>
      </div>
    </div>
  );
}
