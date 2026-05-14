import React, { useEffect, useState } from 'react'
import { changePassword, mlStatus, mlTrain, mlSampleCsv, rdrList, rdrCreate, rdrUpdate, rdrDelete, rdrTest } from '../lib/api.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Trash2, Key, Brain, Plus, Check, X, Play } from 'lucide-react'
import toast from 'react-hot-toast'

const ALLOWED_GL  = ['Inventory','Fixed_Asset','Transfer','Revenue','Expense','Other']
const ALLOWED_GST = ['','GST on Expenses','GST on Capital','GST on Income','GST Free Expenses','GST Free Income','BAS Excluded']

export default function AdminPage() {
  const { user } = useAuth()
  const [tab,    setTab]    = useState('ml')
  const [pwForm, setPwForm] = useState({old_password:'',new_password:''})
  const [mlStat, setMlStat] = useState(null)
  const [training,setTraining] = useState(false)
  const [trainRes,setTrainRes] = useState(null)
  const [rules,  setRules]  = useState([])
  const [ruleForm,setRuleForm] = useState({name:'',priority:10,if:{contains_any:[]},then:{category:'',gst_category:''}})
  const [testInput,setTestInput] = useState({description:'',debit:0,credit:0})
  const [testResult,setTestResult] = useState(null)
  const [editRule,setEditRule] = useState(null)
  const [keywordInput,setKeywordInput] = useState('')
  const fileRef = React.useRef()

  useEffect(()=>{
    mlStatus().then(r=>setMlStat(r.data)).catch(()=>{})
    rdrList().then(r=>setRules(r.data||[])).catch(()=>{})
  },[])

  const changePw = async e => {
    e.preventDefault()
    try { await changePassword({email:user.email,...pwForm}); toast.success('Password updated'); setPwForm({old_password:'',new_password:''}) }
    catch { toast.error('Failed — check current password') }
  }

  const trainModel = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Select a training CSV first'); return }
    setTraining(true); setTrainRes(null)
    try {
      const fd = new FormData(); fd.append('file', file, file.name)
      const { data } = await mlTrain(fd)
      setTrainRes(data); setMlStat(s=>({...s,category_model:true,gst_model:true}))
      toast.success('Models trained successfully')
    } catch (e) { toast.error(e.response?.data?.detail||'Training failed') }
    finally { setTraining(false) }
  }

  const downloadSample = async () => {
    const { data } = await mlSampleCsv()
    const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([data])); a.download='sample_training_data.csv'; a.click()
  }

  const saveRule = async () => {
    const keywords = keywordInput.split(',').map(k=>k.trim()).filter(Boolean)
    // Use "then" (string) and "then_gst_category" matching transaction_classify.py
    const rule = {
      ...(editRule||{}),
      name: ruleForm.name,
      priority: ruleForm.priority,
      if: { contains_any: keywords.length ? keywords : (ruleForm.if?.contains_any||[]) },
      then: ruleForm.then?.category || '',
      then_gst_category: ruleForm.then?.gst_category || '',
    }
    try {
      if (editRule) {
        const { data } = await rdrUpdate(editRule.id, rule); setRules(r=>r.map(x=>x.id===editRule.id?data:x))
        toast.success('Rule updated')
      } else {
        const { data } = await rdrCreate(rule); setRules(r=>[...r,data])
        toast.success('Rule created')
      }
      setEditRule(null); setRuleForm({name:'',priority:10,if:{contains_any:[]},then:{category:'',gst_category:''}}); setKeywordInput('')
    } catch { toast.error('Save failed') }
  }

  const delRule = async id => {
    try { await rdrDelete(id); setRules(r=>r.filter(x=>x.id!==id)); toast.success('Deleted') }
    catch { toast.error('Delete failed') }
  }

  const runTest = async () => {
    const { data } = await rdrTest(testInput)
    setTestResult(data)
  }

  const startEdit = rule => {
    setEditRule(rule)
    setRuleForm({name:rule.name||'',priority:rule.priority||10,if:rule.if||{contains_any:[]},then:{category:String(rule.then||''),gst_category:String(rule.then_gst_category||rule.gst_category||'')}})
    setKeywordInput((rule.if?.contains_any||[]).join(', '))
    setTab('rdr')
  }

  const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  return (
    <div className="fade-in">
      <div style={{marginBottom:22}}>
        <h1>🧠 ML Classifier & RDR</h1>
        <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>Train classification models and configure RDR rules</p>
      </div>

      <div className="tabs-bar" style={{marginBottom:20}}>
        {[['ml','🧠 ML Training'],['rdr','📋 RDR Rules'],['password','🔑 Password']].map(([k,label])=>(
          <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={()=>setTab(k)}>{label}</button>
        ))}
      </div>

      {/* ── ML Training ── */}
      {tab==='ml' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,alignItems:'start'}}>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,paddingBottom:14,borderBottom:'1px solid var(--border)'}}>
              <Brain size={18} color="var(--brand)"/><h3>Train Classification Models</h3>
            </div>
            <p style={{color:'var(--text-2)',fontSize:'.875rem',marginBottom:16,lineHeight:1.7}}>
              Upload a labelled CSV to retrain the <strong>GL Account</strong> and <strong>GST Category</strong> classifiers.
              Trained models are saved immediately and used by <strong>Auto-Classify GL</strong> in Reconciliation.
            </p>

            {mlStat && (
              <div style={{display:'flex',gap:12,marginBottom:16}}>
                <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',background:mlStat.category_model?'var(--success-bg)':'var(--surface-3)',border:`1px solid ${mlStat.category_model?'var(--success-border)':'var(--border)'}`,fontSize:'.8rem',fontWeight:600,color:mlStat.category_model?'var(--success)':'var(--text-3)'}}>
                  {mlStat.category_model?'✅':'❌'} GL Account Model
                </div>
                <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',background:mlStat.gst_model?'var(--success-bg)':'var(--surface-3)',border:`1px solid ${mlStat.gst_model?'var(--success-border)':'var(--border)'}`,fontSize:'.8rem',fontWeight:600,color:mlStat.gst_model?'var(--success)':'var(--text-3)'}}>
                  {mlStat.gst_model?'✅':'❌'} GST Category Model
                </div>
              </div>
            )}

            <details style={{marginBottom:16}}>
              <summary style={{cursor:'pointer',fontSize:'.8rem',fontWeight:600,color:'var(--text-2)'}}>Required CSV columns</summary>
              <div style={{marginTop:10,padding:'10px 14px',background:'var(--surface-2)',borderRadius:'var(--r-md)',fontSize:'.8rem'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr><th style={{textAlign:'left',paddingBottom:6,color:'var(--text-3)',fontWeight:700,fontSize:'.7rem',textTransform:'uppercase',letterSpacing:'.05em'}}>Column</th><th style={{textAlign:'left',paddingBottom:6,color:'var(--text-3)',fontWeight:700,fontSize:'.7rem',textTransform:'uppercase',letterSpacing:'.05em'}}>Required</th><th style={{textAlign:'left',paddingBottom:6,color:'var(--text-3)',fontWeight:700,fontSize:'.7rem',textTransform:'uppercase',letterSpacing:'.05em'}}>Notes</th></tr></thead>
                  <tbody style={{fontSize:'.8rem',color:'var(--text-2)'}}>
                    {[['description / transaction_description','✅','Transaction text used for classification'],['category','✅','GL Account / category label'],['gst_category','✅','GST category label'],['date','optional','Ignored during training'],['amount','optional','Ignored during training']].map(([col,req,note])=>(
                      <tr key={col}><td className="mono" style={{paddingRight:12,paddingBottom:4}}>{col}</td><td style={{paddingRight:12}}>{req}</td><td style={{color:'var(--text-3)'}}>{note}</td></tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn btn-outline btn-sm" style={{marginTop:10}} onClick={downloadSample}>⬇ Download sample CSV</button>
              </div>
            </details>

            <div className="input-group" style={{marginBottom:12}}>
              <label>Training CSV File</label>
              <input ref={fileRef} type="file" accept=".csv" className="input" style={{paddingTop:6}}/>
            </div>
            <button className="btn btn-primary" onClick={trainModel} disabled={training}>
              {training?<><span className="spinner spinner-sm"/>Training models…</>:<><Brain size={15}/>Train Models</>}
            </button>

            {trainRes && (
              <div className="alert alert-success" style={{marginTop:16}}>
                <div>
                  <strong>✅ Training complete!</strong>
                  <div style={{marginTop:6,fontSize:'.8rem'}}>
                    Rows used: {trainRes.rows_used} · GL Accuracy: {trainRes.category_accuracy!=null?(trainRes.category_accuracy*100).toFixed(1)+'%':'—'} · GST Accuracy: {trainRes.gst_accuracy!=null?(trainRes.gst_accuracy*100).toFixed(1)+'%':'—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{marginBottom:12}}>How it works</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {[['1','Upload CSV','Prepare a CSV with labelled transactions — the more rows the better (500+ recommended)'],['2','Train','Accfino trains a TF-IDF + LinearSVC pipeline on your data'],['3','Save','Models are saved to classifier_model/ and used immediately'],['4','Classify','Use Auto-Classify GL in Reconciliation to apply models to new transactions']].map(([n,t,d])=>(
                <div key={n} style={{display:'flex',gap:12}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:'var(--brand)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.75rem',fontWeight:700,flexShrink:0}}>{n}</div>
                  <div><div style={{fontWeight:600,fontSize:'.875rem',marginBottom:2}}>{t}</div><div style={{fontSize:'.78rem',color:'var(--text-3)',lineHeight:1.5}}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── RDR Rules ── */}
      {tab==='rdr' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,alignItems:'start'}}>
          <div>
            {/* Rule list */}
            <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
              <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                <h3>Classification Rules</h3>
                <span style={{marginLeft:'auto',background:'var(--surface-3)',borderRadius:100,padding:'1px 8px',fontSize:'.72rem',fontWeight:700}}>{rules.length}</span>
                <button className="btn btn-primary btn-sm" onClick={()=>{setEditRule(null);setRuleForm({name:'',priority:10,if:{contains_any:[]},then:{category:'',gst_category:''}});setKeywordInput('')}}>
                  <Plus size={13}/> New Rule
                </button>
              </div>
              {rules.length===0
                ? <div className="empty-state" style={{padding:36}}><p>No rules yet. Create one to classify transactions by description keywords.</p></div>
                : <table className="data-table">
                    <thead><tr><th>Priority</th><th>Name</th><th>Keywords</th><th>GL Account</th><th>GST</th><th></th></tr></thead>
                    <tbody>
                      {rules.sort((a,b)=>(b.priority||0)-(a.priority||0)).map(r=>(
                        <tr key={r.id}>
                          <td style={{fontFamily:'var(--font-mono)',fontWeight:700}}>{r.priority||0}</td>
                          <td style={{fontWeight:600,fontSize:'.875rem'}}>{r.name||r.id}</td>
                          <td style={{fontSize:'.75rem'}}>{(r.if?.contains_any||[]).slice(0,3).join(', ')}{(r.if?.contains_any||[]).length>3?'…':''}</td>
                          <td><span className="badge badge-neutral">{(typeof r.then==='string'?r.then:r.then?.category)||'—'}</span></td>
                          <td style={{fontSize:'.75rem',color:'var(--text-3)'}}>{r.then_gst_category||r.then?.gst_category||'—'}</td>
                          <td style={{display:'flex',gap:4}}>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>startEdit(r)}><Key size={13}/></button>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>delRule(r.id)} style={{color:'var(--text-3)'}} onMouseEnter={e=>e.currentTarget.style.color='var(--danger)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-3)'}><Trash2 size={13}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>

            {/* Rule editor */}
            <div className="card">
              <h3 style={{marginBottom:14}}>{editRule?'Edit Rule':'New Rule'}</h3>
              <div className="grid-2" style={{gap:12,marginBottom:12}}>
                <div className="input-group"><label>Rule Name</label><input className="input" value={ruleForm.name} onChange={e=>setRuleForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Office Supplies"/></div>
                <div className="input-group"><label>Priority (higher = first)</label><input className="input" type="number" value={ruleForm.priority} onChange={e=>setRuleForm(f=>({...f,priority:parseInt(e.target.value)||0}))}/></div>
              </div>
              <div className="input-group" style={{marginBottom:12}}>
                <label>Keywords (comma-separated) — IF description contains any</label>
                <input className="input" value={keywordInput} onChange={e=>setKeywordInput(e.target.value)} placeholder="bunnings, hardware, officeworks"/>
              </div>
              <div className="grid-2" style={{gap:12,marginBottom:12}}>
                <div className="input-group"><label>GL Account (THEN)</label>
                  <select className="input" value={ruleForm.then?.category||''} onChange={e=>setRuleForm(f=>({...f,then:{...f.then,category:e.target.value}}))}>
                    <option value="">— Select —</option>
                    {ALLOWED_GL.map(g=><option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="input-group"><label>GST Category (THEN)</label>
                  <select className="input" value={ruleForm.then?.gst_category||''} onChange={e=>setRuleForm(f=>({...f,then:{...f.then,gst_category:e.target.value}}))}>
                    <option value="">— Select —</option>
                    {ALLOWED_GST.map(g=><option key={g} value={g}>{g||'None'}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-primary btn-sm" onClick={saveRule}><Check size={13}/> {editRule?'Update Rule':'Save Rule'}</button>
                {editRule&&<button className="btn btn-ghost btn-sm" onClick={()=>{setEditRule(null);setRuleForm({name:'',priority:10,if:{contains_any:[]},then:{category:'',gst_category:''}});setKeywordInput('')}}><X size={13}/> Cancel</button>}
              </div>
            </div>
          </div>

          {/* Test panel */}
          <div className="card">
            <h3 style={{marginBottom:14}}><Play size={16} style={{display:'inline',marginRight:6,verticalAlign:'middle'}}/>Test Rules</h3>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div className="input-group"><label>Description</label><input className="input" value={testInput.description} onChange={e=>setTestInput(t=>({...t,description:e.target.value}))} placeholder="BUNNINGS WAREHOUSE"/></div>
              <div className="grid-2" style={{gap:8}}>
                <div className="input-group"><label>Debit</label><input className="input" type="number" min="0" value={testInput.debit} onChange={e=>setTestInput(t=>({...t,debit:parseFloat(e.target.value)||0}))}/></div>
                <div className="input-group"><label>Credit</label><input className="input" type="number" min="0" value={testInput.credit} onChange={e=>setTestInput(t=>({...t,credit:parseFloat(e.target.value)||0}))}/></div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={runTest}><Play size={13}/> Test</button>
            </div>
            {testResult && (
              <div style={{marginTop:14}}>
                {testResult.matched
                  ? <div className="alert alert-success">
                      <div><strong>✅ Rule matched: {testResult.rule?.name||testResult.rule?.id}</strong>
                        <div style={{marginTop:6,fontSize:'.78rem'}}>GL: {testResult.rule?.then?.category||'—'} · GST: {testResult.rule?.then?.gst_category||'—'} · Priority: {testResult.rule?.priority}</div>
                      </div>
                    </div>
                  : <div className="alert alert-warning">❌ No rule matched this transaction.</div>
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Password ── */}
      {tab==='password' && (
        <div style={{maxWidth:400}}>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,paddingBottom:14,borderBottom:'1px solid var(--border)'}}>
              <Key size={18} color="var(--brand)"/><h3>Change Password</h3>
            </div>
            <form onSubmit={changePw} style={{display:'flex',flexDirection:'column',gap:14}}>
              <div className="input-group"><label>Current Password</label><input className="input" type="password" value={pwForm.old_password} onChange={e=>setPwForm(p=>({...p,old_password:e.target.value}))} required/></div>
              <div className="input-group"><label>New Password</label><input className="input" type="password" value={pwForm.new_password} onChange={e=>setPwForm(p=>({...p,new_password:e.target.value}))} required/></div>
              <button className="btn btn-primary" type="submit">Update Password</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
