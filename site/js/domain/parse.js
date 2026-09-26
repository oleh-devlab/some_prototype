// Розбір окремих полів запису «ПС-Розклад». Чисті функції без доступу до DOM/мережі.

import { cyrillicLookalikes, displayText, searchKey, squish } from '../lib/text.js';

/**
 * Назва дисципліни: зайві пробіли, пробіл перед розділовим знаком,
 * «висячий» знак у кінці («… сервера .» -> «… сервера»).
 */
export function normalizeTitle(raw) {
  return displayText(raw)
    .replace(/\s+[.,;:]+$/, '')
    .replace(/\s+([,;:])/g, '$1');
}

/** Ключ дисципліни для порівняння (ігнорує регістр і кінцеві розділові знаки). */
export function titleKey(title) {
  return searchKey(title).replace(/[\s.,;:]+$/, '');
}

/**
 * Аудиторія: «<номер>/<корпус>» з можливим префіксом лабораторії (№8/Б, N10/Б)
 * і пробілами/NBSP на початку. Префікси № і N вважаємо одним і тим самим
 * позначенням лабораторії; «5/Б» і «№5/Б» — різні приміщення.
 */
export function parseRoom(raw) {
  const text = cyrillicLookalikes(squish(raw));
  if (!text) return null;
  const labMatch = /^(?:№|N[оoº°]?\.?)\s*(?=\d)/i.exec(text);
  const lab = Boolean(labMatch);
  const rest = labMatch ? text.slice(labMatch[0].length) : text;
  const slash = rest.lastIndexOf('/');
  const number = squish(slash >= 0 ? rest.slice(0, slash) : rest);
  const building = squish(slash >= 0 ? rest.slice(slash + 1) : '').toUpperCase();
  const label = `${lab ? '№' : ''}${number}${building ? `/${building}` : ''}`;
  return { raw: squish(raw), label, number, building, lab, key: searchKey(label) };
}

const NAME_WORD = /^\p{Lu}/u;

/**
 * Викладач: у полі разом посада і ПІБ («доцент Горон Богдан Ігорович»,
 * «в.о. зав. кафедрою …»). ПІБ — до трьох останніх слів з великої літери.
 */
export function parseTeacher(raw) {
  const text = displayText(raw);
  if (!text) return null;
  const words = text.split(' ');
  let start = words.length;
  while (start > 0 && words.length - start < 3 && NAME_WORD.test(words[start - 1])) start--;
  if (start === words.length) start = Math.max(0, words.length - 3);
  const nameWords = words.slice(start).map(cleanNameWord);
  const name = nameWords.join(' ');
  const [surname, ...given] = nameWords;
  const initials = given.map((w) => (/^\p{Lu}\.$/u.test(w) ? w : `${w[0]}.`));
  return {
    raw: text,
    position: words.slice(0, start).join(' '),
    name,
    short: [surname, initials.join(' ')].filter(Boolean).join(' '),
    key: searchKey(name),
  };
}

// «Горон.» -> «Горон», але ініціали («Б.», «Б.З.») не чіпаємо.
function cleanNameWord(word) {
  if (word.length > 2 && !word.slice(0, -1).includes('.')) return word.replace(/[.,;:]+$/, '');
  return word.replace(/[,;:]+$/, '');
}

/** Поле teachers_add: кілька викладачів через кому або крапку з комою. */
export function parseTeacherList(raw) {
  return squish(raw)
    .split(/\s*[;,]\s*/)
    .map(parseTeacher)
    .filter(Boolean);
}

/**
 * Поле `group` описує склад учасників пари:
 *  subgroup — «(підгр. 1)»; stream — «Потік»; mixed — «Збірна група»;
 *  whole — порожньо (уся група); other — будь-що інше (показуємо як є).
 */
