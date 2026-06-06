import json
import re
import openpyxl
from datetime import datetime

wb = openpyxl.load_workbook(r"D:\Code\UserTool\会员充值.xlsx", data_only=True)

NOW = datetime.now()
CURRENT_YEAR = NOW.year
HISTORY_ID = 1

def make_history_id():
    global HISTORY_ID
    hid = f"h_{HISTORY_ID:04d}"
    HISTORY_ID += 1
    return hid

def parse_date(val):
    """Parse date from various formats including edge cases."""
    if val is None:
        return None

    # Already a datetime object
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")

    # Handle numeric values
    if isinstance(val, (int, float)):
        s = str(val)
        # Year-only (2022-2026) - used as section headers, provide default Jan 1
        if re.match(r"^\d{4}$", s):
            year = int(s)
            if 2020 <= year <= 2030:
                return f"{year}-01-01"
        # YYYYM.DD float like 20262.9 (year=2026, month=02, day=09)
        if re.match(r"^\d{4,6}\.\d+$", s):
            parts = s.split(".")
            full = parts[0]
            if len(full) >= 5:
                year = int(full[:4])
                month = int(full[4:])
                day = int(parts[1])
                if 2020 <= year <= 2030 and 1 <= month <= 12 and 1 <= day <= 31:
                    return f"{year}-{month:02d}-{day:02d}"
        # 3-4 digit no-separator integer like 430 (Apr 30) or 1225 (Dec 25)
        if re.match(r"^\d{3,4}$", s) and "." not in s:
            if len(s) == 3:
                m = int(s[0])
                d = int(s[1:])
            else:
                m = int(s[:2])
                d = int(s[2:])
            if 1 <= m <= 12 and 1 <= d <= 31:
                return f"{CURRENT_YEAR}-{m:02d}-{d:02d}"
        # Regular float date like 3.24 or 7.15
        if "." in s:
            parts = s.split(".")
            if len(parts) == 2:
                try:
                    m = int(parts[0])
                    d = int(parts[1])
                    if 1 <= m <= 12 and 1 <= d <= 31:
                        return f"{CURRENT_YEAR}-{m:02d}-{d:02d}"
                except ValueError:
                    pass
        return None

    # String value
    s = str(val).strip()
    if not s or s.lower() in ("none", "c"):
        return None

    # Clean up various separators: Chinese comma/period, backtick, etc.
    s = s.replace("\uff0c", ",").replace("\u3002", ".").replace("`", "").replace("''", "").replace("\uff0e", ".")
    s = s.replace(",", ".")
    # Collapse multiple consecutive dots
    while ".." in s:
        s = s.replace("..", ".")
    s = s.strip(".")

    # ISO date format (e.g., "2026-01-15")
    if "-" in s and re.match(r"^\d{2,4}-\d{1,2}-\d{1,2}", s):
        return s[:10]

    parts = s.split(".")
    if len(parts) == 2:
        p0 = parts[0].strip()
        p1 = parts[1].strip()
        # YYYYM.DD format in string: "20262.9" -> year=2026, month=02, day=09
        if len(p0) >= 5 and p0.isdigit() and p1.isdigit():
            year = int(p0[:4])
            month = int(p0[4:])
            day = int(p1)
            if 2020 <= year <= 2030 and 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year}-{month:02d}-{day:02d}"
        # Regular M.DD format
        try:
            m = int(p0)
            d = int(p1)
            if 1 <= m <= 12 and 1 <= d <= 31:
                return f"{CURRENT_YEAR}-{m:02d}-{d:02d}"
        except ValueError:
            pass

    # Single number (month only without day, e.g., "6") -> default to 1st
    if len(parts) == 1:
        try:
            m = int(parts[0].strip())
            if 1 <= m <= 12:
                return f"{CURRENT_YEAR}-{m:02d}-01"
        except ValueError:
            pass

    return None


