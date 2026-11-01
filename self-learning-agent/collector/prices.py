"""SOL/USD, refreshed in the background. Used only to express liquidity in USD."""
import asyncio
import json
import time
import urllib.request

COINGECKO = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"


class SolPrice:
    def __init__(self, fixed=None, url=COINGECKO, refresh_s=300, max_age_s=1800):
        self.fixed = fixed
        self.url = url
        self.refresh_s = refresh_s
        self.max_age_s = max_age_s
        self._value, self._at = None, 0.0

    @property
    def value(self):
        """Current price, or None if it was never fetched or has gone stale."""
        if self.fixed is not None:
            return self.fixed
        if self._value is None or time.time() - self._at > self.max_age_s:
            return None
        return self._value

    def _fetch(self):
        with urllib.request.urlopen(self.url, timeout=10) as r:
            return float(json.load(r)["solana"]["usd"])

    async def run(self):
        while self.fixed is None:
            try:
                self._value, self._at = await asyncio.to_thread(self._fetch), time.time()
            except Exception as e:
                print(f"[price] SOL/USD fetch failed: {e}")
            await asyncio.sleep(self.refresh_s)
