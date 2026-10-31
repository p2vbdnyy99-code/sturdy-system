import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { getInsights, type Insights, type InsightsRange } from '../api/insights';
import { ApiError } from '../api/client';
import { Icon, type IconName } from '../components/Icon';
import { ago, compact, delta, linePaths, niceMax, stepRate, xAt, yAt } from '../insights/chart';

// The founder's live dashboard ("mission control"): visits, sign-ups, uploads,
// analyses and plans, refreshed every 30 seconds from GET /bidpilot/insights.
// Only admin accounts reach it (the rail link and the API both check). Charts
// are inline SVG with presentation attributes, so they stay within the CSP.
// Colours (index.css .ins-*): saffron #d96f0c and blue #1f8fd0 on #0b1a2e,
// validated for the dark band, contrast and colour-blind separation.

const REFRESH_MS = 30_000;
const RANGES: InsightsRange[] = [7, 30, 90];

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function InsightsPage() {
  const [days, setDays] = useState<InsightsRange>(30);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (range: InsightsRange) => {
    setRefreshing(true);
    try {
      const next = await getInsights(range);
      setData(next);
      setError(null);
      setNow(Date.parse(next.generatedAt) || Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setForbidden(true);
      else setError(err instanceof Error ? err.message : 'Could not load the numbers.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // First load right after this render, then every 30 seconds.
    const first = setTimeout(() => { void load(days); }, 0);
    const timer = setInterval(() => { void load(days); }, REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [days, load]);

  if (forbidden) {
    return <div className="ins ins-empty"><p>This page is only for the TenderTez team.</p></div>;
  }

  const cur = data?.totals.current;
  const prev = data?.totals.previous;
  const s = data?.series ?? [];

  return (
    <div className="ins">
      <header className="ins-head">
        <div>
          <p className="ins-kicker">Mission control</p>
          <h1 className="ins-title">TenderTez live</h1>
        </div>
        <div className="ins-live" aria-live="polite">
          <span className="ins-pulse" aria-hidden="true" />
          <span className="ins-live-label">Live</span>
          <span className="ins-live-value">{data ? data.live.visitors_now : '–'}</span>
          <span className="ins-live-note">
            on the site in the last {data?.live.minutes ?? 5} min · {data ? `${data.live.visitors_today} today` : ''}
          </span>
        </div>
      </header>

      <div className="ins-toolbar" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r} type="button" className={`ins-range${r === days ? ' is-active' : ''}`} aria-pressed={r === days} onClick={() => setDays(r)}>
            {r} days
          </button>
        ))}
        <span className="ins-updated">
          {refreshing ? 'Updating…' : data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString('en-GB')} · refreshes every 30 s` : 'Loading…'}
        </span>
      </div>

      {error && <p className="ins-error" role="alert"><Icon name="alert" /> {error}</p>}

      {data && cur && prev && (
        <div className={`ins-body${refreshing ? ' is-refreshing' : ''}`}>
          <section className="ins-hero" aria-label="Paying customers">
            <p className="ins-hero-label">Paying customers</p>
            <p className="ins-hero-value">{data.paid.companies}</p>
            <p className="ins-hero-note">
              {data.paid.companies
                ? `${rupees(data.paid.monthlyListPrice)} a month at list price · ${data.paid.byPlan.map((p) => `${p.companies} ${p.plan}`).join(', ')}`
                : 'No active paid plan yet. Your own accounts are not counted.'}
            </p>
          </section>

          <section className="ins-kpis" aria-label={`Last ${data.days} days`}>
            <Kpi label="Visitors" value={cur.visitors} previous={prev.visitors} values={s.map((d) => d.visitors)} />
            <Kpi label="Sign-ups" value={cur.signups} previous={prev.signups} values={s.map((d) => d.signups)} />
            <Kpi label="Tenders uploaded" value={cur.uploads} previous={prev.uploads} values={s.map((d) => d.uploads)} />
            <Kpi label="Analyses done" value={cur.analyses} previous={prev.analyses} values={s.map((d) => d.analyses)} />
          </section>

          {(cur.waiting > 0 || cur.failed > 0) && (
            <p className="ins-alert" role="status">
              <Icon name="alert" />
              <span>
                <strong>Activation gap:</strong> {cur.waiting} uploaded {cur.waiting === 1 ? 'tender is' : 'tenders are'} waiting for
                Analyze and {cur.failed} failed in these {data.days} days. These users need a nudge.
              </span>
            </p>
          )}

          <div className="ins-grid">
            <Card title="Visitors per day" className="ins-span-2" note="Hover or use the arrow keys for each day's numbers">
              <VisitorsChart series={s} />
            </Card>
            <Card title="Funnel" note={`Last ${data.days} days; your own accounts left out`}>
              <Funnel funnel={data.funnel} paid={data.paid.companies} />
            </Card>
            <Card title="Activity per day" note="Sign-ups, uploads and analyses (each on its own scale)">
              <MiniColumns label="Sign-ups" series={s} pick={(d) => d.signups} />
              <MiniColumns label="Uploads" series={s} pick={(d) => d.uploads} />
              <MiniColumns label="Analyses" series={s} pick={(d) => d.analyses} />
            </Card>
            <Card title="Where visitors came from"><BarList rows={data.sources} /></Card>
            <Card title="Campaigns" note="From post links (source.campaign)"><BarList rows={data.campaigns} empty="No campaign visits yet." /></Card>
            <Card title="Top pages"><BarList rows={data.pages} /></Card>
            <Card title="Search and AI crawlers" note="Requests by crawler name (a user agent can be faked)">
              <BarList rows={data.crawlers.bots.map((b) => ({ label: `${b.label} · last ${b.last_day}`, visitors: b.hits }))} empty="No crawler requests counted yet." />
            </Card>
            <Card title="Pages crawlers read">
              <BarList rows={data.crawlers.pages.map((p) => ({ label: p.label, visitors: p.hits }))} empty="No crawler requests counted yet." />
            </Card>
            <Card title="Latest activity" note="Last 30 days">
              <Activity items={data.activity} now={now} />
            </Card>
          </div>

          <Card title="Accounts" note="Newest activity first; your own accounts are listed last">
            <Accounts accounts={data.accounts} now={now} />
          </Card>

          <details className="ins-details">
            <summary>Daily numbers as a table</summary>
            <DailyTable series={s} />
          </details>
        </div>
      )}
    </div>
  );
}

function Card({ title, note, className = '', children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`ins-card ${className}`.trim()}>
      <header className="ins-card-head">
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, previous, values }: { label: string; value: number; previous: number; values: number[] }) {
  const d = delta(value, previous);
  return (
    <div className="ins-kpi">
      <p className="ins-kpi-label">{label}</p>
      <p className="ins-kpi-value">{compact(value)}</p>
      <p className={`ins-kpi-delta is-${d.dir}`}>{d.text} <span>vs previous period</span></p>
      <Spark values={values} />
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 160;
  const h = 36;
  const { line, area } = linePaths(values, { left: 2, right: w - 4, top: 4, bottom: h - 3 });
  const top = niceMax(Math.max(0, ...values));
  const last = values.length ? values[values.length - 1] : 0;
  return (
    <svg className="ins-spark" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} className="ins-area" />
      <path d={line} className="ins-line" />
      {values.length > 0 && <circle cx={w - 4} cy={yAt(last, top, h - 3, 4)} r={3} className="ins-dot" />}
    </svg>
  );
}

function VisitorsChart({ series }: { series: Insights['series'] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const h = 240;
  const box = { left: 36, right: width - 12, top: 16, bottom: h - 28 };
  const values = series.map((d) => d.visitors);
  const top = niceMax(Math.max(0, ...values));
  const { line, area } = linePaths(values, box, top);
  const ticks = [0, top / 2, top];
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor((box.right - box.left) / 70))));

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const n = series.length;
    if (n === 0) return;
    const i = Math.round(((x - box.left) / Math.max(1, box.right - box.left)) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const n = series.length;
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
  }

  const d = active !== null ? series[active] : null;
  const ax = active !== null ? xAt(active, series.length, box.left, box.right) : 0;
  const tipW = 168;
  const tipX = ax + 12 + tipW > box.right ? ax - 12 - tipW : ax + 12;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div ref={wrapRef} className="ins-chart">
      <svg
        width={width} height={h} role="img" tabIndex={0}
        aria-label={`Visitors per day over ${series.length} days, ${total} in total. Use the arrow keys to read each day.`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)} onFocus={() => setActive(series.length - 1)} onBlur={() => setActive(null)} onKeyDown={onKey}
      >
        <defs>
          <linearGradient id="ins-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d96f0c" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#d96f0c" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={box.left} x2={box.right} y1={yAt(t, top, box.bottom, box.top)} y2={yAt(t, top, box.bottom, box.top)} className={t === 0 ? 'ins-axis' : 'ins-grid-line'} />
            <text x={box.left - 8} y={yAt(t, top, box.bottom, box.top) + 4} className="ins-tick" textAnchor="end">{compact(t)}</text>
          </g>
        ))}
        {series.map((day, i) => (i === series.length - 1 || (i % labelEvery === 0 && series.length - 1 - i >= labelEvery * 0.75)) && (
          <text key={day.day} x={xAt(i, series.length, box.left, box.right)} y={h - 8} className="ins-tick" textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}>
            {dayLabel(day.day)}
          </text>
        ))}
        <path d={area} fill="url(#ins-fade)" />
        <path d={line} className="ins-line ins-line-main" />
        {values.length > 0 && (
          <circle cx={box.right} cy={yAt(values[values.length - 1], top, box.bottom, box.top)} r={4.5} className="ins-dot ins-dot-ring" />
        )}
        {d && (
          <g className="ins-cross">
            <line x1={ax} x2={ax} y1={box.top} y2={box.bottom} className="ins-cross-line" />
            <circle cx={ax} cy={yAt(d.visitors, top, box.bottom, box.top)} r={4.5} className="ins-dot ins-dot-ring" />
            <g transform={`translate(${tipX},${box.top})`}>
              <rect width={tipW} height={112} rx={8} className="ins-tip" />
              <text x={12} y={20} className="ins-tip-title">{dayLabel(d.day)}</text>
              {([['Visitors', d.visitors], ['Page views', d.views], ['Sign-ups', d.signups], ['Uploads', d.uploads], ['Analyses', d.analyses]] as const).map(([k, v], j) => (
                <g key={k}>
                  <text x={12} y={40 + j * 16} className="ins-tip-key">{k}</text>
                  <text x={tipW - 12} y={40 + j * 16} className="ins-tip-value" textAnchor="end">{v}</text>
                </g>
              ))}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

function MiniColumns({ label, series, pick }: { label: string; series: Insights['series']; pick: (d: Insights['series'][number]) => number }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(300);
  const values = series.map(pick);
  const total = values.reduce((a, b) => a + b, 0);
  const h = 54;
  const top = niceMax(Math.max(0, ...values));
  const slot = (width - 4) / Math.max(1, values.length);
  const bw = Math.max(2, Math.min(24, slot - 2));
  return (
    <div ref={wrapRef} className="ins-mini">
      <p className="ins-mini-label"><span>{label}</span><strong>{total}</strong></p>
      <svg width={width} height={h} role="img" aria-label={`${label}: ${total} in ${values.length} days`}>
        <line x1={0} x2={width} y1={h - 1} y2={h - 1} className="ins-axis" />
        {values.map((v, i) => {
          const bh = v > 0 ? Math.max(3, ((h - 6) * v) / top) : 0;
          return bh > 0 && (
            <rect key={series[i].day} x={2 + i * slot + (slot - bw) / 2} y={h - 1 - bh} width={bw} height={bh} rx={Math.min(4, bw / 2)} className="ins-col">
              <title>{`${dayLabel(series[i].day)}: ${v} ${label.toLowerCase()}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function Funnel({ funnel, paid }: { funnel: Insights['funnel']; paid: number }) {
  const steps: Array<[string, number]> = [
    ['Visitors (per day)', funnel.visitors], ['Opened sign-up', funnel.saw_signup], ['Signed up', funnel.signups],
    ['Uploaded a tender', funnel.uploaded], ['Got an analysis', funnel.analysed], ['Paying now', paid],
  ];
  const max = Math.max(1, ...steps.map(([, v]) => v));
  return (
    <ol className="ins-funnel">
      {steps.map(([label, v], i) => (
        <li key={label}>
          <div className="ins-funnel-row">
            <span>{label}</span>
            <span><strong>{compact(v)}</strong>{i > 0 && <em>{stepRate(v, steps[i - 1][1])}</em>}</span>
          </div>
          <svg width="100%" height={10} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <rect x={0} y={0} width={100} height={10} rx={3} className="ins-track" />
            {v > 0 && <rect x={0} y={0} width={Math.max(1.5, (100 * v) / max)} height={10} rx={3} className="ins-bar" />}
          </svg>
        </li>
      ))}
    </ol>
  );
}

function BarList({ rows, empty = 'Nothing yet.' }: { rows: Array<{ label: string; visitors: number }>; empty?: string }) {
  if (rows.length === 0) return <p className="ins-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <ul className="ins-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="ins-funnel-row"><span className="ins-ellipsis">{r.label}</span><strong>{r.visitors}</strong></div>
          <svg width="100%" height={6} viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
            <rect x={0} y={0} width={100} height={6} rx={3} className="ins-track" />
            <rect x={0} y={0} width={Math.max(1.5, (100 * r.visitors) / max)} height={6} rx={3} className="ins-bar ins-bar-blue" />
          </svg>
        </li>
      ))}
    </ul>
  );
}

