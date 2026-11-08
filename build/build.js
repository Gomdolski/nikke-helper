// Merges Prydwen character data, Korean names (nikke-api), overload values,
// level costs and raid info into one data blob, then inlines it into the page.
// Usage: node build/build.js [--note "이번에 바뀐 점"]
// Writes index.html (the web/standalone page), version.json (read by the update notice)
// and out/nikke-helper-artifact.html (the Claude artifact copy, not committed).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const HERE = __dirname;
const D = path.join(HERE, "src");
const ROOT = path.join(HERE, "..");
const noteAt = process.argv.indexOf("--note");
const NOTE = noteAt > 0 ? process.argv[noteAt + 1] || "" : "";

const pry = JSON.parse(fs.readFileSync(path.join(HERE, "prydwen.json"), "utf8"));
const raids = JSON.parse(fs.readFileSync(path.join(HERE, "raids.json"), "utf8"));
const rosterRaw = JSON.parse(fs.readFileSync(path.join(D, "roster_compact_ko_en.json"), "utf8"));
const roster = Array.isArray(rosterRaw) ? rosterRaw : rosterRaw.characters;
const ol = JSON.parse(fs.readFileSync(path.join(D, "overload_lines_derived.json"), "utf8"));
const lvRaw = JSON.parse(fs.readFileSync(path.join(D, "nikke-api_table_CharacterLevelTable.json"), "utf8"));
const cubesRaw = JSON.parse(fs.readFileSync(path.join(D, "nikke-api_cubes.json"), "utf8"));

// ---- Korean names ----
const norm = (s) => s.toLowerCase().replace(/\(treasure\)/, "").replace(/[^a-z0-9]/g, "");
// Several units share an English name (e.g. two "Rei"), so keep every match and pick by manufacturer.
const byEn = new Map();
for (const c of roster) { const k = norm(c.en); if (!byEn.has(k)) byEn.set(k, []); byEn.get(k).push(c); }
const byKo = new Map(roster.map((c) => [c.ko, c]));
const manual = {
  "Ada Wong": "에이다", "Asuka Shikinami Langley": "아스카", "Asuka Shikinami Langley: Wille": "아스카 : WILLE",
  "Chisato Nishikigi": "치사토", "Claire Redfield": "클레어", "Jill Valentine": "질", "Mari Makinami Illustrious": "마리",
  "Misato Katsuragi": "미사토", "Queen (Makoto Niijima)": "퀸(마코토)", "Red Hood B3": "레드 후드",
  "Rei Ayanami": "레이", "Rei Ayanami (Tentative Name)": "레이 (가칭)", "Sakura Suzuhara": "사쿠라 (스즈하라)",
  "Siren": "리틀 머메이드", "Takina Inoue": "타키나", "Yukiko Amagi": "유키코",
};
let missingKo = [];
function koName(p) {
  const treasure = /\(Treasure\)/.test(p.n);
  let ko = manual[p.n];
  let squad = null;
  const cands = byEn.get(norm(p.n)) || [];
  let hit = cands.find((c) => c.corporation === String(p.m).toUpperCase()) || cands[0];
  if (manual[p.n]) hit = byKo.get(manual[p.n].replace(/ \(스즈하라\)$/, "")) && cands.length === 0 ? roster.find((c) => c.ko === manual[p.n] && c.corporation === String(p.m).toUpperCase()) : hit;
  if (hit) { ko = ko || hit.ko; squad = hit.squad_ko || null; }
  if (!ko) { missingKo.push(p.n); ko = p.n; }
  if (treasure && !/애장품/.test(ko)) ko += " (애장품)";
  return { ko, squad };
}

// ---- Cubes ----
const cubeKo = {};
for (const c of cubesRaw.cubes) cubeKo[c.name.en.replace(/ Cube$/, "")] = c.name.ko;
const cubeFix = { Vigot: "Vigor", Pierce: "Piercing", "Relic Assist": "Assist" };
function cube(n) {
  const k = cubeFix[n] || n;
  return cubeKo[k] || cubeKo[n] || n;
}
// Short effect labels for each cube's first skill (second skill is always elemental damage up).
const CUBE_EFF = {
  Assault: "명중률 증가", Onslaught: "차지 대미지 증가", Resilience: "재장전 속도 증가", Bastion: "사격하면 탄환 일부 충전",
  Adjutant: "차지 속도 증가", Wingman: "최대 장탄 수 증가", Quantum: "버스트 게이지 충전 속도 증가", Vigor: "최대 체력 증가",
  Endurance: "방어력 증가", Healing: "주는 회복량 증가", Tempering: "받는 대미지 감소", Assist: "체력이 낮을 때 최대 체력 증가",
  Destruction: "파츠 대미지 증가", Piercing: "관통 대미지 증가", Rupture: "방어력 무시 대미지 증가", Stealth: "엄폐물 최대 체력 증가",
  Diffusion: "분배 대미지 증가", Bezel: "풀버스트 때 최대 체력 증가",
};
const CUBES = cubesRaw.cubes.map((c) => { const en = c.name.en.replace(/ Cube$/, ""); return { ko: c.name.ko, en, eff: CUBE_EFF[en] || "" }; });

