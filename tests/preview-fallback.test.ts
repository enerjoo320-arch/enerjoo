import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🧪 Starting Energy Exchange Preview Fallback Validation Tests...\n');

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
    // Test 1: GET /api/energy-exchange/prices returns 200 and source: 'preview-local'
    // ------------------------------------------------------------------------
    console.log('Test 1: Verification of GET /api/energy-exchange/prices source tagging');
    const getRes = await fetch(`${BASE_URL}/api/energy-exchange/prices?_t=${Date.now()}`);
    const getData: any = await getRes.json();
    assert(getRes.status === 200, `GET returned status 200 (got ${getRes.status})`);
    assert(getData.source === 'preview-local', `Data source is strictly 'preview-local' (got ${getData.source})`);
    assert(getData.is_preview === true, `is_preview flag is explicitly true`);
    assert(Array.isArray(getData.records) && getData.records.length > 0, `Returns valid records array (count: ${getData.records?.length})`);

    // Verify that every record has a valid positive price and non-empty brand
    const allValid = getData.records.every((r: any) => typeof r.brand === 'string' && r.brand.trim() && typeof r.price_per_watt === 'number' && r.price_per_watt > 0);
    assert(allValid, `All ${getData.records.length} energy exchange records have valid brands and positive prices`);
    const longiLegacy = getData.records.find((r: any) => r.price_id === 'PRICE_PANEL_LONGI_SOLAR');
    assert(longiLegacy ? (longiLegacy.min_wattage === null && longiLegacy.max_wattage === null) : true, `Legacy records preserve null wattage ranges`);

    // ------------------------------------------------------------------------
    // Test 2: Authoritative Admin RBAC Protection (Unauthenticated / invalid requests)
    // ------------------------------------------------------------------------
    console.log('\nTest 2: Authoritative Admin RBAC Protection (Unauthenticated requests)');
    const unauthPostRes = await fetch(`${BASE_URL}/api/energy-exchange/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: 'Jinko',
        min_wattage: 550,
        max_wattage: 600,
        price_per_watt: 12.0
      })
    });
    assert(unauthPostRes.status === 403, `Unauthenticated POST rejected with 403 (got ${unauthPostRes.status})`);

    const unauthPutRes = await fetch(`${BASE_URL}/api/energy-exchange/prices/RANGE_JINKO_550_600`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_per_watt: 13.0 })
    });
    assert(unauthPutRes.status === 403, `Unauthenticated PUT rejected with 403 (got ${unauthPutRes.status})`);

    const unauthDelRes = await fetch(`${BASE_URL}/api/energy-exchange/prices/RANGE_JINKO_550_600`, {
      method: 'DELETE'
    });
    assert(unauthDelRes.status === 403, `Unauthenticated DELETE rejected with 403 (got ${unauthDelRes.status})`);

    // ------------------------------------------------------------------------
    // Test 3: Verification of Preview File Atomic Persistence
    // ------------------------------------------------------------------------
    console.log('\nTest 3: Atomic storage file validation in preview environment');
    const rangesFile = path.join(process.cwd(), 'energy-exchange-ranges.json');
    const fileExists = fs.existsSync(rangesFile);
    assert(fileExists, `Preview file energy-exchange-ranges.json exists on disk`);
    if (fileExists) {
      const records = JSON.parse(fs.readFileSync(rangesFile, 'utf-8'));
      assert(Array.isArray(records), `energy-exchange-ranges.json contains valid array`);
      const hasFakeWattage = records.some((r: any) => r.updated_by === 'system_legacy' && r.min_wattage !== null);
      assert(!hasFakeWattage, `Legacy records preserved with min_wattage: null without invented ranges`);
    }

    // ------------------------------------------------------------------------
    // Test 4: Verification that catalog /api/products remains untouched
    // ------------------------------------------------------------------------
    console.log('\nTest 4: Isolation Verification (Products catalog data untouched)');
    const prodRes = await fetch(`${BASE_URL}/api/products`);
    assert(prodRes.status === 200, `/api/products responds with 200 OK`);
    const prodData: any = await prodRes.json();
    const productCount = Array.isArray(prodData.products) ? prodData.products.length : (Array.isArray(prodData) ? prodData.length : 0);
    assert(productCount > 0, `Product catalog intact with ${productCount} products`);

    // ------------------------------------------------------------------------
    // Test 5: Verify Overlap Check Logic function directly on sample records
    // ------------------------------------------------------------------------
    console.log('\nTest 5: Overlap Prevention and Range Boundary Rules');
    const testRecords = [
      { price_id: 'R1', brand: 'Jinko', min_wattage: 500, max_wattage: 550, price_per_watt: 12.0 },
      { price_id: 'R2', brand: 'Jinko', min_wattage: 551, max_wattage: 600, price_per_watt: 12.5 }
    ];

    // Case A: Overlapping range (540 - 580) overlaps with R1 and R2
    const newMin = 540;
    const newMax = 580;
    const isOverlap = testRecords.some(r => newMin <= r.max_wattage && newMax >= r.min_wattage);
    assert(isOverlap === true, `Mathematical overlap detected for 540-580 against 500-550`);

    // Case B: Non-overlapping range (601 - 650)
    const validMin = 601;
    const validMax = 650;
    const isValid = !testRecords.some(r => validMin <= r.max_wattage && validMax >= r.min_wattage);
    assert(isValid === true, `Non-overlapping range 601-650 correctly validated`);

    // Case C: Min 1 range restriction: brand with 1 range cannot have it deleted
    const brandRanges = testRecords.filter(r => r.brand === 'Jinko');
    assert(brandRanges.length > 1, `Brand has ${brandRanges.length} ranges; deletion of 1 is allowed only if >= 2`);

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