def parse_amount(val, rate=10):
    """Parse amount from various formats including edge cases."""
    if val is None:
        return []
    if isinstance(val, (int, float)):
        amt = float(val)
        if amt < 0:  # Negative means deduction
            return [abs(amt)]
        return [amt] if amt > 0 else []

    s = str(val).strip()
    if not s or s.lower() in ("none", "", "0", "0.0"):
        return []

    # Fix letter "O" used as "0" (e.g., "2O" -> "20")
    s_clean = s.replace("O", "0").replace("o", "0")

    # Try plain number first (handles "1 0" as "10" after removing spaces)
    try:
        amt = float(s_clean)
        if amt < 0:
            return [abs(amt)]
        return [amt] if amt > 0 else []
    except ValueError:
        pass

    # Number with space: "1 0" -> 10
    if re.match(r"^\d+\s+\d+$", s_clean):
        try:
            amt = float(s_clean.replace(" ", ""))
            if amt > 0:
                return [amt]
        except ValueError:
            pass

    # "扣N双" / "洗N双" / "欠N双" patterns
    m = re.match(r"(扣|洗|欠)\s*(\d+)\s*双", s)
    if m:
        n = int(m.group(2))
        return [n * rate]

    # Bare "N双" shorthand (no action prefix)
    m = re.match(r"^(\d+)\s*双$", s)
    if m:
        n = int(m.group(1))
        return [n * rate]

    # Strip "元" suffix
    if s_clean.endswith("元"):
        try:
            amt = float(s_clean[:-1])
            if amt > 0:
                return [amt]
        except ValueError:
            pass

    # "折后56" pattern
    m = re.match(r"折后\s*(\d+)", s_clean)
    if m:
        try:
            amt = float(m.group(1))
            if amt > 0:
                return [amt]
        except ValueError:
            pass

    # Comma/Chinese-comma separated amounts: "30，30，25" or "20,20,15"
    if re.search(r"[，,]", s):
        amounts = []
        for part in re.split(r"[，,]+", s):
            part = part.strip()
            if not part:
                continue
            try:
                amt = float(part)
                if amt > 0:
                    amounts.append(amt)
            except ValueError:
                pass
        if amounts:
            return amounts

    # Last resort: extract first number from string
    m = re.search(r"(\d+)", s_clean)
    if m:
        try:
            amt = float(m.group(1))
            if amt > 0:
                return [amt]
        except ValueError:
            pass

    return []


def find_phone(ws):
    for row in ws.iter_rows(min_row=1, max_row=4, max_col=ws.max_column, values_only=True):
        for cell in row:
            if cell is not None:
                s = str(int(cell)) if isinstance(cell, float) else str(cell)
                if re.match(r"^1\d{10}$", s):
                    return s
    return None

def find_card_no(ws):
    for col_idx in range(1, ws.max_column + 1):
        cell = ws.cell(row=2, column=col_idx).value
        if cell is not None and "会员卡号" in str(cell):
            val = ws.cell(row=3, column=col_idx).value
            if val is not None:
                s = str(val).strip()
                if s and re.match(r"^\d{2,6}$", s):
                    return s
            val2 = ws.cell(row=2, column=col_idx + 1).value
            if val2 is not None:
                s2 = str(val2).strip()
                if s2 and re.match(r"^\d{2,6}$", s2):
                    return s2
    return ""

def find_name(ws):
    cell_hdr = ws.cell(row=2, column=1).value
    if cell_hdr is not None and "姓名" in str(cell_hdr):
        val = ws.cell(row=3, column=1).value
        if val is not None:
            s = str(val).strip()
            if s and not re.search(r"[\d.,，]", s) and s not in ("None", ""):
                return s
    val2 = ws.cell(row=3, column=1).value
    if val2 is not None:
        s2 = str(val2).strip()
        skip_words = ("None", "", "充值日期", "姓名", "会员充值消费表", "c", "w3x")
        if s2 and not re.search(r"[\d.,，]", s2) and s2 not in skip_words:
            return s2
    return ""

def find_data_start(ws):
    for r in range(1, min(ws.max_row + 1, 10)):
        cell = ws.cell(row=r, column=1).value
        if cell is not None and "充值日期" in str(cell):
            return r + 1
    return 5

