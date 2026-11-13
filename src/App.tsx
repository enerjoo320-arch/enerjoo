/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Sparkles, ShieldCheck, LogIn, ChevronLeft, ChevronRight, Sun, Zap, Battery, Wrench, Calculator, AlertTriangle, X, Loader2, TrendingUp } from 'lucide-react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { ProductCard } from './components/ProductCard';
import { ProductDetail } from './components/ProductDetail';
import { BottomNav } from './components/BottomNav';
import { CompareView } from './components/CompareView';
import { AddProductView } from './components/AddProductView';
import { LoginView } from './components/LoginView';
import { RegisterView } from './components/RegisterView';
import { SupplierDashboard } from './components/SupplierDashboard';
import { AdminSupplierManagement } from './components/AdminSupplierManagement';
import { AdvancedSearchPanel } from './components/AdvancedSearchPanel';
import { SolarCalculator } from './components/SolarCalculator';
import { ProfileView } from './components/ProfileView';
import { AdminSolarRequests } from './components/AdminSolarRequests';
import { CustomerRequestsView } from './components/CustomerRequestsView';
import { EnergyExchange } from './components/EnergyExchange';
import EnerjooAIChat from './components/EnerjooAIChat';
import { useAuth } from './context/AuthContext';
import { 
  subscribeToProducts, 
  subscribeToSuppliers, 
  seedInitialData,
  addProduct,
  updateProduct,
  deleteProduct,
  toggleSupplierVerification,
  getInitialLocalProducts,
  deduplicateProducts,
  getCanonicalProductId
} from './services/firestoreService';
import { 
  getInitialExchangePrices, 
  getInitialExchangeRecords,
  subscribeToEnergyExchange, 
  applySolarPanelPricingToProducts,
  EnergyExchangeRecord
} from './services/energyExchangeService';
import { InverterFilterCriteria } from './types/inverter';
import { classifyInverter } from './utils/inverterClassification';
import { performSemanticSearch, SemanticSearchResult } from './services/geminiService';
import { calculateRelevanceScore, hybridSort } from './utils/searchUtils';
import { getSupplierDisplayName, getSupplierAvatarInitial } from './utils/supplierUtils';
import { Product, Supplier, ViewType, Filters, AdvancedFilters } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { translations } from './translations';
import { auth } from './lib/firebase';
import { safeLocalStorage } from './utils/safeStorage';
import { CUSTOMER_SERVICE_PHONE_DISPLAY, getCustomerServiceWhatsAppUrl, SUPPLIER_CONTACT_PHONE_DISPLAY, getSupplierWhatsAppUrl } from './constants/contact';
import { AppNavState, parseUrlToNavState, navStateToUrl } from './utils/navigation';

