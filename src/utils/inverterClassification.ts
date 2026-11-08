/**
 * Inverter Classification & Normalization Engine for Enerjoo
 * Single Source of Truth for converting catalog items into StructuredInverter
 */

import { Product } from '../types';
import {
  StructuredInverter,
  InverterType,
  InverterPhase,
  InverterApplication,
  getInverterPowerRange
} from '../types/inverter';

/**
 * Normalizes text for reliable matching.
 */
function cleanText(str?: any): string {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase();
}

/**
 * Determines the strictly allowed InverterType:
 * 'On-Grid' | 'Hybrid' | 'Off-Grid' | 'Pump Inverter'
 * (No Microinverters).
 */
export function classifyInverterType(product: any): InverterType {
  const combined = [
    cleanText(product.product_type),
    cleanText(product.type),
    cleanText(product.specs?.productType),
    cleanText(product.specs?.type),
    cleanText(product.technology),
    cleanText(product.name),
    cleanText(product.model),
    cleanText(product.notes),
    cleanText(product.description),
  ].join(' ');

  // 1. Pump Inverter (Solar Pumping, VFD, طلمبة، مضخة، ري زراعي)
  const isPumpPumping = 
    combined.includes('pump') || 
    combined.includes('طلمب') || 
    combined.includes('مضخ') || 
    combined.includes('vfd') ||
    combined.includes('غاطس') ||
    combined.includes('solar pumping') ||
    /(?:^|\s)(?:ري|للري|مياه الري|محاصيل|طلمبة|مضخة)(?:\s|$)/.test(combined);

  if (isPumpPumping && !combined.includes('بطارية') && !combined.includes('battery')) {
    return 'Pump Inverter';
  }

  // 2. Hybrid (مختلط / هجين)
  if (
    combined.includes('hybrid') || 
    combined.includes('هايبرد') || 
    combined.includes('هجين') ||
    (combined.includes('on-grid') && combined.includes('battery') && !combined.includes('no battery'))
  ) {
    return 'Hybrid';
  }

  // 3. Off-Grid (منفصل عن الشبكة / أوف جريد)
  if (
    combined.includes('off grid') || 
    combined.includes('off-grid') || 
    combined.includes('أوف جريد') || 
    combined.includes('اوف جريد') ||
    combined.includes('منفصل') ||
    combined.includes('eastman') ||
    combined.includes('felicity')
  ) {
    return 'Off-Grid';
  }

  // 4. On-Grid (متصل بالشبكة / أون جريد)
  if (
    combined.includes('on grid') || 
    combined.includes('on-grid') || 
    combined.includes('أون جريد') || 
    combined.includes('اون جريد') ||
    combined.includes('متصل') ||
    combined.includes('grid-tied') ||
    combined.includes('grid tied') ||
    combined.includes('string inverter') ||
    combined.includes('sun2000') ||
    combined.includes('huawei')
  ) {
    return 'On-Grid';
  }

  // Default fallback based on battery presence
  const hasBattery = product.battery_voltage_v || product.specs?.batteryVoltage || product.battery_support === true;
  return hasBattery ? 'Off-Grid' : 'On-Grid';
}

/**
 * Determines Phase: 'Single Phase' | 'Three Phase'
 */
export function classifyInverterPhase(product: any): InverterPhase {
  const combined = [
    cleanText(product.product_type),
    cleanText(product.type),
    cleanText(product.specs?.phase),
    cleanText(product.specs?.acVoltageV),
    cleanText(product.ac_voltage_v),
    cleanText(product.name),
    cleanText(product.model),
    cleanText(product.notes),
    cleanText(product.description),
  ].join(' ');

  // Explicit Three Phase
  if (
    combined.includes('three-phase') ||
    combined.includes('three phase') ||
    combined.includes('3-phase') ||
    combined.includes('3 phase') ||
    combined.includes('3 فاز') ||
    combined.includes('ثلاثي') ||
    combined.includes('380') ||
    combined.includes('400') ||
    combined.includes('480')
  ) {
    return 'Three Phase';
  }

  // Explicit Single Phase
  if (
    combined.includes('single-phase') ||
    combined.includes('single phase') ||
    combined.includes('1-phase') ||
    combined.includes('1 phase') ||
    combined.includes('سنجل فاز') ||
    combined.includes('أحادي') ||
    combined.includes('1 فاز') ||
    combined.includes('220v') ||
    combined.includes('230v')
  ) {
    return 'Single Phase';
  }

  // Heuristic based on capacity: inverters >= 15 kW are almost universally Three Phase
  const powerKw = extractRatedPowerKw(product);
  if (powerKw >= 15) {
    return 'Three Phase';
  }

  return 'Single Phase';
}

