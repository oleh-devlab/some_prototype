import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isLanguage, lessonType, normalizeTitle, parseAudience, parseGroupCode, parseLessonTime,
  parseRoom, parseTeacher, safeUrl, titleKey,
} from '../site/js/domain/parse.js';
import { searchKey } from '../site/js/lib/text.js';
import { parseUaDate, startOfWeek, weekdayIndex } from '../site/js/lib/dates.js';

test('parseRoom: NBSP, префікси лабораторій, латиниця', () => {
  assert.deepEqual(
    { ...parseRoom(' 1/Б') },
    { raw: '1/Б', label: '1/Б', number: '1', building: 'Б', lab: false, key: '1/б' },
  );
  assert.equal(parseRoom('N10/Б').label, '№10/Б');
  assert.equal(parseRoom('№10/Б').key, parseRoom('N10/Б').key);
  assert.notEqual(parseRoom('№5/Б').key, parseRoom(' 5/Б').key, 'лабораторія №5 і аудиторія 5 — різні приміщення');
  assert.equal(parseRoom('129a/T').label, '129а/Т', 'латинські a/T -> кириличні');
  assert.equal(parseRoom('129а/Т').key, parseRoom('129a/T').key);
  assert.equal(parseRoom(''), null);
  assert.equal(parseRoom('Спортзал').building, '');
});

test('parseTeacher: посада окремо від ПІБ', () => {
  const t = parseTeacher('в.о. зав. кафедрою Корчак Юрій Михайлович');
  assert.equal(t.position, 'в.о. зав. кафедрою');
  assert.equal(t.name, 'Корчак Юрій Михайлович');
  assert.equal(t.short, 'Корчак Ю. М.');

  const dotted = parseTeacher('доцент Горон. Богдан Ігорович');
  assert.equal(dotted.name, 'Горон Богдан Ігорович');
  assert.equal(dotted.key, parseTeacher('доцент Горон Богдан Ігорович').key);

  assert.equal(parseTeacher('асистент Шумська Ольга Анатоліівна').position, 'асистент');
  assert.equal(parseTeacher('доцент Цибуляк Б.З.').name, 'Цибуляк Б.З.');
  assert.equal(parseTeacher('   '), null);
});

test('normalizeTitle і titleKey', () => {
  assert.equal(normalizeTitle('Створення власного  бізнесу'), 'Створення власного бізнесу');
  assert.equal(normalizeTitle('Веб програмування на стороні сервера .'), 'Веб програмування на стороні сервера');
  assert.equal(titleKey('Веб програмування на стороні сервера.'), titleKey('Веб програмування на стороні сервера'));
});

test('parseAudience', () => {
  assert.deepEqual(parseAudience('(підгр. 2)').subgroups, [2]);
  assert.equal(parseAudience('(підгр. 2)').label, 'підгр. 2');
  assert.equal(parseAudience('Потік').kind, 'stream');
  assert.equal(parseAudience('Збірна група').kind, 'mixed');
  assert.equal(parseAudience('').kind, 'whole');
  assert.equal(parseAudience('щось інше').kind, 'other');
});

test('lessonType і parseLessonTime', () => {
  assert.equal(lessonType('Лаб').tone, 'lab');
  assert.equal(lessonType('ПрС').label, 'Практичне / семінар');
  assert.equal(lessonType('Щось').tone, 'other');
  assert.deepEqual(parseLessonTime('8:30-9:50'), { start: '08:30', end: '09:50' });
});

test('parseGroupCode — лише підказка', () => {
  assert.deepEqual(parseGroupCode('ФЕІ-21с'), { series: 'ФЕІ', course: 2, number: 1, form: 'денна', master: false });
  assert.equal(parseGroupCode('ФЕІМ-11с').master, true);
  assert.equal(parseGroupCode('ФЕМ-21с').master, false, 'ФЕМ — бакалаврат');
  assert.equal(parseGroupCode('ФЕП-31з').form, 'заочна');
  assert.equal(parseGroupCode('Якась група'), null);
});

test('isLanguage: за назвою або кафедрою', () => {
  assert.ok(isLanguage('Іноземна мова'));
  assert.ok(isLanguage('Англійська мова (за проф. спрямуванням)'));
  assert.ok(!isLanguage('Українська мова (за професійним спрямуванням)'));
  assert.ok(isLanguage('Practical course', 'Кафедра іноземних мов для природничих факультетів'));
});

test('safeUrl пропускає лише http(s)', () => {
  assert.equal(safeUrl('https://meet.google.com/abc'), 'https://meet.google.com/abc');
  assert.equal(safeUrl('meet.google.com/abc'), 'https://meet.google.com/abc');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl(''), null);
});

test('searchKey і дати', () => {
  assert.equal(searchKey('  Комп`ютерних   '), 'компютерних');
  assert.equal(parseUaDate('28.09.2026'), '2026-09-28');
  assert.equal(parseUaDate('2026-09-28'), null);
  assert.equal(weekdayIndex('2026-09-28'), 0);
  assert.equal(startOfWeek('2026-10-02'), '2026-09-28');
});
