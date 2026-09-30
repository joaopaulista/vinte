import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { PendingCountProvider } from '@/contexts/PendingCountContext';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { AppLayout } from '@/components/common/AppLayout';
import { MissingConfig } from '@/components/common/MissingConfig';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Reconciliation from '@/pages/Reconciliation';
import Accounts from '@/pages/Accounts';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider>
        <MissingConfig />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Signup />} />

            <Route
              element={
                <ProtectedRoute>
                  <PendingCountProvider>
                    <AppLayout />
                  </PendingCountProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/conciliacao" element={<Reconciliation />} />
              <Route path="/transacoes" element={<Transactions />} />
              <Route path="/contas" element={<Accounts />} />
              <Route path="/configuracoes" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
