import { Supplier } from '../types';

/**
 * Checks whether a given string is a raw database ID, Firebase UID, or hash
 * rather than a human-readable company or individual name.
 * 
 * Examples of raw IDs:
 *  - "So1379D78XRtG1JjH1m3u3FkBbv2"
 *  - "8XRtG1JjH1m3u3FkBbv2"
 *  - "PROD-1789745654619-WNLHH"
 *  - "mock_user_12345"
 */
export function isRawUidOrId(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  if (s.length === 0) return false;

  // If it contains Arabic characters, it is legitimate readable Arabic text
  if (/[\u0600-\u06FF]/.test(s)) return false;

  // If it contains spaces, it's typically a multi-word company/person name
  if (s.includes(' ')) return false;

  // If it starts with common technical system prefixes
  if (/^(PROD-|mock_|usr_|user_)/i.test(s)) return true;

  // Firebase UIDs are typically 20-36 alphanumeric chars with mixed letters and numbers
  if (s.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(s) && /[0-9]/.test(s) && /[a-zA-Z]/.test(s)) {
    return true;
  }

  return false;
}

/**
 * Resolves a clean, user-friendly display name for a supplier,
 * ensuring no raw Firebase UIDs or database hashes are ever shown to the user.
 */
export function getSupplierDisplayName(
  supplier?: (Partial<Supplier> & { company?: string; companyAr?: string; fullName?: string }) | null,
  isAr: boolean = true,
  fallbackName?: string
): string {
  const defaultFallback = isAr ? 'مورد معتمد' : 'Certified Supplier';

  if (!supplier) {
    return fallbackName && !isRawUidOrId(fallbackName) ? fallbackName : defaultFallback;
  }

  // Check company / organization name first
  const company = isAr 
    ? (supplier.companyAr || supplier.company) 
    : (supplier.company || supplier.companyAr);

  if (company && !isRawUidOrId(company) && company.trim().length > 0) {
    return company.trim();
  }

  const primary = isAr ? supplier.nameAr : supplier.name;
  const secondary = isAr ? supplier.name : supplier.nameAr;

  if (primary && !isRawUidOrId(primary) && primary.trim().length > 0) {
    return primary.trim();
  }

  if (secondary && !isRawUidOrId(secondary) && secondary.trim().length > 0) {
    return secondary.trim();
  }

  if (supplier.fullName && !isRawUidOrId(supplier.fullName) && supplier.fullName.trim().length > 0) {
    return supplier.fullName.trim();
  }

  if (fallbackName && !isRawUidOrId(fallbackName) && fallbackName.trim().length > 0) {
    return fallbackName.trim();
  }

  return defaultFallback;
}

/**
 * Extracts a clean first-letter avatar initial for the supplier.
 */
export function getSupplierAvatarInitial(
  supplier?: (Partial<Supplier> & { company?: string; companyAr?: string }) | null,
  isAr: boolean = true
): string {
  const name = getSupplierDisplayName(supplier, isAr);
  const firstChar = name.trim().charAt(0);
  return firstChar ? firstChar.toUpperCase() : (isAr ? 'م' : 'S');
}
