// Arena overload/cube notes (worker output) -> build/arena_ol.json
// Usage: node build/make-arena-ol.js <result.txt>
const fs = require("fs");
const path = require("path");
const txt = fs.readFileSync(process.argv[2], "utf8");
const CUBE = { "리질리언스": "렐릭 베어 큐브", "바스티온": "택티컬 베어 큐브", "어드저턴트": "렐릭 부스트 큐브", "윙맨": "택티컬 부스트 큐브", "퀀텀": "렐릭 퀀텀 큐브", "비거": "렐릭 비고르 큐브", "비고르": "렐릭 비고르 큐브", "인듀어런스": "렐릭 인듀어 큐브", "인듀어": "렐릭 인듀어 큐브", "힐링": "렐릭 힐링 큐브", "템퍼링": "렐릭 템퍼링 큐브", "어설트": "렐릭 어설트 큐브", "온슬로트": "택티컬 어설트 큐브", "피어싱": "렐릭 피어싱 큐브", "어시스트": "렐릭 어시스터 큐브" };
// option words -> calculator keys, in the order they appear
const OPT = [[/차지\s*속도|차속/, "cs"], [/장탄/, "ammo"], [/공격력/, "atk"], [/우월코드|유리코드/, "ele"], [/방어력/, "def"], [/크확|크리티컬\s*확률/, "cr"], [/크뎀|크리티컬\s*(대미지|피해)/, "cd"], [/차지\s*대미지|차뎀/, "cdc"]];
const keysOf = (t) => {
  const parts = t.split(/>|→|≒|,|\/|·/).map((s) => s.trim());
  const ks = [];
  for (const p of parts) { if (/금지|무효|효율 낮음/.test(p)) continue; for (const [re, k] of OPT) if (re.test(p) && !ks.includes(k)) ks.push(k); }
  return ks;
};
const ban = (t) => OPT.filter(([re]) => new RegExp("(?:" + re.source + ")[^>,]{0,6}금지").test(t)).map(([, k]) => k);
const sec = (name) => { const i = txt.indexOf(`[${name}]`); if (i < 0) return ""; const rest = txt.slice(i + name.length + 2); const j = rest.search(/\n\[[A-Z]+\]|\n제외:|\nSources?:/); return j < 0 ? rest : rest.slice(0, j); };
const noSrc = (t) => t.replace(/\s*\([^()]*(beomtachi|Prydwen|메가니케|nikke\.gg|Vortex)[^()]*\)\s*\.?\s*$/, "");
const rules = sec("RULES").split("\n").map((s) => s.trim()).filter((s) => s.startsWith("-")).map((s) => noSrc(s.replace(/^-\s*/, "")).replace(/\*\*/g, ""));
const units = {};
for (const l of sec("UNITS").split("\n")) {
  const p = l.split("|").map((s) => s.trim()); if (p.length < 5) continue;
  const name = p[0].replace(/\s*:\s*/, " : ");
  units[name] = {
    prio: p[1], keys: keysOf(p[1]), ban: ban(p[1]), low: /옵션작 낮음/.test(p[1]),
    cubes: p[2].split(/[,，]/).map((s) => CUBE[s.replace(/\(.*?\)/g, "").replace(/큐브/, "").trim()] || null).filter(Boolean),
    why: p[3], sure: /높음/.test(p[4]) ? 2 : /중간/.test(p[4]) ? 1 : 0,
  };
}
fs.writeFileSync(path.join(__dirname, "arena_ol.json"), JSON.stringify({ rules, units }, null, 1) + "\n");
console.log("rules", rules.length, "units", Object.keys(units).length);
console.log(Object.entries(units).slice(0, 4).map(([k, v]) => `${k}: ${v.keys.join(">")} ban:${v.ban} cubes:${v.cubes.join("/")}`).join("\n"));
