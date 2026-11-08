/**
 * Enerjoo Inverter AI Matching & Recommendation Engine
 * Used by:
 * - n8n AI Agent via POST /api/v1/inverters/match & POST /api/v1/agent/recommend
 * - In-app Gemini Semantic Search, Advisor & Solar Consultant
 * - Live UI smart recommendation drawer & comparison modal
 * 
 * Strict Grounding Rule: Single Source of Truth = Enerjoo Real Product Catalog.
 * Never invent specs, prices, or availability.
 */

import {
  StructuredInverter,
  InverterType,
  InverterPhase,
  InverterApplication,
  InverterQueryCriteria,
  InverterMatchResult,
  InverterComparisonTable,
  InverterComparisonRow,
  TierProductRecommendation,
  InverterAgentRecommendationResponse
} from '../types/inverter';

/**
 * Parses freeform natural language text (Arabic or English) into structured query criteria.
 */
export function parseInverterQuery(text: string): InverterQueryCriteria {
  const q = text.toLowerCase();
  const criteria: InverterQueryCriteria = {};

  // 1. Detect Intent
  if (q.includes('أرخص') || q.includes('ارخص') || q.includes('اقل سعر') || q.includes('أقل سعر') || q.includes('cheapest') || q.includes('lowest price')) {
    criteria.intent = 'cheapest';
  } else if (q.includes('أعلى كفاءة') || q.includes('اعلى كفاءة') || q.includes('كفاءة عالية') || q.includes('highest efficiency') || q.includes('most efficient')) {
    criteria.intent = 'highest_efficiency';
  } else if (q.includes('قارن') || q.includes('الفرق بين') || q.includes('مقارنة') || q.includes('versus') || q.includes(' vs ') || q.includes('compare')) {
    criteria.intent = 'compare';
  } else if (q.includes('3 اختيارات') || q.includes('٣ اختيارات') || q.includes('3 بدائل') || q.includes('3 خيارات') || q.includes('three options')) {
    criteria.intent = 'recommend_three';
  } else if (q.includes('أفضل') || q.includes('افضل') || q.includes('انسب') || q.includes('أحسن') || q.includes('best')) {
    criteria.intent = 'best_match';
  } else {
    criteria.intent = 'general';
  }

  // 2. Inverter Type
  const hasPumpHint = 
    q.includes('pump') || 
    q.includes('طلمب') || 
    q.includes('مضخ') || 
    q.includes('vfd') || 
    q.includes('غاطس') || 
    /(?:^|[^\u0621-\u064A])(?:ري|للري|مياه الري)(?:[^\u0621-\u064A]|$)/.test(q);

  if (hasPumpHint && !q.includes('بطار') && !q.includes('battery')) {
    criteria.type = 'Pump Inverter';
  } else if (
    q.includes('hybrid') || 
    q.includes('هايبرد') || 
    q.includes('هجين') ||
    q.includes('النور يقطع') ||
    q.includes('الكهربا تقطع') ||
    q.includes('انقطاع الكهربا') ||
    q.includes('انقطاع الشبكة')
  ) {
    criteria.type = 'Hybrid';
    criteria.battery_required = true;
  } else if (
    q.includes('off-grid') || 
    q.includes('off grid') || 
    q.includes('اوف جريد') || 
    q.includes('أوف جريد') || 
    q.includes('منفصل') ||
    q.includes('مفيهوش كهربا') ||
    q.includes('مفيش كهربا') ||
    q.includes('مش واصل كهربا') ||
    q.includes('بدون شبكة')
  ) {
    criteria.type = 'Off-Grid';
    criteria.battery_required = true;
  } else if (
    q.includes('on-grid') || 
    q.includes('on grid') || 
    q.includes('اون جريد') || 
    q.includes('أون جريد') || 
    q.includes('متصل') || 
    q.includes('شبكة') ||
    q.includes('أقلل فاتورة') ||
    q.includes('اقلل فاتورة') ||
    q.includes('توفير الفاتورة') ||
    q.includes('فاتورة الكهربا')
  ) {
    criteria.type = 'On-Grid';
  }

  // 3. PV Solar Panels power hint (e.g. "عندي 120 كيلو ألواح", "120 kwp panels")
  const pvPanelsMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:kw|كيلوواط|كيلو|k|وات|w)?\s*(?:ألواح|الواح|بانل|panels|modules|solar panels|kwp)/i) ||
                         q.match(/(?:عندي|لدي|محطة)\s*(\d+(?:\.\d+)?)\s*(?:kw|كيلوواط|كيلو|k)?\s*(?:ألواح|الواح|بانل|panels)/i);
  if (pvPanelsMatch) {
    let pvPower = parseFloat(pvPanelsMatch[1]);
    if (pvPower > 500 && q.includes('وات') && !q.includes('كيلو')) {
      pvPower = pvPower / 1000;
    }
    criteria.pv_power_kwp = pvPower;
    // Rule of thumb for engineering sizing: DC/AC sizing ratio is ~1.15 - 1.25.
    // e.g. 120 kWp panels -> 100 kW inverter!
    if (!criteria.rated_power_kw) {
      criteria.rated_power_kw = Math.round(pvPower / 1.2);
    }
  }

  // 4. Rated Power (kW) directly requested
  // Match patterns like: "100 كيلو", "100kw", "100 k", "100 كيلوواط", "15 kw", "10kw"
  const powerMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:kw|كيلوواط|كيلو|k|وات|w)(?!\s*(?:ألواح|الواح|بانل|panels))/i);
  if (powerMatch) {
    let p = parseFloat(powerMatch[1]);
    if (q.includes('وات') && !q.includes('كيلو') && p > 500) {
      p = p / 1000;
    }
    criteria.rated_power_kw = p;
  } else if (!criteria.rated_power_kw) {
    // Isolated numbers if explicitly preceded by power hints
    const isolatedNumMatch = q.match(/(?:قدرة|حجم|سعة|capacity|power)\s*(\d+(?:\.\d+)?)/i);
    if (isolatedNumMatch) {
      criteria.rated_power_kw = parseFloat(isolatedNumMatch[1]);
    }
  }

  // 5. Phase (Single Phase vs Three Phase)
  if (
    q.includes('3 فاز') || 
    q.includes('٣ فاز') || 
    q.includes('3-phase') || 
    q.includes('3 phase') || 
    q.includes('three phase') || 
    q.includes('ثلاثي') || 
    q.includes('380') ||
    q.includes('400')
  ) {
    criteria.phase = 'Three Phase';
  } else if (
    q.includes('1 فاز') || 
    q.includes('١ فاز') || 
    q.includes('سنجل فاز') || 
    q.includes('1-phase') || 
    q.includes('1 phase') || 
    q.includes('single phase') || 
    q.includes('أحادي') || 
    q.includes('احادي') ||
    q.includes('220') ||
    q.includes('230')
  ) {
    criteria.phase = 'Single Phase';
  }

  // 6. Battery Requirement
  if (
    q.includes('بدون بطارية') || 
    q.includes('بدون بطاريات') || 
    q.includes('من غير بطارية') || 
    q.includes('من غير بطاريات') || 
    q.includes('مش محتاج بطارية') || 
    q.includes('مش محتاج بطاريات') || 
    q.includes('مش عايز بطارية') || 
    q.includes('مش عايز بطاريات') || 
    q.includes('no battery') || 
    q.includes('without battery') ||
    q.includes('مافيش بطارية')
  ) {
    criteria.battery_required = false;
  } else if (
    q.includes('مع بطارية') || 
    q.includes('مع بطاريات') || 
    q.includes('بطاريات') || 
    q.includes('بطارية') || 
    q.includes('with battery') || 
    q.includes('battery backup') || 
    q.includes('النور يقطع') || 
    q.includes('الكهربا تقطع') || 
    q.includes('انقطاع الكهربا') || 
    q.includes('انقطاع الشبكة') || 
    criteria.type === 'Off-Grid'
  ) {
    criteria.battery_required = true;
  }

  // 7. Application
  if (q.includes('مصنع') || q.includes('معمل') || q.includes('صناعي') || q.includes('industrial') || q.includes('factory')) {
    criteria.application = 'Industrial';
  } else if (q.includes('محل') || q.includes('تجاري') || q.includes('شرك') || q.includes('مكتب') || q.includes('commercial') || q.includes('office')) {
    criteria.application = 'Commercial';
  } else if (q.includes('بيت') || q.includes('منزل') || q.includes('فيلا') || q.includes('شقة') || q.includes('سكني') || q.includes('residential') || q.includes('home')) {
    criteria.application = 'Residential';
  } else if (q.includes('مزرع') || q.includes('أرض') || q.includes('زراعي') || q.includes('agricultural') || q.includes('farm')) {
    criteria.application = 'Agricultural';
  } else if (criteria.type === 'Pump Inverter' || q.includes('طلمب') || q.includes('pumping')) {
    criteria.application = 'Solar Pumping';
  }

  // Default battery requirement based on type if not explicitly set
  if (criteria.battery_required === undefined) {
    if (criteria.type === 'On-Grid' || criteria.type === 'Pump Inverter') {
      criteria.battery_required = false;
    } else if (criteria.type === 'Off-Grid') {
      criteria.battery_required = true;
    }
  }

  return criteria;
}

