import { Link } from 'react-router-dom';
import { GuideBridge, GuideLayout, GuideQuestion, type Source } from './GuideLayout';
import { SAMPLE_EXCERPT, SAMPLE_SECTIONS } from '../../sampleExcerpt';

// Every rule below is quoted from SOURCES (read in full on the guide's
// `checked` date in guides/guides.ts). Rules 170 and 171 are quoted from the
// GFR as updated up to 31.01.2026; performance security is the text amended
// by DoE OM F.1/2/2023-PPD of 01.01.2024 (3-5% for goods and services; 3-10%
// performance security plus security deposit for works). The DoE memorandum
// of 12 Nov 2020 covered tenders issued until 31.12.2021 only (its para 6);
// never present it as current. The worked example is the AIIMS Bhubaneswar
// NIT behind the public sample analysis (same SHA-256), PDF page numbers.
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
  {
    name: 'Department of Expenditure, General Financial Rules 2017, updated up to 31 January 2026',
    url: 'https://doe.gov.in/files/circulars_document/GFRupdatedupto31012026.pdf',
    note: 'Rules 170 and 171 as they stand: bid security forms, validity and refund, bid securing declaration, performance security',
  },
  {
    name: 'Department of Expenditure, OM No. F.1/2/2023-PPD, 1 January 2024: amendment to Rule 171(i)',
    url: 'https://doe.gov.in/files/circulars_document/Amendment_in_General_Financial_Rules_2017_Rule_171_i_Performance_Security_Regarding.pdf',
    note: 'performance security of 3–5% for goods and services; 3–10% with security deposit for works',
  },
  {
    name: 'AIIMS Bhubaneswar, NIT No. AIIMS/BBSR/ENGG./ELECT./11/2026',
    url: 'https://aiimsbhubaneswar.nic.in/wp-content/uploads/2026/05/NIT11.pdf',
    note: 'the worked example: EMD as a percentage, no exemption, performance guarantee and security deposit',
  },
];

