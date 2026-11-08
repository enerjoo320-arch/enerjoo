import { auth } from '../lib/firebase';
import { Product, SOLAR_PANEL_BRANDS, SolarPanelBrand } from '../types';
import { safeLocalStorage } from '../utils/safeStorage';

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

const STORAGE_KEY = 'enerjoo_solar_exchange_prices';

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

/**
 * Computes pricing for a product based on the centralized Energy Exchange:
 * Panel Price = Panel Power (W) × Brand Price Per Watt
 * ONLY applies to solar panels. All other product categories remain strictly untouched.
 */
export function applySolarPanelPricing(
  product: Product,
  brandPrices: Record<string, number>
): Product {
  if (product.category !== 'panels') {
    return product;
  }

  const matchedBrand = matchBrandToExchange(product.brand, product.name);
  if (!matchedBrand) {
    return product;
  }

  const pricePerWatt = brandPrices[matchedBrand] ?? DEFAULT_SOLAR_PANEL_PRICES[matchedBrand];
  if (!pricePerWatt || pricePerWatt <= 0) {
    return product;
  }

  // If the admin explicitly edited/overrode this panel's price, preserve the custom price
  const customPrice = Number(product.specs?.customPrice ?? (product as any).customPrice ?? 0);
  if (customPrice > 0) {
    const updatedSuppliers = (product.suppliers && product.suppliers.length > 0)
      ? product.suppliers.map(s => ({
          ...s,
          price: customPrice
        }))
      : product.suppliers;
    return {
      ...product,
      price: customPrice,
      pricePerWatt,
      exchangeBrand: matchedBrand,
      suppliers: updatedSuppliers
    };
  }

  const wattage = getSolarPanelWattage(product);
  if (wattage <= 0) {
    return {
      ...product,
      pricePerWatt,
      exchangeBrand: matchedBrand
    };
  }

  const calculatedPrice = Math.round(wattage * pricePerWatt);

  // Synchronize supplier entries so that supplier cards in ProductDetail reflect the updated exchange price
  const updatedSuppliers = (product.suppliers && product.suppliers.length > 0)
    ? product.suppliers.map(s => ({
        ...s,
        price: calculatedPrice
      }))
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
  brandPrices: Record<string, number>
): Product[] {
  return products.map(p => applySolarPanelPricing(p, brandPrices));
}

/**
 * Gets cached prices from localStorage or fallback to defaults.
 */
export function getInitialExchangePrices(): Record<string, number> {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY);
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

// Active in-memory listeners
type ExchangeListener = (prices: Record<string, number>) => void;
const listeners = new Set<ExchangeListener>();
let currentPrices: Record<string, number> = getInitialExchangePrices();

function notifyListeners(prices: Record<string, number>) {
  currentPrices = prices;
  try {
    safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
  } catch {
    // ignore
  }
  listeners.forEach(cb => {
    try {
      cb(prices);
    } catch (err) {
      console.error('Error in exchange listener:', err);
    }
  });
}

/**
 * Subscribes to real-time updates from Backend API and LocalStorage.
 * Completely independent of Firebase/Firestore to ensure Cloudflare D1 is the single source of truth.
 * Ensures all sessions (guests, customers, suppliers, admins) stay strictly synchronized.
 */
export function subscribeToEnergyExchange(
  callback: (prices: Record<string, number>) => void
): () => void {
  listeners.add(callback);
  // Send current cached value immediately
  callback(currentPrices);

  const fetchExchangePrices = async () => {
    if (typeof window === 'undefined') return;
    try {
      // Force non-cached request with timestamp query and Cache-Control headers
      const res = await fetch(`/api/energy-exchange/prices?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.prices) {
          notifyListeners({ ...DEFAULT_SOLAR_PANEL_PRICES, ...data.prices });
        }
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
    // 1. Initial fetch from API (immediate upon component mount)
    fetchExchangePrices();

    // 2. Immediate re-fetch on window focus and document visibility
    handleFocus = () => fetchExchangePrices();
    handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchExchangePrices();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    // 3. Periodic synchronization every 10 seconds for real-time consistency
    intervalId = setInterval(fetchExchangePrices, 10_000);

    // 4. Synchronize immediately across multiple open browser tabs/windows
    handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === 'object') {
            notifyListeners({ ...DEFAULT_SOLAR_PANEL_PRICES, ...parsed });
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
  }

  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      if (handleFocus) window.removeEventListener('focus', handleFocus);
      if (handleVisibility) document.removeEventListener('visibilitychange', handleVisibility);
      if (handleStorageChange) window.removeEventListener('storage', handleStorageChange);
      if (intervalId) clearInterval(intervalId);
    }
  };
}

/**
 * Admin action: Updates the price per watt for a solar panel brand in Cloudflare D1.
 * Strictly verifies server/D1 confirmation before updating UI and notifying listeners.
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
  const effectiveEmail = adminEmail || auth.currentUser?.email || 'enerjoo320@gmail.com';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache'
  };

  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Non-blocking
  }

  // 1. Send PUT request to Cloudflare D1 endpoint via /api/energy-exchange/prices/:id
  const encodedBrand = encodeURIComponent(brand);
  let res: Response;
  try {
    res = await fetch(`/api/energy-exchange/prices/${encodedBrand}?_t=${Date.now()}`, {
      method: 'PUT',
      cache: 'no-store',
      headers,
      body: JSON.stringify({
        brand,
        price_per_watt: rounded,
        pricePerWatt: rounded,
        adminEmail: effectiveEmail,
        updated_by: effectiveEmail
      })
    });
  } catch (netErr: any) {
    throw new Error('فشل الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت');
  }

  // Fallback: If PUT was not supported by an older proxy, attempt POST /api/energy-exchange
  if (!res.ok && res.status !== 403 && res.status !== 400) {
    try {
      const fallbackRes = await fetch(`/api/energy-exchange?_t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers,
        body: JSON.stringify({
          brand,
          pricePerWatt: rounded,
          price_per_watt: rounded,
          adminEmail: effectiveEmail,
          updated_by: effectiveEmail
        })
      });
      if (fallbackRes.ok) {
        res = fallbackRes;
      }
    } catch {
      // Keep original response
    }
  }

  if (!res.ok) {
    let errMessage = 'فشل حفظ السعر في قاعدة البيانات، يرجى المحاولة مجدداً';
    try {
      const errJson = await res.json();
      if (errJson && errJson.error) {
        errMessage = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || errMessage);
      }
    } catch {
      // keep default errMessage
    }
    throw new Error(errMessage);
  }

  const data = await res.json();
  const confirmedPrices = data.prices && typeof data.prices === 'object'
    ? { ...DEFAULT_SOLAR_PANEL_PRICES, ...currentPrices, ...data.prices }
    : { ...currentPrices, [brand]: rounded };

  // ONLY after confirmed D1 write, notify listeners and update application state
  notifyListeners(confirmedPrices);

  return { success: true, brand, pricePerWatt: rounded };
}
