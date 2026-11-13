// Vercel Serverless Proxy: /api/energy-exchange/*
// Pure pass-through to Cloudflare Worker + Cloudflare D1 (Single Source of Truth).
// Never serves fake/default prices, never trusts body-based auth, and never writes to `products`.

const CF_WORKER_API = 'https://enerjoo-api.enerjoo320.workers.dev';

const ALLOWED_EXCHANGE_ORIGINS = new Set([
  'https://enerjoo.com',
  'https://www.enerjoo.com',
  'https://enerjoo.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
]);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  const lower = origin.toLowerCase().trim();
  if (ALLOWED_EXCHANGE_ORIGINS.has(lower)) return true;
  if (/^https:\/\/[a-z0-9-]+\.enerjoo\.com$/.test(lower)) return true;
  if (/^https:\/\/ais-(?:dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(lower)) return true;
  return false;
}

function setProxyHeaders(req: any, res: any) {
  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
  res.setHeader('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-Auth, X-Requested-With, Accept');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

export default async function handler(req: any, res: any) {
  setProxyHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawUrl = typeof req.url === 'string' ? req.url : '/api/energy-exchange/prices';
  const [pathname, search] = rawUrl.split('?');
  const workerPath = pathname.replace(/^\/api/, '') || '/energy-exchange/prices';
  const targetUrl = `${CF_WORKER_API}${workerPath}${search ? `?${search}` : ''}`;

  const authHeader =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.['x-firebase-auth'] ||
    req.headers?.['X-Firebase-Auth'];

  const forwardHeaders: Record<string, string> = {
    Origin: 'https://enerjoo.com',
    Accept: 'application/json',
  };

  if (typeof authHeader === 'string' && authHeader.trim()) {
    forwardHeaders['Authorization'] = authHeader.trim();
  }

  const method = (req.method || 'GET').toUpperCase();
  const fetchInit: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(8000),
  };

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && req.body !== undefined) {
    forwardHeaders['Content-Type'] = 'application/json';
    fetchInit.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const cfRes = await fetch(targetUrl, fetchInit);
    const text = await cfRes.text();
    res
      .status(cfRes.status)
      .setHeader('Content-Type', cfRes.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err: any) {
    return res.status(503).json({
      success: false,
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'تعذر الاتصال بخادم بورصة الطاقة السحابي (Cloudflare D1). يرجى المحاولة لاحقاً.',
      },
    });
  }
}
