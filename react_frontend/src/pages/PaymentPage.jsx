import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/ui/TopBar.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { createCheckout, getMyPlan, getPricingPlans } from '../lib/api'
import { Check, ArrowRight } from 'lucide-react'
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

// All prices come exclusively from the API (pricing.json) — nothing hardcoded here.
function calcPrice(selectedMods, billing, selBundle, modPrices, bundles) {
  if (!selectedMods.length) return { price: 0, label: 'Base (Free)', planId: 'base', saveMsg: '' }

  if (selBundle && bundles[selBundle]) {
    const b = bundles[selBundle]
    const p = billing === 'yearly' ? b.price_yearly : b.price_monthly
    return { price: p, label: b.label, planId: selBundle, saveMsg: b.save }
  }

  const effectiveMods = selectedMods.includes('reconciliation')
    ? selectedMods
    : ['reconciliation', ...selectedMods]

  const moTotal = selectedMods.reduce((s, m) => s + (modPrices[m] || 0), 0)
  const total   = billing === 'yearly' ? moTotal * 10 : moTotal

  const basicPrice = billing === 'yearly' ? bundles.basic?.price_yearly : bundles.basic?.price_monthly
  if (bundles.basic && selectedMods.length >= 3 && total >= basicPrice) {
    return { price: basicPrice, label: 'Full Bundle', planId: 'basic',
             saveMsg: 'Save vs individual', modules: effectiveMods }
  }

  const label = selectedMods.length === 0 ? 'Base (Free)'
    : `Base + ${selectedMods.map(m => MOD_LABELS[m]?.label || m).join(' + ')}`

  return { price: total, label, planId: 'custom_' + selectedMods.join('_'),
           saveMsg: '', modules: effectiveMods }
}

