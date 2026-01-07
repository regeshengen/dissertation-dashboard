const fs = require('fs')
const path = require('path')
const csv = fs.readFileSync(path.resolve(__dirname, '../../csv/converted/2025-11-21T10:54.csv'), 'utf8')
const lines = csv.split('\n').filter(Boolean)
const header = lines.shift().split(',')
const rows = lines.map(l => {
  // split only first 5 columns (message may contain commas)
  const parts = l.split(',')
  const vm = parts[0]
  const timestamp = parts[1]
  const service = parts[2]
  const message = parts.slice(3, parts.length-1).join(',')
  const requestId = parts[parts.length-1]
  return { vm, timestamp, service, message, requestId }
})

function parseTime(t) {
  if (!t) return null
  const d = new Date(t)
  if (isNaN(d)) return null
  return d.getTime()
}

const target = process.argv[2] || 'b69c7c19-8808-411c-813b-deaaa6b55295'
const evs = rows.filter(r => r.requestId === target)
if (!evs.length) { console.log('No events for', target); process.exit(0) }
console.log('Events count:', evs.length)
const serviceFlow = [
  'mystack_user-publication-service','mystack_user-auth-service','mystack_user-publication-service','mystack_get-data','mystack_optimize-data','mystack_upload-data','mystack_mongo'
]

const byService = {}
for (const e of evs) {
  if (!e.service) continue
  if (!byService[e.service]) byService[e.service] = []
  byService[e.service].push(e)
}

const segments = []
const seen = new Set()
for (const svc of serviceFlow) {
  if (seen.has(svc)) continue
  seen.add(svc)
  const items = byService[svc] || []
  const times = items.map(i => parseTime(i.timestamp)).filter(t => t != null)
  const start = times.length ? Math.min(...times) : null
  const end = times.length ? Math.max(...times) : null
  segments.push({ service: svc, start, end, items })
}

function sumMergedIntervals(intervals) {
  const iv = intervals.filter(i => i[0] != null && i[1] != null).map(i => [i[0], i[1]]).sort((a,b)=>a[0]-b[0])
  if (!iv.length) return 0
  let cur = iv[0].slice()
  let acc = 0
  for (let i=1;i<iv.length;i++){
    const s = iv[i]
    if (s[0] <= cur[1]) {
      cur[1] = Math.max(cur[1], s[1])
    } else {
      acc += cur[1]-cur[0]
      cur = s.slice()
    }
  }
  acc += cur[1]-cur[0]
  return acc
}

console.log('\nPer-service:')
let sumDur = 0
for (const s of segments) {
  const dur = (s.start!=null && s.end!=null) ? (s.end - s.start) : 0
  console.log(s.service, 'start=', s.start ? new Date(s.start).toISOString() : '—', 'end=', s.end ? new Date(s.end).toISOString() : '—', 'dur=', dur)
  sumDur += dur
}
console.log('Sum of durations:', sumDur, 'ms')
const nonOverlap = sumMergedIntervals(segments.map(s => [s.start, s.end]))
console.log('Non-overlapping total:', nonOverlap, 'ms')

// print events for inspection
console.log('\nEvents:')
for (const e of evs) console.log(e.timestamp, e.service, e.message)