def find_rate_from_description(ws):
    """Extract per-pair rate from initial recharge description, e.g. ''10元每双'' -> 10"""
    data_start = find_data_start(ws)
    # Look at first few data rows for rate info in 备注
    for r in range(data_start, min(data_start + 3, ws.max_row + 1)):
        note = ws.cell(row=r, column=7).value
        if note and isinstance(note, str):
            m = re.search(r"(\d+)\s*元\s*每\s*双", note)
            if m:
                return int(m.group(1))
            m2 = re.search(r"每双\s*(\d+)\s*元", note)
            if m2:
                return int(m2.group(1))
    return 10  # default


users = {}
seen_phones = set()

for sheet_name in wb.sheetnames:
    if sheet_name in ("Sheet1", "Sheet2"):
        continue

    ws = wb[sheet_name]
    if ws.max_row < 5:
        continue

    phone = find_phone(ws)
    if not phone:
        print(f"  SKIP {sheet_name}: no phone found")
        continue

    if phone in seen_phones:
        print(f"  SKIP {sheet_name}: phone {phone} already exists")
        continue
    seen_phones.add(phone)

    card_no = find_card_no(ws)
    name = find_name(ws)
    rate = find_rate_from_description(ws)
    data_start = find_data_start(ws)

    tail = phone[-4:]
    history = []

    for row in ws.iter_rows(min_row=data_start, max_row=ws.max_row, max_col=7, values_only=True):
        if all(c is None for c in row):
            continue

        recharge_date = row[0]
        recharge_amt = row[1]
        bonus_amt = row[2]
        consume_date = row[3]
        consume_amt = row[4]
        remark_note = row[6]

        # Process recharge
        recharge_d = parse_date(recharge_date)
        if recharge_d:
            for amt in parse_amount(recharge_amt):
                history.append({
                    "id": make_history_id(),
                    "type": "add",
                    "amount": round(amt, 2),
                    "description": "充值",
                    "date": recharge_d,
                })
            for bonus in parse_amount(bonus_amt):
                history.append({
                    "id": make_history_id(),
                    "type": "add",
                    "amount": round(bonus, 2),
                    "description": "赠送",
                    "date": recharge_d,
                })

        # Process consumption
        consume_d = parse_date(consume_date)
        if consume_d:
            amounts = parse_amount(consume_amt, rate)
            desc = ""
            if remark_note and str(remark_note).strip() not in ("None", ""):
                desc = str(remark_note).strip()
            for amt in amounts:
                history.append({
                    "id": make_history_id(),
                    "type": "subtract",
                    "amount": round(amt, 2),
                    "description": desc,
                    "date": consume_d,
                })

    if not history:
        print(f"  SKIP {sheet_name}: no valid records")
        continue

    def sort_key(h):
        return h["date"]

    history.sort(key=sort_key)

    for i, h in enumerate(history):
        h["id"] = f"h_{i+1:04d}"

    total = 0
    for h in history:
        if h["type"] == "add":
            total += h["amount"]
        else:
            total -= h["amount"]

    user = {
        "id": phone,
        "phone": phone,
        "tail": tail,
        "amount": round(total, 2),
        "created": NOW.strftime("%Y-%m-%dT%H:%M:%S"),
        "pinned": False,
        "deleted": False,
        "purged": False,
        "remark": name,
        "cardNo": card_no,
        "history": list(reversed(history)),
        "__ts": int(NOW.timestamp() * 1000),
    }

    users[phone] = user
    print(f"  OK {sheet_name}: phone={phone}, name={name}, card={card_no}, records={len(history)}")

payload = {
    "schemaVersion": 2,
    "app": "VIP Manager",
    "exportedAt": NOW.strftime("%Y-%m-%dT%H:%M:%S"),
    "data": {
        "users": users,
        "recentViewed": [],
        "trash": [],
        "logs": [],
    },
    "settings": {
        "usersPerPage": 12,
        "currency": "CNY",
        "theme": "light",
    },
}

output_path = r"D:\Code\UserTool\import_data.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print(f"\nDone! {len(users)} users exported to {output_path}")
