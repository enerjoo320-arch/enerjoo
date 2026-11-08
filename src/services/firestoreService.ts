import { 
  collection, 
  getDocs, 
  getDoc,
  addDoc, 
  updateDoc, 
  setDoc,
  deleteDoc, 
  doc, 
  query, 
  onSnapshot,
  serverTimestamp,
  where,
  orderBy
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Product, Supplier, Category, DimensionUnit, ProductReview, SolarRequest, SolarRequestStatus, Customer, Quotation, QuotationStatus } from '../types';
import { classifyInverter } from '../utils/inverterClassification';
import { parseInverterQuery, matchInverters } from '../utils/inverterMatching';
import { StructuredInverter, InverterQueryCriteria, InverterMatchResult } from '../types/inverter';
import { normalizeEgyptianPhone } from '../utils/phoneUtils';
import { formatDateOnly } from '../utils/dateUtils';
import { isRawUidOrId } from '../utils/supplierUtils';
import { productsData } from '../data/mockData';
import { safeLocalStorage } from '../utils/safeStorage';
import { SUPPLIER_CONTACT_PHONE_DISPLAY } from '../constants/contact';
import {
  parseAndValidateNumericField,
  validateAndNormalizeD1ProductNumericFields,
} from '../utils/productNumericValidation';

const DELETED_PRODUCTS_STORAGE_KEY = 'enerjoo_deleted_product_ids_v2';

export const getDeletedProductIds = (): Set<string> => {
  try {
    // Purge old contaminated key from previous test runs
    if (typeof window !== 'undefined') {
      const oldRaw = safeLocalStorage.getItem('enerjoo_deleted_product_ids_v1');
      if (oldRaw) {
        safeLocalStorage.removeItem('enerjoo_deleted_product_ids_v1');
      }
    }
    const raw = safeLocalStorage.getItem(DELETED_PRODUCTS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map(String));
      }
    }
  } catch (err) {
    console.warn('Error reading deleted products from storage:', err);
  }
  return new Set();
};

