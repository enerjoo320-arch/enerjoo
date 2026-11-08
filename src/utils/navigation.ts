/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Category, Product, ViewType } from '../types';

export interface AppNavState {
  view: ViewType;
  section?: 'home' | 'products';
  productId?: string | number | null;
  category?: Category;
  supplierFilterId?: string | number | null;
  fromView?: ViewType;
  step: number;
}

const VALID_VIEWS: ViewType[] = [
  'home',
  'compare',
  'add',
  'admin-suppliers',
  'admin-requests',
  'customer-requests',
  'login',
  'register',
  'supplier-dashboard',
  'profile',
  'wishlist',
  'calculator',
  'products',
  'exchange'
];

/**
 * Parses pathname and search parameters into a normalized AppNavState.
 */
export function parseUrlToNavState(pathname: string, search: string): AppNavState {
  const params = new URLSearchParams(search);
  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  // 1. Product Detail: /product/:id or /products/:id or ?product=:id
  const productMatch = cleanPath.match(/^\/(?:product|products)\/([^/?#]+)$/i);
  if (productMatch) {
    const rawId = decodeURIComponent(productMatch[1]);
    const cat = (params.get('category') as Category) || 'all';
    return {
      view: 'home',
      section: 'products',
      productId: rawId,
      category: cat,
      step: 2
    };
  }

  const queryProductId = params.get('product') || params.get('productId');
  if (queryProductId) {
    const cat = (params.get('category') as Category) || 'all';
    return {
      view: 'home',
      section: 'products',
      productId: queryProductId,
      category: cat,
      step: 2
    };
  }

  // 2. Energy Exchange: /exchange or /market or /bourse
  if (cleanPath === '/exchange' || cleanPath === '/market' || cleanPath === '/bourse') {
    return {
      view: 'exchange',
      section: undefined,
      productId: null,
      step: 1
    };
  }

  // 3. Products listing: /products or with category query
  if (cleanPath === '/products' || params.has('category')) {
    const category = (params.get('category') as Category) || 'all';
    const supplier = params.get('supplier') || null;
    return {
      view: 'home',
      section: 'products',
      productId: null,
      category,
      supplierFilterId: supplier,
      step: 1
    };
  }

  // 3. Specific Views (/calculator, /compare, /wishlist, /profile, /login, etc.)
  const pathView = cleanPath.replace(/^\//, '') as ViewType;
  if (VALID_VIEWS.includes(pathView) && pathView !== 'home') {
    return {
      view: pathView,
      section: undefined,
      productId: null,
      step: 1
    };
  }

  // 4. Default: Home
  return {
    view: 'home',
    section: 'home',
    productId: null,
    category: 'all',
    supplierFilterId: null,
    step: 0
  };
}

/**
 * Builds a canonical URL for a given AppNavState.
 */
export function navStateToUrl(state: AppNavState): string {
  if (state.productId) {
    return `/product/${encodeURIComponent(state.productId)}`;
  }

  if (state.view === 'home') {
    if (state.section === 'products' || (state.category && state.category !== 'all') || state.supplierFilterId) {
      const params = new URLSearchParams();
      if (state.category && state.category !== 'all') {
        params.set('category', state.category);
      }
      if (state.supplierFilterId) {
        params.set('supplier', String(state.supplierFilterId));
      }
      const qs = params.toString();
      return qs ? `/products?${qs}` : '/products';
    }
    return '/';
  }

  return `/${state.view}`;
}
