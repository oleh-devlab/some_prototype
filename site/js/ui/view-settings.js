// Налаштування й перший запуск: група, підгрупа, іноземна мова, вибіркові, сторонні дисципліни.

import { formatDateShort, weekdayShortByIndex } from '../lib/dates.js';
import { matchesQuery, plural, searchKey } from '../lib/text.js';
import { describeGroupCode } from '../domain/parse.js';
import { buildCatalog, listSubgroups, teacherDisciplines } from '../domain/electives.js';
import { clearPrefs, sameElective, storageAvailable } from '../prefs.js';
import { append, h, icon, replaceChildren } from './dom.js';
import { href } from './router.js';
import { coverageNotice, notice } from './schedule.js';

const STATUS_LABEL = {
  ok: null,
  empty: 'пар немає',
  closed: 'розклад складається',
  paused: 'пауза',
  error: 'помилка',
  missing: 'немає даних',
};

// ---------- Вибір групи ----------

export async function renderGroupPicker(root, ctx, { setup = false } = {}) {
  ctx.setTitle(setup ? 'Розклад ЛНУ' : 'Вибір групи', setup ? 'крок 1 з 2 · група' : null);
  const groups = await ctx.repo.listGroups();
  if (!ctx.isCurrent()) return;

  const results = h('div', { class: 'results' });
  const input = h('input', {
    class: 'search-input', type: 'search', placeholder: 'Шифр групи, напр. ФЕІ-21', autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Пошук групи',
  });

  const draw = () => {
    const q = input.value;
    const found = groups.filter((g) => matchesQuery(searchKey(`${g.name} ${g.faculty}`), q));
    const byFaculty = new Map();
    for (const g of found) {
      const heading = g.faculty || (g.hint ? `Серія ${g.hint.series}` : 'Інші');
      if (!byFaculty.has(heading)) byFaculty.set(heading, []);
      byFaculty.get(heading).push(g);
    }
    const rows = [];
    for (const [heading, list] of [...byFaculty].sort((a, b) => a[0].localeCompare(b[0], 'uk'))) {
      rows.push(h('h2', { class: 'list-heading' }, heading));
      rows.push(h('ul', { class: 'list' }, list.map((g) => h('li', null,
        h('button', {
          class: ['list-row', ctx.prefs.group?.id === g.id && 'is-selected'],
          type: 'button',
          onclick: () => pick(g),
        },
        h('span', { class: 'list-main' },
          h('strong', null, g.name),
          h('span', { class: 'muted block' }, describeGroupCode(g.hint) || ' '),
        ),
        STATUS_LABEL[g.status] ? h('span', { class: `status status-${g.status}` }, STATUS_LABEL[g.status]) : null,
        icon('right'),
        )))));
    }
    if (!rows.length) rows.push(h('p', { class: 'empty' }, 'Групу не знайдено.'));
    replaceChildren(results, rows);
  };

  const pick = (g) => {
    const changed = ctx.prefs.group?.id !== g.id;
    ctx.setPrefs({ group: { id: g.id, name: g.name }, ...(changed ? { subgroup: null } : {}) });
    ctx.go(setup ? href('setup', ['options']) : href('settings'));
  };

  input.addEventListener('input', draw);
  draw();

  const c = ctx.meta.coverage;
  append(root,
    setup ? h('div', { class: 'intro' },
      h('h2', null, 'Вітаємо!'),
      h('p', null, 'Виберіть групу один раз — далі сайт одразу відкриватиме ваш розклад, лише для вашої підгрупи та ваших вибіркових.'),
    ) : h('a', { class: 'back-link', href: href('settings') }, icon('left'), 'Налаштування'),
    h('div', { class: 'search' }, icon('search'), input),
    c && !c.complete && c.groupsTotal == null
      ? notice('info', `У прототипі дані є лише для ${c.groupsLoaded} ${plural(c.groupsLoaded, ['групи', 'груп', 'груп'])}.`)
      : null,
    results,
  );
  if (matchMedia('(hover: hover)').matches) ctx.afterMount(() => input.focus());
}

// ---------- Налаштування ----------

