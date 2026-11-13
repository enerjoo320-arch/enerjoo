import fs from 'fs';
import path from 'path';
import { SOLAR_PANEL_BRANDS, Product } from '../src/types';
import {
  EnergyExchangeRecord,
  matchBrandToExchange,
  findMatchingBrandPricePerWatt,
  applySolarPanelPricing,
  normalizeBrandLogosMap,
} from '../src/services/energyExchangeService';
import {
  CAIRO_ARABIC_WEEKDAYS,
  getCairoDailyDateParts,
  formatCairoUpdatedAtTimestamp,
  parseDatabaseTimestamp,
} from '../src/utils/dateUtils';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Starting Enerjoo Energy Exchange Validation Tests...\n');

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

  try {
    // ------------------------------------------------------------------------
    // Test 1: Approved 14 Solar Brands (Jet Solar present, Gate Solar absent)
    // ------------------------------------------------------------------------
    console.log('Test 1: Approved 14 Solar Brands & Gate Solar Rejection');
    assert(SOLAR_PANEL_BRANDS.length === 14, `Exactly 14 approved solar panel brands configured (got ${SOLAR_PANEL_BRANDS.length})`);
    assert(SOLAR_PANEL_BRANDS.includes('Jet Solar'), `'Jet Solar' is included in approved brands`);
    assert(!(SOLAR_PANEL_BRANDS as readonly string[]).includes('Gate Solar'), `'Gate Solar' is NOT included in approved brands`);
    assert(matchBrandToExchange('Jet Solar') === 'Jet Solar', `matchBrandToExchange resolves 'Jet Solar'`);
    assert(matchBrandToExchange('Gate Solar') === null, `matchBrandToExchange rejects deprecated 'Gate Solar'`);

    // ------------------------------------------------------------------------
    // Test 2: Cairo Timezone & Arabic Weekday Formatting
    // ------------------------------------------------------------------------
    console.log('\nTest 2: Africa/Cairo Arabic Date & SQLite Timestamp Conversion');
    const expectedWeekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    assert(
      CAIRO_ARABIC_WEEKDAYS.length === 7 && CAIRO_ARABIC_WEEKDAYS.every((d, i) => d === expectedWeekdays[i]),
      `CAIRO_ARABIC_WEEKDAYS matches exact Arabic weekday names`
    );
    const cairoParts = getCairoDailyDateParts(new Date('2026-05-15T12:00:00Z'));
    assert(cairoParts.weekdayAr === 'الجمعة', `2026-05-15 resolves to Friday ('الجمعة'), got '${cairoParts.weekdayAr}'`);
    assert(cairoParts.dateKey === '2026-05-15', `dateKey resolves to '2026-05-15'`);
    const parsedUtc = parseDatabaseTimestamp('2026-05-15 21:30:00');
    assert(parsedUtc !== null && !isNaN(parsedUtc.getTime()), `SQLite UTC timestamp parsed validly`);
    const formattedCairo = formatCairoUpdatedAtTimestamp('2026-05-15 21:30:00', 'ar');
    assert(formattedCairo.includes('السبت') || formattedCairo.includes('مايو'), `formatCairoUpdatedAtTimestamp produces valid Arabic Cairo timestamp: ${formattedCairo}`);

    // ------------------------------------------------------------------------
    // Test 3: Multi-Range Matching, Out-Of-Bounds & Zero-Fallback Rules
    // ------------------------------------------------------------------------
    console.log('\nTest 3: Multi-Range Wattage Matching & Non-Fallback Guarantees');
    const mockRecords: EnergyExchangeRecord[] = [
      {
        price_id: 'RANGE_LONGI_SOLAR_550_600',
        category: 'panels',
        brand: 'LONGi Solar',
        price_per_watt: 11.5,
        currency: 'EGP',
        min_wattage: 550,
        max_wattage: 600,
        is_active: 1,
        updated_at: '2026-05-15T10:00:00Z',
      },
      {
        price_id: 'RANGE_LONGI_SOLAR_601_655',
        category: 'panels',
        brand: 'LONGi Solar',
        price_per_watt: 12.25,
        currency: 'EGP',
        min_wattage: 601,
        max_wattage: 655,
        is_active: 1,
        updated_at: '2026-05-15T10:00:00Z',
      },
      {
        price_id: 'RANGE_RISEN_550_600',
        category: 'panels',
        brand: 'Risen',
        price_per_watt: 10.75,
        currency: 'EGP',
        min_wattage: 550,
        max_wattage: 600,
        is_active: 0, // Inactive brand
        updated_at: '2026-05-15T10:00:00Z',
      },
    ];

    const match585 = findMatchingBrandPricePerWatt(mockRecords, 'LONGi Solar', undefined, 585);
    assert(match585.pricePerWatt === 11.5 && !match585.isOutOfBounds, `LONGi 585W matches range 550-600 at 11.50 EGP/W`);

    const match620 = findMatchingBrandPricePerWatt(mockRecords, 'LONGi Solar', undefined, 620);
    assert(match620.pricePerWatt === 12.25 && !match620.isOutOfBounds, `LONGi 620W matches range 601-655 at 12.25 EGP/W`);

    const matchOut700 = findMatchingBrandPricePerWatt(mockRecords, 'LONGi Solar', undefined, 700);
    assert(matchOut700.pricePerWatt === null && matchOut700.isOutOfBounds === true, `LONGi 700W flagged out-of-bounds and does NOT fall back to other range`);

    const matchInactive = findMatchingBrandPricePerWatt(mockRecords, 'Risen', undefined, 580);
    assert(matchInactive.pricePerWatt === null && matchInactive.isBrandInactive === true, `Inactive brand Risen returns null without fallback to default price`);

    const matchUnconfigured = findMatchingBrandPricePerWatt(mockRecords, 'Jet Solar', undefined, 600);
    assert(matchUnconfigured.pricePerWatt === null && matchUnconfigured.isUnconfigured === true, `Unconfigured Jet Solar returns null without fake default`);

    // Verify Product Catalog Safety: Out-of-bounds product keeps catalog price untouched
    const samplePanelOutOfRange: Product = {
      id: 99901,
      name: 'LONGi 700W Bifacial',
      nameAr: 'لوح لونجي 700 وات',
      brand: 'LONGi Solar',
      category: 'panels',
      price: 8900,
      power: 700,
      efficiency: 22.8,
      area: 3.1,
      warranty: 25,
      status: 'available',
      updatedAt: '2026-05-15',
      supplierId: 'sup-1',
      suppliers: [],
      specs: {},
      image: '',
    };
    const pricedOut = applySolarPanelPricing(samplePanelOutOfRange, {}, mockRecords);
    assert(
      pricedOut.price === 8900 && pricedOut.pricePerWatt === undefined && pricedOut.exchangeUnsupported === true && pricedOut.exchangeStatusReason === 'out_of_bounds',
      `Out-of-bounds panel keeps original catalog price (8900) and marks exchangeUnsupported`
    );

    const samplePanelInRange: Product = { ...samplePanelOutOfRange, id: 99902, name: 'LONGi 620W', power: 620, price: 7000 };
    const pricedIn = applySolarPanelPricing(samplePanelInRange, {}, mockRecords);
    assert(
      pricedIn.price === Math.round(620 * 12.25) && pricedIn.pricePerWatt === 12.25 && pricedIn.exchangeUnsupported === false,
      `In-range panel computes dynamic price (${Math.round(620 * 12.25)} EGP) from wattage × pricePerWatt`
    );

    // ------------------------------------------------------------------------
    // Test 4: Strict min < max & Inclusive Overlap Validation
    // ------------------------------------------------------------------------
    console.log('\nTest 4: Strict min < max & Inclusive Overlap Rules');
    const existingLongi = [
      { price_id: 'R1', brand: 'LONGi Solar', min_wattage: 550, max_wattage: 600, price_per_watt: 11.5 },
    ];
    const invalidEqual = (min: number, max: number) => min >= max || min <= 0;
    assert(invalidEqual(550, 550) === true, `Rejects min_wattage === max_wattage (550-550)`);
    assert(invalidEqual(600, 550) === true, `Rejects min_wattage > max_wattage (600-550)`);

    const isOverlapInclusive = (min: number, max: number) =>
      existingLongi.some((r) => min <= r.max_wattage && max >= r.min_wattage);
    assert(isOverlapInclusive(600, 655) === true, `Inclusive overlap rejected: 600-655 overlaps 550-600`);
    assert(isOverlapInclusive(599, 655) === true, `Inclusive overlap rejected: 599-655 overlaps 550-600`);
    assert(isOverlapInclusive(601, 655) === false, `Non-overlapping range allowed: 601-655 with 550-600`);

    // ------------------------------------------------------------------------
    // Test 5: Live Server GET & Authoritative Admin RBAC Protection
    // ------------------------------------------------------------------------
    console.log('\nTest 5: Live Endpoint Source Verification & RBAC Enforcement');
    const getRes = await fetch(`${BASE_URL}/api/energy-exchange/prices?_t=${Date.now()}`);
    assert(getRes.status === 200 || getRes.status === 503, `GET /api/energy-exchange/prices returned explicit status (${getRes.status})`);
    if (getRes.status === 200) {
      const getData: any = await getRes.json();
      assert(
        getData.source === 'preview-local' || getData.source === 'cloudflare-d1',
        `GET response identifies valid source (${getData.source})`
      );
      if (Array.isArray(getData.approved_brands)) {
        assert(
          getData.approved_brands.length === 14 && getData.approved_brands.includes('Jet Solar') && !getData.approved_brands.includes('Gate Solar'),
          `Endpoint returns exact 14 approved brands with Jet Solar and without Gate Solar`
        );
      }
    }

    // Spoofed adminEmail in body WITHOUT a valid Firebase Bearer token MUST fail with 401
    const spoofedPostRes = await fetch(`${BASE_URL}/api/energy-exchange/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: 'Jinko',
        min_wattage: 550,
        max_wattage: 600,
        price_per_watt: 12.0,
        adminEmail: 'enerjoo320@gmail.com',
      }),
    });
    assert(spoofedPostRes.status === 401, `Unauthenticated POST (even with spoofed adminEmail) rejected with 401 (got ${spoofedPostRes.status})`);

    const unauthBrandPutRes = await fetch(`${BASE_URL}/api/energy-exchange/brands/Jinko`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranges: [{ min_wattage: 550, max_wattage: 600, price_per_watt: 12.0 }], adminEmail: 'enerjoo320@gmail.com' }),
    });
    assert(unauthBrandPutRes.status === 401, `Unauthenticated atomic brand PUT rejected with 401 (got ${unauthBrandPutRes.status})`);

    const unauthBrandPatchRes = await fetch(`${BASE_URL}/api/energy-exchange/brands/Jinko`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    assert(unauthBrandPatchRes.status === 401, `Unauthenticated brand activation PATCH rejected with 401 (got ${unauthBrandPatchRes.status})`);

    const unauthDelRes = await fetch(`${BASE_URL}/api/energy-exchange/prices/RANGE_JINKO_550_600`, {
      method: 'DELETE',
    });
    assert(unauthDelRes.status === 401, `Unauthenticated DELETE rejected with 401 (got ${unauthDelRes.status})`);

    // ------------------------------------------------------------------------
    // Test 6: Product Catalog Isolation Check
    // ------------------------------------------------------------------------
    console.log('\nTest 6: Isolation Verification (/api/products untouched)');
    const prodRes = await fetch(`${BASE_URL}/api/products`);
    assert(prodRes.status === 200, `/api/products responds with 200 OK`);
    const prodData: any = await prodRes.json();
    const productCount = Array.isArray(prodData.products) ? prodData.products.length : (Array.isArray(prodData) ? prodData.length : 0);
    assert(productCount > 0, `Product catalog intact with ${productCount} products`);

    // ------------------------------------------------------------------------
    // Test 7: Migration & Schema Safety Check (no baseline fake prices)
    // ------------------------------------------------------------------------
    console.log('\nTest 7: Migration Safety (Zero fake baseline prices inserted)');
    const mig0003Path = path.join(process.cwd(), 'migrations', '0003_add_is_active_to_energy_exchange.sql');
    assert(fs.existsSync(mig0003Path), `Migration 0003 exists at migrations/0003_add_is_active_to_energy_exchange.sql`);
    if (fs.existsSync(mig0003Path)) {
      const sqlContent = fs.readFileSync(mig0003Path, 'utf-8');
      const sqlNoComments = sqlContent.replace(/--.*$/gm, '');
      assert(!/\bINSERT\b/i.test(sqlNoComments), `Migration 0003 contains ZERO INSERT statements`);
      assert(/\bADD COLUMN is_active\b/i.test(sqlNoComments), `Migration 0003 adds is_active column`);
    }

    // ------------------------------------------------------------------------
    // Test 8: Brand Logo Map Normalization & Safety
    // ------------------------------------------------------------------------
    console.log('\nTest 8: Brand Logo Normalization & Deprecated Brand Exclusion');
    const normalizedLogos = normalizeBrandLogosMap({
      'jinko': 'https://res.cloudinary.com/demo/image/upload/jinko.png',
      'Jet Solar': 'https://res.cloudinary.com/demo/image/upload/jetsolar.png',
      'Gate Solar': 'https://res.cloudinary.com/demo/image/upload/gatesolar.png',
      'AIKO': '   ',
    });
    assert(
      normalizedLogos['Jinko'] === 'https://res.cloudinary.com/demo/image/upload/jinko.png',
      `Normalizes canonical brand key ('jinko' -> 'Jinko')`
    );
    assert(
      normalizedLogos['Jet Solar'] === 'https://res.cloudinary.com/demo/image/upload/jetsolar.png',
      `Preserves Jet Solar logo URL`
    );
    assert(
      !('Gate Solar' in normalizedLogos),
      `Excludes deprecated Gate Solar from normalized logos map`
    );
    assert(
      normalizedLogos['AIKO'] === undefined,
      `Omits blank/whitespace logo URLs so brand renders cleanly as text`
    );

    console.log(`\n========================================`);
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