export const markProductAsDeleted = (productId: string | number): void => {
  try {
    const pId = String(productId);
    const set = getDeletedProductIds();
    set.add(pId);
    safeLocalStorage.setItem(DELETED_PRODUCTS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Error saving deleted product to storage:', err);
  }
};

export const unmarkProductAsDeleted = (productId: string | number): void => {
  try {
    const pId = String(productId);
    const set = getDeletedProductIds();
    if (set.has(pId)) {
      set.delete(pId);
      safeLocalStorage.setItem(DELETED_PRODUCTS_STORAGE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (err) {
    console.warn('Error unmarking deleted product in storage:', err);
  }
};

export const getCanonicalProductId = (item: any): string => {
  if (!item || typeof item !== 'object') return '';
  const rawId = item.product_id ?? item.id ?? '';
  return String(rawId).trim();
};

export const filterDeletedProducts = (products: Product[]): Product[] => {
  const deletedSet = getDeletedProductIds();
  if (deletedSet.size === 0) return products;
  return products.filter(p => {
    const cId = getCanonicalProductId(p);
    return !deletedSet.has(cId) && !deletedSet.has(String(p.id)) && !deletedSet.has(String((p as any).product_id));
  });
};

export const deduplicateProducts = (products: Product[]): Product[] => {
  if (!Array.isArray(products) || products.length === 0) return [];
  const deletedSet = getDeletedProductIds();
  const uniqueMap = new Map<string, Product>();

  for (const item of products) {
    if (!item) continue;
    const canonicalId = getCanonicalProductId(item);
    if (!canonicalId || deletedSet.has(canonicalId) || deletedSet.has(String(item.id))) {
      continue;
    }
    const normalizedItem: Product = {
      ...item,
      id: item.id ?? canonicalId,
    };
    uniqueMap.set(canonicalId, normalizedItem);
  }

  return Array.from(uniqueMap.values());
};

const EDITED_PRODUCTS_STORAGE_KEY = 'enerjoo_edited_products_v1';

export const getEditedProducts = (): Record<string, Product> => {
  try {
    const raw = safeLocalStorage.getItem(EDITED_PRODUCTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading edited products from storage:', err);
  }
  return {};
};

export const saveEditedProduct = (productId: string | number, product: Partial<Product>): void => {
  try {
    const pId = String(productId);
    const existing = getEditedProducts();
    const prev = existing[pId] as Product | undefined;
    existing[pId] = {
      ...(prev || {}),
      ...product,
      id: productId,
      specs: {
        ...(prev?.specs || {}),
        ...(product.specs || {})
      },
      updatedAt: new Date().toISOString().split('T')[0]
    } as Product;
    safeLocalStorage.setItem(EDITED_PRODUCTS_STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.warn('Error saving edited product to storage:', err);
  }
};

export const removeEditedProduct = (productId: string | number): void => {
  try {
    const pId = String(productId);
    const existing = getEditedProducts();
    if (existing[pId]) {
      delete existing[pId];
      safeLocalStorage.setItem(EDITED_PRODUCTS_STORAGE_KEY, JSON.stringify(existing));
    }
  } catch (err) {
    console.warn('Error removing edited product from storage:', err);
  }
};

/**
 * Returns the initial local catalog with deleted items removed and locally edited products overlaid.
 * Used as initial React state so reloads immediately reflect user edits and deletions without flicker.
 */
export const getInitialLocalProducts = (): Product[] => {
  const deletedSet = getDeletedProductIds();
  const editedMap = getEditedProducts();
  const resultMap = new Map<string, Product>();

  for (const baseProd of productsData) {
    const id = String(baseProd.id);
    if (!deletedSet.has(id)) {
      resultMap.set(id, baseProd);
    }
  }

  for (const [id, editedProd] of Object.entries(editedMap)) {
    if (!deletedSet.has(id)) {
      const existing = resultMap.get(id);
      resultMap.set(id, {
        ...(existing || {}),
        ...editedProd,
        id: existing ? existing.id : (isNaN(Number(id)) ? id : Number(id)),
        specs: {
          ...(existing?.specs || {}),
          ...(editedProd.specs || {})
        }
      } as Product);
    }
  }

  return Array.from(resultMap.values());
};

const PRODUCTS_COLLECTION = 'products';
const USERS_COLLECTION = 'users';
const SOLAR_REQUESTS_COLLECTION = 'solarRequests';
const CUSTOMERS_COLLECTION = 'customers';
const QUOTATIONS_COLLECTION = 'quotations';

// In-memory cache of verified supplier profiles to enrich products
const supplierProfileCache = new Map<string, Supplier>();

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error(`Firestore Error:`, JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Cloudflare D1 Products API
const CF_DIRECT_BASE_URL = 'https://enerjoo-api.enerjoo320.workers.dev';
const getProductsApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host.endsWith('.run.app')) {
      return '/api';
    }
  }
  const envUrl = (import.meta as any).env?.VITE_PRODUCTS_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    // Use same-origin /api (handled by server.ts or vercel.json rewrites to Cloudflare Worker)
    return '/api';
  }
  return CF_DIRECT_BASE_URL;
};

// In-memory product listeners to notify active components immediately upon product mutations
type ProductsListener = (products: Product[]) => void;
const activeProductListeners: Set<ProductsListener> = new Set();
let latestProductsFetchSeq = 0;

const notifyProductListeners = async () => {
  if (activeProductListeners.size === 0) return;
  const currentSeq = ++latestProductsFetchSeq;
  try {
    const products = await getProducts();
    if (currentSeq !== latestProductsFetchSeq) return;
    const uniqueProducts = deduplicateProducts(products);
    for (const listener of activeProductListeners) {
      try {
        listener(uniqueProducts);
      } catch (err) {
        console.error('Error in product listener callback:', err);
      }
    }
  } catch (err) {
    console.error('Failed to notify product listeners:', err);
  }
};

/**
 * Extracts the Firebase ID Token for the currently signed-in user.
 * Blocks write operations if the user is not authenticated with Firebase Auth.
 * Supports forceRefresh to exchange expired tokens for fresh ones.
 */
export async function getFirebaseIdTokenForWrite(forceRefresh = false): Promise<string> {
  if (typeof (auth as any)?.authStateReady === 'function') {
    try {
      await (auth as any).authStateReady();
    } catch {
      // Ignore authStateReady error
    }
  }

  const currentUser = auth?.currentUser;
  if (!currentUser || typeof currentUser.getIdToken !== 'function') {
    const unauthErr: any = new Error('يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من إضافة أو تعديل أو حذف المنتجات.');
    unauthErr.status = 401;
    unauthErr.code = 'UNAUTHORIZED';
    throw unauthErr;
  }

  try {
    const idToken = await currentUser.getIdToken(forceRefresh);
    if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
      throw new Error('Empty Firebase ID Token');
    }
    return idToken.trim();
  } catch {
    const tokenErr: any = new Error('انتهت صلاحية جلسة تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى ثم إعادة المحاولة.');
    tokenErr.status = 401;
    tokenErr.code = 'UNAUTHORIZED';
    throw tokenErr;
  }
}

/**
 * Internal helper for Cloudflare Worker D1 Products API requests.
 * Automatically attaches `Authorization: Bearer <Firebase ID Token>` on POST, PUT, PATCH, and DELETE requests.
 * Automatically refreshes expired tokens on 401 and retries once.
 */
async function requestProductsApi<T>(path: string, options?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const method = (options?.method || 'GET').toUpperCase();
  const isWriteMethod = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const baseUrl = getProductsApiBaseUrl();
  const url = `${baseUrl}${normalizedPath}`;

  const extraHeaders: Record<string, string> = {};
  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        extraHeaders[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        extraHeaders[key] = value;
      }
    } else {
      Object.assign(extraHeaders, options.headers);
    }
  }

  const hasBody = options?.body !== undefined && options?.body !== null;
  const requestHeaders: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...extraHeaders
  };

  const isPreviewContainer =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.run.app') || window.location.hostname === 'localhost');
  const canFallbackToDirectWorker =
    !isWriteMethod &&
    (typeof window === 'undefined' ||
      window.location.hostname === 'enerjoo.com' ||
      window.location.hostname.endsWith('.enerjoo.com'));

  let idToken = '';
  if (isWriteMethod) {
    idToken = await getFirebaseIdTokenForWrite(false);
    // In preview container (.run.app / localhost), send X-Firebase-Auth on same-origin /api requests
    // and also send Authorization: Bearer <idToken>. If Cloud Run GFE intercepts Authorization, retry with X-Firebase-Auth only.
    requestHeaders['Authorization'] = `Bearer ${idToken}`;
    if (isPreviewContainer && baseUrl === '/api') {
      requestHeaders['X-Firebase-Auth'] = idToken;
    }
  }

  // Pre-warm same-origin proxy auth cache before write requests in preview container
  if (isWriteMethod && isPreviewContainer && baseUrl === '/api') {
    try {
      await fetch('/api/health', { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
    } catch {
      // Ignore pre-warm error
    }
  }

  const executeFetchWithRetry = async (targetUrl: string, headersToUse: Record<string, string>): Promise<Response> => {
    let lastError: unknown = null;
    const maxAttempts = baseUrl === '/api' ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const currentHeaders = { ...headersToUse };
        // On retry in preview container after a redirect/network error or gateway interception, keep X-Firebase-Auth and omit Authorization
        if (attempt > 1 && isPreviewContainer && isWriteMethod && idToken) {
          await fetch('/api/health', { method: 'GET', cache: 'no-store', credentials: 'same-origin' }).catch(() => {});
          delete currentHeaders['Authorization'];
          currentHeaders['X-Firebase-Auth'] = idToken;
        }

        const response = await fetch(targetUrl, {
          ...options,
          method,
          headers: currentHeaders,
          credentials: targetUrl.startsWith('/') ? 'same-origin' : options?.credentials
        });

        const contentType = response.headers.get('content-type') || '';
        const isNonJsonAuthInterception =
          targetUrl.startsWith('/api') &&
          (response.status === 401 || response.status === 403) &&
          !contentType.includes('application/json');
        const isTransientHtmlOrGateway =
          response.redirected ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504 ||
          isNonJsonAuthInterception ||
          (targetUrl.startsWith('/api') && contentType.includes('text/html'));

        if (isTransientHtmlOrGateway && attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 600));
          continue;
        }

        return response;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 600));
          continue;
        }
      }
    }

    throw lastError || new Error('Failed to fetch');
  };

  let res: Response;
  try {
    res = await executeFetchWithRetry(url, requestHeaders);
    const contentType = res.headers.get('content-type') || '';
    if (baseUrl === '/api' && contentType.includes('text/html') && canFallbackToDirectWorker) {
      const directWorkerHeaders = { ...requestHeaders };
      delete directWorkerHeaders['X-Firebase-Auth'];
      res = await fetch(`${CF_DIRECT_BASE_URL}${normalizedPath}`, {
        ...options,
        method,
        headers: directWorkerHeaders
      });
    }
  } catch (err) {
    if (canFallbackToDirectWorker || baseUrl !== '/api') {
      const fallbackBase = baseUrl === '/api' ? CF_DIRECT_BASE_URL : '/api';
      const fallbackHeaders = { ...requestHeaders };
      if (fallbackBase === CF_DIRECT_BASE_URL) {
        delete fallbackHeaders['X-Firebase-Auth'];
      }
      try {
        res = await fetch(`${fallbackBase}${normalizedPath}`, {
          ...options,
          method,
          headers: fallbackHeaders
        });
      } catch (fallbackErr) {
        const errorMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error(`Network error connecting to Products API at ${url}:`, errorMsg);
        throw new Error(`تعذر الاتصال بخادم قاعدة البيانات (Products API): ${errorMsg}`);
      }
    } else {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Network error connecting to Products API at ${url}:`, errorMsg);
      throw new Error(`تعذر الاتصال بخادم قاعدة البيانات (Products API): ${errorMsg}`);
    }
  }

  // Automatic retry on 401 with force-refreshed Firebase ID token
  if (res.status === 401 && isWriteMethod && auth?.currentUser) {
    try {
      const refreshedToken = await getFirebaseIdTokenForWrite(true);
      if (refreshedToken) {
        idToken = refreshedToken;
        if (isPreviewContainer && baseUrl === '/api') {
          delete requestHeaders['Authorization'];
          requestHeaders['X-Firebase-Auth'] = idToken;
        } else {
          requestHeaders['Authorization'] = `Bearer ${idToken}`;
          delete requestHeaders['X-Firebase-Auth'];
        }
        res = await fetch(url, {
          ...options,
          method,
          headers: requestHeaders,
          credentials: url.startsWith('/') ? 'same-origin' : options?.credentials
        });
      }
    } catch {
      // If refresh fails, proceed to standard error parsing below
    }
  }

  // Handle 404 cleanly ONLY for GET requests
  if (res.status === 404 && method === 'GET') {
    if (normalizedPath === '/products' || normalizedPath.startsWith('/products?')) {
      return { success: true, count: 0, products: [] } as T;
    }
    return { success: false, notFound: true, product: null, products: [] } as T;
  }

  if (!res.ok) {
    let errorDetail = `Status ${res.status} ${res.statusText}`;
    let errorCode = '';
    try {
      const errJson: any = await res.json();
      if (errJson) {
        errorCode = errJson.error?.code || errJson.code || '';
        if (typeof errJson.error === 'string') {
          errorDetail = errJson.error;
        } else if (errJson.error?.message && typeof errJson.error.message === 'string') {
          errorDetail = errJson.error.message;
        } else if (typeof errJson.message === 'string') {
          errorDetail = errJson.message;
        }
      }
    } catch {
      // Ignore JSON parse error on non-ok responses
    }

    if (res.status === 401) {
      const authErrorMsg = errorDetail && !errorDetail.startsWith('Status 401')
        ? errorDetail
        : 'يرجى تسجيل الدخول إلى Enerjoo أولاً لتتمكن من تعديل أو حذف المنتجات.';
      const apiErr: any = new Error(authErrorMsg);
      apiErr.status = 401;
      apiErr.code = errorCode || 'UNAUTHORIZED';
      apiErr.detail = authErrorMsg;
      throw apiErr;
    }

    if (res.status === 403) {
      const forbiddenMsg = errorDetail && !errorDetail.startsWith('Status 403')
        ? errorDetail
        : 'هذا الحساب غير مخوّل لإضافة المنتجات أو تعديلها أو حذفها.';
      const apiErr: any = new Error(forbiddenMsg);
      apiErr.status = 403;
      apiErr.code = errorCode || 'PRODUCT_ADMIN_FORBIDDEN';
      apiErr.detail = forbiddenMsg;
      throw apiErr;
    }

    const apiErr: any = new Error(errorDetail ? `فشل حفظ التغيير في قاعدة البيانات: ${errorDetail}` : `فشل حفظ التغيير في قاعدة البيانات (${res.status})`);
    apiErr.status = res.status;
    apiErr.code = errorCode;
    apiErr.detail = errorDetail;
    throw apiErr;
  }

  try {
    const json: any = await res.json();
    if (method !== 'GET' && json && (json.success === false || json.ok === false)) {
      const detail = json.error?.message || json.error || json.message || 'رفض الخادم تنفيذ العملية';
      throw new Error(`فشل حفظ التغيير في قاعدة البيانات: ${detail}`);
    }
    return json as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('فشل حفظ التغيير')) {
      throw err;
    }
    console.error(`Invalid JSON received from Products API at ${url}:`, err);
    throw new Error('استجابة غير صالحة من خادم المنتجات (Invalid JSON response)');
  }
}

/**
 * Map category from D1 format to frontend Category enum.
 */
function mapD1CategoryToCategory(catStr?: string | null): Category {
  if (!catStr) return 'panels';
  const c = catStr.toLowerCase();
  if (c.includes('panel') || c.includes('لوح') || c.includes('ألواح') || c.includes('الواح')) return 'panels';
  if (c.includes('invert') || c.includes('محول') || c.includes('إنفرتر') || c.includes('انفرتر')) return 'inverters';
  if (c.includes('batter') || c.includes('بطار')) return 'batteries';
  if (c.includes('pump') || c.includes('مضخ') || c.includes('طلمب')) return 'pumps';
  if (c.includes('mount') || c.includes('structur') || c.includes('هيكل') || c.includes('شاسيه')) return 'mounting';
  if (c.includes('protect') || c.includes('حماي') || c.includes('قاطع')) return 'protection';
  if (c.includes('combin') || c.includes('تجميع') || c.includes('صندوق')) return 'combiner';
  if (c.includes('cable') || c.includes('كابل') || c.includes('سلك')) return 'cables';
  if (c.includes('mc4')) return 'mc4';
  if (c.includes('seal') || c.includes('عازل') || c.includes('عوازل')) return 'sealings';
  if (c.includes('clamp') || c.includes('كلبس') || c.includes('تثبيت')) return 'clamps';
  return (c as Category) || 'panels';
}

/**
 * Map frontend Category to D1 category string.
 */
function mapCategoryToD1Category(cat?: Category): string {
  switch (cat) {
    case 'panels': return 'Solar Panels';
    case 'inverters': return 'Inverters';
    case 'batteries': return 'Batteries';
    case 'pumps': return 'Pumps';
    case 'mounting': return 'Mounting Structures';
    case 'protection': return 'Protection & Distribution';
    case 'combiner': return 'Combiner Boxes';
    case 'cables': return 'Solar Cables';
    case 'mc4': return 'MC4 Connectors';
    case 'sealings': return 'Sealings';
    case 'clamps': return 'Clamps';
    default: return cat || 'Solar Panels';
  }
}

/**
 * Helper to robustly parse dimensions string (e.g. "2384 x 1303 x 35 mm", "2384*1303*35", "2384 x 1303")
 */
export function parseDimensionsString(dimStr?: string | null): {
  length?: number;
  width?: number;
  thickness?: number;
  dimensionUnit?: DimensionUnit;
  area?: number;
} {
  if (!dimStr || typeof dimStr !== 'string') return {};
  const cleaned = dimStr.trim();
  const match = cleaned.match(/([\d.]+)\s*[*xX×]\s*([\d.]+)(?:\s*[*xX×]\s*([\d.]+))?\s*(mm|cm|m)?/i);
  if (match) {
    const l = parseFloat(match[1]);
    const w = parseFloat(match[2]);
    const th = match[3] ? parseFloat(match[3]) : undefined;
    const unit = (match[4]?.toLowerCase() || 'mm') as DimensionUnit;
    let area: number | undefined;
    if (!isNaN(l) && !isNaN(w)) {
      if (unit === 'mm') area = parseFloat(((l * w) / 1_000_000).toFixed(4));
      else if (unit === 'cm') area = parseFloat(((l * w) / 10_000).toFixed(4));
      else if (unit === 'm') area = parseFloat((l * w).toFixed(4));
    }
    return {
      length: !isNaN(l) ? l : undefined,
      width: !isNaN(w) ? w : undefined,
      thickness: th !== undefined && !isNaN(th) ? th : undefined,
      dimensionUnit: unit,
      area
    };
  }
  return {};
}

/**
 * Map D1 product object to application Product interface.
 */
function resolveDefaultD1Image(cat: Category, brand: string, model: string): string {
  const b = (brand || '').toLowerCase();
  const m = (model || '').toLowerCase();
  if (cat === 'inverters') {
    if (b.includes('huawei') || m.includes('sun2000')) {
      return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1790087530856-b5aswi77.jpg';
    }
    if (b.includes('invt') || m.includes('pump')) {
      return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791793955618-hnt8gcsl.jpg';
    }
    return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474437619-nrtfkfhx.jpg';
  }
  if (cat === 'panels') {
    if (b.includes('longi') || b.includes('trina')) {
      return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791043105976-4eukpdun.png';
    }
    return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791028978582-ye8lbh70.png';
  }
  if (cat === 'batteries') {
    return 'https://enerjoo-api.enerjoo320.workers.dev/files/products/1791474965434-xr788udb.jpg';
  }
  return 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=2944&auto=format&fit=crop';
}

function normalizeD1Brand(rawBrand?: string | null, model?: string | null): string {
  const b = String(rawBrand || '').trim();
  const bl = b.toLowerCase();
  const ml = String(model || '').toLowerCase();
  if (bl.startsWith('huawei') || ml.includes('sun2000')) return 'Huawei';
  if (bl === 'felicity') return 'Felicity';
  if (bl === 'eastman') return 'Eastman';
  if (bl === 'veichi' || bl === 'viechi') return 'Veichi';
  if (bl.startsWith('jinko')) return 'Jinko';
  if (bl.startsWith('longi')) return 'LONGi Solar';
  if (bl.startsWith('trina')) return 'Trina Solar';
  if (bl === 'invt') return 'Invt';
  return b || 'Enerjoo';
}

function mapD1ProductToProduct(d1Item: any): Product {
  const id = getCanonicalProductId(d1Item);
  const baseMatch = productsData.find(b => String(b.id) === String(id));
  const localEdited = getEditedProducts()[String(id)];
  const isEdited = Boolean(
    d1Item._isEdited ||
    localEdited ||
    (d1Item.name && baseMatch && d1Item.name !== baseMatch.name) ||
    (d1Item.nameAr && baseMatch && d1Item.nameAr !== baseMatch.nameAr)
  );

  const category = mapD1CategoryToCategory(d1Item.product_category || d1Item.category || baseMatch?.category);
  const ratedKw = Number(d1Item.rated_power_kw ?? d1Item.specs?.ratedPowerKw ?? 0);
  let power = Number(d1Item.power_w ?? d1Item.power ?? baseMatch?.power ?? 0);
  if ((!power || isNaN(power)) && ratedKw > 0) {
    power = ratedKw <= 200 ? ratedKw * 1000 : ratedKw;
  }

  let price = Number(d1Item.price_egp ?? d1Item.price ?? baseMatch?.price ?? 0);
  if (!isEdited && category === 'inverters' && price > 0 && price < 500) {
    price = baseMatch?.price && baseMatch.price >= 1000 ? baseMatch.price : price * 1000;
  }

  const efficiency = Number(d1Item.efficiency_percent ?? d1Item.efficiency ?? baseMatch?.efficiency ?? 0);
  const warranty = Number(d1Item.warranty_years ?? d1Item.warranty ?? baseMatch?.warranty ?? 0);
  const brand = normalizeD1Brand(d1Item.brand || baseMatch?.brand, d1Item.model || d1Item.name);

  let rawModel = String(d1Item.model || d1Item.name || baseMatch?.name || `Product ${id}`).trim();
  const kwDisplay = ratedKw > 0 ? ratedKw : (power >= 1000 ? power / 1000 : 0);
  if (!isEdited) {
    if (brand === 'Felicity' && rawModel.toLowerCase() === 'off grid inverter' && kwDisplay > 0) {
      rawModel = `Felicity Off-Grid Inverter ${kwDisplay}kW`;
    } else if (brand === 'Eastman' && /^inverter\b/i.test(rawModel) && kwDisplay > 0) {
      rawModel = `Eastman Off-Grid Inverter ${kwDisplay}kW`;
    }
  }

  // Prioritize explicit d1Item.name over baseMatch.name so user edits to product name are never discarded
  const name = d1Item.name || baseMatch?.name || rawModel;
  let nameAr = d1Item.nameAr || d1Item.name_ar || (!isEdited ? baseMatch?.nameAr : '') || '';
  if (!isEdited && (!nameAr || nameAr === rawModel || nameAr === d1Item.model)) {
    if (brand === 'Huawei' && kwDisplay > 0) {
      nameAr = `إنفرتر هواوي ${kwDisplay} كيلو وات On-Grid ثلاثي الأطوار (${rawModel.replace(/^Huawei\s*/i, '')})`;
    } else if (brand === 'Felicity' && kwDisplay > 0) {
      nameAr = `إنفرتر فيليسيتي (فيلسيتي) أوف جريد ${kwDisplay} كيلو وات`;
    } else if (brand === 'Eastman' && kwDisplay > 0) {
      nameAr = `إنفرتر إيستمان أوف جريد ${kwDisplay} كيلو وات`;
    } else if (brand === 'Jinko' && power > 0) {
      nameAr = `لوح طاقة شمسية جينكو ${power} وات (${rawModel})`;
    } else if (brand === 'LONGi Solar' && power > 0) {
      nameAr = `لوح طاقة شمسية لونجي ثنائي الوجه ${power} وات (${rawModel})`;
    } else if (brand === 'Trina Solar' && power > 0) {
      nameAr = `لوح طاقة شمسية ترينا سولار ثنائي الوجه ${power} وات (${rawModel})`;
    } else {
      nameAr = name;
    }
  } else if (!nameAr) {
    nameAr = name;
  }

  // Parse raw specs if stored as string or object
  let parsedSpecs: Record<string, any> = {};
  if (typeof d1Item.specs === 'string') {
    try {
      parsedSpecs = JSON.parse(d1Item.specs);
    } catch {
      parsedSpecs = {};
    }
  } else if (d1Item.specs && typeof d1Item.specs === 'object') {
    parsedSpecs = d1Item.specs;
  }

  // Base technical specs from Cloudflare D1 columns + parsedSpecs
  const specs: Record<string, any> = {
    productType: d1Item.product_type || parsedSpecs.productType || parsedSpecs.type || '',
    technology: d1Item.technology || parsedSpecs.technology || '',
    cellType: d1Item.cell_type || parsedSpecs.cellType || '',
    numberOfCells: d1Item.number_of_cells || parsedSpecs.numberOfCells || '',
    ratedPowerKw: d1Item.rated_power_kw ?? parsedSpecs.ratedPowerKw,
    surgePowerW: d1Item.surge_power_w ?? parsedSpecs.surgePowerW,
    waveform: d1Item.waveform || parsedSpecs.waveform || '',
    acVoltageV: d1Item.ac_voltage_v || parsedSpecs.acVoltageV || '',
    frequencyHz: d1Item.frequency_hz ?? parsedSpecs.frequencyHz,
    peakEfficiency: d1Item.peak_efficiency_percent ?? parsedSpecs.peakEfficiency,
    nominalVoltage: d1Item.nominal_voltage_v || parsedSpecs.nominalVoltage || '',
    capacityAh: d1Item.capacity_ah ?? parsedSpecs.capacityAh,
    nominalEnergyWh: d1Item.nominal_energy_wh ?? parsedSpecs.nominalEnergyWh,
    maxContinuousDischargeCurrentA: d1Item.max_continuous_discharge_current_a ?? parsedSpecs.maxContinuousDischargeCurrentA,
    cycleLife: d1Item.cycle_life ?? parsedSpecs.cycleLife,
    maxPvOpenCircuitVoltageV: d1Item.max_pv_open_circuit_voltage_v ?? parsedSpecs.maxPvOpenCircuitVoltageV,
    maxPvVoltage: d1Item.max_pv_open_circuit_voltage_v ?? parsedSpecs.maxPvVoltage ?? parsedSpecs.maxPvOpenCircuitVoltageV,
    mpptCount: d1Item.mppt_count ?? parsedSpecs.mpptCount ?? parsedSpecs.numberOfMppt,
    numberOfMppt: d1Item.mppt_count ?? parsedSpecs.numberOfMppt ?? parsedSpecs.mpptCount,
    maxPvArrayPowerW: d1Item.max_pv_array_power_w ?? parsedSpecs.maxPvArrayPowerW,
    pvMpptVoltageRangeV: d1Item.pv_mppt_voltage_range_v || parsedSpecs.pvMpptVoltageRangeV || parsedSpecs.mppt || '',
    mppt: d1Item.pv_mppt_voltage_range_v || parsedSpecs.mppt || parsedSpecs.pvMpptVoltageRangeV || '',
    vmpV: d1Item.vmp_v ?? parsedSpecs.vmpV ?? (category === 'panels' ? parsedSpecs.voltage : '') ?? '',
    voltage: d1Item.vmp_v ?? parsedSpecs.voltage ?? parsedSpecs.vmpV ?? d1Item.nominal_voltage_v ?? d1Item.ac_voltage_v ?? '',
    vocV: d1Item.voc_v ?? parsedSpecs.vocV ?? parsedSpecs.voc ?? '',
    voc: d1Item.voc_v ?? parsedSpecs.voc ?? parsedSpecs.vocV ?? '',
    impA: d1Item.imp_a ?? parsedSpecs.impA ?? parsedSpecs.current ?? '',
    current: d1Item.imp_a ?? parsedSpecs.current ?? parsedSpecs.impA ?? '',
    iscA: d1Item.isc_a ?? parsedSpecs.iscA ?? parsedSpecs.isc ?? '',
    isc: d1Item.isc_a ?? parsedSpecs.isc ?? parsedSpecs.iscA ?? '',
    dimensionsMm: d1Item.dimensions_mm || parsedSpecs.dimensionsMm || parsedSpecs.dimensions || '',
    weightKg: d1Item.weight_kg || parsedSpecs.weightKg || parsedSpecs.weight || '',
    weight: d1Item.weight_kg || parsedSpecs.weight || parsedSpecs.weightKg || '',
    notes: d1Item.notes || parsedSpecs.notes || parsedSpecs.description || '',
    description: d1Item.notes || parsedSpecs.description || parsedSpecs.notes || '',
    type: d1Item.product_type || parsedSpecs.type || parsedSpecs.productType || d1Item.technology || parsedSpecs.technology || '',
    ...parsedSpecs,
  };

  // Dimensions parsing
  const parsedDims = parseDimensionsString(d1Item.dimensions_mm || specs.dimensionsMm || d1Item.machine_dimensions_w_h_d_mm);

  const length = d1Item.length !== undefined && d1Item.length !== null && d1Item.length !== ''
    ? Number(d1Item.length)
    : (specs.length !== undefined && specs.length !== null && specs.length !== '' && !isNaN(Number(specs.length))
        ? Number(specs.length)
        : parsedDims.length);

  const width = d1Item.width !== undefined && d1Item.width !== null && d1Item.width !== ''
    ? Number(d1Item.width)
    : (specs.width !== undefined && specs.width !== null && specs.width !== '' && !isNaN(Number(specs.width))
        ? Number(specs.width)
        : parsedDims.width);

  const thickness = d1Item.thickness !== undefined && d1Item.thickness !== null && d1Item.thickness !== ''
    ? Number(d1Item.thickness)
    : (specs.thickness !== undefined && specs.thickness !== null && specs.thickness !== '' && !isNaN(Number(specs.thickness))
        ? Number(specs.thickness)
        : parsedDims.thickness);

  const dimensionUnit = (d1Item.dimensionUnit || specs.dimensionUnit || parsedDims.dimensionUnit || (specs.dimensionsMm ? 'mm' : 'mm')) as DimensionUnit;

  let area = Number(d1Item.area ?? specs.area ?? 0);
  if ((!area || isNaN(area)) && parsedDims.area) {
    area = parsedDims.area;
  }
  if ((!area || isNaN(area)) && length && width) {
    if (dimensionUnit === 'mm') area = parseFloat(((length * width) / 1_000_000).toFixed(4));
    else if (dimensionUnit === 'cm') area = parseFloat(((length * width) / 10_000).toFixed(4));
    else if (dimensionUnit === 'm') area = parseFloat((length * width).toFixed(4));
  }

  const description = d1Item.notes || specs.description || specs.notes || nameAr;
  const notes = d1Item.notes || specs.notes || specs.description || nameAr;
  const image = d1Item.image_url || d1Item.image || baseMatch?.image || resolveDefaultD1Image(category, brand, name);
  const supplierId = d1Item.supplier_id || d1Item.supplierId || d1Item.supplier || '';
  const rawUpdatedAt = d1Item.updated_at || d1Item.updatedAt || new Date().toISOString().split('T')[0];
  const updatedAt = formatDateOnly(rawUpdatedAt);
  const datasheetUrl = d1Item.datasheet_url || d1Item.datasheetUrl;

  let status: 'available' | 'limited' | 'out_of_stock' = 'available';
  if (d1Item.availability) {
    const av = String(d1Item.availability).toLowerCase();
    if (av.includes('out') || av === 'out_of_stock') {
      status = 'out_of_stock';
    } else if (av.includes('limit') || av === 'limited') {
      status = 'limited';
    } else {
      status = 'available';
    }
  } else if (d1Item.status) {
    status = d1Item.status;
  }

  // Parse suppliers list
  let suppliers: Supplier[] = [];
  const cachedSup = supplierId ? supplierProfileCache.get(supplierId) : null;

  if (Array.isArray(d1Item.suppliers)) {
    suppliers = d1Item.suppliers.map((s: any) => {
      const sId = s.id || supplierId;
      const sCached = sId ? supplierProfileCache.get(sId) : null;
      const validName = (!isRawUidOrId(s.company) && s.company) ||
                        (!isRawUidOrId(s.name) && s.name) ||
                        sCached?.name ||
                        (d1Item.supplier_name && !isRawUidOrId(d1Item.supplier_name) ? d1Item.supplier_name : '') ||
                        'Enerjoo Certified Supplier';
      const validNameAr = (!isRawUidOrId(s.companyAr) && s.companyAr) ||
                          (!isRawUidOrId(s.company) && s.company) ||
                          (!isRawUidOrId(s.nameAr) && s.nameAr) ||
                          (!isRawUidOrId(s.name) && s.name) ||
                          sCached?.nameAr ||
                          sCached?.name ||
                          (d1Item.supplier_name_ar && !isRawUidOrId(d1Item.supplier_name_ar) ? d1Item.supplier_name_ar : '') ||
                          'مورد معتمد';
      return {
        ...s,
        id: sId,
        name: validName,
        nameAr: validNameAr,
        lastUpdate: formatDateOnly(s.lastUpdate || updatedAt),
      };
    });
  } else if (typeof d1Item.suppliers === 'string') {
    try {
      const parsed = JSON.parse(d1Item.suppliers);
      if (Array.isArray(parsed)) {
        suppliers = parsed.map((s: any) => {
          const sId = s.id || supplierId;
          const sCached = sId ? supplierProfileCache.get(sId) : null;
          const validName = (!isRawUidOrId(s.company) && s.company) ||
                            (!isRawUidOrId(s.name) && s.name) ||
                            sCached?.name ||
                            (d1Item.supplier_name && !isRawUidOrId(d1Item.supplier_name) ? d1Item.supplier_name : '') ||
                            'Enerjoo Certified Supplier';
          const validNameAr = (!isRawUidOrId(s.companyAr) && s.companyAr) ||
                              (!isRawUidOrId(s.company) && s.company) ||
                              (!isRawUidOrId(s.nameAr) && s.nameAr) ||
                              (!isRawUidOrId(s.name) && s.name) ||
                              sCached?.nameAr ||
                              sCached?.name ||
                              (d1Item.supplier_name_ar && !isRawUidOrId(d1Item.supplier_name_ar) ? d1Item.supplier_name_ar : '') ||
                              'مورد معتمد';
          return {
            ...s,
            id: sId,
            name: validName,
            nameAr: validNameAr,
            lastUpdate: formatDateOnly(s.lastUpdate || updatedAt),
          };
        });
      }
    } catch {
      suppliers = [];
    }
  }

  if (suppliers.length === 0 && (d1Item.supplier || supplierId)) {
    const rawSupName = d1Item.supplier_name && !isRawUidOrId(d1Item.supplier_name) ? d1Item.supplier_name : '';
    const rawSupNameAr = d1Item.supplier_name_ar && !isRawUidOrId(d1Item.supplier_name_ar) ? d1Item.supplier_name_ar : '';

    suppliers = [
      {
        id: supplierId,
        name: rawSupName || cachedSup?.name || 'Enerjoo Certified Supplier',
        nameAr: rawSupNameAr || cachedSup?.nameAr || cachedSup?.name || 'مورد معتمد',
        price: price,
        phone: d1Item.supplier_phone || cachedSup?.phone || SUPPLIER_CONTACT_PHONE_DISPLAY,
        location: d1Item.supplier_location || cachedSup?.location || 'Cairo, Egypt',
        verified: cachedSup?.verified ?? true,
        lastUpdate: updatedAt
      }
    ];
  }

  return {
    id,
    name,
    nameAr,
    brand,
    category,
    power,
    hp: d1Item.hp ?? specs.hp ?? baseMatch?.hp,
    area,
    length,
    width,
    thickness,
    dimensionUnit,
    efficiency,
    warranty,
    price,
    status,
    updatedAt,
    image,
    image_url: image,
    additionalImages: d1Item.additionalImages || specs.additionalImages || baseMatch?.additionalImages,
    supplierId,
    datasheetUrl,
    description,
    notes,
    specs,
    suppliers,
    max_pv_open_circuit_voltage_v: d1Item.max_pv_open_circuit_voltage_v !== undefined && d1Item.max_pv_open_circuit_voltage_v !== null && d1Item.max_pv_open_circuit_voltage_v !== '' ? Number(d1Item.max_pv_open_circuit_voltage_v) : undefined,
    mppt_count: d1Item.mppt_count !== undefined && d1Item.mppt_count !== null && d1Item.mppt_count !== '' ? Number(d1Item.mppt_count) : undefined
  };
}

function resolveStrictNumeric(
  rawVal: unknown,
  fieldKey: string,
  required = false
): number | null {
  const res = parseAndValidateNumericField(rawVal, fieldKey, { required });
  if (!res.valid) {
    const err: any = new Error(res.errorMessage || 'إحدى قيم المنتج الرقمية غير صالحة.');
    err.status = 400;
    err.code = 'INVALID_NUMERIC_VALUE';
    err.field = res.field;
    throw err;
  }
  return res.value;
}

/**
 * Maps frontend Product data to Cloudflare D1 Product payload.
 * Guarantees all numeric columns are finite numbers or null (never strings, NaN, Infinity, or unit-suffixed text).
 */
export function mapProductToD1Payload(product: Partial<Product> & { product_id?: string }): Record<string, any> {
  const payload: Record<string, any> = {
    _isEdited: true
  };

  if (product.product_id) payload.product_id = product.product_id;
  if (product.name) {
    payload.name = product.name;
    payload.model = product.name;
  }
  if (product.nameAr) {
    payload.nameAr = product.nameAr;
    payload.name_ar = product.nameAr;
  }
  if (product.brand) payload.brand = product.brand;
  if (product.category) {
    payload.product_category = mapCategoryToD1Category(product.category);
    payload.category = product.category;
  }

  // Price (required on new product, optional on partial update)
  if (product.price !== undefined || (product as any).price_egp !== undefined) {
    const priceVal = resolveStrictNumeric(product.price ?? (product as any).price_egp, 'price', false);
    payload.price_egp = priceVal;
    if (priceVal !== null) {
      payload.price = priceVal;
    }
  }

  // Power (W)
  if (product.power !== undefined || (product as any).power_w !== undefined) {
    const powerVal = resolveStrictNumeric(product.power ?? (product as any).power_w, 'power_w', false);
    payload.power_w = powerVal !== null && powerVal > 0 ? powerVal : null;
    if (powerVal !== null && powerVal > 0) {
      payload.power = powerVal;
    }
  }

  // Horsepower (HP)
  if (product.hp !== undefined || product.specs?.hp !== undefined) {
    const hpVal = resolveStrictNumeric(product.hp ?? product.specs?.hp, 'hp', false);
    payload.hp = hpVal;
  }

  // Efficiency (%)
  if (product.efficiency !== undefined || (product as any).efficiency_percent !== undefined) {
    const effVal = resolveStrictNumeric(product.efficiency ?? (product as any).efficiency_percent, 'efficiency_percent', false);
    payload.efficiency_percent = effVal !== null && effVal > 0 ? effVal : null;
    if (effVal !== null && effVal > 0) {
      payload.efficiency = effVal;
    }
  }

  // Warranty (Years)
  if (product.warranty !== undefined || (product as any).warranty_years !== undefined) {
    const warVal = resolveStrictNumeric(product.warranty ?? (product as any).warranty_years, 'warranty_years', false);
    payload.warranty_years = warVal !== null && warVal > 0 ? warVal : null;
    if (warVal !== null && warVal > 0) {
      payload.warranty = warVal;
    }
  }

  // Dimensions & Area
  const lengthVal = resolveStrictNumeric(product.length ?? product.specs?.length, 'length', false);
  const widthVal = resolveStrictNumeric(product.width ?? product.specs?.width, 'width', false);
  const thicknessVal = resolveStrictNumeric(product.thickness ?? product.specs?.thickness, 'thickness', false);
  const areaVal = resolveStrictNumeric(product.area ?? product.specs?.area, 'area', false);

  if (product.length !== undefined || product.specs?.length !== undefined) payload.length = lengthVal;
  if (product.width !== undefined || product.specs?.width !== undefined) payload.width = widthVal;
  if (product.thickness !== undefined || product.specs?.thickness !== undefined) payload.thickness = thicknessVal;
  if (product.area !== undefined || product.specs?.area !== undefined) {
    payload.area = areaVal !== null && areaVal > 0 ? areaVal : null;
  }

  if (product.dimensionUnit !== undefined) payload.dimensionUnit = product.dimensionUnit;
  if (product.additionalImages !== undefined) payload.additionalImages = product.additionalImages;

  // Format dimensions_mm for D1 database column
  const unit = product.dimensionUnit || product.specs?.dimensionUnit || 'mm';
  if (lengthVal !== null && widthVal !== null) {
    payload.dimensions_mm = `${lengthVal} x ${widthVal}${thicknessVal !== null ? ` x ${thicknessVal}` : ''} ${unit}`;
  } else if (product.specs?.dimensionsMm) {
    payload.dimensions_mm = String(product.specs.dimensionsMm).trim();
  }

  // Textual notes & product_type
  const descNotes = product.specs?.description || product.specs?.notes || product.description || product.notes || (product as any).notes;
  if (descNotes) {
    payload.notes = descNotes;
  }
  const prodType = product.specs?.type || product.specs?.productType || product.specs?.technology || (product as any).type || (product as any).product_type;
  if (prodType) {
    payload.product_type = prodType;
  }
  if (product.specs?.technology) {
    payload.technology = product.specs.technology;
  }

  // Weight (kg) - strictly numeric or null
  const rawWeight = product.specs?.weightKg ?? product.specs?.weight ?? (product as any).weight_kg ?? (product as any).weight;
  if (rawWeight !== undefined) {
    payload.weight_kg = resolveStrictNumeric(rawWeight, 'weight_kg', false);
  }

  // Category-aware electrical and battery parameters
  const effectiveCategory = product.category || mapD1CategoryToCategory((product as any).product_category);

  if (effectiveCategory === 'inverters') {
    // Inverter AC voltage is a text descriptor (e.g. "220/230" or "380/400")
    const rawAcVolt = product.specs?.acVoltageV ?? product.specs?.voltage ?? (product as any).ac_voltage_v;
    if (rawAcVolt !== undefined && rawAcVolt !== null && String(rawAcVolt).trim() !== '') {
      payload.ac_voltage_v = String(rawAcVolt).trim();
    }
    payload.vmp_v = null;
    payload.nominal_voltage_v = null;
    payload.imp_a = null;

    const rawKw = product.specs?.ratedPowerKw ?? product.specs?.powerKw ?? (product as any).rated_power_kw;
    if (rawKw !== undefined) {
      const kwVal = resolveStrictNumeric(rawKw, 'rated_power_kw', false);
      payload.rated_power_kw = kwVal !== null && kwVal > 0 ? kwVal : null;
      if (payload.rated_power_kw !== null && !payload.power_w) {
        payload.power_w = Math.round(payload.rated_power_kw * 1000);
        payload.power = payload.power_w;
      }
    }

    const rawMaxPv = product.specs?.maxPvVoltage ?? product.specs?.maxPvOpenCircuitVoltageV ?? (product as any).max_pv_open_circuit_voltage_v;
    if (rawMaxPv !== undefined) {
      payload.max_pv_open_circuit_voltage_v = resolveStrictNumeric(rawMaxPv, 'max_pv_open_circuit_voltage_v', false);
    }

    const rawMpptCount = product.specs?.mpptCount ?? product.specs?.numberOfMppt ?? (product as any).mppt_count ?? (product as any).number_of_mppt;
    if (rawMpptCount !== undefined) {
      const mpptCountVal = resolveStrictNumeric(rawMpptCount, 'number_of_mppt', false);
      payload.mppt_count = mpptCountVal;
      payload.number_of_mppt = mpptCountVal;
    }

    const rawMpptRange = product.specs?.pvMpptVoltageRangeV ?? product.specs?.mppt ?? (product as any).pv_mppt_voltage_range_v;
    if (rawMpptRange !== undefined && rawMpptRange !== null && String(rawMpptRange).trim() !== '') {
      payload.pv_mppt_voltage_range_v = String(rawMpptRange).trim();
    }
  } else if (effectiveCategory === 'batteries') {
    const rawNomVolt =
      product.specs?.nominalVoltage ??
      product.specs?.batteryVoltageV ??
      product.specs?.voltage ??
      (product as any).nominal_voltage_v ??
      (product as any).battery_voltage_v;
    if (rawNomVolt !== undefined) {
      const nomVoltVal = resolveStrictNumeric(rawNomVolt, 'nominal_voltage_v', false);
      payload.nominal_voltage_v = nomVoltVal;
      payload.battery_voltage_v = nomVoltVal;
    }
    payload.vmp_v = null;

    const rawCap = product.specs?.capacityAh ?? product.specs?.capacity ?? (product as any).capacity_ah ?? (product as any).capacity;
    if (rawCap !== undefined) {
      payload.capacity_ah = resolveStrictNumeric(rawCap, 'capacity_ah', false);
    }
  } else {
    // Solar panels & other categories
    const rawVmp = product.specs?.vmpV ?? product.specs?.voltage ?? (product as any).vmp_v ?? (product as any).Vmp ?? (product as any).voltage;
    if (rawVmp !== undefined) {
      payload.vmp_v = resolveStrictNumeric(rawVmp, 'vmp_v', false);
    }

    const rawVoc = product.specs?.vocV ?? product.specs?.voc ?? (product as any).voc_v ?? (product as any).Voc;
    if (rawVoc !== undefined) {
      payload.voc_v = resolveStrictNumeric(rawVoc, 'voc_v', false);
    }

    const rawImp = product.specs?.impA ?? product.specs?.current ?? (product as any).imp_a ?? (product as any).Imp ?? (product as any).current;
    if (rawImp !== undefined) {
      payload.imp_a = resolveStrictNumeric(rawImp, 'imp_a', false);
    }

    const rawIsc = product.specs?.iscA ?? product.specs?.isc ?? (product as any).isc_a ?? (product as any).Isc;
    if (rawIsc !== undefined) {
      payload.isc_a = resolveStrictNumeric(rawIsc, 'isc_a', false);
    }

    if (effectiveCategory !== 'panels' && product.specs?.nominalVoltage !== undefined) {
      payload.nominal_voltage_v = resolveStrictNumeric(product.specs.nominalVoltage, 'nominal_voltage_v', false);
    } else {
      payload.nominal_voltage_v = null;
    }
  }

  if (product.image) payload.image_url = product.image;
  if ((product as any).image_url) payload.image_url = (product as any).image_url;
  if (product.supplierId !== undefined) {
    payload.supplier_id = String(product.supplierId);
    payload.supplier = String(product.supplierId);
  }
  const primarySupplier = product.suppliers?.[0];
  if (primarySupplier) {
    if (primarySupplier.name && !isRawUidOrId(primarySupplier.name)) {
      payload.supplier_name = primarySupplier.name;
    }
    if (primarySupplier.nameAr && !isRawUidOrId(primarySupplier.nameAr)) {
      payload.supplier_name_ar = primarySupplier.nameAr;
    }
    if (primarySupplier.location) {
      payload.supplier_location = primarySupplier.location;
    }
    if (primarySupplier.phone) {
      payload.supplier_phone = primarySupplier.phone;
    }
  }
  if (product.datasheetUrl !== undefined) payload.datasheet_url = product.datasheetUrl;
  if (product.status) {
    payload.availability = product.status === 'available' ? 'Available' :
                           product.status === 'limited' ? 'Limited' : 'Out of Stock';
  }

  if (product.specs) {
    const cleanSpecs: Record<string, any> = { ...product.specs };
    // Ensure numeric specs inside JSON are clean numbers or omitted if null/empty
    if (payload.rated_power_kw !== undefined) {
      cleanSpecs.ratedPowerKw = payload.rated_power_kw ?? undefined;
      cleanSpecs.powerKw = payload.rated_power_kw ?? undefined;
    }
    if (payload.vmp_v !== undefined) {
      cleanSpecs.vmpV = payload.vmp_v ?? undefined;
      if (effectiveCategory === 'panels') {
        cleanSpecs.voltage = payload.vmp_v ?? undefined;
        delete cleanSpecs.nominalVoltage;
      }
    }
    if (payload.voc_v !== undefined) {
      cleanSpecs.vocV = payload.voc_v ?? undefined;
      cleanSpecs.voc = payload.voc_v ?? undefined;
    }
    if (payload.imp_a !== undefined) {
      cleanSpecs.impA = payload.imp_a ?? undefined;
      if (effectiveCategory === 'panels') {
        cleanSpecs.current = payload.imp_a ?? undefined;
      }
    }
    if (payload.isc_a !== undefined) {
      cleanSpecs.iscA = payload.isc_a ?? undefined;
      cleanSpecs.isc = payload.isc_a ?? undefined;
    }
    if (payload.weight_kg !== undefined) {
      cleanSpecs.weightKg = payload.weight_kg ?? undefined;
      cleanSpecs.weight = payload.weight_kg ?? undefined;
    }
    if (payload.capacity_ah !== undefined) {
      cleanSpecs.capacityAh = payload.capacity_ah ?? undefined;
      cleanSpecs.capacity = payload.capacity_ah ?? undefined;
    }
    if (payload.nominal_voltage_v !== undefined && effectiveCategory === 'batteries') {
      cleanSpecs.nominalVoltage = payload.nominal_voltage_v ?? undefined;
      cleanSpecs.batteryVoltageV = payload.nominal_voltage_v ?? undefined;
    }
    if (payload.max_pv_open_circuit_voltage_v !== undefined) {
      cleanSpecs.maxPvVoltage = payload.max_pv_open_circuit_voltage_v ?? undefined;
      cleanSpecs.maxPvOpenCircuitVoltageV = payload.max_pv_open_circuit_voltage_v ?? undefined;
    }
    if (payload.mppt_count !== undefined) {
      cleanSpecs.mpptCount = payload.mppt_count ?? undefined;
      cleanSpecs.numberOfMppt = payload.mppt_count ?? undefined;
    }
    payload.specs = JSON.stringify(cleanSpecs);
  }

  if (product.suppliers) {
    payload.suppliers = JSON.stringify(product.suppliers);
  }

  // Final pass to guarantee all D1 numeric columns are strictly finite number | null
  const finalCheck = validateAndNormalizeD1ProductNumericFields(payload, { isUpdate: true });
  if (!finalCheck.valid) {
    const err: any = new Error(finalCheck.errorMessage || 'إحدى قيم المنتج الرقمية غير صالحة.');
    err.status = 400;
    err.code = 'INVALID_NUMERIC_VALUE';
    err.field = finalCheck.field;
    throw err;
  }

  return finalCheck.normalizedPayload;
}

/**
 * Fetch all products from Cloudflare D1 via Worker API with resilient catalog fallback.
 */
export const getProducts = async (): Promise<Product[]> => {
  const deletedSet = getDeletedProductIds();
  try {
    const data = await requestProductsApi<{ success?: boolean; ok?: boolean; count?: number; d1_count?: number; deleted_ids?: string[]; products: any[] }>('/products');
    if (data && Array.isArray(data.deleted_ids)) {
      for (const delId of data.deleted_ids) {
        const dStr = String(delId).trim();
        deletedSet.add(dStr);
        markProductAsDeleted(dStr);
      }
    }

    if (data && Array.isArray(data.products)) {
      let rawD1List = [...data.products];

      // Only harvest partitions if the response came from a legacy 10-item-capped Worker response without count/d1_count
      if (rawD1List.length === 10 && !data.d1_count && data.count === undefined) {
        const partitions = [
          'PROD-1789',
          'PROD-1790081', 'PROD-1790082', 'PROD-1790083', 'PROD-1790085', 'PROD-1790086', 'PROD-1790087',
          'PROD-1790193', 'PROD-1790194', 'PROD-1790195', 'PROD-1790196',
          'PROD-179028', 'PROD-179052', 'PROD-179092', 'PROD-17910', 'PROD-17913', 'PROD-17914', 'PROD-17917', 'PROD-1792', 'PROD-1793'
        ];
        const partMap = new Map<string, any>();
        for (const p of rawD1List) {
          const cId = getCanonicalProductId(p);
          if (cId) partMap.set(cId, p);
        }
        await Promise.all(partitions.map(async (q) => {
          try {
            const pData = await requestProductsApi<{ products?: any[] }>(`/products?q=${encodeURIComponent(q)}`);
            for (const item of (pData.products || [])) {
              const cId = getCanonicalProductId(item);
              if (cId) partMap.set(cId, item);
            }
          } catch {
            // Ignore partition failure
          }
        }));
        rawD1List = Array.from(partMap.values());
      }

      const mappedD1 = rawD1List
        .filter(p => {
          const pId = getCanonicalProductId(p);
          return Boolean(pId) && !deletedSet.has(pId);
        })
        .map(mapD1ProductToProduct)
        .filter(p => {
          const cId = getCanonicalProductId(p);
          return Boolean(cId) && !deletedSet.has(cId) && !deletedSet.has(String(p.id));
        });

      // D1 is the sole Single Source of Truth - deduplicate strictly by canonical product ID
      const productsMap = new Map<string, Product>();
      for (const d1Prod of mappedD1) {
        const id = getCanonicalProductId(d1Prod);
        if (id) {
          productsMap.set(id, d1Prod);
        }
      }

      // Overlay locally edited products for records existing in D1
      const editedMap = getEditedProducts();
      for (const [rawId, editedProd] of Object.entries(editedMap)) {
        const id = String(rawId).trim();
        if (id && !deletedSet.has(id) && productsMap.has(id)) {
          const existing = productsMap.get(id)!;
          productsMap.set(id, {
            ...existing,
            ...editedProd,
            id: existing.id,
            specs: {
              ...(existing?.specs || {}),
              ...(editedProd.specs || {})
            }
          } as Product);
        }
      }

      return deduplicateProducts(Array.from(productsMap.values()));
    }

    return [];
  } catch (error) {
    console.warn('Could not fetch products from Cloudflare D1:', error);
    return [];
  }
};

/**
 * Fetch a single product by ID from Cloudflare D1 via Worker API with fallback.
 * Returns null if the product is not found or an error occurs.
 */
export const getProductById = async (productId: string | number): Promise<Product | null> => {
  const pId = String(productId);
  if (getDeletedProductIds().has(pId)) {
    return null;
  }

  // Check locally edited overrides first
  const editedMap = getEditedProducts();
  if (editedMap[pId] && !getDeletedProductIds().has(pId)) {
    return editedMap[pId];
  }

  try {
    const data = await requestProductsApi<{ success?: boolean; ok?: boolean; product: any; notFound?: boolean }>(`/products/${productId}`);
    if (data && data.notFound) {
      if (getProductsApiBaseUrl() === '/api') {
        return null;
      }
    }
    if (data && data.product) {
      const prod = mapD1ProductToProduct(data.product);
      if (getDeletedProductIds().has(String(prod.id))) return null;
      return prod;
    }
  } catch {
    // Non-blocking, fallback to catalog / list lookup
  }

  try {
    const all = await getProducts();
    const foundInAll = all.find(p => String(p.id) === pId || String((p as any).product_id) === pId);
    if (foundInAll && !getDeletedProductIds().has(String(foundInAll.id))) {
      return foundInAll;
    }
  } catch {
    // Fallback
  }

  return null;
};

/**
 * Fetch all inverters classified into the standardized StructuredInverter contract.
 * Single Source of Truth for frontend views, comparisons and calculators.
 */
export const getStructuredInverters = async (): Promise<StructuredInverter[]> => {
  try {
    const allProds = await getProducts();
    const inverterProds = allProds.filter(p => (p.category || '').toLowerCase().includes('invert'));
    return inverterProds.map(classifyInverter);
  } catch (error) {
    console.error('Failed to get structured inverters:', error);
    return [];
  }
};

/**
 * Fetch single structured inverter by ID
 */
export const getStructuredInverterById = async (productId: string | number): Promise<StructuredInverter | null> => {
  const prod = await getProductById(productId);
  if (!prod || !(prod.category || '').toLowerCase().includes('invert')) return null;
  return classifyInverter(prod);
};

/**
 * Match inverters against customer criteria using the 10-step AI recommendation logic
 */
export const matchCatalogInverters = async (
  criteriaOrQuery: string | InverterQueryCriteria
): Promise<InverterMatchResult[]> => {
  const inverters = await getStructuredInverters();
  const criteria = typeof criteriaOrQuery === 'string' ? parseInverterQuery(criteriaOrQuery) : criteriaOrQuery;
  return matchInverters(inverters, criteria);
};

/**
 * Subscribe to products: loads initial products from Cloudflare D1 Worker API,
 * invokes callback(products), registers listener for local product mutations,
 * and returns a safe unsubscribe function.
 */
export const subscribeToProducts = (callback: (products: Product[]) => void): (() => void) => {
  let isSubscribed = true;
  const initialSeq = ++latestProductsFetchSeq;

  // Initial load from Cloudflare D1 / Backend API
  getProducts().then(products => {
    if (isSubscribed && products && initialSeq === latestProductsFetchSeq) {
      callback(deduplicateProducts(products));
    }
  }).catch(error => {
    console.warn('Cloudflare D1 Products Initial Load Notice:', error);
    if (isSubscribed && initialSeq === latestProductsFetchSeq) {
      callback([]);
    }
  });

  // Track active listener to push updates whenever addProduct, updateProduct or deleteProduct is called
  const listener: ProductsListener = (updatedProducts) => {
    if (isSubscribed && updatedProducts) {
      callback(deduplicateProducts(filterDeletedProducts(updatedProducts)));
    }
  };
  activeProductListeners.add(listener);

  // Safe unsubscribe function
  return () => {
    isSubscribed = false;
    activeProductListeners.delete(listener);
  };
};

const SERVICE_ADMIN_EMAILS = ['enerjoo365@gmail.com', 'enerjoo320@gmail.com'];
const SERVICE_EXCLUDED_ADMIN_EMAILS = [
  'eng.faressnasser@gmail.com',
  'faressnasser12@gmail.com',
  'siefsameh221@gmail.com'
];

/**
 * Verifies from Firestore (`users/{uid}`) that the currently signed-in user is either:
 * - An administrator (`admin`), OR
 * - An approved supplier (`type === 'supplier' && verified === true && rejected !== true`).
 * Throws an HTTP 403 error if the supplier account is pending review or rejected.
 */
export const verifyCurrentSupplierApprovalStatus = async (): Promise<{
  uid: string;
  role: 'admin' | 'supplier';
}> => {
  const currentUser = auth?.currentUser;
  if (!currentUser?.uid) {
    const unauthErr: any = new Error(
      'يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من إضافة أو تعديل المنتجات.'
    );
    unauthErr.status = 401;
    unauthErr.code = 'UNAUTHORIZED';
    throw unauthErr;
  }

  const uid = currentUser.uid;
  const authEmail = String(currentUser.email || '').toLowerCase().trim();
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  const data = snap.exists() ? snap.data() : {};
  const docEmail = String(data?.email || authEmail).toLowerCase().trim();
  const isExcludedAdmin = SERVICE_EXCLUDED_ADMIN_EMAILS.includes(docEmail);
  const isAdmin =
    !isExcludedAdmin &&
    (SERVICE_ADMIN_EMAILS.includes(docEmail) || data?.type === 'admin');

  if (isAdmin) {
    return { uid, role: 'admin' };
  }

  if (data?.type === 'supplier' || data?.role === 'supplier') {
    if (Boolean(data.rejected)) {
      const rejErr: any = new Error(
        'تم رفض أو تعليق حساب المورد من قبل إدارة Enerjoo. لا يمكنك إضافة أو نشر منتجات.'
      );
      rejErr.status = 403;
      rejErr.code = 'SUPPLIER_REJECTED';
      throw rejErr;
    }
    if (data.verified !== true && data.verified !== 'true' && data.verified !== 1) {
      const unvErr: any = new Error(
        'حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo.'
      );
      unvErr.status = 403;
      unvErr.code = 'SUPPLIER_NOT_VERIFIED';
      throw unvErr;
    }
    return { uid, role: 'supplier' };
  }

  const roleErr: any = new Error(
    'هذا الحساب مسجل كعميل وليس كمورد. إضافة المنتجات وتعديلها وحذفها متاحة للموردين المعتمدين وإدارة المنصة فقط.'
  );
  roleErr.status = 403;
  roleErr.code = 'CUSTOMER_FORBIDDEN';
  throw roleErr;
};

const verifyCurrentUserIsAdmin = async (): Promise<void> => {
  const currentUser = auth?.currentUser;
  if (!currentUser?.uid) {
    throw new Error('صلاحية مسؤول مطلوبة لتنفيذ هذا الإجراء.');
  }
  const authEmail = String(currentUser.email || '').toLowerCase().trim();
  const snap = await getDoc(doc(db, USERS_COLLECTION, currentUser.uid));
  const data = snap.exists() ? snap.data() : {};
  const docEmail = String(data?.email || authEmail).toLowerCase().trim();
  const isExcludedAdmin = SERVICE_EXCLUDED_ADMIN_EMAILS.includes(docEmail);
  const isAdmin =
    !isExcludedAdmin &&
    (SERVICE_ADMIN_EMAILS.includes(docEmail) || data?.type === 'admin');
  if (!isAdmin) {
    throw new Error('صلاحية مسؤول مطلوبة لاعتماد أو تعديل حالة الموردين.');
  }
};

/**
 * Add a new product to Cloudflare D1 via Worker API (POST /products).
 * Strictly requires an approved supplier (`verified === true && !rejected`) or admin.
 * Uses product_id as the D1 identifier and returns product_id upon confirmed database save.
 */
export const addProduct = async (product: Omit<Product, 'id'> & { id?: string | number }): Promise<string> => {
  const authInfo = await verifyCurrentSupplierApprovalStatus();
  const newProductId = (product.id ? String(product.id) : `PROD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`).toUpperCase();
  const productWithSupplier =
    authInfo.role === 'supplier'
      ? {
          ...product,
          supplierId: authInfo.uid,
          suppliers: Array.isArray(product.suppliers) && product.suppliers.length > 0
            ? product.suppliers.map(s => ({ ...s, id: authInfo.uid, verified: true }))
            : undefined,
          verified: true
        }
      : { ...product, verified: true };
  const payload = {
    ...mapProductToD1Payload(productWithSupplier),
    product_id: newProductId,
    ...(authInfo.role === 'supplier'
      ? { supplier_id: authInfo.uid, supplier: authInfo.uid, supplierId: authInfo.uid }
      : {})
  };

  let createdId = newProductId;
  try {
    const res = await requestProductsApi<{ success?: boolean; ok?: boolean; message?: string; product_id?: string }>('/products', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    createdId = res.product_id || newProductId;
  } catch (postErr: any) {
    // If retrying a previous attempt with the same product_id that already reached D1 (409 Conflict),
    // update the existing record in place instead of failing or creating a duplicate.
    const isConflict =
      postErr?.status === 409 ||
      postErr?.code === 'CONFLICT' ||
      String(postErr?.message || '').includes('already exists') ||
      String(postErr?.detail || '').includes('already exists');
    if (isConflict) {
      await requestProductsApi<{ success?: boolean; ok?: boolean }>(
        `/products/${encodeURIComponent(newProductId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() })
        }
      );
      createdId = newProductId;
    } else {
      throw postErr;
    }
  }

  unmarkProductAsDeleted(createdId);
  saveEditedProduct(createdId, { ...productWithSupplier, id: createdId });
  await notifyProductListeners();
  return createdId;
};

