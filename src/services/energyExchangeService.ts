import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Product, SOLAR_PANEL_BRANDS, SolarPanelBrand } from '../types';

export interface EnergyExchangeRecord {
  price_id: string;
  category: string;
  brand: string;
  product_type?: string;
  price_per_watt: number;
  currency: string;
  min_wattage?: number | null;
  max_wattage?: number | null;
  is_active?: number | boolean;
  effective_date?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface EnergyExchangeState {
  status: 'loading' | 'ready' | 'error';
  prices: Record<string, number>;
  records: EnergyExchangeRecord[];
  error: string | null;
  source: string | null;
  lastUpdatedAt: string | null;
  isPreview?: boolean;
}

export interface AtomicRangeInput {
  priceId?: string;
  minWattage: number;
  maxWattage: number;
  pricePerWatt: number;
}

/**
 * Checks if a record is active (defaults to active if column is omitted by older schemas).
 */
export function isExchangeRecordActive(record: EnergyExchangeRecord): boolean {
  if (record.is_active === undefined || record.is_active === null) return true;
  if (typeof record.is_active === 'boolean') return record.is_active;
  return Number(record.is_active) !== 0;
}

/**
 * Robustly matches an existing product to one of the 14 approved solar panel brands.
 * Never maps "Gate Solar" (the approved brand is strictly "Jet Solar").
 */
export function matchBrandToExchange(brandName?: string, productName?: string): SolarPanelBrand | null {
  const b = (brandName || '').toLowerCase().trim();
  const n = (productName || '').toLowerCase().trim();
  const combined = `${b} ${n}`.trim();

  if (!combined) return null;

  // Reject deprecated incorrect name "Gate Solar"
  if (b === 'gate solar' || b === 'gatesolar') return null;

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
  if (combined.includes('jet solar') || combined.includes('jetsolar') || b === 'jet') return 'Jet Solar';

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
  isUnsupported: boolean;
  isBrandInactive?: boolean;
  isUnconfigured?: boolean;
  minWattage?: number | null;
  maxWattage?: number | null;
  record?: EnergyExchangeRecord | null;
}

/**
 * Finds matching price per watt for a brand and wattage strictly from backend records:
 * 1. Inactive brand -> returns unavailable (`isBrandInactive: true`, `pricePerWatt: null`).
 * 2. Active brand with wattage ranges -> matches inclusive range `[min_wattage, max_wattage]`.
 *    If wattage falls outside all configured ranges -> `isOutOfBounds: true`, `pricePerWatt: null` (never falls back to another range).
 * 3. Legacy flat price record (no ranges configured) -> uses legacy record price.
 * 4. No DB records for brand -> `isUnconfigured: true`, `pricePerWatt: null` (never invents fake default prices).
 */
export function findMatchingBrandPricePerWatt(
  records: EnergyExchangeRecord[],
  brandName?: string,
  productName?: string,
  wattage?: number
): BrandPriceMatchResult {
  const matchedBrand = matchBrandToExchange(brandName, productName);
  if (!matchedBrand) {
    return {
      matchedBrand: null,
      pricePerWatt: null,
      isRangeMatch: false,
      isOutOfBounds: false,
      isUnsupported: true,
      record: null,
    };
  }

  const brandRecords = records.filter(r => {
    const bMatch = matchBrandToExchange(r.brand);
    return bMatch === matchedBrand || r.brand.toLowerCase() === matchedBrand.toLowerCase();
  });

  if (brandRecords.length === 0) {
    return {
      matchedBrand,
      pricePerWatt: null,
      isRangeMatch: false,
      isOutOfBounds: false,
      isUnsupported: true,
      isUnconfigured: true,
      record: null,
    };
  }

  const activeRecords = brandRecords.filter(isExchangeRecordActive);
  if (activeRecords.length === 0) {
    return {
      matchedBrand,
      pricePerWatt: null,
      isRangeMatch: false,
      isOutOfBounds: false,
      isUnsupported: true,
      isBrandInactive: true,
      record: null,
    };
  }

  const rangeRecords = activeRecords.filter(
    r => r.min_wattage != null && r.max_wattage != null && r.price_per_watt > 0
  );
  const legacyRecords = activeRecords.filter(
    r => (r.min_wattage == null || r.max_wattage == null) && r.price_per_watt > 0
  );

  if (rangeRecords.length > 0) {
    if (wattage !== undefined && wattage > 0) {
      const matchedRange = rangeRecords.find(
        r => r.min_wattage! <= wattage && r.max_wattage! >= wattage
      );
      if (matchedRange) {
        return {
          matchedBrand,
          pricePerWatt: matchedRange.price_per_watt,
          isRangeMatch: true,
          isOutOfBounds: false,
          isUnsupported: false,
          minWattage: matchedRange.min_wattage,
          maxWattage: matchedRange.max_wattage,
          record: matchedRange,
        };
      }

      // Strictly unsupported when wattage is outside all configured ranges; never fall back to another range
      return {
        matchedBrand,
        pricePerWatt: null,
        isRangeMatch: false,
        isOutOfBounds: true,
        isUnsupported: true,
        record: null,
      };
    }

    return {
      matchedBrand,
      pricePerWatt: null,
      isRangeMatch: false,
      isOutOfBounds: false,
      isUnsupported: true,
      record: null,
    };
  }

  if (legacyRecords.length > 0) {
    const legacy = legacyRecords[0];
    return {
      matchedBrand,
      pricePerWatt: legacy.price_per_watt,
      isRangeMatch: false,
      isOutOfBounds: false,
      isUnsupported: false,
      record: legacy,
    };
  }

  return {
    matchedBrand,
    pricePerWatt: null,
    isRangeMatch: false,
    isOutOfBounds: false,
    isUnsupported: true,
    isUnconfigured: true,
    record: null,
  };
}

/**
 * Computes live display pricing for a solar panel based strictly on Centralized Energy Exchange:
 * Panel Price = Panel Power (W) × Brand Price Per Watt (matched to wattage range).
 * Never mutates catalog records (`products.price_egp`) and never invents fake fallback prices.
 */
export function applySolarPanelPricing(
  product: Product,
  _brandPrices: Record<string, number>,
  records: EnergyExchangeRecord[] = []
): Product {
  if (product.category !== 'panels') {
    return product;
  }

  const wattage = getSolarPanelWattage(product);
  const matchResult = findMatchingBrandPricePerWatt(
    records,
    product.brand,
    product.name,
    wattage > 0 ? wattage : undefined
  );

  const matchedBrand = matchResult.matchedBrand;
  if (!matchedBrand) {
    return product;
  }

  // Out of bounds, inactive, unconfigured, or API unavailable -> keep original catalog price strictly untouched
  if (matchResult.isOutOfBounds || matchResult.pricePerWatt == null) {
    const reason: Product['exchangeStatusReason'] = matchResult.isOutOfBounds
      ? 'out_of_bounds'
      : matchResult.isBrandInactive
      ? 'inactive'
      : records.length === 0 && currentState.status === 'error'
      ? 'api_error'
      : 'unconfigured';

    return {
      ...product,
      exchangeBrand: matchedBrand,
      pricePerWatt: undefined,
      exchangeRange: null,
      exchangeUnsupported: true,
      exchangeStatusReason: reason,
    };
  }

  const pricePerWatt = matchResult.pricePerWatt;
  const matchedRangeInfo =
    matchResult.isRangeMatch && matchResult.minWattage != null && matchResult.maxWattage != null
      ? { minWattage: matchResult.minWattage, maxWattage: matchResult.maxWattage }
      : null;

  // Preserve admin custom override if set on product
  const customPrice = Number(product.specs?.customPrice ?? (product as any).customPrice ?? 0);
  if (customPrice > 0) {
    const updatedSuppliers =
      product.suppliers && product.suppliers.length > 0
        ? product.suppliers.map(s => ({ ...s, price: customPrice }))
        : product.suppliers;
    return {
      ...product,
      price: customPrice,
      pricePerWatt,
      exchangeBrand: matchedBrand,
      exchangeRange: matchedRangeInfo,
      exchangeUnsupported: false,
      exchangeStatusReason: undefined,
      suppliers: updatedSuppliers,
    };
  }

  if (wattage <= 0) {
    return {
      ...product,
      pricePerWatt,
      exchangeBrand: matchedBrand,
      exchangeRange: matchedRangeInfo,
      exchangeUnsupported: false,
      exchangeStatusReason: undefined,
    };
  }

  const calculatedPrice = Math.round(wattage * pricePerWatt);
  const updatedSuppliers =
    product.suppliers && product.suppliers.length > 0
      ? product.suppliers.map(s => ({ ...s, price: calculatedPrice }))
      : product.suppliers;

  return {
    ...product,
    price: calculatedPrice,
    pricePerWatt,
    exchangeBrand: matchedBrand,
    exchangeRange: matchedRangeInfo,
    exchangeUnsupported: false,
    exchangeStatusReason: undefined,
    suppliers: updatedSuppliers,
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
 * Computes initial exchange prices strictly as an empty map until D1 responds.
 */
export function getInitialExchangePrices(): Record<string, number> {
  return {};
}

/**
 * Computes initial exchange records strictly as an empty array until D1 responds.
 */
export function getInitialExchangeRecords(): EnergyExchangeRecord[] {
  return [];
}

function buildActivePricesMap(records: EnergyExchangeRecord[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const r of records) {
    if (!isExchangeRecordActive(r)) continue;
    if (r.brand && typeof r.price_per_watt === 'number' && r.price_per_watt > 0) {
      const canonical = matchBrandToExchange(r.brand) || r.brand;
      if (prices[canonical] === undefined) {
        prices[canonical] = r.price_per_watt;
      }
    }
  }
  return prices;
}

function computeLastUpdatedAt(records: EnergyExchangeRecord[], backendLastUpdated?: string | null): string | null {
  let latestMs = 0;
  let latestStr: string | null = null;

  const inspectTimestamp = (raw?: string | null) => {
    if (!raw || typeof raw !== 'string') return;
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw.trim())
      ? raw.trim().replace(' ', 'T') + 'Z'
      : raw.trim();
    const ms = Date.parse(normalized);
    if (!isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latestStr = raw.trim();
    }
  };

  for (const r of records) {
    inspectTimestamp(r.updated_at);
  }
  if (!latestStr && backendLastUpdated) {
    inspectTimestamp(backendLastUpdated);
  }
  return latestStr;
}

type ExchangeRecordsListener = (
  records: EnergyExchangeRecord[],
  prices: Record<string, number>,
  state: EnergyExchangeState
) => void;

const recordsListeners = new Set<ExchangeRecordsListener>();

let currentState: EnergyExchangeState = {
  status: 'loading',
  prices: {},
  records: [],
  error: null,
  source: null,
  lastUpdatedAt: null,
  isPreview: false,
};

function notifyStateListeners(nextState: EnergyExchangeState) {
  currentState = nextState;
  recordsListeners.forEach(cb => {
    try {
      cb(nextState.records, nextState.prices, nextState);
    } catch (err) {
      console.error('Error in exchange records listener:', err);
    }
  });
}

export function getCurrentEnergyExchangeState(): EnergyExchangeState {
  return currentState;
}

let inFlightFetch: Promise<EnergyExchangeState> | null = null;

/**
 * Fetches authoritative Energy Exchange records from Cloudflare D1 backend.
 * Never falls back to fake prices if the API fails.
 */
export async function refreshEnergyExchange(): Promise<EnergyExchangeState> {
  if (typeof window === 'undefined') return currentState;
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const res = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.success === false || data.ok === false) {
        const errMessage =
          data?.error?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          'تعذر تحميل أسعار بورصة الطاقة من الخادم السحابي حالياً.';
        const errState: EnergyExchangeState = {
          status: 'error',
          prices: {},
          records: [],
          error: errMessage,
          source: null,
          lastUpdatedAt: null,
          isPreview: false,
        };
        notifyStateListeners(errState);
        return errState;
      }

      const rawRecords: EnergyExchangeRecord[] = Array.isArray(data.records)
        ? data.records
        : Array.isArray(data.data)
        ? data.data
        : [];

      // Normalize canonical brand names and active flags, excluding invalid "Gate Solar"
      const recordsList = rawRecords
        .filter(r => r && typeof r.brand === 'string' && r.brand.trim().toLowerCase() !== 'gate solar')
        .map(r => ({
          ...r,
          brand: matchBrandToExchange(r.brand) || r.brand.trim(),
          is_active: isExchangeRecordActive(r) ? 1 : 0,
        }));

      const pricesObj = buildActivePricesMap(recordsList);
      const lastUpdatedAt = computeLastUpdatedAt(recordsList, data.last_updated_at || null);

      const readyState: EnergyExchangeState = {
        status: 'ready',
        prices: pricesObj,
        records: recordsList,
        error: null,
        source: data.source || 'cloudflare-d1',
        lastUpdatedAt,
        isPreview: Boolean(data.is_preview),
      };

      notifyStateListeners(readyState);
      return readyState;
    } catch {
      const errState: EnergyExchangeState = {
        status: 'error',
        prices: {},
        records: [],
        error: 'تعذر الاتصال بخادم بورصة الطاقة. يرجى التحقق من الاتصال والمحاولة مرة أخرى.',
        source: null,
        lastUpdatedAt: null,
        isPreview: false,
      };
      notifyStateListeners(errState);
      return errState;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

/**
 * Subscribes to real-time updates from Cloudflare D1 Backend API.
 */
export function subscribeToEnergyExchange(
  callback: (
    prices: Record<string, number>,
    records?: EnergyExchangeRecord[],
    state?: EnergyExchangeState
  ) => void
): () => void {
  const wrapper: ExchangeRecordsListener = (records, prices, state) => {
    callback(prices, records, state);
  };

  recordsListeners.add(wrapper);
  callback(currentState.prices, currentState.records, currentState);

  let intervalId: any = null;
  let handleFocus: (() => void) | null = null;
  let handleVisibility: (() => void) | null = null;

  if (typeof window !== 'undefined') {
    refreshEnergyExchange();

    handleFocus = () => {
      refreshEnergyExchange();
    };
    handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshEnergyExchange();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    intervalId = setInterval(() => {
      refreshEnergyExchange();
    }, 15_000);
  }

  return () => {
    recordsListeners.delete(wrapper);
    if (typeof window !== 'undefined') {
      if (handleFocus) window.removeEventListener('focus', handleFocus);
      if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility);
      if (intervalId) clearInterval(intervalId);
    }
  };
}

async function getAdminAuthToken(forceRefresh = false): Promise<string | null> {
  try {
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }
    const token = await auth.currentUser?.getIdToken(forceRefresh);
    return token || null;
  } catch {
    return null;
  }
}

