// Джерело даних. У прототипі — статичний data.json поруч з index.html (відносний шлях,
// тож сайт працює і в підкаталозі). Для переходу на наш API:
//   export const DATA_SOURCE = { kind: 'api', baseUrl: 'api/' };
export const DATA_SOURCE = { kind: 'static', url: 'data.json' };

// Як часто (мс) перевіряти оновлення даних, коли вкладка знову стає активною.
export const REFRESH_AFTER_MS = 10 * 60 * 1000;
