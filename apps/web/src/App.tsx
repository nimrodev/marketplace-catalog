import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { USER_ROLE_RANK, UserRole, type AuthUser } from '@marketplace/shared';
import { AppShell, type NavItem } from './components/layout/AppShell';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import CatalogPage from './pages/CatalogPage';
import EditListingPage from './pages/EditListingPage';
import ListingDetailPage from './pages/ListingDetailPage';
import LoginPage from './pages/LoginPage';
import ModerationQueuePage from './pages/ModerationQueuePage';
import MyListingsPage from './pages/MyListingsPage';
import SubmitListingPage from './pages/SubmitListingPage';
import UsersPage from './pages/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Additive by rank, not per-role lists — USER_ROLE_RANK ranks roles rather
// than partitioning them, so a MODERATOR/ADMIN keeps every CONTRIBUTOR item.
function navItemsFor(user: AuthUser | null): NavItem[] {
  const items: NavItem[] = [{ to: '/', label: 'Catalog', end: true }];
  if (!user) {
    items.push({ to: '/login', label: 'Login' });
    return items;
  }
  items.push({ to: '/submit', label: 'Submit listing' }, { to: '/my-listings', label: 'My Listings' });
  if (USER_ROLE_RANK[user.role] >= USER_ROLE_RANK[UserRole.MODERATOR]) {
    items.push({ to: '/moderation', label: 'Moderation queue' });
  }
  // The Users link stays out of the nav until the admin API/screen exists.
  return items;
}

function AppRoutes() {
  const { user, logout } = useAuth();

  return (
    <AppShell
      brand="ReMarket"
      tagline="Curated finds. Happy exchanges."
      navItems={navItemsFor(user)}
      user={user ? { displayName: user.email, roleLabel: user.role } : undefined}
      onLogout={user ? logout : undefined}
    >
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/listings/:id" element={<ListingDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/submit"
          element={
            <RequireAuth>
              <SubmitListingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/listings/:id/edit"
          element={
            <RequireAuth>
              <EditListingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/my-listings"
          element={
            <RequireAuth>
              <MyListingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/moderation"
          element={
            <RequireAuth>
              <RequireRole role={UserRole.MODERATOR}>
                <ModerationQueuePage />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth>
              <RequireRole role={UserRole.ADMIN}>
                <UsersPage />
              </RequireRole>
            </RequireAuth>
          }
        />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
