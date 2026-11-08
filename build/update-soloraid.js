// Solo raid top-50 decks (Korean server) from Let's Doro, aggregated per season.
// Usage: node build/update-soloraid.js   -> writes build/src/soloraid_rank.json, then run build.js
// The API does not allow calls from other websites (CORS), so the page reads this snapshot instead.
const fs = require("fs");
const path = require("path");
const API = "https://api3.letsdoro.com/api/soloraid";
const SERVER = "KR";
const EL = { FIRE: "Fire", WATER: "Water", WIND: "Wind", ELECTRONIC: "Electric", ELECTRIC: "Electric", IRON: "Iron" };
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": "nikke-helper (github.com/Gomdolski/nikke-helper)" } }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const seasons = (await get(`${API}/seasons`)).sort((a, b) => b.seasonNumber - a.seasonNumber);
  const out = { at: new Date().toISOString().slice(0, 10), source: "https://letsdoro.com/soloraid", server: SERVER, current: null, seasons: {} };
  for (const s of seasons) {
    const j = await get(`${API}/seasons/${s.id}/ranking?server=${SERVER}`);
    await sleep(800); // be gentle: one request per season, once a week
    const meta = { boss: s.bossName, weak: EL[s.bossWeakElement] || null, start: s.startDate, end: s.endDate };
    if (!out.current) out.current = { season: s.seasonNumber, ...meta, dataSeason: j.fallbackSeason ? j.fallbackSeason.seasonNumber : s.seasonNumber };
    if (j.fallbackSeason || j.seasonId !== s.id || !Array.isArray(j.rankings) || !j.rankings.length) continue; // no data yet
    const combos = new Map(), usage = new Map();
    for (const p of j.rankings) {
      const used = new Set();
      for (const q of p.squads || []) {
        const m = (q.nikkes || []).map((n) => n.nikkeName).filter(Boolean);
        if (m.length !== 5) continue;
        const key = [...m].sort().join("|");
        const c = combos.get(key) || { m, n: 0, dmg: 0, best: p.rank };
        c.n++; c.dmg += q.damage || 0; c.best = Math.min(c.best, p.rank); combos.set(key, c);
        m.forEach((x) => used.add(x));
      }
      used.forEach((x) => usage.set(x, (usage.get(x) || 0) + 1));
    }
    out.seasons[s.seasonNumber] = {
      ...meta, raidDate: j.raidDate, players: j.rankings.length,
      combos: [...combos.values()].sort((a, b) => b.n - a.n || b.dmg / b.n - a.dmg / a.n).slice(0, 20).map((c) => ({ m: c.m, n: c.n, avg: Math.round(c.dmg / c.n), best: c.best })),
      usage: [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
      top: j.rankings.slice(0, 3).map((p) => ({ rank: p.rank, total: p.totalDamage, sq: (p.squads || []).map((q) => ({ m: (q.nikkes || []).map((n) => n.nikkeName), d: q.damage })) })),
    };
  }
  fs.writeFileSync(path.join(__dirname, "src", "soloraid_rank.json"), JSON.stringify(out, null, 1));
  console.log("solo raid ranking: current S" + out.current.season, "(data from S" + out.current.dataSeason + ")", "· seasons with data:", Object.keys(out.seasons).join(", "));
})();
