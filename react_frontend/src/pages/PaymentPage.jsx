import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { getPlans, createCheckout, getMyPlan } from '../lib/api'
import { Check, X, ArrowRight, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import AccfinoLogo from '../components/ui/AccfinoLogo.jsx'

const HIDDEN  = ['admin', 'file-manager', 'licence', 'dashboard']
const ALL_MOD = ['reconciliation', 'trading', 'cash-flow', 'invoice']
const MOD_LABELS = {
  reconciliation: {
    icon: '🏦', label: 'Reconciliation', desc: 'CSV + Open Banking',
    features: ['Upload CSV bank statements','Open Banking / direct feeds','Auto internal transfer detection','GST & BAS-ready classification','Excel export with monthly summaries'],
  },
  trading: {
    icon: '📈', label: 'Trading', desc: 'Crypto & equity CGT',
    features: ['Crypto CGT calculation','Equity CGT reports','ATO-ready tax summaries','Multi-exchange support'],
  },
  'cash-flow': {
    icon: '💰', label: 'Cash Flow', desc: 'ML forecast',
    features: ['ML next-month prediction','Visual cash flow charts','Export to Excel','Historical trend analysis'],
  },
  invoice: {
    icon: '🧾', label: 'Invoice', desc: 'GST invoices',
    features: ['Create GST-compliant invoices','Extract data from PDF invoices','Customer & business management','Invoice status tracking'],
  },
}

// Individual module prices (AUD cents/mo)
const MOD_PRICES = {
  reconciliation: 1900,
  trading:        1500,
  'cash-flow':    1500,
  invoice:        1200,
}

// Bundle thresholds
const BUNDLES = {
  basic:   { mods: ['reconciliation','trading','cash-flow','invoice'], price_monthly: 4900, price_yearly: 49000, label: 'Basic Bundle', save: 'Save $12/mo' },
  premium: { mods: ['reconciliation','trading','cash-flow','invoice'], price_monthly: 3900, price_yearly: 39000, label: 'Premium',      save: 'Best Value' },
}

function calcPrice(selectedMods, billing) {
  if (!selectedMods.length) return { price: 0, label: 'Base (Free)', planId: 'base', saveMsg: '' }
  const all4 = ALL_MOD.every(m => selectedMods.includes(m))
  if (all4) {
    const b = BUNDLES.premium
    const p = billing === 'yearly' ? b.price_yearly : b.price_monthly
    return { price: p, label: b.label, planId: 'premium', saveMsg: b.save }
  }
  // Sum individual prices
  const total = selectedMods.reduce((s, m) => s + (MOD_PRICES[m] || 0), 0)
  // Check if basic bundle is cheaper
  const basicPrice = billing === 'yearly' ? BUNDLES.basic.price_yearly : BUNDLES.basic.price_monthly
  const allSelected = selectedMods.filter(m => ALL_MOD.includes(m))
  if (allSelected.length >= 3 && total >= basicPrice) {
    return { price: basicPrice, label: 'Basic Bundle', planId: 'basic', saveMsg: `Save vs individual` }
  }
  return { price: total, label: 'Custom', planId: 'custom_' + selectedMods.join('_'), saveMsg: '' }
}

export default function PaymentPage() {
  const { user }           = useAuth()
  const navigate           = useNavigate()
  const [searchParams]     = useSearchParams()
  const [plans,  setPlans] = useState({})
  const [myPlan, setMyPlan]= useState(null)
  const [billing, setBilling] = useState('monthly')
  const [selMods, setSelMods] = useState([])   // selected individual modules
  const [paying,  setPaying]  = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('Payment successful! Your plan has been upgraded.')
      navigate(user ? '/' : '/login', { replace: true })
    }
    if (searchParams.get('cancelled')) {
      toast('Payment cancelled.', { icon: 'ℹ️' })
    }
  }, [])

  useEffect(() => {
    Promise.all([
      getPlans(),
      user?.id ? getMyPlan(user.id) : Promise.resolve({ data: null }),
    ]).then(([pr, mr]) => {
      setPlans(pr.data || {})
      setMyPlan(mr.data)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.id])

  const [selBundle, setSelBundle] = useState(null)

  const toggleMod = (mod) => {
    // Clicking individual module clears any bundle selection
    setSelBundle(null)
    setSelMods(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    )
  }

  const selectBundle = (bundleKey) => {
    if (selBundle === bundleKey) {
      // Deselect bundle -> go back to base
      setSelBundle(null)
      setSelMods([])
    } else {
      // Select this bundle exclusively — clear individual selections
      setSelBundle(bundleKey)
      setSelMods([...BUNDLES[bundleKey].mods])
    }
  }


  const { price, label, planId, saveMsg } = calcPrice(selMods, billing)
  const isFree    = price === 0
  const perMo     = billing === 'yearly' ? Math.round(price / 12) : price
  const isLoggedIn = !!user

  const handleCheckout = async () => {
    if (!isLoggedIn) { navigate('/login'); return }
    if (isFree) { navigate('/'); return }
    setPaying(true)
    try {
      // For custom multi-module, use the plan that covers those modules
      const pid = planId.startsWith('custom_') ? 'basic' : planId
      const { data } = await createCheckout({
        plan_id:        pid,
        billing_period: billing,
        user_id:        user.id,
        user_email:     user.email,
        modules:        selMods,
      })
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Checkout failed')
    } finally { setPaying(false) }
  }

  const FEATURES = [
    'Bank reconciliation with automatic internal transfer detection',
    'GST calculation & BAS-ready classification',
    'ML-powered GL account auto-classification',
    'Multi-bank CSV import with session persistence',
    'Excel export with monthly summaries',
  ]

  return (
    <div className="login-page">

      {/* ── Left panel ── */}
      <div className="login-left" style={{ flex: "0 0 320px", padding: "32px", alignItems: "flex-start", paddingTop: "48px" }}>
        <div className="login-brand-card">
          <AccfinoLogo size={44} showText textColor="#fff" />
          <div style={{ marginTop: 36, marginBottom: 28 }}>
            <h2 style={{ color:'#fff', fontSize:'1.4rem', fontFamily:"'Sora',sans-serif", marginBottom:8 }}>
              Choose what you need
            </h2>
            <p style={{ color:'rgba(255,255,255,.6)', fontSize:'.9rem', lineHeight:1.7 }}>
              Pick individual modules or save with a bundle. Start free, upgrade anytime.
            </p>
          </div>

          {/* Mini plan comparison */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { name:'Base',    price:'Free',    mods:'Dashboard + CSV Reconciliation' },
              { name:'Basic',   price:'$49/mo',  mods:'All 4 modules bundled' },
              { name:'Premium', price:'$39/mo',  mods:'All modules · Best value' },
            ].map(p => (
              <div key={p.name} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <Check size={14} color="#FF6B35" style={{ marginTop:2, flexShrink:0 }}/>
                <span style={{ fontSize:'.82rem', color:'rgba(255,255,255,.75)', lineHeight:1.5 }}>
                  <strong style={{ color:'#fff' }}>{p.name}</strong> — {p.price} · {p.mods}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop:28, paddingTop:20, borderTop:'1px solid rgba(255,255,255,.12)',
            fontSize:'.78rem', color:'rgba(255,255,255,.4)' }}>
            🔒 Secured by Stripe · Cancel anytime · AUD pricing incl. GST
          </div>
        </div>
      </div>

      {/* ── Right panel — pricing ── */}
      <div className="login-right" style={{ width: "auto", flex: 1, padding: "32px 40px", overflowY: "auto", alignItems: "flex-start" }}>
        <div className="login-form-wrap" style={{ maxWidth: 680, width: "100%" }}>

          {/* Back / nav */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate(isLoggedIn ? '/' : '/login')}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)',
                fontSize:'.82rem', padding:0, display:'flex', alignItems:'center', gap:4 }}>
              ← {isLoggedIn ? 'Back to Dashboard' : 'Back to Sign In'}
            </button>
            {myPlan && (
              <span style={{ fontSize:'.75rem', color:'var(--text-3)' }}>
                Current: <strong>{plans[myPlan.plan_id]?.name || myPlan.plan_id}</strong>
              </span>
            )}
          </div>

          <h1 style={{ fontSize:'1.4rem', marginBottom:4 }}>Subscription Plans</h1>
          <p style={{ color:'var(--text-3)', fontSize:'.85rem', marginBottom:20 }}>
            Select modules or a bundle — price updates instantly.
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
                {p==='yearly' && <span style={{ marginLeft:6, fontSize:'.68rem',
                  color:'#38A169', fontWeight:700 }}>SAVE 17%</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:30, color:'var(--text-3)' }}>
              <span className="spinner"/> Loading…
            </div>
          ) : (<>

          {/* ── Base plan ── */}
          <div style={{
            border:`2px solid ${selMods.length===0 ? 'var(--brand)' : 'var(--border)'}`,
            borderRadius:'var(--r-lg)', padding:'16px', marginBottom:16,
            background: selMods.length===0 ? 'var(--brand-light)' : 'var(--surface)',
            cursor:'pointer', transition:'all .15s', position:'relative',
          }} onClick={() => { setSelMods([]); setSelBundle(null); }}>
            <div style={{ position:'absolute', top:12, right:12,
              width:18, height:18, borderRadius:'50%',
              border:`2px solid ${selMods.length===0 ? 'var(--brand)' : 'var(--border)'}`,
              background: selMods.length===0 ? 'var(--brand)' : 'transparent',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {selMods.length===0 && <Check size={10} color="#fff" strokeWidth={3}/>}
            </div>
            <div style={{ marginBottom:8, paddingRight:24 }}>
              <div style={{ fontSize:'1.3rem', marginBottom:4 }}>🆓</div>
              <div style={{ fontWeight:700, fontSize:'.92rem' }}>Base Plan</div>
              <div style={{ fontSize:'.75rem', color:'var(--text-3)' }}>Try Accfino free for 6 months</div>
            </div>
            <div style={{ marginBottom:12 }}>
              <span style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--brand)' }}>Free</span>
              <span style={{ fontSize:'.78rem', color:'var(--text-3)', marginLeft:6 }}>· No card required</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {['Dashboard overview & stats','CSV bank reconciliation (up to 500 txns/mo)',
                'Up to 6 months free access','Upgrade anytime'].map((f,i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:'.73rem' }}>
                  <Check size={11} color="#38A169" style={{ flexShrink:0, marginTop:1 }}/>
                  <span style={{ color:'var(--text-2)', lineHeight:1.4 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Individual modules ── */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:'.72rem', fontWeight:700, color:'var(--text-3)',
              textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
              Add modules individually
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:12 }}>
              {ALL_MOD.map(mod => {
                const info = MOD_LABELS[mod]
                const sel  = selMods.includes(mod)
                const mp   = billing==='yearly'
                  ? Math.round(MOD_PRICES[mod]*10/12)
                  : MOD_PRICES[mod]
                return (
                  <div key={mod} onClick={() => toggleMod(mod)} style={{
                    border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius:'var(--r-lg)', padding:'16px', cursor:'pointer',
                    background: sel ? 'var(--brand-light)' : 'var(--surface)',
                    transition:'all .15s', position:'relative',
                  }}>
                    {/* Select indicator */}
                    <div style={{ position:'absolute', top:12, right:12,
                      width:18, height:18, borderRadius:'50%',
                      border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                      background: sel ? 'var(--brand)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {sel && <Check size={10} color="#fff" strokeWidth={3}/>}
                    </div>

                    {/* Header */}
                    <div style={{ marginBottom:10, paddingRight:24 }}>
                      <div style={{ fontSize:'1.3rem', marginBottom:4 }}>{info.icon}</div>
                      <div style={{ fontWeight:700, fontSize:'.92rem' }}>{info.label}</div>
                      <div style={{ fontSize:'.75rem', color:'var(--text-3)' }}>{info.desc}</div>
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom:12 }}>
                      <span style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--brand)' }}>
                        ${mp/100}
                      </span>
                      <span style={{ fontSize:'.78rem', color:'var(--text-3)' }}>/mo</span>
                      {billing==='yearly' && (
                        <span style={{ fontSize:'.68rem', color:'#38A169', marginLeft:6, fontWeight:600 }}>
                          2 months free
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {(info.features||[]).map((f,i) => (
                        <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:'.73rem' }}>
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

          {/* ── Bundle options ── */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'.72rem', fontWeight:700, color:'var(--text-3)',
              textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
              Or choose a bundle (save more)
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                { key:'basic',   emoji:'📦', label:'Basic Bundle', desc:'All 4 modules', save:'Save $12/mo vs individual', highlight:false },
                { key:'premium', emoji:'⭐', label:'Premium',      desc:'All 4 modules + priority support', save:'Best Value — Save $22/mo', highlight:true },
              ].map(b => {
                const bd    = BUNDLES[b.key]
                const allSel= selBundle === b.key
                const bp    = billing==='yearly' ? Math.round(bd.price_yearly/12) : bd.price_monthly
                return (
                  <div key={b.key} onClick={() => selectBundle(b.key)} style={{
                    border:`2px solid ${allSel ? 'var(--brand)' : b.highlight ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius:'var(--r-md)', padding:'12px 16px', cursor:'pointer',
                    background: allSel ? 'var(--brand-light)' : b.highlight ? 'var(--surface-2)' : 'var(--surface)',
                    transition:'all .15s', display:'flex', alignItems:'center', gap:12,
                    position:'relative',
                  }}>
                    {b.highlight && (
                      <div style={{ position:'absolute', top:-10, right:12,
                        background:'var(--brand)', color:'#fff', fontSize:'.65rem',
                        fontWeight:700, padding:'2px 10px', borderRadius:100 }}>
                        {b.save}
                      </div>
                    )}
                    <div style={{
                      width:20, height:20, borderRadius:'50%', flexShrink:0,
                      border:`2px solid ${allSel ? 'var(--brand)' : 'var(--border)'}`,
                      background: allSel ? 'var(--brand)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {allSel && <Check size={11} color="#fff" strokeWidth={3}/>}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:'.88rem' }}>
                        {b.emoji} {b.label}
                      </div>
                      <div style={{ fontSize:'.73rem', color:'var(--text-3)', marginTop:2 }}>
                        {b.desc}
                        {!b.highlight && <span style={{ marginLeft:8, color:'#38A169',
                          fontWeight:600 }}>{b.save}</span>}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                        {ALL_MOD.map(m => (
                          <span key={m} style={{ fontSize:'.68rem', padding:'2px 7px',
                            borderRadius:100, background:'var(--surface-3)', color:'var(--text-2)' }}>
                            {MOD_LABELS[m]?.icon} {MOD_LABELS[m]?.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--brand)' }}>
                        ${bp/100}/mo
                      </div>
                      {billing==='yearly' && (
                        <div style={{ fontSize:'.68rem', color:'var(--text-3)' }}>
                          ${bd.price_yearly/100}/yr
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Price summary + CTA ── */}
          <div style={{
            background:'var(--surface-2)', borderRadius:'var(--r-md)',
            padding:'14px 16px', marginBottom:16,
            border:'1px solid var(--border)',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'.88rem' }}>{label}</div>
                {selMods.length > 0 && (
                  <div style={{ fontSize:'.72rem', color:'var(--text-3)', marginTop:2 }}>
                    {selMods.map(m => MOD_LABELS[m]?.label).join(' + ')}
                  </div>
                )}
                {saveMsg && (
                  <div style={{ fontSize:'.72rem', color:'#38A169', fontWeight:600, marginTop:2 }}>
                    ✓ {saveMsg}
                  </div>
                )}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:800, fontSize:'1.3rem', color:'var(--brand)' }}>
                  {isFree ? 'Free' : `$${perMo/100}/mo`}
                </div>
                {!isFree && billing==='yearly' && (
                  <div style={{ fontSize:'.7rem', color:'var(--text-3)' }}>
                    billed ${price/100}/yr
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CTA button */}
          {!isFree ? (
            <button className="btn btn-primary btn-xl btn-full"
              onClick={handleCheckout} disabled={paying}
              style={{ fontSize:'.95rem', marginBottom:8 }}>
              {paying
                ? <><span className="spinner spinner-sm"/> Processing…</>
                : isLoggedIn
                  ? <>Pay ${perMo/100}/mo securely with Stripe <ArrowRight size={15}/></>
                  : <>Sign in to Pay ${perMo/100}/mo <ArrowRight size={15}/></>}
            </button>
          ) : (
            <button className="btn btn-primary btn-xl btn-full"
              onClick={() => navigate(isLoggedIn ? '/' : '/login')}
              style={{ fontSize:'.95rem', marginBottom:8 }}>
              {isLoggedIn ? 'Continue with Base Plan →' : 'Sign In / Register →'}
            </button>
          )}

          <p style={{ textAlign:'center', fontSize:'.72rem', color:'var(--text-3)', marginTop:4 }}>
            {isFree
              ? 'No credit card required · Upgrade anytime'
              : '🔒 Secured by Stripe · No card stored on our servers · Cancel anytime'}
          </p>

          </>)}

          <p style={{ textAlign:'center', color:'var(--text-3)', fontSize:'.72rem', marginTop:20 }}>
            © {new Date().getFullYear()} Accfino · Australian Accounting Platform
          </p>
        </div>
      </div>
    </div>
  )
}