/**
 * Matches an array of StructuredInverters against customer criteria,
 * strictly enforcing hard constraints (Phase, Type, Battery, Power Proximity)
 * to eliminate incompatible products before ranking.
 */
export function matchInverters(
  inverters: StructuredInverter[],
  criteria: InverterQueryCriteria
): InverterMatchResult[] {
  const results: InverterMatchResult[] = [];

  for (const inv of inverters) {
    let score = 0;
    let isCompatible = true;
    const discrepanciesAr: string[] = [];
    const discrepanciesEn: string[] = [];

    // 1. Strict Type Match (Weight: 30 pts)
    let typeMatch = true;
    if (criteria.type) {
      if (inv.type === criteria.type) {
        score += 30;
      } else {
        typeMatch = false;
        isCompatible = false;
        discrepanciesAr.push(`النوع (${inv.type}) يختلف عن المطلوب (${criteria.type})`);
        discrepanciesEn.push(`Type is ${inv.type} instead of required ${criteria.type}`);
      }
    } else {
      score += 20;
    }

    // 2. Strict Battery Requirement Check (Weight: 20 pts)
    let batteryMatch = true;
    if (criteria.battery_required !== undefined) {
      if (criteria.battery_required) {
        if (inv.battery_support) {
          score += 20;
        } else {
          batteryMatch = false;
          isCompatible = false;
          discrepanciesAr.push('الإنفرتر لا يدعم بنك بطاريات (On-Grid مباشر)');
          discrepanciesEn.push('Inverter lacks required battery support');
        }
      } else {
        if (!inv.battery_support) {
          score += 20;
        } else {
          // Inverter has battery capability; still usable for Hybrid/Off-grid, but pure On-Grid is preferred
          score += 10;
        }
      }
    } else {
      score += 15;
    }

    // 3. Strict Phase Match (Weight: 20 pts)
    let phaseMatch = true;
    if (criteria.phase) {
      if (inv.phase === criteria.phase) {
        score += 20;
      } else {
        phaseMatch = false;
        isCompatible = false;
        discrepanciesAr.push(`الطور (${inv.phase}) غير مطابق للمطلوب (${criteria.phase})`);
        discrepanciesEn.push(`Phase (${inv.phase}) does not match required (${criteria.phase})`);
      }
    } else {
      score += 15;
    }

    // 4. Power Proximity (Weight: 20 pts)
    let powerDiffKw = 0;
    let powerScore = 0;
    if (criteria.rated_power_kw && criteria.rated_power_kw > 0) {
      powerDiffKw = Math.abs(inv.rated_power_kw - criteria.rated_power_kw);
      const relativeDiff = powerDiffKw / criteria.rated_power_kw;

      if (relativeDiff === 0) {
        powerScore = 20;
      } else if (relativeDiff <= 0.18) {
        // Within 18% (e.g. 100kW vs 115kW or 10kW vs 11kW or 10kW vs 12kW)
        powerScore = 16;
      } else {
        // Severe power mismatch (e.g. asking 100kW and getting 70kW or 20kW) -> eliminate from compatible
        powerScore = 0;
        isCompatible = false;
        discrepanciesAr.push(`القدرة (${inv.rated_power_kw} kW) تختلف عن المطلوب (${criteria.rated_power_kw} kW)`);
        discrepanciesEn.push(`Power capacity (${inv.rated_power_kw} kW) deviates from required (${criteria.rated_power_kw} kW)`);
      }
      score += powerScore;
    } else {
      score += 15;
    }

    // 5. Application Match (Weight: 5 pts)
    let applicationMatch = true;
    if (criteria.application) {
      if (inv.application.includes(criteria.application)) {
        score += 5;
      } else {
        applicationMatch = false;
        score += 1;
      }
    } else {
      score += 3;
    }

    // 6. Efficiency & Technical Specs (Weight: 5 pts)
    let efficiencyScore = 0;
    if (typeof inv.efficiency_percent === 'number') {
      if (inv.efficiency_percent >= 98.5) efficiencyScore = 5;
      else if (inv.efficiency_percent >= 96) efficiencyScore = 4;
      else efficiencyScore = 3;
    } else {
      efficiencyScore = 2;
    }
    score += efficiencyScore;

    // Availability penalty
    const availabilityMatch = inv.availability;
    if (!availabilityMatch) {
      score -= 10;
    }

    // Normalize final score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    // Generate human-friendly reasoning
    const reasonsAr: string[] = [];
    const reasonsEn: string[] = [];

    if (typeMatch && criteria.type) {
      reasonsAr.push(`مطابق تماماً للنوع المطلوب (${inv.type})`);
      reasonsEn.push(`Matches requested type (${inv.type})`);
    }
    if (criteria.rated_power_kw) {
      if (powerDiffKw === 0) {
        reasonsAr.push(`القدرة مطابقة 100% (${inv.rated_power_kw} kW)`);
        reasonsEn.push(`Exact power match (${inv.rated_power_kw} kW)`);
      } else {
        reasonsAr.push(`قدرة قريبة جداً (${inv.rated_power_kw} kW بفارق ${powerDiffKw.toFixed(1)} kW)`);
        reasonsEn.push(`Close capacity (${inv.rated_power_kw} kW, diff ${powerDiffKw.toFixed(1)} kW)`);
      }
    }
    if (phaseMatch && criteria.phase) {
      reasonsAr.push(`متوافق مع الطور الكهربائي (${inv.phase})`);
      reasonsEn.push(`Compatible with grid phase (${inv.phase})`);
    }
    if (criteria.battery_required !== undefined) {
      if (criteria.battery_required && inv.battery_support) {
        reasonsAr.push('يدعم بنك البطاريات المطلوب لتخزين الطاقة');
        reasonsEn.push('Supports required battery storage');
      } else if (!criteria.battery_required && !inv.battery_support) {
        reasonsAr.push('تصميم أون-جريد مباشر للشبكة بدون تكلفة بطاريات');
        reasonsEn.push('Direct on-grid without battery overhead');
      }
    }
    if (criteria.application && inv.application.includes(criteria.application)) {
      reasonsAr.push(`مناسب هندسياً للاستخدام (${criteria.application})`);
      reasonsEn.push(`Engineered for ${criteria.application} application`);
    }
    if (typeof inv.efficiency_percent === 'number' && inv.efficiency_percent >= 98) {
      reasonsAr.push(`كفاءة تحويل فائقة تصل إلى ${inv.efficiency_percent}%`);
      reasonsEn.push(`High conversion efficiency of ${inv.efficiency_percent}%`);
    }

    results.push({
      product: inv,
      score: finalScore,
      isCompatible,
      matchBreakdown: {
        typeMatch,
        powerDiffKw,
        powerProximityScore: powerScore,
        phaseMatch,
        batteryMatch,
        applicationMatch,
        efficiencyScore,
        availabilityMatch,
      },
      recommendationReason: reasonsEn.join(' • ') || 'Verified product from Enerjoo catalog',
      recommendationReasonAr: reasonsAr.join(' • ') || 'منتج معتمد ومطابق من كتالوج إينرجو',
      discrepancyAr: discrepanciesAr.join(' • ') || undefined,
      discrepancyEn: discrepanciesEn.join(' • ') || undefined
    });
  }

  // 10-step AI Recommendation Logic Ranking:
  // 1. Compatibility with customer requirements
  // 2. Correct Inverter Type
  // 3. Correct Power (lowest difference)
  // 4. Correct Phase
  // 5. Application suitability
  // 6. Technical specifications (MPPT, Voltage)
  // 7. Efficiency (higher is better)
  // 8. Battery compatibility
  // 9. Price (lower is better for same specs)
  // 10. Availability
  results.sort((a, b) => {
    // 1. Compatible items strictly first
    if (a.isCompatible && !b.isCompatible) return -1;
    if (!a.isCompatible && b.isCompatible) return 1;

    // 2. In-stock availability first
    if (a.product.availability && !b.product.availability) return -1;
    if (!a.product.availability && b.product.availability) return 1;

    // 3. Overall composite score
    if (b.score !== a.score) return b.score - a.score;

    // 4. Closer power proximity
    if (a.matchBreakdown.powerDiffKw !== b.matchBreakdown.powerDiffKw) {
      return a.matchBreakdown.powerDiffKw - b.matchBreakdown.powerDiffKw;
    }

    // 5. Efficiency
    const effA = typeof a.product.efficiency_percent === 'number' ? a.product.efficiency_percent : 0;
    const effB = typeof b.product.efficiency_percent === 'number' ? b.product.efficiency_percent : 0;
    if (effB !== effA) return effB - effA;

    // 6. Price
    return a.product.price - b.product.price;
  });

  return results;
}