/**
 * Extracts rated power in kW accurately.
 */
export function extractRatedPowerKw(product: any): number {
  if (product.rated_power_kw && !isNaN(Number(product.rated_power_kw))) {
    return Number(product.rated_power_kw);
  }
  if (product.specs?.ratedPowerKw && !isNaN(Number(product.specs.ratedPowerKw))) {
    return Number(product.specs.ratedPowerKw);
  }
  if (product.specs?.powerKw && !isNaN(parseFloat(String(product.specs.powerKw)))) {
    return parseFloat(String(product.specs.powerKw));
  }
  if (product.power && !isNaN(Number(product.power))) {
    const p = Number(product.power);
    return p >= 1000 ? p / 1000 : p;
  }
  if (product.power_w && !isNaN(Number(product.power_w))) {
    const pw = Number(product.power_w);
    return pw >= 1000 ? pw / 1000 : pw;
  }

  // Regex extract from model name (e.g. "SUN2000-100KTL" -> 100, "inverter 6kw" -> 6)
  const text = `${product.model || ''} ${product.name || ''}`;
  const ktlMatch = text.match(/(\d+)\s*(?:ktl|kw|k)/i);
  if (ktlMatch) {
    return parseFloat(ktlMatch[1]);
  }

  return 0;
}

/**
 * Extracts Applications: 'Residential' | 'Commercial' | 'Industrial' | 'Agricultural' | 'Solar Pumping'
 */
export function classifyInverterApplications(product: any, type: InverterType, powerKw: number): InverterApplication[] {
  const text = [
    cleanText(product.notes),
    cleanText(product.description),
    cleanText(product.specs?.application),
    cleanText(product.application),
    cleanText(product.model),
    cleanText(product.name),
  ].join(' ');

  const applications: InverterApplication[] = [];

  // 1. Pump Inverter -> Agricultural, Solar Pumping
  const hasPumpApp = 
    type === 'Pump Inverter' || 
    text.includes('pump') || 
    text.includes('طلمب') || 
    text.includes('مضخ') || 
    /(?:^|[^\u0621-\u064A])(?:ري|للري|مياه الري)(?:[^\u0621-\u064A]|$)/.test(text);

  if (hasPumpApp) {
    applications.push('Solar Pumping', 'Agricultural');
    return applications;
  }

  // Check explicit keywords
  if (text.includes('residential') || text.includes('منزل') || text.includes('بيت') || text.includes('سكني') || text.includes('home')) {
    applications.push('Residential');
  }
  if (text.includes('commercial') || text.includes('تجاري') || text.includes('محل') || text.includes('شرك')) {
    applications.push('Commercial');
  }
  if (text.includes('industrial') || text.includes('صناعي') || text.includes('مصنع') || text.includes('معمل')) {
    applications.push('Industrial');
  }
  if (text.includes('agricultural') || text.includes('زراعي') || text.includes('مزرع')) {
    applications.push('Agricultural');
  }

  // If already tagged, return
  if (applications.length > 0) {
    return Array.from(new Set(applications));
  }

  // Capacity-based realistic mapping
  if (powerKw <= 10) {
    applications.push('Residential');
    if (powerKw >= 6) applications.push('Commercial');
  } else if (powerKw <= 40) {
    applications.push('Commercial');
    if (powerKw <= 15) applications.push('Residential');
    applications.push('Agricultural');
  } else {
    // 50kW - 250kW+
    applications.push('Commercial', 'Industrial');
    if (powerKw <= 115) applications.push('Agricultural');
  }

  return Array.from(new Set(applications));
}

/**
 * Extracts MPPT Count without hallucinating.
 * If not explicitly stated in specs or notes, returns 'Unknown'.
 */
function extractMpptCount(product: any): number | 'Unknown' {
  if (product.mppt_count !== undefined && product.mppt_count !== null && !isNaN(Number(product.mppt_count))) {
    return Number(product.mppt_count);
  }
  if (product.specs?.mpptCount !== undefined && !isNaN(Number(product.specs.mpptCount))) {
    return Number(product.specs.mpptCount);
  }
  if (product.specs?.numberOfMppt !== undefined && !isNaN(Number(product.specs.numberOfMppt))) {
    return Number(product.specs.numberOfMppt);
  }

  // Look in notes for explicit string like "10 MPPT" or "2 MPPT"
  const notes = `${product.notes || ''} ${product.description || ''} ${product.specs?.notes || ''}`;
  const match = notes.match(/(\d+)\s*(?:mppt|تتبع|مداخل mppt)/i);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0 && val <= 30) {
      return val;
    }
  }

  return 'Unknown';
}

