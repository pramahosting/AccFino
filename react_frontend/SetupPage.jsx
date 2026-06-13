import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { BookOpen, Plus, Pencil, Trash2, Check, X, Upload, Save, Download, ArrowUp, ArrowDown, ArrowUpDown, Zap } from 'lucide-react'
import { rdrList, rdrCreate, rdrUpdate, rdrDelete, coaAccounts, kbGet, kbVendorUpsert, kbVendorDelete, kbKeywordUpsert, kbKeywordDelete, companyList, companyUpdate } from '../lib/api.js'
import toast from 'react-hot-toast'

// - Column filter popover (same pattern as OutputPanel) -------
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
            {sel.length>0&&unsel.length>0&&<div style={{borderTop:'1px dashed var(--border)',margin:'3px 0',fontSize:'.68rem',color:'var(--text-3)',paddingLeft:4}}>- unselected -</div>}
            {unsel.map(row)}</>
        })()}
      </div>
      <button className="btn btn-primary btn-xs" onClick={apply}>Apply{hasSelection?` (${selected.size})`:' (all)'}</button>
    </div>
  )
}

// - Resizable sortable/filterable header cell -----------
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
          color:hasFilter?'var(--warning)':'var(--text-3)',fontWeight:hasFilter?700:400}}>-</span>
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

