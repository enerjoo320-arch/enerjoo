/**
 * Cloudflare Worker API for Enerjoo Solar Platform
 * Powered by Cloudflare Workers & Cloudflare D1
 *
 * Current Live URL: https://enerjoo-api.enerjoo320.workers.dev
 * Database Binding: env.DB
 */

import { runEnerjooSolarConsultant, RawCatalogProduct } from '../src/utils/enerjooSolarConsultant';
import { validateAndNormalizeD1ProductNumericFields } from '../src/utils/productNumericValidation';

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<{ success: boolean; meta?: any; results?: T[] }>;
  all<T = unknown>(): Promise<{ success: boolean; results: T[]; meta?: any }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ success: boolean; results?: T[] }>>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface Env {
  DB: D1Database;
  AI?: any;
  R2?: any;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  PRODUCT_ADMIN_EMAILS?: string;
  PRODUCT_ADMIN_UIDS?: string;
  FIREBASE_PROJECT_ID?: string;
  N8N_CHAT_ENABLED?: string;
  N8N_WEBHOOK_URL?: string;
  ENERJOO_N8N_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  REQUIRE_TURNSTILE?: string;
}

// ============================================================================
// CORS Configuration (Strict Whitelist - No Wildcards)
// ============================================================================
export const ALLOWED_ORIGINS = new Set([
  'https://enerjoo.com',
  'https://www.enerjoo.com',
  'https://enerjoo.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]);

export function isOriginAllowed(origin: string): boolean {
  if (!origin) return true; // Direct non-browser request or server-to-server
  const lower = origin.toLowerCase().trim();
  if (ALLOWED_ORIGINS.has(lower)) return true;
  // Strictly allow verified preview subdomains of enerjoo.com and Google Cloud Run dev/pre applets:
  if (/^https:\/\/[a-z0-9-]+\.enerjoo\.com$/.test(lower)) return true;
  if (/^https:\/\/ais-(?:dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(lower)) return true;
  return false;
}

export const getCorsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin') || '';
  if (!origin) {
    return { 'Vary': 'Origin' };
  }

  if (isOriginAllowed(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-Auth, X-Requested-With, Accept',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
  }

  // Not allowed: Return empty headers with Vary: Origin (no Access-Control-Allow-Origin)
  return { 'Vary': 'Origin' };
};

// ============================================================================
// Response Helpers
// ============================================================================
function json(data: unknown, status = 200, request?: Request): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (request) {
    Object.assign(headers, getCorsHeaders(request));
  } else {
    headers['Access-Control-Allow-Origin'] = 'https://enerjoo.com';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Firebase-Auth, X-Requested-With, Accept';
    headers['Vary'] = 'Origin';
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function errorJson(message: string, status = 400, request?: Request): Response {
  return json({ success: false, ok: false, error: message }, status, request);
}

function successJson(data: Record<string, unknown>, status = 200, request?: Request): Response {
  return json({ success: true, ok: true, ...data }, status, request);
}

// Generate simple UUID fallback for D1 record keys
function generateId(prefix?: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return prefix ? `${prefix}_${time}${rand}` : `${time}-${rand}`;
}

export const PRODUCT_ADMIN_EMAILS: string[] = ['enerjoo365@gmail.com', 'enerjoo320@gmail.com'];
export const PRODUCT_ADMIN_UIDS: string[] = ['enerjoo-admin-root'];
export const EXCLUDED_ADMIN_EMAILS: string[] = [
  'eng.faressnasser@gmail.com',
  'faressnasser12@gmail.com',
  'siefsameh221@gmail.com',
];

const DEFAULT_FIREBASE_PROJECT_ID = 'gen-lang-client-0409057996';
const DEFAULT_FIRESTORE_DATABASE_ID = 'ai-studio-2546f389-38ec-4b43-b0f4-5eede498569d';
const DEFAULT_N8N_PRODUCTION_WEBHOOK_URL = 'https://enerjoo-new.onrender.com/webhook/37e7e1fc-d599-4fde-8581-cd1802d059bb';

// ============================================================================
// Base64URL and Cryptographic Helpers
// ============================================================================
function decodeBase64UrlJson(segment: string): any {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4);
  const decoded = atob(padded);
  return JSON.parse(decoded);
}

function base64UrlToUint8Array(base64UrlStr: string): Uint8Array {
  const padded = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64UrlStr.length + 3) % 4);
  const binaryStr = atob(padded);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// Real Firebase ID Token RS256 Cryptographic Verification (Google JWKS)
// ============================================================================
interface JwksKeyCache {
  cryptoKey: CryptoKey;
  expiresAt: number;
}

const googleJwksCache = new Map<string, JwksKeyCache>();
let jwksLastFetchedAt = 0;

/**
 * Fetches Google's official public RSA JSON Web Key Set (JWKS) for Firebase Auth
 * and imports each key using WebCrypto (RSASSA-PKCS1-v1_5 / SHA-256).
 * Supports automatic key rotation when Google issues a new kid.
 */
async function fetchAndCacheGoogleJwks(force = false): Promise<void> {
  const nowMs = Date.now();
  // Throttle periodic refreshes to at most once per 60 seconds.
  // When force=true (unknown kid during rotation), throttle to once per 5 seconds to prevent rate-limiting.
  if (!force && nowMs - jwksLastFetchedAt < 60000 && googleJwksCache.size > 0) {
    return;
  }
  if (force && nowMs - jwksLastFetchedAt < 5000 && googleJwksCache.size > 0) {
    return;
  }

  const jwksUrl = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
  const res = await fetch(jwksUrl, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    console.warn(`[Firebase JWKS] Failed to fetch Google public keys: status ${res.status}`);
    return;
  }

  // Parse max-age from Cache-Control header, default to 6 hours
  const cacheControl = res.headers.get('Cache-Control') || '';
  const match = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = match ? parseInt(match[1], 10) : 21600;
  const expiresAt = nowMs + maxAgeSec * 1000;

  const data: any = await res.json();
  if (data && Array.isArray(data.keys)) {
    for (const key of data.keys) {
      if (key.kid && key.kty === 'RSA') {
        try {
          const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            key,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
          );
          googleJwksCache.set(key.kid, { cryptoKey, expiresAt });
        } catch (importErr) {
          console.warn(`[Firebase JWKS] Failed to import key kid=${key.kid}:`, importErr);
        }
      }
    }
    jwksLastFetchedAt = nowMs;
  }
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  claims: Record<string, any>;
}

/**
 * Cryptographically verifies a Firebase ID Token using Google's public JWK keys.
 * Validates algorithm (RS256), signature, project ID, expiration, and claims.
 */
export async function verifyFirebaseIdToken(
  rawToken: string,
  env: Env
): Promise<{
  valid: boolean;
  status: number;
  code: string;
  message: string;
  token?: VerifiedFirebaseToken;
}> {
  if (!rawToken || typeof rawToken !== 'string') {
    return {
      valid: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'سجّل الدخول إلى منصة Enerjoo ثم أعد المحاولة.',
    };
  }

  const parts = rawToken.split('.');
  if (parts.length !== 3 || parts[2].length < 40) {
    return {
      valid: false,
      status: 401,
      code: 'INVALID_TOKEN_FORMAT',
      message: 'رمز المصادقة غير صالح أو تالف.',
    };
  }

  let header: any;
  let payload: any;
  try {
    header = decodeBase64UrlJson(parts[0]);
    payload = decodeBase64UrlJson(parts[1]);
  } catch {
    return {
      valid: false,
      status: 401,
      code: 'MALFORMED_TOKEN',
      message: 'رمز المصادقة تالف وغير قابل للقراءة.',
    };
  }

  // 1. Verify Header claims
  if (header?.alg !== 'RS256' || typeof header?.kid !== 'string' || !header.kid.trim()) {
    return {
      valid: false,
      status: 401,
      code: 'UNSUPPORTED_ALGORITHM',
      message: 'نوع خوارزمية التشفير في الرمز غير مدعوم.',
    };
  }

  // 2. Verify Payload claims
  const nowSec = Math.floor(Date.now() / 1000);
  const expectedProjectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  if (
    typeof payload?.iss !== 'string' ||
    !payload.iss.startsWith('https://securetoken.google.com/') ||
    payload.iss !== `https://securetoken.google.com/${expectedProjectId}`
  ) {
    return {
      valid: false,
      status: 401,
      code: 'INVALID_ISSUER',
      message: 'جهة إصدار رمز المصادقة لا تتطابق مع مشروع Firebase المعتمد.',
    };
  }

  if (payload?.aud !== expectedProjectId) {
    return {
      valid: false,
      status: 401,
      code: 'INVALID_AUDIENCE',
      message: 'الجمهور المستهدف للرمز غير متطابق مع المنصة.',
    };
  }

  if (typeof payload?.exp !== 'number' || payload.exp <= nowSec - 120) {
    return {
      valid: false,
      status: 401,
      code: 'TOKEN_EXPIRED',
      message: 'انتهت صلاحية جلسة تسجيل الدخول. أعد تسجيل الدخول للمتابعة.',
    };
  }

  if (typeof payload?.iat !== 'number' || payload.iat > nowSec + 300) {
    return {
      valid: false,
      status: 401,
      code: 'INVALID_ISSUED_AT',
      message: 'توقيت إصدار الرمز غير صالح.',
    };
  }

  if (typeof payload?.sub !== 'string' || !payload.sub.trim()) {
    return {
      valid: false,
      status: 401,
      code: 'MISSING_SUBJECT',
      message: 'معرّف المستخدم مفقود في رمز المصادقة.',
    };
  }

  // 3. Cryptographic Signature Verification via Google JWKS
  const kid = header.kid.trim();
  let cachedKey = googleJwksCache.get(kid);

  if (!cachedKey || cachedKey.expiresAt < Date.now()) {
    await fetchAndCacheGoogleJwks(true);
    cachedKey = googleJwksCache.get(kid);
  }

  if (!cachedKey) {
    return {
      valid: false,
      status: 401,
      code: 'KEY_NOT_FOUND',
      message: 'مفتاح التحقق من توقيع الرمز غير موجود أو غير معتمد من Google.',
    };
  }

  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signatureBytes = base64UrlToUint8Array(parts[2]);

  let isSignatureValid = false;
  try {
    isSignatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cachedKey.cryptoKey,
      signatureBytes,
      signedData
    );
  } catch (verifyErr) {
    console.error('[Firebase Verification] Signature check error:', verifyErr);
    isSignatureValid = false;
  }

  if (!isSignatureValid) {
    return {
      valid: false,
      status: 401,
      code: 'INVALID_SIGNATURE',
      message: 'توقيع رمز المصادقة غير سليم. تم رفض الطلب لأسباب أمنية.',
    };
  }

  const uid = payload.sub.trim();
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  const emailVerified = Boolean(payload.email_verified);

  return {
    valid: true,
    status: 200,
    code: 'OK',
    message: 'Token verified successfully',
    token: {
      uid,
      email,
      emailVerified,
      name: payload.name || '',
      picture: payload.picture || '',
      claims: payload,
    },
  };
}

// ============================================================================
// Service Account OAuth2 Helper for Firestore REST API
// ============================================================================
interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: any;
}

interface CachedOAuthToken {
  accessToken: string;
  expiresAt: number;
}

const serviceAccountTokenCache = new Map<string, CachedOAuthToken>();

async function importPkcs8PrivateKey(pemKey: string): Promise<CryptoKey> {
  const cleanPem = pemKey
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(cleanPem), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

export async function getGoogleOAuth2AccessToken(
  serviceAccountJsonStr: string,
  scope: string
): Promise<string> {
  const nowMs = Date.now();
  const cached = serviceAccountTokenCache.get(scope);
  if (cached && cached.expiresAt > nowMs + 60000) {
    return cached.accessToken;
  }

  let sa: GoogleServiceAccount;
  try {
    sa = typeof serviceAccountJsonStr === 'string'
      ? JSON.parse(serviceAccountJsonStr)
      : (serviceAccountJsonStr as any);
  } catch {
    throw new Error('INVALID_SERVICE_ACCOUNT_JSON');
  }

  if (!sa.client_email || !sa.private_key) {
    throw new Error('MISSING_SERVICE_ACCOUNT_CREDENTIALS');
  }

  const nowSec = Math.floor(nowMs / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSec + 3600,
    iat: nowSec,
  };

  const encodeBase64Url = (obj: any) => {
    const jsonStr = JSON.stringify(obj);
    const base64 = btoa(jsonStr);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;
  const privateKey = await importPkcs8PrivateKey(sa.private_key);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureBase64Url = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const assertion = `${unsignedToken}.${signatureBase64Url}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAUTH_TOKEN_EXCHANGE_FAILED: ${tokenRes.status} ${errText}`);
  }

  const tokenData: any = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  serviceAccountTokenCache.set(scope, {
    accessToken,
    expiresAt: nowMs + expiresIn * 1000,
  });

  return accessToken;
}

// ============================================================================
// Authoritative User Document Resolution (Firestore / D1)
// ============================================================================
export async function fetchAuthoritativeFirestoreUser(
  uid: string,
  env: Env,
  rawToken?: string
): Promise<{
  success: boolean;
  status: number;
  user?: {
    uid: string;
    email: string;
    type: string;
    verified: boolean;
    rejected: boolean;
  };
  error?: string;
}> {
  const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const databaseId = DEFAULT_FIRESTORE_DATABASE_ID;

  // 1. Prepare candidate Authorization headers
  const authHeadersList: Array<Record<string, string>> = [];

  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      const accessToken = await getGoogleOAuth2AccessToken(saJson, FIRESTORE_SCOPE);
      if (accessToken) {
        authHeadersList.push({
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        });
      }
    } catch (saErr: any) {
      console.warn('Service Account token generation failed:', saErr?.message || saErr);
    }
  }

  if (rawToken && typeof rawToken === 'string' && rawToken.trim()) {
    authHeadersList.push({
      Authorization: `Bearer ${rawToken.trim()}`,
      Accept: 'application/json',
    });
  }

  authHeadersList.push({
    Accept: 'application/json',
  });

  // 2. Candidate Firestore REST endpoints
  const candidateUrls = [
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}`,
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/suppliers/${encodeURIComponent(uid)}`,
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
  ];

  let firestoreNetworkOrServerError = false;
  for (const url of candidateUrls) {
    for (const headers of authHeadersList) {
      try {
        const fsRes = await fetch(url, {
          method: 'GET',
          headers,
        });

        if (fsRes.status === 404) {
          continue;
        }

        if (fsRes.status >= 500) {
          firestoreNetworkOrServerError = true;
          continue;
        }

        if (fsRes.ok) {
          const docJson: any = await fsRes.json();
          if (docJson && docJson.fields) {
            const fields = docJson.fields;
            const email = String(fields.email?.stringValue || '').toLowerCase().trim();
            const type = String(fields.type?.stringValue || fields.role?.stringValue || '').toLowerCase().trim();
            const verified =
              fields.verified?.booleanValue === true ||
              fields.verified?.stringValue === 'true' ||
              fields.verified?.integerValue === '1';
            const rejected =
              fields.rejected?.booleanValue === true ||
              fields.rejected?.stringValue === 'true' ||
              fields.rejected?.integerValue === '1';

            return {
              success: true,
              status: 200,
              user: { uid, email, type, verified, rejected },
            };
          }
        }
      } catch (netErr: any) {
        firestoreNetworkOrServerError = true;
        console.warn(`Firestore REST query warning for ${url}:`, netErr?.message || netErr);
      }
    }
  }

  // 3. Fallback: Check Cloudflare D1 `users` table
  if (env.DB && typeof env.DB.prepare === 'function') {
    try {
      const d1User: any = await env.DB.prepare(
        'SELECT id, email, type, verified, rejected FROM users WHERE id = ?'
      )
        .bind(uid)
        .first();

      if (d1User) {
        const email = String(d1User.email || '').toLowerCase().trim();
        const type = String(d1User.type || 'customer').toLowerCase().trim();
        const verified =
          d1User.verified === 1 ||
          d1User.verified === true ||
          d1User.verified === 'true';
        const rejected =
          d1User.rejected === 1 ||
          d1User.rejected === true ||
          d1User.rejected === 'true';

        return {
          success: true,
          status: 200,
          user: { uid, email, type, verified, rejected },
        };
      }
    } catch (d1Err) {
      console.warn('D1 user lookup fallback warning:', d1Err);
      if (firestoreNetworkOrServerError) {
        return {
          success: false,
          status: 503,
          error: 'AUTH_STORES_UNAVAILABLE: Could not query Firestore or D1 auth stores.',
        };
      }
    }
  } else if (firestoreNetworkOrServerError) {
    return {
      success: false,
      status: 503,
      error: 'AUTH_STORES_UNAVAILABLE: Firestore is down and D1 DB binding is missing.',
    };
  }

  return {
    success: false,
    status: 404,
    error: `User document for UID '${uid}' not found in Firestore or D1.`,
  };
}

