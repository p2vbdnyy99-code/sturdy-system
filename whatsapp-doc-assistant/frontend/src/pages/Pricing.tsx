import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { Icon } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { CONTACT_EMAIL, FREE_TRIAL_TENDERS, PLANS } from '../config/site';

// A free trial, then monthly plans (enforced by the server, see
// backend/src/bidpilot/plans.js). There is no online payment yet: a firm
// subscribes by email, and nothing is ever charged automatically.
const INCLUDED = [
  'Key facts: deadline, EMD, fee, estimated value',
  'Eligibility checklist and check against your company profile',
  'BOQ items and key dates',
  'Risky clauses flagged',
  'Page reference and quoted text for every point',
];

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function PricingPage() {
  return (
    <PublicLayout>
      <PageIntro kicker="Pricing" title={`Start with ${FREE_TRIAL_TENDERS} tenders free`}>
        <p>
          Try every feature of {PRODUCT_NAME} on your first {FREE_TRIAL_TENDERS} tenders, free. After that, choose
          a monthly plan by how many tenders you analyse. Nothing is ever charged automatically.
        </p>
        <p>Want to see the output first? <Link to="/sample-analysis">Here is a real analysis of a public tender</Link>.</p>
      </PageIntro>

      <section className="home-section pricing-section">
        <div className="home-container">
          <div className="pricing-beta">
            <div>
              <span className="pricing-badge">Early access</span>
              <h2>Free trial</h2>
              <p className="pricing-price">{inr(0)}<span> for your first {FREE_TRIAL_TENDERS} tenders</span></p>
              <p className="muted">No card needed. Fair-use limits apply so the service stays fast for everyone.</p>
              <Link to="/register" className="btn-link btn-accent btn-lg">Start your free trial <Icon name="arrowRight" /></Link>
            </div>
            <ul className="pricing-included">
              {INCLUDED.map((f) => <li key={f}><Icon name="check" />{f}</li>)}
            </ul>
          </div>

          <h2 className="pricing-planned-heading">Monthly plans</h2>
          <p className="muted pricing-planned-note">
            Every plan includes everything listed above; they differ only in how many new tenders you can analyse
            each month. Unused tenders don&rsquo;t carry over to the next month.
          </p>
          <div className="pricing-plans">
            {PLANS.map((plan) => (
              <div key={plan.name} className="pricing-plan">
                <p className="pricing-plan-name">{plan.name}</p>
                <p className="pricing-price">{inr(plan.pricePerMonth)}<span> / month</span></p>
                <p className="pricing-plan-quota">{plan.tendersPerMonth} tenders a month</p>
                <p className="muted">{plan.forWho}</p>
                {CONTACT_EMAIL && (
                  <a className="btn-link btn-primary pricing-plan-cta"
                    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Subscribe to the ${plan.name} plan`)}`}>
                    Choose {plan.name}
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="pricing-questions">
            <div>
              <h3>What counts as one tender?</h3>
              <p>One tender PDF analysed. Re-running the same tender and checking eligibility against your company
                profile are included.</p>
            </div>
            <div>
              <h3>How do I subscribe?</h3>
              <p>{CONTACT_EMAIL
                ? <>Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the plan you want and your company
                  name. We&rsquo;ll send the payment details, and your plan starts when the payment is received.</>
                : <>Write to us with the plan you want and your company name.</>}</p>
            </div>
            <div>
              <h3>What happens after my free trial?</h3>
              <p>Your company profile and analysed tenders stay in your account, and you can still open and re-run
                them. To analyse new tenders, choose a monthly plan. <Link to="/faq">More questions</Link></p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
