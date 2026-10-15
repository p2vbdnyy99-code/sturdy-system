import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { PRODUCT_NAME } from '../config/product';
import { CONTACT_EMAIL, FREE_TRIAL_TENDERS, PLANS } from '../config/site';

// Every answer here is checked against the running product or a cited
// source (BIDPILOT_ARCHITECTURE.md, "Public site pages"): limits come from
// backend/src/config.js defaults, the OpenAI data terms from OpenAI's docs.
// Change an answer when the behaviour it describes changes.

const GROUPS: Array<{ title: string; items: Array<{ q: string; a: ReactNode }> }> = [
  {
    title: 'Getting started',
    items: [
      {
        q: `What does ${PRODUCT_NAME} do?`,
        a: <>You upload a tender PDF. {PRODUCT_NAME} reads the whole document and shows you the deadline, EMD,
          fees, eligibility conditions, BOQ items, key dates and clauses worth a second look. Every point links
          to the page it came from.</>,
      },
      {
        q: 'Which tenders can I upload?',
        a: <>Tender documents as PDF files, for example from CPPP, GeM, state e-procurement portals or PSU
          sites. Files can be up to 50 MB, and the first 300 pages are read.</>,
      },
      {
        q: 'Does it find tenders for me?',
        a: <>No. You bring the tender you&rsquo;re considering; {PRODUCT_NAME} helps you understand it quickly.</>,
      },
      {
        q: 'Does it fill in or submit my bid?',
        a: <>No. It helps you decide whether to bid and what you&rsquo;ll need. Preparing and submitting the bid
          stays with you.</>,
      },
    ],
  },
  {
    title: 'Results',
    items: [
      {
        q: 'How long does an analysis take?',
        a: <>Usually a few minutes. Very large documents take longer. You can leave the page; the tender
          updates on its own when the analysis is done.</>,
      },
      {
        q: 'How accurate is it?',
        a: <>It is AI, so it can miss or misread things. That&rsquo;s why every point shows the page number and
          the quoted text: tap it to check in seconds. If something wasn&rsquo;t found, the page says
          &ldquo;Not found in document&rdquo; instead of guessing. Always confirm important details before you
          bid.</>,
      },
      {
        q: 'What if part of the document couldn’t be read?',
        a: <>The tender page tells you how many sections couldn&rsquo;t be read and offers a button to run the
          analysis again.</>,
      },
      {
        q: 'Do scanned PDFs work?',
        a: <>Typed (digital) PDFs work best. Scanned pages are read with text recognition for English, up to 15
          scanned pages per document. Handwriting, stamps and very faint scans may not come through.</>,
      },
      {
        q: 'What about tenders in Hindi?',
        a: <>Hindi text in a typed PDF is included in the analysis, and the results are shown in English. Scanned
          Hindi pages aren&rsquo;t read yet. Most of our testing so far has been on English tenders.</>,
      },
      {
        q: 'How does the eligibility check work?',
        a: <>Fill in your company profile once: turnover, experience, registrations and so on. On a tender, press
          &ldquo;Check eligibility&rdquo; and each requirement is marked as one you appear to meet, one you
          don&rsquo;t appear to meet, or one that couldn&rsquo;t be checked. It only uses what you saved in your
          profile.</>,
      },
    ],
  },
  {
    title: 'Privacy and data',
    items: [
      {
        q: 'Who can see my tenders?',
        a: <>Only the people in your company account. One company can never see another company&rsquo;s tenders.</>,
      },
      {
        q: 'Where does my document go?',
        a: <>The PDF is stored on our server. To analyse it, the document&rsquo;s text is sent to OpenAI&rsquo;s API.
          OpenAI states that data sent through its API is not used to train its models and is kept for up to 30
          days for abuse monitoring (<a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI&rsquo;s data policy</a>).</>,
      },
      // Only offered once there is a real address to write to.
      ...(CONTACT_EMAIL ? [{
        q: 'Can I delete my data?',
        a: <>Yes. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your registered address and
          we&rsquo;ll delete your tenders and account.</>,
      }] : []),
    ],
  },
  {
    title: 'Pricing and account',
    items: [
      {
        q: 'Is there a free trial?',
        a: <>Yes. Your first {FREE_TRIAL_TENDERS} tenders are free with every feature included, and no card is
          needed. After that, <Link to="/pricing">monthly plans</Link> start at
          {' '}₹{PLANS[0].pricePerMonth.toLocaleString('en-IN')} for {PLANS[0].tendersPerMonth} tenders a month.
          Nothing is charged automatically.</>,
      },
      {
        q: 'Do I have to fill in the company profile?',
        a: <>Not for your first 2 tenders: you can upload and analyse them without it. From the 3rd tender on, it
          is needed, because the eligibility check compares each tender&rsquo;s conditions, such as turnover,
          experience and certificates, with your company profile. With every field filled in, it can say clearly
          which conditions you meet. Where something doesn&rsquo;t apply, such as manufacturer tie-ups, you simply
          tick &ldquo;None&rdquo;. It takes a few minutes, once.</>,
      },
      {
        q: 'Can I keep track of my bids?',
        a: <>Yes. On each tender, set its stage (Interested, Preparing bid, Submitted, Won and so on), your own
          internal deadline and notes. The Checklist tab lists every condition the tender sets, with its page, so
          you can tick off each document as it&rsquo;s ready and download the list as an Excel sheet. When a
          department issues a corrigendum, upload it on the tender to see what it changes.</>,
      },
      {
        q: 'I prepare bids for several firms. Can I keep them apart?',
        a: <>Yes. Add each firm under Clients and fill in its profile, then choose on a tender who it is for.
          The eligibility check then uses that client&rsquo;s details. All your clients share your one plan.</>,
      },
      {
        q: 'Where do the tenders in the search come from?',
        a: <>From the Central Public Procurement Portal (CPPP), the Government of India&rsquo;s tender portal. It
          publishes lists of active tenders from central ministries and PSUs (railways and defence included), from
          the state e-procurement portals, and from GeM. We read those lists through the day: new central and
          state tenders usually appear within the hour, GeM bids within a day. It is not every tender in India: a
          tender that a department never publishes on CPPP isn&rsquo;t there. Track a tender to add it to your list,
          then download its document from the portal and attach it to analyse it.</>,
      },
      {
        q: 'Why doesn’t the portal link open the tender directly?',
        a: <>Government portals ask for a captcha before they show a tender, and their tender links only work in
          the browser that opened them. So for central and state tenders we open the right portal&rsquo;s search
          page (for GeM, GeM&rsquo;s own bid list), and the button copies the tender ID or GeM bid number as it opens:
          paste it into the portal&rsquo;s search box to find the tender and its documents. For GeM bids, open
          the bid in GeM&rsquo;s search results and download the document there.</>,
      },
      {
        q: 'Can I use it on my phone?',
        a: <>Yes. It works in your phone&rsquo;s browser, so there&rsquo;s no app to install.</>,
      },
      {
        q: 'I work with more than one company. Is that a problem?',
        a: <>No. If your account belongs to more than one company, you choose which one to work in after you log
          in, and each company&rsquo;s tenders stay separate.</>,
      },
    ],
  },
];

export function FaqPage() {
  return (
    <PublicLayout>
      <PageIntro kicker="FAQ" title="Questions people ask before they try it">
        <p>Straight answers about what {PRODUCT_NAME} does, what it doesn&rsquo;t, and what happens to your documents.</p>
      </PageIntro>
      <section className="home-section faq-section">
        <div className="home-container faq-container">
          {GROUPS.map((group) => (
            <div key={group.title} className="faq-group">
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <details key={item.q} className="faq-item">
                  <summary>{item.q}</summary>
                  <div className="faq-answer">{item.a}</div>
                </details>
              ))}
            </div>
          ))}
          <div className="faq-more">
            <p>Didn&rsquo;t find your question?</p>
            <Link to="/register" className="btn-link btn-primary">Try it on a tender</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
