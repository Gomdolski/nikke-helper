// Solo raid top-50 decks (Korean server) from Let's Doro, aggregated per season.
// Usage: node build/update-soloraid.js            -> all seasons (weekly update)
//        node build/update-soloraid.js --current  -> only the newest season, merged into the saved file (raid-time refresh)
// Writes build/src/soloraid_rank.json, then run build.js.
// The API does not allow calls from other websites (CORS), so the page reads this snapshot instead.
// Last output line is a status word for build/raid-refresh.js: UPDATED / UNCHANGED / OUTSIDE / NODATA / ERROR.
const fs = require("fs");
const path = require("path");
const API = "https://api3.letsdoro.com/api/soloraid";
const SERVER = "KR";
const FILE = path.join(__dirname, "src", "soloraid_rank.json");
const EL = { FIRE: "Fire", WATER: "Water", WIND: "Wind", ELECTRONIC: "Electric", ELECTRIC: "Electric", IRON: "Iron" };
const get = async (u) => { const r = await fetch(u, { headers: { "User-Agent": "nikke-helper (github.com/Gomdolski/nikke-helper)" } }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDay = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);

function summarize(j, meta) {
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
  return {
    ...meta, raidDate: j.raidDate, players: j.rankings.length,
    combos: [...combos.values()].sort((a, b) => b.n - a.n || b.dmg / b.n - a.dmg / a.n).slice(0, 20).map((c) => ({ m: c.m, n: c.n, avg: Math.round(c.dmg / c.n), best: c.best })),
    usage: [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    top: j.rankings.slice(0, 3).map((p) => ({ rank: p.rank, total: p.totalDamage, sq: (p.squads || []).map((q) => ({ m: (q.nikkes || []).map((n) => n.nikkeName), d: q.damage })) })),
  };
}

(async () => {
  const onlyCurrent = process.argv.includes("--current");
  const seasons = (await get(`${API}/seasons`)).sort((a, b) => b.seasonNumber - a.seasonNumber);
  const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : null;
  const out = { at: kstToday(), source: "https://letsdoro.com/soloraid", server: SERVER, current: null, seasons: onlyCurrent && prev ? { ...prev.seasons } : {} };
  let changed = false;
  for (const s of onlyCurrent ? seasons.slice(0, 1) : seasons) {
    const meta = { boss: s.bossName, weak: EL[s.bossWeakElement] || null, start: s.startDate, end: s.endDate };
    if (onlyCurrent) {
      // a season's ranking keeps changing until the day after it ends
      const t = kstToday();
      if (t < s.startDate || t > addDay(s.endDate, 1)) { console.log(`S${s.seasonNumber} ${s.startDate}~${s.endDate} 기간 아님`); console.log("OUTSIDE"); return; }
    }
    const j = await get(`${API}/seasons/${s.id}/ranking?server=${SERVER}`);
    await sleep(800); // be gentle: one request per season
    const hasData = !j.fallbackSeason && j.seasonId === s.id && Array.isArray(j.rankings) && j.rankings.length > 0;
    if (!out.current) out.current = { season: s.seasonNumber, ...meta, dataSeason: hasData ? s.seasonNumber : j.fallbackSeason ? j.fallbackSeason.seasonNumber : (prev && prev.current && prev.current.season === s.seasonNumber && prev.current.dataSeason) || s.seasonNumber };
    if (!hasData) continue; // no data yet
    const old = prev && prev.seasons[s.seasonNumber];
    if (!old || old.raidDate !== j.raidDate || old.players !== j.rankings.length) changed = true;
    out.seasons[s.seasonNumber] = summarize(j, meta);
  }
  if (onlyCurrent && !changed) {
    const cur = out.seasons[out.current.season];
    console.log(cur ? `S${out.current.season} 기록 ${cur.raidDate} 그대로` : `S${out.current.season} 아직 기록 없음`);
    console.log(cur ? "UNCHANGED" : "NODATA");
    return;
  }
  fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
  console.log("solo raid ranking: current S" + out.current.season, "(data from S" + out.current.dataSeason + ")", "· seasons with data:", Object.keys(out.seasons).join(", "));
  if (onlyCurrent) console.log(`S${out.current.season} 기록 ${out.seasons[out.current.season].raidDate}`);
  console.log("UPDATED");
})().catch((e) => { console.error(e.message); console.log("ERROR"); process.exitCode = 1; });
