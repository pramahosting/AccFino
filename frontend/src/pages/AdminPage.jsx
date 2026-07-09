import React, { useEffect, useState, useRef } from 'react'
import { changePassword, mlStatus, mlTrain, mlSampleCsv, groqPoolList, groqPoolAdd, groqPoolUpdate, groqPoolRemove, groqPoolListModels } from '../lib/api.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Trash2, Key, Brain, Plus, Check, X, Play, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

const ALLOWED_GST = ['','GST on Expenses','GST on Capital','GST on Income','GST Free Expenses','GST Free Income','BAS Excluded']
const DIRECTION_OPTIONS = [
  { value: '', label: 'Any direction' },
  { value: 'debit_only', label: '🟡 Outgoing only (debit)' },
  { value: 'credit_only', label: '🔵 Incoming only (credit)' },
]

// BLANK_FORM removed -- RDR rule form now lives only in Setup page (SetupPage.jsx RdrTab)

export default function AdminPage() {
  const { user } = useAuth()
  const [tab,       setTab]      = useState('groq')
  const [pwForm,    setPwForm]   = useState({old_password:'',new_password:''})
  const [mlStat,    setMlStat]   = useState(null)
  const [training,  setTraining] = useState(false)
  const [trainRes,  setTrainRes] = useState(null)
  // RDR rules editor moved entirely to Setup page (SetupPage.jsx RdrTab) --
  // this page no longer duplicates that state/UI.
  const fileRef = React.useRef()

  // ── Groq Key Pool ──────────────────────────────────────────────────
  const [poolKeys, setPoolKeys] = useState([])
  const [newPoolKey, setNewPoolKey] = useState({ key_value:'', model:'' })
  const [poolMsg, setPoolMsg] = useState('')
  const [fetchedModels, setFetchedModels] = useState(null)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelsFetchError, setModelsFetchError] = useState('')
  const autoFetchTimer = useRef(null)

  const loadPool = () => groqPoolList().then(r=>setPoolKeys(r.data||[])).catch(()=>{})

  const fetchModelsForKey = async (keyOverride) => {
    const key = (keyOverride ?? newPoolKey.key_value).trim()
    if (!key) { setModelsFetchError('Enter the API key above first.'); return }
    setFetchingModels(true); setModelsFetchError(''); setFetchedModels(null)
    try {
      const { data } = await groqPoolListModels(key)
      setFetchedModels(data.models || [])
    } catch (e) {
      setModelsFetchError(e.response?.data?.detail || 'Could not fetch models for this key.')
    } finally {
      setFetchingModels(false)
    }
  }

  // Auto-fetches shortly after the user stops typing/pasting a
  // plausible-looking key — mirrors Groq's own console, no extra click needed.
  useEffect(() => {
    if (autoFetchTimer.current) clearTimeout(autoFetchTimer.current)
    const key = newPoolKey.key_value.trim()
    if (key.length < 20) return
    autoFetchTimer.current = setTimeout(() => fetchModelsForKey(key), 600)
    return () => { if (autoFetchTimer.current) clearTimeout(autoFetchTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPoolKey.key_value])

  const addPoolKey = async () => {
    const key_value = newPoolKey.key_value.trim()
    if (!key_value) return
    try {
      await groqPoolAdd({ key_value, model: newPoolKey.model.trim() || undefined })
      setNewPoolKey({ key_value:'', model:'' }); setFetchedModels(null); setModelsFetchError('')
      loadPool()
      toast.success('Key added to pool')
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add key') }
  }

  const togglePoolKey = async (id, is_active) => {
    try { await groqPoolUpdate(id, { is_active }); loadPool() }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to update key') }
  }

  const removePoolKey = async id => {
    if (!confirm('Remove this key from the pool?')) return
    try { await groqPoolRemove(id); loadPool(); toast.success('Key removed') }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to remove key') }
  }


  useEffect(()=>{
    mlStatus().then(r=>setMlStat(r.data)).catch(()=>{})
    loadPool()
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


  return (
    <div className="fade-in">
      <div style={{marginBottom:22}}>
        <h1>🧠 ML Classifier</h1>
        <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>
          Manage the shared Groq key pool and train the ML classifier. Business Rules (RDR) are managed on the Setup page.
        </p>
      </div>

      <div className="tabs-bar" style={{marginBottom:20}}>
        {[['groq','🔑 Groq Keys'],['ml','🧠 ML Training'],['password','🔑 Password']].map(([k,label])=>(
          <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={()=>setTab(k)}>{label}</button>
        ))}
      </div>

      {/* ── Groq Key Pool ── */}
      {tab==='groq' && (
        <div style={{maxWidth:680}}>
          <div className="card" style={{marginBottom:16}}>
            <h3 style={{marginBottom:8}}><Key size={16} style={{display:'inline',marginRight:6,verticalAlign:'middle'}}/>Groq Key Pool — scale capacity automatically</h3>
            <p style={{fontSize:'.8rem',color:'var(--text-2)',marginBottom:16,lineHeight:1.6}}>
              Add multiple Groq keys here (separate accounts give real added throughput —
              Groq's rate limits apply per account, not per key). AccFino automatically spreads
              load across whichever keys are healthy, and routes around any that are temporarily
              rate-limited, recovering them automatically once they cool down. Used by the
              transaction/bank-classification LLM calls (e.g. <code>rdr.py</code>).
            </p>

            {poolKeys.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--text-3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.04em'}}>
                  Keys in pool ({poolKeys.length})
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {(() => {
                    const byAddedAsc = [...poolKeys].sort((a,b)=>new Date(a.added_at||0)-new Date(b.added_at||0))
                    const numberOf = new Map(byAddedAsc.map((k,i)=>[k.id,i+1]))
                    return poolKeys.map(k => (
                      <div key={k.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',opacity:k.is_active?1:0.5}}>
                        <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:24,height:24,borderRadius:6,flexShrink:0,background:'var(--surface-2)',fontSize:'.7rem',fontWeight:700,color:'var(--text-3)'}}>
                          {numberOf.get(k.id)}
                        </span>
                        <span style={{fontFamily:'var(--font-mono)',fontSize:'.82rem'}}>{k.key_preview}</span>
                        <span style={{fontSize:'.75rem',color:'var(--text-3)'}}>{k.model || 'platform default'}</span>
                        {k.cooldown_until && new Date(k.cooldown_until) > new Date() && (
                          <span style={{fontSize:'.7rem',color:'var(--warning, #f59e0b)'}}>⏳ cooling down</span>
                        )}
                        {!k.is_active && <span style={{fontSize:'.7rem',color:'var(--text-3)'}}>disabled</span>}
                        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
                          <button className="btn btn-ghost btn-sm" onClick={()=>togglePoolKey(k.id, !k.is_active)}>
                            {k.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger)'}} onClick={()=>removePoolKey(k.id)} title="Remove">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}

            <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
              <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--text-3)',marginBottom:10,textTransform:'uppercase',letterSpacing:'.04em'}}>
                Add a new key — will become Key #{poolKeys.length + 1}
              </div>

              <div className="input-group" style={{marginBottom:8}}>
                <label>API Key</label>
                <input className="input" type="password" placeholder="gsk_…" value={newPoolKey.key_value}
                  onChange={e=>{ setNewPoolKey(k=>({...k,key_value:e.target.value})); setFetchedModels(null); setModelsFetchError('') }} />
              </div>

              <div style={{marginBottom:4,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                {fetchingModels && <span style={{fontSize:'.75rem',color:'var(--text-3)'}}>Checking with Groq…</span>}
                {!fetchingModels && fetchedModels && (
                  <span style={{fontSize:'.75rem',color:'var(--success)'}}>✓ {fetchedModels.length} models available for this key</span>
                )}
                {!fetchingModels && !fetchedModels && !modelsFetchError && newPoolKey.key_value.trim().length > 0 && (
                  <span style={{fontSize:'.75rem',color:'var(--text-3)'}}>Models will load automatically once the key looks complete…</span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={()=>fetchModelsForKey()} disabled={fetchingModels || !newPoolKey.key_value.trim()}>
                  {fetchedModels ? 'Refetch' : 'Fetch now'}
                </button>
                {modelsFetchError && <span style={{fontSize:'.75rem',color:'var(--danger)'}}>{modelsFetchError}</span>}
              </div>

              <div className="input-group" style={{marginTop:10,marginBottom:14}}>
                <label>Model</label>
                {fetchedModels ? (
                  <select className="input" value={newPoolKey.model} onChange={e=>setNewPoolKey(k=>({...k,model:e.target.value}))}>
                    <option value="">Platform default (openai/gpt-oss-20b)</option>
                    {fetchedModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input className="input" value={newPoolKey.model} onChange={e=>setNewPoolKey(k=>({...k,model:e.target.value}))}
                    placeholder="leave blank for platform default, or fetch models above to pick from a live list"/>
                )}
              </div>

              <button className="btn btn-primary" onClick={addPoolKey} disabled={!newPoolKey.key_value.trim()}>
                <Plus size={14}/> Add as Key #{poolKeys.length + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ML Training ── */}
      {tab==='ml' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,alignItems:'start'}}>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,paddingBottom:14,borderBottom:'1px solid var(--border)'}}>
              <Brain size={18} color="var(--brand)"/><h3>Train Classification Models</h3>
            </div>
            <p style={{color:'var(--text-2)',fontSize:'.875rem',marginBottom:16,lineHeight:1.7}}>
              Upload a labelled CSV to retrain the <strong>GL Account</strong> and <strong>GST Category</strong> classifiers.
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
            <div className="input-group" style={{marginBottom:12}}>
              <label>Training CSV File</label>
              <input ref={fileRef} type="file" accept=".csv" className="input" style={{paddingTop:6}}/>
            </div>
            <button className="btn btn-primary" onClick={trainModel} disabled={training}>
              {training?<><span className="spinner spinner-sm"/>Training…</>:<><Brain size={15}/>Train Models</>}
            </button>
            {trainRes && (
              <div className="alert alert-success" style={{marginTop:16}}>
                <strong>✅ Training complete!</strong>
                <div style={{marginTop:6,fontSize:'.8rem'}}>
                  Rows: {trainRes.rows_used} · GL: {trainRes.category_accuracy!=null?(trainRes.category_accuracy*100).toFixed(1)+'%':'—'} · GST: {trainRes.gst_accuracy!=null?(trainRes.gst_accuracy*100).toFixed(1)+'%':'—'}
                </div>
                {trainRes.warning && (
                  <div style={{marginTop:8,padding:'6px 10px',background:'var(--warning-bg,#fffbeb)',
                    borderRadius:'var(--r-md)',fontSize:'.76rem',color:'var(--warning,#b45309)'}}>
                    ⚠ {trainRes.warning}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="card">
            <h3 style={{marginBottom:12}}>How it works</h3>
            <button className="btn btn-outline btn-sm" onClick={downloadSample}>⬇ Download sample CSV</button>
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

// Export startEdit so OutputPanel can open Admin page pre-filled
export { }
