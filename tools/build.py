#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сборка структурированной базы знаний из сырых текстов форума GTA5RP / Murrieta."""
import re, os, io, json, hashlib, unicodedata

RAW = "raw"
OUT = "../data"

# ---------------------------------------------------------------- метаданные
# (файл, категория, порядок)
CATS = {
    "kodeks":   "Кодексы",
    "zakon":    "Законы",
    "rules":    "Правила проекта",
    "gov":      "Правила гос. фракций",
    "murrieta": "Murrieta (дополнения)",
}

META = [
    # id                    файл                                              категория   короткое имя
    ("konstituciya",  "Конституция_Штата_Сан-Андреас",              "kodeks", "Конституция"),
    ("uak",           "Уголовно-административный_кодекс",           "kodeks", "УАК"),
    ("pk",            "Процессуальный_кодекс",                      "kodeks", "ПК"),
    ("dk",            "Дорожный_кодекс",                            "kodeks", "ДК"),
    ("sudebnyy",      "Судебный_кодекс",                            "kodeks", "Судебный кодекс"),
    ("eticheskiy",    "Этический_кодекс",                           "kodeks", "Этический кодекс"),
    ("trudovoy",      "Трудовой_кодекс",                            "kodeks", "Трудовой кодекс"),

    ("z-pravitelstvo","Закон_о_Правительстве",                      "zakon", "О Правительстве"),
    ("z-prokuratura", "Закон_о_Прокуратуре",                        "zakon", "О Прокуратуре"),
    ("z-advokat",     "Закон_об_адвокатской_деятельности",          "zakon", "Об адвокатуре"),
    ("z-neprikos",    "Закон_о_неприкосновенности_должностных_лиц", "zakon", "О неприкосновенности"),
    ("z-kongress",    "Закон_о_Конгрессе",                          "zakon", "О Конгрессе"),
    ("z-oruzhie",     "Закон_об_обороте_оружия",                    "zakon", "Об обороте оружия"),
    ("z-zot",         "Закон_о_ЗОТ",                                "zakon", "О ЗОТ"),
    ("z-rezhimy",     "Закон_об_особых_режимах_и_протоколах",       "zakon", "Об особых режимах"),
    ("z-fib",         "Закон_о_FIB",                                "zakon", "О FIB"),
    ("z-lspd",        "Закон_о_LSPD",                               "zakon", "О LSPD"),
    ("z-lssd",        "Закон_о_LSSD",                               "zakon", "О LSSD"),
    ("z-army",        "Закон_о_ARMY",                               "zakon", "О ARMY (SANG)"),
    ("z-saspa",       "Закон_о_SASPA",                              "zakon", "О SASPA"),
    ("z-usss",        "Закон_о_USSS",                               "zakon", "О USSS"),
    ("z-usms",        "Закон_о_USMS",                               "zakon", "О USMS"),
    ("z-ems",         "Закон_о_EMS",                                "zakon", "О EMS"),
    ("z-smi",         "Закон_о_СМИ",                                "zakon", "О СМИ"),
    ("z-gostayna",    "Закон_о_государственной_тайне",              "zakon", "О гос. тайне"),
    ("z-predprin",    "Закон_о_предпринимательской_деятельности",   "zakon", "О предпринимательстве"),
    ("z-rozysk",      "Закон_о_розыске_граждан",                    "zakon", "О розыске граждан"),
    ("z-registrts",   "Закон_о_регистрации_ТС",                     "zakon", "О регистрации ТС"),
    ("z-rybolovstvo", "Закон_о_рыболовстве_и_охоте",                "zakon", "О рыболовстве и охоте"),
    ("z-partii",      "Закон_о_политических_партиях",               "zakon", "О полит. партиях"),
    ("z-yurisdikciya","Закон_о_Юрисдикции",                         "zakon", "О юрисдикции"),
    ("z-gossobstv",   "Закон_об_управлении_гос._собственностью",    "zakon", "Об управлении гос. собств."),
    ("precedenty",    "Судебные_прецеденты_и_толкования",           "zakon", "Прецеденты"),

    ("p-obshie",      "ПРАВИЛА_Общие_правила_проекта",              "rules", "Общие правила проекта"),
    ("p-murrieta",    "ПРАВИЛА_СЕРВЕРА_MURRIETA",                   "rules", "Правила сервера Murrieta"),
    ("p-forum",       "ПРАВИЛА_Правила_форума",                     "rules", "Правила форума"),
    ("p-lidery",      "ПРАВИЛА_Правила_и_обязанности_лидеров",      "rules", "Правила лидеров"),
    ("p-zz",          "ПРАВИЛА_Правила_зеленых_зон",                "rules", "Зелёные зоны"),
    ("p-neof",        "ПРАВИЛА_Неофициальные_организации",          "rules", "Неоф. организации"),
    ("p-bandy",       "ПРАВИЛА_Общие_правила_банд",                 "rules", "Правила банд"),
    ("p-mafii",       "ПРАВИЛА_Общие_правила_мафий",                "rules", "Правила мафий"),
    ("p-opasnyi",     "ПРАВИЛА_Опасный_район",                      "rules", "Опасный район"),
    ("p-ogrableniya", "ПРАВИЛА_Ограбления_и_похищения",             "rules", "Ограбления/похищения"),
    ("p-pvp",         "ПРАВИЛА_Ежедневные_PVP-события",             "rules", "Ежедневные PVP"),
    ("p-graffiti",    "ПРАВИЛА_Война_за_граффити",                  "rules", "Война за граффити"),
    ("p-ammu",        "ПРАВИЛА_Нападение_на_Ammunation-поезд",      "rules", "Ammunation / поезд"),
    ("p-zahvat",      "ПРАВИЛА_Захват_государственных_фракций",     "rules", "Захват гос. фракций"),
    ("p-bizvar",      "ПРАВИЛА_Война_за_территорию-бизнес",         "rules", "Война за территорию/бизнес"),
    ("p-titul",       "ПРАВИЛА_Титульные_районы",                   "rules", "Титульные районы"),

    ("g-gosfrakcii",  "ПРАВИЛА_ГОС_Правила_государственных_фракций","gov", "Правила гос. фракций"),
    ("g-dela",        "ПРАВИЛА_ГОС_Уголовные_дела_и_внедрения",     "gov", "Уголовные дела и внедрения"),
    ("g-doprosy",     "ПРАВИЛА_ГОС_Проведение_допросов",            "gov", "Проведение допросов"),
    ("g-reidy",       "ПРАВИЛА_ГОС_Рейды",                          "gov", "Рейды"),
    ("g-snyatie",     "ПРАВИЛА_ГОС_Снятие_лидеров_гос._структур",   "gov", "Снятие лидеров гос. структур"),

    ("m-gosstruk",    "MURR_Правила_государственных_структур",      "murrieta", "Гос. структуры — дополнения"),
    ("m-vneshvid",    "MURR_Положение_о_внешнем_виде_гос_сотрудников","murrieta","Внешний вид гос. сотрудников"),
    ("m-reidy",       "MURR_Правила_рейдов_внедрений_допросов",     "murrieta", "Рейды/внедрения/допросы — доп."),
    ("m-snyatie",     "MURR_Правила_снятия_лидеров_гос_структур",   "murrieta", "Снятие губернатора — доп."),
    ("m-zahvat",      "MURR_Правила_захвата_государственных_организаций","murrieta","Захват гос. организаций — доп."),
    ("m-zz",          "MURR_Правила_зеленых_зон",                   "murrieta", "Зелёные зоны — дополнения"),
    ("m-krim",        "MURR_Правила_криминальных_фракций",          "murrieta", "Крим. фракции — дополнения"),
    ("m-zankudo",     "MURR_Правила_нападения_на_Форт_Занкудо_SASPA","murrieta","Форт Занкудо / SASPA"),
]

