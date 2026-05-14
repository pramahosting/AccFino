import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { saveSession, saveToDB, classifyGL, exportExcel } from '../../lib/api.js'
import {
  Download, Trash2, Pencil, X, Check, ChevronLeft, ChevronRight,
  Sparkles, Database, Plus, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, RefreshCw, DollarSign
} from 'lucide-react'
import toast from 'react-hot-toast'

// Exact GL options from original CATEGORY_ENUM
const GL_ACCTS = ['Revenue','Direct Costs','Expense','Inventory','Fixed Asset','GST','Equity','Transfer','Liability','']
// Exact GST options from original GST_CATEGORY_OPTIONS
const GST_CATS = ['GST on Sale','GST Free Sale','GST on Purchase','Input Taxed Sales','BAS Excluded','Interest Income','Other Exempt Income','Unknown']
const CLASSES  = ['🟢Internal','🔵Incoming','🟡Outgoing','⚪Unclassified']
const PAGE_SZ  = 25

const fmtN   = n => (n == null || n === 0) ? '' : Number(n).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtAUD = n => new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:2}).format(n||0)

function ClassBadge({ val }) {
  if (!val) return null
  const cls = val.includes('Internal') ? 'badge-cls-int'
    : val.includes('Incoming') ? 'badge-cls-in'
    : val.includes('Outgoing') ? 'badge-cls-out'
    : 'badge-neutral'
  return <span className={`badge ${cls}`}>{val}</span>
}

const BLANK = {date:'',bank:'',account:'',description:'',debit:0,credit:0,
  classification:'🔵Incoming',pairid:'',gl_account:'',gst:0,gst_category:'Unknown',who:''}

