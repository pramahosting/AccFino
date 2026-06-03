import React, { useState, useMemo, useCallback, useRef } from 'react'
import { saveSession, saveToDB, classifyGL, reclassifyGL, exportExcel } from '../../lib/api.js'
import {
  Download, Trash2, Pencil, X, Check, ChevronLeft, ChevronRight,
  BookOpen, Database, Plus, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, RefreshCw, DollarSign,
  ArrowUpDown, ArrowUp, ArrowDown, Upload, Save,
} from 'lucide-react'
import toast from 'react-hot-toast'

const GST_CATS = ['GST on Expenses','GST on Income','GST on Capital','GST Free Expenses','GST Free Income','BAS Excluded','']
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
  classification:'🔵Incoming',pairid:'',gl_account:'',gl_type:'',gst:0,gst_category:'Unknown',who:''}

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

// ── Column filter popover ─────────────────────────────────────────────────────
function ColFilter({ col, values, active, onChange, onClose }) {
  // selected = set of values user has ticked. Empty = no filter = show all rows.
  // "All" and "None" both clear selection → show all rows.
  // Ticking any option = filter to only ticked rows.
  const unique = useMemo(() => [...new Set(values.map(v => String(v||'')))].sort(), [values])
  // Start with all options checked (no filter). If a filter was previously
  // applied (active non-empty), restore that selection.
  const [selected, setSelected] = useState(() =>
    active.size > 0 ? new Set(active) : new Set(unique)
  )

  const hasSelection = selected.size > 0 && selected.size < unique.length

  const toggle = v => setSelected(s => {
    const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n
  })

  const apply = () => {
    // All selected = no filter (pass empty set). Subset = filter to that subset.
    onChange(selected.size === unique.length ? new Set() : new Set(selected))
    onClose()
  }

  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'absolute',top:'100%',left:0,zIndex:9999,
      background:'var(--surface)',border:'1px solid var(--border)',
      borderRadius:'var(--r-md)',boxShadow:'var(--sh-lg)',
      padding:'10px',minWidth:200,maxHeight:340,display:'flex',flexDirection:'column',gap:6,
    }}>
      {/* All / None — both clear selection (show all rows) */}
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <button className="btn btn-ghost btn-xs"
          style={{fontWeight: selected.size===unique.length ? 700 : 400, color: selected.size===unique.length ? 'var(--brand)' : undefined}}
          onClick={()=>setSelected(new Set(unique))}>All</button>
        <button className="btn btn-ghost btn-xs"
          style={{fontWeight: selected.size===0 ? 700 : 400}}
          onClick={()=>setSelected(new Set())}>None</button>
        {hasSelection && (
          <span style={{fontSize:'.72rem',color:'var(--warning)',marginLeft:'auto'}}>
            {selected.size} selected
          </span>
        )}
      </div>
      {/* Divider */}
      <div style={{borderTop:'1px solid var(--border)',margin:'0 -4px'}}/>
      {/* Selected group first (asc), then unselected (asc), divider between */}
      <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:1}}>
        {(()=>{
          const sel   = unique.filter(v =>  selected.has(v)).sort()
          const unsel = unique.filter(v => !selected.has(v)).sort()
          const row = v => (
            <label key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',
              fontSize:'.78rem',padding:'3px 6px',borderRadius:4,
              background:selected.has(v)?'var(--brand-xlight)':'transparent',
              transition:'background .1s'}}>
              <input type="checkbox" checked={selected.has(v)} onChange={()=>toggle(v)}
                style={{accentColor:'var(--brand)',flexShrink:0}}/>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                {v||'(blank)'}
              </span>
            </label>
          )
          return <>
            {sel.map(row)}
            {sel.length>0 && unsel.length>0 && (
              <div key="__div" style={{borderTop:'1px dashed var(--border)',
                margin:'3px 0',fontSize:'.68rem',color:'var(--text-3)',
                paddingLeft:4,paddingTop:3}}>— unselected —</div>
            )}
            {unsel.map(row)}
          </>
        })()}
      </div>
      {/* Apply */}
      <button className="btn btn-primary btn-xs" onClick={apply}>
        Apply{hasSelection ? ` (${selected.size})` : ' (all)'}
      </button>
    </div>
  )
}

