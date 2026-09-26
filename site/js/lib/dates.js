// Дати всередині застосунку — рядки ISO 'YYYY-MM-DD' у локальному часі.

const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WEEKDAYS = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота', 'неділя'];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

let nowOverride = null;

/** Для демо й перевірки: ?now=2026-09-28T10:30 у URL «переводить годинник». */
export function setNowOverride(value) {
  const d = value ? new Date(value) : null;
  nowOverride = d && !Number.isNaN(d.getTime()) ? d : null;
}

export function now() {
  return nowOverride ? new Date(nowOverride.getTime()) : new Date();
}

const pad = (n) => String(n).padStart(2, '0');

export function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso() {
  return toIso(now());
}

export function fromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(fromIso(value).getTime());
}

/** '28.09.2026' -> '2026-09-28'; некоректне значення -> null. */
export function parseUaDate(value) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(String(value ?? ''));
  if (!m) return null;
  return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
}

/** '2026-09-28' -> '28.09.2026' (формат параметрів begin_date/end_date деканату). */
export function toUaDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** 0 = понеділок … 6 = неділя. */
export function weekdayIndex(iso) {
  return (fromIso(iso).getDay() + 6) % 7;
}

export function startOfWeek(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDays(iso) {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDayLong(iso) {
  const d = fromIso(iso);
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function formatDateShort(iso) {
  const d = fromIso(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function formatWeekRange(iso) {
  const start = startOfWeek(iso);
  const end = addDays(start, 6);
  return `${formatDateShort(start)} – ${formatDateShort(end)}`;
}

export function weekdayShort(iso) {
  return WEEKDAYS_SHORT[weekdayIndex(iso)];
}

/** Коротка назва дня за індексом 0 = Пн … 6 = Нд. */
export function weekdayShortByIndex(i) {
  return WEEKDAYS_SHORT[i] ?? '';
}

/** 'HH:MM' -> хвилини від початку доби; некоректне значення -> null. */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesNow() {
  const d = now();
  return d.getHours() * 60 + d.getMinutes();
}

/** Відносна підпис дня: «сьогодні», «завтра», «вчора» або null. */
export function relativeDayLabel(iso) {
  const today = todayIso();
  if (iso === today) return 'сьогодні';
  if (iso === addDays(today, 1)) return 'завтра';
  if (iso === addDays(today, -1)) return 'вчора';
  return null;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} хв`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}
