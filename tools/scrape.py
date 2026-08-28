#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Снимает темы форума GTA5RP в raw/*.txt в формате, который ждёт build.py.

Формат файла:
    НАЗВАНИЕ: <полное название темы>      (build.py читает строку с индексом 1)
    URL: <адрес темы>
    ===== ПОСТ 1 =====
    <текст первого поста>
    ===== ПОСТ 2 =====
    ...

Запуск:  python3 scrape.py [id ...]   — без аргументов снимает всё из SOURCES.
"""
import io, os, re, sys, time, json, html, urllib.request, urllib.parse

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# id -> (имя файла как в META build.py, url темы)
SOURCES = json.load(io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         "sources.json"), encoding="utf-8"))


def fetch(url, tries=4):
    """Форум периодически рвёт соединение — повторяем с нарастающей паузой.
    404 не повторяем: тема действительно переехала, ретрай не поможет."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    })
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError:
            raise
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


BB_RE = re.compile(r'<div class="bbWrapper">(.*?)</div>\s*</div>\s*</div>', re.S)
TAG_RE = re.compile(r"<[^>]+>")
TITLE_RE = re.compile(r'<h1[^>]*class="p-title-value"[^>]*>(.*?)</h1>', re.S)


def strip_html(chunk):
    # <script>/<style> выкидываем вместе с содержимым: форум кладёт внутрь
    # постов JSON с локализацией лайтбокса, и он иначе попадает в текст.
    s = re.sub(r"<(script|style|template)\b[^>]*>.*?</\1>", " ", chunk, flags=re.S | re.I)
    # <br> и </p> — переводы строк, остальные теги выкидываем
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</(p|div|li|tr|h\d)>", "\n", s)
    # Эмодзи форум вставляет картинкой с class="smilie--emoji" — её alt несёт
    # смысл (🟩/🟨/🟥 — тяжесть статьи) и должен остаться в тексте. Все прочие
    # картинки (разделители, баннеры, вложения) выкидываем целиком, иначе их
    # имена файлов попадают в текст санкций.
    s = re.sub(r'<img(?=[^>]*smilie--emoji)[^>]*\balt="([^"]*)"[^>]*>', r"\1", s)
    s = re.sub(r"<img[^>]*>", " ", s)
    s = TAG_RE.sub("", s)
    s = html.unescape(s)
    # текст кнопки спойлера XenForo — интерфейс, а не содержание документа
    s = re.sub(r"Нажмите для раскрытия\.{0,3}", "", s)
    s = s.replace("​", "").replace("﻿", "").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return "\n".join(ln.strip() for ln in s.split("\n")).strip()


def posts_of(page):
    """Тела всех постов темы по порядку."""
    out = []
    for m in re.finditer(r'<div class="bbWrapper">', page):
        start = m.end()
        # ищем закрывающий div с учётом вложенности
        depth, i = 1, start
        while depth and i < len(page):
            nxt_open = page.find("<div", i)
            nxt_close = page.find("</div>", i)
            if nxt_close == -1:
                break
            if nxt_open != -1 and nxt_open < nxt_close:
                depth += 1
                i = nxt_open + 4
            else:
                depth -= 1
                i = nxt_close + 6
        body = strip_html(page[start:i - 6])
        if len(body) > 40:            # отсекаем подписи и пустые цитаты
            out.append(body)
    return out


def title_of(page, fallback):
    m = TITLE_RE.search(page)
    if not m:
        return fallback
    t = strip_html(m.group(1))
    return re.sub(r"^(Важно|Закреплено)\s*[-–—]?\s*", "", t).strip()


NEXT_RE = re.compile(r'<link[^>]+rel="next"[^>]+href="([^"]+)"')


def all_posts(url, max_pages=20):
    """Длинные темы форум разбивает на страницы по 20 постов — идём по
    rel="next", иначе теряются последние дополнения (напр. прецеденты)."""
    ps, seen, first = [], set(), None
    while url and url not in seen and len(seen) < max_pages:
        seen.add(url)
        page = fetch(url)
        if first is None:
            first = page
        ps += posts_of(page)
        m = NEXT_RE.search(page)
        url = urllib.parse.urljoin(url, m.group(1)) if m else None
        if url:
            time.sleep(1.0)
    return ps, first


def scrape(doc_id, fname, url):
    ps, page = all_posts(url)
    if not ps:
        raise RuntimeError("постов не найдено (возможно, Cloudflare или другая вёрстка)")
    body = "\n".join("===== ПОСТ %d =====\n%s" % (i + 1, p) for i, p in enumerate(ps))
    text = "# %s\nНАЗВАНИЕ: %s\nURL: %s\n%s\n" % (
        doc_id, title_of(page, fname.replace("_", " ")), url, body)
    path = os.path.join(RAW, fname + ".txt")
    io.open(path, "w", encoding="utf-8").write(text)
    return len(ps), len(text)


def main():
    os.makedirs(RAW, exist_ok=True)
    want = sys.argv[1:]
    items = [(k, v) for k, v in SOURCES.items() if not want or k in want]
    ok = fail = 0
    for doc_id, (fname, url) in items:
        try:
            n, size = scrape(doc_id, fname, url)
            print("%-16s %2d постов %7d симв." % (doc_id, n, size))
            ok += 1
        except Exception as e:
            print("%-16s ОШИБКА: %s" % (doc_id, e))
            fail += 1
        time.sleep(1.2)               # не долбим форум
    print("\nснято: %d, ошибок: %d" % (ok, fail))


if __name__ == "__main__":
    main()