/**
 * Builds a structured comparison table across best match, alternative, and best value
 */
export function buildInverterComparisonTable(
  bestMatch: StructuredInverter,
  alternative?: StructuredInverter,
  bestValue?: StructuredInverter
): InverterComparisonTable {
  const headers = ['Specification', 'Best Match'];
  const headersAr = ['المواصفة', 'أفضل اختيار'];

  if (alternative) {
    headers.push('Alternative');
    headersAr.push('البديل المقترح');
  }
  if (bestValue && bestValue.id !== bestMatch.id && (!alternative || bestValue.id !== alternative.id)) {
    headers.push('Best Value');
    headersAr.push('أفضل قيمة');
  }

  const formatEfficiency = (val?: number | 'Unknown') => {
    if (typeof val === 'number') return `${val}%`;
    return 'Unknown';
  };

  const formatPrice = (val?: number) => {
    if (!val || val === 0) return 'حسب الطلب / Upon Request';
    return `${val.toLocaleString('ar-EG')} ج.م`;
  };

  const formatBattery = (inv: StructuredInverter) => {
    if (inv.battery_support) {
      return inv.battery_voltage_range && inv.battery_voltage_range !== 'Unknown'
        ? `نعم (${inv.battery_voltage_range})`
        : 'نعم / Yes';
    }
    return 'لا / No (On-Grid)';
  };

  const rows: InverterComparisonRow[] = [
    {
      key: 'brand',
      label: 'Brand',
      labelAr: 'العلامة التجارية',
      bestMatch: bestMatch.brand,
      alternative: alternative?.brand,
      bestValue: bestValue?.brand
    },
    {
      key: 'model',
      label: 'Model',
      labelAr: 'الموديل',
      bestMatch: bestMatch.model,
      alternative: alternative?.model,
      bestValue: bestValue?.model
    },
    {
      key: 'rated_power',
      label: 'Rated Power',
      labelAr: 'القدرة الإسمية (kW)',
      bestMatch: `${bestMatch.rated_power_kw} kW`,
      alternative: alternative ? `${alternative.rated_power_kw} kW` : undefined,
      bestValue: bestValue ? `${bestValue.rated_power_kw} kW` : undefined
    },
    {
      key: 'type',
      label: 'Inverter Type',
      labelAr: 'نوع الإنفرتر',
      bestMatch: bestMatch.type,
      alternative: alternative?.type,
      bestValue: bestValue?.type
    },
    {
      key: 'phase',
      label: 'Phase',
      labelAr: 'عدد الأطوار',
      bestMatch: bestMatch.phase,
      alternative: alternative?.phase,
      bestValue: bestValue?.phase
    },
    {
      key: 'mppt',
      label: 'MPPT Count',
      labelAr: 'عدد متتبعات MPPT',
      bestMatch: bestMatch.mppt_count ?? 'Unknown',
      alternative: alternative?.mppt_count ?? 'Unknown',
      bestValue: bestValue?.mppt_count ?? 'Unknown'
    },
    {
      key: 'efficiency',
      label: 'Efficiency',
      labelAr: 'أقصى كفاءة',
      bestMatch: formatEfficiency(bestMatch.efficiency_percent),
      alternative: alternative ? formatEfficiency(alternative.efficiency_percent) : undefined,
      bestValue: bestValue ? formatEfficiency(bestValue.efficiency_percent) : undefined
    },
    {
      key: 'battery_support',
      label: 'Battery Support',
      labelAr: 'دعم البطاريات',
      bestMatch: formatBattery(bestMatch),
      alternative: alternative ? formatBattery(alternative) : undefined,
      bestValue: bestValue ? formatBattery(bestValue) : undefined
    },
    {
      key: 'application',
      label: 'Application',
      labelAr: 'الاستخدام المناسب',
      bestMatch: bestMatch.application.join(', '),
      alternative: alternative?.application.join(', '),
      bestValue: bestValue?.application.join(', ')
    },
    {
      key: 'price',
      label: 'Price',
      labelAr: 'السعر',
      bestMatch: formatPrice(bestMatch.price),
      alternative: alternative ? formatPrice(alternative.price) : undefined,
      bestValue: bestValue ? formatPrice(bestValue.price) : undefined
    },
    {
      key: 'availability',
      label: 'Availability',
      labelAr: 'التوافر في المخزن',
      bestMatch: bestMatch.availability ? 'متوفر فورياً / In Stock' : 'غير متوفر / Out of Stock',
      alternative: alternative ? (alternative.availability ? 'متوفر / In Stock' : 'غير متوفر') : undefined,
      bestValue: bestValue ? (bestValue.availability ? 'متوفر / In Stock' : 'غير متوفر') : undefined
    }
  ];

  return {
    headers,
    headersAr,
    rows
  };
}

