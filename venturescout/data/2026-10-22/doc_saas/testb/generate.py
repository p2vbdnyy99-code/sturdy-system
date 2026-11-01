"""Generate 30 synthetic bank statements (fictional banks/holders, random data) + hidden ground truth.

Usage: python3 generate.py OUT_DIR  -> OUT_DIR/pdf/S01.pdf ... and OUT_DIR/truth/S01.json
Layout families (5 docs each) vary date format, sign convention, number format, columns, page count, wrapping,
repeated headers, carried-forward lines (traps that are NOT transactions), and image-only "scanned" pages.
Seeded for reproducibility.
"""
import json, os, random, sys, datetime, io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image, ImageFilter
import subprocess

OUT = sys.argv[1]
os.makedirs(f"{OUT}/pdf", exist_ok=True); os.makedirs(f"{OUT}/truth", exist_ok=True)
BANKS = ["Northwind Bank", "Contoso Savings", "Fabrikam Credit Union", "Example Mutual", "Tailspin Trust", "Woodgrove Bank"]
DEBITS = ["CARD PURCHASE GROCERY MART", "DIRECT DEBIT CITY WATER", "CARD PURCHASE FUEL STOP", "ONLINE TRANSFER TO SAVINGS",
          "STANDING ORDER RENT", "CARD PURCHASE COFFEE HOUSE", "ATM WITHDRAWAL", "DIRECT DEBIT MOBILE PHONE",
          "CARD PURCHASE HARDWARE DEPOT", "SUBSCRIPTION STREAMING SERVICE", "BANK FEE MONTHLY", "CARD PURCHASE PHARMACY",
          "PAYMENT TO SUPPLIER ACME PARTS LTD INVOICE 4471 REF Q3 MATERIALS ORDER", "INSURANCE PREMIUM HOME AND CONTENTS POLICY 88-2231"]
CREDITS = ["SALARY PAYROLL", "CUSTOMER PAYMENT INVOICE", "REFUND CARD PURCHASE", "INTEREST PAID", "TRANSFER FROM SAVINGS",
           "CASH DEPOSIT BRANCH", "CLIENT REMITTANCE CONSULTING SERVICES PROJECT ALPHA MILESTONE 2"]


def fmt_num(x, family):
    s = f"{abs(x):,.2f}"
    if family == 4:  # European: 1.234,56
        s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return s


def fmt_date(d, family, variant):
    if family == 1: return d.strftime("%d/%m/%Y")
    if family == 2: return d.strftime("%m/%d/%y") if variant % 2 else d.strftime("%m/%d/%Y")
    if family == 3: return d.strftime("%d %b") if variant % 2 else d.strftime("%d %b %Y")  # some without year
    if family == 4: return d.strftime("%d.%m.%Y")
    if family == 5: return d.isoformat()
    return d.strftime("%b %d, %Y")


