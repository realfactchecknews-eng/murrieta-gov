#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Разбирает тему «Судебные прецеденты и толкования» в data/precedents.json.

Тема устроена так:
  1) блоки-указатели «ПРЕЦЕДЕНТЫ СУДА» и «ТОЛКОВАНИЯ ВЕРХОВНОГО СУДА»
     со строками вида «— №337 · Hydra Night v. Chris Notorius (2026) — тема»;
  2) блок «НАВИГАЦИЯ ПО НПА» — какая статья каким актом разъяснена;
  3) тела самих актов: «Решение … от ДД.ММ.ГГГГ / по … №NNN / <текст>».

Утратившие силу помечаются active=false — ИИ не должен на них ссылаться.
"""
import io, os, re, json, html, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "СУД_Прецеденты_и_толкования.txt")
OUT = os.path.join(HERE, "..", "data", "precedents.json")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

NUM = r"[№N]o?\s*(\d{2,4})"
IDX_RE = re.compile(r"^—\s*" + NUM + r"\s*·\s*(.+)$", re.M)
HEAD_RE = re.compile(
    r"^(Решение|Определение|Постановление)\s+(Верховного|Федерального)\s+Суда[^\n]*?"
    r"от\s+(\d{2}\.\d{2}\.\d{4})\s*\n+\s*по\s+([^\n]*?)" + NUM, re.M)
NAV_RE = re.compile(r"^•\s*(.+?)\s*→\s*(.+)$", re.M)


def fetch_links(url):
    """Ссылки на форуме лежат в блоках-указателях: №NNN -> post-URL."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    except Exception:
        return {}
    out = {}
    for href, txt in re.findall(r'<a href="([^"]+)"[^>]*>(.{0,120}?)</a>', page, re.S):
        t = html.unescape(re.sub(r"<[^>]+>", "", txt)).strip()
        m = re.match(r"^(Прецедент|Толкование)\s*" + NUM + r"$", t)
        if m:
            out[m.group(2)] = href
    return out


def main():
    txt = io.open(RAW, encoding="utf-8").read()
    url = ""
    for ln in txt.split("\n")[:6]:
        if ln.startswith("URL: "):
            url = ln[5:].strip()
    links = fetch_links(url)

    # ---- указатели: номер -> краткое описание + вид акта
    recs = {}
    for label, kind in (("ПРЕЦЕДЕНТЫ СУДА", "Прецедент"),
                        ("ТОЛКОВАНИЯ ВЕРХОВНОГО СУДА", "Толкование")):
        i = txt.find(label)
        if i < 0:
            continue
        # блок идёт до следующего заголовка верхнего уровня
        j = min([x for x in (txt.find("ТОЛКОВАНИЯ ВЕРХОВНОГО СУДА", i + 1),
                             txt.find("===== ПОСТ", i + 1)) if x > 0] or [len(txt)])
        for num, tail in IDX_RE.findall(txt[i:j]):
            tail = tail.strip()
            dead = "Утратил" in tail or "Утратило" in tail
            parties, topic = "", tail
            m = re.match(r"^(.+?)\s*\((\d{4})\)\s*—\s*(.+)$", tail)
            year = ""
            if m:
                parties, year, topic = m.group(1).strip(), m.group(2), m.group(3).strip()
            recs[num] = {"num": num, "kind": kind, "parties": parties, "year": year,
                         "topic": "" if dead else topic, "active": not dead,
                         "date": "", "court": "", "actType": "", "source": "",
                         "url": links.get(num, url), "text": ""}

    # ---- тела актов
    heads = list(HEAD_RE.finditer(txt))
    for k, m in enumerate(heads):
        num = m.group(5)
        end = heads[k + 1].start() if k + 1 < len(heads) else len(txt)
        body = txt[m.end():end]
        body = re.sub(r"=====\s*ПОСТ\s+\d+\s*=====", "", body)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        r = recs.setdefault(num, {"num": num, "kind": "Прецедент", "parties": "", "year": "",
                                  "topic": "", "active": True, "url": links.get(num, url)})
        r["actType"] = m.group(1)
        r["court"] = m.group(2) + " Суд"
        r["date"] = m.group(3)
        r["source"] = m.group(4).strip()
        if len(body) > len(r.get("text", "")):
            r["text"] = body
        if "Утратил" in body[:80] or "Утратило" in body[:80]:
            r["active"] = False
            r["text"] = ""

    # ---- навигация по НПА: какая статья каким актом разъяснена
    nav = []
    i = txt.find("НАВИГАЦИЯ ПО НПА")
    if i >= 0:
        j = txt.find("ПРЕЦЕДЕНТЫ СУДА", i)
        cur = ""
        for ln in txt[i:j if j > 0 else len(txt)].split("\n"):
            s = ln.strip()
            if s.startswith("Спойлер:"):
                cur = s.replace("Спойлер:", "").strip()
            m = NAV_RE.match(s)
            if m:
                acts = re.findall(NUM, m.group(2))
                if acts:
                    nav.append({"doc": cur, "subject": m.group(1).strip(), "acts": acts})

    # ---- толкования живут в собственных темах: в этой их только указатель,
    # поэтому полный текст тянем по ссылке из конкретного поста
    import sys, time
    sys.path.insert(0, HERE)
    from scrape import fetch, strip_html
    for r in recs.values():
        if r.get("text") or not r["active"]:
            continue
        m = re.search(r"post-(\d+)", r.get("url", ""))
        if not m:
            continue
        try:
            page = fetch(r["url"])
            pm = re.search(r'data-content="post-%s"' % m.group(1), page)
            if not pm:
                continue
            bm = re.search(r'<div class="bbWrapper">(.*?)</article>', page[pm.start():], re.S)
            if bm:
                body = strip_html(bm.group(1))
                if len(body) > 200:
                    r["text"] = re.sub(r"\n{3,}", "\n\n", body).strip()
            time.sleep(1.0)
        except Exception as e:
            print("  %s %s — не удалось: %s" % (r["kind"], r["num"], e))

    items = sorted(recs.values(), key=lambda r: int(r["num"]))
    for r in items:
        r.pop("kind", None) if False else None
    data = {"updated": "2026-08-28", "source": url, "nav": nav, "items": items}
    io.open(OUT, "w", encoding="utf-8").write(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    act = [r for r in items if r["active"]]
    withtext = [r for r in act if r.get("text")]
    print("всего записей: %d | действующих: %d | с полным текстом: %d"
          % (len(items), len(act), len(withtext)))
    print("связок статья→акт в навигации: %d" % len(nav))
    print("со ссылкой на форум: %d" % len([r for r in items if r["url"] and "post-" in r["url"]]))


if __name__ == "__main__":
    main()