// - Chart of Accounts tab -----------------
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
  const saveEdit  = ()=>{ if(!editRow?.Name?.trim()){toast.error('Name required');return} setRows(r=>r.map((x,i)=>i===editIdx?editRow:x)); setEditIdx(null); setEditRow(null); toast.success('Updated - click Save & Apply') }
  const deleteRow = i => setRows(r=>r.filter((_,j)=>j!==i))
  const addRow    = ()=>{ if(!newRow.Name.trim()){toast.error('Name required');return} setRows(r=>[...r,{...newRow,id:Date.now()}]); setNewRow({Code:'',Name:'',Type:'',TaxCode:'',Description:'',Dashboard:''}); toast.success('Added - click Save & Apply') }

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
    <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:16,
      height:'calc(100vh - 220px)',minHeight:500,alignItems:'start'}}>

      {/* - Left: form - */}
      <div style={{background:'var(--surface-2)',borderRadius:'var(--r-md)',
        padding:'16px 18px',border:'1px solid var(--border)',
        position:'sticky',top:0,overflowY:'auto',maxHeight:'calc(100vh - 240px)'}}>
        <h3 style={{marginBottom:12,fontSize:'.95rem'}}>
          {editIdx!==null ? '- Edit Account' : '- New Account'}
        </h3>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {COLS.map(k=>(
            <div key={k} className="input-group">
              <label>{LABELS[k]}</label>
              <input className="input input-sm"
                value={editIdx!==null ? (editRow?.[k]||'') : (newRow[k]||'')}
                onChange={e=> editIdx!==null
                  ? setEditRow(r=>({...r,[k]:e.target.value}))
                  : setNewRow(r=>({...r,[k]:e.target.value}))}
                placeholder={LABELS[k]}/>
            </div>
          ))}
          <div style={{display:'flex',gap:6,marginTop:2}}>
            {editIdx!==null ? (<>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} style={{flex:1}}>
                <Check size={13}/> Update
              </button>
              <button className="btn btn-ghost btn-sm" title="New" onClick={()=>{setEditIdx(null);setEditRow(null)}}>
                <Plus size={13}/>
              </button>
            </>) : (
              <button className="btn btn-primary btn-sm" onClick={addRow} style={{flex:1}}>
                <Plus size={13}/> Add Account
              </button>
            )}
          </div>
        </div>
        <div style={{borderTop:'1px solid var(--border)',marginTop:14,paddingTop:12,
          display:'flex',flexDirection:'column',gap:6}}>
          <button className="btn btn-outline btn-sm" onClick={()=>fileRef.current.click()}>
            <Upload size={13}/> Upload CSV
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleDownload}>
            <Download size={13}/> Download CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <Save size={13}/> {saving?'Saving-':'Save & Apply'}
          </button>
        </div>
      </div>

      {/* - Right: table - */}
      <div style={{display:'flex',flexDirection:'column',maxHeight:'calc(100vh - 240px)'}}>
      {/* Toolbar */}
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleUpload}/>
        <div className="search-wrap" style={{flex:1}}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="input input-sm" style={{width:200,paddingLeft:34}} placeholder="Search accounts-"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={()=>setColWidths(DEFAULT_WIDTHS)} title="Reset column widths">- Reset cols</button>
        {Object.values(colFilters).some(v=>v&&v.size>0) && (
          <button className="btn btn-ghost btn-xs" onClick={()=>setColFilters({})} style={{color:'var(--warning)'}}>
            <X size={11}/> Clear filters
          </button>
        )}
        <div style={{flex:1}}/>
        <span style={{fontSize:'.78rem',color:'var(--text-3)'}}>{displayed.length}/{rows.length} accounts</span>
      </div>

      {/* Table */}
      <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-md)',
        flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{overflowX:'auto',overflowY:'auto',flex:1}}>
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
                <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text-3)'}}>Loading-</td></tr>
              )}
              {!loading && displayed.length===0 && (
                <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--text-3)'}}>
                  {rows.length===0 ? 'No accounts. Upload a CSV or add manually.' : 'No accounts match the current filters.'}
                </td></tr>
              )}
              {!loading && displayed.map((row,di)=>{
                const i = rows.indexOf(row)
                return (
                  <tr key={row.id??di} style={{cursor:'pointer',
                    background:editIdx===i?'var(--brand-bg,#eff6ff)':undefined}}
                    onClick={()=>startEdit(row,i)}>
                    {COLS.map(k=>(
                      <td key={k} title={row[k]} style={{overflow:'hidden'}}>
                        <span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {row[k]||<span style={{color:'var(--text-3)'}}>-</span>}
                        </span>
                      </td>
                    ))}
                    <td onClick={ev=>ev.stopPropagation()}>
                      <button className="btn btn-ghost btn-icon btn-xs"
                        onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                        onMouseLeave={e=>e.currentTarget.style.color=''}
                        onClick={()=>deleteRow(i)}>
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}

// - SetupPage ---------------------
// - Business Rules (RDR) tab ----------------
const DIRECTION_OPTS = [
  { value:'', label:'Any direction' },
  { value:'debit_only', label:'- Outgoing only' },
  { value:'credit_only', label:'- Incoming only' },
]
const GST_OPTS = ['','GST on Expenses','GST on Capital','GST on Income','GST Free Expenses','GST Free Income','BAS Excluded']
const BLANK = { name:'', priority:100, keywords:'', gl:'', gst:'', direction:'' }

function RdrTab() {
  const [rules,    setRules]   = useState([])
  const [glList,   setGlList]  = useState([])
  const [form,     setForm]    = useState(BLANK)
  const [editId,   setEditId]  = useState(null)
  const [saving,   setSaving]  = useState(false)
  const [rdrSearch, setRdrSearch]= useState('')

  useEffect(()=>{
    rdrList().then(r=>setRules(r.data||[])).catch(()=>{})
    coaAccounts().then(r=>setGlList(r.data||[])).catch(()=>{})
  },[])

  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const save = async () => {
    const kws = form.keywords.split(',').map(k=>k.trim().toLowerCase()).filter(Boolean)
    if(!kws.length){ toast.error('Add at least one keyword'); return }
    if(!form.gl && !form.gst){ toast.error('Set GL Account or GST Category'); return }
    const cond = { contains_any: kws }
    if(form.direction==='debit_only')  cond.debit_only  = true
    if(form.direction==='credit_only') cond.credit_only = true
    const rule = { id: editId||`rule_${Date.now()}`, name: form.name||kws[0],
      priority: parseInt(form.priority)||100, if: cond,
      then: form.gl, then_gst_category: form.gst }
    setSaving(true)
    try {
      if(editId) {
        const {data} = await rdrUpdate(editId, rule)
        setRules(r=>r.map(x=>x.id===editId?data:x))
        toast.success('Rule updated')
      } else {
        const {data} = await rdrCreate(rule)
        setRules(r=>[data,...r])
        toast.success('Rule created')
      }
      setForm(BLANK); setEditId(null)
    } catch { toast.error('Save failed') }
    setSaving(false)
  }

  const startEdit = r => {
    const dir = r.if?.debit_only?'debit_only':r.if?.credit_only?'credit_only':''
    setForm({ name:r.name||'', priority:r.priority||100,
      keywords:(r.if?.contains_any||[]).join(', '),
      gl: typeof r.then==='string'?r.then:'',
      gst: r.then_gst_category||'', direction:dir })
    setEditId(r.id)
    window.scrollTo({top:0,behavior:'smooth'})
  }

  const del = async id => {
    if(!confirm('Delete this rule?')) return
    await rdrDelete(id).catch(()=>{})
    setRules(r=>r.filter(x=>x.id!==id))
    toast.success('Deleted')
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:16,alignItems:'start',
      height:'calc(100vh - 220px)',minHeight:500}}>

      {/* Left: Editor - sticky, no scroll */}
      <div style={{background:'var(--surface-2)',borderRadius:'var(--r-md)',
        padding:'16px 18px',border:'1px solid var(--border)',
        position:'sticky',top:0,overflowY:'auto',maxHeight:'calc(100vh - 240px)'}}>
        <h3 style={{marginBottom:14,fontSize:'.95rem'}}>
          {editId?'- Edit Rule':'- New Rule'}
        </h3>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div className="input-group">
            <label>Rule Name</label>
            <input className="input input-sm" value={form.name} onChange={set('name')} placeholder="e.g. Uber rides"/>
          </div>
          <div className="input-group">
            <label>Priority <span style={{fontWeight:400,color:'var(--text-3)',fontSize:'.75rem'}}>(higher = first)</span></label>
            <input className="input input-sm" type="number" value={form.priority} onChange={set('priority')}/>
          </div>
          <div className="input-group">
            <label>Keywords <span style={{fontWeight:400,color:'var(--text-3)',fontSize:'.75rem'}}>(comma-separated)</span></label>
            <input className="input input-sm" value={form.keywords} onChange={set('keywords')}
              placeholder="uber, didi, taxi"/>
          </div>
          <div className="input-group">
            <label>GL Account</label>
            <select className="input input-sm" value={form.gl} onChange={set('gl')}>
              <option value="">-- Select --</option>
              {glList.map(g=><option key={g.name} value={g.name}>{g.name}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>GST Category</label>
            <select className="input input-sm" value={form.gst} onChange={set('gst')}>
              {GST_OPTS.map(g=><option key={g} value={g}>{g||'-- Auto --'}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>Direction</label>
            <select className="input input-sm" value={form.direction} onChange={set('direction')}>
              {DIRECTION_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving} style={{flex:1}}>
              <Check size={13}/> {saving?'Saving...':(editId?'Update':'Save Rule')}
            </button>
            {editId && (
              <button className="btn btn-ghost btn-sm"
                onClick={()=>{setForm(BLANK);setEditId(null)}}
                title="Clear and create new rule">
                <Plus size={13}/> New Rule
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: Rules list - scrollable */}
      <div style={{borderRadius:'var(--r-md)',border:'1px solid var(--border)',
        overflow:'hidden',display:'flex',flexDirection:'column',
        maxHeight:'calc(100vh - 240px)'}}>
        <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',gap:10,background:'var(--surface-2)',flexWrap:'wrap'}}>
          <Zap size={14} color="var(--brand)"/>
          <span style={{fontWeight:700,fontSize:'.9rem'}}>Active Rules</span>
          <span style={{background:'var(--surface-3)',borderRadius:100,padding:'1px 8px',
            fontSize:'.72rem',fontWeight:700}}>{rules.length}</span>
          <input className="input input-sm" placeholder="Search rules..."
            value={rdrSearch} onChange={e=>setRdrSearch(e.target.value)}
            style={{marginLeft:'auto',width:200}}/>
        </div>
        {rules.length===0
          ? <div style={{padding:32,textAlign:'center',color:'var(--text-3)',fontSize:'.85rem'}}>
              No rules yet. Create one above, or edit a GL Account in Reconciliation to auto-create.
            </div>
          : <div style={{overflowY:'auto',flex:1}}>
            <table className="data-table" style={{width:'100%'}}>
              <thead>
                <tr>
                  <th style={{width:50}}>Pri.</th>
                  <th>Name</th>
                  <th>Keywords</th>
                  <th style={{width:60}}>Dir.</th>
                  <th>GL Account</th>
                  <th>GST</th>
                  <th style={{width:70}}></th>
                </tr>
              </thead>
              <tbody>
                {[...rules].filter(r=>!rdrSearch||(r.name||'').toLowerCase().includes(rdrSearch.toLowerCase())||(r.if?.contains_any||[]).some(k=>k.includes(rdrSearch.toLowerCase()))).sort((a,b)=>(b.priority||0)-(a.priority||0)).map(r=>(
                  <tr key={r.id} style={{cursor:'pointer'}} onClick={()=>startEdit(r)}>
                    <td style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:'.8rem'}}>{r.priority||0}</td>
                    <td style={{fontWeight:600,fontSize:'.85rem'}}>{r.name||r.id}</td>
                    <td style={{fontSize:'.75rem',color:'var(--text-2)'}}>
                      {(r.if?.contains_any||[]).slice(0,5).join(', ')}{(r.if?.contains_any||[]).length>5?'...':''}
                    </td>
                    <td style={{fontSize:'.78rem'}}>
                      {r.if?.debit_only?'- Out':r.if?.credit_only?'- In':'-'}
                    </td>
                    <td><span className="badge badge-neutral" style={{fontSize:'.75rem'}}>{r.then||'-'}</span></td>
                    <td style={{fontSize:'.72rem',color:'var(--text-3)'}}>{r.then_gst_category||'-'}</td>
                    <td onClick={ev=>ev.stopPropagation()}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>del(r.id)} title="Delete"
                        style={{color:'var(--text-3)'}}
                        onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'}
                        onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}>
                        <Trash2 size={13}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
        }
      </div>
    </div>
  )
}

// - Knowledge Base tab ------------------
const DIRECTION_LABELS = { '': '-', 'debit': '- Out', 'credit': '- In' }

function KbTab() {
  const [kb,         setKb]        = useState(null)
  const [glList,     setGlList]    = useState([])
  const [companies,  setCompanies] = useState([])
  const [loading,    setLoading]   = useState(false)
  const [subTab,     setSubTab]    = useState('companies')
  const [vendorKey,  setVendorKey] = useState('')
  const [vendorForm, setVendorForm]= useState({gl:'',gst:'',direction:'debit'})
  const [kwKey,      setKwKey]     = useState('')
  const [kwForm,     setKwForm]    = useState({gl:'',gst:'',direction:'debit'})
  const [saving,     setSaving]    = useState(false)
  const [search,     setSearch]    = useState('')
  const [page,       setPage]      = useState(1)
  const PAGE_SIZE = 50

  useEffect(()=>{
    kbGet().then(r=>setKb(r.data||{})).catch(()=>setKb({}))
    coaAccounts().then(r=>setGlList(r.data||[])).catch(()=>{})
    setLoading(true)
    companyList({limit:600,skip:0}).then(r=>{
      setCompanies(Array.isArray(r.data)?r.data:[])
    }).catch(()=>setCompanies([])).finally(()=>setLoading(false))
  },[])

  useEffect(()=>setPage(1),[search,subTab])

  const GST_OPTS=['','GST on Expenses','GST on Capital','GST on Income','GST Free Expenses','GST Free Income','BAS Excluded']

  const GlSel=({v,s})=>(
    <select className="input input-sm" value={v} onChange={e=>s(e.target.value)}>
      <option value="">-- GL Account --</option>
      {glList.map(g=><option key={g.name} value={g.name}>{g.name}</option>)}
    </select>)

  const GstSel=({v,s})=>(
    <select className="input input-sm" value={v} onChange={e=>s(e.target.value)}>
      {GST_OPTS.map(g=><option key={g} value={g}>{g||'-- Auto --'}</option>)}
    </select>)

  const DirSel=({v,s})=>(
    <select className="input input-sm" value={v} onChange={e=>s(e.target.value)}>
      <option value="">- Any</option>
      <option value="debit">- Outgoing</option>
      <option value="credit">- Incoming</option>
    </select>)

  const saveVendor=async()=>{
    if(!vendorKey.trim()){toast.error('Enter vendor name');return}
    if(!vendorForm.gl){toast.error('Select GL Account');return}
    setSaving(true)
    try{
      await kbVendorUpsert(vendorKey.trim().toLowerCase(),vendorForm)
      setKb(p=>({...p,vendor_map:{...(p?.vendor_map||{}),[vendorKey.trim().toLowerCase()]:vendorForm}}))
      setVendorKey('');setVendorForm({gl:'',gst:'',direction:'debit'})
      toast.success('Vendor saved')
    }catch{toast.error('Save failed')}
    setSaving(false)
  }

  const delVendor=async(key)=>{
    await kbVendorDelete(key).catch(()=>{})
    setKb(p=>{const vm={...(p?.vendor_map||{})};delete vm[key];return{...p,vendor_map:vm}})
    toast.success('Removed')
  }

  const saveKw=async()=>{
    if(!kwKey.trim()){toast.error('Enter keyword');return}
    if(!kwForm.gl){toast.error('Select GL Account');return}
    setSaving(true)
    try{
      await kbKeywordUpsert(kwKey.trim().toLowerCase(),kwForm)
      setKb(p=>({...p,keyword_map:{...(p?.keyword_map||{}),[kwKey.trim().toLowerCase()]:kwForm}}))
      setKwKey('');setKwForm({gl:'',gst:'',direction:'debit'})
      toast.success('Keyword saved')
    }catch{toast.error('Save failed')}
    setSaving(false)
  }

  const delKw=async(key)=>{
    await kbKeywordDelete(key).catch(()=>{})
    setKb(p=>{const km={...(p?.keyword_map||{})};delete km[key];return{...p,keyword_map:km}})
    toast.success('Removed')
  }

  if(!kb) return <div style={{padding:40,textAlign:'center',color:'var(--text-3)'}}>Loading...</div>

  const vendors  = Object.entries(kb.vendor_map||{})
  const keywords = Object.entries(kb.keyword_map||{})

  const filteredCo = companies.filter(c=>!search||
    (c.name||'').toLowerCase().includes(search.toLowerCase())||
    (c.short_name||'').toLowerCase().includes(search.toLowerCase())||
    (c.aliases||[]).some(a=>a.toLowerCase().includes(search.toLowerCase())))
  const totalPages = Math.max(1,Math.ceil(filteredCo.length/PAGE_SIZE))
  const pageCo = filteredCo.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  const filtV = vendors.filter(([k])=>!search||k.includes(search.toLowerCase()))
  const filtK = keywords.filter(([k])=>!search||k.includes(search.toLowerCase()))

  const Pager=({total,cur,set})=>total<=1?null:(
    <div style={{display:'flex',gap:4,alignItems:'center',justifyContent:'center',
      padding:'8px 0',fontSize:'.8rem',borderTop:'1px solid var(--border)'}}>
      <button className="btn btn-ghost btn-sm" onClick={()=>set(1)} disabled={cur===1}>-</button>
      <button className="btn btn-ghost btn-sm" onClick={()=>set(cur-1)} disabled={cur===1}>-</button>
      <span style={{padding:'0 10px',color:'var(--text-2)'}}>Page {cur} / {total}</span>
      <button className="btn btn-ghost btn-sm" onClick={()=>set(cur+1)} disabled={cur===total}>-</button>
      <button className="btn btn-ghost btn-sm" onClick={()=>set(total)} disabled={cur===total}>-</button>
    </div>)

  const AddForm=({keyVal,setKey,form,setForm,onSave,onNew,label,ph})=>(
    <div style={{background:'var(--surface-2)',borderRadius:'var(--r-md)',padding:16,
      border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:8}}>
      <h3 style={{marginBottom:4,fontSize:'.9rem'}}>
        {keyVal ? `Edit: ${keyVal}` : `New ${label}`}
      </h3>
      <div className="input-group">
        <label>{label} name</label>
        <input className="input input-sm" value={keyVal} onChange={e=>setKey(e.target.value)} placeholder={ph}/>
      </div>
      <div className="input-group"><label>GL Account</label>
        <GlSel v={form.gl} s={v=>setForm(f=>({...f,gl:v}))}/>
      </div>
      <div className="input-group"><label>GST</label>
        <GstSel v={form.gst} s={v=>setForm(f=>({...f,gst:v}))}/>
      </div>
      <div className="input-group"><label>Direction</label>
        <DirSel v={form.direction} s={v=>setForm(f=>({...f,direction:v}))}/>
      </div>
      <div style={{display:'flex',gap:6}}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving} style={{flex:1}}>
          {saving?'Saving...': keyVal ? 'Update' : '+ Add'}
        </button>
        {keyVal && (
          <button className="btn btn-ghost btn-sm" onClick={onNew} title="New entry">
            <Plus size={13}/> New
          </button>
        )}
      </div>
    </div>)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        {[
          ['companies',`- Companies (${companies.length})`],
          ['vendors',  `- Vendor Map (${vendors.length})`],
          ['keywords', `- Keywords (${keywords.length})`],
        ].map(([k,l])=>(
          <button key={k} onClick={()=>{setSubTab(k);setSearch('');setPage(1)}}
            className={`btn btn-sm ${subTab===k?'btn-primary':'btn-ghost'}`}>{l}</button>
        ))}
        <input className="input input-sm" placeholder="Search..." value={search}
          onChange={e=>setSearch(e.target.value)} style={{marginLeft:'auto',width:220}}/>
      </div>

      {subTab==='companies' && (
        <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-md)',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',background:'var(--surface-2)',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontWeight:700,fontSize:'.85rem'}}>Company Database</span>
            <span style={{background:'var(--surface-3)',borderRadius:100,padding:'1px 8px',
              fontSize:'.72rem',fontWeight:700}}>{filteredCo.length}</span>
            <span style={{fontSize:'.72rem',color:'var(--text-3)',marginLeft:4}}>
              Aliases matched against transactions to populate WHO column
            </span>
          </div>
          {loading
            ? <div style={{padding:32,textAlign:'center',color:'var(--text-3)'}}>Loading companies...</div>
            : <><div style={{overflowX:'auto'}}>
                <table className="data-table" style={{width:'100%'}}>
                  <thead><tr>
                    <th style={{width:220}}>Company</th>
                    <th style={{width:90}}>Short</th>
                    <th style={{width:120}}>Category</th>
                    <th>Aliases</th>
                  </tr></thead>
                  <tbody>
                    {pageCo.map((c,i)=>(
                      <tr key={i}>
                        <td style={{fontWeight:600,fontSize:'.82rem'}}>{c.name}</td>
                        <td style={{fontSize:'.78rem',color:'var(--text-2)'}}>{c.short_name||'-'}</td>
                        <td style={{fontSize:'.75rem',color:'var(--text-3)'}}>{c.category||'-'}</td>
                        <td style={{fontSize:'.72rem'}}>
                          {(c.aliases||[]).map(a=>(
                            <span key={a} style={{display:'inline-block',background:'var(--surface-3)',
                              borderRadius:3,padding:'1px 5px',margin:'1px 2px',whiteSpace:'nowrap'}}>
                              {a}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={totalPages} cur={page} set={setPage}/>
            </>
          }
        </div>
      )}

      {subTab==='vendors' && (
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:16,alignItems:'start',
          height:'calc(100vh - 280px)',minHeight:400}}>
          <AddForm keyVal={vendorKey} setKey={setVendorKey} form={vendorForm} setForm={setVendorForm}
            onSave={saveVendor} label="Vendor" ph="e.g. uber, microsoft"
            onNew={()=>{setVendorKey('');setVendorForm({gl:'',gst:'',direction:'debit'})}}/>
          <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-md)',overflow:'hidden',
            display:'flex',flexDirection:'column',maxHeight:'calc(100vh - 300px)'}}>
            <div style={{padding:'10px 14px',background:'var(--surface-2)',fontWeight:700,fontSize:'.85rem',
              borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              Vendor Map <span style={{fontWeight:400,fontSize:'.72rem',color:'var(--text-3)'}}>({filtV.length})</span>
            </div>
            <div style={{overflowY:'auto',flex:1}}>
              <table className="data-table" style={{width:'100%'}}>
                <thead><tr>
                  <th>Vendor</th><th>GL</th><th>GST</th><th style={{width:60}}>Dir</th><th style={{width:36}}></th>
                </tr></thead>
                <tbody>
                  {filtV.sort(([a],[b])=>a.localeCompare(b)).map(([k,e])=>(
                    <tr key={k} style={{cursor:'pointer'}}
                      onClick={()=>{setVendorKey(k);setVendorForm({gl:e.gl||'',gst:e.gst||'',direction:e.direction||'debit'})}}>
                      <td style={{fontWeight:600,fontSize:'.82rem'}}>{k}</td>
                      <td><span className="badge badge-neutral" style={{fontSize:'.72rem'}}>{e.gl}</span></td>
                      <td style={{fontSize:'.72rem',color:'var(--text-3)'}}>{e.gst||'-'}</td>
                      <td style={{fontSize:'.72rem'}}>{DIRECTION_LABELS[e.direction||'']}</td>
                      <td onClick={ev=>ev.stopPropagation()}>
                        <button className="btn btn-ghost btn-icon btn-sm"
                          title="Delete"
                          onMouseEnter={ev=>ev.currentTarget.style.color='var(--danger)'}
                          onMouseLeave={ev=>ev.currentTarget.style.color=''}
                          onClick={()=>delVendor(k)}><Trash2 size={11}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab==='keywords' && (
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:16,alignItems:'start',
          height:'calc(100vh - 280px)',minHeight:400}}>
          <AddForm keyVal={kwKey} setKey={setKwKey} form={kwForm} setForm={setKwForm}
            onSave={saveKw} label="Keyword" ph="e.g. broker fee, cleaning"
            onNew={()=>{setKwKey('');setKwForm({gl:'',gst:'',direction:'debit'})}}/>
          <div style={{border:'1px solid var(--border)',borderRadius:'var(--r-md)',overflow:'hidden',
            display:'flex',flexDirection:'column',maxHeight:'calc(100vh - 300px)'}}>
            <div style={{padding:'10px 14px',background:'var(--surface-2)',fontWeight:700,fontSize:'.85rem',
              borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              Keyword Map <span style={{fontWeight:400,fontSize:'.72rem',color:'var(--text-3)'}}>({filtK.length})</span>
            </div>
            <div style={{overflowY:'auto',flex:1}}>
              <table className="data-table" style={{width:'100%'}}>
                <thead><tr>
                  <th>Keyword</th><th>GL</th><th>GST</th><th style={{width:60}}>Dir</th><th style={{width:36}}></th>
                </tr></thead>
                <tbody>
                  {filtK.sort(([a],[b])=>a.localeCompare(b)).map(([k,e])=>(
                    <tr key={k} style={{cursor:'pointer'}}
                      onClick={()=>{setKwKey(k);setKwForm({gl:e.gl||'',gst:e.gst||'',direction:e.direction||'debit'})}}>
                      <td style={{fontWeight:600,fontSize:'.82rem'}}>{k}</td>
                      <td><span className="badge badge-neutral" style={{fontSize:'.72rem'}}>{e.gl}</span></td>
                      <td style={{fontSize:'.72rem',color:'var(--text-3)'}}>{e.gst||'-'}</td>
                      <td style={{fontSize:'.72rem'}}>{DIRECTION_LABELS[e.direction||'']}</td>
                      <td onClick={ev=>ev.stopPropagation()}>
                        <button className="btn btn-ghost btn-icon btn-sm"
                          title="Delete"
                          onMouseEnter={ev=>ev.currentTarget.style.color='var(--danger)'}
                          onMouseLeave={ev=>ev.currentTarget.style.color=''}
                          onClick={()=>delKw(k)}><Trash2 size={11}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


const TABS = [{ key:'coa', label:'Chart of Accounts', icon:'-' }, { key:'rdr', label:'Business Rules', icon:'-' }, { key:'kb', label:'Knowledge Base', icon:'-' }]

export default function SetupPage() {
  const [tab, setTab] = useState('coa')
  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}>
        <h1>- Setup</h1>
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
        {tab==='coa' && <CoaTab/>}
        {tab==='rdr' && <RdrTab/>}
        {tab==='kb'  && <KbTab/>}
      </div>
    </div>
  )
}