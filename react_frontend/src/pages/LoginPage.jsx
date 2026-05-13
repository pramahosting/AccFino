import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { register } from '../lib/api.js'
import AccfinoLogo from '../components/ui/AccfinoLogo.jsx'
import { Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

const FEATURES = [
  'Bank reconciliation with automatic internal transfer detection',
  'GST calculation & BAS-ready classification',
  'ML-powered GL account to-classification',
  'Multi-bank CSV import with session persistence',
  'Excel export with monthly summaries',
]

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [tab,    setTab]    = useState('login')
  const [showPw, setShowPw] = useState(false)
  const [err,    setErr]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form,   setForm]   = useState({
    email: '', password: '', name: '', username: '', role: 'user', phone: '', address: ''
  })

  const set = k => e => { setForm(f => ({ ...f, [k]: e.target.value })); setErr('') }

  const handleLogin = async e => {
    e.preventDefault(); setErr('')
    const res = await login(form.email, form.password)
    if (res.ok) {
      navigate('/', { replace: true })
    } else {
      setErr(res.error)
    }
  }

  const handleRegister = async e => {
    e.preventDefault(); setErr(''); setSubmitting(true)
    try {
      await register({
        username:  form.username.trim(),
        full_name: form.name.trim(),
        email:     form.email.trim(),
        password:  form.password.trim(),
        role:      form.role,
        phone:     form.phone.trim(),
        address:   form.address.trim(),
      })
      toast.success('Account created — please sign in')
      setTab('login')
      setForm(f => ({ ...f, password: '' }))
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Registration failed. Email or username may already exist.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">

      {/* ── Left panel — brand ── */}
      <div className="login-left">
        <div className="login-brand-card">
          <AccfinoLogo size={44} showText textColor="#fff" />

          <div style={{ marginTop: 36, marginBottom: 28 }}>
            <h2 style={{ color: '#fff', fontSize: '1.5rem', fontFamily: "'Sora',sans-serif", marginBottom: 8 }}>
              Intelligent Accounting<br />for Australian Business
            </h2>
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.9rem', lineHeight: 1.7 }}>
              Bank account reconciliation, GST management, and financial analysis — all in one place.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <CheckCircle2 size={16} color="#FF6B35" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.12)' }}>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['AUS', 'AU'], ['GST', '10%'], ['BAS', 'Ready']].map(([l, v]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '.6rem', fontWeight: 700, color: '#FF6B35' }}>{v}</div>
                  <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.4)', letterSpacing: '.05em', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="login-right">
        <div className="login-form-wrap">
          {/* Mobile logo */}
          <div style={{ display: 'none', marginBottom: 28 }} className="mobile-logo">
            <AccfinoLogo size={36} showText textColor="var(--text-1)" light />
          </div>

          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>
              {tab === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: '.875rem' }}>
              {tab === 'login'
                ? 'Sign in to your Accfino account'
                : 'Start your free account today'}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: 'var(--surface-3)', borderRadius: 'var(--r-md)',
            padding: 3, marginBottom: 24, gap: 2,
          }}>
            {['login', 'register'].map(t => (
              <button key={t} onClick={() => { setTab(t); setErr('') }} style={{
                flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
                borderRadius: 'var(--r-sm)', fontFamily: 'inherit', fontWeight: tab === t ? 700 : 500,
                fontSize: '.875rem', transition: 'all .15s',
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--brand)' : 'var(--text-3)',
                boxShadow: tab === t ? 'var(--sh-sm)' : 'none',
              }}>
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label>Email or Username</label>
                <input className="input" type="text" value={form.email} onChange={set('email')}
                  required placeholder="you@company.com.au" autoFocus autoComplete="username" />
              </div>

              <div className="input-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={set('password')} required placeholder="••••••••"
                    style={{ paddingRight: 42 }} autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                    display: 'flex', padding: 0,
                  }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {err && <div className="alert alert-error">{err}</div>}

              <button className="btn btn-primary btn-xl btn-full" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? <><span className="spinner spinner-sm" /> Signing in…</> : <>Sign In <ArrowRight size={16}/></>}
              </button>

            </form>

          ) : (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div className="grid-2">
                <div className="input-group">
                  <label>Full Name</label>
                  <input className="input" type="text" value={form.name} onChange={set('name')} required placeholder="Jane Smith" />
                </div>
                <div className="input-group">
                  <label>Username</label>
                  <input className="input" type="text" value={form.username} onChange={set('username')} required placeholder="jsmith" />
                </div>
              </div>
              <div className="input-group">
                <label>Email</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} required placeholder="jane@company.com.au" />
              </div>
              <div className="input-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={set('password')} required placeholder="Min. 8 characters" style={{ paddingRight: 42 }} />
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 0,
                  }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="grid-2">
                <div className="input-group">
                  <label>Phone (optional)</label>
                  <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+61 4xx xxx xxx" />
                </div>
                <div className="input-group">
                  <label>Role</label>
                  <select value={form.role} onChange={set('role')}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {err && <div className="alert alert-error">{err}</div>}

              <button className="btn btn-primary btn-xl btn-full" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
                {submitting ? <><span className="spinner spinner-sm" /> Creating account…</> : <>Create Account <ArrowRight size={16}/></>}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '.75rem', marginTop: 28 }}>
            © {new Date().getFullYear()} Accfino · Accounting Platform<br />
            <span style={{ opacity: .6 }}>Powered by Prama AI engine</span>
          </p>
        </div>
      </div>
    </div>
  )
}
