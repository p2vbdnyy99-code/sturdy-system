import { Link } from 'react-router-dom';
import { GuideLayout, GuideQuestion, type Source } from './GuideLayout';

// The worked example is quoted from SOURCES (read in full on GUIDES_CHECKED).
const SOURCES: Source[] = [
  {
    name: 'IIT Kanpur Institute Works Department, Division II: corrigendum of 5 May 2026 to NIT 06/Civil/D2/2025-26',
    url: 'https://www.iitk.ac.in/iwd/file/2026/06-Civil-D2-2026-27/Corrigendum.pdf',
    note: 'the four changes in the example, each with the tender page it amends',
  },
];

export function CorrigendumGuidePage() {
  return (
    <GuideLayout
      slug="tender-corrigendum"
      sources={SOURCES}
      answer={<p>
        A corrigendum is an official amendment to a published tender, and it can change any part of it: the closing
        date, the EMD, the eligibility conditions, the scope or a definition. Before you submit, find every
        corrigendum issued for the tender, read the changed clause in full, and check your bid against it again.
        Don&rsquo;t rely on the notice&rsquo;s one-line summary.
      </p>}
    >
      <section className="legal-block">
        <h2>What can a corrigendum change?</h2>
        <p>
          Anything in the tender: the bid closing or opening date, the EMD or its exemption terms, eligibility
          (registrations accepted, turnover, experience), the definition of &ldquo;similar work&rdquo;, the scope,
          quantities or BOQ, and the documents to upload. A corrigendum may also leave the date unchanged, so
          don&rsquo;t assume a new corrigendum means more time.
        </p>
      </section>

      <section className="legal-block">
        <h2>A real example: a corrigendum that changed who is eligible</h2>
        <p>
          On 5 May 2026, IIT Kanpur&rsquo;s Institute Works Department issued a corrigendum to an annual civil
          maintenance contract (NIT 06/Civil/D2/2025-26). It made four changes, each shown as &ldquo;Content&rdquo;
          and &ldquo;Read As&rdquo; with the tender page it amends:
        </p>
        <div className="guide-table">
          <table>
            <thead><tr><th>What changed</th><th>Original</th><th>Read as</th></tr></thead>
            <tbody>
              <tr><td>Registration accepted (pages 5, 20 and 28)</td><td>CPWD, BSNL, MES, UPPWD, Central PSUs</td><td>CPWD / BSNL / MES / Central Government bodies / Central Government PSUs / State Government bodies</td></tr>
              <tr><td>Eligible contractors (page 21, point 3.1)</td><td>The same named list</td><td>The same widened list</td></tr>
              <tr><td>Experience with government (page 21)</td><td>One completed similar work of at least 40% of the estimated cost with a central department, central autonomous body, central PSU or state government department in the last 7 years</td><td>The same 40%, &ldquo;either part of above or a separate one&rdquo;, now including state government bodies</td></tr>
              <tr><td>Definition of similar work (page 21)</td><td>&ldquo;Renovation / Annual repairs &amp; maintenance of works in residential houses / apartments / quarters / offices / laboratories&rdquo;</td><td>&ldquo;Construction works in residential houses / apartments / quarters / offices / laboratories&rdquo;</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          It ends: &ldquo;The others terms &amp; condition of the NIT shall remain the same.&rdquo; A contractor
          registered with a state government body became eligible, and one with only repair and maintenance
          experience may no longer have matching similar work. Neither change was visible in the original tender.
        </p>
      </section>

      <section className="legal-block">
        <h2>How to check for corrigenda</h2>
        <ol>
          <li>When you download the tender, note where it was published: CPPP, GeM, a state e-procurement portal or the buyer&rsquo;s own website.</li>
          <li>Before you start preparing, check that page for corrigenda, addenda and pre-bid minutes.</li>
          <li>Check again the day before you submit. Late corrigenda are common.</li>
          <li>Download each corrigendum and keep it with the tender. Some tenders ask you to sign and upload corrigenda with the bid.</li>
        </ol>
      </section>

      <section className="legal-block">
        <h2>How to check what a corrigendum changed</h2>
        <ol>
          <li>List each change with the clause and page it amends. Most corrigenda quote &ldquo;content&rdquo; and &ldquo;read as&rdquo;; some only say &ldquo;refer to the attached document&rdquo;.</li>
          <li>Check your eligibility again for any changed condition (<Link to="/guides/tender-eligibility-check">how to check eligibility</Link>).</li>
          <li>Update your list of documents to upload.</li>
          <li>Update your dates if the closing date moved, and arrange the EMD again if its amount or validity changed.</li>
          <li>If anything is unclear, ask the buyer in writing before the query deadline.</li>
        </ol>
      </section>

      <section className="legal-block">
        <h2>Common mistakes</h2>
        <ul>
          <li>Reading the notice summary (&ldquo;date extended&rdquo;) and missing a changed eligibility clause in the attachment.</li>
          <li>Checking for corrigenda once, early, and missing a late one.</li>
          <li>Updating the date but not the document list.</li>
          <li>Not uploading signed corrigenda when the tender asks for them.</li>
        </ul>
      </section>

      <section className="legal-block">
        <h2>How TenderTez helps</h2>
        <p>
          Upload a corrigendum on a tender you have analysed in TenderTez. It lists each change to the deadline, EMD,
          dates, eligibility and other terms, quoting the changed text and the page it is on, and drops anything it
          can&rsquo;t find quoted on that page. See <Link to="/features#corrigendum">the corrigendum check</Link>.
        </p>
      </section>

      <section className="legal-block">
        <h2>Questions</h2>
        <GuideQuestion q="What is a corrigendum in a tender?">
          An official amendment issued after a tender is published, correcting or changing part of it: dates, EMD,
          eligibility, scope, definitions or documents.
        </GuideQuestion>
        <GuideQuestion q="What is the difference between a corrigendum and an addendum?">
          Tenders use the words loosely. Both amend the tender; treat both as part of it.
        </GuideQuestion>
        <GuideQuestion q="Does a corrigendum always extend the deadline?">
          No. Many corrigenda change other terms and keep the original closing date.
        </GuideQuestion>
        <GuideQuestion q="Can a corrigendum change eligibility after I have started preparing?">
          Yes. The IIT Kanpur example above widened the registrations accepted and changed the definition of similar
          work.
        </GuideQuestion>
        <GuideQuestion q="Can I bid on the original terms if I missed a corrigendum?">
          No. The amended terms apply to every bidder, whether or not they read the corrigendum.
        </GuideQuestion>
      </section>
    </GuideLayout>
  );
}