/**
 * Update an existing product in Cloudflare D1 via Worker API (PUT /products/:id).
 * Strictly requires an approved supplier (`verified === true && !rejected`) owning the product, or admin.
 * Strictly verifies that the API operation succeeded before persisting local state or reporting success.
 */
export const updateProduct = async (productId: string | number, data: Partial<Product>): Promise<void> => {
  const authInfo = await verifyCurrentSupplierApprovalStatus();
  const pId = String(productId);
  const sanitizedData: Partial<Product> =
    authInfo.role === 'supplier'
      ? {
          ...data,
          supplierId: authInfo.uid,
          suppliers: Array.isArray(data.suppliers) && data.suppliers.length > 0
            ? data.suppliers.map(s => ({ ...s, id: authInfo.uid }))
            : data.suppliers
        }
      : data;

  const payload = mapProductToD1Payload(sanitizedData);
  payload.product_id = pId;
  if (authInfo.role === 'supplier') {
    payload.supplier_id = authInfo.uid;
    payload.supplier = authInfo.uid;
  }
  payload.updated_at = new Date().toISOString();

  try {
    await requestProductsApi<{ success?: boolean; ok?: boolean; error?: string }>(
      `/products/${encodeURIComponent(pId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
  } catch (putErr: any) {
    // Only fallback to POST /products if PUT returned 404 specifically because a baseline product row is not yet in D1
    const isRouteMissing =
      putErr?.code === 'NOT_FOUND' ||
      putErr?.code === 'PRODUCT_NOT_FOUND' ||
      String(putErr?.detail || '').includes('المسار غير موجود');
    if (putErr?.status === 404 && !isRouteMissing && authInfo.role === 'admin') {
      await requestProductsApi<{ success?: boolean; ok?: boolean }>(`/products`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } else {
      throw putErr;
    }
  }

  // Persist locally and notify listeners ONLY after backend API confirms success
  unmarkProductAsDeleted(pId);
  saveEditedProduct(pId, sanitizedData);
  await notifyProductListeners();
};

/**
 * Delete a product from Cloudflare D1 via Worker API (DELETE /products/:id).
 * Strictly verifies that the API operation succeeded before removing the product or reporting success.
 */
export const deleteProduct = async (productId: string | number): Promise<void> => {
  await verifyCurrentSupplierApprovalStatus();
  const pId = String(productId);

  try {
    await requestProductsApi<{ success?: boolean; ok?: boolean; message?: string }>(
      `/products/${encodeURIComponent(pId)}`,
      {
        method: 'DELETE'
      }
    );
  } catch (delErr: any) {
    const isRouteMissing =
      delErr?.code === 'NOT_FOUND' ||
      delErr?.code === 'PRODUCT_NOT_FOUND' ||
      String(delErr?.detail || '').includes('المسار غير موجود');
    const isBaselineCatalogItem = productsData.some(p => String(p.id) === pId);
    if (delErr?.status === 404 && !isRouteMissing && isBaselineCatalogItem) {
      // Product only existed in baseline catalog and is already absent from remote D1
    } else {
      throw delErr;
    }
  }

  // Mark as deleted and notify listeners ONLY after backend API confirms deletion
  markProductAsDeleted(pId);
  removeEditedProduct(pId);
  await notifyProductListeners();
};

export const subscribeToSuppliers = (callback: (suppliers: Supplier[]) => void) => {
  const q = query(
    collection(db, USERS_COLLECTION),
    where('type', '==', 'supplier')
  );
  return onSnapshot(q, (snapshot) => {
    const suppliers = snapshot.docs
      .map(doc => {
        const data = doc.data();
        const imgUrl = data.profileImage || data.avatar || '';
        const cleanName = (!isRawUidOrId(data.company) && data.company) ||
                          (!isRawUidOrId(data.name) && data.name) ||
                          'Enerjoo Certified Supplier';
        const cleanNameAr = (!isRawUidOrId(data.companyAr) && data.companyAr) ||
                            (!isRawUidOrId(data.company) && data.company) ||
                            (!isRawUidOrId(data.nameAr) && data.nameAr) ||
                            (!isRawUidOrId(data.name) && data.name) ||
                            'مورد معتمد';
        const isRejected = Boolean(data.rejected);
        const isVerified = Boolean(data.verified) && !isRejected;
        const sup: Supplier = {
          id: doc.id,
          name: cleanName,
          nameAr: cleanNameAr,
          location: data.location || data.governorate || 'Cairo, Egypt',
          phone: data.phone || '',
          verified: isVerified,
          rejected: isRejected,
          email: data.email || '',
          avatar: imgUrl,
          profileImage: imgUrl,
          rating: data.rating || 0,
          totalSales: data.totalSales || 0,
          lastUpdate: formatDateOnly(data.updatedAt),
          price: data.price || 0,
        };
        supplierProfileCache.set(doc.id, sup);
        return sup;
      });
    callback(suppliers);
  }, (error) => {
    console.error('Firestore Suppliers Error:', error);
    callback([]);
  });
};

/**
 * Fetches a supplier/user profile by UID, prioritizing the memory cache
 * and falling back to Firestore users collection.
 */
export const getSupplierProfile = async (uid: string): Promise<Supplier | null> => {
  if (!uid) return null;
  if (supplierProfileCache.has(uid)) {
    return supplierProfileCache.get(uid)!;
  }
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const imgUrl = data.profileImage || data.avatar || '';
      const cleanName = (!isRawUidOrId(data.company) && data.company) ||
                        (!isRawUidOrId(data.name) && data.name) ||
                        'Enerjoo Certified Supplier';
      const cleanNameAr = (!isRawUidOrId(data.companyAr) && data.companyAr) ||
                          (!isRawUidOrId(data.company) && data.company) ||
                          (!isRawUidOrId(data.nameAr) && data.nameAr) ||
                          (!isRawUidOrId(data.name) && data.name) ||
                          'مورد معتمد';
      const isRejected = Boolean(data.rejected);
      const isVerified = Boolean(data.verified) && !isRejected;
      const sup: Supplier = {
        id: snap.id,
        name: cleanName,
        nameAr: cleanNameAr,
        location: data.location || data.governorate || 'Cairo, Egypt',
        phone: data.phone || '',
        verified: isVerified,
        rejected: isRejected,
        email: data.email || '',
        avatar: imgUrl,
        profileImage: imgUrl,
        rating: data.rating || 0,
        totalSales: data.totalSales || 0,
        lastUpdate: formatDateOnly(data.updatedAt),
        price: data.price || 0,
      };
      supplierProfileCache.set(uid, sup);
      return sup;
    }
  } catch (err) {
    console.warn(`Could not fetch profile for user ${uid}:`, err);
  }
  return null;
};

export const seedInitialData = async () => {
  // Preserve all user and supplier saved products
  return;
};

export const toggleSupplierVerification = async (uid: string, verified: boolean) => {
  try {
    await verifyCurrentUserIsAdmin();
    const docRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(docRef, { 
      verified: Boolean(verified),
      rejected: false,
      updatedAt: new Date().toISOString()
    });
    const cached = supplierProfileCache.get(uid);
    if (cached) {
      supplierProfileCache.set(uid, { ...cached, verified: Boolean(verified), rejected: false });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${uid}`);
  }
};