const AIIMS_PDF = 'https://aiimsbhubaneswar.nic.in/wp-content/uploads/2026/05/NIT11.pdf';
const aiimsPage = (n: number) => <a href={`${AIIMS_PDF}#page=${n}`} target="_blank" rel="noopener noreferrer">p.{n}</a>;

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
      bridge={
        <GuideBridge
          title="Find the EMD clause in the tender you’re looking at"
          lines={[
            { label: 'EMD', ...SAMPLE_EXCERPT.facts.emd },
            SAMPLE_EXCERPT.points.emdExemption,
          ]}
          sampleLink={SAMPLE_SECTIONS.points}
          sampleLabel="See these points in the real analysis"
        >
          <p>
            Each tender sets its own EMD terms. TenderTez lists the EMD amount and any wording about exemption in a
            tender PDF, each with the page it is on and the quoted text, so you can read the clause itself.
            Whether an exemption applies to you depends on that clause and your certificates.
          </p>
        </GuideBridge>
      }
    >
      <section className="legal-block">
        <h2>What is EMD, and how much is it?</h2>
        <p>
          EMD (earnest money deposit), or bid security, protects the buyer if a bidder withdraws or changes its bid
          while the bid is valid. Rule 170(i) says it &ldquo;should ordinarily range between two percent to five
          percent of the estimated value of the goods to be procured&rdquo;. It may be given as an insurance surety
          bond, an account payee demand draft, a fixed deposit receipt, a banker&rsquo;s cheque or a bank guarantee
          (including an e-bank guarantee) from a commercial bank, or as an online payment, and is normally valid for 45
          days beyond the final bid validity period.
        </p>
        <p>
          Unsuccessful bidders should get it back after the final bid validity ends, and at the latest by the 30th
          day after the contract is awarded. In two-packet or two-stage bidding, bidders who don&rsquo;t pass the
          first stage should get it back within 30 days of that stage&rsquo;s result (Rule 170(ii)). The winning
          bidder&rsquo;s bid security is refunded when it furnishes the performance security (Rule 171(iii)).
        </p>
      </section>

      <section className="legal-block">
        <h2>How to work out the EMD amount</h2>
        <p>The tender sets the amount, either as a figure or as a percentage of a value it names.</p>
        <ol>
          <li><strong>Find every place the EMD is written:</strong> the notice inviting tender, the EMD clause in the instructions to bidders, and any schedule of amounts.</li>
          <li><strong>If it is a percentage, note what it is a percentage of:</strong> the estimated cost, the estimated value, or the value you quote. Use that figure, as the tender states it.</li>
          <li><strong>Read every corrigendum.</strong> A corrigendum can change the EMD.</li>
          <li><strong>On eProcure (CPPP),</strong> the tender&rsquo;s details page also shows an &ldquo;EMD Amount in &#8377;&rdquo; field. If it differs from the documents, ask the buyer before you pay.</li>
        </ol>
        <h3>A worked example from a real tender</h3>
        <p>
          AIIMS Bhubaneswar&rsquo;s NIT No. AIIMS/BBSR/ENGG./ELECT./11/2026 (pump motor sets) gives the estimated
          cost as &ldquo;Rs. 40,35,586.00&rdquo; ({aiimsPage(3)}) and the earnest money as &ldquo;2% of the
          Estimated Value&rdquo; ({aiimsPage(4)}). It doesn&rsquo;t print the rupee amount, so a bidder works it out:
          2% of Rs. 40,35,586.00 is <strong>Rs. 80,711.72</strong>. The same tender says &ldquo;EMD Exemption is not
          allowed for this work&rdquo; ({aiimsPage(12)}), so read your own tender&rsquo;s clause before relying on an
          exemption.
        </p>
        <p>
          To work out your own tender&rsquo;s figure, use the <Link to="/guides/emd-calculator">EMD calculator</Link>.
        </p>
      </section>

      <section className="legal-block">
        <h2>Performance security and EMD: what&rsquo;s the difference?</h2>
        <p>
          EMD is asked from every bidder, with the bid. Performance security is asked only from the bidder who wins,
          after award, to secure the contract (Rule 171). They are separate: an exemption from EMD doesn&rsquo;t
          exempt you from performance security, and Rule 171 names no exemption for MSEs or startups.
        </p>
        <div className="guide-table">
          <table>
            <thead><tr><th></th><th>EMD (bid security)</th><th>Performance security</th></tr></thead>
            <tbody>
              <tr><td>Who gives it</td><td>Every bidder, unless exempt under Rule 170(i)</td><td>Only the successful bidder</td></tr>
              <tr><td>When</td><td>With the bid</td><td>After the contract is awarded</td></tr>
              <tr><td>How much, under GFR</td><td>Ordinarily 2% to 5% of the estimated value of the goods (Rule 170(i))</td><td>3% to 5% of the contract value for goods, consultancy and non-consultancy services; for works, performance security plus security deposit or retention money of 3% to 10% (Rule 171(i), amended 1 January 2024)</td></tr>
              <tr><td>How long it stays valid</td><td>45 days beyond the final bid validity period</td><td>60 days beyond completion of all contractual obligations, including warranty (Rule 171(ii))</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          The tender states its own figures. The AIIMS tender above asks for a performance guarantee of &ldquo;05%
          (Five Percent) of Contract Value&rdquo;, valid &ldquo;6 months beyond completion of all the contractual
          obligations&rdquo;, and warns that if the contractor fails to deposit it, &ldquo;the EMD will be
          forfeited&rdquo; ({aiimsPage(12)}). Its schedule adds a security deposit of &ldquo;2.5% of Tendered
          Value&rdquo; ({aiimsPage(27)}).
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
          No. A declaration is a signed undertaking in place of money. Rule 170(iii) lets ministries and departments
          ask for one instead of bid security: a bidder that withdraws or changes its bid during validity, or wins and
          fails to sign the contract or submit the performance security by the deadline, is suspended from that
          buyer&rsquo;s bids for the period the tender states. An exemption means no bid security is asked at all. A
          Department of Expenditure memorandum of 12 November 2020 told ministries to use declarations instead of bid
          security, for tenders issued up to 31 December 2021. Today, the tender&rsquo;s own terms decide which
          applies.
        </p>
      </section>

      <section className="legal-block">
        <h2>Common mistakes</h2>
        <ul>
          <li>Claiming the MSE exemption as a trader or reseller.</li>
          <li>Uploading an expired or wrong-category certificate, or none.</li>
          <li>Assuming a medium enterprise is exempt.</li>
          <li>Assuming the exemption also covers the performance security (ePBG on GeM) after award. It is a separate requirement.</li>
          <li>Working out a percentage EMD on the wrong figure, such as your quoted value when the tender says the estimated cost.</li>
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
          No. Performance security is asked from the winning bidder after award, under GFR Rule 171, which names no
          exemption for MSEs or startups.
        </GuideQuestion>
        <GuideQuestion q="How much is performance security?">
          Under GFR Rule 171(i) as amended on 1 January 2024, 3% to 5% of the contract value for goods, consultancy
          and non-consultancy services. For works, performance security plus security deposit or retention money
          continues at 3% to 10%. The tender states the exact figure.
        </GuideQuestion>
      </section>

      <p>See also: <Link to="/guides/tender-eligibility-check">how to check eligibility in a government tender</Link>.</p>
    </GuideLayout>
  );
}
