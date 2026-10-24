import { Link, Route, Routes } from 'react-router-dom';
import { RequireSession } from './auth/RequireSession';
import { RedirectIfAuthenticated } from './auth/RedirectIfAuthenticated';
import { CompanyGate } from './auth/CompanyGate';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/auth/Login';
import { RegisterPage } from './pages/auth/Register';
import { VerifyEmailPage } from './pages/auth/VerifyEmail';
import { CreateCompanyPage } from './pages/onboarding/CreateCompany';
import { DashboardPage } from './pages/Dashboard';
import { TenderDetailPage } from './pages/TenderDetail';
import { CompanyProfilePage } from './pages/settings/CompanyProfile';
import { ClientsPage } from './pages/Clients';
import { FeedPage } from './pages/Feed';
import { HomePage } from './pages/Home';
import { PricingPage } from './pages/Pricing';
import { FaqPage } from './pages/Faq';
import { AboutPage } from './pages/About';
import { PrivacyPage } from './pages/Privacy';
import { GovernmentTendersPage } from './pages/GovernmentTenders';
import { FeaturesPage } from './pages/Features';
import { SampleAnalysisPage } from './pages/SampleAnalysis';
import { InsightsPage } from './pages/Insights';
import { GuidesPage } from './pages/guides/Guides';
import { EligibilityGuidePage } from './pages/guides/EligibilityGuide';
import { EmdGuidePage } from './pages/guides/EmdGuide';
import { CorrigendumGuidePage } from './pages/guides/CorrigendumGuide';

// M5d added /tenders/:id. /company-profile added Beta Readiness — the
// eligibility engine's other required input had a working API client
// (api/companies.ts) and backend route since earlier work but no page.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      {/* Verifying a link must work regardless of auth state (the user may
          not be logged in yet on the device that receives the email). */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<RequireSession />}>
        <Route path="/onboarding/create-company" element={<CreateCompanyPage />} />
        {/* One shared frame (rail + tender queue) for every page that needs
            a company; see components/AppShell.tsx. */}
        <Route element={<CompanyGate><AppShell /></CompanyGate>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tenders/:id" element={<TenderDetailPage />} />
          <Route path="/company-profile" element={<CompanyProfilePage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/clients/:clientId/profile" element={<CompanyProfilePage />} />
        </Route>
      </Route>

      {/* Public homepage; it sends signed-in users on to /dashboard itself. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/government-tenders" element={<GovernmentTendersPage />} />
      <Route path="/government-tenders/:group/:slug" element={<GovernmentTendersPage />} />
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/sample-analysis" element={<SampleAnalysisPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy-policy" element={<PrivacyPage />} />
      <Route path="/guides" element={<GuidesPage />} />
      <Route path="/guides/tender-eligibility-check" element={<EligibilityGuidePage />} />
      <Route path="/guides/emd-exemption" element={<EmdGuidePage />} />
      <Route path="/guides/tender-corrigendum" element={<CorrigendumGuidePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="page not-found">
      <h1>Page not found</h1>
      <p className="muted">The link may be old or mistyped.</p>
      <Link to="/" className="btn-link btn-primary">Go to the homepage</Link>
    </div>
  );
}
