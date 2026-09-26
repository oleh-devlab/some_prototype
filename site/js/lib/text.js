// Нормалізація тексту: пробіли, апострофи, латиниця, схожа на кирилицю.

const APOSTROPHES = /[`'’ʼ‘´]/g;

// Латинські літери, які в даних трапляються замість схожих кириличних
// (N10/Б, 129a/T тощо). Використовується лише для ключів пошуку/порівняння.
const LATIN_TO_CYR = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
  a: 'а', c: 'с', e: 'е', i: 'і', o: 'о', p: 'р', x: 'х', y: 'у',
};

/** Згортає всі пробільні символи (включно з NBSP) в один пробіл і обрізає краї. */
export function squish(value) {
  return String(value ?? '').replace(/[\s  -​  　]+/g, ' ').trim();
}

/** Текст для показу: апострофи -> ʼ, зайві пробіли прибрано. */
export function displayText(value) {
  return squish(value).replace(APOSTROPHES, 'ʼ');
}

/** Замінює латинські літери-двійники на кириличні (для аудиторій: 129a/T -> 129а/Т). */
export function cyrillicLookalikes(value) {
  return String(value ?? '').replace(/[A-Za-z]/g, (ch) => LATIN_TO_CYR[ch] ?? ch);
}

/** Ключ для порівняння та пошуку: нижній регістр, без апострофів, кирилиця замість латинських двійників. */
export function searchKey(value) {
  return squish(value)
    .normalize('NFC')
    .replace(APOSTROPHES, '')
    .replace(/[A-Za-z]/g, (ch) => LATIN_TO_CYR[ch] ?? ch)
    .toLowerCase()
    .replace(/ё/g, 'е');
}

/** Чи містить ключ (результат searchKey) усі слова запиту як підрядки. */
export function matchesQuery(haystackKey, query) {
  const words = searchKey(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  return words.every((w) => haystackKey.includes(w));
}

/** Українська множина: plural(3, ['пара', 'пари', 'пар']). */
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Короткий стабільний хеш рядка (FNV-1a, 32 біти) — для id записів. */
export function hash(value) {
  let h = 0x811c9dc5;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
