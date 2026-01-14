import React, { useEffect, useState } from 'react'
import Papa from 'papaparse'
import CSVLoader from './components/CSVLoader'
import RequestTimeline from './components/RequestTimeline'
import RequestDetails from './components/RequestDetails'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import CssBaseline from '@mui/material/CssBaseline'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import MenuIcon from '@mui/icons-material/Menu'

const drawerWidth = 320

const SERVICE_FLOW = [
  'mystack_user-publication-service',
  'mystack_user-auth-service',
  'mystack_user-publication-service',
  'mystack_get-data',
  'mystack_optimize-data',
  'mystack_upload-data',
  'mystack_mongo'
]

function extractRequestId(text) {
  const m = text.match(/RequestId:\s*([0-9a-fA-F-]{36})/)
  return m ? m[1] : null
}

function extractVM(text) {
  const m = text.match(/MSVirtualMachine-\d+/)
  return m ? m[0] : null
}

function extractTime(text, filename) {
  // return an ISO-like string if found (preserve full fractional part)
  const iso = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/)
  if (iso) return iso[0]

  // try to find a date+hour fragment in the same line (e.g. 2025-11-21T10) and a time fragment like 54:40.479Z
  const dateHour = text.match(/\d{4}-\d{2}-\d{2}T\d{2}\b/)
  const timefrag = text.match(/\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/)
  if (timefrag) {
    let prefix = null
    if (dateHour) prefix = dateHour[0]
    else if (filename) prefix = filename.replace(/\.csv$/, '')
    if (prefix) {
      const candidate = `${prefix}:${timefrag[0]}` // e.g. 2025-11-21T10:54:40.479Z
      return candidate
    }
  }
  return null
}

function parseIsoToMs(isoString) {
  if (!isoString) return null
  // match base second and fractional part
  const m = isoString.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/)
  if (!m) {
    // fallback to Date.parse
    const v = Date.parse(isoString)
    return isNaN(v) ? null : v
  }
  const base = m[1] + 'Z' // second precision
  const frac = m[2] || ''
  const baseMs = Date.parse(base)
  if (isNaN(baseMs)) return null
  if (!frac) return baseMs
  // fractional digits may be micro/nano precision; convert to milliseconds
  const fractionalMs = parseFloat('0.' + frac) * 1000
  return baseMs + fractionalMs
}

