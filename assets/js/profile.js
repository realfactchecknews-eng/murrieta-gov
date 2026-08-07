/* ============================================================
   Murrieta · Профиль пользователя и персонажи
   Всё живёт в localStorage, никакого бэкенда/авторизации нет.
   Поле «сервер» пока жёстко Murrieta — задел на будущее расширение.
   ============================================================ */
'use strict';

const FACTIONS = [
  { id:'civilian', name:'Гражданский' },
  { id:'lspd',  name:'LSPD' },
  { id:'lssd',  name:'LSSD' },
  { id:'fib',   name:'FIB' },
  { id:'gov',   name:'GOV' },
  { id:'ems',   name:'EMS' },
  { id:'saspa', name:'SASPA' },
  { id:'army',  name:'ARMY / SANG' },
  { id:'usss',  name:'USSS' },
  { id:'usms',  name:'USMS' },
  { id:'advokat', name:'Адвокатура' },
  { id:'prok',  name:'Прокуратура' },
  { id:'sud',   name:'Суд' },
];

/* -------------------------------------------------- профиль ---- */
const Profile = {
  get(){ try{ return JSON.parse(localStorage.getItem('murrieta_profile')||'null'); }catch{ return null; } },
  set(p){ localStorage.setItem('murrieta_profile', JSON.stringify(p)); },
  factionName(id){ return FACTIONS.find(f=>f.id===id)?.name || id || ''; },
  /* Строка для передачи в Worker — используется и в чате, и в заявлениях/оценке. */
  contextLine(){
    const p = Profile.get();
    if (!p || !p.faction) return '';
    let s = `ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ: фракция/роль — ${Profile.factionName(p.faction)}`;
    if (p.rank) s += `, звание/должность — ${p.rank}`;
    s += ', сервер — Murrieta (Сервер №20).';
    return s;
  },
};
window.Profile = Profile;

/* -------------------------------------------------- персонажи -- */
const Characters = {
  all(){ try{ return JSON.parse(localStorage.getItem('murrieta_characters')||'[]'); }catch{ return []; } },
  save(list){ localStorage.setItem('murrieta_characters', JSON.stringify(list)); },
  add(c){ const list=Characters.all(); c.id = 'c'+Date.now()+Math.random().toString(36).slice(2,6); list.push(c); Characters.save(list); return c; },
  update(id, patch){ const list=Characters.all(); const i=list.findIndex(x=>x.id===id); if(i>-1){ list[i]={...list[i],...patch}; Characters.save(list); } },
  remove(id){ Characters.save(Characters.all().filter(x=>x.id!==id)); if (Characters.activeId()===id) Characters.setActive(''); },
  activeId(){ return localStorage.getItem('murrieta_active_char') || ''; },
  setActive(id){ localStorage.setItem('murrieta_active_char', id||''); },
  active(){ return Characters.all().find(c=>c.id===Characters.activeId()) || null; },
};
window.Characters = Characters;

/* Автоподстановка в заявления: ключи полей форм, которые относятся к самому
   заявителю (истец / подпись), сопоставлены с полями персонажа.
   Поля «ответчик»/«проверка» — это ВТОРАЯ сторона, их не трогаем. */
const CHAR_FIELD_MAP = {
  imya:'imya', istec_imya:'imya', podpis_imya:'imya',
  pasport:'pasport', istec_pasport:'pasport',
  tel:'tel', istec_tel:'tel',
  mail:'mail', istec_mail:'mail',
};
window.CHAR_FIELD_MAP = CHAR_FIELD_MAP;

/* -------------------------------------------------- модалка ----- */
function openModal(title, html){
  const back = document.createElement('div');
  back.className = 'modal';
  back.innerHTML = `<div class="modal__back" data-close></div>
    <div class="modal__box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head"><b>${esc(title)}</b><button class="modal__esc" data-close type="button">✕</button></div>
      <div class="modal__body">${html}</div>
    </div>`;
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const close = ()=>{ back.remove(); document.body.style.overflow=''; };
  back.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click', close));
  return { el: back, close };
}
window.openModal = openModal;

