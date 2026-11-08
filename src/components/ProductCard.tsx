import React, { useState } from 'react';
import { Power, Zap, Shield, ArrowLeftRight, ShieldCheck, Grid, MapPin, Edit, Heart, Sparkles, Building2, Trash2, Cpu, Battery as BatteryIcon } from 'lucide-react';
import { Product } from '../types';
import { classifyInverter } from '../utils/inverterClassification';
import { translations } from '../translations';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { getSupplierDisplayName } from '../utils/supplierUtils';

const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&q=80&w=800';

interface ProductCardProps {
  product: Product;
  lang: 'ar' | 'en';
  onClick: () => void;
  onCompare: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent, product: Product) => void;
  onDelete?: (e: React.MouseEvent, product: Product) => void;
  onWishlist?: (e: React.MouseEvent) => void;
  isCompared: boolean;
  isWishlisted?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({ 
  product, 
  lang, 
  onClick, 
  onCompare, 
  onEdit, 
  onDelete,
  onWishlist,
  isCompared,
  isWishlisted 
}) => {
  const { user } = useAuth();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const primarySupplier = product.suppliers?.[0];
  const isVerified = primarySupplier?.verified;
  const supplierName = getSupplierDisplayName(primarySupplier, isAr);
  const userUid = String(user?.uid || '').trim();
  const isOwner =
    user?.type === 'admin' ||
    (user?.type === 'supplier' &&
      Boolean(userUid) &&
      (String(product.supplierId || '').trim() === userUid ||
        String((product as any).supplier_id || '').trim() === userUid ||
        String((product as any).supplier || '').trim() === userUid ||
        Boolean(product.suppliers?.some(s => String(s?.id || '').trim() === userUid))));

  // Swipe gesture state & motion values
  const x = useMotionValue(0);
  const [swipedAction, setSwipedAction] = useState<string | null>(null);

  // Background feedback transforms
  const backgroundOpacity = useTransform(x, [-120, -40, 0, 40, 120], [1, 0.7, 0, 0.7, 1]);
  const iconScale = useTransform(x, [-120, -50, 0, 50, 120], [1.3, 1, 0.5, 1, 1.3]);

  const handleDragEnd = (_: any, info: any) => {
    const offset = info.offset.x;
    const swipeThreshold = 75;

    if (Math.abs(offset) > swipeThreshold) {
      if (onWishlist) {
        // Trigger synthetic event
        const dummyEvent = { stopPropagation: () => {} } as React.MouseEvent;
        onWishlist(dummyEvent);
        setSwipedAction(isWishlisted ? (isAr ? 'تمت الإزالة من المفضلة' : 'Removed from Wishlist') : (isAr ? 'تمت الإضافة للمفضلة ❤️' : 'Added to Wishlist ❤️'));
        setTimeout(() => setSwipedAction(null), 1800);
      }
    }
  };

  const getDisplaySpecs = () => {
    const common = [
      { label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield size={14} /> }
    ];

    const specsObj = product.specs || {};

    if (product.category === 'panels') {
      const specs = [
        { label: t.power, value: `${product.power}W`, icon: <Power size={14} /> },
        { label: t.efficiency, value: `${product.efficiency}%`, icon: <Zap size={14} /> }
      ];
      const voltVal = specsObj.voltage || specsObj.vmpV || specsObj.vocV;
      if (voltVal) {
        const v = String(voltVal);
        specs.push({ label: t.voltage, value: /v|فولت/i.test(v) ? v : `${v}V`, icon: <Zap size={14} /> });
      } else if (specsObj.current || specsObj.impA) {
        const a = String(specsObj.current || specsObj.impA);
        specs.push({ label: t.current, value: /a|أمبير/i.test(a) ? a : `${a}A`, icon: <Power size={14} /> });
      } else {
        specs.push(...common);
      }
      return specs;
    }
    
    if (product.category === 'inverters') {
      const inv = classifyInverter(product);
      const specs = [];
      const hpVal = product.specs?.hp || product.specs?.horsepower || product.specs?.horsePower || product.specs?.pumpHorsepower || (product as any).hp || (inv as any).pump_horsepower_hp;
      const isPumpInv = inv.type === 'Pump Inverter' || Boolean(hpVal);
      
      // 1. Rated AC Power / Horsepower
      if (isPumpInv && hpVal && hpVal !== 'Unknown') {
        specs.push({
          label: isAr ? 'القدرة (حصان / ك.و)' : 'Power (HP / kW)',
          value: isAr ? `${hpVal} حصان (${inv.rated_power_kw} kW)` : `${hpVal} HP (${inv.rated_power_kw} kW)`,
          icon: <Power size={14} className="text-solar-blue" />
        });
      } else {
        specs.push({
          label: isAr ? 'القدرة المقدرة' : 'Rated Power',
          value: `${inv.rated_power_kw} kW`,
          icon: <Power size={14} className="text-solar-blue" />
        });
      }

      // 2. Phase
      specs.push({
        label: isAr ? 'الطور' : 'Phase',
        value: inv.phase === 'Three Phase' ? (isAr ? '3 فاز' : '3-Phase') : (isAr ? '1 فاز' : '1-Phase'),
        icon: <Cpu size={14} className="text-solar-blue" />
      });

      // 3. Application or Battery Support or Efficiency
      if (isPumpInv) {
        specs.push({
          label: isAr ? 'الاستخدام' : 'Application',
          value: isAr ? 'طلمبات ومضخات ري' : 'Solar Pump VFD',
          icon: <Grid size={14} className="text-solar-accent" />
        });
      } else if (inv.battery_support) {
        specs.push({
          label: isAr ? 'دعم البطاريات' : 'Battery Storage',
          value: isAr ? 'يدعم بطارية' : 'Battery Supported',
          icon: <BatteryIcon size={14} className="text-emerald-500" />
        });
      } else if (typeof inv.efficiency_percent === 'number') {
        specs.push({
          label: t.efficiency,
          value: `${inv.efficiency_percent}%`,
          icon: <Zap size={14} className="text-solar-warning" />
        });
      } else {
        specs.push({
          label: isAr ? 'التصنيف' : 'Type',
          value: inv.type,
          icon: <Grid size={14} />
        });
      }

      return specs;
    }

    if (product.category === 'pumps') {
      const hpVal = specsObj.hp || specsObj.horsepower || specsObj.horsePower || specsObj.pumpHorsepower || (product as any).hp;
      const specs = [];
      if (hpVal && hpVal !== 'Unknown') {
        specs.push({
          label: isAr ? 'القدرة بالحصان' : 'Horsepower',
          value: isAr ? `${hpVal} حصان` : `${hpVal} HP`,
          icon: <Power size={14} className="text-solar-blue" />
        });
      } else if (product.power) {
        specs.push({
          label: t.power,
          value: product.power >= 1000 ? `${(product.power / 1000).toFixed(1)} kW` : `${product.power} W`,
          icon: <Power size={14} className="text-solar-blue" />
        });
      }
      if (specsObj.voltage) {
        specs.push({ label: t.voltage, value: `${specsObj.voltage}V`, icon: <Zap size={14} className="text-solar-warning" /> });
      }
      specs.push({ label: t.warranty, value: `${product.warranty} ${t.years}`, icon: <Shield size={14} /> });
      return specs.slice(0, 3);
    }

    if (product.category === 'batteries') {
      const cap = specsObj.capacity ? String(specsObj.capacity) : (specsObj.capacityAh ? `${specsObj.capacityAh}Ah` : (specsObj.nominalEnergyWh ? `${specsObj.nominalEnergyWh}Wh` : ''));
      const volt = specsObj.voltage || specsObj.nominalVoltage ? `${specsObj.voltage || specsObj.nominalVoltage}V` : '';
      const specs = [];
      if (cap) specs.push({ label: t.capacity, value: cap, icon: <Zap size={14} /> });
      if (volt) specs.push({ label: t.voltage, value: volt, icon: <Zap size={14} /> });
      specs.push(...common);
      return specs.slice(0, 3);
    }

    if (product.category === 'cables') {
      return [
        { label: t.crossSection, value: specsObj.crossSection ? `${specsObj.crossSection} mm²` : 'N/A', icon: <Grid size={14} /> },
        { label: t.length, value: specsObj.cableLength || specsObj.length ? `${specsObj.cableLength || specsObj.length} m` : 'N/A', icon: <Grid size={14} /> },
        ...common
      ];
    }

    // Default for others
    return [
       { label: t.type, value: specsObj.type || product.category, icon: <Grid size={14} /> },
       { label: t.brand, value: product.brand, icon: <Zap size={14} /> },
       ...common
    ];
  };

  const specs = getDisplaySpecs();

  return (
    <div className="relative overflow-hidden rounded-3xl group touch-pan-y">
      {/* Background action reveal indicator when swiping */}
      <motion.div 
        style={{ opacity: backgroundOpacity }}
        className={`absolute inset-0 rounded-3xl flex items-center justify-between px-6 z-0 ${
          isWishlisted ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white' : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
        }`}
      >
        <motion.div style={{ scale: iconScale }} className="flex items-center gap-2 font-black text-xs">
          <Heart size={20} fill={isWishlisted ? 'none' : 'currentColor'} />
          <span>{isWishlisted ? (isAr ? 'حذف من المفضلة' : 'Remove') : (isAr ? 'إضافة للمفضلة' : 'Favorite')}</span>
        </motion.div>

        <motion.div style={{ scale: iconScale }} className="flex items-center gap-2 font-black text-xs">
          <span>{isWishlisted ? (isAr ? 'حذف من المفضلة' : 'Remove') : (isAr ? 'إضافة للمفضلة' : 'Favorite')}</span>
          <Heart size={20} fill={isWishlisted ? 'none' : 'currentColor'} />
        </motion.div>
      </motion.div>

      {/* Temporary Toast Badge after successful swipe */}
      {swipedAction && (
        <motion.div 
          initial={{ opacity: 0, y: -10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-black px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 pointer-events-none"
        >
          <Sparkles size={12} className="text-amber-400" />
          <span>{swipedAction}</span>
        </motion.div>
      )}

      {/* Main draggable Card */}
      <motion.div 
        style={{ x }}
        drag={onWishlist ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDragEnd={handleDragEnd}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        onClick={onClick}
        className="relative z-10 bg-solar-card rounded-[26px] sm:rounded-3xl p-3.5 sm:p-4 border border-solar-border shadow-xs hover:shadow-xl hover:shadow-solar-blue/5 transition-all cursor-pointer select-none"
      >
        <div className="relative aspect-[16/10] sm:aspect-video rounded-2xl overflow-hidden mb-3.5 bg-solar-bg" data-nosnippet>
          <img 
            src={product.image || DEFAULT_PRODUCT_IMAGE} 
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
            }}
            referrerPolicy="no-referrer" 
            loading="lazy"
            data-nosnippet
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none" 
            alt={isAr ? product.nameAr || product.name : product.name} 
          />
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col gap-1 items-start">
              {isOwner && (
                <div className="flex items-center gap-1.5 pointer-events-auto mb-1">
                  {onEdit && (
                    <button 
                      onClick={(e) => onEdit(e, product)}
                      className="bg-solar-blue text-white min-h-[30px] px-2.5 py-1 rounded-xl shadow-md hover:bg-solar-blue/90 transition active:scale-95 flex items-center gap-1 cursor-pointer"
                      title={isAr ? 'تعديل المنتج' : 'Edit Product'}
                    >
                      <Edit size={12} />
                      <span className="text-[10px] font-black uppercase">{isAr ? 'تعديل' : 'Edit'}</span>
                    </button>
                  )}
                  {onDelete && (
                    <button 
                      onClick={(e) => onDelete(e, product)}
                      className="bg-red-600 text-white min-h-[30px] w-7 h-7 rounded-xl shadow-md hover:bg-red-700 transition active:scale-95 flex items-center justify-center cursor-pointer"
                      title={isAr ? 'حذف المنتج' : 'Delete Product'}
                      aria-label="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
              <span translate="no" className="bg-solar-blue/90 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-lg pointer-events-auto shadow-xs tracking-wide uppercase notranslate">
                {product.brand}
              </span>
              {product.category === 'inverters' && (() => {
                const inv = classifyInverter(product);
                const typeColor = 
                  inv.type === 'On-Grid' ? 'bg-emerald-600/95 text-white' :
                  inv.type === 'Hybrid' ? 'bg-indigo-600/95 text-white' :
                  inv.type === 'Off-Grid' ? 'bg-amber-600/95 text-white' :
                  'bg-cyan-600/95 text-white';
                return (
                  <div className="flex flex-wrap gap-1 pointer-events-auto">
                    <span className={`${typeColor} text-[9px] font-black px-2 py-0.5 rounded-md shadow-xs`}>
                      {inv.type}
                    </span>
                    <span className="bg-slate-900/80 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs">
                      {inv.phase === 'Three Phase' ? (isAr ? '3 فاز' : '3-Phase') : (isAr ? '1 فاز' : '1-Phase')}
                    </span>
                  </div>
                );
              })()}
              {isVerified && (
                <span translate="no" className="bg-solar-success text-white text-[9px] font-black px-2 py-0.5 rounded-lg pointer-events-auto shadow-xs flex items-center gap-1 notranslate">
                  <ShieldCheck size={11} />
                  {isAr ? 'معتمد' : 'Verified'}
                </span>
              )}
            </div>
            {isOwner ? (
              <div className="flex gap-1.5 items-center pointer-events-auto">
                {onEdit && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(e, product); }}
                    className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-md bg-white/95 backdrop-blur-md text-solar-muted hover:text-solar-blue cursor-pointer"
                    title={isAr ? 'تعديل المنتج' : 'Edit Product'}
                    aria-label="Edit"
                  >
                    <Edit size={16} />
                  </button>
                )}
                {onDelete && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(e, product); }}
                    className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-md bg-white/95 backdrop-blur-md text-solar-muted hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title={isAr ? 'حذف المنتج' : 'Delete Product'}
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-1.5 items-center pointer-events-auto">
                {onWishlist && (
                  <button 
                    onClick={onWishlist} 
                    className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-md ${isWishlisted ? 'bg-red-500 text-white' : 'bg-white/95 backdrop-blur-md text-solar-muted hover:text-red-500'}`}
                    title={isWishlisted ? (isAr ? 'إزالة من المفضلة' : 'Remove from Wishlist') : (isAr ? 'إضافة للمفضلة' : 'Add to Wishlist')}
                    aria-label={isAr ? 'المفضلة' : 'Wishlist'}
                  >
                    <Heart size={18} fill={isWishlisted ? 'currentColor' : 'none'} />
                  </button>
                )}
                <button 
                  onClick={onCompare} 
                  className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-md ${isCompared ? 'bg-solar-accent text-white' : 'bg-white/95 backdrop-blur-md text-solar-muted hover:text-solar-blue'}`}
                  title={isCompared ? (isAr ? 'تمت الإضافة للمقارنة' : 'Added to compare') : (isAr ? 'مقارنة' : 'Compare')}
                  aria-label={isAr ? 'مقارنة' : 'Compare'}
                >
                  <ArrowLeftRight size={18} />
                </button>
              </div>
            )}
          </div>
          {product.efficiency >= 22 && (
            <div translate="no" className="absolute bottom-2 right-2 bg-solar-success/90 backdrop-blur-md text-white text-[10px] font-black px-2 py-0.5 rounded-lg shadow-xs notranslate">
              {t.bestEfficiencyTag}
            </div>
          )}
        </div>

        <h3 translate="no" className="text-solar-text font-black text-base sm:text-lg line-clamp-1 mb-1 notranslate">{isAr ? product.nameAr : product.name}</h3>

        {/* Supplier Name & Badge */}
        <div className="flex items-center gap-1.5 text-xs text-solar-blue font-black mb-2 truncate" title={supplierName}>
          <Building2 size={13} className="shrink-0 text-solar-blue/80" />
          <span className="text-[11px] font-bold text-solar-muted shrink-0">{t.supplier}:</span>
          <span translate="no" className="truncate hover:underline notranslate font-black">{supplierName}</span>
        </div>

        <div className="text-[11px] text-solar-muted mb-3.5 font-bold flex items-center gap-1.5 flex-wrap">
          <span translate="no" className="bg-solar-light text-solar-blue px-2 py-0.5 rounded-full uppercase tracking-tight text-[10px] notranslate">{product.category}</span>
          <span className="opacity-30">•</span>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${product.status === 'out_of_stock' ? 'bg-red-500' : product.status === 'limited' ? 'bg-amber-500' : 'bg-solar-success'}`}></div>
            <span translate="no" className={`notranslate ${product.status === 'out_of_stock' ? 'text-red-600 font-bold' : product.status === 'limited' ? 'text-amber-600 font-bold' : ''}`}>
              {t[product.status] || t.available}
            </span>
          </div>
          <span className="opacity-30">•</span>
          <div className="flex items-center gap-1">
            <MapPin size={11} className="text-solar-blue" />
            <span translate="no" className="truncate max-w-[100px] notranslate">{product.suppliers?.[0]?.location || 'Egypt'}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3.5">
          {specs.map((spec, i) => (
            <div key={i} className="bg-solar-bg p-2 rounded-xl flex flex-col items-center justify-center gap-0.5 border border-solar-border/50 group-hover:border-solar-blue/20 transition-colors min-h-[52px]">
              <div className="text-solar-blue opacity-70 mb-0.5">{spec.icon}</div>
              <span translate="no" className="text-[9px] text-solar-muted font-bold text-center leading-none truncate w-full notranslate">{spec.label}</span>
              <span translate="no" className="text-[10px] text-solar-text font-black truncate w-full text-center notranslate">{spec.value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-solar-border/60 pt-2.5">
          <div className="flex flex-col">
            <span translate="no" className="text-[10px] text-solar-muted font-bold leading-none mb-0.5 notranslate">{t.from}</span>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span translate="no" className="text-solar-blue font-black text-lg sm:text-xl leading-tight notranslate">
                {product.price.toLocaleString()} <span className="text-xs font-bold notranslate">{t.egp}</span>
              </span>
              {product.category === 'panels' && product.pricePerWatt && (
                <span translate="no" className="text-[10px] font-black text-solar-muted bg-solar-light px-1.5 py-0.5 rounded border border-solar-border/70 notranslate leading-none">
                  {product.pricePerWatt.toFixed(2)} <span className="text-[9px]">{isAr ? 'ج.م/وات' : 'EGP/W'}</span>
                </span>
              )}
            </div>
          </div>
          <div translate="no" className="flex items-center gap-1 text-[10px] text-solar-muted font-bold opacity-70 notranslate">
            <Zap size={11} />
            {t.verified}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
