import { useState, useCallback, useRef } from 'react'
import './App.css'

const LANGUES = ['Français', 'Anglais', 'Japonais', 'Allemand', 'Espagnol', 'Italien', 'Coréen', 'Chinois']

const CONDITIONS = ['Mint (MT)', 'Near Mint (NM)', 'Excellent (EX)', 'Good (GD)', 'Light Played (LP)', 'Played (PL)', 'Poor (PO)']

const SHOPIFY_HEADERS = [
  'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
  'Published', 'Status', 'SKU',
  'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Inventory Tracker',
  'Inventory quantity', 'Track quantity',
  'Requires shipping', 'Fulfillment service',
  'Product image URL', 'Image position', 'Image alt text',
  'SEO title', 'SEO description',
  'Template suffix',
  'Metafield: custom.etat [single_line_text_field]',
  'Metafield: custom.langue [single_line_text_field]'
]

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function buildRow(card, price, qty, condition, langue, nomFr) {
  const total = card.set?.printedTotal || card.set?.total || '?'
  const displayName = nomFr && nomFr.trim() ? nomFr.trim() : card.name
  const title = `${displayName} - ${card.number}/${total} - ${card.set?.name || ''} - ${condition} - ${langue}`
  const handle = slugify(title)
  const rarity = card.rarity || ''
  const sku = `PKM-${(card.set?.id || 'XX').toUpperCase()}-${card.number}-${condition.replace(/[^A-Z]/g, '')}-${langue.slice(0,2).toUpperCase()}`
  const tags = [card.set?.name, rarity, 'Pokemon TCG', 'Carte Pokemon', langue, 'carte-unitaire'].filter(Boolean).join(', ')
  const description = `<p><strong>${displayName}</strong> - ${card.set?.name || ''}</p><p>Numero : ${card.number}/${total} | Rarete : ${rarity} | Etat : ${condition} | Langue : ${langue}</p>`
  const seoDesc = `Carte Pokemon ${displayName} ${card.number}/${total} - ${card.set?.name || ''} - ${condition} - ${langue}. Achetez vos cartes Pokemon sur Love2Collect.`.slice(0, 320)
  const img = card.images?.small || ''
  const imgAlt = `Carte Pokemon ${card.name} ${card.number} ${card.set?.name || ''}`
  return [
    title, handle, description, 'Love2Collect',
    'Collectible Trading Cards',
    'Carte Pokemon TCG', tags,
    'TRUE', 'active', sku,
    parseFloat(price || 0).toFixed(2), '', '', 'TRUE', 'shopify'
    qty, 'TRUE',
    'TRUE', 'manual',
    img, '1', imgAlt,
    title.slice(0, 70), seoDesc,
    'carte-a-l-unite',
    condition, langue
  ]
}

function CardResult({ card, onAdd }) {
  return (
    <div className="card-result">
      <div className="card-img-wrap">
        {card.images?.small
          ? <img src={card.images.small} alt={card.name} className="card-img" />
          : <span className="card-no-img">Image indisponible</span>}
      </div>
      <div className="card-info">
        <div className="card-name">{card.name}</div>
        <div className="card-sub">{card.set?.name} — {card.number}/{card.set?.printedTotal || card.set?.total || '?'}</div>
        <div className="card-rarity">{card.rarity || '—'}</div>
        <button className="add-btn" onClick={() => onAdd(card)}>+ Ajouter</button>
      </div>
    </div>
  )
}

