import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { BookOpen, Plus, Pencil, Trash2, Check, X, Upload, Save, Download, ArrowUp, ArrowDown, ArrowUpDown, Building2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { getHomeCompany, setHomeCompany } from '../lib/api.js'
import toast from 'react-hot-toast'

// ── Column filter popover (same pattern as OutputPanel) ───────────────────────
function ColFilter({ values, active, onChange, onClose, anchorPos }) {
  const unique   = useMemo(() => [...new Set(values.map(v=>String(v||'')))].sort(), [values])
  const [selected, setSelected] = useState(() => active.size > 0 ? new Set(active) : new Set(unique))
  const hasSelection = selected.size > 0 && selected.size < unique.length
  const toggle = v => setSelected(s => { const n=new Set(s); n.has(v)?n.delete(v):n.add(v); return n })
  const apply  = () => { onChange(selected.size===unique.length ? new Set() : new Set(selected)); onClose() }
  const pos = anchorPos || {top:0,left:0,maxH:340}
  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'fixed',top:pos.top,left:pos.left,zIndex:99999,
      background:'var(--surface)',border:'1px solid var(--border)',
      borderRadius:'var(--r-md)',boxShadow:'var(--sh-lg)',
      padding:'10px',minWidth:180,maxHeight:pos.maxH,display:'flex',flexDirection:'column',gap:6,
    }}>
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <button className="btn btn-ghost btn-xs"
          style={{fontWeight:selected.size===unique.length?700:400,color:selected.size===unique.length?'var(--brand)':undefined}}
          onClick={()=>setSelected(new Set(unique))}>All</button>
        <button className="btn btn-ghost btn-xs"
          style={{fontWeight:selected.size===0?700:400}}
          onClick={()=>setSelected(new Set())}>None</button>
        {hasSelection && <span style={{fontSize:'.72rem',color:'var(--warning)',marginLeft:'auto'}}>{selected.size} selected</span>}
      </div>
      <div style={{borderTop:'1px solid var(--border)',margin:'0 -4px'}}/>
      <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:1}}>
        {(()=>{
          const sel   = unique.filter(v=> selected.has(v)).sort()
          const unsel = unique.filter(v=>!selected.has(v)).sort()
          const row = v => (
            <label key={v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',
              fontSize:'.78rem',padding:'3px 6px',borderRadius:4,
              background:selected.has(v)?'var(--brand-xlight)':'transparent',transition:'background .1s'}}>
              <input type="checkbox" checked={selected.has(v)} onChange={()=>toggle(v)}
                style={{accentColor:'var(--brand)',flexShrink:0}}/>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{v||'(blank)'}</span>
            </label>
          )
          return <>{sel.map(row)}
            {sel.length>0&&unsel.length>0&&<div style={{borderTop:'1px dashed var(--border)',margin:'3px 0',fontSize:'.68rem',color:'var(--text-3)',paddingLeft:4}}>— unselected —</div>}
            {unsel.map(row)}</>
        })()}
      </div>
      <button className="btn btn-primary btn-xs" onClick={apply}>Apply{hasSelection?` (${selected.size})`:' (all)'}</button>
    </div>
  )
}