/* -------------------------------------------------- профиль-UI -- */
function updateProfileBadge(){
  const btn = $('#profileBtn'); if (!btn) return;
  const p = Profile.get();
  btn.querySelector('span').textContent = p?.faction ? Profile.factionName(p.faction) : 'Профиль';
  btn.classList.toggle('is-set', !!p?.faction);
}
window.updateProfileBadge = updateProfileBadge;

function openProfileModal(){
  const p = Profile.get() || { faction:'', rank:'' };
  const html = `
    <p class="modal__hint">Фракция/роль помогает ИИ сразу понимать, чей устав и полномочия применимы к вам —
      без уточняющих вопросов в каждом чате. Сервер пока один — <b>Murrieta (№20)</b>.</p>
    <div class="fg-fields">
      <label class="fg"><span>Фракция / роль</span>
        <select class="field-i" id="pfFaction">
          <option value="">— не выбрано —</option>
          ${FACTIONS.map(f=>`<option value="${f.id}" ${f.id===p.faction?'selected':''}>${esc(f.name)}</option>`).join('')}
        </select>
      </label>
      <label class="fg"><span>Звание / должность <i>(необязательно)</i></span>
        <input class="field-i" id="pfRank" type="text" value="${esc(p.rank||'')}" placeholder="например, детектив, сержант">
      </label>
      <label class="fg"><span>Сервер</span>
        <input class="field-i" type="text" value="Murrieta (Сервер №20)" disabled></label>
    </div>
    <div class="fg-ai__row" style="margin-top:12px">
      <button class="btn btn--main" id="pfSave" type="button" style="padding:9px 18px;font-size:13px">Сохранить профиль</button>
    </div>`;
  const m = openModal('Ваш профиль', html);
  m.el.querySelector('#pfSave').addEventListener('click', ()=>{
    const faction = m.el.querySelector('#pfFaction').value;
    const rank = m.el.querySelector('#pfRank').value.trim();
    Profile.set({ faction, rank });
    toast('Профиль сохранён');
    updateProfileBadge();
    m.close();
  });
}
window.openProfileModal = openProfileModal;

/* -------------------------------------------------- персонажи-UI */
function charRowHtml(c){
  return `<div class="char-row" data-id="${c.id}">
    <div class="char-row__main">
      <b>${esc(c.name||'Без имени')}</b>
      <span>${esc(Profile.factionName(c.faction)||'—')}${c.pasport?' · паспорт '+esc(c.pasport):''}</span>
    </div>
    <div class="char-row__act">
      <button class="btn-mini" data-act="edit" type="button">Изменить</button>
      <button class="btn-mini" data-act="del" type="button">Удалить</button>
    </div>
  </div>`;
}

