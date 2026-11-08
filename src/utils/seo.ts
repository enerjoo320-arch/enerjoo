/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';

export const BASE_SITE_URL = 'https://enerjoo.com';

export const DEFAULT_SITE_TITLE = 'Enerjoo | عالم الطاقة بين يديك';
export const DEFAULT_SITE_DESCRIPTION =
  'قارن، اختار، واشتري بثقة. تابع حركة الأسعار من خلال بورصة الطاقة، واستعين بالذكاء الاصطناعي للوصول للحل المناسب لنظامك اكتشف منتجات الطاقة الشمسية بأفضل الأسعار. ثقة • شفافية • سرعة • أسعار تنافسية.';
export const DEFAULT_SITE_IMAGE = `${BASE_SITE_URL}/brand-thumbnail.png`;

const CATEGORY_NAMES_AR: Record<string, string> = {
  panels: 'ألواح شمسية',
  inverters: 'محولات طاقة (إنفرتر)',
  batteries: 'بطاريات طاقة شمسية',
  pumps: 'طلمبات شمسية',
  mounting: 'شاسيهات وهياكل تثبيت',
  protection: 'لوحات وقواطع حماية',
  combiner: 'صناديق تجميع (Combiner Box)',
  cables: 'كابلات طاقة شمسية',
  mc4: 'وصلات MC4',
  sealings: 'مواد عزل وتثبيت',
  clamps: 'كلبسات تثبيت',
  all: 'معدات طاقة شمسية'
};

const CATEGORY_NAMES_EN: Record<string, string> = {
  panels: 'Solar Panels',
  inverters: 'Solar Inverters',
  batteries: 'Solar Batteries',
  pumps: 'Solar Pumps',
  mounting: 'Mounting Structures',
  protection: 'Protection Devices',
  combiner: 'Combiner Boxes',
  cables: 'Solar Cables',
  mc4: 'MC4 Connectors',
  sealings: 'Sealings',
  clamps: 'Mounting Clamps',
  all: 'Solar Equipment'
};

/**
 * Builds factual SEO metadata for a product using strictly existing source attributes.
 * Never invents nonexistent prices, specifications, or stock data.
 */
export function buildProductSeoData(product: Product, lang: 'ar' | 'en' = 'ar') {
  const isAr = lang === 'ar';
  const name = (isAr ? product.nameAr : product.name) || product.nameAr || product.name || `منتج ${product.id}`;
  const brand = product.brand ? product.brand.trim() : '';
  const categoryKey = product.category || 'all';
  const categoryLabel = isAr
    ? (CATEGORY_NAMES_AR[categoryKey] || categoryKey)
    : (CATEGORY_NAMES_EN[categoryKey] || categoryKey);

  // Title: 40-60 characters, brand-focused
  const title = brand
    ? `${name} - ${brand} | Enerjoo`
    : `${name} | Enerjoo`;

  // Fact-based description using only real attributes present on product
  const specDetails: string[] = [];
  if (product.power && product.power > 0) {
    if (product.category === 'inverters') {
      specDetails.push(isAr ? `قدرة ${product.power} ك.و` : `${product.power}kW`);
    } else {
      specDetails.push(isAr ? `قدرة ${product.power} وات` : `${product.power}W`);
    }
  }

  if (product.hp) {
    specDetails.push(isAr ? `قدرة ${product.hp} حصان` : `${product.hp} HP`);
  }

  if (product.efficiency && product.efficiency > 0) {
    specDetails.push(isAr ? `كفاءة ${product.efficiency}%` : `${product.efficiency}% efficiency`);
  }

  if (product.warranty && product.warranty > 0) {
    specDetails.push(isAr ? `ضمان ${product.warranty} سنة` : `${product.warranty} years warranty`);
  }

  const specsText = specDetails.length > 0 ? ` (${specDetails.join(' • ')})` : '';
  
  let description = '';
  if (product.description && product.description.trim()) {
    description = product.description.trim();
  } else if (isAr) {
    description = `${name} من ماركة ${brand || 'معتمدة'} ضمن فئة ${categoryLabel}${specsText}. متاح للمقارنة والشراء عبر منصة Enerjoo للطاقة الشمسية في مصر.`;
  } else {
    description = `${name} by ${brand || 'Enerjoo Verified'} under ${categoryLabel}${specsText}. Available for comparison and procurement on Enerjoo solar platform in Egypt.`;
  }

  // Canonical URL
  const canonicalUrl = `${BASE_SITE_URL}/product/${encodeURIComponent(String(product.id))}`;
  const imageUrl = product.image_url || product.image || DEFAULT_SITE_IMAGE;

  // Schema.org Product structured data (strictly reflecting source data)
  const schemaOrgProduct: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonicalUrl}#product`,
    name,
    category: categoryLabel,
    image: imageUrl,
    description: description.slice(0, 300),
    sku: String(product.id),
  };

  if (brand) {
    schemaOrgProduct.brand = {
      '@type': 'Brand',
      name: brand
    };
  }

  // Only include price and offer if valid positive price exists in source
  if (typeof product.price === 'number' && product.price > 0) {
    const offer: Record<string, any> = {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'EGP',
      price: product.price,
      itemCondition: 'https://schema.org/NewCondition'
    };

    if (product.status === 'available') {
      offer.availability = 'https://schema.org/InStock';
    } else if (product.status === 'out_of_stock') {
      offer.availability = 'https://schema.org/OutOfStock';
    } else if (product.status === 'limited') {
      offer.availability = 'https://schema.org/LimitedAvailability';
    }

    schemaOrgProduct.offers = offer;
  }

  return {
    title,
    description,
    canonicalUrl,
    imageUrl,
    schemaOrgProduct
  };
}