export const updateSupplierStatus = async (uid: string, status: 'approved' | 'pending' | 'rejected') => {
  try {
    await verifyCurrentUserIsAdmin();
    const docRef = doc(db, USERS_COLLECTION, uid);
    const nowIso = new Date().toISOString();
    if (status === 'approved') {
      await updateDoc(docRef, { verified: true, rejected: false, updatedAt: nowIso });
      const cached = supplierProfileCache.get(uid);
      if (cached) supplierProfileCache.set(uid, { ...cached, verified: true, rejected: false });
    } else if (status === 'rejected') {
      await updateDoc(docRef, { verified: false, rejected: true, updatedAt: nowIso });
      const cached = supplierProfileCache.get(uid);
      if (cached) supplierProfileCache.set(uid, { ...cached, verified: false, rejected: true });
    } else {
      await updateDoc(docRef, { verified: false, rejected: false, updatedAt: nowIso });
      const cached = supplierProfileCache.get(uid);
      if (cached) supplierProfileCache.set(uid, { ...cached, verified: false, rejected: false });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${uid}`);
  }
};

export const updateSupplierProfileImage = async (uid: string, imageUrl: string) => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    await setDoc(docRef, {
      profileImage: imageUrl,
      avatar: imageUrl,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${uid}`);
  }
};

