import { useState, useRef, useEffect, useCallback } from 'react'
import { db } from './firebase'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

const DOC_ID = 'casual-budget-charlottex'

const initialCategories = [
  { id: 'housing',   label: 'Housing',          icon: '🏠', color: '#e07b54', items: [{ name: 'Rent / Mortgage', amount: 0 }] },
  { id: 'transport', label: 'Transportation',    icon: '🚗', color: '#d4a843', items: [{ name: 'Car / Transport', amount: 0 }] },
  { id: 'utilities', label: 'Utilities & Phone', icon: '💡', color: '#5b9bd5', items: [{ name: 'Utilities', amount: 0 }, { name: 'Phone', amount: 0 }] },
  { id: 'groceries', label: 'Groceries & Food',  icon: '🛒', color: '#6ab187', items: [{ name: 'Groceries', amount: 0 }, { name: 'Dining Out', amount: 0 }] },
  { id: 'debt',      label: 'Debt Payments',     icon: '📉', color: '#c0656a', items: [{ name: 'Debt Repayment', amount: 0 }] },
  { id: 'savings',   label: 'Savings',           icon: '🏦', color: '#4ab8c4', items: [{ name: 'Emergency Fund', amount: 0 }] },
  { id: 'spending',  label: 'Spending Money',    icon: '💸', color: '#e8a87c', items: [{ name: 'Personal', amount: 0 }] },
]

const initialDebts = [
  { id: 1, name: 'Debt 1', originalBalance: 0, currentBalance: 0, minPayment: 0, paid: false },
]

function fmt(n) { return (n || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) }

function AutoInput({ value, onCommit, onCancel, style, placeholder }) {
  const [val, setVal] = useState(value)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input ref={ref} value={val} placeholder={placeholder}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(val); if (e.key === 'Escape') onCancel() }}
      style={style} />
  )
}