async function fetchWithAdminAuthRetry(url: string, init: RequestInit): Promise<Response> {
  const token = await getAdminAuthToken(false);
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(url, { ...init, headers });
  if (res.status === 401 && auth.currentUser) {
    const freshToken = await getAdminAuthToken(true);
    if (freshToken) {
      headers.set('Authorization', `Bearer ${freshToken}`);
      res = await fetch(url, { ...init, headers });
    }
  }
  return res;
}

function validateApprovedBrandName(brand: string): SolarPanelBrand {
  const trimmed = (brand || '').trim();
  if (!trimmed) {
    throw new Error('يرجى تحديد العلامة التجارية');
  }
  if (trimmed.toLowerCase() === 'gate solar') {
    throw new Error('اسم العلامة التجارية غير معتمد. الاسم الصحيح هو Jet Solar.');
  }
  const canonical = SOLAR_PANEL_BRANDS.find(b => b.toLowerCase() === trimmed.toLowerCase());
  if (!canonical) {
    throw new Error(`العلامة التجارية "${trimmed}" غير مدرجة ضمن قائمة الماركات الـ 14 المعتمدة.`);
  }
  return canonical;
}

/**
 * Admin action: Atomically replaces all wattage ranges (1 to 3) and activation state for a brand.
 * Prevents partial saves and boundary swap conflicts.
 */
