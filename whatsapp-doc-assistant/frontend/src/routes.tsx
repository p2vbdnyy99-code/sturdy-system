import { Link, Route, Routes } from 'react-router-dom';
import { RequireSession } from './auth/RequireSession';
import { RedirectIfAuthenticated } from './auth/RedirectIfAuthenticated';
import { CompanyGate } from './auth/CompanyGate';
import { LoginPage } from './pages/auth/Login';
import { RegisterPage } from './pages/auth/Register';
import { VerifyEmailPage } from './pages/auth/VerifyEmail';
import { CreateCompanyPage } from './pages/onboarding/CreateCompany';
import { DashboardPage } from './pages/Dashboard';
import { TenderDetailPage } from './pages/TenderDetail';
import { CompanyProfilePage } from './pages/settings/CompanyProfile';
import { HomePage } from './pages/Home';
import { PricingPage } from './pages/Pricing';
import { FaqPage } from './pages/Faq';
import { AboutPage } from './pages/About';
import { PrivacyPage } from './pages/Privacy';

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
        <Route
          path="/dashboard"
          element={
            <CompanyGate>
              <DashboardPage />
            </CompanyGate>
          }
        />
        <Route
          path="/tenders/:id"
          element={
            <CompanyGate>
              <TenderDetailPage />
            </CompanyGate>
          }
        />
        <Route
          path="/company-profile"
          element={
            <CompanyGate>
              <CompanyProfilePage />
            </CompanyGate>
          }
        />
      </Route>

      {/* Public homepage; it sends signed-in users on to /dashboard itself. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy-policy" element={<PrivacyPage />} />
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
