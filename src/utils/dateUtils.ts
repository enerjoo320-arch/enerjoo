/**
 * Formats any date value (string with date & time, Date instance, or Firestore timestamp)
 * into a clean date-only string (e.g. YYYY-MM-DD), removing hours, minutes, and seconds.
 * 
 * Example:
 *   formatDateOnly("2026-09-18 15:40:18") => "2026-09-18"
 *   formatDateOnly("2026-09-18T15:40:18.000Z") => "2026-09-18"
 */
export function formatDateOnly(dateVal?: any): string {
  if (!dateVal) return '';

  // Firestore Timestamp or object with toDate()
  if (typeof dateVal === 'object' && typeof dateVal.toDate === 'function') {
    try {
      const d = dateVal.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch {
      // ignore and continue
    }
  }

  // Date instance
  if (dateVal instanceof Date) {
    if (!isNaN(dateVal.getTime())) {
      return dateVal.toISOString().split('T')[0];
    }
    return '';
  }

  const str = String(dateVal).trim();
  if (!str) return '';

  // 1. Matches ISO-like date prefix: "2026-09-18 15:40:18" or "2026-09-18T..."
  const isoMatch = str.match(/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // 2. Matches day-first format: "18/09/2026 15:40:18" or "18-09-2026 15:40:18"
  const dmyMatch = str.match(/^(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/);
  if (dmyMatch) {
    return dmyMatch[1];
  }

  // 3. If there is a space followed by time (e.g. "Sep 18, 2026 15:40:18" or "15:40")
  const strippedTime = str.replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*(?:AM|PM|am|pm|ص|م))?.*$/, '');
  if (strippedTime !== str && strippedTime.trim()) {
    return strippedTime.trim();
  }

  // 4. Fallback: try parsing as Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return str;
}
