import csv
from pathlib import Path
from datetime import datetime
p = Path(__file__).resolve().parents[1] / '..' / 'csv' / 'converted' / '2025-11-21T10:54.csv'
p = p.resolve()
if not p.exists():
    print('CSV not found at', p)
    raise SystemExit(1)

rows = []
with open(p, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, fieldnames=['vm','timestamp','service','message','requestId'])
    for row in reader:
        rows.append(row)

# collect by request id
from collections import defaultdict
byReq = defaultdict(list)
for r in rows:
    rid = r.get('requestId')
    if not rid:
        continue
    byReq[rid].append(r)


def parse_ts(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000
    except:
        return None


problematic = []
for rid, evs in byReq.items():
    # per-service start/end
    perSvc = {}
    for e in evs:
        svc = e.get('service')
        if not svc: continue
        t = parse_ts(e.get('timestamp'))
        if t is None: continue
        s = perSvc.setdefault(svc, {'min':None,'max':None,'count':0})
        s['count'] += 1
        if s['min'] is None or t < s['min']: s['min'] = t
        if s['max'] is None or t > s['max']: s['max'] = t
    sumDur = 0
    starts = []
    ends = []
    for svc,info in perSvc.items():
        if info['min'] is not None and info['max'] is not None:
            dur = max(0, info['max'] - info['min'])
            sumDur += dur
            starts.append(info['min'])
            ends.append(info['max'])
    span = 0
    if starts and ends:
        span = max(ends) - min(starts)
    # record if span much larger than sumDur (factor) or span > 5000ms
    if span > max(5000, sumDur * 5):
        problematic.append((rid, int(span), int(sumDur), len(evs)))

# sort and print
problematic.sort(key=lambda x: x[1], reverse=True)
print('Found', len(problematic), 'problematic requests (span >> sumDur or span>5s)')
for rid,span,sumDur,count in problematic[:50]:
    print(rid, 'span=', span, 'ms', 'sumDur=', sumDur, 'ms', 'events=', count)
