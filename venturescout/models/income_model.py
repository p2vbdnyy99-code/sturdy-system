"""Income and Forge-cost model for a Jira Cloud reporting app. Every input below is an ASSUMPTION unless noted.

Verified inputs (sources in reports/2026-10-21-jira-reports-deep-dive.md):
  - Forge revenue share: 0% on first $1M lifetime Forge revenue (eligible Forge-only apps), then 17%.
  - Forge pricing: 200,000 GB-s/month free per app, then $0.000025/GB-s; KVS writes 0.1 GB free then $1.090/GB;
    SQL storage 730 GB-hours free then $0.0007685/GB-hour; default function memory 512 MB.
Run: python3 income_model.py
"""

TARGETS = (8000, 10000)          # personal take-home, USD/month
PRICES = (150, 300, 550, 840)    # USD per paying site per year (observed Marketplace price points, see report)
TAX = (0.15, 0.25, 0.35)         # effective tax placeholders, NOT your rate; confirm with a CA
FX_BANK = 0.01                   # hypothesis: inward-remittance FX spread + bank charges as share of revenue
FIXED = 100                      # hypothesis: domain, custom-domain email, accounting help, misc (USD/month)

# Forge usage hypotheses
MEM_GB = 0.5                     # default 512 MB
FREE_GBS, GBS_PRICE = 200_000, 0.000025
KVS_FREE_GB, KVS_WRITE = 0.1, 1.090
SQL_FREE_GBH, SQL_GBH = 730, 0.0007685


def forge_cost(sites, viewers, loads_per_day, secs_per_load, snapshot_secs, snap_kb, stored_mb):
    days = 22
    gbs = sites * viewers * loads_per_day * days * secs_per_load * MEM_GB   # gadget/report renders
    gbs += sites * snapshot_secs * MEM_GB * 30                              # nightly history snapshot job
    compute = max(0, gbs - FREE_GBS) * GBS_PRICE
    kvs_gb = sites * snap_kb * 30 / 1e6
    kvs = max(0, kvs_gb - KVS_FREE_GB) * KVS_WRITE
    sql_gbh = sites * stored_mb / 1000 * 730
    sql = max(0, sql_gbh - SQL_FREE_GBH) * SQL_GBH
    return gbs, compute + kvs + sql


def gross_needed(target, tax, forge):
    return (target / (1 - tax) + FIXED + forge) / (1 - FX_BANK)


if __name__ == "__main__":
    print("== Forge monthly cost scenarios (hypothetical usage) ==")
    scen = [("50 sites, light", 50, 10, 3, 2, 30, 20, 5),
            ("300 sites, base", 300, 20, 5, 2, 60, 50, 10),
            ("300 sites, heavy", 300, 40, 10, 5, 120, 100, 25),
            ("3,000 installs (free wedge)", 3000, 15, 3, 2, 60, 50, 10),
            ("3,000 installs, heavy", 3000, 30, 8, 5, 120, 100, 25)]
    for name, *args in scen:
        gbs, usd = forge_cost(*args)
        print(f"{name:30} {gbs/1e6:6.2f}M GB-s  ≈ ${usd:,.0f}/month")

    print("\n== Paying sites needed (Forge 0% share; forge cost $50/mo assumed) ==")
    print("price/yr  tax  take-home  gross/mo  ARR        sites   new sites/mo at 2%/mo churn")
    for price in PRICES:
        for tax in TAX:
            for t in TARGETS:
                g = gross_needed(t, tax, 50)
                sites = g * 12 / price
                print(f"${price:<7} {tax:.0%}  ${t:,}    ${g:,.0f}   ${g*12:,.0f}  {sites:6,.0f}   {sites*0.02:4.0f}")
        print()

    print("== Sensitivity: installs needed if a share r of installs pays (HYPOTHESES, not measured rates) ==")
    for price in PRICES:
        lo = gross_needed(8000, 0.25, 50) * 12 / price
        hi = gross_needed(10000, 0.25, 50) * 12 / price
        row = "  ".join(f"r={r:.0%}: {lo/r:,.0f}–{hi/r:,.0f}" for r in (0.02, 0.05, 0.10, 0.20))
        print(f"${price}/yr ({lo:,.0f}–{hi:,.0f} sites at 25% tax)  {row}")