// ---- Overload text → structured lines ----
// keys: ele atk ammo cdmg crate def hit cspd cdmgc
const OLKEY = [
  [/charge\s*(dmg|damage)/i, "cdc"],
  [/charge\s*speed|\bCS\b/i, "cs"],
  [/ele(mental)?\b|ele\s*dmg|elemental\s*d/i, "ele"],
  [/crit(ical)?\.?\s*(dmg|damage)/i, "cd"],
  [/crit(ical)?\.?\s*rate/i, "cr"],
  [/max\s*ammo|\bammo\b/i, "ammo"],
  [/hit[\s-]*rate/i, "hit"],
  [/\bdef(ense)?\b|\bDF\b/i, "def"],
  [/\batk\b|attack|\bdamage\b/i, "atk"],
];
function parseOL(s) {
  if (!s) return [];
  const out = [];
  const seen = new Set();
  for (let part of s.split(/,|;|\/|\+|\band\b|>=|\.\s(?=[A-Z])/)) {
    part = part.trim();
    if (!part) continue;
    let n = null;
    const m = part.match(/(\d)\s*(?:[-~–]\s*(\d))?\s*[x×]|[x×]\s*(\d)/i);
    if (m) n = m[2] ? `${m[1]}~${m[2]}` : (m[1] || m[3]);
    for (const [re, key] of OLKEY) {
      if (re.test(part)) {
        if (!seen.has(key)) { out.push(n ? [key, n] : [key]); seen.add(key); }
        break;
      }
    }
  }
  return out;
}

// ---- Characters ----
const chars = pry.chars.map((p) => {
  const { ko, squad } = koName(p);
  const o = {
    s: p.s, ko, en: p.n, r: p.r, m: p.m, c: p.c, w: p.w, e: p.e, b: p.b,
    sp: p.sp || [], rs: p.rs || "", rb: p.rb || "", rp: p.rp || "",
  };
  if (squad) o.sq = squad;
  if (p.tr) o.tr = 1;
  if (p.am) o.am = p.am;
  if (p.tv) o.tv = p.tv;
  if (p.cu && p.cu.length) o.cu = p.cu.map(cube);
  if (p.cp && p.cp.length) o.cp = p.cp.map(cube);
  const oi = parseOL(p.oi), of = parseOL(p.of);
  if (oi.length) o.oi = oi;
  if (of.length) o.of = of;
  if (p.op) o.op = p.op;
  if (p.sk && (p.sk.rc || p.sk.mn)) o.sk = { mn: p.sk.mn, rc: p.sk.rc, hi: p.sk.hi, p: p.sk.p };
  if (p.cpp) o.cpp = p.cpp;
  return o;
});
// Treasure variants share a Korean name with the base unit; that's fine.

// ---- Character-specific overload notes (build/ol_notes.json: "공식이름" -> key, why, conf, goals, noAmmo) ----
{
  const of = path.join(HERE, "ol_notes.json");
  const notes = fs.existsSync(of) ? JSON.parse(fs.readFileSync(of, "utf8")).notes : {};
  const miss = [];
  for (const [name, n] of Object.entries(notes)) {
    const c = chars.find((x) => x.ko === name);
    if (!c) { miss.push(name); continue; }
    c.oln = { key: n.key, why: n.why, sure: n.conf === "높음" ? 1 : 0, ...(n.goals ? { goals: n.goals } : {}), ...(n.noAmmo ? { noAmmo: 1 } : {}) };
  }
  console.log("ol notes", Object.keys(notes).length - miss.length, miss.length ? "not found: " + miss.join(", ") : "");
}

