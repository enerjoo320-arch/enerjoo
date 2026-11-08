/**
 * Enerjoo Inverter Classification & Structured Product Data Specification
 * Single Source of Truth for:
 * - Enerjoo Website (Catalog, Search, Filters, Sizing Calculator)
 * - Enerjoo AI Agent on n8n (Webhooks & Tool Calling)
 * - Internal AI Services (Gemini Semantic Search & Advisor)
 */

export const INVERTER_MAIN_TYPES = [
  'On-Grid',
  'Hybrid',
  'Off-Grid',
  'Pump Inverter'
] as const;

export type InverterType = (typeof INVERTER_MAIN_TYPES)[number];

export const INVERTER_PHASES = [
  'Single Phase',
  'Three Phase'
] as const;

export type InverterPhase = (typeof INVERTER_PHASES)[number];

export const INVERTER_APPLICATIONS = [
  'Residential',
  'Commercial',
  'Industrial',
  'Agricultural',
  'Solar Pumping'
] as const;

export type InverterApplication = (typeof INVERTER_APPLICATIONS)[number];

export const INVERTER_POWER_RANGES = [
  '≤ 5 kW',
  '5–10 kW',
  '10–20 kW',
  '20–50 kW',
  '50–100 kW',
  '100–250 kW',
  '> 250 kW'
] as const;

export type InverterPowerRange = (typeof INVERTER_POWER_RANGES)[number];

/**
 * Helper to compute the Power Range classification for UI filters.
 * Note: AI agents must use the exact rated_power_kw, never the range alone.
 */
export function getInverterPowerRange(powerKw: number): InverterPowerRange {
  if (powerKw <= 5) return '≤ 5 kW';
  if (powerKw <= 10) return '5–10 kW';
  if (powerKw <= 20) return '10–20 kW';
  if (powerKw <= 50) return '20–50 kW';
  if (powerKw <= 100) return '50–100 kW';
  if (powerKw <= 250) return '100–250 kW';
  return '> 250 kW';
}

/**
 * Standardized Inverter Product Contract (Single Source of Truth)
 * Strict Rule: Never invent specs. Missing specs are represented as 'Unknown' or null, not guessed.
 */
export interface StructuredInverter {
  // Basic Information
  id: string | number;
  category: 'Inverter';
  brand: string;
  model: string;
  name: string;
  nameAr: string;
  type: InverterType;
  application: InverterApplication[];
  phase: InverterPhase;
  image: string;
  datasheet_url?: string;
  price: number;
  availability: boolean;
  status: 'available' | 'limited' | 'out_of_stock';

  // Electrical Specifications
  rated_power_kw: number;
  max_ac_power_kw?: number | 'Unknown';
  max_pv_power_kwp?: number | 'Unknown';
  max_pv_voltage_v?: number | 'Unknown';
  mppt_voltage_range_v?: string | 'Unknown';
  max_pv_current_a?: number | 'Unknown';
  mppt_count?: number | 'Unknown';
  max_ac_output_current_a?: number | 'Unknown';
  efficiency_percent?: number | 'Unknown';

  // Grid Information (On-Grid & Hybrid)
  ac_voltage_v?: string | number | 'Unknown';
  frequency_hz?: string | number | 'Unknown';
  grid_connection?: string | 'Unknown';

  // Battery Information (Hybrid & Off-Grid)
  battery_support: boolean;
  battery_voltage_v?: string | number | 'Unknown';
  battery_type?: string | 'Unknown';
  battery_voltage_range?: 'Low Voltage' | 'High Voltage' | 'Unknown';
  max_charging_current_a?: number | 'Unknown';
  max_discharging_current_a?: number | 'Unknown';

  // Pump Information (Pump Inverter)
  pump_horsepower_hp?: number | string;
  pump_application?: string | 'Unknown';
  motor_power_range?: string | 'Unknown';
  motor_voltage_v?: string | number | 'Unknown';
  max_motor_current_a?: number | 'Unknown';
  pump_mppt_range_v?: string | 'Unknown';

  // Auxiliary fields
  power_range: InverterPowerRange;
  warranty_years?: number | 'Unknown';
  notes?: string;
  supplierId?: string | number;
  suppliers?: Array<{
    id: string | number;
    name: string;
    nameAr?: string;
    price: number;
    phone: string;
    location: string;
    verified: boolean;
  }>;
}

/**
 * Filter criteria for Inverters
 */
export interface InverterFilterCriteria {
  type?: InverterType | 'all';
  phase?: InverterPhase | 'all';
  powerRange?: InverterPowerRange | 'all';
  application?: InverterApplication | 'all';
  batterySupport?: boolean | 'all';
  minPowerKw?: number;
  maxPowerKw?: number;
  brand?: string | 'all';
}

/**
 * Criteria passed to AI matching
 */
export interface InverterQueryCriteria {
  type?: InverterType;
  rated_power_kw?: number;
  phase?: InverterPhase;
  application?: InverterApplication;
  battery_required?: boolean;
  pv_power_kwp?: number;
  intent?: 'best_match' | 'cheapest' | 'highest_efficiency' | 'compare' | 'recommend_three' | 'general';
  min_efficiency?: number;
  max_price?: number;
}

/**
 * Detailed Match Result returned by Enerjoo AI & n8n Tool Calling
 */
export interface InverterMatchResult {
  product: StructuredInverter;
  score: number; // 0 to 100
  isCompatible: boolean;
  matchBreakdown: {
    typeMatch: boolean;
    powerDiffKw: number;
    powerProximityScore: number; // 0 to 35
    phaseMatch: boolean;
    batteryMatch: boolean;
    applicationMatch: boolean;
    efficiencyScore: number;
    availabilityMatch: boolean;
  };
  recommendationReason: string;
  recommendationReasonAr: string;
  discrepancyAr?: string;
  discrepancyEn?: string;
}

export interface InverterComparisonRow {
  key: string;
  label: string;
  labelAr: string;
  bestMatch: string | number;
  alternative?: string | number;
  bestValue?: string | number;
}

export interface InverterComparisonTable {
  headers: string[];
  headersAr: string[];
  rows: InverterComparisonRow[];
}

export interface TierProductRecommendation {
  tier: 'best_match' | 'alternative' | 'best_value' | 'closest_alternative';
  tierLabel: string;
  tierLabelAr: string;
  product_id: string | number;
  catalog_source: 'Enerjoo';
  product_url: string;
  brand: string;
  model: string;
  name: string;
  nameAr?: string;
  type: InverterType;
  rated_power_kw: number;
  phase: InverterPhase;
  efficiency_percent: number | 'Unknown';
  mppt_count: number | 'Unknown';
  battery_support: boolean;
  price: number;
  availability: boolean;
  image: string;
  score: number;
  why_chosen_ar: string;
  why_chosen_en: string;
  difference_ar?: string;
  difference_en?: string;
  discrepancy_ar?: string;
  discrepancy_en?: string;
  full_product: StructuredInverter;
}

export interface InverterAgentRecommendationResponse {
  success: boolean;
  catalog_source: 'Enerjoo';
  exact_match_found: boolean;
  criteria: InverterQueryCriteria;
  summary_ar: string;
  summary_en: string;
  best_match: TierProductRecommendation | null;
  alternative: TierProductRecommendation | null;
  best_value: TierProductRecommendation | null;
  comparison_table: InverterComparisonTable | null;
  comparison_analysis_ar: string;
  comparison_analysis_en: string;
  all_compatible_count: number;
  all_compatible_matches: InverterMatchResult[];
  closest_alternatives?: TierProductRecommendation[];
  conversational_response_ar: string;
  conversational_response_en: string;
}
