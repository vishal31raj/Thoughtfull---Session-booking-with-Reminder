import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfessionalDetailPage } from './pages/ProfessionalDetailPage';
import { ProfessionalsPage } from './pages/ProfessionalsPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import type { Role } from './api/types';

function Gate({ children, role }: { children: JSX.Element; role?: Role }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Opening ThoughtFull" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}

function Guest({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Guest><LoginPage /></Guest>} />
      <Route path="/register" element={<Guest><RegisterPage /></Guest>} />
      <Route element={<Gate><Layout /></Gate>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/professionals" element={<Gate role="MEMBER"><ProfessionalsPage /></Gate>} />
        <Route path="/professionals/:id" element={<Gate role="MEMBER"><ProfessionalDetailPage /></Gate>} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/availability" element={<Gate role="PROFESSIONAL"><AvailabilityPage /></Gate>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
