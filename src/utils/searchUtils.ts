/**
 * Utility for advanced product search and scoring
 */

import { Product } from '../types';

/**
 * Normalizes text for better searching (handles Arabic variations)
 */
function normalizeText(text: string): string {
  if (!text) return '';
  let normalized = text
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // Preserve alpha-numeric, space, and some common spec chars like hyphens and dots
    .replace(/[^\w\s\u0600-\u06FF\-\.]/g, '');

  // Handle common Arabic prefixes (like definite article "Al-")
  // We only do this if it leaves a reasonable word length
  const words = normalized.split(/\s+/).map(word => {
    if (word.startsWith('ال') && word.length > 4) {
      return word.substring(2);
    }
    return word;
  });

  return words.join(' ');
}

/**
 * Calculates a relevance score for a product based on a search term.
 * Scores range from 0 (no match) to 1 (perfect match).
 */
export function calculateRelevanceScore(product: Product, term: string, isAr: boolean): number {
  const trimmedTerm = term.trim();
  if (!trimmedTerm) return 1;

  const normalizedTerm = normalizeText(trimmedTerm);
  if (!normalizedTerm) return 0;

  const nameEn = normalizeText(product.name);
  const nameAr = normalizeText(product.nameAr);
  const brand = normalizeText(product.brand);
  const category = normalizeText(product.category);
  
  let score = 0;

  // 1. Exact matches (High weight)
  if (nameEn === normalizedTerm || nameAr === normalizedTerm) score += 1.0;
  else if (nameEn.includes(normalizedTerm) || nameAr.includes(normalizedTerm)) {
    // Boost if it's at the start of a word
    if (nameEn.startsWith(normalizedTerm) || nameAr.startsWith(normalizedTerm) || 
        nameEn.includes(' ' + normalizedTerm) || nameAr.includes(' ' + normalizedTerm)) {
      score += 0.8;
    } else {
      score += 0.6;
    }
  }

  // 2. Partial word matches
  const termWords = normalizedTerm.split(/\s+/).filter(w => w.length >= 1);
  if (termWords.length > 0) {
    let wordMatches = 0;
    termWords.forEach(tw => {
      const isMatch = nameEn.includes(tw) || 
                     nameAr.includes(tw) || 
                     brand.includes(tw) || 
                     category.includes(tw) ||
                     (product.specs && Object.values(product.specs).some(val => normalizeText(String(val)).includes(tw)));
      if (isMatch) wordMatches += 1;
    });
    score += (wordMatches / termWords.length) * 0.5;
  }

  // 3. Brand match (Medium weight)
  if (brand === normalizedTerm) score += 0.5;
  else if (brand.includes(normalizedTerm)) score += 0.3;

  // 4. Category match
  if (category === normalizedTerm) score += 0.4;
  else if (category.includes(normalizedTerm)) score += 0.2;

  // 4b. Arabic Category Synonyms
  const categorySynonyms: Record<string, string[]> = {
    panels: ['الواح', 'لوح', 'لوحات', 'شمسيه', 'بانل'],
    inverters: ['عواكس', 'محول', 'انفرتر', 'انفرتير', 'اينفرتر', 'اينفرتير', 'عكس'],
    batteries: ['بطاريات', 'بطاريه', 'خازن', 'مركم'],
    mounting: ['هياكل', 'تثبيت', 'شاسيه', 'قواعد'],
    protection: ['حمايه', 'قااطع', 'فيوز'],
    cables: ['كابلات', 'سلك', 'اسلاك', 'توصيل'],
    combiner: ['صندوق', 'تجميع', 'كومباينر'],
  };

  const currentCatSynonyms = categorySynonyms[product.category.toLowerCase()];
  if (currentCatSynonyms && currentCatSynonyms.some(syn => normalizedTerm.includes(syn) || syn.includes(normalizedTerm))) {
    score += 0.7;
  }

  // 5. Specification Specific Matching
  const numbersInTerm = trimmedTerm.match(/\d+(\.\d+)?/g);
  if (numbersInTerm) {
    numbersInTerm.forEach(numStr => {
      const n = parseFloat(numStr);
      if (product.power === n) score += 0.5;
      if (product.price === n) score += 0.1;
      if (product.efficiency === n) score += 0.3;
    });
  }

  return Math.min(score, 1.0);
}

/**
 * Hybrid sort: priorities AI results but uses keyword scoring for ties or non-AI results
 */
export function hybridSort(a: Product, b: Product, semanticResults: any[], searchTerm: string, isAr: boolean): number {
  const resultA = semanticResults.find(r => r.productId === a.id?.toString());
  const resultB = semanticResults.find(r => r.productId === b.id?.toString());

  if (resultA && resultB) {
    return resultB.relevanceScore - resultA.relevanceScore;
  }

  if (resultA) return -1;
  if (resultB) return 1;

  // If no AI results, fallback to keyword scoring
  const scoreA = calculateRelevanceScore(a, searchTerm, isAr);
  const scoreB = calculateRelevanceScore(b, searchTerm, isAr);
  
  return scoreB - scoreA;
}
