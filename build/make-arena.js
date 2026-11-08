// Turn the arena research notes (worker outputs) into build/arena.json.
// Usage: node build/make-arena.js <A.txt: meta+counter> <B.txt: rules+burstgen> <C.txt: roles>
// Names are resolved to official Korean names; anything unresolved is listed so it can be fixed in ALIAS.
const fs = require("fs");
const path = require("path");
const [A, B, Cf] = process.argv.slice(2).map((f) => fs.readFileSync(f, "utf8"));
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const D = JSON.parse(html.slice(html.indexOf("const D = ") + 10, html.indexOf(";\nconst APP_V")));
const nq = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/：/g, ":");
const KO = new Map(D.chars.map((c) => [nq(c.ko), c.ko]));
const EN = new Map(D.chars.map((c) => [nq(c.en), c.ko]));
D.chars.forEach((c) => (c.nk || []).forEach((n) => { if (!KO.has(nq(n))) KO.set(nq(n), c.ko); }));
// community names the notes used -> official names (checked by hand)
const ALIAS = {
  "세이렌": "리틀 머메이드", "애장품센티": "센티 (애장품)", "센티(애장품)": "센티 (애장품)", "애장품헬름": "헬름 (애장품)",
  "애장품프리바티": "프리바티 (애장품)", "애장품플로라": "플로라 (애장품)", "애장품로산나": "로산나 (애장품)", "애장품목단": "목단 (애장품)",
  "라플라스uh": "라플라스 : 얼티밋 히어로", "각스화": "스노우 화이트 : 헤비암즈", "소다": "소다 : 트윙클링 바니", "바소다": "소다 : 트윙클링 바니",
  "웡": "에이다", "돌니스": "아니스 : 스타", "수니스": "아니스 : 스파클링 서머", "레후": "레드 후드",
};
const miss = new Set();
function res(name) {
  let n = String(name || "").trim().replace(/\s*\((피냐)\)\s*/, "");
  if (!n) return null;
  const k = nq(n);
  const hit = KO.get(k) || EN.get(k) || (ALIAS[k] && ALIAS[k]) || (ALIAS[n] && ALIAS[n]);
  if (hit) return hit;
  // "X(애장품)" / "X (애장품)"
  const t = n.match(/^(.+?)\s*\(애장품\)$/); if (t && KO.get(nq(t[1] + " (애장품)"))) return KO.get(nq(t[1] + " (애장품)"));
  miss.add(n); return null;
}
const sec = (txt, name) => { const i = txt.indexOf(`[${name}]`); if (i < 0) return ""; const rest = txt.slice(i + name.length + 2); const j = rest.search(/\n\[[A-Z]+\]/); return j < 0 ? rest : rest.slice(0, j); };
const lines = (t) => t.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("|--") && !/^\|?\s*영문이름/.test(s));
const conf = (s) => (/높음/.test(s) ? 2 : /중간/.test(s) ? 1 : 0);

// meta decks
const meta = [];
for (const l of lines(sec(A, "META"))) {
  const p = l.split("|").map((s) => s.trim()); if (p.length < 7) continue;
  const m = p[2].split(/[,，]/).map((x) => res(x));
  meta.push({ name: p[0], side: p[1], m, plus: p[3], minus: p[4], sure: conf(p[5]), when: p[6] });
}
// counters
const counters = [];
for (const l of lines(sec(A, "COUNTER"))) {
  const p = l.split("|").map((s) => s.trim()); if (p.length < 4) continue;
  counters.push({ vs: p[0], how: p[1], use: p[2].split(/[,，]/).map((x) => res(x)).filter(Boolean), sure: conf(p[3]) });
}
// English unit names inside sentences -> Korean (longest names first); sources stay out of the text
const EN_KO = D.chars.filter((c) => !c.tr).map((c) => [c.en, c.ko]).sort((a, b) => b[0].length - a[0].length);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const koNames = (t) => EN_KO.reduce((acc, [en, ko]) => acc.replace(new RegExp(`(?<![A-Za-z])${esc(en)}(?![A-Za-z])`, "g"), ko), t).replace(/\bSAnis\b/g, "수니스");
const noSrc = (t) => t.replace(/\s*\([^()]*(Prydwen|nikke\.gg|nikke-synergy|Info|Teams DB|Tier List|beomtachi)[^()]*\)\s*\.?\s*$/, "");
const notes = lines(sec(A, "NOTES").split(/\nSources?:/i)[0]).filter((s) => s.startsWith("-")).map((s) => koNames(noSrc(s.replace(/^-\s*/, ""))));
const rules = lines(sec(B, "RULES")).filter((s) => s.startsWith("-")).map((s) => koNames(noSrc(s.replace(/^-\s*/, ""))));
// burst generation per hit (English names)
const burst = {};
for (const l of lines(sec(B, "BURSTGEN"))) {
  const p = l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim()); if (p.length < 3 || /^※/.test(p[0])) continue;
  for (const en of p[0].split("/").map((s) => s.trim())) { const ko = res(en); if (ko && !burst[ko]) burst[ko] = `${p[1]} (${p[2]})`; }
}
// roles
const roles = {};
for (const l of lines(Cf)) {
  const p = l.split("|").map((s) => s.trim()); if (p.length < 6 || p[0] === "공식이름") continue;
  const ko = res(p[0]); if (!ko) continue;
  roles[ko] = { role: p[1], side: p[2], slot: p[3], note: p[4], sure: conf(p[5]) };
}
const out = { at: new Date().toISOString().slice(0, 10), rules, notes, meta, counters, roles, burst };
fs.writeFileSync(path.join(__dirname, "arena.json"), JSON.stringify(out, null, 1) + "\n");
console.log("meta", meta.length, "counters", counters.length, "roles", Object.keys(roles).length, "burst", Object.keys(burst).length, "rules", rules.length);
console.log("unresolved names:", [...miss].join(", ") || "none");