export const subscribeToProductReviews = (productId: string, callback: (reviews: ProductReview[]) => void) => {
  const reviewsRef = collection(db, PRODUCTS_COLLECTION, productId.toString(), 'reviews');
  const q = query(reviewsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const reviews = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || '',
        userName: data.userName || '',
        rating: data.rating || 0,
        comment: data.comment || '',
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null,
      } as ProductReview;
    });
    callback(reviews);
  }, (error) => {
    console.warn(`Falling back query for reviews on product ${productId} without ordering:`, error.message);
    return onSnapshot(reviewsRef, (snapshot) => {
      const reviews = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || '',
          userName: data.userName || '',
          rating: data.rating || 0,
          comment: data.comment || '',
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null,
        } as ProductReview;
      });
      reviews.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      callback(reviews);
    }, (err) => {
      const errInfo = {
        error: err instanceof Error ? err.message : String(err),
        authInfo: {
          userId: auth.currentUser?.uid,
          email: auth.currentUser?.email,
          emailVerified: auth.currentUser?.emailVerified,
        },
        operationType: OperationType.LIST,
        path: `${PRODUCTS_COLLECTION}/${productId}/reviews`
      };
      console.error('Firestore Error:', JSON.stringify(errInfo));
      callback([]);
    });
  });
};