export default function App() {
  const [categories, setCategories]           = useState(initialCategories)
  const [debts, setDebts]                     = useState(initialDebts)
  const [activeTab, setActiveTab]             = useState('home')
  const [syncStatus, setSyncStatus]           = useState('loading')
  const [payLog, setPayLog]                   = useState([])
  const [newPayAmount, setNewPayAmount]       = useState('')
  const [newPayNote, setNewPayNote]           = useState('')
  const [showPayForm, setShowPayForm]         = useState(false)
  const [checks, setChecks]                   = useState({})
  const [purchases, setPurchases]             = useState([])
  const [newPurchaseName, setNewPurchaseName] = useState('')
  const [newPurchaseAmount, setNewPurchaseAmount] = useState('')
  const [editing, setEditing]                 = useState(null)
  const [hoveredItem, setHoveredItem]         = useState(null)
  const [hoveredCat, setHoveredCat]           = useState(null)
  const [editingDebt, setEditingDebt]         = useState(null)
  const [hoveredDebt, setHoveredDebt]         = useState(null)
  const [payingDown, setPayingDown]           = useState(null)
  const [payAmount, setPayAmount]             = useState('')
  const [celebrating, setCelebrating]         = useState(null)
  const [settings, setSettings]               = useState({ name: 'My Budget', pinnedCats: ['savings', 'debt', 'spending'] })
  const [settingsDraft, setSettingsDraft]     = useState(null)
  const nextDebtId  = useRef(100)
  const saveTimeout = useRef(null)
  const isFirstLoad = useRef(true)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'budgets', DOC_ID), snap => {
      if (snap.exists()) {
        const d = snap.data()
        if (isFirstLoad.current) {
          if (d.categories) setCategories(d.categories)
          if (d.debts) { setDebts(d.debts); nextDebtId.current = Math.max(...d.debts.map(x => x.id), 99) + 1 }
          if (d.payLog)    setPayLog(d.payLog)
          if (d.checks)    setChecks(d.checks)
          if (d.purchases) setPurchases(d.purchases)
          if (d.settings)  setSettings(s => ({ ...s, ...d.settings }))
          isFirstLoad.current = false
        }
        setSyncStatus('synced')
      } else {
        isFirstLoad.current = false
        save(initialCategories, initialDebts, [], {}, [], { name: 'My Budget', pinnedCats: ['savings', 'debt', 'spending'] })
      }
    }, err => { console.error(err); setSyncStatus('error'); isFirstLoad.current = false })
    return () => unsub()
  }, [])

  const save = useCallback((cats, dts, pl, ch, purch, sett) => {
    setSyncStatus('saving')
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'budgets', DOC_ID), { categories: cats, debts: dts, payLog: pl, checks: ch, purchases: purch, settings: sett, updatedAt: new Date().toISOString() })
        setSyncStatus('synced')
      } catch (e) { console.error(e); setSyncStatus('error') }
    }, 800)
  }, [])

  useEffect(() => { if (!isFirstLoad.current) save(categories, debts, payLog, checks, purchases, settings) }, [categories, debts, payLog, checks, purchases, settings, save])

  // ── Monthly pay aggregation ──────────────────────────────────────────────
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`
  function getMonthKey(dateStr) {
    // dateStr from en-AU like "3 May 2026"
    try {
      const d = new Date(dateStr); if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    } catch {}
    return ''
  }
  const thisMonthPays   = payLog.filter(p => getMonthKey(p.date) === currentMonthKey)
  const monthlyTotal    = thisMonthPays.reduce((s, p) => s + p.amount, 0)
  const latestPay       = payLog.length > 0 ? payLog[payLog.length - 1].amount : 0
  const totalPayIn      = payLog.reduce((s, p) => s + p.amount, 0)
  const totalBudgeted   = categories.flatMap(c => c.items).reduce((s, i) => s + i.amount, 0)
  const totalPurchases  = purchases.reduce((s, p) => s + p.amount, 0)
  const checklistItems  = categories.flatMap(cat => cat.items.map((item, idx) => ({ key: `${cat.id}__${idx}`, catLabel: cat.label, icon: cat.icon, color: cat.color, name: item.name, amount: item.amount })))
  const checkedTotal    = checklistItems.filter(i => checks[i.key]).reduce((s, i) => s + i.amount, 0)
  const remaining       = monthlyTotal - checkedTotal - totalPurchases
  const allChecked      = checklistItems.length > 0 && checklistItems.every(i => checks[i.key])
  const checkProgress   = checklistItems.length > 0 ? (checklistItems.filter(i => checks[i.key]).length / checklistItems.length) * 100 : 0
  const activeDebts    = debts.filter(d => !d.paid)
  const paidDebts      = debts.filter(d => d.paid)
  const totalOwed      = activeDebts.reduce((s, d) => s + d.currentBalance, 0)
  const totalOriginal  = debts.reduce((s, d) => s + d.originalBalance, 0)
  const overallDebtProg = totalOriginal > 0 ? ((totalOriginal - totalOwed) / totalOriginal) * 100 : 0
  const syncLabel = { loading: '⏳ Loading...', saving: '💾 Saving...', synced: '☁️ Synced', error: '⚠️ Error' }[syncStatus]
  const syncColor = { loading: '#7a8099', saving: '#d4a843', synced: '#6ab187', error: '#c0656a' }[syncStatus]
  const grouped = checklistItems.reduce((acc, item) => { if (!acc[item.catLabel]) acc[item.catLabel] = { icon: item.icon, color: item.color, items: [] }; acc[item.catLabel].items.push(item); return acc }, {})

  function logPay() {
    const amount = parseFloat(newPayAmount)
    if (isNaN(amount) || amount <= 0) return
    setPayLog(prev => [...prev, { id: Date.now(), amount: Math.round(amount * 100) / 100, date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }), note: newPayNote.trim() }])
    setNewPayAmount(''); setNewPayNote(''); setShowPayForm(false)
  }
  function deletePay(id) { setPayLog(prev => prev.filter(p => p.id !== id)) }
  function toggleCheck(key) { setChecks(prev => ({ ...prev, [key]: !prev[key] })) }
  function addPurchase() {
    const name = newPurchaseName.trim(); const amount = parseFloat(newPurchaseAmount)
    if (!name || isNaN(amount) || amount <= 0) return
    setPurchases(prev => [...prev, { id: Date.now(), name, amount: Math.round(amount * 100) / 100 }])
    setNewPurchaseName(''); setNewPurchaseAmount('')
  }
  function removePurchase(id) { setPurchases(prev => prev.filter(p => p.id !== id)) }

  function updateCat(catId, fn) { setCategories(cats => cats.map(c => c.id === catId ? fn(c) : c)) }
  function commitCatLabel(catId, raw) { const l = raw.trim(); if (l) updateCat(catId, c => ({ ...c, label: l })); setEditing(null) }
  function commitItemName(catId, idx, raw) { const n = raw.trim(); if (n) updateCat(catId, c => ({ ...c, items: c.items.map((it, i) => i === idx ? { ...it, name: n } : it) })); setEditing(null) }
  function commitAmount(catId, idx, raw) { const v = parseFloat(raw); if (!isNaN(v) && v >= 0) updateCat(catId, c => ({ ...c, items: c.items.map((it, i) => i === idx ? { ...it, amount: Math.round(v * 100) / 100 } : it) })); setEditing(null) }
  function addItem(catId) {
    setCategories(cats => {
      const updated = cats.map(c => c.id !== catId ? c : { ...c, items: [...c.items, { name: 'New Item', amount: 0 }] })
      const cat = updated.find(c => c.id === catId)
      setEditing({ type: 'itemName', catId, itemIdx: cat.items.length - 1 })
      return updated
    })
  }
  function deleteItem(catId, idx) { updateCat(catId, c => ({ ...c, items: c.items.filter((_, i) => i !== idx) })) }
  function addCategory() {
    const colors = ['#e07b54','#d4a843','#5b9bd5','#6ab187','#c0656a','#b07fc4','#4ab8c4','#e8a87c']
    const icons  = ['📁','🎯','🌿','🎓','🐾','🏋️','🎮','✈️']
    const id = `custom-${Date.now()}`
    setCategories(cats => [...cats, { id, label: 'New Category', icon: icons[Math.floor(Math.random()*icons.length)], color: colors[Math.floor(Math.random()*colors.length)], items: [{ name: 'New Item', amount: 0 }] }])
    setTimeout(() => setEditing({ type: 'catLabel', catId: id }), 50)
  }
  function deleteCategory(catId) { setCategories(cats => cats.filter(c => c.id !== catId)) }
  function addDebt() { const id = nextDebtId.current++; setDebts(ds => [...ds, { id, name: 'New Debt', originalBalance: 0, currentBalance: 0, minPayment: 0, paid: false }]); setEditingDebt({ id, field: 'name' }) }
  function commitDebtEdit(id, field, raw) {
    const val = field === 'name' ? raw.trim() : parseFloat(raw)
    if (field === 'name' && !val) { setEditingDebt(null); return }
    if (field !== 'name' && isNaN(val)) { setEditingDebt(null); return }
    setDebts(ds => ds.map(d => {
      if (d.id !== id) return d
      if (field === 'originalBalance') return { ...d, originalBalance: val, currentBalance: d.currentBalance === 0 ? val : Math.min(d.currentBalance, val) }
      if (field === 'currentBalance')  return { ...d, currentBalance: Math.min(val, d.originalBalance || val) }
      return { ...d, [field]: val }
    }))
    setEditingDebt(null)
  }
  function applyDebtPayment(id) {
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { setPayingDown(null); return }
    setDebts(ds => ds.map(d => {
      if (d.id !== id) return d
      const newBal = Math.max(0, Math.round((d.currentBalance - amount) * 100) / 100)
      if (newBal === 0) { setCelebrating(id); setTimeout(() => setCelebrating(null), 3000) }
      return { ...d, currentBalance: newBal, paid: newBal === 0 }
    }))
    setPayingDown(null); setPayAmount('')
  }
  function markPaid(id) { setCelebrating(id); setTimeout(() => setCelebrating(null), 3000); setDebts(ds => ds.map(d => d.id !== id ? d : { ...d, currentBalance: 0, paid: true })) }
  function unmarkPaid(id) { setDebts(ds => ds.map(d => d.id !== id ? d : { ...d, paid: false })) }
  function removeDebt(id) { setDebts(ds => ds.filter(d => d.id !== id)) }

  const iB = { background: '#1e2130', border: '1px solid #4a5070', borderRadius: 6, color: '#e8e2d9', fontSize: 13, padding: '3px 8px', outline: 'none', fontFamily: 'inherit' }
  const dIB = { ...iB, border: '1px solid #c0656a88' }

  if (syncStatus === 'loading') return <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', color: '#7a8099', fontSize: 16 }}>⏳ Loading your budget...</div>

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', fontFamily: "'Georgia', serif", color: '#e8e2d9', paddingBottom: 60 }}>

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #1a1d27 0%, #161924 100%)', borderBottom: '1px solid #2a2d3a', padding: '24px 20px 0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#7a8099', textTransform: 'uppercase', marginBottom: 4 }}>Casual Budget</div>
              <div style={{ fontSize: 22, color: '#e8e2d9' }}>{settings.name || 'My Budget'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: syncColor, marginBottom: 2 }}>{syncLabel}</div>
              <div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase' }}>This Month</div>
              <div style={{ fontSize: 24, color: '#6ab187', fontVariantNumeric: 'tabular-nums' }}>{fmt(monthlyTotal)}</div>
              <div style={{ fontSize: 10, color: '#7a8099' }}>{thisMonthPays.length} pay{thisMonthPays.length !== 1 ? 's' : ''} · latest {fmt(latestPay)}</div>
            </div>
          </div>
          {monthlyTotal > 0 && (
            <div style={{ marginTop: 14 }>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7a8099', marginBottom: 5 }}>
                <span>Used: <span style={{ color: '#e8e2d9' }}>{fmt(checkedTotal + totalPurchases)}</span></span>
                <span>Remaining: <span style={{ color: remaining >= 0 ? '#6ab187' : '#c0656a', fontWeight: 'bold' }}>{fmt(Math.abs(remaining))}</span></span>
              </div>
              <div style={{ height: 6, background: '#2a2d3a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, ((checkedTotal + totalPurchases) / monthlyTotal) * 100)}%`, background: remaining >= 0 ? 'linear-gradient(90deg, #6ab18788, #6ab187)' : 'linear-gradient(90deg, #c0656a88, #c0656a)', transition: 'width 0.4s' }} />
              </div>
            </div>
          )}
          {(settings.pinnedCats || []).length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {(settings.pinnedCats || []).map(catId => {
                const cat = categories.find(c => c.id === catId); if (!cat) return null
                return (
                  <div key={catId} style={{ background: '#1a1d27', border: `1px solid ${cat.color}33`, borderRadius: 10, padding: '8px 12px', flex: '1 1 90px' }}>
                    <div style={{ fontSize: 10, color: '#7a8099', marginBottom: 2 }}>{cat.icon} {cat.label}</div>
                    <div style={{ fontSize: 15, color: cat.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.items.reduce((s, i) => s + i.amount, 0))}</div>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', marginTop: 16, overflowX: 'auto' }}>
            {[['home','💰 Pay'],['budget','📋 Budget'],['checklist','✅ Checklist'],['debts','💳 Debts'],['history','📊 Reports'],['settings','⚙️ Settings']].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{ background: 'none', border: 'none', whiteSpace: 'nowrap', borderBottom: activeTab === id ? '2px solid #e8e2d9' : '2px solid transparent', color: activeTab === id ? '#e8e2d9' : '#7a8099', fontSize: 12, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s' }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 0' }}>

        {/* PAY TAB */}
        <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Log Income</div>
            <div style={{ fontSize: 22, color: '#e8e2d9' }}>💰 Pay Received</div>
          </div>
          {!showPayForm ? (
            <button onClick={() => setShowPayForm(true)} style={{ width: '100%', background: '#6ab18722', border: '2px dashed #6ab18766', borderRadius: 14, color: '#6ab187', fontSize: 15, padding: '20px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s', marginBottom: 24 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#6ab18744'; e.currentTarget.style.borderColor = '#6ab187' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#6ab18722'; e.currentTarget.style.borderColor = '#6ab18766' }}>
              + Log a Pay
            </button>
          ) : (
            <div style={{ background: '#161924', border: '1px solid #6ab18744', borderRadius: 14, padding: '20px', marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: '#6ab187', marginBottom: 16 }}>💰 Log New Pay</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: '2 1 160px', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7a8099' }}>$</span>
                  <input autoFocus type="number" min="0" step="0.01" value={newPayAmount} onChange={e => setNewPayAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') logPay() }} placeholder="Amount received" style={{ ...iB, width: '100%', fontSize: 16, padding: '10px 12px 10px 28px', border: '1px solid #6ab18766' }} />
                </div>
                <input value={newPayNote} onChange={e => setNewPayNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') logPay() }} placeholder="Note (e.g. Week 3, Sat shift)" style={{ ...iB, flex: '3 1 180px', fontSize: 13, padding: '10px 12px' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={logPay} style={{ flex: 1, background: '#6ab18722', border: '1px solid #6ab18766', borderRadius: 8, color: '#6ab187', fontSize: 14, padding: '10px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#6ab18744'} onMouseLeave={e => e.currentTarget.style.background = '#6ab18722'}>✓ Log Pay & Reset Checklist</button>
                <button onClick={() => { setShowPayForm(false); setNewPayAmount(''); setNewPayNote('') }} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 8, color: '#7a8099', fontSize: 14, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          )}
          {monthlyTotal > 0 && (
            <div style={{ background: '#161924', borderRadius: 14, border: '1px solid #2a2d3a', padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#7a8099', marginBottom: 14 }}>This month's summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[{ label: 'Total This Month', val: monthlyTotal, color: '#6ab187' }, { label: 'Budgeted', val: totalBudgeted, color: '#4ab8c4' }, { label: 'Allocated', val: checkedTotal, color: '#b07fc4' }, { label: 'Purchases', val: totalPurchases, color: '#e8a87c' }, { label: 'Remaining', val: remaining, color: remaining >= 0 ? '#6ab187' : '#c0656a' }].map(s => (
                  <div key={s.label} style={{ background: '#1a1d27', borderRadius: 10, padding: '10px 14px', border: `1px solid ${s.color}22` }}>
                    <div style={{ fontSize: 10, color: '#7a8099', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 15, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.val)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#7a8099', marginBottom: 8 }}>Pays this month ({thisMonthPays.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...thisMonthPays].reverse().map((p, idx) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1d27', borderRadius: 8, padding: '8px 14px' }}>
                    <div style={{ fontSize: 13, color: '#b0b8cc' }}>{p.date}{p.note ? ` · ${p.note}` : ''}</div>
                    <div style={{ fontSize: 13, color: '#6ab187', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {monthlyTotal === 0 && !showPayForm && (
            <div style={{ background: '#161924', borderRadius: 14, border: '1px dashed #2a2d3a', padding: '32px 20px', textAlign: 'center', color: '#7a8099' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>💰</div>
              <div style={{ fontSize: 15, marginBottom: 6 }}>No pay logged yet</div>
              <div style={{ fontSize: 13 }}>Hit "+ Log a Pay" when your pay hits!</div>
            </div>
          )}
        </div>

        {/* BUDGET TAB */}
        <div style={{ display: activeTab === 'budget' ? 'block' : 'none' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Monthly Expenses</div>
            <div style={{ fontSize: 22, color: '#e8e2d9' }}>📋 Budget</div>
          </div>
          {monthlyTotal > 0 && (
            <div style={{ background: totalBudgeted <= monthlyTotal ? '#6ab18722' : '#c0656a22', border: `1px solid ${totalBudgeted <= monthlyTotal ? '#6ab18766' : '#c0656a66'}`, borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: totalBudgeted <= monthlyTotal ? '#6ab187' : '#c0656a' }}>{totalBudgeted <= monthlyTotal ? `✅ Budget fits this month — ${fmt(monthlyTotal - totalBudgeted)} left over` : `⚠️ Budget exceeds monthly income by ${fmt(totalBudgeted - monthlyTotal)}`}</span>
              <span style={{ fontSize: 14, color: '#e8e2d9', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalBudgeted)}</span>
            </div>
          )}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {categories.map(cat => {
              const catTotal = cat.items.reduce((s, i) => s + i.amount, 0)
              const isEL = editing?.type === 'catLabel' && editing.catId === cat.id
              return (
                <div key={cat.id} onMouseEnter={() => setHoveredCat(cat.id)} onMouseLeave={() => setHoveredCat(null)} style={{ background: '#161924', border: `1px solid ${cat.color}33`, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ background: `${cat.color}18`, borderBottom: `1px solid ${cat.color}33`, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 15 }}>{cat.icon}</span>
                      {isEL ? <AutoInput value={cat.label} onCommit={v => commitCatLabel(cat.id, v)} onCancel={() => setEditing(null)} style={{ ...iB, fontSize: 14, flex: 1, border: `1px solid ${cat.color}88` }} />
                        : <div onClick={() => setEditing({ type: 'catLabel', catId: cat.id })} style={{ fontSize: 14, color: cat.color, cursor: 'pointer', borderBottom: '1px dashed transparent', transition: 'border-color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            onMouseEnter={e => e.currentTarget.style.borderBottomColor = cat.color + '88'} onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}>
                            {cat.label} <span style={{ fontSize: 9, opacity: 0.4, fontStyle: 'italic' }}>✎</span></div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ fontSize: 14, color: cat.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(catTotal)}</div>
                      {hoveredCat === cat.id && <button onClick={() => deleteCategory(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0656a66', fontSize: 13, padding: '2px 4px', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#c0656a'} onMouseLeave={e => e.currentTarget.style.color = '#c0656a66'}>✕</button>}
                    </div>
                  </div>
                  <div style={{ padding: '6px 0' }}>
                    {cat.items.map((item, idx) => {
                      const isEA = editing?.type === 'amount' && editing.catId === cat.id && editing.itemIdx === idx
                      const isEN = editing?.type === 'itemName' && editing.catId === cat.id && editing.itemIdx === idx
                      const isH  = hoveredItem?.catId === cat.id && hoveredItem?.itemIdx === idx
                      return (
                        <div key={idx} onMouseEnter={() => setHoveredItem({ catId: cat.id, itemIdx: idx })} onMouseLeave={() => setHoveredItem(null)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px 7px 16px', borderBottom: idx < cat.items.length - 1 ? '1px solid #1e2130' : 'none', gap: 8, background: isH ? '#1e2130' : 'transparent', transition: 'background 0.1s' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEN ? <AutoInput value={item.name} placeholder="Item name" onCommit={v => commitItemName(cat.id, idx, v)} onCancel={() => setEditing(null)} style={{ ...iB, width: '100%', border: `1px solid ${cat.color}66` }} />
                              : <div onClick={() => setEditing({ type: 'itemName', catId: cat.id, itemIdx: idx })} style={{ fontSize: 13, color: '#b0b8cc', cursor: 'pointer', borderBottom: '1px dashed transparent', transition: 'border-color 0.15s, color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onMouseEnter={e => { e.currentTarget.style.borderBottomColor = '#b0b8cc55'; e.currentTarget.style.color = '#d0d8e8' }} onMouseLeave={e => { e.currentTarget.style.borderBottomColor = 'transparent'; e.currentTarget.style.color = '#b0b8cc' }}>{item.name}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {isEA ? <AutoInput value={String(item.amount)} onCommit={v => commitAmount(cat.id, idx, v)} onCancel={() => setEditing(null)} style={{ ...iB, width: 88, textAlign: 'right', border: `1px solid ${cat.color}88` }} />
                              : <div onClick={() => setEditing({ type: 'amount', catId: cat.id, itemIdx: idx })} style={{ fontSize: 13, color: '#e8e2d9', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, border: '1px solid transparent', transition: 'border 0.15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = cat.color + '66'} onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>{fmt(item.amount)}</div>}
                            <button onClick={() => deleteItem(cat.id, idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isH ? '#c0656a99' : 'transparent', fontSize: 12, padding: '2px 5px', lineHeight: 1, transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#c0656a'} onMouseLeave={e => e.currentTarget.style.color = isH ? '#c0656a99' : 'transparent'}>✕</button>
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ padding: '7px 16px 5px' }}>
                      <button onClick={() => addItem(cat.id)} style={{ background: 'none', border: `1px dashed ${cat.color}44`, borderRadius: 6, color: cat.color + '88', fontSize: 12, padding: '5px 12px', cursor: 'pointer', width: '100%', transition: 'border-color 0.15s, color 0.15s', fontFamily: 'inherit' }} onMouseEnter={e => { e.currentTarget.style.borderColor = cat.color + 'cc'; e.currentTarget.style.color = cat.color }} onMouseLeave={e => { e.currentTarget.style.borderColor = cat.color + '44'; e.currentTarget.style.color = cat.color + '88' }}>+ Add item</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={addCategory} style={{ marginTop: 14, background: 'none', border: '1px dashed #4a5070', borderRadius: 12, color: '#7a8099', fontSize: 13, padding: '14px', cursor: 'pointer', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#8a90a8'; e.currentTarget.style.color = '#b0b8cc' }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#4a5070'; e.currentTarget.style.color = '#7a8099' }}>+ Add Category</button>
          <div style={{ marginTop: 18, padding: '14px 18px', background: '#161924', borderRadius: 12, border: '1px solid #2a2d3a', fontSize: 12, color: '#7a8099', lineHeight: 1.8 }}>
            <div>• Click any <span style={{ color: '#e8e2d9' }}>label</span> or <span style={{ color: '#e8e2d9' }}>amount</span> to edit it.</div>
            <div>• These dollar amounts are used in the ✅ Checklist tab.</div>
            <div>• All changes save automatically ☁️</div>
          </div>
        </div>

        {/* CHECKLIST TAB */}
        <div style={{ display: activeTab === 'checklist' ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>This Pay Period</div>
              <div style={{ fontSize: 22, color: '#e8e2d9' }}>✅ Checklist</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#7a8099', marginBottom: 2 }}>Remaining This Month</div>
              <div style={{ fontSize: 22, color: remaining >= 0 ? '#6ab187' : '#c0656a', fontVariantNumeric: 'tabular-nums' }}>{fmt(remaining)}</div>
            </div>
          </div>
          {monthlyTotal === 0 ? (
            <div style={{ background: '#161924', borderRadius: 14, border: '1px dashed #2a2d3a', padding: '32px 20px', textAlign: 'center', color: '#7a8099' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>💰</div>
              <div>Log a pay first to start ticking off!</div>
              <button onClick={() => setActiveTab('home')} style={{ marginTop: 14, background: '#6ab18722', border: '1px solid #6ab18766', borderRadius: 8, color: '#6ab187', fontSize: 13, padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit' }}>Go to Pay tab</button>
            </div>
          ) : (
            <>
              <div style={{ background: '#161924', borderRadius: 12, padding: '14px 18px', marginBottom: 18, border: '1px solid #2a2d3a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7a8099', marginBottom: 6 }}>
                  <span style={{ color: allChecked ? '#6ab187' : '#e8e2d9' }}>{allChecked ? '🎉 All done!' : `${checklistItems.filter(i => checks[i.key]).length} of ${checklistItems.length} ticked`}</span>
                  <span>{fmt(checkedTotal)} allocated</span>
                </div>
                <div style={{ height: 8, background: '#2a2d3a', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${checkProgress}%`, background: allChecked ? 'linear-gradient(90deg, #6ab18788, #6ab187)' : 'linear-gradient(90deg, #4ab8c488, #4ab8c4)', transition: 'width 0.4s' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(grouped).map(([catLabel, group]) => {
                  const groupTotal = group.items.reduce((s, i) => s + i.amount, 0)
                  const groupDone  = group.items.every(i => checks[i.key])
                  return (
                    <div key={catLabel} style={{ background: '#161924', border: `1px solid ${group.color}33`, borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ background: `${group.color}18`, borderBottom: `1px solid ${group.color}33`, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, color: groupDone ? '#6ab187' : group.color }}>{group.icon} {catLabel} {groupDone && '✓'}</span>
                        <span style={{ fontSize: 13, color: groupDone ? '#6ab187' : group.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(groupTotal)}</span>
                      </div>
                      {group.items.map(item => {
                        const checked = !!checks[item.key]
                        return (
                          <div key={item.key} onClick={() => toggleCheck(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e2130', cursor: 'pointer', background: checked ? '#1a2a1a' : 'transparent', transition: 'background 0.2s' }} onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#1e2130' }} onMouseLeave={e => { e.currentTarget.style.background = checked ? '#1a2a1a' : 'transparent' }}>
                            <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: checked ? '2px solid #6ab187' : '2px solid #3a4060', background: checked ? '#6ab187' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                              {checked && <span style={{ color: '#0f1117', fontSize: 13, fontWeight: 'bold' }}>✓</span>}
                            </div>
                            <div style={{ flex: 1, fontSize: 13, color: checked ? '#5a7a5a' : '#b0b8cc', textDecoration: checked ? 'line-through' : 'none' }}>{item.name}</div>
                            <div style={{ fontSize: 14, color: checked ? '#5a7a5a' : '#e8e2d9', textDecoration: checked ? 'line-through' : 'none', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.amount)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>🛍️ Purchases This Pay</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <input value={newPurchaseName} onChange={e => setNewPurchaseName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPurchase() }} placeholder="What did you buy?" style={{ flex: '2 1 160px', background: '#1e2130', border: '1px solid #3a4060', borderRadius: 8, color: '#e8e2d9', fontSize: 13, padding: '8px 12px', outline: 'none', fontFamily: 'inherit' }} />
                  <input value={newPurchaseAmount} onChange={e => setNewPurchaseAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPurchase() }} placeholder="$0.00" type="number" min="0" step="0.01" style={{ flex: '1 1 80px', background: '#1e2130', border: '1px solid #3a4060', borderRadius: 8, color: '#e8e2d9', fontSize: 13, padding: '8px 12px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }} />
                  <button onClick={addPurchase} style={{ background: '#e8a87c22', border: '1px solid #e8a87c66', borderRadius: 8, color: '#e8a87c', fontSize: 13, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#e8a87c44'} onMouseLeave={e => e.currentTarget.style.background = '#e8a87c22'}>+ Add</button>
                </div>
                {purchases.length > 0 && (
                  <div style={{ background: '#161924', borderRadius: 12, border: '1px solid #e8a87c22', overflow: 'hidden', marginBottom: 4 }}>
                    {purchases.map((p, idx) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: idx < purchases.length - 1 ? '1px solid #1e2130' : 'none', gap: 8 }}>
                        <div style={{ fontSize: 13, color: '#b0b8cc', flex: 1 }}>{p.name}</div>
                        <div style={{ fontSize: 13, color: '#e8a87c', fontVariantNumeric: 'tabular-nums' }}>−{fmt(p.amount)}</div>
                        <button onClick={() => removePurchase(p.id)} style={{ background: 'none', border: 'none', color: '#c0656a66', fontSize: 12, cursor: 'pointer', padding: '2px 6px', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#c0656a'} onMouseLeave={e => e.currentTarget.style.color = '#c0656a66'}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', background: '#1a1820', borderTop: '1px solid #e8a87c22' }}>
                      <div style={{ fontSize: 12, color: '#7a8099' }}>Total spent</div>
                      <div style={{ fontSize: 14, color: '#e8a87c', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>−{fmt(totalPurchases)}</div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 16, background: '#161924', borderRadius: 14, border: `1px solid ${remaining >= 0 ? '#6ab18733' : '#c0656a33'}`, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', marginBottom: 3 }}>{remaining >= 0 ? '💰 Remaining this pay' : '⚠️ Over this pay'}</div>
                    <div style={{ fontSize: 12, color: '#7a8099' }}>{fmt(monthlyTotal)} income − {fmt(checkedTotal)} allocated − {fmt(totalPurchases)} purchases</div>
                  </div>
                  <div style={{ fontSize: 24, color: remaining >= 0 ? '#6ab187' : '#c0656a', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{fmt(Math.abs(remaining))}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button onClick={() => { setChecks({}); setPurchases([]) }} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 8, color: '#7a8099', fontSize: 12, padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a5070'; e.currentTarget.style.color = '#b0b8cc' }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2d3a'; e.currentTarget.style.color = '#7a8099' }}>↺ Reset monthly checklist & purchases</button>
              </div>
            </>
          )}
        </div>

        {/* DEBTS TAB */}
        <div style={{ display: activeTab === 'debts' ? 'block' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <div><div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Track & Pay Down</div><div style={{ fontSize: 22, color: '#e8e2d9' }}>💳 Your Debts</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#7a8099', marginBottom: 2 }}>Total Remaining</div><div style={{ fontSize: 22, color: '#c0656a', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalOwed)}</div></div>
          </div>
          {totalOriginal > 0 && (
            <div style={{ background: '#161924', borderRadius: 12, padding: '14px 18px', marginBottom: 18, border: '1px solid #2a2d3a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7a8099', marginBottom: 6 }}><span>Overall — <span style={{ color: '#e8e2d9' }}>{overallDebtProg.toFixed(1)}% paid off</span></span><span>{fmt(totalOriginal - totalOwed)} cleared</span></div>
              <div style={{ height: 8, background: '#2a2d3a', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 4, width: `${overallDebtProg}%`, background: 'linear-gradient(90deg, #c0656a88, #e07b54)', transition: 'width 0.5s' }} /></div>
              {paidDebts.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#6ab187' }}>🎉 {paidDebts.length} debt{paidDebts.length > 1 ? 's' : ''} paid off!</div>}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeDebts.map(debt => {
              const progress = debt.originalBalance > 0 ? ((debt.originalBalance - debt.currentBalance) / debt.originalBalance) * 100 : 0
              const pC = progress >= 75 ? '#6ab187' : progress >= 40 ? '#d4a843' : '#c0656a'
              const isH = hoveredDebt === debt.id; const isP = payingDown === debt.id; const isC = celebrating === debt.id
              return (
                <div key={debt.id} onMouseEnter={() => setHoveredDebt(debt.id)} onMouseLeave={() => setHoveredDebt(null)} style={{ background: isC ? '#6ab18715' : '#161924', border: `1px solid ${isC ? '#6ab18766' : '#c0656a33'}`, borderRadius: 14, padding: '18px 20px', transition: 'background 0.4s' }}>
                  {isC && <div style={{ textAlign: 'center', fontSize: 20, marginBottom: 12 }}>🎉 Debt Paid Off! 🎉</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      {editingDebt?.id === debt.id && editingDebt.field === 'name' ? <AutoInput value={debt.name} onCommit={v => commitDebtEdit(debt.id, 'name', v)} onCancel={() => setEditingDebt(null)} style={{ ...dIB, fontSize: 15, width: '100%' }} />
                        : <div onClick={() => setEditingDebt({ id: debt.id, field: 'name' })} style={{ fontSize: 15, color: '#e8e2d9', cursor: 'pointer', display: 'inline-block', borderBottom: '1px dashed transparent', transition: 'border-color 0.15s' }} onMouseEnter={e => e.currentTarget.style.borderBottomColor = '#e8e2d944'} onMouseLeave={e => e.currentTarget.style.borderBottomColor = 'transparent'}>{debt.name} <span style={{ fontSize: 9, opacity: 0.4 }}>✎</span></div>}
                      <div style={{ fontSize: 11, color: '#7a8099', marginTop: 4 }}>Min: {editingDebt?.id === debt.id && editingDebt.field === 'minPayment' ? <AutoInput value={String(debt.minPayment)} onCommit={v => commitDebtEdit(debt.id, 'minPayment', v)} onCancel={() => setEditingDebt(null)} style={{ ...dIB, fontSize: 11, width: 72, display: 'inline-block' }} /> : <span onClick={() => setEditingDebt({ id: debt.id, field: 'minPayment' })} style={{ color: '#b0b8cc', cursor: 'pointer', borderBottom: '1px dashed #b0b8cc44' }}>{fmt(debt.minPayment)}/mo</span>}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: '#7a8099', marginBottom: 3, textTransform: 'uppercase' }}>Original</div>{editingDebt?.id === debt.id && editingDebt.field === 'originalBalance' ? <AutoInput value={String(debt.originalBalance)} onCommit={v => commitDebtEdit(debt.id, 'originalBalance', v)} onCancel={() => setEditingDebt(null)} style={{ ...dIB, width: 90, textAlign: 'center' }} /> : <div onClick={() => setEditingDebt({ id: debt.id, field: 'originalBalance' })} style={{ fontSize: 13, color: '#7a8099', cursor: 'pointer', fontVariantNumeric: 'tabular-nums', borderBottom: '1px dashed #7a809944' }}>{fmt(debt.originalBalance)}</div>}</div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: '#7a8099', marginBottom: 3, textTransform: 'uppercase' }}>Remaining</div>{editingDebt?.id === debt.id && editingDebt.field === 'currentBalance' ? <AutoInput value={String(debt.currentBalance)} onCommit={v => commitDebtEdit(debt.id, 'currentBalance', v)} onCancel={() => setEditingDebt(null)} style={{ ...dIB, width: 90, textAlign: 'center' }} /> : <div onClick={() => setEditingDebt({ id: debt.id, field: 'currentBalance' })} style={{ fontSize: 16, color: '#c0656a', cursor: 'pointer', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold', borderBottom: '1px dashed #c0656a44' }}>{fmt(debt.currentBalance)}</div>}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7a8099', marginBottom: 4 }}><span style={{ color: progress > 0 ? pC : '#7a8099' }}>{progress.toFixed(1)}% paid off</span><span>{fmt(debt.originalBalance - debt.currentBalance)} cleared</span></div>
                    <div style={{ height: 8, background: '#2a2d3a', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 4, width: `${progress}%`, background: `linear-gradient(90deg, ${pC}88, ${pC})`, transition: 'width 0.5s' }} /></div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {isP ? (<><span style={{ fontSize: 12, color: '#7a8099' }}>Payment: $</span><input autoFocus value={payAmount} onChange={e => setPayAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyDebtPayment(debt.id); if (e.key === 'Escape') setPayingDown(null) }} placeholder="0.00" style={{ ...dIB, width: 90, textAlign: 'right' }} /><button onClick={() => applyDebtPayment(debt.id)} style={{ background: '#6ab18722', border: '1px solid #6ab18766', borderRadius: 6, color: '#6ab187', fontSize: 12, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Apply ✓</button><button onClick={() => setPayingDown(null)} style={{ background: 'none', border: 'none', color: '#7a8099', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button></>)
                      : (<><button onClick={() => { setPayingDown(debt.id); setPayAmount('') }} style={{ background: '#c0656a22', border: '1px solid #c0656a55', borderRadius: 6, color: '#e8a0a4', fontSize: 12, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#c0656a44'} onMouseLeave={e => e.currentTarget.style.background = '#c0656a22'}>💸 Make a Payment</button><button onClick={() => markPaid(debt.id)} style={{ background: '#6ab18722', border: '1px solid #6ab18755', borderRadius: 6, color: '#6ab187', fontSize: 12, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#6ab18744'} onMouseLeave={e => e.currentTarget.style.background = '#6ab18722'}>✓ Mark as Paid Off</button>{isH && <button onClick={() => removeDebt(debt.id)} style={{ background: 'none', border: 'none', color: '#c0656a55', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#c0656a'} onMouseLeave={e => e.currentTarget.style.color = '#c0656a55'}>Remove</button>}</>)}
                  </div>
                </div>
              )
            })}
            <button onClick={addDebt} style={{ background: 'none', border: '1px dashed #c0656a44', borderRadius: 12, color: '#c0656a88', fontSize: 13, padding: '14px', cursor: 'pointer', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#c0656acc'; e.currentTarget.style.color = '#c0656a' }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#c0656a44'; e.currentTarget.style.color = '#c0656a88' }}>+ Add a Debt</button>
          </div>
          {paidDebts.length > 0 && (<div style={{ marginTop: 24 }}><div style={{ fontSize: 12, color: '#6ab187', textTransform: 'uppercase', marginBottom: 10 }}>🏆 Paid Off</div>{paidDebts.map(debt => (<div key={debt.id} style={{ background: '#161924', border: '1px solid #6ab18733', borderRadius: 10, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span>✅</span><div><div style={{ fontSize: 14, color: '#7a8099', textDecoration: 'line-through' }}>{debt.name}</div><div style={{ fontSize: 11, color: '#6ab187' }}>{fmt(debt.originalBalance)} — fully cleared!</div></div></div><button onClick={() => unmarkPaid(debt.id)} style={{ background: 'none', border: 'none', color: '#7a809966', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }} onMouseEnter={e => e.currentTarget.style.color = '#b0b8cc'} onMouseLeave={e => e.currentTarget.style.color = '#7a809966'}>undo</button></div>))}</div>)}
        </div>

        {/* HISTORY TAB */}
        <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
          <div style={{ marginBottom: 20 }}><div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Overview & History</div><div style={{ fontSize: 22, color: '#e8e2d9' }}>📊 Reports</div></div>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
            {[{ label: 'This Month', val: monthlyTotal, color: '#6ab187' }, { label: 'Total Earned', val: totalPayIn, color: '#4ab8c4' }, { label: 'Avg Pay', val: payLog.length > 0 ? totalPayIn / payLog.length : 0, color: '#b07fc4' }, { label: 'Total Debt', val: totalOwed, color: '#c0656a' }, { label: 'Pays This Month', val: thisMonthPays.length, color: '#d4a843', isCnt: true }, { label: 'Debt Cleared', val: totalOriginal - totalOwed, color: '#6ab187' }].map(s => (<div key={s.label} style={{ background: '#161924', border: `1px solid ${s.color}33`, borderRadius: 12, padding: '12px 16px' }}><div style={{ fontSize: 10, color: '#7a8099', marginBottom: 4 }}>{s.label}</div><div style={{ fontSize: 18, color: s.color, fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{s.isCnt ? s.val : fmt(s.val)}</div></div>))}
          </div>

          {/* Debt progress */}
          {debts.length > 0 && (
            <div style={{ background: '#161924', borderRadius: 14, border: '1px solid #c0656a33', padding: '18px 20px', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: '#c0656a', marginBottom: 16 }}>💳 Debt Paydown Progress</div>
              {totalOriginal > 0 && (
                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #2a2d3a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7a8099', marginBottom: 6 }}>
                    <span>Overall — <span style={{ color: '#e8e2d9' }}>{overallDebtProg.toFixed(1)}% paid off</span></span>
                    <span>{fmt(totalOriginal - totalOwed)} of {fmt(totalOriginal)} cleared</span>
                  </div>
                  <div style={{ height: 10, background: '#2a2d3a', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 5, width: `${overallDebtProg}%`, background: 'linear-gradient(90deg, #c0656a88, #e07b54)', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )}
              {debts.map(debt => {
                const progress = debt.originalBalance > 0 ? ((debt.originalBalance - debt.currentBalance) / debt.originalBalance) * 100 : 100
                const pC = progress >= 75 ? '#6ab187' : progress >= 40 ? '#d4a843' : '#c0656a'
                return (
                  <div key={debt.id} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span style={{ color: debt.paid ? '#6ab187' : '#e8e2d9' }}>{debt.paid ? '✅ ' : ''}{debt.name}</span>
                      <span style={{ color: '#7a8099', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmt(debt.currentBalance)} left of {fmt(debt.originalBalance)}</span>
                    </div>
                    <div style={{ height: 8, background: '#2a2d3a', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${progress}%`, background: `linear-gradient(90deg, ${pC}88, ${pC})`, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: pC, marginTop: 3 }}>{progress.toFixed(1)}% paid off — {fmt(debt.originalBalance - debt.currentBalance)} cleared</div>
                  </div>
                )
              })}
            </div>
          )}
          {payLog.length === 0 ? (<div style={{ background: '#161924', borderRadius: 14, border: '1px dashed #2a2d3a', padding: '32px 20px', textAlign: 'center', color: '#7a8099' }}><div style={{ fontSize: 24, marginBottom: 10 }}>📅</div><div>No pays logged yet!</div></div>)
            : (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[...payLog].reverse().map((p, idx) => (<div key={p.id} style={{ background: '#161924', border: '1px solid #2a2d3a', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><div><div style={{ fontSize: 15, color: '#e8e2d9', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</div><div style={{ fontSize: 11, color: '#7a8099', marginTop: 2 }}>{p.date}{p.note ? ` · ${p.note}` : ''}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{idx === 0 && <span style={{ fontSize: 11, background: '#6ab18722', border: '1px solid #6ab18744', borderRadius: 6, padding: '2px 8px', color: '#6ab187' }}>Latest</span>}<button onClick={() => deletePay(p.id)} style={{ background: 'none', border: 'none', color: '#c0656a44', fontSize: 13, cursor: 'pointer', padding: '2px 6px', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#c0656a'} onMouseLeave={e => e.currentTarget.style.color = '#c0656a44'}>✕</button></div></div>))}</div>)}
        </div>

        {/* SETTINGS TAB */}
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <div style={{ marginBottom: 24 }}><div style={{ fontSize: 11, color: '#7a8099', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Configuration</div><div style={{ fontSize: 22, color: '#e8e2d9' }}>⚙️ Settings</div></div>
          {(() => {
            const draft = settingsDraft || settings
            const sI = { background: '#1e2130', border: '1px solid #3a4060', borderRadius: 8, color: '#e8e2d9', fontSize: 14, padding: '10px 14px', outline: 'none', fontFamily: 'inherit', width: '100%' }
            const sL = { fontSize: 12, color: '#7a8099', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#161924', borderRadius: 14, border: '1px solid #2a2d3a', padding: '22px 24px' }}>
                  <div style={{ fontSize: 14, color: '#b0b8cc', marginBottom: 14 }}>📋 Budget Name</div>
                  <label style={sL}>Name</label>
                  <input value={draft.name} onChange={e => setSettingsDraft(d => ({ ...(d || settings), name: e.target.value }))} onFocus={() => { if (!settingsDraft) setSettingsDraft({ ...settings }) }} placeholder="e.g. My Casual Budget" style={sI} />
                </div>
                <div style={{ background: '#161924', borderRadius: 14, border: '1px solid #d4a84333', padding: '22px 24px' }}>
                  <div style={{ fontSize: 14, color: '#d4a843', marginBottom: 6 }}>📌 Header Cards</div>
                  <div style={{ fontSize: 12, color: '#7a8099', marginBottom: 14 }}>Choose up to 4 categories to show at the top.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {categories.map(cat => {
                      const pinned = (draft.pinnedCats || []).includes(cat.id)
                      const atMax = (draft.pinnedCats || []).length >= 4
                      return (
                        <div key={cat.id} onClick={() => { if (!settingsDraft) setSettingsDraft({ ...settings }); setSettingsDraft(d => { const base = { ...(d || settings) }; const curr = base.pinnedCats || []; const next = pinned ? curr.filter(id => id !== cat.id) : curr.length >= 4 ? curr : [...curr, cat.id]; return { ...base, pinnedCats: next } }) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: pinned ? `${cat.color}15` : '#1a1d27', border: pinned ? `1px solid ${cat.color}55` : '1px solid #2a2d3a', transition: 'all 0.15s', opacity: (!pinned && (draft.pinnedCats || []).length >= 4) ? 0.4 : 1 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: pinned ? `2px solid ${cat.color}` : '2px solid #3a4060', background: pinned ? cat.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>{pinned && <span style={{ color: '#0f1117', fontSize: 12, fontWeight: 'bold' }}>✓</span>}</div>
                          <span>{cat.icon}</span>
                          <div style={{ flex: 1, fontSize: 13, color: pinned ? cat.color : '#b0b8cc' }}>{cat.label}</div>
                          <div style={{ fontSize: 13, color: pinned ? cat.color : '#7a8099', fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.items.reduce((s, i) => s + i.amount, 0))}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {settingsDraft !== null && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => { setSettings(settingsDraft); setSettingsDraft(null) }} style={{ flex: 1, background: '#6ab18722', border: '1px solid #6ab18766', borderRadius: 10, color: '#6ab187', fontSize: 14, padding: '12px', cursor: 'pointer', fontFamily: 'inherit' }} onMouseEnter={e => e.currentTarget.style.background = '#6ab18744'} onMouseLeave={e => e.currentTarget.style.background = '#6ab18722'}>✓ Save Settings</button>
                    <button onClick={() => setSettingsDraft(null)} style={{ background: 'none', border: '1px solid #2a2d3a', borderRadius: 10, color: '#7a8099', fontSize: 14, padding: '12px 20px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  )
}
