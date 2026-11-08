import React from 'react';
import { Home, PlusCircle, ArrowLeftRight, User, LogIn, LayoutDashboard, Heart, TrendingUp, Package } from 'lucide-react';
import { translations } from '../translations';
import { User as UserType, ViewType } from '../types';
import { motion } from 'motion/react';

interface BottomNavProps {
  currentView: ViewType;
  currentSection?: 'home' | 'products';
  setView: (view: ViewType) => void;
  lang: 'ar' | 'en';
  user: UserType | null;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, currentSection = 'home', setView, lang, user }) => {
  const t = translations[lang];
  const isAr = lang === 'ar';
  const isSupplier = user?.type === 'supplier';
  const isAdmin = user?.type === 'admin';
  
  const navItems: { id: ViewType; icon: React.ReactNode; label: string; show: boolean }[] = [
    { id: 'home', icon: <Home size={20} strokeWidth={2.5} />, label: t.home, show: true },
    { id: 'compare', icon: <ArrowLeftRight size={20} strokeWidth={2.5} />, label: t.compare, show: !isAdmin },
    { id: 'exchange', icon: <TrendingUp size={20} strokeWidth={2.5} />, label: isAr ? 'بورصة الطاقة' : (t.energyMarket || 'Energy Market'), show: true },
    // For suppliers and admin: show products dashboard
    isSupplier || isAdmin
      ? {
          id: 'supplier-dashboard',
          icon: <Package size={20} strokeWidth={2.5} />,
          label: isAdmin ? (isAr ? 'المنتجات' : 'Products') : (t.myProducts || (isAr ? 'منتجاتي' : 'My Products')),
          show: true
        }
      : {
          id: 'wishlist',
          icon: <Heart size={20} strokeWidth={2.5} />,
          label: t.wishlist,
          show: true
        },
    { 
      id: isAdmin ? 'admin-suppliers' : 'add', 
      icon: isAdmin ? <LayoutDashboard size={20} strokeWidth={2.5} /> : <PlusCircle size={20} strokeWidth={2.5} />, 
      label: isAdmin ? t.manageSuppliers : t.addProduct, 
      show: user !== null && user.type !== 'customer'
    },
    { 
      id: 'profile', 
      icon: <User size={20} strokeWidth={2.5} />, 
      label: t.profile || 'Profile', 
      show: true 
    }
  ];

  return (
    <nav 
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-solar-border/70 z-50 md:hidden pb-[calc(env(safe-area-inset-bottom,0px)+6px)] pt-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] select-none"
    >
      <div className="flex justify-around items-center px-1 max-w-lg mx-auto h-14">
        {navItems.filter(item => item.show).map(item => {
          const isActive = item.id === 'home'
            ? (currentView === 'home' && currentSection !== 'products')
            : currentView === item.id;
          return (
            <button 
              key={item.id} 
              onClick={() => setView(item.id)} 
              className={`flex flex-col items-center justify-center flex-1 h-full min-h-[48px] px-1 transition-all duration-200 relative active:scale-95 ${isActive ? 'text-solar-blue font-black' : 'text-solar-muted hover:text-solar-blue/80 font-bold'}`}
            >
              {isActive && (
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute -top-1.5 w-8 h-1 bg-solar-blue rounded-full shadow-sm shadow-solar-blue/40"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}
              <div className={`p-1 rounded-xl transition-all duration-200 ${isActive ? 'bg-solar-blue/10 scale-105' : 'opacity-70'}`}>
                {item.icon}
              </div>
              <span className={`text-[10px] tracking-tight whitespace-nowrap mt-0.5 leading-none ${isActive ? 'opacity-100 font-black' : 'opacity-60'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
