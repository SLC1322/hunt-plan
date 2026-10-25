# hunt-plan

A single-page field guide that loads its content from `plan.json`.

## Files

| File | What it does | Edit it? |
|---|---|---|
| `index.html` | The page: layout, colors, tabs, night mode. Reads `plan.json` and draws it. | Only the color block at the top |
| `plan.json` | The data: dates, conditions, steps, cards. Replaced on each update. | By the update job only |
| `validate.js` | Checks `plan.json` before publishing. Blocks unsafe or identifying content. | No |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are. | No |

## Update rule

1. Write the new `plan.json`.
2. Run `HUNT_BLOCK_TERMS="<private word list>" node validate.js plan.json`.
   The word list is kept outside this repo. The check fails if it is missing.
3. Commit and push only if it prints `OK`.

## Data shape (schema 1)

`plan.json` holds `schema`, `generated` (ISO date-time) and `hunts` (1 to 4 entries in date order).
Each hunt holds `date`, `label`, `subtitle`, optional `rules`, `conditions`, `wind`, `safe_arc`,
`in_season`, `plan`, `load`, `animals`, `skill`, `land`, `safety`, `regs` and `gaps`.
`validate.js` is the exact definition. Text may use `**bold**` and nothing else.
