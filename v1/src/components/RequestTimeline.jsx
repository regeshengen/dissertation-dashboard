import React from 'react'

// deterministic color mapping for services: prefer explicit map, fall back to palette by hash
function colorForService(name) {
  if (!name) return '#94a3b8'
  const normalize = n => (n || '').toString()
  const base = {
    'mystack_user-publication-service': '#2f86eb',
    'user-publication-service': '#2f86eb',
    'mystack_user-auth-service': '#f59e0b',
    'user-auth-service': '#f59e0b',
    'mystack_get-data': '#10b981',
    'get-data': '#10b981',
    'mystack_optimize-data': '#8b5cf6',
    'optimize-data': '#8b5cf6',
    'mystack_upload-data': '#ef4444',
    'upload-data': '#ef4444',
    'mystack_mongo': '#6b7280',
    'mongo': '#6b7280'
  }
  const n = normalize(name)
  if (base[n]) return base[n]
  // try without mystack_ prefix
  const stripped = n.replace(/^mystack_/, '')
  if (base[stripped]) return base[stripped]

  const palette = ['#06b6d4','#fb7185','#f97316','#84cc16','#a78bfa','#c084fc','#fdba74','#60a5fa','#34d399','#f472b6']
  // simple deterministic hash
  let h = 0
  for (let i = 0; i < n.length; i++) h = ((h << 5) - h) + n.charCodeAt(i)
  const idx = Math.abs(h) % palette.length
  return palette[idx]
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

  // We'll build the timeline using only the sequence order of events (CSV order), ignoring timestamps.
  // Attach an `__order` index to preserve the original sequence and filter events that have a service.
  const orderedEvents = events
    .map((e, idx) => ({ ...e, __order: idx }))
    .filter(e => e && e.service)

  // Build segments by grouping events by `requestId`.
  // For each requestId we compute start = earliest timestamp, end = latest timestamp.
  const requestsMap = {}
  for (const ev of orderedEvents) {
    const id = ev.requestId || ev.requestID || ev.requestid || ev.request || ev.request_id
    if (!id) continue
    if (!requestsMap[id]) requestsMap[id] = []
    requestsMap[id].push(ev)
  }
  const requestTotals = []
  const serviceSegments = []
  // For each request, compute overall start/end and also break into consecutive service segments
  for (const id of Object.keys(requestsMap)) {
    // events already stored in original sequence order
    const evs = requestsMap[id]
    if (!evs.length) continue
    const reqStartIdx = evs[0].__order
    const reqEndIdx = evs[evs.length - 1].__order
    const reqStartRaw = evs[0].rawTimestamp || evs[0].timestamp || null
    const reqEndRaw = evs[evs.length - 1].rawTimestamp || evs[evs.length - 1].timestamp || null
    requestTotals.push({ requestId: id, startIdx: reqStartIdx, endIdx: reqEndIdx, startRaw: reqStartRaw, endRaw: reqEndRaw, events: evs })

    // group consecutive events of the same service within this request using sequence indices
    for (let i = 0; i < evs.length; ) {
      const cur = evs[i]
      const svc = cur.service
      const segStartIdx = cur.__order
      let j = i
      while (j + 1 < evs.length && evs[j + 1].service === svc) j++
      const segEndIdx = evs[j].__order
      const segStartRaw = cur.rawTimestamp || cur.timestamp || null
      const segEndRaw = evs[j].rawTimestamp || evs[j].timestamp || null
      serviceSegments.push({ requestId: id, service: svc, startIdx: segStartIdx, endIdx: segEndIdx, startRaw: segStartRaw, endRaw: segEndRaw })
      i = j + 1
    }
  }

  // helper to parse timestamp-like values into ms since epoch (or null)
  function parseTimeVal(v) {
    if (v == null) return null
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number' && !isNaN(v)) return v
    const s = String(v)
    const n = Date.parse(s)
    if (!isNaN(n)) return n
    return null
  }

  // compute per-request total durations (ms) when raw timestamps are available
  const requestDurationMap = {}
  for (const rt of requestTotals) {
    const s = parseTimeVal(rt.startRaw)
    const e = parseTimeVal(rt.endRaw)
    requestDurationMap[rt.requestId] = (s != null && e != null) ? Math.round(e - s) : null
  }

  // chronoSegments are service-level segments (ordered by time)
  // chronoSegments ordered by sequence index
  const chronoSegments = serviceSegments.slice().sort((a,b) => a.startIdx - b.startIdx)

  // include all segments with defined indices
  const displaySegments = chronoSegments.filter(s => s.startIdx != null && s.endIdx != null)
  let displayStart = null, displayEnd = null
  if (displaySegments.length) {
    displayStart = Math.min(...displaySegments.map(s => s.startIdx))
    displayEnd = Math.max(...displaySegments.map(s => s.endIdx))
  } else if (orderedEvents.length) {
    displayStart = 0
    displayEnd = orderedEvents.length - 1
  }

  const totalUnits = (displayStart != null && displayEnd != null) ? (displayEnd - displayStart + 1) : 0

  // display-friendly start/end are sequence positions (we're ignoring timestamps for now)
  const startDisplay = displayStart != null ? `#${displayStart}` : '—'
  const endDisplay = displayEnd != null ? `#${displayEnd}` : '—'
  const displayedTotalSteps = totalUnits

  return (
    <><div>
      <h3>Request timeline</h3>
      <div>Start: {startDisplay} | End: {endDisplay} | Total: {displayedTotalSteps != null ? displayedTotalSteps + ' steps' : '—'}</div>

      <div className="timeline">
        <div className="timeline-bar">
          {displaySegments.map((seg, i) => {
            const left = totalUnits ? ((seg.startIdx - displayStart) / totalUnits) * 100 : 0
            const width = totalUnits ? ((seg.endIdx - seg.startIdx + 1) / totalUnits) * 100 : 0
            const bg = colorForService(seg.service)
            const label = seg.service ? seg.service.replace('mystack_', '') : ''
            return (
              <div key={i} className="segment" title={`${seg.requestId} [${seg.startIdx}→${seg.endIdx}] ${label}`} style={{ left: `${left}%`, width: `${Math.max(width, 1)}%`, background: bg }}>
                <span style={{ padding: '0 6px', whiteSpace: 'nowrap', fontSize: 12 }}>{label}</span>
              </div>
            )
          })}
        </div>
        {/* labels below each segment: start / end of the request (if available) */}
      </div>

      <div style={{ position: 'relative', marginTop: 6, height: 34 }}>
        {displaySegments.map((seg, i) => {
          const left = totalUnits ? ((seg.startIdx - displayStart) / totalUnits) * 100 : 0
          const width = totalUnits ? ((seg.endIdx - seg.startIdx + 1) / totalUnits) * 100 : 0
          const startText = seg.startRaw ? (seg.startRaw instanceof Date ? seg.startRaw.toISOString() : String(seg.startRaw)) : '—'
          const endText = seg.endRaw ? (seg.endRaw instanceof Date ? seg.endRaw.toISOString() : String(seg.endRaw)) : '—'
          // compute duration for the sub-segment using its own startRaw/endRaw
          const segStartMs = parseTimeVal(seg.startRaw)
          const segEndMs = parseTimeVal(seg.endRaw)
          const segDur = (segStartMs != null && segEndMs != null) ? Math.round(segEndMs - segStartMs) : null
          const durText = segDur != null ? (segDur > 1000 ? `${(segDur/1000).toFixed(2)} s` : `${segDur} ms`) : (requestDurationMap[seg.requestId] != null ? (requestDurationMap[seg.requestId] > 1000 ? `${(requestDurationMap[seg.requestId]/1000).toFixed(2)} s` : `${requestDurationMap[seg.requestId]} ms`) : '—')
          return (
            <div key={i} style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(width, 1)}%`, padding: '2px 4px', boxSizing: 'border-box', textAlign: 'center', fontSize: 11, color: '#444', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              <div style={{ fontSize: 11, color: '#333' }}>{startText}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{endText}</div>
              <div style={{ fontSize: 11, color: '#000', marginTop:2 }}>{durText}</div>
            </div>
          )
        })}
      </div>
    </div><div style={{ marginTop: 8 }}>
        <h4>Request durations</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }}>
          {requestTotals.slice().sort((a, b) => a.startIdx - b.startIdx).map((s, idx) => {
            const rid = s.requestId || ''
            const shortId = rid.length > 12 ? `${rid.slice(0, 12)}…` : rid
            const steps = (s.endIdx - s.startIdx + 1)
            return (
              <div key={idx} style={{ fontSize: 13, color: '#222' }}>
                <strong style={{ fontFamily: 'monospace' }}>{shortId}</strong>: {steps} steps
              </div>
            )
          })}
        </div>
      </div><div style={{ marginTop: 10 }}>
        <h4>Raw events</h4>
        <div style={{ maxHeight: 300, overflow: 'auto', background: '#fff', border: '1px solid #eee', padding: 8 }}>
          {events.map((e, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #fafafa' }}>
              <div style={{ fontSize: 12, color: '#666' }}>{(e.rawTimestamp || e.timestamp) ? (e.rawTimestamp || e.timestamp) : (e.time ? e.time.toISOString() : '—')} | {e.vm || '—'} | {e.service || '—'}</div>
              <div style={{ fontSize: 13 }}>{e.message}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