function StatStrip({ stats }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
      {[
        {label:'Total Incoming',  val:fmtAUD(stats.totalIn),  icon:TrendingUp,  color:'var(--info)',    bg:'var(--info-bg)'},
        {label:'Total Outgoing',  val:fmtAUD(stats.totalOut), icon:TrendingDown, color:'var(--warning)', bg:'var(--warning-bg)'},
        {label:'Internal Pairs',  val:stats.intCount,          icon:RefreshCw,   color:'var(--success)', bg:'var(--success-bg)'},
        {label:'Total GST',       val:fmtAUD(stats.totalGST), icon:DollarSign,  color:'var(--brand)',   bg:'var(--brand-light)'},
      ].map(({label,val,icon:Icon,color,bg})=>(
        <div key={label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-lg)',padding:'14px 16px',display:'flex',alignItems:'center',gap:12,boxShadow:'var(--sh-xs)'}}>
          <div style={{width:36,height:36,borderRadius:'var(--r-md)',background:bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon size={17} color={color}/>
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:'.7rem',fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:2}}>{label}</div>
            <div style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:'.95rem',color:'var(--text-1)',whiteSpace:'nowrap'}}>{val}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function OutputPanel({
  transactions, setTransactions, monthlySummary, setMonthlySummary,
  sessionId, username, userId, onRefresh, classifying: externalClassifying
}) {
  const [page,        setPage]        = useState(1)
  const [filters,     setFilters]     = useState({internal:true,incoming:true,outgoing:true,unclassified:true})
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(new Set())
  const [editIdx,     setEditIdx]     = useState(null)
  const [editRow,     setEditRow]     = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)
  const [newRow,      setNewRow]      = useState({...BLANK})
  const [saving,      setSaving]      = useState(false)
  const [showSummary, setShowSummary] = useState(true)
  const [showTxn,     setShowTxn]     = useState(true)

  // ── derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = transactions.filter(t => {
      const cl = t.classification || ''
      if (!filters.internal     && cl.includes('Internal'))    return false
      if (!filters.incoming     && cl.includes('Incoming'))    return false
      if (!filters.outgoing     && cl.includes('Outgoing'))    return false
      if (!filters.unclassified && cl.includes('Unclassified')) return false
      return true
    })
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(t =>
        (t.description||'').toLowerCase().includes(q) ||
        (t.bank||'').toLowerCase().includes(q) ||
        (t.account||'').toLowerCase().includes(q) ||
        (t.who||'').toLowerCase().includes(q)
      )
    }
    return rows
  }, [transactions, filters, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SZ))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage-1)*PAGE_SZ, safePage*PAGE_SZ)

  const stats = useMemo(() => {
    const inc = filtered.filter(t=>(t.classification||'').includes('Incoming'))
    const out = filtered.filter(t=>(t.classification||'').includes('Outgoing'))
    const int_ = filtered.filter(t=>(t.classification||'').includes('Internal'))
    return {
      totalIn:  inc.reduce((s,t)=>s+(t.credit||0),0),
      totalOut: out.reduce((s,t)=>s+(t.debit||0),0),
      totalGST: filtered.reduce((s,t)=>s+(t.gst||0),0),
      intCount: int_.length,
    }
  }, [filtered])

  // ── helpers ───────────────────────────────────────────────────────────────
  const absIdx  = rel => (safePage-1)*PAGE_SZ + rel
  const toggleF = k  => { setFilters(f=>({...f,[k]:!f[k]})); setPage(1) }
  const toggleS = i  => setSelected(s=>{ const n=new Set(s); n.has(i)?n.delete(i):n.add(i); return n })
  const toggleAll = () => {
    const idxs = pageRows.map((_,r)=>absIdx(r))
    selected.size===pageRows.length ? setSelected(new Set()) : setSelected(new Set(idxs))
  }

  const updateCell = useCallback((ai, field, val) => {
    setTransactions(prev => prev.map((t,i) => i===ai ? {...t,[field]:val} : t))
  }, [setTransactions])

  // ── edit ──────────────────────────────────────────────────────────────────
  const startEdit  = (row,ai) => { setEditIdx(ai); setEditRow({...row}) }
  const cancelEdit = ()       => { setEditIdx(null); setEditRow(null) }
  const saveEdit   = ()       => {
    setTransactions(prev=>prev.map((t,i)=>i===editIdx?editRow:t))
    setEditIdx(null); setEditRow(null); toast.success('Row updated')
  }
  const setER = k => v => setEditRow(r=>({...r,[k]:v.target?v.target.value:v}))

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteSelected = () => {
    const idxs = new Set(selected)
    setTransactions(prev=>prev.filter((_,i)=>!idxs.has(i)))
    setSelected(new Set())
    toast.success(`Deleted ${idxs.size} row(s)`)
  }

  // ── add row ───────────────────────────────────────────────────────────────
  const addRow = () => {
    setTransactions(prev=>[...prev,{...newRow}])
    setShowAdd(false); setNewRow({...BLANK}); toast.success('Row added')
  }

  // ── classify (auto-refresh) ───────────────────────────────────────────────
  const handleClassify = async () => {
    if (!sessionId) { toast.error('Process files first to create a session'); return }
    // Save current state first
    try { await saveSession({session_id:sessionId,username,transactions,pending_changes:{},page_number:safePage}) } catch {}
    try {
      const { data } = await classifyGL(sessionId, username)
      if (data?.transactions) {
        setTransactions(data.transactions)
        if (data.monthly_summary) setMonthlySummary(data.monthly_summary)
        toast.success('GL & GST classification complete')
      }
    } catch (e) { toast.error(e.response?.data?.detail||'Classification failed') }
  }

  // ── save session ─────────────────────────────────────────────────────────
  const handleSaveSession = async () => {
    if (!sessionId) { toast.error('No active session'); return }
    try {
      await saveSession({session_id:sessionId,username,transactions,pending_changes:{},page_number:safePage})
      toast.success('Session saved')
    } catch { toast.error('Session save failed') }
  }

  // ── save to DB ────────────────────────────────────────────────────────────
  const handleSaveDB = async () => {
    if (!userId) { toast.error('Log in to save to DB'); return }
    setSaving(true)
    try {
      const payload = transactions.map(t=>({
        date:t.date, bank:t.bank, account:t.account, description:t.description,
        debit:t.debit||0, credit:t.credit||0, classification:t.classification,
        pair_id:t.pairid||t.pair_id||null, gl_account:t.gl_account,
        gst:t.gst||0, gst_category:t.gst_category, who:t.who,
      }))
      const { data } = await saveToDB(userId, payload)
      toast.success(`Saved ${data.saved||0} · Updated ${data.updated||0}`)
      if (onRefresh) onRefresh()  // refresh dashboard stats
    } catch { toast.error('Save to DB failed') }
    finally { setSaving(false) }
  }

  // ── export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const { data } = await exportExcel(transactions)
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a'); a.href=url; a.download='accfino_reconciliation.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  return (
    <div>
      <StatStrip stats={stats} />

      {/* Monthly Summary — exact columns from original */}
      {monthlySummary?.length > 0 && (
        <div style={{marginBottom:16,border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden'}}>
          <button onClick={()=>setShowSummary(s=>!s)} style={{
            width:'100%',display:'flex',alignItems:'center',gap:8,padding:'11px 18px',
            background:'var(--surface-2)',border:'none',cursor:'pointer',fontFamily:'inherit',justifyContent:'space-between',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:600,fontSize:'.875rem',color:'var(--text-1)'}}>
              📊 Monthly Summary
              <span style={{fontWeight:400,fontSize:'.78rem',color:'var(--text-3)'}}>{monthlySummary.length-1} months</span>
            </div>
            {showSummary ? <ChevronUp size={15} color="var(--text-3)"/> : <ChevronDown size={15} color="var(--text-3)"/>}
          </button>
          {showSummary && (
            <div style={{overflowX:'auto'}}>
              <table className="summary-table">
                <thead>
                  <tr>
                    {['Year/Month','🟢Internal Transfers','🔵Incoming Count','🟡Outgoing Count',
                      'Total 🔵Incoming Income','Total 🟡Outgoing Expense',
                      'Total 🔵Incoming GST','Total 🟡Outgoing GST'].map(h=>(
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map((row,i)=>(
                    <tr key={i} style={row['Year/Month']==='Grand Total'?{fontWeight:700,background:'#FFFDE7'}:{}}>
                      <td><span className="mono" style={{fontSize:'.8rem'}}>{row['Year/Month']}</span></td>
                      <td>{row['🟢Internal Transfers']}</td>
                      <td>{row['🔵Incoming Count']}</td>
                      <td>{row['🟡Outgoing Count']}</td>
                      <td className="num">{fmtAUD(row['Total 🔵Incoming Income'])}</td>
                      <td className="num">{fmtAUD(row['Total 🟡Outgoing Expense'])}</td>
                      <td className="num">{fmtAUD(row['Total 🔵Incoming GST'])}</td>
                      <td className="num">{fmtAUD(row['Total 🟡Outgoing GST'])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transaction Details — collapsible */}
      <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-lg)',overflow:'hidden',marginBottom:8}}>
        <button onClick={()=>setShowTxn(s=>!s)} style={{
          width:'100%',display:'flex',alignItems:'center',gap:8,padding:'11px 18px',
          background:'var(--surface-2)',border:'none',cursor:'pointer',fontFamily:'inherit',justifyContent:'space-between',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:600,fontSize:'.875rem',color:'var(--text-1)'}}>
            📋 Transaction Details
            <span style={{fontWeight:400,fontSize:'.78rem',color:'var(--text-3)'}}>{filtered.length} rows</span>
          </div>
          {showTxn ? <ChevronUp size={15} color="var(--text-3)"/> : <ChevronDown size={15} color="var(--text-3)"/>}
        </button>
      {showTxn && <div style={{padding:'8px'}}>
      {/* Toolbar — search + action buttons */}
      <div style={{display:'flex',gap:8,marginBottom:6,flexWrap:'wrap',alignItems:'center'}}>
        <div className="search-wrap" style={{flex:'none'}}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="input input-sm" style={{width:220,paddingLeft:34}} placeholder="Search description, bank, who…"
            value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
        </div>
        <div style={{flex:1}}/>
        <button className="btn btn-outline btn-sm" onClick={()=>setShowAdd(s=>!s)}><Plus size={13}/> Add Row</button>
        <button className="btn btn-outline btn-sm" onClick={handleClassify} disabled={!!externalClassifying}>
          <Sparkles size={13}/> {externalClassifying?'Classifying…':'Auto-Classify GL'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={handleSaveSession}>💾 Save Session</button>
        <button className="btn btn-outline btn-sm" onClick={handleExport}><Download size={13}/> Excel</button>
        <button className="btn btn-primary btn-sm" onClick={handleSaveDB} disabled={saving}>
          <Database size={13}/> {saving?'Saving…':'Save to DB'}
        </button>
        {selected.size>0 && (
          <button className="btn btn-danger btn-sm" onClick={deleteSelected}><Trash2 size={13}/> Delete ({selected.size})</button>
        )}
      </div>

      {/* Filter row — second line, right-aligned above data table */}
      <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:10,justifyContent:'flex-end'}}>
        <span style={{fontSize:'.72rem',color:'var(--text-3)',marginRight:4}}>Show:</span>
        {[['internal','🟢','badge-cls-int'],['incoming','🔵','badge-cls-in'],
          ['outgoing','🟡','badge-cls-out'],['unclassified','⚪','badge-neutral']].map(([k,emoji,cls])=>(
          <button key={k} onClick={()=>toggleF(k)}
            className={`chip${filters[k]?` ${k==='internal'?'active-int':k==='incoming'?'active-in':k==='outgoing'?'active-out':''}`:''}`}
            style={{opacity:filters[k]?1:.4,transition:'opacity .15s',fontSize:'.75rem',padding:'4px 10px'}}>
            {emoji} {k.charAt(0).toUpperCase()+k.slice(1)}
          </button>
        ))}
      </div>

      {/* Add Row */}
      </div>}
      </div>

      {showAdd && (
        <div className="card card-flat" style={{marginBottom:12,background:'var(--surface-2)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <h4>Add Transaction</h4>
            <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>setShowAdd(false)} style={{marginLeft:'auto'}}><X size={14}/></button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
            <div className="input-group"><label>Date</label><input className="input" type="date" value={newRow.date} onChange={e=>setNewRow(r=>({...r,date:e.target.value}))}/></div>
            <div className="input-group"><label>Bank</label><input className="input" value={newRow.bank} onChange={e=>setNewRow(r=>({...r,bank:e.target.value}))}/></div>
            <div className="input-group"><label>Account</label><input className="input" value={newRow.account} onChange={e=>setNewRow(r=>({...r,account:e.target.value}))}/></div>
            <div className="input-group" style={{gridColumn:'span 2'}}><label>Description</label><input className="input" value={newRow.description} onChange={e=>setNewRow(r=>({...r,description:e.target.value}))}/></div>
            <div className="input-group"><label>Classification</label><select className="input" value={newRow.classification} onChange={e=>setNewRow(r=>({...r,classification:e.target.value}))}>{CLASSES.map(o=><option key={o}>{o}</option>)}</select></div>
            <div className="input-group"><label>Debit</label><input className="input" type="number" min="0" step="0.01" value={newRow.debit} onChange={e=>setNewRow(r=>({...r,debit:parseFloat(e.target.value)||0}))}/></div>
            <div className="input-group"><label>Credit</label><input className="input" type="number" min="0" step="0.01" value={newRow.credit} onChange={e=>setNewRow(r=>({...r,credit:parseFloat(e.target.value)||0}))}/></div>
            <div className="input-group"><label>GL Account</label><select className="input" value={newRow.gl_account} onChange={e=>setNewRow(r=>({...r,gl_account:e.target.value}))}>{GL_ACCTS.map(o=><option key={o} value={o}>{o||'—'}</option>)}</select></div>
            <div className="input-group"><label>GST Category</label><select className="input" value={newRow.gst_category} onChange={e=>setNewRow(r=>({...r,gst_category:e.target.value}))}>{GST_CATS.map(o=><option key={o}>{o}</option>)}</select></div>
            <div className="input-group"><label>Who</label><input className="input" value={newRow.who} onChange={e=>setNewRow(r=>({...r,who:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button className="btn btn-primary btn-sm" onClick={addRow}><Check size={13}/> Add</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editIdx!==null && editRow && (
        <div className="modal-overlay" onClick={cancelEdit}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <Pencil size={18} color="var(--brand)"/>
              <h3>Edit Transaction</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={cancelEdit} style={{marginLeft:'auto'}}><X size={16}/></button>
            </div>
            <div className="grid-2" style={{gap:12}}>
              {[['date','Date','date'],['bank','Bank','text'],['account','Account','text'],
                ['pairid','Pair ID','text'],['who','Who','text']].map(([k,lbl,type])=>(
                <div key={k} className="input-group"><label>{lbl}</label><input className="input" type={type} value={editRow[k]||''} onChange={setER(k)}/></div>
              ))}
              <div className="input-group" style={{gridColumn:'span 2'}}><label>Description</label><input className="input" value={editRow.description||''} onChange={setER('description')}/></div>
              <div className="input-group"><label>Debit</label><input className="input" type="number" value={editRow.debit||0} onChange={e=>setEditRow(r=>({...r,debit:parseFloat(e.target.value)||0}))}/></div>
              <div className="input-group"><label>Credit</label><input className="input" type="number" value={editRow.credit||0} onChange={e=>setEditRow(r=>({...r,credit:parseFloat(e.target.value)||0}))}/></div>
              <div className="input-group"><label>Classification</label><select className="input" value={editRow.classification||''} onChange={setER('classification')}>{CLASSES.map(o=><option key={o}>{o}</option>)}</select></div>
              <div className="input-group"><label>GL Account</label><select className="input" value={editRow.gl_account||''} onChange={setER('gl_account')}>{GL_ACCTS.map(o=><option key={o} value={o}>{o||'—'}</option>)}</select></div>
              <div className="input-group"><label>GST</label><input className="input" type="number" value={editRow.gst||0} onChange={e=>setEditRow(r=>({...r,gst:parseFloat(e.target.value)||0}))}/></div>
              <div className="input-group"><label>GST Category</label><select className="input" value={editRow.gst_category||''} onChange={setER('gst_category')}>{GST_CATS.map(o=><option key={o}>{o}</option>)}</select></div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
              <button className="btn btn-primary" onClick={saveEdit}><Check size={15}/> Save Changes</button>
              <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Data Table — ALL columns from original */}
      <div className="data-table-wrap">
        <div style={{overflowX:'auto'}}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:36,paddingLeft:14}}>
                  <input type="checkbox" style={{cursor:'pointer',accentColor:'var(--brand)'}}
                    checked={selected.size===pageRows.length&&pageRows.length>0} onChange={toggleAll}/>
                </th>
                <th>Date</th>
                <th>Bank</th>
                <th>Account</th>
                <th style={{minWidth:200}}>Description</th>
                <th style={{textAlign:'right'}}>Debit</th>
                <th style={{textAlign:'right'}}>Credit</th>
                <th>Classification</th>
                <th>Pair ID</th>
                <th style={{minWidth:140}}>GL Account</th>
                <th style={{textAlign:'right'}}>GST</th>
                <th style={{minWidth:160}}>GST Category</th>
                <th>Who</th>
                <th style={{width:44}}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row,relI)=>{
                const ai  = absIdx(relI)
                const sel = selected.has(ai)
                const cl  = row.classification||''
                const rowClass = [
                  cl.includes('Internal')?'row-internal':'',
                  cl.includes('Incoming')?'row-incoming':'',
                  cl.includes('Outgoing')?'row-outgoing':'',
                  sel?'row-selected':'',
                ].filter(Boolean).join(' ')
                return (
                  <tr key={ai} className={rowClass}>
                    <td style={{paddingLeft:14}}>
                      <input type="checkbox" checked={sel} onChange={()=>toggleS(ai)} style={{cursor:'pointer',accentColor:'var(--brand)'}}/>
                    </td>
                    <td><span className="mono" style={{fontSize:'.78rem',whiteSpace:'nowrap'}}>{row.date}</span></td>
                    <td><span style={{fontSize:'.8rem',fontWeight:500}}>{row.bank}</span></td>
                    <td><span className="mono" style={{fontSize:'.75rem'}}>{row.account}</span></td>
                    <td><div style={{maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:'.8rem'}} title={row.description}>{row.description}</div></td>
                    <td style={{textAlign:'right'}}>
                      {row.debit?<span className="mono" style={{fontSize:'.8rem',color:'var(--warning)',fontWeight:600}}>{fmtN(row.debit)}</span>:null}
                    </td>
                    <td style={{textAlign:'right'}}>
                      {row.credit?<span className="mono" style={{fontSize:'.8rem',color:'var(--info)',fontWeight:600}}>{fmtN(row.credit)}</span>:null}
                    </td>
                    <td><ClassBadge val={row.classification}/></td>
                    <td><span className="mono text-muted" style={{fontSize:'.72rem'}}>{row.pairid||row.pair_id}</span></td>
                    <td>
                      <select value={row.gl_account||''} onChange={e=>updateCell(ai,'gl_account',e.target.value)}
                        className="select-compact" style={{minWidth:120}}>
                        {GL_ACCTS.map(o=><option key={o} value={o}>{o||'—'}</option>)}
                      </select>
                    </td>
                    <td style={{textAlign:'right'}}>
                      {row.gst?<span className="mono" style={{fontSize:'.78rem',color:'var(--brand)'}}>{fmtN(row.gst)}</span>:null}
                    </td>
                    <td>
                      <select value={row.gst_category||'Unknown'} onChange={e=>updateCell(ai,'gst_category',e.target.value)}
                        className="select-compact" style={{minWidth:142}}>
                        {GST_CATS.map(o=><option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td style={{fontSize:'.78rem',color:'var(--text-2)',whiteSpace:'nowrap',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis'}} title={row.who}>{row.who}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon" style={{padding:5}} onClick={()=>startEdit(row,ai)}>
                        <Pencil size={13} color="var(--text-3)"/>
                      </button>
                    </td>
                  </tr>
                )
              })}
              {pageRows.length===0&&(
                <tr><td colSpan={14}>
                  <div className="empty-state" style={{padding:'32px 24px'}}>
                    <p>No transactions match the current filters.</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderTop:'1px solid var(--border)',background:'var(--surface-2)'}}>
          <span style={{fontSize:'.78rem',color:'var(--text-3)'}}>
            <strong style={{color:'var(--text-1)'}}>{filtered.length}</strong> transaction{filtered.length!==1?'s':''}
            {' · '}Page <strong style={{color:'var(--text-1)'}}>{safePage}</strong> of {totalPages}
          </span>
          <div className="pagination">
            <button className="page-btn" disabled={safePage<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button>
            {[...Array(Math.min(totalPages,9))].map((_,i)=>{
              const p=i+1
              return <button key={p} onClick={()=>setPage(p)} className={`page-btn${p===safePage?' active':''}`}>{p}</button>
            })}
            <button className="page-btn" disabled={safePage>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  )
}
