import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Edit2,
  Check,
  X,
  ShieldCheck,
  Zap,
  RefreshCw,
  Calculator,
  Search,
  ArrowUpDown,
  LayoutGrid,
  List,
  Info,
  ExternalLink,
  HelpCircle,
  Plus,
  Trash2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { SOLAR_PANEL_BRANDS, SolarPanelBrand, User } from '../types';
import {
  EnergyExchangeRecord,
  findMatchingBrandPricePerWatt,
  addSolarPanelBrandRange,
  updateSolarPanelBrandRange,
  deleteSolarPanelBrandRange,
  updateSolarPanelBrandPrice,
  subscribeToEnergyExchange,
  DEFAULT_SOLAR_PANEL_PRICES
} from '../services/energyExchangeService';

interface EnergyExchangeProps {
  lang: 'ar' | 'en';
  user: User | null;
  prices: Record<string, number>;
  records?: EnergyExchangeRecord[];
  onNavigateToBrandProducts?: (brandName: string) => void;
}

interface BrandMeta {
  arName: string;
  tier: string;
  country: string;
  highlight: string;
}

const BRAND_METADATA: Record<SolarPanelBrand, BrandMeta> = {
  'Jinko': {
    arName: 'جينكو سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'الأكثر انتشاراً في المشروعات المصرية وخلايا Tiger Neo النصفية',
  },
  'LONGi Solar': {
    arName: 'لونجي سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'رائدة تقنية Hi-MO وتحمل استثنائي لدرجات الحرارة المرتفعة',
  },
  'AIKO': {
    arName: 'إيكو سولار',
    tier: 'Tier 1 Premium',
    country: 'الصين',
    highlight: 'أعلى كفاءة خلايا تجارية في العالم بتقنية All-Back-Contact (ABC)',
  },
  'Trina Solar': {
    arName: 'ترينا سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'سلسلة Vertex بقدرات فائقة وتوليد وجهين للمزارع والمحطات',
  },
  'JA Solar': {
    arName: 'جي إيه سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'أداء عالي في الإشعاع المنخفض ومقاومة متفوقة للتدهور الضوئي PID',
  },
  'Risen': {
    arName: 'رايزن إنرجي',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'تقنية Heterojunction (HJT) ومعامل حراري متفوق في الصيف',
  },
  'GCL': {
    arName: 'جي سي إل',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'سلاسل تصنيع متكاملة من بلورات السيليكون النقي للألواح',
  },
  'Suntech': {
    arName: 'صنتك باور',
    tier: 'Tier 1 Standard',
    country: 'الصين',
    highlight: 'خبرة عريقة في محطات الطاقة الكبرى والمشروعات الصناعية',
  },
  'Astronergy': {
    arName: 'أسترونيرجي',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'سلسلة Astro N5 عالية الموثوقية بضمان جودة وأداء ممتد',
  },
  'Gokin': {
    arName: 'جوكين سولار',
    tier: 'Tier 1 Certified',
    country: 'الصين',
    highlight: 'خلايا سيليكون متطورة مع حلول اقتصادية متوازنة في التكلفة',
  },
  'Quantum Solar': {
    arName: 'كوانتوم سولار',
    tier: 'Certified Standard',
    country: 'عالمي',
    highlight: 'خيار اقتصادي عملي للمزارع والمنظومات المنزلية المستقلة',
  },
  'Ulica Solar': {
    arName: 'يوليكا سولار',
    tier: 'Tier 1 Certified',
    country: 'الصين',
    highlight: 'كفاءة تشغيل مستقرة وشهادات جودة واختبارات دولية معتمدة',
  },
  'ZNShine Solar': {
    arName: 'زد إن شاين سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'تقنية طلاء الجرافين ذاتية التنظيف لمقاومة تراكم الغبار',
  },
};

const COMMON_WATTAGES = [550, 585, 600, 650, 725];

