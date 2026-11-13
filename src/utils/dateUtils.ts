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

export const CAIRO_TIMEZONE = 'Africa/Cairo';

export const CAIRO_ARABIC_WEEKDAYS = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

const CAIRO_ENGLISH_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const CAIRO_ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const CAIRO_ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SHORT_WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface CairoDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  weekdayIndex: number; // 0 (Sunday) .. 6 (Saturday)
  dateKey: string; // YYYY-MM-DD
  weekdayAr: string;
  weekdayEn: string;
  formattedAr: string;
  formattedEn: string;
}

/**
 * Extracts calendar date components strictly in Africa/Cairo timezone
 * with exact Arabic weekday names: الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة، السبت.
 */
export function getCairoDailyDateParts(date: Date = new Date()): CairoDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

  const year = Number(getPart('year')) || date.getUTCFullYear();
  const month = Number(getPart('month')) || date.getUTCMonth() + 1;
  const day = Number(getPart('day')) || date.getUTCDate();
  const shortWeekday = getPart('weekday');
  const weekdayIndex = SHORT_WEEKDAY_TO_INDEX[shortWeekday] ?? date.getUTCDay();

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const dateKey = `${year}-${mm}-${dd}`;

  const weekdayAr = CAIRO_ARABIC_WEEKDAYS[weekdayIndex];
  const weekdayEn = CAIRO_ENGLISH_WEEKDAYS[weekdayIndex];
  const monthAr = CAIRO_ARABIC_MONTHS[month - 1] || '';
  const monthEn = CAIRO_ENGLISH_MONTHS[month - 1] || '';

  return {
    year,
    month,
    day,
    weekdayIndex,
    dateKey,
    weekdayAr,
    weekdayEn,
    formattedAr: `${weekdayAr}، ${day} ${monthAr} ${year}`,
    formattedEn: `${weekdayEn}, ${monthEn} ${day}, ${year}`,
  };
}

/**
 * Parses database timestamps (including SQLite UTC `YYYY-MM-DD HH:MM:SS` without timezone suffix)
 * safely into a Date instance.
 */
export function parseDatabaseTimestamp(raw?: string | null): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // SQLite datetime('now') -> "YYYY-MM-DD HH:MM:SS" (always UTC)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }

  // Date-only string -> "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats an actual backend `updated_at` timestamp in Africa/Cairo timezone.
 * Returns empty string if no valid timestamp exists.
 */
export function formatCairoUpdatedAtTimestamp(raw?: string | null, lang: 'ar' | 'en' = 'ar'): string {
  const date = parseDatabaseTimestamp(raw);
  if (!date) return '';

  const dateParts = getCairoDailyDateParts(date);
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const timeParts = timeFormatter.formatToParts(date);
  const hour = timeParts.find(p => p.type === 'hour')?.value || '00';
  const minute = timeParts.find(p => p.type === 'minute')?.value || '00';
  const dayPeriodRaw = (timeParts.find(p => p.type === 'dayPeriod')?.value || '').toUpperCase();

  if (lang === 'ar') {
    const periodAr = dayPeriodRaw === 'PM' ? 'م' : 'ص';
    return `${dateParts.day} ${CAIRO_ARABIC_MONTHS[dateParts.month - 1]} ${dateParts.year} · ${hour}:${minute} ${periodAr}`;
  }

  return `${CAIRO_ENGLISH_MONTHS[dateParts.month - 1]} ${dateParts.day}, ${dateParts.year} · ${hour}:${minute} ${dayPeriodRaw}`;
}

