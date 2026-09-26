// Репозиторій розкладу поверх статичного data.json.
// Реалізує той самий інтерфейс, що й майбутній ApiRepository (див. repository.js),
// тому UI не знає, звідки прийшли дані.

import { addDays, isIsoDate, parseUaDate, startOfWeek } from '../lib/dates.js';
import { displayText, hash, searchKey } from '../lib/text.js';
import { parseGroupCode, parseRoom, parseTeacher } from '../domain/parse.js';
import { bellSchedule, compareLessons, inRange, mergeAcrossGroups } from '../domain/lessons.js';
import { parseObjList, parseSchedule } from './psrozklad.js';

const CACHE_KEY = 'lnu-rozklad:data-cache:v1';
const CACHE_MAX_CHARS = 2_000_000; // localStorage зазвичай ~5 МБ; більші знімки не кешуємо

/**
 * Приводить data.json до «пакета» (bundle). Підтримуються:
 *  1) сирий експорт деканату { psrozklad_export: { roz_items, code } } — розклад однієї чи кількох груп;
 *  2) масив таких експортів;
 *  3) пакет { format: 'lnu-rozklad-bundle/1', generated_at, range, lists: {group, teacher, room}, schedules: [...] }.
 */
export function toBundle(json) {
  if (Array.isArray(json)) {
    return { format: 'raw', schedules: json.map((e) => ({ mode: 'group', export: e })) };
  }
  if (json && Array.isArray(json.schedules)) return { ...json, format: 'bundle' };
  if (json && json.psrozklad_export) return { format: 'raw', schedules: [{ mode: 'group', export: json }] };
  throw new Error('Невідомий формат data.json');
}

function parseRange(range) {
  if (!range) return null;
  const norm = (v) => (isIsoDate(v) ? v : parseUaDate(v));
  const from = norm(range.from);
  const to = norm(range.to);
  return from && to ? { from, to } : null;
}

