import { Link } from 'react-router-dom';
import { GuideLayout, GuideQuestion, type Source } from './GuideLayout';

// Every rule below is quoted from SOURCES (read in full on GUIDES_CHECKED).
// The DoE memorandum of 12 Nov 2020 covered tenders issued until 31.12.2021
// only (its para 6); never present it as current.
const SOURCES: Source[] = [
  {
    name: 'Department of Expenditure, OM No. F.20/2/2014-PPD(Pt.), 25 July 2017: amendment to Rule 170(i) of GFR 2017',
    url: 'https://dgll.nic.in/sites/default/files/2023-06/GFR%20amendment2.pdf',
    note: 'who is exempt from bid security, the usual 2–5% amount, accepted forms and validity',
  },
  {
    name: 'GeM bid GEM/2024/B/5263261, 7 August 2024 (Raman Research Institute)',
    url: 'https://www.rri.res.in/sites/default/files/2024-08/GeM-Bidding-5263261.pdf',
    note: 'the GeM EMD exemption clause (traders excluded, proof with the bid) and the clauses buyers may not add',
  },
  {
    name: 'Department of Expenditure, memorandum on bid security declaration, 12 November 2020',
    url: 'https://doe.gov.in/files/circulars_document/Bid_Security_Earnest_Money_Deposit.pdf',
    note: 'bid security declaration in place of EMD, for tenders issued until 31 December 2021',
  },
];

