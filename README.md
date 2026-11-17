# token-radar-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/RizqiSeijuuro/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/RizqiSeijuuro/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads DefiLlama's sealed protocol snapshot, scores every protocol that records
no token yet with a "ripeness" model (TVL x category multiple x growth x age-ripeness x discovery), ranks
them by implied value, and renders a static dashboard — a sortable/filterable board, a per-protocol detail
view with a concrete farm plan, and a "the model" page explaining the math. No protocol is hand-picked:
the same formula scores every row from the snapshot's own ten fields.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

This writes `out/board.json` (the ranked rows), `out/data.js` (the dashboard's dataset), copies
`dashboard/` and `screenshots/` into `out/`, and writes `out/dossier.json` last. Open `out/dashboard/index.html`
in a browser to use the board, filter it, and open a protocol's detail view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sage-marten-66&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
