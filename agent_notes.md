# Warborne Builds — how to fetch via Playwright (Codex MCP)

- Script: `playwright_fetch.js` (uses Playwright Firefox headless)
- Command (requires network permission in this env):  
  `node playwright_fetch.js https://www.warbornebuilds.com/`
- Environment today: `workspace-write`, network `restricted`, approval `on-request`; if sandbox blocks, rerun with `with_escalated_permissions: true`.
- Output: prints full HTML (`page.content()`) of the loaded page; site is Next.js so assets live under `/_next/static/...`.
- Located in: `/home/ivo/Downloads/warborne_suport_station`.

Use this exact flow whenever we need to pull warbornebuilds.com content through MCP/Playwright in Codex.

## Data scrape (reference)

- Global mastery per-level bonuses (tooltips on drifter page):
  - Strength: Max HP Bonus +0.25%, Base Damage & Healing Bonus +0.05%, Damage Bonus (PvE) +0.1%, Block +0.5, Control Resistance +0.1
  - Dexterity: Attack Speed Bonus +0.18%, Critical Rate +0.05%, Physical Damage Bonus +0.25%, Tenacity Penetration +0.15, Armor +0.15
  - Intelligence: MP +0.5, Casting Speed Bonus +0.3%, Skill Cooldown Rate Bonus +0.06%, Magic Damage Bonus +0.25%, Healing Bonus +0.25%, Magic Resistance +0.15

- Drifter slugs (from /drifters listing) for batch pulls: 3a, 3b, 3c, 3f, 3g, 3h, 3i, 3j, 3k, 3l, 3m, 3n, 3o, 3T, 3U, 3V, 3W, 3X, 3Y, 3Z, 4l, 4n, 4o, 4p, 4q, 4r, 4s, 4t, 4u, sw, t.

- Example scrape: Aegis (`/drifters/4q`, assumed tier1 level1)
  - Base attributes: STR 30 (+2.2/level), DEX 15 (+0.5/level), INT 15 (+1.4/level)
  - Drifter stats: Armor 2.2; Block 15; Magic Resistance 2.2; Control Resistance 3; Max HP Bonus 7.5%; Max MP Bonus 2.7%; Critical Rate 0.75%; Damage Bonus (PvE) 3%; Magic Damage Bonus 3.7%; Physical Damage Bonus 3.7%; Attack Speed Bonus 2.7%; Casting Speed Bonus 4.5%; Skill Cooldown Rate Bonus 0.9%; Healing Bonus 3.7%; Tenacity Penetration 2.2%; Movement Speed 5 m/sec
  - Support station: Bonus Damage Resistance (PvE) +3.23%; Malus Damage Bonus (PvE) -2.15%
  - Links: Powerhouse (needs 3: Overdrive, Raven, Aegis) → Boosts Agility by 10. Strike Team (needs 2: Kyra, Varnax, Draknor, Aegis) → Increases Crowd Control Resistance by 5.

Next: batch fetch the remaining drifter slugs, parse `drifterStats` from the page HTML, and populate our JSONs.
