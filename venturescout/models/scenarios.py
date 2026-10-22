"""Conservative / base / optimistic income scenarios for the top-three candidates. ALL inputs are assumptions
unless marked VERIFIED in reports/evidence-ledger.md. Conversion rates appear only as sensitivity grids.

Run: python3 models/scenarios.py
"""
TARGETS = (8000, 10000)   # personal take-home USD/month
TAX = 0.25                # ILLUSTRATIVE effective tax rate only; real rate depends on jurisdiction and structure
FIXED = 100               # domain, email, accounting help, misc (USD/month) - assumption


def pretax(t):
    return t / (1 - TAX)


def jira():
    print("== 1. Jira Cloud reporting app (Atlassian Marketplace; Forge 0% share on first $1M - VERIFIED)")
    # price per paying site per year: VERIFIED observed 100-user tiers p25 $500 / median $790 (niche scan)
    for name, price, forge in (("conservative", 300, 180), ("base", 550, 50), ("optimistic", 840, 20)):
        lo, hi = ((pretax(t) + FIXED + forge) / 0.99 * 12 / price for t in TARGETS)   # 1% FX/bank assumption
        print(f"  {name:12} ${price}/site/yr  -> paying sites {lo:,.0f}-{hi:,.0f}; ARR ${lo*price:,.0f}-${hi*price:,.0f}")
        print("               installs needed if share r of installs pays (HYPOTHESES): " +
              "  ".join(f"r={r:.0%}: {lo/r:,.0f}-{hi/r:,.0f}" for r in (0.05, 0.10, 0.20)))


def doc_saas():
    print("\n== 2. Search-led document-to-spreadsheet micro-SaaS (own site + merchant of record)")
    # MoR fee 5% + $0.50 per transaction is an ASSUMPTION to verify on the chosen MoR's official pricing page.
    for name, price, pages, cost_page, churn in (("conservative", 15, 150, 0.02, 0.10),
                                                 ("base", 29, 100, 0.01, 0.07),
                                                 ("optimistic", 59, 150, 0.005, 0.05)):
        hosting = 150
        unit_net = price * 0.95 - 0.50 - pages * cost_page          # per subscriber per month
        lo, hi = ((pretax(t) + FIXED + hosting) / unit_net for t in TARGETS)
        print(f"  {name:12} ${price}/mo, {pages} pages/mo at ${cost_page}/page, churn {churn:.0%}/mo "
              f"-> net ${unit_net:.2f}/sub; subscribers {lo:,.0f}-{hi:,.0f}; new subs/mo to hold steady {lo*churn:,.0f}-{hi*churn:,.0f}")
        print("               monthly visitors needed for those new subs if visitor->paid = (HYPOTHESES): " +
              "  ".join(f"{c:.1%}: {lo*churn/c:,.0f}-{hi*churn/c:,.0f}" for c in (0.005, 0.01, 0.02)))


def apify():
    print("\n== 3. Lawful pay-per-event Apify utilities (developer gets 80% minus platform cost - VERIFIED)")
    # VERIFIED observed primary-event prices in lawful categories: ~$0.001-$0.02 per event (category scan)
    for name, price, cost_share in (("conservative", 0.002, 0.40), ("base", 0.005, 0.25), ("optimistic", 0.02, 0.10)):
        lo, hi = ((pretax(t) + FIXED) / (0.8 - cost_share) for t in TARGETS)
        print(f"  {name:12} ${price}/event, platform cost {cost_share:.0%} of revenue -> user spend ${lo:,.0f}-${hi:,.0f}/mo "
              f"= {lo/price/1e6:,.1f}M-{hi/price/1e6:,.1f}M billable events/mo")


if __name__ == "__main__":
    print(f"Illustrative tax {TAX:.0%}; pre-tax profit needed ${pretax(TARGETS[0]):,.0f}-${pretax(TARGETS[1]):,.0f}/mo\n")
    jira(); doc_saas(); apify()