// ── Resizable sortable/filterable header cell ─────────────────────────────────
function CoaTh({ label, field, sort, setSort, colFilters, setColFilters, values, colWidth, onResize }) {
  const [open, setOpen]         = useState(false)
  const [anchorPos, setAnchorPos] = useState({top:0,left:0,maxH:340})
  const thRef    = useRef(null)
  const isAsc    = sort.field===field && sort.dir==='asc'
  const isDesc   = sort.field===field && sort.dir==='desc'
  const hasFilter = colFilters[field] && colFilters[field].size > 0

  useEffect(()=>{
    if(!open) return
    const h = e => { if(thRef.current && !thRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[open])

  const openFilter = e => {
    e.stopPropagation()
    if(!thRef.current){setOpen(o=>!o);return}
    const r=thRef.current.getBoundingClientRect(), vh=window.innerHeight
    setAnchorPos({top:r.bottom+4,left:Math.min(r.left,window.innerWidth-200),maxH:Math.max(120,vh-r.bottom-20)})
    setOpen(o=>!o)
  }

  const startResize = e => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = thRef.current ? thRef.current.getBoundingClientRect().width : (colWidth||100)
    const onMove = mv => { if(onResize) onResize(Math.max(40, startW+mv.clientX-startX)) }
    const onUp   = ()  => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp) }
    document.addEventListener('mousemove',onMove)
    document.addEventListener('mouseup',onUp)
  }

  return (
    <th ref={thRef} style={{position:'relative',userSelect:'none',whiteSpace:'nowrap',
      ...(colWidth?{width:colWidth,minWidth:colWidth}:{})}}>
      <div style={{display:'inline-flex',alignItems:'center',gap:4,width:'100%'}}>
        <span style={{fontSize:'.82rem',fontWeight:600,cursor:'pointer'}}
          onClick={()=>setSort(s=>s.field===field?{field,dir:s.dir==='asc'?'desc':'asc'}:{field,dir:'asc'})}>
          {label}
        </span>
        <span style={{cursor:'pointer',display:'inline-flex',alignItems:'center'}}
          onClick={()=>setSort(s=>s.field===field?{field,dir:s.dir==='asc'?'desc':'asc'}:{field,dir:'asc'})}>
          {isAsc?<ArrowUp size={13} color="var(--brand)"/>:isDesc?<ArrowDown size={13} color="var(--brand)"/>:<ArrowUpDown size={13} color="var(--text-3)" opacity={0.4}/>}
        </span>
        <span onClick={openFilter} style={{cursor:'pointer',fontSize:'18px',lineHeight:1,padding:'0 2px',
          color:hasFilter?'var(--warning)':'var(--text-3)',fontWeight:hasFilter?700:400}}>▾</span>
      </div>
      {open && values && (
        <ColFilter values={values} active={colFilters[field]||new Set()}
          onChange={v=>setColFilters(f=>({...f,[field]:v}))}
          onClose={()=>setOpen(false)} anchorPos={anchorPos}/>
      )}
      <div onMouseDown={startResize}
        style={{position:'absolute',right:0,top:0,bottom:0,width:5,cursor:'col-resize',
          borderRight:'2px solid transparent',transition:'border-color .15s'}}
        onMouseEnter={e=>e.currentTarget.style.borderRightColor='var(--brand)'}
        onMouseLeave={e=>e.currentTarget.style.borderRightColor='transparent'}/>
    </th>
  )
}

