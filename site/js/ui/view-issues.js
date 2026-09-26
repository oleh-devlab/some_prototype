// Сторінка «Відомі проблеми прототипу» — для показу команді.

import { ISSUE_KIND_LABEL, KNOWN_ISSUES } from '../known-issues.js';
import { append, h, icon } from './dom.js';

export function renderIssues(root, ctx) {
  ctx.setTitle('Відомі проблеми', 'прототип');
  append(root,
    h('p', { class: 'muted issues-intro' },
      'Прототип для показу команді. Тут зібрано, чого бракує в даних деканату і де сайт лише здогадується. '
      + 'Пари, яких стосується проблема, позначені на картках.'),
    KNOWN_ISSUES.map((issue) => h('section', { class: 'card', id: `issue-${issue.id}` },
      h('span', { class: `badge badge-kind kind-${issue.kind}` }, icon('warn'), ISSUE_KIND_LABEL[issue.kind] ?? issue.kind),
      h('h2', { class: 'card-title' }, issue.title),
      h('p', null, issue.text),
    )),
  );
}