export async function saveSolarPanelBrandRanges(
  brand: string,
  ranges: AtomicRangeInput[],
  isActive = true
): Promise<EnergyExchangeState> {
  const canonicalBrand = validateApprovedBrandName(brand);

  if (!Array.isArray(ranges) || ranges.length < 1) {
    throw new Error('يجب إضافة نطاق قدرة واحد على الأقل للعلامة التجارية.');
  }
  if (ranges.length > 3) {
    throw new Error('الحد الأقصى للنطاقات هو 3 نطاقات لكل علامة تجارية.');
  }

  const normalized = ranges.map((r, idx) => {
    const minW = Number(r.minWattage);
    const maxW = Number(r.maxWattage);
    const price = Number(r.pricePerWatt);

    if (!Number.isInteger(minW) || minW <= 0) {
      throw new Error(`النطاق ${idx + 1}: الحد الأدنى للقدرة يجب أن يكون رقماً صحيحاً أكبر من 0 وات.`);
    }
    if (!Number.isInteger(maxW) || maxW <= 0) {
      throw new Error(`النطاق ${idx + 1}: الحد الأقصى للقدرة يجب أن يكون رقماً صحيحاً أكبر من 0 وات.`);
    }
    if (minW >= maxW) {
      throw new Error(`النطاق ${idx + 1}: الحد الأدنى (${minW}) يجب أن يكون أقل من الحد الأقصى (${maxW}).`);
    }
    if (!Number.isFinite(price) || price <= 0 || price > 200) {
      throw new Error(`النطاق ${idx + 1}: يرجى إدخال سعر وات صحيح بين 0.1 و 200 ج.م.`);
    }

    return {
      price_id: r.priceId,
      min_wattage: minW,
      max_wattage: maxW,
      price_per_watt: parseFloat(price.toFixed(2)),
    };
  });

  // Check pairwise overlaps client-side too (also strictly enforced on server)
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i];
      const b = normalized[j];
      if (a.min_wattage <= b.max_wattage && a.max_wattage >= b.min_wattage) {
        throw new Error(
          `تداخل في نطاقات القدرة: (${a.min_wattage}-${a.max_wattage} وات) يتداخل مع (${b.min_wattage}-${b.max_wattage} وات).`
        );
      }
    }
  }

  const res = await fetchWithAdminAuthRetry(
    `/api/energy-exchange/brands/${encodeURIComponent(canonicalBrand)}?_t=${Date.now()}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand: canonicalBrand,
        is_active: isActive,
        ranges: normalized,
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل حفظ نطاقات العلامة التجارية في قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل حفظ النطاقات');
  }

  return await refreshEnergyExchange();
}

/**
 * Admin action: Activates or deactivates a configured solar panel brand in Cloudflare D1.
 */
export async function toggleSolarPanelBrandActive(
  brand: string,
  isActive: boolean
): Promise<EnergyExchangeState> {
  const canonicalBrand = validateApprovedBrandName(brand);

  const res = await fetchWithAdminAuthRetry(
    `/api/energy-exchange/brands/${encodeURIComponent(canonicalBrand)}?_t=${Date.now()}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand: canonicalBrand,
        is_active: isActive,
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل تحديث حالة تفعيل العلامة التجارية';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل تحديث حالة التفعيل');
  }

  return await refreshEnergyExchange();
}