// ── Sort/Filter header cell ───────────────────────────────────────────────────
function SortTh({ label, field, sort, setSort, colFilters, setColFilters, values, style }) {
  const [open, setOpen] = useState(false)
  const isAsc  = sort.field===field && sort.dir==='asc'
  const isDesc = sort.field===field && sort.dir==='desc'
  const hasFilter = colFilters[field] && colFilters[field].size > 0
return (
    <th style={{position:'relative',userSelect:'none',whiteSpace:'nowrap',...style}}>
      <div style={{display:'inline-flex',alignItems:'center',gap:4}}>
        <span style={{fontSize:'.82rem',fontWeight:600,cursor:'pointer'}}
          onClick={()=>setSort(s=>s.field===field ? {field,dir:s.dir==='asc'?'desc':'asc'} : {field,dir:'asc'})}>
          {label}
        </span>
        <span style={{display:'inline-flex',alignItems:'center',gap:0,cursor:'pointer'}}
          onClick={()=>setSort(s=>s.field===field ? {field,dir:s.dir==='asc'?'desc':'asc'} : {field,dir:'asc'})}>
          {isAsc  ? <ArrowUp size={15} color="var(--brand)"/>
          :isDesc ? <ArrowDown size={15} color="var(--brand)"/>
          :         <ArrowUpDown size={15} color="var(--text-3)" opacity={0.5}/>}
        </span>
        <span onClick={e=>{e.stopPropagation();setOpen(o=>!o)}}
          style={{cursor:'pointer',fontSize:'20px',lineHeight:1,padding:'0 2px',
            color:hasFilter?'var(--warning)':'var(--text-3)',
            fontWeight:hasFilter?700:400}}>▾</span>
      </div>
      {open && values && (
        <ColFilter col={field} values={values}
          active={colFilters[field]||new Set()}
          onChange={v=>setColFilters(f=>({...f,[field]:v}))}
          onClose={()=>setOpen(false)}/>
      )}
    </th>
  )
}

