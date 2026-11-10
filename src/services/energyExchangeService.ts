import { auth } from '../lib/firebase';
import { Product, SOLAR_PANEL_BRANDS, SolarPanelBrand } from '../types';
import { safeLocalStorage } from '../utils/safeStorage';

export interface EnergyExchangeRecord {
  price_id: string;
  category: string;
  brand: string;
  product_type?: string;
  price_per_watt: number;
  currency: string;
  min_wattage?: number | null;
  max_wattage?: number | null;
  effective_date?: string;
  updated_at?: string;
  updated_by?: string;
}

export const DEFAULT_SOLAR_PANEL_PRICES: Record<SolarPanelBrand, number> = {
  'Jinko': 8.50,
  'LONGi Solar': 12.20,
  'AIKO': 12.50,
  'Trina Solar': 11.90,
  'JA Solar': 11.95,
  'Risen': 11.80,
  'GCL': 11.75,
  'Suntech': 11.85,
  'Astronergy': 11.90,
  'Gokin': 11.70,
  'Quantum Solar': 11.80,
  'Ulica Solar': 11.75,
  'ZNShine Solar': 11.80,
};

const STORAGE_KEY_PRICES = 'enerjoo_solar_exchange_prices';
const STORAGE_KEY_RECORDS = 'enerjoo_solar_exchange_records_v2';

/**
 * Robustly matches an existing product to its approved solar panel brand.
 */
export function matchBrandToExchange(brandName?: string, productName?: string): SolarPanelBrand | null {
  const b = (brandName || '').toLowerCase().trim();
  const n = (productName || '').toLowerCase().trim();
  const combined = `${b} ${n}`;

  if (combined.includes('jinko')) return 'Jinko';
  if (combined.includes('longi')) return 'LONGi Solar';
  if (combined.includes('aiko')) return 'AIKO';
  if (combined.includes('trina')) return 'Trina Solar';
  if (combined.includes('ja solar') || b === 'ja' || combined.includes('jasolar')) return 'JA Solar';
  if (combined.includes('risen')) return 'Risen';
  if (combined.includes('gcl')) return 'GCL';
  if (combined.includes('suntech')) return 'Suntech';
  if (combined.includes('astronergy')) return 'Astronergy';
  if (combined.includes('gokin')) return 'Gokin';
  if (combined.includes('quantum')) return 'Quantum Solar';
  if (combined.includes('ulica')) return 'Ulica Solar';
  if (combined.includes('znshine') || combined.includes('zn-shine')) return 'ZNShine Solar';

  return null;
}

/**
 * Accurately extracts the rated power in Watts from product fields or title.
 */
export function getSolarPanelWattage(product: Product): number {
  if (product.power && product.power > 0) return product.power;
  if (product.specs?.powerKw && Number(product.specs.powerKw) > 0) {
    return Math.round(Number(product.specs.powerKw) * 1000);
  }
  if (product.specs?.ratedPowerKw && Number(product.specs.ratedPowerKw) > 0) {
    return Math.round(Number(product.specs.ratedPowerKw) * 1000);
  }
  const match = (product.name || '').match(/(\d{3,4})\s*[wW]/);
  if (match && match[1]) {
    return Number(match[1]);
  }
  return 0;
}

export interface BrandPriceMatchResult {
  matchedBrand: SolarPanelBrand | null;
  pricePerWatt: number | null;
  isRangeMatch: boolean;
  isOutOfBounds: boolean;
  minWattage?: number | null;
  maxWattage?: number | null;
  record?: EnergyExchangeRecord | null;
}

/**
 * Finds matching price per watt for a brand and wattage using records:
 * 1. Range matching if wattage ranges are defined for the brand.
 * 2. Legacy fallback if no ranges exist for the brand.
 * 3. Default price fallback if no DB records exist.
 * 4. Out of bounds if ranges exist but wattage doesn't fall in any defined range.
 */
