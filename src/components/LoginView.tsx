import React, { useState } from 'react';
import { Mail, Lock, LogIn, ArrowLeft, ArrowRight, ShieldCheck, Check, User, MapPin, RefreshCw, Zap, Sparkles, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { translations } from '../translations';
import { ViewType } from '../types';
import { motion } from 'motion/react';
import { SecurityCaptcha } from './SecurityCaptcha';
import { auth } from '../lib/firebase';

interface LoginViewProps {
  lang: 'ar' | 'en';
  setView: (view: ViewType) => void;
  defaultTab?: 'customer_google' | 'email';
}

export const LoginView: React.FC<LoginViewProps> = ({ lang, setView, defaultTab }) => {
  const { login, signInWithGoogle, resetPassword } = useAuth();
  const t = translations[lang];
  const isAr = lang === 'ar';
  
  const [activeTab, setActiveTab] = useState<'customer_google' | 'email'>(() => {
    if (localStorage.getItem('enerjoo_prefill_email')) return 'email';
    return defaultTab || 'customer_google';
  });

  // Email / Supplier state
  const [email, setEmail] = useState(() => {
    const prefill = localStorage.getItem('enerjoo_prefill_email');
    if (prefill) {
      localStorage.removeItem('enerjoo_prefill_email');
      return prefill;
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [isNotAllowedError, setIsNotAllowedError] = useState(false);
  const [isPopupBlockedError, setIsPopupBlockedError] = useState(false);

  const [isUnauthorizedDomainError, setIsUnauthorizedDomainError] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState('');
  const [isNetworkError, setIsNetworkError] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError(isAr ? 'يرجى كتابة بريدك الإلكتروني في الحقل أعلاه أولاً لنرسل لك رابط استعادة كلمة المرور.' : 'Please enter your email address above first to receive a password reset link.');
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      await resetPassword(email.trim());
      setResetMessage(isAr 
        ? `تم إرسال رابط إعادة تعيين كلمة المرور إلى (${email.trim()}). تفقد بريدك الوارد ومجلد الرسائل غير المرغوبة (Spam).` 
        : `Password reset link sent to (${email.trim()}). Please check your inbox and spam folder.`);
    } catch (resetErr: any) {
      console.warn("Password reset notice:", resetErr);
      setError(isAr ? 'تعذر إرسال رابط الاستعادة حالياً. تأكد من صحة البريد الإلكتروني.' : 'Failed to send reset link. Please verify the email address.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaVerified) {
      setError(isAr ? 'يرجى إكمال التحقق الأمني أولاً (أنا لست برنامج روبوت)' : "Please complete the security verification first (I'm not a robot)");
      setErrorCode(null);
      return;
    }
    setLoading(true);
    setError('');
    setErrorCode(null);
    setIsNotAllowedError(false);
    setIsPopupBlockedError(false);
    setIsUnauthorizedDomainError(false);
    setIsNetworkError(false);
    try {
      const loggedInUser = await login(email, password);
      setView(
        loggedInUser?.type === 'supplier' || loggedInUser?.type === 'admin'
          ? 'supplier-dashboard'
          : 'home'
      );
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-email') {
        console.warn("Login attempt notice:", code);
      } else {
        console.warn("Login notice:", error?.message || error);
      }
      setErrorCode(code || null);
      let message = isAr ? 'خطأ في البريد الإلكتروني أو كلمة المرور' : 'Invalid email or password';
      const isNotAllowed = code === 'auth/operation-not-allowed' || error.message?.includes('auth/operation-not-allowed');
      
      if (code === 'auth/user-not-found') message = isAr ? 'هذا الحساب غير مسجل لدينا، يرجى إنشاء حساب جديد.' : 'User not found. Please register an account.';
      else if (code === 'auth/wrong-password') message = isAr ? 'كلمة المرور غير صحيحة.' : 'Wrong password.';
      else if (code === 'auth/invalid-credential') message = isAr ? 'بيانات الدخول غير صحيحة. يمكنك استعادة كلمة المرور إذا نسيتها.' : 'Invalid credentials. You can reset your password if forgotten.';
      else if (code === 'auth/network-request-failed') {
        setIsNetworkError(true);
        message = isAr ? 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت أو فتح التطبيق في نافذة جديدة.' : 'Network error. Please check your internet connection or open the app in a new tab.';
      } else if (isNotAllowed) {
        setIsNotAllowedError(true);
        message = isAr ? 'تسجيل الدخول بالبريد غير مفعّل في لوحة Firebase الخاصة بك حالياً.' : 'Email authentication is not enabled in your Firebase console.';
      } else if (code === 'auth/unauthorized-domain') {
        setIsUnauthorizedDomainError(true);
        const currentHost = window.location.hostname || 'enerjoo.com';
        setUnauthorizedDomain(currentHost);
        message = isAr
          ? `النطاق الحالي (${currentHost}) غير مصرح به في Firebase Authentication.`
          : `The current domain (${currentHost}) is not authorized in Firebase Authentication.`;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async (roleToUse: 'customer' | 'supplier' = 'customer') => {
    setLoading(true);
    setError('');
    setErrorCode(null);
    setIsPopupBlockedError(false);
    setIsNotAllowedError(false);
    setIsUnauthorizedDomainError(false);
    setIsNetworkError(false);
    try {
      const normalizedRole = roleToUse === 'supplier' ? 'supplier' : 'customer';
      const loggedInUser = await signInWithGoogle(normalizedRole);
      if (loggedInUser) {
        setView(
          loggedInUser.type === 'supplier' || loggedInUser.type === 'admin'
            ? 'supplier-dashboard'
            : 'home'
        );
      }
    } catch (err: any) {
      const code = err?.code || '';
      setErrorCode(code || null);
      const isPopupClosed = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
      if (isPopupClosed) {
        console.info("Google Sign In popup was closed by the user.");
        return;
      }

      console.warn("Google Sign In Notice:", err);
      let message = isAr ? 'فشل تسجيل الدخول باستخدام Google' : 'Google sign in failed';
      const isPopupBlocked = code === 'auth/popup-blocked' || 
                             err?.message?.includes('auth/popup-blocked');
      const isUnauthorized = code === 'auth/unauthorized-domain' || 
                             err?.message?.includes('auth/unauthorized-domain');
      const isNotAllowed = code === 'auth/operation-not-allowed' || 
                           err?.message?.includes('auth/operation-not-allowed');
      const isNetworkErr = code === 'auth/network-request-failed' || err?.message?.includes('auth/network-request-failed');

      if (isUnauthorized) {
        setIsUnauthorizedDomainError(true);
        const currentHost = window.location.hostname || 'enerjoo.com';
        setUnauthorizedDomain(currentHost);
        message = isAr 
          ? `النطاق الحالي (${currentHost}) غير مصرح به في Firebase Authentication.`
          : `The current domain (${currentHost}) is not authorized in Firebase Authentication.`;
      } else if (isPopupBlocked) {
        setIsPopupBlockedError(true);
        message = isAr 
          ? 'تم حظر نافذة تسجيل الدخول المنبثقة من قبل المتصفح أو بيئة الإطار (iframe).' 
          : 'Google sign-in popup was blocked by your browser or iframe sandbox.';
      } else if (isPopupClosed) {
        message = isAr 
          ? 'تم إغلاق نافذة تسجيل الدخول بـ Google قبل إكمال العملية.'
          : 'Google sign-in popup was closed before completion.';
      } else if (isNotAllowed) {
        setIsNotAllowedError(true);
        message = isAr 
          ? 'تسجيل الدخول بواسطة Google غير مفعّل في لوحة Firebase Console.'
          : 'Google Sign-in is not enabled in your Firebase Console.';
      } else if (isNetworkErr) {
        setIsNetworkError(true);
        message = isAr 
          ? 'تعذر الاتصال بـ Google من داخل إطار المعاينة (iframe). يُرجى فتح التطبيق في نافذة مستقلة جديدة.' 
          : 'Could not connect to Google from inside the preview iframe. Please open the app in a new tab.';
      } else if (code === 'auth/account-exists-with-different-credential') {
        message = isAr ? 'الحساب موجود بالفعل بطريقة تسجيل دخول مختلفة' : 'Account exists with different credential';
      } else if (err.message) {
        message = `${isAr ? 'خطأ' : 'Error'}: ${err.message}`;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto pt-6 pb-20 font-sans px-4 ltr:text-left rtl:text-right"
    >
      {/* Top Enerjoo Official Logo Container - Clickable to Home */}
      <div className="flex flex-col items-center justify-center mb-6 text-center">
        <button
          type="button"
          id="login-enerjoo-logo-btn"
          onClick={() => setView('home')}
          className="group focus:outline-none transition-all active:scale-95 flex items-center justify-center py-1 px-4 rounded-2xl hover:bg-white/60"
          title={isAr ? 'العودة للصفحة الرئيسية - Enerjoo' : 'Return to Home - Enerjoo'}
        >
          <img 
            id="login-enerjoo-logo"
            src="/enerjoo-logo-original-2026.jpeg" 
            alt="Enerjoo - عالم الطاقة بين يديك" 
            className="w-44 sm:w-52 max-w-full h-auto object-contain select-none group-hover:scale-105 transition-transform duration-200 block"
            referrerPolicy="no-referrer"
          />
        </button>
      </div>

      {/* Main Login Card Container */}
      <div className="bg-white rounded-[2.5rem] px-6 py-10 md:p-10 border border-solar-border/40 shadow-[0_15px_50px_rgba(0,0,0,0.03)] relative">
        {/* Headings */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-solar-text mb-2 tracking-tight">
            {isAr ? 'مرحباً بك مجدداً' : 'Welcome Back'}
          </h2>
          <p className="text-solar-muted text-sm font-bold opacity-80">
            {isAr ? 'سجّل دخولك لحفظ طلباتك وعروض الأسعار' : 'Sign in to access your saved requests and quotes'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-solar-light p-1.5 rounded-2xl border border-solar-border mb-6">
          <button
            type="button"
            onClick={() => { setActiveTab('customer_google'); setError(''); }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'customer_google'
                ? 'bg-white text-solar-blue shadow-sm'
                : 'text-solar-muted hover:text-solar-text'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.35 1 3.37 3.65 1.41 7.54l3.88 3C6.22 7.74 8.88 5.04 12 5.04z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.45h6.45c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.5z" />
              <path fill="#FBBC05" d="M5.29 14.3C5.03 13.52 4.88 12.69 4.88 11.83c0-.86.15-1.69.41-2.47L1.41 6.36C.51 8.16 0 10.15 0 12.27c0 2.12.51 4.11 1.41 5.91l3.88-3.88z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.1.74-2.5 1.18-4.3 1.18-3.12 0-5.78-2.7-6.71-5.5l-3.88 3C3.37 20.35 7.35 23 12 23z" />
            </svg>
            <span>{isAr ? 'دخول العملاء (Google)' : 'Customer (Google Login)'}</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('email'); setError(''); }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'email'
                ? 'bg-white text-solar-blue shadow-sm'
                : 'text-solar-muted hover:text-solar-text'
            }`}
          >
            <Briefcase size={14} />
            <span>{isAr ? 'دخول الموردين والشركات' : 'Suppliers & Companies'}</span>
          </button>
        </div>

        {activeTab === 'customer_google' ? (
          <div className="space-y-6 pt-2">
            <div className="p-4 bg-solar-light rounded-2xl border border-solar-border text-center space-y-2">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                <Sparkles size={18} className="text-solar-blue animate-pulse" />
              </div>
              <h3 className="font-black text-sm text-solar-text">
                {isAr ? 'تسجيل دخول العملاء السريع' : 'Instant Customer Sign-In'}
              </h3>
              <p className="text-xs text-solar-muted leading-relaxed">
                {isAr 
                  ? 'سجّل دخولك بحساب Google / Gmail بضغطة واحدة لمتابعة وتصميم محطاتك الشمسية وحفظ عروض الأسعار تلقائياً.' 
                  : 'Sign in with your Google / Gmail account in one click to manage and track your solar station designs.'}
              </p>
            </div>

            {/* Prominent Google Login Button */}
            <button 
              type="button"
              disabled={loading}
              onClick={() => handleGoogleSignIn('customer')}
              className="w-full bg-white text-solar-text border-2 border-slate-200 hover:border-solar-blue/60 rounded-2xl py-4.5 font-black hover:bg-slate-50 shadow-md shadow-slate-100 flex items-center justify-center gap-3 transition-all active:scale-98 text-sm cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-solar-blue/30 border-t-solar-blue rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.35 1 3.37 3.65 1.41 7.54l3.88 3C6.22 7.74 8.88 5.04 12 5.04z" />
                    <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.45h6.45c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.5z" />
                    <path fill="#FBBC05" d="M5.29 14.3C5.03 13.52 4.88 12.69 4.88 11.83c0-.86.15-1.69.41-2.47L1.41 6.36C.51 8.16 0 10.15 0 12.27c0 2.12.51 4.11 1.41 5.91l3.88-3.88z" />
                    <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.1.74-2.5 1.18-4.3 1.18-3.12 0-5.78-2.7-6.71-5.5l-3.88 3C3.37 20.35 7.35 23 12 23z" />
                  </svg>
                  <span>{isAr ? 'المتابعة باستخدام حساب Google' : 'Continue with Google Account'}</span>
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-solar-danger/10 text-solar-danger rounded-2xl text-xs font-bold border border-solar-danger/20 text-center space-y-2 leading-relaxed">
                <p>{error}</p>
                {isPopupBlockedError && (
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="w-full bg-solar-blue text-white py-2 px-3 rounded-xl font-black text-xs mt-2"
                  >
                    <span>فتح التطبيق في نافذة جديدة</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
        /* Supplier/Admin Login Container */
        <div className="space-y-6 pt-2">
          {/* Quick Google Login for Suppliers */}
          <div className="p-4 bg-solar-light rounded-2xl border border-solar-border text-center space-y-2">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Briefcase size={18} className="text-solar-blue" />
            </div>
            <h3 className="font-black text-sm text-solar-text">
              {isAr ? 'دخول الموردين السريع بحساب Google' : 'Supplier Fast Sign-In with Google'}
            </h3>
            <p className="text-xs text-solar-muted leading-relaxed">
              {isAr 
                ? 'سجّل دخولك بحساب Google للدخول فوراً إلى لوحة تحكم الموردين وإدارة منتجاتك بسهولة.' 
                : 'Sign in with your Google account to access your supplier dashboard and manage products.'}
            </p>
          </div>

          <button 
            type="button"
            disabled={loading}
            onClick={() => handleGoogleSignIn('supplier')}
            className="w-full bg-white text-solar-text border-2 border-slate-200 hover:border-solar-blue/60 rounded-2xl py-4 font-black hover:bg-slate-50 shadow-md shadow-slate-100 flex items-center justify-center gap-3 transition-all active:scale-98 text-sm cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-solar-blue/30 border-t-solar-blue rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.35 1 3.37 3.65 1.41 7.54l3.88 3C6.22 7.74 8.88 5.04 12 5.04z" />
                  <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.45h6.45c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.5z" />
                  <path fill="#FBBC05" d="M5.29 14.3C5.03 13.52 4.88 12.69 4.88 11.83c0-.86.15-1.69.41-2.47L1.41 6.36C.51 8.16 0 10.15 0 12.27c0 2.12.51 4.11 1.41 5.91l3.88-3.88z" />
                  <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.1.74-2.5 1.18-4.3 1.18-3.12 0-5.78-2.7-6.71-5.5l-3.88 3C3.37 20.35 7.35 23 12 23z" />
                </svg>
                <span>{isAr ? 'دخول الموردين بحساب Google' : 'Sign in as Supplier with Google'}</span>
              </>
            )}
          </button>

          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-solar-border"></div>
            <span className="px-3 text-xs text-solar-muted font-bold">{isAr ? 'أو بواسطة البريد وكلمة المرور' : 'Or with Email & Password'}</span>
            <div className="flex-1 border-t border-solar-border"></div>
          </div>

          {/* Supplier/Admin Email Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Email input field */}
          <div className="space-y-1.5 text-right">
            <label className="text-[11px] font-extrabold text-solar-muted mr-1">
              {isAr ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative">
              {isAr ? (
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-solar-muted/60" size={18} />
              ) : (
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted/60" size={18} />
              )}
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full bg-solar-bg border border-solar-border rounded-2xl py-4 ${
                  isAr ? 'pr-12 pl-4' : 'pl-12 pr-4'
                } outline-none focus:border-solar-blue/60 transition shadow-sm font-bold text-sm text-solar-text placeholder:text-solar-muted/45`}
                placeholder="name@company.com" 
              />
            </div>
          </div>

          {/* Password input field */}
          <div className="space-y-1.5 text-right">
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={resetLoading}
                onClick={handleForgotPassword}
                className="text-[11px] font-extrabold text-solar-blue hover:underline cursor-pointer flex items-center gap-1"
              >
                {resetLoading ? (
                  <span className="animate-pulse">{isAr ? 'جارِ الإرسال...' : 'Sending...'}</span>
                ) : (
                  <span>{isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</span>
                )}
              </button>
              <label className="text-[11px] font-extrabold text-solar-muted mr-1">
                {isAr ? 'كلمة المرور' : 'Password'}
              </label>
            </div>
            <div className="relative">
              {isAr ? (
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-solar-muted/60" size={18} />
              ) : (
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted/60" size={18} />
              )}
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full bg-solar-bg border border-solar-border rounded-2xl py-4 ${
                  isAr ? 'pr-12 pl-4' : 'pl-12 pr-4'
                } outline-none focus:border-solar-blue/60 transition shadow-sm font-bold text-sm text-solar-text placeholder:text-solar-muted/45`}
                placeholder="••••••••" 
              />
            </div>
          </div>

          {resetMessage && (
            <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-bold text-center leading-relaxed">
              {resetMessage}
            </div>
          )}

          {/* Integrated Verification reCAPTCHA Container */}
          <SecurityCaptcha lang={lang} onVerify={setCaptchaVerified} />

          {error && (
            <div className="p-4 bg-solar-danger/10 text-solar-danger rounded-2xl text-xs font-bold border border-solar-danger/20 text-center space-y-2.5 leading-relaxed">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span>{error}</span>
                {errorCode && (
                  <span className="font-mono text-[10px] bg-solar-danger/20 text-solar-danger px-2 py-0.5 rounded-md" dir="ltr">
                    {errorCode}
                  </span>
                )}
              </div>
              
              {isNotAllowedError && (
                <div className="p-3 bg-white rounded-xl border border-solar-danger/20 text-[10px] font-bold text-solar-muted text-right space-y-1.5">
                  <span className="text-amber-500 block">🎛️ تفعيل المصادقة في لوحة Firebase:</span>
                  <p>
                    المشروع المرتبط: <strong className="font-mono text-solar-blue" dir="ltr">gen-lang-client-0409057996</strong>
                  </p>
                  <p>اذهب إلى Firebase Console &gt; Authentication &gt; Sign-in method وقم بتمكين خيار Google أو Email/Password ثم احفظ التغييرات.</p>
                </div>
              )}

              {isUnauthorizedDomainError && (
                <div className="p-3 bg-white rounded-xl border border-solar-danger/20 text-[10px] font-bold text-solar-muted text-right space-y-2">
                  <span className="text-amber-600 font-black block">⚙️ إضافة النطاق إلى Firebase Authorized Domains:</span>
                  <p className="text-solar-text">
                    النطاق الحالي <code className="bg-slate-100 px-1 py-0.5 rounded text-solar-blue font-mono font-bold">{unauthorizedDomain}</code> غير مضاف في قائمة النطاقات المسموحة في Firebase Authentication.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(unauthorizedDomain);
                        alert(isAr ? 'تم نسخ النطاق بنجاح!' : 'Domain copied!');
                      }}
                      className="bg-solar-blue/10 text-solar-blue px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-solar-blue/20 transition"
                    >
                      📋 {isAr ? 'نسخ اسم النطاق' : 'Copy Domain'}
                    </button>
                    <a 
                      href="https://console.firebase.google.com/project/gen-lang-client-0409057996/authentication/settings" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-solar-blue text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-opacity-90 transition flex items-center gap-1"
                    >
                      🚀 {isAr ? 'فتح إعدادات Firebase مباشرة' : 'Open Firebase Settings'}
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Solid Blue submit styled button */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-solar-blue text-white py-4 rounded-2xl font-black hover:bg-opacity-95 shadow-lg shadow-solar-blue/20 transition-all active:scale-95 flex items-center justify-center gap-2 group text-sm"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <div className="flex items-center justify-center gap-2">
                {isAr ? (
                  <>
                    <ArrowLeft size={18} className="group-hover:-translate-x-1.5 transition-transform" />
                    <span>تسجيل الدخول للموردين</span>
                  </>
                ) : (
                  <>
                    <span>Supplier Sign In</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
                  </>
                )}
              </div>
            )}
          </button>
        </form>
        </div>
        )}

        {/* Footer info/redirection */}
        <div className="mt-8 text-center pt-6 border-t border-solar-border/70">
          <p className="text-xs text-solar-muted font-bold">
            {t.dontHaveAccount} <button onClick={() => setView('register')} className="text-solar-blue font-black hover:underline">{t.register}</button>
          </p>
        </div>
      </div>
    </motion.div>
  );
};