HEAD_RE = re.compile(r"^(Глава|Раздел|Статья|Пункт|Общая часть|Особенная часть|Приложение|Комментарий|Вводные положения)\b", re.I)
POST_RE = re.compile(r"^=====\s*ПОСТ\s+(\d+)\s*=====$")


def clean(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("​", "").replace("﻿", "").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def is_heading(line: str) -> bool:
    if HEAD_RE.match(line):
        return True
    if len(line) > 72 or "|" in line:
        return False
    if re.match(r"^\d", line):
        return False
    if line.endswith((".", ";", ":", ",", "!", "?")):
        return False
    # заголовок-секция в правилах: «Силовые структуры», «Правительство», «Маски»
    return bool(re.match(r"^[A-ZА-ЯЁ][^.]{2,71}$", line))


def parse_doc(path):
    txt = io.open(path, encoding="utf-8").read()
    lines = txt.split("\n")
    url = ""
    body_start = 0
    for i, ln in enumerate(lines[:6]):
        if ln.startswith("URL: "):
            url = ln[5:].strip()
        if POST_RE.match(clean(ln)):
            body_start = i
            break
    sections, cur = [], {"heading": "", "level": 1, "paras": []}
    post_no = 1
    for ln in lines[body_start:]:
        s = clean(ln)
        if not s:
            continue
        pm = POST_RE.match(s)
        if pm:
            post_no = int(pm.group(1))
            if post_no > 1:
                if cur["paras"] or cur["heading"]:
                    sections.append(cur)
                cur = {"heading": "Изменения / дополнения (пост %d)" % post_no,
                       "level": 1, "paras": [], "amendment": True}
            continue
        if is_heading(s):
            if cur["paras"] or cur["heading"]:
                sections.append(cur)
            lvl = 1 if re.match(r"^(Глава|Раздел|Общая часть|Особенная часть)", s, re.I) else 2
            cur = {"heading": s, "level": lvl, "paras": []}
            if post_no > 1:
                cur["amendment"] = True
            continue
        cur["paras"].append(s)
    if cur["paras"] or cur["heading"]:
        sections.append(cur)
    # заголовки глав часто идут без собственного текста — их нужно сохранить,
    # иначе в читалке теряется иерархия. Выкидываем только совсем пустые куски.
    return url, [s for s in sections if s["paras"] or s["heading"]]


# ------------------------------------------------------------- статьи УАК
ART_RE = re.compile(
    r"^(?P<num>\d+(?:\.\d+){0,3})\s*(?P<m1>\*{0,3})\s*\[(?P<type>[УАAY])\]\s*"
    r"(?P<m2>\*{0,3})\s*(?:\((?P<jur>[^)]*)\))?\s*(?P<m3>\*{0,3})\s*[-–—]?\s*(?P<body>.+)$"
)
# суммы пишут и как «5.000$», и как «$5.000»
MONEY = re.compile(r"(?:(\d[\d\s.,]*?)\s*\$|\$\s*(\d[\d\s.,]*))")
# начало санкции, когда автор не поставил тире
SANC_START = re.compile(
    r"(?:^|(?<=[.;)]\s))\s*("
    r"(?:[Уу]головный |[Сс]удебный |[Аа]дминистративный )?[Шш]траф\b"
    r"|[Оо]т \d+ (?:до \d+ )?(?:лет|год|года|суток)\b"
    r"|[Дд]о \d+ (?:лет|год[а]?|суток)\b"
    r"|\d+ (?:лет|год|года) лишения свободы"
    r"|\d+ суток"
    r"|[Вв]озмещение\b|[Пп]ринудительн\w+\b|[Кк]омпенсация\b"
    r")"
)


def money_list(s):
    out = []
    for m in MONEY.finditer(s):
        v = re.sub(r"[^\d]", "", m.group(1) or m.group(2) or "")
        if v:
            out.append(int(v))
    return out


DASH = "-–—⁃‑"


def split_sanction(body):
    """Разделяет диспозицию и санкцию: сначала по тире, иначе по началу описания наказания."""
    parts = re.split(r"\s[%s]\s?(?=[А-ЯЁA-Zа-яё0-9])" % DASH, body)
    if len(parts) >= 2:
        return " - ".join(parts[:-1]).strip(), parts[-1].strip()
    m = None
    for m in SANC_START.finditer(body):
        pass  # берём последнее вхождение — диспозиция может упоминать «штраф» по тексту
    if m and m.start(1) > 20:
        return body[:m.start(1)].strip(), body[m.start(1):].strip()
    return body.strip(), ""


def parse_uak(path):
    txt = io.open(path, encoding="utf-8").read()
    arts, chapter, section = [], "", ""
    for ln in txt.split("\n"):
        s = clean(ln)
        if not s:
            continue
        if re.match(r"^Раздел\s", s):
            section = s
            continue
        if re.match(r"^Глава\s", s):
            chapter = s
            continue
        m = ART_RE.match(s)
        if not m:
            # продолжение предыдущей статьи: примечание/исключение может нести санкцию
            if arts and re.match(r"^(Примечание|Исключение|Пример)\b", s):
                arts[-1].setdefault("notes", []).append(s)
                if not arts[-1]["sanction"]:
                    _, sanc2 = split_sanction(s)
                    if sanc2:
                        arts[-1]["sanction"] = sanc2
                        arts[-1]["money"] = money_list(sanc2)
            continue
        marks = (m.group("m1") or "") + (m.group("m2") or "") + (m.group("m3") or "")
        body = m.group("body")
        disp, sanc = split_sanction(body)
        typ = "У" if m.group("type") in ("У", "Y") else "А"
        jail = re.search(r"(?:от\s*(\d+)\s*до\s*)?(\d+)\s*(?:лет|год|года)\s+лишения свободы", sanc, re.I)
        arrest = re.search(r"(?:от\s*(\d+)\s*до\s*)?(\d+)\s*суток", sanc, re.I)
        bail = re.search(r"[Зз]алог[а-я]*\s*(?:от|до)?\s*([\d\s.,]+)\$", sanc)
        arts.append({
            "num": m.group("num"),
            "type": typ,
            "jurisdiction": [j.strip() for j in (m.group("jur") or "").split("/") if j.strip()],
            "ban": len(marks),               # * 7 дней, ** 21 день, *** пожизненно
            "section": section,
            "chapter": chapter,
            "title": disp,
            "sanction": sanc,
            "money": money_list(sanc),
            "jail_years": [int(x) for x in (jail.groups() if jail else []) if x],
            "arrest_days": [int(x) for x in (arrest.groups() if arrest else []) if x],
            "bail": int(re.sub(r"[^\d]", "", bail.group(1))) if bail else None,
            "text": s,
        })
    return arts


# ----------------------------------------------------- статьи Дорожного кодекса
def parse_dk(path):
    txt = io.open(path, encoding="utf-8").read()
    lines = [clean(x) for x in txt.split("\n")]
    arts, chapter, cur = [], "", None
    mode = "title"          # title -> sanction -> notes
    for s in lines:
        if not s:
            continue
        if re.match(r"^Глава\s", s):
            chapter = s
            continue
        m = re.match(r"^Статья\s+(\d+(?:\.\d+)?)\.?\s*(.*)$", s)
        if m:
            if cur:
                arts.append(cur)
            cur = {"num": m.group(1), "chapter": chapter,
                   "title": m.group(2).strip(), "sanction": "", "notes": [], "money": []}
            mode = "title"
            continue
        if cur is None:
            continue
        if s.startswith("Наказание"):
            rest = re.sub(r"^Наказание:?\s*", "", s).strip()
            cur["sanction"] = rest
            mode = "sanction"
            continue
        if s.startswith(("Примечание", "Исключение")):
            cur["notes"].append(s)
            mode = "notes"
            continue
        if mode == "title":
            cur["title"] = (cur["title"] + " " + s).strip()
        elif mode == "sanction":
            cur["sanction"] = (cur["sanction"] + " " + s).strip()
        else:
            cur["notes"].append(s)
    if cur:
        arts.append(cur)
    for a in arts:
        a["money"] = money_list(a["sanction"])
    return [a for a in arts if a["title"]]


# ------------------------------------------------------------------- чанки RAG
def make_chunks(doc_id, title, cat, url, sections, limit=1400):
    out = []
    for sec in sections:
        if not sec["paras"]:      # заголовок без текста — в RAG не нужен
            continue
        head = sec["heading"]
        buf, size = [], 0
        for p in sec["paras"]:
            if size + len(p) > limit and buf:
                out.append((head, "\n".join(buf)))
                buf, size = [], 0
            buf.append(p)
            size += len(p) + 1
        if buf:
            out.append((head, "\n".join(buf)))
    return [{
        "id": "%s#%d" % (doc_id, i),
        "doc": doc_id, "docTitle": title, "cat": cat, "url": url,
        "heading": h, "text": t,
    } for i, (h, t) in enumerate(out)]


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, "docs"), exist_ok=True)
    index, chunks = [], []
    for doc_id, fname, cat, short in META:
        path = os.path.join(RAW, fname + ".txt")
        if not os.path.exists(path):
            print("!! НЕТ ФАЙЛА:", path)
            continue
        url, sections = parse_doc(path)
        title = short
        full_title = io.open(path, encoding="utf-8").read().split("\n")[1].replace("НАЗВАНИЕ: ", "").strip()
        doc = {"id": doc_id, "title": title, "fullTitle": full_title,
               "cat": cat, "catName": CATS[cat], "url": url, "sections": sections}
        io.open(os.path.join(OUT, "docs", doc_id + ".json"), "w", encoding="utf-8").write(
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
        nchars = sum(len(p) for s in sections for p in s["paras"])
        index.append({"id": doc_id, "title": title, "fullTitle": full_title, "cat": cat,
                      "catName": CATS[cat], "url": url, "chars": nchars,
                      "headings": [s["heading"] for s in sections if s["heading"]][:40]})
        chunks += make_chunks(doc_id, title, cat, url, sections)
        print("%-16s %-34s %6d симв. %3d секц." % (doc_id, short[:34], nchars, len(sections)))

    arts = parse_uak(os.path.join(RAW, "Уголовно-административный_кодекс.txt"))
    dk = parse_dk(os.path.join(RAW, "Дорожный_кодекс.txt"))

    w = lambda n, o: io.open(os.path.join(OUT, n), "w", encoding="utf-8").write(
        json.dumps(o, ensure_ascii=False, separators=(",", ":")))
    w("index.json", index)
    w("articles.json", arts)
    w("traffic.json", dk)
    w("chunks.json", chunks)

    print("\n=== ИТОГО ===")
    print("документов:", len(index))
    print("статей УАК:", len(arts), "| уголовных:", sum(1 for a in arts if a["type"] == "У"),
          "| административных:", sum(1 for a in arts if a["type"] == "А"))
    print("статей ДК:", len(dk))
    print("чанков для ИИ:", len(chunks),
          "| средний размер:", sum(len(c["text"]) for c in chunks) // max(1, len(chunks)))


if __name__ == "__main__":
    main()
