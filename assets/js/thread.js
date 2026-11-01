/* ============================================================
   Murrieta · Ветка и сроки
   Форум закрыт для гостей, поэтому ветку забирает закладка-«букмарклет»
   в браузере, где вы залогинены, а страница разбирает JSON и считает сроки.
   Никаких логинов и ключей на сайт не передаётся.
   ============================================================ */
'use strict';

const THREAD_KEY = 'murrieta_thread';
const H = 3600e3;
const MONTHS = { января:1, февраля:2, марта:3, апреля:4, мая:5, июня:6, июля:7, августа:8, сентября:9, октября:10, ноября:11, декабря:12 };

const BOOKMARKLET = "javascript:(async()=>{const w=window.open('','_blank');const P=[...document.querySelectorAll('[id^=\"js-post-\"]')].map(e=>{const t=e.querySelector('time'),b=e.querySelector('.message-body');return{id:e.id.replace('js-post-',''),time:t?t.getAttribute('datetime'):'',author:e.getAttribute('data-author')||'',text:(b?b.innerText:'').trim().slice(0,12000)}});const j=JSON.stringify({url:location.href.split('#')[0],title:document.title,posts:P});try{const r=await new Response(new Blob([j]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();let s='';for(const x of new Uint8Array(r))s+=String.fromCharCode(x);w.location='https://zakonka.online/#/thread?d='+btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}catch(x){try{await navigator.clipboard.writeText(j);alert('Скопировано постов: '+P.length+'. Вставьте на zakonka.online → Сроки')}catch(y){prompt('Скопируйте (Ctrl+C):',j)}if(w)w.close()}})()";

