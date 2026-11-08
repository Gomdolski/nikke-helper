// Co-op operation research (worker outputs) -> build/coop.json
// Usage: node build/make-coop.js <A.txt: Korean sources> <B.txt: English sources>
const fs = require("fs");
const path = require("path");
const [A, B] = process.argv.slice(2).map((f) => fs.readFileSync(f, "utf8"));
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const D = JSON.parse(html.slice(html.indexOf("const D = ") + 10, html.indexOf(";\nconst APP_V")));
const nq = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/：/g, ":");
const KO = new Map(D.chars.filter((c) => !c.tr).map((c) => [nq(c.ko), c.ko]));
const EN = new Map(D.chars.filter((c) => !c.tr).map((c) => [nq(c.en), c.ko]));
const unit = (n) => { n = String(n || "").trim(); return KO.get(nq(n)) || EN.get(nq(n)) || (/^rei$/i.test(n) ? "레이" : null); };
const BOSS = { "storm bringer": "스톰 브링어", "nihilister": "니힐리스타", "modernia": "모더니아", "land eater": "랜드 이터", "gate keeper": "게이트 키퍼", "alteisen": "알트아이젠", "black smith": "블랙스미스", "harvester": "하베스터", "chatterbox": "토커티브", "ziz": "지즈", "kraken": "크라켄" };
const bossKo = (en) => { const k = String(en).toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim(); return BOSS[k] || en.trim(); };
const ELM = { Fire: "Fire", Water: "Water", Wind: "Wind", Electric: "Electric", Iron: "Iron", "작열": "Fire", "수냉": "Water", "풍압": "Wind", "전격": "Electric", "철갑": "Iron" };
const sec = (txt, name) => { const i = txt.indexOf(`[${name}]`); if (i < 0) return ""; const rest = txt.slice(i + name.length + 2); const j = rest.search(/\n\[[A-Z]+\]|\nSources?/i); return j < 0 ? rest : rest.slice(0, j); };
const rows = (t) => t.split("\n").map((s) => s.trim()).filter((s) => s.includes("|")).map((s) => s.split("|").map((x) => x.trim()));

// Korean pattern notes per boss (A)
const tipKo = {};
for (const p of rows(sec(A, "BOSSES"))) { const b = p[1].replace(/\s*\(.*\)$/, ""); if (!tipKo[b] && p[5]) tipKo[b] = p[5]; }
// teams per boss: A (Korean names, the standard co-op team) first, then B
const teams = {};
const EN_KO = D.chars.filter((c) => !c.tr).map((c) => [c.en, c.ko]).sort((x, y) => y[0].length - x[0].length);
const WORDS = [["Union Raid", "유니온"], ["Solo Raid", "솔로"], ["Co-op", "협동"], ["Christmas", "크리스마스"], ["Water", "수냉"], ["Fire", "작열"], ["Electric", "전격"], ["Wind", "풍압"], ["Iron", "철갑"], ["Pierce", "관통"], ["Museum", "박물관"]];
const koNames = (t) => WORDS.reduce((acc, [en, ko]) => acc.split(en).join(ko), EN_KO.reduce((acc, [en, ko]) => acc.split(en).join(ko), String(t || "")));
const addTeam = (boss, name, members, why, std) => {
  name = koNames(name); why = koNames(why);
  const m = members.map(unit);
  if (m.length !== 5 || m.some((x) => !x)) return;
  (teams[boss] = teams[boss] || []).push({ name, m, why, ...(std ? { std: 1 } : {}) });
};
for (const p of rows(sec(A, "TEAMS"))) { if (p[0] === "공통") continue; addTeam(p[0], p[1], p[2].split(/[,，]/), p[3], /표준/.test(p[1])); }
for (const p of rows(sec(B, "TEAMS"))) { const b = bossKo(p[0]); if (/^Co-op/i.test(p[1]) && (teams[b] || []).some((t) => t.std)) continue; addTeam(b, p[1].replace(/\s*\(.*?\)\s*$/, ""), p[2].split(/\s*\/\s*/), p[3], false); }
// seasons (B has the longer history)
const seasons = [];
for (const p of rows(sec(B, "BOSSES"))) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(p[0])) continue;
  const [from] = p[0].split("~"); const ko = bossKo(p[1]);
  const el = ELM[p[2]] || null, weak = ELM[p[3]] || null;
  const core = /^O/.test(p[4]) ? true : /^X/.test(p[4]) ? false : null;
  const tips = [tipKo[ko], p[5] && p[5] !== "위와 동일" ? p[5] : null].filter(Boolean);
  const label = `${from.slice(2).replace(/-/g, ".")} ${ko}`;
  seasons.push({ season: label, when: p[0], bosses: [{ id: `co-${from}`, ko, element: el, weak, core, tips: tips.length ? tips : (seasons.find((s) => s.bosses[0].ko === ko) || { bosses: [{ tips: [] }] }).bosses[0].tips, teams: teams[ko] || [] }] });
}
const rules = sec(A, "RULES").split("\n").map((s) => s.trim()).filter((s) => s.startsWith("-")).map((s) => s.replace(/^-\s*/, ""));
const notes = sec(A, "NOTES").split("\n").map((s) => s.trim()).filter((s) => s.startsWith("-")).map((s) => s.replace(/^-\s*/, ""));
fs.writeFileSync(path.join(__dirname, "coop.json"), JSON.stringify({ rules, notes, seasons }, null, 1) + "\n");
console.log("seasons", seasons.length, "bosses with teams", Object.keys(teams).length, "teams", Object.values(teams).flat().length);
console.log(seasons.slice(0, 3).map((s) => `${s.season} ${s.bosses[0].element}->${s.bosses[0].weak} core:${s.bosses[0].core} teams:${s.bosses[0].teams.length}`).join("\n"));
