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

const $a  = (s,r=document)=>r.querySelector(s);
const $$a = (s,r=document)=>[...r.querySelectorAll(s)];
const escA = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ------------------------------------------------ токенизация - */
const STOP = new Set(['и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да','ты','к','у','же','вы','за','бы','по','только','ее','мне','было','вот','от','меня','о','из','ему','теперь','когда','даже','ну','вдруг','ли','если','уже','или','ни','быть','был','него','до','вас','нибудь','опять','уж','вам','ведь','там','потом','себя','ничего','ей','может','они','тут','где','есть','надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без','будто','чего','раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого','какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','кажется','сейчас','были','куда','зачем','всех','никогда','можно','при','наконец','два','об','другой','хоть','после','над','больше','тот','через','эти','нас','про','всего','них','какая','много','разве','три','эту','моя','впрочем','хорошо','свою','этой','перед','иногда','лучше','чуть','том','нельзя','такой','им','более','всегда','конечно','всю','между']);

/* грубая нормализация: обрезаем русские окончания до 6 символов */
function toks(s){
  return (s.toLowerCase().match(/[a-zа-яё0-9]+(?:\.[0-9]+)*/gi)||[])
    .filter(w => w.length>1 && !STOP.has(w))
    .map(w => /^\d/.test(w) ? w : w.slice(0,6));
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
function retrieve(query, k=8){
  const q = toks(query);
  const nums = query.match(/\b\d+\.\d+(?:\.\d+)?\b/g) || [];
  const k1=1.5, b=0.72;
  const scored = AI.chunks.map(c=>{
    let s = 0;
    for (const t of q){
      const f = c._tf[t]; if (!f) continue;
      const idf = AI.idf[t] || 0;
      s += idf * (f*(k1+1)) / (f + k1*(1 - b + b*c._len/AI.avgLen));
    }
    for (const n of nums) if (c.text.includes(n)) s += 14;
    if (/задерж|арест|миранд|обыск|допрос|сил/.test(query.toLowerCase()) && c.doc==='pk') s += 1.6;
    return {c, s};
  }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);

  /* не более 3 фрагментов из одного документа — чтобы контекст был разнообразнее */
  const per = {}, out = [];
  for (const {c} of scored){
    per[c.doc] = (per[c.doc]||0);
    if (per[c.doc] >= 3) continue;
    per[c.doc]++; out.push(c);
    if (out.length >= k) break;
  }
  return out;
}

/* выносим наружу — удобно проверять качество поиска из консоли */
AI.retrieve = retrieve;
AI.ensureIndex = ensureIndex;

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
          <span><a href="#" id="cfg" style="color:var(--acc)">Настроить</a> · <a href="#" id="clr" style="color:var(--tx-3)">Очистить</a></span>
        </div>
      </div>
    </div>
  </section>`;
};

/* ------------------------------------------------ логика ------- */
AI.bind = function(){
  const log = $a('#log'), q = $a('#q'), send = $a('#send');
  if (!log) return;
  AI.history = [];

  const grow = ()=>{ q.style.height='auto'; q.style.height=Math.min(q.scrollHeight,150)+'px'; send.disabled = !q.value.trim() || AI.busy; };
  q.addEventListener('input', grow);
  q.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); ask(); } });
  send.addEventListener('click', ask);
  $$a('.sugg button').forEach(b=>b.addEventListener('click',()=>{ q.value=b.dataset.q; grow(); ask(); }));

  $a('#clr')?.addEventListener('click',e=>{ e.preventDefault(); AI.history=[];
    log.innerHTML = `<div class="msg msg--ai"><span class="msg__av">AI</span><div class="msg__b"><p>История очищена. Спрашивайте.</p></div></div>`; });

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
      const context = ctx.map((c,i)=>
        `[${i+1}] ${c.docTitle}${c.heading?' — '+c.heading:''}\n${c.text}`).join('\n\n---\n\n');

      const res = await fetch(workerUrl()+'/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ question:text, context, history:AI.history.slice(-6) })
      });
      if (!res.ok){
        const t = await res.text().catch(()=> '');
        throw new Error(`Worker вернул ${res.status}. ${t.slice(0,180)}`);
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
      AI.history.push({role:'user',content:text},{role:'assistant',content:acc});
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
