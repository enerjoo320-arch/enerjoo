/**
 * Strict Numeric Parsing, Normalization, and Validation for Enerjoo Products.
 *
 * Ensures all product numeric fields across ProductForm.tsx, firestoreService.ts,
 * server.ts, and worker/index.ts:
 * - Convert valid integer and decimal values (e.g. 42.4, 99.8) accurately to finite numbers.
 * - Map empty optional fields to `null` (never automatically forcing 0 or sending "" or NaN).
 * - Reject NaN, Infinity, negative values (where inappropriate), and non-numeric strings
 *   with a clear error message naming the exact offending field.
 */

export interface NumericFieldMeta {
  key: string;
  labelAr: string;
  labelEn: string;
  integerOnly?: boolean;
  allowZero?: boolean;
}

export const PRODUCT_NUMERIC_FIELD_META: Record<string, NumericFieldMeta> = {
  price: {
    key: 'price',
    labelAr: 'السعر (price)',
    labelEn: 'Price (price)',
    integerOnly: false,
    allowZero: true,
  },
  price_egp: {
    key: 'price_egp',
    labelAr: 'السعر بالجنيه (price_egp)',
    labelEn: 'Price EGP (price_egp)',
    integerOnly: false,
    allowZero: true,
  },
  power: {
    key: 'power',
    labelAr: 'القدرة بالوات (power_w)',
    labelEn: 'Power in Watts (power_w)',
    integerOnly: false,
    allowZero: false,
  },
  power_w: {
    key: 'power_w',
    labelAr: 'القدرة بالوات (power_w)',
    labelEn: 'Power in Watts (power_w)',
    integerOnly: false,
    allowZero: false,
  },
  powerKw: {
    key: 'powerKw',
    labelAr: 'القدرة بالكيلوواط (rated_power_kw)',
    labelEn: 'Rated Power kW (rated_power_kw)',
    integerOnly: false,
    allowZero: false,
  },
  rated_power_kw: {
    key: 'rated_power_kw',
    labelAr: 'القدرة بالكيلوواط (rated_power_kw)',
    labelEn: 'Rated Power kW (rated_power_kw)',
    integerOnly: false,
    allowZero: false,
  },
  surge_power_w: {
    key: 'surge_power_w',
    labelAr: 'قدرة الذروة بالوات (surge_power_w)',
    labelEn: 'Surge Power W (surge_power_w)',
    integerOnly: false,
    allowZero: false,
  },
  hp: {
    key: 'hp',
    labelAr: 'القدرة بالحصان (hp)',
    labelEn: 'Horsepower (hp)',
    integerOnly: false,
    allowZero: false,
  },
  efficiency: {
    key: 'efficiency',
    labelAr: 'الكفاءة (efficiency)',
    labelEn: 'Efficiency % (efficiency)',
    integerOnly: false,
    allowZero: false,
  },
  efficiency_percent: {
    key: 'efficiency_percent',
    labelAr: 'الكفاءة (efficiency_percent)',
    labelEn: 'Efficiency % (efficiency_percent)',
    integerOnly: false,
    allowZero: false,
  },
  peak_efficiency_percent: {
    key: 'peak_efficiency_percent',
    labelAr: 'أقصى كفاءة (peak_efficiency_percent)',
    labelEn: 'Peak Efficiency % (peak_efficiency_percent)',
    integerOnly: false,
    allowZero: false,
  },
  warranty: {
    key: 'warranty',
    labelAr: 'سنوات الضمان (warranty)',
    labelEn: 'Warranty Years (warranty)',
    integerOnly: false,
    allowZero: true,
  },
  warranty_years: {
    key: 'warranty_years',
    labelAr: 'سنوات الضمان (warranty_years)',
    labelEn: 'Warranty Years (warranty_years)',
    integerOnly: false,
    allowZero: true,
  },
  vmp_v: {
    key: 'vmp_v',
    labelAr: 'جهد التشغيل الأقصى (Vmp / vmp_v)',
    labelEn: 'Max Power Voltage (Vmp / vmp_v)',
    integerOnly: false,
    allowZero: false,
  },
  Vmp: {
    key: 'Vmp',
    labelAr: 'جهد التشغيل الأقصى (Vmp)',
    labelEn: 'Max Power Voltage (Vmp)',
    integerOnly: false,
    allowZero: false,
  },
  voc_v: {
    key: 'voc_v',
    labelAr: 'جهد الدائرة المفتوحة (Voc / voc_v)',
    labelEn: 'Open Circuit Voltage (Voc / voc_v)',
    integerOnly: false,
    allowZero: false,
  },
  Voc: {
    key: 'Voc',
    labelAr: 'جهد الدائرة المفتوحة (Voc)',
    labelEn: 'Open Circuit Voltage (Voc)',
    integerOnly: false,
    allowZero: false,
  },
  imp_a: {
    key: 'imp_a',
    labelAr: 'تيار التشغيل الأقصى (Imp / imp_a)',
    labelEn: 'Max Power Current (Imp / imp_a)',
    integerOnly: false,
    allowZero: false,
  },
  Imp: {
    key: 'Imp',
    labelAr: 'تيار التشغيل الأقصى (Imp)',
    labelEn: 'Max Power Current (Imp)',
    integerOnly: false,
    allowZero: false,
  },
  isc_a: {
    key: 'isc_a',
    labelAr: 'تيار القصر (Isc / isc_a)',
    labelEn: 'Short Circuit Current (Isc / isc_a)',
    integerOnly: false,
    allowZero: false,
  },
  Isc: {
    key: 'Isc',
    labelAr: 'تيار القصر (Isc)',
    labelEn: 'Short Circuit Current (Isc)',
    integerOnly: false,
    allowZero: false,
  },
  maxPvVoltage: {
    key: 'maxPvVoltage',
    labelAr: 'أقصى جهد دخل للألواح (max_pv_open_circuit_voltage_v)',
    labelEn: 'Max PV Input Voltage (max_pv_open_circuit_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  max_pv_open_circuit_voltage_v: {
    key: 'max_pv_open_circuit_voltage_v',
    labelAr: 'أقصى جهد دخل للألواح (max_pv_open_circuit_voltage_v)',
    labelEn: 'Max PV Open Circuit Voltage (max_pv_open_circuit_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  mpptCount: {
    key: 'mpptCount',
    labelAr: 'عدد متتبعات MPPT (number_of_mppt)',
    labelEn: 'Number of MPPT Trackers (number_of_mppt)',
    integerOnly: true,
    allowZero: false,
  },
  mppt_count: {
    key: 'mppt_count',
    labelAr: 'عدد متتبعات MPPT (mppt_count)',
    labelEn: 'Number of MPPT Trackers (mppt_count)',
    integerOnly: true,
    allowZero: false,
  },
  number_of_mppt: {
    key: 'number_of_mppt',
    labelAr: 'عدد متتبعات MPPT (number_of_mppt)',
    labelEn: 'Number of MPPT Trackers (number_of_mppt)',
    integerOnly: true,
    allowZero: false,
  },
  number_of_cells: {
    key: 'number_of_cells',
    labelAr: 'عدد الخلايا (number_of_cells)',
    labelEn: 'Number of Cells (number_of_cells)',
    integerOnly: true,
    allowZero: false,
  },
  battery_voltage_v: {
    key: 'battery_voltage_v',
    labelAr: 'جهد البطارية (battery_voltage_v)',
    labelEn: 'Battery Voltage (battery_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  nominal_voltage_v: {
    key: 'nominal_voltage_v',
    labelAr: 'الجهد الاسمي (nominal_voltage_v)',
    labelEn: 'Nominal Voltage (nominal_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  capacity: {
    key: 'capacity',
    labelAr: 'سعة البطارية بالأمبير ساعة (capacity_ah)',
    labelEn: 'Battery Capacity Ah (capacity_ah)',
    integerOnly: false,
    allowZero: false,
  },
  capacity_ah: {
    key: 'capacity_ah',
    labelAr: 'سعة البطارية بالأمبير ساعة (capacity_ah)',
    labelEn: 'Battery Capacity Ah (capacity_ah)',
    integerOnly: false,
    allowZero: false,
  },
  nominal_energy_wh: {
    key: 'nominal_energy_wh',
    labelAr: 'الطاقة الاسمية (nominal_energy_wh)',
    labelEn: 'Nominal Energy Wh (nominal_energy_wh)',
    integerOnly: false,
    allowZero: false,
  },
  weight: {
    key: 'weight',
    labelAr: 'الوزن بالكيلوجرام (weight_kg)',
    labelEn: 'Weight kg (weight_kg)',
    integerOnly: false,
    allowZero: false,
  },
  weight_kg: {
    key: 'weight_kg',
    labelAr: 'الوزن بالكيلوجرام (weight_kg)',
    labelEn: 'Weight kg (weight_kg)',
    integerOnly: false,
    allowZero: false,
  },
  nw_kg: {
    key: 'nw_kg',
    labelAr: 'الوزن الصافي (nw_kg)',
    labelEn: 'Net Weight kg (nw_kg)',
    integerOnly: false,
    allowZero: false,
  },
  gw_kg: {
    key: 'gw_kg',
    labelAr: 'الوزن القائم (gw_kg)',
    labelEn: 'Gross Weight kg (gw_kg)',
    integerOnly: false,
    allowZero: false,
  },
  max_output_power_kw: {
    key: 'max_output_power_kw',
    labelAr: 'أقصى قدرة خرج (max_output_power_kw)',
    labelEn: 'Max Output Power kW (max_output_power_kw)',
    integerOnly: false,
    allowZero: false,
  },
  recommended_charge_voltage_v: {
    key: 'recommended_charge_voltage_v',
    labelAr: 'جهد الشحن الموصى به (recommended_charge_voltage_v)',
    labelEn: 'Recommended Charge Voltage V (recommended_charge_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  recommended_charge_current_a: {
    key: 'recommended_charge_current_a',
    labelAr: 'تيار الشحن الموصى به (recommended_charge_current_a)',
    labelEn: 'Recommended Charge Current A (recommended_charge_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  end_of_discharge_voltage_v: {
    key: 'end_of_discharge_voltage_v',
    labelAr: 'جهد نهاية التفريغ (end_of_discharge_voltage_v)',
    labelEn: 'End of Discharge Voltage V (end_of_discharge_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  max_continuous_charge_current_a: {
    key: 'max_continuous_charge_current_a',
    labelAr: 'أقصى تيار شحن مستمر (max_continuous_charge_current_a)',
    labelEn: 'Max Continuous Charge Current A (max_continuous_charge_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  max_continuous_discharge_current_a: {
    key: 'max_continuous_discharge_current_a',
    labelAr: 'أقصى تيار تفريغ مستمر (max_continuous_discharge_current_a)',
    labelEn: 'Max Continuous Discharge Current A (max_continuous_discharge_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  max_pv_array_power_w: {
    key: 'max_pv_array_power_w',
    labelAr: 'أقصى قدرة للألواح (max_pv_array_power_w)',
    labelEn: 'Max PV Array Power W (max_pv_array_power_w)',
    integerOnly: false,
    allowZero: false,
  },
  max_pv_input_current_a: {
    key: 'max_pv_input_current_a',
    labelAr: 'أقصى تيار دخل للألواح (max_pv_input_current_a)',
    labelEn: 'Max PV Input Current A (max_pv_input_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  max_solar_charger_current_a: {
    key: 'max_solar_charger_current_a',
    labelAr: 'أقصى تيار شاحن شمسي (max_solar_charger_current_a)',
    labelEn: 'Max Solar Charger Current A (max_solar_charger_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  max_ac_charger_current_a: {
    key: 'max_ac_charger_current_a',
    labelAr: 'أقصى تيار شاحن متردد (max_ac_charger_current_a)',
    labelEn: 'Max AC Charger Current A (max_ac_charger_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  max_charge_current_a: {
    key: 'max_charge_current_a',
    labelAr: 'أقصى تيار شحن (max_charge_current_a)',
    labelEn: 'Max Charge Current A (max_charge_current_a)',
    integerOnly: false,
    allowZero: false,
  },
  max_system_voltage_v: {
    key: 'max_system_voltage_v',
    labelAr: 'أقصى جهد للنظام (max_system_voltage_v)',
    labelEn: 'Max System Voltage V (max_system_voltage_v)',
    integerOnly: false,
    allowZero: false,
  },
  maximum_series_fuse_a: {
    key: 'maximum_series_fuse_a',
    labelAr: 'أقصى تيار للفيوز (maximum_series_fuse_a)',
    labelEn: 'Maximum Series Fuse A (maximum_series_fuse_a)',
    integerOnly: false,
    allowZero: false,
  },
  transfer_time_ms: {
    key: 'transfer_time_ms',
    labelAr: 'زمن التحويل بالمللي ثانية (transfer_time_ms)',
    labelEn: 'Transfer Time ms (transfer_time_ms)',
    integerOnly: false,
    allowZero: true,
  },
  dimLength: {
    key: 'dimLength',
    labelAr: 'الطول (length)',
    labelEn: 'Length (length)',
    integerOnly: false,
    allowZero: false,
  },
  length: {
    key: 'length',
    labelAr: 'الطول (length)',
    labelEn: 'Length (length)',
    integerOnly: false,
    allowZero: false,
  },
  dimWidth: {
    key: 'dimWidth',
    labelAr: 'العرض (width)',
    labelEn: 'Width (width)',
    integerOnly: false,
    allowZero: false,
  },
  width: {
    key: 'width',
    labelAr: 'العرض (width)',
    labelEn: 'Width (width)',
    integerOnly: false,
    allowZero: false,
  },
  dimThickness: {
    key: 'dimThickness',
    labelAr: 'السمك (thickness)',
    labelEn: 'Thickness (thickness)',
    integerOnly: false,
    allowZero: false,
  },
  thickness: {
    key: 'thickness',
    labelAr: 'السمك (thickness)',
    labelEn: 'Thickness (thickness)',
    integerOnly: false,
    allowZero: false,
  },
  area: {
    key: 'area',
    labelAr: 'المساحة (area)',
    labelEn: 'Area (area)',
    integerOnly: false,
    allowZero: false,
  },
};