/** Будує індекси (групи, аудиторії, викладачі) з розібраного data.json. Чиста функція. */
export function buildIndex(json, info = {}) {
  const bundle = toBundle(json);
  const groups = new Map();
  const groupIdByName = new Map();
  const groupLessons = new Map();
  const teachers = new Map();
  const rooms = new Map();
  const extraTeacherLessons = [];
  const extraRoomLessons = [];
  const errors = [];

  const ensureGroup = ({ id, name, faculty = '', listed = false }) => {
    const nameKey = searchKey(name);
    const existingId = (id && groups.has(id) ? id : null) ?? groupIdByName.get(nameKey);
    if (existingId) {
      const g = groups.get(existingId);
      if (faculty && !g.faculty) g.faculty = faculty;
      if (listed) g.listed = true;
      return g;
    }
    const g = {
      id: id || `name:${name}`,
      name,
      faculty,
      listed,
      hint: parseGroupCode(name),
      status: 'missing',
      statusCode: null,
      statusMessage: 'Немає даних у цьому знімку',
      fetchedAt: null,
    };
    groups.set(g.id, g);
    groupIdByName.set(nameKey, g.id);
    return g;
  };

  const addTeacher = (parsed, extra = {}) => {
    if (!parsed) return null;
    let t = teachers.get(parsed.key);
    if (!t) {
      t = { key: parsed.key, id: null, name: parsed.name, short: parsed.short, position: parsed.position, department: '' };
      teachers.set(parsed.key, t);
    }
    if (extra.id && !t.id) t.id = extra.id;
    if (extra.department && !t.department) t.department = extra.department;
    if (parsed.position && !t.position) t.position = parsed.position;
    return t;
  };

  const addRoom = (parsed, extra = {}) => {
    if (!parsed) return null;
    let r = rooms.get(parsed.key);
    if (!r) {
      r = { key: parsed.key, id: null, label: parsed.label, building: parsed.building, lab: parsed.lab, buildingName: '' };
      rooms.set(parsed.key, r);
    }
    if (extra.id && !r.id) r.id = extra.id;
    if (extra.buildingName && !r.buildingName) r.buildingName = extra.buildingName;
    return r;
  };

  const lists = bundle.lists ?? {};
  for (const dep of parseObjList(lists.group)) {
    for (const o of dep.objects) ensureGroup({ id: o.id, name: o.name, faculty: dep.department, listed: true });
  }
  for (const dep of parseObjList(lists.teacher)) {
    for (const o of dep.objects) addTeacher(parseTeacher(o.name), { id: o.id, department: dep.department });
  }
  for (const dep of parseObjList(lists.room)) {
    for (const o of dep.objects) addRoom(parseRoom(o.name), { id: o.id, buildingName: dep.department });
  }
  const hasGroupList = parseObjList(lists.group).length > 0;

  for (const s of bundle.schedules ?? []) {
    const mode = s.mode ?? 'group';
    const ctx = { mode, objectId: s.id ? String(s.id) : null, objectName: displayText(s.name) };
    const { status, lessons } = parseSchedule(s.export ?? s, ctx);
    const fetchedAt = s.fetched_at ?? null;

    if (mode === 'group') {
      // Сирий експорт може містити кілька груп — ділимо за полем object.
      const byName = new Map();
      if (ctx.objectName) byName.set(ctx.objectName, []);
      for (const l of lessons) {
        const name = l.groups[0] || ctx.objectName;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(l);
      }
      if (!byName.size && !status.ok) errors.push(`Розклад без назви об'єкта: ${status.message} (код ${status.code})`);
      for (const [name, list] of byName) {
        const g = ensureGroup({ id: ctx.objectId, name });
        g.status = status.status === 'ok' && !list.length ? 'empty' : status.status;
        g.statusCode = status.code;
        g.statusMessage = status.status === 'ok' && !list.length ? 'Пар не знайдено' : status.message;
        g.fetchedAt = fetchedAt;
        const target = groupLessons.get(g.id) ?? [];
        target.push(...list);
        groupLessons.set(g.id, target);
      }
    } else if (mode === 'teacher') {
      addTeacher(parseTeacher(ctx.objectName));
      extraTeacherLessons.push(...lessons);
    } else if (mode === 'room') {
      addRoom(parseRoom(ctx.objectName));
      extraRoomLessons.push(...lessons);
    }
  }

  // Інвертовані індекси: аудиторія/викладач -> пари з усіх наявних розкладів.
  const allGroupLessons = [];
  for (const list of groupLessons.values()) {
    list.sort(compareLessons);
    allGroupLessons.push(...list);
  }
  const roomLists = new Map();
  const teacherLists = new Map();
  const push = (map, key, lesson) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(lesson);
  };
  for (const l of [...allGroupLessons, ...extraRoomLessons, ...extraTeacherLessons]) {
    if (l.room) {
      addRoom(l.room);
      push(roomLists, l.room.key, l);
    }
    for (const t of [l.teacher, ...l.extraTeachers].filter(Boolean)) {
      addTeacher(t);
      push(teacherLists, t.key, l);
    }
  }
  const roomIndex = new Map([...roomLists].map(([k, list]) => [k, mergeAcrossGroups(list)]));
  const teacherIndex = new Map([...teacherLists].map(([k, list]) => [k, mergeAcrossGroups(list)]));
  for (const [k, list] of roomIndex) rooms.get(k).lessonsCount = list.length;
  for (const [k, list] of teacherIndex) teachers.get(k).lessonsCount = list.length;

  // Діапазон дат знімка: явно з пакета або тижні, що покривають наявні пари.
  const dates = allGroupLessons.map((l) => l.date).sort();
  const range = parseRange(bundle.range)
    ?? (dates.length ? { from: startOfWeek(dates[0]), to: addDays(startOfWeek(dates[dates.length - 1]), 6) } : null);

  const groupList = [...groups.values()];
  const loaded = groupList.filter((g) => g.status === 'ok' || g.status === 'empty');
  const listedCount = groupList.filter((g) => g.listed).length;
  const coverage = {
    groupsTotal: hasGroupList ? listedCount : null,
    groupsLoaded: loaded.length,
    loadedNames: loaded.map((g) => g.name).sort((a, b) => a.localeCompare(b, 'uk')),
    complete: hasGroupList && groupList.every((g) => !g.listed || g.status === 'ok' || g.status === 'empty'),
    hasTeacherSchedules: extraTeacherLessons.length > 0,
  };

  return {
    meta: {
      source: 'static',
      format: bundle.format,
      generatedAt: bundle.generated_at ?? info.lastModified ?? null,
      range,
      coverage,
      errors,
      offline: Boolean(info.offline),
      cachedAt: info.cachedAt ?? null,
      bells: bellSchedule(allGroupLessons),
      lessonDates: [...new Set(dates)],
    },
    groups,
    groupIdByName,
    groupLessons,
    teachers,
    rooms,
    roomIndex,
    teacherIndex,
  };
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class StaticRepository {
  #url;
  #index = null;
  #loading = null;
  #signature = null;
  loadedAt = 0;

  constructor({ url = 'data.json' } = {}) {
    this.#url = url;
  }

  /** Завантажує data.json (один раз). Без мережі — остання збережена копія. */
  load() {
    if (!this.#loading) {
      this.#loading = this.#fetchAndBuild().catch((err) => {
        this.#loading = null;
        throw err;
      });
    }
    return this.#loading;
  }

  /** Перевіряє, чи оновився data.json на сервері. true — якщо дані змінилися. */
  async refresh() {
    const before = this.#signature;
    try {
      await this.#fetchAndBuild({ quiet: true });
    } catch {
      return false;
    }
    return before !== this.#signature;
  }

  async #fetchAndBuild({ quiet = false } = {}) {
    let text;
    let lastModified = null;
    let offline = false;
    let cachedAt = null;
    try {
      // no-cache: браузер щоразу ревалідує файл (If-Modified-Since/ETag від nginx), тож оновлення підхоплюються.
      const res = await fetch(this.#url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      lastModified = toIsoDateTime(res.headers.get('Last-Modified'));
      writeCache({ text, lastModified, savedAt: new Date().toISOString() });
    } catch (err) {
      if (quiet && this.#index) throw err;
      const cached = readCache();
      if (!cached) throw new Error(`Не вдалося завантажити ${this.#url}: ${err.message}`);
      ({ text, lastModified } = cached);
      cachedAt = cached.savedAt;
      offline = true;
    }
    const signature = hash(text);
    if (quiet && signature === this.#signature) return this.#index;
    const json = JSON.parse(text);
    this.#index = buildIndex(json, { lastModified, offline, cachedAt });
    this.#signature = signature;
    this.loadedAt = Date.now();
    return this.#index;
  }

  async #idx() {
    return this.#index ?? this.load();
  }

  async getMeta() {
    return (await this.#idx()).meta;
  }

  async listGroups() {
    return [...(await this.#idx()).groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }

  /** Пошук групи за збереженим вибором: спершу за id, потім за назвою (id можуть змінитися між джерелами). */
  async findGroup({ id, name } = {}) {
    const idx = await this.#idx();
    if (id && idx.groups.has(id)) return idx.groups.get(id);
    const byName = name ? idx.groupIdByName.get(searchKey(name)) : null;
    return byName ? idx.groups.get(byName) : null;
  }

  async getGroupSchedule(groupId, range) {
    const idx = await this.#idx();
    const group = idx.groups.get(groupId) ?? null;
    const lessons = (idx.groupLessons.get(groupId) ?? []).filter((l) => inRange(l, range));
    return { group, lessons };
  }

  async listRooms() {
    return [...(await this.#idx()).rooms.values()];
  }

  async getRoomSchedule(roomKey, range) {
    const idx = await this.#idx();
    return {
      room: idx.rooms.get(roomKey) ?? null,
      lessons: (idx.roomIndex.get(roomKey) ?? []).filter((l) => inRange(l, range)),
    };
  }

  async listTeachers() {
    return [...(await this.#idx()).teachers.values()];
  }

  async getTeacherSchedule(teacherKey, range) {
    const idx = await this.#idx();
    return {
      teacher: idx.teachers.get(teacherKey) ?? null,
      lessons: (idx.teacherIndex.get(teacherKey) ?? []).filter((l) => inRange(l, range)),
    };
  }
}

function toIsoDateTime(httpDate) {
  if (!httpDate) return null;
  const d = new Date(httpDate);
  // Сервер деканату віддає Last-Modified 1970 — такі значення ігноруємо.
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d.toISOString();
}

function writeCache(entry) {
  if (entry.text.length > CACHE_MAX_CHARS) return;
  try {
    storage()?.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // квота або приватний режим — кеш необов'язковий
  }
}

function readCache() {
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

