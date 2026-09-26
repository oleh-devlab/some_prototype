// ЕСКІЗ майбутнього джерела даних: наш бекенд (фоновий збирач + БД), а не деканат.
// У прототипі не використовується (див. config.js). Показує, що для переходу на API
// достатньо реалізувати той самий інтерфейс — UI не змінюється.
//
// Очікувані ендпоінти (відносно baseUrl, JSON, уже нормалізовані Lesson):
//   GET meta
//   GET groups
//   GET groups/{id}/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
//   GET rooms                  GET rooms/{key}/schedule?from&to
//   GET teachers               GET teachers/{key}/schedule?from&to
// Бекенд сам віддає останній валідний знімок, якщо деканат недоступний
// або повернув -2/-3/-8; клієнт про деканат нічого не знає.

import { searchKey } from '../lib/text.js';

export class ApiRepository {
  #base;
  #cache = new Map();

  constructor({ baseUrl = 'api/' } = {}) {
    this.#base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async #get(path, params) {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    const res = await fetch(`${this.#base}${path}${query}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`API ${path}: HTTP ${res.status}`);
    return res.json();
  }

  // Довідники змінюються рідко — тримаємо в пам'яті на сесію.
  #cached(key, loader) {
    if (!this.#cache.has(key)) this.#cache.set(key, loader().catch((e) => { this.#cache.delete(key); throw e; }));
    return this.#cache.get(key);
  }

  async load() {}

  async refresh() {
    this.#cache.clear();
    return true;
  }

  getMeta() {
    return this.#cached('meta', () => this.#get('meta'));
  }

  listGroups() {
    return this.#cached('groups', () => this.#get('groups'));
  }

  async findGroup({ id, name } = {}) {
    const groups = await this.listGroups();
    return groups.find((g) => g.id === id) ?? groups.find((g) => searchKey(g.name) === searchKey(name ?? '')) ?? null;
  }

  getGroupSchedule(groupId, range) {
    return this.#get(`groups/${encodeURIComponent(groupId)}/schedule`, range);
  }

  listRooms() {
    return this.#cached('rooms', () => this.#get('rooms'));
  }

  getRoomSchedule(roomKey, range) {
    return this.#get(`rooms/${encodeURIComponent(roomKey)}/schedule`, range);
  }

  listTeachers() {
    return this.#cached('teachers', () => this.#get('teachers'));
  }

  getTeacherSchedule(teacherKey, range) {
    return this.#get(`teachers/${encodeURIComponent(teacherKey)}/schedule`, range);
  }
}
