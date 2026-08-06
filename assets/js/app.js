/* ============================================================
   Murrieta · Правовая база — роутер, представления, поиск
   ============================================================ */
'use strict';

const DATA = { index:null, articles:null, traffic:null, quickref:null, guides:null, forms:null, docs:{} };
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];

const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => n.toLocaleString('ru-RU')+'$';

async function load(key, url){
  if (DATA[key]) return DATA[key];
  const r = await fetch(url);
  if (!r.ok) throw new Error('Не удалось загрузить '+url);
  DATA[key] = await r.json();
  return DATA[key];
}
const loadIndex    = ()=>load('index','data/index.json');
const loadArticles = ()=>load('articles','data/articles.json');
const loadTraffic  = ()=>load('traffic','data/traffic.json');
const loadQuick    = ()=>load('quickref','data/quickref.json');
const loadGuides   = ()=>load('guides','data/guides.json');
const loadForms    = ()=>load('forms','data/forms.json');
async function loadDoc(id){
  if (DATA.docs[id]) return DATA.docs[id];
  const r = await fetch('data/docs/'+id+'.json');
  if (!r.ok) throw new Error('Документ не найден');
  return (DATA.docs[id] = await r.json());
}

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.hidden=true, 2600);
}

/* ---------------------------------------------------- иконки -- */
const ICONS = {
  cuffs:'<circle cx="7" cy="12" r="4.2"/><circle cx="17" cy="12" r="4.2"/><path d="M11.2 12h1.6"/>',
  mic:'<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2.2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock:'<rect x="4" y="10" width="16" height="11" rx="2.2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
  shield:'<path d="M12 3l8 3v6c0 4.8-3.3 8.9-8 10-4.7-1.1-8-5.2-8-10V6z"/>',
  users:'<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6 6 0 0 0-2.6-4.9"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/>',
  ban:'<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  scale:'<path d="M12 4v16M7 20h10M5 8h14M5 8l-2.6 5.4a3.2 3.2 0 0 0 5.2 0zM19 8l2.6 5.4a3.2 3.2 0 0 1-5.2 0z"/>',
  star:'<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
  badge:'<path d="M12 3l7 2.6v6c0 4.3-2.9 7.9-7 9-4.1-1.1-7-4.7-7-9v-6z"/><circle cx="12" cy="10.4" r="2.4"/><path d="M8.6 17c.7-1.6 1.9-2.4 3.4-2.4s2.7.8 3.4 2.4"/>',
  id:'<rect x="2.8" y="5" width="18.4" height="14" rx="2.4"/><circle cx="8.6" cy="11" r="2.2"/><path d="M14 10h4M14 14h4M5.4 16.4c.5-1.3 1.6-2 3.2-2s2.7.7 3.2 2"/>',
  folder:'<path d="M3.5 7.2a2 2 0 0 1 2-2h3.4l2 2.4h7.6a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/>',
  balance:'<path d="M12 4.5v15M6 19.5h12M4 9h16M12 4.5L4 9M12 4.5L20 9"/>',
  flag:'<path d="M5.5 21V4M5.5 5h11l-1.8 3.6L16.5 12h-11"/>',
  chat:'<path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 21l1.5-3.7C4.2 16 3.5 14.3 3.5 12.4c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/>'
};
const ico = (n,s=20)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||ICONS.folder}</svg>`;
const arrow = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const chev  = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>';

/* ------------------------------------------------- утилиты ---- */
function reveal(root=document){
  const io = new IntersectionObserver((es)=>{
    es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
  },{threshold:.08,rootMargin:'0px 0px -40px'});
  $$('.rv',root).forEach(el=>io.observe(el));
}
function tilt(root=document){
  $$('.card',root).forEach(c=>{
    c.addEventListener('pointermove',e=>{
      const r=c.getBoundingClientRect();
      c.style.setProperty('--mx',(e.clientX-r.left)+'px');
      c.style.setProperty('--my',(e.clientY-r.top)+'px');
    });
  });
}
/* подсветка совпадений */
function hl(text,q){
  const s = esc(text);
  if(!q) return s;
  const words = q.trim().split(/\s+/).filter(w=>w.length>1).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(!words.length) return s;
  return s.replace(new RegExp('('+words.join('|')+')','gi'),'<mark>$1</mark>');
}
const jurTag = j => j.map(x=>{
  const k = x.toUpperCase();
  const cls = k.startsWith('ФЕД') ? 'tag--fed' : k.startsWith('РЕГ') ? '' : 'tag--acc';
  return `<span class="tag ${cls}">${esc(x)}</span>`;
}).join('');
const banTag = n => n===0 ? '' :
  `<span class="tag tag--warn" title="Запрет на работу в гос. структурах">${'*'.repeat(n)} ${n===1?'7 дней':n===2?'21 день':'пожизненно'}</span>`;

/* ============================================================
   ГЛАВНАЯ
   ============================================================ */
async function viewHome(){
  const [idx, arts, dk] = await Promise.all([loadIndex(), loadArticles(), loadTraffic()]);
  const ug = arts.filter(a=>a.type==='У').length, ad = arts.length-ug;

  const cards = [
    ['cards','Шпаргалки','#/cards','Порядок задержания и ареста, Миранда, тайминги, стадии применения силы, обыск, неприкосновенные лица — всё выверено по действующей редакции.','shield'],
    ['guides','Памятки','#/guides','Как отвечать адвокату, чем отличаются LSPD, LSSD, FIB и GOV, где правила проекта запрещают то, что закон разрешает, и что меняют прецеденты.','scale'],
    ['ai','ИИ-помощник','#/ai','Задайте вопрос по законке или правилам обычным языком — ответ со ссылками на конкретные статьи и документы.','chat'],
  ];

  const favs = window.Favorites.all();
  const favBlock = favs.length ? `
  <section class="sec">
    <div class="sec__head rv"><div><h2 class="h2">Избранное</h2><p>Статьи, закреплённые для быстрого доступа — звёздочка на карточке статьи.</p></div></div>
    <div class="chips">
      ${favs.map(k=>{
        const [doc,num] = k.split(':');
        const a = (doc==='uak'?arts:dk).find(x=>x.num===num);
        if (!a) return '';
        return `<a class="chip" href="#/${doc}" data-fav-open="${doc}:${esc(num)}">${doc==='uak'?'УАК':'ДК'} ${esc(num)} — ${esc(a.title)}</a>`;
      }).join('')}
    </div>
  </section>` : '';

  return `
  <section class="hero view">
    <span class="eyebrow rv">GTA 5 RP · Сервер №20 · Murrieta</span>
    <h1 class="h1 rv">Правовая база<br><em>государственных структур</em></h1>
    <p class="lead rv">Законодательство штата San Andreas и правила проекта — собраны с официального форума,
       разобраны по статьям и приведены к виду, в котором ими реально можно пользоваться на дежурстве.</p>
    <div class="hero__cta rv">
      <a class="btn btn--main" href="#/cards">Открыть шпаргалки ${arrow}</a>
      <a class="btn btn--ghost" href="#/ai">Спросить у ИИ</a>
    </div>
    <div class="stats">
      ${[[arts.length,'статей УАК'],[ug+' / '+ad,'уголовных / адм.'],[dk.length,'статей ДК'],[idx.length,'документов']]
        .map(([v,l])=>`<div class="stat rv"><b>${v}</b><span>${l}</span></div>`).join('')}
    </div>
  </section>

  <section class="sec">
    <div class="grid grid--3">
      ${cards.map(([id,t,href,d,i])=>`
        <a class="card card--link rv" href="${href}">
          <div class="card__ico">${ico(i)}</div>
          <h3 class="h3">${t}</h3><p>${d}</p>
          <span class="card__more">Перейти ${arrow}</span>
        </a>`).join('')}
    </div>
  </section>

  <section class="sec">
    <div class="sec__head rv">
      <div><h2 class="h2">Что внутри</h2>
      <p>Кодексы, профильные законы структур и правила проекта — включая дополнения, действующие именно на Murrieta.</p></div>
      <a class="btn btn--ghost" href="#/docs">Все документы ${arrow}</a>
    </div>
    <div class="grid grid--4">
      ${['kodeks','zakon','gov','murrieta'].map(c=>{
        const items = idx.filter(d=>d.cat===c);
        const name = items[0]?.catName || c;
        return `<a class="card card--link rv" href="#/docs?cat=${c}">
          <span class="tag tag--acc">${items.length}</span>
          <h3 class="h3" style="margin-top:12px">${esc(name)}</h3>
          <p>${items.slice(0,4).map(d=>esc(d.title)).join(' · ')}${items.length>4?' и др.':''}</p>
        </a>`;}).join('')}
    </div>
  </section>
  ${favBlock}`;
}

/* ============================================================
   СТАТЬИ УАК
   ============================================================ */
const uakState = { q:'', type:'', jur:'', chapter:'' };

async function viewUak(){
  const arts = await loadArticles();
  const chapters = [...new Set(arts.map(a=>a.chapter))].filter(Boolean);
  return `
  <section class="sec view">
    <div class="sec__head">
      <div><h2 class="h2">Уголовно-административный кодекс</h2>
      <p>${arts.length} статей Особенной части. Нажмите на статью, чтобы раскрыть санкцию, залог и сроки.</p></div>
    </div>
    <div class="tools">
      <label class="field">
        ${ico('search',16)}
        <input id="uq" type="text" placeholder="Номер или текст: 12.8.1, оскорбление, наркотики…" value="${esc(uakState.q)}">
      </label>
      <div class="chips" id="uType">
        <button class="chip${uakState.type===''?' is-on':''}" data-v="">Все</button>
        <button class="chip${uakState.type==='У'?' is-on':''}" data-v="У">Уголовные</button>
        <button class="chip${uakState.type==='А'?' is-on':''}" data-v="А">Административные</button>
      </div>
      <div class="chips" id="uJur">
        <button class="chip${uakState.jur===''?' is-on':''}" data-v="">Любая</button>
        <button class="chip${uakState.jur==='ФЕДЕРАЛЬНЫЙ'?' is-on':''}" data-v="ФЕДЕРАЛЬНЫЙ">Федеральные</button>
        <button class="chip${uakState.jur==='РЕГИОНАЛЬНЫЙ'?' is-on':''}" data-v="РЕГИОНАЛЬНЫЙ">Региональные</button>
      </div>
      <select class="chip" id="uCh" style="max-width:230px">
        <option value="">Все главы</option>
        ${chapters.map(c=>`<option value="${esc(c)}"${uakState.chapter===c?' selected':''}>${esc(c.replace(/​/g,''))}</option>`).join('')}
      </select>
    </div>
    <div class="arts" id="uList"></div>
  </section>`;
}

function renderUak(){
  const list = $('#uList'); if(!list) return;
  const q = uakState.q.trim().toLowerCase();
  const rows = DATA.articles.filter(a=>{
    if (uakState.type && a.type !== uakState.type) return false;
    if (uakState.jur && !a.jurisdiction.some(j=>j.toUpperCase().startsWith(uakState.jur.slice(0,3)))) return false;
    if (uakState.chapter && a.chapter !== uakState.chapter) return false;
    if (!q) return true;
    return a.num.toLowerCase().startsWith(q) || (a.title+' '+a.sanction).toLowerCase().includes(q);
  });

  if(!rows.length){
    list.innerHTML = `<div class="empty"><b>Ничего не найдено</b>Попробуйте другой номер или ключевое слово.</div>`;
    return;
  }
  list.innerHTML = rows.map(a=>{
    const facts = [];
    if (a.jail_years.length)  facts.push([a.jail_years.length>1?`${a.jail_years[0]}–${a.jail_years[1]} лет`:`${a.jail_years[0]} г.`,'лишение свободы']);
    if (a.arrest_days.length) facts.push([a.arrest_days.length>1?`${a.arrest_days[0]}–${a.arrest_days[1]} сут.`:`${a.arrest_days[0]} сут.`,'адм. арест']);
    /* в санкции может быть несколько сумм (штраф, ущерб, залог) — показываем диапазон, а не максимум */
    const sums = [...new Set(a.money.filter(v=>v!==a.bail))].sort((x,y)=>x-y);
    if (sums.length===1)      facts.push([money(sums[0]),'сумма в санкции']);
    else if (sums.length>1)   facts.push([money(sums[0])+'–'+money(sums[sums.length-1]),'суммы в санкции']);
    if (a.bail)               facts.push([money(a.bail),'залог']);
    const ic = [];
    if (a.jail_years.length)  ic.push(`${Math.max(...a.jail_years)*30} мин`);
    if (a.arrest_days.length) ic.push(`${Math.max(...a.arrest_days)} мин`);
    return `
    <article class="art" data-num="${esc(a.num)}">
      <div class="art__top">
        <span class="art__num">${esc(a.num)}</span>
        <div class="art__body">
          <div class="art__title">${hl(a.title, q)}</div>
          <div class="art__meta">
            <span class="tag ${a.type==='У'?'tag--u':'tag--a'}">${a.type==='У'?'Уголовная':'Административная'}</span>
            ${jurTag(a.jurisdiction)}${banTag(a.ban)}
            ${ic.length?`<span class="tag">${ic[0]} IC</span>`:''}
          </div>
        </div>
        <button class="art__fav${window.Favorites?.has('uak:'+a.num)?' is-on':''}" data-fav="uak:${esc(a.num)}" title="В избранное" type="button">★</button>
        <span class="art__chev">${chev}</span>
      </div>
      <div class="art__drop"><div><div class="art__inner">
        <div class="art__sanc"><b>Санкция</b>${hl(a.sanction, q)}</div>
        ${facts.length?`<div class="art__facts">${facts.map(([v,l])=>`<div class="fact"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`:''}
        ${(a.notes||[]).map(n=>`<div class="art__note">${esc(n)}</div>`).join('')}
        <div class="art__src">${esc(a.section)} · ${esc(a.chapter)} · <a href="#/doc/uak" style="color:var(--acc)">открыть кодекс</a></div>
      </div></div></div>
    </article>`;
  }).join('');
}