function BasketItem({ item, onChange, onRemove }) {
  return (
    <div className="bitem">
      {item.card.images?.small
        ? <img src={item.card.images.small} alt={item.card.name} className="bimg" />
        : <div className="bimg" />}
      <div className="bdetails">
        <div className="bname">{item.card.name}</div>
        <div className="bset">{item.card.set?.name} · {item.card.number}</div>
        <div className="fg" style={{marginBottom:'6px',width:'100%'}}>
          <label>Nom FR (optionnel)</label>
          <input type="text" className="binput nomfr" placeholder={item.card.name} value={item.nomFr || ''} onChange={e => onChange(item.id, 'nomFr', e.target.value)} />
        </div>
        <div className="bcontrols">
          <div className="fg">
            <label>État</label>
            <select className="binput cond" value={item.condition} onChange={e => onChange(item.id, 'condition', e.target.value)}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Langue</label>
            <select className="binput cond" value={item.langue || 'Français'} onChange={e => onChange(item.id, 'langue', e.target.value)}>
              {LANGUES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Prix (€)</label>
            <input type="number" className="binput price" min="0" step="0.01" value={item.price} onChange={e => onChange(item.id, 'price', e.target.value)} />
          </div>
          <div className="fg">
            <label>Qté</label>
            <input type="number" className="binput qty" min="1" value={item.qty} onChange={e => onChange(item.id, 'qty', e.target.value)} />
          </div>
        </div>
      </div>
      <button className="rbtn" onClick={() => onRemove(item.id)}>✕</button>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [basket, setBasket] = useState([])
  const [view, setView] = useState('search')
  const [toast, setToast] = useState('')
  const toastRef = useRef(null)
  const debounceRef = useRef(null)

  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 2000)
  }

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      if (!data.data?.length) { setError('Aucune carte trouvée.'); setResults([]); return }
      setResults(data.data)
    } catch {
      setError('Erreur de connexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 600)
  }

  const addToBasket = (card) => {
    setBasket(prev => [...prev, {
      id: `${card.id}-${Date.now()}`,
      card,
      price: '',
      qty: 1,
      condition: 'Near Mint (NM)',
      langue: 'Français',
      nomFr: ''
    }])
    showToast(`${card.name} ajouté !`)
  }

  const updateItem = (id, field, value) => {
    setBasket(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const removeItem = (id) => {
    setBasket(prev => prev.filter(i => i.id !== id))
  }

  const exportCSV = () => {
    const rows = [SHOPIFY_HEADERS, ...basket.map(i => buildRow(i.card, i.price, i.qty, i.condition, i.langue || 'Français', i.nomFr || ''))]
    const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `love2collect-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <div className="header">
        <div className="logo">Love2Collect</div>
        <div className="logo-sub">Gestionnaire de catalogue TCG</div>
      </div>

      <div className="tabs">
        <button className={`tab ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}>🔍 Recherche</button>
        <button className={`tab ${view === 'basket' ? 'active' : ''}`} onClick={() => setView('basket')}>
          🛒 Panier {basket.length > 0 && <span className="badge">{basket.length}</span>}
        </button>
      </div>

      <div className="content">
        {view === 'search' && (
          <>
            <div className="search-wrap">
              <span className="search-icon">⚡</span>
              <input
                className="search-input"
                type="text"
                placeholder="Nom en anglais (ex: Charizard, Pikach...) ou numéro"
                value={query}
                onChange={handleInput}
                autoFocus
              />
            </div>
            <p className="hint">Recherche partielle supportée · "chari" trouve Charizard · Résultats depuis PokémonTCG API</p>
            {loading && <div className="spinner"><div className="spin" /><span>Recherche en cours...</span></div>}
            {!loading && error && <div className="error-msg">{error}</div>}
            {!loading && !error && (
              <div className="grid">
                {results.map(card => <CardResult key={card.id} card={card} onAdd={addToBasket} />)}
              </div>
            )}
          </>
        )}

        {view === 'basket' && (
          <>
            {basket.length === 0
              ? <div className="basket-empty"><div className="basket-empty-icon">🃏</div><div>Ton panier est vide.<br />Recherche des cartes pour les ajouter.</div></div>
              : <>
                <div className="basket-list">
                  {basket.map(item => <BasketItem key={item.id} item={item} onChange={updateItem} onRemove={removeItem} />)}
                </div>
                <div className="export-bar">
                  <div className="exp-info"><strong>{basket.length}</strong> carte{basket.length > 1 ? 's' : ''} prête{basket.length > 1 ? 's' : ''} à exporter</div>
                  <button className="exp-btn" onClick={exportCSV}>↓ Exporter CSV Shopify</button>
                </div>
              </>
            }
          </>
        )}
      </div>

      {toast && <div className="toast show">{toast}</div>}
    </div>
  )
}
