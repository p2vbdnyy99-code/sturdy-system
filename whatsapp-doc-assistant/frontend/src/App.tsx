import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './auth/SessionProvider';
import { AppRoutes } from './routes';
import { VisitTracker } from './components/VisitTracker';

export default function App() {
  return (
    <BrowserRouter>
      <VisitTracker />
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
