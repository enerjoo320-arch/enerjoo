import { Product } from "../types";

export interface SemanticSearchResult {
  productId: string;
  relevanceScore: number; // 0 to 1
  matchReason: string;
}

export interface RecommendedProductPackage {
  productId: number;
  quantity: number;
  role: 'panels' | 'inverters' | 'batteries';
  reason: string;
}

export interface SolarCalculatorResult {
  status: 'feasible' | 'warning' | 'infeasible';
  explanation: string;
  totalEstimatedCost: number;
  feasibilityAnalysis: string;
  specifications: {
    totalPanelPowerKw: number;
    totalAreaRequiredM2: number;
    panelsCountNeeded: number;
    batterySizingDetails?: string;
  };
  recommendedProducts: RecommendedProductPackage[];
}

export async function performSemanticSearch(
  query: string,
  products: Product[],
  isAr: boolean
): Promise<SemanticSearchResult[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch("/api/semantic-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, products, isAr }),
    });

    if (!response.ok) {
      throw new Error(`Semantic search API failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Semantic Search Error:", error);
    return [];
  }
}

export async function calculateSolarSystem(params: {
  stationPower: number;
  landArea: number;
  loadDetails?: string;
  products: Product[];
  lang: 'en' | 'ar';
}): Promise<SolarCalculatorResult | null> {
  try {
    const response = await fetch("/api/solar-calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errData: any = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Solar Calculator API failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Solar Sizing Calculator Error:", error);
    throw error;
  }
}
