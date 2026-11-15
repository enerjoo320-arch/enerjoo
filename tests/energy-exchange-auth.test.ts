import { DatabaseSync } from 'node:sqlite';
import worker, {
  authorizeEnergyExchangeAdmin,
  authorizeProductWrite,
  D1Database,
  D1PreparedStatement,
  Env,
} from '../worker/index';

// ============================================================================
// In-Memory Cloudflare D1 Mock backed by Node 22 Built-in SQLite (`node:sqlite`)
// ============================================================================
function createMockD1Database(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');

  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      type TEXT,
      verified INTEGER DEFAULT 0,
      rejected INTEGER DEFAULT 0
    );

    CREATE TABLE energy_exchange_prices (
      price_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      brand TEXT NOT NULL,
      product_type TEXT,
      price_per_watt REAL NOT NULL,
      currency TEXT DEFAULT 'EGP',
      min_wattage INTEGER,
      max_wattage INTEGER,
      is_active INTEGER DEFAULT 1,
      effective_date TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT UNIQUE NOT NULL,
      product_category TEXT,
      brand TEXT,
      model TEXT,
      product_type TEXT,
      technology TEXT,
      cell_type TEXT,
      number_of_cells INTEGER,
      power_w REAL,
      rated_power_kw REAL,
      surge_power_w REAL,
      waveform TEXT,
      ac_voltage_v TEXT,
      ac_voltage_regulation TEXT,
      frequency_hz REAL,
      peak_efficiency_percent REAL,
      transfer_time_ms REAL,
      battery_voltage_v REAL,
      nominal_voltage_v REAL,
      capacity_ah REAL,
      nominal_energy_wh REAL,
      max_output_power_kw REAL,
      recommended_charge_voltage_v REAL,
      recommended_charge_current_a REAL,
      end_of_discharge_voltage_v REAL,
      max_continuous_charge_current_a REAL,
      max_continuous_discharge_current_a REAL,
      cycle_life INTEGER,
      communication TEXT,
      max_pv_open_circuit_voltage_v REAL,
      max_pv_array_power_w REAL,
      max_pv_input_current_a REAL,
      pv_mppt_voltage_range_v TEXT,
      max_solar_charger_current_a REAL,
      max_ac_charger_current_a REAL,
      max_charge_current_a REAL,
      vmp_v REAL,
      voc_v REAL,
      imp_a REAL,
      isc_a REAL,
      efficiency_percent REAL,
      temperature_coefficient_pmax TEXT,
      temperature_coefficient_voc TEXT,
      temperature_coefficient_isc TEXT,
      max_system_voltage_v REAL,
      maximum_series_fuse_a REAL,
      dimensions_mm TEXT,
      machine_dimensions_w_h_d_mm TEXT,
      weight_kg REAL,
      nw_kg REAL,
      gw_kg REAL,
      front_glass TEXT,
      back_glass TEXT,
      frame TEXT,
      connector_type TEXT,
      junction_box TEXT,
      operating_temperature TEXT,
      storage_temperature TEXT,
      warranty_years REAL,
      price_egp REAL,
      supplier TEXT,
      availability TEXT,
      image_url TEXT,
      notes TEXT,
      owner_uid TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  function createStatement(sql: string, boundValues: any[] = []): D1PreparedStatement & { _execRun: () => any } {
    const sanitizeParam = (v: any) => (v === undefined ? null : v);

    const execRun = () => {
      const stmt = sqlite.prepare(sql);
      const cleanParams = boundValues.map(sanitizeParam);
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('PRAGMA') || trimmed.startsWith('SELECT')) {
        const rows = stmt.all(...cleanParams);
        return { success: true, results: rows, meta: { changes: 0 } };
      }
      const res = stmt.run(...cleanParams);
      return {
        success: true,
        results: [],
        meta: { changes: Number(res.changes ?? 0), last_row_id: Number(res.lastInsertRowid ?? 0) },
      };
    };

    return {
      bind(...values: any[]) {
        return createStatement(sql, values);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const stmt = sqlite.prepare(sql);
        const row = stmt.get(...boundValues.map(sanitizeParam)) as any;
        if (!row) return null;
        if (colName) return (row[colName] ?? null) as T;
        return row as T;
      },
      async run<T = unknown>(): Promise<{ success: boolean; meta?: any; results?: T[] }> {
        return execRun() as { success: boolean; meta?: any; results?: T[] };
      },
      async all<T = unknown>(): Promise<{ success: boolean; results: T[]; meta?: any }> {
        const stmt = sqlite.prepare(sql);
        const rows = stmt.all(...boundValues.map(sanitizeParam)) as T[];
        return { success: true, results: rows, meta: {} };
      },
      _execRun: execRun,
    };
  }

  const db: D1Database = {
    prepare(query: string) {
      return createStatement(query);
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ success: boolean; results?: T[] }>> {
      sqlite.exec('BEGIN');
      try {
        const out: Array<{ success: boolean; results?: T[] }> = [];
        for (const s of statements) {
          out.push((s as any)._execRun());
        }
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  };

  return { db, sqlite };
}

// ============================================================================
// Cryptographic Firebase RS256 Token Minting Helper (for realistic JWKS checks)
// ============================================================================
const TEST_PROJECT_ID = 'gen-lang-client-0409057996';
const TEST_KID = 'test-enerjoo-key-1';

function toBase64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createTestSigningContext() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey & {
    kid?: string;
    use?: string;
    alg?: string;
  };
  publicJwk.kid = TEST_KID;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  async function signFirebaseToken(claims: {
    sub: string;
    email: string;
    email_verified?: boolean;
    expOffsetSec?: number;
    extraClaims?: Record<string, any>;
  }): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', kid: TEST_KID, typ: 'JWT' };
    const payload = {
      iss: `https://securetoken.google.com/${TEST_PROJECT_ID}`,
      aud: TEST_PROJECT_ID,
      auth_time: nowSec - 60,
      user_id: claims.sub,
      sub: claims.sub,
      iat: nowSec - 30,
      exp: nowSec + (claims.expOffsetSec ?? 3600),
      email: claims.email,
      email_verified: claims.email_verified ?? true,
      ...(claims.extraClaims || {}),
    };

    const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
    const sigBuffer = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      keyPair.privateKey,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${toBase64Url(new Uint8Array(sigBuffer))}`;
  }

  return { publicJwk, signFirebaseToken };
}

// ============================================================================
// Main Test Runner covering ALL 8 Security & Functional Scenarios
// ============================================================================
async function runTests() {
  console.log('🧪 Starting Energy Exchange Admin Authorization & Isolation Tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const { db, sqlite } = createMockD1Database();
  const { publicJwk, signFirebaseToken } = await createTestSigningContext();

  // Seed baseline product belonging to supplier-1 and keep its price intact
  sqlite
    .prepare(
      `INSERT INTO products (product_id, product_category, brand, model, power_w, price_egp, supplier, availability, owner_uid, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run('PROD-SUP1-001', 'Solar Panels', 'LONGi Solar', 'Hi-MO 6 585W', 585, 6435, 'supplier-1', 'Available', 'supplier-1');

  // Track external fetch behavior (JWKS + Firestore)
  let firestoreCallCount = 0;
  let failFirestoreWith503 = false;
  let forbidFirestoreCalls = false;

  const mockFirestoreUsers: Record<string, { email: string; type: string; verified: boolean; rejected: boolean }> = {
    'supplier-verified-uid': { email: 'verified.supplier@example.com', type: 'supplier', verified: true, rejected: false },
    'supplier-unverified-uid': { email: 'pending.supplier@example.com', type: 'supplier', verified: false, rejected: false },
    'customer-uid': { email: 'customer@example.com', type: 'customer', verified: true, rejected: false },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    if (urlStr.includes('firestore.googleapis.com')) {
      firestoreCallCount++;
      if (forbidFirestoreCalls) {
        throw new Error(`FORBIDDEN_FIRESTORE_CALL: Energy Exchange called Firestore unexpectedly at ${urlStr}`);
      }
      if (failFirestoreWith503) {
        return new Response(JSON.stringify({ error: { code: 503, message: 'Firestore unavailable' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const match = urlStr.match(/\/documents\/(?:users|suppliers)\/([^/?]+)/);
      const uid = match ? decodeURIComponent(match[1]) : '';
      const user = mockFirestoreUsers[uid];
      if (!user) {
        return new Response(JSON.stringify({ error: { code: 404, message: 'Not found' } }), { status: 404 });
      }
      return new Response(
        JSON.stringify({
          fields: {
            email: { stringValue: user.email },
            type: { stringValue: user.type },
            verified: { booleanValue: user.verified },
            rejected: { booleanValue: user.rejected },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return originalFetch(input as any, init);
  };

  const env: Env = {
    DB: db,
    FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
    PRODUCT_ADMIN_EMAILS: 'product.admin@enerjoo.com',
    ADMIN_EMAILS: 'exchange.admin@enerjoo.com',
    PRODUCT_ADMIN_UIDS: 'product-admin-uid',
    ADMIN_UIDS: 'exchange-admin-uid',
  };

  try {
    // Mint tokens for every persona
    const defaultAdminToken = await signFirebaseToken({
      sub: 'default-admin-uid',
      email: 'ENERJOO365@GMAIL.COM', // Mixed case to verify case-insensitive matching
      email_verified: true,
    });
    const envEmailAdminToken = await signFirebaseToken({
      sub: 'any-uid-for-admin-email',
      email: 'Exchange.Admin@Enerjoo.COM', // ADMIN_EMAILS case-insensitive
      email_verified: true,
    });
    const envUidAdminToken = await signFirebaseToken({
      sub: 'exchange-admin-uid',
      email: 'non.listed.email@enerjoo.com',
      email_verified: true,
    });
    const unverifiedEmailAdminToken = await signFirebaseToken({
      sub: 'unverified-admin-uid',
      email: 'exchange.admin@enerjoo.com',
      email_verified: false, // Unverified email MUST be rejected
    });
    const excludedEmailToken = await signFirebaseToken({
      sub: 'excluded-uid',
      email: 'eng.faressnasser@gmail.com',
      email_verified: true,
      extraClaims: { admin: true, role: 'admin' }, // Even with claims, excluded email MUST be rejected
    });
    const verifiedSupplierToken = await signFirebaseToken({
      sub: 'supplier-verified-uid',
      email: 'verified.supplier@example.com',
      email_verified: true,
    });
    const unverifiedSupplierToken = await signFirebaseToken({
      sub: 'supplier-unverified-uid',
      email: 'pending.supplier@example.com',
      email_verified: true,
    });
    const customerToken = await signFirebaseToken({
      sub: 'customer-uid',
      email: 'customer@example.com',
      email_verified: true,
    });

    const callWorker = async (path: string, method: string, token?: string, body?: any) => {
      const headers: Record<string, string> = { Origin: 'https://enerjoo.com' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const req = new Request(`https://enerjoo-api.enerjoo320.workers.dev${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return worker.fetch(req, env);
    };

    // ------------------------------------------------------------------------
    // Pre-check: Empty DB GET returns count: 0 with no fake defaults
    // ------------------------------------------------------------------------
    console.log('Pre-check: Public GET returns empty state safely');
    const emptyGetRes = await callWorker('/energy-exchange/prices', 'GET');
    const emptyGetJson: any = await emptyGetRes.json();
    assert(emptyGetRes.status === 200 && emptyGetJson.count === 0 && Array.isArray(emptyGetJson.data), 'GET /energy-exchange/prices returns 200 and count: 0 when empty');

    // ------------------------------------------------------------------------
    // Scenario 1: Approved Admin can update watt price + security checks
    // ------------------------------------------------------------------------
    console.log('\nScenario 1: Approved Admin edits Energy Exchange watt price');
    forbidFirestoreCalls = true;
    failFirestoreWith503 = true; // Simulate Firestore down during ALL Energy Exchange operations
    firestoreCallCount = 0;

    // 1a. Admin via case-insensitive PRODUCT_ADMIN_EMAILS / built-in allowlist
    const res1a = await callWorker('/energy-exchange/brands/LONGi%20Solar', 'PUT', defaultAdminToken, {
      ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 11.45 }],
      updated_by: 'spoofed-attacker@evil.com',
    });
    const json1a: any = await res1a.json();
    assert(res1a.status === 200 && json1a.success === true, 'Built-in admin (mixed-case email) updates price_per_watt (200)');
    assert(json1a.updated_by === 'enerjoo365@gmail.com', `updated_by derived strictly from token (${json1a.updated_by}), ignored body spoof`);

    // 1b. Admin via ADMIN_EMAILS case-insensitive
    const res1b = await callWorker('/energy-exchange/brands/LONGi%20Solar', 'PUT', envEmailAdminToken, {
      ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 11.75 }],
    });
    const json1b: any = await res1b.json();
    assert(res1b.status === 200 && json1b.ranges?.[0]?.price_per_watt === 11.75, 'ADMIN_EMAILS admin updates price_per_watt to 11.75 (200)');

    // 1c. Admin via ADMIN_UIDS
    const res1c = await callWorker('/energy-exchange/brands/Jinko', 'PUT', envUidAdminToken, {
      ranges: [{ min_wattage: 540, max_wattage: 590, price_per_watt: 11.2 }],
    });
    assert(res1c.status === 200, 'ADMIN_UIDS admin creates/updates Jinko price (200)');

    // 1d. Email allowlist match with email_verified = false rejected 403 ADMIN_REQUIRED
    const resUnverifiedEmail = await callWorker('/energy-exchange/brands/LONGi%20Solar', 'PUT', unverifiedEmailAdminToken, {
      ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 12 }],
    });
    const jsonUnverifiedEmail: any = await resUnverifiedEmail.json();
    assert(
      resUnverifiedEmail.status === 403 && jsonUnverifiedEmail?.error?.code === 'ADMIN_REQUIRED',
      'Unverified admin email rejected with 403 ADMIN_REQUIRED'
    );

    // 1e. Excluded email rejected even if claims say admin
    const resExcluded = await callWorker('/energy-exchange/brands/LONGi%20Solar', 'PUT', excludedEmailToken, {
      ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 12 }],
    });
    const jsonExcluded: any = await resExcluded.json();
    assert(resExcluded.status === 403 && jsonExcluded?.error?.code === 'ADMIN_REQUIRED', 'Excluded email rejected with 403 ADMIN_REQUIRED');

    // 1f. Missing allowlist configuration returns explicit ADMIN_AUTH_NOT_CONFIGURED
    const emptyConfigAuth = await authorizeEnergyExchangeAdmin(
      new Request('https://enerjoo-api.enerjoo320.workers.dev/energy-exchange/prices', {
        method: 'POST',
        headers: { Authorization: `Bearer ${envEmailAdminToken}` },
      }),
      { DB: db, FIREBASE_PROJECT_ID: TEST_PROJECT_ID },
      { useDefaultAllowlists: false }
    );
    assert(
      !emptyConfigAuth.allowed && emptyConfigAuth.status === 500 && emptyConfigAuth.code === 'ADMIN_AUTH_NOT_CONFIGURED',
      'Missing admin allowlists returns explicit 500 ADMIN_AUTH_NOT_CONFIGURED instead of falling back to Firestore'
    );

    // ------------------------------------------------------------------------
    // Scenario 2: Approved Admin can add 2nd and 3rd ranges
    // ------------------------------------------------------------------------
    console.log('\nScenario 2: Approved Admin adds 2nd and 3rd ranges');
    const resAdd2 = await callWorker('/energy-exchange/prices', 'POST', defaultAdminToken, {
      brand: 'LONGi Solar',
      min_wattage: 601,
      max_wattage: 650,
      price_per_watt: 12.1,
    });
    const jsonAdd2: any = await resAdd2.json();
    assert(resAdd2.status === 200 && jsonAdd2.price_id === 'RANGE_LONGI_SOLAR_601_650', '2nd range added for LONGi Solar (200)');

    const resAdd3 = await callWorker('/energy-exchange/prices', 'POST', defaultAdminToken, {
      brand: 'LONGi Solar',
      min_wattage: 651,
      max_wattage: 710,
      price_per_watt: 12.6,
    });
    const jsonAdd3: any = await resAdd3.json();
    assert(resAdd3.status === 200 && jsonAdd3.price_id === 'RANGE_LONGI_SOLAR_651_710', '3rd range added for LONGi Solar (200)');

    const resAdd4 = await callWorker('/energy-exchange/prices', 'POST', defaultAdminToken, {
      brand: 'LONGi Solar',
      min_wattage: 711,
      max_wattage: 750,
      price_per_watt: 13.0,
    });
    assert(resAdd4.status === 400, '4th range correctly rejected (max 3 ranges enforced)');

    // ------------------------------------------------------------------------
    // Scenario 3: Approved Admin edits ranges & deletes optional 2nd/3rd range
    // ------------------------------------------------------------------------
    console.log('\nScenario 3: Approved Admin edits ranges & deletes optional ranges');
    const resEdit2 = await callWorker('/energy-exchange/prices/RANGE_LONGI_SOLAR_601_650', 'PUT', defaultAdminToken, {
      brand: 'LONGi Solar',
      min_wattage: 601,
      max_wattage: 650,
      price_per_watt: 12.35,
    });
    const jsonEdit2: any = await resEdit2.json();
    assert(resEdit2.status === 200 && jsonEdit2.price_per_watt === 12.35, 'Admin edits 2nd range price to 12.35 (200)');

    const resPatchToggle = await callWorker('/energy-exchange/brands/Jinko', 'PATCH', defaultAdminToken, {
      is_active: false,
    });
    const jsonPatchToggle: any = await resPatchToggle.json();
    assert(resPatchToggle.status === 200 && jsonPatchToggle.is_active === 0, 'Admin toggles brand active flag via PATCH (200)');

    const resDel3 = await callWorker('/energy-exchange/prices/RANGE_LONGI_SOLAR_651_710', 'DELETE', defaultAdminToken);
    assert(resDel3.status === 200, 'Admin deletes optional 3rd range (200)');

    const resDel2 = await callWorker('/energy-exchange/prices/RANGE_LONGI_SOLAR_601_650', 'DELETE', defaultAdminToken);
    assert(resDel2.status === 200, 'Admin deletes optional 2nd range (200)');

    const resDel1 = await callWorker('/energy-exchange/prices/RANGE_LONGI_SOLAR_550_600', 'DELETE', defaultAdminToken);
    const jsonDel1: any = await resDel1.json();
    assert(
      resDel1.status === 400 && jsonDel1?.error?.code === 'MIN_RANGE_REQUIRED',
      'Deleting last remaining 1st mandatory range blocked with 400 MIN_RANGE_REQUIRED'
    );

    // ------------------------------------------------------------------------
    // Scenario 4: Supplier CANNOT edit Energy Exchange (403 ADMIN_REQUIRED)
    // ------------------------------------------------------------------------
    console.log('\nScenario 4: Supplier blocked from ALL Energy Exchange writes (403 ADMIN_REQUIRED)');
    const supplierPost = await callWorker('/energy-exchange/prices', 'POST', verifiedSupplierToken, {
      brand: 'Trina Solar',
      min_wattage: 550,
      max_wattage: 600,
      price_per_watt: 10.5,
      role: 'admin',
      adminEmail: 'enerjoo365@gmail.com',
    });
    const supplierPostJson: any = await supplierPost.json();
    assert(supplierPost.status === 403 && supplierPostJson?.error?.code === 'ADMIN_REQUIRED', 'Supplier POST returns 403 ADMIN_REQUIRED');

    const supplierPut = await callWorker('/energy-exchange/brands/LONGi%20Solar', 'PUT', verifiedSupplierToken, {
      ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 9.99 }],
    });
    const supplierPutJson: any = await supplierPut.json();
    assert(supplierPut.status === 403 && supplierPutJson?.error?.code === 'ADMIN_REQUIRED', 'Supplier PUT returns 403 ADMIN_REQUIRED');

    const supplierPatch = await callWorker('/energy-exchange/brands/LONGi%20Solar', 'PATCH', verifiedSupplierToken, {
      is_active: false,
    });
    const supplierPatchJson: any = await supplierPatch.json();
    assert(supplierPatch.status === 403 && supplierPatchJson?.error?.code === 'ADMIN_REQUIRED', 'Supplier PATCH returns 403 ADMIN_REQUIRED');

    const supplierDelete = await callWorker('/energy-exchange/prices/RANGE_LONGI_SOLAR_550_600', 'DELETE', verifiedSupplierToken);
    const supplierDeleteJson: any = await supplierDelete.json();
    assert(supplierDelete.status === 403 && supplierDeleteJson?.error?.code === 'ADMIN_REQUIRED', 'Supplier DELETE returns 403 ADMIN_REQUIRED');

    // ------------------------------------------------------------------------
    // Scenario 5: Customer CANNOT edit Energy Exchange (403 ADMIN_REQUIRED)
    // ------------------------------------------------------------------------
    console.log('\nScenario 5: Customer blocked from ALL Energy Exchange writes (403 ADMIN_REQUIRED)');
    for (const [label, path, method, body] of [
      ['POST', '/energy-exchange/prices', 'POST', { brand: 'Risen', min_wattage: 550, max_wattage: 600, price_per_watt: 11 }],
      ['PUT', '/energy-exchange/prices/RANGE_LONGI_SOLAR_550_600', 'PUT', { brand: 'LONGi Solar', min_wattage: 550, max_wattage: 600, price_per_watt: 8 }],
      ['PATCH', '/energy-exchange/brands/LONGi%20Solar', 'PATCH', { is_active: true }],
      ['DELETE', '/energy-exchange/prices/RANGE_LONGI_SOLAR_550_600', 'DELETE', undefined],
    ] as const) {
      const custRes = await callWorker(path, method, customerToken, body);
      const custJson: any = await custRes.json();
      assert(custRes.status === 403 && custJson?.error?.code === 'ADMIN_REQUIRED', `Customer ${label} returns 403 ADMIN_REQUIRED`);
    }

    // Customer & Supplier CAN still read GET /energy-exchange/prices
    const publicReadRes = await callWorker('/energy-exchange/prices', 'GET', customerToken);
    const publicReadJson: any = await publicReadRes.json();
    assert(publicReadRes.status === 200 && publicReadJson.count === 2, 'Public GET /energy-exchange/prices still works (200)');

    // ------------------------------------------------------------------------
    // Scenario 6: Unauthenticated user rejected with 401 UNAUTHORIZED
    // ------------------------------------------------------------------------
    console.log('\nScenario 6: Unauthenticated requests rejected with 401 UNAUTHORIZED');
    for (const [label, path, method, body] of [
      ['POST', '/energy-exchange/prices', 'POST', { brand: 'Risen', min_wattage: 550, max_wattage: 600, price_per_watt: 11 }],
      ['PUT', '/energy-exchange/brands/LONGi%20Solar', 'PUT', { ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 12 }] }],
      ['PATCH', '/energy-exchange/brands/LONGi%20Solar', 'PATCH', { is_active: true }],
      ['DELETE', '/energy-exchange/prices/RANGE_LONGI_SOLAR_550_600', 'DELETE', undefined],
    ] as const) {
      const unauthRes = await callWorker(path, method, undefined, body);
      const unauthJson: any = await unauthRes.json();
      assert(unauthRes.status === 401 && unauthJson?.error?.code === 'UNAUTHORIZED', `Unauthenticated ${label} returns 401 UNAUTHORIZED`);
    }

    // ------------------------------------------------------------------------
    // Scenario 7: Zero Firestore / fetchAuthoritativeFirestoreUser calls in Energy Exchange
    // ------------------------------------------------------------------------
    console.log('\nScenario 7: Zero Firestore / supplier verification calls during Energy Exchange');
    assert(
      firestoreCallCount === 0,
      `Zero requests sent to firestore.googleapis.com across ALL Energy Exchange operations (actual=${firestoreCallCount})`
    );

    // ------------------------------------------------------------------------
    // Scenario 8: Product permissions for Suppliers remain intact with Firestore + Ownership
    // ------------------------------------------------------------------------
    console.log('\nScenario 8: Supplier product permissions (authorizeProductWrite) intact');
    forbidFirestoreCalls = false;
    failFirestoreWith503 = false;
    firestoreCallCount = 0;

    // 8a. Verified supplier creates own product (calls Firestore verification)
    const supCreateProd = await callWorker('/products', 'POST', verifiedSupplierToken, {
      product_id: 'PROD-SUP-OWN-1',
      product_category: 'Solar Panels',
      brand: 'Jinko Solar',
      model: 'Tiger Neo 580W',
      power_w: 580,
      price_egp: 6100,
    });
    assert(supCreateProd.status === 201, 'Verified supplier creates own product via POST /products (201)');
    assert(firestoreCallCount > 0, `authorizeProductWrite still verifies supplier against Firestore (calls=${firestoreCallCount})`);

    // 8b. Verified supplier CANNOT edit product owned by another supplier ('supplier-1')
    const supForeignEdit = await callWorker('/products/PROD-SUP1-001', 'PUT', verifiedSupplierToken, {
      price_egp: 1,
    });
    const supForeignEditJson: any = await supForeignEdit.json();
    assert(
      supForeignEdit.status === 403 && supForeignEditJson?.error?.code === 'PRODUCT_OWNERSHIP_FORBIDDEN',
      'Verified supplier blocked from editing foreign supplier product (403 PRODUCT_OWNERSHIP_FORBIDDEN)'
    );

    // 8c. Unverified supplier blocked with 403 SUPPLIER_NOT_VERIFIED
    const unverifiedAuthCheck = await authorizeProductWrite(
      new Request('https://enerjoo-api.enerjoo320.workers.dev/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${unverifiedSupplierToken}` },
      }),
      env
    );
    assert(
      !unverifiedAuthCheck.allowed && unverifiedAuthCheck.status === 403 && unverifiedAuthCheck.code === 'SUPPLIER_NOT_VERIFIED',
      'Unverified supplier rejected on product writes (403 SUPPLIER_NOT_VERIFIED)'
    );

    // 8d. Fail-closed 503 check remains active on authorizeProductWrite when Firestore & users table are unavailable
    failFirestoreWith503 = true;
    sqlite.exec('DROP TABLE IF EXISTS users');
    const firestoreDownProdCheck = await authorizeProductWrite(
      new Request('https://enerjoo-api.enerjoo320.workers.dev/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${verifiedSupplierToken}` },
      }),
      env
    );
    assert(
      !firestoreDownProdCheck.allowed && firestoreDownProdCheck.status === 503,
      `authorizeProductWrite remains fail-closed (503) for non-admins when Firestore & D1 users store are unavailable (status=${firestoreDownProdCheck.status})`
    );

    // 8e. Confirm baseline product price_egp in D1 was never touched by Energy Exchange
    const baselineProd: any = sqlite.prepare('SELECT price_egp FROM products WHERE product_id = ?').get('PROD-SUP1-001');
    assert(baselineProd?.price_egp === 6435, `Baseline products.price_egp unchanged (${baselineProd?.price_egp} EGP)`);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }

  console.log(`\n📊 Energy Exchange Auth Isolation Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
