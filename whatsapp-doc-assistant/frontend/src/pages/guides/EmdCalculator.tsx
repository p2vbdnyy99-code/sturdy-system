import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GuideBridge, GuideLayout, GuideQuestion, type Source } from './GuideLayout';
import { SAMPLE_EXCERPT, SAMPLE_SECTIONS } from '../../sampleExcerpt';
import { formatRupees, parseRupees, percentOf } from '../../guides/emdCalc';

// A calculator, not a rule: it multiplies the figures the reader types. The
// ranges it mentions are the ones the EMD guide quotes from the same sources
// (GFR Rules 170 and 171 as updated to 31.01.2026; Rule 171(i) as amended by
// DoE OM F.1/2/2023-PPD of 01.01.2024), read in full on this guide's
// `checked` date. It starts on the AIIMS Bhubaneswar example from the EMD
// guide so the server-rendered page shows a real, checkable sum.
const SOURCES: Source[] = [
  {
    name: 'Department of Expenditure, General Financial Rules 2017, updated up to 31 January 2026',
    url: 'https://doe.gov.in/files/circulars_document/GFRupdatedupto31012026.pdf',
    note: 'Rule 170: bid security ordinarily 2% to 5% of the estimated value, valid 45 days beyond the bid validity; Rule 171: performance security',
  },
  {
    name: 'Department of Expenditure, OM No. F.1/2/2023-PPD, 1 January 2024: amendment to Rule 171(i)',
    url: 'https://doe.gov.in/files/circulars_document/Amendment_in_General_Financial_Rules_2017_Rule_171_i_Performance_Security_Regarding.pdf',
    note: 'performance security of 3% to 5% for goods and services; 3% to 10% with security deposit for works',
  },
  {
    name: 'AIIMS Bhubaneswar, NIT No. AIIMS/BBSR/ENGG./ELECT./11/2026',
    url: 'https://aiimsbhubaneswar.nic.in/wp-content/uploads/2026/05/NIT11.pdf',
    note: 'the example the calculator starts on: estimated cost Rs. 40,35,586.00, EMD 2%, performance guarantee 5%',
  },
];

const EXAMPLE = { value: '40,35,586.00', emd: '2', ps: '5' };
const TABLE_VALUES = [500000, 1000000, 2500000, 5000000, 10000000, 50000000];
const TABLE_RATES = [2, 3, 5];