/**
 * Transforms a StructuredInverter into a TierProductRecommendation
 */
function createTierRecommendation(
  inv: StructuredInverter,
  tier: 'best_match' | 'alternative' | 'best_value' | 'closest_alternative',
  score: number,
  whyChosenAr: string,
  whyChosenEn: string,
  diffAr?: string,
  diffEn?: string,
  discrepancyAr?: string,
  discrepancyEn?: string
): TierProductRecommendation {
  const tierLabels = {
    best_match: { en: 'Best Match', ar: 'أفضل اختيار' },
    alternative: { en: 'Alternative', ar: 'البديل المقترح' },
    best_value: { en: 'Best Value', ar: 'أفضل قيمة مقابل السعر' },
    closest_alternative: { en: 'Closest Available Alternative', ar: 'أقرب خيار متاح في الكتالوج' }
  };

  return {
    tier,
    tierLabel: tierLabels[tier].en,
    tierLabelAr: tierLabels[tier].ar,
    product_id: inv.id,
    catalog_source: 'Enerjoo',
    product_url: `/product/${inv.id}`,
    brand: inv.brand,
    model: inv.model,
    name: inv.name,
    nameAr: inv.nameAr,
    type: inv.type,
    rated_power_kw: inv.rated_power_kw,
    phase: inv.phase,
    efficiency_percent: inv.efficiency_percent ?? 'Unknown',
    mppt_count: inv.mppt_count ?? 'Unknown',
    battery_support: inv.battery_support,
    price: inv.price,
    availability: inv.availability,
    image: inv.image,
    score,
    why_chosen_ar: whyChosenAr,
    why_chosen_en: whyChosenEn,
    difference_ar: diffAr,
    difference_en: diffEn,
    discrepancy_ar: discrepancyAr,
    discrepancy_en: discrepancyEn,
    full_product: inv
  };
}

