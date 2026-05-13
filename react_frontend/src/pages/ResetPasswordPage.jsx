import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { verifyResetToken, resetPassword } from '../lib/api'
import AccfinoLogo from '../components/ui/AccfinoLogo.jsx'
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const [searchParams]              = useSearchParams()
  const navigate                    = useNavigate()
  const token                       = searchParams.get('token') || ''

  const [status,   setStatus]       = useState('verifying') // verifying | valid | invalid | success
  const [email,    setEmail]        = useState('')
  const [pw,       setPw]           = useState('')
  const [pwConf,   setPwConf]       = useState('')
  const [showPw,   setShowPw]       = useState(false)
  const [loading,  setLoading]      = useState(false)
  const [err,      setErr]          = useState('')

  // Verify token on mount
  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    verifyResetToken(token)
      .then(res => { setEmail(res.data.email); setStatus('valid') })
      .catch(() => setStatus('invalid'))
  }, [token])

  const handleSubmit = async e => {
    e.preventDefault()
    setErr('')

    if (pw.length < 8) {
      setErr('Password must be at least 8 characters.'); return
    }
    if (pw !== pwConf) {
      setErr('Passwords do not match.'); return
    }

    setLoading(true)
    try {
      await resetPassword(token, pw)
      setStatus('success')
      toast.success('Password updated!')
      setTimeout(() => navigate('/login'), 2500)
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Reset failed. The link may have expired.')
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
              Choose a new password
            </h2>
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.9rem', lineHeight: 1.7 }}>
              Pick something strong — at least 8 characters with a mix of letters, numbers and symbols.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="login-right">
        <div className="login-form-wrap">

          {status === 'verifying' && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <span className="spinner" style={{ width: 32, height: 32 }} />
              <p style={{ marginTop: 16, color: 'var(--text-3)' }}>Verifying reset link…</p>
            </div>
          )}

          {status === 'invalid' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <XCircle size={48} color="var(--error, #e53e3e)" style={{ marginBottom: 16 }} />
              <h2 style={{ marginBottom: 8 }}>Link invalid or expired</h2>
              <p style={{ color: 'var(--text-3)', lineHeight: 1.7, fontSize: '.9rem' }}>
                This reset link is invalid or has expired (links are valid for 30 minutes).
                Please request a new one.
              </p>
              <Link to="/forgot-password">
                <button className="btn btn-primary btn-full" style={{ marginTop: 24 }}>
                  Request new link
                </button>
              </Link>
            </div>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle2 size={48} color="var(--brand)" style={{ marginBottom: 16 }} />
              <h2 style={{ marginBottom: 8 }}>Password updated!</h2>
              <p style={{ color: 'var(--text-3)', lineHeight: 1.7, fontSize: '.9rem' }}>
                Your password has been changed. Redirecting to sign in…
              </p>
            </div>
          )}

          {status === 'valid' && (
            <>
              <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>New password</h1>
                {email && (
                  <p style={{ color: 'var(--text-3)', fontSize: '.875rem' }}>
                    Setting password for <strong>{email}</strong>
                  </p>
                )}
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div className="input-group">
                  <label>New password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      type={showPw ? 'text' : 'password'}
                      value={pw}
                      onChange={e => { setPw(e.target.value); setErr('') }}
                      required
                      placeholder="Min. 8 characters"
                      autoFocus
                      style={{ paddingRight: 42 }}
                    />
                    <button type="button" onClick={() => setShowPw(s => !s)} style={{
                      position: 'absolute', right: 12, top: '50%',
                      transform: 'translateY(-50%)', background: 'none',
                      border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                      display: 'flex', padding: 0,
                    }}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label>Confirm new password</label>
                  <input
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    value={pwConf}
                    onChange={e => { setPwConf(e.target.value); setErr('') }}
                    required
                    placeholder="Repeat password"
                  />
                </div>

                {/* Password strength hint */}
                {pw.length > 0 && (
                  <div style={{
                    fontSize: '.78rem', color: pw.length >= 8 ? 'var(--brand)' : 'var(--text-3)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {pw.length >= 8
                      ? <CheckCircle2 size={13} />
                      : <XCircle size={13} />}
                    {pw.length >= 8 ? 'Password length OK' : `${8 - pw.length} more character(s) needed`}
                  </div>
                )}

                {err && <div className="alert alert-error">{err}</div>}

                <button
                  className="btn btn-primary btn-xl btn-full"
                  type="submit"
                  disabled={loading}
                  style={{ marginTop: 4 }}
                >
                  {loading
                    ? <><span className="spinner spinner-sm" /> Updating…</>
                    : 'Update Password'}
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