const parsePercent = (s: string): number | null => {
  const n = Number(String(s).replace('%', '').trim());
  return String(s).trim() !== '' && Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

function Calculator() {
  const [value, setValue] = useState(EXAMPLE.value);
  const [emd, setEmd] = useState(EXAMPLE.emd);
  const [ps, setPs] = useState(EXAMPLE.ps);
  const amount = parseRupees(value);
  const emdPct = parsePercent(emd);
  const psPct = parsePercent(ps);
  const isExample = value === EXAMPLE.value && emd === EXAMPLE.emd && ps === EXAMPLE.ps;
  return (
    <div className="emd-calc">
      <div className="emd-calc-inputs">
        <label className="field">
          Estimated value or cost in the tender (Rs.)
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          EMD % in the tender
          <input inputMode="decimal" value={emd} onChange={(e) => setEmd(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          Performance security % in the tender
          <input inputMode="decimal" value={ps} onChange={(e) => setPs(e.target.value)} autoComplete="off" />
        </label>
      </div>
      <div className="emd-calc-results" aria-live="polite">
        {amount === null ? (
          <p className="error-text">Enter the value as a number, for example 25,00,000.</p>
        ) : (
          <dl>
            <div>
              <dt>EMD{emdPct !== null && ` at ${emdPct}%`}</dt>
              <dd>{emdPct === null ? 'Enter a percentage' : `Rs. ${formatRupees(percentOf(amount, emdPct))}`}</dd>
            </div>
            <div>
              <dt>Performance security{psPct !== null && ` at ${psPct}%`}</dt>
              <dd>{psPct === null ? 'Enter a percentage' : `Rs. ${formatRupees(percentOf(amount, psPct))}`}</dd>
            </div>
          </dl>
        )}
        <p className="emd-calc-note">
          {isExample
            ? 'These starting figures are from a real AIIMS Bhubaneswar tender. Type your own tender’s figures.'
            : 'Performance security is a percentage of the contract value, so this figure is an estimate until the contract is awarded.'}
        </p>
      </div>
    </div>
  );
}

export function EmdCalculatorPage() {
  return (
    <GuideLayout
      slug="emd-calculator"
      sources={SOURCES}
      answer={<p>
        EMD is the percentage the tender states, applied to the value the tender names. Under Rule 170 of the General
        Financial Rules 2017, central government buyers ordinarily set it between 2% and 5% of the estimated value.
        Type the value and the percentage from your tender to get the rupee amount. The tender&rsquo;s own clause
        decides the amount, so use its figures, not a typical rate.
      </p>}
      bridge={
        <GuideBridge
          title="Find the EMD figures in your tender"
          lines={[{ label: 'EMD', ...SAMPLE_EXCERPT.facts.emd }]}
          sampleLink={SAMPLE_SECTIONS.points}
          sampleLabel="See where a real tender states them"
        >
          <p>
            The calculator needs two figures from the tender: the value and the EMD percentage. TenderTez lists both
            from a tender PDF, with the page each is on and the quoted text.
          </p>
        </GuideBridge>
      }
    >
      <section className="legal-block">
        <h2>EMD calculator</h2>
        <Calculator />
      </section>

      <section className="legal-block">
        <h2>EMD at 2%, 3% and 5%</h2>
        <p>The amounts for some common tender values, at the two ends of the Rule 170 range and one rate between them.</p>
        <div className="guide-table">
          <table>
            <thead><tr><th>Estimated value</th>{TABLE_RATES.map((r) => <th key={r}>EMD at {r}%</th>)}</tr></thead>
            <tbody>
              {TABLE_VALUES.map((v) => (
                <tr key={v}>
                  <td>Rs. {formatRupees(v)}</td>
                  {TABLE_RATES.map((r) => <td key={r}>Rs. {formatRupees(percentOf(v, r))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="legal-block">
        <h2>Which figures to type</h2>
        <ol>
          <li><strong>The value:</strong> the tender names it as the estimated cost, the estimated value or the value you quote. Use the one the EMD clause refers to.</li>
          <li><strong>The EMD percentage:</strong> from the notice inviting tender or the EMD clause. If the tender prints a rupee amount, that amount is the EMD and you don&rsquo;t need to calculate it.</li>
          <li><strong>The performance security percentage:</strong> from the performance security or performance guarantee clause. It applies to the contract value, and only the winning bidder pays it.</li>
          <li><strong>Every corrigendum:</strong> a corrigendum can change the EMD (<Link to="/guides/tender-corrigendum">how to check a corrigendum</Link>).</li>
        </ol>
      </section>

      <section className="legal-block">
        <h2>What the rules say about the percentages</h2>
        <div className="guide-table">
          <table>
            <thead><tr><th></th><th>EMD (bid security)</th><th>Performance security</th></tr></thead>
            <tbody>
              <tr><td>How much, under GFR</td><td>Ordinarily 2% to 5% of the estimated value (Rule 170)</td><td>3% to 5% of the contract value for goods, consultancy and non-consultancy services; for works, performance security plus security deposit or retention money of 3% to 10% (Rule 171(i), amended 1 January 2024)</td></tr>
              <tr><td>Who pays</td><td>Every bidder, unless exempt</td><td>Only the successful bidder</td></tr>
              <tr><td>How long it stays valid</td><td>45 days beyond the final bid validity period</td><td>60 days beyond completion of all contractual obligations, including warranty</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Micro and small enterprises and DPIIT-recognised startups can be exempt from EMD, but not from performance
          security. See <Link to="/guides/emd-exemption">EMD exemption for MSEs and startups</Link> for who qualifies
          and the proof to upload.
        </p>
      </section>

      <section className="legal-block">
        <h2>Questions</h2>
        <GuideQuestion q="How is EMD calculated in a tender?">
          Multiply the value the tender names by the EMD percentage it states. For example, 2% of Rs. 40,35,586.00 is
          Rs. 80,711.72. If the tender prints a rupee amount, pay that amount.
        </GuideQuestion>
        <GuideQuestion q="What percentage is EMD in government tenders?">
          Under GFR Rule 170, ordinarily between 2% and 5% of the estimated value. Each tender states its own figure.
        </GuideQuestion>
        <GuideQuestion q="Is EMD calculated on the estimated value or on my quoted price?">
          On whichever the tender names. Most state it against the estimated cost or value; read the EMD clause.
        </GuideQuestion>
        <GuideQuestion q="How much is performance security?">
          Under GFR Rule 171 as amended on 1 January 2024, 3% to 5% of the contract value for goods and services. The
          tender states its own percentage.
        </GuideQuestion>
        <GuideQuestion q="Do I get the EMD back?">
          Under Rule 170(ii), unsuccessful bidders should get it back after the final bid validity ends, and at the
          latest by the 30th day after the contract is awarded. The winning bidder&rsquo;s EMD is refunded when it
          furnishes the performance security.
        </GuideQuestion>
      </section>
    </GuideLayout>
  );
}
