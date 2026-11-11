"""Regulatory and broker-eligibility gate.

This is a conservative software control, NOT legal advice. It can only ever
*block* or *require the user's own attestation*; it never asserts that a
transaction is lawful. Rules are data so they can be reviewed and updated.

India (jurisdiction "IN") — basis recorded on 2026-11-11:
  * RBI: resident persons may undertake forex transactions only with
    authorised persons and, electronically, only on RBI-authorised ETPs or the
    recognised exchanges (NSE, BSE, MSE); transacting on unauthorised ETPs is
    liable to penal action under FEMA.
  * RBI "Alert List" (https://rbi.org.in/scripts/bs_viewcontent.aspx?Id=4235,
    version "updated as on November 19, 2025") names entities not authorised to
    deal in forex or operate forex ETPs. It includes Exness. The list is
    stated by RBI to be non-exhaustive: absence from it is not authorisation.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .instruments import AssetClass

RBI_ALERT_LIST_URL = "https://rbi.org.in/scripts/bs_viewcontent.aspx?Id=4235"
RBI_ALERT_LIST_VERSION = "2025-11-19"
RULES_REVIEWED_ON = "2026-11-11"

# broker key -> facts used by the gate
BROKER_FACTS: dict[str, dict] = {
    "paper": {"simulated": True},
    "mt5": {"overseas_otc": True, "rbi_alert_list": None,     # depends on the broker behind the terminal
            "note": "Generic MT5 terminal: eligibility depends on the broker the terminal is logged in to."},
    "exness_mt5": {"overseas_otc": True, "rbi_alert_list": True},
    "exness_api": {"overseas_otc": True, "rbi_alert_list": True},
    "binance_spot": {"crypto_exchange": True},
    "binance_usdm": {"crypto_exchange": True, "derivatives": True},
}

OTC_CLASSES = {AssetClass.FOREX_CFD.value, AssetClass.METAL_CFD.value, AssetClass.CRYPTO_CFD.value}


@dataclass
class ComplianceResult:
    status: str                      # ok | attestation_required | blocked
    reasons: list[str] = field(default_factory=list)
    attestation_text: str | None = None
    sources: list[str] = field(default_factory=list)

    @property
    def allowed(self) -> bool:
        return self.status == "ok"

    def to_dict(self):
        return {"status": self.status, "reasons": self.reasons, "attestation_text": self.attestation_text,
                "sources": self.sources, "rules_reviewed_on": RULES_REVIEWED_ON,
                "disclaimer": "Automated conservative check, not legal advice."}


def evaluate(jurisdiction: str, broker_key: str, asset_class: str, attested: bool = False,
             account_type: str = "unknown") -> ComplianceResult:
    facts = BROKER_FACTS.get(broker_key)
    if facts is None:
        return ComplianceResult("blocked", [f"Unknown broker '{broker_key}': no eligibility facts on file."])
    if facts.get("simulated"):
        return ComplianceResult("ok", ["Simulated paper account: no real transaction takes place."])
    jurisdiction = (jurisdiction or "").upper()
    if not jurisdiction:
        return ComplianceResult("blocked", ["Country of residence has not been declared."])

    if jurisdiction == "IN":
        src = [RBI_ALERT_LIST_URL]
        if asset_class in OTC_CLASSES:
            if account_type == "demo":
                return ComplianceResult("attestation_required", [
                    "Demo account with no real funds: connectivity testing only. Real-money trading of this "
                    "product through an overseas broker is blocked for residents of India."],
                    "I confirm this is a DEMO account holding no real money and that I will not fund it.", src)
            reasons = ["Residents of India may undertake forex transactions only with authorised persons and on "
                       "RBI-authorised electronic trading platforms or recognised exchanges (NSE, BSE, MSE). "
                       "Leveraged forex / gold / crypto CFDs through an overseas broker are outside that framework."]
            if facts.get("rbi_alert_list"):
                reasons.append(f"This broker is named on the RBI Alert List of unauthorised entities "
                               f"(version {RBI_ALERT_LIST_VERSION}).")
            elif facts.get("rbi_alert_list") is None:
                reasons.append("The RBI Alert List is not exhaustive; not being listed does not make a platform "
                               "authorised.")
            return ComplianceResult("blocked", reasons, None, src)
        if facts.get("crypto_exchange"):
            text = ("I confirm that (1) I have verified this exchange is currently registered with FIU-IND as a "
                    "Virtual Digital Asset service provider, (2) I will fund it only through lawful channels, and "
                    "(3) I understand the Indian tax treatment of virtual digital assets applies to my trades.")
            reasons = ["Crypto-asset trading by Indian residents is not covered by the RBI forex framework but "
                       "carries its own registration and tax requirements, which you must verify yourself."]
            if facts.get("derivatives"):
                reasons.append("Crypto derivatives add leverage and liquidation risk and may not be offered to "
                               "Indian residents by this venue; verify before use.")
            return ComplianceResult("ok" if attested else "attestation_required", reasons, text, [])
        return ComplianceResult("blocked", ["No rule covers this product for India; blocked by default."])

    text = (f"I confirm that I am resident in {jurisdiction}, that trading this product with this broker is lawful "
            f"for me there, and that the broker is authorised to offer it to me.")
    return ComplianceResult("ok" if attested else "attestation_required",
                            [f"No built-in rule set for {jurisdiction}; your own verification is required."], text)