/* ============================================================
   ДОРОЖНЫЙ КОДЕКС
   ============================================================ */
const dkState = { q:'' };
async function viewDk(){
  await loadTraffic();
  return `
  <section class="sec view">
    <div class="sec__head"><div><h2 class="h2">Дорожный кодекс</h2>
      <p>${DATA.traffic.length} статей. Наказания по ДК — административные (Вводные положения, п. B).</p></div></div>
    <div class="notice">
      ${ico('flag',18)}
      <div>При нарушении <b>3 и более</b> статей ДК, а также при их неуплате сотрудник вправе изъять лицензию на вождение (гл. I, примечание).</div>
    </div>
    <div class="tools">
      <label class="field">${ico('search',16)}
        <input id="dq" type="text" placeholder="Статья или текст: скорость, обгон, маячок…" value="${esc(dkState.q)}"></label>
    </div>
    <div class="arts" id="dList"></div>
  </section>`;
}
function renderDk(){
  const list = $('#dList'); if(!list) return;
  const q = dkState.q.trim().toLowerCase();
  const rows = DATA.traffic.filter(a=> !q || a.num.startsWith(q) || (a.title+' '+a.sanction).toLowerCase().includes(q));
  if(!rows.length){ list.innerHTML = `<div class="empty"><b>Ничего не найдено</b></div>`; return; }
  list.innerHTML = rows.map(a=>`
    <article class="art" data-num="${esc(a.num)}">
      <div class="art__top">
        <span class="art__num">ст. ${esc(a.num)}</span>
        <div class="art__body">
          <div class="art__title">${hl(a.title,q)}</div>
          <div class="art__meta">
            ${a.money.length
              ? `<span class="tag tag--acc">${a.money.length>1
                  ? money(Math.min(...a.money))+'–'+money(Math.max(...a.money))
                  : 'до '+money(a.money[0])}</span>`
              : '<span class="tag">без штрафа</span>'}
            <span class="tag">${esc((a.chapter||'').replace(/^Глава\s*/,'гл. '))}</span>
          </div>
        </div>
        <button class="art__fav${window.Favorites?.has('dk:'+a.num)?' is-on':''}" data-fav="dk:${esc(a.num)}" title="В избранное" type="button">★</button>
        <span class="art__chev">${chev}</span>
      </div>
      <div class="art__drop"><div><div class="art__inner">
        ${a.sanction?`<div class="art__sanc"><b>Наказание</b>${hl(a.sanction,q)}</div>`
                    :`<div class="art__note">Статья носит разрешительный характер — наказание не предусмотрено.</div>`}
        ${a.notes.map(n=>`<div class="art__note">${esc(n)}</div>`).join('')}
      </div></div></div>
    </article>`).join('');
}