const KIND: Record<Insights['activity'][number]['kind'], { icon: IconName; text: string; tone: string }> = {
  signup: { icon: 'users', text: 'signed up', tone: 'is-good' },
  upload: { icon: 'upload', text: 'uploaded a tender', tone: 'is-info' },
  analysed: { icon: 'check', text: 'got an analysis', tone: 'is-good' },
  failed: { icon: 'alert', text: 'analysis failed', tone: 'is-bad' },
};

function Activity({ items, now }: { items: Insights['activity']; now: number }) {
  if (items.length === 0) return <p className="ins-muted">No activity in the last 30 days.</p>;
  return (
    <ul className="ins-feed">
      {items.map((a, i) => (
        <li key={`${a.kind}-${a.at}-${i}`} className={KIND[a.kind].tone}>
          <span className="ins-feed-icon"><Icon name={KIND[a.kind].icon} /></span>
          <span className="ins-feed-text"><strong>{a.company}</strong> {KIND[a.kind].text}</span>
          <time dateTime={a.at}>{ago(a.at, now)}</time>
        </li>
      ))}
    </ul>
  );
}

function planText(a: Insights['accounts'][number]['allowance']) {
  if (!a) return 'Unlimited';
  if (a.kind === 'trial') return `Trial ${a.used}/${a.limit}`;
  if (a.kind === 'plan') return `${a.planName} ${a.used}/${a.limit}`;
  return `${a.planName} ended`;
}