// ---- Arena overload / cube notes (build/arena_ol.json from make-arena-ol.js) ----
const AOL = fs.existsSync(path.join(HERE, "arena_ol.json")) ? JSON.parse(fs.readFileSync(path.join(HERE, "arena_ol.json"), "utf8")) : { rules: [], units: {} };
for (const [name, u] of Object.entries(AOL.units)) {
  const c = chars.find((x) => x.ko === name);
  if (c) c.aol = { prio: u.prio, keys: u.keys, ban: u.ban, low: u.low ? 1 : 0, cubes: u.cubes, why: u.why, sure: u.sure };
  else console.log("arena OL name not found:", name);
}

// ---- Skill advice (build/skill_notes.json: 가성비 / 종결 / 우선 / 이유) ----
{
  const sf = path.join(HERE, "skill_notes.json");
  const units = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, "utf8")).units : {};
  for (const [name, u] of Object.entries(units)) { const c = chars.find((x) => x.ko === name); if (c) c.skn = u; else console.log("skill note name not found:", name); }
}

// ---- Community nicknames (build/nicknames.json: { "공식이름": ["별명", "애장품 전용 별명*"] }) ----
{
  const nf = path.join(HERE, "nicknames.json");
  const nj = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, "utf8")) : {};
  const nick = nj.names || {};
  // groups: one search word -> several nikkes (e.g. 에게리 -> every Evangelion collab unit)
  const groupOf = new Map();
  for (const g of nj.groups || []) {
    const members = g.members.flatMap((m) => m.startsWith("*") ? chars.filter((c) => c.m === m.slice(1) && !c.tr).map((c) => c.ko) : [m]);
    for (const m of members) {
      if (!chars.some((c) => c.ko === m)) console.log("group member not found:", m);
      groupOf.set(m, [...(groupOf.get(m) || []), ...g.names]);
    }
  }
  let n = 0;
  for (const c of chars) {
    const base = c.ko.replace(/ \(애장품\)$/, "");
    const list = (nick[base] || []).filter((x) => c.tr ? /\*$/.test(x) : !/\*$/.test(x)).map((x) => x.replace(/\*$/, "").trim());
    if (!c.tr) list.push(...(groupOf.get(c.ko) || []));
    if (c.tr) list.push("애" + base.replace(/\s+/g, ""), "애장품" + base.replace(/\s+/g, ""));
    const uniq = [...new Set(list.filter(Boolean))];
    if (uniq.length) { c.nk = uniq; n += uniq.length; }
  }
  console.log("nicknames", n);
}

// ---- Portraits (blablalink CDN links via nikke-api; refresh with update-portraits.js) ----
{
  const pf = path.join(D, "portraits.json");
  const list = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, "utf8")).list : [];
  const key = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/：/g, ":");
  const noImg = [];
  for (const c of chars) {
    const baseKo = c.ko.replace(/ \((애장품|스즈하라)\)$/, "");
    const cands = list.filter((p) => key(p.ko) === key(baseKo) || key(p.en) === key(c.en.replace(/ \(Treasure\)$/, "")));
    const hit = cands.find((p) => String(p.corp).toLowerCase() === String(c.m).toLowerCase()) || cands[0];
    if (hit) { c.img = hit.icon; if (hit.medium) c.imgm = hit.medium; } else noImg.push(c.ko);
  }
  console.log("portraits matched", chars.length - noImg.length, "/", chars.length, noImg.length ? "missing: " + noImg.join(", ") : "");
}

// ---- Levels: record L = cost to go from L to L+1 ----
const lv = lvRaw.records.sort((a, b) => a.level - b.level).map((r) => [r.gold, r.character_exp, r.character_exp_2]);

// ---- Overload lines ----
const KEYMAP = { 100100: "ele", 100400: "atk", 100300: "ammo", 100800: "cd", 100700: "cr", 100900: "def", 100200: "hit", 100600: "cs", 100500: "cdc" };
const olLines = ol.lines.map((l) => ({ k: KEYMAP[l.groupId] || String(l.groupId), ko: l.ko, w: l.weightPct, v: l.values }));