// ============================================================================
// Unified 3-Tier Permissions System (Admin / Supplier / Customer)
// ============================================================================
export interface AuthenticatedUser {
  uid: string;
  email: string;
  role: 'admin' | 'supplier' | 'customer';
  verified: boolean;
  rejected: boolean;
  rawToken: string;
  claims: Record<string, any>;
}

export interface AuthResult {
  allowed: boolean;
  status: number;
  code: string;
  message: string;
  user?: AuthenticatedUser;
}

/**
 * Authorizes a request and determines the caller's authoritative role.
 * - Admin: Full management. PRIVILEGE ESCALATION IMMUNITY: Only granted via verified environment
 *   configuration (PRODUCT_ADMIN_EMAILS / PRODUCT_ADMIN_UIDS) or verified Firebase Custom Claims.
 *   Mutable Firestore/D1 profile documents CANNOT grant admin role.
 * - Supplier: Manages own products and leads.
 * - Customer: Access to personal data and requests only.
 * - Fail-Closed: If database connection or permissions service fails, protected operations are rejected (503).
 */
export async function authenticateUser(request: Request, env: Env): Promise<AuthResult> {
  const authHeader =
    request.headers.get('Authorization') || request.headers.get('X-Firebase-Auth') || '';
  const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!rawToken) {
    return {
      allowed: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'سجّل الدخول إلى Enerjoo ثم أعد المحاولة.',
    };
  }

  // 1. Real cryptographic RS256 signature verification via Google JWKS
  const verifyResult = await verifyFirebaseIdToken(rawToken, env);
  if (!verifyResult.valid || !verifyResult.token) {
    return {
      allowed: false,
      status: verifyResult.status,
      code: verifyResult.code,
      message: verifyResult.message,
    };
  }

  const { uid, email, emailVerified, claims } = verifyResult.token;

  // 2. Determine if user is Admin
  // PRIVILEGE ESCALATION PREVENTION:
  // Admin role is EXCLUSIVELY granted via:
  // a) Explicit immutable admin config in Worker environment (PRODUCT_ADMIN_EMAILS / PRODUCT_ADMIN_UIDS)
  //    - PRODUCT_ADMIN_EMAILS: STRICTLY requires cryptographically verified email (emailVerified === true)
  //    - PRODUCT_ADMIN_UIDS: Matches verified token subject (uid) from server configuration only
  // b) Or cryptographically verified Firebase Custom Claims (claims.admin === true or claims.role === 'admin')
  const dynamicAdminEmails = env.PRODUCT_ADMIN_EMAILS
    ? env.PRODUCT_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
    : [];
  const dynamicAdminUids = env.PRODUCT_ADMIN_UIDS
    ? env.PRODUCT_ADMIN_UIDS.split(',').map(u => u.trim())
    : [];

  const allAdminEmails = [...PRODUCT_ADMIN_EMAILS, ...dynamicAdminEmails];
  const allAdminUids = [...PRODUCT_ADMIN_UIDS, ...dynamicAdminUids];

  const isExcluded = EXCLUDED_ADMIN_EMAILS.includes(email);
  const isAdminByClaim = !isExcluded && (claims.admin === true || claims.role === 'admin');
  // Admin by trusted server-side UID list (token sub only, never from request body)
  const isAdminByUid = !isExcluded && allAdminUids.length > 0 && allAdminUids.includes(uid);
  // Admin by trusted email list (requires emailVerified === true from cryptographic JWT)
  const isAdminByEmail = !isExcluded && Boolean(emailVerified) && allAdminEmails.includes(email);
  const isAdmin = isAdminByClaim || isAdminByUid || isAdminByEmail;

  if (isAdmin) {
    return {
      allowed: true,
      status: 200,
      code: 'OK',
      message: 'Authorized admin',
      user: {
        uid,
        email,
        role: 'admin',
        verified: true,
        rejected: false,
        rawToken,
        claims,
      },
    };
  }

  // 3. Fetch authoritative document from Firestore/D1 to determine role & verification
  const fsResult = await fetchAuthoritativeFirestoreUser(uid, env, rawToken);

  // FAIL-CLOSED: If fetching user permissions failed due to database outage (5xx), do not allow protected actions
  if (!fsResult.success && fsResult.status >= 500) {
    return {
      allowed: false,
      status: 503,
      code: 'AUTH_DATA_UNAVAILABLE',
      message: 'تعذر التحقق من بيانات وصلاحيات الحساب نتيجة خطأ في الاتصال بقاعدة البيانات. يرجى إعادة المحاولة لاحقاً.',
    };
  }

  let userRole: 'customer' | 'supplier' = 'customer';
  let isVerified = false;
  let isRejected = false;

  if (fsResult.success && fsResult.user) {
    const authoritativeType = (fsResult.user.type || '').toLowerCase().trim();
    // PRIVILEGE ESCALATION FIX: Under NO circumstances can a profile document grant Admin!
    // A profile document can only set supplier role if verified by Admin.
    if (authoritativeType === 'supplier') {
      userRole = 'supplier';
      isVerified = Boolean(fsResult.user.verified);
      isRejected = Boolean(fsResult.user.rejected);
    }
  }

  return {
    allowed: true,
    status: 200,
    code: 'OK',
    message: 'Authenticated user',
    user: {
      uid,
      email,
      role: userRole,
      verified: isVerified,
      rejected: isRejected,
      rawToken,
      claims,
    },
  };
}

/**
 * Optional authentication for public endpoints that accept guest submissions
 * (e.g. creating solar requests or quotations), but link to a user if signed in.
 */
export async function optionalAuthenticateUser(
  request: Request,
  env: Env
): Promise<AuthenticatedUser | null> {
  const authHeader =
    request.headers.get('Authorization') || request.headers.get('X-Firebase-Auth') || '';
  const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!rawToken) return null;

  try {
    const authResult = await authenticateUser(request, env);
    if (authResult.allowed && authResult.user) {
      return authResult.user;
    }
  } catch {
    // Ignore guest fallback
  }
  return null;
}

/**
 * Helper to enforce admin-only operations
 */
export function requireAdmin(authResult: AuthResult): { allowed: boolean; response?: Response } {
  if (!authResult.allowed || !authResult.user) {
    return {
      allowed: false,
      response: json({ ok: false, success: false, error: authResult.message }, authResult.status),
    };
  }
  if (authResult.user.role !== 'admin') {
    return {
      allowed: false,
      response: json(
        {
          ok: false,
          success: false,
          error: {
            code: 'ADMIN_REQUIRED',
            message: 'هذه العملية مخصصة لمديري منصة Enerjoo فقط.',
          },
        },
        403
      ),
    };
  }
  return { allowed: true };
}

// Preserve existing export for backward compatibility
export const authorizeProductWrite = async (
  request: Request,
  env: Env,
  options?: { requireAdminOnly?: boolean }
) => {
  const authResult = await authenticateUser(request, env);
  if (!authResult.allowed || !authResult.user) {
    return {
      allowed: false,
      status: authResult.status,
      code: authResult.code,
      message: authResult.message,
    };
  }

  const { user } = authResult;
  if (user.role === 'admin') {
    return {
      allowed: true,
      status: 200,
      code: 'OK',
      message: 'Authorized admin',
      uid: user.uid,
      email: user.email,
      role: 'admin' as const,
    };
  }

  if (options?.requireAdminOnly) {
    return {
      allowed: false,
      status: 403,
      code: 'ADMIN_REQUIRED',
      message: 'هذه العملية مخصصة لمديري منصة Enerjoo فقط.',
    };
  }

  if (user.role === 'customer') {
    return {
      allowed: false,
      status: 403,
      code: 'CUSTOMER_FORBIDDEN',
      message: 'هذا الحساب مسجل كعميل وليس كمورد. إضافة المنتجات وتعديلها وحذفها متاحة للموردين المعتمدين وإدارة المنصة فقط.',
      role: 'customer' as const,
      uid: user.uid,
    };
  }

  if (user.role === 'supplier') {
    if (user.rejected) {
      return {
        allowed: false,
        status: 403,
        code: 'SUPPLIER_REJECTED',
        message: 'تم رفض أو تعليق حساب المورد من قبل إدارة Enerjoo. لا يمكنك إضافة أو نشر منتجات.',
        role: 'supplier' as const,
        uid: user.uid,
      };
    }

    if (!user.verified) {
      return {
        allowed: false,
        status: 403,
        code: 'SUPPLIER_NOT_VERIFIED',
        message: 'حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo.',
        role: 'supplier' as const,
        uid: user.uid,
      };
    }

    return {
      allowed: true,
      status: 200,
      code: 'OK',
      message: 'Authorized verified supplier',
      uid: user.uid,
      email: user.email,
      role: 'supplier' as const,
    };
  }

  return {
    allowed: false,
    status: 403,
    code: 'ROLE_FORBIDDEN',
    message: 'نوع الحساب غير مصرح له بإدارة المنتجات.',
  };
};

export const verifyWorkerProductPublisher = authorizeProductWrite;

