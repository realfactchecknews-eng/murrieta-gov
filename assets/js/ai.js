/* ============================================================
   Murrieta · ИИ-помощник
   Поиск контекста выполняется в браузере (BM25 по чанкам),
   в Worker уходит только вопрос + найденные фрагменты.
   Ключ OpenRouter живёт в Cloudflare Worker и никогда не попадает в браузер.
   ============================================================ */
'use strict';

/* Адрес вашего Cloudflare Worker. Можно переопределить прямо на странице
   (кнопка «Настроить») — значение сохранится в localStorage. */
const WORKER_DEFAULT = 'https://murrieta-ai.realfactchecknews.workers.dev';
const workerUrl = () => (localStorage.getItem('murrieta_worker') || WORKER_DEFAULT).replace(/\/+$/,'');
const isConfigured = () => /^https:\/\/.+\.workers\.dev|^https?:\/\//.test(workerUrl())
                        && !workerUrl().includes('YOUR-SUBDOMAIN');

const AI = { chunks:null, idf:null, history:[], busy:false };
window.AI = AI;

/* Память чата: несколько независимых тредов в localStorage, каждый со
   своей лентой сообщений — диалог переживает перезагрузку страницы и
   переход между разделами. В запрос на сервер уходит короткий хвост
   активного треда (см. .slice(-6) ниже), полная лента хранится только
   для отображения в интерфейсе. */
const THREADS_KEY = 'murrieta_threads';
const ACTIVE_THREAD_KEY = 'murrieta_active_thread';
const LEGACY_CHAT_KEY = 'murrieta_chat_log';

function autoTitle(messages){
  const u = messages.find(m=>m.role==='user');
  if (!u) return 'Новый чат';
  return u.content.length>42 ? u.content.slice(0,42)+'…' : u.content;
}
function newThread(){ return { id:'t'+Date.now()+Math.random().toString(36).slice(2,6), title:'Новый чат', messages:[] }; }
function saveThreads(list){ localStorage.setItem(THREADS_KEY, JSON.stringify(list.slice(-30))); }
function loadThreads(){
  try{
    let list = JSON.parse(localStorage.getItem(THREADS_KEY)||'null');
    if (list) return list;
  }catch{}
  /* миграция со старой версии, где хранился один общий лог без тредов */
  let legacy = [];
  try{ legacy = JSON.parse(localStorage.getItem(LEGACY_CHAT_KEY)||'[]'); }catch{}
  const list = legacy.length ? [{ id:'t0', title:autoTitle(legacy), messages:legacy }] : [];
  saveThreads(list);
  localStorage.removeItem(LEGACY_CHAT_KEY);
  return list;
}
function ensureActiveThread(list){
  const id = localStorage.getItem(ACTIVE_THREAD_KEY);
  let t = list.find(x=>x.id===id);
  if (!t) t = list[list.length-1];
  if (!t){ t = newThread(); list.push(t); saveThreads(list); }
  localStorage.setItem(ACTIVE_THREAD_KEY, t.id);
  return t;
}

const $a  = (s,r=document)=>r.querySelector(s);
const $$a = (s,r=document)=>[...r.querySelectorAll(s)];
const escA = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ------------------------------------------------ токенизация - */
const STOP = new Set(['и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да','ты','к','у','же','вы','за','бы','по','только','ее','мне','было','вот','от','меня','о','из','ему','теперь','когда','даже','ну','вдруг','ли','если','уже','или','ни','быть','был','него','до','вас','нибудь','опять','уж','вам','ведь','там','потом','себя','ничего','ей','может','они','тут','где','есть','надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без','будто','чего','раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого','какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','кажется','сейчас','были','куда','зачем','всех','никогда','можно','при','наконец','два','об','другой','хоть','после','над','больше','тот','через','эти','нас','про','всего','них','какая','много','разве','три','эту','моя','впрочем','хорошо','свою','этой','перед','иногда','лучше','чуть','том','нельзя','такой','им','более','всегда','конечно','всю','между']);