function normalizeRecords(records, filename) {
  return records.map(r => {
    // r is an object when header:true used. prefer explicit columns if present
    const raw = typeof r === 'string' ? r : Object.values(r).join(',')
    const timestampField = r && (r.timestamp || r.time || r._timestamp)
    let time = null
    let timeMs = null
    let rawTimestamp = null
    if (timestampField) {
      rawTimestamp = String(timestampField)
      const parsed = parseIsoToMs(rawTimestamp)
      if (parsed != null) {
        timeMs = parsed
        time = new Date(Math.floor(parsed))
      } else {
        try { time = new Date(timestampField); if (!isNaN(time)) timeMs = time.getTime(); else time = null } catch { time = null }
      }
    }
    const message = (r && (r.message || r.msg || r.log || r.raw)) || raw
    const requestId = (r && (r.requestId || r.requestID || r.request_id)) || extractRequestId(message) || extractRequestId(raw)
    const vm = (r && r.vm) || extractVM(message) || extractVM(raw)
    const service = (r && r.service) || (message.match(/mystack_[a-zA-Z0-9-_]+/) || [null])[0]
    // fallback: try to extract time from message if no timestamp field
    if (!time && !timeMs) {
      const cand = extractTime(message, filename)
      if (cand) {
        rawTimestamp = cand
        const parsed = parseIsoToMs(cand)
        if (parsed != null) {
          timeMs = parsed
          time = new Date(Math.floor(parsed))
        }
      }
    }
    return {
      raw,
      requestId,
      vm,
      service,
      time,       // Date object (ms precision)
      timeMs,     // high-precision milliseconds (float)
      rawTimestamp,
      message
    }
  })
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [records, setRecords] = useState([])
  const [grouped, setGrouped] = useState({})
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [filename, setFilename] = useState(null)

  useEffect(() => {
    fetch('/csv-files.json').then(r => r.json()).then(list => setFiles(list)).catch(() => setFiles([]))
  }, [])

  function handleLoadFromServer(fname) {
    fetch('/csv/' + fname).then(r => r.text()).then(txt => {
      // parse with header so we can read the 'timestamp' column generated by the converter
      const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true }).data
      const norm = normalizeRecords(parsed, fname)
      setFilename(fname)
      setRecords(norm)
      groupByRequest(norm)
    }).catch(err => alert('Falha ao carregar: ' + err))
  }

  function handleFileUpload(file) {
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => {
      const norm = normalizeRecords(res.data, file.name)
      setFilename(file.name)
      setRecords(norm)
      groupByRequest(norm)
    }})
  }

  function groupByRequest(norm) {
    const map = {}
    // initial grouping by explicit requestId
    for (const ev of norm) {
      if (!ev.requestId) continue
      if (!map[ev.requestId]) map[ev.requestId] = []
      map[ev.requestId].push(ev)
    }

    // Precompute list of all records to allow expansion
    const all = norm

    // helper to extract UUID-like tokens (requestIds) and 24-hex mongo ids
    const uuidRe = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g
    const objIdRe = /\b[0-9a-fA-F]{24}\b/g

    // expand each map entry by finding related records that mention any token seen in the group's messages
    for (const reqId of Object.keys(map)) {
      const group = map[reqId]
      const tokens = new Set()
      // collect tokens from group's messages
      for (const e of group) {
        const m1 = e.message && e.message.match(uuidRe)
        const m2 = e.message && e.message.match(objIdRe)
        if (m1) for (const t of m1) tokens.add(t)
        if (m2) for (const t of m2) tokens.add(t)
      }
      // always include the requestId itself
      tokens.add(reqId)

      // find other records that include any token and add them to the group
      for (const candidate of all) {
        if (candidate === undefined) continue
        // skip if already included
        if (group.includes(candidate)) continue
        const text = (candidate.message || candidate.raw || '')
        for (const t of tokens) {
          if (!t) continue
          if (text && text.indexOf(t) !== -1) {
            group.push(candidate)
            break
          }
        }
      }

      // sort group's events by time (nulls at end)
      group.sort((a,b) => {
        if (!a.time && !b.time) return 0
        if (!a.time) return 1
        if (!b.time) return -1
        return a.time - b.time
      })

      // If present, attach the latest mystack_mongo event that occurs after the group's start
      try {
        const groupStart = group.find(e => e.time && e.time instanceof Date)?.time
        if (groupStart) {
          // tighten the mongo-attach heuristic:
          // - only consider mongo events within a shorter window (30s)
          // - and only attach if the mongo event appears to reference the same request (requestId or any token)
          const MAX_WINDOW_MS = 30 * 1000 // 30 seconds (was 2 minutes)
          const mongoCandidates = all.filter(c => c.service === 'mystack_mongo' && c.time && c.time instanceof Date && c.time.getTime() >= groupStart.getTime() && c.time.getTime() <= groupStart.getTime() + MAX_WINDOW_MS && !group.includes(c))
          if (mongoCandidates.length) {
            // prefer candidates that explicitly mention the requestId or other tokens we collected
            const preferred = mongoCandidates.filter(c => {
              const text = (c.message || c.raw || '')
              if (!text) return false
              // direct requestId match
              if (text.indexOf(reqId) !== -1) return true
              // any other token seen in the group
              for (const t of tokens) {
                if (!t) continue
                if (text.indexOf(t) !== -1) return true
              }
              return false
            })
            const chosen = (preferred.length ? preferred : mongoCandidates)
            // pick the latest mongo event among the chosen set
            chosen.sort((a,b) => a.time - b.time)
            const lastMongo = chosen[chosen.length - 1]
            // only attach if the chosen candidate is reasonably close (defensive check)
            if (lastMongo && (lastMongo.time.getTime() - groupStart.getTime()) <= MAX_WINDOW_MS) {
              group.push(lastMongo)
              // keep group sorted
              group.sort((a,b) => {
                if (!a.time && !b.time) return 0
                if (!a.time) return 1
                if (!b.time) return -1
                return a.time - b.time
              })
            }
          }
        }
      } catch (ex) {
        // ignore safety exceptions
      }

      map[reqId] = group
    }

    setGrouped(map)
  }

  const requestList = Object.entries(grouped).map(([id, evs]) => {
    const start = evs.find(e => e.time)?.time
    const end = evs.slice().reverse().find(e => e.time)?.time
    const duration = start && end ? (end - start) : null
    return { id, count: evs.length, duration }
  }).sort((a,b) => (b.duration || 0) - (a.duration || 0))

  // compute overall CSV-level start/end using grouped requests
  let overallStartMs = null
  let overallEndMs = null
  for (const evs of Object.values(grouped)) {
    if (!evs || !evs.length) continue
    // group's first time (prefer e.time then rawTimestamp)
    const first = evs.find(e => e.time) || evs[0]
    const last = evs.slice().reverse().find(e => e.time) || evs[evs.length-1]
    const firstMs = first && first.time ? first.time.getTime() : (first && first.rawTimestamp ? parseIsoToMs(String(first.rawTimestamp)) : null)
    const lastMs = last && last.time ? last.time.getTime() : (last && last.rawTimestamp ? parseIsoToMs(String(last.rawTimestamp)) : null)
    if (firstMs != null) overallStartMs = overallStartMs == null ? firstMs : Math.min(overallStartMs, firstMs)
    if (lastMs != null) overallEndMs = overallEndMs == null ? lastMs : Math.max(overallEndMs, lastMs)
  }
  const overallStartDisplay = overallStartMs != null ? new Date(overallStartMs).toISOString() : '—'
  const overallEndDisplay = overallEndMs != null ? new Date(overallEndMs).toISOString() : '—'
  const overallTotalMs = (overallStartMs != null && overallEndMs != null) ? Math.round(overallEndMs - overallStartMs) : null

  // Current code contains a 'with optimization' example block with hardcoded values.
  // Keep a variable for the optimized totals so we can compare them in a chart.
  // These values match the hardcoded example shown in the UI; later we can compute them dynamically.
  const optimizedStartExample = '2025-11-21T10:54:40.465Z'
  const optimizedEndExample = '2025-11-21T10:55:32.054Z'
  const optimizedTotalMs = 50127
  const optimizedStartDisplay = optimizedStartExample
  const optimizedEndDisplay = optimizedEndExample

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const drawer = (
    <div>
      <Toolbar />
      <Divider />
      <Box sx={{p:2}}>
        <CSVLoader files={files} onLoadServer={handleLoadFromServer} onUpload={handleFileUpload} />
      </Box>
      <Divider />
    </div>
  )

  return (
    <><Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">Dashboard - Performance Evaluation of Microservices</Typography>
          <Box sx={{ flex: 1 }} />
          <Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload</Button>
        </Toolbar>
      </AppBar>
    <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={handleDrawerToggle} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }} open>
          {drawer}
        </Drawer>
      </Box><Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Typography variant="h5">Dashboard viewer</Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Paper sx={{ p: 2, minWidth: 200 }}>
            <Typography variant="subtitle2">CSV</Typography>
            <Typography variant="body2">{filename || 'nenhum'}</Typography>
          </Paper>
          <Paper sx={{ p: 2, minWidth: 200 }}>
            <Typography variant="subtitle2">Requests</Typography>
            <Typography variant="body2">{Object.keys(grouped).length}</Typography>
          </Paper>
          <Paper sx={{ p: 2, minWidth: 200 }}>
            <Typography variant="subtitle2">Events</Typography>
            <Typography variant="body2">{records.length}</Typography>
          </Paper>
        </Box>

        <Box sx={{ mt: 3 }}>
          {selectedRequest && grouped[selectedRequest] ? (
            <>
              <RequestDetails events={grouped[selectedRequest]} serviceFlow={SERVICE_FLOW} />
              <Box sx={{ mt: 2 }}>
                <RequestTimeline events={grouped[selectedRequest]} serviceFlow={SERVICE_FLOW} />
              </Box>
            </>
          ) : (
            // when no specific request selected, show CSV-level summary if a file is loaded
            filename ? (
              <>
              <Paper sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle1">Performance without optimization</Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <Box>
                      <Typography variant="caption">First request</Typography>
                      <Typography variant="body2">{overallStartDisplay}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption">Last request</Typography>
                      <Typography variant="body2">{overallEndDisplay}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption">Total</Typography>
                      <Typography variant="body2">{overallTotalMs != null ? overallTotalMs + ' ms' : '—'}</Typography>
                    </Box>
                  </Box>
                </Paper>
                <Paper sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle1">Performance with optimization</Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <Box>
                      <Typography variant="caption">First request</Typography>
                      <Typography variant="body2">{optimizedStartDisplay}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption">Last request</Typography>
                      <Typography variant="body2">{optimizedEndDisplay}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption">Total</Typography>
                      <Typography variant="body2">{optimizedTotalMs != null ? optimizedTotalMs + ' ms' : '—'}</Typography>
                    </Box>
                  </Box>
                </Paper>
                <Paper sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle2">Comparison</Typography>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: 520 }}>
                    {(() => {
                      const a = overallTotalMs || 0
                      const b = optimizedTotalMs || 0
                      const max = Math.max(a, b, 1)
                      const pctA = Math.round((a / max) * 100)
                      const pctB = Math.round((b / max) * 100)
                      return (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 120 }}><Typography variant="caption">Without optimization</Typography><div style={{ fontSize: 12 }}>{a ? a + ' ms' : '—'}</div></div>
                            <div style={{ flex: 1, background: '#f1f5f9', height: 20, borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${pctA}%`, height: '100%', background: '#2f86eb' }} />
                            </div>
                            <div style={{ width: 48, textAlign: 'right' }}><Typography variant="caption">{pctA}%</Typography></div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 120 }}><Typography variant="caption">With optimization</Typography><div style={{ fontSize: 12 }}>{b ? b + ' ms' : '—'}</div></div>
                            <div style={{ flex: 1, background: '#f1f5f9', height: 20, borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${pctB}%`, height: '100%', background: '#10b981' }} />
                            </div>
                            <div style={{ width: 48, textAlign: 'right' }}><Typography variant="caption">{pctB}%</Typography></div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </Paper>
              </>
            ) : (
              <Paper sx={{ p: 2 }}><Typography>Selecione um request no painel lateral.</Typography></Paper>
            )
          )}

          {filename ? (
            <Paper sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle1">All Requests</Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start', maxHeight: 480, overflowY: 'auto', pb: 1 }}>
                {requestList.slice(0, 50).map(r => (
                  <Paper key={r.id} sx={{ p: 1, minWidth: 220, cursor: 'pointer', flex: '0 0 auto' }} onClick={() => setSelectedRequest(r.id)}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.id}</Typography>
                    <Typography variant="caption">{r.duration ? Math.round(r.duration) + ' ms' : '—'} • {r.count} events</Typography>
                  </Paper>
                ))}
              </Box>
            </Paper>
          ) : null}
        </Box>
      </Box></Box></>
  )
}
