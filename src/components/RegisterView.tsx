import React, { useState } from 'react';
import { Mail, Lock, User as UserIcon, Briefcase, MapPin, ArrowLeft, LogIn, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { translations } from '../translations';
import { ViewType } from '../types';
import { motion } from 'motion/react';
import { SecurityCaptcha } from './SecurityCaptcha';
import { auth } from '../lib/firebase';

export const RegisterView: React.FC<{ 
  lang: 'ar' | 'en'; 
  setView: (view: ViewType) => void;
}> = ({ lang, setView }) => {
  const { register, login, resetPassword, signInWithGoogle } = useAuth();
  const t = translations[lang];
  const isAr = lang === 'ar';
  
  const [role, setRole] = useState<'customer' | 'supplier'>('customer');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    location: '',
    phone: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isEmailInUse, setIsEmailInUse] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [directLoginLoading, setDirectLoginLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [isNotAllowedError, setIsNotAllowedError] = useState(false);
  const [isPopupBlockedError, setIsPopupBlockedError] = useState(false);
  const [isUnauthorizedDomainError, setIsUnauthorizedDomainError] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState('');
  const [isNetworkError, setIsNetworkError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      setError(isAr ? 'يرجى ملء كافة الحقول المطلوبة' : 'Please fill in all required fields');
      setErrorCode(null);
      return;
    }

    if (formData.password.length < 6) {
      setError(isAr ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
      setErrorCode(null);
      return;
    }

    if (!captchaVerified) {
      setError(isAr ? 'يرجى إكمال التحقق الأمني أولاً (أنا لست برنامج روبوت)' : "Please complete the security verification first (I'm not a robot)");
      setErrorCode(null);
      return;
    }

    setIsLoading(true);
    setError('');
    setErrorCode(null);
    setIsEmailInUse(false);
    setResetSent(false);
    setIsNotAllowedError(false);
    setIsPopupBlockedError(false);
    setIsUnauthorizedDomainError(false);
    setIsNetworkError(false);

    try {
      const createdUser = await register(formData.email, formData.password, {
        name: formData.name,
        type: role,
        company: formData.company,
        location: formData.location,
        phone: formData.phone
      });
      setIsSuccess(true);
      const targetView: ViewType =
        createdUser?.type === 'supplier' || createdUser?.type === 'admin'
          ? 'supplier-dashboard'
          : 'home';
      setTimeout(() => {
        setView(targetView);
      }, 1000);
    } catch (err: any) {
      const code = err.code || (err.message && err.message.includes('auth/email-already-in-use') ? 'auth/email-already-in-use' : '');
      const isEmailAlreadyInUse = code === 'auth/email-already-in-use' || err.message?.includes('auth/email-already-in-use');
      
      if (isEmailAlreadyInUse) {
        console.warn("Registration notice: email already in use:", formData.email);
        setIsEmailInUse(true);
      } else if (code === 'auth/weak-password' || code === 'auth/invalid-email' || code === 'auth/operation-not-allowed') {
        console.warn("Registration validation notice:", code);
      } else {
        console.warn("Registration notice:", err?.message || err);
      }

      setErrorCode(code || null);
      const isNotAllowed = code === 'auth/operation-not-allowed' || err.message?.includes('auth/operation-not-allowed');
      const isNetwork = code === 'auth/network-request-failed' || err.message?.includes('auth/network-request-failed');
      
      let message = isAr ? 'فشل التسجيل' : 'Registration failed';
      if (isEmailAlreadyInUse) {
        message = isAr 
          ? `البريد الإلكتروني (${formData.email}) مسجل مسبقاً في إنرجو!` 
          : `The email (${formData.email}) is already registered with Enerjoo!`;
      } else if (code === 'auth/weak-password') {
        message = isAr ? 'كلمة المرور ضعيفة جداً (يجب ألا تقل عن 6 أحرف)' : 'Password is too weak (must be at least 6 characters)';
      } else if (code === 'auth/invalid-email') {
        message = isAr ? 'البريد الإلكتروني غير صالح' : 'Invalid email address';
      } else if (isNetwork) {
        setIsNetworkError(true);
        message = isAr ? 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت أو فتح التطبيق في نافذة مستقلة.' : 'Network error. Please check your connection or open in a new tab.';
      } else if (isNotAllowed) {
        setIsNotAllowedError(true);
        message = isAr 
          ? 'طريقة التسجيل بالبريد وكلمة المرور غير مفعّلة في لوحة تحكم Firebase حالياً.' 
          : 'Email & Password sign-in method is not enabled in your Firebase console.';
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
      setIsLoading(false);
    }
  };

  const handleDirectLogin = async () => {
    if (!formData.email) return;
    localStorage.setItem('enerjoo_prefill_email', formData.email);

    if (formData.password) {
      setDirectLoginLoading(true);
      setError('');
      try {
        const loggedInUser = await login(formData.email, formData.password);
        const targetView: ViewType =
          loggedInUser?.type === 'supplier' || loggedInUser?.type === 'admin'
            ? 'supplier-dashboard'
            : 'home';
        setView(targetView);
        return;
      } catch (loginErr: any) {
        console.warn("Direct login notice:", loginErr?.message || loginErr);
        setView('login');
      } finally {
        setDirectLoginLoading(false);
      }
    } else {
      setView('login');
    }
  };

  const handleSendPasswordReset = async () => {
    if (!formData.email) return;
    setResetLoading(true);
    try {
      await resetPassword(formData.email);
      setResetSent(true);
    } catch (resetErr: any) {
      console.warn("Password reset notice:", resetErr);
      setError(isAr ? 'تعذر إرسال رابط التعيين حالياً، يمكنك تسجيل الدخول باستخدام Google.' : 'Could not send reset link. Try signing in with Google.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setError('');
    setIsPopupBlockedError(false);
    setIsNotAllowedError(false);
    setIsUnauthorizedDomainError(false);
    setIsNetworkError(false);
    try {
      const signedUpUser = await signInWithGoogle(role);
      if (signedUpUser) {
        setIsSuccess(true);
        const targetView: ViewType =
          signedUpUser.type === 'supplier' || signedUpUser.type === 'admin'
            ? 'supplier-dashboard'
            : 'home';
        setTimeout(() => {
          setView(targetView);
        }, 900);
      }
    } catch (err: any) {
      const code = err?.code || '';
      setErrorCode(code || null);
      const isPopupClosed = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
      if (isPopupClosed) {
        console.info("Google Sign Up popup was closed by the user.");
        return;
      }

      console.warn("Google Registration Notice:", err);
      let message = isAr ? 'فشل التسجيل باستخدام Google' : 'Google registration failed';
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
          ? 'تم حظر نافذة التسجيل المنبثقة من قبل المتصفح أو بيئة الإطار (iframe).' 
          : 'Google sign-up popup was blocked by your browser or iframe sandbox.';
      } else if (isPopupClosed) {
        message = isAr 
          ? 'تم إغلاق نافذة تسجيل الدخول بـ Google قبل إكمال العملية.'
          : 'Google sign-up popup was closed before completion.';
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
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        message = isAr ? 'الحساب موجود بالفعل بطريقة تسجيل دخول مختلفة' : 'Account exists with different credential';
      } else if (err.message) {
        message = `${isAr ? 'خطأ' : 'Error'}: ${err.message}`;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-[550px] mx-auto py-20 text-center"
      >
        <div className="bg-solar-card rounded-[40px] p-12 border border-solar-border shadow-2xl shadow-solar-success/10">
          <div className="w-20 h-20 bg-solar-success text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-solar-success/30">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12 }}
            >
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          </div>
          <h2 className="text-3xl font-black text-solar-text mb-4">
            {isAr ? 'تم التسجيل بنجاح!' : 'Successfully Registered!'}
          </h2>
          <p className="text-solar-muted font-bold leading-relaxed mb-4">
            {isAr 
              ? 'مرحباً بك في إنرجو (enerjoo). لقد أرسلنا رابط تفعيل إلى بريدك الإلكتروني.'
              : 'Welcome to enerjoo. We have sent a verification link to your email.'}
          </p>
          {role === 'supplier' && (
            <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-xs font-bold mb-4 leading-relaxed">
              {isAr
                ? 'مرحباً بك كمورد في Enerjoo! تم تفعيل حسابك بنجاح، وجارِ نقلك إلى لوحة تحكم الموردين لإضافة منتجاتك فوراً.'
                : 'Welcome as an Enerjoo supplier! Your account is active, redirecting to your dashboard to add products.'}
            </div>
          )}
          <p className="text-solar-muted text-xs font-bold">
            {isAr ? 'جاري توجيهك إلى التطبيق...' : 'Redirecting you to the application...'}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[550px] mx-auto pt-6 pb-12 px-4"
    >
      {/* Top Enerjoo Official Logo Container - Clickable to Home */}
      <div className="flex flex-col items-center justify-center mb-6 text-center">
        <button
          type="button"
          id="register-enerjoo-logo-btn"
          onClick={() => setView('home')}
          className="group focus:outline-none transition-all active:scale-95 flex items-center justify-center py-1 px-4 rounded-2xl hover:bg-white/60"
          title={isAr ? 'العودة للصفحة الرئيسية - Enerjoo' : 'Return to Home - Enerjoo'}
        >
          <img 
            id="register-enerjoo-logo"
            src="/enerjoo-logo-original-2026.jpeg" 
            alt="Enerjoo - عالم الطاقة بين يديك" 
            className="w-44 sm:w-52 max-w-full h-auto object-contain select-none group-hover:scale-105 transition-transform duration-200 block"
            referrerPolicy="no-referrer"
          />
        </button>
      </div>

      <div className="text-center space-y-2 mb-8">
        <button 
          onClick={() => setView('login')}
          className="flex items-center gap-2 text-solar-muted hover:text-solar-blue transition text-sm font-bold mb-4 mx-auto"
        >
          <ArrowLeft size={16} className={isAr ? 'rotate-180' : ''} />
          {t.back}
        </button>
        <h1 className="text-3xl font-black text-solar-text">{t.register}</h1>
        <p className="text-solar-muted text-sm leading-relaxed px-10">{t.joinLarge}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-solar-card rounded-[40px] p-8 md:p-10 border border-solar-border shadow-xl shadow-solar-blue/5 space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{isAr ? 'نوع الحساب' : 'Account Type'}</label>
          <div className="flex p-1.5 bg-solar-bg rounded-2xl border border-solar-border">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${role === 'customer' ? 'bg-white text-solar-blue shadow-sm ring-1 ring-solar-border' : 'text-solar-muted'}`}
            >
              {isAr ? 'مشتري / مستخدم' : 'Buyer / Customer'}
            </button>
            <button
              type="button"
              onClick={() => setRole('supplier')}
              className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${role === 'supplier' ? 'bg-white text-solar-blue shadow-sm ring-1 ring-solar-border' : 'text-solar-muted'}`}
            >
              {isAr ? 'مورد / شركة' : 'Supplier / Company'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{t.fullName}</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted" size={18} />
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData(p => ({...p, name: e.target.value}))}
                className="w-full bg-solar-bg border border-solar-border rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-solar-blue transition text-sm font-bold text-solar-text"
                placeholder={isAr ? "الاسم الكامل" : "John Doe"}
              />
            </div>
          </div>

          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{t.email}</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted" size={18} />
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData(p => ({...p, email: e.target.value}))}
                className="w-full bg-solar-bg border border-solar-border rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-solar-blue transition text-sm font-bold text-solar-text"
                placeholder="name@email.com"
              />
            </div>
          </div>

          <div className="space-y-2 md:col-span-2 text-left">
            <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{t.password}</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted" size={18} />
              <input 
                type="password" 
                value={formData.password}
                onChange={e => setFormData(p => ({...p, password: e.target.value}))}
                className="w-full bg-solar-bg border border-solar-border rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-solar-blue transition text-sm font-bold text-solar-text"
                placeholder="••••••••"
              />
            </div>
          </div>

          {role === 'supplier' && (
            <>
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{isAr ? 'اسم الشركة' : 'Company Name'}</label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted" size={18} />
                  <input 
                    type="text" 
                    value={formData.company}
                    onChange={e => setFormData(p => ({...p, company: e.target.value}))}
                    className="w-full bg-solar-bg border border-solar-border rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-solar-blue transition text-sm font-bold text-solar-text"
                    placeholder="SolarTech"
                  />
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{isAr ? 'رقم الهاتف (واتساب)' : 'Phone (WhatsApp)'}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted font-bold text-xs">+</span>
                  <input 
                    type="text" 
                    value={formData.phone}
                    onChange={e => setFormData(p => ({...p, phone: e.target.value}))}
                    className="w-full bg-solar-bg border border-solar-border rounded-2xl py-3.5 pl-8 pr-4 outline-none focus:border-solar-blue transition text-sm font-bold text-solar-text"
                    placeholder="201234567890"
                  />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2 text-left">
                <label className="text-[10px] font-black text-solar-muted uppercase ml-2 tracking-widest">{isAr ? 'الموقع / المدينة' : 'Location / City'}</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted" size={18} />
                  <input 
                    type="text" 
                    value={formData.location}
                    onChange={e => setFormData(p => ({...p, location: e.target.value}))}
                    className="w-full bg-solar-bg border border-solar-border rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:border-solar-blue transition text-sm font-bold text-solar-text"
                    placeholder="Cairo, Egypt"
                  />
                </div>
              </div>
            </>
          )}
        </div>

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

            {isEmailInUse && (
              <div className="mt-3 p-4 bg-white rounded-2xl border border-solar-blue/25 text-solar-text shadow-sm text-right space-y-3">
                <div className="flex items-center gap-2 text-solar-blue font-black text-xs">
                  <LogIn size={16} />
                  <span>{isAr ? 'البريد مسجل بالفعل في إنرجو، يمكنك:' : 'This account is already registered, you can:'}</span>
                </div>
                
                <p className="text-[11px] text-solar-muted leading-relaxed">
                  {isAr 
                    ? 'تسجيل الدخول مباشرة إذا كنت تتذكر كلمة المرور، أو إرسال رابط لإعادة تعيين كلمة المرور فوراً:' 
                    : 'Sign in directly if you know your password, or request a password reset link:'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={directLoginLoading}
                    onClick={handleDirectLogin}
                    className="w-full bg-solar-blue text-white py-2.5 px-3 rounded-xl font-black text-xs hover:bg-opacity-95 active:scale-95 transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    {directLoginLoading ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn size={14} />
                        <span>{isAr ? 'تسجيل الدخول الآن' : 'Sign In Now'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={resetLoading || resetSent}
                    onClick={handleSendPasswordReset}
                    className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      resetSent 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                        : 'bg-solar-bg text-solar-text border-solar-border hover:border-solar-blue/40'
                    }`}
                  >
                    {resetLoading ? (
                      <div className="w-4 h-4 border-2 border-solar-blue/40 border-t-solar-blue rounded-full animate-spin" />
                    ) : resetSent ? (
                      <span>{isAr ? '✓ تم إرسال رابط التعيين' : '✓ Reset Link Sent'}</span>
                    ) : (
                      <>
                        <KeyRound size={14} />
                        <span>{isAr ? 'استعادة كلمة المرور' : 'Reset Password'}</span>
                      </>
                    )}
                  </button>
                </div>

                {resetSent && (
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-[11px] font-bold border border-emerald-200 text-center">
                    {isAr 
                      ? '✓ تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح! تفقد بريدك الوارد (بما في ذلك مجلد الرسائل غير المرغوبة Spam).' 
                      : '✓ Password reset link sent to your email! Please check your inbox (including Spam).'}
                  </div>
                )}

                <div className="pt-2 border-t border-solar-border/60">
                  <button
                    type="button"
                    onClick={handleGoogleSignUp}
                    className="w-full bg-white hover:bg-slate-50 text-solar-text border border-slate-200 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.35 1 3.37 3.65 1.41 7.54l3.88 3C6.22 7.74 8.88 5.04 12 5.04z" />
                      <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.45h6.45c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.5z" />
                      <path fill="#FBBC05" d="M5.29 14.3C5.03 13.52 4.88 12.69 4.88 11.83c0-.86.15-1.69.41-2.47L1.41 6.36C.51 8.16 0 10.15 0 12.27c0 2.12.51 4.11 1.41 5.91l3.88-3.88z" />
                      <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.1.74-2.5 1.18-4.3 1.18-3.12 0-5.78-2.7-6.71-5.5l-3.88 3C3.37 20.35 7.35 23 12 23z" />
                    </svg>
                    <span>{isAr ? 'الدخول بحساب Google إذا كان مسجلاً به' : 'Sign in with Google if registered with it'}</span>
                  </button>
                </div>
              </div>
            )}
            
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
                <ol className="list-decimal list-inside space-y-1 text-solar-muted pt-1">
                  <li>في صفحة الإعدادات، مرر للأسفل إلى قسم <b>Authorized domains</b>.</li>
                  <li>اضغط على <b>Add domain</b>، ثم ألصق النطاق المنسوخ واضغط <b>Done</b>.</li>
                </ol>
              </div>
            )}

            {isPopupBlockedError && (
              <div className="p-3 bg-white rounded-xl border border-solar-danger/20 text-[10px] font-bold text-solar-muted text-right space-y-2 leading-relaxed">
                <p>لأن المتصفح يحظر النوافذ المنبثقة داخل إطارات المعاينة (iframe)، يمكنك الضغط أدناه لفتح التطبيق في نافذة مستقلة:</p>
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="w-full bg-solar-blue text-white py-2 px-3 rounded-xl font-black hover:bg-opacity-90 transition text-xs flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span>فتح التطبيق في نافذة جديدة</span>
                </button>
              </div>
            )}

            {isNetworkError && (
              <div className="p-3 bg-white rounded-xl border border-solar-danger/20 text-[10px] font-bold text-solar-muted text-right space-y-2 leading-relaxed">
                <p className="text-solar-text font-black">🌐 حل مشكلة الاتصال في المعاينة (Network Request Failed):</p>
                <p>تحدث هذه المشكلة عندما يمنع المتصفح تبادل الاتصال بين نافذة تسجيل الدخول وإطار المعاينة (iframe). الحل هو فتح التطبيق مباشرة في تبويب جديد:</p>
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="w-full bg-solar-blue text-white py-2.5 px-3 rounded-xl font-black hover:bg-opacity-90 transition text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>فتح التطبيق في نافذة مستقلة جديدة</span>
                </button>
              </div>
            )}
          </div>
        )}

        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-solar-blue text-white py-4 rounded-xl font-black hover:bg-opacity-90 shadow-xl shadow-solar-blue/20 transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 text-sm"
        >
          {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t.register}
        </button>

        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-solar-border"></div>
          <span className="px-3 text-xs text-solar-muted font-bold">{isAr ? 'أو' : 'OR'}</span>
          <div className="flex-1 border-t border-solar-border"></div>
        </div>

        <button 
          type="button"
          disabled={isLoading}
          onClick={handleGoogleSignUp}
          className="w-full bg-white text-solar-text border border-solar-border py-4 rounded-xl font-black hover:bg-slate-50 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-95 text-xs"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.35 1 3.37 3.65 1.41 7.54l3.88 3C6.22 7.74 8.88 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.45h6.45c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.5z" />
            <path fill="#FBBC05" d="M5.29 14.3C5.03 13.52 4.88 12.69 4.88 11.83c0-.86.15-1.69.41-2.47L1.41 6.36C.51 8.16 0 10.15 0 12.27c0 2.12.51 4.11 1.41 5.91l3.88-3.88z" />
            <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.1.74-2.5 1.18-4.3 1.18-3.12 0-5.78-2.7-6.71-5.5l-3.88 3C3.37 20.35 7.35 23 12 23z" />
          </svg>
          {isAr ? 'تسجيل بواسطة Google' : 'Sign up with Google'}
        </button>

        <div className="text-center pt-6 border-t border-solar-border">
          <p className="text-xs text-solar-muted font-bold">
            {isAr ? 'لديك حساب بالفعل؟' : 'Already have an account?'} <button type="button" onClick={() => setView('login')} className="text-solar-blue font-black hover:underline">{t.login}</button>
          </p>
        </div>
      </form>
    </motion.div>
  );
};