def make_doc(idx):
    rnd = random.Random(1000 + idx)
    family = (idx - 1) // 5 + 1          # 1..6
    variant = (idx - 1) % 5
    scanned = variant == 4               # last of each family is image-only
    n = rnd.randint(8, 18) if variant < 2 else rnd.randint(25, 45)
    start = datetime.date(2026, rnd.choice([1, 3, 6, 9, 12]), 1)
    if family == 3 and variant % 2: start = datetime.date(2025, 12, 1)   # year rollover without printed year
    bal = round(rnd.uniform(-300, 9000), 2)
    opening = bal
    tx, d = [], start
    for i in range(n):
        d = d + datetime.timedelta(days=rnd.choice([0, 0, 1, 1, 2, 3]))
        if rnd.random() < 0.3:
            amt = round(rnd.uniform(5, 4000), 2); desc = rnd.choice(CREDITS)
        else:
            amt = -round(rnd.choice([rnd.uniform(1, 80), rnd.uniform(20, 1500)]), 2); desc = rnd.choice(DEBITS)
        if i > 2 and rnd.random() < 0.06:  # legitimate identical repeat (dedupe trap)
            desc, amt, d = tx[-1]["description"], tx[-1]["amount"], datetime.date.fromisoformat(tx[-1]["date"])
        bal = round(bal + amt, 2)
        tx.append(dict(date=d.isoformat(), description=desc, amount=amt, balance=bal))
    closing = bal
    has_balance_col = family != 5
    truth = dict(doc=f"S{idx:02d}", family=family, scanned=scanned, opening_balance=opening, closing_balance=closing,
                 transactions=[dict(t, balance=t["balance"] if has_balance_col else None) for t in tx])
    # ---- render
    path = f"{OUT}/pdf/S{idx:02d}.pdf"
    c = canvas.Canvas(path, pagesize=A4); W, H = A4
    rows_per_page = rnd.choice([14, 18, 22]) if family != 6 else 12
    bank = BANKS[(idx + family) % len(BANKS)]

    def header(page):
        c.setFont("Helvetica-Bold", 13); c.drawString(40, H - 50, bank)
        c.setFont("Helvetica", 8.5)
        c.drawString(40, H - 66, f"Account holder: SYNTHETIC TEST ACCOUNT {idx:02d}    Account: XXXX-{1000 + idx}")
        period_end = datetime.date.fromisoformat(tx[-1]["date"])
        c.drawString(40, H - 78, f"Statement period: {start.strftime('%d %B %Y')} to {period_end.strftime('%d %B %Y')}    Page {page}")
        y = H - 100
        if page == 1 or family == 6 or rnd.random() < 0.5:   # repeated headers on some pages
            c.setFont("Helvetica-Bold", 8.5)
            cols = {1: ["Date", "Description", "Debit", "Credit", "Balance"], 2: ["Date", "Description", "Amount", "", "Balance"],
                    3: ["Date", "Details", "Amount", "", "Balance"], 4: ["Datum", "Description", "Debit", "Credit", "Balance"],
                    5: ["Date", "Description", "Amount", "", ""], 6: ["Date", "Description", "Withdrawals", "Deposits", "Balance"]}[family]
            for x, t in zip([40, 110, 360, 430, 500], cols): c.drawString(x, y, t)
            y -= 14
        return y

    page = 1; y = header(page); c.setFont("Helvetica", 8.5)
    if family == 6 or variant != 2:
        c.drawString(110, y, "BALANCE BROUGHT FORWARD" if family != 4 else "OPENING BALANCE")
        c.drawRightString(550, y, fmt_num(opening, family) + (" OD" if opening < 0 and family in (1, 3, 6) else "") if family != 5
                          else ("(" + fmt_num(opening, 5) + ")" if opening < 0 else fmt_num(opening, 5)))
        y -= 13
    for i, t in enumerate(tx):
        if i and i % rows_per_page == 0:
            if family in (1, 6):
                c.drawString(110, y - 4, "BALANCE CARRIED FORWARD"); c.drawRightString(550, y - 4, fmt_num(tx[i - 1]["balance"], family))
            c.showPage(); page += 1; y = header(page); c.setFont("Helvetica", 8.5)
            if family in (1, 6):
                c.drawString(110, y, "BALANCE BROUGHT FORWARD"); c.drawRightString(550, y, fmt_num(tx[i - 1]["balance"], family)); y -= 13
        dd = datetime.date.fromisoformat(t["date"])
        c.drawString(40, y, fmt_date(dd, family, variant))
        desc = t["description"]
        if len(desc) > 38 and family in (1, 4, 6):  # wrapped description
            c.drawString(110, y, desc[:38]); c.drawString(110, y - 10, desc[38:]); extra = 10
        else:
            c.drawString(110, y, desc[:60]); extra = 0
        a = t["amount"]
        if family in (1, 4, 6):
            c.drawRightString(410 if a < 0 else 480, y, fmt_num(a, family))
        elif family == 2:
            c.drawRightString(410, y, ("-" if a < 0 else "") + fmt_num(a, family))
        elif family == 3:
            c.drawRightString(410, y, fmt_num(a, family) + (" DR" if a < 0 else " CR"))
        else:
            c.drawRightString(410, y, ("(" + fmt_num(a, 5) + ")") if a < 0 else fmt_num(a, 5))
        if has_balance_col:
            b = t["balance"]
            if family == 2: bs = ("-" if b < 0 else "") + fmt_num(b, 2)
            elif family == 4: bs = ("-" if b < 0 else "") + fmt_num(b, 4)
            else: bs = fmt_num(b, family) + (" OD" if b < 0 else "")
            c.drawRightString(550, y, bs)
        y -= 13 + extra
    c.setFont("Helvetica-Bold", 8.5)
    clos = fmt_num(closing, family)
    if family == 5: clos = "(" + clos + ")" if closing < 0 else clos
    elif closing < 0: clos = ("-" + clos) if family in (2, 4) else clos + " OD"
    c.drawString(110, y - 6, "CLOSING BALANCE"); c.drawRightString(550, y - 6, clos)
    if family == 5:  # summary box: totals are NOT transactions
        tot_in = sum(t["amount"] for t in tx if t["amount"] > 0); tot_out = -sum(t["amount"] for t in tx if t["amount"] < 0)
        c.setFont("Helvetica", 8.5)
        c.drawString(110, y - 20, f"Total money in {fmt_num(tot_in, 5)}   Total money out {fmt_num(tot_out, 5)}")
    c.save()
    if scanned:  # rasterise each page, slight rotation + blur + noise, rebuild image-only PDF
        tmp = f"{OUT}/pdf/_tmp"; os.makedirs(tmp, exist_ok=True)
        subprocess.run(["pdftoppm", "-r", "110", "-png", path, f"{tmp}/p"], check=True)
        imgs = []
        for f in sorted(os.listdir(tmp)):
            im = Image.open(f"{tmp}/{f}").convert("L").rotate(rnd.uniform(-1.2, 1.2), expand=False, fillcolor=255)
            im = im.filter(ImageFilter.GaussianBlur(0.6))
            px = im.load()
            for _ in range(int(im.size[0] * im.size[1] * 0.004)):
                px[rnd.randrange(im.size[0]), rnd.randrange(im.size[1])] = rnd.choice([0, 255])
            imgs.append(im.convert("RGB")); os.remove(f"{tmp}/{f}")
        imgs[0].save(path, save_all=True, append_images=imgs[1:], resolution=110)
        os.rmdir(tmp)
    json.dump(truth, open(f"{OUT}/truth/S{idx:02d}.json", "w"), indent=1)
    return page


pages = [make_doc(i) for i in range(1, 31)]
print("generated 30 statements; pages per doc:", pages, "total pages:", sum(pages))
