/**
 * Dimension and Numeric Formatting Utilities for Enerjoo Solar Platform.
 * Prevents IEEE-754 floating point artifacts such as 1.5150000000000001
 * or 3.1060000000000003 while maintaining full mathematical precision.
 */

/**
 * Formats a number cleanly, stripping floating point noise like 1.5150000000000001
 * without leaving trailing zeroes (e.g. 1.5150000000000001 -> "1.515", 2384.00 -> "2384").
 */
export function formatCleanNumber(num: number | string | undefined | null, maxDecimals = 3): string {
  if (num === undefined || num === null || num === '') return '';
  const n = typeof num === 'number' ? num : parseFloat(String(num));
  if (isNaN(n)) return String(num).trim();
  // toFixed eliminates floating point noise like 1.5150000000000001
  return parseFloat(n.toFixed(maxDecimals)).toString();
}

/**
 * Returns a clean numeric float rounded to maxDecimals places.
 */
export function cleanDecimal(num: number | string | undefined | null, maxDecimals = 4): number {
  if (num === undefined || num === null || num === '') return 0;
  const n = typeof num === 'number' ? num : parseFloat(String(num));
  if (isNaN(n)) return 0;
  return parseFloat(n.toFixed(maxDecimals));
}

/**
 * Calculates area in m² cleanly from length and width in mm, cm, or m.
 */
export function calculateMetricArea(
  length: number,
  width: number,
  unit: 'mm' | 'cm' | 'm' = 'mm'
): {
  lengthInM: number;
  widthInM: number;
  areaInM2: number;
  conversionText: string;
} {
  let factor = 1;
  if (unit === 'mm') factor = 0.001;
  else if (unit === 'cm') factor = 0.01;

  // Use precision multiplication to prevent 1515 * 0.001 = 1.5150000000000001
  const lengthInM = parseFloat((length * factor).toFixed(4));
  const widthInM = parseFloat((width * factor).toFixed(4));
  const rawArea = lengthInM * widthInM;
  const areaInM2 = parseFloat(rawArea.toFixed(4));

  const lClean = formatCleanNumber(lengthInM, 3);
  const wClean = formatCleanNumber(widthInM, 3);
  const aClean = formatCleanNumber(areaInM2, 3);

  let conversionText = '';
  if (unit === 'mm' || unit === 'cm') {
    conversionText = `${lClean} × ${wClean} = ${aClean} m²`;
  } else {
    conversionText = `${formatCleanNumber(length, 3)} × ${formatCleanNumber(width, 3)} = ${aClean} m²`;
  }

  return {
    lengthInM,
    widthInM,
    areaInM2,
    conversionText
  };
}
