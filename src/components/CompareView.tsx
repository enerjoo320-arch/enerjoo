import React from 'react';
import { ArrowRight, CheckCircle2, MapPin, X } from 'lucide-react';
import { Product } from '../types';
import { translations } from '../translations';
import { motion } from 'motion/react';
import { getSupplierDisplayName } from '../utils/supplierUtils';
import { getSupplierWhatsAppUrl, SUPPLIER_CONTACT_PHONE_DISPLAY } from '../constants/contact';

const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&q=80&w=800';

interface CompareViewProps {
  products: Product[];
  lang: 'ar' | 'en';
  onBack: () => void;
  onRemove: (id: string | number) => void;
}

export const CompareView: React.FC<CompareViewProps> = ({ products, lang, onBack, onRemove }) => {
  const t = translations[lang];
  const isAr = lang === 'ar';

  if (products.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-20"
      >
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-black text-solar-text mb-2">{isAr ? 'لا توجد منتجات للمقارنة' : 'No products to compare'}</h2>
        <p className="text-solar-muted mb-6 text-sm">{isAr ? 'أضف منتجات من قائمة المنتجات للمقارنة' : 'Add products from the list to compare'}</p>
        <button onClick={onBack} className="bg-solar-blue text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-solar-blue/20">{t.back}</button>
      </motion.div>
    );
  }

  const specs = [
    { key: 'brand', label: isAr ? 'الماركة' : 'Brand', render: (p: Product) => p.brand },
    { 
      key: 'power', 
      label: t.power, 
      render: (p: Product) => {
        const hpVal = p.specs?.hp || p.specs?.horsepower || p.specs?.horsePower || p.specs?.pumpHorsepower || (p as any).hp;
        if (p.category === 'inverters') {
          if (hpVal && hpVal !== 'Unknown') {
            const kw = p.specs?.powerKw ? `${p.specs.powerKw} kW` : (p.power >= 1000 ? `${p.power / 1000} kW` : (p.specs?.ratedPowerKw ? `${p.specs.ratedPowerKw} kW` : ''));
            return isAr ? `${hpVal} حصان ${kw ? `(${kw})` : ''}` : `${hpVal} HP ${kw ? `(${kw})` : ''}`;
          }
          return p.specs?.powerKw ? `${p.specs.powerKw} kW` : (p.specs?.ratedPowerKw ? `${p.specs.ratedPowerKw} kW` : (p.power >= 1000 ? `${p.power / 1000} kW` : `${p.power} W`));
        }
        if (p.category === 'pumps') {
          if (hpVal && hpVal !== 'Unknown') {
            const kw = p.specs?.powerKw ? `(${p.specs.powerKw} kW)` : '';
            return isAr ? `${hpVal} حصان ${kw}` : `${hpVal} HP ${kw}`;
          }
          return p.specs?.powerKw ? `${p.specs.powerKw} kW` : (p.power ? `${p.power} W` : '-');
        }
        if (p.category === 'batteries') {
          return p.specs?.capacity ? `${p.specs.capacity}` : (p.specs?.capacityAh ? `${p.specs.capacityAh} Ah` : (p.power ? `${p.power} W` : '-'));
        }
        return p.power ? `${p.power} ${t.watt}` : '-';
      }
    },
    { key: 'voltage', label: t.voltage, render: (p: Product) => p.specs?.voltage || p.specs?.vmpV || p.specs?.vocV || p.specs?.nominalVoltage || p.specs?.acVoltageV || '-' },
    { key: 'current', label: t.current, render: (p: Product) => p.specs?.current || p.specs?.impA || p.specs?.iscA || p.specs?.maxContinuousDischargeCurrentA || '-' },
    { key: 'area', label: t.area, render: (p: Product) => p.area ? `${p.area} m²` : '-' },
    { key: 'efficiency', label: t.efficiency, render: (p: Product) => p.efficiency ? `${p.efficiency}%` : (p.specs?.peakEfficiency ? `${p.specs.peakEfficiency}%` : '-') },
    { key: 'warranty', label: t.warranty, render: (p: Product) => p.warranty ? `${p.warranty} ${t.years}` : (p.specs?.warranty ? `${p.specs.warranty} ${t.years}` : '-') },
    { key: 'price', label: t.price, render: (p: Product) => `${p.price.toLocaleString()} ${t.egp}` }
  ];

  const getBest = (key: string) => {
    if (key === 'price') return Math.min(...products.map(p => p.price));
    if (key === 'power') return Math.max(...products.map(p => p.power));
    if (key === 'efficiency') return Math.max(...products.map(p => p.efficiency));
    return null;
  };

  return (
    <div className="animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-solar-muted hover:text-solar-blue transition font-bold group w-fit">
          <div className="p-2 rounded-xl bg-solar-white group-hover:bg-solar-blue/10">
            <ArrowRight size={18} className={isAr ? '' : 'rotate-180'} />
          </div>
          {t.back}
        </button>
        <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
          <div className="flex flex-col items-end">
            <h2 className="text-xl md:text-2xl font-black text-solar-text">{t.compareProducts} <span className="text-solar-blue">({products.length})</span></h2>
            <p className="text-[10px] font-bold text-solar-muted md:hidden">
              {isAr ? 'اسحب لليسار للمقارنة' : 'Swipe left to compare'} →
            </p>
          </div>
          <button 
            onClick={() => products.forEach(p => onRemove(p.id))}
            className="text-[10px] font-black text-solar-danger hover:underline uppercase tracking-widest whitespace-nowrap"
          >
            {isAr ? 'مسح الكل' : 'Clear All'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[24px] md:rounded-[32px] border border-solar-border shadow-2xl shadow-solar-blue/5 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          <table className="w-full border-separate border-spacing-0 min-w-[550px] md:min-w-[800px]">
            <thead>
              <tr>
                <th className={`sticky ${isAr ? 'right-0' : 'left-0'} top-0 z-40 bg-solar-light p-4 md:p-6 text-right text-solar-muted text-[10px] font-black uppercase tracking-widest border-b border-solar-border w-28 md:w-40 shadow-[4px_0_10px_rgba(0,0,0,0.02)]`}>
                  {isAr ? 'المواصفة' : 'Feature'}
                </th>
                {products.map(p => (
                  <th key={p.id} className="sticky top-0 z-30 p-4 md:p-6 bg-white border-b border-solar-border min-w-[160px] md:min-w-[220px] snap-center">
                    <div className="relative">
                      <button 
                        onClick={() => onRemove(p.id)} 
                        className="absolute -top-2 -right-2 md:-top-3 md:-right-3 bg-white text-solar-danger w-7 h-7 md:w-9 h-9 rounded-full shadow-lg flex items-center justify-center border border-solar-border transition hover:bg-solar-danger hover:text-white z-10"
                        title={isAr ? 'حذف' : 'Remove'}
                      >
                        <X size={14} />
                      </button>
                      <img 
                        src={p.image || DEFAULT_PRODUCT_IMAGE} 
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                        }}
                        className="w-full h-20 md:h-36 object-cover rounded-xl md:rounded-2xl mb-3 md:mb-5 shadow-sm border border-solar-border/50" 
                        alt={p.name} 
                      />
                      <h4 className="text-solar-text font-black text-[11px] md:text-base line-clamp-2 leading-tight h-10 md:h-auto">{isAr ? p.nameAr : p.name}</h4>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specs.map((spec, idx) => {
                const bestVal = getBest(spec.key);
                return (
                  <tr key={idx} className="group">
                    <td className={`sticky ${isAr ? 'right-0' : 'left-0'} z-20 bg-solar-bg/5 group-hover:bg-solar-light/50 p-4 md:p-6 text-solar-muted text-[10px] md:text-xs font-black border-b border-solar-border/50 shadow-[4px_0_10px_rgba(0,0,0,0.02)] transition-colors`}>
                      {spec.label}
                    </td>
                    {products.map(p => {
                      const val = spec.render(p);
                      const isBest = spec.key === 'price' ? p.price === bestVal : spec.key === 'power' ? p.power === bestVal : spec.key === 'efficiency' ? p.efficiency === bestVal : false;
                      return (
                        <td key={p.id} className="p-3 md:p-6 transition-colors group-hover:bg-solar-light/10 border-b border-solar-border/50">
                          <div translate="no" className={`p-2.5 md:p-4 rounded-xl md:rounded-2xl flex items-center justify-center gap-1.5 md:gap-3 text-[11px] md:text-base font-black transition-all notranslate ${isBest ? 'bg-solar-success/10 text-solar-success ring-1 ring-solar-success/20 shadow-inner' : 'text-solar-text bg-solar-bg/20'}`}>
                            {isBest && <CheckCircle2 size={16} className="text-solar-success shrink-0" />}
                            {val}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td className={`sticky ${isAr ? 'right-0' : 'left-0'} z-20 bg-solar-bg/5 p-4 md:p-6 text-[10px] md:text-xs font-black text-solar-muted uppercase border-b border-solar-border/50 shadow-[4px_0_10px_rgba(0,0,0,0.02)]`}>{t.supplier}</td>
                {products.map(p => (
                  <td key={p.id} className="p-3 md:p-6 border-b border-solar-border/50">
                    <div className="space-y-2">
                      {(p.suppliers || []).map((s, i) => (
                        <div key={i} className="bg-white p-3 md:p-5 rounded-xl md:rounded-2xl border border-solar-border shadow-sm hover:border-solar-blue/30 transition-all group/sup">
                          <div className="font-black text-solar-blue text-[11px] md:text-sm mb-1 leading-none group-hover/sup:translate-x-1 transition-transform">{getSupplierDisplayName(s, isAr)}</div>
                          <div className="text-[9px] md:text-[11px] text-solar-muted flex items-center gap-1.5 font-bold uppercase tracking-wider">
                            <MapPin size={10} className="text-solar-blue/40" />
                            {s.location}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
              <tr className="bg-solar-light/20">
                <td className={`sticky ${isAr ? 'right-0' : 'left-0'} z-20 bg-solar-light/30 p-4 md:p-6 border-transparent`}></td>
                {products.map(p => {
                  const targetName = isAr ? p.nameAr || p.name : p.name;
                  const message = isAr 
                    ? `مرحباً، أود الاستفسار عن منتج "${targetName}" المعروض على منصة Enerjoo.` 
                    : `Hello, I would like to inquire about the product "${targetName}" on Enerjoo.`;
                  const whatsappUrl = getSupplierWhatsAppUrl(message);
                  return (
                    <td key={p.id} className="p-3 md:p-6 text-center">
                      <a 
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center bg-solar-blue text-white py-3 md:py-5 rounded-xl md:rounded-2xl text-[10px] md:text-sm font-black shadow-xl shadow-solar-blue/20 transition hover:bg-solar-text active:scale-95 uppercase tracking-widest"
                      >
                        {t.contactSupplier}
                      </a>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
