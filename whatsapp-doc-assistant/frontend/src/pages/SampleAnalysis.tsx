import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageIntro, PublicLayout } from '../components/PublicLayout';
import { Icon } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { FREE_TRIAL_TENDERS } from '../config/site';
import { formatDate } from '../format';
import { getSampleAnalysis, type SampleAnalysis } from '../api/sample';

// A real analysis of one public tender (backend src/samplePage.js), so a
// visitor can see the output before creating an account. Shown as produced:
// this page only lays it out. Every page number opens that page of the
// tender PDF on the publisher's own website.

function Cite({ page, quote, pdf }: { page: number | null; quote: string | null; pdf: string }) {
  const [open, setOpen] = useState(false);
  if (!page && !quote) return null;
  return (
    <span className="evidence">
      {' '}
      <button type="button" className="evidence-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {page ? `p.${page}` : 'source'}
      </button>
      {open && (
        <span className="evidence-popover">
          {page && <span className="evidence-page">Page {page}</span>}
          {quote && <span className="evidence-quote">{quote}</span>}
          {page && (
            <a className="sample-pdf-link" href={`${pdf}#page=${page}`} target="_blank" rel="noopener noreferrer">
              Open page {page} of the tender PDF <Icon name="arrowRight" />
            </a>
          )}
        </span>
      )}
    </span>
  );
}

export function SampleAnalysisPage() {
  const [data, setData] = useState<SampleAnalysis | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { getSampleAnalysis().then(setData).catch(() => setFailed(true)); }, []);

  return (
    <PublicLayout>
      <PageIntro kicker="Sample analysis" title="A real government tender, analysed by TenderTez">
        <p>
          This is what {PRODUCT_NAME} produced for a public tender
          {data ? <>: {data.about.tender} ({data.pageCount} pages, <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">original PDF</a>)</> : null}.
          Nothing has been edited. Tap a page number to see the text each point came from, or open that page of the PDF.
        </p>
        <p className="sample-note">
          The tender closed on 30 May 2026; it is here only as an example.
          {data && <> Analysed on {formatDate(data.analysedAt)}.</>} Before publishing this page we checked each
          quoted line against the PDF; one list that starts on page 25 continues on page 26.
        </p>
      </PageIntro>

      {failed && (
        <section className="home-section"><div className="home-container"><p className="error-text">The sample could not be loaded. Please refresh the page.</p></div></section>
      )}
      {!data && !failed && (
        <section className="home-section"><div className="home-container"><p className="muted">Loading the sample…</p></div></section>
      )}

      {data && (
        <>
          <section className="home-section">
            <div className="home-container">
              <h2 className="home-heading">Key facts</h2>
              <div className="key-facts sample-key-facts">
                {data.keyFacts.map((f) => (
                  <div key={f.key} className="key-fact">
                    <span className="key-fact-label">{f.label}</span>
                    <span className="key-fact-value">{f.value}<Cite page={f.page} quote={f.quote} pdf={data.sourceUrl} /></span>
                  </div>
                ))}
              </div>

              <h2 className="home-heading sample-heading">Dates</h2>
              <ul className="sample-list">
                {data.dates.map((d) => (
                  <li key={`${d.label}-${d.page}`}><strong>{d.label}:</strong> {d.text}<Cite page={d.page} quote={d.quote} pdf={data.sourceUrl} /></li>
                ))}
              </ul>
            </div>
          </section>

          <section className="home-section home-section-alt">
            <div className="home-container">
              <h2 className="home-heading">Points worth a second look ({data.pointsToCheck.length})</h2>
              <p className="sample-lead">Clauses that can cost a bidder money or the bid, as flagged in the analysis.</p>
              <ul className="sample-list sample-flags">
                {data.pointsToCheck.map((p) => (
                  <li key={p.text}><Icon name="alert" /><span>{p.text}<Cite page={p.page} quote={p.quote} pdf={data.sourceUrl} /></span></li>
                ))}
              </ul>
            </div>
          </section>

          <section className="home-section">
            <div className="home-container">
              <h2 className="home-heading">Submission checklist ({data.checklistCount} items)</h2>
              <p className="sample-lead">Every condition and document the tender asks for, documents first. In your account you tick items off and download it as Excel.</p>
              {data.checklist.map((g, i) => (
                <details key={g.category} className="sample-group" open={i === 0}>
                  <summary>{g.label} <span className="panel-count">{g.items.length}</span></summary>
                  <ul className="sample-list">
                    {g.items.map((item) => (
                      <li key={`${item.label}-${item.page}`}>
                        <strong>{item.label}</strong>{!item.mandatory && <span className="muted"> (optional)</span>}
                        <Cite page={item.page} quote={item.quote} pdf={data.sourceUrl} />
                        {item.detail && <span className="sample-detail">{item.detail}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          <section className="home-section home-section-alt">
            <div className="home-container">
              <h2 className="home-heading">Bill of quantities ({data.boq.length} items)</h2>
              <div className="table-scroll">
                <table className="sample-boq">
                  <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Unit</th><th>Page</th></tr></thead>
                  <tbody>
                    {data.boq.map((b, i) => (
                      <tr key={`${b.item}-${i}`}>
                        <td>{b.item ?? '—'}</td>
                        <td>
                          {b.description}
                          {b.specification && <span className="sample-detail">{b.specification}</span>}
                          {b.remarks && <span className="sample-detail">{b.remarks}</span>}
                        </td>
                        <td>{b.quantity ?? '—'}</td>
                        <td>{b.unit ?? '—'}</td>
                        <td>{b.page ? <a href={`${data.sourceUrl}#page=${b.page}`} target="_blank" rel="noopener noreferrer">p.{b.page}</a> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="home-section">
            <div className="home-container">
              <h2 className="home-heading">What you also get with your own tenders</h2>
              <ul className="feature-points">
                <li><Icon name="check" /><span>Each condition checked against your company profile, with the reason</span></li>
                <li><Icon name="check" /><span>A bid tracker with your deadlines, EMD and bank guarantees</span></li>
                <li><Icon name="check" /><span>Corrigendum check: what an amendment changed, quoted with its page</span></li>
                <li><Icon name="check" /><span>The tender&rsquo;s own annexures drafted as Word files from your details</span></li>
              </ul>
              <Link to="/features" className="home-teaser-link">See every feature <Icon name="arrowRight" /></Link>
            </div>
          </section>
        </>
      )}

      <section className="home-cta">
        <div className="home-container home-cta-inner">
          <h2>Try it on a tender you&rsquo;re bidding for</h2>
          <Link to="/register" className="btn-link btn-accent btn-lg">Start free: {FREE_TRIAL_TENDERS} tenders, no card <Icon name="arrowRight" /></Link>
        </div>
      </section>
    </PublicLayout>
  );
}
