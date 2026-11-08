import React, { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Phone, MapPin, Search, ArrowRight, Eye, Clock, LogOut, Users, Trash, Package } from 'lucide-react';
import { Supplier, Product } from '../types';
import { translations } from '../translations';
import { motion, AnimatePresence } from 'motion/react';
import { updateSupplierStatus } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';

interface AdminSupplierManagementProps {
  lang: 'ar' | 'en';
  suppliers: Supplier[];
  products?: Product[];
  onToggleVerification: (id: any) => void;
  onBack: () => void;
  initialSearch?: string;
  onViewSupplier: (id: any) => void;
  onManageProducts?: (id: any) => void;
}

export const AdminSupplierManagement: React.FC<AdminSupplierManagementProps> = ({ 
  lang, 
  suppliers, 
  products,
  onToggleVerification,
  onBack,
  initialSearch = '',
  onViewSupplier,
  onManageProducts
}) => {
  const t = translations[lang];
  const isAr = lang === 'ar';
  const { user, logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const filteredSuppliers = suppliers.filter(s => {
    const name = isAr ? s.nameAr : s.name;
    const matchesSearch = (name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (s.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.phone && s.phone.includes(searchTerm)) ||
                          (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    // Filter by active tab state
    if (activeTab === 'approved') {
      return s.verified === true;
    } else if (activeTab === 'rejected') {
      return s.rejected === true;
    } else {
      // Pending
      return s.verified !== true && s.rejected !== true;
    }
  });

  // Calculate counts for badges and stats
  const approvedCount = suppliers.filter(s => s.verified === true).length;
  const pendingCount = suppliers.filter(s => s.verified !== true && s.rejected !== true).length;
  const rejectedCount = suppliers.filter(s => s.rejected === true).length;

  const handleUpdateStatus = async (uid: string, status: 'approved' | 'pending' | 'rejected') => {
    if (user?.type !== 'admin') {
      console.error("Unauthorized attempt to update supplier status");
      return;
    }
    try {
      await updateSupplierStatus(String(uid), status);
    } catch (err) {
      console.error("Error updating supplier status:", err);
    }
  };

  const defaultAvatar = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80";

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pb-24 font-sans"
    >
      {/* Dynamic Header mockup replication */}
      <div className="flex items-center justify-between bg-white border border-solar-border/40 rounded-3xl p-4 mb-6 shadow-sm">
        {/* Left side actions (Logout and Profile) */}
        <div className="flex items-center gap-3">
          <button 
            onClick={logout}
            title={isAr ? 'تسجيل الخروج' : 'Logout'}
            className="p-2.5 text-solar-muted hover:text-solar-danger bg-solar-light hover:bg-solar-danger/10 rounded-2xl transition-all"
          >
            <LogOut size={20} className={isAr ? "" : "rotate-180"} />
          </button>
          <div className="relative">
            {user?.profileImage || user?.avatar ? (
              <img 
                src={user.profileImage || user.avatar} 
                alt="Admin" 
                className="w-10 h-10 rounded-full border-2 border-solar-border object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-solar-light border-2 border-solar-border flex items-center justify-center font-black text-solar-blue text-sm">
                {(isAr ? user?.nameAr || user?.name : user?.name)?.charAt(0)?.toUpperCase() || 'A'}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 bg-green-500 w-3.5 h-3.5 rounded-full border-2 border-white"></span>
          </div>
          {/* Active indicator Pill */}
          <div className="hidden sm:flex items-center gap-1.5 bg-solar-blue/10 text-solar-blue px-3 py-1.5 rounded-full text-xs font-black">
            <Users size={14} className="stroke-[2.5]" />
            <span>{isAr ? 'الموردين' : 'Suppliers'}</span>
          </div>
        </div>

        {/* Center label (Shown on mobile inside header) */}
        <div className="sm:hidden flex items-center gap-1.5 bg-solar-blue/10 text-solar-blue px-3 py-1.5 rounded-full text-xs font-black">
          <Users size={14} className="stroke-[2.5]" />
          <span>{isAr ? 'الموردين' : 'Suppliers'}</span>
        </div>

        {/* Right side supplier badge */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="hidden md:flex items-center gap-1.5 text-solar-muted hover:text-solar-blue text-xs font-black transition-all"
          >
            <ArrowRight size={16} className={isAr ? "rotate-180" : ""} />
            <span>{t.back}</span>
          </button>
          <div className="w-10 h-10 bg-solar-blue rounded-full flex items-center justify-center shadow-lg shadow-solar-blue/20">
            <span className="text-white font-black text-lg">S</span>
          </div>
        </div>
      </div>

      {/* THREE STATS CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Card 1: Active & Approved */}
        <div className="bg-white border border-solar-border/40 rounded-[2rem] p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-green-100/70 text-green-600 rounded-[1.25rem] flex items-center justify-center shrink-0">
              <ShieldCheck size={26} className="stroke-[2]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-solar-muted">{isAr ? 'نشط ومعتمد' : 'Active & Approved'}</p>
              <h4 className="text-3xl font-black text-green-600/90 leading-none">{approvedCount}</h4>
            </div>
          </div>
        </div>

        {/* Card 2: Under Review & Request */}
        <div className="bg-white border border-solar-border/40 rounded-[2rem] p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-100/70 text-amber-500 rounded-[1.25rem] flex items-center justify-center shrink-0">
              <Clock size={26} className="stroke-[2]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-solar-muted">{isAr ? 'قيد المراجعة والطلب' : 'Pending Review'}</p>
              <h4 className="text-3xl font-black text-amber-500 leading-none">{pendingCount}</h4>
            </div>
          </div>
        </div>

        {/* Card 3: Rejected Accounts */}
        <div className="bg-white border border-solar-border/40 rounded-[2rem] p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-100/70 text-rose-500 rounded-[1.25rem] flex items-center justify-center shrink-0">
              <ShieldAlert size={26} className="stroke-[2]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-solar-muted">{isAr ? 'الحسابات المرفوضة' : 'Rejected Accounts'}</p>
              <h4 className="text-3xl font-black text-rose-500 leading-none">{rejectedCount}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER SEARCH FIELD */}
      <div className="relative mb-6">
        <Search className={`${isAr ? 'right-4' : 'left-4'} absolute top-1/2 -translate-y-1/2 text-solar-muted`} size={18} />
        <input 
          type="text"
          placeholder={isAr ? 'البحث باسم المورد أو البريد الإلكتروني...' : 'Search by name or email...'}
          className={`w-full bg-white border border-solar-border rounded-[2rem] py-4 shadow-sm ${isAr ? 'pr-12 pl-4' : 'pl-12 pr-4'} outline-none focus:border-solar-blue/60 transition-all font-bold text-sm text-solar-text`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABS SELECTOR WITH THE GOLD INDICATOR */}
      <div className="flex border-b border-solar-border mb-6">
        {/* Tab 1: Under Review */}
        <button 
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-4 text-center font-black text-sm relative transition-all duration-300 ${
            activeTab === 'pending' ? 'text-solar-text' : 'text-solar-muted hover:text-solar-text'
          }`}
        >
          <span>{isAr ? `قيد المراجعة (${pendingCount})` : `Under Review (${pendingCount})`}</span>
          {activeTab === 'pending' && (
            <motion.div 
              layoutId="adminActiveTabBorder"
              className="absolute bottom-0 right-0 left-0 h-[2px] bg-amber-500 rounded-full"
            />
          )}
        </button>

        {/* Tab 2: Approved */}
        <button 
          onClick={() => setActiveTab('approved')}
          className={`flex-1 py-4 text-center font-black text-sm relative transition-all duration-300 ${
            activeTab === 'approved' ? 'text-solar-text' : 'text-solar-muted hover:text-solar-text'
          }`}
        >
          <span>{isAr ? `المعتمدين (${approvedCount})` : `Approved (${approvedCount})`}</span>
          {activeTab === 'approved' && (
            <motion.div 
              layoutId="adminActiveTabBorder"
              className="absolute bottom-0 right-0 left-0 h-[2px] bg-amber-500 rounded-full"
            />
          )}
        </button>

        {/* Tab 3: Rejected */}
        <button 
          onClick={() => setActiveTab('rejected')}
          className={`flex-1 py-4 text-center font-black text-sm relative transition-all duration-300 ${
            activeTab === 'rejected' ? 'text-solar-text' : 'text-solar-muted hover:text-solar-text'
          }`}
        >
          <span>{isAr ? `المرفوض (${rejectedCount})` : `Rejected (${rejectedCount})`}</span>
          {activeTab === 'rejected' && (
            <motion.div 
              layoutId="adminActiveTabBorder"
              className="absolute bottom-0 right-0 left-0 h-[2px] bg-amber-500 rounded-full"
            />
          )}
        </button>
      </div>

      {/* SUPPLIERS LIST CONTAINER WITH CARS CHOPPED LIKE IMAGE 2 */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredSuppliers.map((supplier, idx) => (
            <motion.div 
              key={`${supplier.id || idx}-${idx}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-5 border border-solar-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-solar-blue/20 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 bg-solar-light hover:bg-solar-border/40 border border-solar-border rounded-full flex items-center justify-center font-black text-solar-blue text-sm shrink-0 shadow-sm overflow-hidden">
                  {supplier.profileImage || supplier.avatar ? (
                    <img 
                      src={supplier.profileImage || supplier.avatar} 
                      alt={supplier.name} 
                      className="w-full h-full rounded-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    (isAr ? supplier.nameAr || supplier.name : supplier.name)?.charAt(0)?.toUpperCase() || 'S'
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-solar-text text-base leading-tight">
                      {isAr ? supplier.nameAr || supplier.name : supplier.name}
                    </h3>
                    {supplier.verified ? (
                      <div className="bg-green-100 text-green-600 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 text-[9px] font-black uppercase">
                        <ShieldCheck size={11} />
                        <span>{isAr ? 'شريك معتمد' : 'VERIFIED'}</span>
                      </div>
                    ) : supplier.rejected ? (
                      <div className="bg-rose-100 text-rose-500 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 text-[9px] font-black uppercase">
                        <ShieldAlert size={11} />
                        <span>{isAr ? 'مرفوض' : 'REJECTED'}</span>
                      </div>
                    ) : (
                      <div className="bg-amber-100 text-amber-600 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 text-[9px] font-black uppercase">
                        <Clock size={11} />
                        <span>{isAr ? 'قيد المراجعة' : 'PENDING'}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-solar-muted">
                    <span className="flex items-center gap-1">
                      <MapPin size={13} className="text-solar-blue" />
                      {supplier.location || (isAr ? 'لم يحدد الموقع' : 'N/A')}
                    </span>
                    {supplier.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={13} className="text-solar-blue" />
                        {supplier.phone}
                      </span>
                    )}
                    <span className="text-[11px] opacity-70">
                      {supplier.email}
                    </span>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS FOR EACH CARD */}
              <div className="flex flex-wrap items-center gap-2 border-t md:border-t-0 pt-4 md:pt-0 mt-2 md:mt-0">
                {activeTab !== 'approved' && (
                  <button 
                    onClick={() => handleUpdateStatus(supplier.id as string, 'approved')}
                    className="flex-1 md:flex-none px-4 py-2.5 bg-green-500 text-white rounded-xl font-bold text-xs hover:bg-green-600 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-green-500/10"
                  >
                    <ShieldCheck size={15} />
                    <span>{isAr ? 'اعتماد الحساب' : 'Approve Account'}</span>
                  </button>
                )}

                {activeTab !== 'pending' && (
                  <button 
                    onClick={() => handleUpdateStatus(supplier.id as string, 'pending')}
                    className="flex-1 md:flex-none px-4 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-xs hover:bg-amber-600 transition-all flex items-center justify-center gap-1/5 shadow-sm"
                  >
                    <Clock size={15} />
                    <span>{isAr ? 'إعادة للمراجعة' : 'Return to Pending'}</span>
                  </button>
                )}

                {activeTab !== 'rejected' && (
                  <button 
                    onClick={() => handleUpdateStatus(supplier.id as string, 'rejected')}
                    className="flex-1 md:flex-none px-4 py-2.5 bg-rose-50 text-rose-500 border border-rose-100 rounded-xl font-bold text-xs hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-1.5"
                  >
                    <ShieldAlert size={15} />
                    <span>{isAr ? 'رفض الحساب' : 'Reject Account'}</span>
                  </button>
                )}

                {onManageProducts && (
                  <button 
                    onClick={() => onManageProducts(supplier.id)}
                    className="px-3.5 py-2.5 bg-solar-blue text-white rounded-xl hover:bg-solar-blue/90 transition-all flex items-center gap-1.5 font-black text-xs cursor-pointer shadow-sm shadow-solar-blue/20 active:scale-95"
                    title={isAr ? 'تعديل وحذف منتجات المورد' : 'Manage & Edit Supplier Products'}
                  >
                    <Package size={15} />
                    <span>{isAr ? 'إدارة المنتجات' : 'Manage Products'}</span>
                    {products && (
                      <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">
                        {products.filter(p => p.supplierId === supplier.id || p.supplierId?.toString() === supplier.id?.toString() || p.suppliers?.some(s => s.id === supplier.id || s.id?.toString() === supplier.id?.toString())).length}
                      </span>
                    )}
                  </button>
                )}

                <button 
                  onClick={() => onViewSupplier(supplier.id)}
                  className="w-10 h-10 bg-solar-light text-solar-muted rounded-xl hover:bg-solar-blue/10 hover:text-solar-blue transition-all flex items-center justify-center cursor-pointer active:scale-95"
                  title={isAr ? 'عرض منتجات المورد في المتجر' : 'View Supplier Products in Store'}
                >
                  <Eye size={17} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredSuppliers.length === 0 && (
          <div className="bg-white border border-solar-border/40 rounded-[2rem] p-16 text-center shadow-sm">
            <div className="bg-solar-light w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-solar-border/10">
              <Users className="text-solar-muted opacity-40" size={30} />
            </div>
            <h3 className="text-xl font-black text-solar-text">{isAr ? 'لا يوجد حسابات حالية في هذا التبويب' : 'No suppliers in this tab'}</h3>
            <p className="text-solar-muted font-bold mt-1.5 text-xs">
              {isAr ? 'استخدم البحث أو غير التصفية للعثور على الموردين.' : 'Change tab or modify the search term to view suppliers.'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

