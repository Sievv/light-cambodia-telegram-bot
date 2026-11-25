"""Convert QA-km-en.xlsx into seed/qa.sql for the kb_qa table.

Uses only the Python standard library (an .xlsx file is a zip of XML).

    python3 scripts/import_qa.py [QA-km-en.xlsx] [seed/qa.sql]

Then load it:  npm run qa:seed:local   /   npm run qa:seed:remote
"""

import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Excel column -> kb_qa column
COLUMNS = {
    "A": "id",
    "B": "category",
    "C": "question_en",
    "D": "question_km",
    "G": "answer_en",
    "H": "answer_km",
    "J": "priority",
    "M": "escalate_to",
}

# Telegram callback_data is max 64 bytes; "qa:<id>:<user id>" must fit.
MAX_ID_LEN = 24

# Answers refer to training files by name, e.g. "Operation procedure: 02_KHANA_Pluslife_Procedure.pdf".
# Files in media/ are uploaded to R2 (`npm run media:upload`) and served by the Worker, so their
# names become links. Names of files not in media/ become "[… - Pending]", which the bot hides.
FILES_BASE_URL = "https://telegram-learning.lab-telegram-gemini-d1.workers.dev/files/"
MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
FILE_NAME = re.compile(r"\b(\d\d_[A-Za-z0-9_]+\.(?:pdf|mp4))(\s*[.។](?=\s|$))?")
# Link labels, used when one line lists several files: "KHANA guide in Khmer: 01_….pdf (…), 02_….pdf (…)".
FILE_LABELS = {
    "01_KHANA_Pluslife_Booklet.pdf": {"en": "Picture booklet (Khmer)", "km": "សៀវភៅមានរូបភាព"},
    "02_KHANA_Pluslife_Procedure.pdf": {"en": "Step-by-step procedure (Khmer)", "km": "ជំហានធ្វើតេស្ត"},
    "03_KHANA_Pluslife_Training_Video.mp4": {"en": "Training video, 5 min (Khmer)", "km": "វីដេអូបណ្តុះបណ្តាល ៥ នាទី"},
    "04_KHANA_Pluslife_Clinical_Procedure_KH.pdf": {"en": "Clinical flow chart (Khmer)", "km": "គំនូសតាងដំណើរការគ្លីនិក"},
}


def link_files(text: str, lang: str, available: set[str]) -> str:
    out = []
    for line in text.split("\n"):
        names = [n for n, _ in FILE_NAME.findall(line)]
        if len(names) >= 2 and all(n in FILE_LABELS for n in names):
            # A list of files: one "label: link" line each, which the bot shows as separate links.
            sep = "៖ " if lang == "km" else ": "
            out += [f"{FILE_LABELS[n][lang]}{sep}{FILES_BASE_URL}{n}" for n in names if n in available]
            continue

        def repl(m: re.Match) -> str:
            name, punct = m.group(1), m.group(2) or ""
            if name in available:
                return FILES_BASE_URL + name + punct
            return f"[{FILE_LABELS.get(name, {}).get('en', name)} - Pending]"

        out.append(FILE_NAME.sub(repl, line))
    return "\n".join(out)


def read_rows(xlsx: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(xlsx) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in root]
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    rows = []
    for row in sheet.iter(NS + "row"):
        rec = {}
        for c in row.findall(NS + "c"):
            col = re.sub(r"\d", "", c.get("r", ""))
            v = c.find(NS + "v")
            if c.get("t") == "s" and v is not None:
                val = shared[int(v.text)]
            elif v is not None:
                val = v.text or ""
            else:  # inline string
                val = "".join(t.text or "" for t in c.iter(NS + "t"))
            rec[col] = val.strip()
        rows.append(rec)
    return rows[1:]  # skip header


def sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "QA-km-en.xlsx")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "seed/qa.sql")

    available = {p.name for p in MEDIA_DIR.glob("*") if p.is_file()}
    records, seen, skipped = [], set(), 0
    for raw in read_rows(src):
        r = {name: raw.get(col, "") for col, name in COLUMNS.items()}
        if not r["id"] or not (r["question_en"] or r["question_km"]) or not (r["answer_en"] or r["answer_km"]):
            skipped += 1
            continue
        if len(r["id"]) > MAX_ID_LEN or not re.fullmatch(r"[A-Za-z0-9_.-]+", r["id"]):
            sys.exit(f"ID not usable in a Telegram button: {r['id']!r}")
        if r["id"] in seen:
            sys.exit(f"Duplicate ID: {r['id']}")
        seen.add(r["id"])
        r["answer_en"] = link_files(r["answer_en"], "en", available)
        r["answer_km"] = link_files(r["answer_km"], "km", available)
        r["issue_id"] = re.sub(r"-Q\d+$", "", r["id"])
        records.append(r)

    cols = ["id", "issue_id", "category", "question_en", "question_km",
            "answer_en", "answer_km", "priority", "escalate_to"]
    lines = ["DELETE FROM kb_qa;"]
    for r in records:
        lines.append(f"INSERT INTO kb_qa ({','.join(cols)}) VALUES ({','.join(sql(r[c]) for c in cols)});")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} rows to {out} (skipped {skipped} incomplete rows)")
    print(f"Linked files from media/: {', '.join(sorted(available)) or 'none'}")


if __name__ == "__main__":
    main()
