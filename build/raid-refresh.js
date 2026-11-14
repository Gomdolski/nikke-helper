// Raid-time refresh, run about every 5 hours by the Mac mini:
// newest solo raid top-50 ranking -> build -> commit -> push. Does nothing outside a raid season or when the
// ranking has not changed, so the site version (and the friend's "new version" notice) only moves on real changes.
// Usage: node build/raid-refresh.js          (commit only)
//        node build/raid-refresh.js --push   (also sync with GitHub first and push)
// Last output line: DONE / SKIP / OUTSIDE / UNCHANGED / NODATA / CONFLICT / ERROR.
const { execFileSync } = require("child_process");
const path = require("path");
const { sync } = require("./git-sync");
const ROOT = path.join(__dirname, "..");
const run = (cmd, ...a) => execFileSync(cmd, a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
const done = (st, msg) => { if (msg) console.log(msg); console.log(st); };

try {
  const push = process.argv.includes("--push");
  if (run("git", "status", "--porcelain").trim()) { done("SKIP", "다른 작업이 저장소를 고치는 중이라 이번엔 건너뛰어요."); process.exit(0); }
  if (push) { const [st, msg] = sync(); if (st !== "OK") { done(st, msg); process.exit(1); } }
  let r;
  try { r = run(process.execPath, "build/update-soloraid.js", "--current"); }
  catch (e) { done("ERROR", "순위 받기 실패: " + String(e.stderr || e.message).trim()); process.exit(1); }
  const lines = r.trim().split("\n"), st = lines.pop();
  if (st !== "UPDATED") { done(st, lines.join(" / ")); process.exit(0); }
  const m = lines[lines.length - 1].match(/S(\d+) 기록 (\S+)/);
  const note = m ? `솔로 레이드 ${m[1]}시즌 상위권 기록 갱신 (${m[2]})` : "솔로 레이드 상위권 기록 갱신";
  const b = run(process.execPath, "build/build.js", "--note", note);
  const warn = b.split("\n").filter((l) => /not linked|not found/i.test(l));
  run("git", "add", "-A");
  run("git", "commit", "-q", "-m", `${note}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  if (push) run("git", "push", "-q", "origin", "HEAD:main");
  done("DONE", note + (push ? " · 사이트에 올림" : " · 커밋만 함") + (warn.length ? `\n이름 연결 안 됨: ${warn.join(" / ")}` : ""));
} catch (e) {
  done("ERROR", String(e.stderr || e.message).trim());
  process.exitCode = 1;
}
