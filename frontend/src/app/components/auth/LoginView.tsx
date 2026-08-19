import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Lock, ArrowRight, Loader2, Leaf, ShieldCheck, KeyRound, Eye, EyeOff } from 'lucide-react';
import maizeIcon from '@/assets/maize-icon.png';
import authImage from '@/assets/maize-farm-bg.jpg';
import { signIn, forgotPassword, confirmForgotPassword } from '@/app/services/auth';

interface LoginViewProps {
  onLogin: () => void;
  onNavigateToSignup?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, onNavigateToSignup }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Forgot password flow
  const [forgotMode, setForgotMode] = useState<'none' | 'email' | 'code'>('none');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMsg('');

    if (forgotMode === 'email') {
      const result = await forgotPassword(email);
      setIsLoading(false);
      if (result.success) {
        setForgotMode('code');
        setSuccessMsg('Verification code sent to your email');
      } else {
        setError(result.message);
      }
      return;
    }

    if (forgotMode === 'code') {
      const result = await confirmForgotPassword(email, resetCode, newPassword);
      setIsLoading(false);
      if (result.success) {
        setForgotMode('none');
        setPassword(newPassword);
        setSuccessMsg('Password reset. You can now log in.');
        setResetCode('');
        setNewPassword('');
      } else {
        setError(result.message);
      }
      return;
    }

    const result = await signIn(email, password);
    setIsLoading(false);

    if (result.success) {
      onLogin();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="w-full h-screen bg-[#050505] flex overflow-hidden">
      {/* Form Side */}
      <div className="w-full lg:w-1/2 h-full flex items-center justify-center relative overflow-y-auto">
        {/* Background Ambience */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[40%] bg-emerald-900/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px]" />
        </div>

        <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10 p-8"
      >
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center shadow-2xl shadow-emerald-900/20">
              <img src={maizeIcon} alt="Maize" className="w-10 h-10 object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-light text-white tracking-tight mb-2">Maize<span className="font-bold text-emerald-500">Yield</span></h1>
          <p className="text-white/40 text-sm">Spatial Verification Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider ml-1" htmlFor="email-input">Identity</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                id="email-input"
                name="email"
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email username"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider ml-1" htmlFor="password-input">Credentials</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                id="password-input"
                name="password"
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all [&:-webkit-autofill]:bg-white/5 [&:-webkit-autofill]:text-white"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-lg bg-black/80 text-white/60 hover:text-white hover:bg-black transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm text-center">
              {successMsg}
            </div>
          )}

          {/* Forgot password — code entry */}
          {forgotMode === 'code' && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Verification code"
                value={resetCode}
                onChange={e => setResetCode(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 text-center tracking-widest"
                maxLength={6}
                required
              />
              <div className="relative group">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50"
                  required
                  minLength={8}
                />
              </div>
            </div>
          )}

          <div className="pt-4">
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <span className="relative z-10">
                    {forgotMode === 'email' ? 'Send Reset Code' : forgotMode === 'code' ? 'Reset Password' : 'Sign In'}
                  </span>
                  <ArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" size={20} />
                </>
              )}
            </button>
          </div>

          {/* Forgot Password */}
          <div className="pt-2 text-center">
            {forgotMode === 'none' ? (
              <button 
                type="button"
                onClick={() => { setForgotMode('email'); setError(''); setSuccessMsg(''); }}
                className="text-sm text-white/40 hover:text-emerald-400 transition-colors"
              >
                Forgot your password?
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => { setForgotMode('none'); setError(''); setSuccessMsg(''); setResetCode(''); setNewPassword(''); }}
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                ← Back to login
              </button>
            )}
          </div>
        </form>

        {onNavigateToSignup && (
          <div className="mt-6 text-center">
            <p className="text-sm text-white/50">
              Don't have an account?{' '}
              <button 
                onClick={onNavigateToSignup}
                className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
              >
                Sign Up
              </button>
            </p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-white/20">
          <ShieldCheck size={12} />
          <span>Encrypted Session • v2.4.0</span>
        </div>
      </motion.div>
      </div>

      {/* Image Side */}
      <div className="hidden lg:block lg:w-1/2 h-full relative">
        <img 
          src={authImage} 
          alt="Agriculture Fields" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/20 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};