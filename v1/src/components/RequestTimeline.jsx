import React from 'react'

function colorForService(name) {
  const map = {
    'mystack_user-publication-service': '#2f86eb',
    'mystack_user-auth-service': '#f59e0b',
    'mystack_get-data': '#10b981',
    'mystack_optimize-data': '#8b5cf6',
    'mystack_upload-data': '#ef4444',
    'mystack_mongo': '#6b7280'
  }
  return map[name] || '#94a3b8'
}

export default function RequestTimeline({ events = [], serviceFlow = [] }) {
  // derive timeline bounds from service segments with real duration (end > start)
  const times = events.filter(e => e.time).map(e => e.time.getTime())

  // collapse events by service: take first occurrence time
  const byService = {}
  for (const ev of events) {
    if (!ev.service) continue
    if (!byService[ev.service]) byService[ev.service] = []
    byService[ev.service].push(ev)
  }

  // build segments in order of serviceFlow
  const segments = []
  let lastT = null
  for (const svc of serviceFlow) {
    const evs = byService[svc]
    if (!evs || evs.length === 0) continue
    // pick first and last occurrence
    // prefer high-precision timeMs
    const first = evs.find(e => e.timeMs != null) || evs.find(e => e.time) || evs[0]
    const idx = evs.map(e => (e.timeMs != null ? e.timeMs : (e.time && e.time.getTime()))).filter(t => t != null)
    const lastVal = idx.length ? Math.max(...idx) : (first && (first.timeMs != null ? first.timeMs : (first.time && first.time.getTime())))
    const s = (first && (first.timeMs != null ? first.timeMs : (first.time && first.time.getTime()))) || lastT
    const e = lastVal || s
    // preserve raw strings
    const startRaw = first && (first.rawTimestamp || first.timestamp || null)
    let endRaw = null
    for (const ev of evs) {
      const t = (ev.timeMs != null ? ev.timeMs : (ev.time && ev.time.getTime()))
      if (t === lastVal) { endRaw = ev.rawTimestamp || ev.timestamp || null; break }
    }
    segments.push({ service: svc, start: s, end: e, startRaw, endRaw })
    lastT = e
  }

  // compute display bounds using only segments that have duration (end > start)
  const durationSegments = segments.filter(s => s.start != null && s.end != null && s.end > s.start)
  let displayStart = null, displayEnd = null
  if (durationSegments.length) {
    const allStarts = durationSegments.map(s => s.start)
    const allEnds = durationSegments.map(s => s.end)
    displayStart = Math.min(...allStarts)
    displayEnd = Math.max(...allEnds)
  } else if (times.length) {
    displayStart = Math.min(...times)
    displayEnd = Math.max(...times)
  }
  const total = displayStart != null && displayEnd != null ? (displayEnd - displayStart) : 0
  // sum of individual service durations (what the user wants as TOTAL)
  const sumDurations = durationSegments.reduce((acc, s) => acc + Math.max(0, (s.end - s.start)), 0)

  // display-friendly start (earliest segment start) and end (upload-data end if available)
  const startDisplay = durationSegments.length
    ? (durationSegments.reduce((a,b)=> a.start < b.start ? a : b).startRaw || new Date(displayStart).toISOString())
    : (displayStart ? new Date(displayStart).toISOString() : '—')

  const uploadSeg = segments.find(s => s.service === 'mystack_upload-data')
  const mongoSeg = segments.find(s => s.service === 'mystack_mongo')
  // prefer upload-data segment end, then mongo, then displayEnd
  const endDisplay = (uploadSeg && (uploadSeg.endRaw || (uploadSeg.end ? new Date(uploadSeg.end).toISOString() : null))) || (mongoSeg && (mongoSeg.endRaw || (mongoSeg.end ? new Date(mongoSeg.end).toISOString() : null))) || (displayEnd ? new Date(displayEnd).toISOString() : '—')

  // numeric start/end for computing the displayed Total = End - Start
  const numericStart = displayStart != null ? displayStart : null
  const numericEnd = (uploadSeg && uploadSeg.end != null) ? uploadSeg.end : ((mongoSeg && mongoSeg.end != null) ? mongoSeg.end : (displayEnd != null ? displayEnd : null))
  const displayedTotalMs = (numericStart != null && numericEnd != null) ? Math.round(numericEnd - numericStart) : null

  return (
    <div>
      <h3>Request timeline</h3>
  <div>Start: {startDisplay} | End: {endDisplay} | Total: {displayedTotalMs != null ? displayedTotalMs + ' ms' : '—'}</div>

      <div className="timeline">
        <div className="timeline-bar">
          {durationSegments.map((seg, i) => {
            const left = total ? ((seg.start - displayStart) / total) * 100 : 0
            const width = total ? ((seg.end - seg.start) / total) * 100 : 0
            return (
              <div key={i} className="segment" style={{ left: `${left}%`, width: `${Math.max(width,1)}%`, background: colorForService(seg.service) }}>
                <span style={{padding:'0 6px', whiteSpace:'nowrap', fontSize:12}}>{seg.service.replace('mystack_','')}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{marginTop:10}}>
        <h4>Raw events</h4>
        <div style={{maxHeight:300, overflow:'auto', background:'#fff', border:'1px solid #eee', padding:8}}>
          {events.map((e,i) => (
            <div key={i} style={{padding:'6px 0', borderBottom:'1px solid #fafafa'}}>
              <div style={{fontSize:12,color:'#666'}}>{(e.rawTimestamp || e.timestamp) ? (e.rawTimestamp || e.timestamp) : (e.time ? e.time.toISOString() : '—')} | {e.vm || '—'} | {e.service || '—'}</div>
              <div style={{fontSize:13}}>{e.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
