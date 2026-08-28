import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell, type NavItem } from './components/layout/AppShell';
import CatalogPage from './pages/CatalogPage';
import ListingDetailPage from './pages/ListingDetailPage';
import LoginPage from './pages/LoginPage';
import ModerationQueuePage from './pages/ModerationQueuePage';
import SubmitListingPage from './pages/SubmitListingPage';
import UsersPage from './pages/UsersPage';

// Static until a session exists (MAR-42) — AppShell's nav slot just
// renders whatever list it's given, role-filtering is the caller's job.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Catalog', end: true },
  { to: '/submit', label: 'Submit listing' },
  { to: '/moderation', label: 'Moderation' },
  { to: '/users', label: 'Users' },
  { to: '/login', label: 'Login' },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell brand="The Commons" tagline="Catalog" navItems={NAV_ITEMS}>
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/listings/:id" element={<ListingDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/submit" element={<SubmitListingPage />} />
            <Route path="/moderation" element={<ModerationQueuePage />} />
            <Route path="/users" element={<UsersPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