/**
 * All numeric columns in the Cloudflare D1 `products` table.
 */
export const D1_PRODUCT_NUMERIC_COLUMNS = [
  'price_egp',
  'price',
  'power_w',
  'power',
  'rated_power_kw',
  'surge_power_w',
  'hp',
  'efficiency_percent',
  'efficiency',
  'peak_efficiency_percent',
  'warranty_years',
  'warranty',
  'vmp_v',
  'voc_v',
  'imp_a',
  'isc_a',
  'max_pv_open_circuit_voltage_v',
  'mppt_count',
  'number_of_mppt',
  'number_of_cells',
  'battery_voltage_v',
  'nominal_voltage_v',
  'capacity_ah',
  'nominal_energy_wh',
  'weight_kg',
  'nw_kg',
  'gw_kg',
  'max_output_power_kw',
  'recommended_charge_voltage_v',
  'recommended_charge_current_a',
  'end_of_discharge_voltage_v',
  'max_continuous_charge_current_a',
  'max_continuous_discharge_current_a',
  'max_pv_array_power_w',
  'max_pv_input_current_a',
  'max_solar_charger_current_a',
  'max_ac_charger_current_a',
  'max_charge_current_a',
  'max_system_voltage_v',
  'maximum_series_fuse_a',
  'transfer_time_ms',
  'length',
  'width',
  'thickness',
  'area',
] as const;

