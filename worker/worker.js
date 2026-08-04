/**
 * Murrieta · прокси к OpenRouter для ИИ-помощника
 *
 * Зачем нужен: ключ OpenRouter нельзя класть в статический сайт — его сразу
 * заберут из исходников. Worker хранит ключ в секрете Cloudflare и является
 * единственным, кто его видит. Плюс здесь же ограничение по Origin и rate-limit.
 *
 * Секреты (wrangler secret put):
 *   OPENROUTER_KEY   — ключ sk-or-v1-...
 * Переменные (wrangler.toml [vars]):
 *   MODEL            — id модели на OpenRouter
 *   ALLOWED_ORIGINS  — список источников через запятую
 */

const SYSTEM = `Ты — правовой помощник для сотрудников государственных структур на сервере Murrieta (Сервер №20) проекта GTA 5 RP.

Отвечай ТОЛЬКО на основании фрагментов документов, приведённых в блоке КОНТЕКСТ. Это выдержки с официального форума проекта.

ГЛАВНОЕ ПРАВИЛО ОТВЕТА. Если вопрос звучит как «могу ли я…», «можно ли…», «обязан ли я…» — первой строкой дай прямой вердикт одним словом: «Можно», «Нельзя» или «Можно, но с оговоркой», и только потом объясняй. НИКОГДА не начинай с «Да», если ниже по тексту выяснится, что правила это запрещают: итоговый вердикт определяется по иерархии из пункта 7, а не по первой найденной норме. Сотрудник читает первую строку на задержании — она должна быть верной сама по себе.

Правила ответа:
1. Всегда ссылайся на конкретный источник: номер статьи и кодекс/закон. Например: «ПК гл. II ст. 2 п. «г»» или «УАК 12.8.1». НЕ используй технические маркеры вида [1], [2] — они нужны только для нумерации фрагментов и в ответе бесполезны. Не ссылайся на «Памятку» как на источник права: памятка лишь сводит нормы, поэтому называй тот акт, из которого норма взята.
2. Если в контексте нет ответа — прямо скажи: «В доступных мне документах этого нет» и предложи, где смотреть. НИКОГДА не выдумывай статьи, суммы, сроки и залоги.
3. Точные числа (сроки, штрафы, залоги, тайминги) приводи ровно так, как они указаны в контексте. Не округляй и не пересчитывай.
4. Отвечай по-русски, кратко и по делу — как коллега на дежурстве, а не как учебник. Списки и шаги предпочтительнее длинных абзацев.
5. Помни про перевод IC→OOC: 1 год = 30 минут, 1 сутки = 1 минута.
6. Если вопрос касается порядка действий (задержание, арест, обыск, допрос) — дай пронумерованный порядок и отдельно отметь, что является грубым нарушением.
7. ИЕРАРХИЯ ИСТОЧНИКОВ — применяй её всегда, когда фрагменты расходятся:
   а) Правила проекта и дополнения Murrieta (OOC-слой) СИЛЬНЕЕ кодексов и законов штата (IC-слой). Если кодекс что-то разрешает, а правила запрещают — итоговый ответ «нельзя», и обязательно назови меру наказания (деморган, warn, блокировка).
   б) Дополнения Murrieta имеют приоритет над общими правилами проекта и продолжают их нумерацию (1.17+, 2.6+, 3.17+).
   в) Толкования и прецеденты Верховного Суда обязательны к применению и имеют силу закона — они уточняют кодексы. Если есть прецедент по вопросу, сошлись на его номер.
   Типовой пример: по ПК при первичном обыске изъятие нелегала допускается, но правило 3.6 запрещает изымать до приезда в КПЗ/ФТ — значит НЕЛЬЗЯ.
8. Разделяй в ответе, что грозит по IC (статья УАК, срок, штраф) и что по OOC (деморган, warn, блокировка) — это разные вещи.
9. Не давай советов, как обойти правила или закон — это прямо запрещено правилами проекта (п. 3.30 дополнений Murrieta).`;

const json = (o, status, extra = {}) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*')
    .split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || (origin && allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    _ok: ok,
  };
}

/* Примитивный rate-limit на IP: без внешних зависимостей, живёт в памяти
   изолята. Не абсолютная защита, но отсекает случайный флуд. */
const HITS = new Map();
function rateLimited(ip, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || now > rec.reset) { HITS.set(ip, { n: 1, reset: now + windowMs }); return false; }
  rec.n++;
  if (HITS.size > 5000) HITS.clear();
  return rec.n > limit;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const h = cors(origin, env);
    const { _ok, ...cx } = h;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cx });

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, model: env.MODEL || 'qwen/qwen3.7-flash' }, 200, cx);
    }
    if (url.pathname !== '/chat') return json({ error: 'Not found' }, 404, cx);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cx);
    if (!_ok) return json({ error: 'Origin не разрешён. Добавьте его в ALLOWED_ORIGINS.' }, 403, cx);

    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    if (rateLimited(ip)) return json({ error: 'Слишком много запросов. Подождите минуту.' }, 429, cx);

    if (!env.OPENROUTER_KEY) return json({ error: 'OPENROUTER_KEY не задан в секретах Worker.' }, 500, cx);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Некорректный JSON' }, 400, cx); }

    const question = String(body.question || '').slice(0, 2000).trim();
    const context = String(body.context || '').slice(0, 40000);
    if (!question) return json({ error: 'Пустой вопрос' }, 400, cx);

    const history = Array.isArray(body.history)
      ? body.history.filter(m => m && typeof m.content === 'string'
            && (m.role === 'user' || m.role === 'assistant'))
          .slice(-6)
          .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      : [];

    const messages = [
      { role: 'system', content: SYSTEM },
      ...history,
      { role: 'user', content: `КОНТЕКСТ (выдержки с форума):\n\n${context}\n\n---\n\nВОПРОС: ${question}` },
    ];

    let upstream;
    try {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.SITE_URL || 'https://murrieta-gov.pages.dev',
          'X-Title': 'Murrieta Law Assistant',
        },
        body: JSON.stringify({
          model: env.MODEL || 'google/gemini-2.5-flash-lite',
          // Если провайдер основной модели недоступен или отдаёт 429,
          // OpenRouter сам перейдёт к следующей из списка.
          models: [
            env.MODEL || 'google/gemini-2.5-flash-lite',
            ...String(env.FALLBACK_MODELS || 'deepseek/deepseek-v4-flash-0731,mistralai/mistral-small-3.2-24b-instruct')
              .split(',').map(s => s.trim()).filter(Boolean),
          ],
          messages,
          stream: true,
          temperature: 0.15,
          max_tokens: Number(env.MAX_TOKENS || 900),
          // Модели с «размышлением» (qwen3.x-flash и подобные) иначе тратят весь
          // бюджет токенов на delta.reasoning, и content приходит пустым.
          // Здесь рассуждать не над чем: ответ должен опираться на контекст.
          reasoning: { enabled: false, exclude: true },
        }),
      });
    } catch (e) {
      return json({ error: 'Не удалось связаться с OpenRouter: ' + e.message }, 502, cx);
    }

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => '');
      return json({ error: `OpenRouter ${upstream.status}: ${t.slice(0, 300)}` }, upstream.status, cx);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...cx,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  },
};
