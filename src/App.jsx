import { useState, useEffect, useRef } from 'react'
import './index.css'

const STORAGE_KEY = 'zen-timer-presets-v1'

const DEFAULT_PRESETS = [
  { id: 1, name: 'Respiración', mins: 5 },
  { id: 2, name: 'Meditación corta', mins: 10 },
  { id: 3, name: 'Meditación larga', mins: 20 },
  { id: 4, name: 'Ejercicio', mins: 30 },
]

function loadPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_PRESETS
}

function savePresets(presets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {}
}

function playDone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    // 5 notes over ~5 seconds
    const notes = [528, 396, 528, 440, 528]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 1.0
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.4, t + 0.06)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8)
      osc.start(t)
      osc.stop(t + 1.8)
    })
    // vibración
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600])
  } catch {}
}

function playTick() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.18)
  } catch {}
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function fmt(secs) {
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`
}

const RADIUS = 110
const CIRC = 2 * Math.PI * RADIUS

export default function App() {
  const [presets, setPresets] = useState(loadPresets)
  const [selected, setSelected] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [total, setTotal] = useState(0)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', mins: '' })
  const intervalRef = useRef(null)

  useEffect(() => {
    savePresets(presets)
  }, [presets])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            setDone(true)
            playDone()
            return 0
          }
          if (t <= 4) playTick()
          return t - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  function select(p) {
    if (running) return
    setSelected(p)
    setTimeLeft(p.mins * 60)
    setTotal(p.mins * 60)
    setDone(false)
  }

  function handleMain() {
    if (done) {
      setTimeLeft(selected.mins * 60)
      setTotal(selected.mins * 60)
      setDone(false)
      setRunning(true)
      return
    }
    setRunning(r => !r)
  }

  function reset() {
    clearInterval(intervalRef.current)
    setRunning(false)
    setDone(false)
    if (selected) {
      setTimeLeft(selected.mins * 60)
      setTotal(selected.mins * 60)
    }
  }

  function openAdd() {
    setEditId(null)
    setForm({ name: '', mins: '' })
    setModal(true)
  }

  function openEdit(p, e) {
    e.stopPropagation()
    setEditId(p.id)
    setForm({ name: p.name, mins: String(p.mins) })
    setModal(true)
  }

  function savePreset() {
    const name = form.name.trim()
    const mins = parseInt(form.mins)
    if (!name || isNaN(mins) || mins < 1) return
    if (editId) {
      const updated = presets.map(p => p.id === editId ? { ...p, name, mins } : p)
      setPresets(updated)
      if (selected?.id === editId) {
        const found = updated.find(p => p.id === editId)
        setSelected(found)
        if (!running) { setTimeLeft(found.mins * 60); setTotal(found.mins * 60) }
      }
    } else {
      setPresets(prev => [...prev, { id: Date.now(), name, mins }])
    }
    setModal(false)
  }

  function deletePreset(id, e) {
    e.stopPropagation()
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    if (selected?.id === id) {
      const next = updated[0] || null
      setSelected(next)
      setTimeLeft(next ? next.mins * 60 : 0)
      setTotal(next ? next.mins * 60 : 0)
      setRunning(false)
      setDone(false)
    }
  }

  const progress = total > 0 ? (total - timeLeft) / total : 0
  const dashArr = `${CIRC * progress} ${CIRC * (1 - progress)}`
  const btnLabel = done ? 'Repetir' : running ? 'Pausar' : (timeLeft < total && timeLeft > 0 ? 'Reanudar' : 'Iniciar')

  return (
    <div style={styles.root}>

      {/* Header */}
      <header style={styles.header}>
        <span style={styles.headerTitle}>temporizador</span>
      </header>

      <main style={styles.main}>

        {/* Ring */}
        <div style={styles.ringWrap}>
          <svg width={260} height={260} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={130} cy={130} r={RADIUS} fill="none" stroke="var(--surface)" strokeWidth={4} />
            <circle
              cx={130} cy={130} r={RADIUS}
              fill="none"
              stroke={done ? 'var(--green)' : 'var(--gold)'}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={dashArr}
              style={{ transition: running ? 'stroke-dasharray 1s linear' : 'none' }}
            />
          </svg>
          <div style={styles.ringInner}>
            {done ? (
              <>
                <span style={{ ...styles.timeDisplay, color: 'var(--green)', fontSize: 36 }}>listo ✓</span>
              </>
            ) : (
              <>
                <span style={styles.timeDisplay}>{fmt(timeLeft)}</span>
                <span style={styles.presetLabel}>{selected ? selected.name : '—'}</span>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          <button
            style={{ ...styles.btnPrimary, opacity: !selected ? 0.4 : 1 }}
            onClick={handleMain}
            disabled={!selected}
          >
            {btnLabel}
          </button>
          <button style={styles.btnSecondary} onClick={reset}>Reset</button>
        </div>

        {/* Presets */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>mis tiempos</span>
            <button style={styles.btnAdd} onClick={openAdd}>+ agregar</button>
          </div>

          <div style={styles.presetList}>
            {presets.map(p => {
              const isActive = selected?.id === p.id
              return (
                <div
                  key={p.id}
                  style={{
                    ...styles.presetCard,
                    borderColor: isActive ? 'var(--gold-dim)' : 'var(--border)',
                    background: isActive ? '#1e1c18' : 'var(--surface)',
                    cursor: running ? 'not-allowed' : 'pointer',
                    opacity: running && !isActive ? 0.5 : 1,
                  }}
                  onClick={() => select(p)}
                >
                  <div>
                    <div style={{
                      ...styles.presetName,
                      color: isActive ? 'var(--gold)' : 'var(--text)',
                    }}>{p.name}</div>
                    <div style={styles.presetMins}>{p.mins} min</div>
                  </div>
                  {!running && (
                    <div style={styles.presetActions}>
                      <button style={styles.iconBtn} onClick={e => openEdit(p, e)} title="editar">✎</button>
                      <button style={{ ...styles.iconBtn, color: 'var(--danger)' }} onClick={e => deletePreset(p.id, e)} title="eliminar">✕</button>
                    </div>
                  )}
                </div>
              )
            })}
            {presets.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                agrega tu primer tiempo
              </p>
            )}
          </div>
        </section>
      </main>

      {/* Modal */}
      {modal && (
        <div style={styles.modalBg} onClick={() => setModal(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{editId ? 'editar tiempo' : 'nuevo tiempo'}</h3>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>nombre</label>
              <input
                style={styles.input}
                placeholder="ej. Meditación matutina"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && savePreset()}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>minutos</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                placeholder="ej. 15"
                value={form.mins}
                onChange={e => setForm(f => ({ ...f, mins: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && savePreset()}
              />
            </div>
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary} onClick={() => setModal(false)}>cancelar</button>
              <button style={styles.btnPrimary} onClick={savePreset}>guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  header: {
    width: '100%',
    padding: '28px 24px 0',
    display: 'flex',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontStyle: 'italic',
    fontSize: 13,
    letterSpacing: '0.35em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  main: {
    width: '100%',
    maxWidth: 480,
    padding: '32px 24px 60px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
  },
  ringWrap: {
    position: 'relative',
    width: 260,
    height: 260,
    flexShrink: 0,
  },
  ringInner: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  timeDisplay: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 52,
    fontWeight: 300,
    color: 'var(--text)',
    letterSpacing: '0.02em',
    lineHeight: 1,
  },
  presetLabel: {
    fontFamily: "'DM Serif Display', serif",
    fontStyle: 'italic',
    fontSize: 14,
    color: 'var(--text-dim)',
  },
  controls: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  btnPrimary: {
    background: 'var(--gold)',
    color: '#0f0e0d',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    letterSpacing: '0.08em',
    padding: '12px 32px',
    fontWeight: 400,
    transition: 'opacity 0.15s',
  },
  btnSecondary: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    letterSpacing: '0.08em',
    color: 'var(--text-dim)',
    padding: '12px 20px',
  },
  btnAdd: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 11,
    letterSpacing: '0.08em',
    color: 'var(--text-dim)',
    padding: '5px 12px',
  },
  section: {
    width: '100%',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: '0.3em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  presetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  presetCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'border-color 0.15s, background 0.15s',
  },
  presetName: {
    fontSize: 15,
    marginBottom: 2,
  },
  presetMins: {
    fontSize: 12,
    color: 'var(--text-dim)',
    fontFamily: "'DM Mono', monospace",
  },
  presetActions: {
    display: 'flex',
    gap: 4,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 15,
    padding: '4px 6px',
    borderRadius: 4,
    transition: 'color 0.15s',
  },
  modalBg: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  modalBox: {
    background: '#161513',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  modalTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontStyle: 'italic',
    fontSize: 20,
    fontWeight: 400,
    color: 'var(--gold)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: '0.25em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  input: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 7,
    color: 'var(--text)',
    fontSize: 14,
    padding: '10px 13px',
    outline: 'none',
    width: '100%',
  },
  modalActions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },
}