export async function renderSettings(root, ctx, { setup = false } = {}) {
  const { prefs, repo } = ctx;
  if (!prefs.group) {
    ctx.redirect(href('setup'));
    return;
  }
  ctx.setTitle(setup ? 'Розклад ЛНУ' : 'Налаштування', setup ? 'крок 2 з 2 · підгрупа й вибіркові' : null);
  const group = await repo.findGroup(prefs.group);
  const { lessons } = group ? await repo.getGroupSchedule(group.id, ctx.meta.range ?? undefined) : { lessons: [] };
  if (!ctx.isCurrent()) return;

  const catalog = buildCatalog(lessons, ctx.classify);
  const subgroups = listSubgroups(lessons);

  const sections = [
    groupSection(ctx, group, setup),
    subgroupSection(ctx, subgroups),
    catalog.languages.length ? languageSection(ctx, catalog.languages) : null,
    electivesSection(ctx, catalog.electives),
    externalSection(ctx),
  ];
  if (setup) {
    sections.push(h('div', { class: 'sticky-actions' },
      h('a', { class: 'btn btn-primary btn-block', href: href('my') }, 'Показати мій розклад')));
  } else {
    sections.push(dataSection(ctx));
  }
  append(root, ...sections.filter(Boolean));
}

function section(title, hint, ...content) {
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, title),
    hint ? h('p', { class: 'muted small' }, hint) : null,
    content,
  );
}

function groupSection(ctx, group, setup) {
  const status = group && STATUS_LABEL[group.status];
  return section('Група', null,
    h('div', { class: 'row-between' },
      h('div', null,
        h('strong', { class: 'big' }, ctx.prefs.group.name),
        group?.faculty ? h('span', { class: 'muted block' }, group.faculty) : null,
        group?.hint ? h('span', { class: 'muted block' }, describeGroupCode(group.hint)) : null,
        status ? h('span', { class: `status status-${group.status}` }, status) : null,
        !group ? h('span', { class: 'status status-error' }, 'немає в даних') : null,
      ),
      h('a', { class: 'btn btn-small', href: setup ? href('setup') : href('settings', ['group']) }, 'Змінити'),
    ),
  );
}

function subgroupSection(ctx, subgroups) {
  const options = subgroups.length ? subgroups : [1, 2];
  const current = ctx.prefs.subgroup;
  const choose = (value) => {
    ctx.setPrefs({ subgroup: value });
    ctx.rerender();
  };
  return section('Підгрупа', 'Пари іншої підгрупи не показуватимуться.',
    h('div', { class: 'segmented segmented-wide', role: 'radiogroup', 'aria-label': 'Підгрупа' },
      options.map((n) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(current === n), class: current === n ? 'is-active' : '', onclick: () => choose(n) }, `${n}`)),
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(current == null), class: current == null ? 'is-active' : '', onclick: () => choose(null) }, 'Усі'),
    ),
  );
}

/** [{weekday: 1, number: 3}] -> 'вт 3' */
function slotsText(slots) {
  return slots.map((s) => `${weekdayShortByIndex(s.weekday).toLowerCase()} ${s.number}`).join(', ');
}

function languageSection(ctx, languages) {
  const current = ctx.prefs.englishTeacher;
  const teachers = new Map();
  for (const lang of languages) {
    for (const t of lang.teachers) {
      const prev = teachers.get(t.key);
      teachers.set(t.key, prev ? { ...prev, slots: [...prev.slots, ...t.slots], rooms: [...new Set([...prev.rooms, ...t.rooms])] } : t);
    }
  }
  const choose = (t) => {
    ctx.setPrefs({ englishTeacher: t ? { key: t.key, name: t.name } : null });
    ctx.rerender();
  };
  const titles = languages.map((l) => l.title).filter((t) => t !== 'Іноземна мова');
  const list = [...teachers.values()];
  const knownCurrent = !current || teachers.has(current.key);
  return section('Іноземна мова',
    `${titles.length ? `${titles.join(', ')}. ` : ''}Кілька викладачів ведуть пари паралельно. Виберіть свого — пари інших буде приховано.`,
    h('ul', { class: 'choice-list', role: 'radiogroup' },
      list.map((t) => choiceRow({
        type: 'radio', name: 'lang', checked: current?.key === t.key, onChange: () => choose(t),
        title: t.name, detail: `${slotsText(t.slots)} пара · ${t.rooms.join(', ')}`,
      })),
      !knownCurrent ? choiceRow({ type: 'radio', name: 'lang', checked: true, onChange: () => {}, title: current.name, detail: 'немає в розкладі цієї групи' }) : null,
      choiceRow({ type: 'radio', name: 'lang', checked: !current, onChange: () => choose(null), title: 'Не вибрано', detail: 'іноземну не показувати' }),
    ),
  );
}

function choiceRow({ type, name, checked, onChange, title, detail, extra }) {
  return h('li', null,
    h('label', { class: ['choice', checked && 'is-checked'] },
      h('input', { type, name, checked, onchange: onChange }),
      h('span', { class: 'choice-text' },
        h('strong', null, title),
        detail ? h('span', { class: 'muted block small' }, detail) : null,
      ),
    ),
    extra ?? null,
  );
}

