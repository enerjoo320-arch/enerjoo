import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { ArrowRight, Power, Ruler, Zap, Shield, ArrowLeftRight, CheckCircle2, Download, MapPin, Grid, Edit, Heart, Star, MessageSquare, Building2, Info, Cpu, Battery, Activity, FileText, Trash2, AlertTriangle, Loader2, X, ChevronDown, Sliders, Layers } from 'lucide-react';
import { Product, ProductReview, Supplier } from '../types';
import { translations } from '../translations';
import { motion, AnimatePresence } from 'motion/react';
import { ProductCard } from './ProductCard';
import { useAuth } from '../context/AuthContext';
import { subscribeToProductReviews, addProductReview, deleteProductReview, getSupplierProfile } from '../services/firestoreService';
import { auth } from '../lib/firebase';
import { getSupplierWhatsAppUrl, SUPPLIER_CONTACT_PHONE_DISPLAY } from '../constants/contact';
import { formatDateOnly } from '../utils/dateUtils';
import { getSupplierDisplayName, getSupplierAvatarInitial, isRawUidOrId } from '../utils/supplierUtils';
import { classifyInverter } from '../utils/inverterClassification';
import { formatCleanNumber } from '../utils/dimensionUtils';
import { applyProductSeo } from '../utils/seo';

const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&q=80&w=800';

