import React, { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'

// Sub-pages
import AccountingDashboard   from './AccountingDashboard.jsx'
import SalesPage             from './SalesPage.jsx'
import PurchasesPage         from './PurchasesPage.jsx'
import ReconciliationWrapper from './ReconciliationWrapper.jsx'
import CashFlowPage          from './CashFlowPage.jsx'
import FinancialReports      from './FinancialReports.jsx'

const TABS = [
  { key:'dashboard',      label:'📊 Dashboard'          },
  { key:'reconciliation', label:'🔀 Reconciliation'      },
  { key:'sales',          label:'💼 Sales'              },
  { key:'purchases',      label:'🧾 Purchases'          },
  { key:'cashflow',       label:'📈 Cash Flow'           },
  { key:'reports',        label:'📋 Financial Reports'   },
]

export default function AccountingPage() {
  const { user } = useAuth()
  const userId   = user?.id
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}>
        <h1>🏦 Accounting</h1>
        <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>
          Dashboard · Reconciliation · Sales · Purchases · Cash Flow · Financial Reports
        </p>
      </div>

      <div className="tabs-bar" style={{marginBottom:0}}>
        {TABS.map(t => (
          <button key={t.key}
            className={`tab-btn${tab===t.key?' active':''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderTop:'none', borderRadius:'0 0 var(--r-lg) var(--r-lg)',
        minHeight:400, overflow:'hidden', boxShadow:'var(--sh-sm)',
      }}>
        {tab === 'dashboard'      && <AccountingDashboard userId={userId}/>}
        {tab === 'reconciliation' && <ReconciliationWrapper userId={userId}/>}
        {tab === 'sales'          && <SalesPage userId={userId}/>}
        {tab === 'purchases'      && <PurchasesPage userId={userId}/>}
        {tab === 'cashflow'       && <CashFlowPage userId={userId}/>}
        {tab === 'reports'        && <FinancialReports userId={userId}/>}
      </div>
    </div>
  )
}
