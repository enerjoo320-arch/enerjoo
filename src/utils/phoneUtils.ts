/**
 * Egyptian Phone Number Utilities for Enerjoo
 */

/**
 * Normalizes input Egyptian phone numbers to international E.164 standard (+201XXXXXXXXX)
 * Supports inputs like: "01012345678", "+201012345678", "201012345678", "010 1234 5678", "٠١٠١٢٣٤٥٦٧٨"
 */
export function normalizeEgyptianPhone(input: string): string {
  if (!input) return '';

  // 1. Convert Eastern Arabic numerals (٠-٩) to Western (0-9)
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let clean = input.trim();
  for (let i = 0; i < 10; i++) {
    clean = clean.split(arabicDigits[i]).join(i.toString());
  }

  // 2. Strip all non-digit characters except leading plus
  clean = clean.replace(/[^0-9+]/g, '');

  // 3. Remove leading '+' if present for uniform parsing
  if (clean.startsWith('+')) {
    clean = clean.substring(1);
  }

  // 4. Handle leading '002' or '00'
  if (clean.startsWith('0020')) {
    clean = clean.substring(2); // becomes 201...
  } else if (clean.startsWith('00')) {
    clean = clean.substring(2);
  }

  // 5. Convert standard local format (01xxxxxxxxx) to international 201xxxxxxxxx
  if (clean.startsWith('01') && clean.length === 11) {
    clean = '20' + clean.substring(1); // '20' + '1012345678'
  } else if (clean.startsWith('1') && clean.length === 10) {
    clean = '20' + clean;
  }

  // Return standard with '+' prefix
  return '+' + clean;
}

/**
 * Validates whether the given string is a valid Egyptian mobile phone number.
 * Valid network prefixes: 010 (Vodafone), 011 (Etisalat), 012 (Orange), 015 (WE)
 */
export function isValidEgyptianPhone(input: string): boolean {
  if (!input) return false;
  const normalized = normalizeEgyptianPhone(input);
  // Valid E.164 for Egypt mobile: +20 followed by 10, 11, 12, or 15 and 8 digits (total 13 chars)
  const egRegex = /^\+201[0125][0-9]{8}$/;
  return egRegex.test(normalized);
}

/**
 * Formats Egyptian phone number for localized display (e.g., "010 1234 5678" or "+20 10 1234 5678")
 */
export function formatEgyptianPhoneDisplay(input: string, preferInternational = false): string {
  if (!input) return '';
  const normalized = normalizeEgyptianPhone(input);
  if (!isValidEgyptianPhone(normalized)) return input;

  // Format: +20 10 1234 5678
  const digits = normalized.replace('+', ''); // 201012345678
  if (preferInternational) {
    return `+20 ${digits.substring(2, 4)} ${digits.substring(4, 8)} ${digits.substring(8)}`;
  } else {
    // Local: 010 1234 5678
    return `0${digits.substring(2, 4)} ${digits.substring(4, 8)} ${digits.substring(8)}`;
  }
}