export function findMatchingBrandPricePerWatt(
  records: EnergyExchangeRecord[],
  brandName?: string,
  productName?: string,
  wattage?: number
): BrandPriceMatchResult {
  const matchedBrand = matchBrandToExchange(brandName, productName);
  if (!matchedBrand) {
    return { matchedBrand: null, pricePerWatt: null, isRangeMatch: false, isOutOfBounds: false, record: null };
  }

  // Filter records for this brand
  const brandRecords = records.filter(r => {
    const bMatch = matchBrandToExchange(r.brand);
    return bMatch === matchedBrand || r.brand.toLowerCase() === matchedBrand.toLowerCase();
  });

  const rangeRecords = brandRecords.filter(r => r.min_wattage != null && r.max_wattage != null);
  const legacyRecords = brandRecords.filter(r => r.min_wattage == null || r.max_wattage == null);

  // If wattage is provided and brand has range records:
  if (wattage !== undefined && wattage > 0 && rangeRecords.length > 0) {
    const matchedRange = rangeRecords.find(r => r.min_wattage! <= wattage && r.max_wattage! >= wattage);
    if (matchedRange) {
      return {
        matchedBrand,
        pricePerWatt: matchedRange.price_per_watt,
        isRangeMatch: true,
        isOutOfBounds: false,
        minWattage: matchedRange.min_wattage,
        maxWattage: matchedRange.max_wattage,
        record: matchedRange
      };
    }
    // Out of bounds warning if ranges exist but wattage doesn't fit
    return {
      matchedBrand,
      pricePerWatt: null,
      isRangeMatch: false,
      isOutOfBounds: true,
      record: null
    };
  }

  // Fallback to legacy record if present
  if (legacyRecords.length > 0) {
    const legacy = legacyRecords[0];
    return {
      matchedBrand,
      pricePerWatt: legacy.price_per_watt,
      isRangeMatch: false,
      isOutOfBounds: false,
      record: legacy
    };
  }

  // Fallback to default static price
  const defaultPrice = DEFAULT_SOLAR_PANEL_PRICES[matchedBrand] ?? 12.00;
  return {
    matchedBrand,
    pricePerWatt: defaultPrice,
    isRangeMatch: false,
    isOutOfBounds: false,
    record: null
  };
}

/**
 * Computes pricing for a product based on Centralized Energy Exchange:
 * Panel Price = Panel Power (W) × Brand Price Per Watt (matched to range)
 * ONLY applies to solar panels. All other product categories remain strictly untouched.
 * Catalog prices are NEVER overwritten in Firestore/D1 `products` table.
 */
export function applySolarPanelPricing(
  product: Product,
  brandPrices: Record<string, number>,
  records: EnergyExchangeRecord[] = []
): Product {
  if (product.category !== 'panels') {
    return product;
  }

  const wattage = getSolarPanelWattage(product);
  const matchResult = findMatchingBrandPricePerWatt(records, product.brand, product.name, wattage > 0 ? wattage : undefined);

  const matchedBrand = matchResult.matchedBrand || matchBrandToExchange(product.brand, product.name);
  if (!matchedBrand) {
    return product;
  }

  // If wattage is out of bounds for defined ranges, keep original catalog price intact
  if (matchResult.isOutOfBounds || matchResult.pricePerWatt == null) {
    const fallbackPrice = brandPrices[matchedBrand] ?? DEFAULT_SOLAR_PANEL_PRICES[matchedBrand];
    return {
      ...product,
      exchangeBrand: matchedBrand,
      pricePerWatt: fallbackPrice
    };
  }

  const pricePerWatt = matchResult.pricePerWatt;

  // Preserve admin custom override if set on product
  const customPrice = Number(product.specs?.customPrice ?? (product as any).customPrice ?? 0);
  if (customPrice > 0) {
    const updatedSuppliers = (product.suppliers && product.suppliers.length > 0)
      ? product.suppliers.map(s => ({ ...s, price: customPrice }))
      : product.suppliers;
    return {
      ...product,
      price: customPrice,
      pricePerWatt,
      exchangeBrand: matchedBrand,
      suppliers: updatedSuppliers
    };
  }

  if (wattage <= 0) {
    return {
      ...product,
      pricePerWatt,
      exchangeBrand: matchedBrand
    };
  }

  const calculatedPrice = Math.round(wattage * pricePerWatt);

  const updatedSuppliers = (product.suppliers && product.suppliers.length > 0)
    ? product.suppliers.map(s => ({ ...s, price: calculatedPrice }))
    : product.suppliers;

  return {
    ...product,
    price: calculatedPrice,
    pricePerWatt,
    exchangeBrand: matchedBrand,
    suppliers: updatedSuppliers
  };
}

/**
 * Applies pricing to an array of products.
 */