// ============================================================================
// Main Worker Fetch Handler
// ============================================================================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || '';
      if (origin && !isOriginAllowed(origin)) {
        return new Response(null, {
          status: 403,
          statusText: 'CORS Origin Forbidden',
        });
      }
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, ''); // Remove trailing slash
    const method = request.method.toUpperCase();

    // Check DB binding
    if (!env.DB) {
      return errorJson('Database connection (DB binding) not configured', 500, request);
    }

    try {
      // ----------------------------------------------------------------------
      // Root Health Endpoint (Preserved exactly + /health)
      // ----------------------------------------------------------------------
      if (path === '' || path === '/' || path === '/health') {
        return successJson(
          {
            service: 'Enerjoo API & AI Advisor',
            database: 'D1',
            ai: env.AI ? 'Workers AI' : 'Deterministic Consultant Engine',
            status: 'connected',
          },
          200,
          request
        );
      }

      // ----------------------------------------------------------------------
      // /chat & /api/chat (Enerjoo Solar Sales & Engineering Consultant - n8n Cloud Primary)
      // ----------------------------------------------------------------------
      if (path === '/chat' || path === '/api/chat') {
        return await handleChat(request, env);
      }

      // ----------------------------------------------------------------------
      // /products & /api/products
      // ----------------------------------------------------------------------
      if (
        path === '/products' ||
        path.startsWith('/products/') ||
        path === '/api/products' ||
        path.startsWith('/api/products/')
      ) {
        return await handleProducts(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /customers & /api/customers
      // ----------------------------------------------------------------------
      if (
        path === '/customers' ||
        path.startsWith('/customers/') ||
        path === '/api/customers' ||
        path.startsWith('/api/customers/')
      ) {
        return await handleCustomers(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /users & /api/users
      // ----------------------------------------------------------------------
      if (
        path === '/users' ||
        path.startsWith('/users/') ||
        path === '/api/users' ||
        path.startsWith('/api/users/')
      ) {
        return await handleUsers(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /suppliers & /api/suppliers
      // ----------------------------------------------------------------------
      if (
        path === '/suppliers' ||
        path.startsWith('/suppliers/') ||
        path === '/api/suppliers' ||
        path.startsWith('/api/suppliers/')
      ) {
        return await handleSuppliers(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /solar-requests & /api/solar-requests
      // ----------------------------------------------------------------------
      if (
        path === '/solar-requests' ||
        path.startsWith('/solar-requests/') ||
        path === '/api/solar-requests' ||
        path.startsWith('/api/solar-requests/')
      ) {
        return await handleSolarRequests(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /quotations & /api/quotations
      // ----------------------------------------------------------------------
      if (
        path === '/quotations' ||
        path.startsWith('/quotations/') ||
        path === '/api/quotations' ||
        path.startsWith('/api/quotations/')
      ) {
        return await handleQuotations(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /quotation-items & /api/quotation-items
      // ----------------------------------------------------------------------
      if (
        path === '/quotation-items' ||
        path.startsWith('/quotation-items/') ||
        path === '/api/quotation-items' ||
        path.startsWith('/api/quotation-items/')
      ) {
        return await handleQuotationItems(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /reviews & /api/reviews
      // ----------------------------------------------------------------------
      if (
        path === '/reviews' ||
        path.startsWith('/reviews/') ||
        path === '/api/reviews' ||
        path.startsWith('/api/reviews/')
      ) {
        return await handleProductReviews(request, env, path, method);
      }

      // ----------------------------------------------------------------------
      // /energy-exchange & /energy-exchange/prices (Cloudflare D1 Centralized Source)
      // ----------------------------------------------------------------------
      if (
        path === '/energy-exchange' ||
        path.startsWith('/energy-exchange/') ||
        path === '/api/energy-exchange' ||
        path.startsWith('/api/energy-exchange/')
      ) {
        return await handleEnergyExchange(request, env, path, method);
      }

      // Endpoint Not Found
      return errorJson('Endpoint not found', 404, request);
    } catch (err: any) {
      console.error('Unhandled Worker Error:', err);
      return errorJson('Internal Server Error', 500, request);
    }
  },
};

// ============================================================================
// 0. /chat Handler (n8n Production AI Agent Primary with Rollback Consultant)
// ============================================================================
function tryParseJsonSafe(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeN8nChatResponse(
  n8nRawText: string,
  sessionId: string
): {
  reply: string;
  products: any[];
  recommendation?: any;
  intent: string;
  sessionId: string;
} | null {
  const trimmedRaw = (n8nRawText || '').trim();
  if (!trimmedRaw) return null;

  let parsed: any = tryParseJsonSafe(trimmedRaw);

  // Unwrap double-encoded JSON string if returned by upstream node
  if (typeof parsed === 'string') {
    const inner = tryParseJsonSafe(parsed.trim());
    if (inner !== null) {
      parsed = inner;
    }
  }

  // Handle n8n array response [{ ... }]
  const item = Array.isArray(parsed) ? parsed[0] : parsed;

  if (typeof parsed === 'string' && parsed.trim()) {
    return {
      reply: parsed.trim(),
      products: [],
      intent: 'n8n_agent',
      sessionId,
    };
  }

  if (item && typeof item === 'object') {
    let rawReply =
      item.reply ??
      item.output ??
      item.text ??
      item.response ??
      item.message ??
      item.answer ??
      item.content;

    let products: any[] = Array.isArray(item.products)
      ? item.products
      : (Array.isArray(item.matchedProducts) ? item.matchedProducts : []);
    let recommendation = item.recommendation && typeof item.recommendation === 'object' ? item.recommendation : undefined;
    let intent = typeof item.intent === 'string' && item.intent.trim() ? item.intent.trim() : 'n8n_agent';
    const resolvedSessionId =
      typeof item.sessionId === 'string' && item.sessionId.trim()
        ? item.sessionId.trim()
        : (typeof item.session_id === 'string' && item.session_id.trim() ? item.session_id.trim() : sessionId);

    // Handle AI Agent JSON-serialized text inside `output` or `reply`
    if (typeof rawReply === 'string') {
      const candidate = rawReply.trim();
      if (candidate.startsWith('{') && candidate.endsWith('}')) {
        const nested = tryParseJsonSafe(candidate);
        if (nested && typeof nested === 'object') {
          const nestedReply =
            nested.reply ?? nested.output ?? nested.text ?? nested.response ?? nested.message ?? nested.answer;
          if (typeof nestedReply === 'string' && nestedReply.trim()) {
            rawReply = nestedReply;
          }
          if (Array.isArray(nested.products) && products.length === 0) {
            products = nested.products;
          }
          if (!recommendation && nested.recommendation && typeof nested.recommendation === 'object') {
            recommendation = nested.recommendation;
          }
          if (typeof nested.intent === 'string' && nested.intent.trim()) {
            intent = nested.intent.trim();
          }
        }
      }
    }

    if (typeof rawReply === 'string' && rawReply.trim().length > 0) {
      return {
        reply: rawReply.trim(),
        products,
        ...(recommendation ? { recommendation } : {}),
        intent,
        sessionId: resolvedSessionId,
      };
    }
  }

  // Fallback for valid plain text non-HTML response
  if (parsed === null && !trimmedRaw.startsWith('<')) {
    return {
      reply: trimmedRaw,
      products: [],
      intent: 'n8n_agent',
      sessionId,
    };
  }

  return null;
}

async function verifyTurnstileToken(token: string, secretKey: string, remoteIp?: string | null): Promise<boolean> {
  try {
    const form = new URLSearchParams();
    form.set('secret', secretKey);
    form.set('response', token);
    if (remoteIp) form.set('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const outcome: any = await res.json();
    return Boolean(outcome?.success);
  } catch {
    return false;
  }
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('Method not allowed for /chat. Use POST', 405, request);
  }

  // Preserve production Firebase Authentication enforcement on /chat
  const authResult = await authenticateUser(request, env);
  if (!authResult.allowed || !authResult.user) {
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: authResult.code || 'UNAUTHORIZED',
          message: authResult.message || 'سجّل الدخول إلى Enerjoo ثم أعد المحاولة.',
        },
      },
      authResult.status || 401,
      request
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return errorJson('صيغة الطلب غير صالحة (JSON).', 400, request);
  }

  // Optional / Configured Cloudflare Turnstile validation
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  if (env.TURNSTILE_SECRET_KEY && (turnstileToken || String(env.REQUIRE_TURNSTILE || '').toLowerCase() === 'true')) {
    if (!turnstileToken) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: 'TURNSTILE_REQUIRED',
            message: 'يرجى إتمام التحقق الأمني (Turnstile) ثم إعادة المحاولة.',
          },
        },
        403,
        request
      );
    }
    const cfIp = request.headers.get('CF-Connecting-IP');
    const turnstileOk = await verifyTurnstileToken(turnstileToken, env.TURNSTILE_SECRET_KEY, cfIp);
    if (!turnstileOk) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: 'TURNSTILE_FAILED',
            message: 'فشل التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى.',
          },
        },
        403,
        request
      );
    }
  }

  const rawMessage = (body.message || body.chatInput || '').trim();
  const rawMessages: any[] = Array.isArray(body.messages)
    ? body.messages
    : (Array.isArray(body.history) ? body.history : []);

  const safeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = rawMessages
    .filter(m => m && typeof (m.content || m.text) === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-10)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content || m.text)
        .replace(/(?:ignore all previous instructions|system prompt|jailbreak|developer mode)/gi, '')
        .slice(0, 1500)
    }));

  const userQuery = rawMessage || (safeMessages.length > 0 ? safeMessages[safeMessages.length - 1].content : '');
  if (!userQuery) {
    return json(
      {
        ok: false,
        success: false,
        error: {
          code: 'EMPTY_MESSAGE',
          message: 'يرجى كتابة رسالتك أولاً قبل الإرسال.',
        },
      },
      400,
      request
    );
  }

  // Keep client sessionId strictly stable throughout the conversation
  let sessionId = (body.sessionId || body.session_id || '').trim();
  if (!sessionId || sessionId === 'session-default') {
    sessionId = `user-${authResult.user.uid}`;
  }

  const messageId =
    typeof body.messageId === 'string' && body.messageId.trim()
      ? body.messageId.trim()
      : `msg-${Date.now()}`;

  const selectedProductIds = Array.isArray(body.selectedProductIds)
    ? body.selectedProductIds.filter((id: unknown) => typeof id === 'string' && id.trim().length > 0)
    : [];

  // Route active chat exclusively to n8n Production Webhook when N8N_CHAT_ENABLED=true
  const isN8nEnabled = String(env.N8N_CHAT_ENABLED ?? 'true').trim().toLowerCase() === 'true';

  if (isN8nEnabled) {
    const n8nWebhookUrl = (env.N8N_WEBHOOK_URL || DEFAULT_N8N_PRODUCTION_WEBHOOK_URL).trim();

    if (!env.ENERJOO_N8N_SECRET || !env.ENERJOO_N8N_SECRET.trim()) {
      console.error('[handleChat] Missing ENERJOO_N8N_SECRET configuration in Worker environment.');
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: 'N8N_CONFIG_ERROR',
            message: 'خدمة المساعد الذكي غير مهيأة حالياً. يرجى المحاولة لاحقاً.',
          },
        },
        503,
        request
      );
    }

    try {
      const n8nPayload = {
        message: userQuery,
        chatInput: userQuery,
        sessionId,
        messageId,
        history: safeMessages,
        selectedProductIds,
        turnstileToken,
        userId: authResult.user.uid,
      };

      const n8nRes = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Enerjoo-Key': env.ENERJOO_N8N_SECRET.trim(),
        },
        body: JSON.stringify(n8nPayload),
        signal: AbortSignal.timeout(25000),
      });

      const n8nRawText = await n8nRes.text().catch(() => '');

      if (!n8nRes.ok) {
        console.error(`[handleChat] n8n upstream returned HTTP ${n8nRes.status} for session=${sessionId.slice(0, 12)}`);
        const clientStatus = n8nRes.status === 404 ? 502 : n8nRes.status >= 500 ? 502 : 502;
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: 'AI_AGENT_UPSTREAM_ERROR',
              message: 'تعذر الحصول على رد من المساعد الذكي حالياً. يرجى المحاولة مرة أخرى بعد لحظات.',
            },
          },
          clientStatus,
          request
        );
      }

      const normalized = normalizeN8nChatResponse(n8nRawText, sessionId);
      if (!normalized) {
        console.error(`[handleChat] n8n upstream returned empty/malformed response for session=${sessionId.slice(0, 12)}`);
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: 'AI_AGENT_EMPTY_RESPONSE',
              message: 'لم يصل رد واضح من المساعد الذكي. من فضلك جرب إرسال رسالتك مرة أخرى.',
            },
          },
          502,
          request
        );
      }

      return json(
        {
          ok: true,
          success: true,
          reply: normalized.reply,
          products: normalized.products,
          ...(normalized.recommendation ? { recommendation: normalized.recommendation } : {}),
          intent: normalized.intent,
          source: 'n8n_agent',
          sessionId: normalized.sessionId,
        },
        200,
        request
      );
    } catch (n8nErr: any) {
      const isTimeout = n8nErr?.name === 'TimeoutError' || n8nErr?.name === 'AbortError';
      console.error(
        `[handleChat] n8n upstream ${isTimeout ? 'timeout' : 'connection error'} for session=${sessionId.slice(0, 12)}`
      );
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: isTimeout ? 'AI_AGENT_TIMEOUT' : 'AI_AGENT_UNREACHABLE',
            message: isTimeout
              ? 'استغرق المساعد الذكي وقتاً أطول من المعتاد. يرجى إعادة المحاولة.'
              : 'تعذر الاتصال بالمساعد الذكي حالياً. يرجى المحاولة مرة أخرى بعد لحظات.',
          },
        },
        isTimeout ? 504 : 502,
        request
      );
    }
  }

  // Preserved Legacy Rollback Engine (only active when N8N_CHAT_ENABLED=false)
  let rawProducts: RawCatalogProduct[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT product_id, product_category, brand, model, product_type, technology,
              power_w, rated_power_kw, price_egp, availability, efficiency_percent,
              battery_voltage_v, pv_mppt_voltage_range_v, max_pv_open_circuit_voltage_v,
              warranty_years, image_url, notes
       FROM products
       ORDER BY created_at DESC
       LIMIT 100`
    ).all<RawCatalogProduct>();
    rawProducts = results || [];
  } catch (dbErr) {
    console.error('Failed to query products from D1 for chat consultant:', dbErr);
  }

  const consultantResult = await runEnerjooSolarConsultant({
    message: userQuery,
    messages: safeMessages.length > 0 ? safeMessages : [{ role: 'user', content: userQuery }],
    sessionId,
    products: rawProducts
  });

  return json({
    ok: true,
    success: true,
    reply: consultantResult.reply,
    products: consultantResult.products,
    intent: consultantResult.intent,
    source: 'enerjoo_consultant_engine',
    sessionId,
  }, 200, request);
}

let _hasOwnerUidColumnCache: boolean | null = null;
export async function hasOwnerUidColumn(db: D1Database): Promise<boolean> {
  if (_hasOwnerUidColumnCache !== null) return _hasOwnerUidColumnCache;
  try {
    const tableInfo = await db.prepare("PRAGMA table_info(products)").all();
    const cols = (tableInfo?.results || []).map((c: any) => String(c.name).toLowerCase());
    _hasOwnerUidColumnCache = cols.includes('owner_uid');
    return _hasOwnerUidColumnCache;
  } catch {
    return false;
  }
}

// ============================================================================
// 1. /products Handler (Cloudflare D1 Single Source of Truth)
// ============================================================================
async function handleProducts(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const cleanPath = path.replace(/^\/api/, '');
  const parts = cleanPath.split('/').filter(Boolean);
  const productId = parts[1] ? decodeURIComponent(parts[1]) : undefined; // /products/:id

  // 1. GET: Public catalog read access
  if (method === 'GET') {
    if (productId) {
      const row = await env.DB.prepare('SELECT * FROM products WHERE product_id = ? OR id = ?')
        .bind(productId, productId)
        .first();
      if (!row) return errorJson(`Product not found: ${productId}`, 404, request);
      return successJson({ product: row }, 200, request);
    }

    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)));
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const offset = (page - 1) * limit;
    const categoryParam = url.searchParams.get('category')?.trim();
    const searchParam = url.searchParams.get('search')?.trim();

    let queryStr = 'SELECT * FROM products';
    const params: any[] = [];
    const conditions: string[] = [];

    if (categoryParam && categoryParam !== 'all') {
      conditions.push('(product_category LIKE ? OR product_type LIKE ?)');
      params.push(`%${categoryParam}%`, `%${categoryParam}%`);
    }

    if (searchParam) {
      conditions.push('(brand LIKE ? OR model LIKE ? OR notes LIKE ?)');
      params.push(`%${searchParam}%`, `%${searchParam}%`, `%${searchParam}%`);
    }

    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }

    queryStr += ' ORDER BY COALESCE(created_at, datetime("now")) DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await env.DB.prepare(queryStr).bind(...params).all();
    return json({ success: true, ok: true, count: results.length, page, limit, products: results }, 200, request);
  }

  // 2. POST: Create Product (Admin or Verified Approved Supplier)
  if (method === 'POST') {
    const authCheck = await authorizeProductWrite(request, env, { requireAdminOnly: false });
    if (!authCheck.allowed) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: authCheck.code,
            message: authCheck.message,
          },
        },
        authCheck.status,
        request
      );
    }

    let rawBody: any;
    try {
      rawBody = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const numericValidation = validateAndNormalizeD1ProductNumericFields(rawBody || {}, { isUpdate: false });
    if (!numericValidation.valid) {
      return json(
        {
          ok: false,
          success: false,
          field: numericValidation.field,
          error: {
            code: 'INVALID_NUMERIC_VALUE',
            field: numericValidation.field,
            message: numericValidation.errorMessage,
          },
          message: numericValidation.errorMessage,
        },
        400,
        request
      );
    }

    const body = numericValidation.normalizedPayload;
    body.model = body.model || body.name;

    if (!body.product_id || !body.brand || !body.model) {
      return errorJson('Missing required fields: product_id, brand, model', 400, request);
    }

    // Check if a product with this product_id already exists in D1
    const existingRow: any = await env.DB.prepare(
      'SELECT * FROM products WHERE product_id = ? OR id = ?'
    )
      .bind(body.product_id, body.product_id)
      .first();

    // Fixed: Correctly inspect existingRow.owner_uid without ReferenceError
    if (existingRow && authCheck.role === 'supplier') {
      const existingOwnerUid = existingRow.owner_uid ? String(existingRow.owner_uid).trim() : null;
      if (!existingOwnerUid || existingOwnerUid !== authCheck.uid) {
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: 'PRODUCT_OWNERSHIP_FORBIDDEN',
              message: 'غير مصرح لك بتعديل أو استبدال منتج تابع لمورد آخر أو غير مرتبط بملكيتك.',
            },
          },
          403,
          request
        );
      }
    }

    // Strict Ownership Enforcement: Server sets owner_uid to caller UID; suppliers cannot transfer ownership
    if (authCheck.role === 'supplier') {
      body.owner_uid = authCheck.uid;
      body.supplier = authCheck.uid;
      body.supplier_id = authCheck.uid;
    } else {
      body.owner_uid = body.owner_uid || authCheck.uid || null;
      body.supplier = body.supplier || body.supplier_id || authCheck.uid || null;
      body.supplier_id = body.supplier;
    }

    const hasOwnerCol = await hasOwnerUidColumn(env.DB);
    let query: string;
    let bindParams: any[];

    if (hasOwnerCol) {
      query = `
        INSERT INTO products (
          product_id, product_category, brand, model, product_type, technology,
          cell_type, number_of_cells, power_w, rated_power_kw, surge_power_w,
          waveform, ac_voltage_v, ac_voltage_regulation, frequency_hz, peak_efficiency_percent,
          transfer_time_ms, battery_voltage_v, nominal_voltage_v, capacity_ah, nominal_energy_wh,
          max_output_power_kw, recommended_charge_voltage_v, recommended_charge_current_a,
          end_of_discharge_voltage_v, max_continuous_charge_current_a, max_continuous_discharge_current_a,
          cycle_life, communication, max_pv_open_circuit_voltage_v, max_pv_array_power_w,
          max_pv_input_current_a, pv_mppt_voltage_range_v, max_solar_charger_current_a,
          max_ac_charger_current_a, max_charge_current_a, vmp_v, voc_v, imp_a, isc_a,
          efficiency_percent, temperature_coefficient_pmax, temperature_coefficient_voc,
          temperature_coefficient_isc, max_system_voltage_v, maximum_series_fuse_a,
          dimensions_mm, machine_dimensions_w_h_d_mm, weight_kg, nw_kg, gw_kg,
          front_glass, back_glass, frame, connector_type, junction_box,
          operating_temperature, storage_temperature, warranty_years, price_egp,
          supplier, availability, image_url, notes, owner_uid, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, datetime('now'), datetime('now')
        )
        ON CONFLICT(product_id) DO UPDATE SET
          product_category = excluded.product_category,
          brand = excluded.brand,
          model = excluded.model,
          product_type = excluded.product_type,
          technology = excluded.technology,
          cell_type = excluded.cell_type,
          number_of_cells = excluded.number_of_cells,
          power_w = excluded.power_w,
          rated_power_kw = excluded.rated_power_kw,
          ac_voltage_v = excluded.ac_voltage_v,
          battery_voltage_v = excluded.battery_voltage_v,
          nominal_voltage_v = excluded.nominal_voltage_v,
          capacity_ah = excluded.capacity_ah,
          max_pv_open_circuit_voltage_v = excluded.max_pv_open_circuit_voltage_v,
          pv_mppt_voltage_range_v = excluded.pv_mppt_voltage_range_v,
          vmp_v = excluded.vmp_v,
          voc_v = excluded.voc_v,
          imp_a = excluded.imp_a,
          isc_a = excluded.isc_a,
          efficiency_percent = excluded.efficiency_percent,
          dimensions_mm = excluded.dimensions_mm,
          weight_kg = excluded.weight_kg,
          warranty_years = excluded.warranty_years,
          price_egp = excluded.price_egp,
          supplier = COALESCE(excluded.supplier, products.supplier),
          availability = excluded.availability,
          image_url = COALESCE(excluded.image_url, products.image_url),
          notes = excluded.notes,
          owner_uid = COALESCE(products.owner_uid, excluded.owner_uid),
          updated_at = datetime('now')
      `;
      bindParams = [
        body.product_id,
        body.product_category || 'Solar Panels',
        body.brand,
        body.model,
        body.product_type || null,
        body.technology || null,
        body.cell_type || null,
        body.number_of_cells ?? null,
        body.power_w ?? null,
        body.rated_power_kw ?? null,
        body.surge_power_w ?? null,
        body.waveform || null,
        body.ac_voltage_v || null,
        body.ac_voltage_regulation || null,
        body.frequency_hz ?? null,
        body.peak_efficiency_percent ?? null,
        body.transfer_time_ms ?? null,
        body.battery_voltage_v ?? null,
        body.nominal_voltage_v ?? null,
        body.capacity_ah ?? null,
        body.nominal_energy_wh ?? null,
        body.max_output_power_kw ?? null,
        body.recommended_charge_voltage_v ?? null,
        body.recommended_charge_current_a ?? null,
        body.end_of_discharge_voltage_v ?? null,
        body.max_continuous_charge_current_a ?? null,
        body.max_continuous_discharge_current_a ?? null,
        body.cycle_life ?? null,
        body.communication || null,
        body.max_pv_open_circuit_voltage_v ?? null,
        body.max_pv_array_power_w ?? null,
        body.max_pv_input_current_a ?? null,
        body.pv_mppt_voltage_range_v || null,
        body.max_solar_charger_current_a ?? null,
        body.max_ac_charger_current_a ?? null,
        body.max_charge_current_a ?? null,
        body.vmp_v ?? null,
        body.voc_v ?? null,
        body.imp_a ?? null,
        body.isc_a ?? null,
        body.efficiency_percent ?? null,
        body.temperature_coefficient_pmax || null,
        body.temperature_coefficient_voc || null,
        body.temperature_coefficient_isc || null,
        body.max_system_voltage_v ?? null,
        body.maximum_series_fuse_a ?? null,
        body.dimensions_mm || null,
        body.machine_dimensions_w_h_d_mm || null,
        body.weight_kg ?? null,
        body.nw_kg ?? null,
        body.gw_kg ?? null,
        body.front_glass || null,
        body.back_glass || null,
        body.frame || null,
        body.connector_type || null,
        body.junction_box || null,
        body.operating_temperature || null,
        body.storage_temperature || null,
        body.warranty_years ?? null,
        body.price_egp ?? body.price ?? 0,
        body.supplier || null,
        body.availability || 'Available',
        body.image_url || null,
        body.notes || null,
        body.owner_uid || null
      ];
    } else {
      query = `
        INSERT INTO products (
          product_id, product_category, brand, model, product_type, technology,
          cell_type, number_of_cells, power_w, rated_power_kw, surge_power_w,
          waveform, ac_voltage_v, ac_voltage_regulation, frequency_hz, peak_efficiency_percent,
          transfer_time_ms, battery_voltage_v, nominal_voltage_v, capacity_ah, nominal_energy_wh,
          max_output_power_kw, recommended_charge_voltage_v, recommended_charge_current_a,
          end_of_discharge_voltage_v, max_continuous_charge_current_a, max_continuous_discharge_current_a,
          cycle_life, communication, max_pv_open_circuit_voltage_v, max_pv_array_power_w,
          max_pv_input_current_a, pv_mppt_voltage_range_v, max_solar_charger_current_a,
          max_ac_charger_current_a, max_charge_current_a, vmp_v, voc_v, imp_a, isc_a,
          efficiency_percent, temperature_coefficient_pmax, temperature_coefficient_voc,
          temperature_coefficient_isc, max_system_voltage_v, maximum_series_fuse_a,
          dimensions_mm, machine_dimensions_w_h_d_mm, weight_kg, nw_kg, gw_kg,
          front_glass, back_glass, frame, connector_type, junction_box,
          operating_temperature, storage_temperature, warranty_years, price_egp,
          supplier, availability, image_url, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, datetime('now'), datetime('now')
        )
        ON CONFLICT(product_id) DO UPDATE SET
          product_category = excluded.product_category,
          brand = excluded.brand,
          model = excluded.model,
          product_type = excluded.product_type,
          technology = excluded.technology,
          cell_type = excluded.cell_type,
          number_of_cells = excluded.number_of_cells,
          power_w = excluded.power_w,
          rated_power_kw = excluded.rated_power_kw,
          ac_voltage_v = excluded.ac_voltage_v,
          battery_voltage_v = excluded.battery_voltage_v,
          nominal_voltage_v = excluded.nominal_voltage_v,
          capacity_ah = excluded.capacity_ah,
          max_pv_open_circuit_voltage_v = excluded.max_pv_open_circuit_voltage_v,
          pv_mppt_voltage_range_v = excluded.pv_mppt_voltage_range_v,
          vmp_v = excluded.vmp_v,
          voc_v = excluded.voc_v,
          imp_a = excluded.imp_a,
          isc_a = excluded.isc_a,
          efficiency_percent = excluded.efficiency_percent,
          dimensions_mm = excluded.dimensions_mm,
          weight_kg = excluded.weight_kg,
          warranty_years = excluded.warranty_years,
          price_egp = excluded.price_egp,
          supplier = COALESCE(excluded.supplier, products.supplier),
          availability = excluded.availability,
          image_url = COALESCE(excluded.image_url, products.image_url),
          notes = excluded.notes,
          updated_at = datetime('now')
      `;
      bindParams = [
        body.product_id,
        body.product_category || 'Solar Panels',
        body.brand,
        body.model,
        body.product_type || null,
        body.technology || null,
        body.cell_type || null,
        body.number_of_cells ?? null,
        body.power_w ?? null,
        body.rated_power_kw ?? null,
        body.surge_power_w ?? null,
        body.waveform || null,
        body.ac_voltage_v || null,
        body.ac_voltage_regulation || null,
        body.frequency_hz ?? null,
        body.peak_efficiency_percent ?? null,
        body.transfer_time_ms ?? null,
        body.battery_voltage_v ?? null,
        body.nominal_voltage_v ?? null,
        body.capacity_ah ?? null,
        body.nominal_energy_wh ?? null,
        body.max_output_power_kw ?? null,
        body.recommended_charge_voltage_v ?? null,
        body.recommended_charge_current_a ?? null,
        body.end_of_discharge_voltage_v ?? null,
        body.max_continuous_charge_current_a ?? null,
        body.max_continuous_discharge_current_a ?? null,
        body.cycle_life ?? null,
        body.communication || null,
        body.max_pv_open_circuit_voltage_v ?? null,
        body.max_pv_array_power_w ?? null,
        body.max_pv_input_current_a ?? null,
        body.pv_mppt_voltage_range_v || null,
        body.max_solar_charger_current_a ?? null,
        body.max_ac_charger_current_a ?? null,
        body.max_charge_current_a ?? null,
        body.vmp_v ?? null,
        body.voc_v ?? null,
        body.imp_a ?? null,
        body.isc_a ?? null,
        body.efficiency_percent ?? null,
        body.temperature_coefficient_pmax || null,
        body.temperature_coefficient_voc || null,
        body.temperature_coefficient_isc || null,
        body.max_system_voltage_v ?? null,
        body.maximum_series_fuse_a ?? null,
        body.dimensions_mm || null,
        body.machine_dimensions_w_h_d_mm || null,
        body.weight_kg ?? null,
        body.nw_kg ?? null,
        body.gw_kg ?? null,
        body.front_glass || null,
        body.back_glass || null,
        body.frame || null,
        body.connector_type || null,
        body.junction_box || null,
        body.operating_temperature || null,
        body.storage_temperature || null,
        body.warranty_years ?? null,
        body.price_egp ?? body.price ?? 0,
        body.supplier || null,
        body.availability || 'Available',
        body.image_url || null,
        body.notes || null
      ];
    }

    await env.DB.prepare(query).bind(...bindParams).run();

    return successJson(
      {
        message: 'Product created successfully',
        product_id: body.product_id,
        supplier_id: body.supplier,
        owner_uid: body.owner_uid,
      },
      201,
      request
    );
  }

  // 3. PUT / PATCH: Update Product
  if (method === 'PUT' || method === 'PATCH') {
    const authCheck = await authorizeProductWrite(request, env, { requireAdminOnly: false });
    if (!authCheck.allowed) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: authCheck.code,
            message: authCheck.message,
          },
        },
        authCheck.status,
        request
      );
    }

    if (!productId) return errorJson('Product ID required in path', 400, request);

    const existing: any = await env.DB.prepare(
      'SELECT * FROM products WHERE product_id = ? OR id = ?'
    )
      .bind(productId, productId)
      .first();
    if (!existing) return errorJson(`Product not found: ${productId}`, 404, request);

    // Strict Supplier Ownership Enforcement: Suppliers can ONLY edit products belonging to their own owner_uid
    if (authCheck.role === 'supplier') {
      const existingOwnerUid = existing.owner_uid ? String(existing.owner_uid).trim() : null;
      if (!existingOwnerUid || existingOwnerUid !== authCheck.uid) {
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: 'PRODUCT_OWNERSHIP_FORBIDDEN',
              message: 'غير مصرح لك بتعديل هذا المنتج لأنه تابع لمورد آخر أو غير مرتبط بملكيتك.',
            },
          },
          403,
          request
        );
      }
    }

    let rawBody: any;
    try {
      rawBody = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const numericValidation = validateAndNormalizeD1ProductNumericFields(rawBody || {}, { isUpdate: true });
    if (!numericValidation.valid) {
      return json(
        {
          ok: false,
          success: false,
          field: numericValidation.field,
          error: {
            code: 'INVALID_NUMERIC_VALUE',
            field: numericValidation.field,
            message: numericValidation.errorMessage,
          },
          message: numericValidation.errorMessage,
        },
        400,
        request
      );
    }

    const body = numericValidation.normalizedPayload;

    const brand = body.brand || null;
    const model = body.model || body.name || null;
    const productCategory = body.product_category || body.category || null;
    const productType = body.product_type || body.type || null;
    const technology = body.technology || null;
    const powerW = body.power_w !== undefined ? body.power_w : (body.power !== undefined ? body.power : null);
    const ratedPowerKw = body.rated_power_kw !== undefined ? body.rated_power_kw : null;
    const priceEgp = body.price_egp !== undefined ? body.price_egp : (body.price !== undefined ? body.price : null);
    const efficiencyPercent = body.efficiency_percent !== undefined ? body.efficiency_percent : (body.efficiency !== undefined ? body.efficiency : null);
    const warrantyYears = body.warranty_years !== undefined ? body.warranty_years : (body.warranty !== undefined ? body.warranty : null);
    const dimensionsMm = body.dimensions_mm || null;
    const weightKg = body.weight_kg !== undefined ? body.weight_kg : (body.weight !== undefined ? body.weight : null);
    const notes = body.notes || body.description || null;
    const imageUrl = body.image_url || body.image || null;
    const availability = body.availability || (body.status === 'out_of_stock' ? 'Out of Stock' : body.status === 'limited' ? 'Limited' : 'Available');
    const vmpV = body.vmp_v !== undefined ? body.vmp_v : null;
    const impA = body.imp_a !== undefined ? body.imp_a : null;
    const vocV = body.voc_v !== undefined ? body.voc_v : null;
    const iscA = body.isc_a !== undefined ? body.isc_a : null;
    const acVoltageV = body.ac_voltage_v || null;
    const nominalVoltageV = body.nominal_voltage_v !== undefined ? body.nominal_voltage_v : null;
    const batteryVoltageV = body.battery_voltage_v !== undefined ? body.battery_voltage_v : null;
    const capacityAh = body.capacity_ah !== undefined ? body.capacity_ah : null;
    const maxPvVoc = body.max_pv_open_circuit_voltage_v !== undefined ? body.max_pv_open_circuit_voltage_v : null;
    
    // Suppliers CANNOT transfer product ownership to anyone else
    const supplier =
      authCheck.role === 'supplier'
        ? authCheck.uid
        : body.supplier || body.supplier_id || existing.supplier || null;

    await env.DB.prepare(
      `UPDATE products SET 
        brand = COALESCE(?, brand),
        model = COALESCE(?, model),
        product_category = COALESCE(?, product_category),
        product_type = COALESCE(?, product_type),
        technology = COALESCE(?, technology),
        power_w = COALESCE(?, power_w),
        rated_power_kw = COALESCE(?, rated_power_kw),
        price_egp = COALESCE(?, price_egp),
        efficiency_percent = COALESCE(?, efficiency_percent),
        warranty_years = COALESCE(?, warranty_years),
        dimensions_mm = COALESCE(?, dimensions_mm),
        weight_kg = COALESCE(?, weight_kg),
        notes = COALESCE(?, notes),
        image_url = COALESCE(?, image_url),
        availability = COALESCE(?, availability),
        vmp_v = COALESCE(?, vmp_v),
        imp_a = COALESCE(?, imp_a),
        voc_v = COALESCE(?, voc_v),
        isc_a = COALESCE(?, isc_a),
        ac_voltage_v = COALESCE(?, ac_voltage_v),
        nominal_voltage_v = COALESCE(?, nominal_voltage_v),
        battery_voltage_v = COALESCE(?, battery_voltage_v),
        capacity_ah = COALESCE(?, capacity_ah),
        max_pv_open_circuit_voltage_v = COALESCE(?, max_pv_open_circuit_voltage_v),
        supplier = COALESCE(?, supplier),
        updated_at = datetime('now')
      WHERE product_id = ? OR id = ?`
    )
      .bind(
        brand,
        model,
        productCategory,
        productType,
        technology,
        powerW,
        ratedPowerKw,
        priceEgp,
        efficiencyPercent,
        warrantyYears,
        dimensionsMm,
        weightKg,
        notes,
        imageUrl,
        availability,
        vmpV,
        impA,
        vocV,
        iscA,
        acVoltageV,
        nominalVoltageV,
        batteryVoltageV,
        capacityAh,
        maxPvVoc,
        supplier,
        productId,
        productId
      )
      .run();

    return successJson({ message: 'Product updated successfully', product_id: productId }, 200, request);
  }

  // 4. DELETE: Delete Product
  if (method === 'DELETE') {
    const isBulkDelete = !productId || productId === 'all';
    const authCheck = await authorizeProductWrite(request, env, { requireAdminOnly: isBulkDelete });
    if (!authCheck.allowed) {
      return json(
        {
          ok: false,
          success: false,
          error: {
            code: authCheck.code,
            message: authCheck.message,
          },
        },
        authCheck.status,
        request
      );
    }

    if (isBulkDelete) {
      try {
        await env.DB.prepare('DELETE FROM products').run();
        return successJson({ message: 'All products deleted successfully', statement: 'DELETE FROM products;' }, 200, request);
      } catch (err: any) {
        return errorJson(`Failed to delete all products: ${err?.message || err}`, 500, request);
      }
    }

    const existing: any = await env.DB.prepare(
      'SELECT * FROM products WHERE product_id = ? OR id = ?'
    )
      .bind(productId, productId)
      .first();
    if (!existing) return errorJson(`Product not found: ${productId}`, 404, request);

    // Strict Supplier Ownership Enforcement
    if (authCheck.role === 'supplier') {
      const existingOwnerUid = existing.owner_uid ? String(existing.owner_uid).trim() : null;
      if (!existingOwnerUid || existingOwnerUid !== authCheck.uid) {
        return json(
          {
            ok: false,
            success: false,
            error: {
              code: 'PRODUCT_OWNERSHIP_FORBIDDEN',
              message: 'غير مصرح لك بحذف هذا المنتج لأنه تابع لمورد آخر أو غير مرتبط بملكيتك.',
            },
          },
          403,
          request
        );
      }
    }

    await env.DB.prepare('DELETE FROM products WHERE product_id = ? OR id = ?').bind(productId, productId).run();
    return successJson({ message: 'Product deleted successfully', product_id: productId }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /products`, 405, request);
}

