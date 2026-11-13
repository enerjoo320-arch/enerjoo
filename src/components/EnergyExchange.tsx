import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Edit2,
  Check,
  X,
  ShieldCheck,
  RefreshCw,
  Calculator,
  Search,
  ArrowUpDown,
  Info,
  ExternalLink,
  HelpCircle,
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  Award,
  Calendar,
  Clock,
  WifiOff,
  Power,
  Upload,
} from 'lucide-react';
import { SOLAR_PANEL_BRANDS, SolarPanelBrand, User } from '../types';
import {
  EnergyExchangeRecord,
  EnergyExchangeState,
  findMatchingBrandPricePerWatt,
  saveSolarPanelBrandRanges,
  saveSolarPanelBrandLogo,
  subscribeToBrandLogos,
  subscribeToEnergyExchange,
  refreshEnergyExchange,
  getCurrentEnergyExchangeState,
  isExchangeRecordActive,
} from '../services/energyExchangeService';
import { uploadBrandLogoImage } from '../services/uploadService';
import {
  getCairoDailyDateParts,
  formatCairoUpdatedAtTimestamp,
  CairoDateParts,
} from '../utils/dateUtils';

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
  features: string[];
}

const BRAND_METADATA: Record<SolarPanelBrand, BrandMeta> = {
  'Jinko': {
    arName: 'جينكو سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'الأكثر انتشاراً في المشروعات المصرية وخلايا Tiger Neo النصفية',
    features: [
      'تصنيف عالمي بلومبيرغ Tier 1 ومطابقة لأعلى معايير الجودة المعتمدة دولياً',
      'الحصة السوقية الأكبر وانتشار واسع في المشروعات القومية والتجارية في السوق المصري',
      'ريادة تقنية خلايا Tiger Neo النصفية N-Type بكفاءة تحويل فائقة ومعامل تدهور سنوي منخفض',
      'ضمان مصنعي معتمد واستقرار عالي في توليد الطاقة تحت درجات الحرارة المرتفعة'
    ],
  },
  'LONGi Solar': {
    arName: 'لونجي سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'رائدة تقنية Hi-MO وتحمل استثنائي لدرجات الحرارة المرتفعة',
    features: [
      'الشركة الرائدة عالمياً في تطوير وتصنيع رقائق السيليكون أحادي البلورة (Monocrystalline)',
      'سلسلة Hi-MO بمعامل حراري منخفض وتحمل فائق لأجواء الصيف والمناخ الصحراوي',
      'تصنيف عالمي Tier 1 مع التزام صارم بمعايير الاستدامة وكفاءة الخلايا',
      'توافق قياسي مع مختلف المحولات ومنظومات الطاقة الشمسية المتصلة والمستقلة عن الشبكة'
    ],
  },
  'AIKO': {
    arName: 'إيكو سولار',
    tier: 'Tier 1 Premium',
    country: 'الصين',
    highlight: 'أعلى كفاءة خلايا تجارية في العالم بتقنية All-Back-Contact (ABC)',
    features: [
      'حائزة على أعلى كفاءة خلايا تجارية في العالم بتقنية التلامس الخلفي الكامل All-Back-Contact (ABC)',
      'خلو واجهة الخلايا تماماً من خطوط التوصيل الفضية، مما يمنح مظهراً جمالياً وتوليداً أقصى للضوء',
      'تصنيف Tier 1 Premium مع ضمانات أداء ممتدة ومقاومة استثنائية للتظليل الجزئي',
      'معامل حراري فائق يضمن استقرار الإنتاجية في ذروة فصل الصيف'
    ],
  },
  'Trina Solar': {
    arName: 'ترينا سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'سلسلة Vertex بقدرات فائقة وتوليد وجهين للمزارع والمحطات',
    features: [
      'سلسلة Vertex المتطورة بخلايا 210 مم فائقة القدرة وتصميم ثنائي الوجهين (Bifacial)',
      'خبرة عالمية تفوق ربع قرن في محطات الطاقة الكبرى والمزارع الاستثمارية',
      'تصنيف Tier 1 Global مع اختبارات موثوقية دورية معتمدة من كبرى المعامل الدولية (PVEL / DNV GL)',
      'تحمل ميكانيكي عالي للأحمال ومقاومة متقدمة للظروف الجوية القاسية والرطوبة'
    ],
  },
  'JA Solar': {
    arName: 'جي إيه سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'أداء عالي في الإشعاع المنخفض ومقاومة متفوقة للتدهور الضوئي PID',
    features: [
      'سلاسل إنتاج متكاملة تضمن أعلى درجات مراقبة الجودة من بلورات السيليكون حتى اللوح النهائي',
      'أداء ممتاز في ظروف الإشعاع الشمسي المنخفض وساعات الصباح الباكر والغروب',
      'مقاومة فائقة لظاهرة التدهور الضوئي المستحث (Anti-PID) ومقاومة تآكل الأملاح والأمونيا',
      'تصنيف موثوق Tier 1 Global معتمد لدى كبرى البنوك والمؤسسات التمويلية الدولية'
    ],
  },
  'Risen': {
    arName: 'رايزن إنرجي',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'تقنية Heterojunction (HJT) ومعامل حراري متفوق في الصيف',
    features: [
      'ريادة تقنية الوصلات غير المتجانسة Heterojunction (HJT) فائقة الكفاءة',
      'أقل معامل حراري لفقدان الطاقة أثناء ارتفاع درجات حرارة الصيف الشديدة',
      'تصنيف عالمي Tier 1 مع اعتماد دولي لاختبارات الجودة والسلامة الشاملة',
      'تصميم متين يقلل من تشققات الخلايا الدقيقة Micro-cracks ويزيد العمر التشغيلي'
    ],
  },
  'GCL': {
    arName: 'جي سي إل',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'سلاسل تصنيع متكاملة من بلورات السيليكون النقي للألواح',
    features: [
      'أكبر منتج ومطور لمادة البولي سيليكون النقي وسلاسل القيمة الشمسية عالمياً',
      'تصنيف Tier 1 مع كفاءة تحويل مستقرة وجودة تصنيع مؤكدة بشهادات دولية',
      'حلول متكاملة ملائمة للمحطات الكبيرة والمنظومات الصناعية والتجارية',
      'حماية موثوقة ضد التآكل والأحمال البيئية المختلفة'
    ],
  },
  'Suntech': {
    arName: 'صنتك باور',
    tier: 'Tier 1 Standard',
    country: 'الصين',
    highlight: 'خبرة عريقة في محطات الطاقة الكبرى والمشروعات الصناعية',
    features: [
      'من أعرق الماركات الرائدة في صناعة الطاقة الشمسية بخبرة تاريخية تتجاوز 20 عاماً',
      'تصنيف معتمد واختبارات جودة صارمة تضمن استمرارية التوليد وكفاءة استثمار طويلة الأجل',
      'أداء تشغيلي مستقر وموثوق في المشروعات الصناعية والزراعية',
      'ضمان إنتاجية وأداء موثق بشهادات الفحص العالمية'
    ],
  },
  'Astronergy': {
    arName: 'أسترونيرجي',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'سلسلة Astro N5 عالية الموثوقية بضمان جودة وأداء ممتد',
    features: [
      'إحدى شركات مجموعة CHINT العالمية الرائدة في معدات وحلول الكهرباء والطاقة',
      'سلسلة Astro عالية الموثوقية بتقنية TOPCon مع تصنيف عالمي Tier 1 مستمر',
      'سجل أداء خالٍ من العيوب وحائزة على تصنيف Top Performer في اختبارات PVEL المتتالية',
      'توافق مثالي مع الشبكات الكهربائية وأنظمة الحماية المعتمدة'
    ],
  },
  'Gokin': {
    arName: 'جوكين سولار',
    tier: 'Tier 1 Certified',
    country: 'الصين',
    highlight: 'خلايا سيليكون متطورة مع حلول اقتصادية متوازنة في التكلفة',
    features: [
      'تخصص رائد في تصنيع رقائق السيليكون الكبيرة عالية الكفاءة للمحطات الحديثة',
      'توازن استثنائي بين التكلفة الاقتصادية التنافسية وكفاءة التوليد العالية',
      'مطابقة كاملة لشهادات الجودة والمعايير القياسية الدولية (IEC, CE, TUV)',
      'استقرار توليد ملائم للبيئات والمناخات الحارة'
    ],
  },
  'Quantum Solar': {
    arName: 'كوانتوم سولار',
    tier: 'Certified Standard',
    country: 'عالمي',
    highlight: 'خيار اقتصادي عملي للمزارع والمنظومات المنزلية المستقلة',
    features: [
      'خيار اقتصادي عملي عالي الجدوى لمنظومات الري الزراعي والمحطات المستقلة عن الشبكة',
      'تصميم هندسي متين يلائم البيئات الميدانية ومقاومة تراكم الأتربة والغبار',
      'شهادات فحص ومطابقة للمواصفات الفنية المعتمدة للمشروعات الصغيرة والمتوسطة',
      'تكلفة تنافسية تضمن سرعة استرداد رأس المال المستثمر'
    ],
  },
  'Ulica Solar': {
    arName: 'يوليكا سولار',
    tier: 'Tier 1 Certified',
    country: 'الصين',
    highlight: 'كفاءة تشغيل مستقرة وشهادات جودة واختبارات دولية معتمدة',
    features: [
      'شركة تابعة لمجموعة Shanshan الاستثمارية العالمية ومصنفة Tier 1 من بلومبيرغ',
      'أداء تشغيلي مستقر واختبارات صارمة لمقاومة الرطوبة والتغيرات المناخية المفاجئة',
      'ضمان استقرار الطاقة المولدة على المدى الطويل مع معاملات تدهور منخفضة',
      'شهادات اعتماد أوروبية ودولية متعددة (TUV, CE, IEC)'
    ],
  },
  'ZNShine Solar': {
    arName: 'زد إن شاين سولار',
    tier: 'Tier 1 Global',
    country: 'الصين',
    highlight: 'تقنية طلاء الجرافين ذاتية التنظيف لمقاومة تراكم الغبار',
    features: [
      'ابتكار عالمي رائد في استخدام تقنية طلاء الجرافين ذاتي التنظيف (Self-Cleaning Graphene)',
      'تقليل تكاليف الصيانة الدورية والغسيل بفضل منع تراكم الأتربة والغبار الصحراوي بنسبة كبيرة',
      'تصنيف عالمي Tier 1 Global مستمر لدى بلومبيرغ BNEF',
      'كفاءة تحويل ممتازة ومقاومة فائقة للخدوش والعوامل الجوية الشديدة'
    ],
  },
  'Jet Solar': {
    arName: 'جيت سولار',
    tier: 'Certified Standard',
    country: 'عالمي',
    highlight: 'ألواح شمسية معتمدة للمشروعات التجارية والزراعية والمنزلية',
    features: [
      'تصميم قياسي عالي الاعتمادية مناسب لمحطات الضخ الزراعي والمنظومات التجارية والمنزلية',
      'خلايا أحادية البلورة عالية الكفاءة مع أداء مستقر في ظروف التشغيل اليومية',
      'إطار ألومنيوم مقاوم للتآكل والأحمال الميكانيكية وظروف الطقس الحار',
      'توافق قياسي مع مختلف إنفرترات الأون جريد والهايبرد وإنفرترات المضخات'
    ],
  },
};