/* Грубая нормализация: обрезаем русские окончания до 4 символов.
   Было 6 — но «секса» (5 букв, не обрезается) и «сексуальных»→slice(0,6)=
   «сексуа» расходятся в последней букве и не считаются одним словом,
   хотя корень общий. 4 символа реже ловят такие ложные расхождения
   (короткие частые корни всё равно получают низкий вес через IDF). */
function toks(s){
  return (s.toLowerCase().match(/[a-zа-яё0-9]+(?:\.[0-9]+)*/gi)||[])
    .filter(w => w.length>1 && !STOP.has(w))
    .map(w => /^\d/.test(w) ? w : w.slice(0,4));
}

/* Кодексы и законы почти никогда не называют себя аббревиатурой внутри
   собственного текста («ПК» не встречается в самом Процессуальном кодексе),
   поэтому обычный BM25 по токенам эту связь не видит вообще. Здесь —
   явный словарь: аббревиатура/сленг → id документа, который при
   упоминании принудительно поднимается в выдаче. */
const ABBR_DOCS = {
  'пк':['pk'], 'процессуальный':['pk'], 'процессуальныйкодекс':['pk'],
  'уак':['uak'], 'ук':['uak'], 'ак':['uak'], 'уголовка':['uak'], 'админка':['uak'],
  'дк':['dk'], 'дорожный':['dk'], 'пдд':['dk'],
  'ск':['sudebnyy'], 'судебныйкодекс':['sudebnyy'],
  'тк':['trudovoy'],
  'эк':['eticheskiy'], 'этика':['eticheskiy'],
  'зот':['z-zot'],
  'конституция':['konstituciya'], 'конст':['konstituciya'],
  'лспд':['z-lspd','u-lspd'], 'lspd':['z-lspd','u-lspd'],
  'лссд':['z-lssd','u-lssd','u-lssd-otd'], 'lssd':['z-lssd','u-lssd','u-lssd-otd'],
  'фиб':['z-fib','u-fib'], 'fib':['z-fib','u-fib'],
  'гов':['z-pravitelstvo','u-gov','u-gov-lic'], 'gov':['z-pravitelstvo','u-gov','u-gov-lic'],
  'емс':['z-ems','u-ems','u-ems-disc','u-ems-lic','u-ems-med'], 'ems':['z-ems','u-ems','u-ems-disc','u-ems-lic','u-ems-med'],
  'санг':['z-army','u-ng','u-ng-karaul'], 'sang':['z-army','u-ng','u-ng-karaul'], 'нг':['z-army','u-ng','u-ng-karaul'],
  'сасра':['z-saspa','u-saspa','u-saspa-doktr','u-saspa-rasp'], 'saspa':['z-saspa','u-saspa','u-saspa-doktr','u-saspa-rasp'],
  'усс':['z-usss'], 'usss':['z-usss'],
  'усмс':['z-usms'], 'usms':['z-usms'],
  'прецедент':['s-precedenty'], 'прецеденты':['s-precedenty'], 'толкование':['s-precedenty'], 'толкования':['s-precedenty'],
  'адвокатура':['z-advokat'], 'адвокатский':['z-advokat'],
  'прокуратура':['z-prokuratura'],
  'юрисдикция':['z-yurisdikciya'],
  'оружие':['z-oruzhie'], 'мвоз':['z-oruzhie'],
  'розыск':['z-rozysk'],
};
function abbrevDocs(query){
  const words = query.toLowerCase().match(/[a-zа-яё]+/gi) || [];
  const hit = new Set();
  for (const w of words) if (ABBR_DOCS[w]) ABBR_DOCS[w].forEach(d=>hit.add(d));
  return hit;
}