/**
 * Normalizes Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to standard ASCII (0-9)
 * and converts Arabic decimal separator (٫) to '.'.
 */
export function normalizeNumericDigits(raw: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const easternDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let out = raw;
  for (let i = 0; i < 10; i++) {
    out = out.replaceAll(arabicDigits[i], String(i)).replaceAll(easternDigits[i], String(i));
  }
  out = out.replace(/٫/g, '.');
  return out.trim();
}

/**
 * Strips trailing measurement unit suffixes ONLY when loading existing catalog records into form inputs
 * (e.g. "23kg" -> "23", "41.5V" -> "41.5", "200Ah" -> "200", "5kW" -> "5").
 * Does NOT alter slash-separated AC voltages like "380/400".
 */
export function stripLegacyUnitFromNumericInput(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  const str = normalizeNumericDigits(String(raw));
  if (!str) return '';
  const match = str.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(?:w|kw|v|vdc|vac|a|ah|wh|kwh|kg|g|mm|cm|m|m2|m²|hp|%|years?|yrs?|سنة|سنوات|وات|واط|كيلو\s*وات|كيلوواط|فولت|أمبير|امبير|كجم|كيلو|حصان)?$/i);
  if (match) {
    return match[1];
  }
  return str;
}

export interface NumericParseResult {
  valid: boolean;
  value: number | null;
  field: string;
  fieldKey: string;
  labelAr: string;
  labelEn: string;
  errorMessage?: string;
}