// ============================================================================
// 2. /customers Handler (Access Control: Admin or Self Customer)
// ============================================================================
async function handleCustomers(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const customerId = parts[1]; // /customers/:id

  // 1. GET: Admin can list all; Customers can only read their own customer profile
  if (method === 'GET') {
    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    if (customerId) {
      if (authResult.user.role !== 'admin' && authResult.user.uid !== customerId) {
        return json(
          {
            ok: false,
            success: false,
            error: { code: 'FORBIDDEN', message: 'غير مصرح لك بالاطلاع على بيانات عميل آخر.' }
          },
          403,
          request
        );
      }

      const row = await env.DB.prepare('SELECT * FROM customers WHERE id = ? OR user_id = ?').bind(customerId, customerId).first();
      if (!row) return errorJson(`Customer not found: ${customerId}`, 404, request);
      return successJson({ customer: row }, 200, request);
    }

    // Listing all customers requires Admin
    if (authResult.user.role !== 'admin') {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'ADMIN_REQUIRED', message: 'سرد بيانات جميع العملاء متاح للإدارة فقط.' }
        },
        403,
        request
      );
    }

    const { results } = await env.DB.prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT 500').all();
    return successJson({ count: results.length, customers: results }, 200, request);
  }

  // 2. POST: Create or upsert customer profile (Self customer, guest from quote, or Admin)
  if (method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    if (!body.phone_number) {
      return errorJson('Missing required field: phone_number', 400, request);
    }

    const authUser = await optionalAuthenticateUser(request, env);
    const id = body.id || body.uid || (authUser ? authUser.uid : generateId('cust'));
    const userId = authUser ? authUser.uid : (body.user_id || body.userId || null);

    // If caller is authenticated as customer, they cannot create records under someone else's UID
    if (authUser && authUser.role !== 'admin' && id !== authUser.uid && userId !== authUser.uid) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'لا يمكنك إنشاء سجل عميل بمعرّف مستخدم آخر.' }
        },
        403,
        request
      );
    }

    const fullName = body.full_name || body.fullName || 'عميل إينرجو';
    const phoneNumber = body.phone_number || body.phoneNumber;
    const normalizedPhone = body.normalized_phone_number || body.normalizedPhoneNumber || phoneNumber.replace(/[^0-9]/g, '');
    const email = body.email || (authUser ? authUser.email : null);
    const governorate = body.governorate || 'القاهرة';
    const authProvider = body.auth_provider || body.authProvider || (authUser ? 'firebase' : 'phone');
    const legacyId = body.legacy_customer_id || body.legacyCustomerId || null;

    const existing = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
    if (existing) {
      await env.DB.prepare(
        `UPDATE customers SET 
          full_name = ?, phone_number = ?, normalized_phone_number = ?,
          email = ?, governorate = ?, auth_provider = ?, last_login_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?`
      )
        .bind(fullName, phoneNumber, normalizedPhone, email, governorate, authProvider, id)
        .run();

      return successJson({ message: 'Customer updated successfully', customer_id: id }, 200, request);
    }

    await env.DB.prepare(
      `INSERT INTO customers (
        id, user_id, full_name, phone_number, normalized_phone_number,
        email, governorate, auth_provider, legacy_customer_id, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
    )
      .bind(id, userId, fullName, phoneNumber, normalizedPhone, email, governorate, authProvider, legacyId)
      .run();

    return successJson({ message: 'Customer created successfully', customer_id: id }, 201, request);
  }

  // 3. PUT: Update customer profile (Self or Admin)
  if (method === 'PUT') {
    if (!customerId) return errorJson('Customer ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    if (authResult.user.role !== 'admin' && authResult.user.uid !== customerId) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل بيانات عميل آخر.' }
        },
        403,
        request
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const existing = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first();
    if (!existing) return errorJson(`Customer not found: ${customerId}`, 404, request);

    await env.DB.prepare(
      `UPDATE customers SET
        full_name = COALESCE(?, full_name),
        phone_number = COALESCE(?, phone_number),
        normalized_phone_number = COALESCE(?, normalized_phone_number),
        email = COALESCE(?, email),
        governorate = COALESCE(?, governorate),
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        body.full_name || body.fullName || null,
        body.phone_number || body.phoneNumber || null,
        body.normalized_phone_number || body.normalizedPhoneNumber || null,
        body.email || null,
        body.governorate || null,
        customerId
      )
      .run();

    return successJson({ message: 'Customer updated successfully', customer_id: customerId }, 200, request);
  }

  // 4. DELETE: Admin only
  if (method === 'DELETE') {
    if (!customerId) return errorJson('Customer ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    const existing = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerId).first();
    if (!existing) return errorJson(`Customer not found: ${customerId}`, 404, request);

    await env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(customerId).run();
    return successJson({ message: 'Customer deleted successfully', customer_id: customerId }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /customers`, 405, request);
}

// ============================================================================
// 3. /users Handler (Access Control: Admin or Self User)
// ============================================================================
async function handleUsers(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const userId = parts[1]; // /users/:id
  const url = new URL(request.url);

  // 1. GET: Admin can list all; Authenticated users can only read their own user record
  if (method === 'GET') {
    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    if (userId) {
      if (authResult.user.role !== 'admin' && authResult.user.uid !== userId) {
        return json(
          {
            ok: false,
            success: false,
            error: { code: 'FORBIDDEN', message: 'غير مصرح لك بقراءة بيانات مستخدم آخر.' }
          },
          403,
          request
        );
      }

      const user = await env.DB.prepare(
        'SELECT id, email, name, name_ar, type, company, phone, governorate, location, avatar, profile_image, verified, rejected, created_at, updated_at FROM users WHERE id = ?'
      )
        .bind(userId)
        .first();
      if (!user) return errorJson(`User not found: ${userId}`, 404, request);
      return successJson({ user }, 200, request);
    }

    if (authResult.user.role !== 'admin') {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'ADMIN_REQUIRED', message: 'سرد بيانات المستخدمين متاح للإدارة فقط.' }
        },
        403,
        request
      );
    }

    const typeFilter = url.searchParams.get('type');
    const verifiedFilter = url.searchParams.get('verified');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    let query = 'SELECT id, email, name, name_ar, type, company, phone, governorate, location, avatar, profile_image, verified, rejected, created_at, updated_at FROM users WHERE 1=1';
    const params: any[] = [];

    if (typeFilter) {
      query += ' AND type = ?';
      params.push(typeFilter);
    }
    if (verifiedFilter !== null) {
      query += ' AND verified = ?';
      params.push(verifiedFilter === 'true' || verifiedFilter === '1' ? 1 : 0);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = env.DB.prepare(query);
    const { results } = await stmt.bind(...params).all();
    return successJson({ count: results.length, users: results }, 200, request);
  }

  // 2. POST: Register new user record (Self or Admin)
  if (method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    if (!body.name) {
      return errorJson("Missing required field: 'name'", 400, request);
    }

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    const id = body.id || body.uid || authResult.user.uid;
    // Users can only create their own document, unless Admin
    if (authResult.user.role !== 'admin' && id !== authResult.user.uid) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'لا يمكنك إنشاء حساب بمعرّف مستخدم آخر.' }
        },
        403,
        request
      );
    }

    let type = body.type || 'customer';
    // Non-admins cannot grant themselves 'admin' role
    if (authResult.user.role !== 'admin' && type === 'admin') {
      type = 'customer';
    }

    const email = body.email ? body.email.toLowerCase().trim() : authResult.user.email;

    // Check conflict for Email
    if (email) {
      const emailConflict = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .bind(email, id)
        .first();
      if (emailConflict) {
        return errorJson(`A user with email '${email}' already exists`, 409, request);
      }
    }

    const existingUser = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (existingUser) {
      return errorJson(`User with ID '${id}' already exists`, 409, request);
    }

    // New suppliers start as unverified and unrejected (pending admin approval)
    const verified = authResult.user.role === 'admin' ? (body.verified ? 1 : 0) : 0;
    const rejected = authResult.user.role === 'admin' ? (body.rejected ? 1 : 0) : 0;

    await env.DB.prepare(
      `INSERT INTO users (
        id, email, password_hash, name, name_ar, type, company, phone,
        governorate, location, avatar, profile_image, verified, rejected,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )`
    )
      .bind(
        id,
        email,
        body.password_hash || null,
        body.name,
        body.name_ar || body.nameAr || null,
        type,
        body.company || null,
        body.phone || null,
        body.governorate || 'القاهرة',
        body.location || 'Cairo, Egypt',
        body.avatar || null,
        body.profile_image || body.profileImage || null,
        verified,
        rejected
      )
      .run();

    return successJson({ message: 'User created successfully', user_id: id }, 201, request);
  }

  // 3. PUT: Update user record (Self or Admin)
  if (method === 'PUT') {
    if (!userId) return errorJson('User ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    if (authResult.user.role !== 'admin' && authResult.user.uid !== userId) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل بيانات مستخدم آخر.' }
        },
        403,
        request
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!existing) return errorJson(`User not found: ${userId}`, 404, request);

    if (body.email) {
      const email = body.email.toLowerCase().trim();
      const conflict = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .bind(email, userId)
        .first();
      if (conflict) {
        return errorJson(`Email '${email}' is already in use by another account`, 409, request);
      }
    }

    // Role, verification, and rejection flags can ONLY be altered by Admin
    const isAdminCaller = authResult.user.role === 'admin';
    const verifiedParam = isAdminCaller && body.verified !== undefined ? (body.verified ? 1 : 0) : null;
    const rejectedParam = isAdminCaller && body.rejected !== undefined ? (body.rejected ? 1 : 0) : null;
    const typeParam = isAdminCaller && body.type ? body.type : null;

    await env.DB.prepare(
      `UPDATE users SET
        name = COALESCE(?, name),
        name_ar = COALESCE(?, name_ar),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        company = COALESCE(?, company),
        governorate = COALESCE(?, governorate),
        location = COALESCE(?, location),
        avatar = COALESCE(?, avatar),
        profile_image = COALESCE(?, profile_image),
        type = COALESCE(?, type),
        verified = CASE WHEN ? IS NOT NULL THEN ? ELSE verified END,
        rejected = CASE WHEN ? IS NOT NULL THEN ? ELSE rejected END,
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        body.name || null,
        body.name_ar || body.nameAr || null,
        body.email ? body.email.toLowerCase().trim() : null,
        body.phone || null,
        body.company || null,
        body.governorate || null,
        body.location || null,
        body.avatar || null,
        body.profile_image || body.profileImage || null,
        typeParam,
        verifiedParam,
        verifiedParam,
        rejectedParam,
        rejectedParam,
        userId
      )
      .run();

    return successJson({ message: 'User updated successfully', user_id: userId }, 200, request);
  }

  // 4. DELETE: Admin only
  if (method === 'DELETE') {
    if (!userId) return errorJson('User ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
    if (!existing) return errorJson(`User not found: ${userId}`, 404, request);

    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    return successJson({ message: 'User deleted successfully', user_id: userId }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /users`, 405, request);
}

// ============================================================================
// 4. /suppliers Handler (Access Control: Directory Public Read, Self/Admin Write)
// ============================================================================
async function handleSuppliers(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const supplierId = parts[1]; // /suppliers/:id
  const url = new URL(request.url);

  // 1. GET: Public read for supplier directory
  if (method === 'GET') {
    if (supplierId) {
      const supplier = await env.DB.prepare('SELECT * FROM suppliers WHERE id = ?').bind(supplierId).first();
      if (!supplier) return errorJson(`Supplier not found: ${supplierId}`, 404, request);
      return successJson({ supplier }, 200, request);
    }

    const verifiedOnly = url.searchParams.get('verified');
    const location = url.searchParams.get('location');

    let query = 'SELECT * FROM suppliers WHERE 1=1';
    const params: any[] = [];

    if (verifiedOnly !== null) {
      query += ' AND verified = ?';
      params.push(verifiedOnly === 'true' || verifiedOnly === '1' ? 1 : 0);
    }
    if (location) {
      query += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }
    query += ' ORDER BY verified DESC, rating DESC, total_sales DESC';

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return successJson({ count: results.length, suppliers: results }, 200, request);
  }

  // 2. POST: Create Supplier Profile (Self or Admin)
  if (method === 'POST') {
    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    if (!body.name || !body.phone || !body.location) {
      return errorJson("Missing required fields: 'name', 'phone', and 'location'", 400, request);
    }

    const id = body.id || authResult.user.uid;
    const userId = body.user_id || body.userId || authResult.user.uid;

    if (authResult.user.role !== 'admin' && id !== authResult.user.uid && userId !== authResult.user.uid) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'لا يمكنك إنشاء ملف مورد لمعرّف مستخدم آخر.' }
        },
        403,
        request
      );
    }

    const existing = await env.DB.prepare('SELECT id FROM suppliers WHERE id = ?').bind(id).first();
    if (existing) {
      return errorJson(`Supplier with ID '${id}' already exists`, 409, request);
    }

    const verified = authResult.user.role === 'admin' ? (body.verified ? 1 : 0) : 0;
    const rejected = authResult.user.role === 'admin' ? (body.rejected ? 1 : 0) : 0;

    await env.DB.prepare(
      `INSERT INTO suppliers (
        id, user_id, name, name_ar, phone, email, location, price,
        rating, total_sales, verified, rejected, avatar, profile_image,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )`
    )
      .bind(
        id,
        userId,
        body.name,
        body.name_ar || body.nameAr || null,
        body.phone,
        body.email || authResult.user.email || null,
        body.location,
        typeof body.price === 'number' ? body.price : 0.0,
        typeof body.rating === 'number' ? body.rating : 0.0,
        typeof body.total_sales === 'number' ? body.total_sales : (body.totalSales || 0),
        verified,
        rejected,
        body.avatar || null,
        body.profile_image || body.profileImage || null
      )
      .run();

    return successJson({ message: 'Supplier created successfully', supplier_id: id }, 201, request);
  }

  // 3. PUT: Update Supplier Profile (Self or Admin)
  if (method === 'PUT') {
    if (!supplierId) return errorJson('Supplier ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    const existing: any = await env.DB.prepare('SELECT * FROM suppliers WHERE id = ?').bind(supplierId).first();
    if (!existing) return errorJson(`Supplier not found: ${supplierId}`, 404, request);

    if (authResult.user.role !== 'admin' && existing.id !== authResult.user.uid && existing.user_id !== authResult.user.uid) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل ملف مورد آخر.' }
        },
        403,
        request
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const isAdminCaller = authResult.user.role === 'admin';
    const verifiedParam = isAdminCaller && body.verified !== undefined ? (body.verified ? 1 : 0) : null;
    const rejectedParam = isAdminCaller && body.rejected !== undefined ? (body.rejected ? 1 : 0) : null;

    await env.DB.prepare(
      `UPDATE suppliers SET
        name = COALESCE(?, name),
        name_ar = COALESCE(?, name_ar),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        location = COALESCE(?, location),
        price = COALESCE(?, price),
        rating = COALESCE(?, rating),
        total_sales = COALESCE(?, total_sales),
        verified = CASE WHEN ? IS NOT NULL THEN ? ELSE verified END,
        rejected = CASE WHEN ? IS NOT NULL THEN ? ELSE rejected END,
        avatar = COALESCE(?, avatar),
        profile_image = COALESCE(?, profile_image),
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        body.name || null,
        body.name_ar || body.nameAr || null,
        body.phone || null,
        body.email || null,
        body.location || null,
        typeof body.price === 'number' ? body.price : null,
        typeof body.rating === 'number' ? body.rating : null,
        typeof body.total_sales === 'number' ? body.total_sales : (body.totalSales !== undefined ? body.totalSales : null),
        verifiedParam,
        verifiedParam,
        rejectedParam,
        rejectedParam,
        body.avatar || null,
        body.profile_image || body.profileImage || null,
        supplierId
      )
      .run();

    return successJson({ message: 'Supplier updated successfully', supplier_id: supplierId }, 200, request);
  }

  // 4. DELETE: Admin only
  if (method === 'DELETE') {
    if (!supplierId) return errorJson('Supplier ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    const existing = await env.DB.prepare('SELECT id FROM suppliers WHERE id = ?').bind(supplierId).first();
    if (!existing) return errorJson(`Supplier not found: ${supplierId}`, 404, request);

    await env.DB.prepare('DELETE FROM suppliers WHERE id = ?').bind(supplierId).run();
    return successJson({ message: 'Supplier deleted successfully', supplier_id: supplierId }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /suppliers`, 405, request);
}

// ============================================================================
// 5. /solar-requests Handler (Access Control: Admin, Leads for Suppliers, Self Customers)
// ============================================================================
async function handleSolarRequests(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const reqIdentifier = parts[1]; // id or request_id
  const url = new URL(request.url);

  // 1. GET:
  // - Admin: all
  // - Supplier: all active leads
  // - Customer: only their own requests
  if (method === 'GET') {
    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    if (reqIdentifier) {
      const row: any = await env.DB.prepare(
        'SELECT * FROM solar_requests WHERE id = ? OR request_id = ?'
      )
        .bind(reqIdentifier, reqIdentifier)
        .first();
      if (!row) return errorJson(`Solar request not found: ${reqIdentifier}`, 404, request);

      // Customer can ONLY view their own request
      if (
        authResult.user.role === 'customer' &&
        row.customer_id !== authResult.user.uid &&
        row.customer_phone !== authResult.user.claims.phone_number
      ) {
        return json(
          {
            ok: false,
            success: false,
            error: { code: 'FORBIDDEN', message: 'غير مصرح لك بالاطلاع على هذا الطلب.' }
          },
          403,
          request
        );
      }

      return successJson({ solar_request: row }, 200, request);
    }

    const customerId = url.searchParams.get('customer_id') || url.searchParams.get('customerId');
    const customerPhone = url.searchParams.get('customer_phone') || url.searchParams.get('phone');
    const status = url.searchParams.get('status');
    const systemType = url.searchParams.get('system_type');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    let query = 'SELECT * FROM solar_requests WHERE 1=1';
    const params: any[] = [];

    // Enforce customer scoping
    if (authResult.user.role === 'customer') {
      query += ' AND customer_id = ?';
      params.push(authResult.user.uid);
    } else {
      if (customerId) {
        query += ' AND customer_id = ?';
        params.push(customerId);
      }
      if (customerPhone) {
        query += ' AND customer_phone = ?';
        params.push(customerPhone);
      }
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (systemType) {
      query += ' AND system_type = ?';
      params.push(systemType);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return successJson({ count: results.length, solar_requests: results }, 200, request);
  }

  // 2. POST: Anyone can create a solar request lead (guests or logged-in users)
  if (method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    if (!body.customer_name && !body.customerName) {
      return errorJson("Missing required field: 'customer_name'", 400, request);
    }
    if (!body.customer_phone && !body.customerPhone) {
      return errorJson("Missing required field: 'customer_phone'", 400, request);
    }

    const systemType = body.system_type || body.systemType || 'hybrid';
    const validSystemTypes = ['on-grid', 'off-grid', 'hybrid', 'pump'];
    if (!validSystemTypes.includes(systemType)) {
      return errorJson(`Invalid 'system_type'. Allowed: ${validSystemTypes.join(', ')}`, 400, request);
    }

    const tier = body.tier || 'recommended';
    const validTiers = ['budget', 'recommended', 'premium'];
    if (!validTiers.includes(tier)) {
      return errorJson(`Invalid 'tier'. Allowed: ${validTiers.join(', ')}`, 400, request);
    }

    const authUser = await optionalAuthenticateUser(request, env);
    const id = body.id || generateId('req');
    const requestId = body.request_id || body.requestId || `ENJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const existing = await env.DB.prepare('SELECT id FROM solar_requests WHERE request_id = ?')
      .bind(requestId)
      .first();
    if (existing) {
      return errorJson(`Solar request with request_id '${requestId}' already exists`, 409, request);
    }

    const customerId = authUser ? authUser.uid : (body.customer_id || body.customerId || null);
    const inputsJson = typeof body.inputs === 'object' ? JSON.stringify(body.inputs) : (body.inputs_json || '{}');
    const outputsJson = typeof body.calculatedOutputs === 'object' ? JSON.stringify(body.calculatedOutputs) : (body.calculated_outputs_json || '{}');

    await env.DB.prepare(
      `INSERT INTO solar_requests (
        id, request_id, customer_id, customer_name, customer_phone,
        governorate, location, system_type, tier, system_size_kw, estimated_cost,
        inputs_json, calculated_outputs_json, status, notes, admin_notes, supplier_contacted,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )`
    )
      .bind(
        id,
        requestId,
        customerId,
        body.customer_name || body.customerName,
        body.customer_phone || body.customerPhone,
        body.governorate || 'القاهرة',
        body.location || 'مصر',
        systemType,
        tier,
        typeof body.system_size_kw === 'number' ? body.system_size_kw : (body.calculatedOutputs?.systemSizeKw || 0.0),
        typeof body.estimated_cost === 'number' ? body.estimated_cost : (body.calculatedOutputs?.estimatedCost || 0.0),
        inputsJson,
        outputsJson,
        body.status || 'pending',
        body.notes || null,
        body.admin_notes || body.adminNotes || null,
        body.supplier_contacted || body.supplierContacted || null
      )
      .run();

    return successJson({ message: 'Solar request created successfully', id, request_id: requestId }, 201, request);
  }

  // 3. PUT: Update solar request
  if (method === 'PUT') {
    if (!reqIdentifier) return errorJson('ID or request_id required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    const existing: any = await env.DB.prepare('SELECT * FROM solar_requests WHERE id = ? OR request_id = ?')
      .bind(reqIdentifier, reqIdentifier)
      .first();
    if (!existing) return errorJson(`Solar request not found: ${reqIdentifier}`, 404, request);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    // Role-specific field modifications
    let statusParam = existing.status;
    let adminNotesParam = existing.admin_notes;
    let supplierContactedParam = existing.supplier_contacted;
    let notesParam = existing.notes;

    if (authResult.user.role === 'admin') {
      if (body.status) statusParam = body.status;
      if (body.admin_notes || body.adminNotes !== undefined) adminNotesParam = body.admin_notes || body.adminNotes || null;
      if (body.supplier_contacted || body.supplierContacted !== undefined) supplierContactedParam = body.supplier_contacted || body.supplierContacted || null;
      if (body.notes !== undefined) notesParam = body.notes;
    } else if (authResult.user.role === 'supplier') {
      if (body.supplier_contacted || body.supplierContacted !== undefined) supplierContactedParam = body.supplier_contacted || body.supplierContacted || null;
      if (body.notes !== undefined) notesParam = body.notes;
    } else if (authResult.user.role === 'customer') {
      if (existing.customer_id !== authResult.user.uid) {
        return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل هذا الطلب.' } }, 403, request);
      }
      if (body.notes !== undefined) notesParam = body.notes;
    }

    await env.DB.prepare(
      `UPDATE solar_requests SET
        status = ?,
        admin_notes = ?,
        supplier_contacted = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        statusParam,
        adminNotesParam,
        supplierContactedParam,
        notesParam,
        existing.id
      )
      .run();

    return successJson({ message: 'Solar request updated successfully', id: existing.id }, 200, request);
  }

  // 4. DELETE: Admin only
  if (method === 'DELETE') {
    if (!reqIdentifier) return errorJson('ID or request_id required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    const existing: any = await env.DB.prepare('SELECT id FROM solar_requests WHERE id = ? OR request_id = ?')
      .bind(reqIdentifier, reqIdentifier)
      .first();
    if (!existing) return errorJson(`Solar request not found: ${reqIdentifier}`, 404, request);

    await env.DB.prepare('DELETE FROM solar_requests WHERE id = ?').bind(existing.id).run();
    return successJson({ message: 'Solar request deleted successfully', id: existing.id }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /solar-requests`, 405, request);
}

// ============================================================================
// 6. /quotations Handler (Access Control: Admin, Leads for Suppliers, Self Customers)
// ============================================================================
async function handleQuotations(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const quotationId = parts[1]; // /quotations/:id
  const url = new URL(request.url);

  // 1. GET:
  // - Admin: all
  // - Supplier: active leads
  // - Customer: only their own quotations
  if (method === 'GET') {
    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    if (quotationId) {
      const quotation: any = await env.DB.prepare('SELECT * FROM quotations WHERE id = ? OR request_id = ?')
        .bind(quotationId, quotationId)
        .first();
      if (!quotation) return errorJson(`Quotation not found: ${quotationId}`, 404, request);

      if (
        authResult.user.role === 'customer' &&
        quotation.customer_id !== authResult.user.uid &&
        quotation.user_id !== authResult.user.uid &&
        quotation.phone !== authResult.user.claims.phone_number
      ) {
        return json(
          {
            ok: false,
            success: false,
            error: { code: 'FORBIDDEN', message: 'غير مصرح لك بالاطلاع على هذا العرض.' }
          },
          403,
          request
        );
      }

      return successJson({ quotation }, 200, request);
    }

    const customerId = url.searchParams.get('customer_id') || url.searchParams.get('customerId');
    const phone = url.searchParams.get('phone');
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

    let query = 'SELECT * FROM quotations WHERE 1=1';
    const params: any[] = [];

    if (authResult.user.role === 'customer') {
      query += ' AND (customer_id = ? OR user_id = ?)';
      params.push(authResult.user.uid, authResult.user.uid);
    } else {
      if (customerId) {
        query += ' AND (customer_id = ? OR user_id = ?)';
        params.push(customerId, customerId);
      }
      if (phone) {
        query += ' AND phone = ?';
        params.push(phone);
      }
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return successJson({ count: results.length, quotations: results }, 200, request);
  }

  // 2. POST: Create Quotation Lead (Public / Guest or Customer)
  if (method === 'POST') {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const customerName = body.customer_name || body.customerName || body.name;
    const phone = body.phone || body.customerPhone;
    if (!customerName || !phone) {
      return errorJson("Missing required fields: 'customer_name' and 'phone'", 400, request);
    }

    const authUser = await optionalAuthenticateUser(request, env);
    const id = body.id || generateId('qtn');
    const requestId = body.request_id || body.requestId || null;

    if (requestId) {
      const conflict = await env.DB.prepare('SELECT id FROM quotations WHERE request_id = ?').bind(requestId).first();
      if (conflict) {
        return errorJson(`Quotation with request_id '${requestId}' already exists`, 409, request);
      }
    }

    const customerId = authUser ? authUser.uid : (body.customer_id || body.customerId || null);
    const userId = authUser ? authUser.uid : (body.user_id || body.userId || null);
    const systemType = body.system_type || body.systemType || 'hybrid';
    const priceEstimate = typeof body.price_estimate === 'number' ? body.price_estimate : (typeof body.priceEstimate === 'number' ? body.priceEstimate : 0.0);

    await env.DB.prepare(
      `INSERT INTO quotations (
        id, request_id, customer_id, user_id, customer_name, customer_email,
        phone, system_type, system_type_name, location, governorate,
        usage, monthly_bill, battery_required, system_specs, target_tier,
        price_estimate, status, notes, supplier_contacted,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )`
    )
      .bind(
        id,
        requestId,
        customerId,
        userId,
        customerName,
        body.customer_email || body.customerEmail || body.email || (authUser ? authUser.email : null),
        phone,
        systemType,
        body.system_type_name || body.systemTypeName || null,
        body.location || 'مصر',
        body.governorate || 'القاهرة',
        typeof body.usage === 'number' ? body.usage : null,
        typeof body.monthly_bill === 'number' ? body.monthly_bill : (body.monthlyBill || null),
        body.battery_required || body.batteryRequired ? 1 : 0,
        body.system_specs || body.systemSpecs || null,
        body.target_tier || body.targetTier || 'recommended',
        priceEstimate,
        body.status || 'pending',
        body.notes || null,
        body.supplier_contacted || body.supplierContacted || null
      )
      .run();

    return successJson({ message: 'Quotation created successfully', quotation_id: id, request_id: requestId }, 201, request);
  }

  // 3. PUT: Update Quotation (Admin, Supplier, or Customer owner)
  if (method === 'PUT') {
    if (!quotationId) return errorJson('Quotation ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    const existing: any = await env.DB.prepare('SELECT * FROM quotations WHERE id = ? OR request_id = ?')
      .bind(quotationId, quotationId)
      .first();
    if (!existing) return errorJson(`Quotation not found: ${quotationId}`, 404, request);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    let statusParam = existing.status;
    let priceParam = existing.price_estimate;
    let notesParam = existing.notes;
    let supplierContactedParam = existing.supplier_contacted;
    let specsParam = existing.system_specs;

    if (authResult.user.role === 'admin') {
      if (body.status) statusParam = body.status;
      if (typeof body.price_estimate === 'number') priceParam = body.price_estimate;
      if (body.notes !== undefined) notesParam = body.notes;
      if (body.supplier_contacted !== undefined) supplierContactedParam = body.supplier_contacted;
      if (body.system_specs !== undefined) specsParam = body.system_specs;
    } else if (authResult.user.role === 'supplier') {
      if (body.status) statusParam = body.status;
      if (typeof body.price_estimate === 'number') priceParam = body.price_estimate;
      if (body.notes !== undefined) notesParam = body.notes;
      if (body.supplier_contacted !== undefined) supplierContactedParam = body.supplier_contacted;
    } else if (authResult.user.role === 'customer') {
      if (existing.customer_id !== authResult.user.uid && existing.user_id !== authResult.user.uid) {
        return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل هذا العرض.' } }, 403, request);
      }
      if (body.notes !== undefined) notesParam = body.notes;
    }

    await env.DB.prepare(
      `UPDATE quotations SET
        status = ?,
        price_estimate = ?,
        notes = ?,
        supplier_contacted = ?,
        system_specs = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        statusParam,
        priceParam,
        notesParam,
        supplierContactedParam,
        specsParam,
        existing.id
      )
      .run();

    return successJson({ message: 'Quotation updated successfully', quotation_id: existing.id }, 200, request);
  }

  // 4. DELETE: Admin only
  if (method === 'DELETE') {
    if (!quotationId) return errorJson('Quotation ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    const existing: any = await env.DB.prepare('SELECT id FROM quotations WHERE id = ? OR request_id = ?')
      .bind(quotationId, quotationId)
      .first();
    if (!existing) return errorJson(`Quotation not found: ${quotationId}`, 404, request);

    await env.DB.prepare('DELETE FROM quotations WHERE id = ?').bind(existing.id).run();
    return successJson({ message: 'Quotation deleted successfully', quotation_id: existing.id }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /quotations`, 405, request);
}

// ============================================================================
// 7. /quotation-items Handler (Relations & Integrity)
// ============================================================================
async function handleQuotationItems(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const itemId = parts[1]; // /quotation-items/:id
  const url = new URL(request.url);

  // All quotation-item operations require authenticated caller
  const authResult = await authenticateUser(request, env);
  if (!authResult.allowed || !authResult.user) {
    return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
  }
  const { user } = authResult;

  // 1. GET: Inspect quotation items
  if (method === 'GET') {
    if (itemId) {
      const item: any = await env.DB.prepare('SELECT * FROM quotation_items WHERE id = ?').bind(itemId).first();
      if (!item) return errorJson(`Quotation item not found: ${itemId}`, 404, request);

      // Verify caller is Admin, the supplier, or the target customer
      if (user.role !== 'admin') {
        const parentQ: any = await env.DB.prepare('SELECT supplier_contacted, customer_id, user_id FROM quotations WHERE id = ?')
          .bind(item.quotation_id)
          .first();
        if (parentQ) {
          if (user.role === 'customer' && parentQ.customer_id !== user.uid && parentQ.user_id !== user.uid) {
            return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك باستعراض بنود هذا العرض.' } }, 403, request);
          }
          if (user.role === 'supplier' && parentQ.supplier_contacted && parentQ.supplier_contacted !== user.uid) {
            return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك باستعراض بنود عرض يخص مورداً آخر.' } }, 403, request);
          }
        }
      }

      return successJson({ item }, 200, request);
    }

    const quotationId = url.searchParams.get('quotation_id') || url.searchParams.get('quotationId');
    if (!quotationId) {
      return errorJson("Query parameter 'quotation_id' is required to list quotation items", 400, request);
    }

    if (user.role !== 'admin') {
      const parentQ: any = await env.DB.prepare('SELECT supplier_contacted, customer_id, user_id FROM quotations WHERE id = ?')
        .bind(quotationId)
        .first();
      if (parentQ) {
        if (user.role === 'customer' && parentQ.customer_id !== user.uid && parentQ.user_id !== user.uid) {
          return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك باستعراض بنود هذا العرض.' } }, 403, request);
        }
        if (user.role === 'supplier' && parentQ.supplier_contacted && parentQ.supplier_contacted !== user.uid) {
          return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك باستعراض بنود عرض يخص مورداً آخر.' } }, 403, request);
        }
      }
    }

    const { results } = await env.DB.prepare(
      'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY created_at ASC'
    )
      .bind(quotationId)
      .all();

    return successJson({ count: results.length, items: results }, 200, request);
  }

  // 2. POST: Add item to quotation (Admin or Verified Supplier of this quotation)
  if (method === 'POST') {
    if (user.role === 'customer') {
      return json({ ok: false, success: false, error: 'إضافة بنود العروض مقتصرة على الموردين والإدارة.' }, 403, request);
    }
    if (user.role === 'supplier' && (!user.verified || user.rejected)) {
      return json({ ok: false, success: false, error: 'يتطلب اعتماد حساب المورد لإضافة بنود العروض.' }, 403, request);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const quotationId = body.quotation_id || body.quotationId;
    if (!quotationId || !body.item_type || !body.item_name) {
      return errorJson("Missing required fields: 'quotation_id', 'item_type', and 'item_name'", 400, request);
    }

    // Verify parent quotation exists and belongs to supplier
    const parentQuotation: any = await env.DB.prepare('SELECT id, supplier_contacted FROM quotations WHERE id = ?').bind(quotationId).first();
    if (!parentQuotation) {
      return errorJson(`Referenced quotation '${quotationId}' does not exist`, 404, request);
    }

    if (user.role === 'supplier' && parentQuotation.supplier_contacted && parentQuotation.supplier_contacted !== user.uid) {
      return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بإضافة بنود لعرض يخص مورداً آخر.' } }, 403, request);
    }

    const id = body.id || generateId('item');
    const quantity = typeof body.quantity === 'number' && body.quantity > 0 ? body.quantity : 1.0;
    const unitPrice = typeof body.unit_price === 'number' && body.unit_price >= 0 ? body.unit_price : (body.unitPrice || 0.0);
    const totalPrice = typeof body.total_price === 'number' ? body.total_price : quantity * unitPrice;

    await env.DB.prepare(
      `INSERT INTO quotation_items (
        id, quotation_id, product_id, item_type, item_name,
        model, quantity, unit_price, total_price, specs, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, datetime('now')
      )`
    )
      .bind(
        id,
        quotationId,
        body.product_id || body.productId || null,
        body.item_type,
        body.item_name,
        body.model || null,
        quantity,
        unitPrice,
        totalPrice,
        body.specs || null
      )
      .run();

    return successJson({ message: 'Quotation item created successfully', item_id: id }, 201, request);
  }

  // 3. PUT: Update item
  if (method === 'PUT') {
    if (!itemId) return errorJson('Quotation item ID required in path', 400, request);

    if (user.role === 'customer') {
      return json({ ok: false, success: false, error: 'تعديل بنود العروض مقتصر على الموردين والإدارة.' }, 403, request);
    }
    if (user.role === 'supplier' && (!user.verified || user.rejected)) {
      return json({ ok: false, success: false, error: 'يتطلب اعتماد حساب المورد لتعديل بنود العروض.' }, 403, request);
    }

    const existing: any = await env.DB.prepare('SELECT id, quotation_id, quantity, unit_price FROM quotation_items WHERE id = ?')
      .bind(itemId)
      .first();
    if (!existing) return errorJson(`Quotation item not found: ${itemId}`, 404, request);

    if (user.role === 'supplier') {
      const parentQ: any = await env.DB.prepare('SELECT supplier_contacted FROM quotations WHERE id = ?').bind(existing.quotation_id).first();
      if (parentQ && parentQ.supplier_contacted && parentQ.supplier_contacted !== user.uid) {
        return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل بند في عرض يخص مورداً آخر.' } }, 403, request);
      }
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const newQty = typeof body.quantity === 'number' && body.quantity > 0 ? body.quantity : (existing.quantity as number);
    const newUnitPrice = typeof body.unit_price === 'number' && body.unit_price >= 0 ? body.unit_price : (existing.unit_price as number);
    const newTotal = typeof body.total_price === 'number' ? body.total_price : newQty * newUnitPrice;

    await env.DB.prepare(
      `UPDATE quotation_items SET
        item_name = COALESCE(?, item_name),
        model = COALESCE(?, model),
        quantity = ?,
        unit_price = ?,
        total_price = ?,
        specs = COALESCE(?, specs)
      WHERE id = ?`
    )
      .bind(
        body.item_name || null,
        body.model || null,
        newQty,
        newUnitPrice,
        newTotal,
        body.specs || null,
        itemId
      )
      .run();

    return successJson({ message: 'Quotation item updated successfully', item_id: itemId }, 200, request);
  }

  // 4. DELETE
  if (method === 'DELETE') {
    if (!itemId) return errorJson('Quotation item ID required in path', 400, request);

    if (user.role === 'customer') {
      return json({ ok: false, success: false, error: 'حذف بنود العروض مقتصر على الموردين والإدارة.' }, 403, request);
    }
    if (user.role === 'supplier' && (!user.verified || user.rejected)) {
      return json({ ok: false, success: false, error: 'يتطلب اعتماد حساب المورد لحذف بنود العروض.' }, 403, request);
    }

    const existing: any = await env.DB.prepare('SELECT id, quotation_id FROM quotation_items WHERE id = ?').bind(itemId).first();
    if (!existing) return errorJson(`Quotation item not found: ${itemId}`, 404, request);

    if (user.role === 'supplier') {
      const parentQ: any = await env.DB.prepare('SELECT supplier_contacted FROM quotations WHERE id = ?').bind(existing.quotation_id).first();
      if (parentQ && parentQ.supplier_contacted && parentQ.supplier_contacted !== user.uid) {
        return json({ ok: false, success: false, error: { code: 'FORBIDDEN', message: 'غير مصرح لك بحذف بند في عرض يخص مورداً آخر.' } }, 403, request);
      }
    }

    await env.DB.prepare('DELETE FROM quotation_items WHERE id = ?').bind(itemId).run();
    return successJson({ message: 'Quotation item deleted successfully', item_id: itemId }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /quotation-items`, 405, request);
}

// ============================================================================
// 8. /reviews Handler (Access Control: Public Read, Authenticated Self/Admin Write)
// ============================================================================
async function handleProductReviews(request: Request, env: Env, path: string, method: string): Promise<Response> {
  const parts = path.split('/').filter(Boolean);
  const reviewId = parts[1]; // /reviews/:id
  const url = new URL(request.url);

  // 1. GET: Public read access
  if (method === 'GET') {
    if (reviewId) {
      const review = await env.DB.prepare('SELECT * FROM product_reviews WHERE id = ?').bind(reviewId).first();
      if (!review) return errorJson(`Review not found: ${reviewId}`, 404, request);
      return successJson({ review }, 200, request);
    }

    const productId = url.searchParams.get('product_id') || url.searchParams.get('productId');
    const userId = url.searchParams.get('user_id') || url.searchParams.get('userId');

    let query = 'SELECT * FROM product_reviews WHERE 1=1';
    const params: any[] = [];

    if (productId) {
      query += ' AND product_id = ?';
      params.push(productId);
    }
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT 200';

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return successJson({ count: results.length, reviews: results }, 200, request);
  }

  // 2. POST: Create review under authenticated user identity
  if (method === 'POST') {
    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const productId = body.product_id || body.productId;
    const rating = typeof body.rating === 'number' ? body.rating : parseInt(body.rating, 10);
    const comment = (body.comment || '').trim();

    if (!productId || !comment) {
      return errorJson("Missing required fields: 'product_id' and 'comment'", 400, request);
    }

    if (isNaN(rating) || rating < 1 || rating > 5) {
      return errorJson("Rating must be an integer between 1 and 5", 400, request);
    }

    // Verify target product exists (Foreign Key Integrity)
    const productExists = await env.DB.prepare('SELECT product_id FROM products WHERE product_id = ? OR id = ?')
      .bind(productId, productId)
      .first();
    if (!productExists) {
      return errorJson(`Referenced product '${productId}' does not exist in catalog`, 404, request);
    }

    const id = body.id || generateId('rev');
    const userId = authResult.user.uid;
    const userName = body.user_name || authResult.user.claims.name || authResult.user.email.split('@')[0] || 'مستخدم منصة Enerjoo';

    await env.DB.prepare(
      `INSERT INTO product_reviews (
        id, product_id, user_id, user_name, rating, comment, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, datetime('now')
      )`
    )
      .bind(id, productId, userId, userName, rating, comment)
      .run();

    return successJson({ message: 'Review added successfully', review_id: id }, 201, request);
  }

  // 3. PUT: Update Review (Author or Admin)
  if (method === 'PUT') {
    if (!reviewId) return errorJson('Review ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    const existing: any = await env.DB.prepare('SELECT * FROM product_reviews WHERE id = ?').bind(reviewId).first();
    if (!existing) return errorJson(`Review not found: ${reviewId}`, 404, request);

    if (authResult.user.role !== 'admin' && existing.user_id !== authResult.user.uid) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'غير مصرح لك بتعديل تقييم كتبه مستخدم آخر.' }
        },
        403,
        request
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    let rating = null;
    if (body.rating !== undefined) {
      rating = typeof body.rating === 'number' ? body.rating : parseInt(body.rating, 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return errorJson("Rating must be an integer between 1 and 5", 400, request);
      }
    }

    await env.DB.prepare(
      `UPDATE product_reviews SET
        rating = COALESCE(?, rating),
        comment = COALESCE(?, comment)
      WHERE id = ?`
    )
      .bind(rating, body.comment || null, reviewId)
      .run();

    return successJson({ message: 'Review updated successfully', review_id: reviewId }, 200, request);
  }

  // 4. DELETE: Author or Admin
  if (method === 'DELETE') {
    if (!reviewId) return errorJson('Review ID required in path', 400, request);

    const authResult = await authenticateUser(request, env);
    if (!authResult.allowed || !authResult.user) {
      return json({ ok: false, success: false, error: authResult.message }, authResult.status, request);
    }

    const existing: any = await env.DB.prepare('SELECT id, user_id FROM product_reviews WHERE id = ?').bind(reviewId).first();
    if (!existing) return errorJson(`Review not found: ${reviewId}`, 404, request);

    if (authResult.user.role !== 'admin' && existing.user_id !== authResult.user.uid) {
      return json(
        {
          ok: false,
          success: false,
          error: { code: 'FORBIDDEN', message: 'غير مصرح لك بحذف تقييم مستخدم آخر.' }
        },
        403,
        request
      );
    }

    await env.DB.prepare('DELETE FROM product_reviews WHERE id = ?').bind(reviewId).run();
    return successJson({ message: 'Review deleted successfully', review_id: reviewId }, 200, request);
  }

  return errorJson(`Method ${method} not allowed for /reviews`, 405, request);
}

// ============================================================================
// 9. /energy-exchange Handler (Cloudflare D1 Single Source of Truth - Admin Writes)
// ============================================================================
const DEFAULT_EXCHANGE_RECORDS = [
  { price_id: 'PRICE_PANEL_JINKO', category: 'panels', brand: 'Jinko', product_type: 'Solar Panel', price_per_watt: 12.00, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_LONGI', category: 'panels', brand: 'LONGi Solar', product_type: 'Solar Panel', price_per_watt: 12.20, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_AIKO', category: 'panels', brand: 'AIKO', product_type: 'Solar Panel', price_per_watt: 12.50, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_TRINA', category: 'panels', brand: 'Trina Solar', product_type: 'Solar Panel', price_per_watt: 11.90, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_JA_SOLAR', category: 'panels', brand: 'JA Solar', product_type: 'Solar Panel', price_per_watt: 11.95, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_RISEN', category: 'panels', brand: 'Risen', product_type: 'Solar Panel', price_per_watt: 11.80, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_GCL', category: 'panels', brand: 'GCL', product_type: 'Solar Panel', price_per_watt: 11.75, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_SUNTECH', category: 'panels', brand: 'Suntech', product_type: 'Solar Panel', price_per_watt: 11.85, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_ASTRONERGY', category: 'panels', brand: 'Astronergy', product_type: 'Solar Panel', price_per_watt: 11.90, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_GOKIN', category: 'panels', brand: 'Gokin', product_type: 'Solar Panel', price_per_watt: 11.70, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_QUANTUM', category: 'panels', brand: 'Quantum Solar', product_type: 'Solar Panel', price_per_watt: 11.80, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_ULICA', category: 'panels', brand: 'Ulica Solar', product_type: 'Solar Panel', price_per_watt: 11.75, currency: 'EGP' },
  { price_id: 'PRICE_PANEL_ZNSHINE', category: 'panels', brand: 'ZNShine Solar', product_type: 'Solar Panel', price_per_watt: 11.80, currency: 'EGP' },
];

function normalizeBrandToPriceId(brand: string): string {
  const clean = brand.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `PRICE_PANEL_${clean}`;
}

async function ensureEnergyExchangeTable(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS energy_exchange_prices (
      price_id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'panels',
      brand TEXT NOT NULL,
      product_type TEXT DEFAULT 'Solar Panel',
      price_per_watt REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EGP',
      effective_date TEXT DEFAULT (DATE('now')),
      updated_at TEXT DEFAULT (DATETIME('now')),
      updated_by TEXT DEFAULT 'system'
    );
  `);

  try {
    const row = await db.prepare('SELECT COUNT(*) as count FROM energy_exchange_prices').first<{ count: number }>();
    if (!row || row.count === 0) {
      for (const item of DEFAULT_EXCHANGE_RECORDS) {
        await db.prepare(`
          INSERT INTO energy_exchange_prices (
            price_id, category, brand, product_type, price_per_watt, currency, effective_date, updated_at, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, DATE('now'), DATETIME('now'), 'system')
          ON CONFLICT(price_id) DO NOTHING
        `).bind(
          item.price_id,
          item.category,
          item.brand,
          item.product_type,
          item.price_per_watt,
          item.currency
        ).run();
      }
    }
  } catch (seedErr) {
    console.warn('Energy exchange initial table check notice:', seedErr);
  }
}

async function handleEnergyExchange(request: Request, env: Env, path: string, method: string): Promise<Response> {
  // DDL execution (ensureEnergyExchangeTable) is removed from HTTP request handling per safety requirements.
  const cleanPath = path.replace(/^\/api/, '');
  const parts = cleanPath.split('/').filter(Boolean); // ['energy-exchange', 'ranges', ':id'] or ['energy-exchange', 'prices', ':id']
  let resourceId: string | undefined;

  if (parts.length >= 3 && (parts[1] === 'prices' || parts[1] === 'ranges')) {
    resourceId = decodeURIComponent(parts[2]);
  } else if (parts.length >= 2 && parts[1] !== 'prices' && parts[1] !== 'ranges') {
    resourceId = decodeURIComponent(parts[1]);
  }

  // 1. GET: Public read for all users (Customers, Suppliers, Guests, Admins)
  if (method === 'GET') {
    if (resourceId) {
      const row = await env.DB.prepare(
        'SELECT * FROM energy_exchange_prices WHERE price_id = ? OR brand = ? COLLATE NOCASE'
      ).bind(resourceId, resourceId).first();

      if (!row) return errorJson(`Price record not found: ${resourceId}`, 404, request);
      return successJson({ price: row, record: row }, 200, request);
    }

    let results: any[] = [];
    try {
      const queryRes = await env.DB.prepare(
        'SELECT * FROM energy_exchange_prices ORDER BY category, brand, min_wattage ASC'
      ).all<any>();
      results = Array.isArray(queryRes.results) ? queryRes.results : [];
    } catch (dbErr) {
      console.warn('D1 Query warning in /energy-exchange:', dbErr);
      results = [];
    }

    const pricesMap: Record<string, number> = {};
    if (Array.isArray(results)) {
      for (const r of results) {
        if (r.brand && typeof r.price_per_watt === 'number') {
          // If a brand has multiple ranges, pricesMap holds latest/default as fallback
          pricesMap[r.brand] = r.price_per_watt;
        }
      }
    }

    const res = json({
      success: true,
      ok: true,
      count: results.length,
      prices: pricesMap,
      data: results,
      records: results
    }, 200, request);
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    return res;
  }

  // 2. DELETE: Protected (Admin only) - Delete range or price record
  if (method === 'DELETE') {
    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    if (!resourceId) {
      return errorJson('Missing record ID or price_id for deletion', 400, request);
    }

    const target = await env.DB.prepare(
      'SELECT price_id, brand FROM energy_exchange_prices WHERE price_id = ?'
    ).bind(resourceId).first<any>();

    if (!target) {
      // Gracefully treat as deleted / already removed
      return successJson({
        message: 'السجل غير موجود أو تم حذفه سابقاً',
        deleted_id: resourceId
      }, 200, request);
    }

    await env.DB.prepare('DELETE FROM energy_exchange_prices WHERE price_id = ?').bind(resourceId).run();

    return successJson({
      message: 'تم حذف السجل بنجاح من بورصة الطاقة',
      deleted_id: resourceId,
      brand: target.brand
    }, 200, request);
  }

  // 3. PUT: Protected (Admin only) - Update or Upsert price or range record
  if (method === 'PUT') {
    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    const targetId = resourceId || body.price_id || body.brand;
    if (!targetId) {
      return errorJson('Price ID or Brand required for update', 400, request);
    }

    const pricePerWatt = Number(body.price_per_watt ?? body.pricePerWatt);
    if (!Number.isFinite(pricePerWatt) || pricePerWatt <= 0 || pricePerWatt > 200) {
      return errorJson('Invalid price_per_watt. Must be a valid positive number between 0 and 200.', 400, request);
    }

    const roundedPrice = parseFloat(pricePerWatt.toFixed(2));
    const updatedBy = authResult.user?.email || authResult.user?.uid || 'admin';
    const nowIso = new Date().toISOString();

    const minWattage = body.min_wattage !== undefined && body.min_wattage !== null ? Number(body.min_wattage) : null;
    const maxWattage = body.max_wattage !== undefined && body.max_wattage !== null ? Number(body.max_wattage) : null;

    // Lookup existing record strictly by exact price_id first
    let existing = await env.DB.prepare(
      'SELECT * FROM energy_exchange_prices WHERE price_id = ?'
    ).bind(targetId).first<any>();

    // If not found by price_id and targetId is a brand name, lookup flat price record
    if (!existing && !targetId.startsWith('RANGE_') && !targetId.startsWith('PRICE_')) {
      existing = await env.DB.prepare(
        'SELECT * FROM energy_exchange_prices WHERE brand = ? AND min_wattage IS NULL COLLATE NOCASE'
      ).bind(targetId).first<any>();
    }

    const brand = (body.brand || existing?.brand || targetId).trim();
    const finalPriceId = existing?.price_id || body.price_id || (minWattage !== null ? `RANGE_${brand.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${minWattage}_${maxWattage}` : normalizeBrandToPriceId(brand));

    if (minWattage !== null || maxWattage !== null) {
      if (minWattage === null || maxWattage === null || minWattage <= 0 || maxWattage < minWattage) {
        return errorJson('يرجى إدخال نطاق قدرة صحيح بالوات (حد أدنى > 0 وحد أقصى >= الحد الأدنى)', 400, request);
      }

      // 1. Try atomic UPDATE excluding current finalPriceId
      const updateResult: any = await env.DB.prepare(`
        UPDATE energy_exchange_prices
        SET
          brand = ?,
          min_wattage = ?,
          max_wattage = ?,
          price_per_watt = ?,
          effective_date = DATE('now'),
          updated_at = datetime('now'),
          updated_by = ?
        WHERE price_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM energy_exchange_prices
            WHERE brand = ? COLLATE NOCASE
              AND price_id != ?
              AND min_wattage IS NOT NULL
              AND max_wattage IS NOT NULL
              AND min_wattage <= ?
              AND max_wattage >= ?
          )
      `).bind(
        brand,
        minWattage,
        maxWattage,
        roundedPrice,
        updatedBy,
        finalPriceId,
        brand,
        finalPriceId,
        maxWattage,
        minWattage
      ).run();

      const changes = updateResult.meta?.changes ?? updateResult.changes ?? 0;
      if (changes > 0) {
        return successJson({
          message: 'تم تحديث نطاق السعر بنجاح في بورصة الطاقة',
          price_id: finalPriceId,
          brand,
          min_wattage: minWattage,
          max_wattage: maxWattage,
          price_per_watt: roundedPrice,
          updated_at: nowIso,
          updated_by: updatedBy
        }, 200, request);
      }

      // 2. If update changes === 0, check if record exists in D1
      const recordExists = await env.DB.prepare(
        'SELECT price_id FROM energy_exchange_prices WHERE price_id = ?'
      ).bind(finalPriceId).first();

      if (recordExists) {
        // Record exists, so changes === 0 means OVERLAP CONFLICT
        return errorJson(`تعذر التعديل: نطاق القدرة (${minWattage} - ${maxWattage} وات) يتداخل مع نطاق موجود لماركة ${brand}`, 409, request);
      }

      // 3. Record does not exist in D1 yet -> Perform Atomic INSERT (Upsert)
      const insertResult: any = await env.DB.prepare(`
        INSERT INTO energy_exchange_prices (
          price_id, category, brand, product_type, price_per_watt, currency, min_wattage, max_wattage, effective_date, updated_at, updated_by
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, DATE('now'), datetime('now'), ?
        WHERE NOT EXISTS (
          SELECT 1 FROM energy_exchange_prices
          WHERE brand = ? COLLATE NOCASE
            AND min_wattage IS NOT NULL
            AND max_wattage IS NOT NULL
            AND min_wattage <= ?
            AND max_wattage >= ?
        )
      `).bind(
        finalPriceId,
        body.category || 'panels',
        brand,
        body.product_type || 'Solar Panel',
        roundedPrice,
        body.currency || 'EGP',
        minWattage,
        maxWattage,
        updatedBy,
        brand,
        maxWattage,
        minWattage
      ).run();

      const insertChanges = insertResult.meta?.changes ?? insertResult.changes ?? 0;
      if (insertChanges === 0) {
        return errorJson(`تعذر الإضافة: نطاق القدرة (${minWattage} - ${maxWattage} وات) يتداخل مع نطاق موجود لماركة ${brand}`, 409, request);
      }

      return successJson({
        message: 'تم إضافة وتحديث نطاق السعر بنجاح في بورصة الطاقة',
        price_id: finalPriceId,
        brand,
        min_wattage: minWattage,
        max_wattage: maxWattage,
        price_per_watt: roundedPrice,
        updated_at: nowIso,
        updated_by: updatedBy
      }, 200, request);
    }

    // Standard flat price update (legacy)
    if (existing) {
      await env.DB.prepare(`
        UPDATE energy_exchange_prices SET
          price_per_watt = ?,
          effective_date = DATE('now'),
          updated_at = datetime('now'),
          updated_by = ?
        WHERE price_id = ?
      `).bind(roundedPrice, updatedBy, existing.price_id).run();

      return successJson({
        message: 'Price updated successfully in Cloudflare D1',
        price_id: existing.price_id,
        brand: existing.brand,
        price_per_watt: roundedPrice,
        updated_at: nowIso,
        updated_by: updatedBy
      }, 200, request);
    }

    await env.DB.prepare(`
      INSERT INTO energy_exchange_prices (
        price_id, category, brand, product_type, price_per_watt, currency, effective_date, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, DATE('now'), datetime('now'), ?)
      ON CONFLICT(price_id) DO UPDATE SET
        price_per_watt = excluded.price_per_watt,
        updated_at = datetime('now'),
        updated_by = excluded.updated_by
    `).bind(
      finalPriceId,
      body.category || 'panels',
      brand,
      body.product_type || 'Solar Panel',
      roundedPrice,
      body.currency || 'EGP',
      updatedBy
    ).run();

    return successJson({
      message: 'Price updated successfully in Cloudflare D1',
      price_id: finalPriceId,
      brand,
      price_per_watt: roundedPrice,
      updated_at: nowIso,
      updated_by: updatedBy
    }, 200, request);
  }

  // 4. POST: Protected (Admin only) - Create range or price record
  if (method === 'POST') {
    const authResult = await authenticateUser(request, env);
    const adminCheck = requireAdmin(authResult);
    if (!adminCheck.allowed) return adminCheck.response!;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid JSON payload in request body', 400, request);
    }

    // Extract updatedBy strictly from authenticated user token identity
    const updatedBy = authResult.user?.email || authResult.user?.uid || 'admin';

    // Range Insertion
    const minWattage = body.min_wattage !== undefined && body.min_wattage !== null ? Number(body.min_wattage) : null;
    const maxWattage = body.max_wattage !== undefined && body.max_wattage !== null ? Number(body.max_wattage) : null;

    if (minWattage !== null || maxWattage !== null) {
      if (minWattage === null || maxWattage === null || minWattage <= 0 || maxWattage < minWattage) {
        return errorJson('يرجى إدخال نطاق قدرة صحيح بالوات (حد أدنى > 0 وحد أقصى >= الحد الأدنى)', 400, request);
      }

      const pricePerWatt = Number(body.price_per_watt ?? body.pricePerWatt);
      if (!Number.isFinite(pricePerWatt) || pricePerWatt <= 0 || pricePerWatt > 200) {
        return errorJson('Invalid pricePerWatt. Must be a valid positive number between 0 and 200.', 400, request);
      }

      const roundedPrice = parseFloat(pricePerWatt.toFixed(2));
      const brand = (body.brand || '').trim();
      if (!brand) return errorJson('Brand name is required', 400, request);

      const cleanBrand = brand.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const priceId = body.price_id || `RANGE_${cleanBrand}_${minWattage}_${maxWattage}`;

      // Single-statement ATOMIC insertion with overlap prevention
      const insertResult: any = await env.DB.prepare(`
        INSERT INTO energy_exchange_prices (
          price_id, category, brand, product_type, price_per_watt, currency, min_wattage, max_wattage, effective_date, updated_at, updated_by
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, DATE('now'), datetime('now'), ?
        WHERE NOT EXISTS (
          SELECT 1 FROM energy_exchange_prices
          WHERE brand = ? COLLATE NOCASE
            AND min_wattage IS NOT NULL
            AND max_wattage IS NOT NULL
            AND min_wattage <= ?
            AND max_wattage >= ?
        )
      `).bind(
        priceId,
        body.category || 'panels',
        brand,
        body.product_type || 'Solar Panel',
        roundedPrice,
        body.currency || 'EGP',
        minWattage,
        maxWattage,
        updatedBy,
        brand,
        maxWattage,
        minWattage
      ).run();

      const changes = insertResult.meta?.changes ?? insertResult.changes ?? 0;
      if (changes === 0) {
        // Check if it failed due to existing price_id or range overlap
        const checkExistingId = await env.DB.prepare('SELECT price_id FROM energy_exchange_prices WHERE price_id = ?').bind(priceId).first();
        if (checkExistingId) {
          return errorJson(`رمز السعر مفتاح مكرر: ${priceId}`, 409, request);
        }
        return errorJson(`تعذر الإضافة: نطاق القدرة (${minWattage} - ${maxWattage} وات) يتداخل مع نطاق موجود لـ ${brand}`, 409, request);
      }

      return successJson({
        message: 'تم إضافة نطاق السعر بنجاح في بورصة الطاقة',
        price_id: priceId,
        brand,
        min_wattage: minWattage,
        max_wattage: maxWattage,
        price_per_watt: roundedPrice
      }, 200, request);
    }

    // Single brand flat update (legacy)
    if (body.brand && (body.price_per_watt !== undefined || body.pricePerWatt !== undefined)) {
      const pricePerWatt = Number(body.price_per_watt ?? body.pricePerWatt);
      if (!Number.isFinite(pricePerWatt) || pricePerWatt <= 0 || pricePerWatt > 200) {
        return errorJson('Invalid pricePerWatt. Must be a valid positive number between 0 and 200.', 400, request);
      }
      const roundedPrice = parseFloat(pricePerWatt.toFixed(2));
      const brand = body.brand.trim();
      const priceId = body.price_id || normalizeBrandToPriceId(brand);

      await env.DB.prepare(`
        INSERT INTO energy_exchange_prices (
          price_id, category, brand, product_type, price_per_watt, currency, effective_date, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, DATE('now'), datetime('now'), ?)
        ON CONFLICT(price_id) DO UPDATE SET
          price_per_watt = excluded.price_per_watt,
          updated_at = datetime('now'),
          updated_by = excluded.updated_by
      `).bind(
        priceId,
        body.category || 'panels',
        brand,
        body.product_type || 'Solar Panel',
        roundedPrice,
        body.currency || 'EGP',
        updatedBy
      ).run();

      return successJson({
        message: 'Price record created/updated successfully in Cloudflare D1',
        price_id: priceId,
        brand,
        price_per_watt: roundedPrice
      }, 200, request);
    }

    return errorJson('Missing valid brand, price, or wattage range object', 400, request);
  }

  return errorJson(`Method ${method} not allowed for /energy-exchange`, 405, request);
}
