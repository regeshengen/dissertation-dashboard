import React from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

function ms(n) { return n != null ? `${Math.round(n)} ms` : '—' }

function computeServiceSegments(events, serviceFlow) {
  // For each service in the flow compute start (earliest) and end (latest) times and vm
  // Ensure we always return a segment for every service in the provided serviceFlow (preserves order)
  const byService = {}
  for (const ev of events) {
    if (!ev.service) continue
    if (!byService[ev.service]) byService[ev.service] = []
    byService[ev.service].push(ev)
  }
  const segments = []
  const seen = new Set()
  for (const svc of serviceFlow) {
    if (seen.has(svc)) continue
    seen.add(svc)
    const items = byService[svc] || []
    // prefer high-precision timeMs when available
    const times = items.map(i => (i.timeMs != null ? i.timeMs : (i.time && i.time.getTime()))).filter(t => t != null)
    const start = times.length ? Math.min(...times) : null
    const end = times.length ? Math.max(...times) : null
    // preserve raw timestamp strings for precise display
    const startRaw = (() => {
      if (!items.length) return null
      let cand = null
      for (const it of items) {
        const t = (it.timeMs != null ? it.timeMs : (it.time && it.time.getTime()))
        if (t != null && (cand == null || t < cand.t)) cand = { t, raw: it.rawTimestamp || it.timestamp || null }
      }
      return cand && cand.raw ? cand.raw : null
    })()
    const endRaw = (() => {
      if (!items.length) return null
      let cand = null
      for (const it of items) {
        const t = (it.timeMs != null ? it.timeMs : (it.time && it.time.getTime()))
        if (t != null && (cand == null || t > cand.t)) cand = { t, raw: it.rawTimestamp || it.timestamp || null }
      }
      return cand && cand.raw ? cand.raw : null
    })()
    // pick VM most frequent
    const vmCounts = {}
    for (const it of items) if (it.vm) vmCounts[it.vm] = (vmCounts[it.vm] || 0) + 1
    const vm = Object.keys(vmCounts).length ? Object.entries(vmCounts).sort((a,b)=>b[1]-a[1])[0][0] : (items[0] && items[0].vm) || null
    segments.push({ service: svc, start, end, startRaw, endRaw, vm, events: items })
  }
  return segments
}