/**
 * Updates DOM head tags dynamically in the browser (client-side) for SPA transitions.
 * Returns a teardown function to restore default site metadata on unmount.
 */
export function applyProductSeo(product: Product, lang: 'ar' | 'en' = 'ar'): () => void {
  if (typeof document === 'undefined') return () => {};

  const { title, description, canonicalUrl, imageUrl, schemaOrgProduct } = buildProductSeoData(product, lang);

  // 1. Update Title
  const previousTitle = document.title;
  document.title = title;

  // 2. Helper to set or create meta tag
  const setMeta = (attribute: 'name' | 'property', key: string, content: string) => {
    let el = document.querySelector(`meta[${attribute}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attribute, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  // 3. Helper to set or create link tag
  const setLink = (rel: string, href: string) => {
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  };

  // 4. Update Meta Tags
  setMeta('name', 'description', description);
  setLink('canonical', canonicalUrl);

  // Open Graph
  setMeta('property', 'og:type', 'product');
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:image', imageUrl);

  // Twitter
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:url', canonicalUrl);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', imageUrl);

  // 5. Inject JSON-LD Structured Data
  let scriptEl = document.getElementById('enerjoo-product-schema') as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = 'enerjoo-product-schema';
    scriptEl.type = 'application/ld+json';
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(schemaOrgProduct, null, 2);

  // Cleanup: restore default site metadata on unmount
  return () => {
    document.title = DEFAULT_SITE_TITLE;
    setMeta('name', 'description', DEFAULT_SITE_DESCRIPTION);
    setLink('canonical', BASE_SITE_URL);

    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', BASE_SITE_URL);
    setMeta('property', 'og:title', DEFAULT_SITE_TITLE);
    setMeta('property', 'og:description', DEFAULT_SITE_DESCRIPTION);
    setMeta('property', 'og:image', DEFAULT_SITE_IMAGE);

    setMeta('name', 'twitter:title', DEFAULT_SITE_TITLE);
    setMeta('name', 'twitter:description', DEFAULT_SITE_DESCRIPTION);
    setMeta('name', 'twitter:image', DEFAULT_SITE_IMAGE);

    const oldScript = document.getElementById('enerjoo-product-schema');
    if (oldScript && oldScript.parentNode) {
      oldScript.parentNode.removeChild(oldScript);
    }
  };
}
