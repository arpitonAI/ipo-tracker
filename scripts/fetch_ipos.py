#!/usr/bin/env python3
"""Fetch current/upcoming/recent IPOs from NSE public pages into data/ipos.json.
Polite: ~1 request per active IPO + 4 list requests per run. Keeps previous data on failure."""
import json, re, time, os, sys, http.cookiejar, urllib.request
from datetime import datetime, timedelta, timezone
IST = timezone(timedelta(hours=5, minutes=30))
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'ipos.json')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(path):
    r = urllib.request.Request('https://www.nseindia.com' + path, headers={'User-Agent': UA, 'Accept': 'application/json,text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'})
    for i in range(3):
        try:
            with op.open(r, timeout=25) as f: return f.read().decode('utf-8', 'replace')
        except Exception as e:
            err = e; time.sleep(2 + i * 3)
    raise err
def jget(path):
    t = get(path); time.sleep(1.2); return json.loads(t)
def d(s):
    for f in ('%d-%b-%Y', '%d-%B-%Y'):
        try: return datetime.strptime(s.strip().title(), f).date().isoformat()
        except Exception: pass
    return None
def band(s):
    n = [float(x.replace(',', '')) for x in re.findall(r'[\d,]+(?:\.\d+)?', s or '')]
    return (n[0], n[-1]) if n else (None, None)
def num(s):
    try: return float(str(s).replace(',', ''))
    except Exception: return None
CAT = [('qib', r'^Qualified Institutional'), ('bhni', r'more than Ten Lakh'), ('shni', r'more than Two Lakh'), ('nii', r'^Non Institutional Investors$'), ('retail', r'^Retail Individual'), ('employee', r'^Employees'), ('shareholder', r'^Shareholders?'), ('total', r'^Total')]
def detail(sym, series):
    j = jget(f'/api/ipo-detail?symbol={sym}&series={series}')
    info = {x.get('title'): str(x.get('value') or '').strip('"') for x in (j.get('issueInfo') or {}).get('dataList', [])}
    lot = re.search(r'([\d,]+)\s*Equity Shares', info.get('Bid Lot') or info.get('Lot Size') or info.get('Minimum Order Quantity') or '')
    plo, phi = band(info.get('Price Range'))
    act = j.get('activeCat') or {}
    sub = {}
    for row in act.get('dataList', [])[1:] or j.get('bidDetails', []):
        name = (row.get('category') or '').strip(); x = num(row.get('noOfTotalMeant', row.get('noOfTime')))
        if x is None or not num(row.get('noOfShareOffered', row.get('noOfSharesOffered'))): continue  # SME pages give no per-category reservation
        for k, rx in CAT:
            if re.search(rx, name, re.I) and k not in sub: sub[k] = round(x, 2); break
    upd = (act.get('updateTime') or '').replace('Updated as on', '').strip()
    try: upd = datetime.strptime(upd, '%d-%b-%Y %H:%M:%S').replace(tzinfo=IST).isoformat()
    except Exception: upd = None
    return {'priceLow': plo, 'priceHigh': phi, 'lot': int(lot.group(1).replace(',', '')) if lot else None, 'retailMax': info.get('Maximum Subscription Amount for Retail Investor'),
            'registrar': info.get('Name of the Registrar'), 'subscription': sub or None, 'subscriptionUpdated': upd}
def main():
    old = {}
    try: old = {x['id']: x for x in json.load(open(OUT))['ipos']}
    except Exception: pass
    get('/market-data/all-upcoming-issues-ipo'); time.sleep(1.5)  # cookie warm-up
    today = datetime.now(IST).date()
    items = {}
    for path in ('/api/ipo-current-issue', '/api/all-upcoming-issues?category=ipo'):
        for x in jget(path):
            s = x.get('series') or 'EQ'
            if s not in ('EQ', 'SME', 'BE'): continue
            lo, hi = band(x.get('issuePrice'))
            items[x['symbol']] = {'id': x['symbol'], 'symbol': x['symbol'], 'series': 'SME' if s == 'SME' else 'EQ', 'name': x['companyName'], 'type': 'SME' if s == 'SME' else 'Mainboard',
                                  'open': d(x['issueStartDate']), 'close': d(x['issueEndDate']), 'priceLow': lo, 'priceHigh': hi, 'issueSizeShares': num(x.get('issueSize')), 'totalTimes': num(x.get('noOfTime'))}
    for x in jget('/api/public-past-issues'):
        st = x.get('securityType')
        if st not in ('EQ', 'SME', 'BE'): continue
        cl = d(x.get('ipoEndDate', ''))
        if not cl or (today - datetime.fromisoformat(cl).date()).days > 14 or x['symbol'] in items: continue
        lo, hi = band(x.get('priceRange'))
        items[x['symbol']] = {'id': x['symbol'], 'symbol': x['symbol'], 'series': 'SME' if st == 'SME' else 'EQ', 'name': x.get('companyName') or x.get('company'), 'type': 'SME' if st == 'SME' else 'Mainboard',
                              'open': d(x.get('ipoStartDate', '')), 'close': cl, 'listing': d(x.get('listingDate', '')), 'priceLow': lo, 'priceHigh': hi, 'issuePrice': num(x.get('issuePrice'))}
    for k, it in items.items():
        o = old.get(k, {})
        for f in ('lot', 'subscription', 'subscriptionUpdated', 'retailMax', 'registrar', 'listing'):
            if it.get(f) is None and o.get(f) is not None: it[f] = o[f]
        st = 'upcoming' if it['open'] and it['open'] > today.isoformat() else 'closed' if it['close'] and it['close'] < today.isoformat() else 'open'
        it['status'] = st
        # detail only when open, or upcoming / just-closed and still missing data (keeps requests low)
        if st == 'open' or not it.get('lot') or (st == 'closed' and it['close'] >= (today - timedelta(days=1)).isoformat()):
            try: it.update({a: b for a, b in detail(it['symbol'], 'SME' if it['series'] == 'SME' else 'EQ').items() if b is not None})
            except Exception as e: print('detail failed', k, e, file=sys.stderr)
    for it in items.values():
        tt = it.pop('totalTimes', None)
        if it['type'] == 'SME' and it.get('subscription'):
            it['subscription'] = {k: v for k, v in it['subscription'].items() if k == 'total' and v} or None
        if tt is not None and not (it.get('subscription') or {}).get('total'):
            it['subscription'] = dict(it.get('subscription') or {}, total=round(tt, 2))
    out = {'source': 'NSE India public IPO pages (nseindia.com)', 'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'ipos': sorted(items.values(), key=lambda x: (x['status'] != 'open', x['status'] != 'upcoming', x['close'] or ''))}
    if not items: sys.exit('no IPOs fetched; keeping old file')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), indent=1)
    print(len(items), 'IPOs written')
main()
