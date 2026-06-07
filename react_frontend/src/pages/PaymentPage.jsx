import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/ui/TopBar.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { createCheckout, getMyPlan, getPricingPlans } from '../lib/api'
import { Check, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import AccfinoLogo from '../components/ui/AccfinoLogo.jsx'

// Keys treated as bundles (shown separately at the bottom)
const BUNDLE_KEYS = ['premium']
// Keys never shown as purchasable plans
const HIDDEN_KEYS = ['base', 'admin', 'file-manager', 'licence', 'dashboard']

// All prices + labels come exclusively from pricing.json via API
export default function PaymentPage() {
  const { user }       = useAuth()
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()

  const [plans,     setPlans]     = useState({})   // raw API response
  const [modPlans,  setModPlans]  = useState([])   // individual module plans [{key, plan}]
  const [bndPlans,  setBndPlans]  = useState([])   // bundle plans [{key, plan}]
  const [myPlan,    setMyPlan]    = useState(null)
  const [billing,   setBilling]   = useState('monthly')
  const [selKeys,   setSelKeys]   = useState([])   // selected plan keys
  const [selBundle, setSelBundle] = useState(null)
  const [paying,    setPaying]    = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('🎉 Payment successful! Your plan has been upgraded.')
      window.dispatchEvent(new Event('accfino:modules-changed'))
      setTimeout(() => navigate(user ? '/' : '/login', { replace: true }), 1500)
    }
    if (searchParams.get('cancelled')) toast('Payment cancelled.', { icon: 'ℹ️' })
  }, [])

  useEffect(() => {
    Promise.all([
      getPricingPlans(),
      user?.id ? getMyPlan(user.id) : Promise.resolve({ data: null }),
    ]).then(([pr, mr]) => {
      const api = pr.data || {}
      setPlans(api)
      setMyPlan(mr.data)
      // Split into module plans and bundle plans
      const mods = [], bnds = []
      Object.entries(api).forEach(([key, plan]) => {
        if (HIDDEN_KEYS.includes(key)) return
        if (BUNDLE_KEYS.includes(key)) bnds.push({ key, plan })
        else mods.push({ key, plan })
      })
      setModPlans(mods)
      setBndPlans(bnds)
    }).catch(() => toast.error('Could not load pricing — please refresh.'))
      .finally(() => setLoading(false))
  }, [user?.id])

  const toggleMod = (key) => {
    setSelBundle(null)
    setSelKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const selectBundle = (key) => {
    if (selBundle === key) { setSelBundle(null); setSelKeys([]) }
    else { setSelBundle(key); setSelKeys([]) }
  }

  // Calculate total price
  const calcTotal = () => {
    if (selBundle) {
      const b = plans[selBundle]
      if (!b) return 0
      return billing === 'yearly' ? b.price_yearly : b.price_monthly
    }
    return selKeys.reduce((sum, k) => {
      const p = plans[k]
      if (!p) return sum
      return sum + (billing === 'yearly' ? p.price_yearly : p.price_monthly)
    }, 0)
  }

  const totalPrice = calcTotal()
  const isFree     = totalPrice === 0 && !selBundle && !selKeys.length
  const isLoggedIn = !!user

  const selectedLabel = () => {
    if (selBundle) return plans[selBundle]?.name || selBundle
    if (!selKeys.length) return plans.base?.name || 'Vault'
    return selKeys.map(k => plans[k]?.name || k).join(' + ')
  }

  const handleCheckout = async () => {
    if (!isLoggedIn) { navigate('/login'); return }
    if (!selBundle && !selKeys.length) { navigate('/'); return }
    setPaying(true)
    try {
      const allMods = selBundle
        ? (plans[selBundle]?.modules || [])
        : [...new Set(['dashboard', 'reconciliation', ...selKeys.flatMap(k => plans[k]?.modules || [k])])]
      const planId = selBundle || (selKeys.length === 1 ? selKeys[0] : 'custom')
      const { data } = await createCheckout({
        plan_id:        planId,
        billing_period: billing,
        user_id:        user.id,
        user_email:     user.email,
        modules:        allMods,
        amount:         totalPrice,
        plan_name:      selectedLabel(),
      })
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Checkout failed')
    } finally { setPaying(false) }
  }

  // Left panel: all plans from API in order
  const leftPlans = [
    { name: plans.base?.name || 'Vault', price: 'Free', desc: plans.base?.description || '' },
    ...modPlans.map(({ key, plan }) => ({
      name:  plan.name,
      price: plan.price_monthly ? `$${plan.price_monthly / 100}/mo` : '…',
      desc:  plan.description || '',
    })),
    ...bndPlans.map(({ key, plan }) => ({
      name:  plan.name,
      price: plan.price_monthly ? `$${plan.price_monthly / 100}/mo` : '…',
      desc:  plan.description || '',
    })),
  ]

  const ICONS = { trading:'📈', cashflow:'💰', 'cash-flow':'💰', invoice:'🧾', premium:'⭐', ultra:'⭐' }

  return (
    <>
    <TopBar
      variant="marketing"
      onSignIn={() => navigate('/login')}
      onStartFree={() => navigate('/login?tab=register')}
    />

    <div className="login-page" style={{ paddingTop: 56 }}>

      {/* ── Left panel ── */}
      <div className="login-left" style={{
        flex: '0 0 320px', padding: '32px',
        alignItems: 'flex-start', justifyContent: 'flex-start',
        paddingTop: '48px',
      }}>
        <div style={{ width: '100%' }}>
          <div style={{ marginTop: 28, marginBottom: 24 }}>
            <h2 style={{ color:'#fff', fontSize:'1.3rem', fontFamily:"'Instrument Serif', serif", marginBottom:8 }}>
              Choose what you need
            </h2>
            <p style={{ color:'rgba(255,255,255,.6)', fontSize:'.85rem', lineHeight:1.7 }}>
              Pick individual modules or save with a bundle. Start free, upgrade anytime.
            </p>
          </div>

          {/* Plan list from API */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {leftPlans.map(p => (
              <div key={p.name} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <Check size={13} color="#FF6B35" style={{ marginTop:3, flexShrink:0 }}/>
                <div>
                  <span style={{ fontSize:'.82rem', fontWeight:700, color:'#fff' }}>{p.name}</span>
                  <span style={{ fontSize:'.82rem', color:'rgba(255,255,255,.55)' }}> — {p.price}</span>
                  {p.desc && <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.38)', lineHeight:1.4, marginTop:1 }}>{p.desc}</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop:28, paddingTop:18, borderTop:'1px solid rgba(255,255,255,.12)',
            fontSize:'.75rem', color:'rgba(255,255,255,.35)', lineHeight:1.7 }}>
            🔒 Secured by Stripe · Cancel anytime · AUD pricing incl. GST
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="login-right" style={{
        width:'auto', flex:1, padding:'32px 40px',
        overflowY:'auto', alignItems:'flex-start',
      }}>
        <div className="login-form-wrap" style={{ maxWidth:720, width:'100%' }}>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={() => window.location.href = isLoggedIn ? '/' : '/index-marketing.html'}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)',
                fontSize:'.82rem', padding:0, display:'flex', alignItems:'center', gap:4 }}>
              ← {isLoggedIn ? 'Back to Dashboard' : 'Back'}
            </button>
            {myPlan && (
              <span style={{ fontSize:'.75rem', color:'var(--text-3)' }}>
                Current: <strong>{plans[myPlan.plan_id]?.name || myPlan.plan_id}</strong>
              </span>
            )}
          </div>

          <h1 style={{ fontSize:'1.4rem', marginBottom:4 }}>Subscription Plans</h1>
          <p style={{ color:'var(--text-3)', fontSize:'.85rem', marginBottom:20 }}>
            Select a plan — price updates instantly.
          </p>

          {/* Billing toggle */}
          <div style={{ display:'flex', background:'var(--surface-3)', borderRadius:'var(--r-md)',
            padding:3, marginBottom:20, gap:2 }}>
            {['monthly','yearly'].map(p => (
              <button key={p} onClick={() => setBilling(p)} style={{
                flex:1, padding:'7px', border:'none', cursor:'pointer',
                borderRadius:'var(--r-sm)', fontFamily:'inherit',
                fontWeight: billing===p ? 700 : 500, fontSize:'.82rem',
                background: billing===p ? 'var(--surface)' : 'transparent',
                color: billing===p ? 'var(--brand)' : 'var(--text-3)',
                boxShadow: billing===p ? 'var(--sh-sm)' : 'none', transition:'all .15s',
              }}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
                {p==='yearly' && <span style={{ marginLeft:6, fontSize:'.68rem', color:'#38A169', fontWeight:700 }}>SAVE 17%</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:30, color:'var(--text-3)' }}>
              <span className="spinner"/> Loading…
            </div>
          ) : (<>

          {/* ── Base (free) plan ── */}
          <div style={{
            border:'2px solid var(--brand)', borderRadius:'var(--r-lg)',
            padding:'16px', marginBottom:16, background:'var(--brand-light)',
            cursor:'pointer', position:'relative',
          }} onClick={() => { setSelKeys([]); setSelBundle(null) }}>
            <div style={{ position:'absolute', top:12, right:12, width:18, height:18,
              borderRadius:'50%', border:'2px solid var(--brand)', background:'var(--brand)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Check size={10} color="#fff" strokeWidth={3}/>
            </div>
            <div style={{ fontSize:'1.2rem', marginBottom:6 }}>🆓</div>
            <div style={{ fontWeight:700, fontSize:'.95rem', marginBottom:2 }}>
              {plans.base?.name || 'Vault'}
            </div>
            <div style={{ fontSize:'.75rem', color:'var(--text-3)', marginBottom:10 }}>
              {plans.base?.description || 'Dashboard + CSV Reconciliation'}
            </div>
            <div style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--brand)', marginBottom:10 }}>
              Free <span style={{ fontSize:'.78rem', fontWeight:400, color:'var(--text-3)' }}>· No card required</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {(plans.base?.features || []).map((f,i) => (
                <div key={i} style={{ display:'flex', gap:6, fontSize:'.73rem', alignItems:'flex-start' }}>
                  <Check size={11} color="#38A169" style={{ flexShrink:0, marginTop:1 }}/>
                  <span style={{ color:'var(--text-2)', lineHeight:1.4 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Individual module plans from API ── */}
          {modPlans.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:'.72rem', fontWeight:700, color:'var(--text-3)',
                textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
                Add modules individually
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))', gap:12 }}>
                {modPlans.map(({ key, plan }) => {
                  const sel  = selKeys.includes(key)
                  const pRaw = billing === 'yearly' ? plan.price_yearly : plan.price_monthly
                  const pYrEff = plan.price_yearly ? Math.round(plan.price_yearly / 12) : null
                  const icon = ICONS[key] || ICONS[plan.name?.toLowerCase()] || '📦'
                  return (
                    <div key={key} onClick={() => toggleMod(key)} style={{
                      border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius:'var(--r-lg)', padding:'16px', cursor:'pointer',
                      background: sel ? 'var(--brand-light)' : 'var(--surface)',
                      transition:'all .15s', position:'relative',
                    }}>
                      <div style={{ position:'absolute', top:12, right:12, width:18, height:18,
                        borderRadius:'50%', border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                        background: sel ? 'var(--brand)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {sel && <Check size={10} color="#fff" strokeWidth={3}/>}
                      </div>
                      <div style={{ fontSize:'1.2rem', marginBottom:6 }}>{icon}</div>
                      <div style={{ fontWeight:700, fontSize:'.92rem', marginBottom:2 }}>{plan.name}</div>
                      <div style={{ fontSize:'.75rem', color:'var(--text-3)', marginBottom:10 }}>{plan.description}</div>
                      <div style={{ marginBottom:10 }}>
                        {pRaw ? (<>
                          <span style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--brand)' }}>
                            ${pRaw/100}
                          </span>
                          <span style={{ fontSize:'.78rem', color:'var(--text-3)' }}>
                            {billing==='yearly' ? '/yr' : '/mo'}
                          </span>
                          {billing==='yearly' && pYrEff && (
                            <span style={{ fontSize:'.68rem', color:'#38A169', marginLeft:6, fontWeight:600 }}>
                              (${pYrEff/100}/mo)
                            </span>
                          )}
                        </>) : <span style={{ color:'var(--text-3)', fontSize:'.85rem' }}>Loading…</span>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {(plan.features || []).map((f,i) => (
                          <div key={i} style={{ display:'flex', gap:6, fontSize:'.73rem', alignItems:'flex-start' }}>
                            <Check size={11} color="#38A169" style={{ flexShrink:0, marginTop:1 }}/>
                            <span style={{ color:'var(--text-2)', lineHeight:1.4 }}>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Bundle plans from API ── */}
          {bndPlans.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:'.72rem', fontWeight:700, color:'var(--text-3)',
                textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
                Or choose a bundle (best value)
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {bndPlans.map(({ key, plan }) => {
                  const sel  = selBundle === key
                  const pRaw = billing === 'yearly' ? plan.price_yearly : plan.price_monthly
                  const pYrEff = plan.price_yearly ? Math.round(plan.price_yearly / 12) : null
                  const icon = ICONS[key] || ICONS[plan.name?.toLowerCase()] || '⭐'
                  return (
                    <div key={key} onClick={() => selectBundle(key)} style={{
                      border:`2px solid ${sel ? 'var(--brand)' : plan.highlight ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius:'var(--r-md)', padding:'12px 16px', cursor:'pointer',
                      background: sel ? 'var(--brand-light)' : plan.highlight ? 'var(--surface-2)' : 'var(--surface)',
                      transition:'all .15s', display:'flex', alignItems:'center', gap:12, position:'relative',
                    }}>
                      {plan.badge && (
                        <div style={{ position:'absolute', top:-10, right:12,
                          background:'var(--brand)', color:'#fff', fontSize:'.65rem',
                          fontWeight:700, padding:'2px 10px', borderRadius:100 }}>
                          {plan.badge}
                        </div>
                      )}
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0,
                        border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                        background: sel ? 'var(--brand)' : 'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {sel && <Check size={11} color="#fff" strokeWidth={3}/>}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:'.92rem' }}>{icon} {plan.name}</div>
                        <div style={{ fontSize:'.73rem', color:'var(--text-3)', marginTop:2 }}>{plan.description}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                          {(plan.features || []).slice(0,4).map((f,i) => (
                            <span key={i} style={{ fontSize:'.68rem', padding:'2px 7px',
                              borderRadius:100, background:'var(--surface-3)', color:'var(--text-2)' }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        {pRaw ? (<>
                          <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--brand)' }}>
                            ${pRaw/100}{billing==='yearly' ? '/yr' : '/mo'}
                          </div>
                          {billing==='yearly' && pYrEff && (
                            <div style={{ fontSize:'.68rem', color:'var(--text-3)' }}>
                              ${pYrEff/100}/mo effective
                            </div>
                          )}
                        </>) : <span style={{ fontSize:'.85rem', color:'var(--text-3)' }}>Loading…</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Price summary ── */}
          <div style={{ background:'var(--surface-2)', borderRadius:'var(--r-md)',
            padding:'14px 16px', marginBottom:16, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.88rem' }}>{selectedLabel()}</div>
                {(selKeys.length > 0 || selBundle) && (
                  <div style={{ fontSize:'.72rem', color:'var(--text-3)', marginTop:2 }}>
                    Includes Dashboard + CSV Reconciliation + Open Banking
                  </div>
                )}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:800, fontSize:'1.3rem', color:'var(--brand)' }}>
                  {(!selBundle && !selKeys.length) ? 'Free' : `$${totalPrice/100}/${billing==='yearly'?'yr':'mo'}`}
                </div>
              </div>
            </div>
          </div>

          {/* ── CTA button ── */}
          {(!selBundle && !selKeys.length) ? (
            <button className="btn btn-primary btn-xl btn-full"
              onClick={() => navigate(isLoggedIn ? '/' : '/login')}
              style={{ fontSize:'.95rem', marginBottom:8 }}>
              {isLoggedIn ? 'Continue with Vault →' : 'Sign In / Register →'}
            </button>
          ) : (
            <button className="btn btn-primary btn-xl btn-full"
              onClick={handleCheckout} disabled={paying}
              style={{ fontSize:'.95rem', marginBottom:8 }}>
              {paying
                ? <><span className="spinner spinner-sm"/> Processing…</>
                : isLoggedIn
                  ? <>Pay ${totalPrice/100}/{billing==='yearly'?'yr':'mo'} with Stripe <ArrowRight size={15}/></>
                  : <>Sign in to continue <ArrowRight size={15}/></>}
            </button>
          )}

          <p style={{ textAlign:'center', fontSize:'.72rem', color:'var(--text-3)', marginTop:4 }}>
            {(!selBundle && !selKeys.length)
              ? 'No credit card required · Upgrade anytime'
              : '🔒 Secured by Stripe · No card stored on our servers · Cancel anytime'}
          </p>

          </>)}

          <p style={{ textAlign:'center', color:'var(--text-3)', fontSize:'.72rem', marginTop:20 }}>
            © {new Date().getFullYear()} Headstart Finances Australia Pty Ltd · Trading as AccFino
          </p>
        </div>
      </div>
    </div>
    </>
  )
}