/**
 * Strictly parses and validates a single numeric field.
 * - Returns `value: null` if optional and empty (`undefined`, `null`, `""`).
 * - Supports both integers and decimals (e.g. 42.4, 99.8) unless `integerOnly` is true.
 * - Rejects `NaN`, `Infinity`, non-numeric strings, or embedded units with a clear error message naming the field.
 */
export function parseAndValidateNumericField(
  rawValue: unknown,
  fieldKey: string,
  options?: {
    required?: boolean;
    integerOnly?: boolean;
    allowZero?: boolean;
    customLabelAr?: string;
    customLabelEn?: string;
    lang?: 'ar' | 'en';
  }
): NumericParseResult {
  const meta = PRODUCT_NUMERIC_FIELD_META[fieldKey] || {
    key: fieldKey,
    labelAr: options?.customLabelAr || `${fieldKey}`,
    labelEn: options?.customLabelEn || `${fieldKey}`,
    integerOnly: false,
    allowZero: true,
  };

  const labelAr = options?.customLabelAr || meta.labelAr;
  const labelEn = options?.customLabelEn || meta.labelEn;
  const isAr = (options?.lang || 'ar') === 'ar';
  const integerOnly = options?.integerOnly ?? meta.integerOnly ?? false;
  const allowZero = options?.allowZero ?? meta.allowZero ?? true;

  // 1. Check empty / null / undefined
  if (
    rawValue === undefined ||
    rawValue === null ||
    (typeof rawValue === 'string' && rawValue.trim() === '')
  ) {
    if (options?.required) {
      return {
        valid: false,
        value: null,
        field: fieldKey,
        fieldKey,
        labelAr,
        labelEn,
        errorMessage: isAr
          ? `الحقل الرقمي المطلوب «${labelAr}» فارغ. يرجى إدخال قيمة رقمية صالحة.`
          : `Required numeric field "${labelEn}" is empty. Please enter a valid number.`,
      };
    }
    return {
      valid: true,
      value: null,
      field: fieldKey,
      fieldKey,
      labelAr,
      labelEn,
    };
  }

  // 2. Reject booleans, objects, arrays
  if (typeof rawValue === 'boolean' || typeof rawValue === 'object') {
    return {
      valid: false,
      value: null,
      field: fieldKey,
      fieldKey,
      labelAr,
      labelEn,
      errorMessage: isAr
        ? `قيمة الحقل الرقمي «${labelAr}» غير صالحة. يرجى إدخال رقم صحيح أو عشري صالح.`
        : `Invalid numeric value for field "${labelEn}".`,
    };
  }

  let parsedNum: number;

  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) {
      return {
        valid: false,
        value: null,
        field: fieldKey,
        fieldKey,
        labelAr,
        labelEn,
        errorMessage: isAr
          ? `قيمة الحقل الرقمي «${labelAr}» غير صالحة (NaN / Infinity). يرجى إدخال رقم صالح.`
          : `Invalid numeric value (NaN / Infinity) for field "${labelEn}".`,
      };
    }
    parsedNum = rawValue;
  } else if (typeof rawValue === 'string') {
    const normalized = normalizeNumericDigits(rawValue);
    // Strict numeric validation: must be an integer or decimal number without letters or units
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
      return {
        valid: false,
        value: null,
        field: fieldKey,
        fieldKey,
        labelAr,
        labelEn,
        errorMessage: isAr
          ? `قيمة الحقل الرقمي «${labelAr}» غير صالحة ("${rawValue}"). يرجى إدخال رقم صحيح أو عشري صالح فقط بدون حروف أو وحدات قياس.`
          : `Invalid numeric value for field "${labelEn}" ("${rawValue}"). Please enter a valid number without letters or units.`,
      };
    }
    parsedNum = Number(normalized);
    if (!Number.isFinite(parsedNum)) {
      return {
        valid: false,
        value: null,
        field: fieldKey,
        fieldKey,
        labelAr,
        labelEn,
        errorMessage: isAr
          ? `قيمة الحقل الرقمي «${labelAr}» غير صالحة ("${rawValue}").`
          : `Invalid numeric value for field "${labelEn}" ("${rawValue}").`,
      };
    }
  } else {
    return {
      valid: false,
      value: null,
      field: fieldKey,
      fieldKey,
      labelAr,
      labelEn,
      errorMessage: isAr
        ? `قيمة الحقل الرقمي «${labelAr}» غير صالحة.`
        : `Invalid numeric value for field "${labelEn}".`,
    };
  }

  // 3. Check negative numbers
  if (parsedNum < 0) {
    return {
      valid: false,
      value: null,
      field: fieldKey,
      fieldKey,
      labelAr,
      labelEn,
      errorMessage: isAr
        ? `قيمة الحقل الرقمي «${labelAr}» لا يمكن أن تكون سالبة (${parsedNum}).`
        : `Numeric field "${labelEn}" cannot be negative (${parsedNum}).`,
    };
  }

  // 4. Check zero when zero is not allowed (if field is required; if optional and 0 was passed by default, treat as null unless explicitly required)
  if (!allowZero && parsedNum === 0) {
    if (options?.required) {
      return {
        valid: false,
        value: null,
        field: fieldKey,
        fieldKey,
        labelAr,
        labelEn,
        errorMessage: isAr
          ? `قيمة الحقل الرقمي «${labelAr}» يجب أن تكون أكبر من الصفر.`
          : `Numeric field "${labelEn}" must be greater than zero.`,
      };
    }
    return {
      valid: true,
      value: null,
      field: fieldKey,
      fieldKey,
      labelAr,
      labelEn,
    };
  }

  // 5. Check integer requirement (e.g. mppt_count / number_of_mppt, number_of_cells)
  if (integerOnly && !Number.isInteger(parsedNum)) {
    return {
      valid: false,
      value: null,
      field: fieldKey,
      fieldKey,
      labelAr,
      labelEn,
      errorMessage: isAr
        ? `قيمة الحقل الرقمي «${labelAr}» يجب أن تكون رقماً صحيحاً بدون كسور عشرية (${rawValue}).`
        : `Field "${labelEn}" must be an integer without decimals (${rawValue}).`,
    };
  }

  // Round to avoid IEEE-754 floating-point noise (e.g. 42.400000000000006 -> 42.4)
  const cleanNum = Number(parsedNum.toFixed(6));

  return {
    valid: true,
    value: cleanNum,
    field: fieldKey,
    fieldKey,
    labelAr,
    labelEn,
  };
}