export const addProductReview = async (productId: string, review: Omit<ProductReview, 'id' | 'createdAt'>) => {
  try {
    const reviewsRef = collection(db, PRODUCTS_COLLECTION, productId.toString(), 'reviews');
    await addDoc(reviewsRef, {
      ...review,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PRODUCTS_COLLECTION}/${productId}/reviews`);
  }
};

export const deleteProductReview = async (productId: string, reviewId: string) => {
  try {
    const docRef = doc(db, PRODUCTS_COLLECTION, productId.toString(), 'reviews', reviewId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PRODUCTS_COLLECTION}/${productId}/reviews/${reviewId}`);
  }
};

/**
 * Generates a standard formatted Request ID (e.g., ENJ-20260831-4821)
 */
export function generateSolarRequestId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ENJ-${year}${month}${day}-${randomSuffix}`;
}

/**
 * Saves a new comprehensive solar system calculation request into Firestore
 */
export const createSolarRequest = async (
  requestData: Omit<SolarRequest, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, SOLAR_REQUESTS_COLLECTION), {
      ...requestData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SOLAR_REQUESTS_COLLECTION);
    return '';
  }
};

/**
 * Real-time subscription to all solar requests (for Admin Dashboard)
 */
export const subscribeToSolarRequests = (callback: (requests: SolarRequest[]) => void) => {
  const q = query(
    collection(db, SOLAR_REQUESTS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
      } as SolarRequest;
    });
    callback(requests);
  }, (error) => {
    console.warn("Solar requests with ordering failed, falling back to unordered query:", error.message);
    const fallbackQ = query(collection(db, SOLAR_REQUESTS_COLLECTION));
    return onSnapshot(fallbackQ, (snapshot) => {
      const requests = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
        } as SolarRequest;
      });
      requests.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      callback(requests);
    }, (err) => {
      console.error("Error subscribing to solar requests:", err);
      callback([]);
    });
  });
};

/**
 * Real-time subscription to a customer's specific solar requests
 */
export const subscribeToCustomerSolarRequests = (
  customerIdOrPhone: string,
  callback: (requests: SolarRequest[]) => void
) => {
  if (!customerIdOrPhone) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, SOLAR_REQUESTS_COLLECTION),
    where('customerId', '==', customerIdOrPhone)
  );

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
      } as SolarRequest;
    });
    requests.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
    callback(requests);
  }, (err) => {
    console.error("Error subscribing to customer solar requests:", err);
    callback([]);
  });
};

/**
 * Updates status and admin notes for a solar request
 */
export const updateSolarRequestStatus = async (
  requestId: string,
  status: SolarRequestStatus,
  adminNotes?: string
) => {
  try {
    const docRef = doc(db, SOLAR_REQUESTS_COLLECTION, requestId);
    const updatePayload: any = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (adminNotes !== undefined) {
      updatePayload.adminNotes = adminNotes;
    }
    await updateDoc(docRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SOLAR_REQUESTS_COLLECTION}/${requestId}`);
  }
};

