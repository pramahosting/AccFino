import TopBar from '../ui/TopBar.jsx'
import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import AccfinoLogo from '../ui/AccfinoLogo.jsx'
import UpgradeBanner from '../UpgradeBanner.jsx'
import { licenceMyModules, getMyPlan } from '../../lib/api.js'
import { LayoutDashboard, ArrowLeftRight, TrendingUp, BarChart2, FileText, ScanLine, Landmark, ShieldCheck, LogOut, ChevronLeft, ChevronRight, Bell, HelpCircle, FolderOpen, BadgeCheck } from 'lucide-react'

const NAV = [
  { to:'/',               icon:LayoutDashboard, label:'Dashboard',       sub:'Overview',            key:'dashboard',      adminOnly:false },
  { to:'/reconciliation', icon:ArrowLeftRight,  label:'Reconciliation',  sub:'CSV & Open Banking',  key:'reconciliation', adminOnly:false },
  { to:'/trading',        icon:TrendingUp,      label:'Trading',         sub:'Crypto & Equity CGT', key:'trading',        adminOnly:false },
  { to:'/cash-flow',      icon:BarChart2,       label:'Cash Flow',       sub:'ML forecast',         key:'cash-flow',      adminOnly:false },
  { to:'/invoice',        icon:FileText,        label:'Invoice',         sub:'Generate & extract',  key:'invoice',        adminOnly:false },
  { to:'/admin',          icon:ShieldCheck,     label:'ML Classifier',   sub:'Training & RDR rules',key:'admin',          adminOnly:true  },
  { to:'/file-manager',   icon:FolderOpen,      label:'File Manager',    sub:'Files, tables, data', key:'file-manager',   adminOnly:true  },
  { to:'/licence',        icon:BadgeCheck,      label:'Admin & Licence', sub:'Users, roles & licences', key:'licence',    adminOnly:true  },
  { to:'/pricing-admin',  icon:BadgeCheck,      label:'Plan Pricing',    sub:'Edit plan prices',        key:'pricing-admin',adminOnly:true  },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [col,            setCol]           = useState(false)
  const [allowedModules, setAllowedModules] = useState(null)
  const [myPlan,        setMyPlan]        = useState(null)

  const fetchModules = () => {
    if (!user) return
    const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin')
    if (isAdmin || !user.id) { setAllowedModules('all'); return }
    // Always fetch fresh from API — never use cached value
    licenceMyModules(user.id)
      .then(r => setAllowedModules(r.data.modules || ['dashboard','reconciliation']))
      .catch(() => setAllowedModules(['dashboard','reconciliation']))
  }

  useEffect(() => {
    fetchModules()
    // Re-fetch when admin saves licence changes
    window.addEventListener('accfino:modules-changed', fetchModules)
    return () => window.removeEventListener('accfino:modules-changed', fetchModules)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    getMyPlan(user.id).then(r => setMyPlan(r.data)).catch(() => {})
    window.addEventListener('accfino:modules-changed', () =>
      getMyPlan(user.id).then(r => setMyPlan(r.data)).catch(() => {})
    )
  }, [user?.id])

  const showUpgradeBtn = myPlan && !(myPlan.plan_id === 'premium' && myPlan.billing_period === 'yearly')

  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin')

  const canAccess = (moduleKey) => {
    if (isAdmin) return true
    if (allowedModules === null) return false   // still loading
    if (allowedModules === 'all') return true
    return allowedModules.includes(moduleKey)
  }
  const initials = (user?.name||user?.email||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  const pageName = loc.pathname==='/'?'Dashboard':loc.pathname.slice(1).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())

  return (
    <>
    <UpgradeBanner />
    <div style={{display:'flex',minHeight:'100vh',background:'var(--bg)'}}>
      <aside style={{
        width:col?'var(--sidebar-w-sm)':'var(--sidebar-w)',minHeight:'100vh',flexShrink:0,
        position:'relative',display:'flex',flexDirection:'column',
        background:'#0D1117',
        transition:'width .22s cubic-bezier(.4,0,.2,1)',overflow:'hidden',
      }}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none',
          backgroundImage:'radial-gradient(circle at 80% 20%,rgba(200,150,62,.08) 0%,transparent 60%)'}}/>
        <div style={{padding:col?'18px 12px':'18px 16px',borderBottom:'3px solid rgba(255,255,255,0.12)',
          display:'flex',alignItems:'center',minHeight:'var(--header-h)',position:'relative',zIndex:1}}>
          {/* Logo matching marketing page nav exactly */}
          <div style={{display:'flex',alignItems:'center',gap:9,textDecoration:'none'}}>
            <div style={{
              width:35,height:35,borderRadius:12,flexShrink:0,
              background:'linear-gradient(135deg,#C8963E 0%,#E8B86D 100%)',
              display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:'0 2px 10px rgba(200,150,62,.4)',
            }}>
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <rect x="8" y="28" width="5" height="16" rx="2" transform="rotate(-30 8 28)" fill="white" opacity="0.9"/>
                <rect x="27" y="9" width="5" height="16" rx="2" transform="rotate(30 27 9)" fill="white" opacity="0.9"/>
                <rect x="12" y="23" width="16" height="4" rx="2" fill="#FF6B35"/>
                <path d="M20 7 L24 13 H22 V18 H18 V13 H16 Z" fill="#FF6B35"/>
              </svg>
            </div>
            {!col&&<span style={{
              fontFamily:"'Instrument Serif', serif",
              fontSize:'1.35rem',color:'#fff',letterSpacing:'-.01em',
            }}>Acc<span style={{color:'#FF6B35'}}>Fino</span></span>}
          </div>
        </div>
        <nav style={{flex:1,padding:col?'12px 6px':'12px 10px',display:'flex',flexDirection:'column',
          gap:2,overflowY:'auto',overflowX:'hidden',position:'relative',zIndex:1}}>
          {!col&&<div style={{fontSize:'.9rem',fontWeight:700,color:'rgba(255,255,255,.35)',
            letterSpacing:'.1em',textTransform:'uppercase',padding:'4px 12px 8px',marginTop:4}}>Modules</div>}
          {NAV.map(({to,icon:Icon,label,sub,key,adminOnly})=>{
            // adminOnly items only visible to admins; for others hide completely
            if (adminOnly && !isAdmin) return null
            const allowed = canAccess(key)
            return allowed ? (
              <NavLink key={to} to={to} end={to==='/'} title={col?label:undefined}
                className={({isActive})=>`nav-item${isActive?' active':''}`}>
                <Icon size={23} strokeWidth={1.8} style={{flexShrink:0}}/>
                {!col&&<div style={{minWidth:0}}>
                  <div style={{fontSize:'.8rem',fontWeight:600,lineHeight:1.2}}>{label}</div>
                  <div style={{fontSize:'.6rem',opacity:.55,lineHeight:1.3,marginTop:1}}>{sub}</div>
                </div>}
              </NavLink>
            ) : (
              <div key={to} title={col?label:undefined}
                className="nav-item"
                style={{opacity:.35,cursor:'not-allowed',pointerEvents:'none',userSelect:'none'}}>
                <Icon size={23} strokeWidth={1.8} style={{flexShrink:0}}/>
                {!col&&<div style={{minWidth:0}}>
                  <div style={{fontSize:'.8rem',fontWeight:600,lineHeight:1.2}}>{label}</div>
                  <div style={{fontSize:'.6rem',opacity:.55,lineHeight:1.3,marginTop:1}}>🔒 No access</div>
                </div>}
              </div>
            )
          })}
        </nav>
        <div style={{padding:col?'12px 6px':'12px 10px',borderTop:'1px solid rgba(255,255,255,.08)',position:'relative',zIndex:1}}>
          {!col&&<div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
            borderRadius:'var(--r-md)',background:'rgba(255,255,255,.06)',marginBottom:8}}>
            <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#C8963E,#E8B86D)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.72rem',fontWeight:700,color:'#fff',flexShrink:0}}>{initials}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:'.8rem',fontWeight:600,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name||user?.email}</div>
              <div style={{fontSize:'.6rem',color:'rgba(255,255,255,.45)'}}>{user?.is_admin?'Administrator':'User'}</div>
            </div>
          </div>}
          <button onClick={() => {
              try {
                logout()
                nav('/login')
              } catch {
                localStorage.removeItem('af_user')
                window.location.href = '/login'
              }
            }} className="nav-item" style={{border:'none',cursor:'pointer',width:'100%'}}>
            <LogOut size={23} style={{flexShrink:0}}/>
            {!col&&<span style={{fontSize:'.8rem'}}>Logout</span>}
          </button>
        </div>
        <button onClick={()=>setCol(c=>!c)} style={{
          position:'absolute',top:68,right:-11,width:22,height:22,borderRadius:'50%',
          background:'var(--surface)',border:'1.5px solid var(--border)',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--sh-md)',zIndex:30}}>
          {col?<ChevronRight size={11} color="var(--text-2)"/>:<ChevronLeft size={11} color="var(--text-2)"/>}
        </button>
      </aside>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0,height:'100vh'}}>
        <TopBar variant="app" pageName={pageName} initials={initials}/>
        <main style={{flex:1,padding:'24px 28px',overflowY:'auto'}}><Outlet/></main>
      </div>
    </div>
    </>
  )
}