async function ensureIndex(){
  if (AI.chunks) return;
  const r = await fetch('data/chunks.json');
  AI.chunks = await r.json();
  const df = Object.create(null);
  for (const c of AI.chunks){
    c._t = toks(c.heading + ' ' + c.docTitle + ' ' + c.text);
    c._len = c._t.length || 1;
    const tf = Object.create(null);
    for (const t of c._t) tf[t] = (tf[t]||0)+1;
    c._tf = tf;
    for (const t in tf) df[t] = (df[t]||0)+1;
  }
  const N = AI.chunks.length;
  AI.idf = Object.create(null);
  for (const t in df) AI.idf[t] = Math.log(1 + (N - df[t] + 0.5)/(df[t] + 0.5));
  AI.avgLen = AI.chunks.reduce((s,c)=>s+c._len,0)/N;
}

/* BM25 + буст за точный номер статьи */
function retrieve(query, k=10, opts={}){
  const ql = query.toLowerCase();
  const q = toks(query);
  const nums = query.match(/\b\d+\.\d+(?:\.\d+)?\b/g) || [];
  const abbrDocs = abbrevDocs(query);
  /* Буст за буквальное совпадение значимых слов (5+ букв) в самом тексте
     фрагмента — обходит огрубление 4-символьного стемминга для редких,
     но важных существительных («сексуальный», «хулиганство»), которые
     иначе теряются на фоне общих слов запроса. */
  const litWords = [...new Set((query.toLowerCase().match(/[а-яёa-z]{5,}/g)||[])
    .filter(w=>!STOP.has(w)))];
  /* Вопрос «что мне за это будет» должен вытягивать кодекс и памятки, а не
     профильный устав той фракции, чьё название случайно попало в вопрос.
     Свободный рассказ о происшествии (составление заявления) редко содержит
     эти слова-триггеры вообще — вызывающий код может форсировать буст
     через opts.forceCore, иначе УАК не получит приоритет и потонет в
     профильных законах структур, которые просто упомянуты в тексте. */
  const wantsNorm = opts.forceCore || /стать|наказан|штраф|залог|нарушен|хулиган|можно ли|могу ли|обязан|задерж|арест|срок/.test(ql);
  const k1=1.5, b=0.72;
  const scored = AI.chunks.map(c=>{
    let s = 0;
    for (const t of q){
      const f = c._tf[t]; if (!f) continue;
      const idf = AI.idf[t] || 0;
      s += idf * (f*(k1+1)) / (f + k1*(1 - b + b*c._len/AI.avgLen));
    }
    for (const n of nums) if (c.text.includes(n)) s += 14;
    for (const w of litWords) if (c.text.toLowerCase().includes(w)) s += 6;
    /* Буст за совпадение с заголовком раздела — отдельно и сильнее, чем
       совпадение с текстом. Слова типа «кодекса», «принципы» настолько
       частотны по всему корпусу, что обычный IDF почти не отличает их
       от шума, даже когда вопрос почти буквально повторяет название
       главы («принципы процессуального кодекса» → «Глава VI Принципы
       процессуального кодекса»). Заголовок — куда более точный сигнал,
       чем совпадение где-то в тексте параграфа. */
    if (c.heading){
      const hl = c.heading.toLowerCase();
      for (const w of litWords) if (hl.includes(w)) s += 12;
    }
    if (/задерж|арест|миранд|обыск|допрос|сил/.test(ql) && c.doc==='pk') s += 1.6;
    /* Явное упоминание аббревиатуры («ПК», «УАК», «ЗОТ», «FIB»...) — сильный
       сигнал: утраивает уже найденную по теме релевантность внутри этого
       документа. Умножение, а не плюс — иначе абревиатура одна вытащит
       случайные, не относящиеся к вопросу фрагменты того же документа
       выше по-настоящему релевантных находок из других источников. */
    if (abbrDocs.has(c.doc)) s = s>0 ? s*3 : s+3;
    if (wantsNorm){
      if (c.doc === 'uak' || c.doc === 'pk' || c.doc === 'dk') s *= 1.7;  // базовые кодексы с санкциями
      else if (c.doc.startsWith('guide-')) s *= 1.5;                     // сведённые выводы
      else if (/^u-|^s-/.test(c.doc)) s *= 0.7;                          // уставы и практика — фон, а не старт
    }
    return {c, s};
  }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);

  /* Лимит на документ: иначе один устав занимает половину контекста и
     вытесняет норму, по которой задан вопрос. Памяткам лимит выше — у них
     несколько коротких блоков по одной теме бывают релевантны сразу
     (перечень 12.6.1, перечень 12.6 и оговорка про закрытость списка). */
  const per = {}, out = [];
  for (const {c} of scored){
    let cap = c.doc.startsWith('guide-') ? (opts.forceCore ? 6 : 4) : 2;
    /* При составлении заявления нужно шире охватить УАК: релевантная статья
       и комментарий к ней часто лежат в разных чанках, а два места на
       документ иногда занимают более общие совпадения раньше нужного. */
    if (opts.forceCore && c.doc === 'uak') cap = 10;
    else if (opts.forceCore && c.doc === 'pk') cap = 4;
    per[c.doc] = (per[c.doc]||0);
    if (per[c.doc] >= cap) continue;
    per[c.doc]++; out.push(c);
    if (out.length >= k) break;
  }
  return out;
}

