import json

ids = json.load(open('./ids.json'))

group = next(filter(lambda group: group['name'] == 'devnet.2', ids['groups']))

perp_markets = group['perpMarkets']

entries = list(map(lambda perp_market: {'name': perp_market['name'], 'event_queue': perp_market['eventsKey']}, perp_markets))

print(json.dumps({'markets': entries}))