// ---- Raids: solo seasons (newest first) and union seasons from dildoro ----
const RANK = fs.existsSync(path.join(D, "soloraid_rank.json")) ? JSON.parse(fs.readFileSync(path.join(D, "soloraid_rank.json"), "utf8")) : null;
// Union raid boss cores (build/union_core.json: "S<season>|<boss>" -> core true/false, pierce, note)
const UCORE = fs.existsSync(path.join(HERE, "union_core.json")) ? JSON.parse(fs.readFileSync(path.join(HERE, "union_core.json"), "utf8")).bosses : {};
function buildRaids() {
  const us = JSON.parse(fs.readFileSync(path.join(HERE, "union_seasons.json"), "utf8"));
  const WEAKOF = { Fire: "Water", Water: "Electric", Electric: "Iron", Iron: "Wind", Wind: "Fire" };
  const ss = JSON.parse(fs.readFileSync(path.join(HERE, "solo_seasons.json"), "utf8"));
  const KO2EL = { "작열": "Fire", "수냉": "Water", "풍압": "Wind", "전격": "Electric", "철갑": "Iron" };
  const BOSS_OF_WEAK = Object.fromEntries(Object.entries(WEAKOF).map(([boss, weak]) => [weak, boss]));
  const past = ss.rows.slice().reverse().map(([season, start, ko, weakKo, pickup]) => {
    const weak = KO2EL[weakKo];
    const boss = { id: `s${season}`, ko, en: "", element: BOSS_OF_WEAK[weak], weak, core: null, pickup };
    // Prydwen detail (tips, teams, core, effective range) for the season it covered
    if (season === raids.solo.season) Object.assign(boss, raids.solo.bosses[0], { id: `s${season}`, ko, pickup });
    return { season, when: start + " 시작", note: "", bosses: [boss] };
  });
  const solo = {
    source: ss.source,
    seasons: [
      { season: 43, when: "2026-11-12 ~ 11-19", note: "예정", bosses: [{
        id: "s43", ko: (RANK && RANK.current && RANK.current.season === 43 && RANK.current.boss) || "43시즌 보스", en: "", element: "Wind", weak: "Fire", core: null,
        tips: ["작열 딜러 위주로 준비하세요. 시즌이 끝나기 전까지는 같은 작열 약점이었던 지난 시즌 상위권 덱을 참고로 보여줘요.", "코어 유무가 공개되면 아래 버튼으로 바꿔 주세요."], teams: [],
      }] },
      ...past,
    ],
  };
  const union = {
    source: us.source,
    teamsFrom: raids.union.season,
    teams: raids.union.teams,
    seasons: us.seasons.map(([season, start, names]) => ({
      season, when: start + " 시작",
      bosses: names.map((ko, i) => {
        const el = us.slotElements[i];
        const extra = season === 44 ? us.details44[ko] || {} : {};
        const cr = UCORE[`S${season}|${ko}`];
        const core = cr ? { core: cr.core, coreNote: cr.note, ...(cr.pierce ? { pierce: true } : {}) } : { core: null };
        return { id: `u${season}-${i}`, ko, element: el, weak: WEAKOF[el], ...extra, ...core };
      }),
    })),
  };
  const ai = JSON.parse(fs.readFileSync(path.join(HERE, "anomaly.json"), "utf8"));
  const anomaly = {
    source: ai.source,
    seasons: [{ season: "상시", when: "매일 돌아가며 열려요", note: "", bosses: ai.bosses.map((b) => ({ ...b, teams: b.teams.map(([name, m]) => ({ name, m })) })) }],
  };
  return { solo, union, anomaly };
}

// ---- Name index for importing a ShiftyPad list shown in Korean or English ----
// Keys are normalized names; values list slugs. Names shared by two units (e.g. "Rei",
// "사쿠라") list the standard unit first, then the collab one.
const nrmName = (s) => String(s).toLowerCase().replace(/\s+/g, "").replace(/：/g, ":").replace(/-/g, "");
const NAMES = {};
const addName = (n, slug) => { const k = nrmName(n); if (!k) return; NAMES[k] = NAMES[k] || []; if (!NAMES[k].includes(slug)) NAMES[k].push(slug); };
const baseChars = chars.filter((c) => !c.tr);
baseChars.forEach((c) => { addName(c.ko, c.s); addName(c.en, c.s); });
const unmappedRoster = [];
for (const r of roster) {
  const cands = baseChars.filter((c) => c.ko === r.ko || c.ko.replace(/ \(스즈하라\)$/, "") === r.ko);
  const hit = cands.find((c) => c.m.toUpperCase() === r.corporation) || (cands.length === 1 ? cands[0] : null);
  if (hit) { addName(r.en, hit.s); addName(r.ko, hit.s); } else unmappedRoster.push(r.en);
}
for (const k of Object.keys(NAMES)) NAMES[k].sort((a, b) => (BYS(a).m === "Abnormal") - (BYS(b).m === "Abnormal"));
function BYS(s) { return baseChars.find((c) => c.s === s) || {}; }

