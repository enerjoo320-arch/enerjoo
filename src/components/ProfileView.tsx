import React, { useState, useRef, useEffect } from 'react';
import { 
  User, 
  LogIn, 
  Store, 
  Heart, 
  ArrowLeftRight, 
  Package, 
  Bell, 
  HelpCircle, 
  Info, 
  ShieldCheck, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  Sparkles,
  Camera,
  Loader2,
  Check,
  Globe,
  Moon,
  Sun,
  Phone,
  MessageCircle,
  X,
  Mail,
  Zap,
  SlidersHorizontal,
  Headphones,
  PhoneCall
} from 'lucide-react';
import { User as UserType, ViewType } from '../types';
import { translations } from '../translations';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { uploadSupplierProfileImage } from '../services/uploadService';
import { updateSupplierProfileImage } from '../services/firestoreService';
import { 
  CUSTOMER_SERVICE_PHONE_DISPLAY, 
  CUSTOMER_SERVICE_PHONE_INTL, 
  getCustomerServiceWhatsAppUrl,
  SUPPLIER_CONTACT_PHONE_DISPLAY,
  SUPPLIER_CONTACT_PHONE_INTL,
  getSupplierWhatsAppUrl 
} from '../constants/contact';

interface ProfileViewProps {
  lang: 'ar' | 'en';
  setLang: (lang: 'ar' | 'en') => void;
  user: UserType | null;
  logout: () => void;
  setView: (view: ViewType) => void;
  wishlistCount: number;
  compareCount: number;
  productsCount: number;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  lang,
  setLang,
  user,
  logout,
  setView,
  wishlistCount,
  compareCount,
  productsCount
}) => {
  const isAr = lang === 'ar';
  const t = translations[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateUserProfile } = useAuth();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Modals state
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Preferences state
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('enerjoo_notifications');
      return stored !== 'false';
    }
    return true;
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') || 
             localStorage.getItem('enerjoo_theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('enerjoo_theme', next ? 'dark' : 'light');
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleNotifications = () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    localStorage.setItem('enerjoo_notifications', String(next));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadError(null);
    setUploadSuccess(false);

    const tempPreview = URL.createObjectURL(file);
    setPreviewImage(tempPreview);

    try {
      setIsUploading(true);
      if (file.size > 5 * 1024 * 1024) {
        setUploadStatus(isAr ? 'جاري تحسين وضغط الصورة قبل الرفع...' : 'Optimizing and compressing image before upload...');
      }
      const secureUrl = await uploadSupplierProfileImage(file, (status) => setUploadStatus(status), lang);
      await updateSupplierProfileImage(user.uid, secureUrl);
      await updateUserProfile({ profileImage: secureUrl, avatar: secureUrl });
      
      setPreviewImage(secureUrl);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error updating profile image:', err);
      setUploadError(err.message || (isAr ? 'فشل رفع وتحديث الصورة' : 'Failed to upload image'));
      setPreviewImage(null);
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const currentImage = previewImage || user?.profileImage || user?.avatar;
  const userInitial = (isAr ? user?.nameAr || user?.name : user?.name)?.trim()?.charAt(0)?.toUpperCase() || 'E';

  const isSupplier = user?.type === 'supplier';
  const isAdmin = user?.type === 'admin';

  return (
    <div className="min-h-screen bg-slate-50/60 pb-32 pt-6 px-4 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* User Header Profile Card (Clean without duplicate descriptive titles) */}
        <div className="flex flex-col items-center text-center py-3">
          <div className="relative inline-block">
            <div 
              onClick={() => user && !isUploading && fileInputRef.current?.click()}
              className={`w-16 h-16 rounded-full bg-solar-bg border-2 border-white shadow-sm flex items-center justify-center overflow-hidden relative ${user ? 'cursor-pointer group hover:ring-2 hover:ring-solar-blue/40 transition-all' : ''}`}
              title={user ? (isAr ? 'اضغط لتغيير الصورة' : 'Click to change image') : undefined}
            >
              {currentImage ? (
                <img 
                  src={currentImage} 
                  className="w-full h-full rounded-full object-cover" 
                  alt={user?.name || 'User'} 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-solar-light flex items-center justify-center font-black text-solar-blue text-lg">
                  {user ? userInitial : <User size={24} className="text-solar-muted" />}
                </div>
              )}

              {isUploading && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center z-10">
                  <Loader2 size={16} className="text-white animate-spin" />
                </div>
              )}

              {user && !isUploading && (
                <div className="absolute inset-0 bg-black/30 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10">
                  <Camera size={14} className="text-white" />
                </div>
              )}
            </div>

            {user && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="absolute -bottom-1 -right-1 bg-solar-blue text-white p-1.5 rounded-full border-2 border-white shadow-sm hover:bg-solar-blue/90 active:scale-95 transition cursor-pointer"
                  title={isAr ? 'تغيير صورة الحساب' : 'Change profile picture'}
                >
                  <Camera size={11} />
                </button>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept="image/jpeg,image/png,image/webp,image/jpg" 
                  className="hidden" 
                  onChange={handleAvatarUpload}
                  disabled={isUploading}
                />
              </>
            )}

            {user?.verified && (
              <div className="absolute -top-1 -right-1 bg-solar-success text-white p-0.5 rounded-full border border-white shadow-sm" title={isAr ? 'حساب موثق' : 'Verified'}>
                <ShieldCheck size={12} />
              </div>
            )}
          </div>
          
          <h2 className="text-base font-black text-solar-text mt-2.5">
            {user ? (isAr ? user.nameAr || user.name : user.name) : (isAr ? 'مستخدم زائر' : 'Guest User')}
          </h2>
          <p className="text-xs text-solar-muted font-medium mt-0.5">
            {user ? user.email : (isAr ? 'سجل الدخول للاستفادة من كافة خدمات منصة Enerjoo' : 'Log in to access all Enerjoo features')}
          </p>

          {uploadError && (
            <p className="text-[11px] text-solar-danger font-bold mt-2 bg-solar-danger/10 px-3 py-1 rounded-full">
              {uploadError}
            </p>
          )}
          {uploadStatus && (
            <div className="text-[11px] text-solar-blue font-bold mt-2 bg-solar-blue/10 px-3 py-1.5 rounded-full flex items-center justify-center gap-1.5 animate-pulse">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span>{uploadStatus}</span>
            </div>
          )}
          {uploadSuccess && (
            <p className="text-[11px] text-solar-success font-bold mt-2 bg-solar-success/10 px-3 py-1 rounded-full flex items-center gap-1">
              <Check size={12} />
              <span>{isAr ? 'تم تحديث الصورة بنجاح' : 'Profile photo updated'}</span>
            </p>
          )}
        </div>

        {/* 1. قسم "الحساب" */}
        <div className="space-y-2">
          <h3 className="text-sm font-black text-solar-text px-2 text-right">
            {isAr ? 'الحساب' : 'Account'}
          </h3>
          <div className="bg-white rounded-[28px] border border-solar-border/50 shadow-sm overflow-hidden divide-y divide-slate-100">
            {/* 1.1 حسابي */}
            <button 
              onClick={() => {
                if (user) {
                  setShowAccountModal(true);
                } else {
                  setView('login');
                }
              }}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div className="flex items-center gap-2 text-solar-muted font-bold text-xs">
                <span>{user ? (isAr ? user.nameAr || user.name : user.name) : (isAr ? 'تسجيل الدخول' : 'Sign in')}</span>
                {isAr ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'حسابي' : 'My Account'}
                </span>
                <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
                  <User size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>

            {/* 1.2 حالة الحساب */}
            <button 
              onClick={() => {
                if (!user) {
                  setView('login');
                } else {
                  setShowAccountModal(true);
                }
              }}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {user ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <Check size={12} strokeWidth={3} />
                    {user.verified ? (isAr ? 'نشط وموثق' : 'Active & Verified') : (isAr ? 'نشط' : 'Active')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                    {isAr ? 'غير مسجل' : 'Unregistered'}
                  </span>
                )}
                {isAr ? <ChevronLeft size={16} className="text-solar-muted" /> : <ChevronRight size={16} className="text-solar-muted" />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'حالة الحساب' : 'Account Status'}
                </span>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <ShieldCheck size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>

            {/* 1.3 حساب المورد (يظهر فقط للمستخدم الذي لديه صلاحية supplier أو admin) */}
            {isSupplier && (
              <button 
                onClick={() => setView('supplier-dashboard')}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
              >
                <div className="flex items-center gap-2 text-solar-muted font-bold text-xs">
                  <span className="text-solar-blue font-black">{isAr ? 'لوحة المورد' : 'Dashboard'}</span>
                  {isAr ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-solar-text">
                    {isAr ? 'حساب المورد' : 'Supplier Account'}
                  </span>
                  <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
                    <Store size={18} strokeWidth={2.5} />
                  </div>
                </div>
              </button>
            )}

            {/* في حال كان الحساب مسؤول Admin */}
            {isAdmin && (
              <>
                <button 
                  onClick={() => setView('admin-requests')}
                  className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
                >
                  <div>
                    {isAr ? <ChevronLeft size={16} className="text-solar-muted" /> : <ChevronRight size={16} className="text-solar-muted" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm text-solar-text">
                      {isAr ? 'إدارة طلبات وحسابات الطاقة' : 'Energy Requests Management'}
                    </span>
                    <div className="p-2.5 bg-blue-50 text-solar-blue rounded-xl">
                      <Sparkles size={18} strokeWidth={2.5} />
                    </div>
                  </div>
                </button>

                <button 
                  onClick={() => setView('admin-suppliers')}
                  className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
                >
                  <div>
                    {isAr ? <ChevronLeft size={16} className="text-solar-muted" /> : <ChevronRight size={16} className="text-solar-muted" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm text-solar-text">
                      {isAr ? 'إدارة وتوثيق الموردين' : 'Supplier Verification'}
                    </span>
                    <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
                      <Store size={18} strokeWidth={2.5} />
                    </div>
                  </div>
                </button>
              </>
            )}

            {/* 1.4 طلباتي للطاقة والعروض */}
            <button 
              onClick={() => {
                if (user) {
                  setView('customer-requests');
                } else {
                  setView('login');
                }
              }}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div>
                {isAr ? <ChevronLeft size={16} className="text-solar-muted" /> : <ChevronRight size={16} className="text-solar-muted" />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'طلباتي للطاقة والعروض' : 'My Energy Requests & Quotes'}
                </span>
                <div className="p-2.5 bg-blue-50 text-solar-blue rounded-xl">
                  <Sparkles size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>

            {/* 1.5 منتجاتي (يظهر فقط للمورد) */}
            {isSupplier && (
              <button 
                onClick={() => setView('supplier-dashboard')}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
              >
                <div className="flex items-center gap-2 text-solar-muted font-black text-sm">
                  <span>{productsCount}</span>
                  {isAr ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-solar-text">
                    {isAr ? 'منتجاتي' : 'My Products'}
                  </span>
                  <div className="p-2.5 bg-yellow-50 text-yellow-500 rounded-xl">
                    <Package size={18} strokeWidth={2.5} />
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* 2. قسم "تفاعلاتي" */}
        <div className="space-y-2">
          <h3 className="text-sm font-black text-solar-text px-2 text-right">
            {isAr ? 'تفاعلاتي' : 'My Interactions'}
          </h3>
          <div className="bg-white rounded-[28px] border border-solar-border/50 shadow-sm overflow-hidden divide-y divide-slate-100">
            {/* 2.1 المفضلة */}
            <button 
              onClick={() => setView('wishlist')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div className="flex items-center gap-2 text-solar-muted font-black text-sm">
                <span>{wishlistCount}</span>
                {isAr ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'المفضلة' : 'Wishlist'}
                </span>
                <div className="p-2.5 bg-red-50 text-red-500 rounded-xl">
                  <Heart size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>

            {/* 2.2 المقارنة */}
            <button 
              onClick={() => setView('compare')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div className="flex items-center gap-2 text-solar-muted font-black text-sm">
                <span>{compareCount}</span>
                {isAr ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'المقارنة' : 'Compare'}
                </span>
                <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
                  <ArrowLeftRight size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 3. قسم "الإعدادات" */}
        <div className="space-y-2">
          <h3 className="text-sm font-black text-solar-text px-2 text-right">
            {isAr ? 'الإعدادات' : 'Settings'}
          </h3>
          <div className="bg-white rounded-[28px] border border-solar-border/50 shadow-sm overflow-hidden divide-y divide-slate-100">
            {/* 3.1 الإشعارات */}
            <div className="flex items-center justify-between p-4 bg-white">
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notificationsEnabled ? 'bg-solar-blue' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={notificationsEnabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    notificationsEnabled ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                  }`}
                />
              </button>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'الإشعارات' : 'Notifications'}
                </span>
                <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
                  <Bell size={18} strokeWidth={2.5} />
                </div>
              </div>
            </div>

            {/* 3.2 اللغة */}
            <button
              type="button"
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer notranslate"
              translate="no"
            >
              <div className="flex items-center gap-2 text-solar-blue font-black text-xs bg-solar-blue/10 px-3 py-1 rounded-full notranslate">
                <span translate="no" className="notranslate font-black">{isAr ? 'العربية' : 'English'}</span>
                <Globe size={13} />
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'اللغة' : 'Language'}
                </span>
                <div className="p-2.5 bg-blue-50 text-solar-blue rounded-xl">
                  <Globe size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>

            {/* 3.3 الوضع الليلي */}
            <div className="flex items-center justify-between p-4 bg-white">
              <button
                type="button"
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isDarkMode ? 'bg-solar-blue' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={isDarkMode}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isDarkMode ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                  }`}
                />
              </button>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'الوضع الليلي' : 'Dark Mode'}
                </span>
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                  {isDarkMode ? <Moon size={18} strokeWidth={2.5} /> : <Sun size={18} strokeWidth={2.5} />}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. قسم "المساعدة" */}
        <div className="space-y-2">
          <h3 className="text-sm font-black text-solar-text px-2 text-right">
            {isAr ? 'المساعدة' : 'Help'}
          </h3>
          <div className="bg-white rounded-[28px] border border-solar-border/50 shadow-sm overflow-hidden">
            {/* 4.1 المساعدة والدعم */}
            <button 
              onClick={() => setShowHelpModal(true)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div>
                {isAr ? <ChevronLeft size={16} className="text-solar-muted" /> : <ChevronRight size={16} className="text-solar-muted" />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'المساعدة والدعم' : 'Help & Support'}
                </span>
                <div className="p-2.5 bg-yellow-50 text-yellow-500 rounded-xl">
                  <HelpCircle size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 5. قسم "عن Enerjoo" */}
        <div className="space-y-2">
          <h3 className="text-sm font-black text-solar-text px-2 text-right">
            {isAr ? 'عن Enerjoo' : 'About Enerjoo'}
          </h3>
          <div className="bg-white rounded-[28px] border border-solar-border/50 shadow-sm overflow-hidden">
            {/* 5.1 حول Enerjoo (النسخة تم نقلها داخل نافذة حول Enerjoo) */}
            <button 
              onClick={() => setShowAboutModal(true)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition duration-150 text-right cursor-pointer"
            >
              <div>
                {isAr ? <ChevronLeft size={16} className="text-solar-muted" /> : <ChevronRight size={16} className="text-solar-muted" />}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-solar-text">
                  {isAr ? 'حول Enerjoo' : 'About Enerjoo'}
                </span>
                <div className="p-2.5 bg-blue-50 text-solar-blue rounded-xl">
                  <Info size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Logout button */}
        {user ? (
          <div className="pt-4 flex justify-center pb-8">
            <button 
              onClick={() => logout()}
              className="flex items-center gap-2 text-red-600 hover:text-red-700 font-extrabold text-sm justify-center py-2.5 px-8 cursor-pointer active:scale-95 transition bg-white/70 hover:bg-white rounded-2xl border border-red-100 shadow-sm"
            >
              <LogOut size={18} className="translate-y-[1px]" />
              <span>{isAr ? 'تسجيل الخروج' : 'Logout'}</span>
            </button>
          </div>
        ) : (
          <div className="pt-4 flex justify-center pb-8">
            <button 
              onClick={() => setView('login')}
              className="flex items-center gap-2 text-solar-blue hover:text-solar-blue/90 font-extrabold text-sm justify-center py-2.5 px-8 cursor-pointer active:scale-95 transition bg-white/70 hover:bg-white rounded-2xl border border-blue-100 shadow-sm"
            >
              <LogIn size={18} className="translate-y-[1px]" />
              <span>{isAr ? 'تسجيل الدخول' : 'Sign in'}</span>
            </button>
          </div>
        )}

      </div>

      {/* Modal: حول Enerjoo (About Enerjoo Modal with Version inside) */}
      <AnimatePresence>
        {showAboutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-solar-border shadow-2xl max-w-md w-full p-6 text-right relative overflow-hidden"
            >
              <button 
                onClick={() => setShowAboutModal(false)}
                className="absolute top-4 left-4 p-2 text-solar-muted hover:text-solar-text hover:bg-slate-100 rounded-full transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-solar-blue/10 text-solar-blue rounded-2xl">
                  <Zap size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-solar-text">
                    {isAr ? 'منصة Enerjoo للطاقة الشمسية' : 'Enerjoo Solar Platform'}
                  </h3>
                  {/* رقم الإصدار مدمج هنا بدلاً من القائمة الرئيسية */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-0.5 bg-solar-blue/10 text-solar-blue text-[11px] font-black rounded-full">
                    <span>{isAr ? 'الإصدار 1.0.0' : 'Version 1.0.0'}</span>
                    <span className="text-solar-muted font-normal">• Enerjoo Core</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-solar-muted leading-relaxed mb-4">
                {isAr 
                  ? 'منصة Enerjoo هي المنصة الذكية المتكاملة في مصر المتخصصة في أنظمة الطاقة الشمسية ومكوناتها: ألواح شمسية، محولات طاقة (إنفرترات)، بطاريات تخزين، وطلمبات الري، مع ربط العملاء بنخبة الشركات والموردين المعتمدين وتوفير حاسبة شمسية متطورة.'
                  : 'Enerjoo is Egypt’s specialized smart platform for solar energy systems, high-efficiency solar panels, inverters, storage batteries, and solar irrigation pumps, connecting customers with certified suppliers alongside smart solar sizing.'
                }
              </p>

              <div className="space-y-2 text-xs bg-solar-bg p-3.5 rounded-2xl border border-solar-border mb-4">
                <div className="flex items-center justify-between text-solar-text font-bold">
                  <span className="text-solar-blue">{isAr ? 'خدمة العملاء' : 'Customer Service'}</span>
                  <span dir="ltr" className="font-mono text-solar-text">{CUSTOMER_SERVICE_PHONE_INTL}</span>
                </div>
                <div className="flex items-center justify-between text-solar-text font-bold">
                  <span className="text-amber-600">{isAr ? 'التواصل مع الموردين' : 'Supplier Contact'}</span>
                  <span dir="ltr" className="font-mono text-solar-text">{SUPPLIER_CONTACT_PHONE_DISPLAY}</span>
                </div>
                <div className="flex items-center justify-between text-solar-muted pt-1 border-t border-solar-border/60">
                  <span>{isAr ? 'الدعم الفني' : 'Support'}</span>
                  <span>enerjoo320@gmail.com</span>
                </div>
              </div>

              <button 
                onClick={() => setShowAboutModal(false)}
                className="w-full py-2.5 bg-solar-blue text-white rounded-2xl font-bold text-xs hover:bg-solar-blue/90 active:scale-98 transition shadow-sm"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: المساعدة والدعم (Help & Support Modal) */}
      <AnimatePresence>
        {showHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-solar-border shadow-2xl max-w-md w-full p-6 text-right relative overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowHelpModal(false)}
                className="absolute top-4 left-4 p-2 text-solar-muted hover:text-solar-text hover:bg-slate-100 rounded-full transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-yellow-50 text-yellow-500 rounded-2xl">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-solar-text">
                    {isAr ? 'المساعدة والدعم الفني' : 'Help & Support'}
                  </h3>
                  <p className="text-xs text-solar-muted">
                    {isAr ? 'أرقام التواصل الرسمية لمنصة Enerjoo' : 'Official Enerjoo Contact Channels'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-5">
                {/* 1. خدمة العملاء والدعم الفني */}
                <div className="p-3.5 bg-blue-50/70 rounded-2xl border border-blue-200/70">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-solar-blue text-white rounded-xl">
                        <Headphones size={18} />
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-solar-text">
                          {isAr ? 'خدمة العملاء' : 'Customer Service'}
                        </p>
                        <p className="text-xs text-solar-blue font-mono font-black" dir="ltr">
                          {CUSTOMER_SERVICE_PHONE_INTL}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <a
                      href={`tel:${CUSTOMER_SERVICE_PHONE_DISPLAY}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white hover:bg-solar-blue hover:text-white text-solar-blue rounded-xl border border-solar-blue/30 text-xs font-bold transition active:scale-95 shadow-xs"
                    >
                      <Phone size={14} />
                      <span>{isAr ? 'اتصال مباشر' : 'Call'}</span>
                    </a>
                    <a
                      href={getCustomerServiceWhatsAppUrl(isAr ? 'مرحباً خدمة عملاء Enerjoo، أود الاستفسار عن خدمات وحلول الطاقة الشمسية.' : 'Hello Enerjoo Customer Service, I would like to inquire about solar services.')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
                    >
                      <MessageCircle size={14} />
                      <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                    </a>
                  </div>
                </div>

                {/* 2. رقم التواصل مع المورد والمنتجات */}
                <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200/70">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500 text-white rounded-xl">
                        <PhoneCall size={18} />
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-solar-text">
                          {isAr ? 'رقم التواصل مع المورد' : 'Supplier Contact'}
                        </p>
                        <p className="text-xs text-amber-800 font-mono font-black" dir="ltr">
                          {SUPPLIER_CONTACT_PHONE_DISPLAY}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <a
                      href={`tel:${SUPPLIER_CONTACT_PHONE_DISPLAY}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white hover:bg-amber-600 hover:text-white text-amber-800 rounded-xl border border-amber-300 text-xs font-bold transition active:scale-95 shadow-xs"
                    >
                      <Phone size={14} />
                      <span>{isAr ? 'اتصال بالمورد' : 'Call Supplier'}</span>
                    </a>
                    <a
                      href={getSupplierWhatsAppUrl(isAr ? 'مرحباً، أود التواصل بخصوص المنتجات والتوريد على منصة Enerjoo.' : 'Hello, I would like to inquire about supplier products on Enerjoo.')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
                    >
                      <MessageCircle size={14} />
                      <span>{isAr ? 'واتساب المورد' : 'Supplier WhatsApp'}</span>
                    </a>
                  </div>
                </div>

                {/* 3. البريد الإلكتروني */}
                <a 
                  href="mailto:enerjoo320@gmail.com"
                  className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-200 text-slate-700 rounded-xl">
                      <Mail size={18} />
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-solar-text">
                        {isAr ? 'البريد الإلكتروني' : 'Email Support'}
                      </p>
                      <p className="text-xs text-solar-muted font-mono" dir="ltr">
                        enerjoo320@gmail.com
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-600 font-bold">
                    {isAr ? 'إرسال' : 'Send'}
                  </span>
                </a>
              </div>

              <button 
                onClick={() => setShowHelpModal(false)}
                className="w-full py-2.5 bg-solar-blue text-white rounded-2xl font-bold text-xs hover:bg-solar-blue/90 active:scale-98 transition shadow-sm"
              >
                {isAr ? 'تم' : 'Done'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: تفاصيل حسابي (Account details summary) */}
      <AnimatePresence>
        {showAccountModal && user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-solar-border shadow-2xl max-w-md w-full p-6 text-right relative overflow-hidden"
            >
              <button 
                onClick={() => setShowAccountModal(false)}
                className="absolute top-4 left-4 p-2 text-solar-muted hover:text-solar-text hover:bg-slate-100 rounded-full transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-amber-50 text-amber-500 rounded-2xl">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-solar-text">
                    {isAr ? 'بيانات حسابي' : 'Account Details'}
                  </h3>
                  <p className="text-xs text-solar-muted">
                    {isAr ? 'معلومات عضويتك في منصة Enerjoo' : 'Your Enerjoo membership info'}
                  </p>
                </div>
              </div>

              <div className="space-y-3 bg-solar-bg p-4 rounded-2xl border border-solar-border mb-4 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-solar-border/60">
                  <span className="text-solar-muted">{isAr ? 'الاسم:' : 'Name:'}</span>
                  <span className="font-bold text-solar-text">{user.nameAr || user.name}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-solar-border/60">
                  <span className="text-solar-muted">{isAr ? 'البريد الإلكتروني:' : 'Email:'}</span>
                  <span className="font-bold text-solar-text font-mono">{user.email}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-solar-border/60">
                  <span className="text-solar-muted">{isAr ? 'نوع العضوية:' : 'Role:'}</span>
                  <span className="font-black text-solar-blue">
                    {user.type === 'supplier' ? (isAr ? 'مورد معتمد' : 'Verified Supplier') : 
                     user.type === 'admin' ? (isAr ? 'مسؤول النظام' : 'Administrator') : 
                     (isAr ? 'عميل / مستخدم' : 'Customer')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-solar-muted">{isAr ? 'حالة التوثيق:' : 'Status:'}</span>
                  <span className="font-black text-emerald-600 flex items-center gap-1">
                    <Check size={13} strokeWidth={3} />
                    {user.verified ? (isAr ? 'موثق ومعتمد' : 'Verified') : (isAr ? 'نشط' : 'Active')}
                  </span>
                </div>
              </div>

              <button 
                onClick={() => setShowAccountModal(false)}
                className="w-full py-2.5 bg-solar-blue text-white rounded-2xl font-bold text-xs hover:bg-solar-blue/90 active:scale-98 transition shadow-sm"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