const mskDate = (y, m, d, hh = 0, mm = 0) => new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+03:00`);

/* ---------- классификация постов ---------- */
function classify(p) {
  const t = p.text || '', head = t.slice(0, 500).toUpperCase().replace(/\s+/g, ' ');
  const mk = (type, label) => ({ type, label });
  const petition = /^В\s+(ФЕДЕРАЛЬНЫЙ|ВЕРХОВНЫЙ)\s+СУД/.test(head) || /ХОДАТАЙСТВО|АПЕЛЛЯЦИОННАЯ ЖАЛОБА/.test(head.slice(0, 300));
  if (!petition && /РЕШЕНИЕ/.test(head.slice(0, 250)) && /СУД/.test(head.slice(0, 250))) {
    return /УСТАНОВИЛ/.test(t) ? mk('decision_full', 'Решение (мотивированное)') : mk('decision_part', 'Решение (резолютивная часть)');
  }
  if (/О НЕУВАЖЕНИИ К СУДУ/.test(head)) return mk('contempt', 'Определение о неуважении');
  if (/О ПРИНЯТИИ (НАСТОЯЩЕГО )?ИСКОВОГО/.test(head) || /О ПРИНЯТИИ ИСКОВОГО ЗАЯВЛЕНИЯ/.test(head)) return mk('accept', 'Принято к производству');
  if (/О НАЗНАЧЕНИИ СУДЕБНОГО ЗАСЕДАНИЯ/.test(head)) return mk('hearing', 'Назначено заседание');
  if (/О ПЕРЕНОСЕ СУДЕБНОГО ЗАСЕДАНИЯ/.test(head)) return mk('hearing', 'Перенос заседания');
  if (/О ПРОДЛЕНИИ СРОКОВ|О ПРОДЛЕНИИ СРОКА/.test(head)) return mk('extend', 'Продление расследования');
  if (/ОБ ОТКАЗЕ В УДОВЛЕТВОРЕНИИ ХОДАТАЙСТВА/.test(head)) return mk('refuse', 'Отказ в ходатайстве');
  if (/ОБ УДОВЛЕТВОРЕНИИ ХОДАТАЙСТВА/.test(head)) return mk('grant', 'Ходатайство удовлетворено');
  if (/О ВОЗВРАЩЕНИИ ДЕЛОПРОИЗВОДСТВА/.test(head)) return mk('return', 'Дело возвращено прокуратуре');
  if (/ЗАВЕРШИЛА РАССЛЕДОВАНИЕ/.test(t.slice(0, 900).toUpperCase())) return mk('pros_done', 'Прокуратура: расследование завершено');
  if (/ИСКОВОЕ ЗАЯВЛЕНИЕ/.test(head) && /ДАННЫЕ ИСТЦА/.test(head)) return mk('claim', 'Исковое заявление');
  if (/АПЕЛЛЯЦИОННАЯ ЖАЛОБА/.test(head)) return mk('appeal', 'Апелляционная жалоба');
  if (/ХОДАТАЙСТВО/.test(head)) return mk('motion', 'Ходатайство');
  if (/ОБЕСПЕЧЕНИИ СОХРАННОСТИ/.test(head)) return mk('preserve', 'Обеспечение сохранности доказательств');
  return mk('other', 'Другое');
}

function parseHearing(text) {
  let m = text.match(/на\s+(\d{2})\.(\d{2})\.(\d{4})\s+в\s+(\d{1,2})\s*ч\.?\s*(\d{2})/i);
  let at = m && mskDate(m[3], m[2], m[1], +m[4], +m[5]);
  if (!at) {
    m = text.match(/["«]?(\d{1,2})["»]?\s+([а-я]+)\s+(\d{4})\s*г\.?\s+в\s+(\d{1,2})\s*ч\.?\s*(\d{2})/i);
    if (m && MONTHS[m[2].toLowerCase()]) at = mskDate(m[3], MONTHS[m[2].toLowerCase()], m[1], +m[4], +m[5]);
  }
  const place = (text.match(/в зале судебных заседаний ([^.\n]+)/i) || [, ''])[1].trim();
  return at ? { at, place } : null;
}

function parseEvent(text) {
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})[^\n]{0,25}?в\s+(\d{1,2}):(\d{2})/);
  return m ? mskDate(m[3], m[2], m[1], +m[4], +m[5]) : null;
}

/* ---------- сроки ---------- */
function analyze(posts, now = new Date()) {
  const items = posts.map(p => ({ ...p, t: p.time ? new Date(p.time) : null, c: classify(p) }))
    .sort((a, b) => (a.t || 0) - (b.t || 0));
  const out = [];
  const push = (due, title, note, kind) => out.push({ due, title, note, kind });

  const claim = items.find(i => i.c.type === 'claim');
  if (claim) {
    const ev = parseEvent(claim.text);
    if (ev) push(new Date(+ev + 120 * H), 'Хранение записи нагрудных камер (120 ч)', `от события ${fmt(ev)}; после этого срока запись могут удалить законно`, 'record');
  }
  const accept = items.find(i => i.c.type === 'accept');
  if (accept && accept.t && !items.some(i => i.c.type === 'pros_done'))
    push(new Date(+accept.t + 96 * H), 'Прокуратура: срок расследования (96 ч, продление до +48 ч)', `от ${fmt(accept.t)}`, 'pros');

  const hearings = items.filter(i => i.c.type === 'hearing').map(i => ({ i, h: parseHearing(i.text) })).filter(x => x.h);
  const lastH = hearings[hearings.length - 1];
  if (lastH) push(lastH.h.at, 'Судебное заседание', `${lastH.h.place || 'место в определении'}; явка обязательна, неявка = административная ответственность`, 'hearing');

  const dec = [...items].reverse().find(i => i.c.type.startsWith('decision'));
  if (dec && dec.t) {
    if (dec.c.type === 'decision_part') {
      const m = items.find(i => i.c.type === 'motion' && i.t > dec.t && /мотивированн|в полном объ[её]ме/i.test(i.text));
      if (!m) push(new Date(+dec.t + 24 * H), 'Ходатайство о мотивированном решении (24 ч)', `решение опубликовано ${fmt(dec.t)}. Без него апелляция невозможна`, 'motdec');
      else {
        const full = items.find(i => i.c.type === 'decision_full' && i.t > dec.t);
        if (!full) push(new Date(+m.t + 72 * H), 'Суд обязан изготовить мотивированное решение (до 3 суток)', `ходатайство подано ${fmt(m.t)}`, 'motwait');
      }
    } else {
      push(new Date(+dec.t + 48 * H), 'Апелляция в Верховный суд (48 ч)', `мотивированное решение опубликовано ${fmt(dec.t)}; восстановление срока только в исключительных случаях (до 31 суток)`, 'appeal');
    }
  }
  const lastCourt = [...items].reverse().find(i => ['hearing','refuse','grant','decision_part','decision_full','contempt','return'].includes(i.c.type));
  const lastMotion = [...items].reverse().find(i => i.c.type === 'motion');
  if (lastMotion && lastMotion.t && (!lastCourt || lastCourt.t < lastMotion.t) && now - lastMotion.t > 5 * H)
    push(new Date(+lastMotion.t + 5 * H), 'Ходатайство без ответа суда (должно быть рассмотрено за 5 ч)', `подано ${fmt(lastMotion.t)}; можно напомнить`, 'nomotion');

  return { items, due: out.sort((a, b) => a.due - b.due) };
}

const fmt = d => d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' МСК';
function left(due, now = new Date()) {
  const ms = due - now, a = Math.abs(ms), d = Math.floor(a / 24 / H), h = Math.floor(a % (24 * H) / H), m = Math.floor(a % H / 60e3);
  const s = (d ? d + ' д ' : '') + (h || d ? h + ' ч ' : '') + m + ' мин';
  return ms >= 0 ? { late: false, text: 'осталось ' + s, hot: ms < 6 * H, warm: ms < 24 * H } : { late: true, text: 'прошло ' + s };
}

/* ---------- загрузка из адреса (d=gzip+base64url) ---------- */
async function decodePayload(d) {
  try {
    const bin = atob(String(d).replace(/-/g, '+').replace(/_/g, '/'));
    const u = Uint8Array.from(bin, c => c.charCodeAt(0));
    const txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(txt);
  } catch { return null; }
}

/* ---------- проверка текста перед подачей ---------- */
const AGENCY = /^(LSPD|LSSD|FIB|USSS|SASPA|SAMS|EMS|GOV|NG|ARMY|LSFD|SAPR|SANG)\b/;
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
function check(text, knownArticles = null, now = new Date()) {
  const r = [], bad = (m) => r.push({ lvl: 'bad', m }), warn = (m) => r.push({ lvl: 'warn', m });
  for (const m of text.matchAll(/\[([^\]\n]{1,80})\]/g)) if (!AGENCY.test(m[1].trim())) bad(`Незаполненная вставка: [${m[1]}]`);
  if (/\*тык\*|\{\{|\bxxx\b/i.test(text)) bad('Остались заглушки (*тык*, {{…}} или xxx)');

  const need = (re, name) => { if (!re.test(text)) bad(`Нет раздела «${name}»`); };
  if (/ИСКОВОЕ ЗАЯВЛЕНИЕ/.test(text)) {
    need(/Данные истца/i, 'Данные истца'); need(/ПРОСЬБА К/i, 'ПРОСЬБА К … СУДУ');
    need(/МАТЕРИАЛЫ/i, 'МАТЕРИАЛЫ ЗАЯВЛЕНИЯ'); need(/Дата подачи/i, 'Дата подачи'); need(/Подпись/i, 'Подпись');
    need(/Юридическое представительство/i, 'Юридическое представительство');
    if (/Данные ответчика[^\n]*\n[\s\S]{0,300}Данные ответчика/i.test(text) === false && /ответчик[и]?\s*(№\s*)?1\s*,?\s*(№\s*)?2/i.test(text)) warn('Ответчики перечислены в одну строку; по форме нужны отдельные блоки');
  } else if (/АПЕЛЛЯЦИОННАЯ ЖАЛОБА/.test(text)) {
    need(/Обжалуемый акт/i, 'Обжалуемый акт'); need(/ПРОСЬБА К ВЕРХОВНОМУ/i, 'ПРОСЬБА К ВЕРХОВНОМУ СУДУ');
    need(/Дата публикации обжалуемого/i, 'Дата публикации обжалуемого акта'); need(/Подпись/i, 'Подпись');
  } else if (/ОБРАЩЕНИЕ/.test(text)) {
    need(/Данные проверяемого/i, 'Данные проверяемого лица'); need(/ПРОШУ ПРОКУРАТУРУ/i, 'ПРОШУ ПРОКУРАТУРУ');
  } else if (/ХОДАТАЙСТВО/.test(text)) need(/ПРОШУ/i, 'ПРОШУ …');

  const names = {};
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b/g)) (names[m[1]] ||= new Set()).add(m[2]);
  for (const [f, set] of Object.entries(names)) {
    const arr = [...set];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      if (lev(arr[i].toLowerCase(), arr[j].toLowerCase()) <= 2) bad(`Разные написания: «${f} ${arr[i]}» и «${f} ${arr[j]}» (опечатка?)`);
  }

  const filed = text.match(/Дата подачи[^\n:]*:\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  if (filed) {
    const fd = mskDate(filed[3], filed[2], filed[1], 12);
    if (Math.abs(fd - now) > 30 * H) warn(`Дата подачи ${filed[1]}.${filed[2]}.${filed[3]} сильно отличается от сегодняшней`);
    for (const m of text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)) {
      const dd = mskDate(m[3], m[2], m[1], 12);
      if (dd - fd > 36 * H && !/на\s+\d{2}\.\d{2}\.\d{4}\s+в/.test(text.slice(Math.max(0, m.index - 6), m.index + 16))) { warn(`Дата ${m[0]} позже даты подачи`); break; }
    }
  }
  if (knownArticles) {
    const miss = new Set();
    for (const m of text.matchAll(/(?:стать[а-яё]+|ст\.)\s*(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s*(?:УАК|Уголовно)/gi)) if (!knownArticles.has(m[1])) miss.add(m[1]);
    if (miss.size) warn('Статьи УАК не найдены в базе: ' + [...miss].join(', '));
  }
  if (!r.length) r.push({ lvl: 'ok', m: 'Явных ошибок не найдено. Всё равно перечитайте даты и ссылки.' });
  return r;
}

if (typeof module !== 'undefined') module.exports = { classify, analyze, check, parseHearing, parseEvent, lev, decodePayload };

/* ---------- интерфейс ---------- */
if (typeof window !== 'undefined') {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(THREAD_KEY)) || null; } catch { return null; } };
  const save = d => { try { localStorage.setItem(THREAD_KEY, JSON.stringify(d)); } catch {} };
  let arts = null;
  const articleSet = async () => {
    if (arts) return arts;
    try { const a = await (await fetch('data/articles.json')).json(); arts = new Set(a.map(x => String(x.num))); } catch { arts = null; }
    return arts;
  };

  function render() {
    const d = load(), box = document.getElementById('thOut');
    if (!box) return;
    if (!d || !d.posts?.length) { box.innerHTML = '<div class="empty"><b>Ветка не загружена</b>Нажмите закладку на странице ветки, потом вставьте результат выше.</div>'; return; }
    const now = new Date(), { items, due } = analyze(d.posts, now);
    const dueHtml = due.length ? due.map(x => {
      const l = left(x.due, now);
      const col = l.late ? 'var(--bad,#c0392b)' : l.hot ? 'var(--bad,#e74c3c)' : l.warm ? '#e8a33d' : 'inherit';
      return `<div class="card" style="padding:12px 14px;margin:8px 0"><b>${esc(x.title)}</b><div style="color:${col}">${fmt(x.due)} · ${l.text}</div><div style="opacity:.75;font-size:.9em">${esc(x.note)}</div></div>`;
    }).join('') : '<p>Активных сроков не найдено.</p>';
    const tl = items.map(i => `<div style="padding:6px 0;border-top:1px solid rgba(128,128,128,.2)"><b>${esc(i.c.label)}</b> <span style="opacity:.7">· ${i.t ? fmt(i.t) : '—'} · ${esc(i.author)}</span><div style="opacity:.8;font-size:.9em">${esc(i.text.replace(/\s+/g, ' ').slice(0, 160))}</div></div>`).join('');
    box.innerHTML = `<h3 class="h3">${esc(d.title || 'Ветка')}</h3><p style="opacity:.7">Страниц загружено постов: ${d.posts.length}</p><h4>Сроки</h4>${dueHtml}<h4>Хронология</h4>${tl}`;
  }

  async function runCheck() {
    const t = document.getElementById('chkIn').value, out = document.getElementById('chkOut');
    const res = check(t, await articleSet());
    out.innerHTML = res.map(x => `<div class="card" style="padding:10px 14px;margin:6px 0;border-left:3px solid ${x.lvl === 'bad' ? '#e74c3c' : x.lvl === 'warn' ? '#e8a33d' : '#3fb950'}">${esc(x.m)}</div>`).join('');
  }

  window.Thread = {
    view() {
      return `
      <section class="sec view">
        <div class="sec__head"><div><h2 class="h2">Ветка и сроки</h2>
          <p>Форум закрыт для гостей, поэтому сайт сам его прочитать не может. Добавьте закладку (правый клик по кнопке → «Добавить ссылку в закладки», или перетащите на панель), откройте свою ветку на форуме залогиненным и нажмите закладку: сайт откроется сам с загруженной веткой. Логины никуда не уходят: всё считается в вашем браузере.</p></div></div>

        <p><a class="btn" id="thBm" href="${esc(BOOKMARKLET)}" draggable="true">📋 Забрать ветку</a>
           <span style="opacity:.7">← добавьте в закладки. Ветка из нескольких страниц: нажимайте на каждой странице, посты накапливаются, дубли убираются. Если сайт не открылся сам, данные окажутся в буфере: вставьте их ниже.</span></p>
        <textarea class="field-i" id="thIn" rows="3" placeholder="Вставьте сюда результат закладки (JSON) …"></textarea>
        <p><button class="btn" id="thGo">Разобрать</button> <button class="btn" id="thClr">Очистить</button></p>
        <div id="thOut"></div>

        <hr style="margin:28px 0;opacity:.2">
        <h2 class="h2">Проверка перед подачей</h2>
        <p>Вставьте готовый текст иска, обращения или ходатайства: найдём незаполненные вставки, пропущенные разделы, опечатки в именах, странные даты и несуществующие статьи УАК.</p>
        <textarea class="field-i" id="chkIn" rows="12" placeholder="Вставьте текст документа"></textarea>
        <p><button class="btn" id="chkGo">Проверить</button></p>
        <div id="chkOut"></div>
      </section>`;
    },
    bind() {
      const merge = j => {
        const cur = load(), same = cur && cur.url === j.url;
        const map = new Map((same ? cur.posts : []).map(p => [p.id, p]));
        (j.posts || []).forEach(p => map.set(p.id, p));
        save({ url: j.url, title: j.title, posts: [...map.values()] });
      };
      render();
      const dm = location.hash.match(/[?&]d=([^&]+)/);
      if (dm) decodePayload(dm[1]).then(j => {
        history.replaceState(null, '', '#/thread');
        if (j && j.posts) { merge(j); render(); }
        else alert('Не удалось прочитать данные из закладки.');
      });
      document.getElementById('thGo').onclick = () => {
        const raw = document.getElementById('thIn').value.trim(); if (!raw) return;
        let j; try { j = JSON.parse(raw); } catch { alert('Это не похоже на результат закладки (JSON).'); return; }
        merge(j);
        document.getElementById('thIn').value = ''; render();
      };
      document.getElementById('thClr').onclick = () => { localStorage.removeItem(THREAD_KEY); render(); };
      document.getElementById('chkGo').onclick = runCheck;
    },
  };
}