/**
 * Builds the complete AI Sales & Recommendation Agent response for Enerjoo & n8n
 */
export function buildAgentInverterRecommendation(
  inverters: StructuredInverter[],
  criteria: InverterQueryCriteria,
  rawQuery?: string
): InverterAgentRecommendationResponse {
  const allMatches = matchInverters(inverters, criteria);
  const compatibleMatches = allMatches.filter(m => m.isCompatible);

  // Case 1: Exact / Compatible Matches Found
  if (compatibleMatches.length > 0) {
    // If the customer specifically requested the cheapest option, re-sort compatible matches by price ascending
    if (criteria.intent === 'cheapest') {
      compatibleMatches.sort((a, b) => {
        // Price ascending
        if (a.product.price !== b.product.price) {
          return a.product.price - b.product.price;
        }
        return b.score - a.score;
      });
    } else if (criteria.intent === 'highest_efficiency') {
      // Prioritize highest efficiency
      compatibleMatches.sort((a, b) => {
        const effA = typeof a.product.efficiency_percent === 'number' ? a.product.efficiency_percent : 0;
        const effB = typeof b.product.efficiency_percent === 'number' ? b.product.efficiency_percent : 0;
        if (effB !== effA) return effB - effA;
        return b.score - a.score;
      });
    }

    const bestMatchResult = compatibleMatches[0];
    const bestInv = bestMatchResult.product;

    // Pick Alternative: Different model or brand or adjacent power
    const alternativeResult = compatibleMatches.find(m => m.product.id !== bestInv.id) || null;
    const altInv = alternativeResult?.product;

    // Pick Best Value: Lowest price per kW or lowest absolute price among compatible products
    const sortedByValue = compatibleMatches
      .filter(m => m.product.price > 0)
      .slice()
      .sort((a, b) => {
        const pkwA = a.product.price / a.product.rated_power_kw;
        const pkwB = b.product.price / b.product.rated_power_kw;
        return pkwA - pkwB;
      });

    // Find a distinct product for best value if possible
    let distinctValResult = sortedByValue.find(m => m.product.id !== bestInv.id && (!altInv || m.product.id !== altInv.id)) || null;
    const valInv = distinctValResult?.product;

    // Generate Comparison Table
    const comparisonTable = buildInverterComparisonTable(bestInv, altInv, valInv);

    // Generate Technical Differentiator Analysis
    const diffsAr: string[] = [];
    const diffsEn: string[] = [];

    if (altInv) {
      if (altInv.rated_power_kw !== bestInv.rated_power_kw) {
        const diffKw = altInv.rated_power_kw - bestInv.rated_power_kw;
        diffsAr.push(`القدرة: ${altInv.rated_power_kw} kW (${diffKw > 0 ? 'أعلى بمقدار' : 'أقل بمقدار'} ${Math.abs(diffKw)} kW)`);
        diffsEn.push(`Power: ${altInv.rated_power_kw} kW (${diffKw > 0 ? '+' : ''}${diffKw} kW)`);
      }
      if (typeof altInv.efficiency_percent === 'number' && typeof bestInv.efficiency_percent === 'number') {
        const effDiff = (altInv.efficiency_percent - bestInv.efficiency_percent).toFixed(1);
        diffsAr.push(`الكفاءة: ${altInv.efficiency_percent}% (فارق ${effDiff}%)`);
        diffsEn.push(`Efficiency: ${altInv.efficiency_percent}% (diff ${effDiff}%)`);
      }
      if (altInv.price > 0 && bestInv.price > 0) {
        const priceDiff = altInv.price - bestInv.price;
        if (priceDiff < 0) {
          diffsAr.push(`السعر: أوفر بحوالي ${Math.abs(priceDiff).toLocaleString('ar-EG')} ج.م`);
          diffsEn.push(`Price: cheaper by ${Math.abs(priceDiff).toLocaleString()} EGP`);
        } else if (priceDiff > 0) {
          diffsAr.push(`السعر: أعلى بحوالي ${priceDiff.toLocaleString('ar-EG')} ج.م`);
          diffsEn.push(`Price: higher by ${priceDiff.toLocaleString()} EGP`);
        }
      }
      if (altInv.mppt_count !== 'Unknown' && bestInv.mppt_count !== 'Unknown' && altInv.mppt_count !== bestInv.mppt_count) {
        diffsAr.push(`عدد MPPT: ${altInv.mppt_count} متتبع مقارنة بـ ${bestInv.mppt_count} للأول`);
        diffsEn.push(`MPPT Trackers: ${altInv.mppt_count} vs ${bestInv.mppt_count}`);
      }
    }

    const whyBestMatchAr = [
      `مطابقة تامة للقدرة المطلوبة (${bestInv.rated_power_kw} kW).`,
      `متوافق مع الطور الشبكي (${bestInv.phase}).`,
      `تصنيف ${bestInv.type} مثالي للاستخدام (${bestInv.application.join(' / ')}).`,
      typeof bestInv.efficiency_percent === 'number' ? `كفاءة تشغيل ممتازة (${bestInv.efficiency_percent}%).` : null,
      bestInv.mppt_count && bestInv.mppt_count !== 'Unknown' ? `مزود بـ ${bestInv.mppt_count} متتبعات MPPT لتوزيع السلاسل بأعلى إنتاجية.` : null,
      bestInv.availability ? 'متوفر في المخازن مع ضمان رسمي.' : 'منتج معتمد في الكتالوج.'
    ].filter(Boolean).join(' ');

    const whyBestMatchEn = [
      `Exact power capacity match (${bestInv.rated_power_kw} kW).`,
      `Grid phase match (${bestInv.phase}).`,
      `${bestInv.type} classification designed for ${bestInv.application.join(', ')}.`,
      typeof bestInv.efficiency_percent === 'number' ? `High efficiency of ${bestInv.efficiency_percent}%.` : null,
      bestInv.mppt_count && bestInv.mppt_count !== 'Unknown' ? `Equipped with ${bestInv.mppt_count} MPPT trackers.` : null,
      'Verified in Enerjoo real catalog.'
    ].filter(Boolean).join(' ');

    const bestMatchTier = createTierRecommendation(
      bestInv,
      'best_match',
      bestMatchResult.score,
      whyBestMatchAr,
      whyBestMatchEn
    );

    const alternativeTier = altInv && alternativeResult
      ? createTierRecommendation(
          altInv,
          'alternative',
          alternativeResult.score,
          `بديل هندسي متوافق من فئة ${altInv.power_range}.`,
          `Compatible technical alternative.`,
          diffsAr.join(' • '),
          diffsEn.join(' • ')
        )
      : null;

    const bestValueTier = valInv && distinctValResult
      ? createTierRecommendation(
          valInv,
          'best_value',
          distinctValResult.score,
          `أفضل سعر لكل كيلوواط قدرة (${Math.round(valInv.price / valInv.rated_power_kw).toLocaleString('ar-EG')} ج.م/kW).`,
          `Best value per kW power ratio.`,
          `سعر اقتصادي: ${valInv.price.toLocaleString('ar-EG')} ج.م`
        )
      : createTierRecommendation(
          bestInv,
          'best_value',
          bestMatchResult.score,
          `هو نفسه أفضل اختيار وأوفر سعر متوافق في الكتالوج (${bestInv.price.toLocaleString('ar-EG')} ج.م).`,
          `The best match is also the most cost-effective compatible option.`,
          `أوفر سعر متوافق: ${bestInv.price.toLocaleString('ar-EG')} ج.م`
        );

    // Formatted conversational response in Arabic
    let convAr = `⚡ **أفضل اختيار من كتالوج Enerjoo:**\n`;
    convAr += `**${bestInv.brand} ${bestInv.model}**\n`;
    convAr += `• القدرة: **${bestInv.rated_power_kw} kW**\n`;
    convAr += `• الطور: **${bestInv.phase}**\n`;
    convAr += `• النوع: **${bestInv.type}**\n`;
    if (typeof bestInv.efficiency_percent === 'number') {
      convAr += `• الكفاءة: **${bestInv.efficiency_percent}%**\n`;
    }
    if (bestInv.mppt_count && bestInv.mppt_count !== 'Unknown') {
      convAr += `• عدد متتبعات MPPT: **${bestInv.mppt_count}**\n`;
    }
    convAr += `• السعر: **${bestInv.price > 0 ? bestInv.price.toLocaleString('ar-EG') + ' ج.م' : 'حسب العرض'}**\n`;
    convAr += `• التوافر: **${bestInv.availability ? 'متوفر في المخزن ✅' : 'حسب الحجز'}**\n\n`;
    convAr += `🔍 **لماذا تم اختياره؟**\n`;
    convAr += `${whyBestMatchAr}\n\n`;

    if (altInv) {
      convAr += `🔄 **البديل المقترح:**\n`;
      convAr += `**${altInv.brand} ${altInv.model}** (${altInv.rated_power_kw} kW / ${altInv.phase})\n`;
      convAr += `• الفرق: ${diffsAr.join(' | ')}\n`;
      convAr += `• السعر: ${altInv.price > 0 ? altInv.price.toLocaleString('ar-EG') + ' ج.م' : 'حسب العرض'}\n\n`;
    }

    if (valInv) {
      convAr += `💎 **أفضل قيمة مقابل السعر:**\n`;
      convAr += `**${valInv.brand} ${valInv.model}** (${valInv.rated_power_kw} kW)\n`;
      convAr += `• السعر: ${valInv.price.toLocaleString('ar-EG')} ج.م\n\n`;
    }

    convAr += `🔗 [فتح ومطالعة المنتج في الكتالوج](/product/${bestInv.id})`;

    return {
      success: true,
      catalog_source: 'Enerjoo',
      exact_match_found: true,
      criteria,
      summary_ar: `تم العثور على ${compatibleMatches.length} منتج متوافق تماماً في كتالوج إينرجو. أفضل اختيار هو ${bestInv.brand} ${bestInv.model}.`,
      summary_en: `Found ${compatibleMatches.length} compatible products in Enerjoo catalog. Top match: ${bestInv.brand} ${bestInv.model}.`,
      best_match: bestMatchTier,
      alternative: alternativeTier,
      best_value: bestValueTier,
      comparison_table: comparisonTable,
      comparison_analysis_ar: diffsAr.join(' • ') || 'منتج فريد متوافق مع كافة المتطلبات.',
      comparison_analysis_en: diffsEn.join(' • ') || 'Unique compatible match meeting all specifications.',
      all_compatible_count: compatibleMatches.length,
      all_compatible_matches: compatibleMatches,
      conversational_response_ar: convAr,
      conversational_response_en: `Best match: ${bestInv.brand} ${bestInv.model} (${bestInv.rated_power_kw} kW, ${bestInv.phase}).`
    };
  }

  // Case 2: No Exact Match Found -> DO NOT invent! Show closest alternatives with clear discrepancies
  const closestCandidates = allMatches.slice(0, 3);
  const closestTiers: TierProductRecommendation[] = closestCandidates.map(m => {
    return createTierRecommendation(
      m.product,
      'closest_alternative',
      m.score,
      `أقرب بديل متاح في الكتالوج مع وجود فارق في بعض الشروط.`,
      `Closest available in catalog with some parameter divergence.`,
      undefined,
      undefined,
      m.discrepancyAr || 'فارق في بعض المواصفات المطلوبة',
      m.discrepancyEn || 'Specification discrepancy'
    );
  });

  let convAr = `⚠️ **لم يتم العثور على تطابق كامل 100% في كتالوج Enerjoo الحالي.**\n\n`;
  convAr += `نحن لا نخمن منتجات غير موجودة؛ ووفقاً للكتالوج الفعلي، إليك **أقرب الخيارات المتاحة** مع توضيح الفروق الفنية:\n\n`;

  closestCandidates.forEach((cand, idx) => {
    const p = cand.product;
    convAr += `${idx + 1}. **${p.brand} ${p.model}**\n`;
    convAr += `   • القدرة: ${p.rated_power_kw} kW | الطور: ${p.phase} | النوع: ${p.type}\n`;
    convAr += `   • **فارق التطابق:** ${cand.discrepancyAr || 'مواصفة مختلفة'}\n`;
    convAr += `   • السعر: ${p.price > 0 ? p.price.toLocaleString('ar-EG') + ' ج.م' : 'حسب العرض'}\n`;
    convAr += `   • [عرض في الكتالوج](/product/${p.id})\n\n`;
  });

  return {
    success: true,
    catalog_source: 'Enerjoo',
    exact_match_found: false,
    criteria,
    summary_ar: 'لم يتم العثور على تطابق كامل ومباشر في الكتالوج الحالي؛ تم عرض أقرب البدائل الحقيقية.',
    summary_en: 'No exact match found in catalog; closest verified alternatives are provided.',
    best_match: null,
    alternative: null,
    best_value: null,
    comparison_table: null,
    comparison_analysis_ar: 'لا يوجد تطابق كامل؛ أقرب المنتجات تختلف في الطور أو القدرة.',
    comparison_analysis_en: 'No exact match; closest products differ in phase or capacity.',
    all_compatible_count: 0,
    all_compatible_matches: [],
    closest_alternatives: closestTiers,
    conversational_response_ar: convAr,
    conversational_response_en: `No exact match found. Closest options: ${closestCandidates.map(c => c.product.brand + ' ' + c.product.model).join(', ')}.`
  };
}