export function applySolarPanelPricingToProducts(
  products: Product[],
  brandPrices: Record<string, number>,
  records: EnergyExchangeRecord[] = []
): Product[] {
  return products.map(p => applySolarPanelPricing(p, brandPrices, records));
}

/**
 * Gets cached prices from localStorage or fallback to defaults.
 */
export function getInitialExchangePrices(): Record<string, number> {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY_PRICES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_SOLAR_PANEL_PRICES, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SOLAR_PANEL_PRICES };
}

/**
 * Gets cached exchange records from localStorage or empty array.
 */
export function getInitialExchangeRecords(): EnergyExchangeRecord[] {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY_RECORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

type ExchangeRecordsListener = (records: EnergyExchangeRecord[], prices: Record<string, number>) => void;
const recordsListeners = new Set<ExchangeRecordsListener>();
let currentRecords: EnergyExchangeRecord[] = getInitialExchangeRecords();
let currentPricesMap: Record<string, number> = getInitialExchangePrices();

function notifyRecordsListeners(records: EnergyExchangeRecord[], prices: Record<string, number>) {
  currentRecords = records;
  currentPricesMap = prices;
  try {
    safeLocalStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
    safeLocalStorage.setItem(STORAGE_KEY_PRICES, JSON.stringify(prices));
  } catch {
    // ignore
  }
  recordsListeners.forEach(cb => {
    try {
      cb(records, prices);
    } catch (err) {
      console.error('Error in exchange records listener:', err);
    }
  });
}

/**
 * Subscribes to real-time updates from Cloudflare D1 Backend API.
 */
export function subscribeToEnergyExchange(
  callback: (prices: Record<string, number>, records?: EnergyExchangeRecord[]) => void
): () => void {
  const wrapper: ExchangeRecordsListener = (records, prices) => {
    callback(prices, records);
  };

  recordsListeners.add(wrapper);
  callback(currentPricesMap, currentRecords);

  const fetchExchangeData = async () => {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const recordsList: EnergyExchangeRecord[] = Array.isArray(data.records)
          ? data.records
          : (Array.isArray(data.data) ? data.data : []);
        const pricesObj = data.prices && typeof data.prices === 'object'
          ? { ...DEFAULT_SOLAR_PANEL_PRICES, ...data.prices }
          : { ...DEFAULT_SOLAR_PANEL_PRICES };

        notifyRecordsListeners(recordsList, pricesObj);
      }
    } catch (err) {
      console.warn('Notice fetching /api/energy-exchange/prices:', err);
    }
  };

  let intervalId: any = null;
  let handleFocus: (() => void) | null = null;
  let handleVisibility: (() => void) | null = null;
  let handleStorageChange: ((e: StorageEvent) => void) | null = null;

  if (typeof window !== 'undefined') {
    fetchExchangeData();

    handleFocus = () => fetchExchangeData();
    handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchExchangeData();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    intervalId = setInterval(fetchExchangeData, 10_000);

    handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_RECORDS && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            notifyRecordsListeners(parsed, currentPricesMap);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
  }

  return () => {
    recordsListeners.delete(wrapper);
    if (typeof window !== 'undefined') {
      if (handleFocus) window.removeEventListener('focus', handleFocus);
      if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility);
      if (handleStorageChange) window.removeEventListener('storage', handleStorageChange);
      if (intervalId) clearInterval(intervalId);
    }
  };
}

/**
 * Admin action: Adds a new Wattage Range for a solar panel brand in Cloudflare D1.
 * Atomic overlap validation enforced on D1 backend.
 */
