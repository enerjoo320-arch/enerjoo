import React, { useState, useMemo } from 'react';
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
  SlidersHorizontal,
  ArrowUpDown,
  LayoutGrid,
  List,
  Info,
  ExternalLink,
  HelpCircle,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';
import { SOLAR_PANEL_BRANDS, SolarPanelBrand, User } from '../types';
import { updateSolarPanelBrandPrice } from '../services/energyExchangeService';

interface EnergyExchangeProps {
  lang: 'ar' | 'en';
  user: User | null;
  prices: Record<string, number>;
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
  prices,
  onNavigateToBrandProducts,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = user?.type === 'admin';

  // Filters, search, and view mode
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'name'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Interactive Quick Calculator State
  const [calcBrand, setCalcBrand] = useState<SolarPanelBrand>('Jinko');
  const [calcWattage, setCalcWattage] = useState<number>(585);
  const [customWattageInput, setCustomWattageInput] = useState<string>('585');

  // Admin Editing State
  const [editingBrand, setEditingBrand] = useState<SolarPanelBrand | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessBrand, setSaveSuccessBrand] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick Calculator Calculated Output
  const calcPricePerWatt = prices[calcBrand] ?? 12.00;
  const calcTotalPanelPrice = calcWattage * calcPricePerWatt;

  // Market Summary Metrics
  const marketMetrics = useMemo(() => {
    const priceList = SOLAR_PANEL_BRANDS.map(brand => prices[brand] ?? 12.00);
    const avg = priceList.reduce((acc, curr) => acc + curr, 0) / (priceList.length || 1);
    
    let minBrand: SolarPanelBrand = SOLAR_PANEL_BRANDS[0];
    let maxBrand: SolarPanelBrand = SOLAR_PANEL_BRANDS[0];
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    SOLAR_PANEL_BRANDS.forEach(b => {
      const p = prices[b] ?? 12.00;
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
  }, [prices]);

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
      list.sort((a, b) => (prices[a] ?? 12.00) - (prices[b] ?? 12.00));
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => (prices[b] ?? 12.00) - (prices[a] ?? 12.00));
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.localeCompare(b));
    }

    return list;
  }, [searchTerm, sortBy, prices]);

  const handleStartEdit = (brand: SolarPanelBrand) => {
    setEditingBrand(brand);
    setTempPrice((prices[brand] ?? 12.00).toFixed(2));
    setErrorMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingBrand(null);
    setTempPrice('');
    setErrorMsg(null);
  };

  const handleAdjustTempPrice = (delta: number) => {
    const cur = parseFloat(tempPrice) || 0;
    const next = Math.max(0.1, cur + delta);
    setTempPrice(next.toFixed(2));
  };

  const handleSavePrice = async (brand: SolarPanelBrand) => {
    const parsed = parseFloat(tempPrice);
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg(isAr ? 'يرجى إدخال سعر صحيح أكبر من الصفر' : 'Please enter a valid price greater than 0');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);
      await updateSolarPanelBrandPrice(brand, parsed, user?.email);
      setEditingBrand(null);
      setSaveSuccessBrand(brand);
      setTimeout(() => setSaveSuccessBrand(null), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || (isAr ? 'فشل حفظ السعر، يرجى المحاولة مجدداً' : 'Failed to save price, please try again'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-sans">
      {/* 1. Header Hero Banner */}
      <div className="relative overflow-hidden bg-slate-900 text-white rounded-3xl p-6 sm:p-10 mb-8 border border-slate-800 shadow-xl">
        {/* Subtle decorative background gradient */}
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

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-3 text-white leading-tight">
              {isAr ? 'بورصة الألواح الشمسية: سعر الوات اللحظي' : 'Solar Panel Energy Exchange'}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              {isAr
                ? 'المرجع الرسمي الموحد لتسعير ألواح الطاقة الشمسية في السوق المصري. يتم احتساب سعر أي لوح في ثوانٍ: قدرة اللوح بالوات × سعر الوات للماركة.'
                : 'The official benchmark for solar panel pricing. Calculate any panel price in seconds: Rated Power (W) × Brand Price Per Watt.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {isAdmin ? (
              <div className="flex items-center gap-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold">
                <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <span className="block font-bold">{isAr ? 'وضع المسؤول' : 'Admin Mode'}</span>
                  <span className="text-[11px] text-emerald-400/80 font-normal">{isAr ? 'تعديل وحفظ مباشر في D1' : 'Live D1 Price Author'}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2.5 rounded-2xl text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? 'مزامنة حية وموحدة لجميع المستخدمين' : 'Real-time Unified Sync'}</span>
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

      {/* Error Alert if any */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <X size={18} className="text-red-600 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button 
            onClick={() => setErrorMsg(null)} 
            className="text-red-500 hover:text-red-700 p-1 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. Interactive Instant Calculator Section (احسب سعر أي لوح فوراً) */}
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
                ? 'اختر الماركة وقدرة اللوح بالوات، وشاهد السعر الإجمالي العادل بالجنيه المصري فوراً.'
                : 'Select brand and panel wattage to see the total official price instantly in EGP.'}
            </p>
          </div>

          {/* The Big Price Result Box */}
          <div className="bg-white border-2 border-blue-500/20 rounded-2xl p-4 sm:px-6 shadow-sm flex flex-col items-start md:items-end self-stretch md:self-auto">
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
              {calcWattage}W × {calcPricePerWatt.toFixed(2)} {isAr ? 'ج.م/وات' : 'EGP/W'}
            </div>
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
                  const p = prices[b] ?? 12.00;
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

          {/* Step 2: Select or Enter Wattage */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              {isAr ? '2. اختر قدرة اللوح (بالوات W):' : '2. Select Panel Power (Watts):'}
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

            {/* Custom Wattage Input */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="50"
                  max="1200"
                  step="5"
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

      {/* 4. Controls Toolbar: Search, Sort, View Toggle */}
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
            <button
              onClick={() => setSearchTerm('')}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort & View Mode */}
        <div className="flex items-center gap-2">
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

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title={isAr ? 'عرض البطاقات' : 'Cards View'}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title={isAr ? 'عرض الجدول' : 'Table View'}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Main Pricing Display: Grid View or Table View */}
      {displayedBrands.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
          <HelpCircle size={36} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            {isAr ? 'لم يتم العثور على ماركات مطابقة' : 'No matching brands found'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {isAr ? 'جرّب البحث باسم آخر أو أعد ضبط شريط البحث' : 'Try searching with another name or reset search'}
          </p>
          <button
            onClick={() => setSearchTerm('')}
            className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100 transition cursor-pointer"
          >
            {isAr ? 'إعادة ضبط البحث' : 'Clear search'}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW: Intuitive, Easy-to-read cards with real examples */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {displayedBrands.map((brand, index) => {
            const currentPrice = prices[brand] ?? 12.00;
            const isEditing = editingBrand === brand;
            const isSuccess = saveSuccessBrand === brand;
            const meta = BRAND_METADATA[brand];

            // Real-world calculations for popular panel capacities
            const estPrice585 = 585 * currentPrice;
            const estPrice725 = 725 * currentPrice;

            return (
              <div
                key={brand}
                className={`bg-white rounded-3xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
                  isSuccess
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 shadow-md'
                    : isEditing
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                    : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                {/* Card Top: Brand Info & Status */}
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

                    {isSuccess && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full animate-fade-in">
                        <Check size={12} />
                        <span>{isAr ? 'تم الحفظ' : 'Saved'}</span>
                      </span>
                    )}
                  </div>

                  {/* Brand Feature / Note */}
                  <p className="text-xs text-slate-600 line-clamp-2 min-h-[32px] mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {meta?.highlight || 'لوح شمسي معتمد عالي الكفاءة ومطابق للمواصفات القياسية.'}
                  </p>

                  {/* The Price Per Watt Display / Admin Editor */}
                  {isEditing ? (
                    <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-blue-900">
                          {isAr ? 'تعديل سعر الوات:' : 'Edit Price Per Watt:'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleAdjustTempPrice(-0.25)}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 text-xs font-bold"
                            title="-0.25"
                          >
                            <Minus size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustTempPrice(0.25)}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-100 text-xs font-bold"
                            title="+0.25"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="0.05"
                            min="1"
                            max="100"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            className="w-full bg-white border-2 border-blue-500 rounded-xl px-3 py-1.5 text-base font-extrabold text-slate-900 focus:outline-none"
                            autoFocus
                            disabled={isSaving}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePrice(brand);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <span className="absolute left-2.5 top-2 text-[10px] font-bold text-slate-400">
                            {isAr ? 'ج.م/وات' : 'EGP/W'}
                          </span>
                        </div>

                        <button
                          onClick={() => handleSavePrice(brand)}
                          disabled={isSaving}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                          <span>{isAr ? 'حفظ' : 'Save'}</span>
                        </button>

                        <button
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-slate-100">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block">
                          {isAr ? 'سعر الوات الرسمي' : 'Official Price Per Watt'}
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-2xl font-black text-blue-600 font-mono tabular-nums">
                            {currentPrice.toFixed(2)}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            {isAr ? 'ج.م/وات' : 'EGP/W'}
                          </span>
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(brand)}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          <Edit2 size={12} />
                          <span>{isAr ? 'تعديل السعر' : 'Edit'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Ready Real-World Examples */}
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      {isAr ? 'أمثلة لأسعار الألواح الجاهزة اليوم:' : 'Calculated Panel Examples:'}
                    </span>
                    <div className="flex items-center justify-between py-1 px-2.5 bg-slate-50 rounded-lg text-slate-700">
                      <span>{isAr ? 'لوح قدرة 585 وات' : '585W Panel'}</span>
                      <span className="font-bold font-mono tabular-nums text-slate-900">
                        {estPrice585.toLocaleString('en-US', { maximumFractionDigits: 0 })} {isAr ? 'ج.م' : 'EGP'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 px-2.5 bg-slate-50 rounded-lg text-slate-700">
                      <span>{isAr ? 'لوح قدرة 725 وات' : '725W Panel'}</span>
                      <span className="font-bold font-mono tabular-nums text-slate-900">
                        {estPrice725.toLocaleString('en-US', { maximumFractionDigits: 0 })} {isAr ? 'ج.م' : 'EGP'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: Action Button */}
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
        /* TABLE VIEW: Dense, Clean & Tabular */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-right sm:text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-600">
                  <th className="py-3.5 px-4 text-center w-12">#</th>
                  <th className="py-3.5 px-4">{isAr ? 'العلامة التجارية' : 'Brand Name'}</th>
                  <th className="py-3.5 px-4 text-center">{isAr ? 'سعر الوات (ج.م/وات)' : 'Watt Price (EGP/W)'}</th>
                  <th className="py-3.5 px-4 text-center hidden md:table-cell">{isAr ? 'سعر لوح 585 وات' : '585W Panel Price'}</th>
                  <th className="py-3.5 px-4 text-center hidden md:table-cell">{isAr ? 'سعر لوح 725 وات' : '725W Panel Price'}</th>
                  <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {displayedBrands.map((brand, index) => {
                  const currentPrice = prices[brand] ?? 12.00;
                  const isEditing = editingBrand === brand;
                  const isSuccess = saveSuccessBrand === brand;
                  const meta = BRAND_METADATA[brand];

                  const estPrice585 = 585 * currentPrice;
                  const estPrice725 = 725 * currentPrice;

                  return (
                    <tr
                      key={brand}
                      className={`transition-colors ${
                        isSuccess
                          ? 'bg-emerald-50/50'
                          : isEditing
                          ? 'bg-blue-50/40'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Index */}
                      <td className="py-3.5 px-4 text-center text-xs font-bold text-slate-400">
                        {index + 1}
                      </td>

                      {/* Brand Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 notranslate">
                            {brand}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {meta?.arName || brand} · <span className="text-slate-400">{meta?.tier || 'Tier 1'}</span>
                          </span>
                        </div>
                      </td>

                      {/* Price / Watt */}
                      <td className="py-3.5 px-4 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              step="0.05"
                              min="1"
                              max="100"
                              value={tempPrice}
                              onChange={(e) => setTempPrice(e.target.value)}
                              className="w-20 bg-white border-2 border-blue-500 rounded-lg px-2 py-1 text-sm font-bold text-center text-slate-900 focus:outline-none"
                              autoFocus
                              disabled={isSaving}
                            />
                            <button
                              onClick={() => handleSavePrice(brand)}
                              disabled={isSaving}
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                              title={isAr ? 'حفظ' : 'Save'}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="p-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition cursor-pointer"
                              title={isAr ? 'إلغاء' : 'Cancel'}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1 font-mono tabular-nums">
                            <span className="text-base font-extrabold text-blue-600">
                              {currentPrice.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500 font-sans">
                              {isAr ? 'ج.م' : 'EGP'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 585W */}
                      <td className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700 hidden md:table-cell">
                        {estPrice585.toLocaleString('en-US', { maximumFractionDigits: 0 })} {isAr ? 'ج.م' : 'EGP'}
                      </td>

                      {/* 725W */}
                      <td className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700 hidden md:table-cell">
                        {estPrice725.toLocaleString('en-US', { maximumFractionDigits: 0 })} {isAr ? 'ج.م' : 'EGP'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isAdmin && !isEditing && (
                            <button
                              onClick={() => handleStartEdit(brand)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition cursor-pointer"
                              title={isAr ? 'تعديل السعر' : 'Edit Price'}
                            >
                              <Edit2 size={14} />
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

      {/* 6. Simple Educational Guide: كيف تقرأ وتستفيد من بورصة الطاقة؟ */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-md">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider mb-2">
          <HelpCircle size={16} />
          <span>{isAr ? 'دليل مبسط للمستخدم والعميل' : 'Easy Guide For Everyone'}</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold mb-4">
          {isAr ? 'كيف تقرأ بورصة الطاقة وتعرف السعر الحقيقي؟' : 'How To Read The Energy Exchange?'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs sm:text-sm text-slate-300">
          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 font-bold flex items-center justify-center text-xs mb-3 border border-blue-500/20">
              1
            </div>
            <h4 className="font-bold text-white text-sm mb-1.5">
              {isAr ? 'ما هو سعر الوات؟' : 'What is Price Per Watt?'}
            </h4>
            <p className="leading-relaxed text-slate-400">
              {isAr
                ? 'سعر الوات هو التكلفة القياسية المعتمدة لتوليد كل 1 وات كهربائي من اللوح الشمسي. كل ماركة لها سعر وات يحدده جودتها وكفاءتها وتوافرها في السوق.'
                : 'Price per watt is the benchmark cost for generating 1 Watt of solar electricity. Reflects manufacturing tier, cell efficiency, and market supply.'}
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="w-7 h-7 rounded-lg bg-amber-600/30 text-amber-400 font-bold flex items-center justify-center text-xs mb-3 border border-amber-500/20">
              2
            </div>
            <h4 className="font-bold text-white text-sm mb-1.5">
              {isAr ? 'كيف تحسب سعر اللوح الإجمالي؟' : 'How To Calculate Total Panel Price?'}
            </h4>
            <p className="leading-relaxed text-slate-400">
              {isAr
                ? 'المعادلة بسيطة: قدرة اللوح (وات) × سعر الوات. مثال: لوح جينكو 585 وات بسعر 11.90 ج.م = 585 × 11.90 = 6,961.50 ج.م.'
                : 'Formula: Panel Wattage (W) × Brand Watt Price. Example: 585W at 11.90 EGP/W = 585 × 11.90 = 6,961.50 EGP.'}
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl">
            <div className="w-7 h-7 rounded-lg bg-emerald-600/30 text-emerald-400 font-bold flex items-center justify-center text-xs mb-3 border border-emerald-500/20">
              3
            </div>
            <h4 className="font-bold text-white text-sm mb-1.5">
              {isAr ? 'تسعير موحد يضمن حقك' : 'Fair & Transparent Pricing'}
            </h4>
            <p className="leading-relaxed text-slate-400">
              {isAr
                ? 'جميع منتجات الألواح في متجر Enerjoo تتحدث تلقائياً وبشكل فوري بمجرد تعديل أسعار البورصة، لحماية العميل والمورد من تقلبات الأسعار وضمان الشفافية المطلقة.'
                : 'All panel products in the Enerjoo catalog automatically synchronize with exchange rates, ensuring absolute price transparency and customer protection.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
