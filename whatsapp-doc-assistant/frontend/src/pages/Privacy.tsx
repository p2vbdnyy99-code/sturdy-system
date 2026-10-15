import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { PRODUCT_NAME } from '../config/product';
import { CONTACT_EMAIL, FOUNDER } from '../config/site';

// Every statement here describes what the code and hosting actually do
// (see BIDPILOT_ARCHITECTURE.md, "Privacy policy page"). Change this page
// whenever that changes: a new service provider, analytics, payments, or
// email sending.
const LAST_UPDATED = '16 October 2026';

const OPENAI_DATA_POLICY = 'https://developers.openai.com/api/docs/guides/your-data';

function Mail() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <>the address on our website</>;
}

const SECTIONS: Array<{ title: string; body: ReactNode }> = [
  {
    title: 'Who we are',
    body: (
      <p>
        {PRODUCT_NAME} (tendertez.in) helps contractors and tender consultants read government tender
        documents. {FOUNDER ? <>It is run by {FOUNDER.name} in {FOUNDER.city}, India. </> : null}
        For any question about this policy or your data, write to <Mail />.
      </p>
    ),
  },
  {
    title: 'What we collect',
    body: (
      <ul>
        <li><strong>Your account:</strong> how you sign in, and your name if you give it. With email, that is
          your email address and password; the password is stored only in scrambled (hashed) form, so nobody,
          including us, can read it. With Google, it is your Google account&rsquo;s email, name and account ID (we
          never see your Google password). With your mobile number, it is that number.</li>
        <li><strong>Your company:</strong> the company name and its company profile (optional for your first 2
          tenders, then required): industry, business type, GSTIN, registration details, years in business, turnover,
          net worth, number of employees, the states you work in, certifications, licences, equipment,
          manufacturer tie-ups, past projects and other qualifications. Where something doesn&rsquo;t apply, you
          answer &ldquo;None&rdquo; and we store that answer.</li>
        <li><strong>Your tenders:</strong> the PDFs you upload (including corrigenda), the text read from them,
          and the results of each analysis, corrigendum check and eligibility check. Also what you add to a
          tender yourself: its bid stage, your internal deadline, notes, the portal link and tender ID, which
          checklist items are ready, items you add to the checklist, and which client it is for.</li>
        <li><strong>Your clients</strong> (if you use client workspaces): the names of the firms you bid for and
          the profile details you enter for each, the same fields as the company profile. Please add a client
          only with that firm&rsquo;s agreement.</li>
        <li><strong>The tender search:</strong> public tender notices (title, organisation, department or state,
          reference number, tender ID, dates and, for GeM bids, the portal link) read from the Central Public
          Procurement Portal&rsquo;s public lists of central, state and GeM tenders. These are public notices, not
          about you; we don&rsquo;t download their documents, and we delete each one 60 days after it closes.
          Anyone can search them on our site without an account.</li>
        <li><strong>Signing in:</strong> a record of each signed-in session, including the name and version of
          your browser. We don&rsquo;t store your IP address with your account. When a sign-in code is requested
          for a mobile number, we keep the code (scrambled), the number and the IP address that asked for it for
          up to a day, to stop misuse, and then delete them.</li>
        <li><strong>Your plan and usage:</strong> your company&rsquo;s plan (free trial or a monthly plan) with its
          start and end dates, and how many tenders and analyses the company has used, for the plan and fair-use
          limits.</li>
        <li><strong>Visit counts:</strong> for each page shown on the website, we record the page, the date,
          the website you came from (for example google.com), the campaign name in the link if there is one,
          and whether you&rsquo;re on a phone or a computer. To count unique visitors without cookies, we also
          store a short code made from your connection and browser that changes every day and can&rsquo;t be
          traced back to you. Your IP address is not stored, and visit counts aren&rsquo;t linked to your
          account. For the public pages, our server also sends these details to Google Analytics (see
          &ldquo;Who we share it with&rdquo;).</li>
        <li><strong>Emails you send us.</strong></li>
      </ul>
    ),
  },
  {
    title: 'What we don’t do',
    body: (
      <ul>
        <li>We don&rsquo;t sell or rent your data, and we don&rsquo;t show advertising.</li>
        <li>The website has no advertising tools and loads no scripts from other companies, so no other company
          can follow you on it or set cookies. We count visits ourselves, as described above, without cookies, and
          our server passes the counts for the public pages to Google Analytics.</li>
        <li>We don&rsquo;t use your tenders or company details to market to anyone else.</li>
      </ul>
    ),
  },
  {
    title: 'How we use it',
    body: (
      <ul>
        <li>To run the service: signing you in, storing your tenders, analysing them and showing the
          results.</li>
        <li>To apply your plan&rsquo;s tender limit and the daily usage limits.</li>
        <li>To reply when you write to us, and to tell you about important changes to the service or this
          policy.</li>
        <li>To keep the service secure and to find and fix problems.</li>
        <li>To see how many people visit the website and where they come from, using the visit counts.</li>
      </ul>
    ),
  },
  {
    title: 'Who we share it with',
    body: (
      <>
        <p>Only the services we need to run {PRODUCT_NAME}:</p>
        <ul>
          <li><strong>OpenAI</strong> analyses your tenders. When you run an analysis, the text of the document
            is sent to OpenAI&rsquo;s API, and the same for a corrigendum you upload, together with the
            tender&rsquo;s key facts it is compared with. When you run an eligibility check, the tender&rsquo;s
            conditions and your company-profile details (or your client&rsquo;s, for a client&rsquo;s tender) are
            sent. OpenAI states that data sent through its API is not used to
            train its models and is kept for up to 30 days for abuse monitoring
            (<a href={OPENAI_DATA_POLICY} target="_blank" rel="noreferrer">OpenAI&rsquo;s data policy</a>).</li>
          <li><strong>Fly.io</strong> hosts our servers, database and file storage. Our main server, where
            uploaded files are kept, is in Singapore.</li>
          <li><strong>Google (Gmail)</strong> holds the emails you send us and our replies.</li>
          <li><strong>Google Analytics</strong> shows us how people find the website. Our server (not your
            browser) sends it the visit details for the public pages only (home, tender search, features,
            pricing, FAQ, about, this policy and sign-up): the page, the date, the website you came from, the
            campaign name in the link, phone or computer, and the daily code described above. It gets no cookie,
            no IP address, no account details and nothing from your tenders, and nothing from the pages you see
            when signed in.</li>
          <li><strong>Google sign-in:</strong> if you choose &ldquo;Continue with Google&rdquo;, Google confirms who
            you are and shares your name, email address and Google account ID with us.</li>
          <li><strong>Meta (WhatsApp)</strong> delivers sign-in codes: if you sign in with your mobile number, we
            send the code to that number through Meta&rsquo;s WhatsApp Business service, so Meta receives the number
            and the message.</li>
        </ul>
        <p>
          We will also share information if the law requires it. Inside {PRODUCT_NAME}, your tenders and
          company details are visible only to the members of your company&rsquo;s account; one company can never
          see another company&rsquo;s tenders.
        </p>
      </>
    ),
  },
  {
    title: 'Data stored outside India',
    body: (
      <p>
        Our servers are run by Fly.io, with the main server in Singapore, and OpenAI processes text on its own
        servers, which are also outside India. Google Analytics, which receives the visit counts for the public
        pages, also stores them outside India. Google and Meta, when you use their sign-in or WhatsApp codes, may
        also process your details outside India. By using {PRODUCT_NAME} you agree to your data being stored and
        processed there.
      </p>
    ),
  },
  {
    title: 'Cookies',
    body: (
      <p>
        We use two cookies, and both are needed to sign in: one keeps you logged in (for up to 30 days, and page
        scripts can&rsquo;t read it), and one protects your account against forged requests from other websites.
        While you sign in with Google, a third cookie lasting at most 10 minutes protects that sign-in from being
        hijacked. We use no other cookies.
      </p>
    ),
  },
  {
    title: 'How long we keep it, and deleting it',
    body: (
      <p>
        We keep your account, company details, clients and tenders for as long as your account exists. Removing a
        client deletes its profile straight away; its tenders stay, as your own. To have them
        deleted, email <Mail /> from the address you registered with, and we will delete your account, your
        company&rsquo;s data and your tenders, and confirm by email. Visit counts are deleted automatically
        after about 13 months.
      </p>
    ),
  },
  {
    title: 'Your choices',
    body: (
      <p>
        You can ask us for a copy of the personal data we hold about you, ask us to correct it, or ask us to
        delete it, by writing to <Mail />. If you have a complaint about how we handle your data, write to the
        same address and we will reply.
      </p>
    ),
  },
  {
    title: 'Security',
    body: (
      <p>
        The site is served only over an encrypted connection (HTTPS), passwords are stored hashed, every request
        for a tender is checked against the company it belongs to, and the website loads no outside scripts. No
        system is perfectly secure, so please use a password you don&rsquo;t use anywhere else.
      </p>
    ),
  },
  {
    title: 'Children',
    body: <p>{PRODUCT_NAME} is a business tool and is not meant for anyone under 18.</p>,
  },
  {
    title: 'Changes to this policy',
    body: (
      <p>
        If we change how we handle your data, we will update this page and the date below. If the change is
        significant, we will also email account holders before it takes effect.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <PublicLayout>
      <PageIntro kicker="Privacy" title="Privacy policy">
        <p>
          What {PRODUCT_NAME} collects, why, who it&rsquo;s shared with, and how to have it deleted. In short:
          we use your tenders only to analyse them for you, we count visits without cookies, and no other
          company&rsquo;s scripts run on the site.
        </p>
      </PageIntro>
      <section className="home-section legal-section">
        <div className="home-container legal-container">
          {SECTIONS.map((s) => (
            <section key={s.title} className="legal-block">
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <p className="legal-updated">Last updated: {LAST_UPDATED}. See also the <Link to="/faq">FAQ</Link>.</p>
        </div>
      </section>
    </PublicLayout>
  );
}