/**
 * Extracts Max PV Input Voltage without guessing.
 */
function extractMaxPvVoltage(product: any): number | 'Unknown' {
  if (product.max_pv_open_circuit_voltage_v && !isNaN(Number(product.max_pv_open_circuit_voltage_v))) {
    return Number(product.max_pv_open_circuit_voltage_v);
  }
  if (product.specs?.maxPvOpenCircuitVoltageV && !isNaN(Number(product.specs.maxPvOpenCircuitVoltageV))) {
    return Number(product.specs.maxPvOpenCircuitVoltageV);
  }
  if (product.specs?.maxPvVoltage && !isNaN(Number(product.specs.maxPvVoltage))) {
    return Number(product.specs.maxPvVoltage);
  }

  // Look in notes: "أقصى 1100 فولت" or "1100V" or "1000V"
  const notes = `${product.notes || ''} ${product.description || ''}`;
  const match = notes.match(/(?:أقصى|max)\s*(\d{3,4})\s*(?:v|فولت)/i) || notes.match(/(\d{3,4})\s*(?:v|فولت)\s*(?:dc|دخل)/i);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val >= 100 && val <= 2000) {
      return val;
    }
  }

  return 'Unknown';
}

/**
 * Extracts Max PV Input Current (A).
 */
function extractMaxPvCurrent(product: any): number | 'Unknown' {
  if (product.max_pv_input_current_a && !isNaN(Number(product.max_pv_input_current_a))) {
    return Number(product.max_pv_input_current_a);
  }
  if (product.specs?.maxPvInputCurrentA && !isNaN(Number(product.specs.maxPvInputCurrentA))) {
    return Number(product.specs.maxPvInputCurrentA);
  }
  return 'Unknown';
}

/**
 * Extracts Efficiency without guessing.
 */
function extractEfficiency(product: any): number | 'Unknown' {
  if (product.efficiency_percent && !isNaN(Number(product.efficiency_percent)) && Number(product.efficiency_percent) > 0) {
    return Number(product.efficiency_percent);
  }
  if (product.efficiency && !isNaN(Number(product.efficiency)) && Number(product.efficiency) > 0) {
    return Number(product.efficiency);
  }
  if (product.specs?.peakEfficiency && !isNaN(Number(product.specs.peakEfficiency))) {
    return Number(product.specs.peakEfficiency);
  }

  const notes = `${product.notes || ''} ${product.description || ''}`;
  const match = notes.match(/كفاءة[^\d]*(\d{2}(?:\.\d+)?)\s*%/i) || notes.match(/(\d{2}(?:\.\d+)?)\s*%\s*efficiency/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val >= 80 && val <= 100) {
      return val;
    }
  }

  return 'Unknown';
}

/**
 * Main Classifier Function
 * Converts any raw product or catalog item into a clean, strictly typed StructuredInverter
 */
