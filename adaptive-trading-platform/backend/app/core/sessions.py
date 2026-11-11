"""Trading sessions. Windows are defined in a wall-clock timezone (IST by
default, as IST is the display timezone) and may instead be anchored to the
market's own timezone so that they follow London / New York daylight saving."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

IST = ZoneInfo("Asia/Kolkata")
NY = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class SessionDef:
    key: str
    name: str
    start: time
    end: time
    tz: str = "Asia/Kolkata"

    def local(self, index: pd.DatetimeIndex) -> pd.DatetimeIndex:
        return index.tz_convert(self.tz)

    def mask(self, index: pd.DatetimeIndex) -> np.ndarray:
        loc = self.local(index)
        minutes = loc.hour * 60 + loc.minute
        s = self.start.hour * 60 + self.start.minute
        e = self.end.hour * 60 + self.end.minute
        if s < e:
            return np.asarray((minutes >= s) & (minutes < e))
        return np.asarray((minutes >= s) | (minutes < e))

    def day_key(self, index: pd.DatetimeIndex) -> np.ndarray:
        """Integer id of the session-local calendar day (YYYYMMDD)."""
        loc = self.local(index)
        return np.asarray(loc.year * 10000 + loc.month * 100 + loc.day)

    def minutes_from_start(self, index: pd.DatetimeIndex) -> np.ndarray:
        loc = self.local(index)
        return np.asarray(loc.hour * 60 + loc.minute) - (self.start.hour * 60 + self.start.minute)

    def window_in_ist(self, on: datetime) -> tuple[datetime, datetime]:
        d = on.astimezone(ZoneInfo(self.tz)).date()
        z = ZoneInfo(self.tz)
        st = datetime.combine(d, self.start, z)
        en = datetime.combine(d, self.end, z)
        if en <= st:
            en += timedelta(days=1)
        return st.astimezone(IST), en.astimezone(IST)

    def is_active(self, now: datetime) -> bool:
        return bool(self.mask(pd.DatetimeIndex([pd.Timestamp(now).tz_convert("UTC")]))[0])


# Initial research windows from the specification (fixed IST wall clock).
DEFAULT_SESSIONS: dict[str, SessionDef] = {
    "asia": SessionDef("asia", "Asian", time(8, 0), time(12, 0)),
    "london": SessionDef("london", "London", time(13, 0), time(17, 0)),
    "newyork": SessionDef("newyork", "New York", time(18, 0), time(23, 0)),
}

# Alternative presets anchored to the market's own clock (follow DST).
DST_ANCHORED_SESSIONS: dict[str, SessionDef] = {
    "asia": SessionDef("asia", "Asian", time(8, 0), time(12, 0)),  # IST has no DST
    "london": SessionDef("london", "London", time(8, 0), time(12, 0), "Europe/London"),
    "newyork": SessionDef("newyork", "New York", time(8, 30), time(13, 30), "America/New_York"),
}


def session_from_dict(d: dict) -> SessionDef:
    h1, m1 = (int(x) for x in d["start"].split(":"))
    h2, m2 = (int(x) for x in d["end"].split(":"))
    return SessionDef(d["key"], d.get("name", d["key"]), time(h1, m1), time(h2, m2),
                      d.get("tz", "Asia/Kolkata"))


def session_to_dict(s: SessionDef, now: datetime | None = None) -> dict:
    out = {"key": s.key, "name": s.name, "start": s.start.strftime("%H:%M"),
           "end": s.end.strftime("%H:%M"), "tz": s.tz}
    if now is not None:
        st, en = s.window_in_ist(now)
        out |= {"active": s.is_active(now), "ist_start": st.strftime("%H:%M"),
                "ist_end": en.strftime("%H:%M")}
    return out


def market_open(trades_weekend: bool, ts: datetime) -> bool:
    """FX / metals week: Sunday 17:00 to Friday 17:00 New York time."""
    if trades_weekend:
        return True
    ny = ts.astimezone(NY)
    wd, hm = ny.weekday(), ny.hour * 60 + ny.minute
    if wd == 5:
        return False
    if wd == 4 and hm >= 17 * 60:
        return False
    if wd == 6 and hm < 17 * 60:
        return False
    return True


def rollovers_between(start: datetime, end: datetime) -> int:
    """Number of swap nights charged between two instants (17:00 New York
    rollover, triple on Wednesday, none on Saturday/Sunday)."""
    if end <= start:
        return 0
    s, e = start.astimezone(NY), end.astimezone(NY)
    day = s.date()
    nights = 0
    while day <= e.date():
        ro = datetime.combine(day, time(17, 0), NY)
        if s < ro <= e and ro.weekday() < 5:
            nights += 3 if ro.weekday() == 2 else 1
        day += timedelta(days=1)
    return nights