function openCharacterModal(editId){
  const list = Characters.all();

  if (!editId){
    const html = `
      <div class="char-list" id="charList">
        ${list.length ? list.map(charRowHtml).join('') : '<p class="modal__hint">Персонажей пока нет — добавьте первого.</p>'}
      </div>
      <div class="fg-ai__row" style="margin-top:10px">
        <button class="btn btn--main" id="charAdd" type="button" style="padding:9px 18px;font-size:13px">+ Добавить персонажа</button>
      </div>`;
    const m = openModal('Мои персонажи', html);
    m.el.querySelector('#charAdd').addEventListener('click', ()=>{ m.close(); openCharacterModal('__new__'); });
    m.el.querySelectorAll('.char-row').forEach(row=>{
      const id = row.dataset.id;
      row.querySelector('[data-act="edit"]').addEventListener('click', ()=>{ m.close(); openCharacterModal(id); });
      row.querySelector('[data-act="del"]').addEventListener('click', ()=>{
        Characters.remove(id); m.close(); openCharacterModal();
        document.dispatchEvent(new CustomEvent('characters:changed'));
      });
    });
    return;
  }

  const isNew = editId === '__new__';
  const c = isNew ? {} : (list.find(x=>x.id===editId) || {});
  const html = `
    <div class="fg-fields">
      <label class="fg"><span>Имя и фамилия</span>
        <input class="field-i" id="chImya" type="text" value="${esc(c.imya||'')}" placeholder="Имя Фамилия"></label>
      <label class="fg"><span>Номер паспорта (ID-card)</span>
        <input class="field-i" id="chPasport" type="text" value="${esc(c.pasport||'')}" placeholder="000000"></label>
      <label class="fg"><span>Телефон</span>
        <input class="field-i" id="chTel" type="text" value="${esc(c.tel||'')}" placeholder="000-000"></label>
      <label class="fg"><span>Почта</span>
        <input class="field-i" id="chMail" type="text" value="${esc(c.mail||'')}" placeholder="name@mail.san"></label>
      <label class="fg"><span>Фракция / роль персонажа <i>(необязательно)</i></span>
        <select class="field-i" id="chFaction">
          <option value="">— не выбрано —</option>
          ${FACTIONS.map(f=>`<option value="${f.id}" ${f.id===c.faction?'selected':''}>${esc(f.name)}</option>`).join('')}
        </select></label>
    </div>
    <div class="fg-ai__row" style="margin-top:12px">
      <button class="btn btn--main" id="chSave" type="button" style="padding:9px 18px;font-size:13px">Сохранить</button>
      <button class="btn btn--ghost" id="chBack" type="button" style="padding:9px 14px;font-size:13px">← К списку</button>
    </div>`;
  const m = openModal(isNew ? 'Новый персонаж' : 'Изменить персонажа', html);
  m.el.querySelector('#chBack').addEventListener('click', ()=>{ m.close(); openCharacterModal(); });
  m.el.querySelector('#chSave').addEventListener('click', ()=>{
    const data = {
      name: m.el.querySelector('#chImya').value.trim(),
      imya: m.el.querySelector('#chImya').value.trim(),
      pasport: m.el.querySelector('#chPasport').value.trim(),
      tel: m.el.querySelector('#chTel').value.trim(),
      mail: m.el.querySelector('#chMail').value.trim(),
      faction: m.el.querySelector('#chFaction').value,
    };
    if (!data.name){ toast('Укажите имя персонажа'); return; }
    if (isNew) Characters.add(data);
    else Characters.update(c.id, data);
    toast('Персонаж сохранён');
    document.dispatchEvent(new CustomEvent('characters:changed'));
    m.close(); openCharacterModal();
  });
}
window.openCharacterModal = openCharacterModal;

/* -------------------------------------------------- избранное --- */
const Favorites = {
  all(){ try{ return JSON.parse(localStorage.getItem('murrieta_favorites')||'[]'); }catch{ return []; } },
  has(key){ return Favorites.all().includes(key); },
  toggle(key){
    const list = Favorites.all();
    const i = list.indexOf(key);
    if (i>-1) list.splice(i,1); else list.push(key);
    localStorage.setItem('murrieta_favorites', JSON.stringify(list));
    return i===-1;
  },
};
window.Favorites = Favorites;

/* -------------------------------------------------- избранные ответы ИИ */
const FavAnswers = {
  all(){ try{ return JSON.parse(localStorage.getItem('murrieta_fav_answers')||'[]'); }catch{ return []; } },
  save(list){ localStorage.setItem('murrieta_fav_answers', JSON.stringify(list)); },
  add(question, answer){
    const item = { id:'fq'+Date.now()+Math.random().toString(36).slice(2,6), question, answer, ts:Date.now() };
    const list = FavAnswers.all(); list.push(item); FavAnswers.save(list);
    return item;
  },
  remove(id){ FavAnswers.save(FavAnswers.all().filter(x=>x.id!==id)); },
};
window.FavAnswers = FavAnswers;

/* -------------------------------------------------- кастомные памятки -- */
const CustomGuides = {
  all(){ try{ return JSON.parse(localStorage.getItem('murrieta_custom_guides')||'[]'); }catch{ return []; } },
  save(list){ localStorage.setItem('murrieta_custom_guides', JSON.stringify(list)); },
  add(title, items){
    const g = { id:'g'+Date.now()+Math.random().toString(36).slice(2,6), title, items, ts:Date.now() };
    const list = CustomGuides.all(); list.push(g); CustomGuides.save(list);
    return g;
  },
  remove(id){ CustomGuides.save(CustomGuides.all().filter(x=>x.id!==id)); },
  get(id){ return CustomGuides.all().find(x=>x.id===id); },
};
window.CustomGuides = CustomGuides;

