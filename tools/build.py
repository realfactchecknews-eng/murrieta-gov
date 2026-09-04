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
    "ustav":    "Уставы фракций",
    "sud":      "Судебная практика",
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
    # «Судебные прецеденты и толкования» (3237175) — тема-заглушка из одной
    # картинки без текста; сами прецеденты лежат в s-precedenty, поэтому
    # отдельный пустой документ только зашумлял выдачу и корпус ИИ.

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

    ("u-lspd",        "УСТАВ_LSPD",                                 "ustav", "Устав LSPD"),
    ("u-lssd",        "УСТАВ_LSSD",                                 "ustav", "Устав LSSD"),
    ("u-lssd-otd",    "УСТАВ_LSSD_отделы",                          "ustav", "Устав отделов LSSD"),
    ("u-fib",         "УСТАВ_FIB",                                  "ustav", "Устав FIB"),
    ("u-ng",          "УСТАВ_NG",                                   "ustav", "Устав National Guard"),
    ("u-ng-karaul",   "УСТАВ_NG_караульной_службы",                 "ustav", "Устав караульной службы NG"),
    ("u-saspa",       "УСТАВ_SASPA",                                "ustav", "Устав SASPA"),
    ("u-saspa-doktr", "SASPA_доктрина_наказаний",                   "ustav", "SASPA: доктрина наказаний"),
    ("u-saspa-rasp",  "SASPA_внутренний_распорядок",                "ustav", "SASPA: распорядок заключённых"),
    # Уставы EMS перевыпущены 28.08.2026 новыми темами, приложения перенумерованы:
    # было 1-дисциплинарный/2-лицензии/3-цены/4-медкарты,
    # стало 1-медкарты/2-внешние цены/3-внутренние цены/4-лицензии/5-дисциплинарный.
    ("u-ems",         "УСТАВ_EMS",                                  "ustav", "Устав EMS"),
    ("u-ems-disc",    "УСТАВ_EMS_прил5_дисциплинарный",             "ustav", "EMS: дисциплинарный раздел"),
    ("u-ems-lic",     "УСТАВ_EMS_прил4_лицензии",                   "ustav", "EMS: лицензии"),
    ("u-ems-med",     "УСТАВ_EMS_прил1_медкарты",                   "ustav", "EMS: медкарты"),
    ("u-ems-cenavne", "УСТАВ_EMS_прил2_внешние_цены",               "ustav", "EMS: внешние цены"),
    ("u-ems-cenavnu", "УСТАВ_EMS_прил3_внутренние_цены",            "ustav", "EMS: внутренние цены"),
    ("u-gov",         "УСТАВ_Правительства",                        "ustav", "Устав Правительства"),
    ("u-gov-lic",     "GOV_правительственные_лицензии",             "ustav", "Правительственные лицензии"),

    ("s-precedenty",  "СУД_Прецеденты_и_толкования",                "sud", "Прецеденты и толкования"),
    ("s-etika",       "СУД_Кодекс_судейской_этики",                 "sud", "Кодекс судейской этики"),
    ("s-obzhalovanie","СУД_Порядок_обжалования_актов",              "sud", "Порядок обжалования актов"),
    ("s-zasedanie",   "СУД_Правила_поведения_в_заседании",          "sud", "Поведение в заседании"),
    ("s-akty-vs",     "СУД_Акты_Верховного_суда",                   "sud", "Акты Верховного суда"),
    ("s-prok-proverki","ПРОК_Регламент_проверок",                   "sud", "Регламент прокурорских проверок"),
    ("s-prok-akty",   "ПРОК_Акты_Генпрокуратуры_особого_значения",  "sud", "Акты Генпрокуратуры"),
    ("s-adv-zapros",  "АДВ_Адвокатский_запрос",                     "sud", "Адвокатский запрос"),
    ("s-adv-reestr",  "АДВ_Реестр_частных_адвокатов",               "sud", "Реестр частных адвокатов"),
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
    sections, cur = [], {"heading": "", "level": 1, "paras": [], "parent": ""}
    parent = ""          # последняя встреченная глава/раздел
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
            # «Комментарий законодателя» — самостоятельный блок в конце УАК,
            # который иначе наследует «Глава 18» (последнюю главу перед ним)
            # как родителя, и модель путает номер статьи с номером главы.
            lvl = 1 if re.match(r"^(Глава|Раздел|Общая часть|Особенная часть|Комментарий законодателя)", s, re.I) else 2
            if lvl == 1:
                parent = "" if re.match(r"^Комментарий законодателя", s, re.I) else s
            cur = {"heading": s, "level": lvl, "paras": [], "parent": "" if lvl == 1 else parent}
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
# Форум помечает статьи цветным квадратом тяжести перед номером:
# 🟩 — лёгкие, 🟨 — средние, 🟥 — тяжкие. Маркер необязателен (в старых
# редакциях его не было), поэтому группа опциональная.
SEVERITY = {"🟩": "low", "🟨": "mid", "🟥": "high"}
ART_RE = re.compile(
    r"^(?P<sev>[🟩🟨🟥])?\s*(?P<num>\d+(?:\.\d+){0,3})\s*(?P<m1>\*{0,3})\s*\[(?P<type>[УАAY])\]\s*"
    r"(?P<m2>\*{0,3})\s*(?:\((?P<jur>[^)]*)\))?\s*(?P<m3>\*{0,3})\s*[-–—]?\s*(?P<body>.*)$"
)
# Многочастная статья: заголовок без диспозиции, а части идут отдельными
# строками («ч. 1. …  - 2 года лишения свободы»). Появилось в редакции 21.08.2026 (ст. 15.8).
PART_RE = re.compile(r"^ч\.\s*(\d+)\.?\s*(.+)$")
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