// ---- Arena (build/arena.json from make-arena.js): official Korean names -> slugs ----
function buildArena() {
  const af = path.join(HERE, "arena.json");
  if (!fs.existsSync(af)) return null;
  const A = JSON.parse(fs.readFileSync(af, "utf8"));
  const bySlugKo = (ko) => { const c = chars.find((x) => x.ko === ko); return c ? c.s : null; };
  const roles = {}, burst = {};
  for (const [ko, r] of Object.entries(A.roles)) { const s = bySlugKo(ko); if (s) roles[s] = r; }
  for (const [ko, v] of Object.entries(A.burst)) { const s = bySlugKo(ko); if (s) burst[s] = v; }
  return {
    at: A.at, rules: A.rules, notes: A.notes,
    meta: A.meta.map((d) => ({ ...d, m: d.m.map(bySlugKo) })),
    counters: A.counters.map((c) => ({ ...c, use: c.use.map(bySlugKo).filter(Boolean) })),
    roles, burst,
  };
}

// ---- Solo raid top-50 decks (Korean server, Let's Doro snapshot) -> slugs ----
function buildSoloRank() {
  if (!RANK) return null;
  const miss = new Set();
  const sl = (ko) => { const h = NAMES[nrmName(ko)]; if (!h) { miss.add(ko); return null; } return h[0]; };
  const seasons = {};
  for (const [n, s] of Object.entries(RANK.seasons)) {
    seasons[n] = {
      boss: s.boss, weak: s.weak, raidDate: s.raidDate, players: s.players,
      combos: s.combos.slice(0, 12).map((c) => ({ m: c.m.map(sl), n: c.n, avg: c.avg, best: c.best })).filter((c) => c.m.every(Boolean)),
      usage: s.usage.slice(0, 30).map(([ko, k]) => [sl(ko), k]).filter((x) => x[0]),
      top: s.top.slice(0, 3).map((p) => ({ rank: p.rank, total: p.total, sq: p.sq.map((q) => ({ m: q.m.map(sl), d: q.d })) })),
    };
  }
  if (miss.size) console.log("solo rank names not linked:", [...miss].join(", "));
  return { at: RANK.at, server: RANK.server, current: RANK.current, seasons };
}

const out = {
  names: NAMES,
  built: new Date().toISOString().slice(0, 10),
  src: { prydwen: "2026-10-31", ko: "nikke-api (2026-11-05)" },
  chars,
  teams: pry.teams, // [name, "B"|"R", [slugs]]
  raids: buildRaids(),
  lv,
  cubes: CUBES,
  ol: { slot: ol.slotChance, tier: ol.tierChancePct, lines: olLines },
  campaign: fs.existsSync(path.join(HERE, "campaign.json")) ? JSON.parse(fs.readFileSync(path.join(HERE, "campaign.json"), "utf8")) : null,
  soloRank: buildSoloRank(),
  arena: buildArena(),
  arenaOlRules: AOL.rules,
  weekly: fs.existsSync(path.join(HERE, "weekly.json")) ? JSON.parse(fs.readFileSync(path.join(HERE, "weekly.json"), "utf8")) : null,
};

const json = JSON.stringify(out);
const tpl = fs.readFileSync(path.join(HERE, "page.html"), "utf8");
// Version = hash of everything that ends up in the page, so any change shows the update notice.
const APP_V = out.built + "-" + crypto.createHash("sha256").update(tpl).update(json).digest("hex").slice(0, 8);
const page = tpl.replace("/*__DATA__*/null", () => json.replace(/</g, "\\u003c")).replace("__APP_V__", APP_V);
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "out", "nikke-helper-artifact.html"), page);

console.log("chars", chars.length, "teams", out.teams.length, "levels", lv.length, "ol lines", olLines.length);
console.log("missing ko:", missingKo.join(", ") || "none");
console.log("roster names not linked:", unmappedRoster.join(", ") || "none", "| shared names:", Object.entries(NAMES).filter(([, v]) => v.length > 1).map(([k, v]) => k + "=" + v.join("/")).join(" "));
console.log("no OL parse:", pry.chars.filter((p) => p.oi && !parseOL(p.oi).length).map((p) => p.n + "=" + p.oi).join(" | ") || "none");
console.log("page bytes", Buffer.byteLength(page));

// Standalone copy for opening straight from disk (friends, offline): add the document
// skeleton the Artifact host normally provides. Saving falls back to the browser's storage.
const skeleton = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const site = skeleton.replace("</head>", "<title>니케 지휘관 도우미</title></head>");
fs.writeFileSync(path.join(ROOT, "index.html"), site + page + "</body></html>");
fs.writeFileSync(path.join(ROOT, "version.json"), JSON.stringify({ v: APP_V, built: out.built, note: NOTE }, null, 2) + "\n");
console.log("index.html + version.json written, version", APP_V);