/**
 * Deletes a solar request
 */
export const deleteSolarRequest = async (requestId: string) => {
  try {
    const docRef = doc(db, SOLAR_REQUESTS_COLLECTION, requestId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${SOLAR_REQUESTS_COLLECTION}/${requestId}`);
  }
};

/**
 * Creates or updates a customer document in customers/{uid}
 * Uses the authenticated Firebase UID as the document ID.
 * Preserves existing data (like createdAt or existing profile details) to prevent duplicates and data loss.
 */
export const createOrUpdateCustomer = async (data: {
  uid: string;
  fullName: string;
  phoneNumber: string;
  normalizedPhoneNumber: string;
  email?: string;
  governorate?: string;
  authProvider?: 'phone' | 'google' | 'email';
  legacyCustomerId?: string;
}): Promise<Customer> => {
  try {
    const customerDocRef = doc(db, CUSTOMERS_COLLECTION, data.uid);
    const docSnap = await getDoc(customerDocRef);

    let customerPayload: any;
    const now = new Date();

    const normalizedPhone = data.normalizedPhoneNumber || (data.phoneNumber ? normalizeEgyptianPhone(data.phoneNumber) : '');
    const phoneDisplay = data.phoneNumber || normalizedPhone;
    const cleanPhoneDigits = normalizedPhone.replace(/[^0-9]/g, '');
    const legacyId = data.legacyCustomerId || (cleanPhoneDigits ? `cust_${cleanPhoneDigits}` : undefined);

    if (docSnap.exists()) {
      const existing = docSnap.data();
      customerPayload = {
        uid: data.uid,
        fullName: data.fullName || existing.fullName || 'عميل إينرجو',
        phoneNumber: phoneDisplay || existing.phoneNumber || normalizedPhone,
        normalizedPhoneNumber: normalizedPhone || existing.normalizedPhoneNumber || phoneDisplay,
        email: data.email !== undefined ? data.email : (existing.email || ''),
        governorate: data.governorate || existing.governorate || 'القاهرة',
        authProvider: data.authProvider || existing.authProvider || 'phone',
        createdAt: existing.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        ...(legacyId ? { legacyCustomerId: legacyId } : (existing.legacyCustomerId ? { legacyCustomerId: existing.legacyCustomerId } : {}))
      };
      await setDoc(customerDocRef, customerPayload, { merge: true });
    } else {
      customerPayload = {
        uid: data.uid,
        fullName: data.fullName || 'عميل إينرجو',
        phoneNumber: phoneDisplay || normalizedPhone,
        normalizedPhoneNumber: normalizedPhone || phoneDisplay,
        email: data.email || '',
        governorate: data.governorate || 'القاهرة',
        authProvider: data.authProvider || 'phone',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        ...(legacyId ? { legacyCustomerId: legacyId } : {})
      };
      await setDoc(customerDocRef, customerPayload);
    }

    // Also sync with users collection for backwards-compatibility with existing views
    try {
      const userDocRef = doc(db, USERS_COLLECTION, data.uid);
      await setDoc(userDocRef, {
        uid: data.uid,
        name: customerPayload.fullName,
        nameAr: customerPayload.fullName,
        phone: customerPayload.phoneNumber,
        governorate: customerPayload.governorate,
        location: customerPayload.governorate,
        type: 'customer',
        verified: true,
        email: customerPayload.email || '',
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (userSyncErr) {
      console.warn("User sync notice (non-fatal):", userSyncErr);
    }

    return {
      ...customerPayload,
      createdAt: customerPayload.createdAt || now,
      updatedAt: now,
      lastLoginAt: now,
    } as Customer;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${CUSTOMERS_COLLECTION}/${data.uid}`);
    throw error;
  }
};

