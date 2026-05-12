import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import AccfinoLogo from '../ui/AccfinoLogo.jsx'
import { LayoutDashboard, ArrowLeftRight, TrendingUp, BarChart2, FileText, ScanLine, Landmark, ShieldCheck, LogOut, ChevronLeft, ChevronRight, Bell, HelpCircle } from 'lucide-react'

const NAV = [
  { to:'/',               icon:LayoutDashboard, label:'Dashboard',       sub:'Overview' },
  { to:'/reconciliation', icon:ArrowLeftRight,  label:'Reconciliation',  sub:'CSV & Open Banking' },
  { to:'/trading',        icon:TrendingUp,      label:'Trading',         sub:'Crypto & Equity CGT' },
  { to:'/cash-flow',      icon:BarChart2,       label:'Cash Flow',       sub:'ML forecast' },
  { to:'/invoice',        icon:FileText,        label:'Invoice',         sub:'Generate & extract' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [col, setCol] = useState(false)
  const initials = (user?.name||user?.email||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  const pageName = loc.pathname==='/'?'Dashboard':loc.pathname.slice(1).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())

  return (
    <div style={{display:'flex',minHeight:'100vh',background:'var(--bg)'}}>
      <aside style={{
        width:col?'var(--sidebar-w-sm)':'var(--sidebar-w)',minHeight:'100vh',flexShrink:0,
        position:'relative',display:'flex',flexDirection:'column',
        background:'linear-gradient(180deg,#082B1E 0%,#0B3D28 40%,#0B6E4F 100%)',
        transition:'width .22s cubic-bezier(.4,0,.2,1)',overflow:'hidden',
      }}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none',
          backgroundImage:'radial-gradient(circle at 80% 20%,rgba(255,107,53,.08) 0%,transparent 60%)'}}/>
        <div style={{padding:col?'18px 12px':'18px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',
          display:'flex',alignItems:'center',minHeight:'var(--header-h)',position:'relative',zIndex:1}}>
          <AccfinoLogo size={32} showText={!col} textColor="#fff"/>
        </div>
        <nav style={{flex:1,padding:col?'12px 6px':'12px 10px',display:'flex',flexDirection:'column',
          gap:2,overflowY:'auto',overflowX:'hidden',position:'relative',zIndex:1}}>
          {!col&&<div style={{fontSize:'.62rem',fontWeight:700,color:'rgba(255,255,255,.35)',
            letterSpacing:'.1em',textTransform:'uppercase',padding:'4px 12px 8px',marginTop:4}}>Modules</div>}
          {NAV.map(({to,icon:Icon,label,sub})=>(
            <NavLink key={to} to={to} end={to==='/'} title={col?label:undefined}
              className={({isActive})=>`nav-item${isActive?' active':''}`}>
              <Icon size={17} strokeWidth={1.8} style={{flexShrink:0}}/>
              {!col&&<div style={{minWidth:0}}>
                <div style={{fontSize:'.875rem',fontWeight:600,lineHeight:1.2}}>{label}</div>
                <div style={{fontSize:'.68rem',opacity:.55,lineHeight:1.3,marginTop:1}}>{sub}</div>
              </div>}
            </NavLink>
          ))}
          {user?.is_admin&&(
            <>
              {!col&&<div style={{fontSize:'.62rem',fontWeight:700,color:'rgba(255,255,255,.35)',
                letterSpacing:'.1em',textTransform:'uppercase',padding:'12px 12px 6px'}}>Admin</div>}
              <NavLink to="/admin" title={col?'Admin':undefined}
                className={({isActive})=>`nav-item${isActive?' active':''}`}>
                <ShieldCheck size={17} strokeWidth={1.8} style={{flexShrink:0}}/>
                {!col&&<div style={{minWidth:0}}>
                  <div style={{fontSize:'.875rem',fontWeight:600,lineHeight:1.2}}>Admin & ML</div>
                  <div style={{fontSize:'.68rem',opacity:.55}}>Users, classifier, RDR</div>
                </div>}
              </NavLink>
            </>
          )}
        </nav>
        <div style={{padding:col?'12px 6px':'12px 10px',borderTop:'1px solid rgba(255,255,255,.08)',position:'relative',zIndex:1}}>
          {!col&&<div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
            borderRadius:'var(--r-md)',background:'rgba(255,255,255,.06)',marginBottom:8}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#FF6B35,#E55A26)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.72rem',fontWeight:700,color:'#fff',flexShrink:0}}>{initials}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:'.8125rem',fontWeight:600,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name||user?.email}</div>
              <div style={{fontSize:'.68rem',color:'rgba(255,255,255,.45)'}}>{user?.is_admin?'Administrator':'User'}</div>
            </div>
          </div>}
          <button onClick={()=>{logout();nav('/login')}} className="nav-item" style={{border:'none',cursor:'pointer',width:'100%'}}>
            <LogOut size={17} style={{flexShrink:0}}/>
            {!col&&<span style={{fontSize:'.875rem'}}>Logout</span>}
          </button>
        </div>
        <button onClick={()=>setCol(c=>!c)} style={{
          position:'absolute',top:68,right:-11,width:22,height:22,borderRadius:'50%',
          background:'var(--surface)',border:'1.5px solid var(--border)',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--sh-md)',zIndex:30}}>
          {col?<ChevronRight size={11} color="var(--text-2)"/>:<ChevronLeft size={11} color="var(--text-2)"/>}
        </button>
      </aside>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'auto',minWidth:0}}>
        <header style={{height:'var(--header-h)',background:'var(--surface)',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',padding:'0 24px',position:'sticky',top:0,zIndex:10,justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:'.78rem',color:'var(--text-3)',fontWeight:500}}>Accfino</span>
            <span style={{color:'var(--border-dark)'}}>/</span>
            <span style={{fontSize:'.875rem',fontWeight:600,color:'var(--text-1)'}}>{pageName}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button className="btn btn-ghost btn-icon"><Bell size={16} color="var(--text-3)"/></button>
            <button className="btn btn-ghost btn-icon"><HelpCircle size={16} color="var(--text-3)"/></button>
            <div style={{width:1,height:20,background:'var(--border)',margin:'0 4px'}}/>
            <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#0B6E4F,#0D8A62)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.72rem',fontWeight:700,color:'#fff'}}>{initials}</div>
          </div>
        </header>
        <main style={{flex:1,padding:'24px 28px',overflowY:'auto'}}><Outlet/></main>
      </div>
    </div>
  )
}