function electivesSection(ctx, electives) {
  const { prefs } = ctx;
  const selectedFor = (titleKey) => prefs.electives.filter((e) => !e.external && e.titleKey === titleKey);
  const setFor = (titleKey, entries) => {
    ctx.setPrefs({ electives: [...prefs.electives.filter((e) => e.external || e.titleKey !== titleKey), ...entries] });
    ctx.rerender();
  };

  const rows = electives.map((entry) => {
    const selected = selectedFor(entry.titleKey);
    const checked = selected.length > 0;
    const anyTeacher = selected.some((e) => !e.teacherKey);
    const base = { titleKey: entry.titleKey, title: entry.title, external: false };
    const toggle = () => setFor(entry.titleKey, checked ? [] : [{ ...base, teacherKey: null, teacherName: null }]);

    let teacherChips = null;
    if (checked && entry.teachers.length > 1) {
      const toggleTeacher = (t) => {
        const current = anyTeacher ? [] : selected.filter((e) => e.teacherKey);
        const has = current.some((e) => e.teacherKey === t.key);
        const next = has ? current.filter((e) => e.teacherKey !== t.key) : [...current, { ...base, teacherKey: t.key, teacherName: t.name }];
        setFor(entry.titleKey, next.length ? next : [{ ...base, teacherKey: null, teacherName: null }]);
      };
      teacherChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Викладачі' },
        h('span', { class: 'muted small' }, 'Мої викладачі:'),
        h('button', { type: 'button', class: ['chip', anyTeacher && 'is-active'], 'aria-pressed': String(anyTeacher), onclick: () => setFor(entry.titleKey, [{ ...base, teacherKey: null, teacherName: null }]) }, 'усі'),
        entry.teachers.map((t) => {
          const on = !anyTeacher && selected.some((e) => e.teacherKey === t.key);
          return h('button', { type: 'button', class: ['chip', on && 'is-active'], 'aria-pressed': String(on), title: `${slotsText(t.slots)} пара · ${t.rooms.join(', ')}`, onclick: () => toggleTeacher(t) },
            `${t.short} · ${slotsText(t.slots)}`);
        }),
      );
    }
    const detail = [
      entry.types.join(', '),
      `${slotsText(entry.slots)} пара`,
      entry.teachers.length === 1 ? entry.teachers[0].short : `${entry.teachers.length} викл.`,
    ].filter(Boolean).join(' · ');
    return choiceRow({
      type: 'checkbox', name: `el-${entry.titleKey}`, checked, onChange: toggle,
      title: [entry.title, entry.likelyDvvs ? h('span', { class: 'badge badge-hint' }, 'ймовірно ДВВС') : null],
      detail,
      extra: teacherChips,
    });
  });

  // Вибрані раніше дисципліни, яких уже немає в розкладі групи (інший семестр, інша група).
  const known = new Set(electives.map((e) => e.titleKey));
  const orphaned = prefs.electives.filter((e) => !e.external && !known.has(e.titleKey));
  const orphanRows = orphaned.map((e) => h('li', { class: 'orphan' },
    h('span', null, e.title, e.teacherName ? h('span', { class: 'muted' }, ` · ${e.teacherName}`) : null, h('span', { class: 'muted block small' }, 'немає в розкладі групи')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Прибрати ${e.title}`, onclick: () => { ctx.setPrefs({ electives: prefs.electives.filter((x) => !sameElective(x, e)) }); ctx.rerender(); } }, icon('close')),
  ));

  return section('Вибіркові дисципліни',
    electives.length
      ? 'Пари «Збірна група» за замовчуванням приховані. Позначте ті, які ви відвідуєте.'
      : 'У розкладі групи немає пар «Збірна група».',
    rows.length ? h('ul', { class: 'choice-list' }, rows) : null,
    orphanRows.length ? h('ul', { class: 'choice-list' }, orphanRows) : null,
  );
}

function externalSection(ctx) {
  const externals = ctx.prefs.electives.filter((e) => e.external);
  return section('Сторонні дисципліни',
    'ДВВС, яких немає в розкладі вашої групи (наприклад, з іншого факультету). Пари підтягуються з розкладу викладача.',
    externals.length ? h('ul', { class: 'choice-list' }, externals.map((e) => h('li', { class: 'orphan' },
      h('span', null, h('strong', null, e.title), h('span', { class: 'muted block small' }, e.teacherName ?? '')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Прибрати ${e.title}`, onclick: () => { ctx.setPrefs({ electives: ctx.prefs.electives.filter((x) => !sameElective(x, e)) }); ctx.rerender(); } }, icon('close')),
    ))) : null,
    h('a', { class: 'btn btn-small', href: href('settings', ['external']) }, icon('plus'), 'Додати з розкладу викладача'),
  );
}

