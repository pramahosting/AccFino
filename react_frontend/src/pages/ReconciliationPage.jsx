import React, { useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import InputPanel       from '../components/reconciliation/InputPanel.jsx'
import OpenBankingInput from '../components/reconciliation/OpenBankingInput.jsx'
import OutputPanel      from '../components/reconciliation/OutputPanel.jsx'
import { processFiles, getSession } from '../lib/api.js'
import toast from 'react-hot-toast'

export default function ReconciliationPage() {
  const { user }   = useAuth()
  const location   = useLocation()
  const navigate   = useNavigate()

  const [mainTab,        setMainTab]        = useState('input')
  const [inputMode,      setInputMode]      = useState('csv')
  const [accounts,       setAccounts]       = useState([])
  const [transactions,   setTransactions]   = useState(null)
  const [monthlySummary, setMonthlySummary] = useState([])
  const [sessionId,      setSessionId]      = useState(null)
  const [running,        setRunning]        = useState(false)

  const username = user?.username || user?.email || 'default_user'

  useEffect(() => {
    const sid = location.state?.openSession
    if (!sid) return
    navigate(location.pathname, { replace: true, state: {} })
    loadSession(sid)
  }, []) // eslint-disable-line

  const loadSession = async (sid) => {
    try {
      const { data } = await getSession(username, sid)
      setTransactions(data.transactions || [])
      setMonthlySummary(data.monthly_summary || [])
      setSessionId(sid)
      const restored = (data.accounts_meta || []).map(a => ({
        bankName:      a.bank_name || a.bankName || '',
        accountNumber: a.account_number || a.accountNumber || '',
        files:         [],
        fileNames:     a.files || [],
        restored:      true,
      }))
      setAccounts(restored)
      setMainTab('output')
      toast.success('Session loaded — showing output. Re-upload CSVs to re-run Agent.')
    } catch (e) {
      toast.error('Failed to load session')
    }
  }

  const handleLoadSession = (txns, summary, sid, accountsMeta) => {
    setTransactions(txns)
    setMonthlySummary(summary || [])
    setSessionId(sid)
    const restored = (accountsMeta || []).map(a => ({
      bankName:      a.bank_name || a.bankName || '',
      accountNumber: a.account_number || a.accountNumber || '',
      files:         [],
      fileNames:     a.files || [],
      restored:      true,
    }))
    setAccounts(restored)
    setMainTab('output')
  }

  const handleProcess = useCallback(async () => {
    const active = accounts.filter(a => !a.restored || a.files.length > 0)
    if (!active.length) {
      toast.error('Add at least one bank account with a CSV file'); return
    }
    setRunning(true)
    try {
      const fd = new FormData()
      active.forEach(acc => {
        acc.files.forEach(f => {
          fd.append('files',           f, f.name)
          fd.append('bank_names',      acc.bankName)
          fd.append('account_numbers', acc.accountNumber)
        })
      })
      fd.append('username', username)
      const { data } = await processFiles(fd)
      setTransactions(data.transactions || [])
      setMonthlySummary(data.monthly_summary || [])
      setSessionId(data.session_id || null)
      // Restore accounts from server response so Input panel stays populated
      if (data.accounts_meta?.length) {
        const restored = data.accounts_meta.map(a => ({
          bankName:      a.bank_name || '',
          accountNumber: a.account_number || '',
          files:         [],
          fileNames:     a.files || [],
          restored:      true,
        }))
        setAccounts(restored)
      }
      setMainTab('output')
      toast.success(`Agent processed ${(data.transactions||[]).length} transactions`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Agent run failed — check CSV format')
    } finally {
      setRunning(false)
    }
  }, [accounts, username])

  const handleObTransactions = (rows) => {
    if (!rows.length) { toast.error('No transactions retrieved from Open Banking'); return }
    const header = 'date,description,debit,credit,balance,bank,account'
    const lines  = rows.map(r =>
      [r.date,r.description,r.debit,r.credit,r.balance,r.bank,r.account]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')
    )
    const csvBlob = new Blob([[header,...lines].join('\n')], {type:'text/csv'})
    const csvFile = new File([csvBlob], `openbanking_${Date.now()}.csv`, {type:'text/csv'})
    const bankName = rows[0]?.bank || 'Open Banking'
    const accNum   = rows[0]?.account || 'OB'
    setAccounts(prev => {
      const existing = prev.find(a => a.bankName===bankName && a.accountNumber===accNum)
      if (existing) return prev.map(a =>
        a.bankName===bankName && a.accountNumber===accNum
          ? {...a, files:[...a.files, csvFile], restored:false} : a)
      return [...prev, { bankName, accountNumber:accNum, files:[csvFile], fileNames:[], restored:false }]
    })
    setInputMode('csv')
    toast.success(`${rows.length} Open Banking transactions added — click ⚡ Run Agent`)
  }

  const inputBadge = accounts.filter(a => a.files.length > 0 || (a.restored && a.fileNames.length > 0)).length

  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}>
        <h1>🏦 Bank Reconciliation</h1>
        <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>
          Upload statements or pull from Open Banking · detect transfers · classify GL &amp; GST · export Excel
        </p>
      </div>

      <div className="tabs-bar" style={{marginBottom:0,justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex'}}>
          {[
            {key:'input',  label:'📥 Input',  badge:inputBadge},
            {key:'output', label:'📊 Output', badge:transactions?.length ?? null},
          ].map(({key,label,badge})=>(
            <button key={key} className={`tab-btn${mainTab===key?' active':''}`} onClick={()=>setMainTab(key)}>
              {label}
              {badge!==null && badge>0 && (
                <span style={{background:mainTab===key?'var(--brand)':'var(--surface-3)',color:mainTab===key?'#fff':'var(--text-3)',fontSize:'.68rem',fontWeight:700,padding:'2px 7px',borderRadius:100}}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',paddingRight:8}}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleProcess}
            disabled={running || !accounts.filter(a=>a.files.length>0).length}
            style={{height:34}}>
            {running ? <><span className="spinner spinner-sm"/> Running…</> : <>⚡ Run Agent</>}
          </button>
        </div>
      </div>

      <div style={{background:'var(--surface)',borderRadius:'0 0 var(--r-lg) var(--r-lg)',border:'1px solid var(--border)',borderTop:'none',padding:'24px',boxShadow:'var(--sh-sm)'}}>
        {mainTab==='input' && (
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, alignItems:'start'}}>

            <div>
              <div style={{display:'flex',gap:0,marginBottom:16,borderBottom:'2px solid var(--border)'}}>
                {[['csv','📂 CSV Files'],['openbanking','🏛️ Open Banking']].map(([k,label])=>(
                  <button key={k} className={`tab-btn${inputMode===k?' active':''}`}
                    onClick={()=>setInputMode(k)} style={{fontSize:'.8rem',padding:'7px 14px'}}>
                    {label}
                  </button>
                ))}
              </div>
              {inputMode==='csv' && (
                <CSVAddAccount accounts={accounts} setAccounts={setAccounts} username={username}/>
              )}
              {inputMode==='openbanking' && (
                <OpenBankingInput onTransactions={handleObTransactions}/>
              )}
            </div>

            <AccountsReady accounts={accounts} setAccounts={setAccounts}/>

            <PastSessions username={username} onLoadSession={handleLoadSession}/>
          </div>
        )}

        {mainTab==='output' && (
          transactions===null ? (
            <div className="empty-state" style={{padding:'56px 24px'}}>
              <div className="empty-icon">⬅️</div>
              <h3>No results yet</h3>
              <p>Add bank accounts in the Input tab, then click ⚡ Run Agent.</p>
              <button className="btn btn-primary" onClick={()=>setMainTab('input')} style={{marginTop:12}}>Go to Input</button>
            </div>
          ) : (
            <OutputPanel
              transactions={transactions}
              setTransactions={setTransactions}
              monthlySummary={monthlySummary}
              setMonthlySummary={setMonthlySummary}
              sessionId={sessionId}
              username={username}
              userId={user?.id}
            />
          )
        )}
      </div>
    </div>
  )
}

// ── CSV Add Account ──────────────────────────────────────────────────────────
function CSVAddAccount({ accounts, setAccounts }) {
  const [banks,    setBanks]   = useState([])
  const [bankName, setBankName]= useState('')
  const [accNum,   setAccNum]  = useState('')
  const [pending,  setPending] = useState([])
  const [dragging, setDragging]= useState(false)
  const fileRef = React.useRef()

  useEffect(() => {
    import('../lib/api.js').then(m => m.getBanks().then(r => setBanks(r.data||[])).catch(()=>{}))
  }, [])

  const addFiles = fs => setPending(p=>[...p,...Array.from(fs).filter(f=>f.name.endsWith('.csv'))])

  const addAccount = () => {
    if (!bankName || !accNum || !pending.length) {
      alert('Select a bank, enter account number, and upload at least one CSV'); return
    }
    setAccounts(a=>[...a,{bankName,accountNumber:accNum,files:pending,fileNames:pending.map(f=>f.name),restored:false}])
    setBankName(''); setAccNum(''); setPending([])
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="input-group">
        <label>Bank</label>
        <select value={bankName} onChange={e=>setBankName(e.target.value)}>
          <option value="">Select bank…</option>
          {banks.map(b=><option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="input-group">
        <label>Account Number</label>
        <input className="input" value={accNum} onChange={e=>setAccNum(e.target.value)} placeholder="e.g. 12345678"/>
      </div>
      <div className="input-group">
        <label>CSV Statement Files</label>
        <div className={`drop-zone${dragging?' drag-over':''}`} style={{padding:'16px'}}
          onDrop={e=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files)}}
          onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
          onClick={()=>fileRef.current.click()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="drop-icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style={{fontSize:'.8rem',color:'var(--text-2)',fontWeight:600}}>Drop CSV files or click to browse</div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" multiple style={{display:'none'}} onChange={e=>addFiles(e.target.files)}/>
        {pending.map((f,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',background:'var(--brand-xlight)',border:'1px solid #A7F3D0',borderRadius:'var(--r-sm)',marginTop:4}}>
            <span style={{flex:1,fontSize:'.75rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
            <button onClick={()=>setPending(p=>p.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',padding:0}}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn btn-accent btn-full" onClick={addAccount}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Add Account
      </button>
    </div>
  )
}

// ── Accounts Ready (NO Run Agent button here) ────────────────────────────────
function AccountsReady({ accounts, setAccounts }) {
  const removeAccount = i => setAccounts(a=>a.filter((_,j)=>j!==i))
  const bankInitials  = n => n ? n.slice(0,3).toUpperCase() : '??'
  const activeCount   = accounts.filter(a=>a.files.length>0||(a.restored&&a.fileNames.length>0)).length

  return (
    <div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,marginBottom:14,textAlign:'center'}}>
        <div style={{width:28,height:28,borderRadius:'var(--r-md)',background:'var(--brand-light)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <h3>Accounts Ready</h3>
          <span style={{background:activeCount?'var(--brand)':'var(--surface-3)',color:activeCount?'#fff':'var(--text-3)',fontSize:'.72rem',fontWeight:700,padding:'2px 8px',borderRadius:100}}>
            {accounts.length}
          </span>
        </div>
      </div>

      {accounts.length===0 ? (
        <div style={{textAlign:'center',padding:'24px 12px',color:'var(--text-3)',fontSize:'.8rem'}}>
          <div style={{fontSize:'1.8rem',marginBottom:6}}>🏦</div>
          No accounts added yet.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {accounts.map((acc,i)=>(
            <div key={i} className="account-pill">
              <div className="bank-badge" style={{background:acc.restored?'var(--surface-3)':'var(--brand-light)',color:acc.restored?'var(--text-3)':'var(--brand)'}}>
                {bankInitials(acc.bankName)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:'.8rem',color:'var(--text-1)'}}>{acc.bankName}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'.7rem',color:'var(--text-3)'}}>{acc.accountNumber}</div>
                {acc.restored ? (
                  <div style={{fontSize:'.7rem',color:'var(--warning)'}}>⚠ Re-upload to re-run</div>
                ) : (
                  <div style={{fontSize:'.7rem',color:'var(--text-3)'}}>{acc.files.length} file{acc.files.length!==1?'s':''}</div>
                )}
                {acc.fileNames?.map((fn,j)=>(
                  <div key={j} style={{fontSize:'.68rem',color:'var(--text-3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📄 {fn}</div>
                ))}
              </div>
              <button onClick={()=>removeAccount(i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',display:'flex',padding:4,borderRadius:'var(--r-sm)',transition:'color .12s'}}
                onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 14.142A2 2 0 0116.138 22H7.862a2 2 0 01-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Past Sessions ────────────────────────────────────────────────────────────
function PastSessions({ username, onLoadSession }) {
  const [sessions,   setSessions]   = useState([])
  const [loadingSid, setLoadingSid] = useState(null)

  useEffect(() => {
    if (!username) return
    import('../lib/api.js').then(m =>
      m.getSessions(username).then(r=>setSessions(r.data||[])).catch(()=>{})
    )
  }, [username])

  const loadSess = async sid => {
    setLoadingSid(sid)
    try {
      const api = await import('../lib/api.js')
      const { data } = await api.getSession(username, sid)
      onLoadSession(data.transactions||[], data.monthly_summary||[], sid, data.accounts_meta||[])
      toast.success('Session loaded')
    } catch {
      toast.error('Failed to load session')
    } finally { setLoadingSid(null) }
  }

  const delSess = async sid => {
    try {
      const api = await import('../lib/api.js')
      await api.deleteSession(username, sid)
      setSessions(s=>s.filter(x=>x.session_id!==sid))
    } catch {}
  }

  return (
    <div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,marginBottom:14,textAlign:'center'}}>
        <div style={{width:28,height:28,borderRadius:'var(--r-md)',background:'var(--brand-light)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <h3>Past Sessions</h3>
          <span style={{background:'var(--surface-3)',color:'var(--text-3)',fontSize:'.72rem',fontWeight:700,padding:'2px 8px',borderRadius:100}}>{sessions.length}</span>
        </div>
      </div>

      {sessions.length===0 ? (
        <div style={{textAlign:'center',padding:'24px 12px',color:'var(--text-3)',fontSize:'.8rem'}}>
          <div style={{fontSize:'1.8rem',marginBottom:6}}>📂</div>
          No sessions yet.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:400,overflowY:'auto'}}>
          {sessions.map(s=>(
            <div key={s.session_id} className="session-item" style={{cursor:'pointer'}}
              onClick={()=>loadSess(s.session_id)}>
              <div style={{width:30,height:30,borderRadius:'var(--r-sm)',background:'var(--brand-light)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {loadingSid===s.session_id
                  ? <span className="spinner spinner-sm"/>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                }
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:'.78rem',color:'var(--text-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {s.display_name||s.session_id}
                </div>
                <div style={{fontSize:'.68rem',color:'var(--text-3)',display:'flex',gap:8,flexWrap:'wrap',marginTop:2}}>
                  {s.account_count>0 && <span>🏦 {s.account_count} acc</span>}
                  {s.file_count>0    && <span>📄 {s.file_count} files</span>}
                  {s.has_results     && <span style={{color:'var(--success)'}}>✓ results</span>}
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();delSess(s.session_id)}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',display:'flex',padding:4,flexShrink:0,transition:'color .12s'}}
                onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 14.142A2 2 0 0116.138 22H7.862a2 2 0 01-1.995-1.858L5 6"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
