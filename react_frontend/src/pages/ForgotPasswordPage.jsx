import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../lib/api'
import AccfinoLogo from '../components/ui/AccfinoLogo.jsx'
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await forgotPassword(email.trim())
      setSubmitted(true)
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">

      {/* ── Left panel ── */}
      <div className="login-left">
        <div className="login-brand-card">
          <AccfinoLogo size={44} showText textColor="#fff" />
          <div style={{ marginTop: 36 }}>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', fontFamily: "'Sora',sans-serif", marginBottom: 8 }}>
              Forgot your password?
            </h2>
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.9rem', lineHeight: 1.7 }}>
              No worries — we'll email you a secure reset link. It expires in 30 minutes.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="login-right">
        <div className="login-form-wrap">

          <Link to="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--text-3)', fontSize: '.85rem', textDecoration: 'none',
            marginBottom: 28,
          }}>
            <ArrowLeft size={14} /> Back to Sign In
          </Link>

          {submitted ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle2 size={48} color="var(--brand)" style={{ marginBottom: 16 }} />
              <h2 style={{ marginBottom: 8 }}>Check your email</h2>
              <p style={{ color: 'var(--text-3)', lineHeight: 1.7, fontSize: '.9rem' }}>
                If <strong>{email}</strong> is registered, you'll receive a reset link shortly.
                Check your spam folder if it doesn't arrive within a few minutes.
              </p>
              <Link to="/login">
                <button className="btn btn-primary btn-full" style={{ marginTop: 28 }}>
                  Back to Sign In
                </button>
              </Link>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>Reset password</h1>
                <p style={{ color: 'var(--text-3)', fontSize: '.875rem' }}>
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="input-group">
                  <label>Email address</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setErr('') }}
                      required
                      placeholder="you@company.com.au"
                      autoFocus
                      style={{ paddingLeft: 38 }}
                    />
                    <Mail size={15} style={{
                      position: 'absolute', left: 12, top: '50%',
                      transform: 'translateY(-50%)', color: 'var(--text-3)',
                    }} />
                  </div>
                </div>

                {err && <div className="alert alert-error">{err}</div>}

                <button
                  className="btn btn-primary btn-xl btn-full"
                  type="submit"
                  disabled={loading}
                  style={{ marginTop: 4 }}
                >
                  {loading
                    ? <><span className="spinner spinner-sm" /> Sending…</>
                    : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}

          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '.75rem', marginTop: 32 }}>
            © {new Date().getFullYear()} Accfino · Australian Accounting Platform
          </p>
        </div>
      </div>
    </div>
  )
}