function dataSection(ctx) {
  const m = ctx.meta;
  const c = m.coverage;
  const rows = [
    ['Джерело', m.source === 'static' ? 'data.json (статичний знімок)' : m.source],
    m.generatedAt ? ['Оновлено', new Date(m.generatedAt).toLocaleString('uk-UA')] : null,
    m.range ? ['Період', `${formatDateShort(m.range.from)} – ${formatDateShort(m.range.to)}`] : null,
    c ? ['Групи', c.groupsTotal != null ? `${c.groupsLoaded} з ${c.groupsTotal}` : `${c.groupsLoaded} (повний список груп невідомий)`] : null,
  ].filter(Boolean);
  return section('Дані', null,
    h('dl', { class: 'facts' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    coverageNotice(m, 'Режими «Аудиторія» і «Викладач»'),
    m.errors?.length ? notice('warn', m.errors.join(' ')) : null,
    storageAvailable() ? null : notice('warn', 'Браузер не дозволяє зберігати дані сайту — вибір не збережеться після закриття сторінки.'),
    h('button', {
      class: 'btn btn-small btn-danger', type: 'button',
      onclick: () => {
        if (!confirm('Скинути групу, підгрупу й вибіркові?')) return;
        clearPrefs();
        ctx.resetPrefs();
        ctx.go(href('setup'));
      },
    }, 'Скинути мій вибір'),
  );
}

// ---------- Стороння дисципліна: викладач -> дисципліна ----------

export async function renderExternal(root, ctx) {
  const teacherKey = ctx.route.params[1];
  const back = h('a', { class: 'back-link', href: teacherKey ? href('settings', ['external']) : href('settings') }, icon('left'), teacherKey ? 'Інший викладач' : 'Налаштування');

  if (!teacherKey) {
    ctx.setTitle('Стороння дисципліна', 'крок 1: викладач');
    const teachers = await ctx.repo.listTeachers();
    if (!ctx.isCurrent()) return;
    const results = h('ul', { class: 'list' });
    const input = h('input', { class: 'search-input', type: 'search', placeholder: 'Прізвище викладача', autocomplete: 'off', 'aria-label': 'Прізвище викладача' });
    const draw = () => {
      const found = teachers.filter((t) => matchesQuery(searchKey(`${t.name} ${t.department ?? ''}`), input.value))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')).slice(0, 60);
      replaceChildren(results, found.map((t) => h('li', null, h('a', { class: 'list-row', href: href('settings', ['external', t.key]) },
        h('span', { class: 'list-main' }, h('strong', null, t.name), t.department ? h('span', { class: 'muted block' }, t.department) : null), icon('right')))));
    };
    input.addEventListener('input', draw);
    draw();
    append(root, back,
      h('p', { class: 'muted' }, 'Знайдіть викладача, який веде вашу дисципліну, і виберіть її з його розкладу.'),
      h('div', { class: 'search' }, icon('search'), input),
      coverageNotice(ctx.meta, 'Розклади викладачів'),
      results);
    if (matchMedia('(hover: hover)').matches) ctx.afterMount(() => input.focus());
    return;
  }

  const { teacher, lessons } = await ctx.repo.getTeacherSchedule(teacherKey, ctx.meta.range ?? undefined);
  if (!ctx.isCurrent()) return;
  ctx.setTitle('Стороння дисципліна', 'крок 2: дисципліна');
  if (!teacher) {
    append(root, back, notice('warn', 'Викладача не знайдено в даних.'));
    return;
  }
  const disciplines = teacherDisciplines(lessons);
  const add = (d) => {
    const entry = { titleKey: d.titleKey, title: d.title, teacherKey: teacher.key, teacherName: teacher.name, external: true };
    if (!ctx.prefs.electives.some((e) => sameElective(e, entry))) ctx.setPrefs({ electives: [...ctx.prefs.electives, entry] });
    ctx.toast(`Додано: ${d.title}`);
    ctx.go(href('settings'));
  };
  append(root, back,
    h('h2', { class: 'section-title' }, teacher.name),
    disciplines.length
      ? h('ul', { class: 'choice-list' }, disciplines.map((d) => h('li', { class: 'orphan' },
        h('span', null,
          h('strong', null, d.title),
          h('span', { class: 'muted block small' }, [d.types.join(', '), `${slotsText(d.slots)} пара`, [...d.audiences, ...d.groups].slice(0, 4).join(', ')].filter(Boolean).join(' · ')),
        ),
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => add(d) }, icon('plus'), 'Додати'),
      )))
      : notice('warn', 'У наявних даних немає пар цього викладача. У робочій версії розклад викладача братиметься з нашого API.'),
  );
}
