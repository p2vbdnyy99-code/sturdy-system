import { Link } from 'react-router-dom';
import { GuideBridge, GuideLayout, GuideQuestion, type Source } from './GuideLayout';
import { SAMPLE_SECTIONS } from '../../sampleExcerpt';

// Every rule and example is quoted from SOURCES (read in full on the guide's
// `checked` date in guides/guides.ts). The definition and "corrigendum vs
// amendment" come from the DoE Manual for Procurement of Goods 2024 (paras
// 5.1.4, 5.1.5, 5.1.6, 5.2.3(e)) and GFR Rule 159(i). Search Console (Oct-Nov
// 2026) showed people search for the meaning of "corrigendum", so the page
// answers that first.
const SOURCES: Source[] = [
  {
    name: 'Department of Expenditure, Manual for Procurement of Goods, Second Edition 2024',
    url: 'https://doe.gov.in/files/circulars_document/Manual_Goods_2024.pdf',
    note: 'paras 5.1.4 (corrigenda published on GeM-CPPP), 5.1.5 (amendment by corrigendum), 5.1.6 (extensions) and 5.2.3(e) (corrigenda after a pre-bid meeting)',
  },
  {
    name: 'Department of Expenditure, General Financial Rules 2017, updated up to 31 January 2026',
    url: 'https://doe.gov.in/files/circulars_document/GFRupdatedupto31012026.pdf',
    note: 'Rule 159(i): tender enquiries and corrigenda must be published on the GeM-CPPP portal',
  },
  {
    name: 'REC Power Development and Consultancy Ltd: Corrigendum No. 1 of 28 March 2023 to GeM bid GEM/2023/B/3262572',
    url: 'https://www.recpdcl.in/assets/data/tenders/GeM-Bidding-4566402-Corrigendum1.pdf',
    note: 'a corrigendum to a GeM bid that extended its end and opening dates',
  },
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
        A corrigendum in a tender is the official notice a buyer issues to amend the tender after it is published.
        Central government buyers may, before bids are due, &ldquo;amend tender documents by issuing a
        corrigendum&rdquo;, and must publish it on the GeM-CPPP portal and their own website. It can change any part
        of the tender: the closing date, the EMD, the eligibility conditions, the scope or a definition. Before you
        submit, find every corrigendum issued for the tender, read the changed clause in full, and check your bid
        against it again. Don&rsquo;t rely on the notice&rsquo;s one-line summary.
      </p>}
      bridge={
        <GuideBridge
          title="Check what a corrigendum changed"
          sampleLink={SAMPLE_SECTIONS.dates}
          sampleLabel="See how a real tender’s dates are listed"
        >
          <p>
            Upload the corrigendum to the same tender in TenderTez and it lists what changed in the deadline, EMD or
            dates, each quoted with its page. Then read the changed clause in full, as this guide explains, before you
            rely on it.
          </p>
        </GuideBridge>
      }
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
        <h2>Corrigendum vs amendment: what&rsquo;s the difference?</h2>
        <p>
          In central government procurement they are two sides of one step. The Department of Expenditure&rsquo;s
          Manual for Procurement of Goods (2024) says that, at any time before bids are due, the buyer may, on its own
          or in reply to a bidder&rsquo;s question, &ldquo;amend tender documents by issuing a corrigendum&rdquo;
          (para 5.1.5). The <strong>amendment</strong> is the change; the <strong>corrigendum</strong> is the notice
          that makes it. After a pre-bid meeting, the buyer issues &ldquo;a clarification letter and corrigendum to the
          Tender Document&rdquo;, &ldquo;containing amendments to various provisions of the Tender Document, which
          shall form part of the Tender Document&rdquo; (para 5.2.3(e)).
        </p>
        <p>
          Some buyers call the same notice an addendum or an amendment. Whatever it is called, it is part of the
          tender. The manual also says that when an amendment changes the requirement significantly, or little time
          is left, the closing date should be extended by at least three days (paras 5.1.5 and 5.1.6).
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
        <h2>What does a corrigendum on a GeM bid mean?</h2>
        <p>
          The same thing: the buyer has changed something in a published GeM bid. Central government buyers must publish
          corrigenda on the GeM-CPPP portal (GFR Rule 159(i)). For example, &ldquo;Corrigendum No. 1&rdquo; of 28
          March 2023 to GeM bid GEM/2023/B/3262572, published by REC Power Development and Consultancy Ltd on its
          website, moved the bid end date from 29.03.2023 at 11:00 to 05.04.2023 at 11:00 (IST), and the bid opening
          from 29.03.2023 at 11:30 to 05.04.2023 at 11:30.
        </p>
        <p>
          A corrigendum on GeM can also change the bid&rsquo;s terms, not only its dates, so open it and read it in
          full: the new end date, and any change to the specifications, quantities, eligibility, EMD or the buyer&rsquo;s
          additional terms and conditions (ATC). The manual separately asks GeM and e-procurement portals to extend a
          bid automatically, once, when too few bids arrive, telling bidders only that &ldquo;due to less competition,
          the tender closing time has been extended&rdquo; (para 5.1.6).
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
          The official notice a buyer issues after a tender is published, to correct or change part of it: dates, EMD,
          eligibility, scope, definitions or documents. It becomes part of the tender.
        </GuideQuestion>
        <GuideQuestion q="What is the difference between a corrigendum and an amendment?">
          The amendment is the change; the corrigendum is the notice that makes it. The Manual for Procurement of Goods
          says the buyer may &ldquo;amend tender documents by issuing a corrigendum&rdquo;.
        </GuideQuestion>
        <GuideQuestion q="What is the difference between a corrigendum and an addendum?">
          Tenders use the words loosely. Both amend the tender; treat both as part of it.
        </GuideQuestion>
        <GuideQuestion q="What does a corrigendum issued on a GeM bid mean?">
          The buyer has changed something in that bid, often the end date, sometimes its terms. Open the corrigendum and
          read it before the new end date.
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
