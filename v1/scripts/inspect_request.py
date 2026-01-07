import csv
from pathlib import Path
import sys
p = Path(__file__).resolve().parents[1] / '..' / 'csv' / 'converted' / '2025-11-21T10:54.csv'
p = p.resolve()
import os
if not p.exists():
    print('CSV not found at', p)
    sys.exit(1)

target = sys.argv[1] if len(sys.argv)>1 else 'b69c7c19-8808-411c-813b-deaaa6b55295'
rows = []
with open(p, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, fieldnames=['vm','timestamp','service','message','requestId'])
    for row in reader:
        rows.append(row)

# filter
evs = [r for r in rows if r.get('requestId')==target]
if not evs:
    print('No events for', target)
    # try to show unique request ids present
    ids = set(r.get('requestId') for r in rows if r.get('requestId'))
    print('Some ids sample:', list(ids)[:10])
    sys.exit(0)

print('Events count:', len(evs))

serviceFlow = ['mystack_user-publication-service','mystack_user-auth-service','mystack_user-publication-service','mystack_get-data','mystack_optimize-data','mystack_upload-data','mystack_mongo']
byService = {}
for e in evs:
    svc = e.get('service')
    if not svc: continue
    byService.setdefault(svc, []).append(e)

from datetime import datetime

def parseTime(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
    except Exception:
        return None

segments=[]
seen=set()
for svc in serviceFlow:
    if svc in seen: continue
    seen.add(svc)
    items = byService.get(svc, [])
    times = [parseTime(it['timestamp']) for it in items]
    times = [t for t in times if t is not None]
    start = min(times) if times else None
    end = max(times) if times else None
    segments.append({'service':svc,'start':start,'end':end,'items':items})

sumDur = 0
print('\nPer-service:')
for s in segments:
    dur = int(s['end']-s['start']) if s['start'] and s['end'] else 0
    print(s['service'], 'start=', s['start'] and datetime.utcfromtimestamp(s['start']/1000).isoformat()+'Z' or '—', 'end=', s['end'] and datetime.utcfromtimestamp(s['end']/1000).isoformat()+'Z' or '—', 'dur=', dur)
    sumDur += dur
print('Sum of durations:', sumDur, 'ms')

# non overlapping
intervals = [[s['start'], s['end']] for s in segments if s['start'] and s['end']]
intervals = sorted(intervals, key=lambda x:x[0])
if intervals:
    merged=[]
    cur = intervals[0][:]
    acc=0
    for it in intervals[1:]:
        if it[0] <= cur[1]:
            cur[1] = max(cur[1], it[1])
        else:
            acc += cur[1]-cur[0]
            cur = it[:]
    acc += cur[1]-cur[0]
    print('Non-overlapping total:', int(acc), 'ms')

print('\nSample events:')
for e in evs[:20]:
    print(e['timestamp'], e['service'], e['message'])
