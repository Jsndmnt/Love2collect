import { useState, useRef } from 'react'
import './PhotoTool.css'

// Largeur/hauteur maximale du plus grand côté, en pixels.
const MAX_SIDE = 1400
// Qualité JPEG, entre 0 et 1. 0.82 est un bon compromis poids/rendu.
const QUALITE = 0.82

function formatKo(octets) {
  return `${Math.round(octets / 1024)} Ko`
}

// Redresse la photo selon sa balise EXIF, la redimensionne et la recompresse.
// Le canvas écrit une image sans métadonnées : l'étiquette d'orientation
// disparaît et les pixels sont physiquement dans le bon sens.
async function traiter(file) {
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Repli pour les navigateurs qui ne gèrent pas l'option.
    source = await new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = rej
      img.src = URL.createObjectURL(file)
    })
  }

  const w = source.width
  const h = source.height
  const ratio = Math.min(1, MAX_SIDE / Math.max(w, h))
  const cw = Math.round(w * ratio)
  const ch = Math.round(h * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, cw, ch)

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITE))
  return { blob, url: URL.createObjectURL(blob), largeur: cw, hauteur: ch }
}

export default function PhotoTool({ skus = [] }) {
  const [photos, setPhotos] = useState([])
  const [enCours, setEnCours] = useState(false)
  const inputRef = useRef(null)

  const ajouter = async (fichiers) => {
    const liste = Array.from(fichiers).filter(f => f.type.startsWith('image/'))
    if (!liste.length) return
    setEnCours(true)
    const traitees = []
    for (const f of liste) {
      try {
        const r = await traiter(f)
        traitees.push({
          id: `${f.name}-${Date.now()}-${Math.random()}`,
          nomOrigine: f.name,
          tailleAvant: f.size,
          tailleApres: r.blob.size,
          largeur: r.largeur,
          hauteur: r.hauteur,
          blob: r.blob,
          url: r.url,
          sku: '',
          face: '1'
        })
      } catch {
        // Fichier illisible : on l'ignore silencieusement.
      }
    }
    setPhotos(prev => [...prev, ...traitees])
    setEnCours(false)
  }

  const maj = (id, champ, valeur) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, [champ]: valeur } : p))
  }

  const supprimer = (id) => {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }

  const nomFinal = (p) => p.sku ? `${p.sku}-${p.face}.jpg` : ''

  const telecharger = (p) => {
    const nom = nomFinal(p)
    if (!nom) return
    const a = document.createElement('a')
    a.href = p.url
    a.download = nom
    a.click()
  }

  const toutTelecharger = async () => {
    const pretes = photos.filter(p => p.sku)
    for (const p of pretes) {
      telecharger(p)
      // Petite pause, sinon le navigateur bloque les téléchargements en rafale.
      await new Promise(r => setTimeout(r, 400))
    }
  }

  const pretes = photos.filter(p => p.sku).length
  const gainTotal = photos.reduce((acc, p) => acc + (p.tailleAvant - p.tailleApres), 0)

  return (
    <div className="phototool">
      <div
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); ajouter(e.dataTransfer.files) }}
      >
        <div className="dz-icon">📷</div>
        <div className="dz-text">
          Dépose tes photos ici, ou clique pour les choisir
        </div>
        <div className="dz-sub">
          Redressement automatique · {MAX_SIDE} px max · JPEG qualité {Math.round(QUALITE * 100)}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { ajouter(e.target.files); e.target.value = '' }}
        />
      </div>

      {enCours && <div className="spinner"><div className="spin" /><span>Traitement en cours...</span></div>}

      {photos.length > 0 && (
        <>
          <div className="photo-list">
            {photos.map(p => (
              <div className="photo-item" key={p.id}>
                <img src={p.url} alt={p.nomOrigine} className="photo-thumb" />
                <div className="photo-details">
                  <div className="photo-orig">{p.nomOrigine}</div>
                  <div className="photo-stats">
                    {p.largeur}×{p.hauteur} px · {formatKo(p.tailleAvant)} → <strong>{formatKo(p.tailleApres)}</strong>
                  </div>
                  <div className="photo-controls">
                    <div className="fg">
                      <label>SKU</label>
                      {skus.length > 0 ? (
                        <select className="binput" value={p.sku} onChange={e => maj(p.id, 'sku', e.target.value)}>
                          <option value="">— choisir —</option>
                          {skus.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <input
                          className="binput"
                          type="text"
                          placeholder="PKM-SM115-68-EX-FR"
                          value={p.sku}
                          onChange={e => maj(p.id, 'sku', e.target.value.trim())}
                        />
                      )}
                    </div>
                    <div className="fg">
                      <label>Face</label>
                      <select className="binput cond" value={p.face} onChange={e => maj(p.id, 'face', e.target.value)}>
                        <option value="1">Recto</option>
                        <option value="2">Verso</option>
                      </select>
                    </div>
                  </div>
                  {nomFinal(p) && <div className="photo-final">→ {nomFinal(p)}</div>}
                </div>
                <div className="photo-actions">
                  <button className="add-btn" disabled={!p.sku} onClick={() => telecharger(p)}>↓</button>
                  <button className="rbtn" onClick={() => supprimer(p.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="export-bar">
            <div className="exp-info">
              <strong>{pretes}</strong> / {photos.length} prête{pretes > 1 ? 's' : ''} · {formatKo(gainTotal)} économisés
            </div>
            <button className="exp-btn" disabled={pretes === 0} onClick={toutTelecharger}>
              ↓ Tout télécharger
            </button>
          </div>
        </>
      )}
    </div>
  )
}
