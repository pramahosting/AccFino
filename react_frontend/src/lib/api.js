import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login          = (email, pw)    => http.post('/auth/login', { email, password: pw })
export const register       = (data)         => http.post('/auth/register', data)
export const changePassword = (data)         => http.post('/auth/change-password', data)
export const getAllUsers     = ()             => http.get('/auth/users')
export const deleteUser     = (id)           => http.delete(`/auth/users/${id}`)

// ── Sessions ──────────────────────────────────────────────────────────────────
export const getSessions   = (u)             => http.get('/sessions', { params: { username: u } })
export const getSession    = (u, sid)        => http.get(`/sessions/${u}/${sid}`)
export const deleteSession = (u, sid)        => http.delete(`/sessions/${u}/${sid}`)
export const saveSession   = (body)          => http.post('/sessions/save', body)

// ── Banks / GST ───────────────────────────────────────────────────────────────
export const getBanks        = ()            => http.get('/banks')
export const getGstCategories= ()            => http.get('/gst/categories')
export const calcGST         = (d,c,cat)     => http.get('/gst/calculate', { params:{debit:d,credit:c,category:cat} })

// ── Reconciliation ────────────────────────────────────────────────────────────
export const processFiles  = (fd)            => http.post('/reconcile/process', fd, { headers:{'Content-Type':'multipart/form-data'} })
export const classifyGL    = (sid, u)        => http.post('/reconcile/classify', { session_id:sid, username:u })
export const exportExcel   = (txns)          => http.post('/reconcile/export', { transactions:txns }, { responseType:'blob' })

// ── Transactions (DB) ─────────────────────────────────────────────────────────
export const saveToDB      = (uid, txns)     => http.post('/transactions/save', { user_id:uid, transactions:txns })
export const getUserTxns   = (uid)           => http.get(`/transactions/user/${uid}`)

// ── Trading ───────────────────────────────────────────────────────────────────
export const tradingAnalyze = (fd)           => http.post('/trading/analyze', fd, { headers:{'Content-Type':'multipart/form-data'} })
export const tradingExport  = (fd)           => http.post('/trading/export', fd, { headers:{'Content-Type':'multipart/form-data'}, responseType:'blob' })

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export const cfDetect       = (fd)           => http.post('/cashflow/detect', fd, { headers:{'Content-Type':'multipart/form-data'} })
export const cfRun          = (rows, colMap) => http.post('/cashflow/run', { rows, col_map:colMap })
export const cfPredict      = (runId, model) => http.post(`/cashflow/predict/${runId}`, model, { headers:{'Content-Type':'application/json'} })

// ── ML Classifier ─────────────────────────────────────────────────────────────
export const mlStatus      = ()              => http.get('/ml/status')
export const mlSampleCsv   = ()              => http.get('/ml/sample-csv', { responseType:'blob' })
export const mlTrain       = (fd)            => http.post('/ml/train', fd, { headers:{'Content-Type':'multipart/form-data'} })

// ── RDR Rules ─────────────────────────────────────────────────────────────────
export const rdrList       = ()              => http.get('/rdr/rules')
export const rdrCreate     = (rule)          => http.post('/rdr/rules', rule)
export const rdrUpdate     = (id, rule)      => http.put(`/rdr/rules/${id}`, rule)
export const rdrDelete     = (id)            => http.delete(`/rdr/rules/${id}`)
export const rdrTest       = (body)          => http.post('/rdr/test', body)

// ── Invoice Extractor ─────────────────────────────────────────────────────────
export const ieStatus      = ()              => http.get('/invoice-extractor/status')
export const ieProcess     = (fd)            => http.post('/invoice-extractor/process', fd, { headers:{'Content-Type':'multipart/form-data'} })

// ── Invoice (DB) ──────────────────────────────────────────────────────────────
export const invoiceGetBusinesses  = ()      => http.get('/invoice/businesses')
export const invoiceCreateBusiness = (data)  => http.post('/invoice/businesses', data)
export const invoiceGetAll   = (bid)         => http.get(`/invoice/businesses/${bid}/invoices`)
export const invoiceCreate   = (data)        => http.post('/invoice/invoices', data)
export const invoiceGetOne   = (id)          => http.get(`/invoice/invoices/${id}`)
export const invoiceNextNum  = ()            => http.get('/invoice/next-number')
export const invoiceUpdateStatus = (id,stat) => http.patch(`/invoice/invoices/${id}/status`, { status:stat })

// ── Open Banking ─────────────────────────────────────────────────────────────
export const obStatus      = ()              => http.get('/openbanking/status')
export const obCreateUser  = (data)          => http.post('/openbanking/create-user', data)
export const obAccounts    = (uid)           => http.get(`/openbanking/accounts/${uid}`)
export const obTransactions= (uid)           => http.get(`/openbanking/transactions/${uid}`)

export default http

// ── Stock / Equity Trading ────────────────────────────────────────────────────
export const stocksStatus  = ()            => http.get('/stocks/status')
export const stocksAnalyze = (fd)          => http.post('/stocks/analyze', fd, { headers:{'Content-Type':'multipart/form-data'} })
export const stocksExport  = (fd)          => http.post('/stocks/export',  fd, { headers:{'Content-Type':'multipart/form-data'}, responseType:'blob' })

// ── Open Banking → normalised CSV ────────────────────────────────────────────
export const obFetchNormalise = (body)     => http.post('/openbanking/fetch-and-normalise', body)

export const getDashboardStats = (username) => http.get('/dashboard/stats', { params: { username } })