/**
 * Retrieves a customer document from customers/{uid}
 */
export const getCustomer = async (uid: string): Promise<Customer | null> => {
  try {
    const docRef = doc(db, CUSTOMERS_COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        fullName: data.fullName || '',
        phoneNumber: data.phoneNumber || '',
        normalizedPhoneNumber: data.normalizedPhoneNumber || '',
        email: data.email || '',
        governorate: data.governorate || 'القاهرة',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: data.lastLoginAt,
        authProvider: data.authProvider || 'phone'
      } as Customer;
    }
    return null;
  } catch (error) {
    console.warn("Could not get customer document:", error);
    return null;
  }
};

/**
 * Real-time subscription to a customer document
 */
export const subscribeToCustomer = (uid: string, callback: (customer: Customer | null) => void) => {
  if (!uid) {
    callback(null);
    return () => {};
  }
  const docRef = doc(db, CUSTOMERS_COLLECTION, uid);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      callback({
        uid: docSnap.id,
        fullName: data.fullName || '',
        phoneNumber: data.phoneNumber || '',
        normalizedPhoneNumber: data.normalizedPhoneNumber || '',
        email: data.email || '',
        governorate: data.governorate || 'القاهرة',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: data.lastLoginAt,
        authProvider: data.authProvider || 'phone'
      } as Customer);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn("Error subscribing to customer:", err);
    callback(null);
  });
};

/**
 * Creates and persists a quotation in Firestore 'quotations' collection
 * Explicitly handles: customerName, customerEmail, phone, systemType, location, usage, monthlyBill, batteryRequired, systemSpecs, targetTier, priceEstimate, status, and createdAt.
 */
export const createQuotation = async (
  quotationData: {
    customerName: string;
    customerEmail?: string;
    phone: string;
    systemType: string;
    location: string;
    usage?: number | string;
    monthlyBill?: number;
    batteryRequired?: boolean;
    systemSpecs?: string;
    targetTier?: string;
    priceEstimate: number;
    status?: QuotationStatus | string;
    requestId?: string;
    customerId?: string | null;
    userId?: string | null;
    governorate?: string;
    notes?: string;
    supplierContacted?: string;
    systemTypeName?: string;
    name?: string;
    email?: string;
    customerPhone?: string;
  }
): Promise<string> => {
  try {
    const rawPhone = quotationData.phone || quotationData.customerPhone || '';
    const normalizedPhone = rawPhone ? normalizeEgyptianPhone(rawPhone) : '';
    const cleanCustomerName = quotationData.customerName || quotationData.name || 'عميل إينرجو';
    const cleanEmail = quotationData.customerEmail || quotationData.email || '';
    const assignedRequestId = quotationData.requestId || generateSolarRequestId();

    const payload = {
      // Primary required schema fields
      customerName: cleanCustomerName,
      name: cleanCustomerName, // alias for backwards compatibility
      customerEmail: cleanEmail,
      email: cleanEmail, // alias for backwards compatibility
      phone: normalizedPhone || rawPhone,
      customerPhone: normalizedPhone || rawPhone, // alias for backwards compatibility
      systemType: quotationData.systemType || 'hybrid',
      systemTypeName: quotationData.systemTypeName || (
        quotationData.systemType === 'on-grid' ? 'متصل بالشبكة (On-Grid)' :
        quotationData.systemType === 'off-grid' ? 'منفصل (Off-Grid)' :
        quotationData.systemType === 'pump' ? 'طلمبات مياه الري (Pump)' : 'هجين (Hybrid)'
      ),
      location: quotationData.location || quotationData.governorate || 'مصر',
      governorate: quotationData.governorate || quotationData.location || 'القاهرة',
      usage: quotationData.usage !== undefined ? quotationData.usage : null,
      monthlyBill: quotationData.monthlyBill !== undefined ? quotationData.monthlyBill : null,
      batteryRequired: quotationData.batteryRequired !== undefined ? Boolean(quotationData.batteryRequired) : false,
      systemSpecs: quotationData.systemSpecs || '',
      targetTier: quotationData.targetTier || 'recommended',
      priceEstimate: quotationData.priceEstimate || 0,
      status: quotationData.status || 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Additional relations & notes
      requestId: assignedRequestId,
      customerId: quotationData.customerId || quotationData.userId || null,
      userId: quotationData.userId || quotationData.customerId || null,
      notes: quotationData.notes || '',
      supplierContacted: quotationData.supplierContacted || null
    };

    const docRef = await addDoc(collection(db, QUOTATIONS_COLLECTION), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, QUOTATIONS_COLLECTION);
    return '';
  }
};

/**
 * Updates an existing quotation document in 'quotations' collection
 */
export const updateQuotation = async (
  quotationId: string,
  data: Partial<Quotation>
): Promise<void> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    const updatePayload: any = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    if (data.customerName && !data.name) {
      updatePayload.name = data.customerName;
    }
    if (data.customerEmail && !data.email) {
      updatePayload.email = data.customerEmail;
    }
    if (data.phone && !data.customerPhone) {
      updatePayload.customerPhone = data.phone;
    }
    await updateDoc(docRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${QUOTATIONS_COLLECTION}/${quotationId}`);
  }
};

/**
 * Updates status and optional notes for a quotation
 */
export const updateQuotationStatus = async (
  quotationId: string,
  status: QuotationStatus | string,
  notes?: string
): Promise<void> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    const updatePayload: any = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (notes !== undefined) {
      updatePayload.notes = notes;
    }
    await updateDoc(docRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${QUOTATIONS_COLLECTION}/${quotationId}`);
  }
};

/**
 * Deletes a quotation document from 'quotations' collection
 */
export const deleteQuotation = async (quotationId: string): Promise<void> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${QUOTATIONS_COLLECTION}/${quotationId}`);
  }
};

/**
 * Retrieves a single quotation document by ID
 */
export const getQuotation = async (quotationId: string): Promise<Quotation | null> => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        customerName: data.customerName || data.name || '',
        name: data.name || data.customerName || '',
        customerEmail: data.customerEmail || data.email || '',
        email: data.email || data.customerEmail || '',
        phone: data.phone || data.customerPhone || '',
        customerPhone: data.customerPhone || data.phone || '',
        systemType: data.systemType || 'hybrid',
        systemTypeName: data.systemTypeName || '',
        location: data.location || data.governorate || '',
        governorate: data.governorate || data.location || '',
        usage: data.usage !== undefined ? data.usage : undefined,
        monthlyBill: data.monthlyBill !== undefined ? data.monthlyBill : undefined,
        batteryRequired: data.batteryRequired !== undefined ? Boolean(data.batteryRequired) : false,
        systemSpecs: data.systemSpecs || '',
        targetTier: data.targetTier || 'recommended',
        priceEstimate: data.priceEstimate || 0,
        status: data.status || 'pending',
        notes: data.notes || '',
        supplierContacted: data.supplierContacted || '',
        requestId: data.requestId || '',
        customerId: data.customerId || data.userId || null,
        userId: data.userId || data.customerId || null,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
      } as Quotation;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${QUOTATIONS_COLLECTION}/${quotationId}`);
    return null;
  }
};

/**
 * Real-time subscription to all quotations (for Admin / Sales Review)
 */
export const subscribeToQuotations = (callback: (quotations: Quotation[]) => void) => {
  const q = query(
    collection(db, QUOTATIONS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const quotations = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        customerName: data.customerName || data.name || '',
        name: data.name || data.customerName || '',
        customerEmail: data.customerEmail || data.email || '',
        email: data.email || data.customerEmail || '',
        phone: data.phone || data.customerPhone || '',
        customerPhone: data.customerPhone || data.phone || '',
        systemType: data.systemType || 'hybrid',
        systemTypeName: data.systemTypeName || '',
        location: data.location || data.governorate || '',
        governorate: data.governorate || data.location || '',
        usage: data.usage !== undefined ? data.usage : undefined,
        monthlyBill: data.monthlyBill !== undefined ? data.monthlyBill : undefined,
        batteryRequired: data.batteryRequired !== undefined ? Boolean(data.batteryRequired) : false,
        systemSpecs: data.systemSpecs || '',
        targetTier: data.targetTier || 'recommended',
        priceEstimate: data.priceEstimate || 0,
        status: data.status || 'pending',
        notes: data.notes || '',
        supplierContacted: data.supplierContacted || '',
        requestId: data.requestId || '',
        customerId: data.customerId || data.userId || null,
        userId: data.userId || data.customerId || null,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
      } as Quotation;
    });
    callback(quotations);
  }, (error) => {
    console.warn("Quotations with ordering failed, falling back to unordered query:", error.message);
    const fallbackQ = query(collection(db, QUOTATIONS_COLLECTION));
    return onSnapshot(fallbackQ, (snapshot) => {
      const quotations = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          customerName: data.customerName || data.name || '',
          name: data.name || data.customerName || '',
          customerEmail: data.customerEmail || data.email || '',
          email: data.email || data.customerEmail || '',
          phone: data.phone || data.customerPhone || '',
          customerPhone: data.customerPhone || data.phone || '',
          systemType: data.systemType || 'hybrid',
          systemTypeName: data.systemTypeName || '',
          location: data.location || data.governorate || '',
          governorate: data.governorate || data.location || '',
          usage: data.usage !== undefined ? data.usage : undefined,
          monthlyBill: data.monthlyBill !== undefined ? data.monthlyBill : undefined,
          batteryRequired: data.batteryRequired !== undefined ? Boolean(data.batteryRequired) : false,
          systemSpecs: data.systemSpecs || '',
          targetTier: data.targetTier || 'recommended',
          priceEstimate: data.priceEstimate || 0,
          status: data.status || 'pending',
          notes: data.notes || '',
          supplierContacted: data.supplierContacted || '',
          requestId: data.requestId || '',
          customerId: data.customerId || data.userId || null,
          userId: data.userId || data.customerId || null,
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
          updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
        } as Quotation;
      });
      quotations.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      callback(quotations);
    }, (err) => {
      console.error("Error subscribing to quotations:", err);
      callback([]);
    });
  });
};

/**
 * Real-time subscription to a customer's quotations
 */
export const subscribeToCustomerQuotations = (
  customerIdOrPhone: string,
  callback: (quotations: Quotation[]) => void
) => {
  if (!customerIdOrPhone) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, QUOTATIONS_COLLECTION),
    where('customerId', '==', customerIdOrPhone)
  );

  return onSnapshot(q, (snapshot) => {
    const quotations = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        customerName: data.customerName || data.name || '',
        name: data.name || data.customerName || '',
        customerEmail: data.customerEmail || data.email || '',
        email: data.email || data.customerEmail || '',
        phone: data.phone || data.customerPhone || '',
        customerPhone: data.customerPhone || data.phone || '',
        systemType: data.systemType || 'hybrid',
        systemTypeName: data.systemTypeName || '',
        location: data.location || data.governorate || '',
        governorate: data.governorate || data.location || '',
        usage: data.usage !== undefined ? data.usage : undefined,
        monthlyBill: data.monthlyBill !== undefined ? data.monthlyBill : undefined,
        batteryRequired: data.batteryRequired !== undefined ? Boolean(data.batteryRequired) : false,
        systemSpecs: data.systemSpecs || '',
        targetTier: data.targetTier || 'recommended',
        priceEstimate: data.priceEstimate || 0,
        status: data.status || 'pending',
        notes: data.notes || '',
        supplierContacted: data.supplierContacted || '',
        requestId: data.requestId || '',
        customerId: data.customerId || data.userId || null,
        userId: data.userId || data.customerId || null,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt) : new Date(),
      } as Quotation;
    });
    quotations.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
    callback(quotations);
  }, (err) => {
    console.error("Error subscribing to customer quotations:", err);
    callback([]);
  });
};


