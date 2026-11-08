import React from 'react';
import { Search, Sparkles, X, User, Zap, Battery, Cpu, Layers } from 'lucide-react';
import { Category, Filters } from '../types';
import { 
  InverterFilterCriteria, 
  INVERTER_MAIN_TYPES, 
  INVERTER_PHASES, 
  INVERTER_POWER_RANGES, 
  INVERTER_APPLICATIONS 
} from '../types/inverter';
import { translations } from '../translations';

interface FilterBarProps {
  lang: 'ar' | 'en';
  activeFilter: Filters;
  setFilter: (filter: Filters) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  useAiSearch: boolean;
  setUseAiSearch: (val: boolean) => void;
  supplierFilterId?: string | number | null;
  onClearSupplierFilter?: () => void;
  inverterFilters?: InverterFilterCriteria;
  setInverterFilters?: (filters: InverterFilterCriteria) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ 
  lang, activeFilter, setFilter, searchTerm, setSearchTerm, useAiSearch, setUseAiSearch,
  supplierFilterId, onClearSupplierFilter, inverterFilters, setInverterFilters
}) => {
  const t = translations[lang];
  const isAr = lang === 'ar';

  const categories: { id: Category; label: string }[] = [
    { id: 'all', label: t.all },
    { id: 'panels', label: t.panels },
    { id: 'inverters', label: t.inverters },
    { id: 'batteries', label: t.batteries },
    { id: 'pumps', label: t.pumps },
    { id: 'mounting', label: t.mounting },
    { id: 'protection', label: t.protection },
    { id: 'combiner', label: t.combiner },
    { id: 'cables', label: t.cables },
    { id: 'mc4', label: t.mc4 },
    { id: 'sealings', label: t.sealings },
    { id: 'clamps', label: t.clamps }
  ];

  return (
    <div className="space-y-4 mb-6">
      {supplierFilterId && (
        <div className="flex items-center gap-2 mb-4 animate-in fade-in slide-in-from-top-2">
          <div className="bg-solar-blue/10 border border-solar-blue/20 text-solar-blue px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
            <User size={14} className="opacity-70" />
            <span className="text-xs font-black uppercase tracking-tighter">
              {t.filteredBySupplier}
            </span>
            <button 
              onClick={onClearSupplierFilter}
              className="ml-2 p-1 hover:bg-solar-blue/20 rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className={`absolute ${isAr ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-solar-muted pointer-events-none`} size={18} />
          <input 
            type="text" 
            placeholder={t.search} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full bg-solar-card border border-solar-border rounded-2xl py-3 text-base sm:text-sm font-bold text-solar-text outline-none transition-all shadow-2xs focus:border-solar-blue min-h-[46px] ${isAr ? 'pr-11 pl-10' : 'pl-11 pr-10'}`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className={`absolute ${isAr ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 p-1.5 text-solar-muted hover:text-solar-text rounded-full hover:bg-solar-light transition-colors`}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide -mx-1 px-1 touch-pan-x">
        {categories.map((cat) => (
          <button 
            key={cat.id} 
            onClick={() => setFilter({ ...activeFilter, category: cat.id })}
            className={`whitespace-nowrap px-4 sm:px-6 py-2 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 ${activeFilter.category === cat.id ? 'bg-solar-blue text-white shadow-md shadow-solar-blue/20 ring-2 ring-solar-blue/20' : 'bg-solar-card border border-solar-border text-solar-muted hover:text-solar-text'}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Dedicated Structured Inverter Classification Filter Bar */}
      {activeFilter.category === 'inverters' && inverterFilters && setInverterFilters && (
        <div className="bg-solar-card border border-solar-border/80 rounded-2xl p-3.5 space-y-3 shadow-xs animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-solar-blue" />
              <span className="text-xs font-black text-solar-text">
                {isAr ? 'تصنيف محولات الطاقة (Inverter Classification)' : 'Inverter Classification & Specs'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-enerjoo-ai-chat'))}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95"
              >
                <Sparkles size={12} className="text-blue-600 animate-pulse" />
                <span>{isAr ? 'مستشار Enerjoo AI لاختيار الإنفرتر' : 'Enerjoo AI Inverter Advisor'}</span>
              </button>
              {(inverterFilters.type !== 'all' || inverterFilters.phase !== 'all' || inverterFilters.powerRange !== 'all' || inverterFilters.application !== 'all' || inverterFilters.batterySupport !== 'all') && (
                <button
                  onClick={() => setInverterFilters({
                    type: 'all',
                    phase: 'all',
                    powerRange: 'all',
                    application: 'all',
                    batterySupport: 'all'
                  })}
                  className="text-[11px] font-bold text-solar-blue hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <X size={12} />
                  {isAr ? 'إعادة ضبط' : 'Reset'}
                </button>
              )}
            </div>
          </div>

          {/* 1. Inverter Main Type Pills (Strict: On-Grid, Hybrid, Off-Grid, Pump Inverter) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-solar-muted uppercase tracking-wider block">
              {isAr ? 'نوع الإنفرتر الأساسي (Main Type)' : 'Inverter Main Type'}
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-0.5 px-0.5">
              <button
                onClick={() => setInverterFilters({ ...inverterFilters, type: 'all' })}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${inverterFilters.type === 'all' ? 'bg-solar-blue text-white shadow-xs' : 'bg-solar-bg text-solar-muted hover:text-solar-text border border-solar-border'}`}
              >
                {isAr ? 'جميع الأنواع' : 'All Types'}
              </button>
              {INVERTER_MAIN_TYPES.map((tType) => (
                <button
                  key={tType}
                  onClick={() => setInverterFilters({ ...inverterFilters, type: tType })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 ${inverterFilters.type === tType ? 'bg-solar-blue text-white shadow-sm ring-2 ring-solar-blue/20' : 'bg-solar-bg text-solar-muted hover:text-solar-text border border-solar-border'}`}
                >
                  {tType === 'On-Grid' ? (isAr ? 'On-Grid (متصل بالشبكة)' : 'On-Grid') :
                   tType === 'Hybrid' ? (isAr ? 'Hybrid (هجين/مختلط)' : 'Hybrid') :
                   tType === 'Off-Grid' ? (isAr ? 'Off-Grid (منفصل عن الشبكة)' : 'Off-Grid') :
                   (isAr ? 'Pump Inverter (طلمبات ري)' : 'Pump Inverter')}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Secondary Structured Spec Selectors: Phase, Power Range, Battery, Application */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-solar-border/40">
            {/* Phase */}
            <div>
              <label className="text-[10px] font-black text-solar-muted uppercase tracking-wider block mb-1">
                {isAr ? 'الطور (Phase)' : 'Phase'}
              </label>
              <select
                value={inverterFilters.phase || 'all'}
                onChange={(e) => setInverterFilters({ ...inverterFilters, phase: e.target.value as any })}
                className="w-full bg-solar-bg border border-solar-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
              >
                <option value="all">{isAr ? 'جميع الأطوار' : 'All Phases'}</option>
                <option value="Single Phase">{isAr ? 'Single Phase (سنجل فاز)' : 'Single Phase'}</option>
                <option value="Three Phase">{isAr ? 'Three Phase (3 فاز)' : 'Three Phase'}</option>
              </select>
            </div>

            {/* Power Range Helper */}
            <div>
              <label className="text-[10px] font-black text-solar-muted uppercase tracking-wider block mb-1">
                {isAr ? 'نطاق القدرة (Power Range)' : 'Power Range'}
              </label>
              <select
                value={inverterFilters.powerRange || 'all'}
                onChange={(e) => setInverterFilters({ ...inverterFilters, powerRange: e.target.value as any })}
                className="w-full bg-solar-bg border border-solar-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
              >
                <option value="all">{isAr ? 'جميع القدرات' : 'All Power Ranges'}</option>
                {INVERTER_POWER_RANGES.map(pr => (
                  <option key={pr} value={pr}>{pr}</option>
                ))}
              </select>
            </div>

            {/* Battery Support */}
            <div>
              <label className="text-[10px] font-black text-solar-muted uppercase tracking-wider block mb-1">
                {isAr ? 'دعم البطارية (Battery)' : 'Battery Support'}
              </label>
              <select
                value={inverterFilters.batterySupport === undefined ? 'all' : String(inverterFilters.batterySupport)}
                onChange={(e) => {
                  const val = e.target.value;
                  setInverterFilters({ 
                    ...inverterFilters, 
                    batterySupport: val === 'all' ? 'all' : val === 'true' 
                  });
                }}
                className="w-full bg-solar-bg border border-solar-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
              >
                <option value="all">{isAr ? 'الكل (مع وبدون)' : 'All (With/Without)'}</option>
                <option value="true">{isAr ? 'يدعم بطارية (Battery Supported)' : 'With Battery Support'}</option>
                <option value="false">{isAr ? 'بدون بطارية (No Battery Required)' : 'Without Battery'}</option>
              </select>
            </div>

            {/* Application */}
            <div>
              <label className="text-[10px] font-black text-solar-muted uppercase tracking-wider block mb-1">
                {isAr ? 'مجال الاستخدام (Application)' : 'Application'}
              </label>
              <select
                value={inverterFilters.application || 'all'}
                onChange={(e) => setInverterFilters({ ...inverterFilters, application: e.target.value as any })}
                className="w-full bg-solar-bg border border-solar-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-solar-text outline-none focus:border-solar-blue"
              >
                <option value="all">{isAr ? 'جميع الاستخدامات' : 'All Applications'}</option>
                {INVERTER_APPLICATIONS.map(app => (
                  <option key={app} value={app}>
                    {app === 'Residential' ? (isAr ? 'سكني (Residential)' : 'Residential') :
                     app === 'Commercial' ? (isAr ? 'تجاري (Commercial)' : 'Commercial') :
                     app === 'Industrial' ? (isAr ? 'صناعي (Industrial)' : 'Industrial') :
                     app === 'Agricultural' ? (isAr ? 'زراعي (Agricultural)' : 'Agricultural') :
                     (isAr ? 'طلمبات شمسية (Solar Pumping)' : 'Solar Pumping')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-solar-muted uppercase tracking-wider">{t.sortBy}</span>
          <select 
            value={activeFilter.sort}
            onChange={(e) => setFilter({ ...activeFilter, sort: e.target.value as any })}
            className="bg-solar-card text-xs font-black text-solar-text outline-none cursor-pointer border border-solar-border rounded-xl px-2.5 py-1.5 min-h-[36px] shadow-2xs"
          >
            <option value="power">{t.highestPower}</option>
            <option value="price">{t.lowestPrice}</option>
            <option value="efficiency">{t.bestEfficiency}</option>
          </select>
        </div>
      </div>
    </div>
  );
};
