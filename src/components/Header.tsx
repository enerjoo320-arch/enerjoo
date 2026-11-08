import React from 'react';
import { Heart, LogIn, LogOut, PlusCircle, Users, Globe, Package, TrendingUp, Sparkles } from 'lucide-react';
import { translations } from '../translations';
import { User, ViewType } from '../types';

interface HeaderProps {
  lang: 'ar' | 'en';
  setLang: (lang: 'ar' | 'en') => void;
  user: User | null;
  onLogout: () => void;
  setView: (view: ViewType) => void;
  onOpenAiChat?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, setLang, user, onLogout, setView, onOpenAiChat }) => {
  const t = translations[lang];
  const isAr = lang === 'ar';

  return (
    <header translate="no" className="sticky top-0 z-40 w-full glass border-b border-solar-border/70 pt-safe select-none notranslate">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Enerjoo Brand Logo */}
        <div 
          id="header-logo-container"
          className="h-10 sm:h-12 md:h-13 flex items-center justify-center cursor-pointer active:scale-95 transition-transform shrink-0" 
          onClick={() => setView('home')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setView('home');
            }
          }}
          title={isAr ? 'Enerjoo - عالم الطاقة بين يديك' : 'Enerjoo - Home'}
        >
          <img 
            id="header-enerjoo-logo"
            src="/enerjoo-logo-original-2026.jpeg" 
            alt="Enerjoo - عالم الطاقة بين يديك" 
            itemProp="image"
            fetchPriority="high"
            className="h-full w-auto max-h-11 sm:max-h-12 object-contain select-none block"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* AI Consultant Button */}
          <button
            type="button"
            onClick={() => {
              if (onOpenAiChat) onOpenAiChat();
              else setView('calculator');
            }}
            className="flex items-center gap-1.5 text-blue-700 hover:text-blue-900 transition font-black text-xs bg-blue-50 hover:bg-blue-100/90 border border-blue-200/80 px-2.5 sm:px-3 py-1.5 rounded-full cursor-pointer active:scale-95 shadow-xs"
            title={isAr ? 'المستشار الذكي للطاقة الشمسية' : 'AI Solar Consultant'}
          >
            <Sparkles size={14} className="text-blue-600 shrink-0 animate-pulse" />
            <span className="font-black text-[11px] sm:text-xs">{isAr ? 'المستشار الذكي' : 'AI Advisor'}</span>
          </button>

          {/* Energy Exchange Button */}
          <button 
            type="button"
            onClick={() => setView('exchange')}
            className="flex items-center gap-1.5 text-solar-dark hover:text-solar-blue transition font-black text-xs bg-solar-gold/15 hover:bg-solar-gold/25 border border-solar-gold/40 px-2.5 sm:px-3 py-1.5 rounded-full cursor-pointer active:scale-95 shadow-sm"
            title={isAr ? 'بورصة الطاقة - أسعار الوات للألواح الشمسية' : 'Energy Exchange - Solar Panel Prices'}
          >
            <TrendingUp size={14} className="text-solar-blue shrink-0" />
            <span className="font-black text-[11px] sm:text-xs">{isAr ? 'بورصة الطاقة' : (t.energyMarket || 'Energy Market')}</span>
          </button>

          {/* Language Switcher */}
          <button 
            type="button"
            onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="flex items-center gap-1.5 text-solar-muted hover:text-solar-blue transition font-black text-xs bg-solar-light hover:bg-solar-border/60 px-2.5 sm:px-3 py-1.5 rounded-full notranslate cursor-pointer active:scale-95"
            title={isAr ? 'التحويل إلى الإنجليزية' : 'Switch to Arabic'}
            translate="no"
          >
            <Globe size={14} className="text-solar-blue shrink-0" />
            <span translate="no" className="notranslate font-black text-[11px] sm:text-xs">{isAr ? 'English' : 'العربية'}</span>
          </button>

          {user?.type === 'supplier' ? (
            <button 
              onClick={() => setView('supplier-dashboard')}
              className="flex items-center gap-1.5 text-solar-blue hover:bg-solar-blue/15 transition font-black text-xs sm:text-sm bg-solar-blue/10 border border-solar-blue/25 px-2.5 sm:px-3.5 py-1.5 rounded-full cursor-pointer active:scale-95"
              title={t.myProducts || (isAr ? 'لوحة المورد - منتجاتي' : 'Supplier Dashboard - My Products')}
            >
              <Package size={16} className="text-solar-blue shrink-0" />
              <span>{t.myProducts || (isAr ? 'منتجاتي' : 'My Products')}</span>
            </button>
          ) : user?.type !== 'admin' && (
            <button 
              onClick={() => setView('wishlist')}
              className="hidden md:flex items-center gap-2 text-solar-muted hover:text-red-500 transition font-bold text-sm bg-solar-light px-3 py-1.5 rounded-full"
              title={t.wishlist}
            >
              <Heart size={18} className="text-red-500" />
              <span>{t.wishlist}</span>
            </button>
          )}

          {user?.type === 'admin' && (
            <>
              <button 
                onClick={() => setView('admin-requests')}
                className="flex items-center gap-1 text-solar-blue hover:bg-solar-blue/10 transition font-black text-[11px] sm:text-xs bg-solar-blue/5 border border-solar-blue/20 px-2.5 sm:px-3 py-1.5 rounded-full"
              >
                <span>{isAr ? '⚡ الطلبات' : '⚡ Requests'}</span>
              </button>

              <button 
                onClick={() => setView('supplier-dashboard')}
                className="hidden sm:flex items-center gap-1.5 text-solar-muted hover:text-solar-blue transition font-bold text-xs bg-solar-light px-3 py-1.5 rounded-full cursor-pointer"
                title={isAr ? 'إدارة وتعديل منتجات الموردين' : 'Manage Supplier Products'}
              >
                <Package size={15} />
                <span>{isAr ? 'منتجات الموردين' : 'Products'}</span>
              </button>

              <button 
                onClick={() => setView('admin-suppliers')}
                className="hidden sm:flex items-center gap-2 text-solar-muted hover:text-solar-blue transition font-bold text-xs bg-solar-light px-3 py-1.5 rounded-full"
              >
                <Users size={16} />
                <span>{t.supplierList}</span>
              </button>
            </>
          )}

          {user?.type === 'supplier' && (
            user.verified === true && !user.rejected ? (
              <button 
                onClick={() => setView('add')}
                className="hidden sm:flex items-center gap-1.5 text-solar-muted hover:text-solar-blue transition font-bold text-xs sm:text-sm bg-solar-light px-2.5 sm:px-3 py-1.5 rounded-full cursor-pointer"
              >
                <PlusCircle size={16} />
                <span>{t.addProduct}</span>
              </button>
            ) : (
              <button 
                onClick={() => setView('supplier-dashboard')}
                title={
                  user.rejected
                    ? (isAr ? 'حساب المورد مرفوض أو معلق' : 'Supplier account rejected')
                    : (isAr ? 'حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo.' : 'Account under review')
                }
                className="hidden sm:flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-300/80 px-2.5 sm:px-3 py-1.5 rounded-full font-black text-xs cursor-pointer"
              >
                <span>⏳ {user.rejected ? (isAr ? 'حساب مرفوض' : 'Rejected') : (isAr ? 'قيد المراجعة' : 'Pending Review')}</span>
              </button>
            )
          )}

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div 
                className="flex items-center gap-2 bg-solar-light p-1 sm:px-3 sm:py-1.5 rounded-full cursor-pointer hover:bg-solar-border transition active:scale-95"
                onClick={() => setView('profile')}
                title={isAr ? 'الملف الشخصي' : 'Profile'}
              >
                {user.profileImage || user.avatar ? (
                  <img 
                    src={user.profileImage || user.avatar} 
                    className="w-7 h-7 sm:w-7 sm:h-7 rounded-full border border-solar-border object-cover" 
                    alt={user.name} 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-solar-blue/10 border border-solar-blue/20 flex items-center justify-center font-black text-xs text-solar-blue">
                    {(isAr ? user.nameAr || user.name : user.name)?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
                <span className="text-xs font-bold text-solar-text hidden md:block">{isAr ? user.nameAr || user.name : user.name}</span>
              </div>
              <button 
                onClick={onLogout}
                className="p-1.5 sm:p-2 text-solar-muted hover:text-solar-danger transition rounded-lg"
                title={isAr ? 'تسجيل الخروج' : 'Log out'}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setView('login')}
              className="flex items-center gap-1.5 bg-solar-blue text-white px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black shadow-md shadow-solar-blue/20 transition active:scale-95"
            >
              <LogIn size={16} />
              <span>{t.login}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
