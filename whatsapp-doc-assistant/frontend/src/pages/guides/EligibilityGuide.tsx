import { Link } from 'react-router-dom';
import { GuideLayout, GuideQuestion, type Source } from './GuideLayout';

// Every rule below is quoted from SOURCES (read in full on GUIDES_CHECKED).
const SOURCES: Source[] = [
  {
    name: 'All India Radio, Civil Construction Wing, Kolkata: e-tender instructions (CPWD format)',
    url: 'https://prasarbharati.gov.in/wp-content/uploads/2024/04/Engineering_673527.pdf',
    note: 'registrations accepted, the 40/60/80% experience tiers over 7 years, and the 7% a year escalation',
  },
  {
    name: 'GeM bid GEM/2024/B/5263261, 7 August 2024 (Raman Research Institute)',
    url: 'https://www.rri.res.in/sites/default/files/2024-08/GeM-Bidding-5263261.pdf',
    note: 'MSE and startup exemptions from turnover and experience, and the 40/50/80% experience tiers',
  },
  {
    name: 'IIT Kanpur Institute Works Department: corrigendum of 5 May 2026 to NIT 06/Civil/D2/2025-26',
    url: 'https://www.iitk.ac.in/iwd/file/2026/06-Civil-D2-2026-27/Corrigendum.pdf',
    note: 'a corrigendum that changed the definition of similar work',
  },
];

