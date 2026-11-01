"""Optional: link buyer wallets by who funded them, via Solana JSON-RPC.

For each wallet, the funder is the sender of the first SOL transfer into it,
found in its oldest transaction. Wallets with a long history (>= history_cap
signatures) are treated as established and left unlinked, and so are funders
with a long history: exchange hot wallets fund thousands of unrelated users,
and counting them as a link would mark ordinary buyers as a cluster.

Needs an RPC endpoint with sensible rate limits (the public mainnet endpoint
throttles hard). Without one, the collector falls back to the bundle heuristic
and says so in each record's `connected_method`.
"""
import asyncio
import json
import urllib.request

ESTABLISHED = "established"


def connected_wallets(creator, buyers, funders, hubs):
    """Pure grouping step. funders: wallet -> funder | ESTABLISHED | None;
    hubs: funders known to be high-volume (exchanges, routers) and ignored."""
    def link(w):
        f = funders.get(w)
        return None if f in (None, ESTABLISHED) or f in hubs else f

    groups = {}
    for w in [creator, *buyers]:
        f = link(w)
        if f is not None:
            groups.setdefault(f, set()).add(w)
    out = set()
    for f, ws in groups.items():
        if len(ws) >= 2 or f == creator:
            out |= ws
    for w in buyers:
        if link(w) == creator or w == link(creator):
            out.add(w)
    out.discard(creator)
    return out


class FundingTracer:
    def __init__(self, rpc_url, concurrency=4, history_cap=1000, timeout_s=10.0):
        self.rpc_url = rpc_url
        self.sem = asyncio.Semaphore(concurrency)
        self.history_cap = history_cap
        self.timeout_s = timeout_s
        self.funders = {}
        self.hubs = set()
        self._checked_hub = set()
        self._tasks = {}

    def _post(self, method, params):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        req = urllib.request.Request(self.rpc_url, body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout_s) as r:
            out = json.load(r)
        if "error" in out:
            raise RuntimeError(out["error"])
        return out["result"]

    async def _rpc(self, method, params):
        async with self.sem:
            return await asyncio.to_thread(self._post, method, params)

    async def _history_len_and_oldest(self, addr):
        sigs = await self._rpc("getSignaturesForAddress", [addr, {"limit": self.history_cap}])
        return len(sigs), (sigs[-1]["signature"] if sigs else None)

    async def _trace(self, wallet):
        try:
            n, oldest = await self._history_len_and_oldest(wallet)
            if n >= self.history_cap:
                return ESTABLISHED
            if oldest is None:
                return None
            tx = await self._rpc("getTransaction", [oldest, {"encoding": "jsonParsed",
                                                             "maxSupportedTransactionVersion": 0}])
            funder = find_funder(tx, wallet)
            if funder and funder not in self._checked_hub:
                self._checked_hub.add(funder)
                fn, _ = await self._history_len_and_oldest(funder)
                if fn >= self.history_cap:
                    self.hubs.add(funder)
            return funder
        except Exception:
            return None  # unknown, never a link

    def start(self, wallet):
        """Begin tracing in the background (idempotent)."""
        if wallet not in self._tasks:
            self._tasks[wallet] = asyncio.ensure_future(self._trace(wallet))

    async def resolve(self, creator, buyers, grace_s):
        """Wait up to grace_s for traces, then group. Returns (connected, complete)."""
        ws = [creator, *buyers]
        for w in ws:
            self.start(w)
        tasks = [self._tasks[w] for w in ws]
        done, pending = await asyncio.wait(tasks, timeout=grace_s) if tasks else (set(), set())
        for w in ws:
            t = self._tasks[w]
            if t.done():
                self.funders[w] = t.result()
        return connected_wallets(creator, buyers, self.funders, self.hubs), not pending


def find_funder(tx, wallet):
    """Sender of the first system transfer into `wallet` in a jsonParsed transaction."""
    if not tx:
        return None
    ixs = list(tx.get("transaction", {}).get("message", {}).get("instructions", []))
    for inner in (tx.get("meta") or {}).get("innerInstructions") or []:
        ixs.extend(inner.get("instructions", []))
    for ix in ixs:
        p = ix.get("parsed")
        if isinstance(p, dict) and p.get("type") in ("transfer", "transferWithSeed", "createAccount"):
            info = p.get("info", {})
            dest = info.get("destination") or info.get("newAccount")
            if dest == wallet and info.get("source"):
                return info["source"]
    return None