/* Модель склонна путать санкции соседних статей (например, приписать 12.6.1
   арест от 13.4). Поэтому точные цифры подаём отдельным блоком прямо из
   articles.json — это первоисточник разбора, а не пересказ. */
async function sanctionCard(query, chunks){
  if (!AI.articles){
    try { AI.articles = await (await fetch('data/articles.json')).json(); }
    catch { return ''; }
  }
  const nums = new Set();
  const scan = s => (s.match(/\b\d{1,2}\.\d{1,2}(?:\.\d{1,2})?\b/g) || []).forEach(n => nums.add(n));
  scan(query);
  chunks.forEach(c => scan(c.text));
  const hits = AI.articles.filter(a => nums.has(a.num)).slice(0, 14);
  if (!hits.length) return '';
  return '\n\n=== ТОЧНЫЕ САНКЦИИ УАК (числа бери ТОЛЬКО отсюда) ===\n' +
    hits.map(a => `${a.num} [${a.type}] ${a.title}\n   САНКЦИЯ: ${a.sanction}` +
      (a.bail ? `\n   ЗАЛОГ: ${a.bail.toLocaleString('ru-RU')}$` : '\n   ЗАЛОГ: не предусмотрен')
    ).join('\n');
}

/* выносим наружу — удобно проверять качество поиска из консоли */
AI.retrieve = retrieve;
AI.ensureIndex = ensureIndex;
AI.sanctionCard = sanctionCard;

/* Составление содержания заявления: та же схема поиска контекста,
   что и в чате, но отдельный режим на Worker (DRAFT_SYSTEM) и разбор
   ответа на три секции для автозаполнения полей формы. */
/* Некоторые темы слишком чувствительны, чтобы надеяться на удачу обычного
   текстового поиска: перепутать статьи о хулиганстве и о половых
   преступлениях — не техническая мелочь, а прямая ошибка в содержании
   заявления. Для таких тем нужный фрагмент подкладывается в контекст
   гарантированно, а не по результату ранжирования. */
