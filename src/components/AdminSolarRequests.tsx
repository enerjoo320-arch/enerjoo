import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, 
  Search, 
  ArrowRight, 
  Eye, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  Phone, 
  User, 
  MapPin, 
  Zap, 
  Battery, 
  Sun, 
  Layers, 
  Calendar, 
  Trash2, 
  X, 
  ExternalLink,
  MessageCircle,
  TrendingUp,
  Filter,
  DollarSign
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { SolarRequest, SolarRequestStatus, SolarSystemType, SolarTier } from '../types';
import { 
  subscribeToSolarRequests, 
  updateSolarRequestStatus, 
  deleteSolarRequest 
} from '../services/firestoreService';
import { formatEgyptianPhoneDisplay } from '../utils/phoneUtils';
import { translations } from '../translations';

interface AdminSolarRequestsProps {
  lang: 'ar' | 'en';
  onBack: () => void;
}

export const AdminSolarRequests: React.FC<AdminSolarRequestsProps> = ({ lang, onBack }) => {
  const isAr = lang === 'ar';
  const t = translations[lang];

  const [requests, setRequests] = useState<SolarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [systemFilter, setSystemFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<SolarRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [adminNoteInput, setAdminNoteInput] = useState('');

  // Subscribe in real-time to solarRequests
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToSolarRequests((data) => {
      setRequests(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Update admin note state when selecting a request
  useEffect(() => {
    if (selectedRequest) {
      setAdminNoteInput(selectedRequest.adminNotes || '');
    }
  }, [selectedRequest]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = 
        !searchTerm ||
        (req.customerName || '').toLowerCase().includes(q) ||
        (req.customerPhone || '').includes(q) ||
        (req.requestId || '').toLowerCase().includes(q) ||
        (req.governorate || '').toLowerCase().includes(q) ||
        (req.location || '').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
      const matchesSystem = systemFilter === 'all' || req.systemType === systemFilter;
      const matchesTier = tierFilter === 'all' || req.tier === tierFilter;

      return matchesSearch && matchesStatus && matchesSystem && matchesTier;
    });
  }, [requests, searchTerm, statusFilter, systemFilter, tierFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'pending').length;
    const inProgress = requests.filter(r => r.status === 'in_progress').length;
    const contacted = requests.filter(r => r.status === 'contacted').length;
    const completed = requests.filter(r => r.status === 'completed').length;
    const totalValue = requests.reduce((acc, r) => acc + (r.calculatedOutputs?.estimatedCost || 0), 0);

    return { total, pending, inProgress, contacted, completed, totalValue };
  }, [requests]);

  // Handle Status Update
  const handleStatusChange = async (reqId: string, newStatus: SolarRequestStatus, adminNotes?: string) => {
    setActionLoading(true);
    try {
      await updateSolarRequestStatus(reqId, newStatus, adminNotes);
      if (selectedRequest && selectedRequest.id === reqId) {
        setSelectedRequest(prev => prev ? { ...prev, status: newStatus, adminNotes: adminNotes ?? prev.adminNotes } : null);
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete
  const handleDelete = async (reqId: string) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا الطلب نهائياً؟' : 'Are you sure you want to delete this request permanently?')) {
      return;
    }
    setActionLoading(true);
    try {
      await deleteSolarRequest(reqId);
      if (selectedRequest && selectedRequest.id === reqId) {
        setSelectedRequest(null);
      }
    } catch (err) {
      console.error("Failed to delete request:", err);
    } finally {
      setActionLoading(false);
    }
  };

  // Export to Excel using xlsx
  const exportToExcel = () => {
    if (requests.length === 0) {
      alert(isAr ? 'لا توجد بيانات لتصديرها' : 'No data to export');
      return;
    }

    const rows = filteredRequests.map(r => {
      const dateStr = r.createdAt?.toDate 
        ? r.createdAt.toDate().toLocaleString('ar-EG') 
        : (r.createdAt ? new Date(r.createdAt).toLocaleString() : '');

      return {
        'رقم الطلب (Request ID)': r.requestId,
        'تاريخ الطلب (Date)': dateStr,
        'اسم العميل (Customer Name)': r.customerName,
        'رقم الهاتف (Phone)': r.customerPhone,
        'المحافظة (Governorate)': r.governorate || '',
        'الموقع (Location)': r.location || '',
        'نوع النظام (System Type)': r.systemType,
        'الباقة (Tier)': r.tier,
        'قدرة المحطة ك.و (System Size kW)': r.calculatedOutputs?.systemSizeKw || '',
        'التكلفة التقديرية ج.م (Cost EGP)': r.calculatedOutputs?.estimatedCost || '',
        'عدد الألواح (Panels Qty)': r.calculatedOutputs?.panelQty || '',
        'موديل الألواح (Panels Model)': r.calculatedOutputs?.panelModel || '',
        'عدد الإنفرتر (Inverter Qty)': r.calculatedOutputs?.inverterQty || '',
        'موديل الإنفرتر (Inverter Model)': r.calculatedOutputs?.inverterModel || '',
        'عدد البطاريات (Batteries Qty)': r.calculatedOutputs?.batteryQty || 0,
        'موديل البطاريات (Battery Model)': r.calculatedOutputs?.batteryModel || '',
        'الإنتاج السنوي ك.و.س (Annual Yield kWh)': r.calculatedOutputs?.annualProductionKwh || '',
        'الوفر السنوي ج.م (Annual Savings EGP)': r.calculatedOutputs?.annualSavingsEgp || '',
        'فترة الاسترداد بالسنوات (Payback Years)': r.calculatedOutputs?.paybackYears || '',
        'الحالة (Status)': r.status,
        'ملاحظات العميل (Notes)': r.notes || '',
        'ملاحظات الإدارة (Admin Notes)': r.adminNotes || '',
        'المورد المتواصل (Supplier)': r.supplierContacted || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Solar Requests');

    // Auto column sizing
    const maxCols = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, 15)
    }));
    worksheet['!cols'] = maxCols;

    const dateSlug = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Enerjoo_Solar_Requests_${dateSlug}.xlsx`);
  };

  const getStatusBadge = (status: SolarRequestStatus) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'قيد الانتظار' : 'Pending'}</span>;
      case 'in_progress':
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'جاري المعاينة' : 'In Progress'}</span>;
      case 'contacted':
        return <span className="bg-purple-100 text-purple-800 border border-purple-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'تم التواصل' : 'Contacted'}</span>;
      case 'completed':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'مكتمل ومعتمد' : 'Completed'}</span>;
      case 'cancelled':
        return <span className="bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black px-2.5 py-1 rounded-full">{isAr ? 'ملغي' : 'Cancelled'}</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[11px] font-black px-2.5 py-1 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="pb-24 font-sans" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top Header Card */}
      <div className="bg-white border border-solar-border/70 rounded-3xl p-5 mb-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-solar-blue text-white rounded-2xl flex items-center justify-center shadow-lg shadow-solar-blue/20">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-solar-text">
              {isAr ? 'لوحة إدارة طلبات وحسابات الطاقة الشمسية' : 'Solar Requests Management Dashboard'}
            </h1>
            <p className="text-xs text-solar-muted font-bold">
              {isAr 
                ? 'متابعة كافة طلبات عروض أسعار المحطات الشمسية، تصدير البيانات إلى Excel، والتواصل المباشر' 
                : 'Monitor all solar system quotation requests, export to Excel, and contact customers'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={exportToExcel}
            className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <FileSpreadsheet size={16} />
            <span>{isAr ? 'تصدير إلى Excel (.xlsx)' : 'Export to Excel (.xlsx)'}</span>
          </button>

          <button
            type="button"
            onClick={onBack}
            className="p-3 bg-solar-light hover:bg-solar-border/50 text-solar-text rounded-xl transition"
            title={isAr ? 'رجوع' : 'Back'}
          >
            <ArrowRight size={18} className={isAr ? '' : 'rotate-180'} />
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-white p-4 rounded-2xl border border-solar-border shadow-sm text-center">
          <span className="text-[11px] font-extrabold text-solar-muted block uppercase">{isAr ? 'إجمالي الطلبات' : 'Total Requests'}</span>
          <span className="text-2xl font-black text-solar-text mt-1 block">{stats.total}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm text-center">
          <span className="text-[11px] font-extrabold text-amber-700 block uppercase">{isAr ? 'قيد الانتظار' : 'Pending'}</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">{stats.pending}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-sm text-center">
          <span className="text-[11px] font-extrabold text-blue-700 block uppercase">{isAr ? 'جاري المعاينة' : 'In Progress'}</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.inProgress}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-sm text-center">
          <span className="text-[11px] font-extrabold text-purple-700 block uppercase">{isAr ? 'تم التواصل' : 'Contacted'}</span>
          <span className="text-2xl font-black text-purple-600 mt-1 block">{stats.contacted}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm text-center">
          <span className="text-[11px] font-extrabold text-emerald-700 block uppercase">{isAr ? 'مكتمل ومعتمد' : 'Completed'}</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats.completed}</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-solar-border shadow-sm text-center col-span-2 sm:col-span-1">
          <span className="text-[11px] font-extrabold text-solar-blue block uppercase">{isAr ? 'قيمة العروض' : 'Total Value'}</span>
          <span className="text-lg font-black text-solar-blue mt-1 block truncate">
            {stats.totalValue > 0 ? `${(stats.totalValue / 1000000).toFixed(2)}M ${isAr ? 'ج.م' : 'EGP'}` : '0'}
          </span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white border border-solar-border rounded-3xl p-4 mb-6 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-solar-muted" size={16} />
            <input
              type="text"
              placeholder={isAr ? 'ابحث بالاسم، الهاتف، كود الطلب، أو المحافظة...' : 'Search by name, phone, ID, city...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-solar-bg border border-solar-border rounded-xl py-2.5 pr-10 pl-3 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-solar-bg border border-solar-border rounded-xl py-2.5 px-3 text-xs font-bold text-solar-text outline-none focus:border-solar-blue cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="pending">{isAr ? 'قيد الانتظار (Pending)' : 'Pending'}</option>
              <option value="in_progress">{isAr ? 'جاري المعاينة (In Progress)' : 'In Progress'}</option>
              <option value="contacted">{isAr ? 'تم التواصل (Contacted)' : 'Contacted'}</option>
              <option value="completed">{isAr ? 'مكتمل (Completed)' : 'Completed'}</option>
              <option value="cancelled">{isAr ? 'ملغي (Cancelled)' : 'Cancelled'}</option>
            </select>
          </div>

          {/* System Type Filter */}
          <div>
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="w-full bg-solar-bg border border-solar-border rounded-xl py-2.5 px-3 text-xs font-bold text-solar-text outline-none focus:border-solar-blue cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع أنواع الأنظمة' : 'All System Types'}</option>
              <option value="on-grid">{isAr ? 'متصل بالشبكة (On-Grid)' : 'On-Grid'}</option>
              <option value="off-grid">{isAr ? 'منفصل عن الشبكة (Off-Grid)' : 'Off-Grid'}</option>
              <option value="hybrid">{isAr ? 'هجين (Hybrid)' : 'Hybrid'}</option>
              <option value="pump">{isAr ? 'طلمبة ري (Solar Pump)' : 'Solar Pump'}</option>
            </select>
          </div>

          {/* Tier Filter */}
          <div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="w-full bg-solar-bg border border-solar-border rounded-xl py-2.5 px-3 text-xs font-bold text-solar-text outline-none focus:border-solar-blue cursor-pointer"
            >
              <option value="all">{isAr ? 'جميع الباقات' : 'All Tiers'}</option>
              <option value="budget">{isAr ? 'الباقة الاقتصادية (Budget)' : 'Budget'}</option>
              <option value="recommended">{isAr ? 'الباقة الموصى بها (Recommended)' : 'Recommended'}</option>
              <option value="premium">{isAr ? 'الباقة الفاخرة (Premium)' : 'Premium'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table & Cards */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-solar-border p-12 text-center">
          <div className="w-10 h-10 border-4 border-solar-blue/20 border-t-solar-blue rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-black text-solar-muted">{isAr ? 'جاري تحميل الطلبات...' : 'Loading requests...'}</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-solar-border p-12 text-center space-y-3">
          <div className="text-4xl">📋</div>
          <h3 className="text-base font-black text-solar-text">{isAr ? 'لم يتم العثور على طلبات مطابقة' : 'No matching requests found'}</h3>
          <p className="text-xs text-solar-muted font-bold">{isAr ? 'جرب تغيير خيارات البحث أو التصفية.' : 'Try changing search or filter options.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-solar-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-solar-light/70 text-solar-muted font-black border-b border-solar-border">
                <tr>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'كود الطلب' : 'Request ID'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'الهاتف' : 'Phone'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'المحافظة' : 'Gov'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'نوع النظام والباقة' : 'System & Tier'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'قدرة المحطة' : 'Size'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'التكلفة التقديرية' : 'Estimated Cost'}</th>
                  <th className="p-3.5 whitespace-nowrap">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3.5 whitespace-nowrap text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solar-border/50 font-bold">
                {filteredRequests.map((req) => {
                  const dateStr = req.createdAt?.toDate 
                    ? req.createdAt.toDate().toLocaleDateString('ar-EG') 
                    : (req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '');

                  const sysName = isAr 
                    ? (req.systemType === 'on-grid' ? 'متصل بالشبكة' : req.systemType === 'off-grid' ? 'منفصل' : req.systemType === 'hybrid' ? 'هجين' : 'طلمبة ري')
                    : req.systemType;

                  const tierName = isAr
                    ? (req.tier === 'budget' ? 'اقتصادية' : req.tier === 'premium' ? 'فاخرة' : 'موصى بها')
                    : req.tier;

                  return (
                    <tr key={req.id || req.requestId} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-mono font-black text-solar-blue whitespace-nowrap">
                        {req.requestId}
                        <span className="block text-[10px] text-solar-muted font-sans font-normal">{dateStr}</span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-black text-solar-text">
                        {req.customerName}
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-mono text-left" dir="ltr">
                        {formatEgyptianPhoneDisplay(req.customerPhone)}
                      </td>
                      <td className="p-3.5 whitespace-nowrap text-solar-muted">
                        {req.governorate || req.location || '-'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="bg-solar-light px-2 py-0.5 rounded text-[11px] text-solar-text border border-solar-border">
                          {sysName} ({tierName})
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-black text-solar-text">
                        {req.calculatedOutputs?.systemSizeKw ? `${req.calculatedOutputs.systemSizeKw.toFixed(1)} kW` : '-'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-black text-emerald-600">
                        {req.calculatedOutputs?.estimatedCost ? `${req.calculatedOutputs.estimatedCost.toLocaleString()} ج.م` : '-'}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {getStatusBadge(req.status)}
                      </td>
                      <td className="p-3.5 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => setSelectedRequest(req)}
                            className="p-1.5 bg-solar-blue/10 text-solar-blue hover:bg-solar-blue hover:text-white rounded-lg transition"
                            title={isAr ? 'عرض التفاصيل الكاملة' : 'View Full Details'}
                          >
                            <Eye size={15} />
                          </button>

                          {/* WhatsApp Customer */}
                          <a
                            href={`https://wa.me/20${req.customerPhone.replace(/^0+/, '')}?text=${encodeURIComponent(
                              isAr 
                                ? `مرحباً أستاذ ${req.customerName}، نتواصل معك بخصوص طلبك في Enerjoo برقم: ${req.requestId}` 
                                : `Hello ${req.customerName}, contacting you regarding your Enerjoo request #${req.requestId}`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition"
                            title={isAr ? 'مراسلة العميل واتساب' : 'WhatsApp Customer'}
                          >
                            <MessageCircle size={15} />
                          </a>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => req.id && handleDelete(req.id)}
                            className="p-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition"
                            title={isAr ? 'حذف الطلب' : 'Delete Request'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] p-6 sm:p-8 shadow-2xl border border-solar-border my-8 max-h-[90vh] overflow-y-auto"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="absolute top-5 left-5 text-solar-muted hover:text-solar-text p-2 rounded-full hover:bg-solar-light transition"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6 border-b border-solar-border pb-4">
                <div className="w-12 h-12 bg-solar-blue/10 text-solar-blue rounded-2xl flex items-center justify-center">
                  <Zap size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-solar-blue text-sm">{selectedRequest.requestId}</span>
                    {getStatusBadge(selectedRequest.status)}
                  </div>
                  <h3 className="text-lg font-black text-solar-text mt-0.5">
                    {isAr ? 'تفاصيل طلب المحطة الشمسية' : 'Solar Request Specifications'}
                  </h3>
                </div>
              </div>

              <div className="space-y-6 text-xs">
                {/* Customer Information */}
                <div className="bg-solar-light/60 p-4 rounded-2xl border border-solar-border space-y-2">
                  <h4 className="font-black text-solar-text text-sm flex items-center gap-1.5">
                    <User size={15} className="text-solar-blue" />
                    <span>{isAr ? 'بيانات العميل' : 'Customer Info'}</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-solar-muted text-[11px] block">{isAr ? 'الاسم:' : 'Name:'}</span>
                      <span className="font-black text-solar-text text-sm">{selectedRequest.customerName}</span>
                    </div>
                    <div>
                      <span className="text-solar-muted text-[11px] block">{isAr ? 'الهاتف:' : 'Phone:'}</span>
                      <span className="font-mono font-black text-solar-text text-sm" dir="ltr">
                        {formatEgyptianPhoneDisplay(selectedRequest.customerPhone)}
                      </span>
                    </div>
                    <div>
                      <span className="text-solar-muted text-[11px] block">{isAr ? 'المحافظة:' : 'Governorate:'}</span>
                      <span className="font-bold text-solar-text">{selectedRequest.governorate || '-'}</span>
                    </div>
                    <div>
                      <span className="text-solar-muted text-[11px] block">{isAr ? 'الموقع بالتفصيل:' : 'Location:'}</span>
                      <span className="font-bold text-solar-text">{selectedRequest.location || '-'}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <a
                      href={`tel:${selectedRequest.customerPhone}`}
                      className="bg-solar-blue text-white px-3 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1 hover:bg-solar-blue/90"
                    >
                      <Phone size={12} />
                      <span>{isAr ? 'اتصال هاتفياً' : 'Call'}</span>
                    </a>
                    <a
                      href={`https://wa.me/20${selectedRequest.customerPhone.replace(/^0+/, '')}?text=${encodeURIComponent(
                        isAr 
                          ? `مرحباً أستاذ ${selectedRequest.customerName}، نتواصل معك بخصوص طلبك في Enerjoo برقم: ${selectedRequest.requestId}` 
                          : `Hello ${selectedRequest.customerName}, contacting you regarding your Enerjoo request #${selectedRequest.requestId}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1 hover:bg-emerald-700"
                    >
                      <MessageCircle size={12} />
                      <span>{isAr ? 'مراسلة واتساب' : 'WhatsApp'}</span>
                    </a>
                  </div>
                </div>

                {/* System Technical Specifications */}
                <div className="bg-white p-4 rounded-2xl border border-solar-border space-y-3">
                  <h4 className="font-black text-solar-text text-sm flex items-center gap-1.5">
                    <Sun size={15} className="text-solar-blue" />
                    <span>{isAr ? 'المواصفات الفنية والمعدات المحسوبة' : 'Calculated Equipment & Specs'}</span>
                  </h4>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
                    <div className="bg-solar-light p-2.5 rounded-xl border border-solar-border/60">
                      <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'قدرة المحطة' : 'System Size'}</span>
                      <span className="text-sm font-black text-solar-blue">{selectedRequest.calculatedOutputs?.systemSizeKw?.toFixed(2)} kW</span>
                    </div>

                    <div className="bg-solar-light p-2.5 rounded-xl border border-solar-border/60">
                      <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'التكلفة الإجمالية' : 'Total Cost'}</span>
                      <span className="text-sm font-black text-emerald-600">{selectedRequest.calculatedOutputs?.estimatedCost?.toLocaleString()} ج.م</span>
                    </div>

                    <div className="bg-solar-light p-2.5 rounded-xl border border-solar-border/60">
                      <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'الإنتاج السنوي' : 'Annual Yield'}</span>
                      <span className="text-sm font-black text-solar-text">{selectedRequest.calculatedOutputs?.annualProductionKwh?.toLocaleString()} kWh</span>
                    </div>

                    <div className="bg-solar-light p-2.5 rounded-xl border border-solar-border/60">
                      <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'الوفر السنوي' : 'Annual Savings'}</span>
                      <span className="text-sm font-black text-emerald-600">{selectedRequest.calculatedOutputs?.annualSavingsEgp?.toLocaleString()} ج.م</span>
                    </div>

                    <div className="bg-solar-light p-2.5 rounded-xl border border-solar-border/60">
                      <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'فترة الاسترداد' : 'Payback'}</span>
                      <span className="text-sm font-black text-solar-blue">{selectedRequest.calculatedOutputs?.paybackYears?.toFixed(1)} سنة</span>
                    </div>

                    <div className="bg-solar-light p-2.5 rounded-xl border border-solar-border/60">
                      <span className="text-[10px] text-solar-muted font-bold block">{isAr ? 'فترة الضمان' : 'Warranty'}</span>
                      <span className="text-sm font-black text-solar-text">{selectedRequest.calculatedOutputs?.warrantyYears || 10} سنوات</span>
                    </div>
                  </div>

                  {/* Components breakdown */}
                  <div className="space-y-1.5 pt-2 text-[11px] font-bold">
                    <div className="flex justify-between py-1 border-b border-solar-border/40">
                      <span className="text-solar-muted">{isAr ? 'الألواح الشمسية:' : 'Panels:'}</span>
                      <span>{selectedRequest.calculatedOutputs?.panelQty}x {selectedRequest.calculatedOutputs?.panelModel || 'لوح شمسي معتمد'} ({selectedRequest.calculatedOutputs?.panelWatt || 585}W)</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-solar-border/40">
                      <span className="text-solar-muted">{isAr ? 'الإنفرتر الشمسي:' : 'Inverter:'}</span>
                      <span>{selectedRequest.calculatedOutputs?.inverterQty}x {selectedRequest.calculatedOutputs?.inverterModel || 'إنفرتر معتمد'} ({selectedRequest.calculatedOutputs?.inverterKw || ''}kW)</span>
                    </div>

                    {selectedRequest.calculatedOutputs?.batteryQty && selectedRequest.calculatedOutputs.batteryQty > 0 ? (
                      <div className="flex justify-between py-1 border-b border-solar-border/40">
                        <span className="text-solar-muted">{isAr ? 'البطاريات:' : 'Batteries:'}</span>
                        <span>{selectedRequest.calculatedOutputs.batteryQty}x {selectedRequest.calculatedOutputs.batteryModel || 'بطارية'} ({selectedRequest.calculatedOutputs.batteryKwh || ''}kWh)</span>
                      </div>
                    ) : null}

                    {selectedRequest.inputs?.monthlyBill && (
                      <div className="flex justify-between py-1 border-b border-solar-border/40">
                        <span className="text-solar-muted">{isAr ? 'فاتورة الكهرباء المدخلة:' : 'Input Monthly Bill:'}</span>
                        <span>{selectedRequest.inputs.monthlyBill} ج.م / شهر</span>
                      </div>
                    )}

                    {selectedRequest.inputs?.pumpHp && (
                      <div className="flex justify-between py-1 border-b border-solar-border/40">
                        <span className="text-solar-muted">{isAr ? 'قدرة الطلمبة:' : 'Pump HP:'}</span>
                        <span>{selectedRequest.inputs.pumpHp} حصان</span>
                      </div>
                    )}

                    {selectedRequest.notes && (
                      <div className="py-1">
                        <span className="text-solar-muted block">{isAr ? 'ملاحظات العميل:' : 'Customer Notes:'}</span>
                        <p className="text-solar-text bg-solar-light p-2 rounded-lg mt-1">{selectedRequest.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Status and Notes Update */}
                <div className="bg-solar-light/60 p-4 rounded-2xl border border-solar-border space-y-3">
                  <h4 className="font-black text-solar-text text-sm flex items-center gap-1.5">
                    <Shield size={15} className="text-solar-blue" />
                    <span>{isAr ? 'تحديث حالة الطلب وملاحظات الإدارة' : 'Update Status & Admin Notes'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-black text-solar-muted block mb-1">
                        {isAr ? 'تغيير الحالة:' : 'Change Status:'}
                      </label>
                      <select
                        value={selectedRequest.status}
                        onChange={(e) => selectedRequest.id && handleStatusChange(selectedRequest.id, e.target.value as SolarRequestStatus, adminNoteInput)}
                        disabled={actionLoading}
                        className="w-full bg-white border border-solar-border rounded-xl py-2.5 px-3 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
                      >
                        <option value="pending">{isAr ? 'قيد الانتظار (Pending)' : 'Pending'}</option>
                        <option value="in_progress">{isAr ? 'جاري المعاينة (In Progress)' : 'In Progress'}</option>
                        <option value="contacted">{isAr ? 'تم التواصل (Contacted)' : 'Contacted'}</option>
                        <option value="completed">{isAr ? 'مكتمل ومعتمد (Completed)' : 'Completed'}</option>
                        <option value="cancelled">{isAr ? 'ملغي (Cancelled)' : 'Cancelled'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-solar-muted block mb-1">
                        {isAr ? 'ملاحظات الإدارة الداخلية:' : 'Internal Admin Notes:'}
                      </label>
                      <input
                        type="text"
                        placeholder={isAr ? 'أضف ملاحظة خاصة...' : 'Add private note...'}
                        value={adminNoteInput}
                        onChange={(e) => setAdminNoteInput(e.target.value)}
                        className="w-full bg-white border border-solar-border rounded-xl py-2.5 px-3 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => selectedRequest.id && handleStatusChange(selectedRequest.id, selectedRequest.status, adminNoteInput)}
                    className="w-full bg-solar-blue hover:bg-solar-blue/90 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <CheckCircle2 size={15} />
                    <span>{isAr ? 'حفظ التحديثات' : 'Save Updates'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