interface ProductDetailProps {
  product: Product;
  allProducts: Product[];
  suppliers?: Supplier[];
  lang: 'ar' | 'en';
  onBack: () => void;
  onCompare: (product: Product) => void;
  onWishlist: (product: Product) => void;
  isCompared: (id: number | string) => boolean;
  isInWishlist: (id: number | string) => boolean;
  onProductClick: (product: Product) => void;
  onFilterSupplier: (id: string | number) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (id: string | number) => void | Promise<void>;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({ 
  product: initialProduct, 
  allProducts, 
  suppliers,
  lang, 
  onBack, 
  onCompare, 
  onWishlist,
  isCompared,
  isInWishlist,
  onProductClick,
  onFilterSupplier,
  onEdit,
  onDelete
}) => {
  // Always resolve the latest product instance from allProducts to ensure Energy Exchange price updates reflect immediately
  const product = useMemo(() => {
    if (!allProducts || allProducts.length === 0) return initialProduct;
    const found = allProducts.find(p => p.id?.toString() === initialProduct.id?.toString());
    return found || initialProduct;
  }, [allProducts, initialProduct]);

  const { user } = useAuth();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const isWishlisted = isInWishlist(product.id);
  const userUid = String(user?.uid || '').trim();
  const isOwner =
    user?.type === 'admin' ||
    (user?.type === 'supplier' &&
      Boolean(userUid) &&
      (String(product.supplierId || '').trim() === userUid ||
        String((product as any).supplier_id || '').trim() === userUid ||
        String((product as any).supplier || '').trim() === userUid ||
        Boolean(product.suppliers?.some(s => String(s?.id || '').trim() === userUid))));
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Always ensure the product details page opens and renders from the top
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    const raf = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [product.id]);

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    if (!user || !auth.currentUser) {
      setDeleteError(
        isAr
          ? 'يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من حذف المنتج.'
          : 'Please sign in to your Enerjoo account first to delete this product.'
      );
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);
      await onDelete(product.id);
      setShowDeleteModal(false);
      onBack();
    } catch (err: any) {
      console.error('Failed to delete product from detail view:', err);
      const errMsg = (err instanceof Error && err.message)
        ? err.message
        : (isAr ? 'تعذر حذف المنتج من قاعدة البيانات.' : 'Failed to delete product from database.');
      setDeleteError(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const [selectedImage, setSelectedImage] = useState<string>(product.image);
  const [showAdvancedSpecs, setShowAdvancedSpecs] = useState(false);

  useEffect(() => {
    setSelectedImage(product.image);
    setShowAdvancedSpecs(false);
  }, [product.image, product.id]);

  // Dynamic SEO metadata, canonical link, OpenGraph tags, and Schema.org Product structured data
  useEffect(() => {
    const cleanupSeo = applyProductSeo(product, lang);
    return cleanupSeo;
  }, [product, lang]);

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [fetchedProfiles, setFetchedProfiles] = useState<Record<string, Supplier>>({});

  // Asynchronously resolve supplier profile if missing or holding raw UID
  useEffect(() => {
    product.suppliers?.forEach(s => {
      const supId = s.id || product.supplierId;
      if (supId && (isRawUidOrId(s.name) || isRawUidOrId(s.nameAr) || !s.name || !s.nameAr)) {
        getSupplierProfile(supId).then(profile => {
          if (profile) {
            setFetchedProfiles(prev => ({ ...prev, [supId]: profile }));
          }
        });
      }
    });
  }, [product.suppliers, product.supplierId]);

  useEffect(() => {
    const unsub = subscribeToProductReviews(product.id.toString(), setReviews);
    return () => unsub();
  }, [product.id]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    return Math.round((total / reviews.length) * 10) / 10;
  }, [reviews]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setReviewError(isAr ? 'يرجى تسجيل الدخول أولاً' : 'Please sign in first');
      return;
    }

    if (!newComment.trim()) {
      setReviewError(isAr ? 'يرجى كتابة تعليق' : 'Please write a comment');
      return;
    }
    setIsSubmitting(true);
    setReviewError(null);
    try {
      await addProductReview(product.id.toString(), {
        userId: user.uid,
        userName: user.name || user.email || 'Anonymous User',
        rating: newRating,
        comment: newComment,
      });
      setNewComment('');
      setNewRating(5);
    } catch (err: any) {
      setReviewError(isAr ? 'فشل إضافة التقييم. حاول مرة أخرى.' : 'Failed to submit review. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewDelete = async (reviewId: string) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا التقييم؟' : 'Are you sure you want to delete this review?')) {
      return;
    }
    try {
      await deleteProductReview(product.id.toString(), reviewId);
    } catch (err) {
      console.error(err);
    }
  };

  const getMainSpecs = () => {
    const common = [
      { 
        label: t.price, 
        value: `${product.price.toLocaleString()} ${t.egp}${product.category === 'panels' && product.pricePerWatt ? ` (${product.pricePerWatt.toFixed(2)} ${isAr ? 'ج.م/وات' : 'EGP/W'})` : ''}`, 
        icon: <CheckCircle2 className="text-solar-blue" /> 
      },
      { label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield className="text-solar-success" /> },
    ];

    switch (product.category) {
      case 'panels': {
        const hasDims = (product.length && product.width) || (product.specs?.length && product.specs?.width && !isNaN(Number(product.specs.length)) && !isNaN(Number(product.specs.width)));
        const pLen = product.length || product.specs?.length;
        const pWidth = product.width || product.specs?.width;
        const pThick = product.thickness || product.specs?.thickness;
        const pUnit = product.dimensionUnit || product.specs?.dimensionUnit || 'mm';

        const specsList = [
          { label: t.power, value: `${product.power} ${t.watt}`, icon: <Power className="text-solar-blue" /> },
          { label: t.efficiency, value: `${product.efficiency}%`, icon: <Zap className="text-solar-warning" /> },
          { label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield className="text-solar-success" /> },
          { 
            label: hasDims ? (isAr ? 'الأبعاد والمساحة' : 'Dimensions & Area') : t.area, 
            value: hasDims 
              ? `${formatCleanNumber(pLen)}×${formatCleanNumber(pWidth)}${pThick ? `×${formatCleanNumber(pThick)}` : ''} ${pUnit} (${formatCleanNumber(product.area, 3)} m²)` 
              : `${formatCleanNumber(product.area, 3)} m²`, 
            icon: <Ruler className="text-solar-accent" /> 
          }
        ];

        const voltVal = product.specs?.voltage || product.specs?.vmpV || product.specs?.vocV;
        if (voltVal) {
          const strVolt = String(voltVal);
          const formattedVolt = /v|فولت/i.test(strVolt) ? strVolt : `${strVolt} ${t.volt || 'V'}`;
          specsList.push({ label: t.voltage, value: formattedVolt, icon: <Zap className="text-solar-blue" /> });
        }
        const currVal = product.specs?.current || product.specs?.impA || product.specs?.iscA;
        if (currVal) {
          const strCurr = String(currVal);
          const formattedCurr = /a|أمبير/i.test(strCurr) ? strCurr : `${strCurr} ${t.ampere || 'A'}`;
          specsList.push({ label: t.current, value: formattedCurr, icon: <Power className="text-solar-warning" /> });
        }

        return specsList;
      }
      case 'inverters': {
        const hpVal = product.specs?.hp || product.specs?.horsepower || product.specs?.horsePower || product.specs?.pumpHorsepower || (product as any).hp;
        const powerVal = product.specs?.powerKw 
          ? (String(product.specs.powerKw).includes('kW') || String(product.specs.powerKw).includes('كيلو') ? String(product.specs.powerKw) : `${product.specs.powerKw} kW`)
          : (product.power ? (product.power >= 1000 ? `${product.power / 1000} kW` : `${product.power} W`) : (product.specs?.ratedPowerKw ? `${product.specs.ratedPowerKw} kW` : 'N/A'));

        const effVal = product.efficiency ? `${product.efficiency}%` : (product.specs?.peakEfficiency ? `${product.specs.peakEfficiency}%` : 'N/A');
        const typeVal = product.specs?.type || product.specs?.waveform || product.specs?.productType || 'N/A';

        const specsList = [];
        if (hpVal && hpVal !== 'Unknown') {
          specsList.push({
            label: isAr ? 'القدرة بالحصان (HP)' : 'Horsepower (HP)',
            value: isAr ? `${hpVal} حصان` : `${hpVal} HP`,
            icon: <Power className="text-solar-blue" />
          });
        }
        specsList.push(
          { label: t.powerKw, value: powerVal, icon: <Power className="text-solar-blue" /> },
          { label: t.efficiency, value: effVal, icon: <Zap className="text-solar-warning" /> },
          { label: t.type, value: typeVal, icon: <Grid className="text-solar-accent" /> },
          { label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield className="text-solar-success" /> }
        );

        const mpptVal = product.specs?.pvMpptVoltageRangeV || product.specs?.mppt || product.specs?.mpptVoltageRange || (product as any).pv_mppt_voltage_range_v;
        if (mpptVal) {
          const strMppt = String(mpptVal);
          const formattedMppt = /v|فولت/i.test(strMppt) ? strMppt : `${strMppt} V`;
          specsList.push({ label: isAr ? 'جهد MPPT' : 'MPPT Voltage', value: formattedMppt, icon: <Zap className="text-solar-warning" /> });
        }

        const voltVal = product.specs?.voltage || product.specs?.acVoltageV || product.specs?.nominalVoltage;
        if (voltVal) {
          const strVolt = String(voltVal);
          const formattedVolt = /v|فولت/i.test(strVolt) ? strVolt : `${strVolt} ${t.volt || 'V'}`;
          specsList.push({ label: isAr ? 'جهد الخرج (AC)' : t.voltage, value: formattedVolt, icon: <Zap className="text-solar-blue" /> });
        }
        if (product.specs?.current) {
          const strCurr = String(product.specs.current);
          const formattedCurr = /a|أمبير/i.test(strCurr) ? strCurr : `${strCurr} ${t.ampere || 'A'}`;
          specsList.push({ label: isAr ? 'تيار الخرج (AC)' : t.current, value: formattedCurr, icon: <Power className="text-solar-warning" /> });
        }

        return specsList;
      }
      case 'pumps': {
        const hpVal = product.specs?.hp || product.specs?.horsepower || product.specs?.horsePower || product.specs?.pumpHorsepower || (product as any).hp;
        const powerVal = product.specs?.powerKw 
          ? (String(product.specs.powerKw).includes('kW') ? String(product.specs.powerKw) : `${product.specs.powerKw} kW`)
          : (product.power ? (product.power >= 1000 ? `${(product.power / 1000).toFixed(1)} kW` : `${product.power} W`) : 'N/A');

        const specsList = [];
        if (hpVal && hpVal !== 'Unknown') {
          specsList.push({
            label: isAr ? 'القدرة بالحصان (HP)' : 'Horsepower (HP)',
            value: isAr ? `${hpVal} حصان` : `${hpVal} HP`,
            icon: <Power className="text-solar-blue" />
          });
        }
        specsList.push(
          { label: t.powerKw, value: powerVal, icon: <Power className="text-solar-blue" /> },
          { label: t.type, value: product.specs?.type || (isAr ? 'مضخة ري' : 'Pump'), icon: <Grid className="text-solar-accent" /> },
          { label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield className="text-solar-success" /> }
        );

        if (product.specs?.voltage) {
          specsList.push({ label: t.voltage, value: `${product.specs.voltage} V`, icon: <Zap className="text-solar-blue" /> });
        }
        if (product.specs?.current) {
          specsList.push({ label: t.current, value: `${product.specs.current} A`, icon: <Power className="text-solar-warning" /> });
        }

        return specsList;
      }
      case 'batteries': {
        const capacityVal = product.specs?.capacity 
          ? String(product.specs.capacity)
          : (product.specs?.capacityAh ? `${product.specs.capacityAh} Ah` : (product.specs?.nominalEnergyWh ? `${product.specs.nominalEnergyWh} Wh` : (product.power ? `${product.power} W` : 'N/A')));
        const voltVal = product.specs?.voltage || product.specs?.nominalVoltage ? `${product.specs?.voltage || product.specs?.nominalVoltage} V` : 'N/A';
        const typeVal = product.specs?.type || product.specs?.cellType || product.specs?.technology || 'N/A';

        return [
          { label: t.capacity, value: capacityVal, icon: <Zap className="text-solar-warning" /> },
          { label: t.voltage, value: voltVal, icon: <Zap className="text-solar-blue" /> },
          { label: t.type, value: typeVal, icon: <Grid className="text-solar-accent" /> },
          { label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield className="text-solar-success" /> }
        ];
      }
      case 'cables':
        return [
          { label: t.crossSection, value: product.specs?.crossSection ? `${product.specs.crossSection} mm²` : 'N/A', icon: <Ruler className="text-solar-accent" /> },
          { label: t.length, value: product.specs?.cableLength || product.specs?.length ? `${product.specs?.cableLength || product.specs?.length} m` : 'N/A', icon: <Ruler className="text-solar-blue" /> },
          { label: t.voltage, value: product.specs?.voltage || 'N/A', icon: <Zap className="text-solar-warning" /> },
          { label: t.material, value: product.specs?.material || 'N/A', icon: <Grid className="text-solar-success" /> }
        ];
      case 'protection':
      case 'combiner': {
        const specsList = [
          ...common
        ];
        if (product.specs?.poles) {
          specsList.push({ label: t.poles, value: product.specs.poles, icon: <Grid className="text-solar-accent" /> });
        }
        if (product.specs?.voltage) {
          const strVolt = String(product.specs.voltage);
          const formattedVolt = /v|فولت/i.test(strVolt) ? strVolt : `${strVolt} ${t.volt || 'V'}`;
          specsList.push({ label: t.voltage, value: formattedVolt, icon: <Zap className="text-solar-blue" /> });
        }
        if (product.specs?.current) {
          const strCurr = String(product.specs.current);
          const formattedCurr = /a|أمبير/i.test(strCurr) ? strCurr : `${strCurr} ${t.ampere || 'A'}`;
          specsList.push({ label: t.current, value: formattedCurr, icon: <Power className="text-solar-warning" /> });
        }
        return specsList;
      }
      case 'mounting': {
        const specsList = [
          ...common
        ];
        if (product.specs?.material) {
          specsList.push({ label: t.material, value: String(product.specs.material), icon: <Grid className="text-solar-accent" /> });
        }
        if (product.specs?.maxWind) {
          specsList.push({ label: t.maxWind, value: `${product.specs.maxWind} km/h`, icon: <Zap className="text-solar-warning" /> });
        }
        return specsList;
      }
      default:
        return common;
    }
  };

  const getSpecLabel = (key: string): string => {
    const labels: Record<string, string> = {
      type: t.type,
      voltage: t.voltage,
      current: t.current,
      weight: t.weight,
      capacity: t.capacity,
      powerKw: t.powerKw,
      hp: isAr ? 'القدرة بالحصان (HP)' : 'Horsepower (HP)',
      horsepower: isAr ? 'القدرة بالحصان (HP)' : 'Horsepower (HP)',
      horsePower: isAr ? 'القدرة بالحصان (HP)' : 'Horsepower (HP)',
      pumpHorsepower: isAr ? 'قدرة المضخة بالحصان (HP)' : 'Pump Horsepower (HP)',
      motorPowerRange: isAr ? 'نطاق قدرة الماتور / المضخة' : 'Motor Power Range',
      crossSection: t.crossSection,
      length: t.length,
      width: t.width,
      thickness: t.thickness,
      dimensionUnit: t.dimensionUnit,
      area: t.area,
      material: t.material,
      maxWind: t.maxWind,
      ipRating: t.ipRating,
      poles: t.poles,
      quantity: t.quantityValue,
      color: t.color,
      power: t.power,
      efficiency: t.efficiency,
      warranty: t.warranty,
      vmpV: isAr ? 'جهد التشغيل الأقصى (Vmp)' : 'Max Power Voltage (Vmp)',
      vocV: isAr ? 'جهد الدائرة المفتوحة (Voc)' : 'Open Circuit Voltage (Voc)',
      impA: isAr ? 'تيار التشغيل الأقصى (Imp)' : 'Max Power Current (Imp)',
      iscA: isAr ? 'تيار الدائرة القصيرة (Isc)' : 'Short Circuit Current (Isc)',
      cellType: isAr ? 'نوع الخلايا' : 'Cell Type',
      technology: isAr ? 'التقنية' : 'Technology',
      productType: isAr ? 'نوع المنتج' : 'Product Type',
      numberOfCells: isAr ? 'عدد الخلايا' : 'Number of Cells',
      ratedPowerKw: isAr ? 'القدرة المقننة (كيلوواط)' : 'Rated Power (kW)',
      surgePowerW: isAr ? 'قدرة التحمل القصوى (W)' : 'Surge Power (W)',
      waveform: isAr ? 'شكل الموجة' : 'Waveform',
      acVoltageV: isAr ? 'جهد التيار المتردد (AC)' : 'AC Voltage',
      frequencyHz: isAr ? 'التردد (هرتز)' : 'Frequency (Hz)',
      peakEfficiency: isAr ? 'أقصى كفاءة' : 'Peak Efficiency',
      nominalVoltage: isAr ? 'الجهد الاسمي' : 'Nominal Voltage',
      capacityAh: isAr ? 'السعة (أمبير-ساعة)' : 'Capacity (Ah)',
      nominalEnergyWh: isAr ? 'الطاقة الاسمية (Wh)' : 'Nominal Energy (Wh)',
      maxContinuousDischargeCurrentA: isAr ? 'أقصى تيار تفريغ مستمر' : 'Max Continuous Discharge',
      cycleLife: isAr ? 'دورات الحياة (Cycle Life)' : 'Cycle Life',
      maxPvOpenCircuitVoltageV: isAr ? 'أقصى جهد PV (Voc)' : 'Max PV Voc',
      maxPvArrayPowerW: isAr ? 'أقصى قدرة للألواح (W)' : 'Max PV Array Power',
      pvMpptVoltageRangeV: isAr ? 'نطاق جهد الـ MPPT' : 'MPPT Voltage Range',
      cableLength: isAr ? 'طول الكابل' : 'Cable Length',
      weightKg: isAr ? 'الوزن (كجم)' : 'Weight (kg)',
      dimensionsMm: isAr ? 'الأبعاد (مم)' : 'Dimensions (mm)',
      notes: isAr ? 'ملاحظات' : 'Notes',
    };
    return labels[key] || key;
  };

  // Comprehensive technical specifications builder ensuring all available data is displayed
  const detailedSpecs = useMemo(() => {
    const list: Array<{ key: string; label: string; value: string; icon?: React.ReactNode }> = [];
    const specsObj = product.specs || {};

    const formatValueWithUnit = (key: string, val: any): string => {
      if (val === undefined || val === null || val === '') return '';
      const strVal = String(val).trim();
      if (!strVal || strVal === 'N/A') return '';

      switch (key) {
        case 'voltage':
        case 'vmpV':
        case 'vocV':
        case 'acVoltageV':
        case 'nominalVoltage':
          return /v|فولت/i.test(strVal) ? strVal : `${strVal} V`;
        case 'current':
        case 'impA':
        case 'iscA':
        case 'maxContinuousDischargeCurrentA':
          return /a|أمبير/i.test(strVal) ? strVal : `${strVal} A`;
        case 'power':
          return /w|وات/i.test(strVal) ? strVal : `${strVal} W`;
        case 'powerKw':
        case 'ratedPowerKw':
          return /kw|كيلو/i.test(strVal) ? strVal : `${strVal} kW`;
        case 'hp':
        case 'horsepower':
        case 'horsePower':
        case 'pumpHorsepower':
          return /hp|حصان/i.test(strVal) ? strVal : `${strVal} ${isAr ? 'حصان' : 'HP'}`;
        case 'efficiency':
        case 'peakEfficiency':
          return strVal.endsWith('%') ? strVal : `${strVal}%`;
        case 'warranty':
          return /year|سنة/i.test(strVal) ? strVal : `${strVal} ${t.years}`;
        case 'capacityAh':
          return /ah|أمبير/i.test(strVal) ? strVal : `${strVal} Ah`;
        case 'nominalEnergyWh':
          return /wh|واط/i.test(strVal) ? strVal : `${strVal} Wh`;
        case 'crossSection':
          return /mm|مم/i.test(strVal) ? strVal : `${strVal} mm²`;
        case 'cableLength':
          return /m|متر/i.test(strVal) ? strVal : `${strVal} m`;
        case 'weight':
        case 'weightKg':
          return /kg|كجم|كيلو/i.test(strVal) ? strVal : `${strVal} kg`;
        case 'frequencyHz':
          return /hz|هرتز/i.test(strVal) ? strVal : `${strVal} Hz`;
        case 'maxWind':
          return /km|كم/i.test(strVal) ? strVal : `${strVal} km/h`;
        case 'area':
          return /m²|متر/i.test(strVal) ? strVal : `${strVal} m²`;
        default:
          return strVal;
      }
    };

    // 0. Horsepower (for pump inverters and motors)
    const hpVal = specsObj.hp || specsObj.horsepower || specsObj.horsePower || specsObj.pumpHorsepower || (product as any).hp;
    if (hpVal && hpVal !== 'Unknown') {
      list.push({ key: 'hp', label: isAr ? 'القدرة بالحصان (HP)' : 'Horsepower (HP)', value: `${hpVal} ${isAr ? 'حصان' : 'HP'}`, icon: <Power size={14} className="text-solar-blue" /> });
    }

    // 1. Power
    if (product.power && product.power > 0) {
      list.push({ key: 'power', label: t.power, value: `${product.power} ${t.watt}`, icon: <Power size={14} className="text-solar-blue" /> });
    } else if (specsObj.power) {
      list.push({ key: 'power', label: t.power, value: formatValueWithUnit('power', specsObj.power), icon: <Power size={14} className="text-solar-blue" /> });
    }
    if (specsObj.powerKw || specsObj.ratedPowerKw) {
      list.push({ key: 'powerKw', label: t.powerKw, value: formatValueWithUnit('powerKw', specsObj.powerKw || specsObj.ratedPowerKw), icon: <Power size={14} className="text-solar-blue" /> });
    }
    if (specsObj.surgePowerW) {
      list.push({ key: 'surgePowerW', label: isAr ? 'قدرة التحمل القصوى' : 'Surge Power', value: `${specsObj.surgePowerW} W`, icon: <Zap size={14} className="text-solar-warning" /> });
    }

    // 2. Efficiency
    if (product.efficiency && product.efficiency > 0) {
      list.push({ key: 'efficiency', label: t.efficiency, value: `${product.efficiency}%`, icon: <Zap size={14} className="text-solar-warning" /> });
    } else if (specsObj.peakEfficiency || specsObj.efficiency) {
      list.push({ key: 'efficiency', label: t.efficiency, value: formatValueWithUnit('efficiency', specsObj.peakEfficiency || specsObj.efficiency), icon: <Zap size={14} className="text-solar-warning" /> });
    }

    // 3. Warranty
    if (product.warranty && product.warranty > 0) {
      list.push({ key: 'warranty', label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield size={14} className="text-solar-success" /> });
    } else if (specsObj.warranty) {
      list.push({ key: 'warranty', label: t.warranty, value: formatValueWithUnit('warranty', specsObj.warranty), icon: <Shield size={14} className="text-solar-success" /> });
    }

    // 4. Dimensions & Area
    const hasDimensions = (product.length && product.width) || (specsObj.length && specsObj.width && !isNaN(Number(specsObj.length)) && !isNaN(Number(specsObj.width)));
    if (hasDimensions) {
      const pLen = product.length || specsObj.length;
      const pWidth = product.width || specsObj.width;
      const pThick = product.thickness || specsObj.thickness;
      const pUnit = product.dimensionUnit || specsObj.dimensionUnit || 'mm';
      list.push({ 
        key: 'dimensions', 
        label: isAr ? 'الأبعاد' : 'Dimensions', 
        value: `${formatCleanNumber(pLen)} × ${formatCleanNumber(pWidth)}${pThick ? ` × ${formatCleanNumber(pThick)}` : ''} ${pUnit}`,
        icon: <Ruler size={14} className="text-solar-accent" />
      });
    } else if (specsObj.dimensionsMm) {
      list.push({ key: 'dimensions', label: isAr ? 'الأبعاد (مم)' : 'Dimensions (mm)', value: String(specsObj.dimensionsMm), icon: <Ruler size={14} className="text-solar-accent" /> });
    }

    // Only show area for solar panels
    if (product.category === 'panels') {
      if (product.area && product.area > 0) {
        list.push({ key: 'area', label: t.area, value: `${formatCleanNumber(product.area, 3)} m²`, icon: <Ruler size={14} className="text-solar-accent" /> });
      } else if (specsObj.area && Number(specsObj.area) > 0) {
        list.push({ key: 'area', label: t.area, value: `${formatCleanNumber(specsObj.area, 3)} m²`, icon: <Ruler size={14} className="text-solar-accent" /> });
      }
    }

    // Helper to normalize values for deduplication comparison
    const normSpecVal = (v: any) => String(v || '').trim().toLowerCase().replace(/\s+/g, '').replace(/v|a|w|فولت|أمبير/g, '');

    // MPPT Voltage Range (especially important for Inverters)
    const mpptVal = specsObj.pvMpptVoltageRangeV || specsObj.mppt || specsObj.mpptVoltageRange || (product as any).pv_mppt_voltage_range_v;
    if (mpptVal) {
      const strMppt = String(mpptVal);
      const formattedMppt = /v|فولت/i.test(strMppt) ? strMppt : `${strMppt} V`;
      list.push({ 
        key: 'mppt', 
        label: isAr ? 'نطاق جهد الـ MPPT' : 'MPPT Voltage Range', 
        value: formattedMppt, 
        icon: <Zap size={14} className="text-solar-warning" /> 
      });
    }

    // 5. Voltage (Deduplicated per category)
    if (product.category === 'panels') {
      if (specsObj.vmpV) {
        list.push({ key: 'vmpV', label: isAr ? 'جهد التشغيل (Vmp)' : 'Max Power Voltage (Vmp)', value: formatValueWithUnit('vmpV', specsObj.vmpV), icon: <Zap size={14} className="text-solar-blue" /> });
      } else if (specsObj.voltage) {
        list.push({ key: 'voltage', label: t.voltage, value: formatValueWithUnit('voltage', specsObj.voltage), icon: <Zap size={14} className="text-solar-blue" /> });
      }
      if (specsObj.vocV && normSpecVal(specsObj.vocV) !== normSpecVal(specsObj.vmpV || specsObj.voltage)) {
        list.push({ key: 'vocV', label: isAr ? 'جهد الدائرة المفتوحة (Voc)' : 'Open Circuit Voltage (Voc)', value: formatValueWithUnit('vocV', specsObj.vocV), icon: <Zap size={14} className="text-solar-blue" /> });
      }
    } else if (product.category === 'inverters') {
      const acVolt = specsObj.acVoltageV || specsObj.voltage;
      if (acVolt) {
        list.push({ key: 'voltage', label: isAr ? 'جهد الخرج المتردد (AC)' : 'AC Output Voltage', value: formatValueWithUnit('voltage', acVolt), icon: <Zap size={14} className="text-solar-blue" /> });
      }
    } else {
      const voltToDisplay = specsObj.voltage || specsObj.nominalVoltage || specsObj.vmpV;
      if (voltToDisplay) {
        list.push({ key: 'voltage', label: t.voltage, value: formatValueWithUnit('voltage', voltToDisplay), icon: <Zap size={14} className="text-solar-blue" /> });
      }
    }

    // 6. Current (Deduplicated per category)
    if (product.category === 'panels') {
      if (specsObj.impA) {
        list.push({ key: 'impA', label: isAr ? 'تيار التشغيل (Imp)' : 'Max Power Current (Imp)', value: formatValueWithUnit('impA', specsObj.impA), icon: <Power size={14} className="text-solar-warning" /> });
      } else if (specsObj.current) {
        list.push({ key: 'current', label: t.current, value: formatValueWithUnit('current', specsObj.current), icon: <Power size={14} className="text-solar-warning" /> });
      }
      if (specsObj.iscA && normSpecVal(specsObj.iscA) !== normSpecVal(specsObj.impA || specsObj.current)) {
        list.push({ key: 'iscA', label: isAr ? 'تيار الدائرة القصيرة (Isc)' : 'Short Circuit Current (Isc)', value: formatValueWithUnit('iscA', specsObj.iscA), icon: <Power size={14} className="text-solar-warning" /> });
      }
    } else if (product.category === 'inverters') {
      const curr = specsObj.current || specsObj.impA;
      if (curr) {
        list.push({ key: 'current', label: isAr ? 'أقصى تيار خرج (AC)' : 'Max Output Current (AC)', value: formatValueWithUnit('current', curr), icon: <Power size={14} className="text-solar-warning" /> });
      }
    } else {
      const currToDisplay = specsObj.current || specsObj.impA;
      if (currToDisplay) {
        list.push({ key: 'current', label: t.current, value: formatValueWithUnit('current', currToDisplay), icon: <Power size={14} className="text-solar-warning" /> });
      }
    }

    if (specsObj.maxContinuousDischargeCurrentA) {
      list.push({ key: 'maxContinuousDischargeCurrentA', label: isAr ? 'أقصى تيار تفريغ مستمر' : 'Max Continuous Discharge', value: formatValueWithUnit('maxContinuousDischargeCurrentA', specsObj.maxContinuousDischargeCurrentA), icon: <Power size={14} className="text-solar-warning" /> });
    }

    // 7. Type, Cell, Technology, Waveform
    if (specsObj.type) {
      list.push({ key: 'type', label: t.type, value: String(specsObj.type), icon: <Grid size={14} className="text-solar-accent" /> });
    }
    if (specsObj.cellType && specsObj.cellType !== specsObj.type) {
      list.push({ key: 'cellType', label: isAr ? 'نوع الخلايا' : 'Cell Type', value: String(specsObj.cellType), icon: <Cpu size={14} className="text-solar-blue" /> });
    }
    if (specsObj.technology && specsObj.technology !== specsObj.type) {
      list.push({ key: 'technology', label: isAr ? 'التقنية' : 'Technology', value: String(specsObj.technology), icon: <Cpu size={14} className="text-solar-accent" /> });
    }
    if (specsObj.productType && specsObj.productType !== specsObj.type) {
      list.push({ key: 'productType', label: isAr ? 'نوع المنتج' : 'Product Type', value: String(specsObj.productType), icon: <Grid size={14} className="text-solar-muted" /> });
    }
    if (specsObj.numberOfCells) {
      list.push({ key: 'numberOfCells', label: isAr ? 'عدد الخلايا' : 'Number of Cells', value: String(specsObj.numberOfCells), icon: <Grid size={14} className="text-solar-accent" /> });
    }
    if (specsObj.waveform) {
      list.push({ key: 'waveform', label: isAr ? 'شكل الموجة' : 'Waveform', value: String(specsObj.waveform), icon: <Activity size={14} className="text-solar-blue" /> });
    }

    // 8. Capacity & Storage
    if (specsObj.capacity) {
      list.push({ key: 'capacity', label: t.capacity, value: String(specsObj.capacity), icon: <Battery size={14} className="text-solar-warning" /> });
    }
    if (specsObj.capacityAh && !specsObj.capacity?.includes(String(specsObj.capacityAh))) {
      list.push({ key: 'capacityAh', label: isAr ? 'السعة (أمبير-ساعة)' : 'Capacity (Ah)', value: formatValueWithUnit('capacityAh', specsObj.capacityAh), icon: <Battery size={14} className="text-solar-warning" /> });
    }
    if (specsObj.nominalEnergyWh) {
      list.push({ key: 'nominalEnergyWh', label: isAr ? 'الطاقة الاسمية' : 'Nominal Energy', value: formatValueWithUnit('nominalEnergyWh', specsObj.nominalEnergyWh), icon: <Zap size={14} className="text-solar-warning" /> });
    }
    if (specsObj.cycleLife) {
      list.push({ key: 'cycleLife', label: isAr ? 'دورات الحياة (Cycle Life)' : 'Cycle Life', value: String(specsObj.cycleLife), icon: <Activity size={14} className="text-solar-success" /> });
    }

    // 9. Mechanical, Cables, Mounting
    if (specsObj.crossSection) {
      list.push({ key: 'crossSection', label: t.crossSection, value: formatValueWithUnit('crossSection', specsObj.crossSection), icon: <Ruler size={14} className="text-solar-accent" /> });
    }
    if (specsObj.cableLength || (product.category === 'cables' && specsObj.length)) {
      list.push({ key: 'cableLength', label: isAr ? 'طول الكابل' : 'Cable Length', value: formatValueWithUnit('cableLength', specsObj.cableLength || specsObj.length), icon: <Ruler size={14} className="text-solar-blue" /> });
    }
    if (specsObj.material) {
      list.push({ key: 'material', label: t.material, value: String(specsObj.material), icon: <Grid size={14} className="text-solar-accent" /> });
    }
    if (specsObj.ipRating) {
      list.push({ key: 'ipRating', label: t.ipRating, value: String(specsObj.ipRating), icon: <Shield size={14} className="text-solar-success" /> });
    }
    if (specsObj.poles) {
      list.push({ key: 'poles', label: t.poles, value: String(specsObj.poles), icon: <Grid size={14} className="text-solar-accent" /> });
    }
    if (specsObj.maxWind) {
      list.push({ key: 'maxWind', label: t.maxWind, value: formatValueWithUnit('maxWind', specsObj.maxWind), icon: <Zap size={14} className="text-solar-warning" /> });
    }
    if (specsObj.weight || specsObj.weightKg) {
      list.push({ key: 'weight', label: t.weight, value: formatValueWithUnit('weight', specsObj.weight || specsObj.weightKg), icon: <Ruler size={14} className="text-solar-muted" /> });
    }
    if (specsObj.frequencyHz) {
      list.push({ key: 'frequencyHz', label: isAr ? 'التردد' : 'Frequency', value: formatValueWithUnit('frequencyHz', specsObj.frequencyHz), icon: <Activity size={14} className="text-solar-blue" /> });
    }
    if (specsObj.maxPvOpenCircuitVoltageV) {
      list.push({ key: 'maxPvOpenCircuitVoltageV', label: isAr ? 'أقصى جهد PV (Voc)' : 'Max PV Voc', value: `${specsObj.maxPvOpenCircuitVoltageV} V`, icon: <Zap size={14} className="text-solar-blue" /> });
    }
    if (specsObj.maxPvArrayPowerW) {
      list.push({ key: 'maxPvArrayPowerW', label: isAr ? 'أقصى قدرة للألواح' : 'Max PV Array Power', value: `${specsObj.maxPvArrayPowerW} W`, icon: <Power size={14} className="text-solar-warning" /> });
    }
    if (specsObj.quantity) {
      list.push({ key: 'quantity', label: t.quantityValue, value: String(specsObj.quantity), icon: <Grid size={14} className="text-solar-accent" /> });
    }
    if (specsObj.color) {
      list.push({ key: 'color', label: t.color, value: String(specsObj.color), icon: <Grid size={14} className="text-solar-accent" /> });
    }

    // 10. Dynamic keys from specsObj not already covered
    const knownKeys = new Set([
      'power', 'powerKw', 'ratedPowerKw', 'surgePowerW', 'efficiency', 'peakEfficiency', 
      'warranty', 'dimensions', 'length', 'width', 'thickness', 'dimensionUnit', 'dimensionsMm', 
      'area', 'voltage', 'vmpV', 'vocV', 'nominalVoltage', 'acVoltageV', 'current', 'impA', 
      'iscA', 'maxContinuousDischargeCurrentA', 'type', 'cellType', 'technology', 'productType', 
      'numberOfCells', 'waveform', 'capacity', 'capacityAh', 'nominalEnergyWh', 'cycleLife', 
      'crossSection', 'cableLength', 'material', 'ipRating', 'poles', 'maxWind', 'weight', 
      'weightKg', 'frequencyHz', 'maxPvOpenCircuitVoltageV', 'maxPvArrayPowerW', 
      'pvMpptVoltageRangeV', 'mppt', 'mpptVoltageRange', 'quantity', 'color', 'description', 'notes'
    ]);

    Object.entries(specsObj).forEach(([k, v]) => {
      if (!knownKeys.has(k) && v !== undefined && v !== null && v !== '') {
        list.push({
          key: k,
          label: getSpecLabel(k),
          value: String(v),
          icon: <Grid size={14} className="text-solar-blue" />
        });
      }
    });

    return list;
  }, [product, isAr, t]);

  const productDescription = product.specs?.description || (product as any).description;

  // Find other products from the same supplier
  const supplierId = product.supplierId;
  const primarySupplierObj = product.suppliers?.[0];
  const resolvedPrimarySupplier = suppliers?.find(sup => sup.id === (primarySupplierObj?.id || supplierId)) || 
    ((primarySupplierObj?.id || supplierId) ? fetchedProfiles[primarySupplierObj?.id || supplierId] : null);
  const effectivePrimarySupplier = resolvedPrimarySupplier ? { ...primarySupplierObj, ...resolvedPrimarySupplier } : primarySupplierObj;
  const primarySupplierDisplayName = getSupplierDisplayName(effectivePrimarySupplier, isAr);

  const otherProducts = useMemo(() => {
    if (!supplierId) return [];
    const seen = new Set<string>();
    const currentId = String((product as any).product_id ?? product.id);
    const result: Product[] = [];
    for (const p of allProducts) {
      const pId = String((p as any).product_id ?? p.id);
      if (!pId || pId === currentId || seen.has(pId)) continue;
      if (String(p.supplierId) === String(supplierId)) {
        seen.add(pId);
        result.push(p);
        if (result.length >= 4) break;
      }
    }
    return result;
  }, [allProducts, product, supplierId]);

  const handleDownloadDatasheet = () => {
    if (!product.datasheetUrl) return;
    window.open(product.datasheetUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="pb-28 md:pb-10 max-w-7xl mx-auto px-0 w-full max-w-full box-border overflow-x-hidden"
    >
      <div className="flex items-center justify-between mb-4 sm:mb-6 w-full max-w-full box-border gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button 
            onClick={onBack} 
            className="flex items-center gap-1.5 text-solar-text hover:text-solar-blue transition font-black text-xs sm:text-sm bg-white border border-solar-border px-3 py-2 rounded-xl shadow-2xs active:scale-95 shrink-0"
          >
            <ArrowRight size={16} className={isAr ? '' : 'rotate-180'} />
            <span>{t.back}</span>
          </button>
          {isOwner && onEdit && (
            <button 
              onClick={() => onEdit(product)}
              className="flex items-center gap-1.5 text-solar-blue hover:text-solar-blue/80 transition font-black text-xs bg-solar-blue/10 px-3 py-2 rounded-xl border border-solar-blue/20 active:scale-95 shrink-0 cursor-pointer"
            >
              <Edit size={13} />
              <span>{isAr ? 'تعديل' : 'Edit'}</span>
            </button>
          )}
          {isOwner && onDelete && (
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 text-solar-danger hover:text-red-700 transition font-black text-xs bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20 active:scale-95 shrink-0 cursor-pointer"
            >
              <Trash2 size={13} />
              <span>{isAr ? 'حذف' : 'Delete'}</span>
            </button>
          )}
        </div>
        <span translate="no" className="text-[10px] font-black text-solar-muted bg-solar-card px-3 py-1.5 rounded-xl border border-solar-border shadow-2xs tracking-wider uppercase truncate max-w-[140px] sm:max-w-none notranslate">
          {product.brand}
        </span>
      </div>

      {/* Main Ordered Content: 1. Image -> 2. Name -> 3. Specs -> 4. Description -> 5. Supplier */}
      <div className="w-full max-w-5xl mx-auto space-y-6 sm:space-y-8 mb-12 sm:mb-16 box-border min-w-0">
        
        {/* 1. صورة المنتج (Product Image & Thumbnails) */}
        <div className="space-y-4 w-full max-w-full box-border min-w-0">
          <div className="relative group w-full max-w-full rounded-2xl sm:rounded-[36px] overflow-hidden box-border bg-white border-2 sm:border-4 border-white shadow-xl shadow-solar-blue/5 flex items-center justify-center p-2 sm:p-4">
            <img 
              src={selectedImage || product.image || DEFAULT_PRODUCT_IMAGE} 
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
              }}
              referrerPolicy="no-referrer" 
              className="w-full max-w-full h-auto max-h-[440px] sm:max-h-[500px] object-contain rounded-2xl sm:rounded-[30px] box-border" 
              alt={product.name} 
            />
            {user?.type !== 'admin' && (
              <div className="absolute top-3 sm:top-4 right-3 sm:right-4 flex gap-2">
                <button 
                  onClick={() => onWishlist(product)} 
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition shadow-xl active:scale-90 ${isWishlisted ? 'bg-red-500 text-white' : 'bg-white text-solar-muted hover:text-red-500'}`}
                  title={isWishlisted ? t.removeFromWishlist : t.saveToWishlist}
                  aria-label={isWishlisted ? t.removeFromWishlist : t.saveToWishlist}
                >
                  <Heart size={20} fill={isWishlisted ? 'currentColor' : 'none'} />
                </button>
                <button 
                  onClick={() => onCompare(product)} 
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition shadow-xl active:scale-90 ${isCompared(product.id) ? 'bg-solar-accent text-white' : 'bg-white text-solar-muted hover:text-solar-blue'}`}
                  aria-label={isAr ? 'مقارنة' : 'Compare'}
                >
                  <ArrowLeftRight size={20} />
                </button>
              </div>
            )}
          </div>

          {/* Additional product images gallery thumbnails */}
          {product.additionalImages && product.additionalImages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none w-full max-w-full box-border">
              {[product.image, ...product.additionalImages].map((imgUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImage(imgUrl)}
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden border-2 shrink-0 transition bg-white p-1 ${
                    (selectedImage || product.image) === imgUrl 
                      ? 'border-solar-blue ring-2 ring-solar-blue/30 shadow-md scale-105' 
                      : 'border-solar-border opacity-70 hover:opacity-100'
                  }`}
                >
                  <img 
                    src={imgUrl || DEFAULT_PRODUCT_IMAGE} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                    }}
                    alt="" 
                    className="w-full h-full object-contain" 
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. اسم المنتج (Product Name & Badges) */}
        <div className="bg-solar-card rounded-2xl sm:rounded-[32px] p-5 sm:p-7 md:p-8 border border-solar-border shadow-xs w-full max-w-full box-border min-w-0">
          <h1 translate="no" className="text-2xl sm:text-3xl lg:text-4xl font-black text-solar-text leading-tight mb-3 sm:mb-4 break-words [overflow-wrap:anywhere] [word-break:break-word] w-full max-w-full notranslate">
            {isAr ? product.nameAr : product.name}
          </h1>
          <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full max-w-full box-border">
            <span translate="no" className="bg-solar-blue text-white text-[10px] font-black px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-widest notranslate">{product.brand}</span>
            {product.suppliers?.[0]?.verified && (
              <span className="bg-solar-success text-white text-[10px] font-black px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-widest shadow-sm flex items-center gap-1">
                <CheckCircle2 size={12} />
                {isAr ? 'معتمد' : 'Verified'}
              </span>
            )}
            <span className="bg-solar-light text-solar-blue text-[10px] font-black px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-widest border border-solar-blue/10">{product.category}</span>
            <span className={`text-[10px] font-black px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-widest border border-current transition-colors ${
              product.status === 'out_of_stock' ? 'bg-red-50 text-red-600 border-red-200' : 
              product.status === 'limited' ? 'bg-amber-50 text-amber-600 border-amber-200' : 
              'bg-solar-success/10 text-solar-success border-solar-success/10'
            }`}>
              {t[product.status] || t.available}
            </span>
            <button
              type="button"
              onClick={() => onFilterSupplier(primarySupplierObj?.id || supplierId)}
              className="bg-solar-blue/10 hover:bg-solar-blue hover:text-white text-solar-blue text-[11px] font-black px-3 py-1 rounded-full border border-solar-blue/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title={isAr ? `عرض جميع منتجات المورد: ${primarySupplierDisplayName}` : `View all products by supplier: ${primarySupplierDisplayName}`}
            >
              <Building2 size={12} className="shrink-0" />
              <span>{t.supplier}: <strong className="font-black">{primarySupplierDisplayName}</strong></span>
            </button>
          </div>
          {/* Prominent Price & Energy Exchange Rate Card */}
          <div className="mt-4 pt-4 border-t border-solar-border/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-black text-solar-muted uppercase tracking-wider mb-0.5">
                {product.category === 'panels' && product.pricePerWatt ? (isAr ? 'السعر وفقاً لبورصة الطاقة اليوم' : 'Price based on Energy Exchange') : t.price}
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl font-black text-solar-blue">
                  {product.price.toLocaleString()} <span className="text-sm font-bold">{t.egp}</span>
                </span>
                {product.category === 'panels' && product.pricePerWatt && (
                  <span className="text-xs font-black text-solar-blue bg-solar-blue/10 px-2.5 py-1 rounded-lg border border-solar-blue/20 notranslate">
                    {product.pricePerWatt.toFixed(2)} {isAr ? 'ج.م / وات' : 'EGP/W'}
                  </span>
                )}
              </div>
            </div>

            {product.category === 'panels' && product.power && product.power > 0 && (
              <div className="bg-solar-light/80 px-3.5 py-2 rounded-xl border border-solar-border/60 text-right">
                <span className="text-[10px] font-bold text-solar-muted block">
                  {isAr ? 'قدرة اللوح المعتمدة' : 'Panel Power'}
                </span>
                <span className="text-xs sm:text-sm font-black text-solar-text">
                  {product.power} {t.watt}
                </span>
              </div>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-solar-border/40 text-solar-muted text-xs font-bold leading-none w-full max-w-full box-border">
              <div className="flex items-center text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={i < Math.round(averageRating) ? "fill-amber-500 text-amber-500" : "text-gray-300"}
                  />
                ))}
              </div>
              <span className="text-solar-text font-black text-sm">{averageRating}</span>
              <span>•</span>
              <span>{reviews.length} {isAr ? 'تقييم' : 'reviews'}</span>
            </div>
          )}
        </div>

        {/* Inverter Classification Card (Redesigned: Compact, Clean & Elegant) */}
        {product.category === 'inverters' && (() => {
          const inv = classifyInverter(product);
          const typeBadgeStyle = 
            inv.type === 'On-Grid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            inv.type === 'Hybrid' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
            inv.type === 'Off-Grid' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-cyan-50 text-cyan-700 border-cyan-200';

          return (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs w-full max-w-full box-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-solar-blue flex items-center justify-center shrink-0 border border-blue-100/80">
                    <Cpu size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      {isAr ? 'تصنيف الإنفرتر المعتمد' : 'Certified Inverter Classification'}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">
                      {isAr ? 'وفق المعايير القياسية وكود الربط' : 'Standard verified technical classification'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black border shadow-2xs ${typeBadgeStyle}`}>
                    {inv.type}
                  </span>
                  <span className="bg-slate-50 text-slate-700 border border-slate-200/90 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold">
                    {inv.phase === 'Three Phase' ? (isAr ? '3 فاز (ثلاثي الطور)' : '3-Phase') : (isAr ? '1 فاز (أحادي الطور)' : 'Single Phase')}
                  </span>
                  <span className="bg-blue-50/70 text-solar-blue border border-blue-200/70 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold">
                    {inv.power_range}
                  </span>
                </div>
              </div>

              {/* Sub-bar with target applications & battery status */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 text-slate-600">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400">
                  {isAr ? 'مجال الاستخدام:' : 'Applications:'}
                </span>
                {inv.application.map(app => (
                  <span key={app} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/70 text-slate-600">
                    {app}
                  </span>
                ))}
                {inv.battery_support ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <Battery size={11} />
                    <span>{isAr ? 'يدعم بطاريات التخزين' : 'Battery Supported'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-500">
                    <CheckCircle2 size={11} className="text-emerald-500" />
                    <span>{isAr ? 'متصل بالشبكة (توفير الفاتورة)' : 'Grid-Tied (Bill Reduction)'}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Technical & Engineering Specifications Section (Compact, Organized Grid) */}
        {(() => {
          const isInverter = product.category === 'inverters';
          const inv = isInverter ? classifyInverter(product) : null;
          const specsObj = product.specs || {};

          // For inverters: curated primary specifications (8-item compact grid)
          const primaryInverterSpecs = inv ? [
            {
              key: 'power',
              icon: <Power size={13} className="text-solar-blue" />,
              label: isAr ? 'القدرة الاسمية' : 'Rated Power',
              value: `${inv.rated_power_kw} kW`
            },
            {
              key: 'efficiency',
              icon: <Zap size={13} className="text-amber-500" />,
              label: isAr ? 'الكفاءة القصوى' : 'Max Efficiency',
              value: typeof inv.efficiency_percent === 'number' ? `${inv.efficiency_percent}%` : (product.efficiency ? `${product.efficiency}%` : (isAr ? 'غير محدد' : 'Unknown'))
            },
            {
              key: 'mppt_count',
              icon: <Cpu size={13} className="text-solar-blue" />,
              label: isAr ? 'متتبعات MPPT' : 'MPPT Trackers',
              value: inv.mppt_count !== 'Unknown' && inv.mppt_count ? `${inv.mppt_count} MPPT` : (isAr ? 'غير محدد' : 'Unknown')
            },
            {
              key: 'voltage_range',
              icon: <Activity size={13} className="text-purple-600" />,
              label: isAr ? 'نطاق جهد MPPT' : 'MPPT Voltage',
              value: inv.mppt_voltage_range_v !== 'Unknown' && inv.mppt_voltage_range_v ? `${inv.mppt_voltage_range_v}` : (isAr ? 'غير محدد' : 'Unknown')
            },
            {
              key: 'phase',
              icon: <Layers size={13} className="text-solar-blue" />,
              label: isAr ? 'الطور الكهربائي' : 'Electrical Phase',
              value: inv.phase === 'Three Phase' ? (isAr ? '3 فاز (ثلاثي الطور)' : '3-Phase') : (isAr ? '1 فاز (أحادي الطور)' : 'Single Phase')
            },
            {
              key: 'grid_type',
              icon: <Grid size={13} className="text-emerald-600" />,
              label: isAr ? 'نوع النظام' : 'Grid Connection',
              value: inv.type
            },
            {
              key: 'warranty',
              icon: <Shield size={13} className="text-emerald-600" />,
              label: isAr ? 'الضمان المعتمد' : 'Warranty',
              value: product.warranty ? `${product.warranty} ${t.years}` : (inv.warranty_years && inv.warranty_years !== 'Unknown' ? `${inv.warranty_years} ${t.years}` : (isAr ? 'معتمد' : 'Standard'))
            },
            {
              key: 'max_pv_voltage',
              icon: <Zap size={13} className="text-solar-blue" />,
              label: isAr ? 'أقصى جهد دخل DC' : 'Max PV Voltage',
              value: inv.max_pv_voltage_v && inv.max_pv_voltage_v !== 'Unknown' ? `${inv.max_pv_voltage_v} V` : (isAr ? 'غير محدد' : 'Unknown')
            }
          ] : [];

          // Advanced specifications organized in expandable categories
          const advancedElectrical = inv ? [
            inv.max_pv_power_kwp && inv.max_pv_power_kwp !== 'Unknown' ? { label: isAr ? 'أقصى قدرة ألواح PV' : 'Max PV Array Power', value: `${inv.max_pv_power_kwp} kWp` } : null,
            inv.max_ac_power_kw && inv.max_ac_power_kw !== 'Unknown' ? { label: isAr ? 'أقصى قدرة AC' : 'Max AC Power', value: `${inv.max_ac_power_kw} kVA / kW` } : null,
            inv.max_pv_current_a && inv.max_pv_current_a !== 'Unknown' ? { label: isAr ? 'أقصى تيار دخل DC' : 'Max PV Input Current', value: `${inv.max_pv_current_a} A` } : null,
            inv.max_ac_output_current_a && inv.max_ac_output_current_a !== 'Unknown' ? { label: isAr ? 'أقصى تيار خرج AC' : 'Max AC Output Current', value: `${inv.max_ac_output_current_a} A` } : (specsObj.current ? { label: isAr ? 'أقصى تيار خرج AC' : 'Max AC Output Current', value: `${specsObj.current} A` } : null),
            inv.ac_voltage_v && inv.ac_voltage_v !== 'Unknown' ? { label: isAr ? 'جهد الخرج AC الاسمي' : 'Nominal AC Voltage', value: `${inv.ac_voltage_v}` } : (specsObj.acVoltageV ? { label: isAr ? 'جهد الخرج AC' : 'AC Voltage', value: `${specsObj.acVoltageV}` } : null),
            inv.frequency_hz && inv.frequency_hz !== 'Unknown' ? { label: isAr ? 'تردد الشبكة' : 'Grid Frequency', value: `${inv.frequency_hz}` } : (specsObj.frequencyHz ? { label: isAr ? 'تردد الشبكة' : 'Grid Frequency', value: `${specsObj.frequencyHz} Hz` } : null),
            specsObj.waveform ? { label: isAr ? 'شكل الموجة' : 'Waveform', value: String(specsObj.waveform) } : null,
          ].filter(Boolean) as Array<{ label: string; value: string }> : [];

          const advancedBattery = (inv && inv.battery_support) ? [
            inv.battery_voltage_v && inv.battery_voltage_v !== 'Unknown' ? { label: isAr ? 'جهد البطارية الاسمي' : 'Nominal Battery Voltage', value: `${inv.battery_voltage_v}` } : null,
            inv.battery_type && inv.battery_type !== 'Unknown' ? { label: isAr ? 'نوع البطاريات المدعومة' : 'Compatible Battery Type', value: `${inv.battery_type}` } : null,
            inv.battery_voltage_range && inv.battery_voltage_range !== 'Unknown' ? { label: isAr ? 'فئة جهد البطارية' : 'Battery Voltage Class', value: isAr ? (inv.battery_voltage_range === 'High Voltage' ? 'جهد عالي (HV)' : 'جهد منخفض (LV)') : inv.battery_voltage_range } : null,
            inv.max_charging_current_a && inv.max_charging_current_a !== 'Unknown' ? { label: isAr ? 'أقصى تيار شحن' : 'Max Charging Current', value: `${inv.max_charging_current_a} A` } : null,
            inv.max_discharging_current_a && inv.max_discharging_current_a !== 'Unknown' ? { label: isAr ? 'أقصى تيار تفريغ' : 'Max Discharging Current', value: `${inv.max_discharging_current_a} A` } : null,
          ].filter(Boolean) as Array<{ label: string; value: string }> : [];

          const advancedMechanical = inv ? [
            specsObj.ipRating ? { label: isAr ? 'درجة الحماية' : 'Ingress Protection', value: String(specsObj.ipRating) } : null,
            specsObj.dimensionsMm ? { label: isAr ? 'الأبعاد' : 'Dimensions', value: String(specsObj.dimensionsMm) } : (product.length && product.width ? { label: isAr ? 'الأبعاد' : 'Dimensions', value: `${product.length} × ${product.width}${product.thickness ? ` × ${product.thickness}` : ''} ${product.dimensionUnit || 'mm'}` } : null),
            specsObj.weightKg || specsObj.weight ? { label: isAr ? 'الوزن الصافي' : 'Net Weight', value: `${specsObj.weightKg || specsObj.weight} kg` } : null,
            specsObj.surgePowerW ? { label: isAr ? 'قدرة التحمل اللحظية' : 'Surge Power', value: `${specsObj.surgePowerW} W` } : null,
            inv.motor_power_range && inv.motor_power_range !== 'Unknown' ? { label: isAr ? 'قدرة محرك الطلمبة' : 'Pump Motor Power', value: `${inv.motor_power_range}` } : null,
            inv.motor_voltage_v && inv.motor_voltage_v !== 'Unknown' ? { label: isAr ? 'جهد محرك الطلمبة' : 'Pump Motor Voltage', value: `${inv.motor_voltage_v}` } : null,
          ].filter(Boolean) as Array<{ label: string; value: string }> : [];

          const totalAdvancedSpecs = advancedElectrical.length + advancedBattery.length + advancedMechanical.length;

          // For non-inverter products: use detailedSpecs with primary vs advanced breakdown
          const nonInverterPrimary = !isInverter ? detailedSpecs.slice(0, 8) : [];
          const nonInverterAdvanced = !isInverter ? detailedSpecs.slice(8) : [];

          return (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs w-full max-w-full box-border min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 sm:pb-4 border-b border-slate-100 gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-solar-blue flex items-center justify-center shrink-0 border border-blue-100/80">
                    <Zap size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      {isAr ? 'المواصفات الفنية والهندسية المعتمدة' : 'Certified Technical & Engineering Specifications'}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">
                      {isAr ? 'بيانات معتمدة من الكتالوج الرسمي وداتا شيت الشركة المصنعة' : 'Verified data from official manufacturer catalog and datasheet'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <span className="text-[10px] sm:text-[11px] font-bold text-solar-blue bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                    {isInverter ? primaryInverterSpecs.length + totalAdvancedSpecs : detailedSpecs.length} {isAr ? 'مواصفة تقنية' : 'technical specs'}
                  </span>
                  {product.datasheetUrl && (
                    <button 
                      type="button"
                      onClick={handleDownloadDatasheet}
                      className="bg-solar-blue hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[11px] font-black transition flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Download size={13} />
                      <span>{t.downloadPDF}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Organized Grid (Primary Specifications) */}
              {isInverter ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 mt-3.5 w-full box-border">
                  {primaryInverterSpecs.map((spec) => (
                    <div 
                      key={spec.key} 
                      className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/80 hover:border-solar-blue/40 rounded-xl p-2.5 sm:p-3 transition-colors flex flex-col justify-between min-w-0"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 mb-1">
                        <span className="shrink-0">{spec.icon}</span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 truncate block">
                          {spec.label}
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-black text-slate-900 truncate block">
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : detailedSpecs.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5 mt-3.5 w-full box-border">
                  {nonInverterPrimary.map((spec) => (
                    <div 
                      key={spec.key} 
                      className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200/80 hover:border-solar-blue/40 rounded-xl p-2.5 sm:p-3 transition-colors flex flex-col justify-between min-w-0"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 mb-1">
                        <span className="shrink-0">{spec.icon || <Grid size={13} className="text-solar-blue" />}</span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 truncate block">
                          {spec.label}
                        </span>
                      </div>
                      <span className="text-xs sm:text-sm font-black text-slate-900 truncate block">
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-xs font-bold">
                  {isAr ? 'جاري تحديث واستكمال المواصفات الفنية لهذا المنتج من الكتالوج المعتمد.' : 'Technical specifications for this product are currently being updated.'}
                </div>
              )}

              {/* Expandable Advanced Specifications (Requirements 5) */}
              {isInverter && totalAdvancedSpecs > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSpecs(!showAdvancedSpecs)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200/90 hover:border-solar-blue/40 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center justify-between text-start cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders size={13} className="text-solar-blue shrink-0" />
                      <span className="text-xs font-bold text-slate-800">
                        {isAr ? 'المواصفات الفنية المتقدمة والتفصيلية' : 'Advanced Technical Specifications'}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-slate-500">
                        {totalAdvancedSpecs} {isAr ? 'مواصفة' : 'specs'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-solar-blue">
                      <span>{showAdvancedSpecs ? (isAr ? 'إخفاء' : 'Collapse') : (isAr ? 'عرض المزيد' : 'Expand')}</span>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${showAdvancedSpecs ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {showAdvancedSpecs && (
                    <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      {/* Electrical & PV Specs */}
                      {advancedElectrical.length > 0 && (
                        <div className="p-3 rounded-xl bg-slate-50/50 border border-slate-200/70">
                          <span className="text-[11px] font-black text-slate-700 block mb-2 flex items-center gap-1.5">
                            <Zap size={12} className="text-solar-blue" />
                            {isAr ? 'البيانات الكهربائية ودخل الطاقة الشمسية (DC/AC)' : 'Electrical & PV Array Specifications (DC/AC)'}
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {advancedElectrical.map((item, idx) => (
                              <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-2 min-w-0">
                                <span className="text-[10px] font-semibold text-slate-500 truncate block">{item.label}</span>
                                <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Battery & Storage Specs */}
                      {advancedBattery.length > 0 && (
                        <div className="p-3 rounded-xl bg-slate-50/50 border border-slate-200/70">
                          <span className="text-[11px] font-black text-slate-700 block mb-2 flex items-center gap-1.5">
                            <Battery size={12} className="text-emerald-600" />
                            {isAr ? 'نظام البطاريات والشحن والتخزين' : 'Battery Storage & Charging System'}
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {advancedBattery.map((item, idx) => (
                              <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-2 min-w-0">
                                <span className="text-[10px] font-semibold text-slate-500 truncate block">{item.label}</span>
                                <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mechanical & Protection Specs */}
                      {advancedMechanical.length > 0 && (
                        <div className="p-3 rounded-xl bg-slate-50/50 border border-slate-200/70">
                          <span className="text-[11px] font-black text-slate-700 block mb-2 flex items-center gap-1.5">
                            <Shield size={12} className="text-purple-600" />
                            {isAr ? 'الحماية والمواصفات الميكانيكية' : 'Mechanical & Ingress Protection'}
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {advancedMechanical.map((item, idx) => (
                              <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-2 min-w-0">
                                <span className="text-[10px] font-semibold text-slate-500 truncate block">{item.label}</span>
                                <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Non-inverter Expandable Specs (if more than 8 specs) */}
              {!isInverter && nonInverterAdvanced.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSpecs(!showAdvancedSpecs)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200/90 hover:border-solar-blue/40 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center justify-between text-start cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2">
                      <Sliders size={13} className="text-solar-blue shrink-0" />
                      <span className="text-xs font-bold text-slate-800">
                        {isAr ? 'مواصفات إضافية وتفصيلية' : 'Additional Detailed Specifications'}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-slate-500">
                        {nonInverterAdvanced.length} {isAr ? 'مواصفة' : 'specs'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-solar-blue">
                      <span>{showAdvancedSpecs ? (isAr ? 'إخفاء' : 'Collapse') : (isAr ? 'عرض المزيد' : 'Expand')}</span>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${showAdvancedSpecs ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {showAdvancedSpecs && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5 mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      {nonInverterAdvanced.map((spec) => (
                        <div 
                          key={spec.key} 
                          className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex flex-col justify-between min-w-0"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 mb-1">
                            <span className="shrink-0">{spec.icon || <Grid size={13} className="text-solar-blue" />}</span>
                            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate block">
                              {spec.label}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-slate-900 truncate block">
                            {spec.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Datasheet Callout if available */}
              {product.datasheetUrl && (
                <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-blue-50/50 border border-blue-200/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-center sm:text-start">
                    <FileText className="text-solar-blue shrink-0 hidden sm:block" size={20} />
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900">
                        {isAr ? 'الداتا شيت الفنية الأصلية للمنتج (PDF)' : 'Original Technical Datasheet (PDF)'}
                      </h4>
                      <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 mt-0.5">
                        {isAr ? 'تنزيل ملف المواصفات الهندسية ومخططات التشغيل المعتمدة' : 'Download official engineering specifications and technical diagrams'}
                      </p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={handleDownloadDatasheet}
                    className="bg-solar-blue hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-2xs transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>{t.downloadPDF}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. وصف المنتج وتفاصيله (Product Description) */}
        {productDescription && (
          <div className="bg-solar-card rounded-2xl sm:rounded-[32px] p-5 sm:p-7 md:p-8 border border-solar-border shadow-sm w-full max-w-full box-border min-w-0">
            <h3 className="text-base sm:text-lg font-black text-solar-text mb-3 sm:mb-4 flex items-center gap-2">
              <Info size={20} className="text-solar-blue shrink-0" />
              <span>{isAr ? 'وصف المنتج وتفاصيله' : 'Product Description'}</span>
            </h3>
            <p className="text-xs sm:text-sm font-medium text-solar-text/80 leading-relaxed whitespace-pre-wrap">
              {productDescription}
            </p>
          </div>
        )}

        {/* 5. المورد (Supplier Information, Pricing & Action Buttons) */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl sm:rounded-[36px] p-5 sm:p-8 md:p-10 border-2 border-white shadow-sm w-full max-w-full box-border min-w-0">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-solar-blue/10 text-solar-blue flex items-center justify-center shrink-0">
              <Building2 size={22} />
            </div>
            <div>
              <h4 className="text-base sm:text-xl font-black text-solar-text">
                {t.supplier}
              </h4>
              <p className="text-xs font-bold text-solar-muted mt-0.5">
                {isAr ? 'بيانات المورد المعتمد والأسعار المتاحة' : 'Verified supplier information and current pricing'}
              </p>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 w-full max-w-full box-border min-w-0">
            {product.suppliers.map((s, i) => {
              const supId = s.id || product.supplierId;
              const matchedSup = suppliers?.find(sup => sup.id === supId) || (supId ? fetchedProfiles[supId] : null);
              const effectiveSupplier = matchedSup ? { ...s, ...matchedSup } : s;
              const displayName = getSupplierDisplayName(effectiveSupplier, isAr);
              const avatarInitial = getSupplierAvatarInitial(effectiveSupplier, isAr);
              const displayLocation = effectiveSupplier.location || s.location || (isAr ? 'القاهرة، مصر' : 'Cairo, Egypt');

              return (
                <div 
                  key={i} 
                  onClick={() => onFilterSupplier(supId)}
                  className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[28px] border border-solar-border hover:border-solar-blue transition-all cursor-pointer group shadow-xs hover:shadow-lg hover:shadow-solar-blue/10 w-full max-w-full box-border min-w-0 overflow-hidden"
                >
                  <div className="flex justify-between items-center mb-3 sm:mb-4 gap-2 min-w-0">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-solar-bg border border-solar-border flex items-center justify-center font-black text-solar-blue overflow-hidden shrink-0 shadow-sm">
                        {effectiveSupplier.profileImage || effectiveSupplier.avatar || s.profileImage || s.avatar ? (
                          <img 
                            src={effectiveSupplier.profileImage || effectiveSupplier.avatar || s.profileImage || s.avatar} 
                            alt={displayName} 
                            className="w-full h-full rounded-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-sm sm:text-base font-black text-solar-blue">
                            {avatarInitial}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-solar-text group-hover:text-solar-blue transition truncate text-sm sm:text-base">
                          {displayName}
                        </div>
                        <div className="text-[11px] font-bold text-solar-muted flex items-center gap-1 truncate mt-0.5">
                          <MapPin size={11} className="shrink-0" />
                          <span className="truncate">{displayLocation}</span>
                        </div>
                      </div>
                    </div>
                    {(effectiveSupplier.verified ?? s.verified) && (
                      <div className="flex items-center gap-1 text-solar-success bg-solar-success/10 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0">
                        <CheckCircle2 size={12} />
                        <span>{t.verified}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-solar-border/50 gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black text-solar-muted uppercase tracking-widest leading-none mb-1">{t.price}</span>
                      <span className="text-xl sm:text-2xl font-black text-solar-blue truncate">{s.price.toLocaleString()} <span className="text-xs">{t.egp}</span></span>
                    </div>
                    <div className="text-[10px] font-bold text-solar-muted text-right shrink-0">
                      {t.lastUpdate}: {formatDateOnly(s.lastUpdate)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8 w-full max-w-full box-border min-w-0">
            <button 
              onClick={() => {
                const message = isAr 
                  ? `مرحباً، أنا مهتم بطلب / الاستفسار عن منتج: ${product.nameAr || product.name}` 
                  : `Hi, I am interested in ordering/inquiring about: ${product.name}`;
                window.open(getSupplierWhatsAppUrl(message), '_blank');
              }}
              className="w-full sm:flex-[2] bg-solar-blue text-white py-4 sm:py-4.5 px-4 rounded-2xl sm:rounded-[20px] font-black shadow-xl shadow-solar-blue/25 transition hover:bg-opacity-90 active:scale-95 text-sm sm:text-base flex items-center justify-center gap-2 box-border min-w-0 cursor-pointer"
            >
              <span className="truncate">{t.contactSupplier}</span>
              <span className="text-xs font-normal opacity-80 shrink-0" dir="ltr">({SUPPLIER_CONTACT_PHONE_DISPLAY})</span>
            </button>
            <button 
              onClick={() => onCompare(product)} 
              className={`w-full sm:flex-1 py-3.5 sm:py-4 px-4 border font-black transition active:scale-95 flex items-center justify-center rounded-2xl sm:rounded-[20px] box-border min-w-0 cursor-pointer ${isCompared(product.id) ? 'bg-solar-accent border-solar-accent text-white' : 'bg-white border-solar-border text-solar-muted hover:text-solar-text'}`}
              aria-label={isAr ? 'مقارنة' : 'Compare'}
            >
              <ArrowLeftRight size={20} />
              <span className="ms-2 text-xs font-black">{isAr ? 'مقارنة' : 'Compare'}</span>
            </button>
          </div>
        </div>

      </div>

      {/* Dynamic Reviews and Rating Section */}
      <div className="mt-12 sm:mt-16 bg-solar-card rounded-2xl sm:rounded-[40px] p-4 sm:p-8 md:p-12 border border-solar-border shadow-sm w-full max-w-full box-border min-w-0">
        <div className="flex flex-col lg:flex-row gap-8 sm:gap-12 w-full max-w-full box-border min-w-0">
          {/* Column 1: Rating Summary Stats */}
          <div className="w-full lg:w-1/3 flex flex-col justify-center items-center lg:items-start text-center lg:text-left lg:border-r lg:border-solar-border/50 pb-6 lg:pb-0 lg:pe-8 dir-neutral max-w-full box-border min-w-0">
            <h3 className="text-lg sm:text-xl font-black text-solar-text mb-3 sm:mb-4 uppercase tracking-wider flex items-center gap-2 justify-center lg:justify-start">
              <Star className="text-amber-500 fill-amber-500 shrink-0" size={20} />
              <span>{isAr ? 'التقييمات والآراء' : 'Reviews & Ratings'}</span>
            </h3>
            
            <div className="flex items-baseline gap-2 mt-1 sm:mt-2 justify-center lg:justify-start">
              <span className="text-4xl sm:text-6xl font-black text-solar-text">{averageRating > 0 ? averageRating : '0.0'}</span>
              <span className="text-solar-muted font-bold">/ 5.0</span>
            </div>

            <div className="flex items-center text-amber-500 mt-3 mb-2 justify-center lg:justify-start gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={20}
                  className={(averageRating > 0 && i < Math.round(averageRating)) ? "fill-amber-500 text-amber-500" : "text-gray-200"}
                />
              ))}
            </div>

            <p className="text-xs font-bold text-solar-muted uppercase mt-2">
              {reviews.length} {isAr ? 'تقييمات موثقة من العملاء' : 'verified customer reviews'}
            </p>

            {/* Rating distribution breakdown */}
            <div className="w-full mt-4 sm:mt-6 space-y-2 max-w-full sm:max-w-xs box-border">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = reviews.filter((r) => r.rating === stars).length;
                const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-2 sm:gap-3 text-xs font-bold text-solar-muted w-full max-w-full box-border">
                    <span className="w-3 text-right">{stars}</span>
                    <Star size={12} className="fill-amber-500 text-amber-500 inline shrink-0" />
                    <div className="flex-1 h-2 bg-solar-bg rounded-full overflow-hidden border border-solar-border/30 min-w-0">
                      <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <span className="w-8 text-right font-black">{percentage.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Leaving feedback and reviews showcase */}
          <div className="flex-1 space-y-6 sm:space-y-10 w-full max-w-full box-border min-w-0">
            {/* Feedback Form: Only shown for authenticated users */}
            <div className="w-full max-w-full box-border min-w-0">
              {user ? (
                <form onSubmit={handleReviewSubmit} className="bg-solar-bg p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[32px] border border-solar-border/60 w-full max-w-full box-border min-w-0">
                  <h4 className="text-sm sm:text-base font-black text-solar-text mb-3 sm:mb-4 flex items-center gap-2">
                    <MessageSquare size={18} className="text-solar-blue shrink-0" />
                    <span>{isAr ? 'شاركنا بتجربتك ورأيك' : 'Share your feedback'}</span>
                  </h4>

                  {/* Dynamic interactive star selector */}
                  <div className="flex items-center gap-2 mb-4 sm:mb-6 flex-wrap">
                    <span className="text-xs font-black text-solar-muted uppercase tracking-wider">
                      {isAr ? 'تقييمك للمنتج:' : 'Your Rating:'}
                    </span>
                    <div className="flex gap-1" dir="ltr">
                      {[1, 2, 3, 4, 5].map((starVal) => {
                        const isHighlighted = hoverRating !== null ? starVal <= hoverRating : starVal <= newRating;
                        return (
                          <button
                            type="button"
                            key={starVal}
                            onClick={() => setNewRating(starVal)}
                            onMouseEnter={() => setHoverRating(starVal)}
                            onMouseLeave={() => setHoverRating(null)}
                            className="text-amber-500 transition duration-150 transform hover:scale-125 focus:outline-none"
                            aria-label={`Rate ${starVal} stars`}
                          >
                            <Star
                              size={24}
                              className={isHighlighted ? "fill-amber-500 text-amber-500" : "text-gray-300"}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Text area inside a sleek layout */}
                  <div className="relative w-full max-w-full box-border">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder={isAr ? 'اكتب مراجعتك هنا بالتفصيل (كفاءة الأداء، عيوب المنتج، الضمان المالي...)' : 'Write your comprehensive feedback here (efficiency, material quality, delivery time...)'}
                      className="w-full max-w-full h-28 sm:h-32 px-4 sm:px-5 py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-white border border-solar-border focus:border-solar-blue focus:ring-1 focus:ring-solar-blue focus:outline-none text-xs sm:text-sm transition-all shadow-inner placeholder-solar-muted/70 box-border"
                      maxLength={1000}
                    />
                    <div className="absolute bottom-3 right-4 text-[10px] font-mono text-solar-muted">
                      {newComment.length} / 1000
                    </div>
                  </div>

                  {reviewError && (
                    <p className="text-red-500 text-xs font-black mt-2 flex items-center gap-1">
                      ⚠️ {reviewError}
                    </p>
                  )}

                  <div className="flex justify-end mt-3 sm:mt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto bg-solar-blue text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black shadow-lg shadow-solar-blue/20 transition active:scale-95 disabled:opacity-50 hover:bg-opacity-90 flex items-center justify-center gap-2 text-xs sm:text-sm"
                    >
                      {isSubmitting ? (isAr ? 'جاري الإرسال...' : 'Submitting...') : (isAr ? 'إرسال التقييم' : 'Submit Review')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-solar-bg p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-[32px] border-2 border-dashed border-solar-border text-center w-full max-w-full box-border">
                  <h4 className="text-xs sm:text-sm font-black text-solar-muted uppercase tracking-widest mb-2">
                    {isAr ? 'هل قمت بشراء هذا المنتج أو تجربته؟' : 'Have you tried or purchased this product?'}
                  </h4>
                  <p className="text-xs font-bold text-solar-muted mb-4 max-w-sm mx-auto">
                    {isAr ? 'يرجى تسجيل الدخول أو إعداد حساب لتتمكن من إضافة تقييمك ومساعدة الآخرين.' : 'Please register or sign in to your account with Google or Email to leave feedback.'}
                  </p>
                  <div className="inline-block bg-solar-blue-light border border-solar-blue/20 text-solar-blue font-black px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs uppercase cursor-default max-w-full">
                    {isAr ? 'يرجى تسجيل الدخول من أعلى الصفحة لكتابة تقييم' : 'Please Sign In From Top Bar To Write Review'}
                  </div>
                </div>
              )}
            </div>

            {/* List of Reviews Panel */}
            <div className="space-y-4 sm:space-y-6 w-full max-w-full box-border min-w-0">
              <h4 className="text-xs sm:text-sm font-black text-solar-muted uppercase tracking-widest flex items-center gap-2">
                <MessageSquare size={14} className="text-solar-blue shrink-0" />
                <span>{isAr ? 'آراء وتوصيات مجتمع الطاقة' : 'Community Feedbacks'} ({reviews.length})</span>
              </h4>

              {reviews.length === 0 ? (
                <div className="text-center py-8 sm:py-10 bg-solar-bg/50 rounded-2xl sm:rounded-3xl border border-solar-border/30 px-4">
                  <p className="text-xs font-bold text-solar-muted">
                    {isAr ? 'لا توجد تقييمات لهذا المنتج بعد. كن أول من يبدي رأيه!' : 'No reviews left for this product yet. Be the first to share your thoughts!'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4 w-full max-w-full box-border min-w-0">
                  <AnimatePresence>
                    {reviews.map((r, index) => {
                      const isMyReview = user && user.uid === r.userId;
                      const initials = r.userName ? r.userName.charAt(0).toUpperCase() : '?';
                      return (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[28px] border border-solar-border shadow-sm flex gap-3 sm:gap-4 hover:shadow-md transition w-full max-w-full box-border min-w-0"
                        >
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-solar-blue/10 text-solar-blue border border-solar-blue/25 flex items-center justify-center font-black shrink-0 text-xs sm:text-sm">
                            {initials}
                          </div>
                          
                          <div className="flex-1 min-w-0 max-w-full">
                            <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                              <h5 className="font-black text-solar-text text-xs sm:text-sm truncate min-w-0">{r.userName}</h5>
                              <span className="text-[10px] font-bold text-solar-muted shrink-0">
                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                              </span>
                            </div>

                            <div className="flex items-center text-amber-500 mb-2 gap-0.5" dir="ltr">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  size={12}
                                  className={i < r.rating ? "fill-amber-500 text-amber-500" : "text-gray-200"}
                                />
                              ))}
                            </div>

                            <p className="text-xs font-bold text-solar-text leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] w-full max-w-full">
                              {r.comment}
                            </p>

                            {isMyReview && (
                              <div className="flex justify-end mt-2">
                                <button
                                  onClick={() => handleReviewDelete(r.id)}
                                  className="text-[10px] font-black text-red-500 hover:underline hover:text-red-600 transition"
                                >
                                  {isAr ? 'حذف التقييم' : 'Delete Review'}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {otherProducts.length > 0 && (
        <div className="mt-12 sm:mt-20 w-full max-w-full box-border min-w-0">
          <div className="flex items-center justify-between mb-6 sm:mb-8 gap-2">
            <h3 className="text-lg sm:text-2xl font-black text-solar-text flex items-center gap-2 sm:gap-3 truncate">
              <Grid className="text-solar-blue shrink-0" size={22} />
              <span className="truncate">{t.moreFromSupplier}</span>
            </h3>
            <button 
              onClick={() => onFilterSupplier(supplierId)}
              className="text-xs font-black text-solar-blue hover:underline uppercase tracking-widest shrink-0"
            >
              {t.viewAll}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full max-w-full box-border min-w-0">
            {otherProducts.map(p => (
              <ProductCard 
                key={p.id}
                product={p}
                lang={lang}
                onClick={() => onProductClick(p)}
                onCompare={(e) => {
                  e.stopPropagation();
                  onCompare(p);
                }}
                onWishlist={(e) => {
                  e.stopPropagation();
                  onWishlist(p);
                }}
                onEdit={(e, product) => {
                  e.stopPropagation();
                  if (onEdit) onEdit(product);
                }}
                isCompared={isCompared(p.id)}
                isWishlisted={isInWishlist(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile-First Sticky Action Bar */}
      <div 
        aria-label="Mobile Product Actions"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-solar-border/70 px-4 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] flex items-center justify-between gap-2.5 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] w-full max-w-full box-border overflow-hidden"
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-bold text-solar-muted leading-tight">{t.price}</span>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base sm:text-lg font-black text-solar-blue truncate">
              {product.price.toLocaleString()} <span className="text-[11px] font-bold">{t.egp}</span>
            </span>
            {product.category === 'panels' && product.pricePerWatt && (
              <span className="text-[10px] font-bold text-solar-muted bg-solar-light px-1.5 py-0.5 rounded border border-solar-border/70 notranslate">
                {product.pricePerWatt.toFixed(2)} {isAr ? 'ج.م/وات' : 'EGP/W'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={() => onCompare(product)}
            className={`w-10 h-10 border font-black transition active:scale-95 flex items-center justify-center rounded-xl ${isCompared(product.id) ? 'bg-solar-accent border-solar-accent text-white' : 'bg-solar-light border-solar-border text-solar-muted'}`}
            title={isAr ? 'مقارنة' : 'Compare'}
            aria-label="Compare"
          >
            <ArrowLeftRight size={17} />
          </button>
          <button 
            onClick={() => {
              const message = isAr 
                ? `مرحباً، أنا مهتم بطلب / الاستفسار عن منتج: ${product.nameAr || product.name}` 
                : `Hi, I am interested in ordering/inquiring about: ${product.name}`;
              window.open(getSupplierWhatsAppUrl(message), '_blank');
            }}
            className="bg-solar-blue text-white px-3.5 sm:px-4 py-2.5 rounded-xl font-black shadow-md shadow-solar-blue/20 transition active:scale-95 text-xs flex items-center gap-1.5"
          >
            <span>{t.contactSupplier}</span>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-solar-card w-full max-w-md rounded-3xl p-6 sm:p-8 border border-solar-border shadow-2xl relative text-left"
            >
              <button 
                onClick={() => !isDeleting && setShowDeleteModal(false)}
                className="absolute top-5 right-5 p-2 rounded-xl text-solar-muted hover:text-solar-text hover:bg-solar-bg transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mb-5">
                <AlertTriangle size={28} />
              </div>

              <h3 className="text-xl font-black text-solar-text mb-2">
                {isAr ? 'تأكيد حذف المنتج' : 'Confirm Product Deletion'}
              </h3>
              
              <p className="text-solar-muted text-sm font-medium leading-relaxed mb-6">
                {isAr 
                  ? 'هل أنت متأكد من رغبتك في حذف هذا المنتج نهائياً من المنصة؟ لن تتمكن من استرجاعه بعد الحذف.'
                  : 'Are you sure you want to permanently delete this product? It will be removed from the catalog.'}
              </p>

              {/* Product Info Preview */}
              <div className="flex items-center gap-3 p-3 bg-solar-bg rounded-2xl border border-solar-border mb-4">
                <div className="w-12 h-12 rounded-xl bg-white overflow-hidden border border-solar-border shrink-0">
                  <img src={product.image || DEFAULT_PRODUCT_IMAGE} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-xs sm:text-sm text-solar-text truncate">
                    {isAr ? product.nameAr : product.name}
                  </div>
                  <div className="text-[11px] text-solar-blue font-bold">
                    {product.brand}
                  </div>
                </div>
              </div>

              {deleteError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold leading-relaxed">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => { setShowDeleteModal(false); setDeleteError(null); }}
                  className="flex-1 py-3 px-4 rounded-xl border border-solar-border text-solar-text font-bold text-sm hover:bg-solar-bg transition active:scale-95 disabled:opacity-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{isAr ? 'جاري الحذف...' : 'Deleting...'}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      <span>{isAr ? 'نعم، احذف المنتج' : 'Delete Product'}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
