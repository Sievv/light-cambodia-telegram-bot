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


if __name__ == "__main__":
    main()
