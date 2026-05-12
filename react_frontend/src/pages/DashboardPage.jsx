import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { getSessions, getDashboardStats } from '../lib/api.js'
import { ArrowLeftRight, TrendingUp, TrendingDown, RefreshCw, Activity,
         BarChart3, ArrowRight, Calendar, Folder, Trash2 } from 'lucide-react'
import { deleteSession as apiDeleteSession } from '../lib/api.js'

const fmtAUD  = n => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n||0)
const fmtFull = n => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:2}).format(n||0)

const QUICK = [
  {to:'/reconciliation', icon:'🏦', label:'Bank Reconciliation',  desc:'Upload statements or pull from Open Banking'},
  {to:'/trading',        icon:'📈', label:'Trading Analysis',      desc:'Crypto & equity CGT tax reports'},
  {to:'/cash-flow',      icon:'💰', label:'Cash Flow Forecast',    desc:'ML-powered next-month prediction'},
  {to:'/invoice',        icon:'📄', label:'Invoice Manager',       desc:'Create GST invoices & extract from PDFs'},
  {to:'/admin',          icon:'🧠', label:'Admin & ML Classifier', desc:'Train models, RDR rules, manage users'},
]

function StatCard({label,value,sub,colorVar,iconColor,icon:Icon}) {
  return (
    <div className="stat-card" style={{'--stat-accent':colorVar,'--stat-icon-bg':iconColor+'18'}}>
      <div className="stat-icon"><Icon size={18} color={iconColor}/></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { user }  = useAuth()
  const nav       = useNavigate()

  const [stats,    setStats]    = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  const usernameRef = useRef(user?.username || user?.email || '')

  useEffect(() => {
    usernameRef.current = user?.username || user?.email || ''
  }, [user])

  const doLoad = (uname) => {
    if (!uname) { setLoading(false); return }
    Promise.all([
      getDashboardStats(uname).then(r => setStats(r.data)).catch(() => setStats(null)),
      getSessions(uname).then(r => setSessions(Array.isArray(r.data) ? r.data : [])).catch(() => setSessions([])),
    ]).finally(() => { setLastRefresh(Date.now()); setLoading(false) })
  }

  useEffect(() => {
    const uname = user?.username || user?.email || ''
    usernameRef.current = uname
    setLoading(true)
    doLoad(uname)
  }, [user?.username, user?.email]) // eslint-disable-line

  useEffect(() => {
    const t = setInterval(() => doLoad(usernameRef.current), 30000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line

  const firstName   = (user?.name || '').split(' ')[0] || 'there'
  const hour        = new Date().getHours()
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const refreshTime = new Date(lastRefresh).toLocaleTimeString('en-AU', {hour:'2-digit',minute:'2-digit'})

  const totalIn  = stats?.total_in  || 0
  const totalOut = stats?.total_out || 0
  const totalGST = stats?.total_gst || 0
  const internal = stats?.internal  || 0
  const incoming = stats?.incoming  || 0
  const outgoing = stats?.outgoing  || 0
  const net      = totalIn - totalOut

  const delSession = async (sid) => {
    const uname = usernameRef.current
    await apiDeleteSession(uname, sid).catch(() => {})
    setSessions(prev => prev.filter(x => x.session_id !== sid))
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{marginBottom:24,display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{fontSize:'.8rem',color:'var(--text-3)',fontWeight:500,marginBottom:4}}>
            {new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </div>
          <h1>{greeting}, {firstName} 👋</h1>
          <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>
            Financial overview across all reconciliation sessions.
            <span style={{marginLeft:8,fontSize:'.75rem',opacity:.7}}>Updated {refreshTime}</span>
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); doLoad(usernameRef.current) }}>
            <RefreshCw size={14}/> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => nav('/reconciliation')}>
            <ArrowLeftRight size={15}/> New Reconciliation
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="stats-grid" style={{marginBottom:24}}>
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton" style={{height:112,borderRadius:'var(--r-lg)'}}/>)}
        </div>
      ) : (
        <div className="stats-grid" style={{marginBottom:24}}>
          <StatCard label="Total Incoming"     value={fmtAUD(totalIn)}
            sub={`${incoming} transactions`}   colorVar="var(--info)"    iconColor="#2563EB" icon={TrendingUp}/>
          <StatCard label="Total Outgoing"     value={fmtAUD(totalOut)}
            sub={`${outgoing} transactions`}   colorVar="var(--warning)" iconColor="#D97706" icon={TrendingDown}/>
          <StatCard label="Internal Transfers" value={internal}
            sub="matched pairs"                colorVar="var(--success)" iconColor="#059669" icon={RefreshCw}/>
          <StatCard label="Net Position"       value={fmtAUD(Math.abs(net))}
            sub={net >= 0 ? '↑ Surplus' : '↓ Deficit'}
            colorVar={net >= 0 ? 'var(--success)' : 'var(--danger)'}
            iconColor={net >= 0 ? '#059669' : '#DC2626'} icon={Activity}/>
        </div>
      )}

      {/* GST strip */}
      {!loading && totalGST > 0 && (
        <div style={{background:'linear-gradient(135deg,var(--brand-light),#fff)',border:'1px solid #A7F3D0',borderRadius:'var(--r-lg)',padding:'14px 20px',marginBottom:24,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{width:36,height:36,borderRadius:'var(--r-md)',background:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <BarChart3 size={18} color="#fff"/>
          </div>
          <div>
            <div style={{fontSize:'.78rem',fontWeight:700,color:'var(--brand)',textTransform:'uppercase',letterSpacing:'.05em'}}>Total GST Collected / Paid</div>
            <div style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:'1.1rem',color:'var(--text-1)'}}>{fmtFull(totalGST)}</div>
          </div>
          <div style={{marginLeft:'auto'}}><span className="badge badge-brand">BAS Ready</span></div>
        </div>
      )}

      {/* Modules */}
      <h2 style={{marginBottom:14}}>Modules</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:28}}>
        {QUICK.map(({to,icon,label,desc}) => (
          <button key={to} onClick={() => nav(to)} style={{
            display:'flex',alignItems:'center',gap:14,padding:'16px 18px',
            borderRadius:'var(--r-lg)',background:'var(--surface)',border:'1.5px solid var(--border)',
            cursor:'pointer',textAlign:'left',transition:'all .18s',boxShadow:'var(--sh-sm)',fontFamily:'inherit',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.boxShadow='var(--sh-md)';e.currentTarget.style.transform='translateY(-2px)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='var(--sh-sm)';e.currentTarget.style.transform='none'}}
          >
            <div style={{fontSize:'1.75rem',lineHeight:1,flexShrink:0}}>{icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:'.9rem',color:'var(--text-1)',marginBottom:2}}>{label}</div>
              <div style={{fontSize:'.78rem',color:'var(--text-3)',lineHeight:1.4}}>{desc}</div>
            </div>
            <ArrowRight size={16} color="var(--text-3)" style={{flexShrink:0}}/>
          </button>
        ))}
      </div>

      {/* Reconciliation Sessions */}
      {sessions.length > 0 && (
        <div style={{marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <h2 style={{display:'flex',alignItems:'center',gap:8}}>
              <Folder size={20} color="var(--brand)"/> Reconciliation Sessions
            </h2>
            <span style={{fontSize:'.78rem',color:'var(--text-3)',marginLeft:'auto'}}>
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Bank Accounts</th>
                  <th>Input Files</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.session_id} style={{cursor:'pointer'}}
                    onClick={() => nav('/reconciliation', {state:{openSession:s.session_id}})}
                    onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background='var(--brand-xlight)')}
                    onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background='')}>
                    <td>
                      <div style={{fontWeight:600,fontSize:'.8rem',color:'var(--text-1)'}}>
                        {s.display_name || s.session_id}
                      </div>
                      {s.datetime && (
                        <div style={{fontSize:'.72rem',color:'var(--text-3)'}}>
                          {new Date(s.datetime).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                        </div>
                      )}
                    </td>
                    <td>
                      {(s.account_count > 0) ? (
                        <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,color:'var(--brand)',fontSize:'.8rem'}}>{s.account_count}</span>
                          {(s.accounts_meta || []).slice(0,3).map((a,i) => (
                            <span key={i} className="badge badge-neutral" style={{fontSize:'.65rem'}}>
                              {a.bank_name || a.bankName || '—'}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{color:'var(--text-3)',fontSize:'.8rem'}}>—</span>}
                    </td>
                    <td>
                      {(s.file_count > 0)
                        ? <span style={{fontWeight:700,fontSize:'.8rem',color:'var(--text-2)'}}>{s.file_count}</span>
                        : <span style={{color:'var(--text-3)',fontSize:'.8rem'}}>—</span>}
                    </td>
                    <td>
                      {s.has_results
                        ? <span className="badge badge-success">✓ Results</span>
                        : <span className="badge badge-neutral">Pending</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-icon btn-sm"
                        style={{color:'var(--text-3)'}}
                        onMouseEnter={e => e.currentTarget.style.color='var(--danger)'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}
                        onClick={() => delSession(s.session_id)}>
                        <Trash2 size={13}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{fontSize:'.75rem',color:'var(--text-3)',marginTop:8}}>
            Click any session to open it in Reconciliation with full input and output restored.
          </p>
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="card" style={{maxWidth:480}}>
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>No sessions yet</h3>
            <p>Run your first bank reconciliation to see financial stats here. Data auto-refreshes every 30 seconds.</p>
            <button className="btn btn-primary" onClick={() => nav('/reconciliation')} style={{marginTop:12}}>
              Go to Reconciliation
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