// ── Chart of Accounts Modal ───────────────────────────────────────────────────
function ChartOfAccountsModal({ onClose, glAccounts, setGlAccounts, onSaveAndReclassify, onCoaMapUpdate }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  React.useEffect(()=>{
    fetch('/api/gl/accounts/all').then(r=>r.json()).then(d=>{
      // API returns plain array of rows
      const arr = Array.isArray(d) ? d : (d.rows || [])
      if (arr.length) {
        setRows(arr.map((row,i)=>({
          id:          i,
          Code:        row.Code        || '',
          Name:        row.Name        || '',
          Type:        row.Type        || '',
          TaxCode:     row.TaxCode     || row['Tax Code'] || '',
          Description: row.Description || '',
          Dashboard:   row.Dashboard   || '',
        })))
      } else {
        setRows(glAccounts.map((name,i)=>({id:i,Code:'',Name:name,Type:'',TaxCode:'',Description:'',Dashboard:''})))
      }
    }).catch(()=>{
      setRows(glAccounts.map((name,i)=>({id:i,Code:'',Name:name,Type:'',TaxCode:'',Description:'',Dashboard:''})))
    }).finally(()=>setLoading(false))
  }, [])
  const [editIdx, setEditIdx] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [newRow,  setNewRow]  = useState({Code:'',Name:'',Type:'',TaxCode:'',Description:''})
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const fileRef = useRef()

  const COLS = ['Code','Name','Type','TaxCode','Description','Dashboard']

  const parseCSV = (text) => {
    // Proper CSV parser — handles quoted fields with commas inside
    const rows = []
    const lines = text.replace(/\r/g,'').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      const cols = []; let cur = ''; let inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQ && line[i+1] === '"') { cur += '"'; i++ }  // escaped quote
          else inQ = !inQ
        } else if (ch === ',' && !inQ) { cols.push(cur); cur = '' }
        else cur += ch
      }
      cols.push(cur)
      rows.push(cols.map(v=>v.trim()))
    }
    return rows
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const text = await file.text()
    const allRows = parseCSV(text)
    if (allRows.length < 2) { toast.error('CSV appears empty'); return }
    const header = allRows[0].map(h=>h.replace(/^\*/,'').trim())
    const parsed = allRows.slice(1).map((vals,i)=>{
      const obj = {}; header.forEach((h,j)=>{ obj[h]=vals[j]||'' })
      const name = obj.Name || obj['*Name'] || ''
      if (!name) return null
      return { id:i,
        Code:        obj.Code        || obj['*Code']        || '',
        Name:        name,
        Type:        obj.Type        || obj['*Type']        || '',
        TaxCode:     obj['Tax Code'] || obj['*Tax Code']    || obj.TaxCode || '',
        Description: obj.Description || '',
        Dashboard:   obj.Dashboard   || '',
      }
    }).filter(Boolean)
    setRows(parsed)
    toast.success(`Loaded ${parsed.length} accounts from CSV`)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build CSV with all columns — quote all text fields to handle commas
      const q = v => `"${(v||'').replace(/"/g,'""')}"`
      const csvContent = ['*Code,*Name,*Type,*Tax Code,Description,Dashboard',
        ...rows.map(r=>[q(r.Code),q(r.Name),q(r.Type),q(r.TaxCode),q(r.Description),q(r.Dashboard||'')].join(','))
      ].join('\n')
      const blob = new Blob([csvContent], {type:'text/csv'})
      const fd = new FormData()
      fd.append('file', blob, 'ChartOfAccounts.csv')

      // Upload and wait for server to confirm rebuild
      const resp = await fetch('/api/gl/accounts/upload', {method:'POST', body:fd})
      if (!resp.ok) throw new Error(await resp.text())
      const result = await resp.json()

      // Refresh GL accounts dropdown and coaMap from server
      const allResp = await fetch('/api/gl/accounts/all')
      const allRows = await allResp.json()
      const arr = Array.isArray(allRows) ? allRows : (allRows.rows||[])
      const names = arr.map(r=>r.Name||r.name).filter(Boolean)
      setGlAccounts(names)

      // Rebuild coaMap so auto-fill picks up new accounts immediately
      if (typeof onCoaMapUpdate === 'function') {
        const map = {}
        arr.forEach(r=>{
          const name = r.Name||r.name
          if(name) map[name]={type:r.Type||r.type||'', tax_code:r.TaxCode||r.tax_code||''}
        })
        onCoaMapUpdate(map)
      }

      toast.success(`${result.message || `Saved ${names.length} accounts`} — re-classifying…`)
      onClose()
      if (onSaveAndReclassify) onSaveAndReclassify()
    } catch(err) {
      toast.error(`Save failed: ${err.message}`)
    } finally { setSaving(false) }
  }

  const startEdit = (row,i) => { setEditIdx(i); setEditRow({...row}) }
  const saveEdit  = () => {
    setRows(r=>r.map((x,i)=>i===editIdx?editRow:x))
    setEditIdx(null); setEditRow(null)
  }
  const deleteRow = (i) => setRows(r=>r.filter((_,j)=>j!==i))
  const addNewRow = () => {
    setRows(r=>[...r,{...newRow,id:Date.now()}])
    setNewRow({Code:'',Name:'',Type:'',TaxCode:'',Description:''})
    setShowAdd(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{alignItems:'flex-start',paddingTop:'5vh'}}>
      <div className="modal" style={{maxWidth:860,width:'95vw',maxHeight:'85vh',display:'flex',flexDirection:'column',marginTop:'5vh',alignSelf:'flex-start'}}
        onClick={e=>e.stopPropagation()}>
        <div className="modal-header" style={{flexShrink:0}}>
          <BookOpen size={18} color="var(--brand)"/>
          <h3>Chart of Accounts (COA)</h3>
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleUpload}/>
            <button className="btn btn-outline btn-sm" onClick={()=>fileRef.current.click()}>
              <Upload size={13}/> Upload CSV
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>setShowAdd(s=>!s)}>
              <Plus size={13}/> Add Account
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              <Save size={13}/> {saving?'Saving…':'Save & Apply'}
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16}/></button>
          </div>
        </div>

        {showAdd && (
          <div style={{padding:'10px 16px',background:'var(--surface-2)',borderBottom:'1px solid var(--border)',display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',flexShrink:0}}>
            {COLS.map(k=>(
              <div key={k} className="input-group" style={{minWidth:80}}>
                <label>{k}</label>
                <input className="input input-sm" value={newRow[k]||''} onChange={e=>setNewRow(r=>({...r,[k]:e.target.value}))}/>
              </div>
            ))}
            <button className="btn btn-primary btn-sm" onClick={addNewRow}><Check size={13}/> Add</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        )}

        <p style={{padding:'8px 16px',fontSize:'.75rem',color:'var(--text-3)',flexShrink:0}}>
          {rows.length} accounts · Edit inline, upload a new CSV to replace, or add/delete rows. Click Save & Apply to update GL Account dropdown.
        </p>

        {loading && <div style={{padding:40,textAlign:'center',color:'var(--text-3)'}}>Loading accounts…</div>}
        <div style={{overflowY:'auto',flex:1}}>
          <table className="data-table" style={{fontSize:'.78rem',display:loading?'none':'table'}}>
            <thead>
              <tr>
                {[['Code','Code'],['Name','Account Name'],['Type','Type'],['TaxCode','Tax Code'],['Description','Description'],['Dashboard','Dashboard']].map(([k,lbl])=>(
                  <th key={k} style={{whiteSpace:'nowrap'}}>{lbl}</th>
                ))}
                <th style={{width:70}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row,i)=>(
                <tr key={row.id??i}>
                  {COLS.map(k=>(
                    <td key={k}>
                      {editIdx===i
                        ? <input className="input input-sm" style={{width:'100%',minWidth:60}}
                            value={editRow[k]||''} onChange={e=>setEditRow(r=>({...r,[k]:e.target.value}))}/>
                        : <span title={row[k]}>{row[k]}</span>
                      }
                    </td>
                  ))}
                  <td>
                    {editIdx===i
                      ? <div style={{display:'flex',gap:4}}>
                          <button className="btn btn-primary btn-xs" onClick={saveEdit}><Check size={11}/></button>
                          <button className="btn btn-ghost btn-xs" onClick={()=>setEditIdx(null)}><X size={11}/></button>
                        </div>
                      : <div style={{display:'flex',gap:4}}>
                          <button className="btn btn-outline btn-xs" onClick={()=>startEdit(row,i)}><Pencil size={11}/></button>
                          <button className="btn btn-danger btn-xs" onClick={()=>deleteRow(i)}><Trash2 size={11}/></button>
                        </div>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main OutputPanel ──────────────────────────────────────────────────────────
export default function OutputPanel({
  transactions, setTransactions, monthlySummary, setMonthlySummary,
  sessionId, username, userId, onRefresh, classifying: externalClassifying
}) {
  const [page,        setPage]        = useState(1)
  const [filters,     setFilters]     = useState({internal:true,incoming:true,outgoing:true,unclassified:true})
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(new Set())
  const [sort,        setSort]        = useState({field:null,dir:'asc'})
  const [colFilters,  setColFilters]  = useState({})
  const [inlineEdits, setInlineEdits] = useState({})   // {absIdx: {field: val}}
  const [showAdd,     setShowAdd]     = useState(false)
  const [newRow,      setNewRow]      = useState({...BLANK})
  const [saving,      setSaving]      = useState(false)
  const [showSummary, setShowSummary] = useState(true)
  const [showTxn,     setShowTxn]     = useState(true)
  const [showCoA,     setShowCoA]     = useState(false)
  const [glAccounts,  setGlAccounts]  = useState([
    'Revenue','Direct Costs','Expense','Inventory','Fixed Asset','GST','Equity','Transfer','Liability',''
  ])
  const [coaMap, setCoaMap] = useState({})

  React.useEffect(()=>{
    fetch('/api/gl/accounts').then(r=>r.json()).then(d=>{
      if(Array.isArray(d) && d.length) setGlAccounts(d)
    }).catch(()=>{})
    fetch('/api/gl/accounts/all').then(r=>r.json()).then(d=>{
      const rows = Array.isArray(d) ? d : (d.rows||[])
      if(rows.length){
        const map = {}
        // API row has both PascalCase (for modal) and snake_case (for coaMap)
        rows.forEach(r=>{
          const name = r.Name || r.name
          if(name) map[name] = {
            type:     r.Type     || r.type     || '',
            tax_code: r.TaxCode  || r.tax_code || r['Tax Code'] || '',
          }
        })
        setCoaMap(map)
      }
    }).catch(()=>{})
  },[])

  // ── filtered + sorted rows ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = transactions.map((t,i)=>({...t,_origIdx:i})).filter(t => {
      const cl = t.classification || ''
      if (!filters.internal     && cl.includes('Internal'))    return false
      if (!filters.incoming     && cl.includes('Incoming'))    return false
      if (!filters.outgoing     && cl.includes('Outgoing'))    return false
      if (!filters.unclassified && cl.includes('Unclassified')) return false
      // Column filters (excluded values)
      for (const [field, included] of Object.entries(colFilters)) {
        if (included && included.size > 0) {
          const v = String(t[field]||'')
          if (!included.has(v)) return false
        }
      }
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
    if (sort.field) {
      rows = [...rows].sort((a,b)=>{
        let av = a[sort.field]??'', bv = b[sort.field]??''
        const an = parseFloat(av), bn = parseFloat(bv)
        if (!isNaN(an) && !isNaN(bn)) { av=an; bv=bn }
        else { av=String(av).toLowerCase(); bv=String(bv).toLowerCase() }
        if (av < bv) return sort.dir==='asc' ? -1 : 1
        if (av > bv) return sort.dir==='asc' ?  1 : -1
        return 0
      })
    }
    return rows
  }, [transactions, filters, search, sort, colFilters])

  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SZ))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = filtered.slice((safePage-1)*PAGE_SZ, safePage*PAGE_SZ)

  const stats = useMemo(() => {
    const inc  = filtered.filter(t=>(t.classification||'').includes('Incoming'))
    const out  = filtered.filter(t=>(t.classification||'').includes('Outgoing'))
    const int_ = filtered.filter(t=>(t.classification||'').includes('Internal'))
    return {
      totalIn:  inc.reduce((s,t)=>s+(t.credit||0),0),
      totalOut: out.reduce((s,t)=>s+(t.debit||0),0),
      totalGST: filtered.reduce((s,t)=>s+(t.gst||0),0),
      intCount: int_.length,
    }
  }, [filtered])

  // colVals reads ALL transactions so options never disappear when filter is active
  const colVals = useCallback((field) =>
    transactions.map(t=>String(t[field]||'')), [transactions])

  // ── inline edit helpers ───────────────────────────────────────────────────
  const getCell = (ai, field, fallback) => {
    return inlineEdits[ai]?.[field] !== undefined ? inlineEdits[ai][field] : fallback
  }
  const setCell = (ai, field, val) => {
    setInlineEdits(e=>({...e,[ai]:{...(e[ai]||{}),[field]:val}}))
  }
  const hasEdits = Object.keys(inlineEdits).length > 0

  // Save all inline edits to transactions state
  const commitEdits = () => {
    if (!hasEdits) return
    setTransactions(prev => prev.map((t,i) => {
      const edits = inlineEdits[i]
      return edits ? {...t,...edits} : t
    }))
    setInlineEdits({})
    toast.success('Changes applied — click Save to DB to persist')
  }

  // ── selection ─────────────────────────────────────────────────────────────
  const toggleS   = ai => setSelected(s=>{const n=new Set(s);n.has(ai)?n.delete(ai):n.add(ai);return n})
  const toggleAll = () => {
    const idxs = pageRows.map(r=>r._origIdx)
    const allSel = idxs.every(i=>selected.has(i))
    if (allSel) setSelected(s=>{const n=new Set(s);idxs.forEach(i=>n.delete(i));return n})
    else setSelected(s=>{const n=new Set(s);idxs.forEach(i=>n.add(i));return n})
  }
  const toggleF = k => {
    setFilters(f=>({...f,[k]:!f[k]}))
    setColFilters(cf => {
      if (!cf.classification || cf.classification.size === 0) return cf
      const next = {...cf}
      delete next.classification
      return next
    })
    setPage(1)
  }

  // ── direct cell update (GL/GST selects in table) ──────────────────────────
  const updateCell = useCallback((ai, field, val) => {
    setTransactions(prev => prev.map((t,i) => i===ai ? {...t,[field]:val} : t))
  }, [setTransactions])

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteSelected = () => {
    const idxs = new Set(selected)
    setTransactions(prev=>prev.filter((_,i)=>!idxs.has(i)))
    setSelected(new Set()); setInlineEdits({})
    toast.success(`Deleted ${idxs.size} row(s)`)
  }

  // ── add row ───────────────────────────────────────────────────────────────
  const addRow = () => {
    setTransactions(prev=>[...prev,{...newRow}])
    setShowAdd(false); setNewRow({...BLANK}); toast.success('Row added')
  }

  // ── classify ─────────────────────────────────────────────────────────────
  const handleClassify = async () => {
    if (!sessionId) { toast.error('Process files first'); return }
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

  // Full reclassify — clears existing GL/GST and re-runs from current COA
  const handleReclassify = async () => {
    if (!sessionId) { toast.error('Process files first'); return }
    try { await saveSession({session_id:sessionId,username,transactions,pending_changes:{},page_number:safePage}) } catch {}
    try {
      toast.loading('Reclassifying all rows…', {id:'reclassify'})
      const { data } = await reclassifyGL(sessionId, username)
      if (data?.transactions) {
        setTransactions(data.transactions)
        if (data.monthly_summary) setMonthlySummary(data.monthly_summary)
        toast.success('Reclassification complete', {id:'reclassify'})
      }
    } catch (e) {
      toast.error(e.response?.data?.detail||'Reclassification failed', {id:'reclassify'})
    }
  }

  // ── save session ──────────────────────────────────────────────────────────
  const handleSaveSession = async () => {
    if (!sessionId) { toast.error('No active session'); return }
    // commit any pending inline edits first
    if (hasEdits) commitEdits()
    try {
      await saveSession({session_id:sessionId,username,transactions,pending_changes:{},page_number:safePage})
      toast.success('Session saved')
    } catch { toast.error('Session save failed') }
  }

  // ── save to DB ─────────────────────────────────────────────────────────────
  const handleSaveDB = async () => {
    if (!userId) { toast.error('Log in to save to DB'); return }
    if (hasEdits) commitEdits()
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
      if (onRefresh) onRefresh()
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

  const SH = {field:sort.field, dir:sort.dir}
  const thProps = (label, field, style) => ({
    label, field, style,
    sort:SH, setSort,
    colFilters, setColFilters,
    values: colVals(field),
  })

  return (
    <div>
      <StatStrip stats={stats} />

      {/* Chart of Accounts Modal */}
      {showCoA && (
        <ChartOfAccountsModal
          onClose={()=>setShowCoA(false)}
          glAccounts={glAccounts}
          setGlAccounts={setGlAccounts}
          onSaveAndReclassify={handleReclassify}
          onCoaMapUpdate={setCoaMap}
        />
      )}

      {/* Monthly Summary */}
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

      {/* Transaction Details */}
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

          {/* Toolbar */}
          <div style={{display:'flex',gap:8,marginBottom:6,flexWrap:'wrap',alignItems:'center'}}>
            <div className="search-wrap" style={{flex:'none'}}>
              <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input className="input input-sm" style={{width:220,paddingLeft:34}} placeholder="Search description, bank, who…"
                value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
            </div>
            <div style={{flex:1}}/>
            <button className="btn btn-outline btn-sm" onClick={()=>setShowAdd(s=>!s)}><Plus size={13}/> Add Row</button>
            <button className="btn btn-outline btn-sm" onClick={()=>setShowCoA(true)}>
              <BookOpen size={13}/> COA
            </button>
            <button className="btn btn-accent btn-sm" onClick={handleReclassify}
              title="Re-classify all rows using current Chart of Accounts (COA)">
              <RefreshCw size={13}/> Reclassify
            </button>
            {hasEdits && (
              <button className="btn btn-warning btn-sm" onClick={commitEdits}>
                <Check size={13}/> Apply Edits ({Object.keys(inlineEdits).length})
              </button>
            )}
            <button className="btn btn-outline btn-sm" onClick={handleSaveSession}>💾 Save Session</button>
            <button className="btn btn-outline btn-sm" onClick={handleExport}><Download size={13}/> Excel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveDB} disabled={saving}>
              <Database size={13}/> {saving?'Saving…':'Save to DB'}
            </button>
            {selected.size>0 && (
              <button className="btn btn-danger btn-sm" onClick={deleteSelected}><Trash2 size={13}/> Delete ({selected.size})</button>
            )}
          </div>

          {/* Filter chips */}
          <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:10,justifyContent:'flex-end'}}>
            <span style={{fontSize:'.72rem',color:'var(--text-3)',marginRight:4}}>Show:</span>
            {[['internal','🟢','badge-cls-int'],['incoming','🔵','badge-cls-in'],
              ['outgoing','🟡','badge-cls-out'],['unclassified','⚪','badge-neutral']].map(([k,emoji,cls])=>{
              const hasColFilter = filters[k] && Object.values(colFilters).some(v=>v&&v.size>0)
              return (
                <button key={k} onClick={()=>toggleF(k)}
                  className={`chip${filters[k]?` ${k==='internal'?'active-int':k==='incoming'?'active-in':k==='outgoing'?'active-out':''}`:''}`}
                  style={{opacity:filters[k]?1:.4,transition:'opacity .15s',fontSize:'.75rem',padding:'4px 10px',
                    outline: hasColFilter ? '2px solid var(--warning)' : 'none',
                    outlineOffset: '2px', position:'relative'}}>
                  {emoji} {k.charAt(0).toUpperCase()+k.slice(1)}
                  {hasColFilter && <span style={{position:'absolute',top:-4,right:-4,width:8,height:8,borderRadius:'50%',background:'var(--warning)',border:'2px solid var(--surface)'}}/>}
                </button>
              )
            })}
            {Object.values(colFilters).some(v=>v&&v.size>0) && (
              <button className="btn btn-ghost btn-xs" style={{marginLeft:8}} onClick={()=>setColFilters({})}>
                <X size={11}/> Clear filters
              </button>
            )}
          </div>

        </div>}
      </div>

      {/* Add Row panel */}
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
            <div className="input-group"><label>GL Account</label>
              <select className="input" value={newRow.gl_account} onChange={e=>setNewRow(r=>({...r,gl_account:e.target.value}))}>
                {glAccounts.map(o=><option key={o} value={o}>{o||'—'}</option>)}
              </select>
            </div>
            <div className="input-group"><label>GST Category</label><select className="input" value={newRow.gst_category} onChange={e=>setNewRow(r=>({...r,gst_category:e.target.value}))}>{GST_CATS.map(o=><option key={o}>{o}</option>)}</select></div>
            <div className="input-group"><label>Who</label><input className="input" value={newRow.who} onChange={e=>setNewRow(r=>({...r,who:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button className="btn btn-primary btn-sm" onClick={addRow}><Check size={13}/> Add</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Data Table with sort + filter headers + inline editing */}
      <div className="data-table-wrap">
        <div style={{overflowX:'auto'}}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:36,paddingLeft:14}}>
                  <input type="checkbox" style={{cursor:'pointer',accentColor:'var(--brand)'}}
                    checked={pageRows.length>0 && pageRows.every(r=>selected.has(r._origIdx))} onChange={toggleAll}/>
                </th>
                <SortTh {...thProps('Date','date',{minWidth:90})}/>
                <SortTh {...thProps('Bank','bank',{})}/>
                <SortTh {...thProps('Account','account',{})}/>
                <SortTh {...thProps('Description','description',{minWidth:200})}/>
                <SortTh {...thProps('Debit','debit',{textAlign:'right'})}/>
                <SortTh {...thProps('Credit','credit',{textAlign:'right'})}/>
                <SortTh {...thProps('Classification','classification',{})}/>
                <SortTh {...thProps('Pair ID','pairid',{})}/>
                <SortTh {...thProps('GL Account','gl_account',{minWidth:140})}/>
                <SortTh {...thProps('GL Type','gl_type',{minWidth:100})}/>
                <SortTh {...thProps('GST','gst',{textAlign:'right'})}/>
                <SortTh {...thProps('GST Category','gst_category',{minWidth:160})}/>
                <SortTh {...thProps('Who','who',{})}/>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row)=>{
                const ai  = row._origIdx
                const sel = selected.has(ai)
                const cl  = row.classification||''
                const hasRowEdits = !!inlineEdits[ai]
                const rowClass = [
                  cl.includes('Internal')?'row-internal':'',
                  cl.includes('Incoming')?'row-incoming':'',
                  cl.includes('Outgoing')?'row-outgoing':'',
                  sel?'row-selected':'',
                  hasRowEdits?'row-edited':'',
                ].filter(Boolean).join(' ')

                // Helper: get current value (inline edit overrides original)
                const v = (field) => getCell(ai, field, row[field])
                const setV = (field) => (e) => setCell(ai, field, e.target ? e.target.value : e)

                return (
                  <tr key={ai} className={rowClass}>
                    <td style={{paddingLeft:14}}>
                      <input type="checkbox" checked={sel} onChange={()=>toggleS(ai)} style={{cursor:'pointer',accentColor:'var(--brand)'}}/>
                    </td>
                    {/* Date — text input keeps dd/mm/yyyy format */}
                    <td>
                      <input className="cell-input" type="text"
                        value={v('date')||''} onChange={setV('date')}
                        placeholder="dd/mm/yyyy"
                        style={{width:90,fontFamily:'var(--font-mono)',fontSize:'.78rem',whiteSpace:'nowrap'}}/>
                    </td>
                    {/* Bank */}
                    <td>
                      <input className="cell-input" value={v('bank')||''} onChange={setV('bank')}
                        style={{width:90,fontSize:'.8rem',fontWeight:500}}/>
                    </td>
                    {/* Account */}
                    <td>
                      <input className="cell-input" value={v('account')||''} onChange={setV('account')}
                        style={{width:80,fontFamily:'var(--font-mono)',fontSize:'.75rem'}}/>
                    </td>
                    {/* Description */}
                    <td>
                      <input className="cell-input" value={v('description')||''} onChange={setV('description')}
                        title={row.description} style={{width:220,minWidth:220,fontSize:'.8rem'}}/>
                    </td>
                    {/* Debit */}
                    <td style={{textAlign:'right'}}>
                      <input className="cell-input" type="number" min="0" step="0.01"
                        value={v('debit')||''} onChange={e=>setCell(ai,'debit',parseFloat(e.target.value)||0)}
                        style={{width:90,textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.8rem',color:'var(--warning)',fontWeight:600}}/>
                    </td>
                    {/* Credit */}
                    <td style={{textAlign:'right'}}>
                      <input className="cell-input" type="number" min="0" step="0.01"
                        value={v('credit')||''} onChange={e=>setCell(ai,'credit',parseFloat(e.target.value)||0)}
                        style={{width:90,textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.8rem',color:'var(--info)',fontWeight:600}}/>
                    </td>
                    {/* Classification */}
                    <td>
                      <select value={v('classification')||''} onChange={setV('classification')}
                        className="select-compact">
                        {CLASSES.map(o=><option key={o}>{o}</option>)}
                      </select>
                    </td>
                    {/* Pair ID */}
                    <td>
                      <input className="cell-input" value={v('pairid')||v('pair_id')||''} onChange={setV('pairid')}
                        style={{width:80,fontFamily:'var(--font-mono)',fontSize:'.72rem',color:'var(--text-3)'}}/>
                    </td>
                    {/* GL Account — select from CoA; auto-fills GL Type + GST Category */}
                    <td>
                      <select value={v('gl_account')||''} onChange={e=>{
                          const name = e.target.value
                          setCell(ai,'gl_account', name)
                          updateCell(ai,'gl_account', name)
                          const coa = coaMap[name]
                          if(coa){
                            setCell(ai,'gl_type', coa.type||'')
                            updateCell(ai,'gl_type', coa.type||'')
                            if(coa.tax_code){
                              setCell(ai,'gst_category', coa.tax_code)
                              updateCell(ai,'gst_category', coa.tax_code)
                            }
                          }
                        }}
                        className="select-compact" style={{minWidth:120}}>
                        {glAccounts.map(o=><option key={o} value={o}>{o||'—'}</option>)}
                      </select>
                    </td>
                    {/* GL Type — read-only, auto-populated from COA */}
                    <td>
                      <span style={{fontSize:'.75rem',color:'var(--text-3)',padding:'0 6px',
                        whiteSpace:'nowrap',background:'var(--surface-2)',borderRadius:4,
                        border:'1px solid var(--border)',display:'inline-block',lineHeight:'24px'}}>
                        {v('gl_type')||'—'}
                      </span>
                    </td>
                    {/* GST */}
                    <td style={{textAlign:'right'}}>
                      <input className="cell-input" type="number" min="0" step="0.01"
                        value={v('gst')||''} onChange={e=>setCell(ai,'gst',parseFloat(e.target.value)||0)}
                        style={{width:80,textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'.78rem',color:'var(--brand)'}}/>
                    </td>
                    {/* GST Category — blank for internal transfers */}
                    <td>
                      {(v('classification')||'').includes('Internal')
                        ? <span style={{color:'var(--text-3)',fontSize:'.75rem',padding:'0 4px'}}>—</span>
                        : <select value={v('gst_category')||''} onChange={e=>{ setCell(ai,'gst_category',e.target.value); updateCell(ai,'gst_category',e.target.value) }}
                            className="select-compact" style={{minWidth:142}}>
                            {GST_CATS.map(o=><option key={o}>{o}</option>)}
                          </select>
                      }
                    </td>
                    {/* Who */}
                    <td>
                      <input className="cell-input" value={v('who')||''} onChange={setV('who')}
                        style={{width:100,fontSize:'.78rem',color:'var(--text-2)'}}/>
                    </td>
                  </tr>
                )
              })}
              {pageRows.length===0&&(
                <tr><td colSpan={15}>
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
            {hasEdits && <span style={{marginLeft:8,color:'var(--warning)',fontWeight:600}}>· {Object.keys(inlineEdits).length} unsaved edit{Object.keys(inlineEdits).length!==1?'s':''}</span>}
          </span>
          <div className="pagination">
            <button className="page-btn" disabled={safePage<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={14}/></button>
            {(()=>{
              const WINDOW = 9
              let start = Math.max(1, safePage - Math.floor(WINDOW/2))
              let end   = Math.min(totalPages, start + WINDOW - 1)
              start = Math.max(1, end - WINDOW + 1)
              const pages = []
              if (start > 1) pages.push(<button key="first" className="page-btn" onClick={()=>setPage(1)}>1</button>, <span key="el1" style={{padding:'0 2px',color:'var(--text-3)'}}>…</span>)
              for (let p = start; p <= end; p++)
                pages.push(<button key={p} onClick={()=>setPage(p)} className={`page-btn${p===safePage?' active':''}`}>{p}</button>)
              if (end < totalPages) pages.push(<span key="el2" style={{padding:'0 2px',color:'var(--text-3)'}}>…</span>, <button key="last" className="page-btn" onClick={()=>setPage(totalPages)}>{totalPages}</button>)
              return pages
            })()}
            <button className="page-btn" disabled={safePage>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  )
}
