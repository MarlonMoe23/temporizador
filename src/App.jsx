import { useState, useEffect, useRef, useCallback } from 'react'
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

// Manda mensaje al service worker
function swMessage(data) {
  navigator.serviceWorker?.ready.then(reg => {
    reg.active?.postMessage(data)
  })
}

// Audio solo cuando la pantalla ESTÁ encendida
let sharedCtx = null
function getCtx() {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return sharedCtx
}

function playDone() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const notes = [528, 396, 528, 440, 528]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      const t = ctx.currentTime + i * 1.0
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.4, t + 0.06)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8)
      osc.start(t); osc.stop(t + 1.8)
    })
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600])
  } catch {}
}

function playTick() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'; osc.frequency.value = 880
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.18)
  } catch {}
}

function pad(n) { return String(n).padStart(2, '0') }
function fmt(secs) { return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}` }

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
  const [notifPerm, setNotifPerm] = useState('default')
  const intervalRef = useRef(null)
  const endTimeRef = useRef(null)
  const prevTimeRef = useRef(null) // para detectar el countdown 3-2-1
  const wakeLockRef = useRef(null)

  useEffect(() => { savePresets(presets) }, [presets])

  // Pide permiso de notificaciones al montar
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPerm(Notification.permission)
    }
  }, [])

  // Escucha mensaje TIMER_DONE del service worker
  useEffect(() => {
    if (!navigator.serviceWorker) return
    const handler = e => {
      if (e.data?.type === 'TIMER_DONE') {
        clearInterval(intervalRef.current)
        setRunning(false)
        setDone(true)
        setTimeLeft(0)
        playDone()
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // Timer basado en timestamps — no pierde tiempo aunque el JS se pause
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))

        // Countdown 3-2-1 cuando la pantalla está encendida
        if (!document.hidden && prevTimeRef.current !== remaining && remaining <= 3 && remaining > 0) {
          playTick()
        }
        prevTimeRef.current = remaining

        if (remaining <= 0) {
          clearInterval(intervalRef.current)
          setRunning(false)
          setDone(true)
          setTimeLeft(0)
          // Si la pantalla estaba encendida, suena directo
          releaseWakeLock()
          if (!document.hidden) playDone()
          return
        }
        setTimeLeft(remaining)
      }, 500)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  // Sincroniza cuando vuelve la pantalla
  const handleVisibility = useCallback(() => {
    if (document.hidden || !endTimeRef.current) return
    const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
    if (remaining <= 0) {
      clearInterval(intervalRef.current)
      setRunning(false)
      setDone(true)
      setTimeLeft(0)
      playDone()
    } else {
      setTimeLeft(remaining)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [handleVisibility])

  async function requestNotifPermission() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
  }

  async function acquireWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen")
      }
    } catch {}
  }

  function releaseWakeLock() {
    try {
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    } catch {}
  }

  function startTimer(secs, label) {
    endTimeRef.current = Date.now() + secs * 1000
    swMessage({ type: 'TIMER_START', endTime: endTimeRef.current, label })
    acquireWakeLock()
    setRunning(true)
  }

  function select(p) {
    if (running) return
    setSelected(p); setTimeLeft(p.mins * 60); setTotal(p.mins * 60); setDone(false)
  }

  function handleMain() {
    if (done) {
      const secs = selected.mins * 60
      setTimeLeft(secs); setTotal(secs); setDone(false)
      startTimer(secs, selected.name); return
    }
    if (running) {
      swMessage({ type: 'TIMER_CANCEL' })
      releaseWakeLock()
      setRunning(false)
    } else {
      startTimer(timeLeft, selected?.name)
    }
  }

  function reset() {
    swMessage({ type: 'TIMER_CANCEL' })
    releaseWakeLock()
    clearInterval(intervalRef.current)
    setRunning(false); setDone(false)
    endTimeRef.current = null
    if (selected) { setTimeLeft(selected.mins * 60); setTotal(selected.mins * 60) }
  }

  function openAdd() { setEditId(null); setForm({ name: '', mins: '' }); setModal(true) }

  function openEdit(p, e) {
    e.stopPropagation()
    setEditId(p.id); setForm({ name: p.name, mins: String(p.mins) }); setModal(true)
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
      setSelected(next); setTimeLeft(next ? next.mins * 60 : 0)
      setTotal(next ? next.mins * 60 : 0)
      setRunning(false); setDone(false)
    }
  }

  const progress = total > 0 ? (total - timeLeft) / total : 0
  const dashArr = `${CIRC * progress} ${CIRC * (1 - progress)}`
  const btnLabel = done ? 'Repetir' : running ? 'Pausar' : (timeLeft < total && timeLeft > 0 ? 'Reanudar' : 'Iniciar')
  const needsNotifPerm = 'Notification' in window && notifPerm !== 'granted'

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <span style={styles.headerTitle}>temporizador</span>
      </header>

      <main style={styles.main}>

        {/* Banner de permiso de notificaciones */}
        {needsNotifPerm && (
          <div style={styles.notifBanner}>
            <span style={styles.notifText}>
              {notifPerm === 'denied'
                ? '⚠️ Activa notificaciones en ajustes del navegador para que suene con pantalla apagada'
                : '🔔 Activa notificaciones para que suene con pantalla apagada'}
            </span>
            {notifPerm !== 'denied' && (
              <button style={styles.notifBtn} onClick={requestNotifPermission}>
                Activar
              </button>
            )}
          </div>
        )}

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
              style={{ transition: running ? 'stroke-dasharray 0.5s linear' : 'none' }}
            />
          </svg>
          <div style={styles.ringInner}>
            {done ? (
              <span style={{ ...styles.timeDisplay, color: 'var(--green)', fontSize: 36 }}>listo ✓</span>
            ) : (
              <>
                <span style={styles.timeDisplay}>{fmt(timeLeft)}</span>
                <span style={styles.presetLabel}>{selected ? selected.name : '—'}</span>
              </>
            )}
          </div>
        </div>

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
                    <div style={{ ...styles.presetName, color: isActive ? 'var(--gold)' : 'var(--text)' }}>
                      {p.name}
                    </div>
                    <div style={styles.presetMins}>{p.mins} min</div>
                  </div>
                  {!running && (
                    <div style={styles.presetActions}>
                      <button style={styles.iconBtn} onClick={e => openEdit(p, e)}>✎</button>
                      <button style={{ ...styles.iconBtn, color: 'var(--danger)' }} onClick={e => deletePreset(p.id, e)}>✕</button>
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
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', padding: '28px 24px 0', display: 'flex', justifyContent: 'center' },
  headerTitle: {
    fontFamily: "'DM Serif Display', serif", fontStyle: 'italic',
    fontSize: 13, letterSpacing: '0.35em', color: 'var(--text-muted)', textTransform: 'uppercase',
  },
  main: {
    width: '100%', maxWidth: 480, padding: '32px 24px 60px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
  },
  notifBanner: {
    width: '100%', background: '#1e1c18', border: '1px solid var(--gold-dim)',
    borderRadius: 10, padding: '12px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  notifText: { fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, flex: 1 },
  notifBtn: {
    background: 'var(--gold)', color: '#0f0e0d', border: 'none',
    borderRadius: 6, fontSize: 12, padding: '7px 14px', fontWeight: 500, flexShrink: 0,
    fontFamily: "'DM Mono', monospace",
  },
  ringWrap: { position: 'relative', width: 260, height: 260, flexShrink: 0 },
  ringInner: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  timeDisplay: {
    fontFamily: "'DM Mono', monospace", fontSize: 52, fontWeight: 300,
    color: 'var(--text)', letterSpacing: '0.02em', lineHeight: 1,
  },
  presetLabel: { fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--text-dim)' },
  controls: { display: 'flex', gap: 12, alignItems: 'center' },
  btnPrimary: {
    background: 'var(--gold)', color: '#0f0e0d', border: 'none',
    borderRadius: 8, fontSize: 13, letterSpacing: '0.08em', padding: '12px 32px', fontWeight: 400,
    fontFamily: "'DM Mono', monospace",
  },
  btnSecondary: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
    fontSize: 13, letterSpacing: '0.08em', color: 'var(--text-dim)', padding: '12px 20px',
    fontFamily: "'DM Mono', monospace",
  },
  btnAdd: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-dim)', padding: '5px 12px',
    fontFamily: "'DM Mono', monospace",
  },
  section: { width: '100%' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 10, letterSpacing: '0.3em', color: 'var(--text-muted)', textTransform: 'uppercase' },
  presetList: { display: 'flex', flexDirection: 'column', gap: 8 },
  presetCard: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    transition: 'border-color 0.15s, background 0.15s',
  },
  presetName: { fontSize: 15, marginBottom: 2 },
  presetMins: { fontSize: 12, color: 'var(--text-dim)', fontFamily: "'DM Mono', monospace" },
  presetActions: { display: 'flex', gap: 4 },
  iconBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-muted)',
    fontSize: 15, padding: '4px 6px', borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
  },
  modalBg: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
  },
  modalBox: {
    background: '#161513', border: '1px solid var(--border)', borderRadius: 14,
    padding: 28, width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 18,
  },
  modalTitle: { fontFamily: "'DM Serif Display', serif", fontStyle: 'italic', fontSize: 20, fontWeight: 400, color: 'var(--gold)' },
  field: { display: 'flex', flexDirection: 'column', gap: 7 },
  fieldLabel: { fontSize: 10, letterSpacing: '0.25em', color: 'var(--text-muted)', textTransform: 'uppercase' },
  input: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
    color: 'var(--text)', fontSize: 14, padding: '10px 13px', outline: 'none', width: '100%',
    fontFamily: "'DM Mono', monospace",
  },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
}