/**
 * Validates and normalizes all numeric fields in a product API payload (for server.ts, worker/index.ts, and firestoreService.ts).
 * Mutates `normalizedPayload` so that every numeric column is strictly `number | null`,
 * and returns the first validation error (including the exact field name) if any numeric field is invalid.
 */
export function validateAndNormalizeD1ProductNumericFields(
  rawBody: Record<string, any>,
  options?: { isUpdate?: boolean; lang?: 'ar' | 'en' }
): {
  valid: boolean;
  field?: string;
  errorMessage?: string;
  normalized: Record<string, any>;
  normalizedPayload: Record<string, any>;
} {
  const isUpdate = Boolean(options?.isUpdate);
  const lang = options?.lang || 'ar';
  const normalized: Record<string, any> = { ...rawBody };

  // Validate price if present or if creating a new product
  const priceKey = rawBody.price_egp !== undefined ? 'price_egp' : 'price';
  const rawPrice =
    rawBody.price_egp !== undefined
      ? rawBody.price_egp
      : rawBody.price !== undefined
      ? rawBody.price
      : undefined;

  if (!isUpdate || rawPrice !== undefined) {
    const priceCheck = parseAndValidateNumericField(rawPrice ?? 0, priceKey, {
      required: !isUpdate,
      allowZero: true,
      lang,
    });
    if (!priceCheck.valid) {
      return {
        valid: false,
        field: priceKey,
        errorMessage: priceCheck.errorMessage,
        normalized,
        normalizedPayload: normalized,
      };
    }
    normalized.price_egp = priceCheck.value ?? 0;
    normalized.price = priceCheck.value ?? 0;
  }

  // Validate all D1 numeric columns
  for (const col of D1_PRODUCT_NUMERIC_COLUMNS) {
    if (col === 'price_egp' || col === 'price') continue;
    if (!(col in rawBody)) continue;

    const rawVal = rawBody[col];
    const check = parseAndValidateNumericField(rawVal, col, {
      required: false,
      lang,
    });
    if (!check.valid) {
      return {
        valid: false,
        field: col,
        errorMessage: check.errorMessage,
        normalized,
        normalizedPayload: normalized,
      };
    }
    normalized[col] = check.value;
  }

  // Also check common alias fields if passed at top level (`Voc`, `Isc`, `Vmp`, `Imp`, `maxPvVoltage`, `mpptCount`, `powerKw`, `weight`, `capacity`)
  const aliasMappings: Array<{ alias: string; target: string }> = [
    { alias: 'Voc', target: 'voc_v' },
    { alias: 'Isc', target: 'isc_a' },
    { alias: 'Vmp', target: 'vmp_v' },
    { alias: 'Imp', target: 'imp_a' },
    { alias: 'maxPvVoltage', target: 'max_pv_open_circuit_voltage_v' },
    { alias: 'mpptCount', target: 'mppt_count' },
    { alias: 'powerKw', target: 'rated_power_kw' },
    { alias: 'weight', target: 'weight_kg' },
    { alias: 'capacity', target: 'capacity_ah' },
  ];

  for (const { alias, target } of aliasMappings) {
    if (alias in rawBody && rawBody[alias] !== undefined) {
      const check = parseAndValidateNumericField(rawBody[alias], alias, {
        required: false,
        lang,
      });
      if (!check.valid) {
        return {
          valid: false,
          field: alias,
          errorMessage: check.errorMessage,
          normalized,
          normalizedPayload: normalized,
        };
      }
      normalized[alias] = check.value;
      if (normalized[target] === undefined || normalized[target] === null) {
        normalized[target] = check.value;
      }
    }
  }

  return {
    valid: true,
    normalized,
    normalizedPayload: normalized,
  };
}
