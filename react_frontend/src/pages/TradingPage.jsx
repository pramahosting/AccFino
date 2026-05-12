import React, { useState } from 'react'
import CryptoTrading from './trading/CryptoTrading.jsx'
import StockTrading  from './trading/StockTrading.jsx'

export default function TradingPage() {
  const [tab, setTab] = useState('crypto')
  return (
    <div className="fade-in">
      <div style={{marginBottom:18}}>
        <h1>📈 Trading Analysis</h1>
        <p style={{color:'var(--text-3)',marginTop:4,fontSize:'.9rem'}}>
          ATO-compliant CGT tax reports for crypto and equity trading
        </p>
      </div>
      <div className="tabs-bar" style={{marginBottom:0}}>
        <button className={`tab-btn${tab==='crypto'?' active':''}`} onClick={()=>setTab('crypto')}>₿ Crypto Trading</button>
        <button className={`tab-btn${tab==='stocks'?' active':''}`} onClick={()=>setTab('stocks')}>📊 Stock / Equity Trading</button>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderTop:'none',borderRadius:'0 0 var(--r-lg) var(--r-lg)',padding:'24px',boxShadow:'var(--sh-sm)'}}>
        {tab==='crypto' && <CryptoTrading/>}
        {tab==='stocks' && <StockTrading/>}
      </div>
    </div>
  )
}