// ── Chart of Accounts tab ─────────────────────────────────────────────────────
function CoaTab() {
  const [rows,       setRows]      = useState([])
  const [loading,    setLoading]   = useState(true)
  const [saving,     setSaving]    = useState(false)
  const [editIdx,    setEditIdx]   = useState(null)
  const [editRow,    setEditRow]   = useState(null)
  const [showAdd,    setShowAdd]   = useState(false)
  const [newRow,     setNewRow]    = useState({Code:'',Name:'',Type:'',TaxCode:'',Description:'',Dashboard:''})
  const [sort,       setSort]      = useState({field:null,dir:'asc'})
  const [colFilters, setColFilters]= useState({})
  const [search,     setSearch]    = useState('')
  const fileRef = useRef()

  const COLS   = ['Code','Name','Type','TaxCode','Description','Dashboard']
  const LABELS = {Code:'Code',Name:'Account Name',Type:'Type',TaxCode:'Tax Code',Description:'Description',Dashboard:'Dashboard'}
  const DEFAULT_WIDTHS = {Code:70,Name:200,Type:110,TaxCode:150,Description:320,Dashboard:100}
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS)

  useEffect(()=>{
    fetch('/api/gl/accounts/all').then(r=>r.json()).then(d=>{
      const arr = Array.isArray(d)?d:(d.rows||[])
      setRows(arr.length ? arr.map((r,i)=>({id:i,
        Code:r.Code||'', Name:r.Name||r.name||'',
        Type:r.Type||r.type||'', TaxCode:r.TaxCode||r.tax_code||r['Tax Code']||'',
        Description:r.Description||'', Dashboard:r.Dashboard||''})) : [])
    }).catch(()=>{}).finally(()=>setLoading(false))
  },[])

  const parseCSV = text => {
    const result=[]; const lines=text.replace(/\r/g,'').split('\n')
    for(const line of lines){
      if(!line.trim()) continue
      const cols=[]; let cur=''; let inQ=false
      for(let i=0;i<line.length;i++){
        const ch=line[i]
        if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++}else inQ=!inQ}
        else if(ch===','&&!inQ){cols.push(cur);cur=''}
        else cur+=ch
      }
      cols.push(cur); result.push(cols.map(v=>v.trim()))
    }
    return result
  }

  const handleUpload = async e => {
    const file=e.target.files[0]; if(!file) return
    const allRows=parseCSV(await file.text())
    if(allRows.length<2){toast.error('CSV appears empty');return}
    const header=allRows[0].map(h=>h.replace(/^\*/,'').trim())
    const parsed=allRows.slice(1).map((vals,i)=>{
      const obj={}; header.forEach((h,j)=>{obj[h]=vals[j]||''})
      const name=obj.Name||obj['*Name']||''; if(!name) return null
      return {id:i,Code:obj.Code||obj['*Code']||'',Name:name,
        Type:obj.Type||obj['*Type']||'',TaxCode:obj['Tax Code']||obj['*Tax Code']||obj.TaxCode||'',
        Description:obj.Description||'',Dashboard:obj.Dashboard||''}
    }).filter(Boolean)
    setRows(parsed); toast.success(`Loaded ${parsed.length} accounts from CSV`)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const q=v=>`"${(v||'').replace(/"/g,'""')}"`
      const csv=['*Code,*Name,*Type,*Tax Code,Description,Dashboard',
        ...rows.map(r=>[q(r.Code),q(r.Name),q(r.Type),q(r.TaxCode),q(r.Description),q(r.Dashboard)].join(','))
      ].join('\n')
      const fd=new FormData()
      fd.append('file',new Blob([csv],{type:'text/csv'}),'ChartOfAccounts.csv')
      const resp=await fetch('/api/gl/accounts/upload',{method:'POST',body:fd})
      if(!resp.ok) throw new Error(await resp.text())
      const result=await resp.json()
      toast.success(result.message||`Saved ${rows.length} accounts`)
    } catch(e){ toast.error(`Save failed: ${e.message}`) }
    finally { setSaving(false) }
  }

  const handleDownload = () => {
    const q=v=>`"${(v||'').replace(/"/g,'""')}"`
    const csv=['*Code,*Name,*Type,*Tax Code,Description,Dashboard',
      ...rows.map(r=>[q(r.Code),q(r.Name),q(r.Type),q(r.TaxCode),q(r.Description),q(r.Dashboard)].join(','))
    ].join('\n')
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download='ChartOfAccounts.csv'; a.click()
  }

  const startEdit = (row,i)=>{ setEditIdx(i); setEditRow({...row}) }
  const saveEdit  = ()=>{ setRows(r=>r.map((x,i)=>i===editIdx?editRow:x)); setEditIdx(null); setEditRow(null) }
  const deleteRow = i => setRows(r=>r.filter((_,j)=>j!==i))
  const addRow    = ()=>{ setRows(r=>[...r,{...newRow,id:Date.now()}]); setNewRow({Code:'',Name:'',Type:'',TaxCode:'',Description:'',Dashboard:''}); setShowAdd(false) }

  // All unique values per column (for filter dropdowns)
  const colVals = useCallback(field => rows.map(r=>String(r[field]||'')), [rows])

  // Filtered + sorted rows
  const displayed = useMemo(()=>{
    let r = rows
    // Search
    if(search.trim()){
      const q=search.toLowerCase()
      r=r.filter(row=>COLS.some(k=>String(row[k]||'').toLowerCase().includes(q)))
    }
    // Column filters
    for(const[field,included] of Object.entries(colFilters)){
      if(included&&included.size>0) r=r.filter(row=>included.has(String(row[field]||'')))
    }
    // Sort
    if(sort.field){
      r=[...r].sort((a,b)=>{
        const av=String(a[sort.field]||'').toLowerCase()
        const bv=String(b[sort.field]||'').toLowerCase()
        if(av<bv) return sort.dir==='asc'?-1:1
        if(av>bv) return sort.dir==='asc'?1:-1
        return 0
      })
    }
    return r
  },[rows,search,colFilters,sort])

  const thProps = field => ({
    field, sort, setSort, colFilters, setColFilters,
    values:   colVals(field),
    colWidth: colWidths[field],
    onResize: w => setColWidths(p=>({...p,[field]:w})),
  })

  return (
    <div>
      {/* Toolbar */}
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleUpload}/>
        <div className="search-wrap" style={{flex:'none'}}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="input input-sm" style={{width:200,paddingLeft:34}} placeholder="Search accounts…"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button className="btn btn-outline btn-sm" onClick={()=>fileRef.current.click()}><Upload size={13}/> Upload CSV</button>
        <button className="btn btn-outline btn-sm" onClick={handleDownload}><Download size={13}/> Download CSV</button>
        <button className="btn btn-outline btn-sm" onClick={()=>setShowAdd(s=>!s)}><Plus size={13}/> Add Account</button>
        <button className="btn btn-ghost btn-xs" onClick={()=>setColWidths(DEFAULT_WIDTHS)} title="Reset column widths">⊞ Reset cols</button>
        {Object.values(colFilters).some(v=>v&&v.size>0) && (
          <button className="btn btn-ghost btn-xs" onClick={()=>setColFilters({})} style={{color:'var(--warning)'}}>
            <X size={11}/> Clear filters
          </button>
        )}
        <div style={{flex:1}}/>
        <span style={{fontSize:'.78rem',color:'var(--text-3)'}}>{displayed.length}/{rows.length} accounts</span>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          <Save size={13}/> {saving?'Saving…':'Save & Apply'}
        </button>
      </div>

      {/* Add row form */}
      {showAdd && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',
          padding:'10px 12px',background:'var(--surface-2)',border:'1px solid var(--border)',
          borderRadius:'var(--r-md)',marginBottom:10}}>
          {COLS.map(k=>(
            <div key={k} className="input-group" style={{minWidth:80,flex:k==='Description'?2:1}}>
              <label style={{fontSize:'.72rem'}}>{LABELS[k]}</label>
              <input className="input input-sm" value={newRow[k]||''} onChange={e=>setNewRow(r=>({...r,[k]:e.target.value}))} placeholder={LABELS[k]}/>
            </div>
          ))}
          <button className="btn btn-primary btn-sm" onClick={addRow}><Check size={13}/> Add</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>setShowAdd(false)}><X size={13}/></button>
        </div>
      )}

      {/* Table */}
      <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-md)'}}>
        <div style={{overflowX:'auto',overflowY:'visible'}}>
          <table className="data-table" style={{minWidth:'100%',tableLayout:'fixed'}}>
            <thead>
              <tr>
                {COLS.map(k=>(
                  <CoaTh key={k} label={LABELS[k]} {...thProps(k)}/>
                ))}
                <th style={{width:72,whiteSpace:'nowrap'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text-3)'}}>Loading…</td></tr>
              )}
              {!loading && displayed.length===0 && (
                <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text-3)'}}>
                  {rows.length===0 ? 'No accounts. Upload a CSV or add manually.' : 'No accounts match the current filters.'}
                </td></tr>
              )}
              {!loading && displayed.map((row,di)=>{
                const i = rows.indexOf(row)
                return (
                  <tr key={row.id??di}>
                    {COLS.map(k=>(
                      <td key={k} title={row[k]} style={{overflow:'hidden'}}>
                        {editIdx===i
                          ? <input className="input input-sm" style={{width:'100%'}}
                              value={editRow[k]||''} onChange={e=>setEditRow(r=>({...r,[k]:e.target.value}))}/>
                          : <span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {row[k]||<span style={{color:'var(--text-3)'}}>—</span>}
                            </span>
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
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── SetupPage ─────────────────────────────────────────────────────────────────

// ── Home Company Tab ──────────────────────────────────────────────────────────
// Users set their registered company name here so that transfers to/from
// their own company are automatically marked as 🟢Internal in reconciliation.
function HomeCompanyTab() {
  const { user }                = useAuth()
  const [company,  setCompany]  = useState('')
  const [saved,    setSaved]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!user?.username) return
    getHomeCompany(user.username)
      .then(r => {
        const val = r.data?.home_company || ''
        setCompany(val)
        setSaved(val)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.username])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setHomeCompany(user.username, company.trim())
      setSaved(company.trim())
      toast.success('Home company saved — transfers to/from this company will be marked as 🟢 Internal')
    } catch (e) {
      toast.error('Save failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{padding:32,textAlign:'center',color:'var(--text-3)'}}>Loading…</div>

  return (
    <div style={{maxWidth:600}}>
      <div style={{
        display:'flex',alignItems:'center',gap:10,
        marginBottom:20,padding:'14px 18px',
        background:'var(--info-bg,#eff6ff)',
        border:'1px solid var(--info,#3b82f6)',
        borderRadius:'var(--r-md)',fontSize:'.85rem',color:'var(--text-2)',
      }}>
        <Building2 size={16} style={{flexShrink:0,color:'var(--brand)'}}/>
        <span>
          Transfers <strong>to or from</strong> your registered company are automatically
          classified as <strong>🟢 Internal</strong> in reconciliation — no manual pairing needed.
          The name is matched against transaction descriptions using keyword matching,
          so partial names work too.
        </span>
      </div>

      <div className="input-group" style={{marginBottom:12}}>
        <label className="form-label" style={{fontWeight:600}}>
          Registered Company Name
        </label>
        <input
          className="input"
          value={company}
          onChange={e => setCompany(e.target.value)}
          placeholder="e.g. Headstart Finances Australia Pty Ltd"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <p style={{fontSize:'.78rem',color:'var(--text-3)',marginTop:5}}>
          Enter your full registered company name. Variations like abbreviations
          and names without "Pty Ltd" are matched automatically.
        </p>
      </div>

      {saved && (
        <div style={{
          marginBottom:12,fontSize:'.82rem',padding:'8px 12px',
          background:'var(--success-bg,#ecfdf5)',
          border:'1px solid var(--success-border,#6ee7b7)',
          borderRadius:6,color:'#065f46',
        }}>
          ✅ Current: <strong>{saved}</strong>
        </div>
      )}

      <button
        className="btn btn-primary btn-sm"
        onClick={handleSave}
        disabled={saving || company.trim() === saved}
      >
        <Save size={13}/> {saving ? 'Saving…' : 'Save Home Company'}
      </button>

      {company.trim() !== saved && company.trim() && (
        <span style={{marginLeft:10,fontSize:'.78rem',color:'var(--warning)'}}>
          Unsaved changes
        </span>
      )}
    </div>
  )
}

const TABS = [
  { key:'coa', label:'Chart of Accounts', icon:'📒' },
  { key:'home', label:'Home Company', icon:'🏢' },
]

export default function SetupPage() {
  const [tab, setTab] = useState('coa')
  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}>
        <h1>⚙️ Setup</h1>
        <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>
          Configure Chart of Accounts, tax codes and classification rules
        </p>
      </div>
      <div className="tabs-bar" style={{marginBottom:0}}>
        {TABS.map(t=>(
          <button key={t.key} className={`tab-btn${tab===t.key?' active':''}`} onClick={()=>setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div style={{background:'var(--surface)',borderRadius:'0 0 var(--r-lg) var(--r-lg)',
        border:'1px solid var(--border)',borderTop:'none',padding:'20px 24px',boxShadow:'var(--sh-sm)'}}>
        {tab==='coa'  && <CoaTab/>}
        {tab==='home' && <HomeCompanyTab/>}
      </div>
    </div>
  )
}