export function EligibilityGuidePage() {
  return (
    <GuideLayout
      slug="tender-eligibility-check"
      sources={SOURCES}
      answer={<p>
        To check eligibility in an Indian government tender, find its eligibility section and test your company
        against each condition in turn: registration and class, turnover, similar-work experience, certificates and
        any exemption you claim. Use the exact numbers, years and proof the tender asks for, then read every
        corrigendum, because corrigenda change eligibility too. The tender&rsquo;s own wording decides: two tenders
        for similar work can set different thresholds.
      </p>}
    >
      <section className="legal-block">
        <h2>Step 1: Find every place eligibility is written</h2>
        <p>
          Eligibility is rarely in one place. Look in the notice inviting tender (NIT), the instructions to bidders,
          the &ldquo;qualification&rdquo; or &ldquo;eligibility criteria&rdquo; section, the bid data sheet (on GeM,
          the first pages of the bid document), the additional terms and conditions (ATC on GeM) and every
          corrigendum. Note the page of each condition so you can find it again.
        </p>
      </section>

      <section className="legal-block">
        <h2>Step 2: Check registration and class</h2>
        <p>
          Works tenders often admit only contractors registered in a stated class with named departments. An All
          India Radio civil construction tender in CPWD format, for example, invites bids from &ldquo;approved and
          eligible contractor of CPWD / MES / BSNL / MTNL / Railway / West Bengal State PWD&rdquo;. If your
          registration isn&rsquo;t on the list, you are not eligible, however strong your experience.
        </p>
      </section>

      <section className="legal-block">
        <h2>Step 3: Check the turnover clause in four parts</h2>
        <p>A turnover clause can fail you in four ways. Answer each one:</p>
        <ol>
          <li><strong>Which years?</strong> The last three financial years, three of the last five, or another window.</li>
          <li><strong>Average or every year?</strong> An average lets one weak year pass; &ldquo;in each year&rdquo; does not.</li>
          <li><strong>Whole company or the tendered item?</strong> Some tenders count only turnover from the item or service being bought.</li>
          <li><strong>What proof?</strong> Audited statements, a chartered accountant&rsquo;s certificate in a set format, or both.</li>
        </ol>
        <p>Compare your audited figures, not estimates, with the exact percentage of the estimated cost the tender sets.</p>
      </section>

      <section className="legal-block">
        <h2>Step 4: Check similar-work experience: count, value and window</h2>
        <p>Experience clauses usually let you qualify in one of three ways, and the numbers differ between tenders:</p>
        <div className="guide-table">
          <table>
            <thead>
              <tr><th>Tender</th><th>Three similar works, each at least</th><th>Two, each at least</th><th>One, at least</th><th>Window</th></tr>
            </thead>
            <tbody>
              <tr><td>All India Radio civil works tender (CPWD format)</td><td>40% of estimated cost</td><td>60%</td><td>80%</td><td>Last 7 years</td></tr>
              <tr><td>GeM services bid GEM/2024/B/5263261 (7 Aug 2024)</td><td>40% of estimated cost</td><td>50%</td><td>80%</td><td>Current financial year and the last 3</td></tr>
            </tbody>
          </table>
        </div>
        <p>Two details decide many bids:</p>
        <ul>
          <li>
            <strong>Older works can be brought up to today&rsquo;s value,</strong> if the tender allows it. The All
            India Radio tender raises the value of past work &ldquo;at simple rate of 7 % per annum&rdquo; from
            completion to the last date of application.
          </li>
          <li>
            <strong>&ldquo;Similar work&rdquo; is defined, and the definition can change.</strong> An IIT Kanpur
            corrigendum of 5 May 2026 changed it from renovation and maintenance work to construction work in
            residential and office buildings (see <Link to="/guides/tender-corrigendum">what a corrigendum can change</Link>).
          </li>
        </ul>
      </section>

      <section className="legal-block">
        <h2>Step 5: Check exemptions before you rule yourself out</h2>
        <p>
          On GeM, a buyer can exempt micro and small enterprises (MSEs) and startups from the turnover and experience
          criteria. The bid&rsquo;s first page shows &ldquo;MSE Exemption for Years Of Experience and Turnover&rdquo;
          and &ldquo;Startup Exemption&rdquo; as Yes or No; in GEM/2024/B/5263261 both are Yes. The exemption is
          &ldquo;subject to meeting of quality and technical specifications&rdquo;, and the documents proving it
          &ldquo;must be uploaded for evaluation by the buyer&rdquo;.
        </p>
        <p>EMD exemption is a separate rule: see <Link to="/guides/emd-exemption">EMD exemption for MSEs and startups</Link>.</p>
      </section>

      <section className="legal-block">
        <h2>Step 6: List the proof for each condition</h2>
        <p>
          For each condition, write down the exact document you will upload: registration certificate, audited
          balance sheets, CA certificate, completion certificates or work orders, Udyam or DPIIT certificate. Check
          that each is valid on the closing date. Missing or expired proof fails a bid as surely as a missed threshold.
        </p>
      </section>

      <section className="legal-block">
        <h2>Step 7: Read every corrigendum, then decide</h2>
        <p>
          Corrigenda change thresholds, registration lists and definitions after you have read the tender. Check for
          them the day before you submit, and test again any condition they touch.
        </p>
      </section>

      <section className="legal-block">
        <h2>Common mistakes</h2>
        <ul>
          <li>Using the turnover of the wrong years, or an average where &ldquo;each year&rdquo; is required.</li>
          <li>Counting ongoing or unrelated work as &ldquo;similar work&rdquo;.</li>
          <li>Missing that the two-works tier is 60%, not 50% (or the other way round).</li>
          <li>Claiming an MSE or startup exemption the bid doesn&rsquo;t allow, or without uploading proof.</li>
          <li>Checking the original tender but not the corrigendum.</li>
        </ul>
      </section>

      <section className="legal-block">
        <h2>Questions</h2>
        <GuideQuestion q="What is eligibility criteria in a tender?">
          The conditions a bidder must meet for its bid to be considered: usually registration, turnover, similar-work
          experience, certificates and sometimes location or manufacturer status. They are set in the tender document
          and its corrigenda.
        </GuideQuestion>
        <GuideQuestion q="How is average annual turnover calculated for a tender?">
          Add the turnover for the financial years the tender names and divide by their number, using audited figures.
          Check whether the tender wants an average or a minimum in each year, and whether only turnover from the
          tendered item counts.
        </GuideQuestion>
        <GuideQuestion q="What counts as “similar work”?">
          Whatever the tender&rsquo;s definition says. Look for a &ldquo;definition of similar work&rdquo; clause; it
          can be narrow, and a corrigendum can change it.
        </GuideQuestion>
        <GuideQuestion q="Can older completed works count at today’s value?">
          Only if the tender says so. Some CPWD-format tenders increase past work value at a simple 7% a year to the
          last date of application.
        </GuideQuestion>
        <GuideQuestion q="Are MSEs and startups exempt from turnover and experience criteria?">
          On GeM, only when the bid shows the MSE or startup exemption as Yes, subject to meeting quality and technical
          specifications, with proof uploaded. Outside GeM, check the tender.
        </GuideQuestion>
        <GuideQuestion q="Can I bid if I meet everything except one condition?">
          Usually the bid will be rejected on that condition. If a clause is unclear, ask in the pre-bid meeting or by
          the query date; answers usually come in writing as a corrigendum or minutes.
        </GuideQuestion>
        <GuideQuestion q="Where do I find corrigenda?">
          On the tender&rsquo;s page on the portal where it was published, and on the buyer&rsquo;s website if the
          notice says so.
        </GuideQuestion>
      </section>
    </GuideLayout>
  );
}