export function parseAudience(raw) {
  const text = displayText(raw);
  const key = searchKey(text);
  if (!text) return { kind: 'whole', subgroups: [], label: '', raw: '' };
  if (key.includes('підгр')) {
    const subgroups = (key.match(/\d+/g) ?? []).map(Number);
    return { kind: 'subgroup', subgroups, label: text.replace(/^\((.*)\)$/, '$1'), raw: text };
  }
  if (key.startsWith('потік')) return { kind: 'stream', subgroups: [], label: 'Потік', raw: text };
  if (key.includes('збірн')) return { kind: 'mixed', subgroups: [], label: 'Збірна група', raw: text };
  return { kind: 'other', subgroups: [], label: text, raw: text };
}

const LESSON_TYPES = {
  'л': ['Л', 'Лекція', 'lecture'],
  'лек': ['Л', 'Лекція', 'lecture'],
  'лаб': ['Лаб', 'Лабораторна', 'lab'],
  'прс': ['ПрС', 'Практичне / семінар', 'practice'],
  'пр': ['Пр', 'Практичне', 'practice'],
  'пз': ['Пр', 'Практичне', 'practice'],
  'с': ['С', 'Семінар', 'practice'],
  'сем': ['С', 'Семінар', 'practice'],
  'конс': ['Конс', 'Консультація', 'control'],
  'екз': ['Екз', 'Екзамен', 'control'],
  'зал': ['Зал', 'Залік', 'control'],
  'мк': ['МК', 'Модульний контроль', 'control'],
  'кр': ['КР', 'Контрольна робота', 'control'],
};

/** Тип заняття: коротка мітка, розшифровка і «тон» для кольору. */
export function lessonType(raw) {
  const text = squish(raw);
  const known = LESSON_TYPES[searchKey(text).replace(/\.$/, '')];
  if (known) return { code: text, short: known[0], label: known[1], tone: known[2] };
  return { code: text, short: text, label: text, tone: text ? 'other' : 'none' };
}

/** 'HH:MM-HH:MM' -> { start, end }. */
export function parseLessonTime(raw) {
  const m = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/.exec(squish(raw));
  if (!m) return { start: '', end: '' };
  const pad = (t) => t.padStart(5, '0');
  return { start: pad(m[1]), end: pad(m[2]) };
}

/**
 * Необовʼязкова «підказка» з шифру групи (ФЕІ-21с -> курс 2, група 1, денна).
 * На неї нічого не спирається: шифри інших факультетів можуть бути іншими.
 */
export function parseGroupCode(name) {
  const m = /^\s*(\p{Lu}+)-(\d)(\d+)(\p{Ll}*)\s*$/u.exec(displayText(name));
  if (!m) return null;
  const [, series, course, number, suffix] = m;
  const form = /^с/.test(suffix) ? 'денна' : /^з/.test(suffix) ? 'заочна' : null;
  // ФЕІМ, ФЕЛМ — ймовірно магістратура; ФЕМ (3 літери) — бакалаврат.
  const master = series.length >= 4 && series.endsWith('М');
  return { series, course: Number(course), number: Number(number), form, master };
}

export function describeGroupCode(hint) {
  if (!hint) return '';
  return [
    hint.master ? `${hint.course} курс магістратури?` : `${hint.course} курс`,
    hint.form,
  ].filter(Boolean).join(' · ');
}

const LANGUAGE_TITLE = /іноземн\S*\s+мов|англійськ|англ\.|німецьк\S*\s+мов|французьк\S*\s+мов|польськ\S*\s+мов|english|foreign/;
const LANGUAGE_DEPARTMENT = /іноземн|англійськ/;

/** Евристика «це іноземна мова»: за назвою або за кафедрою викладача. */
export function isLanguage(title, department = '') {
  const lower = (value) => displayText(value).toLowerCase();
  return LANGUAGE_TITLE.test(lower(title)) || (department ? LANGUAGE_DEPARTMENT.test(lower(department)) : false);
}

/** Лише http(s)-посилання можна робити клікабельними. */
export function safeUrl(raw) {
  const text = squish(raw);
  if (!text) return null;
  try {
    const url = new URL(/^[a-z]+:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