/* ============================================================
   ШПАРГАЛКИ
   ============================================================ */
async function viewCards(){
  const q = await loadQuick();
  const card = c => {
    let body = '';
    if (c.quote) body += `<div class="qc__quote">«${esc(c.quote)}»</div>`;
    if (c.steps) body += `<ol>${c.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`;
    if (c.table) body += `<table class="qtable ${c.table.some(r=>r[1].length>34)?'qtable--wide':''}">
        ${c.table.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
    if (c.groups) body += c.groups.map(g=>`<div class="qc__grp"><b>${esc(g.name)}</b>
        <ul>${g.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
    if (c.notes) body += `<div class="qc__note">${c.notes.map(n=>`<p>${esc(n)}</p>`).join('')}</div>`;
    return `<article class="qc rv${c.critical?' qc--hot':''}">
      <div class="qc__h"><span class="card__ico">${ico(c.icon,18)}</span>
        <span><b>${esc(c.title)}</b><i>${esc(c.src)}</i></span></div>
      <div class="qc__c">${body}</div>
    </article>`;
  };
  return `
  <section class="sec view">
    <div class="sec__head"><div><h2 class="h2">Шпаргалки гос. сотрудника</h2>
      <p>Выжимка из Процессуального кодекса, УАК и правил — то, что нужно под рукой прямо во время задержания.
         Каждая карточка ссылается на первоисточник.</p></div></div>
    <div class="qcards">${q.cards.map(card).join('')}</div>
  </section>`;
}

/* ============================================================
   ПАМЯТКИ (адвокат / фракции / конфликты / прецеденты)
   ============================================================ */
const guideBlock = b => {
  const H = t => t ? `<b class="gb__h">${esc(t)}</b>` : '';
  switch (b.type){
    case 'warn':
      return `<div class="gb gb--warn">${H(b.title)}<p>${esc(b.text)}</p></div>`;
    case 'note':
      return `<div class="gb gb--note"><p>${esc(b.text)}</p></div>`;
    case 'list':
      return `<div class="gb gb--${b.tone||'plain'}">${H(b.title)}
        <ul class="gb__ul">${b.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`;
    case 'table':
      return `<div class="gb">${H(b.title)}<table class="qtable qtable--wide">
        ${b.rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>`;
    case 'cards':
      return `<div class="gb">${H(b.title)}<div class="fgrid">
        ${b.items.map(i=>`<div class="fcard"><div class="fcard__h"><b>${esc(i.name)}</b>
          <span class="tag tag--acc">${esc(i.tag)}</span></div><p>${esc(i.text)}</p></div>`).join('')}
      </div></div>`;
    case 'conflicts':
      return `<div class="gb">${b.items.map(c=>`
        <div class="cf">
          <b class="cf__t">${esc(c.topic)}</b>
          <div class="cf__row cf__row--law"><span>Закон</span><p>${esc(c.law)}</p></div>
          <div class="cf__row cf__row--rule"><span>Правила</span><p>${esc(c.rule)}</p></div>
          <div class="cf__row cf__row--out"><span>Итог</span><p>${esc(c.verdict)}</p></div>
          ${c.penalty?`<div class="cf__pen">${esc(c.penalty)}</div>`:''}
        </div>`).join('')}</div>`;
    case 'prec':
      return `<div class="gb">${b.items.map(p=>`
        <div class="pc">
          <span class="pc__n">${esc(p.num)}</span>
          <div><b>${esc(p.topic)}</b><p>${esc(p.text)}</p></div>
        </div>`).join('')}</div>`;
    default: return '';
  }
};

async function viewGuides(params){
  const g = await loadGuides();
  const id = params.get('g') || g.guides[0].id;
  const cur = g.guides.find(x=>x.id===id) || g.guides[0];
  return `
  <section class="sec view">
    <div class="sec__head"><div><h2 class="h2">Памятки гос. сотрудника</h2>
      <p>Разборы под конкретные ситуации: как отвечать адвокату, чем отличаются структуры
         и где правила проекта перекрывают закон.</p></div></div>
    <div class="tools"><div class="chips">
      ${g.guides.map(x=>`<a class="chip${x.id===cur.id?' is-on':''}" href="#/guides?g=${x.id}">${esc(x.title)}</a>`).join('')}
    </div></div>
    <article class="guide rv">
      <div class="guide__head">
        <span class="card__ico">${ico(cur.icon,20)}</span>
        <div><h3 class="h2" style="font-size:23px">${esc(cur.title)}</h3>
        <p class="lead" style="font-size:14.5px;margin-top:7px">${esc(cur.lead)}</p></div>
      </div>
      ${cur.blocks.map(guideBlock).join('')}
    </article>
  </section>`;
}

/* ============================================================
   ЗАЯВЛЕНИЯ (генератор форм в суд / прокуратуру)
   ============================================================ */
const formState = { formId:null, values:{} };

function renderFormTemplate(form, values){
  let t = form.template;
  const predstField = form.fields.find(f=>f.key==='predstavitelstvo');
  const showPredst = (values.predstavitelstvo ?? predstField?.default) === 'да';
  t = t.replace(/\{\{#predstavitelBlock\}\}([\s\S]*?)\{\{\/predstavitelBlock\}\}/g, showPredst ? '$1' : '');
  t = t.replace(/\{\{(\w+)\}\}/g, (m,k)=>{
    const f = form.fields.find(x=>x.key===k);
    const v = values[k] ?? f?.default;
    if (v && String(v).trim()) return v;
    if (f && f.optional) return '';
    return f ? '['+f.label+']' : '';
  });
  return t.replace(/\n{3,}/g,'\n\n');
}

async function viewForms(params){
  const data = await loadForms();
  const fid = params.get('f') || data.forms[0].id;
  const form = data.forms.find(f=>f.id===fid) || data.forms[0];
  if (formState.formId !== form.id){ formState.formId = form.id; formState.values = {}; }

  const fieldHtml = f => {
    const val = esc(formState.values[f.key] ?? f.default ?? '');
    if (f.type === 'select'){
      return `<label class="fg"><span>${esc(f.label)}</span>
        <select class="field-i" data-k="${f.key}">
          ${f.options.map(o=>`<option value="${esc(o)}"${ (formState.values[f.key]||f.default)===o?' selected':''}>${esc(o)}</option>`).join('')}
        </select></label>`;
    }
    if (f.type === 'textarea'){
      return `<label class="fg"><span>${esc(f.label)}${f.optional?' <i>(необязательно)</i>':''}</span>
        <textarea class="field-i" rows="3" data-k="${f.key}" placeholder="${esc(f.placeholder||'')}">${val}</textarea></label>`;
    }
    return `<label class="fg"><span>${esc(f.label)}${f.optional?' <i>(необязательно)</i>':''}</span>
      <input class="field-i" type="text" data-k="${f.key}" placeholder="${esc(f.placeholder||'')}" value="${val}"></label>`;
  };

  const ownerGroup = data.groups.find(g=>g.forms.includes(form.id));

  const groupNav = data.groups.map(g=>`
    <div class="fg-group">
      <b>${esc(g.name)}</b>
      <div class="chips">
        ${g.forms.map(id=>{
          const ff = data.forms.find(x=>x.id===id);
          return `<a class="chip${id===form.id?' is-on':''}" href="#/forms?f=${id}">${esc(ff.title)}</a>`;
        }).join('')}
      </div>
    </div>`).join('');

  return `
  <section class="sec view">
    <div class="sec__head"><div><h2 class="h2">Заявления</h2>
      <p>Официальные формы подачи исков, жалоб, ходатайств и обращений — заполните поля слева,
         готовый текст соберётся справа. Формат и структура — с портала судебной системы.</p></div></div>

    <div class="fg-char">
      <label class="fg" style="flex:1;margin:0"><span>Персонаж — подставит паспорт, телефон и почту в поля заявителя</span>
        <select class="field-i" id="fgChar">
          <option value="">— не выбран —</option>
          ${window.Characters.all().map(c=>`<option value="${c.id}" ${c.id===window.Characters.activeId()?' selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </label>
      <button class="btn btn--ghost" id="fgCharManage" type="button" style="padding:10px 14px;font-size:13px">Персонажи</button>
    </div>

    <div class="formgen">
      <aside class="formgen__nav">${groupNav}</aside>
      <div class="formgen__body">
        <div class="fg-title">
          <div class="fg-title__row">
            <h3 class="h3">${esc(form.title)}</h3>
            ${ownerGroup?.submitUrl?`<a class="btn btn--main" style="padding:9px 15px;font-size:13px" href="${esc(ownerGroup.submitUrl)}" target="_blank" rel="noopener">Подать на форуме ${arrow}</a>`:''}
          </div>
          ${form.note?`<p class="fg-note">${esc(form.note)}</p>`:''}
        </div>

        <div class="fg-ai">
          <label class="fg"><span>Опишите ситуацию своими словами — ИИ определит нужную статью и составит текст</span>
            <textarea class="field-i" id="fgAiInput" rows="4" placeholder="Что произошло, когда и где, кто участвовал — пишите как есть, без ссылок на статьи"></textarea>
          </label>
          <div class="fg-ai__row">
            <button class="btn btn--main" id="fgAiGo" style="padding:9px 16px;font-size:13px">Составить через ИИ</button>
            <span class="fg-ai__hint" id="fgAiHint">Проверит формулировку и вставит готовый текст в поля ниже — их можно будет поправить вручную.</span>
          </div>
          <div class="fg-ai__analysis" id="fgAiAnalysis" hidden></div>
        </div>

        <div class="fg-fields" id="fgFields">${form.fields.map(fieldHtml).join('')}</div>
      </div>
      <div class="formgen__preview">
        <div class="fg-pv-head">
          <b>Готовый текст</b>
          <div style="display:flex;gap:8px">
            <button class="btn btn--ghost" id="fgCopy" style="padding:7px 13px;font-size:12.5px">Скопировать</button>
            <button class="btn btn--ghost" id="fgDownload" style="padding:7px 13px;font-size:12.5px">Скачать .txt</button>
          </div>
        </div>
        <pre class="fg-pv" id="fgPreview">${esc(renderFormTemplate(form, formState.values))}</pre>
      </div>
    </div>
  </section>`;
}

function bindForms(data, form){
  const preview = $('#fgPreview');
  const rerender = () => { preview.textContent = renderFormTemplate(form, formState.values); };
  $$('.field-i').forEach(el=>{
    el.addEventListener('input', ()=>{
      formState.values[el.dataset.k] = el.value;
      rerender();
    });
  });

  const applyCharacter = (charId) => {
    window.Characters.setActive(charId);
    const c = window.Characters.all().find(x=>x.id===charId);
    if (!c) return;
    for (const f of form.fields){
      const prop = window.CHAR_FIELD_MAP[f.key];
      if (!prop || !c[prop]) continue;
      formState.values[f.key] = c[prop];
      const el = document.querySelector(`.field-i[data-k="${f.key}"]`);
      if (el) el.value = c[prop];
    }
    rerender();
  };
  $('#fgChar')?.addEventListener('change', e=>{ if (e.target.value) applyCharacter(e.target.value); else window.Characters.setActive(''); });
  $('#fgCharManage')?.addEventListener('click', ()=>window.openCharacterModal());
  document.addEventListener('characters:changed', ()=>{
    const sel = $('#fgChar'); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">— не выбран —</option>` +
      window.Characters.all().map(c=>`<option value="${c.id}"${c.id===cur?' selected':''}>${esc(c.name)}</option>`).join('');
  });
  if (window.Characters.activeId()) applyCharacter(window.Characters.activeId());

  $('#fgDownload')?.addEventListener('click', ()=>{
    const blob = new Blob([preview.textContent], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (form.title||'zayavlenie').replace(/[^\wа-яё -]+/gi,'').trim().slice(0,60) + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  });

  const aiGo = $('#fgAiGo'), aiInput = $('#fgAiInput'), aiHint = $('#fgAiHint'), aiAnalysis = $('#fgAiAnalysis');
  aiGo?.addEventListener('click', async ()=>{
    const desc = aiInput.value.trim();
    if (!desc){ toast('Опишите ситуацию — поле пустое'); return; }
    aiGo.disabled = true; aiGo.textContent = 'Составляю…';
    aiHint.textContent = 'Ищу подходящую статью и формулирую текст — обычно 10–20 секунд.';
    try{
      const r = await window.AI.draftPetition(desc, form.title);
      if (r.analysis){
        aiAnalysis.hidden = false;
        aiAnalysis.innerHTML = `<b>Анализ ИИ</b><p>${esc(r.analysis)}</p>`;
      }
      if (r.description && form.aiFields?.description){
        const key = form.aiFields.description;
        formState.values[key] = r.description;
        const el = document.querySelector(`.field-i[data-k="${key}"]`);
        if (el) el.value = r.description;
      }
      if (r.request && form.aiFields?.request){
        const key = form.aiFields.request;
        formState.values[key] = r.request;
        const el = document.querySelector(`.field-i[data-k="${key}"]`);
        if (el) el.value = r.request;
      }
      rerender();
      aiHint.textContent = 'Готово — проверьте текст в полях ниже и подправьте, если нужно.';
    }catch(err){
      aiHint.textContent = 'Ошибка: ' + err.message;
    }finally{
      aiGo.disabled = false; aiGo.textContent = 'Составить через ИИ';
    }
  });
  $('#fgCopy').addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(preview.textContent); toast('Скопировано'); }
    catch{ toast('Не удалось скопировать — выделите текст вручную'); }
  });
}

/* ============================================================
   ПРАВОВАЯ ОЦЕНКА (кто прав, кто виноват, какие статьи)
   ============================================================ */
function viewAssess(){
  return `
  <section class="sec view">
    <div class="sec__head"><div><h2 class="h2">Правовая оценка</h2>
      <p>Опишите ситуацию с участием нескольких сторон — ИИ разберёт, кто прав, кто виноват,
         по каким статьям и что каждая сторона может возразить. Не заменяет решение прокурора или суда.</p></div></div>

    <div class="asg">
      <label class="fg"><span>Опишите ситуацию — что произошло, кто участвовал, в какой роли</span>
        <textarea class="field-i" id="asgInput" rows="6" placeholder="Например: гражданин отказался показать документы сотруднику LSPD, сотрудник применил тазер без предупреждения…"></textarea>
      </label>
      <div class="fg-ai__row">
        <button class="btn btn--main" id="asgGo" style="padding:9px 18px;font-size:13px">Дать правовую оценку</button>
        <span class="fg-ai__hint" id="asgHint">Разбор обычно занимает 10–25 секунд.</span>
      </div>
    </div>

    <div class="asg-result" id="asgResult" hidden>
      <div class="asg-card asg-card--verdict"><b>Вердикт</b><p id="asgVerdict"></p></div>
      <div class="asg-card"><b>Разбор по сторонам</b><p id="asgSides"></p></div>
      <div class="asg-card asg-card--release" id="asgReleaseCard"><b>Основания для освобождения</b><p id="asgRelease"></p></div>
      <div class="asg-card"><b>Что грозит</b><p id="asgPenalty"></p></div>
      <div class="asg-card"><b>Возможные возражения</b><p id="asgDefense"></p></div>
    </div>
  </section>`;
}

function bindAssess(){
  const go = $('#asgGo'), input = $('#asgInput'), hint = $('#asgHint'), result = $('#asgResult');
  go.addEventListener('click', async ()=>{
    const desc = input.value.trim();
    if (!desc){ toast('Опишите ситуацию — поле пустое'); return; }
    go.disabled = true; go.textContent = 'Разбираю…';
    hint.textContent = 'Ищу применимые статьи и сверяю позиции сторон…';
    try{
      const r = await window.AI.assessSituation(desc);
      $('#asgVerdict').innerHTML = md(r.verdict || '—');
      $('#asgSides').innerHTML = md(r.sides || '—');
      const releaseTxt = r.release || '—';
      $('#asgRelease').innerHTML = md(releaseTxt);
      const noViolation = /не\s+усматрива/i.test(releaseTxt);
      $('#asgReleaseCard').classList.toggle('asg-card--flag', !noViolation && releaseTxt !== '—');
      $('#asgPenalty').innerHTML = md(r.penalty || '—');
      $('#asgDefense').innerHTML = md(r.defense || '—');
      result.hidden = false;
      hint.textContent = 'Готово. Это разбор ИИ, а не официальное решение — проверяйте важные детали сами.';
    }catch(err){
      hint.textContent = 'Ошибка: ' + err.message;
    }finally{
      go.disabled = false; go.textContent = 'Дать правовую оценку';
    }
  });
}

/* ============================================================
   ДОКУМЕНТЫ
   ============================================================ */
async function viewDocs(params){
  const idx = await loadIndex();
  const cat = params.get('cat') || '';
  const cats = [...new Map(idx.map(d=>[d.cat,d.catName])).entries()];
  const list = cat ? idx.filter(d=>d.cat===cat) : idx;
  const max  = Math.max(...idx.map(d=>d.chars));
  return `
  <section class="sec view">
    <div class="sec__head"><div><h2 class="h2">Документы</h2>
      <p>${idx.length} документов с официального форума: кодексы, законы и правила. Полный текст с оглавлением.</p></div></div>
    <div class="tools">
      <div class="chips">
        <a class="chip${!cat?' is-on':''}" href="#/docs">Все (${idx.length})</a>
        ${cats.map(([k,n])=>`<a class="chip${cat===k?' is-on':''}" href="#/docs?cat=${k}">${esc(n)} (${idx.filter(d=>d.cat===k).length})</a>`).join('')}
      </div>
    </div>
    <div class="docgrid">
      ${list.map(d=>`
        <a class="doc rv" href="#/doc/${d.id}">
          <b>${esc(d.title)}</b>
          <span>${esc(d.catName)} · ${d.chars?Math.round(d.chars/1000)+' тыс. символов':'только изображения'}</span>
          <span class="doc__bar"><i style="width:${Math.max(4,Math.round(d.chars/max*100))}%"></i></span>
        </a>`).join('')}
    </div>
  </section>`;
}

async function viewDoc(id){
  const [idx, doc] = await Promise.all([loadIndex(), loadDoc(id)]);
  const meta = idx.find(d=>d.id===id) || {};
  if (!doc.sections.length){
    return `<section class="sec view"><div class="crumb"><a href="#/docs">Документы</a> / ${esc(doc.title)}</div>
      <h2 class="h2">${esc(doc.fullTitle||doc.title)}</h2>
      <div class="empty" style="margin-top:24px"><b>Документ состоит из изображений</b>
      Текстовой версии нет — откройте оригинал на форуме.<br><br>
      <a class="btn btn--main" href="${esc(doc.url)}" target="_blank" rel="noopener">Открыть на форуме ${arrow}</a></div></section>`;
  }
  const heads = doc.sections.map((s,i)=>({...s,i})).filter(s=>s.heading);
  const para = p => {
    const isNote = /^(Примечание|Исключение|Пример\b|Пояснение)/.test(p);
    const isPen  = /\|\s*(Деморган|Блокировка|Warn|Мут|Kick|Приравнивается|Предупреждение|от -?\d+ баллов|-\d+ баллов)/i.test(p);
    return `<p class="${isNote?'is-note':''}${isPen?' is-pen':''}">${esc(p)}</p>`;
  };
  return `
  <section class="sec view">
    <div class="crumb"><a href="#/docs">Документы</a> / <a href="#/docs?cat=${meta.cat}">${esc(meta.catName||'')}</a> / ${esc(doc.title)}</div>
    <div class="sec__head" style="margin-bottom:18px">
      <div><h2 class="h2">${esc(doc.fullTitle||doc.title)}</h2>
      <p>${esc(meta.catName||'')} · ${Math.round((meta.chars||0)/1000)} тыс. символов</p></div>
      <a class="btn btn--ghost" href="${esc(doc.url)}" target="_blank" rel="noopener">Оригинал на форуме ${arrow}</a>
    </div>
    <div class="reader">
      <aside class="toc" id="toc"><b>Оглавление</b>
        ${heads.map(s=>`<a href="#s${s.i}" data-s="${s.i}">${esc(s.heading)}</a>`).join('')}</aside>
      <div class="rdoc" id="rdoc">
        ${doc.sections.map((s,i)=>{
          const inner = (s.heading?`<h${s.level===1?2:3} id="s${i}">${esc(s.heading)}</h${s.level===1?2:3}>`:'')
                      + s.paras.map(para).join('');
          return s.amendment ? `<div class="amend">${inner}</div>` : inner;
        }).join('')}
      </div>
    </div>
  </section>`;
}

/* ============================================================
   РОУТЕР
   ============================================================ */
const ROUTES = [
  [/^\/?$/,                 'home',  viewHome],
  [/^\/uak$/,               'uak',   viewUak],
  [/^\/dk$/,                'dk',    viewDk],
  [/^\/cards$/,             'cards', viewCards],
  [/^\/guides$/,            'guides',viewGuides],
  [/^\/forms$/,             'forms', viewForms],
  [/^\/assess$/,            'assess',viewAssess],
  [/^\/docs$/,              'docs',  viewDocs],
  [/^\/doc\/([\w-]+)$/,     'docs',  (p,m)=>viewDoc(m[1])],
  [/^\/ai$/,                'ai',    ()=>window.AI.view()],
];

async function router(){
  const raw  = location.hash.replace(/^#/,'') || '/';
  const [path, qs] = raw.split('?');
  const params = new URLSearchParams(qs||'');
  const app = $('#app');

  const hit = ROUTES.find(([re])=>re.test(path));
  const [re, navKey, fn] = hit || ROUTES[0];
  const m = path.match(re) || [];

  $$('#nav a').forEach(a=>a.classList.toggle('is-on', a.dataset.view===navKey));
  $('#nav').classList.remove('is-open');
  $('#burger').classList.remove('is-on');

  app.innerHTML = `<div class="sec"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
  try{
    app.innerHTML = await fn(params, m);
  }catch(err){
    app.innerHTML = `<div class="sec view"><div class="empty"><b>Не удалось загрузить</b>${esc(err.message)}</div></div>`;
    return;
  }
  window.scrollTo({top:0,behavior:'instant'});
  reveal(app); tilt(app);
  bindView(path);
}

function bindView(path){
  /* аккордеон статей */
  $$('.art__top').forEach(t=>t.addEventListener('click',()=>t.closest('.art').classList.toggle('is-open')));

  if (path === '/uak'){
    renderUak();
    const inp = $('#uq');
    let t; inp.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>{ uakState.q=inp.value; renderUak(); rebindArts(); },140); });
    $('#uType').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b)return;
      uakState.type=b.dataset.v; $$('#uType .chip').forEach(c=>c.classList.toggle('is-on',c===b)); renderUak(); rebindArts(); });
    $('#uJur').addEventListener('click',e=>{ const b=e.target.closest('.chip'); if(!b)return;
      uakState.jur=b.dataset.v; $$('#uJur .chip').forEach(c=>c.classList.toggle('is-on',c===b)); renderUak(); rebindArts(); });
    $('#uCh').addEventListener('change',e=>{ uakState.chapter=e.target.value; renderUak(); rebindArts(); });
    rebindArts();
    if (window.__openArt){ const n=window.__openArt; window.__openArt=null;
      const el=$(`.art[data-num="${CSS.escape(n)}"]`);
      if(el){ el.classList.add('is-open'); el.scrollIntoView({block:'center',behavior:'smooth'}); } }
  }
  if (path === '/dk'){
    renderDk(); rebindArts();
    const inp = $('#dq'); let t;
    inp.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>{ dkState.q=inp.value; renderDk(); rebindArts(); },140); });
  }
  if (path.startsWith('/doc/')) bindToc();
  if (path === '/ai') window.AI.bind();
  if (path === '/forms' && DATA.forms){
    const form = DATA.forms.forms.find(f=>f.id===formState.formId) || DATA.forms.forms[0];
    bindForms(DATA.forms, form);
  }
  if (path === '/assess') bindAssess();
}
function rebindArts(){
  $$('.art__top').forEach(t=>{
    if (t.dataset.b) return; t.dataset.b='1';
    t.addEventListener('click',()=>t.closest('.art').classList.toggle('is-open'));
  });
}
function bindToc(){
  const links = $$('#toc a'), heads = links.map(a=>document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if(!heads.length) return;
  links.forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  const io = new IntersectionObserver(es=>{
    es.forEach(e=>{ if(e.isIntersecting){
      links.forEach(l=>l.classList.toggle('is-on', l.getAttribute('href')==='#'+e.target.id));
    }});
  },{rootMargin:'-90px 0px -72% 0px'});
  heads.forEach(h=>io.observe(h));
}

/* ============================================================
   ПОИСК (⌘K)
   ============================================================ */
const CMD = { open:false, sel:0, rows:[] };
async function cmdSearch(q){
  const [arts, idx, dk, quick] = await Promise.all([loadArticles(), loadIndex(), loadTraffic(), loadQuick()]);
  const s = q.trim().toLowerCase();
  if (!s) return [
    ...quick.cards.slice(0,6).map(c=>({k:'карточка',t:c.title,c:'Шпаргалка',href:'#/cards'})),
    {k:'',t:'Все статьи УАК',c:'Раздел',href:'#/uak'},
    {k:'',t:'Дорожный кодекс',c:'Раздел',href:'#/dk'},
  ];
  const out = [];
  for (const a of arts){
    let sc = 0;
    if (a.num.toLowerCase() === s) sc = 100;
    else if (a.num.toLowerCase().startsWith(s)) sc = 80;
    else if (a.title.toLowerCase().includes(s)) sc = 40;
    else if (a.sanction.toLowerCase().includes(s)) sc = 18;
    if (sc) out.push({sc,k:a.num,t:a.title,c:a.type==='У'?'УАК · уголовная':'УАК · адм.',href:'#/uak',art:a.num});
  }
  for (const a of dk){
    let sc = 0;
    if (a.num === s) sc = 90; else if (a.title.toLowerCase().includes(s)) sc = 30;
    if (sc) out.push({sc,k:'ДК '+a.num,t:a.title,c:'Дорожный кодекс',href:'#/dk'});
  }
  for (const c of quick.cards){
    const blob = (c.title+' '+(c.steps||[]).join(' ')+' '+(c.quote||'')+' '+(c.notes||[]).join(' ')).toLowerCase();
    if (blob.includes(s)) out.push({sc:c.title.toLowerCase().includes(s)?60:22,k:'',t:c.title,c:'Шпаргалка',href:'#/cards'});
  }
  for (const d of idx){
    if ((d.title+' '+d.fullTitle).toLowerCase().includes(s)) out.push({sc:45,k:'',t:d.fullTitle||d.title,c:d.catName,href:'#/doc/'+d.id});
  }
  const g = await loadGuides();
  for (const gd of g.guides){
    const blob = JSON.stringify(gd).toLowerCase();
    if (blob.includes(s)) out.push({sc:gd.title.toLowerCase().includes(s)?58:26,k:'',t:gd.title,c:'Памятка',href:'#/guides?g='+gd.id});
  }
  return out.sort((a,b)=>b.sc-a.sc).slice(0,24);
}
function cmdRender(rows,q){
  CMD.rows = rows; CMD.sel = 0;
  const b = $('#cmdkBody');
  if (!rows.length){ b.innerHTML = `<div class="cmdk__empty">Ничего не нашлось по «${esc(q)}»</div>`; return; }
  b.innerHTML = rows.map((r,i)=>`
    <div class="cres${i===0?' is-on':''}" data-i="${i}">
      <span class="cres__k">${esc(r.k||'')}</span>
      <span class="cres__t">${hl(r.t,q)}</span>
      <span class="cres__c">${esc(r.c)}</span>
    </div>`).join('');
  $$('.cres',b).forEach(el=>el.addEventListener('click',()=>cmdGo(+el.dataset.i)));
}
function cmdGo(i){
  const r = CMD.rows[i]; if(!r) return;
  if (r.art) window.__openArt = r.art;
  cmdClose();
  if (location.hash === r.href) router(); else location.hash = r.href;
}
function cmdOpen(){
  CMD.open = true; $('#cmdk').hidden = false; document.body.style.overflow='hidden';
  const i = $('#cmdkInput'); i.value=''; i.focus();
  cmdSearch('').then(r=>cmdRender(r,''));
}
function cmdClose(){ CMD.open=false; $('#cmdk').hidden=true; document.body.style.overflow=''; }

/* ============================================================
   СТАРТ
   ============================================================ */
function boot(){
  window.addEventListener('hashchange', router);
  router();

  $('#burger').addEventListener('click',()=>{
    $('#nav').classList.toggle('is-open');
    $('#burger').classList.toggle('is-on');
  });

  /* прогресс-бар прокрутки */
  const bar = $('#scrollbar');
  const onScroll = ()=>{
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (h>0 ? (scrollY/h*100) : 0) + '%';
  };
  addEventListener('scroll', onScroll, {passive:true}); onScroll();

  /* избранное — делегирование, разметка перерисовывается при каждом поиске */
  /* capture:true — должен сработать раньше, чем bubble-обработчик .art__top,
     который разворачивает статью, иначе клик по звезде ещё и раскрывает карточку. */
  document.addEventListener('click', e=>{
    const btn = e.target.closest('.art__fav'); if (!btn) return;
    e.stopPropagation();
    const on = window.Favorites.toggle(btn.dataset.fav);
    btn.classList.toggle('is-on', on);
  }, true);
  document.addEventListener('click', e=>{
    const chip = e.target.closest('[data-fav-open]'); if (!chip) return;
    const [doc, num] = chip.dataset.favOpen.split(':');
    if (doc === 'uak') window.__openArt = num;
  });

  /* профиль */
  updateProfileBadge();
  $('#profileBtn').addEventListener('click', openProfileModal);
  if (!Profile.get()?.faction) setTimeout(openProfileModal, 900);

  /* поиск */
  $('#openSearch').addEventListener('click', cmdOpen);
  $$('#cmdk [data-close]').forEach(el=>el.addEventListener('click', cmdClose));
  const inp = $('#cmdkInput'); let t;
  inp.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(async()=>{
    cmdRender(await cmdSearch(inp.value), inp.value.trim()); },120); });

  addEventListener('keydown',e=>{
    if (!CMD.open && (e.key==='k'||e.key==='K') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); cmdOpen(); return; }
    if (!CMD.open && e.key.toLowerCase()==='k' && !e.metaKey && !e.ctrlKey && !e.altKey
        && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){ e.preventDefault(); cmdOpen(); return; }
    if (!CMD.open) return;
    if (e.key==='Escape'){ cmdClose(); }
    else if (e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      const n = CMD.rows.length; if(!n) return;
      CMD.sel = (CMD.sel + (e.key==='ArrowDown'?1:-1) + n) % n;
      $$('.cres').forEach((el,i)=>{ el.classList.toggle('is-on', i===CMD.sel); if(i===CMD.sel) el.scrollIntoView({block:'nearest'}); });
    }
    else if (e.key==='Enter'){ e.preventDefault(); cmdGo(CMD.sel); }
  });

  loadIndex().then(idx=>{ $('#footMeta').textContent = `${idx.length} документов · обновлено 04.08.2026`; });
}
document.addEventListener('DOMContentLoaded', boot);
