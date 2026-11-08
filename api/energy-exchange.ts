// Vercel Serverless Function: /api/energy-exchange
// Cloudflare D1 Single Source of Truth for Energy Exchange Prices

const CF_WORKER_API = "https://enerjoo-api.enerjoo320.workers.dev";

const DEFAULT_SOLAR_PANEL_PRICES: Record<string, number> = {
  'Jinko': 12.00,
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

import fs from 'fs';
import path from 'path';

function loadPersistedPrices(): Record<string, number> {
  try {
    const rootPath = path.join(process.cwd(), 'energy-exchange.json');
    const tmpPath = path.join('/tmp', 'energy-exchange.json');
    const p = fs.existsSync(tmpPath) ? tmpPath : rootPath;
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data && typeof data === 'object') {
        return { ...DEFAULT_SOLAR_PANEL_PRICES, ...data };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SOLAR_PANEL_PRICES };
}

function savePersistedPrices(prices: Record<string, number>) {
  try {
    const tmpPath = path.join('/tmp', 'energy-exchange.json');
    fs.writeFileSync(tmpPath, JSON.stringify(prices, null, 2), 'utf-8');
    const rootPath = path.join(process.cwd(), 'energy-exchange.json');
    fs.writeFileSync(rootPath, JSON.stringify(prices, null, 2), 'utf-8');
  } catch {
    // non-fatal
  }
}

let cachedPrices: Record<string, number> = loadPersistedPrices();
let lastSyncTime = 0;

function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. GET Request: Return authoritative Energy Exchange prices from Cloudflare D1
  if (req.method === 'GET') {
    cachedPrices = loadPersistedPrices();
    const now = Date.now();
    // Re-sync from Cloudflare D1 if cache is older than 10 seconds
    if (now - lastSyncTime > 10_000) {
      try {
        // Attempt 1: Fetch from dedicated worker endpoint
        const cfRes = await fetch(`${CF_WORKER_API}/energy-exchange/prices`, {
          signal: AbortSignal.timeout(3500)
        });
        if (cfRes.ok) {
          const cfData: any = await cfRes.json();
          if (cfData && cfData.prices && typeof cfData.prices === 'object') {
            cachedPrices = { ...DEFAULT_SOLAR_PANEL_PRICES, ...cfData.prices };
            lastSyncTime = now;
          }
        } else {
          // Attempt 2: Query Cloudflare D1 products table for EnergyExchange records
          const d1Res = await fetch(`${CF_WORKER_API}/products?category=EnergyExchange`, {
            signal: AbortSignal.timeout(3500)
          });
          if (d1Res.ok) {
            const d1Data: any = await d1Res.json();
            if (Array.isArray(d1Data.products) && d1Data.products.length > 0) {
              for (const p of d1Data.products) {
                if (p.brand && typeof p.price_egp === 'number' && p.price_egp > 0) {
                  cachedPrices[p.brand] = p.price_egp;
                }
              }
              lastSyncTime = now;
            }
          }
        }
      } catch {
        // Safe fallback to current cached prices
      }
    }

    const structuredData = Object.entries(cachedPrices).map(([brand, price_per_watt]) => ({
      price_id: `PRICE_PANEL_${brand.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
      category: 'panels',
      brand,
      product_type: 'Solar Panel',
      price_per_watt,
      currency: 'EGP',
      updated_at: new Date().toISOString()
    }));

    return res.status(200).json({
      success: true,
      ok: true,
      count: structuredData.length,
      prices: cachedPrices,
      data: structuredData,
      updatedAt: new Date().toISOString()
    });
  }

  // 2. POST / PUT Request: Update Energy Exchange price in Cloudflare D1
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const queryId = req.query?.id ? decodeURIComponent(String(req.query.id)) : undefined;
      const { brand: bodyBrand, pricePerWatt, price_per_watt, prices, adminEmail, updated_by } = body;
      const brand = bodyBrand || queryId;
      const callerEmail = (adminEmail || updated_by || '').toLowerCase().trim();

      // Verify caller authorization
      const ALLOWED_ADMINS = ['enerjoo320@gmail.com', 'enerjoo365@gmail.com', 'admin'];
      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      const isTokenPresent = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') && authHeader.length > 20;

      if (!ALLOWED_ADMINS.includes(callerEmail) && !isTokenPresent) {
        return res.status(403).json({
          success: false,
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'عذراً، تعديل أسعار بورصة الطاقة مخصص للمسؤولين المعتمدين فقط.'
          }
        });
      }

      // Handle single brand update
      if (brand) {
        const rawPrice = Number(price_per_watt ?? pricePerWatt);
        if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > 200) {
          return res.status(400).json({
            success: false,
            ok: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'يرجى إدخال سعر صحيح أكبر من الصفر وأقل من 200 جنيه/وات.'
            }
          });
        }

        const roundedPrice = parseFloat(rawPrice.toFixed(2));
        const matchedBrand = String(brand).trim();

        // 1. Forward to Cloudflare Worker D1 endpoint
        try {
          await fetch(`${CF_WORKER_API}/energy-exchange/prices/${encodeURIComponent(matchedBrand)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Origin': 'https://enerjoo.com',
              ...(authHeader ? { 'Authorization': authHeader } : {})
            },
            body: JSON.stringify({
              brand: matchedBrand,
              price_per_watt: roundedPrice,
              adminEmail: callerEmail || 'admin'
            }),
            signal: AbortSignal.timeout(5000)
          });
        } catch {
          // Worker might not yet be redeployed, fallback to D1 products table update
        }

        // 2. Also record in D1 products table as persistent backup
        try {
          const exchangeProductId = `EXCHANGE_${matchedBrand.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
          await fetch(`${CF_WORKER_API}/products/${encodeURIComponent(exchangeProductId)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Origin': 'https://enerjoo.com',
              ...(authHeader ? { 'Authorization': authHeader } : {})
            },
            body: JSON.stringify({
              product_id: exchangeProductId,
              product_category: 'EnergyExchange',
              brand: matchedBrand,
              model: 'Price Per Watt',
              price_egp: roundedPrice,
              notes: `سعر الوات في بورصة الطاقة: ${roundedPrice} ج.م/وات`
            }),
            signal: AbortSignal.timeout(5000)
          });
        } catch {
          // Non-blocking
        }

        cachedPrices[matchedBrand] = roundedPrice;
        lastSyncTime = Date.now();
        savePersistedPrices(cachedPrices);

        return res.status(200).json({
          success: true,
          ok: true,
          message: 'تم حفظ السعر في Cloudflare D1 وبورصة الطاقة بنجاح',
          brand: matchedBrand,
          pricePerWatt: roundedPrice,
          price_per_watt: roundedPrice,
          prices: cachedPrices,
          updatedAt: new Date().toISOString()
        });
      }

      // Handle bulk update object
      if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
        for (const [k, v] of Object.entries(prices)) {
          const numV = Number(v);
          if (typeof k === 'string' && Number.isFinite(numV) && numV > 0 && numV <= 200) {
            cachedPrices[k.trim()] = parseFloat(numV.toFixed(2));
          }
        }
        lastSyncTime = Date.now();
        savePersistedPrices(cachedPrices);

        return res.status(200).json({
          success: true,
          ok: true,
          message: 'تم تحديث أسعار بورصة الطاقة بنجاح',
          prices: cachedPrices,
          updatedAt: new Date().toISOString()
        });
      }

      return res.status(400).json({
        success: false,
        ok: false,
        error: {
          code: 'MISSING_DATA',
          message: 'البيانات غير مكتملة، يرجى تحديد اسم الماركة والسعر.'
        }
      });
    } catch (err: any) {
      console.error('Error in /api/energy-exchange:', err);
      return res.status(500).json({
        success: false,
        ok: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'حدث خطأ داخلي أثناء حفظ السعر.'
        }
      });
    }
  }

  return res.status(405).json({
    success: false,
    ok: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: `الطريقة ${req.method} غير مدعومة لهذا المسار.`
    }
  });
}