export async function addSolarPanelBrandRange(
  brand: string,
  minWattage: number,
  maxWattage: number,
  pricePerWatt: number
): Promise<EnergyExchangeRecord> {
  if (!brand || !brand.trim()) throw new Error('يرجى تحديد العلامة التجارية');
  if (!minWattage || minWattage <= 0) throw new Error('الحد الأدنى للقدرة يجب أن يكون أكبر من 0 وات');
  if (!maxWattage || maxWattage < minWattage) throw new Error('الحد الأقصى للقدرة يجب أن يكون أكبر من أو يساوي الحد الأدنى');
  if (!pricePerWatt || pricePerWatt <= 0) throw new Error('يرجى إدخال سعر صحيح أكبر من الصفر');

  const roundedPrice = parseFloat(pricePerWatt.toFixed(2));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {
    // optional token
  }

  const res = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      brand: brand.trim(),
      min_wattage: minWattage,
      max_wattage: maxWattage,
      price_per_watt: roundedPrice,
      category: 'panels',
      product_type: 'Solar Panel',
      currency: 'EGP'
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل إضافة نطاق القدرة في قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل إضافة نطاق القدرة');
  }

  // Trigger refresh
  const getRes = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`);
  if (getRes.ok) {
    const latest = await getRes.json();
    const recordsList: EnergyExchangeRecord[] = Array.isArray(latest.records) ? latest.records : [];
    const pricesObj = latest.prices || currentPricesMap;
    notifyRecordsListeners(recordsList, pricesObj);
  }

  return data;
}

/**
 * Admin action: Updates an existing Wattage Range in Cloudflare D1.
 */
export async function updateSolarPanelBrandRange(
  priceId: string,
  brand: string,
  minWattage: number,
  maxWattage: number,
  pricePerWatt: number
): Promise<void> {
  if (!priceId) throw new Error('Missing price ID for range update');
  if (!minWattage || minWattage <= 0) throw new Error('الحد الأدنى للقدرة يجب أن يكون أكبر من 0 وات');
  if (!maxWattage || maxWattage < minWattage) throw new Error('الحد الأقصى للقدرة يجب أن يكون أكبر من أو يساوي الحد الأدنى');
  if (!pricePerWatt || pricePerWatt <= 0) throw new Error('يرجى إدخال سعر صحيح أكبر من الصفر');

  const roundedPrice = parseFloat(pricePerWatt.toFixed(2));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {
    // optional token
  }

  const res = await fetch(`/api/energy-exchange/prices/${encodeURIComponent(priceId)}?_t=${Date.now()}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      price_id: priceId,
      brand: brand.trim(),
      min_wattage: minWattage,
      max_wattage: maxWattage,
      price_per_watt: roundedPrice
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل تعديل نطاق القدرة في قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل تعديل نطاق القدرة');
  }

  const getRes = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`);
  if (getRes.ok) {
    const latest = await getRes.json();
    const recordsList: EnergyExchangeRecord[] = Array.isArray(latest.records) ? latest.records : [];
    const pricesObj = latest.prices || currentPricesMap;
    notifyRecordsListeners(recordsList, pricesObj);
  }
}

/**
 * Admin action: Deletes a Wattage Range from Cloudflare D1.
 */
export async function deleteSolarPanelBrandRange(priceId: string): Promise<void> {
  if (!priceId) throw new Error('Missing price ID for deletion');

  const headers: Record<string, string> = {};

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {
    // optional token
  }

  const res = await fetch(`/api/energy-exchange/prices/${encodeURIComponent(priceId)}?_t=${Date.now()}`, {
    method: 'DELETE',
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل حذف النطاق من قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل حذف النطاق');
  }

  const getRes = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`);
  if (getRes.ok) {
    const latest = await getRes.json();
    const recordsList: EnergyExchangeRecord[] = Array.isArray(latest.records) ? latest.records : [];
    const pricesObj = latest.prices || currentPricesMap;
    notifyRecordsListeners(recordsList, pricesObj);
  }
}

/**
 * Legacy support function for flat price updates
 */
export async function updateSolarPanelBrandPrice(
  brand: SolarPanelBrand,
  newPricePerWatt: number,
  adminEmail?: string
): Promise<{ success: boolean; brand: string; pricePerWatt: number }> {
  if (typeof newPricePerWatt !== 'number' || isNaN(newPricePerWatt) || newPricePerWatt <= 0) {
    throw new Error('يرجى إدخال سعر صحيح أكبر من الصفر');
  }

  const rounded = parseFloat(newPricePerWatt.toFixed(2));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {
    // optional
  }

  const res = await fetch(`/api/energy-exchange/prices/${encodeURIComponent(brand)}?_t=${Date.now()}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      brand,
      price_per_watt: rounded,
      adminEmail
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errMsg = data?.error?.message || data?.error || 'فشل حفظ السعر في قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل حفظ السعر');
  }

  const data = await res.json();
  const confirmedPrices = data.prices || { ...currentPricesMap, [brand]: rounded };
  notifyRecordsListeners(currentRecords, confirmedPrices);

  return { success: true, brand, pricePerWatt: rounded };
}