/**
 * Admin action: Adds a single new Wattage Range for a solar panel brand in Cloudflare D1.
 */
export async function addSolarPanelBrandRange(
  brand: string,
  minWattage: number,
  maxWattage: number,
  pricePerWatt: number
): Promise<EnergyExchangeRecord> {
  const canonicalBrand = validateApprovedBrandName(brand);
  if (!minWattage || minWattage <= 0) throw new Error('الحد الأدنى للقدرة يجب أن يكون أكبر من 0 وات');
  if (!maxWattage || maxWattage <= minWattage) {
    throw new Error('الحد الأقصى للقدرة يجب أن يكون أكبر من الحد الأدنى');
  }
  if (!pricePerWatt || pricePerWatt <= 0 || pricePerWatt > 200) {
    throw new Error('يرجى إدخال سعر صحيح بين 0.1 و 200 ج.م');
  }

  const roundedPrice = parseFloat(pricePerWatt.toFixed(2));

  const res = await fetchWithAdminAuthRetry(`/api/energy-exchange/prices?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand: canonicalBrand,
      min_wattage: minWattage,
      max_wattage: maxWattage,
      price_per_watt: roundedPrice,
      category: 'panels',
      product_type: 'Solar Panel',
      currency: 'EGP',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل إضافة نطاق القدرة في قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل إضافة نطاق القدرة');
  }

  await refreshEnergyExchange();
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
  const canonicalBrand = validateApprovedBrandName(brand);
  if (!minWattage || minWattage <= 0) throw new Error('الحد الأدنى للقدرة يجب أن يكون أكبر من 0 وات');
  if (!maxWattage || maxWattage <= minWattage) {
    throw new Error('الحد الأقصى للقدرة يجب أن يكون أكبر من الحد الأدنى');
  }
  if (!pricePerWatt || pricePerWatt <= 0 || pricePerWatt > 200) {
    throw new Error('يرجى إدخال سعر صحيح بين 0.1 و 200 ج.م');
  }

  const roundedPrice = parseFloat(pricePerWatt.toFixed(2));

  const res = await fetchWithAdminAuthRetry(
    `/api/energy-exchange/prices/${encodeURIComponent(priceId)}?_t=${Date.now()}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_id: priceId,
        brand: canonicalBrand,
        min_wattage: minWattage,
        max_wattage: maxWattage,
        price_per_watt: roundedPrice,
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل تعديل نطاق القدرة في قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل تعديل نطاق القدرة');
  }

  await refreshEnergyExchange();
}

