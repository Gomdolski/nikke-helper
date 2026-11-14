// Bring the local branch up to date with GitHub before a task edits anything.
// Usage: node build/git-sync.js
// Behind only -> fast-forward. Diverged (local nickname commits + new commits on GitHub) -> rebase local
// commits on top. index.html and version.json are build output, so a conflict there just keeps the local
// copy; the task rebuilds afterwards anyway. Any other conflict aborts the rebase and prints CONFLICT.
// Last output line: OK / DIRTY / CONFLICT / ERROR.
const { execFileSync } = require("child_process");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true" } });
const GENERATED = new Set(["index.html", "version.json"]);

function sync() {
  if (git("status", "--porcelain").trim()) return ["DIRTY", "커밋 안 된 수정이 있어서 맞추지 않았어요."];
  git("fetch", "-q", "origin");
  const [ahead, behind] = git("rev-list", "--left-right", "--count", "HEAD...origin/main").trim().split(/\s+/).map(Number);
  if (!behind) return ["OK", ahead ? `이미 최신 (안 올린 커밋 ${ahead}개)` : "이미 최신"];
  if (!ahead) { git("merge", "--ff-only", "-q", "origin/main"); return ["OK", `새 커밋 ${behind}개 받음`]; }
  try { git("rebase", "-q", "origin/main"); return ["OK", `안 올린 커밋 ${ahead}개를 새 커밋 ${behind}개 위로 옮김`]; }
  catch (e) {
    for (let i = 0; i < 50; i++) {
      const conflicted = git("diff", "--name-only", "--diff-filter=U").trim().split("\n").filter(Boolean);
      if (!conflicted.length) break;
      if (!conflicted.every((f) => GENERATED.has(f))) { try { git("rebase", "--abort"); } catch (_) {} return ["CONFLICT", `직접 봐야 하는 충돌: ${conflicted.join(", ")}`]; }
      git("checkout", "--theirs", "--", ...conflicted); // during a rebase, "theirs" is the local commit being replayed
      git("add", "--", ...conflicted);
      try { git("rebase", "--continue"); break; } catch (_) { /* next commit also conflicted: loop */ }
    }
    return ["OK", `안 올린 커밋 ${ahead}개를 새 커밋 ${behind}개 위로 옮김 (빌드 결과 충돌은 다시 빌드하면 맞춰져요)`];
  }
}

if (require.main === module) {
  try { const [st, msg] = sync(); console.log(msg); console.log(st); if (st !== "OK") process.exitCode = 1; }
  catch (e) { console.error(String(e.stderr || e.message)); console.log("ERROR"); process.exitCode = 1; }
}
module.exports = { sync };
