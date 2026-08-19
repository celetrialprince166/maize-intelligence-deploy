import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { User, Lock, ArrowRight, Loader2, Leaf, ShieldCheck, Mail, Building, Eye, EyeOff } from 'lucide-react';
import maizeIcon from '@/assets/maize-icon.png';
import authImage from '@/assets/maize-farm-bg.jpg';
import { signUp, confirmSignUp } from '@/app/services/auth';

interface SignupViewProps {
  onSignup: () => void;
  onNavigateToLogin: () => void;
}

export const SignupView: React.FC<SignupViewProps> = ({ onSignup, onNavigateToLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 3) return { score: 2, label: 'Fair', color: 'bg-yellow-500' };
    if (score <= 4) return { score: 3, label: 'Good', color: 'bg-emerald-400' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (needsConfirmation) {
      const result = await confirmSignUp(email, confirmCode);
      setIsLoading(false);
      if (result.success) {
        onSignup();
      } else {
        setError(result.message);
      }
      return;
    }

    const result = await signUp(email, password, fullName);
    setIsLoading(false);

    if (result.success) {
      if (result.needsConfirmation) {
        setNeedsConfirmation(true);
      } else {
        onSignup();
      }
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
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center shadow-2xl shadow-emerald-900/20">
              <img src={maizeIcon} alt="Maize" className="w-10 h-10 object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-light text-white tracking-tight mb-2">Create<span className="font-bold text-emerald-500">Account</span></h1>
          <p className="text-white/40 text-sm">Join the Spatial Verification Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <div className="space-y-1">
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider ml-1" htmlFor="name-input">Full Name</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                id="name-input"
                name="name"
                type="text" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider ml-1" htmlFor="email-input">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                id="email-input"
                name="email"
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@agriculture.gov.mw"
                autoComplete="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider ml-1" htmlFor="org-input">Organization</label>
            <div className="relative group">
              <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                id="org-input"
                name="organization"
                type="text" 
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Ministry of Agriculture"
                autoComplete="organization"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-white/40 uppercase tracking-wider ml-1" htmlFor="password-input">Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input 
                id="password-input"
                name="password"
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="new-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-12 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                required
                minLength={8}
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
            {/* Password strength indicator */}
            {password && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= passwordStrength.score ? passwordStrength.color : 'bg-white/10'}`} />
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] ${passwordStrength.score <= 1 ? 'text-red-400' : passwordStrength.score <= 2 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {passwordStrength.label}
                  </span>
                  <span className="text-[10px] text-white/30">Min 8 chars, uppercase, lowercase, number</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {needsConfirmation && (
            <div className="space-y-2">
              <p className="text-white/60 text-sm text-center">Check your email for a verification code</p>
              <input
                type="text"
                placeholder="Enter verification code"
                value={confirmCode}
                onChange={e => setConfirmCode(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 text-center tracking-widest text-lg"
                maxLength={6}
              />
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
                  <span className="relative z-10">Register Account</span>
                  <ArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" size={20} />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-white/50">
            Already have an account?{' '}
            <button 
              onClick={onNavigateToLogin}
              className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
            >
              Sign In
            </button>
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-white/20">
          <ShieldCheck size={12} />
          <span>Secure Registration • v2.4.0</span>
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
