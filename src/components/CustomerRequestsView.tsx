import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Clock, 
  ArrowRight, 
  CheckCircle2, 
  Phone, 
  MessageCircle, 
  FileText, 
  Copy, 
  Calculator,
  Calendar,
  Layers,
  Sun,
  Building2
} from 'lucide-react';
import { motion } from 'motion/react';
import { SolarRequest, ViewType } from '../types';
import { useAuth } from '../context/AuthContext';
import { subscribeToCustomerSolarRequests } from '../services/firestoreService';
import { UNIFIED_WHATSAPP_NUMBER } from '../constants/contact';
import { translations } from '../translations';

interface CustomerRequestsViewProps {
  lang: 'ar' | 'en';
  setView: (view: ViewType) => void;
}

export const CustomerRequestsView: React.FC<CustomerRequestsViewProps> = ({ lang, setView }) => {
  const { user } = useAuth();
  const isAr = lang === 'ar';
  const t = translations[lang];

  const [requests, setRequests] = useState<SolarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const identifier = user.phone || user.uid;
    const unsub = subscribeToCustomerSolarRequests(identifier, (data) => {
      setRequests(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const copyRequestId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'قيد المراجعة' : 'In Review'}</span>;
      case 'in_progress':
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'جاري المعاينة الفنية' : 'Site Surveying'}</span>;
      case 'contacted':
        return <span className="bg-purple-100 text-purple-800 border border-purple-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'تم التواصل معك' : 'Contacted'}</span>;
      case 'completed':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'تم اعتماد العرض' : 'Approved'}</span>;
      case 'cancelled':
        return <span className="bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'ملغي' : 'Cancelled'}</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[11px] font-black px-2.5 py-1 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 font-sans" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between bg-white border border-solar-border rounded-3xl p-5 mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-solar-blue text-white rounded-2xl flex items-center justify-center shadow-lg shadow-solar-blue/20">
            <Calculator size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-solar-text">
              {isAr ? 'طلباتي وعروض أسعار المحطات الشمسية' : 'My Solar Requests & Quotes'}
            </h1>
            <p className="text-xs text-solar-muted font-bold">
              {isAr ? 'سجل كافة حسابات وتصميمات الطاقة الشمسية الخاصة بك' : 'History of all your solar system designs and quotation requests'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setView('profile')}
          className="p-3 bg-solar-light hover:bg-solar-border/50 text-solar-text rounded-xl transition"
          title={isAr ? 'رجوع للملف الشخصي' : 'Back to Profile'}
        >
          <ArrowRight size={18} className={isAr ? '' : 'rotate-180'} />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-solar-border p-12 text-center">
          <div className="w-8 h-8 border-4 border-solar-blue/20 border-t-solar-blue rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-solar-muted">{isAr ? 'جاري استرجاع طلباتك...' : 'Fetching your requests...'}</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-solar-border p-12 text-center space-y-4">
          <div className="text-5xl">☀️</div>
          <h3 className="text-lg font-black text-solar-text">
            {isAr ? 'لا توجد طلبات عروض أسعار مسجلة بعد' : 'No solar requests found yet'}
          </h3>
          <p className="text-xs text-solar-muted font-bold max-w-md mx-auto">
            {isAr 
              ? 'يمكنك استخدام حاسبة الطاقة الشمسية المتطورة لحساب احتياجك وتصميم محطة شمسية وطلب عرض سعر معتمد بسهولة.' 
              : 'You can use our smart solar calculator to size and request a tailored solar system quote.'}
          </p>
          <button
            type="button"
            onClick={() => setView('calculator')}
            className="bg-solar-blue text-white px-6 py-3.5 rounded-xl font-black text-xs shadow-lg shadow-solar-blue/20 hover:bg-solar-blue/90 active:scale-95 transition cursor-pointer inline-flex items-center gap-2"
          >
            <Calculator size={16} />
            <span>{isAr ? 'فتح حاسبة الطاقة الشمسية' : 'Open Solar Calculator'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const dateStr = req.createdAt?.toDate 
              ? req.createdAt.toDate().toLocaleDateString('ar-EG') 
              : (req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '');

            const sysName = isAr 
              ? (req.systemType === 'on-grid' ? 'متصل بالشبكة (On-Grid)' : req.systemType === 'off-grid' ? 'منفصل عن الشبكة (Off-Grid)' : req.systemType === 'hybrid' ? 'هجين (Hybrid)' : 'طلمبة ري (Solar Pump)')
              : req.systemType;

            const tierName = isAr
              ? (req.tier === 'budget' ? 'الباقة الاقتصادية' : req.tier === 'premium' ? 'الباقة الفاخرة' : 'الباقة الموصى بها')
              : req.tier;

            const whatsAppMsg = isAr
              ? `مرحباً Enerjoo، أود الاستفسار ومتابعة حالة طلبي رقم: ${req.requestId} (المحطة: ${sysName} - قدرة: ${req.calculatedOutputs?.systemSizeKw || ''} kW)`
              : `Hello Enerjoo, checking the status of my solar request #${req.requestId} (${sysName} - ${req.calculatedOutputs?.systemSizeKw || ''} kW)`;

            return (
              <motion.div
                key={req.id || req.requestId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-solar-border rounded-3xl p-6 shadow-sm hover:shadow-md transition space-y-4"
              >
                {/* Top Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solar-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-solar-blue text-sm">
                      {req.requestId}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyRequestId(req.requestId)}
                      className="p-1 text-solar-muted hover:text-solar-blue rounded"
                      title={isAr ? 'نسخ كود الطلب' : 'Copy Request ID'}
                    >
                      {copiedId === req.requestId ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                    {getStatusBadge(req.status)}
                  </div>

                  <div className="text-[11px] font-bold text-solar-muted flex items-center gap-1">
                    <Calendar size={13} />
                    <span>{dateStr}</span>
                  </div>
                </div>

                {/* Specs overview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-solar-light p-3 rounded-2xl border border-solar-border/50">
                    <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'نوع النظام والباقة' : 'System & Tier'}</span>
                    <span className="text-xs font-black text-solar-text mt-1 block truncate">{sysName}</span>
                    <span className="text-[10px] text-solar-blue font-bold">{tierName}</span>
                  </div>

                  <div className="bg-solar-light p-3 rounded-2xl border border-solar-border/50">
                    <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'قدرة المحطة' : 'System Size'}</span>
                    <span className="text-sm font-black text-solar-blue mt-1 block">
                      {req.calculatedOutputs?.systemSizeKw ? `${req.calculatedOutputs.systemSizeKw.toFixed(2)} kW` : '-'}
                    </span>
                  </div>

                  <div className="bg-solar-light p-3 rounded-2xl border border-solar-border/50">
                    <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'التكلفة التقديرية' : 'Estimated Cost'}</span>
                    <span className="text-sm font-black text-emerald-600 mt-1 block">
                      {req.calculatedOutputs?.estimatedCost ? `${req.calculatedOutputs.estimatedCost.toLocaleString()} ج.م` : '-'}
                    </span>
                  </div>

                  <div className="bg-solar-light p-3 rounded-2xl border border-solar-border/50">
                    <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'الوفر المالي السنوي' : 'Annual Savings'}</span>
                    <span className="text-sm font-black text-indigo-700 mt-1 block">
                      {req.calculatedOutputs?.annualSavingsEgp ? `+${req.calculatedOutputs.annualSavingsEgp.toLocaleString()} ج.م` : '-'}
                    </span>
                  </div>
                </div>

                {/* Equipment specs summary */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5 font-bold">
                  <div className="flex justify-between">
                    <span className="text-solar-muted">{isAr ? 'الألواح الشمسية:' : 'Panels:'}</span>
                    <span>{req.calculatedOutputs?.panelQty}x {req.calculatedOutputs?.panelModel || 'ألواح معتمدة'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-solar-muted">{isAr ? 'الإنفرتر الشمسي:' : 'Inverter:'}</span>
                    <span>{req.calculatedOutputs?.inverterQty}x {req.calculatedOutputs?.inverterModel || 'إنفرتر معتمد'}</span>
                  </div>
                  {req.calculatedOutputs?.batteryQty && req.calculatedOutputs.batteryQty > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-solar-muted">{isAr ? 'البطاريات:' : 'Batteries:'}</span>
                      <span>{req.calculatedOutputs.batteryQty}x {req.calculatedOutputs.batteryModel || 'بطاريات تخزين'}</span>
                    </div>
                  ) : null}
                  {req.supplierContacted && (
                    <div className="flex justify-between pt-1.5 border-t border-slate-200/80 text-solar-blue">
                      <span className="flex items-center gap-1">
                        <Building2 size={13} />
                        <span>{isAr ? 'المورد المسؤول:' : 'Assigned Supplier:'}</span>
                      </span>
                      <span className="font-black">{req.supplierContacted}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-solar-muted font-bold">
                    {isAr ? 'لأي استفسار تواصل معنا مع ذكر كود الطلب' : 'For inquiries, quote your Request ID'}
                  </span>

                  <a
                    href={`https://wa.me/${UNIFIED_WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsAppMsg)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition shadow-sm"
                  >
                    <MessageCircle size={15} />
                    <span>{isAr ? 'متابعة عبر WhatsApp' : 'Track via WhatsApp'}</span>
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
