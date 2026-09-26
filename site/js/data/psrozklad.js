// Адаптер формату експорту «ПС-Розклад v4» (timetable_export.cgi, req_format=json).
// Тільки розбір уже отриманих відповідей — жодних запитів до деканату.

import { displayText } from '../lib/text.js';
import { normalizeRozItem } from '../domain/lessons.js';

/**
 * Помилки приходять не HTTP-статусом, а полем code.
 * keepPrevious — чи має майбутній збирач зберегти попередній знімок замість цієї відповіді.
 */
const CODES = {
  '0': { status: 'ok', message: '' },
  '-2': { status: 'closed', message: 'Розклад ще складається й закритий для перегляду', keepPrevious: true },
  '-3': { status: 'closed', message: 'Розклад ще складається й закритий для перегляду', keepPrevious: true },
  '-4': { status: 'empty', message: 'Пар не знайдено' },
  '-8': { status: 'paused', message: 'Модуль розкладу тимчасово на паузі через навантаження', keepPrevious: true },
  '-70': { status: 'error', message: 'Помилка в датах запиту', keepPrevious: true },
};

export function exportStatus(code) {
  const key = String(code ?? '0').trim() || '0';
  const known = CODES[key] ?? { status: 'error', message: `Помилка експорту (код ${key})`, keepPrevious: true };
  return { code: key, keepPrevious: false, ...known, ok: known.status === 'ok' || known.status === 'empty' };
}

function envelope(json) {
  return json && typeof json === 'object' && json.psrozklad_export ? json.psrozklad_export : json ?? {};
}

/** obj_list -> [{ department, objects: [{ id, name }] }]. Кафедри для викладачів, корпуси для аудиторій. */
export function parseObjList(json) {
  const body = envelope(json);
  return (body.departments ?? []).map((dep) => ({
    department: displayText(dep.name),
    objects: (dep.objects ?? []).map((o) => ({ id: String(o.ID ?? o.id ?? ''), name: displayText(o.name) })),
  }));
}

/**
 * rozklad -> { status, lessons }.
 * ctx: { mode: 'group'|'teacher'|'room', objectId, objectName }.
 */
export function parseSchedule(json, ctx = {}) {
  const body = envelope(json);
  const status = exportStatus(body.code);
  const items = Array.isArray(body.roz_items) ? body.roz_items : [];
  const lessons = items.map((item) => normalizeRozItem(item, ctx)).filter(Boolean);
  return { status, lessons };
}
