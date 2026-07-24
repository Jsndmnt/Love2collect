import { useState, useRef } from 'react'
import './Phototool.css'

// Largeur/hauteur maximale du plus grand côté, en pixels.
const MAX_SIDE = 1400
// Qualité JPEG, entre 0 et 1. 0.82 est un bon compromis poids/rendu.
const QUALITE = 0.82

function formatKo(octets) {
  return `${Math.round(octets / 1024)} Ko`
}

// Lit la balise EXIF Orientation (1 à 8) directement dans l'en-tête du JPEG.
// Renvoie null si le fichier n'a pas d'EXIF du tout.
async function lireOrientationExif(file) {
  try {
    const buf = await file.slice(0, 131072).arrayBuffer()
    const view = new DataView(buf)
    if (view.getUint16(0, false) !== 0xFFD8) return null
    let offset = 2
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false)
      if ((marker & 0xFF00) !== 0xFF00) return null
      if (marker === 0xFFE1) {
        const exifStart = offset + 4
        if (view.getUint32(exifStart, false) !== 0x45786966) return null
        const tiff = exifStart + 6
        const little = view.getUint16(tiff, false) === 0x4949
        const dirStart = tiff + view.getUint32(tiff + 4, little)
        const entries = view.getUint16(dirStart, little)
        for (let i = 0; i < entries; i++) {
          const entry = dirStart + 2 + i * 12
          if (view.getUint16(entry, little) === 0x0112) {
            return view.getUint16(entry + 8, little)
          }
        }
        return null
      }
      offset += 2 + view.getUint16(offset + 2, false)
    }
    return null
  } catch {
    return null
  }
}

// Redresse selon l'EXIF, applique une rotation manuelle optionnelle,
// redimensionne et recompresse. Le canvas écrit une image sans métadonnées.
async function traiter(file, rotation = 0) {
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = rej
      img.src = URL.createObjectURL(file)
    })
  }

  const ratio = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
  const cw = Math.round(source.width * ratio)
  const ch = Math.round(source.height * ratio)
  const pivote = rotation === 90 || rotation === 270

  const canvas = document.createElement('canvas')
  canvas.width = pivote ? ch : cw
  canvas.height = pivote ? cw : ch
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(source, -cw / 2, -ch / 2, cw, ch)

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITE))
  return { blob, url: URL.createObjectURL(blob), largeur: canvas.width, hauteur: canvas.height }
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
        const exif = await lireOrientationExif(f)
        const r = await traiter(f, 0)
        traitees.push({
          id: `${f.name}-${Date.now()}-${Math.random()}`,
          file: f,
          nomOrigine: f.name,
          exif,
          rotation: 0,
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
        // Fichier illisible : ignoré.
      }
    }
    setPhotos(prev => [...prev, ...traitees])
    setEnCours(false)
  }

  const maj = (id, champ, valeur) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, [champ]: valeur } : p))
  }

  const tourner = async (id, sens) => {
    const p = photos.find(x => x.id === id)
    if (!p) return
    const rotation = (p.rotation + (sens === 'droite' ? 90 : 270)) % 360
    const r = await traiter(p.file, rotation)
    setPhotos(prev => prev.map(x => x.id === id
      ? { ...x, rotation, blob: r.blob, url: r.url, largeur: r.largeur, hauteur: r.hauteur, tailleApres: r.blob.size }
      : x))
  }

  const supprimer = (id) => setPhotos(prev => prev.filter(p => p.id !== id))

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
    for (const p of photos.filter(x => x.sku)) {
      telecharger(p)
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
        <div className="dz-text">Dépose tes photos ici, ou clique pour les choisir</div>
        <div className="dz-sub">
          Redressement EXIF · rotation manuelle · {MAX_SIDE} px max · JPEG qualité {Math.round(QUALITE * 100)}
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
                    <strong>{p.largeur}×{p.hauteur}</strong> px · {formatKo(p.tailleAvant)} → {formatKo(p.tailleApres)}
                  </div>
                  <div className={`photo-exif ${p.exif ? 'ok' : 'ko'}`}>
                    {p.exif
                      ? `EXIF orientation ${p.exif} — redressement automatique appliqué`
                      : 'Aucune donnée EXIF — rotation à faire à la main'}
                  </div>
                  <div className="photo-rotate">
                    <button className="rot-btn" onClick={() => tourner(p.id, 'gauche')}>↺</button>
                    <button className="rot-btn" onClick={() => tourner(p.id, 'droite')}>↻</button>
                    <span className="rot-val">{p.rotation}°</span>
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