export default function PaymentPage() {
  const { user }           = useAuth()
  const navigate           = useNavigate()
  const [searchParams]     = useSearchParams()
  const [plans,  setPlans] = useState({})
  const [myPlan, setMyPlan]= useState(null)
  const [billing, setBilling] = useState('monthly')
  const [selMods, setSelMods] = useState([])
  const [selBundle, setSelBundle] = useState(null)
  const [paying,  setPaying]  = useState(false)
  const [loading, setLoading] = useState(true)

  // Prices derived entirely from API — no hardcoded fallbacks
  const [modPrices, setModPrices] = useState({})
  const [bundles,   setBundles]   = useState({
    basic:   { mods: ALL_MOD, price_monthly: null, price_yearly: null, label: 'Full Bundle', save: '' },
    premium: { mods: ALL_MOD, price_monthly: null, price_yearly: null, label: 'Premium',      save: '' },
  })

  useEffect(() => {
    if (searchParams.get('success')) {
      toast.success('🎉 Payment successful! Your plan has been upgraded.')
      window.dispatchEvent(new Event('accfino:modules-changed'))
      setTimeout(() => navigate(user ? '/' : '/login', { replace: true }), 1500)
    }
    if (searchParams.get('cancelled')) {
      toast('Payment cancelled.', { icon: 'ℹ️' })
    }
  }, [])

  useEffect(() => {
    Promise.all([
      getPricingPlans(),
      user?.id ? getMyPlan(user.id) : Promise.resolve({ data: null }),
    ]).then(([pr, mr]) => {
      const api = pr.data || {}
      setPlans(api)
      setMyPlan(mr.data)

      // Build modPrices purely from API
      const mp = {}
      ALL_MOD.forEach(mod => {
        if (api[mod]?.price_monthly) mp[mod] = api[mod].price_monthly
      })
      setModPrices(mp)

      // Build bundles purely from API
      const nb = { ...bundles }
      if (api.basic) {
        nb.basic = {
          mods:          ALL_MOD,
          price_monthly: api.basic.price_monthly,
          price_yearly:  api.basic.price_yearly,
          label:         api.basic.name || 'Full Bundle',
          save:          api.basic.features?.find(f => f.toLowerCase().includes('save')) || '',
        }
      }
      if (api.premium) {
        nb.premium = {
          mods:          ALL_MOD,
          price_monthly: api.premium.price_monthly,
          price_yearly:  api.premium.price_yearly,
          label:         api.premium.name || 'Premium',
          save:          api.premium.features?.find(f => f.toLowerCase().includes('save')) || 'Best Value',
        }
      }
      setBundles(nb)
    }).catch(() => toast.error('Could not load pricing — please refresh.'))
      .finally(() => setLoading(false))
  }, [user?.id])

  const toggleMod = (mod) => {
    setSelBundle(null)
    setSelMods(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
  }

  const selectBundle = (bundleKey) => {
    if (selBundle === bundleKey) {
      setSelBundle(null)
      setSelMods([])
    } else {
      setSelBundle(bundleKey)
      setSelMods([...bundles[bundleKey].mods])
    }
  }

  const { price, label, planId, saveMsg } = calcPrice(selMods, billing, selBundle, modPrices, bundles)
  const isFree    = price === 0
  const perMo     = price
  const isLoggedIn = !!user

  const handleCheckout = async () => {
    if (!isLoggedIn) { navigate('/login'); return }
    if (isFree) { navigate('/'); return }
    setPaying(true)
    try {
      const pid     = planId.startsWith('custom_') ? 'custom' : planId
      const allMods = [...new Set(['dashboard', 'reconciliation', ...selMods])]
      const { data } = await createCheckout({
        plan_id:        pid,
        billing_period: billing,
        user_id:        user.id,
        user_email:     user.email,
        modules:        allMods,
        amount:         price,
        plan_name:      label,
      })
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Checkout failed')
    } finally { setPaying(false) }
  }

  // Mini comparison prices for left panel — derived from API
  const bundleMonthly = bundles.basic?.price_monthly
  const premiumMonthly = bundles.premium?.price_monthly
  const miniPlans = [
    { name: 'Base',    price: 'Free',
      mods: 'Dashboard + CSV Reconciliation' },
    { name: plans.basic?.name   || 'Full Bundle',
      price: bundleMonthly  ? `$${bundleMonthly/100}/mo`  : '…',
      mods: 'All 4 modules bundled' },
    { name: plans.premium?.name || 'Premium',
      price: premiumMonthly ? `$${premiumMonthly/100}/mo` : '…',
      mods: 'All modules · Best value' },
  ]

  return (
    <>
    <TopBar
      variant="marketing"
      onSignIn={() => navigate('/login')}
      onStartFree={() => navigate('/login?tab=register')}
    />

    <div className="login-page" style={{paddingTop:56}}>

      {/* ── Left panel ── */}
      <div className="login-left" style={{ flex: "0 0 320px", padding: "32px", alignItems: "flex-start", paddingTop: "48px" }}>
        <div className="login-brand-card">
          <AccfinoLogo size={44} showText textColor="#fff" />
          <div style={{ marginTop: 36, marginBottom: 28 }}>
            <h2 style={{ color:'#fff', fontSize:'1.4rem', fontFamily:"'Instrument Serif', serif", marginBottom:8 }}>
              Choose what you need
            </h2>
            <p style={{ color:'rgba(255,255,255,.6)', fontSize:'.9rem', lineHeight:1.7 }}>
              Pick individual modules or save with a bundle. Start free, upgrade anytime.
            </p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {miniPlans.map(p => (
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

      {/* ── Right panel ── */}
      <div className="login-right" style={{ width: "auto", flex: 1, padding: "32px 40px", overflowY: "auto", alignItems: "flex-start" }}>
        <div className="login-form-wrap" style={{ maxWidth: 720, width: "100%" }}>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={() => { window.location.href = isLoggedIn ? '/' : '/index-marketing.html' }}
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
            border:`2px solid var(--brand)`,
            borderRadius:'var(--r-lg)', padding:'16px', marginBottom:16,
            background: 'var(--brand-light)',
            cursor:'pointer', transition:'all .15s', position:'relative',
          }} onClick={() => { setSelMods([]); setSelBundle(null); }}>
            <div style={{ position:'absolute', top:12, right:12,
              width:18, height:18, borderRadius:'50%',
              border:'2px solid var(--brand)', background: 'var(--brand)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Check size={10} color="#fff" strokeWidth={3}/>
            </div>
            <div style={{ marginBottom:8, paddingRight:24 }}>
              <div style={{ fontSize:'1.3rem', marginBottom:4 }}>🆓</div>
              <div style={{ fontWeight:700, fontSize:'.92rem' }}>Base Plan</div>
              <div style={{ fontSize:'.75rem', color:'var(--text-3)' }}>
                {plans.base?.description || 'Try Accfino free for 6 months'}
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <span style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--brand)' }}>Free</span>
              <span style={{ fontSize:'.78rem', color:'var(--text-3)', marginLeft:6 }}>· No card required</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {(plans.base?.features || ['Dashboard overview & stats','CSV bank reconciliation (up to 500 txns/mo)','Up to 6 months free access','Upgrade anytime']).map((f,i) => (
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
                const info  = MOD_LABELS[mod]
                const sel   = selMods.includes(mod)
                const mRaw  = modPrices[mod] || 0
                const mp    = billing==='yearly' ? Math.round(mRaw*10/12) : mRaw
                const mp_yr = mRaw * 10
                return (
                  <div key={mod} onClick={() => toggleMod(mod)} style={{
                    border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius:'var(--r-lg)', padding:'16px', cursor:'pointer',
                    background: sel ? 'var(--brand-light)' : 'var(--surface)',
                    transition:'all .15s', position:'relative',
                  }}>
                    <div style={{ position:'absolute', top:12, right:12,
                      width:18, height:18, borderRadius:'50%',
                      border:`2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                      background: sel ? 'var(--brand)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {sel && <Check size={10} color="#fff" strokeWidth={3}/>}
                    </div>
                    <div style={{ marginBottom:10, paddingRight:24 }}>
                      <div style={{ fontSize:'1.3rem', marginBottom:4 }}>{info.icon}</div>
                      <div style={{ fontWeight:700, fontSize:'.92rem' }}>{info.label}</div>
                      <div style={{ fontSize:'.75rem', color:'var(--text-3)' }}>{info.desc}</div>
                    </div>
                    <div style={{ marginBottom:12 }}>
                      {mRaw ? (<>
                        <span style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--brand)' }}>
                          {billing==='yearly' ? `$${mp_yr/100}` : `$${mRaw/100}`}
                        </span>
                        <span style={{ fontSize:'.78rem', color:'var(--text-3)' }}>
                          {billing==='yearly' ? '/yr' : '/mo'}
                        </span>
                        {billing==='yearly' && (
                          <span style={{ fontSize:'.68rem', color:'#38A169', marginLeft:6, fontWeight:600 }}>
                            (${mp/100}/mo effective)
                          </span>
                        )}
                      </>) : (
                        <span style={{ fontSize:'.85rem', color:'var(--text-3)' }}>Loading…</span>
                      )}
                    </div>
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
                { key:'basic',   emoji:'📦', highlight:false },
                { key:'premium', emoji:'⭐', highlight:true  },
              ].map(b => {
                const bd    = bundles[b.key]
                const allSel= selBundle === b.key
                const bp    = billing==='yearly'
                  ? (bd.price_yearly  ? Math.round(bd.price_yearly/12)  : null)
                  : (bd.price_monthly || null)
                return (
                  <div key={b.key} onClick={() => selectBundle(b.key)} style={{
                    border:`2px solid ${allSel ? 'var(--brand)' : b.highlight ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius:'var(--r-md)', padding:'12px 16px', cursor:'pointer',
                    background: allSel ? 'var(--brand-light)' : b.highlight ? 'var(--surface-2)' : 'var(--surface)',
                    transition:'all .15s', display:'flex', alignItems:'center', gap:12,
                    position:'relative',
                  }}>
                    {b.highlight && bd.save && (
                      <div style={{ position:'absolute', top:-10, right:12,
                        background:'var(--brand)', color:'#fff', fontSize:'.65rem',
                        fontWeight:700, padding:'2px 10px', borderRadius:100 }}>
                        {bd.save}
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
                        {b.emoji} {bd.label}
                      </div>
                      <div style={{ fontSize:'.73rem', color:'var(--text-3)', marginTop:2 }}>
                        {plans[b.key]?.description || ''}
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
                      {bp ? (
                        billing==='yearly' ? (<>
                          <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--brand)' }}>
                            ${bd.price_yearly/100}/yr
                          </div>
                          <div style={{ fontSize:'.68rem', color:'var(--text-3)' }}>
                            ${Math.round(bd.price_yearly/12)/100}/mo effective
                          </div>
                        </>) : (
                          <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--brand)' }}>
                            ${bd.price_monthly/100}/mo
                          </div>
                        )
                      ) : (
                        <span style={{ fontSize:'.85rem', color:'var(--text-3)' }}>Loading…</span>
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
                    {'Base (CSV Recon)'}{selMods.map(m => ' + ' + (MOD_LABELS[m]?.label || m))}
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
    </>
  )
}