export function EmdGuidePage() {
  return (
    <GuideLayout
      slug="emd-exemption"
      sources={SOURCES}
      answer={<p>
        Under Rule 170(i) of the General Financial Rules 2017, as revised on 25 July 2017, central government buyers
        should not ask for EMD from micro and small enterprises (MSEs), from firms registered with the Central
        Purchase Organisation or the buying ministry, or from startups recognised by DPIIT. On GeM, only
        manufacturers of the goods or providers of the service qualify as MSEs, so traders do not, and the proof
        must be uploaded with the bid.
      </p>}
    >
      <section className="legal-block">
        <h2>What is EMD, and how much is it?</h2>
        <p>
          EMD (earnest money deposit), or bid security, protects the buyer if a bidder withdraws or changes its bid
          while the bid is valid. Rule 170(i) says it &ldquo;should ordinarily range between two percent to five
          percent of the estimated value of the goods to be procured&rdquo;. It may be given as a demand draft, fixed
          deposit receipt, banker&rsquo;s cheque, bank guarantee or online payment, and is normally valid for 45 days
          beyond the final bid validity period.
        </p>
      </section>

      <section className="legal-block">
        <h2>Who is exempt from EMD?</h2>
        <p>
          The revised Rule 170(i), in the Department of Expenditure&rsquo;s office memorandum No.
          F.20/2/2014-PPD(Pt.) of 25 July 2017, says bid security &ldquo;is to be obtained from the bidders
          except&rdquo;:
        </p>
        <div className="guide-table">
          <table>
            <thead><tr><th>Exempt bidder</th><th>Condition in the rule</th></tr></thead>
            <tbody>
              <tr><td>Micro and Small Enterprises</td><td>&ldquo;as defined in MSE Procurement Policy issued by Department of Micro, Small and Medium Enterprises&rdquo;</td></tr>
              <tr><td>Firms registered with the buyer</td><td>&ldquo;registered with the Central Purchase Organisation or the concerned Ministry or Department&rdquo;</td></tr>
              <tr><td>Startups</td><td>&ldquo;as recognised by Department of Industrial Policy &amp; Promotion (DIPP)&rdquo;, now DPIIT</td></tr>
            </tbody>
          </table>
        </div>
        <p>Medium enterprises are not in the list.</p>
      </section>

      <section className="legal-block">
        <h2>How does EMD exemption work on GeM?</h2>
        <p>A GeM bid states it in the bid document. GEM/2024/B/5263261 (7 August 2024), for example, says:</p>
        <blockquote className="guide-quote">
          &ldquo;The bidder seeking EMD exemption, must submit the valid supporting document for the relevant category
          as per GeM GTC with the bid. Under MSE category, only manufacturers for goods and Service Providers for
          Services are eligible for exemption from EMD. Traders are excluded from the purview of this Policy.&rdquo;
        </blockquote>
        <p>
          The same bid&rsquo;s disclaimer lists clauses a buyer must not add, including &ldquo;seeking EMD submission
          from bidder(s), including via Additional Terms &amp; Conditions, in contravention to exemption provided to
          such sellers under GeM GTC&rdquo;. If a buyer adds one, &ldquo;the bid and resultant contracts shall be
          treated as null and void and such bids may be cancelled by GeM&rdquo;.
        </p>
        <h3>How to claim it on GeM</h3>
        <ol>
          <li><strong>Check your role.</strong> Are you the manufacturer of the goods, or the provider of the service? If you resell another company&rsquo;s product, the MSE EMD exemption doesn&rsquo;t apply.</li>
          <li><strong>Check your certificate.</strong> For an MSE, a valid Udyam registration; GeM gives MSE benefits only to sellers validated in their GeM profile. For a startup, the DPIIT recognition certificate.</li>
          <li><strong>Upload the proof with the bid,</strong> where the bid asks for it.</li>
          <li><strong>Read the bid&rsquo;s EMD and ATC sections</strong> and any corrigendum for anything specific to that bid.</li>
        </ol>
      </section>

      <section className="legal-block">
        <h2>Is a bid security declaration the same as an EMD exemption?</h2>
        <p>
          No. A declaration is a signed undertaking in place of money: if you withdraw or change your bid during
          validity, or don&rsquo;t sign the contract, you can be suspended from bidding for a period the tender
          states. An exemption means no bid security is asked at all. A Department of Expenditure memorandum of 12
          November 2020 told ministries to use declarations instead of bid security, for tenders issued up to 31
          December 2021. Today, the tender&rsquo;s own terms decide which applies.
        </p>
      </section>

      <section className="legal-block">
        <h2>Common mistakes</h2>
        <ul>
          <li>Claiming the MSE exemption as a trader or reseller.</li>
          <li>Uploading an expired or wrong-category certificate, or none.</li>
          <li>Assuming a medium enterprise is exempt.</li>
          <li>Assuming the exemption also covers the performance security (ePBG on GeM) after award. It is a separate requirement.</li>
          <li>Not checking the corrigendum, which can change the EMD.</li>
        </ul>
      </section>

      <section className="legal-block">
        <h2>Questions</h2>
        <GuideQuestion q="Are MSEs exempt from EMD in government tenders?">
          Under GFR Rule 170(i), central government buyers should not take bid security from MSEs as defined in the MSE
          Procurement Policy. On GeM, only manufacturers of the goods or providers of the service qualify; traders
          don&rsquo;t.
        </GuideQuestion>
        <GuideQuestion q="Are startups exempt from EMD?">
          Startups recognised by DPIIT are exempt under the same rule. On GeM, upload the recognition certificate with
          the bid.
        </GuideQuestion>
        <GuideQuestion q="Is a medium enterprise exempt from EMD?">
          Not under Rule 170(i), which names micro and small enterprises only.
        </GuideQuestion>
        <GuideQuestion q="Does the exemption apply to state government tenders?">
          GFR applies to central government. State buyers and PSUs set their own procurement rules; read each tender.
        </GuideQuestion>
        <GuideQuestion q="How much is EMD usually?">
          GFR Rule 170(i) says it should ordinarily be 2% to 5% of the estimated value of the goods. The tender states
          the exact amount.
        </GuideQuestion>
        <GuideQuestion q="Does EMD exemption cover performance security?">
          No. Performance security is asked from the winning bidder after award and is separate from EMD.
        </GuideQuestion>
      </section>

      <p>See also: <Link to="/guides/tender-eligibility-check">how to check eligibility in a government tender</Link>.</p>
    </GuideLayout>
  );
}
