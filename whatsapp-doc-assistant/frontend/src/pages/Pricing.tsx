import { Link } from 'react-router-dom';
import { PublicLayout, PageIntro } from '../components/PublicLayout';
import { Icon } from '../components/Icon';
import { PRODUCT_NAME } from '../config/product';
import { FREE_TRIAL_TENDERS, PLANNED_PLANS } from '../config/site';

// Nothing is billed today: there is no payment code. Early access starts
// with a free trial; the paid plans are shown as planned, so contractors can
// say whether the price makes sense.
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
      <PageIntro kicker="Early access pricing" title={`Start with ${FREE_TRIAL_TENDERS} tenders free`}>
        <p>
          {PRODUCT_NAME} is in early access. Your free trial includes every feature for your first
          {' '}{FREE_TRIAL_TENDERS} tenders. Paid plans aren&rsquo;t switched on yet; we&rsquo;ll tell you before
          anything is charged, and nothing is ever charged automatically.
        </p>
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

          <h2 className="pricing-planned-heading">Plans after your free trial</h2>
          <p className="muted pricing-planned-note">
            Prices may change before launch, and GST may apply. Every plan includes everything listed above;
            they differ only in how many tenders you can analyse each month.
          </p>
          <div className="pricing-plans">
            {PLANNED_PLANS.map((plan) => (
              <div key={plan.name} className="pricing-plan">
                <p className="pricing-plan-name">{plan.name}</p>
                <p className="pricing-price">{inr(plan.pricePerMonth)}<span> / month</span></p>
                <p className="pricing-plan-quota">{plan.tendersPerMonth} tenders a month</p>
                <p className="muted">{plan.forWho}</p>
              </div>
            ))}
          </div>

          <div className="pricing-questions">
            <div>
              <h3>What counts as one tender?</h3>
              <p>One tender PDF analysed. Checking eligibility against your company profile is included.</p>
            </div>
            <div>
              <h3>What happens after my free trial?</h3>
              <p>Your company profile and analysed tenders stay in your account. Paid plans aren&rsquo;t live yet, and
                we&rsquo;ll contact you before anything changes.</p>
            </div>
            <div>
              <h3>Have a view on the price?</h3>
              <p>Tell us. Early-access users&rsquo; feedback decides the final plans. <Link to="/faq">More questions</Link></p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