/**
 * Admin action: Deletes an optional Wattage Range (Range 2 or 3) from Cloudflare D1.
 */
export async function deleteSolarPanelBrandRange(priceId: string): Promise<void> {
  if (!priceId) throw new Error('Missing price ID for deletion');

  const res = await fetchWithAdminAuthRetry(
    `/api/energy-exchange/prices/${encodeURIComponent(priceId)}?_t=${Date.now()}`,
    {
      method: 'DELETE',
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error || 'فشل حذف النطاق من قاعدة البيانات';
    throw new Error(typeof errMsg === 'string' ? errMsg : 'فشل حذف النطاق');
  }

  await refreshEnergyExchange();
}

const ENERGY_EXCHANGE_COLLECTION = 'energyExchange';
const BRAND_LOGOS_DOC_ID = 'brandLogos';

/**
 * Normalizes a Firestore brandLogos document snapshot into a map keyed by canonical brand name.
 * Rejects empty strings and deprecated "Gate Solar".
 */
export function normalizeBrandLogosMap(rawMap: unknown): Partial<Record<SolarPanelBrand, string>> {
  const result: Partial<Record<SolarPanelBrand, string>> = {};
  if (!rawMap || typeof rawMap !== 'object') return result;

  for (const [key, val] of Object.entries(rawMap as Record<string, unknown>)) {
    if (typeof val !== 'string' || !val.trim()) continue;
    const canonical = matchBrandToExchange(key);
    if (canonical) {
      result[canonical] = val.trim();
    }
  }
  return result;
}

/**
 * Subscribes to brand logo URLs in real time (public read for Customer, Supplier, Guest, Admin).
 */
export function subscribeToBrandLogos(
  callback: (logos: Partial<Record<SolarPanelBrand, string>>) => void
): () => void {
  const docRef = doc(db, ENERGY_EXCHANGE_COLLECTION, BRAND_LOGOS_DOC_ID);
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) {
        callback({});
        return;
      }
      const data = snap.data();
      callback(normalizeBrandLogosMap(data?.logos));
    },
    (error) => {
      console.warn('Brand logos Firestore listener notice:', error?.message || error);
      callback({});
    }
  );
}