export default function RequestDetails({ events = [], serviceFlow = [] }) {
  const segments = computeServiceSegments(events, serviceFlow)
  const times = segments.map(s => [s.start, s.end]).flat().filter(Boolean)
  const start = times.length ? Math.min(...times) : null
  // prefer the upload-data segment end as the request End (fallback to the max end across segments)
  const uploadSeg = segments.find(s => s.service === 'mystack_upload-data')
  const maxEnd = times.length ? Math.max(...times) : null
  const end = (uploadSeg && uploadSeg.end != null) ? uploadSeg.end : maxEnd
  const total = (start != null && end != null) ? end - start : null

  // helper: merge intervals and sum length
  function sumMergedIntervals(intervals) {
    const iv = intervals.filter(i => i[0] != null && i[1] != null).map(i => [i[0], i[1]]).sort((a,b)=>a[0]-b[0])
    if (!iv.length) return 0
    let cur = iv[0].slice()
    let acc = 0
    for (let i=1;i<iv.length;i++){
      const s = iv[i]
      if (s[0] <= cur[1]) {
        // overlap
        cur[1] = Math.max(cur[1], s[1])
      } else {
        acc += cur[1]-cur[0]
        cur = s.slice()
      }
    }
    acc += cur[1]-cur[0]
    return acc
  }

  // sum of individual service durations
  const sumDurations = segments.reduce((acc,s)=>{ if (s.start!=null && s.end!=null) return acc + (s.end - s.start); return acc }, 0)
  // non-overlapping (merged) time across all service segments
  const nonOverlappingTotal = sumMergedIntervals(segments.map(s=>[s.start,s.end]))

  // compute exclusive time per service: duration minus union of other segments clipped inside this segment
  function computeExclusive(seg) {
    if (seg.start == null || seg.end == null) return null
    const others = segments.filter(s => s !== seg && s.start!=null && s.end!=null).map(s => [Math.max(s.start, seg.start), Math.min(s.end, seg.end)]).filter(i=>i[0]<i[1])
    const overlapped = sumMergedIntervals(others)
    return Math.max(0, (seg.end - seg.start) - overlapped)
  }

  // data for bar chart: duration per service
  // ensure display for all services in the provided serviceFlow order
  const uniqueFlow = []
  const seen = new Set()
  for (const s of serviceFlow) {
    if (!seen.has(s)) { seen.add(s); uniqueFlow.push(s) }
  }
  // exclude mongo backend from the "Duration per service" chart to avoid inflating visuals
  const displayFlow = uniqueFlow.filter(svc => !svc.toLowerCase().includes('mongo'))
  const chartData = displayFlow.map(svc => {
    const seg = segments.find(x => x.service === svc) || { start: null, end: null, vm: null, events: [] }
    const duration = (seg.start != null && seg.end != null) ? (seg.end - seg.start) : 0
    const hasData = seg.start != null && seg.end != null
    return { name: svc.replace('mystack_',''), duration, vm: seg.vm, hasData, eventsCount: seg.events.length }
  })

  // detect VM transitions between sequential services
  const transitions = []
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i-1]
    const cur = segments[i]
    if (prev.vm && cur.vm && prev.vm !== cur.vm) {
      transitions.push({ from: prev.service, to: cur.service, at: cur.start, fromVm: prev.vm, toVm: cur.vm })
    }
  }

  const chartHeight = Math.max(160, chartData.length * 36)

  const startDisplay = start ? new Date(start).toISOString() : '—'
  const endDisplay = (uploadSeg && uploadSeg.endRaw) ? uploadSeg.endRaw : (end ? new Date(end).toISOString() : '—')

  return (
    <div>
      <Typography variant="h6">Request journey</Typography>
      <Typography variant="body2">Start: {startDisplay} • End: {endDisplay} • Total: {total != null ? ms(total) : '—'} • Sum services: {sumDurations ? ms(sumDurations) : '—'}</Typography>

      <Paper sx={{height:240, mt:2, p:2}}>
        <Typography variant="subtitle1">Duration per service</Typography>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart layout="vertical" data={chartData} margin={{left:20}}>
            <XAxis type="number" tickFormatter={v => `${Math.round(v)}ms`} />
            <YAxis dataKey="name" type="category" width={220} />
            <Tooltip formatter={(value) => `${Math.round(value)} ms`} />
            <Bar dataKey="duration" minPointSize={2}>
              {chartData.map((entry, idx) => (
                // gray if no data, colored otherwise (blue for VM1-ish, orange otherwise)
                <Cell key={`cell-${idx}`} fill={!entry.hasData ? '#cfcfcf' : (entry.vm && entry.vm.includes('1') ? '#1976d2' : '#ef6c00')} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      <Paper sx={{mt:2, p:2}}>
        <Typography variant="subtitle1">Service timeline (detected)</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell>VM</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {segments.map((s, i) => (
                <TableRow key={s.service} sx={{ background: i % 2 ? '#fbfbfb' : 'inherit' }}>
                  <TableCell>{s.service}</TableCell>
                  <TableCell>{s.vm || '—'}</TableCell>
                  <TableCell>{s.startRaw ? s.startRaw : (s.start ? new Date(Math.floor(s.start)).toISOString() : '—')}</TableCell>
                  <TableCell>{s.endRaw ? s.endRaw : (s.end ? new Date(Math.floor(s.end)).toISOString() : '—')}</TableCell>
                  <TableCell>{s.start != null && s.end != null ? `${Math.round(s.end - s.start)} ms` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{mt:2, p:2}}>
        <Typography variant="subtitle1">Detected VM transitions</Typography>
        {transitions.length === 0 && <Typography variant="body2">Nenhuma transição detectada entre serviços.</Typography>}
        {transitions.map((t,i) => (
          <div key={i} style={{padding:8, borderBottom:'1px solid #eee'}}>
            <Typography variant="body2"><strong>{t.from.replace('mystack_','')}</strong> ({t.fromVm}) → <strong>{t.to.replace('mystack_','')}</strong> ({t.toVm})</Typography>
            <Typography variant="caption">at {t.at ? new Date(t.at).toISOString() : '—'}</Typography>
          </div>
        ))}
      </Paper>
    </div>
  )
}
