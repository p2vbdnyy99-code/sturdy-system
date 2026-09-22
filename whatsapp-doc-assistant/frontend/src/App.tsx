import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './auth/SessionProvider';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