function Accounts({ accounts, now }: { accounts: Insights['accounts']; now: number }) {
  if (accounts.length === 0) return <p className="ins-muted">No accounts yet.</p>;
  return (
    <div className="ins-table-wrap">
      <table className="ins-table">
        <thead>
          <tr>
            <th scope="col">Company</th><th scope="col">Contact</th><th scope="col">Signed up</th>
            <th scope="col" className="num">Uploads</th><th scope="col" className="num">Analysed</th>
            <th scope="col" className="num">Not analysed</th><th scope="col" className="num">Failed</th>
            <th scope="col">Plan</th><th scope="col">Profile</th><th scope="col">Last active</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className={a.internal ? 'is-internal' : ''}>
              <th scope="row">{a.name}{a.internal && <span className="ins-tag">yours</span>}</th>
              <td className="ins-ellipsis">{a.contact ?? '–'}</td>
              <td>{new Date(a.signedUpAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
              <td className="num">{a.uploads}</td><td className="num">{a.analysed}</td>
              <td className={`num${a.notAnalysed > 0 && !a.internal ? ' is-warn' : ''}`}>{a.notAnalysed}</td>
              <td className={`num${a.failed > 0 && !a.internal ? ' is-bad' : ''}`}>{a.failed}</td>
              <td>{planText(a.allowance)}</td>
              <td>{a.hasProfile ? 'Started' : 'None'}</td>
              <td>{ago(a.lastActivity, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({ series }: { series: Insights['series'] }) {
  return (
    <div className="ins-table-wrap">
      <table className="ins-table">
        <thead>
          <tr><th scope="col">Day</th><th scope="col" className="num">Visitors</th><th scope="col" className="num">Page views</th><th scope="col" className="num">Sign-ups</th><th scope="col" className="num">Uploads</th><th scope="col" className="num">Analyses</th></tr>
        </thead>
        <tbody>
          {[...series].reverse().map((d) => (
            <tr key={d.day}>
              <th scope="row">{dayLabel(d.day)}</th>
              <td className="num">{d.visitors}</td><td className="num">{d.views}</td><td className="num">{d.signups}</td>
              <td className="num">{d.uploads}</td><td className="num">{d.analyses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