const FORCED_TOPICS = [
  { test: /секс|половой|изнасил|мужеложств|лесбиянств/i,
    match: c => c.doc === 'uak' && /имитирующих сексуальные акты|Изнасилование, мужеложство/i.test(c.text) },
];
function forcedChunks(query){
  const out = [];
  const byId = new Map(AI.chunks.map(c=>[c.id,c]));
  for (const t of FORCED_TOPICS){
    if (!t.test.test(query)) continue;
    for (const c of AI.chunks){
      if (!t.match(c)) continue;
      /* Нарезка на 1400 символов иногда режет прямо между номером статьи
         («4. Комментарий к статье 12.6...») и текстом самого пункта —
         тогда в найденном куске нет номера вообще. Подхватываем
         предыдущий кусок того же документа, чтобы номер не терялся. */
      const [doc, idx] = c.id.split('#');
      for (const back of [2, 1]){
        const prev = byId.get(doc+'#'+(Number(idx)-back));
        if (prev && !out.includes(prev)) out.push(prev);
      }
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}

/* Общая механика для «структурированных» режимов ИИ (составление
   заявления, правовая оценка): собрать контекст той же схемой поиска,
   что и обычный чат, дождаться потокового ответа целиком и разобрать
   его на секции по заголовкам ### — вместо обычного чата с пузырьками. */
async function callStructured(description, {mode, extra, sections}){
  if (!isConfigured()) throw new Error('ИИ не настроен — нажмите «Настроить» и укажите адрес Worker.');
  await ensureIndex();
  const forced = forcedChunks(description);
  const rest = retrieve(description, 16, {forceCore:true}).filter(c=>!forced.includes(c));
  const ctx = [...forced, ...rest].slice(0, 18);
  const context = ctx.map(c => c.doc.startsWith('guide-')
    ? `—— внутренний разбор, источники см. в тексте ——\n${c.text}`
    : `—— ${c.docTitle}${c.heading?' · '+c.heading:''} ——\n${c.text}`
  ).join('\n\n') + await sanctionCard(description, ctx);

  const res = await fetch(workerUrl()+'/chat', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ question:description, context, mode, profile: window.Profile?.contextLine()||'', ...extra })
  });
  if (!res.ok){
    const t = await res.text().catch(()=> '');
    let msg = t.slice(0,220); try{ msg = JSON.parse(t).error || msg; }catch{}
    throw new Error(msg);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let acc = '', buf = '';
  while (true){
    const {done, value} = await reader.read();
    if (done) break;
    buf += dec.decode(value, {stream:true});
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines){
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const p = s.slice(5).trim();
      if (p === '[DONE]') continue;
      try{ const j = JSON.parse(p); const d = j.choices?.[0]?.delta?.content; if (d) acc += d; }catch{}
    }
  }
  const out = { raw: acc };
  for (let i=0; i<sections.length; i++){
    const [key, label] = sections[i];
    const stop = i+1<sections.length ? '###\\s*'+sections[i+1][1] : '$';
    const re = new RegExp('###\\s*'+label+'\\s*\\n([\\s\\S]*?)(?='+stop+')', 'i');
    const m = acc.match(re);
    out[key] = m ? m[1].trim() : '';
  }
  return out;
}

AI.draftPetition = (description, formTitle) => callStructured(description, {
  mode: 'draft', extra: { formTitle },
  sections: [['analysis','АНАЛИЗ'],['description','ОПИСАНИЕ СИТУАЦИИ'],['request','ПРОСЬБА']],
});

AI.assessSituation = (description) => callStructured(description, {
  mode: 'assess', extra: {},
  sections: [['verdict','ВЕРДИКТ'],['sides','РАЗБОР ПО СТОРОНАМ'],['release','ОСНОВАНИЯ ДЛЯ ОСВОБОЖДЕНИЯ'],['penalty','ЧТО ГРОЗИТ'],['defense','ВОЗМОЖНЫЕ ВОЗРАЖЕНИЯ']],
});