export const EnergyExchange: React.FC<EnergyExchangeProps> = ({
  lang,
  user,
  prices: initialPrices,
  records: initialRecords = [],
  onNavigateToBrandProducts,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = user?.type === 'admin';

  // Live Exchange Data State
  const [livePrices, setLivePrices] = useState<Record<string, number>>(initialPrices);
  const [liveRecords, setLiveRecords] = useState<EnergyExchangeRecord[]>(initialRecords);

  // Subscribe to real-time sync
  useEffect(() => {
    const unsubscribe = subscribeToEnergyExchange((updatedPrices, updatedRecords) => {
      setLivePrices(updatedPrices);
      if (updatedRecords) {
        setLiveRecords(updatedRecords);
      }
    });
    return () => unsubscribe();
  }, []);

  // Filters, search, and view mode
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'name'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Interactive Calculator State
  const [calcBrand, setCalcBrand] = useState<SolarPanelBrand>('Jinko');
  const [calcWattage, setCalcWattage] = useState<number>(585);
  const [customWattageInput, setCustomWattageInput] = useState<string>('585');

  // Admin Modal / Range Editing State
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [modalBrand, setModalBrand] = useState<SolarPanelBrand>('Jinko');
  const [modalMinWatt, setModalMinWatt] = useState<string>('500');
  const [modalMaxWatt, setModalMaxWatt] = useState<string>('600');
  const [modalPricePerWatt, setModalPricePerWatt] = useState<string>('12.00');
  
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Calculated Output for Calculator
  const calcMatch = useMemo(() => {
    return findMatchingBrandPricePerWatt(liveRecords, calcBrand, undefined, calcWattage);
  }, [liveRecords, calcBrand, calcWattage]);

  const calcPricePerWatt = calcMatch.pricePerWatt;
  const calcTotalPanelPrice = calcPricePerWatt ? calcWattage * calcPricePerWatt : 0;

  // Group records by brand
  const recordsByBrand = useMemo(() => {
    const map: Record<string, EnergyExchangeRecord[]> = {};
    SOLAR_PANEL_BRANDS.forEach(b => { map[b] = []; });

    liveRecords.forEach(r => {
      if (r.brand) {
        // match brand
        const b = r.brand;
        const matched = SOLAR_PANEL_BRANDS.find(sb => sb.toLowerCase() === b.toLowerCase()) || b;
        if (!map[matched]) map[matched] = [];
        map[matched].push(r);
      }
    });
    return map;
  }, [liveRecords]);

  // Market Summary Metrics
  const marketMetrics = useMemo(() => {
    const priceList = SOLAR_PANEL_BRANDS.map(brand => livePrices[brand] ?? 12.00);
    const avg = priceList.reduce((acc, curr) => acc + curr, 0) / (priceList.length || 1);
    
    let minBrand: SolarPanelBrand = SOLAR_PANEL_BRANDS[0];
    let maxBrand: SolarPanelBrand = SOLAR_PANEL_BRANDS[0];
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    SOLAR_PANEL_BRANDS.forEach(b => {
      const p = livePrices[b] ?? 12.00;
      if (p < minPrice) {
        minPrice = p;
        minBrand = b;
      }
      if (p > maxPrice) {
        maxPrice = p;
        maxBrand = b;
      }
    });

    return {
      averagePrice: avg,
      minPrice,
      minBrand,
      maxPrice,
      maxBrand,
      totalBrands: SOLAR_PANEL_BRANDS.length,
    };
  }, [livePrices]);

  // Filtered & Sorted Brands List
  const displayedBrands = useMemo(() => {
    let list = [...SOLAR_PANEL_BRANDS];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(b => {
        const meta = BRAND_METADATA[b];
        const enMatch = b.toLowerCase().includes(q);
        const arMatch = meta?.arName.toLowerCase().includes(q);
        const highlightMatch = meta?.highlight.toLowerCase().includes(q);
        return enMatch || arMatch || highlightMatch;
      });
    }

    if (sortBy === 'price-asc') {
      list.sort((a, b) => (livePrices[a] ?? 12.00) - (livePrices[b] ?? 12.00));
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => (livePrices[b] ?? 12.00) - (livePrices[a] ?? 12.00));
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.localeCompare(b));
    }

    return list;
  }, [searchTerm, sortBy, livePrices]);

  // Handlers for Admin Range Operations
  const handleOpenAddModal = (brand?: SolarPanelBrand) => {
    setModalMode('add');
    setEditingPriceId(null);
    setModalBrand(brand || 'Jinko');
    setModalMinWatt('500');
    setModalMaxWatt('600');
    setModalPricePerWatt((livePrices[brand || 'Jinko'] ?? 12.00).toFixed(2));
    setErrorMsg(null);
    setShowRangeModal(true);
  };

  const handleOpenEditModal = (rec: EnergyExchangeRecord) => {
    setModalMode('edit');
    setEditingPriceId(rec.price_id);
    setModalBrand((rec.brand as SolarPanelBrand) || 'Jinko');
    setModalMinWatt(String(rec.min_wattage ?? 500));
    setModalMaxWatt(String(rec.max_wattage ?? 600));
    setModalPricePerWatt(rec.price_per_watt.toFixed(2));
    setErrorMsg(null);
    setShowRangeModal(true);
  };

  const handleSaveRange = async () => {
    const minW = parseInt(modalMinWatt, 10);
    const maxW = parseInt(modalMaxWatt, 10);
    const pPerW = parseFloat(modalPricePerWatt);

    if (isNaN(minW) || minW <= 0) {
      setErrorMsg(isAr ? 'الحد الأدنى للقدرة يجب أن يكون رقماً صحيحاً أكبر من 0' : 'Min wattage must be > 0');
      return;
    }
    if (isNaN(maxW) || maxW < minW) {
      setErrorMsg(isAr ? 'الحد الأقصى للقدرة يجب أن يكون أكبر من أو يساوي الحد الأدنى' : 'Max wattage must be >= min wattage');
      return;
    }
    if (isNaN(pPerW) || pPerW <= 0 || pPerW > 200) {
      setErrorMsg(isAr ? 'سعر الوات يجب أن يكون رقماً صحيحاً أكبر من 0 وأقل من 200 ج.م' : 'Price per watt must be > 0 and <= 200');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      if (modalMode === 'add') {
        await addSolarPanelBrandRange(modalBrand, minW, maxW, pPerW);
        setSuccessMsg(isAr ? `تمت إضافة نطاق قدرة جديد لـ ${modalBrand} بنجاح` : `Added wattage range for ${modalBrand}`);
      } else if (modalMode === 'edit' && editingPriceId) {
        await updateSolarPanelBrandRange(editingPriceId, modalBrand, minW, maxW, pPerW);
        setSuccessMsg(isAr ? `تم تحديث نطاق القدرة بنجاح` : `Updated wattage range`);
      }

      setShowRangeModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'فشل حفظ نطاق القدرة' : 'Failed to save range'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRange = async (priceId: string, brandName: string) => {
    if (!window.confirm(isAr ? `هل أنت تأكد من رغبتك في حذف هذا النطاق لـ ${brandName}؟` : `Delete wattage range for ${brandName}?`)) {
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);
      await deleteSolarPanelBrandRange(priceId);
      setSuccessMsg(isAr ? 'تم حذف النطاق بنجاح' : 'Range deleted successfully');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'فشل حذف النطاق' : 'Failed to delete range'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-sans">
      {/* 1. Header Hero Banner */}
      <div className="relative overflow-hidden bg-slate-900 text-white rounded-3xl p-6 sm:p-10 mb-8 border border-slate-800 shadow-xl">
        {/* Decorative background blur */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-400 mb-3 tracking-wide">
              <TrendingUp size={16} />
              <span>{isAr ? 'بورصة الطاقة المركزية · Enerjoo Exchange' : 'Central Energy Exchange · Enerjoo'}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-300 font-normal">{isAr ? 'السوق المصري' : 'Egyptian Market'}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2 text-white leading-tight">
              {isAr ? 'بورصة الألواح الشمسية: سعر الوات اللحظي' : 'Solar Panel Energy Exchange: Real-Time Watt Price'}
            </h1>

            <h2 className="text-base sm:text-xl font-bold text-blue-200 mb-1 leading-snug">
              {isAr ? 'المرجع المصري الأول لعرض بورصة الطاقة الشمسية في السوق المصري' : 'First Egyptian Reference for Solar Panel Energy Exchange'}
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {isAdmin ? (
              <div className="flex items-center gap-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold">
                <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <span className="block font-bold">{isAr ? 'وضع المسؤول' : 'Admin Mode'}</span>
                  <span className="text-[11px] text-emerald-400/80 font-normal">{isAr ? 'تحديث لحظي ومباشر لسعر الوات' : 'Real-Time Direct Watt Price Updates'}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2.5 rounded-2xl text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? 'تحديث لحظي ومباشر لسعر الوات' : 'Real-Time Direct Watt Price Updates'}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Key Market Metrics Grid */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Avg Price */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-slate-400 font-medium block mb-1">
              {isAr ? 'متوسط سعر الوات اليوم' : 'Average Watt Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
                {marketMetrics.averagePrice.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr ? 'متوسط الماركات المعتمدة' : 'Across all brands'}
            </span>
          </div>

          {/* Min Price */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-emerald-400 font-medium block mb-1">
              {isAr ? 'أقل سعر وات (الأكثر توفيراً)' : 'Lowest Watt Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-400">
                {marketMetrics.minPrice.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
            </div>
            <span className="text-[11px] text-slate-300 mt-1 block truncate">
              {marketMetrics.minBrand} ({BRAND_METADATA[marketMetrics.minBrand]?.arName || ''})
            </span>
          </div>

          {/* Max Price */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-amber-400 font-medium block mb-1">
              {isAr ? 'أعلى سعر وات (الفئة العليا)' : 'Top Tier Watt Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-amber-400">
                {marketMetrics.maxPrice.toFixed(2)}
              </span>
              <span className="text-xs text-slate-400">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
            </div>
            <span className="text-[11px] text-slate-300 mt-1 block truncate">
              {marketMetrics.maxBrand} ({BRAND_METADATA[marketMetrics.maxBrand]?.arName || ''})
            </span>
          </div>

          {/* Certified Brands */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-slate-400 font-medium block mb-1">
              {isAr ? 'الماركات العالمية المعتمدة' : 'Certified Brands'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
                {marketMetrics.totalBrands}
              </span>
              <span className="text-xs text-slate-400">{isAr ? 'ماركة' : 'Brands'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr ? 'مطابقة لمعايير Tier 1' : 'Tier 1 Standard'}
            </span>
          </div>
        </div>
      </div>

      {/* Global Status Alerts */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Interactive Instant Calculator Section */}
      <div className="bg-gradient-to-br from-blue-50 via-white to-slate-50 border border-blue-100 rounded-3xl p-6 sm:p-8 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
              <Calculator size={16} />
              <span>{isAr ? 'حاسبة اللوح الفورية' : 'Instant Panel Price Calculator'}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              {isAr ? 'احسب سعر أي لوح شمسي في ثوانٍ' : 'Calculate Any Solar Panel Price'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {isAr
                ? 'اختر الماركة وأدخل القدرة بالوات، وسيتم الحساب وفق نطاق القدرة المطابق.'
                : 'Select brand and wattage to calculate the price according to the matching wattage range.'}
            </p>
          </div>

          {/* Price Result Box */}
          <div className="bg-white border-2 border-blue-500/20 rounded-2xl p-4 sm:px-6 shadow-sm flex flex-col items-start md:items-end self-stretch md:self-auto min-w-[240px]">
            {calcMatch.isOutOfBounds ? (
              <div className="w-full text-center py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100/80 px-3 py-1 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>{isAr ? 'هذه القدرة غير مدعومة حالياً لهذه العلامة التجارية' : 'Wattage out of supported ranges'}</span>
                </span>
              </div>
            ) : (
              <>
                <span className="text-[11px] text-slate-500 font-medium">
                  {isAr ? 'سعر اللوح الإجمالي المتوقع' : 'Estimated Total Panel Price'}
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-extrabold text-blue-600 font-mono tabular-nums">
                    {calcTotalPanelPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    {isAr ? 'ج.م' : 'EGP'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                  {calcWattage}W × {calcPricePerWatt?.toFixed(2)} {isAr ? 'ج.م/وات' : 'EGP/W'}
                  {calcMatch.isRangeMatch && (
                    <span className="mr-1 text-emerald-600 font-semibold">
                      ({isAr ? `نطاق: ${calcMatch.minWattage}-${calcMatch.maxWattage}W` : `Range: ${calcMatch.minWattage}-${calcMatch.maxWattage}W`})
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-blue-100/80">
          {/* Step 1: Select Brand */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {isAr ? '1. اختر الماركة المصنعة:' : '1. Select Panel Brand:'}
            </label>
            <div className="relative">
              <select
                value={calcBrand}
                onChange={(e) => setCalcBrand(e.target.value as SolarPanelBrand)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              >
                {SOLAR_PANEL_BRANDS.map(b => {
                  const meta = BRAND_METADATA[b];
                  const p = livePrices[b] ?? 12.00;
                  return (
                    <option key={b} value={b}>
                      {b} {meta ? `(${meta.arName})` : ''} — {p.toFixed(2)} {isAr ? 'ج.م/وات' : 'EGP/W'}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
              <Info size={13} className="text-blue-500 shrink-0" />
              <span>{BRAND_METADATA[calcBrand]?.highlight || 'ماركة معتمدة عالية الكفاءة'}</span>
            </div>
          </div>

          {/* Step 2: Custom / Selected Wattage */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {isAr ? '2. أدخل قدرة اللوح بالوات (Watt):' : '2. Enter Panel Power (Watts):'}
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {COMMON_WATTAGES.map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setCalcWattage(w);
                    setCustomWattageInput(String(w));
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    calcWattage === w
                      ? 'bg-blue-600 text-white shadow-sm scale-105'
                      : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {w}W
                </button>
              ))}
            </div>

            {/* Manual Free Entry Wattage Input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="50"
                  max="1500"
                  step="1"
                  value={customWattageInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomWattageInput(val);
                    const n = parseInt(val, 10);
                    if (!isNaN(n) && n > 0) {
                      setCalcWattage(n);
                    }
                  }}
                  placeholder={isAr ? 'أدخل قدرة مخصصة (مثلاً 585)' : 'Custom wattage (e.g. 585)'}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">
                  {isAr ? 'وات' : 'Watts'}
                </span>
              </div>

              {onNavigateToBrandProducts && (
                <button
                  type="button"
                  onClick={() => onNavigateToBrandProducts(calcBrand)}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95"
                >
                  <span>{isAr ? `تصفح ألواح ${calcBrand}` : `Explore ${calcBrand}`}</span>
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Controls Toolbar & Admin Global Add Range Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'ابحث عن ماركة (مثال: جينكو، لونجي، ترينا...)' : 'Search brand (e.g. Jinko, LONGi, Trina...)'}
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort, View & Admin Add Range */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => handleOpenAddModal()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95"
            >
              <Plus size={15} />
              <span>{isAr ? 'إضافة نطاق قدرة' : 'Add Wattage Range'}</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <ArrowUpDown size={14} className="text-slate-500 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="default">{isAr ? 'الترتيب الافتراضي' : 'Default Order'}</option>
              <option value="price-asc">{isAr ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
              <option value="price-desc">{isAr ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
              <option value="name">{isAr ? 'الاسم أبجدياً' : 'Brand Name (A-Z)'}</option>
            </select>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Main Pricing & Ranges Display */}
      {displayedBrands.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
          <HelpCircle size={36} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            {isAr ? 'لم يتم العثور على ماركات مطابقة' : 'No matching brands found'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isAr ? 'جرّب البحث باسم آخر أو أعد ضبط شريط البحث' : 'Try searching with another name or reset search'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW: Displays Brand Cards with Wattage Ranges */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {displayedBrands.map((brand, index) => {
            const meta = BRAND_METADATA[brand];
            const brandRecs = recordsByBrand[brand] || [];
            const rangeRecs = brandRecs.filter(r => r.min_wattage != null && r.max_wattage != null);
            const legacyRecs = brandRecs.filter(r => r.min_wattage == null || r.max_wattage == null);

            return (
              <div
                key={brand}
                className="bg-white rounded-3xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center text-sm border border-blue-100 shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 notranslate leading-snug">
                          {brand}
                        </h3>
                        <div className="text-xs text-slate-500 font-medium">
                          {meta?.arName || brand} · <span className="text-slate-400">{meta?.tier || 'Tier 1'}</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleOpenAddModal(brand)}
                        className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-xl transition flex items-center gap-1 cursor-pointer shrink-0"
                        title={isAr ? 'إضافة نطاق قدرة' : 'Add Range'}
                      >
                        <Plus size={13} />
                        <span>{isAr ? 'نطاق' : 'Range'}</span>
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {meta?.highlight || 'لوح شمسي معتمد عالي الكفاءة ومطابق للمواصفات القياسية.'}
                  </p>

                  {/* Display Wattage Ranges */}
                  <div className="space-y-2 mb-4">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      {isAr ? 'نطاقات أسعار قدرة الوات:' : 'Wattage Ranges & Prices:'}
                    </span>

                    {rangeRecs.length > 0 ? (
                      rangeRecs.map((r) => (
                        <div
                          key={r.price_id}
                          className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 font-mono">
                              {r.min_wattage} - {r.max_wattage} {isAr ? 'وات' : 'W'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-blue-600 font-mono">
                              {r.price_per_watt.toFixed(2)} <span className="text-[10px] font-sans text-slate-500">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
                            </span>

                            {isAdmin && (
                              <div className="flex items-center gap-1 mr-1">
                                <button
                                  onClick={() => handleOpenEditModal(r)}
                                  className="p-1 text-blue-600 hover:text-blue-800 bg-white rounded-lg border border-slate-200 hover:bg-blue-50 transition cursor-pointer"
                                  title={isAr ? 'تعديل النطاق' : 'Edit'}
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRange(r.price_id, brand)}
                                  className="p-1 text-red-500 hover:text-red-700 bg-white rounded-lg border border-slate-200 hover:bg-red-50 transition cursor-pointer"
                                  title={isAr ? 'حذف النطاق' : 'Delete'}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between">
                        <span className="text-slate-500 text-[11px] italic">
                          {isAr ? 'السعر الأساسي الموحد (سجل قديم):' : 'Legacy Flat Price:'}
                        </span>
                        <span className="font-extrabold text-blue-600 font-mono">
                          {(livePrices[brand] ?? 12.00).toFixed(2)} {isAr ? 'ج.م/وات' : 'EGP/W'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isAr ? 'ضمان رسمي وأسعار موحدة' : 'Official Warranty & Pricing'}
                  </span>

                  {onNavigateToBrandProducts && (
                    <button
                      type="button"
                      onClick={() => onNavigateToBrandProducts(brand)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>{isAr ? 'تصفح الألواح' : 'View Panels'}</span>
                      <ExternalLink size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-600">
                  <th className="py-3.5 px-4 text-center w-12">#</th>
                  <th className="py-3.5 px-4">{isAr ? 'العلامة التجارية' : 'Brand Name'}</th>
                  <th className="py-3.5 px-4">{isAr ? 'نطاقات أسعار القدرة (ج.م/وات)' : 'Wattage Ranges & Prices'}</th>
                  <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {displayedBrands.map((brand, index) => {
                  const meta = BRAND_METADATA[brand];
                  const brandRecs = recordsByBrand[brand] || [];
                  const rangeRecs = brandRecs.filter(r => r.min_wattage != null && r.max_wattage != null);

                  return (
                    <tr key={brand} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-center text-xs font-bold text-slate-400">
                        {index + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 notranslate">{brand}</span>
                          <span className="text-[11px] text-slate-500">
                            {meta?.arName || brand} · {meta?.tier || 'Tier 1'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {rangeRecs.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {rangeRecs.map(r => (
                              <span key={r.price_id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-900 rounded-lg text-xs font-mono font-semibold border border-blue-100">
                                {r.min_wattage}-{r.max_wattage}W: <span className="font-bold text-blue-600">{r.price_per_watt.toFixed(2)}</span> ج.م/وات
                                {isAdmin && (
                                  <button onClick={() => handleDeleteRange(r.price_id, brand)} className="text-red-500 hover:text-red-700 ml-1">
                                    <X size={12} />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-slate-600 font-bold">
                            {(livePrices[brand] ?? 12.00).toFixed(2)} ج.م/وات (أساسي)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isAdmin && (
                            <button
                              onClick={() => handleOpenAddModal(brand)}
                              className="px-2.5 py-1 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={13} />
                              <span>{isAr ? 'إضافة نطاق' : 'Add Range'}</span>
                            </button>
                          )}
                          {onNavigateToBrandProducts && (
                            <button
                              onClick={() => onNavigateToBrandProducts(brand)}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isAr ? 'الألواح' : 'Panels'}</span>
                              <ExternalLink size={12} />
                            </button>
                          )}
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

      {/* 6. Admin Range Modal (Add / Edit Range) */}
      {showRangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {modalMode === 'add'
                      ? (isAr ? 'إضافة نطاق قدرة جديد' : 'Add Wattage Range')
                      : (isAr ? 'تعديل نطاق القدرة' : 'Edit Wattage Range')}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {modalBrand} ({BRAND_METADATA[modalBrand]?.arName})
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowRangeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'العلامة التجارية:' : 'Brand:'}
                </label>
                <select
                  value={modalBrand}
                  onChange={(e) => setModalBrand(e.target.value as SolarPanelBrand)}
                  disabled={modalMode === 'edit'}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SOLAR_PANEL_BRANDS.map(b => (
                    <option key={b} value={b}>{b} ({BRAND_METADATA[b]?.arName})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'الحد الأدنى للقدرة (وات W):' : 'Min Wattage (W):'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={modalMinWatt}
                    onChange={(e) => setModalMinWatt(e.target.value)}
                    placeholder="500"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'الحد الأقصى للقدرة (وات W):' : 'Max Wattage (W):'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={modalMaxWatt}
                    onChange={(e) => setModalMaxWatt(e.target.value)}
                    placeholder="600"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'سعر الوات (جنيه/وات EGP/W):' : 'Price Per Watt (EGP/W):'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="200"
                    value={modalPricePerWatt}
                    onChange={(e) => setModalPricePerWatt(e.target.value)}
                    placeholder="12.00"
                    className="w-full bg-white border-2 border-blue-500 rounded-xl px-3.5 py-2.5 text-base font-extrabold text-slate-900 focus:outline-none"
                  />
                  <span className="absolute left-3 top-3 text-xs font-bold text-slate-400">
                    ج.م/وات
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRangeModal(false)}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleSaveRange}
                disabled={isSaving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>{modalMode === 'add' ? (isAr ? 'إضافة النطاق' : 'Add Range') : (isAr ? 'حفظ التغييرات' : 'Save Changes')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
