// ---------- RAID ----------
// Core: hitting a core doubles normal-attack damage, so accurate weapons gain the most.
// Without a core, that bonus is gone and each weapon's effective range on the boss matters.
const CORE_KEY = "nikke-helper-core-v1";
let CORE_MAP = {};
try { CORE_MAP = JSON.parse(localStorage.getItem(CORE_KEY) || "{}") || {}; } catch (e) {}
function setCore(id, v) { if (v === null) delete CORE_MAP[id]; else CORE_MAP[id] = v; try { localStorage.setItem(CORE_KEY, JSON.stringify(CORE_MAP)); } catch (e) {} }
function seasonsOf(mode) { return D.raids[mode].seasons; }
function curSeason(mode) { const ss = seasonsOf(mode); return ss.find(s => s.season === S.raid.season[mode]) || ss[0]; }
function raidTarget() {
  const R = S.raid;
  if (R.mode === "custom") {
    const el = R.custom.element;
    return { el: WEAK[el], boss: { id: "custom", ko: R.custom.name || "직접 만든 보스", en: "", element: el, weak: WEAK[el], core: R.custom.core, custom: true } };
  }
  const bosses = curSeason(R.mode).bosses;
  const b = bosses.find(x => x.id === R.boss) || bosses[0];
  const core = b.id in CORE_MAP ? CORE_MAP[b.id] : b.core;
  return { el: b.weak, boss: { ...b, core } };
}
const CORE_YES = { SR: 2.5, RL: 2, AR: 1.5, MG: 0.5, SMG: -0.5, SG: -1.5 };
const CORE_NO = { SR: -1.5, RL: 0.5, AR: 0.5, MG: 0.5, SMG: 0.5, SG: 0.5 };
function coreAdj(c, boss) {
  if (!boss || c.c !== "Attacker") return 0;
  // hidden core under armor: only Pierce units reach it
  const pierce = boss.pierce && c.sp.includes("Pierce") ? 2 : 0;
  if (boss.core == null) return pierce;
  return pierce + coreBase(c, boss);
}
function coreBase(c, boss) {
  if (boss.core) return CORE_YES[c.w] || 0;
  const r = boss.range && boss.range[c.w];
  if (r && r !== "-") return r === "없음" ? -2.5 : 1;
  return CORE_NO[c.w] || 0;
}
function coreFit(members, boss) {
  if (!boss || boss.core == null) return null;
  const atk = members.map(get).filter(c => c && c.c === "Attacker" && bursts(c).includes("III"));
  if (!atk.length) return null;
  const avg = atk.reduce((a, c) => a + coreAdj(c, boss), 0) / atk.length;
  return avg >= 1 ? "good" : avg <= -0.5 ? "bad" : "mid";
}
const FIT_LABEL = { good: ["ok", "코어 조건에 잘 맞아요"], mid: ["part", "코어 조건 보통"], bad: ["no", "코어 조건에 불리해요"] };
function teamsFor(el, boss) {
  const out = [];
  if (boss && boss.teams && boss.teams.length) {
    const src = S.raid.mode === "anomaly" ? `${boss.ko} 추천` : `솔로 ${curSeason("solo").season}시즌 추천`;
    boss.teams.forEach(t => out.push({ name: t.name, m: t.m, sub: t.sub, src }));
  }
  (D.raids.union.teams[el] || []).forEach(t => out.push({ name: t[0], m: t[1], src: `유니온 ${EL[el]} 추천 (${D.raids.union.teamsFrom}시즌 기준)` }));
  D.teams.forEach(t => {
    const atk = t[2].map(get).filter(c => c && c.c === "Attacker" && bursts(c).includes("III"));
    if (atk.length && atk.every(c => c.e === el)) out.push({ name: t[0], m: t[2], src: t[1] === "B" ? "보스전 덱" : "레이드 덱" });
  });
  const seen = new Set();
  const fitRank = { good: 2, mid: 1, bad: 0 };
  return out.filter(t => { const k = t.m.map(x => get(x)?.s || x).sort().join(","); if (seen.has(k)) return false; seen.add(k); return true; })
    .map(t => { const real = t.m.filter(x => get(x)); const have = real.filter(x => S.owned.has(get(x).s)).length; return { ...t, have, need: real.length, fit: coreFit(t.m, boss) }; })
    .sort((a, b) => (b.have / (b.need || 1)) - (a.have / (a.need || 1)) || (fitRank[b.fit] ?? 1) - (fitRank[a.fit] ?? 1) || b.have - a.have);
}
function autoBuild(el, n, wantHeal, boss) {
  const pool = [...S.owned].map(get).filter(Boolean);
  // an 애장품 unit replaces its base unit
  const tre = new Set(pool.filter(c => c.tr).map(c => c.en.replace(/ \(Treasure\)/, "")));
  const avail = pool.filter(c => !(!c.tr && tre.has(c.en)));
  const used = new Set();
  const score = c => {
    let s = tScore(c.rb) * 1.6;
    if (c.c === "Attacker") s += c.e === el ? 6 : -4;
    else if (c.e === el) s += 1;
    if (c.sp.includes("Burst CD Reduction")) s += 2;
    if (c.sp.includes("Buffer")) s += 1.5;
    s += Math.min(RAID_USE.get(c.s) || 0, 8) * 0.25;
    s += coreAdj(c, boss);
    return s;
  };
  const teams = [];
  for (const t of teamsFor(el, boss)) {
    if (teams.length >= n) break;
    if (t.fit === "bad") continue;
    const mem = t.m.map(get);
    if (mem.length === 5 && mem.every(c => c && S.owned.has(c.s) && !used.has(c.s))) { mem.forEach(c => used.add(c.s)); teams.push({ m: mem, why: `추천 덱 그대로 (${t.src})`, guide: t.name }); }
  }
  const pick = (pred) => avail.filter(c => !used.has(c.s) && pred(c)).sort((a, b) => score(b) - score(a))[0];
  while (teams.length < n) {
    const m = [];
    const take = c => { if (c) { used.add(c.s); m.push(c); } return c; };
    take(pick(c => bursts(c).includes("III") && c.c === "Attacker"));
    take(pick(c => bursts(c).includes("III") && c.c === "Attacker"));
    take(pick(c => bursts(c).includes("I")));
    take(pick(c => bursts(c).includes("II")));
    if (wantHeal && !m.some(c => c.sp.some(x => ["Healer", "Shielder", "Cover Heal"].includes(x)))) take(pick(c => c.sp.some(x => ["Healer", "Shielder", "Cover Heal"].includes(x))));
    while (m.length < 5) { if (!take(pick(() => true))) break; }
    if (m.length < 3) { m.forEach(c => used.delete(c.s)); break; }
    const order = c => (bursts(c).includes("I") && !bursts(c).includes("III") ? 0 : bursts(c).includes("II") ? 1 : 2);
    m.sort((a, b) => order(a) - order(b));
    const dps = m.filter(c => c.c === "Attacker" && c.e === el).length;
    const lack = [];
    if (!m.some(c => bursts(c).includes("I"))) lack.push("버스트 I");
    if (!m.some(c => bursts(c).includes("II"))) lack.push("버스트 II");
    if (m.filter(c => bursts(c).includes("III")).length < 2) lack.push("버스트 III 2명");
    teams.push({ m, why: `${EL[el]} 딜러 ${dps}명` + (lack.length ? ` · 부족: ${lack.join(", ")}` : ""), warn: lack.length > 0 || dps === 0 });
  }
  return teams;
}
function coreSeg(boss) {
  const v = boss.core;
  const b = (val, label) => `<button data-core="${val}" aria-pressed="${v === val || (val === "null" && v == null)}">${label}</button>`;
  return `<div class="seg" id="coreSeg">${b(true, "코어 있음")}${b(false, "코어 없음")}${b("null", "모름")}</div>`;
}
function coreText(boss) {
  if (boss.core === true && boss.pierce) return "코어를 맞히면 평타 피해가 2배예요. 처음에는 코어가 장갑 아래 숨어 있어서 관통 니케가 유리하고, 정확한 무기(SR 저격·RL 런처·AR 돌격소총) 딜러도 우선 골라요.";
  if (boss.core === true) return "코어를 맞히면 평타 피해가 2배예요. 정확한 무기(SR 저격·RL 런처·AR 돌격소총) 딜러를 우선 골라요. SG 샷건·SMG 기관단총은 코어를 잘 못 맞혀서 뒤로 밀려요.";
  if (boss.core === false) return "코어가 없어서 2배 피해가 없어요. 코어에 크게 기대는 SR 저격은 뒤로 밀리고, 보스에서 적정 사거리가 나오는 무기를 우선 골라요." + (boss.range ? ` 이 보스의 적정 사거리: ${Object.entries(boss.range).filter(([, r]) => r !== "-").map(([k, r]) => `${k} ${esc(r)}`).join(" · ")}` : "");
  return "코어 유무를 고르면 자동 편성과 추천 덱 순서에 반영돼요. 게임에서 보스를 보고 골라 주세요.";
}
// Other times the same boss showed up (solo and union), so past decks can be reused.
const bossKey = s => String(s).replace(/\s+/g, "").replace(/^리빌드/, "리빌드");
function appearances(boss) {
  if (!boss || boss.custom) return "";
  const k = bossKey(boss.ko), out = [];
  for (const mode of ["solo", "union", "anomaly"]) for (const s of seasonsOf(mode)) for (const b of s.bosses) {
    if (b.id === boss.id || bossKey(b.ko) !== k) continue;
    out.push(mode === "anomaly" ? `이상개체 요격전(약점 ${EL[b.weak]})` : `${mode === "solo" ? "솔로" : "유니온"} ${s.season}시즌(약점 ${EL[b.weak]})`);
  }
  return out.length ? `<p style="margin:0" class="note">다른 시즌 등장: ${out.join(", ")}</p>` : "";
}
function renderRaid() {
  const R = S.raid;
  document.querySelectorAll("#raidMode button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === R.mode));
  const host = document.getElementById("raidBosses");
  if (R.mode === "custom") {
    const c = R.custom;
    host.innerHTML = `<div class="filters">
      <div class="field"><label for="cbName">보스 이름 (선택)</label><input type="text" id="cbName" placeholder="예: 스톰 브링어" value="${esc(c.name)}"></div>
      <div class="field"><span class="lbl">보스 속성</span><div class="seg" id="cbEl">${ELS.map(e => `<button data-v="${e}" aria-pressed="${c.element === e}">${EL[e]}</button>`).join("")}</div>
        <span class="note">→ 약점: <b>${EL[WEAK[c.element]]}</b> 니케로 딜해요</span></div>
    </div>`;
  } else {
    const ss = seasonsOf(R.mode), cur = curSeason(R.mode);
    if (!cur.bosses.find(b => b.id === R.boss)) R.boss = cur.bosses[0].id;
    host.innerHTML = `<div class="row" style="margin-bottom:8px"><div class="field"><label for="raidSeason">시즌</label>
      <select id="raidSeason" style="width:auto;max-width:100%">${ss.map(s => `<option value="${s.season}" ${s.season === cur.season ? "selected" : ""}>${typeof s.season === "number" ? s.season + "시즌" : esc(s.season)} ·${esc(s.when)}${R.mode === "solo" ? ` · ${esc(s.bosses[0].ko)} (약점 ${EL[s.bosses[0].weak]})` : ""}${s.note ? ` (${esc(s.note)})` : ""}</option>`).join("")}</select></div>
      <span class="note grow">${R.mode === "union" ? "위에서부터 최신 시즌이에요." : R.mode === "solo" ? "같은 보스가 다른 속성으로 다시 나오기도 해요. 위에서부터 최신 시즌이에요." : "이상개체 요격전(특특요) 보스 5마리. 하루 한 보스씩 돌아가요."}</span></div>
      <div class="boss">${cur.bosses.map(b => { const core = b.id in CORE_MAP ? CORE_MAP[b.id] : b.core;
        return `<button class="bossbtn" data-boss="${b.id}" aria-pressed="${R.boss === b.id}"><span class="bn">${esc(b.ko)}</span><span class="row" style="gap:4px"><span class="chip el" data-e="${b.element}">${EL[b.element]}</span><span class="note">약점</span><span class="chip el" data-e="${b.weak}">${EL[b.weak]}</span></span><span class="note">${core === true ? "코어 있음" : core === false ? "코어 없음" : "코어 모름"}${b.diff ? ` · ${esc(b.diff)}` : ""}</span></button>`; }).join("")}</div>`;
  }
  const { el, boss } = raidTarget();
  document.getElementById("raidInfo").innerHTML = `<div class="panel" style="display:flex;flex-direction:column;gap:10px">
      <div class="teamhead"><h3>${esc(boss.ko)} ${boss.en ? `<span class="en note">${esc(boss.en)}</span>` : ""}</h3><span class="row" style="gap:4px"><span class="note">보스 속성</span><span class="chip el" data-e="${boss.element}">${EL[boss.element]}</span><span class="note">→ 쓰면 좋은 속성</span><span class="chip el" data-e="${boss.weak}">${EL[boss.weak]}</span></span></div>
      ${boss.pickup ? `<p style="margin:0" class="note">그 시즌 픽업 니케: ${esc(boss.pickup)}</p>` : ""}
      ${appearances(boss)}
      <div class="row">${coreSeg(boss)}</div>
      <p style="margin:0" class="note">${coreText(boss)}</p>
      ${boss.heal ? `<p style="margin:0"><b>힐 필요?</b> ${esc(boss.heal)}</p>` : ""}
      ${boss.tips ? `<ul class="tips">${boss.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    </div>`;
  const n = +document.getElementById("autoN").value;
  const out = document.getElementById("autoOut");
  if (!S.owned.size) { out.innerHTML = `<div class="empty">‘보유 니케’ 탭에서 가진 니케를 체크하면 자동으로 덱을 짜드려요.</div>`; document.getElementById("autoNote").textContent = ""; }
  else {
    const ts = autoBuild(el, n, document.getElementById("autoHeal").checked, boss);
    document.getElementById("autoNote").textContent = `${EL[el]} 딜러 위주${boss.core === true ? " · 코어 있음 반영" : boss.core === false ? " · 코어 없음 반영" : ""} · 덱끼리 니케가 겹치지 않아요`;
    out.innerHTML = ts.length ? ts.map((t, i) => { const f = coreFit(t.m.map(c => c.s), boss);
      return `<div class="teamcard"><div class="teamhead"><h3>${i + 1}덱${t.guide ? ` · ${esc(t.guide)}` : ""}</h3><span class="badge ${t.warn ? "part" : "ok"}">${esc(t.why)}</span>${f ? `<span class="badge ${FIT_LABEL[f][0]}">${FIT_LABEL[f][1]}</span>` : ""}</div><div class="team">${t.m.map(c => slot(c.s, "cube")).join("")}</div></div>`; }).join("")
      : `<div class="empty">덱을 짤 만큼 니케가 없어요. 니케를 더 체크해 보세요.</div>`;
  }
  const ts = teamsFor(el, boss).slice(0, 14);
  document.getElementById("raidTeams").innerHTML = ts.length ? ts.map(t => `<div class="panel teamcard"><div class="teamhead"><h3>${esc(t.name)}</h3><span class="note">${esc(t.src)}</span><span class="badge ${t.have === t.need ? "ok" : t.have ? "part" : "no"}">${t.have}/${t.need}명 보유</span>${t.fit ? `<span class="badge ${FIT_LABEL[t.fit][0]}">${FIT_LABEL[t.fit][1]}</span>` : ""}</div>
    <div class="team">${t.m.map(x => slot(x)).join("")}</div>${t.sub ? `<p class="note" style="margin:0">대체: ${esc(t.sub)}</p>` : ""}</div>`).join("")
    : `<div class="empty">이 속성으로 등록된 추천 덱이 없어요.</div>`;
}
document.addEventListener("click", e => {
  const cs = e.target.closest("#coreSeg button");
  if (cs) {
    const v = cs.dataset.core === "true" ? true : cs.dataset.core === "false" ? false : null;
    if (S.raid.mode === "custom") S.raid.custom.core = v; else setCore(raidTarget().boss.id, v);
    renderRaid(); return;
  }
  const ce = e.target.closest("#cbEl button");
  if (ce) { S.raid.custom.element = ce.dataset.v; renderRaid(); }
});
// Anomaly Interception is one attempt with one team; raids use five.
document.addEventListener("click", e => {
  const rm = e.target.closest("#raidMode button");
  if (rm) document.getElementById("autoN").value = rm.dataset.v === "anomaly" ? "1" : "5";
}, true);
document.addEventListener("change", e => {
  if (e.target.id === "raidSeason") { S.raid.season[S.raid.mode] = +e.target.value; S.raid.boss = null; renderRaid(); }
});
document.addEventListener("input", e => {
  if (e.target.id === "cbName") { S.raid.custom.name = e.target.value; const h = document.querySelector("#raidInfo h3"); if (h) h.textContent = e.target.value || "직접 만든 보스"; }
});

