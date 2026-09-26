// Фільтрація «мого розкладу»: підгрупа, «Збірна група» (англійська, ДВВС), сторонні дисципліни.
// «Збірна група» показується вся, доки користувач не приховає те, що не його.

import { weekdayIndex } from '../lib/dates.js';
import { isLanguage } from './parse.js';
import { compareLessons } from './lessons.js';

/**
 * Класифікатор записів «Збірна група»: 'language' | 'elective' | null.
 * departmentOf(teacherKey) — кафедра викладача, якщо відома (з obj_list), для евристики.
 */
export function makeClassifier(departmentOf = () => '') {
  return (lesson) => {
    if (lesson.kind !== 'lesson' || lesson.audience.kind !== 'mixed') return null;
    return isLanguage(lesson.title, departmentOf(lesson.teacher?.key)) ? 'language' : 'elective';
  };
}

/** Чи потрапляє пара під запис списку (та сама дисципліна; викладач — будь-який або конкретний). */
export function matchesElective(lesson, entries) {
  return entries.some((e) => e.titleKey === lesson.titleKey && (!e.teacherKey || e.teacherKey === lesson.teacher?.key));
}

/**
 * Розкладає пари групи на видимі й приховані за вибором користувача.
 * «Збірна група» за замовчуванням показується вся; у hidden потрапляє те, що користувач
 * позначив як «не моє», та інші викладачі іноземної, коли свого вибрано.
 * Пари іншої підгрупи просто відкидаються.
 */
export function filterForUser(lessons, prefs, classify) {
  const visible = [];
  const hidden = [];
  for (const lesson of lessons) {
    const verdict = decide(lesson, prefs, classify);
    if (verdict.show) visible.push({ ...lesson, why: verdict.why });
    else if (verdict.why !== 'other-subgroup') hidden.push({ ...lesson, why: verdict.why });
  }
  return { visible, hidden };
}

function decide(lesson, prefs, classify) {
  if (lesson.kind !== 'lesson') return { show: true, why: 'slot' };
  const { kind, subgroups } = lesson.audience;
  if (kind === 'subgroup') {
    const mine = prefs.subgroup == null || !subgroups.length || subgroups.includes(prefs.subgroup);
    return { show: mine, why: mine ? 'subgroup' : 'other-subgroup' };
  }
  if (kind === 'mixed') {
    if (classify(lesson) === 'language') {
      const teacher = prefs.englishTeacher;
      if (!teacher) return { show: true, why: 'language-any' };
      const mine = teacher.key === lesson.teacher?.key;
      return { show: mine, why: mine ? 'language' : 'other-language-teacher' };
    }
    if (matchesElective(lesson, prefs.hiddenElectives)) return { show: false, why: 'hidden-by-user' };
    return { show: true, why: 'mixed' };
  }
  return { show: true, why: '' };
}

/**
 * Пари сторонніх дисциплін (із розкладу викладача) додаються до «мого розкладу»,
 * якщо такої самої пари ще немає серед видимих.
 */
export function addExternal(visible, externalLessons) {
  const seen = new Set(visible.map(slotKey));
  const extra = [];
  for (const l of externalLessons) {
    const key = slotKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push({ ...l, why: 'external' });
  }
  return [...visible, ...extra].sort(compareLessons);
}

const slotKey = (l) => `${l.date}|${l.number}|${l.titleKey}|${l.teacher?.key ?? ''}`;

/** Номери підгруп, що трапляються в розкладі групи. */
export function listSubgroups(lessons) {
  const set = new Set();
  for (const l of lessons) if (l.audience.kind === 'subgroup') l.audience.subgroups.forEach((n) => set.add(n));
  return [...set].sort((a, b) => a - b);
}

/**
 * Каталог записів «Збірна група» з розкладу групи:
 *  languages — іноземні мови (вибір свого викладача);
 *  sections  — звичайні дисципліни групи, частину пар яких ведуть кілька викладачів паралельно
 *              (дисципліна є в розкладі ще й як потік / уся група / підгрупа — напр. лекція потоком,
 *              а лабораторні «Збірною групою» у різних викладачів);
 *  electives — трапляються лише як «Збірна група»: ймовірно, вибіркові (ДВВС).
 * Це евристика: передавайте розклад групи за весь період, а не за день.
 */
export function buildCatalog(lessons, classify) {
  const regular = new Set(lessons
    .filter((l) => l.kind === 'lesson' && l.audience.kind !== 'mixed')
    .map((l) => l.titleKey));
  const byTitle = new Map();
  for (const l of lessons) {
    let category = classify(l);
    if (!category) continue;
    if (category === 'elective' && regular.has(l.titleKey)) category = 'sections';
    let entry = byTitle.get(l.titleKey);
    if (!entry) {
      entry = { titleKey: l.titleKey, title: l.title, category, types: new Set(), teachers: new Map(), slots: new Map(), count: 0 };
      byTitle.set(l.titleKey, entry);
    }
    entry.count++;
    if (l.type.short) entry.types.add(l.type.short);
    addSlot(entry.slots, l);
    if (l.teacher) {
      let t = entry.teachers.get(l.teacher.key);
      if (!t) {
        t = { key: l.teacher.key, name: l.teacher.name, short: l.teacher.short, slots: new Map(), rooms: new Set(), types: new Set() };
        entry.teachers.set(l.teacher.key, t);
      }
      addSlot(t.slots, l);
      if (l.room) t.rooms.add(l.room.label);
      if (l.type.short) t.types.add(l.type.short);
    }
  }
  const entries = [...byTitle.values()].map((e) => ({
    ...e,
    types: [...e.types],
    slots: sortSlots(e.slots),
    teachers: [...e.teachers.values()]
      .map((t) => ({ ...t, slots: sortSlots(t.slots), rooms: [...t.rooms], types: [...t.types] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    likelyDvvs: e.category === 'elective' && looksLikeDvvs(e.slots),
  }));
  entries.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
  return {
    languages: entries.filter((e) => e.category === 'language'),
    sections: entries.filter((e) => e.category === 'sections'),
    electives: entries.filter((e) => e.category === 'elective'),
  };
}

function addSlot(map, l) {
  const weekday = weekdayIndex(l.date);
  map.set(`${weekday}|${l.number}`, { weekday, number: l.number });
}

function sortSlots(map) {
  return [...map.values()].sort((a, b) => a.weekday - b.weekday || a.number - b.number);
}

// На більшості факультетів ДВВС стоять на 3–4 парі вівторка й п'ятниці. Лише підказка.
function looksLikeDvvs(slots) {
  const list = [...slots.values()];
  return list.length > 0 && list.every((s) => (s.weekday === 1 || s.weekday === 4) && (s.number === 3 || s.number === 4));
}

/** Дисципліни викладача (для додавання сторонньої вибіркової). */
export function teacherDisciplines(lessons) {
  const map = new Map();
  for (const l of lessons) {
    if (l.kind !== 'lesson') continue;
    let d = map.get(l.titleKey);
    if (!d) {
      d = { titleKey: l.titleKey, title: l.title, types: new Set(), audiences: new Set(), groups: new Set(), slots: new Map() };
      map.set(l.titleKey, d);
    }
    if (l.type.short) d.types.add(l.type.short);
    if (l.audience.label) d.audiences.add(l.audience.label);
    l.groups.forEach((g) => d.groups.add(g));
    addSlot(d.slots, l);
  }
  return [...map.values()]
    .map((d) => ({ ...d, types: [...d.types], audiences: [...d.audiences], groups: [...d.groups], slots: sortSlots(d.slots) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'uk'));
}
