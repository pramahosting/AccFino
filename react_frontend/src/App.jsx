import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Layout                from './components/layout/Layout.jsx'
import LoginPage             from './pages/LoginPage.jsx'
import DashboardPage         from './pages/DashboardPage.jsx'
import ReconciliationPage    from './pages/ReconciliationPage.jsx'
import TradingPage           from './pages/TradingPage.jsx'
import CashFlowPage          from './pages/CashFlowPage.jsx'
import InvoicePage           from './pages/InvoicePage.jsx'
import AdminPage             from './pages/AdminPage.jsx'
import PaymentPage           from './pages/PaymentPage.jsx'
import FileManagerPage       from './pages/FileManagerPage.jsx'
import LicencePage           from './pages/LicencePage.jsx'
import ResetPasswordPage     from './pages/ResetPasswordPage.jsx'

function Guard({ children, adminOnly }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin')
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/upgrade"         element={<PaymentPage />} />
      <Route path="/login"          element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <ResetPasswordPage />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index                    element={<DashboardPage />} />
        <Route path="reconciliation"    element={<ReconciliationPage />} />
        <Route path="trading"           element={<TradingPage />} />
        <Route path="cash-flow"         element={<CashFlowPage />} />
        <Route path="invoice"           element={<InvoicePage />} />
        <Route path="admin"             element={<Guard adminOnly><AdminPage /></Guard>} />
        <Route path="file-manager"      element={<Guard adminOnly><FileManagerPage /></Guard>} />
        <Route path="licence"           element={<Guard adminOnly><LicencePage /></Guard>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{
        duration: 3500,
        style: { fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif", fontSize:'.875rem', borderRadius:'10px', boxShadow:'0 8px 24px rgba(15,25,36,.12)' },
        success: { iconTheme: { primary:'#0B6E4F', secondary:'#fff' } },
      }} />
      <AppRoutes />
    </AuthProvider>
  )
}