export function classifyInverter(rawProduct: Product | any): StructuredInverter {
  const id = rawProduct.product_id || rawProduct.id || '';
  const brand = (rawProduct.brand || '').trim();
  const model = (rawProduct.model || rawProduct.name || '').trim();
  const name = rawProduct.name || model || `Inverter ${id}`;
  const nameAr = rawProduct.nameAr || rawProduct.name || name;

  const type = classifyInverterType(rawProduct);
  const phase = classifyInverterPhase(rawProduct);
  const rated_power_kw = extractRatedPowerKw(rawProduct);
  const power_range = getInverterPowerRange(rated_power_kw);
  const application = classifyInverterApplications(rawProduct, type, rated_power_kw);

  // Electrical specifications (Strict: no guessing)
  const max_ac_power_kw = rawProduct.max_output_power_kw ? Number(rawProduct.max_output_power_kw) : 'Unknown';
  const max_pv_power_kwp = rawProduct.max_pv_array_power_w 
    ? Number(rawProduct.max_pv_array_power_w) / 1000 
    : (rawProduct.specs?.maxPvPowerKwp ? Number(rawProduct.specs.maxPvPowerKwp) : 'Unknown');
  const max_pv_voltage_v = extractMaxPvVoltage(rawProduct);
  const mppt_voltage_range_v = rawProduct.pv_mppt_voltage_range_v || rawProduct.specs?.pvMpptVoltageRangeV || rawProduct.specs?.mppt || 'Unknown';
  const max_pv_current_a = extractMaxPvCurrent(rawProduct);
  const mppt_count = extractMpptCount(rawProduct);
  const max_ac_output_current_a = rawProduct.imp_a || rawProduct.specs?.acOutputCurrentA || 'Unknown';
  const efficiency_percent = extractEfficiency(rawProduct);

  // Grid Information
  const ac_voltage_v = rawProduct.ac_voltage_v || rawProduct.specs?.acVoltageV || (phase === 'Three Phase' ? '380V / 400V' : '220V / 230V');
  const frequency_hz = rawProduct.frequency_hz || rawProduct.specs?.frequencyHz || '50/60 Hz';
  const grid_connection = phase === 'Three Phase' ? '3L + N + PE' : 'L + N + PE';

  // Battery Support (Strict Rule: true only if Hybrid or Off-Grid or explicitly configured)
  const battery_support = type === 'Hybrid' || type === 'Off-Grid' || rawProduct.battery_support === true;
  const battery_voltage_v = battery_support 
    ? (rawProduct.battery_voltage_v || rawProduct.specs?.batteryVoltage || (rated_power_kw <= 5 ? '48V' : '48V / High Voltage'))
    : 'Unknown';
  const battery_type = battery_support ? (rawProduct.specs?.batteryType || 'Lithium-Ion / Lead-Acid') : 'Unknown';
  const battery_voltage_range = battery_support 
    ? (rawProduct.specs?.batteryVoltageRange || (rated_power_kw > 15 ? 'High Voltage' : 'Low Voltage'))
    : 'Unknown';
  const max_charging_current_a = battery_support ? (rawProduct.specs?.maxChargingCurrentA || 'Unknown') : 'Unknown';
  const max_discharging_current_a = battery_support ? (rawProduct.specs?.maxDischargingCurrentA || 'Unknown') : 'Unknown';

  // Pump Information
  const isPump = type === 'Pump Inverter';
  const rawHp = rawProduct.hp || rawProduct.specs?.hp || rawProduct.specs?.horsepower || rawProduct.specs?.horsePower || rawProduct.specs?.pumpHorsepower;
  const calculatedHp = isPump ? (rawHp || (rated_power_kw ? Math.round(rated_power_kw * 1.34) : 'Unknown')) : undefined;
  const pump_application = isPump ? (rawProduct.specs?.pumpApplication || 'Agricultural Well & Submersible Pumping') : 'Unknown';
  const motor_power_range = isPump 
    ? (rawHp ? `${rawHp} HP (${rated_power_kw} kW)` : (rawProduct.specs?.motorPowerRange || `${Math.round(rated_power_kw * 1.34)} HP (${rated_power_kw} kW)`)) 
    : 'Unknown';
  const motor_voltage_v = isPump ? (phase === 'Three Phase' ? '380V AC (3-Phase)' : '220V AC (1-Phase)') : 'Unknown';
  const max_motor_current_a = isPump ? (rawProduct.specs?.maxMotorCurrentA || 'Unknown') : 'Unknown';
  const pump_mppt_range_v = isPump ? (mppt_voltage_range_v !== 'Unknown' ? mppt_voltage_range_v : 'Unknown') : 'Unknown';

  // Commercial & Availability
  const price = Number(rawProduct.price_egp ?? rawProduct.price ?? 0);
  const statusStr = String(rawProduct.availability || rawProduct.status || '').toLowerCase();
  const status: 'available' | 'limited' | 'out_of_stock' = 
    statusStr.includes('out') ? 'out_of_stock' : statusStr.includes('limit') ? 'limited' : 'available';
  const availability = status !== 'out_of_stock';

  const image = rawProduct.image_url || rawProduct.image || 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=2944&auto=format&fit=crop';
  const datasheet_url = rawProduct.datasheet_url || rawProduct.datasheetUrl;
  const warranty_years = rawProduct.warranty_years || rawProduct.warranty || 'Unknown';
  const notes = rawProduct.notes || rawProduct.description || '';

  return {
    id,
    category: 'Inverter',
    brand,
    model,
    name,
    nameAr,
    type,
    application,
    phase,
    image,
    datasheet_url,
    price,
    availability,
    status,
    rated_power_kw,
    max_ac_power_kw,
    max_pv_power_kwp,
    max_pv_voltage_v,
    mppt_voltage_range_v,
    max_pv_current_a,
    mppt_count,
    max_ac_output_current_a,
    efficiency_percent,
    ac_voltage_v,
    frequency_hz,
    grid_connection,
    battery_support,
    battery_voltage_v,
    battery_type,
    battery_voltage_range,
    max_charging_current_a,
    max_discharging_current_a,
    pump_horsepower_hp: calculatedHp,
    pump_application,
    motor_power_range,
    motor_voltage_v,
    max_motor_current_a,
    pump_mppt_range_v,
    power_range,
    warranty_years,
    notes,
    supplierId: rawProduct.supplierId || rawProduct.supplier_id || rawProduct.supplier,
    suppliers: rawProduct.suppliers,
  };
}