export default function App() {
  const { user, logout, loading: authLoading } = useAuth();
  
  // Default consistently to Arabic with safe storage fallback
  const [lang, setLang] = useState<'ar' | 'en'>(() => {
    const saved = safeLocalStorage.getItem('enerjoo_lang');
    return (saved === 'ar' || saved === 'en') ? saved : 'ar';
  });

  // Parse initial browser URL to support direct links, deep linking, and initial history state
  const initialNav = useMemo(() => {
    return parseUrlToNavState(window.location.pathname, window.location.search);
  }, []);

  const [view, setView] = useState<ViewType>(initialNav.view);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [exchangePrices, setExchangePrices] = useState<Record<string, number>>(getInitialExchangePrices);
  const [exchangeRecords, setExchangeRecords] = useState<EnergyExchangeRecord[]>(getInitialExchangeRecords);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const setProducts = setRawProducts;
  const products = useMemo(() => {
    const uniqueRaw = deduplicateProducts(rawProducts);
    return applySolarPanelPricingToProducts(uniqueRaw, exchangePrices, exchangeRecords);
  }, [rawProducts, exchangePrices, exchangeRecords]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [pendingProductId, setPendingProductId] = useState<string | number | null>(initialNav.productId || null);
  const [homeSection, setHomeSection] = useState<'home' | 'products'>(initialNav.section || 'home');
  const [compareList, setCompareList] = useState<Product[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);

  // Navigation and browser history synchronization refs
  const isHandlingPopState = useRef(false);
  const historyStepRef = useRef(initialNav.step || 0);
  
  // Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [useAiSearch, setUseAiSearch] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  
  // Filter States
  const [activeFilters, setActiveFilters] = useState<Filters>({
    category: initialNav.category || 'all',
    sort: 'power'
  });
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    minPower: '', maxPower: '', minPrice: '', maxPrice: '', minEfficiency: '', brand: 'all'
  });
  const [inverterFilters, setInverterFilters] = useState<InverterFilterCriteria>({
    type: 'all',
    phase: 'all',
    powerRange: 'all',
    application: 'all',
    batterySupport: 'all'
  });
  
  // Supplier/Admin Management States
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilterId, setAdminFilterId] = useState<string | number | null>(null);
  const [supplierFilterId, setSupplierFilterId] = useState<string | number | null>(initialNav.supplierFilterId || null);

  // One-time cleanup of legacy product cache keys without affecting auth, cart, or user session
  useEffect(() => {
    const staleKeys = [
      'enerjoo_cached_products',
      'enerjoo_products',
      'enerjoo_mock_products',
      'cached_products'
    ];
    for (const key of staleKeys) {
      safeLocalStorage.removeItem(key);
      try {
        sessionStorage.removeItem(key);
      } catch {}
    }
  }, []);

  // Ensure authenticated users on the login view are routed according to their resolved role,
  // and clear any admin-only filter when a supplier logs in.
  useEffect(() => {
    if (authLoading || !user) return;
    if (user.type === 'supplier' && adminFilterId !== null) {
      setAdminFilterId(null);
    }
    if (view === 'login') {
      navigateToView(user.type === 'supplier' ? 'supplier-dashboard' : 'home');
    }
  }, [authLoading, user, view, adminFilterId]);

  // Initialize initial browser history state if not present (step: 0)
  useEffect(() => {
    if (!window.history.state || typeof window.history.state.step !== 'number') {
      const canonicalState: AppNavState = {
        view: initialNav.view,
        section: initialNav.section,
        productId: initialNav.productId,
        category: initialNav.category || 'all',
        supplierFilterId: initialNav.supplierFilterId,
        step: 0
      };
      window.history.replaceState(canonicalState, '', window.location.pathname + window.location.search);
    }
    if (initialNav.productId) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } else if (initialNav.section === 'products') {
      setTimeout(() => {
        const el = document.getElementById('products-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, [initialNav]);

  // Synchronize pending product once products are fetched from Firestore
  useEffect(() => {
    if (pendingProductId && products.length > 0) {
      const found = products.find(p => p.id.toString() === pendingProductId.toString());
      if (found) {
        setSelectedProduct(found);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    }
  }, [pendingProductId, products]);

  // Global listener for opening real catalog products from AI agent recommendations
  useEffect(() => {
    const handleOpenProduct = (e: any) => {
      const pId = e.detail?.productId;
      if (pId) {
        setPendingProductId(String(pId));
        const found = products.find(p => p.id.toString() === String(pId));
        if (found) {
          setSelectedProduct(found);
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
      }
    };
    window.addEventListener('open-product-details', handleOpenProduct);
    return () => window.removeEventListener('open-product-details', handleOpenProduct);
  }, [products]);

  // Navigation handlers with clean History API pushState
  const navigateToView = (newView: ViewType) => {
    if (newView === 'products') {
      setSelectedProduct(null);
      setPendingProductId(null);
      setView('home');
      setHomeSection('products');

      const el = document.getElementById('products-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        setTimeout(() => {
          const elRetry = document.getElementById('products-section');
          if (elRetry) elRetry.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }

      if (!isHandlingPopState.current) {
        const currentStep = window.history.state?.step ?? historyStepRef.current;
        const nextStep = currentStep + 1;
        historyStepRef.current = nextStep;

        const nextState: AppNavState = {
          view: 'home',
          section: 'products',
          productId: null,
          category: activeFilters.category,
          supplierFilterId,
          step: nextStep
        };
        window.history.pushState(nextState, '', navStateToUrl(nextState));
      }
      return;
    }

    if (newView === 'home') {
      setSelectedProduct(null);
      setPendingProductId(null);
      setView('home');
      setHomeSection('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (!isHandlingPopState.current) {
        const currentStep = window.history.state?.step ?? historyStepRef.current;
        const nextStep = currentStep + 1;
        historyStepRef.current = nextStep;

        const nextState: AppNavState = {
          view: 'home',
          section: 'home',
          productId: null,
          category: 'all',
          supplierFilterId: null,
          step: nextStep
        };
        window.history.pushState(nextState, '', '/');
      }
      return;
    }

    if (view === newView && !selectedProduct) {
      return;
    }

    setSelectedProduct(null);
    setPendingProductId(null);
    setView(newView);

    if (!isHandlingPopState.current) {
      const currentStep = window.history.state?.step ?? historyStepRef.current;
      const nextStep = currentStep + 1;
      historyStepRef.current = nextStep;

      const nextState: AppNavState = {
        view: newView,
        section: undefined,
        productId: null,
        step: nextStep
      };
      window.history.pushState(nextState, '', navStateToUrl(nextState));
    }
  };

  const navigateToProduct = (product: Product, fromCustomView?: ViewType) => {
    setSelectedProduct(product);
    setPendingProductId(String(product.id));

    // Immediately scroll to the top of the page when opening product details
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    if (!isHandlingPopState.current) {
      const currentStep = window.history.state?.step ?? historyStepRef.current;
      const effectiveView = fromCustomView || view;

      // When navigating from Home root (step 0, section: 'home'), push Products state first.
      // This ensures that pressing the native Back button follows the exact expected flow:
      // Product Details -> Products -> Home -> Exit!
      if (effectiveView === 'home' && (!window.history.state?.section || window.history.state?.section === 'home') && !window.history.state?.productId) {
        const productsStep = currentStep + 1;
        const productsState: AppNavState = {
          view: 'home',
          section: 'products',
          category: activeFilters.category,
          supplierFilterId,
          productId: null,
          step: productsStep
        };
        window.history.pushState(productsState, '', navStateToUrl(productsState));

        const detailStep = productsStep + 1;
        historyStepRef.current = detailStep;
        const detailState: AppNavState = {
          view: 'home',
          section: 'products',
          productId: product.id,
          category: activeFilters.category,
          supplierFilterId,
          step: detailStep
        };
        window.history.pushState(detailState, '', navStateToUrl(detailState));
      } else {
        const nextStep = currentStep + 1;
        historyStepRef.current = nextStep;
        const detailState: AppNavState = {
          view: effectiveView,
          fromView: effectiveView !== 'home' ? effectiveView : undefined,
          section: 'products',
          productId: product.id,
          category: activeFilters.category,
          supplierFilterId,
          step: nextStep
        };
        window.history.pushState(detailState, '', navStateToUrl(detailState));
      }
    }
  };

  const navigateBack = (fallbackView: ViewType = 'home') => {
    const currentStep = window.history.state?.step;
    if (typeof currentStep === 'number' && currentStep > 0) {
      window.history.back();
    } else {
      setSelectedProduct(null);
      setPendingProductId(null);
      navigateToView(fallbackView);
    }
  };

  const handleFilterChange = (newFilters: Filters) => {
    const categoryChanged = newFilters.category !== activeFilters.category;
    setActiveFilters(newFilters);

    if (categoryChanged && !isHandlingPopState.current && view === 'home') {
      const currentStep = window.history.state?.step ?? historyStepRef.current;
      const nextStep = currentStep + 1;
      historyStepRef.current = nextStep;
      const nextState: AppNavState = {
        view: 'home',
        section: 'products',
        category: newFilters.category,
        supplierFilterId,
        productId: null,
        step: nextStep
      };
      window.history.pushState(nextState, '', navStateToUrl(nextState));
    }
  };

  const handleFilterSupplier = (id: string | number | null) => {
    setSupplierFilterId(id);
    setSelectedProduct(null);
    setPendingProductId(null);
    setSearchTerm('');

    if (!isHandlingPopState.current) {
      const currentStep = window.history.state?.step ?? historyStepRef.current;
      const nextStep = currentStep + 1;
      historyStepRef.current = nextStep;
      const nextState: AppNavState = {
        view: 'home',
        section: 'products',
        supplierFilterId: id,
        category: activeFilters.category,
        productId: null,
        step: nextStep
      };
      window.history.pushState(nextState, '', navStateToUrl(nextState));
    }
  };

  // Popstate event listener: handles hardware Android back button and browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      isHandlingPopState.current = true;
      try {
        const state: AppNavState = event.state || parseUrlToNavState(window.location.pathname, window.location.search);

        if (typeof state.step === 'number') {
          historyStepRef.current = state.step;
        }

        const targetView = state.fromView || state.view || 'home';
        setView(targetView);

        if (state.productId) {
          const pId = String(state.productId);
          setPendingProductId(pId);
          const found = products.find(p => p.id.toString() === pId);
          if (found) {
            setSelectedProduct(found);
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
          }
        } else {
          setSelectedProduct(null);
          setPendingProductId(null);
        }

        setHomeSection(state.section || (state.category && state.category !== 'all' ? 'products' : 'home'));
        if (state.category) {
          setActiveFilters(prev => ({ ...prev, category: state.category! }));
        }
        if (state.supplierFilterId !== undefined) {
          setSupplierFilterId(state.supplierFilterId);
        }

        // When returning to top of Home, scroll smoothly to top
        if (state.view === 'home' && state.section === 'home' && !state.productId) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } finally {
        setTimeout(() => {
          isHandlingPopState.current = false;
        }, 50);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [products]);

  const isAr = lang === 'ar';
  const t = translations[lang];

  // Persist language selections in safeLocalStorage & configure document layout dynamically
  useEffect(() => {
    safeLocalStorage.setItem('enerjoo_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.classList.add('notranslate');
    if (document.body) {
      document.body.setAttribute('translate', 'no');
      document.body.classList.add('notranslate');
    }
  }, [lang]);

  useEffect(() => {
    // Setup real-time listeners for products, suppliers and energy exchange
    const unsubProducts = subscribeToProducts((loadedProducts) => {
      if (Array.isArray(loadedProducts)) {
        setProducts(deduplicateProducts(loadedProducts));
      }
    });
    const unsubSuppliers = subscribeToSuppliers(setSuppliers);
    const unsubExchange = subscribeToEnergyExchange((prices, records) => {
      setExchangePrices(prices);
      if (records) setExchangeRecords(records);
    });
    return () => {
      unsubProducts();
      unsubSuppliers();
      unsubExchange();
    };
  }, []);

  // Synchronize selected product if any product fields or exchange prices update in real time, or clear if deleted
  useEffect(() => {
    if (selectedProduct && products.length > 0) {
      const updated = products.find(p => p.id.toString() === selectedProduct.id.toString());
      if (!updated) {
        setSelectedProduct(null);
      } else if (updated !== selectedProduct) {
        setSelectedProduct(updated);
      }
    }
  }, [products]);

  // Always scroll to top whenever any product details page is opened or switches
  useEffect(() => {
    if (selectedProduct) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      const raf = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [selectedProduct?.id]);

  // Handle Semantic Search Debounce
  useEffect(() => {
    if (!useAiSearch || searchTerm.length < 3) {
      setSemanticResults([]);
      setIsAiSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsAiSearching(true);
      try {
        const results = await performSemanticSearch(searchTerm, products, isAr);
        setSemanticResults(results);
      } catch (err) {
        console.error("AI Search Error:", err);
      } finally {
        setIsAiSearching(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [searchTerm, useAiSearch, products, isAr]);

  // Consolidated Filtering and Sorting Logic
  const filteredProducts = useMemo(() => {
    let items = deduplicateProducts(products);

    // Filter by supplier if requested
    if (supplierFilterId) {
      items = items.filter(p => p.supplierId?.toString() === supplierFilterId.toString());
    }

    // Filter by Category
    if (activeFilters.category !== 'all') {
      items = items.filter(p => p.category === activeFilters.category);
    }

    // Structured Inverter Classification Filter (Single Source of Truth)
    if (activeFilters.category === 'inverters') {
      items = items.filter(p => {
        const inv = classifyInverter(p);
        if (inverterFilters.type && inverterFilters.type !== 'all' && inv.type !== inverterFilters.type) {
          return false;
        }
        if (inverterFilters.phase && inverterFilters.phase !== 'all' && inv.phase !== inverterFilters.phase) {
          return false;
        }
        if (inverterFilters.powerRange && inverterFilters.powerRange !== 'all' && inv.power_range !== inverterFilters.powerRange) {
          return false;
        }
        if (inverterFilters.batterySupport !== undefined && inverterFilters.batterySupport !== 'all') {
          if (inv.battery_support !== inverterFilters.batterySupport) return false;
        }
        if (inverterFilters.application && inverterFilters.application !== 'all') {
          if (!inv.application.includes(inverterFilters.application)) return false;
        }
        return true;
      });
    }

    // Advanced Filters (Power, Price, Efficiency, Brand)
    items = items.filter(p => {
      const matchesPower = (!advancedFilters.minPower || p.power >= parseInt(advancedFilters.minPower)) &&
                           (!advancedFilters.maxPower || p.power <= parseInt(advancedFilters.maxPower));
      const matchesPrice = (!advancedFilters.minPrice || p.price >= parseInt(advancedFilters.minPrice)) &&
                           (!advancedFilters.maxPrice || p.price <= parseInt(advancedFilters.maxPrice));
      const matchesEfficiency = (!advancedFilters.minEfficiency || p.efficiency >= parseFloat(advancedFilters.minEfficiency));
      const matchesBrand = advancedFilters.brand === 'all' || p.brand === advancedFilters.brand;
      
    // Keyword matching (Base layer)
      const keywordScore = calculateRelevanceScore(p, searchTerm, isAr);
      const isAILifted = semanticResults.some(r => r.productId === p.id?.toString());
      const matchesSearch = !searchTerm.trim() || searchTerm.length < 2 || keywordScore > 0 || isAILifted;

      return matchesPower && matchesPrice && matchesEfficiency && matchesBrand && matchesSearch;
    });

    // Sorting Logic
    items.sort((a, b) => {
      // 1. Semantic Priority
      if (useAiSearch && semanticResults.length > 0) {
        return hybridSort(a, b, semanticResults, searchTerm, isAr);
      }

      // 2. Keyword Relevance Priority
      if (searchTerm.trim().length >= 1 && !useAiSearch) {
        const scoreA = calculateRelevanceScore(a, searchTerm, isAr);
        const scoreB = calculateRelevanceScore(b, searchTerm, isAr);
        if (scoreA > 0 || scoreB > 0) {
          if (scoreA !== scoreB) return scoreB - scoreA;
        }
      }

      // 3. User Selected Sort
      if (activeFilters.sort === 'power') return b.power - a.power;
      if (activeFilters.sort === 'price') return a.price - b.price;
      if (activeFilters.sort === 'efficiency') return b.efficiency - a.efficiency;
      
      return 0;
    });

    return items;
  }, [products, searchTerm, activeFilters, advancedFilters, inverterFilters, isAr, useAiSearch, semanticResults, supplierFilterId]);

  const toggleCompare = (product: Product) => {
    const targetId = getCanonicalProductId(product);
    setCompareList(prev => {
      if (prev.find(p => getCanonicalProductId(p) === targetId)) {
        return prev.filter(p => getCanonicalProductId(p) !== targetId);
      }
      if (prev.length >= 4) {
        alert(isAr ? 'يمكنك مقارنة 4 منتجات فقط' : 'You can compare up to 4 products');
        return prev;
      }
      return deduplicateProducts([...prev, product]);
    });
  };

  const toggleWishlist = (product: Product) => {
    if (!user) {
      navigateToView('login');
      return;
    }
    const targetId = getCanonicalProductId(product);
    setWishlist(prev => {
      if (prev.find(p => getCanonicalProductId(p) === targetId)) {
        return prev.filter(p => getCanonicalProductId(p) !== targetId);
      }
      return deduplicateProducts([...prev, product]);
    });
  };

  const isProductOwnedByCurrentUser = (product?: Product | null): boolean => {
    if (!user || !product) return false;
    if (user.type === 'admin') return true;
    if (user.type !== 'supplier') return false;
    const uid = String(user.uid || '').trim();
    if (!uid) return false;
    return (
      String(product.supplierId || '').trim() === uid ||
      String((product as any).supplier_id || '').trim() === uid ||
      String((product as any).supplier || '').trim() === uid ||
      Boolean(product.suppliers?.some(s => String(s?.id || '').trim() === uid))
    );
  };

  const handleProductAction = async (productData: Omit<Product, 'id'>) => {
    if (!user || !auth.currentUser) {
      throw new Error(
        isAr
          ? 'يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من إضافة أو تعديل المنتجات.'
          : 'Please sign in to your Enerjoo account first to add or edit products.'
      );
    }

    if (user.type !== 'admin' && user.type !== 'supplier') {
      throw new Error(
        isAr
          ? 'هذا الحساب مسجل كعميل وليس كمورد. إضافة المنتجات وتعديلها وحذفها متاحة للموردين المعتمدين وإدارة المنصة فقط.'
          : 'This account is registered as a customer. Only verified suppliers and administrators can manage products.'
      );
    }

    if (user.type === 'supplier' && Boolean(user.rejected)) {
      throw new Error(
        isAr
          ? 'تم رفض أو تعليق حساب المورد من قبل إدارة Enerjoo. لا يمكنك إضافة أو نشر منتجات.'
          : 'Your supplier account has been rejected or suspended by Enerjoo administration.'
      );
    }

    if (user.type === 'supplier' && user.verified !== true) {
      throw new Error(
        isAr
          ? 'حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo.'
          : 'Your account is under review. You can add your products after your account is approved by Enerjoo administration.'
      );
    }

    try {
      if (editingProduct) {
        if (user.type === 'supplier' && !isProductOwnedByCurrentUser(editingProduct)) {
          throw new Error(
            isAr
              ? 'غير مصرح لك بتعديل هذا المنتج لأنه تابع لمورد آخر.'
              : 'You are not authorized to edit this product because it belongs to another supplier.'
          );
        }
        const prodId = editingProduct.id.toString();
        const mergedProduct: Product = {
          ...editingProduct,
          ...productData,
          id: editingProduct.id,
          supplierId: user.type === 'supplier' ? user.uid : (productData.supplierId || editingProduct.supplierId),
          specs: {
            ...(editingProduct.specs || {}),
            ...(productData.specs || {})
          }
        };
        // Wait for confirmed database update before updating UI state or navigating away
        await updateProduct(prodId, mergedProduct);
        setProducts(prev => deduplicateProducts(prev.map(p => p.id.toString() === prodId ? mergedProduct : p)));
        setCompareList(prev => deduplicateProducts(prev.map(p => p.id.toString() === prodId ? mergedProduct : p)));
        setWishlist(prev => deduplicateProducts(prev.map(p => p.id.toString() === prodId ? mergedProduct : p)));
        if (selectedProduct && selectedProduct.id.toString() === prodId) {
          setSelectedProduct(mergedProduct);
        }
        setEditingProduct(null);
      } else {
        const newId = await addProduct(productData);
        const createdProduct: Product = {
          ...productData,
          id: newId,
          supplierId: user.type === 'supplier' ? user.uid : productData.supplierId
        } as Product;
        setProducts(prev => {
          const targetId = String(newId).trim();
          const exists = prev.some(p => getCanonicalProductId(p) === targetId);
          const next = exists
            ? prev.map(p => getCanonicalProductId(p) === targetId ? { ...p, ...createdProduct, id: p.id || newId } : p)
            : [createdProduct, ...prev];
          return deduplicateProducts(next);
        });
      }
      navigateToView(user?.type === 'supplier' || user?.type === 'admin' ? 'supplier-dashboard' : 'home');
    } catch (err: any) {
      console.error("Action error:", err);
      let errMsg = '';
      if (typeof err === 'string') {
        errMsg = err;
      } else if (err?.message && typeof err.message === 'string' && err.message !== '[object Object]') {
        errMsg = err.message;
      } else if (err?.error?.message) {
        errMsg = err.error.message;
      } else if (typeof err?.error === 'string') {
        errMsg = err.error;
      } else {
        errMsg = isAr ? 'حدث خطأ أثناء حفظ المنتج في قاعدة البيانات. يرجى المحاولة مرة أخرى.' : 'Failed to save product in database. Please try again.';
      }
      if (errMsg === '[object Object]' || !errMsg.trim()) {
        errMsg = isAr ? 'تعذر حفظ المنتج في قاعدة البيانات.' : 'Failed to save product in database.';
      }
      throw new Error(errMsg);
    }
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    if (!user || !auth.currentUser) {
      setDeleteError(
        isAr
          ? 'يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من حذف المنتج.'
          : 'Please sign in to your Enerjoo account first to delete this product.'
      );
      return;
    }

    if (user.type === 'supplier' && !isProductOwnedByCurrentUser(productToDelete)) {
      setDeleteError(
        isAr
          ? 'غير مصرح لك بحذف هذا المنتج لأنه تابع لمورد آخر.'
          : 'You are not authorized to delete this product because it belongs to another supplier.'
      );
      return;
    }

    const pId = productToDelete.id.toString();
    try {
      setIsDeletingProduct(true);
      setDeleteError(null);
      // Wait for confirmed database deletion before removing from UI state
      await deleteProduct(pId);
      setProducts(prev => prev.filter(p => p.id.toString() !== pId));
      setCompareList(prev => prev.filter(p => p.id.toString() !== pId));
      setWishlist(prev => prev.filter(p => p.id.toString() !== pId));
      if (selectedProduct && selectedProduct.id.toString() === pId) {
        setSelectedProduct(null);
        navigateBack('home');
      }
      setProductToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete product:', err);
      const errMsg = (err instanceof Error && err.message) ? err.message : (isAr ? 'تعذر حذف المنتج من قاعدة البيانات.' : 'Failed to delete product from database.');
      setDeleteError(errMsg);
    } finally {
      setIsDeletingProduct(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-solar-bg">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-solar-blue border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const renderContent = () => {
    switch (view) {
      case 'home':
      case 'products':
        if (selectedProduct) {
          const currentSelectedProduct = products.find(p => p.id?.toString() === selectedProduct.id?.toString()) || selectedProduct;
          return (
            <ProductDetail 
              product={currentSelectedProduct} 
              allProducts={products}
              suppliers={suppliers}
              lang={lang} 
              onBack={() => navigateBack('home')} 
              onCompare={toggleCompare}
              onWishlist={toggleWishlist}
              isCompared={(id) => !!compareList.find(p => p.id === id)}
              isInWishlist={(id) => !!wishlist.find(p => p.id === id)}
              onProductClick={(p) => navigateToProduct(p)}
              onFilterSupplier={handleFilterSupplier}
              onEdit={(p) => {
                setEditingProduct(p);
                setSelectedProduct(null);
                navigateToView('add');
              }}
              onDelete={async (id) => {
                if (!user || !auth.currentUser) {
                  throw new Error(
                    isAr
                      ? 'يرجى تسجيل الدخول إلى حسابك في Enerjoo أولاً لتتمكن من حذف المنتج.'
                      : 'Please sign in to your Enerjoo account first to delete this product.'
                  );
                }
                const pId = id.toString();
                await deleteProduct(pId);
                setProducts(prev => prev.filter(p => p.id.toString() !== pId));
                setCompareList(prev => prev.filter(p => p.id.toString() !== pId));
                setWishlist(prev => prev.filter(p => p.id.toString() !== pId));
                setSelectedProduct(null);
                navigateBack('home');
              }}
            />
          );
        }
        return (
          <div className="space-y-6 pb-20">
             {/* AI Engineering Solar Sizing Promo Banner */}
             {user?.type !== 'supplier' && (
               <motion.div 
                 initial={{ opacity: 0, y: -20 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="bg-gradient-to-r from-solar-blue via-indigo-600 to-indigo-700 text-white rounded-2xl sm:rounded-[32px] p-4 sm:p-6 md:p-8 shadow-xl shadow-indigo-600/10 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 overflow-hidden relative"
               >
                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                 <div className="absolute bottom-0 left-0 w-48 h-48 bg-solar-blue/10 rounded-full blur-2xl -ml-16 -mb-16 pointer-events-none"></div>
                 
                 <div className="space-y-2 relative z-10 text-right md:text-right w-full md:w-3/4">
                   <div className="inline-flex items-center gap-1.5 bg-white/10 text-amber-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                     <Sparkles size={12} className="animate-pulse" />
                     <span>{isAr ? 'ميزة حصرية هندسية' : 'EXCLUSIVE AI ENGINEERING'}</span>
                   </div>
                   <h2 className="text-xl md:text-2xl font-display font-black tracking-tight leading-snug">
                     {isAr 
                       ? 'صمم محطتك الشمسية المتكاملة واحسب تكاليفها بالذكاء الاصطناعي ⚡' 
                       : 'Design Your Full Solar Station & Estimate Costs Instantly ⚡'}
                   </h2>
                   <p className="text-xs md:text-sm text-white/85 font-medium leading-relaxed max-w-2xl">
                     {isAr 
                       ? 'حدد نوع نظامك (متصل بالشبكة، نظام هجين، أو منفصل) واحسب استهلاكك أو حدد قائمة أجهزتك الخاصة، وسيقوم مهندسنا الذكي بمطابقة أفضل القطع والماركات المتاحة من الموردين وتوليد دراسة جدوى استرشادية مخصصة وعروض أسعار في ثوانٍ معدودة!' 
                       : 'Select your target system architecture, calculate load or select appliances, and we will automatically engineer the design, match best brands, and output real-time Egyptian pricing estimates!'}
                   </p>
                 </div>

                 <button 
                   onClick={() => setIsAiChatOpen(true)}
                   className="w-full md:w-auto shrink-0 bg-white hover:bg-amber-100 text-indigo-700 hover:text-indigo-800 font-black text-xs md:text-sm px-7 py-4 rounded-xl transition duration-300 transform hover:scale-105 active:scale-95 shadow-md shadow-black/10 cursor-pointer relative z-10 flex items-center justify-center gap-2"
                 >
                   <Calculator size={18} />
                   <span>{isAr ? 'ابدأ تصميم محطتك والحساب الذكي' : 'Start Sizing & Smart AI Calculation'}</span>
                 </button>
               </motion.div>
              )}

            <div id="products-section" className="scroll-mt-20">
              <FilterBar 
                lang={lang} 
                activeFilter={activeFilters} 
                setFilter={handleFilterChange} 
                searchTerm={searchTerm} 
                setSearchTerm={setSearchTerm} 
                useAiSearch={useAiSearch}
                setUseAiSearch={setUseAiSearch}
                supplierFilterId={supplierFilterId}
                onClearSupplierFilter={() => handleFilterSupplier(null)}
                inverterFilters={inverterFilters}
                setInverterFilters={setInverterFilters}
              />
            </div>
            {isAiSearching && (
              <div className="flex items-center gap-2 mb-4 text-solar-blue font-black text-xs animate-pulse">
                <Sparkles size={14} />
                <span>{isAr ? 'جاري تحليل بحثك ذكياً...' : 'Analyzing search with AI...'}</span>
              </div>
            )}
            <AdvancedSearchPanel 
              lang={lang} 
              filters={advancedFilters} 
              setFilters={setAdvancedFilters} 
              onClear={() => setAdvancedFilters({ minPower: '', maxPower: '', minPrice: '', maxPrice: '', minEfficiency: '', brand: 'all' })}
            />
            
            {filteredProducts.length > 0 ? (
              supplierFilterId ? (
                // Supplier Profile view grouped by sections
                (() => {
                  const activeSup = suppliers.find(s => s.id?.toString() === supplierFilterId.toString());
                  const supPanels = filteredProducts.filter(p => p.category === 'panels');
                  const supInverters = filteredProducts.filter(p => p.category === 'inverters');
                  const supBatteries = filteredProducts.filter(p => p.category === 'batteries');
                  const supOthers = filteredProducts.filter(p => p.category !== 'panels' && p.category !== 'inverters' && p.category !== 'batteries');

                  const supGroups = [
                    { title: isAr ? 'قسم ألواح الطاقة الشمسية' : 'Solar Panels Section', items: supPanels, icon: '☀️' },
                    { title: isAr ? 'قسم محولات التيار والعواكس' : 'Inverters Section', items: supInverters, icon: '⚡' },
                    { title: isAr ? 'قسم البطاريات ووحدات التخزين' : 'Batteries Section', items: supBatteries, icon: '🔋' },
                    { title: isAr ? 'قسم الملحقات والمكونات الأخرى' : 'System Components & Accessories', items: supOthers, icon: '⚙️' },
                  ].filter(g => g.items.length > 0);

                  return (
                    <div className="space-y-12">
                      {/* Supplier Profile Badge Card */}
                      {activeSup && (() => {
                        const activeSupName = getSupplierDisplayName(activeSup, isAr);
                        const activeSupInitial = getSupplierAvatarInitial(activeSup, isAr);
                        const activeSupLocation = activeSup.location || (isAr ? 'القاهرة، مصر' : 'Cairo, Egypt');

                        return (
                          <div className="bg-white rounded-[40px] p-6 md:p-8 border border-solar-border shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-16 bg-solar-blue text-white rounded-3xl flex items-center justify-center text-2xl font-black shadow-md shadow-solar-blue/20">
                                {activeSupInitial}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h2 className="text-2xl font-black text-solar-text">{activeSupName}</h2>
                                  {activeSup.verified && (
                                    <span className="bg-solar-success/15 text-solar-success text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                                      <ShieldCheck size={12} />
                                      {isAr ? 'مورد معتمد' : 'VERIFIED'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-solar-muted font-bold mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span>📍 {activeSupLocation}</span>
                                  <span className="text-solar-border/70">|</span>
                                  <span className="cursor-pointer text-solar-blue hover:underline flex items-center gap-1 font-bold" onClick={() => {
                                    window.open(getSupplierWhatsAppUrl(isAr ? `مرحباً، أود الاستفسار عن منتجات ${activeSupName}` : `Hi, I want to inquire about products from ${activeSupName}`), '_blank');
                                  }}>📞 {SUPPLIER_CONTACT_PHONE_DISPLAY}</span>
                                </p>
                              </div>
                            </div>

                            <button 
                              onClick={() => setSupplierFilterId(null)}
                              className="w-full md:w-auto bg-solar-light text-solar-muted hover:text-solar-blue border border-solar-border/40 px-6 py-3 rounded-2xl font-black text-sm transition"
                            >
                              {isAr ? 'عرض كل الموردين' : 'View All Suppliers'}
                            </button>
                          </div>
                        );
                      })()}

                      {/* Group sections */}
                      <div className="space-y-12">
                        {supGroups.map((group, index) => (
                          <div key={index} className="space-y-6">
                            <div className="flex items-center gap-2 border-b border-solar-border/60 pb-3">
                              <span className="text-2xl">{group.icon}</span>
                              <h3 className="text-xl font-black text-solar-text">{group.title}</h3>
                              <span className="bg-solar-light text-solar-muted text-xs font-black px-2.5 py-1 rounded-full">{group.items.length} {t.products}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                              {group.items.map(p => (
                                <ProductCard 
                                  key={getCanonicalProductId(p)}
                                  product={p} 
                                  lang={lang} 
                                  onClick={() => navigateToProduct(p)} 
                                  onCompare={(e) => { e.stopPropagation(); toggleCompare(p); }}
                                  onWishlist={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                                  onEdit={(e, product) => {
                                    e.stopPropagation();
                                    setEditingProduct(product);
                                    navigateToView('add');
                                  }}
                                  onDelete={(e, product) => {
                                    e.stopPropagation();
                                    setProductToDelete(product);
                                  }}
                                  isCompared={!!compareList.find(cp => getCanonicalProductId(cp) === getCanonicalProductId(p))}
                                  isWishlisted={!!wishlist.find(wp => getCanonicalProductId(wp) === getCanonicalProductId(p))}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredProducts.map(p => {
                    const aiResult = semanticResults.find(r => r.productId === p.id?.toString());
                    return (
                      <div key={getCanonicalProductId(p)} className="relative group">
                        <ProductCard 
                          product={p} 
                          lang={lang} 
                          onClick={() => navigateToProduct(p)} 
                          onCompare={(e) => { e.stopPropagation(); toggleCompare(p); }}
                          onWishlist={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                          onEdit={(e, product) => {
                            e.stopPropagation();
                            setEditingProduct(product);
                            navigateToView('add');
                          }}
                          onDelete={(e, product) => {
                            e.stopPropagation();
                            setProductToDelete(product);
                          }}
                          isCompared={!!compareList.find(cp => getCanonicalProductId(cp) === getCanonicalProductId(p))}
                          isWishlisted={!!wishlist.find(wp => getCanonicalProductId(wp) === getCanonicalProductId(p))}
                        />
                        {useAiSearch && aiResult && (
                          <div className="absolute top-2 right-2 bg-solar-blue text-white p-2 rounded-xl shadow-xl z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none max-w-[200px]">
                            <div className="flex items-center gap-1 mb-1">
                              <Sparkles size={10} />
                              <span className="text-[10px] font-black uppercase">{t.aiMatching}</span>
                              <span className="ml-auto text-[10px] font-black">{Math.round(aiResult.relevanceScore * 100)}%</span>
                            </div>
                            <p className="text-[9px] leading-tight font-medium">{aiResult.matchReason}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="py-20 text-center bg-white rounded-[40px] p-8 border border-solar-border shadow-sm">
                <div className="text-6xl mb-6 grayscale opacity-20">📦</div>
                <h3 className="text-2xl font-black text-solar-text">
                  {products.length === 0 
                    ? (isAr ? 'لا توجد منتجات معروضة حالياً' : 'No Products Available Currently') 
                    : t.noData}
                </h3>
                <p className="text-solar-muted font-bold mt-2 max-w-md mx-auto">
                  {products.length === 0
                    ? (isAr ? 'تم مسح المنتجات السابقة، وبإمكان الموردين المعتمدين الآن إضافة ونشر منتجاتهم الجديدة من لوحة المورد.' : 'Products catalog is currently clear. Verified suppliers can publish new products from their dashboard.')
                    : (isAr ? 'لم نجد نتائج مطابقة لبحثك. جرب كلمات بحث أخرى أو قم بتصفية الفلاتر.' : 'No matching results found. Try different keywords or clear filters.')}
                </p>
                {(activeFilters.category !== 'all' || advancedFilters.brand !== 'all' || advancedFilters.minPower || advancedFilters.maxPower || advancedFilters.minPrice || advancedFilters.maxPrice || advancedFilters.minEfficiency || supplierFilterId || searchTerm) && (
                  <button 
                    onClick={() => {
                      setActiveFilters({ category: 'all', sort: 'power' });
                      setAdvancedFilters({ minPower: '', maxPower: '', minPrice: '', maxPrice: '', minEfficiency: '', brand: 'all' });
                      setSupplierFilterId(null);
                      setSearchTerm('');
                    }}
                    className="mt-8 bg-solar-blue text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-solar-blue/20 transition-all hover:scale-105 active:scale-95"
                  >
                    {isAr ? 'إعادة تعيين كافة الفلاتر' : 'Reset All Filters'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      case 'wishlist':
        return (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-black text-solar-text mb-2 flex items-center gap-3">
                  <span className="text-red-500">❤️</span>
                  {t.wishlist}
                </h1>
                <p className="text-solar-muted font-bold">{isAr ? `${wishlist.length} منتجات محفوظة` : `${wishlist.length} Saved Products`}</p>
              </div>
              <button 
                onClick={() => navigateBack('home')}
                className="bg-solar-light text-solar-blue px-6 py-3 rounded-2xl font-black transition-all hover:bg-solar-blue hover:text-white"
              >
                {t.back}
              </button>
            </div>

            {wishlist.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {wishlist.map(p => (
                  <ProductCard 
                    key={p.id}
                    product={p} 
                    lang={lang} 
                    onClick={() => navigateToProduct(p, 'wishlist')} 
                    onCompare={(e) => { e.stopPropagation(); toggleCompare(p); }}
                    onWishlist={(e) => { e.stopPropagation(); toggleWishlist(p); }}
                    onEdit={(e, product) => {
                      e.stopPropagation();
                      setEditingProduct(product);
                      navigateToView('add');
                    }}
                    onDelete={(e, product) => {
                      e.stopPropagation();
                      setProductToDelete(product);
                    }}
                    isCompared={!!compareList.find(cp => cp.id === p.id)}
                    isWishlisted={true}
                  />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center bg-white rounded-[40px] border border-solar-border shadow-sm">
                <div className="text-6xl mb-4 grayscale opacity-20">❤️</div>
                <h3 className="text-xl font-black text-solar-text">{t.emptyWishlist}</h3>
                <p className="text-solar-muted font-bold mt-2">{t.noWishlistItems}</p>
                <button 
                  onClick={() => navigateToView('home')}
                  className="mt-8 bg-solar-blue text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-solar-blue/20 transition-all hover:scale-105 active:scale-95"
                >
                  {isAr ? 'استكشف المنتجات' : 'Explore Products'}
                </button>
              </div>
            )}
          </div>
        );
      case 'exchange':
        return (
          <EnergyExchange 
            lang={lang} 
            user={user} 
            prices={exchangePrices}
            records={exchangeRecords}
            onNavigateToBrandProducts={(brandName) => {
              setActiveFilters({ category: 'panels', sort: 'power' });
              setSearchTerm(brandName);
              navigateToView('home');
              setTimeout(() => {
                const el = document.getElementById('products-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 200);
            }} 
          />
        );
      case 'compare':
        return <CompareView products={compareList} lang={lang} onBack={() => navigateBack('home')} onRemove={(id) => setCompareList(l => l.filter(p => p.id !== id))} />;
      case 'add':
        if (!user) return <LoginView lang={lang} setView={navigateToView} defaultTab="email" />;
        if (user.type !== 'supplier' && user.type !== 'admin') {
          return (
            <div className="py-20 text-center bg-white rounded-[40px] p-8 border border-solar-border shadow-sm max-w-xl mx-auto">
              <h3 className="text-2xl font-black text-solar-text mb-2">{isAr ? 'غير مصرح بالوصول' : 'Access Denied'}</h3>
              <p className="text-solar-muted font-bold mb-6">{isAr ? 'هذه الصفحة مخصصة للموردين المعتمدين وإدارة المنصة فقط.' : 'This page is restricted to verified suppliers and platform administrators.'}</p>
              <button onClick={() => navigateToView('home')} className="bg-solar-blue text-white px-6 py-3 rounded-2xl font-black">{t.back}</button>
            </div>
          );
        }
        if (user.type === 'supplier' && (user.verified !== true || Boolean(user.rejected))) {
          return (
            <div className="py-16 text-center bg-white rounded-[40px] p-8 border border-amber-300 shadow-sm max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center mx-auto mb-5 text-3xl">
                ⏳
              </div>
              <h3 className="text-2xl font-black text-solar-text mb-3">
                {user.rejected
                  ? (isAr ? 'حساب المورد مرفوض أو معلق' : 'Supplier Account Rejected')
                  : (isAr ? 'حساب المورد قيد المراجعة' : 'Supplier Account Under Review')}
              </h3>
              <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl p-4 font-black text-sm sm:text-base leading-relaxed mb-6">
                {user.rejected
                  ? (isAr
                      ? 'تم رفض أو تعليق حساب المورد من قبل إدارة Enerjoo. لا يمكنك إضافة أو نشر منتجات.'
                      : 'Your supplier account has been rejected or suspended by Enerjoo administration.')
                  : (isAr
                      ? 'حسابك قيد المراجعة. يمكنك إضافة منتجاتك بعد اعتماد حسابك من إدارة Enerjoo.'
                      : 'Your account is under review. You can add your products after your account is approved by Enerjoo administration.')}
              </p>
              <button
                onClick={() => navigateToView('supplier-dashboard')}
                className="bg-solar-blue text-white px-8 py-3.5 rounded-2xl font-black cursor-pointer hover:opacity-90 transition"
              >
                {isAr ? 'العودة إلى لوحة تحكم المورد' : 'Back to Supplier Dashboard'}
              </button>
            </div>
          );
        }
        return <AddProductView lang={lang} onBack={() => { navigateBack(user?.type === 'supplier' || user?.type === 'admin' ? 'supplier-dashboard' : 'home'); setEditingProduct(null); }} onAdd={handleProductAction} editingProduct={editingProduct} />;
      case 'login':
        return <LoginView lang={lang} setView={navigateToView} />;
      case 'register':
        return <RegisterView lang={lang} setView={navigateToView} />;
      case 'supplier-dashboard':
        if (!user) return <LoginView lang={lang} setView={navigateToView} defaultTab="email" />;
        if (user.type !== 'supplier' && user.type !== 'admin') {
          return (
            <div className="py-20 text-center bg-white rounded-[40px] p-8 border border-solar-border shadow-sm max-w-xl mx-auto">
              <h3 className="text-2xl font-black text-solar-text mb-2">{isAr ? 'غير مصرح بالوصول' : 'Access Denied'}</h3>
              <p className="text-solar-muted font-bold mb-6">{isAr ? 'لوحة الموردين متاحة فقط لحسابات الموردين وإدارة المنصة.' : 'Supplier dashboard is restricted to supplier and administrator accounts.'}</p>
              <button onClick={() => navigateToView('home')} className="bg-solar-blue text-white px-6 py-3 rounded-2xl font-black">{t.back}</button>
            </div>
          );
        }
        return (
          <SupplierDashboard 
            lang={lang} 
            setView={navigateToView} 
            products={products} 
            suppliers={suppliers}
            onDelete={async (id) => {
              const pId = id.toString();
              await deleteProduct(pId);
              setProducts(prev => prev.filter(p => p.id.toString() !== pId));
              setCompareList(prev => prev.filter(p => p.id.toString() !== pId));
              setWishlist(prev => prev.filter(p => p.id.toString() !== pId));
            }}
            onEdit={(p) => { setEditingProduct(p); navigateToView('add'); }}
            adminSearch={adminSearch}
            setAdminSearch={setAdminSearch}
            adminFilterId={adminFilterId}
            setAdminFilterId={setAdminFilterId}
          />
        );
      case 'admin-suppliers':
        if (!user) return <LoginView lang={lang} setView={navigateToView} />;
        if (user.type !== 'admin') {
          return (
            <div className="py-20 text-center bg-white rounded-[40px] p-8 border border-solar-border shadow-sm max-w-xl mx-auto">
              <h3 className="text-2xl font-black text-solar-text mb-2">{isAr ? 'صلاحية مسؤول مطلوبة' : 'Administrator Access Required'}</h3>
              <p className="text-solar-muted font-bold mb-6">{isAr ? 'هذه اللوحة مخصصة لمديري منصة Enerjoo فقط.' : 'This panel is restricted to Enerjoo administrators only.'}</p>
              <button onClick={() => navigateToView('home')} className="bg-solar-blue text-white px-6 py-3 rounded-2xl font-black">{t.back}</button>
            </div>
          );
        }
        return (
          <AdminSupplierManagement 
            lang={lang} 
            suppliers={suppliers} 
            products={products}
            onToggleVerification={(id) => {
              const s = suppliers.find(sup => sup.id === id);
              if (s) toggleSupplierVerification(id.toString(), !s.verified);
            }}
            onBack={() => navigateBack('home')}
            initialSearch={adminSearch}
            onViewSupplier={(id) => { setSupplierFilterId(id); navigateToView('home'); }}
            onManageProducts={(id) => { setAdminFilterId(id); navigateToView('supplier-dashboard'); }}
          />
        );
      case 'admin-requests':
        if (!user) return <LoginView lang={lang} setView={navigateToView} />;
        if (user.type !== 'admin') {
          return (
            <div className="py-20 text-center bg-white rounded-[40px] p-8 border border-solar-border shadow-sm max-w-xl mx-auto">
              <h3 className="text-2xl font-black text-solar-text mb-2">{isAr ? 'صلاحية مسؤول مطلوبة' : 'Administrator Access Required'}</h3>
              <p className="text-solar-muted font-bold mb-6">{isAr ? 'هذه اللوحة مخصصة لمديري منصة Enerjoo فقط.' : 'This panel is restricted to Enerjoo administrators only.'}</p>
              <button onClick={() => navigateToView('home')} className="bg-solar-blue text-white px-6 py-3 rounded-2xl font-black">{t.back}</button>
            </div>
          );
        }
        return (
          <AdminSolarRequests
            lang={lang}
            onBack={() => navigateBack('home')}
          />
        );
      case 'customer-requests':
        if (!user) return <LoginView lang={lang} setView={navigateToView} />;
        return (
          <CustomerRequestsView
            lang={lang}
            setView={navigateToView}
          />
        );
      case 'profile':
        if (!user) return <LoginView lang={lang} setView={navigateToView} />;
        return (
          <ProfileView 
            lang={lang}
            setLang={setLang}
            user={user}
            logout={logout}
            setView={navigateToView}
            wishlistCount={wishlist.length}
            compareCount={compareList.length}
            productsCount={user ? products.filter(p => p.supplierId === user.uid).length : 0}
          />
        );
      case 'calculator':
        return (
          <SolarCalculator 
            lang={lang}
            products={products}
            onBack={() => navigateBack('home')}
            onProductClick={(p) => {
              navigateToProduct(p, 'calculator');
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div 
      translate="no" 
      className={`min-h-screen bg-solar-bg w-full max-w-full overflow-x-hidden box-border notranslate ${isAr ? 'rtl' : 'ltr'}`} 
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {view !== 'login' && view !== 'register' && (
        <Header 
          lang={lang} 
          setLang={setLang} 
          user={user} 
          onLogout={logout} 
          setView={navigateToView} 
          onOpenAiChat={() => setIsAiChatOpen(true)} 
        />
      )}
      
      {user && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-2 w-full max-w-full box-border">
          {/* Case 2: Supplier explicitly suspended/rejected */}
          {user.type === 'supplier' && user.rejected && (
            <div className="bg-amber-600 text-white text-xs py-3.5 px-4 font-bold flex items-center justify-center gap-2 rounded-2xl border border-amber-700/30 shadow-md">
              <span className="text-sm">⚠️</span>
              <span>
                {isAr
                  ? 'تم تعليق حساب المورد هذا من قبل الإدارة. يرجى التواصل مع إدارة المنصة للمراجعة.'
                  : 'Your supplier account has been suspended by administration. Please contact support.'}
              </span>
            </div>
          )}
        </div>
      )}
      
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-32 md:pb-12 box-border min-w-0 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={view + (selectedProduct?.id || '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-full box-border min-w-0"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {compareList.length > 0 && view !== 'compare' && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-24 md:bottom-10 right-4 left-4 md:left-auto md:w-80 bg-solar-blue text-white p-4 rounded-2xl shadow-2xl z-50 flex items-center justify-between"
        >
          <div className="flex -space-x-2 overflow-hidden">
            {compareList.slice(0, 3).map(p => (
              <img key={p.id} src={p.image} className="w-8 h-8 rounded-full border-2 border-solar-blue object-cover shrink-0" alt="" />
            ))}
          </div>
          <div className="px-4 text-xs font-black uppercase">{compareList.length} {isAr ? 'منتجات' : 'Products'}</div>
          <button onClick={() => navigateToView('compare')} className="bg-white text-solar-blue px-4 py-2 rounded-xl text-xs font-black shadow-lg">
            {isAr ? 'قارن الآن' : 'Compare Now'}
          </button>
        </motion.div>
      )}

      {/* Floating Enerjoo WhatsApp Direct Contact Button */}
      <a
        href={getCustomerServiceWhatsAppUrl(isAr ? 'مرحباً منصة Enerjoo، أود الاستفسار عن خدمات وحلول الطاقة الشمسية.' : 'Hello Enerjoo, I would like to inquire about solar services and energy solutions.')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contact Enerjoo Customer Service on WhatsApp"
        className="fixed bottom-20 md:bottom-6 left-4 z-40 bg-emerald-500 hover:bg-emerald-600 text-white p-3 md:px-4 md:py-3 rounded-full shadow-2xl hover:shadow-emerald-500/30 flex items-center gap-2.5 transition-all transform hover:scale-105 active:scale-95 group border-2 border-white/20"
        title={`WhatsApp: ${CUSTOMER_SERVICE_PHONE_DISPLAY}`}
      >
        <span className="text-xl leading-none">💬</span>
        <div className="hidden sm:flex flex-col text-left rtl:text-right">
          <span className="text-[11px] font-black leading-tight">{isAr ? 'خدمة عملاء Enerjoo' : 'Enerjoo Support'}</span>
          <span className="text-[9px] opacity-90 font-bold leading-tight" dir="ltr">{CUSTOMER_SERVICE_PHONE_DISPLAY}</span>
        </div>
      </a>

      {/* Enerjoo AI Chatbot Integration */}
      <EnerjooAIChat 
        lang={lang} 
        isOpen={isAiChatOpen} 
        onClose={() => setIsAiChatOpen(false)} 
        showFloatingTrigger={false} 
        activeProductId={selectedProduct?.id ? String(selectedProduct.id) : undefined}
      />

      {/* Product Deletion Confirmation Modal */}
      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-solar-border"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle size={24} />
                </div>
                <button 
                  onClick={() => { setProductToDelete(null); setDeleteError(null); }}
                  disabled={isDeletingProduct}
                  className="p-2 text-solar-muted hover:text-solar-text rounded-xl transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <h3 className="text-xl font-black text-solar-text mb-2">
                {isAr ? 'تأكيد حذف المنتج' : 'Confirm Delete Product'}
              </h3>
              
              <p className="text-solar-muted text-sm leading-relaxed mb-4 font-medium">
                {isAr 
                  ? `هل أنت متأكد من رغبتك في حذف "${productToDelete.nameAr || productToDelete.name}" نهائياً من منصة Enerjoo؟ لا يمكن التراجع عن هذا الإجراء.`
                  : `Are you sure you want to permanently delete "${productToDelete.name}" from Enerjoo? This action cannot be undone.`
                }
              </p>

              {deleteError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold leading-relaxed flex flex-col gap-1.5">
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-rose-600">⚠️</span>
                    <span>{deleteError}</span>
                  </div>
                  {(!user || !auth.currentUser || deleteError.includes('تسجيل الدخول') || deleteError.includes('sign in')) && (
                    <button
                      type="button"
                      onClick={() => {
                        setProductToDelete(null);
                        setDeleteError(null);
                        navigateToView('login');
                      }}
                      className="self-start text-[11px] font-black text-rose-700 underline hover:text-rose-900 cursor-pointer pt-1"
                    >
                      {isAr ? 'الانتقال إلى صفحة تسجيل الدخول ←' : 'Go to Login Page →'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setProductToDelete(null); setDeleteError(null); }}
                  disabled={isDeletingProduct}
                  className="flex-1 py-3 px-4 rounded-xl border border-solar-border text-solar-text font-bold text-sm hover:bg-solar-light transition cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleConfirmDeleteProduct}
                  disabled={isDeletingProduct}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingProduct ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{isAr ? 'جاري الحذف...' : 'Deleting...'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'حذف نهائي' : 'Delete'}</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BottomNav currentView={view} currentSection={homeSection} setView={navigateToView} lang={lang} user={user} />
    </div>
  );
}
