"""Document-to-spreadsheet SaaS: three pricing models x tax scenarios -> paying customers and funnel needs.
Every input is labelled OBSERVED (competitor list price, see reports/document-saas-unit-economics.md) or ASSUMPTION.
Run: python3 models/docsaas_economics.py
"""
TARGETS = (8000, 10000)              # personal take-home USD/month
TAXES = (0.15, 0.25, 0.35)           # ILLUSTRATIVE effective rates only
FIXED = 250                          # ASSUMPTION: hosting, domain, email, monitoring, accounting help, security tooling
MOR_PCT, MOR_FIX = 0.05, 0.50        # ASSUMPTION: merchant-of-record fee; verify on the chosen MoR's pricing page
REFUNDS = 0.03                       # ASSUMPTION: refunds/chargebacks share of revenue
COST_PAGE = {"low": 0.002, "mid": 0.01, "high": 0.03}   # ASSUMPTION: OCR/LLM processing cost per page

MODELS = [  # name, price per transaction, transactions per customer per month, pages per customer per month
    ("Subscription $29/mo (OBSERVED: BankConv Starter $29 monthly / $19 annual)", 29.0, 1, 100),
    ("Pay per document $3 (OBSERVED: BankConv $2.99 per <=10-page document)", 3.0, 4, 30),
    ("Credit pack $0.08/page (OBSERVED: invoicedataextraction.com 1,000 pages $80)", 80.0, 1 / 3, 1000 / 3),
]


def net_per_customer(price, tx_per_month, pages, cost_page):
    revenue = price * tx_per_month
    return revenue * (1 - MOR_PCT - REFUNDS) - MOR_FIX * tx_per_month - pages * cost_page, revenue


if __name__ == "__main__":
    for name, price, txm, pages in MODELS:
        print(f"\n== {name}")
        for usage, c in COST_PAGE.items():
            net, rev = net_per_customer(price, txm, pages, c)
            print(f"  cost/page {usage:4} ${c}: revenue ${rev:.2f}/customer/mo, contribution ${net:.2f} ({net / rev:.0%} margin)")
        net, rev = net_per_customer(price, txm, pages, COST_PAGE["mid"])
        for tax in TAXES:
            lo, hi = ((t / (1 - tax) + FIXED) / net for t in TARGETS)
            print(f"  tax {tax:.0%}: paying customers {lo:,.0f}-{hi:,.0f} (gross ${lo * rev:,.0f}-${hi * rev:,.0f}/mo)")
        lo, hi = ((t / 0.75 + FIXED) / net for t in TARGETS)
        for churn in (0.05, 0.10):
            print(f"  churn {churn:.0%}/mo -> new paying customers needed per month just to hold steady: {lo * churn:,.0f}-{hi * churn:,.0f}")
        print("  monthly visitors to win those replacements at visitor->paid (HYPOTHESES): " +
              "  ".join(f"{cv:.1%}: {lo * 0.10 / cv:,.0f}-{hi * 0.10 / cv:,.0f}" for cv in (0.005, 0.01, 0.02)) + "  (10% churn, 25% tax)")
    print("\nReality check: best verified newcomer month = $458 revenue (Bankstatemently, Stripe via TrustMRR).")