def sanction_fields(sanc):
    """Числовые поля, выводимые из текста санкции."""
    jail = re.search(r"(?:от\s*(\d+)\s*до\s*)?(\d+)\s*(?:лет|год|года)\s+лишения свободы", sanc, re.I)
    arrest = re.search(r"(?:от\s*(\d+)\s*до\s*)?(\d+)\s*суток", sanc, re.I)
    bail = re.search(r"[Зз]алог[а-я]*\s*(?:от|до)?\s*([\d\s.,]+)\$", sanc)
    return {
        "sanction": sanc,
        "money": money_list(sanc),
        "jail_years": [int(x) for x in (jail.groups() if jail else []) if x],
        "arrest_days": [int(x) for x in (arrest.groups() if arrest else []) if x],
        "bail": int(re.sub(r"[^\d]", "", bail.group(1))) if bail else None,
    }


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
            # части многочастной статьи: первая даёт диспозицию и санкцию,
            # остальные идут примечаниями, чтобы не потерять их текст
            pm = PART_RE.match(s)
            if pm and arts and not arts[-1]["title"]:
                disp, sanc = split_sanction(pm.group(2))
                arts[-1]["title"] = disp
                arts[-1].update(sanction_fields(sanc))
                arts[-1]["text"] = arts[-1]["text"] + " " + s
                continue
            if pm and arts and arts[-1].get("multipart"):
                arts[-1].setdefault("notes", []).append(s)
                continue
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
        art = {
            "num": m.group("num"),
            "type": typ,
            "severity": SEVERITY.get(m.group("sev") or "", ""),
            "jurisdiction": [j.strip() for j in (m.group("jur") or "").split("/") if j.strip()],
            "ban": len(marks),               # * 7 дней, ** 21 день, *** пожизненно
            "section": section,
            "chapter": chapter,
            "title": disp,
            "text": s,
        }
        art.update(sanction_fields(sanc))
        if not disp:
            art["multipart"] = True     # диспозиция придёт из строк «ч. N…»
        arts.append(art)
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
        # В заголовок чанка подставляем и родительскую главу — иначе модель
        # цитирует «ст. 1», не зная, что это глава IX.
        head = (sec.get("parent") + " · " + sec["heading"]).strip(" ·") if sec.get("parent") else sec["heading"]
        buf, size = [], 0
        for p in sec["paras"]:
            # Примечание/Исключение/Пример нельзя отрывать от своего пункта:
            # иначе в чанк попадёт текст без номера, к которому он относится,
            # и модель припишет его соседнему пункту.
            attached = bool(re.match(r"^(Примечание|Исключение|Пример|Пояснение)\b", p))
            if size + len(p) > limit and buf and not attached:
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

    # Памятки написаны вручную и содержат уже сведённые выводы (в т.ч. конфликты
    # «закон разрешает — правила запрещают»). Их обязательно класть в корпус ИИ:
    # готовый вердикт надёжнее, чем надежда, что модель сама сведёт две нормы.
    gp = os.path.join(OUT, "guides.json")
    if os.path.exists(gp):
        for g in json.load(io.open(gp, encoding="utf-8"))["guides"]:
            for bi, b in enumerate(g.get("blocks", [])):
                parts = []
                if b.get("type") == "conflicts":
                    for c in b["items"]:
                        parts.append(
                            "СИТУАЦИЯ: %s\nЧТО ГОВОРИТ ЗАКОН: %s\nЧТО ГОВОРЯТ ПРАВИЛА: %s\n"
                            "ИТОГОВЫЙ ОТВЕТ: %s\nНАКАЗАНИЕ ПО ПРАВИЛАМ: %s"
                            % (c["topic"], c["law"], c["rule"], c["verdict"], c.get("penalty", "—")))
                elif b.get("type") == "prec":
                    for p in b["items"]:
                        parts.append("ПРЕЦЕДЕНТ %s — %s\n%s" % (p["num"], p["topic"], p["text"]))
                elif b.get("type") == "cards":
                    for c in b["items"]:
                        parts.append("%s (%s): %s" % (c["name"], c["tag"], c["text"]))
                elif b.get("type") == "table":
                    parts.append("\n".join("%s — %s" % (k, v) for k, v in b["rows"]))
                elif b.get("type") == "list":
                    parts.append((b.get("title", "") + "\n" + "\n".join("• " + i for i in b["items"])).strip())
                elif b.get("type") in ("warn", "note"):
                    parts.append((b.get("title", "") + "\n" + b["text"]).strip())
                for pi, txt in enumerate(parts):
                    chunks.append({
                        "id": "guide-%s#%d-%d" % (g["id"], bi, pi),
                        "doc": "guide-" + g["id"], "docTitle": "Памятка: " + g["title"],
                        "cat": "guide", "url": "", "heading": b.get("title", g["title"]),
                        "text": txt,
                    })
        print("памятки добавлены в корпус ИИ")

    # Толкования и прецеденты Верховного суда обязательны к применению и имеют
    # силу закона — они уточняют кодексы и часто решают дело. Кладём каждый акт
    # отдельным документом (prec-NNN), чтобы поиск мог поднять его целиком,
    # а утратившие силу не индексируем вовсе: ссылаться на них нельзя.
    pp = os.path.join(OUT, "precedents.json")
    if os.path.exists(pp):
        pdata = json.load(io.open(pp, encoding="utf-8"))
        npr = 0
        for r in pdata["items"]:
            if not r.get("active") or not r.get("text"):
                continue
            head = "%s №%s" % (r["kind"], r["num"])
            title = "%s — %s" % (head, r.get("topic") or r.get("parties") or "")
            body = ("%s от %s (%s)\nТЕМА: %s\n\n%s"
                    % (head, r.get("date", "—"), r.get("parties", ""), r.get("topic", ""), r["text"]))
            for c in make_chunks("prec-" + r["num"], title, "sud", r.get("url", ""),
                                 [{"heading": head, "paras": [body], "level": 1}]):
                chunks.append(c)
                npr += 1
        # карта «статья → каким актом разъяснена» — короткая, но очень плотная подсказка
        if pdata.get("nav"):
            by_doc = {}
            for n in pdata["nav"]:
                by_doc.setdefault(n["doc"], []).append(
                    "%s → %s" % (n["subject"], ", ".join("№" + a for a in n["acts"])))
            for doc, lines in by_doc.items():
                chunks.append({
                    "id": "prec-nav#" + str(abs(hash(doc)) % 10**6),
                    "doc": "prec-nav", "docTitle": "Навигация: какие статьи разъяснены",
                    "cat": "sud", "url": pdata.get("source", ""),
                    "heading": "Разъяснённые статьи — " + doc,
                    "text": doc + "\n" + "\n".join(lines),
                })
                npr += 1
        print("прецеденты и толкования добавлены в корпус ИИ: %d фрагментов" % npr)

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
