import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Phone, MapPin, Mail, Search } from 'lucide-react';
import { Supplier } from '../types';
import { subscribeToSuppliers, toggleSupplierVerification } from '../services/firestoreService';
import { motion, AnimatePresence } from 'motion/react';

interface AdminSuppliersProps {
  lang: 'en' | 'ar';
}

export const AdminSuppliers: React.FC<AdminSuppliersProps> = ({ lang }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const isAr = lang === 'ar';

  useEffect(() => {
    const unsubscribe = subscribeToSuppliers((data) => {
      setSuppliers(data);
    });
    return () => unsubscribe();
  }, []);

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.nameAr && s.nameAr.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleToggle = async (uid: string, currentStatus: boolean) => {
    try {
      await toggleSupplierVerification(uid, !currentStatus);
    } catch (error) {
      console.error("Failed to toggle verification:", error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-solar-text flex items-center gap-3">
            <ShieldCheck className="text-solar-blue" size={32} />
            {isAr ? 'إدارة الموردين' : 'Supplier Management'}
          </h1>
          <p className="text-solar-muted font-bold mt-1">
            {isAr ? `إجمالي الموردين المسجلين: ${suppliers.length}` : `Total registered suppliers: ${suppliers.length}`}
          </p>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-solar-muted" size={18} />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'البحث عن مورد...' : 'Search supplier...'}
            className="w-full bg-solar-card border border-solar-border rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-solar-blue text-sm font-bold text-solar-text transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredSuppliers.map((supplier, idx) => (
            <motion.div
              key={`${supplier.id || idx}-${idx}`}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-solar-card border border-solar-border rounded-3xl p-6 hover:shadow-xl hover:shadow-solar-blue/5 transition-all relative overflow-hidden"
            >
              <div className={`absolute top-0 right-0 px-4 py-1 text-[10px] font-black uppercase tracking-widest ${supplier.verified ? 'bg-green-500 text-white' : 'bg-solar-border text-solar-muted'}`}>
                {supplier.verified ? (isAr ? 'معتمد' : 'Verified') : (isAr ? 'غير معتمد' : 'Unverified')}
              </div>

              <div className="flex items-center gap-3.5 mb-5 pt-3">
                <div className="w-10 h-10 rounded-full bg-solar-bg border border-solar-border flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                  {supplier.profileImage || supplier.avatar ? (
                    <img 
                      src={supplier.profileImage || supplier.avatar} 
                      alt={supplier.name} 
                      className="w-full h-full rounded-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-sm font-black text-solar-blue">
                      {(isAr ? supplier.nameAr || supplier.name : supplier.name).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-black text-solar-text leading-tight">
                    {isAr ? supplier.nameAr || supplier.name : supplier.name}
                  </h3>
                  <div className="flex items-center gap-1 mt-0.5 text-solar-blue">
                    <MapPin size={12} />
                    <span className="text-xs font-bold">{supplier.location}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-solar-muted">
                  <Mail size={16} />
                  <span className="text-sm font-bold truncate">{supplier.email}</span>
                </div>
                {supplier.phone && (
                  <div className="flex items-center gap-3 text-solar-muted">
                    <Phone size={16} />
                    <span className="text-sm font-bold">{supplier.phone}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleToggle(supplier.id as string, supplier.verified)}
                className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                  supplier.verified 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' 
                    : 'bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white'
                }`}
              >
                {supplier.verified ? (
                  <>
                    <ShieldAlert size={18} />
                    {isAr ? 'إلغاء الاعتماد' : 'Revoke Verification'}
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    {isAr ? 'اعتماد المورد' : 'Verify Supplier'}
                  </>
                )}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-20 bg-solar-card border border-solar-border rounded-3xl">
          <div className="bg-solar-bg w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-solar-border">
            <Search className="text-solar-muted" size={32} />
          </div>
          <h3 className="text-xl font-black text-solar-text">
            {isAr ? 'لا يوجد موردين بهذا الإسم' : 'No suppliers found'}
          </h3>
          <p className="text-solar-muted font-bold mt-2">
            {isAr ? 'حاول البحث بكلمة مختلفة' : 'Try searching with different keywords'}
          </p>
        </div>
      )}
    </div>
  );
};