/* ------------------------------------------------ markdown ---- */
function md(t){
  let h = escA(t);
  h = h.replace(/```([\s\S]*?)```/g,(m,c)=>`<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  h = h.replace(/^\s*[-•]\s+(.*)$/gm,'<li>$1</li>');
  h = h.replace(/^\s*(\d+)[.)]\s+(.*)$/gm,'<li>$2</li>');
  h = h.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g,'<ul>$1</ul>');
  h = h.split(/\n{2,}/).map(p=>/^<(ul|pre|h\d)/.test(p.trim())?p:`<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  return h;
}

/* ------------------------------------------------ вид ---------- */
AI.view = function(){
  const SUGG = [
    'Какой порядок задержания и что будет, если пропустить пункт?',
    'Сколько ждать руководство при задержании госслужащего?',
    'Что грозит за 12.8.1 и какой залог?',
    'Когда можно обыскать машину без ордера?',
    'Можно ли сразу применить тазер?',
    'Кто обладает неприкосновенностью?',
  ];
  return `
  <section class="sec view">
    <div class="sec__head">
      <div><h2 class="h2">ИИ-помощник по законке</h2>
      <p>Отвечает по 62 документам с форума: УАК, Процессуальный, Дорожный, профильные законы и правила Murrieta.
         Поиск нужных фрагментов идёт прямо в браузере — модель получает только вопрос и найденные выдержки.</p></div>
    </div>

    ${isConfigured() ? '' : `
    <div class="setup">
      <b>Помощник ещё не подключён.</b> Разверните Cloudflare Worker из папки <code>worker/</code>,
      затем укажите его адрес — он сохранится в этом браузере.
      <div class="chat__row" style="margin-top:12px">
        <textarea id="wUrl" rows="1" placeholder="https://murrieta-ai.ваш-аккаунт.workers.dev"></textarea>
        <button class="btn btn--main" id="wSave" style="padding:11px 18px">Сохранить</button>
      </div>
    </div>`}

    <div class="sugg">${SUGG.map(s=>`<button data-q="${escA(s)}">${escA(s)}</button>`).join('')}</div>

    <div class="chat-wrap">
      <aside class="chat-side" id="chatSide"></aside>
      <div class="chat">
        <div class="chat__log" id="log">
          <div class="msg msg--ai">
            <span class="msg__av">AI</span>
            <div class="msg__b"><p>Спрашивайте обычным языком — например «за что можно задержать по 17.6 и какой залог»
            или «что делать, если задержанный требует адвоката».</p>
            <p>Отвечаю только по документам с форума и ссылаюсь на конкретные статьи. Если чего-то в базе нет — так и скажу.</p></div>
          </div>
        </div>
        <div class="chat__in">
          <div class="chat__row">
            <textarea id="q" rows="1" placeholder="Ваш вопрос по законке или правилам…"></textarea>
            <button class="chat__send" id="send" title="Отправить" disabled>
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>
            </button>
          </div>
          <div class="chat__hint">
            <span>Enter — отправить, Shift+Enter — новая строка</span>
            <span><a href="#" id="cfg" style="color:var(--acc)">Настроить</a> · <a href="#" id="clr" style="color:var(--tx-3)">Очистить чат</a></span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
};

/* ------------------------------------------------ логика ------- */
AI.bind = function(){
  const log = $a('#log'), q = $a('#q'), send = $a('#send'), side = $a('#chatSide');
  if (!log) return;

  let threads = loadThreads();
  let active = ensureActiveThread(threads);
  AI.history = active.messages.map(m=>({role:m.role, content:m.content}));

  function renderSide(){
    side.innerHTML = `
      <button class="btn btn--main" id="newChat" type="button" style="width:100%;margin-bottom:10px;padding:9px;font-size:13px">+ Новый чат</button>
      <div class="chat-side__list">
        ${threads.slice().reverse().map(t=>`
          <div class="chat-side__item${t.id===active.id?' is-on':''}" data-id="${t.id}">
            <span>${escA(t.title||'Новый чат')}</span>
            <button class="chat-side__del" data-del="${t.id}" title="Удалить чат" type="button">✕</button>
          </div>`).join('') || '<p class="modal__hint" style="padding:0 2px">Чатов пока нет.</p>'}
      </div>`;
    side.querySelector('#newChat').addEventListener('click', ()=>{
      const t = newThread();
      threads.push(t); saveThreads(threads);
      localStorage.setItem(ACTIVE_THREAD_KEY, t.id);
      active = t; AI.history = [];
      renderLog(); renderSide();
    });
    side.querySelectorAll('.chat-side__item').forEach(row=>{
      row.addEventListener('click', e=>{
        if (e.target.closest('[data-del]')) return;
        const t = threads.find(x=>x.id===row.dataset.id);
        if (!t || t===active) return;
        active = t; AI.history = active.messages.map(m=>({role:m.role,content:m.content}));
        localStorage.setItem(ACTIVE_THREAD_KEY, active.id);
        renderLog(); renderSide();
      });
    });
    side.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        const id = btn.dataset.del;
        threads = threads.filter(t=>t.id!==id);
        if (active.id===id){
          active = threads[threads.length-1] || newThread();
          if (!threads.includes(active)) threads.push(active);
          localStorage.setItem(ACTIVE_THREAD_KEY, active.id);
          AI.history = active.messages.map(m=>({role:m.role,content:m.content}));
          renderLog();
        }
        saveThreads(threads);
        renderSide();
      });
    });
  }

  function renderLog(){
    log.innerHTML = `<div class="msg msg--ai"><span class="msg__av">AI</span><div class="msg__b"><p>Спрашивайте обычным языком — например «за что можно задержать по 17.6 и какой залог»
      или «что делать, если задержанный требует адвоката».</p>
      <p>Отвечаю только по документам с форума и ссылаюсь на конкретные статьи. Если чего-то в базе нет — так и скажу.</p></div></div>`;
    let lastQ = '';
    for (const m of active.messages){
      if (m.role==='user'){ bubble('user', `<p>${escA(m.content)}</p>`); lastQ = m.content; }
      else { const box = bubble('ai', md(m.content)); addFavButton(box, lastQ, m.content); }
    }
    log.scrollTop = log.scrollHeight;
  }

  function addFavButton(box, question, answer){
    const b = document.createElement('button');
    b.className = 'msg__fav'; b.type = 'button'; b.title = 'Сохранить ответ в избранное';
    b.textContent = '★ В избранное';
    b.addEventListener('click', ()=>{
      window.FavAnswers.add(question||'Вопрос без текста', answer);
      b.textContent = '✓ Сохранено'; b.disabled = true;
    });
    box.appendChild(b);
  }

  const grow = ()=>{ q.style.height='auto'; q.style.height=Math.min(q.scrollHeight,150)+'px'; send.disabled = !q.value.trim() || AI.busy; };
  q.addEventListener('input', grow);
  q.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); ask(); } });
  send.addEventListener('click', ask);
  $$a('.sugg button').forEach(b=>b.addEventListener('click',()=>{ q.value=b.dataset.q; grow(); ask(); }));

  $a('#clr')?.addEventListener('click',e=>{ e.preventDefault();
    active.messages = []; active.title = 'Новый чат'; AI.history = [];
    saveThreads(threads); renderLog(); renderSide(); });

  renderSide();
  renderLog();

  $a('#cfg')?.addEventListener('click',e=>{ e.preventDefault();
    const cur = localStorage.getItem('murrieta_worker') || '';
    const v = prompt('Адрес Cloudflare Worker:', cur || WORKER_DEFAULT);
    if (v){ localStorage.setItem('murrieta_worker', v.trim()); location.reload(); } });

  $a('#wSave')?.addEventListener('click',()=>{
    const v = $a('#wUrl').value.trim();
    if (!/^https?:\/\//.test(v)) return alert('Введите полный адрес, начиная с https://');
    localStorage.setItem('murrieta_worker', v); location.reload();
  });

  function bubble(role, html, sources){
    const el = document.createElement('div');
    el.className = 'msg msg--'+(role==='user'?'me':'ai');
    el.innerHTML = `<span class="msg__av">${role==='user'?'ВЫ':'AI'}</span><div class="msg__b">${html}</div>`;
    if (sources?.length){
      const s = document.createElement('div');
      s.className = 'msg__src';
      s.innerHTML = sources.map(c=>`<a href="#/doc/${c.doc}" title="${escA(c.heading||'')}">${escA(c.docTitle)}</a>`).join('');
      el.querySelector('.msg__b').appendChild(s);
    }
    log.appendChild(el); log.scrollTop = log.scrollHeight;
    return el.querySelector('.msg__b');
  }

  async function ask(){
    const text = q.value.trim();
    if (!text || AI.busy) return;
    if (!isConfigured()){
      bubble('ai', '<p>Сначала подключите Cloudflare Worker — нажмите <b>Настроить</b> и вставьте его адрес.</p>');
      return;
    }
    AI.busy = true; send.disabled = true;
    bubble('user', `<p>${escA(text)}</p>`);
    q.value=''; q.style.height='auto';

    const box = bubble('ai', `<div class="dots"><i></i><i></i><i></i></div>`);

    try{
      await ensureIndex();
      const ctx = retrieve(text, 8);
      /* Без номеров [1],[2] — иначе модель тащит их в ответ как «источники».
         Для памяток заголовок вообще не показываем: если модель видит
         строку «Памятка: …», она копирует её в ответ как название
         источника, хотя памятка не источник права — источник назван
         внутри самого текста (УАК, ПК, номер прецедента). Кодексы и
         законы подписываем как обычно. */
      const context = ctx.map(c => c.doc.startsWith('guide-')
        ? `—— внутренний разбор, источники см. в тексте ——\n${c.text}`
        : `—— ${c.docTitle}${c.heading?' · '+c.heading:''} ——\n${c.text}`
      ).join('\n\n') + await sanctionCard(text, ctx);

      const res = await fetch(workerUrl()+'/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ question:text, context, history:AI.history.slice(-6), profile: window.Profile?.contextLine()||'' })
      });
      if (!res.ok){
        const t = await res.text().catch(()=> '');
        let msg = t.slice(0,220);
        try { msg = JSON.parse(t).error || msg; } catch {}
        throw new Error(msg);
      }

      /* потоковый ответ */
      const reader = res.body.getReader(), dec = new TextDecoder();
      let acc = '', buf = '';
      box.innerHTML = '';
      while (true){
        const {done, value} = await reader.read();
        if (done) break;
        buf += dec.decode(value, {stream:true});
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines){
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const p = s.slice(5).trim();
          if (p === '[DONE]') continue;
          try{
            const j = JSON.parse(p);
            const d = j.choices?.[0]?.delta?.content;
            if (d){ acc += d; box.innerHTML = md(acc); log.scrollTop = log.scrollHeight; }
          }catch{}
        }
      }
      if (!acc) acc = 'Пустой ответ от модели. Попробуйте переформулировать вопрос.';
      box.innerHTML = md(acc);

      if (ctx.length){
        const s = document.createElement('div');
        s.className = 'msg__src';
        const uniq = [...new Map(ctx.map(c=>[c.doc,c])).values()];
        s.innerHTML = '<span style="font-size:11px;color:var(--tx-3);align-self:center">Источники:</span>' +
          uniq.map(c=>`<a href="#/doc/${c.doc}">${escA(c.docTitle)}</a>`).join('');
        box.appendChild(s);
      }
      addFavButton(box, text, acc);
      AI.history.push({role:'user',content:text},{role:'assistant',content:acc});
      active.messages.push({role:'user',content:text},{role:'assistant',content:acc});
      if (active.messages.length===2) active.title = autoTitle(active.messages);
      saveThreads(threads);
      renderSide();
      log.scrollTop = log.scrollHeight;
    }catch(err){
      box.innerHTML = `<p style="color:#ff8f6b">Ошибка: ${escA(err.message)}</p>
        <p style="font-size:13px;color:var(--tx-3)">Проверьте, что Worker развёрнут, ключ OpenRouter задан
        и адрес сайта разрешён в <code>ALLOWED_ORIGINS</code>.</p>`;
    }finally{
      AI.busy = false; send.disabled = !q.value.trim(); q.focus();
    }
  }
};
