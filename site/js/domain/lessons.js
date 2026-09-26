// Внутрішня модель пари (Lesson) і операції над списками пар.
// UI працює тільки з цією моделлю, а не з сирими записами деканату.

import { parseUaDate, toMinutes } from '../lib/dates.js';
import { displayText, hash } from '../lib/text.js';
import {
  lessonType, normalizeTitle, parseAudience, parseLessonTime, parseRoom,
  parseTeacher, parseTeacherList, safeUrl, titleKey,
} from './parse.js';

/**
 * @typedef {Object} Lesson
 * @property {string} id        стабільний хеш ключових полів (для diff/сповіщень у майбутньому)
 * @property {string} date      'YYYY-MM-DD'
 * @property {number} number    номер пари
 * @property {string} start     'HH:MM'
 * @property {string} end       'HH:MM'
 * @property {string} title     нормалізована назва ('' для бронювань і слотів без назви)
 * @property {string} titleKey
 * @property {'lesson'|'reserved'|'untitled'} kind
 * @property {string} reservation
 * @property {{code:string, short:string, label:string, tone:string}} type
 * @property {?{name:string, short:string, position:string, key:string}} teacher
 * @property {Array} extraTeachers
 * @property {?{label:string, key:string, building:string, lab:boolean}} room
 * @property {{kind:string, subgroups:number[], label:string}} audience
 * @property {string[]} groups   назви груп (для групового розкладу — одна)
 * @property {string} replacement
 * @property {string} online
 * @property {?string} link
 * @property {string} linkText
 * @property {string} comment
 * @property {string} half
 */

/**
 * Сирий запис roz_items -> Lesson.
 * ctx.mode — чий це розклад ('group' | 'teacher' | 'room'); ctx.objectName — назва об'єкта.
 */
export function normalizeRozItem(item, ctx = {}) {
  const mode = ctx.mode ?? 'group';
  const objectName = displayText(item.object || ctx.objectName);
  const date = parseUaDate(item.date);
  if (!date) return null;

  const { start, end } = parseLessonTime(item.lesson_time);
  const number = Number.parseInt(item.lesson_number, 10) || 0;
  const title = normalizeTitle(item.title);
  const reservation = displayText(item.reservation);
  let teacher = parseTeacher(item.teacher);
  let room = parseRoom(item.room);
  if (!teacher && mode === 'teacher') teacher = parseTeacher(objectName);
  if (!room && mode === 'room') room = parseRoom(objectName);
  const audience = parseAudience(item.group);
  const kind = title ? 'lesson' : reservation ? 'reserved' : 'untitled';
  const groups = mode === 'group' && objectName ? [objectName] : [];

  const lesson = {
    id: '',
    date,
    number,
    numberLabel: displayText(item.lesson_name) || String(number),
    start,
    end,
    title,
    titleKey: titleKey(title || reservation),
    kind,
    reservation,
    type: lessonType(item.type),
    teacher,
    extraTeachers: parseTeacherList(item.teachers_add),
    room,
    audience,
    groups,
    replacement: displayText(item.replacement),
    online: displayText(item.online),
    link: safeUrl(item.link),
    linkText: displayText(item.comment4link),
    comment: displayText(item.comment),
    half: displayText(item.half),
  };
  lesson.id = hash([
    groups.join(','), date, number, lesson.titleKey, lesson.type.code,
    teacher?.key ?? '', room?.key ?? '', audience.raw, reservation,
  ].join('|'));
  return lesson;
}

export function compareLessons(a, b) {
  return a.date.localeCompare(b.date)
    || a.number - b.number
    || (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0)
    || (a.audience.subgroups[0] ?? 0) - (b.audience.subgroups[0] ?? 0)
    || a.title.localeCompare(b.title, 'uk');
}

export function inRange(lesson, range) {
  if (!range) return true;
  return (!range.from || lesson.date >= range.from) && (!range.to || lesson.date <= range.to);
}

/** Ключ «та сама пара», незалежно від того, з розкладу якої групи вона прийшла. */
export function sameLessonKey(l) {
  return [l.date, l.number, l.titleKey, l.type.code, l.teacher?.key ?? '', l.room?.key ?? '', l.reservation].join('|');
}

/**
 * Об'єднує однакові пари з різних групових розкладів (потокова лекція
 * у п'яти групах -> одна пара з п'ятьма групами). Для режимів «аудиторія» і «викладач».
 */
export function mergeAcrossGroups(lessons) {
  const byKey = new Map();
  for (const l of lessons) {
    const key = sameLessonKey(l);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...l, groups: [...l.groups], audiences: [l.audience] });
      continue;
    }
    for (const g of l.groups) if (!existing.groups.includes(g)) existing.groups.push(g);
    existing.audiences.push(l.audience);
  }
  const merged = [...byKey.values()];
  for (const l of merged) l.groups.sort((a, b) => a.localeCompare(b, 'uk'));
  return merged.sort(compareLessons);
}

/** Групування за датою: Map<'YYYY-MM-DD', Lesson[]> у порядку дат. */
export function groupByDate(lessons) {
  const map = new Map();
  for (const l of [...lessons].sort(compareLessons)) {
    if (!map.has(l.date)) map.set(l.date, []);
    map.get(l.date).push(l);
  }
  return map;
}

/** Групування пар дня за слотом (номером пари). */
export function groupBySlot(lessons) {
  const slots = [];
  for (const l of [...lessons].sort(compareLessons)) {
    const last = slots[slots.length - 1];
    if (last && last.number === l.number) {
      last.lessons.push(l);
      if (l.start && (!last.start || l.start < last.start)) last.start = l.start;
      if (l.end && l.end > last.end) last.end = l.end;
    } else {
      slots.push({ number: l.number, start: l.start, end: l.end, lessons: [l] });
    }
  }
  return slots;
}

/** Найчастіший час для кожного номера пари — «дзвінки» з даних, без хардкоду. */
export function bellSchedule(lessons) {
  const counts = new Map();
  for (const l of lessons) {
    if (!l.number || !l.start) continue;
    const key = `${l.number}|${l.start}|${l.end}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = new Map();
  for (const [key, count] of counts) {
    const [number, start, end] = key.split('|');
    const n = Number(number);
    if (!best.has(n) || best.get(n).count < count) best.set(n, { number: n, start, end, count });
  }
  return [...best.values()].sort((a, b) => a.number - b.number).map(({ number, start, end }) => ({ number, start, end }));
}
