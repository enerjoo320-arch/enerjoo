export * from './types/inverter';

export type Category = 
  | 'all' 
  | 'panels' 
  | 'inverters' 
  | 'batteries' 
  | 'pumps'
  | 'mounting' 
  | 'protection' 
  | 'combiner' 
  | 'cables' 
  | 'mc4' 
  | 'sealings' 
  | 'clamps';

export interface Supplier {
  id: string | number;
  name: string;
  nameAr?: string;
  price: number;
  phone: string;
  location: string;
  verified: boolean;
  rejected?: boolean;
  lastUpdate: string;
  email?: string;
  avatar?: string;
  profileImage?: string;
  rating?: number;
  totalSales?: number;
}

export type DimensionUnit = 'mm' | 'cm' | 'm';

export interface Product {
  id: string | number;
  name: string;
  nameAr: string;
  brand: string;
  category: Category;
  power: number;
  area: number;
  length?: number;
  width?: number;
  thickness?: number;
  dimensionUnit?: DimensionUnit;
  efficiency: number;
  warranty: number;
  price: number;
  status: 'available' | 'limited' | 'out_of_stock';
  updatedAt: string;
  image: string;
  image_url?: string;
  additionalImages?: string[];
  supplierId: string | number;
  datasheetUrl?: string;
  specs: Record<string, any>;
  suppliers: Supplier[];
  description?: string;
  notes?: string;
  pricePerWatt?: number;
  exchangeBrand?: string;
  exchangeUnsupported?: boolean;
  exchangeStatusReason?: 'out_of_bounds' | 'unconfigured' | 'inactive' | 'api_error';
  exchangeRange?: { minWattage: number; maxWattage: number } | null;
  max_pv_open_circuit_voltage_v?: number;
  mppt_count?: number;
  hp?: number | string;
}

export const SOLAR_PANEL_BRANDS = [
  'Jinko',
  'LONGi Solar',
  'AIKO',
  'Trina Solar',
  'JA Solar',
  'Risen',
  'GCL',
  'Suntech',
  'Astronergy',
  'Gokin',
  'Quantum Solar',
  'Ulica Solar',
  'ZNShine Solar',
  'Jet Solar'
] as const;

export type SolarPanelBrand = (typeof SOLAR_PANEL_BRANDS)[number];

export interface EnergyExchangePrices {
  prices: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ProductReview {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export interface Customer {
  uid: string;
  fullName: string;
  phoneNumber: string;
  normalizedPhoneNumber: string;
  email?: string;
  governorate?: string;
  createdAt: any;
  updatedAt: any;
  lastLoginAt: any;
  authProvider: 'phone' | 'google' | 'email';
}

export interface User {
  uid: string;
  email: string | null;
  name: string;
  nameAr?: string;
  type: 'customer' | 'supplier' | 'admin';
  company?: string;
  location?: string;
  governorate?: string;
  phone?: string;
  avatar: string;
  profileImage?: string;
  verified: boolean;
  rejected?: boolean;
  createdAt: string;
}

export type SolarSystemType = 'on-grid' | 'off-grid' | 'hybrid' | 'pump';
export type SolarTier = 'budget' | 'recommended' | 'premium';
export type SolarRequestStatus = 'pending' | 'in_progress' | 'contacted' | 'completed' | 'cancelled';
export type QuotationStatus = 'pending' | 'in_progress' | 'contacted' | 'processed' | 'completed' | 'cancelled';

export interface Quotation {
  id?: string;
  requestId?: string;
  customerName: string;
  name?: string;
  customerEmail?: string;
  email?: string;
  phone: string;
  customerPhone?: string;
  customerId?: string | null;
  userId?: string | null;
  systemType: SolarSystemType | string;
  systemTypeName?: string;
  location: string;
  governorate?: string;
  usage?: number | string;
  monthlyBill?: number;
  batteryRequired?: boolean;
  systemSpecs?: string;
  targetTier?: SolarTier | string;
  priceEstimate: number;
  notes?: string;
  supplierContacted?: string;
  status: QuotationStatus | string;
  createdAt: any;
  updatedAt?: any;
}

export interface SolarRequest {
  id?: string;
  requestId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  governorate?: string;
  location?: string;
  systemType: SolarSystemType;
  tier: SolarTier;
  inputs: {
    monthlyBill?: number;
    consumptionKwh?: number;
    sunHours?: number;
    cityChoice?: string;
    locationStr?: string;
    pumpKw?: number;
    pumpHp?: number;
    pumpHours?: number;
    appliances?: Array<{
      name: string;
      power: number;
      count: number;
      hours: number;
    }>;
  };
  calculatedOutputs: {
    systemSizeKw: number;
    estimatedCost: number;
    panelQty: number;
    panelModel?: string;
    panelWatt?: number;
    panelCost?: number;
    inverterQty: number;
    inverterModel?: string;
    inverterKw?: number;
    inverterCost?: number;
    batteryQty?: number;
    batteryModel?: string;
    batteryKwh?: number;
    batteryCost?: number;
    annualProductionKwh?: number;
    annualSavingsEgp?: number;
    paybackYears?: number;
    dcProtectionCost?: number;
    acProtectionCost?: number;
    dcCableCost?: number;
    acCableCost?: number;
    structureCost?: number;
    installationCost?: number;
    warrantyYears?: number;
  };
  notes?: string;
  status: SolarRequestStatus;
  adminNotes?: string;
  supplierContacted?: string;
  createdAt: any;
  updatedAt?: any;
}

export type ViewType = 
  | 'home' 
  | 'compare' 
  | 'add' 
  | 'admin-suppliers' 
  | 'admin-requests'
  | 'customer-requests'
  | 'login' 
  | 'register' 
  | 'supplier-dashboard' 
  | 'profile'
  | 'wishlist'
  | 'detail'
  | 'calculator'
  | 'products'
  | 'exchange';

export interface Filters {
  category: Category;
  sort: 'power' | 'price' | 'efficiency';
}

export interface AdvancedFilters {
  minPower: string;
  maxPower: string;
  minPrice: string;
  maxPrice: string;
  minEfficiency: string;
  brand: string;
}
