// Solo raid top-50 decks per server (KR, JP, GLOBAL, NA, SEA) from Let's Doro, aggregated per season.
// Let's Doro only keeps the top 50 of each server.
// Usage: node build/update-soloraid.js            -> all seasons (weekly update)
//        node build/update-soloraid.js --current  -> only the newest season, merged into the saved file (raid-time refresh)
// Writes build/src/soloraid_rank.json, then run build.js.
// The API does not allow calls from other websites (CORS), so the page reads this snapshot instead.
// Last output line is a status word for build/raid-refresh.js: UPDATED / UNCHANGED / OUTSIDE / NODATA / ERROR.
const fs = require("fs");
const path = require("path");
const API = "https://api3.letsdoro.com/api/soloraid";
const SERVER = "KR";
const OTHERS = ["JP", "GLOBAL", "NA", "SEA"]; // shown as tabs on the page, loaded on demand
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
    ...meta, raidDate: j.raidDate, collected: j.createdAt || null, players: j.rankings.length,
    combos: [...combos.values()].sort((a, b) => b.n - a.n || b.dmg / b.n - a.dmg / a.n).slice(0, 30).map((c) => ({ m: c.m, n: c.n, avg: Math.round(c.dmg / c.n), best: c.best })),
    usage: [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    top: j.rankings.slice(0, 3).map((p) => ({ rank: p.rank, total: p.totalDamage, sq: (p.squads || []).map((q) => ({ m: (q.nikkes || []).map((n) => n.nikkeName), d: q.damage })) })),
  };
}

(async () => {
  const onlyCurrent = process.argv.includes("--current");
  const seasons = (await get(`${API}/seasons`)).sort((a, b) => b.seasonNumber - a.seasonNumber);
  const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : null;
  const keep = (sv) => (onlyCurrent && prev ? { ...((sv === SERVER ? prev : (prev.others || {})[sv]) || {}).seasons } : {});
  // Korean server stays at the top level (the page embeds it); other servers go under "others".
  const out = { at: kstToday(), source: "https://letsdoro.com/soloraid", server: SERVER, current: null, seasons: keep(SERVER), others: {} };
  for (const sv of OTHERS) out.others[sv] = { seasons: keep(sv) };
  const list = onlyCurrent ? seasons.slice(0, 1) : seasons;
  if (onlyCurrent) {
    // a season's ranking keeps changing until the day after it ends
    const s = list[0], t = kstToday();
    if (t < s.startDate || t > addDay(s.endDate, 1)) { console.log(`S${s.seasonNumber} ${s.startDate}~${s.endDate} 기간 아님`); console.log("OUTSIDE"); return; }
  }
  const changed = [];
  for (const sv of [SERVER, ...OTHERS]) {
    const into = sv === SERVER ? out.seasons : out.others[sv].seasons;
    const before = sv === SERVER ? prev && prev.seasons : prev && prev.others && prev.others[sv] && prev.others[sv].seasons;
    for (const s of list) {
      const meta = { boss: s.bossName, weak: EL[s.bossWeakElement] || null, start: s.startDate, end: s.endDate };
      const j = await get(`${API}/seasons/${s.id}/ranking?server=${sv}`);
      await sleep(800); // be gentle: one request at a time
      const hasData = !j.fallbackSeason && j.seasonId === s.id && Array.isArray(j.rankings) && j.rankings.length > 0;
      if (sv === SERVER && !out.current) out.current = { season: s.seasonNumber, ...meta, dataSeason: hasData ? s.seasonNumber : j.fallbackSeason ? j.fallbackSeason.seasonNumber : (prev && prev.current && prev.current.season === s.seasonNumber && prev.current.dataSeason) || s.seasonNumber };
      if (!hasData) continue; // no data yet
      const old = before && before[s.seasonNumber];
      // Let's Doro re-collects about hourly (createdAt, KST without a zone), so compare that, not just the date
      if (!old || old.raidDate !== j.raidDate || old.collected !== (j.createdAt || null) || old.players !== j.rankings.length) changed.push(sv);
      into[s.seasonNumber] = summarize(j, meta);
    }
  }
  const cur = out.current.season;
  const dates = [SERVER, ...OTHERS].map((sv) => { const x = (sv === SERVER ? out.seasons : out.others[sv].seasons)[cur]; return `${sv} ${x ? (x.collected || x.raidDate) : "없음"}`; }).join(", ");
  if (onlyCurrent && !changed.length) {
    console.log(out.seasons[cur] ? `S${cur} 기록 그대로 (${dates})` : `S${cur} 아직 기록 없음`);
    console.log(out.seasons[cur] ? "UNCHANGED" : "NODATA");
    return;
  }
  fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
  console.log("solo raid ranking: current S" + cur, "(data from S" + out.current.dataSeason + ")", "· KR seasons with data:", Object.keys(out.seasons).join(", "));
  if (onlyCurrent) console.log(`S${cur} 기록 ${String((out.seasons[cur] || {}).collected || (out.seasons[cur] || {}).raidDate || "").slice(0, 16).replace("T", " ")} (바뀐 서버: ${changed.join(", ")})`);
  console.log("UPDATED");
})().catch((e) => { console.error(e.message); console.log("ERROR"); process.exitCode = 1; });