/**
 * Admin-only action: Saves or removes a brand logo URL in Firestore (`energyExchange/brandLogos`)
 * atomically via transaction without modifying pricing, wattage ranges, or products.
 */
export async function saveSolarPanelBrandLogo(
  brand: string,
  logoUrl: string | null
): Promise<void> {
  const canonicalBrand = validateApprovedBrandName(brand);

  if (typeof (auth as any).authStateReady === 'function') {
    await (auth as any).authStateReady();
  }
  if (!auth.currentUser) {
    throw new Error('يجب تسجيل الدخول بحساب مسؤول معتمد لحفظ شعار العلامة التجارية.');
  }

  const docRef = doc(db, ENERGY_EXCHANGE_COLLECTION, BRAND_LOGOS_DOC_ID);
  const updatedBy = auth.currentUser.email || auth.currentUser.uid || 'admin';
  const trimmedUrl = typeof logoUrl === 'string' ? logoUrl.trim() : '';

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      const existingLogos = snap.exists() ? (snap.data()?.logos || {}) : {};
      const nextLogos: Record<string, string> = {};

      for (const [k, v] of Object.entries(existingLogos)) {
        if (typeof v === 'string' && v.trim()) {
          nextLogos[k] = v.trim();
        }
      }

      if (trimmedUrl) {
        nextLogos[canonicalBrand] = trimmedUrl;
      } else {
        delete nextLogos[canonicalBrand];
      }

      tx.set(
        docRef,
        {
          logos: nextLogos,
          updatedAt: new Date().toISOString(),
          updatedBy,
        },
        { merge: true }
      );
    });
  } catch (error: any) {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      operationType: 'write',
      path: `${ENERGY_EXCHANGE_COLLECTION}/${BRAND_LOGOS_DOC_ID}`,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
    if (String(error?.code || '').includes('permission-denied') || String(error?.message || '').toLowerCase().includes('permission')) {
      throw new Error('عذراً، إدارة شعارات العلامات التجارية مخصصة للمسؤولين المعتمدين فقط.');
    }
    throw new Error('تعذر حفظ شعار العلامة التجارية. يرجى التحقق من الاتصال والمحاولة مرة أخرى.');
  }
}

