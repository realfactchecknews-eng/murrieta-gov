// node tools/thread.test.js — проверка разбора ветки и проверки текста
const assert = require('assert');
const T = require('../assets/js/thread.js');
const P = (id, time, text) => ({ id, time, author: '', text });

const claim = P('1', '2026-10-10T12:32:31+0300', 'В Федеральный суд штата Сан-Андреас\nЮридическое представительство: нет\nДанные истца:\nИмя Фамилия: Marlon\nИСКОВОЕ ЗАЯВЛЕНИЕ\n10.10.2026 примерно в 11:55 я ехал.');
const accept = P('2', '2026-10-12T20:40:30+0300', 'ФЕДЕРАЛЬНЫЙ СУД ШТАТА САН-АНДРЕАС\nОПРЕДЕЛЕНИЕ\nо принятии настоящего искового заявления и оставлении его без движения');
const hear = P('3', '2026-10-21T19:36:39+0300', 'ФЕДЕРАЛЬНЫЙ СУД\nОПРЕДЕЛЕНИЕ\nо назначении судебного заседания\n1. Назначить открытое судебное заседание на 22.10.2026 в 15 ч. 00 мин. в зале судебных заседаний мэрии округа Блэйн.');
const part = P('4', '2026-10-07T23:19:36+0300', 'ФЕДЕРАЛЬНЫЙ СУД ШТАТА САН-АНДРЕАС\nРЕШЕНИЕ 7 октября 2026\nРЕШИЛ: 1. отказать');
const mot = P('5', '2026-10-07T23:58:08+0300', 'В Федеральный суд\nХОДАТАЙСТВО\nПрошу изготовить мотивированное решение');
const full = P('6', '2026-10-10T19:21:31+0300', 'ФЕДЕРАЛЬНЫЙ СУД ШТАТА САН-АНДРЕАС\nРЕШЕНИЕ\nУСТАНОВИЛ: ...\nРЕШИЛ: отказать');

assert.deepStrictEqual([claim, accept, hear, part, mot, full].map(p => T.classify(p).type),
  ['claim', 'accept', 'hearing', 'decision_part', 'motion', 'decision_full']);

let a = T.analyze([claim, accept, hear], new Date('2026-10-22T11:00:00+03:00'));
const titles = a.due.map(d => d.title);
assert(titles.some(t => /120 ч/.test(t)), 'запись 120 ч');
assert(titles.some(t => /Судебное заседание/.test(t)), 'заседание');
assert.strictEqual(+a.due.find(d => /Хранение/.test(d.title)).due, +new Date('2026-10-15T11:55:00+03:00'));
assert.strictEqual(+a.due.find(d => /заседание/.test(d.title)).due, +new Date('2026-10-22T15:00:00+03:00'));

a = T.analyze([part], new Date('2026-10-08T10:00:00+03:00'));
assert(/24 ч/.test(a.due[0].title));
a = T.analyze([part, mot], new Date('2026-10-08T10:00:00+03:00'));
assert(a.due.some(d => /3 суток/.test(d.title)));
a = T.analyze([part, mot, full], new Date('2026-10-10T20:00:00+03:00'));
assert.strictEqual(+a.due.find(d => /Апелляция/.test(d.title)).due, +new Date('2026-10-12T19:21:31+03:00'));

const bad = T.check('ИСКОВОЕ ЗАЯВЛЕНИЕ\nMarlon Corvov и Marlon Korvov [ССЫЛКА]\nДата подачи: 10.10.2026', new Set(['17.1']), new Date('2026-10-10T12:00:00+03:00')).map(x => x.m).join('|');
assert(/Незаполненная вставка/.test(bad) && /Разные написания/.test(bad) && /ПРОСЬБА К/.test(bad));
assert(!/\[LSPD/.test(T.check('Знак [LSPD | CPD | 1 | M.P]').map(x => x.m).join('')), 'жетон не вставка');
const zlib = require('zlib');
const pay = { url: 'u', title: 't', posts: [P('9', '2026-10-10T12:00:00+0300', 'Привет ✓')] };
const d = zlib.gzipSync(Buffer.from(JSON.stringify(pay))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
T.decodePayload(d).then(r => { assert.strictEqual(r.posts[0].text, 'Привет ✓'); console.log('thread.test OK'); });
