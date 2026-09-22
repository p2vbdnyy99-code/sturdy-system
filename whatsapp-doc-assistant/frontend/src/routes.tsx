import { Navigate, Route, Routes } from 'react-router-dom';
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

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="page not-found">
      <h1>Page not found</h1>
    </div>
  );
}