const COMMON_WATTAGES = [550, 585, 600, 650, 725];

interface EditableRangeItem {
  priceId?: string;
  minWattage: string;
  maxWattage: string;
  pricePerWatt: string;
}

export const EnergyExchange: React.FC<EnergyExchangeProps> = ({
  lang,
  user,
  prices: initialPrices,
  records: initialRecords = [],
  onNavigateToBrandProducts,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = user?.type === 'admin';

  // Live Exchange Data & Sync Status State
  const [livePrices, setLivePrices] = useState<Record<string, number>>(initialPrices);
  const [liveRecords, setLiveRecords] = useState<EnergyExchangeRecord[]>(initialRecords);
  const [exchangeState, setExchangeState] = useState<EnergyExchangeState>(() => getCurrentEnergyExchangeState());
  const [isRetrying, setIsRetrying] = useState(false);

  // Automatic Daily Calendar Date in Africa/Cairo timezone
  const [cairoDate, setCairoDate] = useState<CairoDateParts>(() => getCairoDailyDateParts());

  useEffect(() => {
    const syncCairoDate = () => {
      const next = getCairoDailyDateParts();
      setCairoDate(prev => (prev.dateKey !== next.dateKey ? next : prev));
    };

    const interval = setInterval(syncCairoDate, 15_000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') syncCairoDate();
    };
    window.addEventListener('focus', syncCairoDate);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncCairoDate);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  // Brand Logos stored in Firestore (public read, admin write)
  const [brandLogos, setBrandLogos] = useState<Partial<Record<SolarPanelBrand, string>>>({});
  const [brokenLogoUrls, setBrokenLogoUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubLogos = subscribeToBrandLogos((logosMap) => {
      setBrandLogos(logosMap);
    });
    return () => unsubLogos();
  }, []);

  const getValidBrandLogo = (brand: SolarPanelBrand): string | null => {
    const url = brandLogos[brand];
    if (!url || brokenLogoUrls[url]) return null;
    return url;
  };

  const markLogoUrlBroken = (url: string) => {
    setBrokenLogoUrls(prev => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  // Subscribe to real-time sync from Cloudflare D1
  useEffect(() => {
    const unsubscribe = subscribeToEnergyExchange((updatedPrices, updatedRecords, nextState) => {
      setLivePrices(updatedPrices);
      if (updatedRecords) {
        setLiveRecords(updatedRecords);
      }
      if (nextState) {
        setExchangeState(nextState);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRetryFetch = async () => {
    setIsRetrying(true);
    try {
      await refreshEnergyExchange();
    } finally {
      setIsRetrying(false);
    }
  };

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'name'>('default');

  // Interactive Quick Calculator State
  const [calcBrand, setCalcBrand] = useState<SolarPanelBrand>('Jinko');
  const [calcWattage, setCalcWattage] = useState<number>(585);
  const [customWattageInput, setCustomWattageInput] = useState<string>('585');

  // Brand Features Modal State (for all roles)
  const [selectedFeaturesBrand, setSelectedFeaturesBrand] = useState<SolarPanelBrand | null>(null);

  // Admin Manage Brand Modal State (Admin Only: Ranges, Active Status & Logo)
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingBrandForAdmin, setEditingBrandForAdmin] = useState<SolarPanelBrand | null>(null);
  const [adminRanges, setAdminRanges] = useState<EditableRangeItem[]>([]);
  const [adminBrandIsActive, setAdminBrandIsActive] = useState<boolean>(true);
  const [initialRangesSnapshot, setInitialRangesSnapshot] = useState<string>('');
  const [initialActiveSnapshot, setInitialActiveSnapshot] = useState<boolean>(true);
  const [adminLogoFile, setAdminLogoFile] = useState<File | null>(null);
  const [adminLogoPreviewUrl, setAdminLogoPreviewUrl] = useState<string | null>(null);
  const [adminLogoMarkedRemoval, setAdminLogoMarkedRemoval] = useState<boolean>(false);
  const [adminLogoUploadStatus, setAdminLogoUploadStatus] = useState<string | null>(null);
  const [adminModalError, setAdminModalError] = useState<string | null>(null);
  const [isAdminSaving, setIsAdminSaving] = useState(false);

  const revokeBlobPreviewUrl = (url?: string | null) => {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  };

  // Global Toast Messages
  const [globalErrorMsg, setGlobalErrorMsg] = useState<string | null>(null);
  const [globalSuccessMsg, setGlobalSuccessMsg] = useState<string | null>(null);

  const isApiError = exchangeState.status === 'error';
  const isApiLoading = exchangeState.status === 'loading';

  // Calculator Result
  const calcMatch = useMemo(() => {
    if (isApiError) {
      return {
        matchedBrand: calcBrand,
        pricePerWatt: null,
        isRangeMatch: false,
        isOutOfBounds: false,
        isUnsupported: true,
        record: null,
      };
    }
    return findMatchingBrandPricePerWatt(liveRecords, calcBrand, undefined, calcWattage);
  }, [liveRecords, calcBrand, calcWattage, isApiError]);

  const calcPricePerWatt = calcMatch.pricePerWatt;
  const calcTotalPanelPrice = calcPricePerWatt != null ? calcWattage * calcPricePerWatt : 0;

  // Group records by brand (canonical 14 brands)
  const recordsByBrand = useMemo(() => {
    const map: Record<string, EnergyExchangeRecord[]> = {};
    SOLAR_PANEL_BRANDS.forEach(b => {
      map[b] = [];
    });

    liveRecords.forEach(r => {
      if (r.brand) {
        const b = r.brand;
        const matched = SOLAR_PANEL_BRANDS.find(sb => sb.toLowerCase() === b.toLowerCase());
        if (matched) {
          map[matched].push(r);
        }
      }
    });
    return map;
  }, [liveRecords]);

  // Helper to get lowest/representative configured active price for sorting/metrics
  const getBrandRepresentativePrice = (brand: SolarPanelBrand): number | null => {
    const recs = (recordsByBrand[brand] || []).filter(isExchangeRecordActive);
    const validPrices = recs.map(r => r.price_per_watt).filter(p => typeof p === 'number' && p > 0);
    if (validPrices.length > 0) return validPrices[0];
    const p = livePrices[brand];
    return typeof p === 'number' && p > 0 ? p : null;
  };

  // Market Summary Metrics (strictly from configured & active backend prices — zero fake defaults)
  const marketMetrics = useMemo(() => {
    if (isApiError) {
      return {
        averagePrice: null as number | null,
        minPrice: null as number | null,
        minBrand: null as SolarPanelBrand | null,
        maxPrice: null as number | null,
        maxBrand: null as SolarPanelBrand | null,
        configuredCount: 0,
        totalBrands: SOLAR_PANEL_BRANDS.length,
      };
    }

    const activePrices: Array<{ brand: SolarPanelBrand; price: number }> = [];
    SOLAR_PANEL_BRANDS.forEach(brand => {
      const recs = (recordsByBrand[brand] || []).filter(isExchangeRecordActive);
      const validRecPrices = recs
        .map(r => r.price_per_watt)
        .filter(p => typeof p === 'number' && p > 0);

      if (validRecPrices.length > 0) {
        validRecPrices.forEach(p => activePrices.push({ brand, price: p }));
      }
    });

    const configuredBrandsCount = SOLAR_PANEL_BRANDS.filter(brand => {
      const recs = (recordsByBrand[brand] || []).filter(isExchangeRecordActive);
      return recs.some(r => typeof r.price_per_watt === 'number' && r.price_per_watt > 0);
    }).length;

    if (activePrices.length === 0) {
      return {
        averagePrice: null,
        minPrice: null,
        minBrand: null,
        maxPrice: null,
        maxBrand: null,
        configuredCount: 0,
        totalBrands: SOLAR_PANEL_BRANDS.length,
      };
    }

    const avg = activePrices.reduce((acc, item) => acc + item.price, 0) / activePrices.length;
    let minItem = activePrices[0];
    let maxItem = activePrices[0];

    for (const item of activePrices) {
      if (item.price < minItem.price) minItem = item;
      if (item.price > maxItem.price) maxItem = item;
    }

    return {
      averagePrice: avg,
      minPrice: minItem.price,
      minBrand: minItem.brand,
      maxPrice: maxItem.price,
      maxBrand: maxItem.brand,
      configuredCount: configuredBrandsCount,
      totalBrands: SOLAR_PANEL_BRANDS.length,
    };
  }, [recordsByBrand, isApiError]);

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
      list.sort((a, b) => {
        const pa = getBrandRepresentativePrice(a);
        const pb = getBrandRepresentativePrice(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => {
        const pa = getBrandRepresentativePrice(a);
        const pb = getBrandRepresentativePrice(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
      });
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.localeCompare(b));
    }

    return list;
  }, [searchTerm, sortBy, recordsByBrand, livePrices]);

  const formattedLastPriceUpdate = useMemo(() => {
    return formatCairoUpdatedAtTimestamp(exchangeState.lastUpdatedAt, lang);
  }, [exchangeState.lastUpdatedAt, lang]);

  // Handlers for Features Modal (All Users)
  const handleOpenFeatures = (brand: SolarPanelBrand) => {
    setSelectedFeaturesBrand(brand);
  };

  const handleCloseFeatures = () => {
    setSelectedFeaturesBrand(null);
  };

  // Handlers for Admin Brand Management Modal (Ranges + Activation + Logo)
  const handleOpenAdminEdit = (brand: SolarPanelBrand) => {
    const brandRecords = recordsByBrand[brand] || [];
    const existingRanges = brandRecords
      .filter(r => r.min_wattage != null && r.max_wattage != null)
      .sort((a, b) => (a.min_wattage ?? 0) - (b.min_wattage ?? 0));

    const existingLegacy = brandRecords.find(r => r.min_wattage == null || r.max_wattage == null);
    const hasAnyRecords = brandRecords.length > 0;
    const isCurrentlyActive = hasAnyRecords ? brandRecords.some(isExchangeRecordActive) : true;

    let nextEditableRanges: EditableRangeItem[];
    if (existingRanges.length > 0) {
      nextEditableRanges = existingRanges.map(r => ({
        priceId: r.price_id,
        minWattage: String(r.min_wattage),
        maxWattage: String(r.max_wattage),
        pricePerWatt: r.price_per_watt.toFixed(2),
      }));
    } else if (existingLegacy && existingLegacy.price_per_watt > 0) {
      // Legacy price exists without wattage bounds: keep price, require admin to specify real wattage bounds
      nextEditableRanges = [
        {
          priceId: undefined,
          minWattage: '',
          maxWattage: '',
          pricePerWatt: existingLegacy.price_per_watt.toFixed(2),
        },
      ];
    } else {
      // Unconfigured brand (e.g., Jet Solar): start cleanly with empty fields — NO fake default prices
      nextEditableRanges = [
        {
          priceId: undefined,
          minWattage: '',
          maxWattage: '',
          pricePerWatt: '',
        },
      ];
    }

    revokeBlobPreviewUrl(adminLogoPreviewUrl);
    const savedLogo = brandLogos[brand] || null;

    setAdminRanges(nextEditableRanges);
    setInitialRangesSnapshot(
      JSON.stringify(
        nextEditableRanges.map(r => ({
          min: r.minWattage.trim(),
          max: r.maxWattage.trim(),
          price: r.pricePerWatt.trim(),
        }))
      )
    );
    setAdminBrandIsActive(isCurrentlyActive);
    setInitialActiveSnapshot(isCurrentlyActive);
    setAdminLogoFile(null);
    setAdminLogoPreviewUrl(savedLogo);
    setAdminLogoMarkedRemoval(false);
    setAdminLogoUploadStatus(null);
    setEditingBrandForAdmin(brand);
    setAdminModalError(null);
  };

  const handleCloseAdminEdit = () => {
    if (isAdminSaving) return;
    revokeBlobPreviewUrl(adminLogoPreviewUrl);
    setEditingBrandForAdmin(null);
    setAdminRanges([]);
    setAdminBrandIsActive(true);
    setAdminLogoFile(null);
    setAdminLogoPreviewUrl(null);
    setAdminLogoMarkedRemoval(false);
    setAdminLogoUploadStatus(null);
    setAdminModalError(null);
  };

  const handleSelectLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = (file.type || '').toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (!allowedExts.includes(ext) || (mime && !allowedMimes.includes(mime))) {
      setAdminModalError(
        isAr
          ? 'صيغة الشعار غير مدعومة. يرجى اختيار صورة بصيغة PNG أو JPG أو WebP.'
          : 'Unsupported logo format. Please choose PNG, JPG, or WebP.'
      );
      return;
    }

    setAdminModalError(null);
    revokeBlobPreviewUrl(adminLogoPreviewUrl);
    const previewObjectUrl = URL.createObjectURL(file);
    setAdminLogoFile(file);
    setAdminLogoPreviewUrl(previewObjectUrl);
    setAdminLogoMarkedRemoval(false);
  };

  const handleRemoveLogoInModal = () => {
    if (!editingBrandForAdmin || isAdminSaving) return;
    revokeBlobPreviewUrl(adminLogoPreviewUrl);
    setAdminLogoFile(null);
    setAdminLogoPreviewUrl(null);
    setAdminLogoMarkedRemoval(Boolean(brandLogos[editingBrandForAdmin]));
    setAdminModalError(null);
  };

  const handleUpdateAdminRangeField = (index: number, field: keyof EditableRangeItem, value: string) => {
    setAdminRanges(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddNextRange = () => {
    if (adminRanges.length >= 3) return; // Strictly max 3 ranges
    const last = adminRanges[adminRanges.length - 1];
    let nextMin = '';
    let nextMax = '';

    if (last) {
      const lastMax = parseInt(last.maxWattage, 10);
      if (!isNaN(lastMax) && lastMax > 0) {
        nextMin = String(lastMax + 1);
        nextMax = String(lastMax + 50);
      }
    }

    setAdminRanges(prev => [
      ...prev,
      {
        priceId: undefined,
        minWattage: nextMin,
        maxWattage: nextMax,
        pricePerWatt: '',
      },
    ]);
  };

  const handleRemoveRange = (index: number) => {
    if (index === 0) return; // Range 1 is mandatory and cannot be removed
    setAdminRanges(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAdminRanges = async () => {
    if (!editingBrandForAdmin) return;
    setAdminModalError(null);

    const savedLogoUrl = brandLogos[editingBrandForAdmin] || null;
    const logoChanged = Boolean(adminLogoFile) || (adminLogoMarkedRemoval && Boolean(savedLogoUrl));

    const currentRangesSnapshot = JSON.stringify(
      adminRanges.map(r => ({
        min: r.minWattage.trim(),
        max: r.maxWattage.trim(),
        price: r.pricePerWatt.trim(),
      }))
    );
    const rangesOrActiveChanged =
      currentRangesSnapshot !== initialRangesSnapshot || adminBrandIsActive !== initialActiveSnapshot;
    const hadExistingRecords = (recordsByBrand[editingBrandForAdmin] || []).length > 0;
    const allRangesBlank = adminRanges.every(
      r => !r.minWattage.trim() && !r.maxWattage.trim() && !r.pricePerWatt.trim()
    );

    // If admin only uploaded/changed/removed logo without editing prices or ranges, save ONLY the logo
    const shouldSaveRanges =
      rangesOrActiveChanged || (!logoChanged && !hadExistingRecords) || (!allRangesBlank && !hadExistingRecords);

    const parsedRanges: { priceId?: string; minWattage: number; maxWattage: number; pricePerWatt: number }[] = [];

    if (shouldSaveRanges) {
      if (adminRanges.length < 1) {
        setAdminModalError('يجب أن يحتوي البرند على نطاق قدرة واحد على الأقل.');
        return;
      }
      if (adminRanges.length > 3) {
        setAdminModalError('الحد الأقصى للنطاقات هو 3 نطاقات لكل علامة تجارية.');
        return;
      }

      for (let i = 0; i < adminRanges.length; i++) {
        const item = adminRanges[i];
        const minW = parseInt(item.minWattage.trim(), 10);
        const maxW = parseInt(item.maxWattage.trim(), 10);
        const price = parseFloat(item.pricePerWatt.trim());

        if (isNaN(minW) || minW <= 0) {
          setAdminModalError(`النطاق ${i + 1}: الحد الأدنى للقدرة غير صالح. يجب أن يكون رقماً موجباً أكبر من 0.`);
          return;
        }
        if (isNaN(maxW) || maxW <= 0) {
          setAdminModalError(`النطاق ${i + 1}: الحد الأقصى للقدرة غير صالح. يجب أن يكون رقماً موجباً أكبر من 0.`);
          return;
        }
        if (minW >= maxW) {
          setAdminModalError(`النطاق ${i + 1}: الحد الأدنى (${minW} وات) يجب أن يكون أقل تماماً من الحد الأقصى (${maxW} وات).`);
          return;
        }
        if (isNaN(price) || price <= 0 || price > 200) {
          setAdminModalError(`النطاق ${i + 1}: سعر الوات غير صالح. يجب أن يكون رقماً بين 0.1 و 200 ج.م.`);
          return;
        }

        parsedRanges.push({ priceId: item.priceId, minWattage: minW, maxWattage: maxW, pricePerWatt: price });
      }

      for (let i = 0; i < parsedRanges.length; i++) {
        for (let j = i + 1; j < parsedRanges.length; j++) {
          const r1 = parsedRanges[i];
          const r2 = parsedRanges[j];
          const isOverlap = r1.minWattage <= r2.maxWattage && r1.maxWattage >= r2.minWattage;
          if (isOverlap) {
            setAdminModalError(
              `تداخل في نطاقات القدرة: النطاق ${i + 1} (${r1.minWattage}–${r1.maxWattage} وات) يتداخل مع النطاق ${j + 1} (${r2.minWattage}–${r2.maxWattage} وات). يرجى تعديل الحدود لتكون النطاقات منفصلة تماماً.`
            );
            return;
          }
        }
      }
    }

    if (!logoChanged && !shouldSaveRanges) {
      handleCloseAdminEdit();
      return;
    }

    try {
      setIsAdminSaving(true);
      const targetBrand = editingBrandForAdmin;

      if (logoChanged) {
        if (adminLogoFile) {
          const uploadedUrl = await uploadBrandLogoImage(
            adminLogoFile,
            (status) => setAdminLogoUploadStatus(status),
            lang
          );
          setAdminLogoUploadStatus(isAr ? 'جاري حفظ الشعار...' : 'Saving brand logo...');
          await saveSolarPanelBrandLogo(targetBrand, uploadedUrl);
        } else if (adminLogoMarkedRemoval) {
          setAdminLogoUploadStatus(isAr ? 'جاري إزالة الشعار...' : 'Removing brand logo...');
          await saveSolarPanelBrandLogo(targetBrand, null);
        }
      }

      if (shouldSaveRanges) {
        setAdminLogoUploadStatus(null);
        await saveSolarPanelBrandRanges(targetBrand, parsedRanges, adminBrandIsActive);
      }

      revokeBlobPreviewUrl(adminLogoPreviewUrl);
      setEditingBrandForAdmin(null);
      setAdminLogoFile(null);
      setAdminLogoPreviewUrl(null);
      setAdminLogoMarkedRemoval(false);
      setAdminLogoUploadStatus(null);

      const successText =
        logoChanged && shouldSaveRanges
          ? `تم حفظ بيانات وشعار علامة ${targetBrand} بنجاح`
          : logoChanged
          ? adminLogoMarkedRemoval && !adminLogoFile
            ? `تمت إزالة شعار علامة ${targetBrand} بنجاح`
            : `تم حفظ شعار علامة ${targetBrand} بنجاح`
          : `تم حفظ نطاقات وأسعار علامة ${targetBrand} بنجاح`;
      setGlobalSuccessMsg(successText);
      setTimeout(() => setGlobalSuccessMsg(null), 4000);
    } catch (err: any) {
      setAdminModalError(err?.message || 'حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setIsAdminSaving(false);
      setAdminLogoUploadStatus(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-sans" dir="rtl">
      {/* 1. Header Hero Banner */}
      <div className="relative overflow-hidden bg-slate-900 text-white rounded-3xl p-6 sm:p-10 mb-8 border border-slate-800 shadow-xl">
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
              {isAr ? 'بورصة الألواح الشمسية: سعر الوات اليومي' : 'Solar Panel Energy Exchange: Live Watt Price'}
            </h1>

            <h2 className="text-base sm:text-xl font-bold text-blue-200 mb-4 leading-snug">
              {isAr ? 'المرجع المصري الأول لعرض بورصة الطاقة الشمسية في السوق المصري' : 'First Egyptian Reference for Solar Panel Energy Exchange'}
            </h2>

            {/* Strictly Separated Daily Cairo Date & Actual Last DB Price Update */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3.5 py-2 rounded-2xl">
                <Calendar size={14} className="text-amber-400 shrink-0" />
                <span className="text-slate-400">
                  {isAr ? 'تاريخ اليوم (بتوقيت القاهرة):' : "Today's Date (Cairo):"}
                </span>
                <strong className="text-white font-bold">
                  {isAr ? cairoDate.formattedAr : cairoDate.formattedEn}
                </strong>
              </div>

              <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700/80 px-3.5 py-2 rounded-2xl">
                <Clock size={14} className="text-blue-400 shrink-0" />
                <span className="text-slate-400">
                  {isAr ? 'آخر تحديث فعلي للأسعار:' : 'Last Actual Price Update:'}
                </span>
                <strong className="text-blue-200 font-semibold">
                  {isApiError
                    ? (isAr ? 'غير متاح حالياً' : 'Unavailable')
                    : formattedLastPriceUpdate || (isAr ? 'لم يتم تسجيل تحديث أسعار بعد' : 'No price updates recorded yet')}
                </strong>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {isAdmin ? (
              <div className="flex items-center gap-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold">
                <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <span className="block font-bold">{isAr ? 'وضع المسؤول' : 'Admin Mode'}</span>
                  <span className="text-[11px] text-emerald-400/80 font-normal">
                    {isAr ? 'إدارة النطاقات والأسعار عبر D1' : 'Direct D1 Ranges & Price Management'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2.5 rounded-2xl text-xs text-slate-300">
                <span className={`w-2 h-2 rounded-full ${isApiError ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
                <span>
                  {isApiError
                    ? (isAr ? 'انقطاع الاتصال بالمصدر السحابي' : 'Cloud Feed Disconnected')
                    : (isAr ? 'بيانات موحدة من قاعدة البيانات' : 'Unified Backend Feed')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Key Market Metrics Grid (Strict real D1 values or — when unavailable) */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-slate-400 font-medium block mb-1">
              {isAr ? 'متوسط سعر الوات المسعّر' : 'Average Configured Watt Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
                {marketMetrics.averagePrice != null ? marketMetrics.averagePrice.toFixed(2) : '—'}
              </span>
              {marketMetrics.averagePrice != null && (
                <span className="text-xs text-slate-400">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr ? 'متوسط النطاقات النشطة' : 'Across active ranges'}
            </span>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-emerald-400 font-medium block mb-1">
              {isAr ? 'أقل سعر وات (الأكثر توفيراً)' : 'Lowest Watt Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-400">
                {marketMetrics.minPrice != null ? marketMetrics.minPrice.toFixed(2) : '—'}
              </span>
              {marketMetrics.minPrice != null && (
                <span className="text-xs text-slate-400">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
              )}
            </div>
            <span className="text-[11px] text-slate-300 mt-1 block truncate">
              {marketMetrics.minBrand
                ? `${marketMetrics.minBrand} (${BRAND_METADATA[marketMetrics.minBrand]?.arName || ''})`
                : (isAr ? 'لا توجد أسعار متاحة' : 'No prices available')}
            </span>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-amber-400 font-medium block mb-1">
              {isAr ? 'أعلى سعر وات (الفئة العليا)' : 'Top Tier Watt Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-amber-400">
                {marketMetrics.maxPrice != null ? marketMetrics.maxPrice.toFixed(2) : '—'}
              </span>
              {marketMetrics.maxPrice != null && (
                <span className="text-xs text-slate-400">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
              )}
            </div>
            <span className="text-[11px] text-slate-300 mt-1 block truncate">
              {marketMetrics.maxBrand
                ? `${marketMetrics.maxBrand} (${BRAND_METADATA[marketMetrics.maxBrand]?.arName || ''})`
                : (isAr ? 'لا توجد أسعار متاحة' : 'No prices available')}
            </span>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
            <span className="text-xs text-slate-400 font-medium block mb-1">
              {isAr ? 'الماركات المعتمدة في البورصة' : 'Approved Exchange Brands'}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
                {marketMetrics.totalBrands}
              </span>
              <span className="text-xs text-slate-400">{isAr ? 'ماركة' : 'Brands'}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {isAr
                ? `المسعّر والنشط: ${marketMetrics.configuredCount} من ${marketMetrics.totalBrands}`
                : `Active & Priced: ${marketMetrics.configuredCount} / ${marketMetrics.totalBrands}`}
            </span>
          </div>
        </div>
      </div>

      {/* API Error Banner (Never hides failures behind fake prices) */}
      {isApiError && (
        <div className="mb-6 p-5 bg-red-50 border border-red-200 text-red-900 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <WifiOff size={20} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-red-900 mb-0.5">
                {isAr ? 'تعذر تحميل أسعار بورصة الطاقة من الخادم' : 'Unable to Load Energy Exchange Prices'}
              </h3>
              <p className="text-xs text-red-700 font-medium">
                {exchangeState.error || (isAr ? 'الاتصال بقاعدة البيانات غير متاح حالياً.' : 'Backend API is currently unavailable.')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRetryFetch}
            disabled={isRetrying}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw size={14} className={isRetrying ? 'animate-spin' : ''} />
            <span>{isRetrying ? (isAr ? 'جاري إعادة المحاولة...' : 'Retrying...') : (isAr ? 'إعادة المحاولة' : 'Retry')}</span>
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {isApiLoading && liveRecords.length === 0 && !isApiError && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 text-blue-800 rounded-2xl flex items-center gap-3 text-xs font-bold">
          <RefreshCw size={16} className="animate-spin text-blue-600 shrink-0" />
          <span>{isAr ? 'جاري تحميل أسعار ونطاقات بورصة الطاقة من قاعدة البيانات...' : 'Loading live Energy Exchange prices from database...'}</span>
        </div>
      )}

      {/* Global Alerts */}
      {globalErrorMsg && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <span className="font-semibold">{globalErrorMsg}</span>
          </div>
          <button onClick={() => setGlobalErrorMsg(null)} className="text-red-500 hover:text-red-700 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
      )}

      {globalSuccessMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600 shrink-0" />
            <span className="font-semibold">{globalSuccessMsg}</span>
          </div>
          <button onClick={() => setGlobalSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 p-1 rounded-lg">
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

          <div className="bg-white border-2 border-blue-500/20 rounded-2xl p-4 sm:px-6 shadow-sm flex flex-col items-start md:items-end self-stretch md:self-auto min-w-[260px]">
            {isApiError ? (
              <div className="w-full text-center py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                  <WifiOff size={14} className="text-red-600 shrink-0" />
                  <span>{isAr ? 'الأسعار غير متاحة حالياً بسبب تعذر الاتصال' : 'Prices unavailable right now'}</span>
                </span>
              </div>
            ) : calcMatch.isOutOfBounds ? (
              <div className="w-full text-center py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100/80 px-3 py-1.5 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span>{isAr ? 'هذه القدرة خارج النطاقات المعتمدة لهذه العلامة' : 'Wattage out of supported ranges'}</span>
                </span>
              </div>
            ) : calcMatch.isBrandInactive ? (
              <div className="w-full text-center py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
                  <Power size={14} className="text-slate-500 shrink-0" />
                  <span>{isAr ? 'هذه العلامة التجارية غير مفعّلة حالياً في البورصة' : 'Brand currently inactive in Exchange'}</span>
                </span>
              </div>
            ) : calcPricePerWatt == null ? (
              <div className="w-full text-center py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
                  <Info size={14} className="text-slate-500 shrink-0" />
                  <span>{isAr ? 'لم يتم تسعير هذه العلامة في البورصة بعد' : 'Brand not configured yet'}</span>
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
                  {calcWattage}W × {calcPricePerWatt.toFixed(2)} {isAr ? 'ج.م/وات' : 'EGP/W'}
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
                  const repPrice = isApiError ? null : getBrandRepresentativePrice(b);
                  return (
                    <option key={b} value={b}>
                      {b} {meta ? `(${meta.arName})` : ''} —{' '}
                      {repPrice != null
                        ? `${repPrice.toFixed(2)} ${isAr ? 'ج.م/وات' : 'EGP/W'}`
                        : (isAr ? 'غير مسعّر' : 'Not priced')}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-2">
              {getValidBrandLogo(calcBrand) ? (
                <img
                  src={getValidBrandLogo(calcBrand)!}
                  alt={`${calcBrand} logo`}
                  onError={() => markLogoUrlBroken(getValidBrandLogo(calcBrand)!)}
                  className="w-6 h-6 rounded-md object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                />
              ) : (
                <Info size={13} className="text-blue-500 shrink-0" />
              )}
              <span>{BRAND_METADATA[calcBrand]?.highlight || 'ماركة معتمدة عالية الكفاءة'}</span>
            </div>
          </div>

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

      {/* 4. Controls Toolbar: Search & Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'ابحث عن علامة تجارية (مثال: جينكو، لونجي، جيت سولار...)' : 'Search brand (e.g. Jinko, LONGi, Jet Solar...)'}
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
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
        </div>
      </div>

      {/* 5. Main Brands Table View (Merged rowspan cells per brand) */}
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
      ) : (
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 shadow-sm bg-white mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-bold text-slate-600 tracking-wide">
                  <th className="py-4 px-6 text-right w-[32%]">
                    {isAr ? 'البرند (العلامة التجارية)' : 'Brand Name'}
                  </th>
                  <th className="py-4 px-6 text-center w-[26%]">
                    {isAr ? 'نطاق القدرة' : 'Wattage Range'}
                  </th>
                  <th className="py-4 px-6 text-center w-[22%]">
                    {isAr ? 'السعر لكل وات' : 'Price per Watt'}
                  </th>
                  <th className="py-4 px-6 text-center w-[20%]">
                    {isAr ? (isAdmin ? 'المميزات والإدارة' : 'المميزات') : (isAdmin ? 'Features & Admin' : 'Features')}
                  </th>
                </tr>
              </thead>

              {displayedBrands.map((brand, bIndex) => {
                const meta = BRAND_METADATA[brand];
                const brandRecs = isApiError ? [] : (recordsByBrand[brand] || []);
                const rangeRecs = brandRecs
                  .filter(r => r.min_wattage != null && r.max_wattage != null)
                  .sort((a, b) => (a.min_wattage ?? 0) - (b.min_wattage ?? 0));

                const legacyRec = brandRecs.find(r => (r.min_wattage == null || r.max_wattage == null) && r.price_per_watt > 0);
                const isBrandInactive = brandRecs.length > 0 && !brandRecs.some(isExchangeRecordActive);
                const hasRanges = rangeRecs.length > 0;
                const rowSpanCount = hasRanges ? rangeRecs.length : 1;

                return (
                  <tbody
                    key={brand}
                    className={`border-b-2 border-slate-200/80 hover:bg-slate-50/30 transition-colors ${
                      isBrandInactive ? 'opacity-70 bg-slate-50/40' : ''
                    }`}
                  >
                    {hasRanges ? (
                      rangeRecs.map((range, rIndex) => (
                        <tr
                          key={range.price_id}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          {/* 1. Brand Cell: Merged vertically with rowSpan across all ranges (Logo appears ONLY once per brand) */}
                          {rIndex === 0 && (
                            <td
                              rowSpan={rowSpanCount}
                              className="py-4 px-6 align-middle border-l border-slate-100 bg-white"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center text-sm border border-blue-100 shrink-0">
                                  {bIndex + 1}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {(() => {
                                      const logoUrl = getValidBrandLogo(brand);
                                      return logoUrl ? (
                                        <img
                                          src={logoUrl}
                                          alt={`${brand} logo`}
                                          onError={() => markLogoUrlBroken(logoUrl)}
                                          className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200/80 p-0.5 shrink-0 shadow-2xs"
                                        />
                                      ) : null;
                                    })()}
                                    <span className="font-extrabold text-slate-900 text-base leading-tight notranslate">
                                      {brand}
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">
                                      ({meta?.arName || brand})
                                    </span>
                                    {isBrandInactive && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                                        {isAr ? 'موقوف' : 'Inactive'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                    <span className="text-blue-700 font-semibold">{meta?.tier || 'Tier 1'}</span>
                                    <span className="text-slate-300">·</span>
                                    <span>{meta?.country || 'عالمي'}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          )}

                          {/* 2. Wattage Range Cell */}
                          <td className="py-4 px-6 text-center align-middle">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-800 rounded-xl text-xs font-mono font-bold">
                              <span>{range.min_wattage}</span>
                              <span className="text-slate-400">–</span>
                              <span>{range.max_wattage}</span>
                              <span className="font-sans text-[11px] text-slate-500 font-normal">وات W</span>
                            </span>
                          </td>

                          {/* 3. Price per Watt Cell */}
                          <td className="py-4 px-6 text-center align-middle">
                            <div className="inline-flex items-baseline gap-1 font-mono tabular-nums">
                              <span className={`text-lg font-extrabold ${isBrandInactive ? 'text-slate-400 line-through' : 'text-blue-600'}`}>
                                {range.price_per_watt.toFixed(2)}
                              </span>
                              <span className="text-xs font-bold text-slate-600 font-sans">
                                {isAr ? 'ج.م/وات' : 'EGP/W'}
                              </span>
                            </div>
                          </td>

                          {/* 4. Features & Admin Actions Cell: Merged vertically with rowSpan */}
                          {rIndex === 0 && (
                            <td
                              rowSpan={rowSpanCount}
                              className="py-4 px-6 align-middle border-r border-slate-100 bg-white"
                            >
                              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenFeatures(brand)}
                                  className="w-full sm:w-auto px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap"
                                  title={isAr ? `عرض مميزات علامة ${brand}` : `View ${brand} Features`}
                                >
                                  <Sparkles size={14} className="text-blue-600 shrink-0" />
                                  <span>{isAr ? 'المميزات' : 'Features'}</span>
                                </button>

                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAdminEdit(brand)}
                                    className="w-full sm:w-auto px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap"
                                    title={isAr ? `تعديل نطاقات وأسعار ${brand}` : `Edit ${brand} Ranges`}
                                  >
                                    <Edit2 size={13} className="text-amber-700 shrink-0" />
                                    <span>{isAr ? 'تعديل' : 'Edit'}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      /* Brand with legacy flat record OR unconfigured (no ranges in D1 yet) OR API error */
                      <tr>
                        {/* 1. Brand Cell */}
                        <td className="py-4 px-6 align-middle border-l border-slate-100 bg-white">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center text-sm border border-blue-100 shrink-0">
                              {bIndex + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {(() => {
                                  const logoUrl = getValidBrandLogo(brand);
                                  return logoUrl ? (
                                    <img
                                      src={logoUrl}
                                      alt={`${brand} logo`}
                                      onError={() => markLogoUrlBroken(logoUrl)}
                                      className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200/80 p-0.5 shrink-0 shadow-2xs"
                                    />
                                  ) : null;
                                })()}
                                <span className="font-extrabold text-slate-900 text-base leading-tight notranslate">
                                  {brand}
                                </span>
                                <span className="text-xs text-slate-500 font-medium">
                                  ({meta?.arName || brand})
                                </span>
                                {isBrandInactive && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                                    {isAr ? 'موقوف' : 'Inactive'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                <span className="text-blue-700 font-semibold">{meta?.tier || 'Tier 1'}</span>
                                <span className="text-slate-300">·</span>
                                <span>{meta?.country || 'عالمي'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Wattage Range Cell */}
                        <td className="py-4 px-6 text-center align-middle">
                          <span className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 inline-block">
                            {isApiError
                              ? (isAr ? 'غير متاح مؤقتاً' : 'Temporarily Unavailable')
                              : legacyRec
                              ? (isAr ? 'السعر الأساسي الموحد (سجل قديم)' : 'Legacy Flat Price (All Wattages)')
                              : (isAr ? 'لم يتم تحديد النطاقات بعد' : 'Ranges not configured yet')}
                          </span>
                        </td>

                        {/* 3. Price per Watt Cell */}
                        <td className="py-4 px-6 text-center align-middle">
                          {isApiError ? (
                            <span className="text-xs font-semibold text-red-600">
                              {isAr ? 'تعذر التحميل' : 'Load Failed'}
                            </span>
                          ) : legacyRec ? (
                            <div className="inline-flex items-baseline gap-1 font-mono tabular-nums">
                              <span className={`text-lg font-extrabold ${isBrandInactive ? 'text-slate-400 line-through' : 'text-blue-600'}`}>
                                {legacyRec.price_per_watt.toFixed(2)}
                              </span>
                              <span className="text-xs font-bold text-slate-600 font-sans">
                                {isAr ? 'ج.م/وات' : 'EGP/W'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-xl">
                              {isAr ? 'غير مسعّر حالياً' : 'Price Unavailable'}
                            </span>
                          )}
                        </td>

                        {/* 4. Features & Admin Actions Cell */}
                        <td className="py-4 px-6 align-middle border-r border-slate-100 bg-white">
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenFeatures(brand)}
                              className="w-full sm:w-auto px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap"
                              title={isAr ? `عرض مميزات علامة ${brand}` : `View ${brand} Features`}
                            >
                              <Sparkles size={14} className="text-blue-600 shrink-0" />
                              <span>{isAr ? 'المميزات' : 'Features'}</span>
                            </button>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenAdminEdit(brand)}
                                disabled={isApiError}
                                className="w-full sm:w-auto px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap disabled:opacity-50"
                                title={isAr ? `تحديد نطاقات وأسعار ${brand}` : `Set ${brand} Ranges`}
                              >
                                <Edit2 size={13} className="text-amber-700 shrink-0" />
                                <span>{isAr ? 'تعديل' : 'Edit'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>
      )}

      {/* 6. Brand Features Modal (Available to Customer, Supplier, and Admin) */}
      {selectedFeaturesBrand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                {(() => {
                  const featureLogoUrl = getValidBrandLogo(selectedFeaturesBrand);
                  return featureLogoUrl ? (
                    <img
                      src={featureLogoUrl}
                      alt={`${selectedFeaturesBrand} logo`}
                      onError={() => markLogoUrlBroken(featureLogoUrl)}
                      className="w-11 h-11 rounded-2xl object-contain bg-white border border-slate-200 p-1 shrink-0 shadow-xs"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                      <Award size={22} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-lg font-bold text-slate-900 notranslate leading-tight">
                    {selectedFeaturesBrand}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {BRAND_METADATA[selectedFeaturesBrand]?.arName} · {BRAND_METADATA[selectedFeaturesBrand]?.tier}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseFeatures}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {BRAND_METADATA[selectedFeaturesBrand]?.highlight && (
              <div className="mb-5 p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-blue-900 leading-relaxed font-medium">
                {BRAND_METADATA[selectedFeaturesBrand]?.highlight}
              </div>
            )}

            <div className="space-y-3 mb-6">
              <span className="text-xs font-bold text-slate-700 block">
                {isAr ? 'مميزات العلامة التجارية:' : 'Brand Capabilities & Features:'}
              </span>

              {BRAND_METADATA[selectedFeaturesBrand]?.features &&
              BRAND_METADATA[selectedFeaturesBrand].features.length > 0 ? (
                <ul className="space-y-2.5">
                  {BRAND_METADATA[selectedFeaturesBrand].features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 leading-relaxed"
                    >
                      <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-500">
                  {isAr ? 'لا توجد مميزات مضافة لهذا البرند حالياً' : 'No features listed for this brand currently'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
              {onNavigateToBrandProducts ? (
                <button
                  type="button"
                  onClick={() => {
                    handleCloseFeatures();
                    onNavigateToBrandProducts(selectedFeaturesBrand);
                  }}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <span>{isAr ? `تصفح ألواح ${selectedFeaturesBrand}` : `Explore ${selectedFeaturesBrand}`}</span>
                  <ExternalLink size={14} />
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleCloseFeatures}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Admin Manage Ranges Dialog (Admin Only) */}
      {isAdmin && editingBrandForAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/60">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {isAr ? `إدارة نطاقات ${editingBrandForAdmin}` : `Manage ${editingBrandForAdmin} Ranges`}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {BRAND_METADATA[editingBrandForAdmin]?.arName} · {isAr ? 'الحد الأدنى نطاق واحد، والحد الأقصى 3 نطاقات' : 'Min 1 range, Max 3 ranges'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseAdminEdit}
                disabled={isAdminSaving}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {adminModalError && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{adminModalError}</span>
              </div>
            )}

            {/* Brand Logo Management inside the existing Brand Edit Dialog */}
            <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {adminLogoPreviewUrl && !brokenLogoUrls[adminLogoPreviewUrl] ? (
                    <div className="relative shrink-0">
                      <img
                        src={adminLogoPreviewUrl}
                        alt={`${editingBrandForAdmin} logo preview`}
                        onError={() => {
                          if (adminLogoPreviewUrl) markLogoUrlBroken(adminLogoPreviewUrl);
                        }}
                        className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 p-1.5 shadow-2xs"
                      />
                    </div>
                  ) : null}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-800">
                        {isAr ? `شعار العلامة التجارية (${editingBrandForAdmin})` : `Brand Logo (${editingBrandForAdmin})`}
                      </span>
                      {adminLogoFile && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                          {isAr ? 'معاينة قبل الحفظ' : 'Preview before saving'}
                        </span>
                      )}
                      {adminLogoMarkedRemoval && !adminLogoFile && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-md">
                          {isAr ? 'سيتم الحذف عند الحفظ' : 'Will remove on save'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {adminLogoUploadStatus
                        ? adminLogoUploadStatus
                        : adminLogoPreviewUrl
                        ? (isAr ? 'يظهر الشعار بجانب اسم الماركة في جدول البورصة.' : 'Displayed alongside the brand name in the exchange table.')
                        : (isAr ? 'يُعرض اسم الماركة نصياً عند عدم وجود شعار.' : 'Brand name renders cleanly as text when no logo is uploaded.')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleSelectLogoFile}
                    disabled={isAdminSaving}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={isAdminSaving}
                    className="px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <Upload size={13} />
                    <span>
                      {adminLogoPreviewUrl
                        ? (isAr ? 'تغيير الشعار' : 'Replace Logo')
                        : (isAr ? 'رفع شعار' : 'Upload Logo')}
                    </span>
                  </button>

                  {adminLogoPreviewUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogoInModal}
                      disabled={isAdminSaving}
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      <span>{isAr ? 'إزالة الشعار' : 'Remove Logo'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Brand Activation Status Control */}
            <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  {isAr ? 'حالة العلامة التجارية في البورصة' : 'Brand Exchange Status'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {adminBrandIsActive
                    ? (isAr ? 'نشط: تُحسب أسعار الألواح بناءً على هذه النطاقات' : 'Active: panel pricing uses these ranges')
                    : (isAr ? 'موقوف: لا تُستخدم الأسعار في الحسابات التلقائية' : 'Inactive: excluded from automated pricing')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setAdminBrandIsActive(prev => !prev)}
                disabled={isAdminSaving}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  adminBrandIsActive
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700 border border-slate-300'
                }`}
              >
                <Power size={13} />
                <span>{adminBrandIsActive ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'موقوف' : 'Inactive')}</span>
              </button>
            </div>

            {/* Boundary Guidance Notice */}
            <div className="mb-4 p-3 bg-blue-50/70 border border-blue-100 rounded-2xl text-[11px] text-blue-800 flex items-start gap-2">
              <Info size={15} className="shrink-0 mt-0.5 text-blue-600" />
              <span>
                {isAr
                  ? 'ملاحظة: حدود النطاقات شاملة ومغلقة والحد الأدنى أقل من الحد الأقصى؛ لتفادي التداخل يجب ألا تتشترك الحدود (مثال: 550–600 وات، ثم 601–655 وات).'
                  : 'Note: Range boundaries are inclusive and min must be less than max. Consecutive ranges must not overlap (e.g. 550–600 W, then 601–655 W).'}
              </span>
            </div>

            {/* Ranges Form Sections */}
            <div className="space-y-4 mb-6">
              {adminRanges.map((rangeItem, idx) => {
                const isMandatoryFirst = idx === 0;

                return (
                  <div
                    key={idx}
                    className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 transition"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {idx === 0
                            ? (isAr ? 'النطاق الأول (إجباري)' : 'Range 1 (Mandatory)')
                            : idx === 1
                            ? (isAr ? 'النطاق الثاني (اختياري)' : 'Range 2 (Optional)')
                            : (isAr ? 'النطاق الثالث (اختياري)' : 'Range 3 (Optional)')}
                        </span>
                      </div>

                      {!isMandatoryFirst && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRange(idx)}
                          disabled={isAdminSaving}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title={isAr ? `حذف النطاق ${idx + 1}` : `Delete Range ${idx + 1}`}
                        >
                          <Trash2 size={13} />
                          <span>{isAr ? 'حذف' : 'Remove'}</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {isAr ? 'الحد الأدنى (وات):' : 'Min Wattage (W):'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="2000"
                          value={rangeItem.minWattage}
                          onChange={(e) => handleUpdateAdminRangeField(idx, 'minWattage', e.target.value)}
                          placeholder="550"
                          disabled={isAdminSaving}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {isAr ? 'الحد الأقصى (وات):' : 'Max Wattage (W):'}
                        </label>
                        <input
                          type="number"
                          min="2"
                          max="2000"
                          value={rangeItem.maxWattage}
                          onChange={(e) => handleUpdateAdminRangeField(idx, 'maxWattage', e.target.value)}
                          placeholder="600"
                          disabled={isAdminSaving}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          {isAr ? 'سعر الوات (ج.م/وات):' : 'Price per Watt (EGP/W):'}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.05"
                            min="0.1"
                            max="200"
                            value={rangeItem.pricePerWatt}
                            onChange={(e) => handleUpdateAdminRangeField(idx, 'pricePerWatt', e.target.value)}
                            placeholder="12.00"
                            disabled={isAdminSaving}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold font-mono text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="absolute left-2.5 top-2.5 text-[10px] font-bold text-slate-400">
                            ج.م
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {adminRanges.length < 3 ? (
              <button
                type="button"
                onClick={handleAddNextRange}
                disabled={isAdminSaving}
                className="w-full mb-6 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-dashed border-blue-300 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus size={15} />
                <span>
                  {adminRanges.length === 1
                    ? (isAr ? 'إضافة نطاق ثانٍ (+)' : 'Add Second Range (+)')
                    : (isAr ? 'إضافة نطاق ثالث (+)' : 'Add Third Range (+)')}
                </span>
              </button>
            ) : (
              <div className="mb-6 p-2.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl text-center text-xs">
                {isAr ? 'تم الوصول للحد الأقصى (3 نطاقات قدرة للعلامة التجارية)' : 'Maximum 3 ranges reached for this brand'}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseAdminEdit}
                disabled={isAdminSaving}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleSaveAdminRanges}
                disabled={isAdminSaving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
              >
                {isAdminSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>
                  {isAdminSaving
                    ? adminLogoUploadStatus || (isAr ? 'جاري الحفظ...' : 'Saving...')
                    : isAr
                    ? 'حفظ التعديلات'
                    : 'Save Changes'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
