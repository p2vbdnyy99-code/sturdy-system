import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { PRODUCT_NAME } from '../config/product';
import { CONTACT_EMAIL, FOUNDER } from '../config/site';

// Every statement here describes what the code and hosting actually do
// (see BIDPILOT_ARCHITECTURE.md, "Privacy policy page"). Change this page
// whenever that changes: a new service provider, analytics, payments, or
// email sending.
const LAST_UPDATED = '8 October 2026';

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
        <li><strong>Your account:</strong> your email address, your name if you give it, and your password. The
          password is stored only in scrambled (hashed) form, so nobody, including us, can read it.</li>
        <li><strong>Your company:</strong> the company name, and any company-profile details you choose to fill
          in, such as GSTIN, turnover, net worth, years in business, certifications, licences, equipment and past
          experience.</li>
        <li><strong>Your tenders:</strong> the PDFs you upload, the text read from them, and the results of each
          analysis and eligibility check.</li>
        <li><strong>Signing in:</strong> a record of each signed-in session, including the name and version of
          your browser. We don&rsquo;t store your IP address in our database.</li>
        <li><strong>Usage counts:</strong> how many tenders and analyses each company has used, for the free
          trial and fair-use limits.</li>
        <li><strong>Emails you send us.</strong></li>
      </ul>
    ),
  },
  {
    title: 'What we don’t do',
    body: (
      <ul>
        <li>We don&rsquo;t sell or rent your data, and we don&rsquo;t show advertising.</li>
        <li>The website has no analytics, advertising or tracking tools, and loads no scripts from other
          companies.</li>
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
        <li>To apply the free-trial and daily usage limits.</li>
        <li>To reply when you write to us, and to tell you about important changes to the service or this
          policy.</li>
        <li>To keep the service secure and to find and fix problems.</li>
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
            is sent to OpenAI&rsquo;s API. When you run an eligibility check, the tender&rsquo;s conditions and
            your company-profile details are sent. OpenAI states that data sent through its API is not used to
            train its models and is kept for up to 30 days for abuse monitoring
            (<a href={OPENAI_DATA_POLICY} target="_blank" rel="noreferrer">OpenAI&rsquo;s data policy</a>).</li>
          <li><strong>Fly.io</strong> hosts our servers, database and file storage. Our main server, where
            uploaded files are kept, is in Singapore.</li>
          <li><strong>Google (Gmail)</strong> holds the emails you send us and our replies.</li>
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
        servers, which are also outside India. By using {PRODUCT_NAME} you agree to your data being stored and
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
        We use no other cookies.
      </p>
    ),
  },
  {
    title: 'How long we keep it, and deleting it',
    body: (
      <p>
        We keep your account, company details and tenders for as long as your account exists. To have them
        deleted, email <Mail /> from the address you registered with, and we will delete your account, your
        company&rsquo;s data and your tenders, and confirm by email.
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
          we use your tenders only to analyse them for you, and nothing on the site tracks you.
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
