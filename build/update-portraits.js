// Refresh portrait URLs from nikke-api (official blablalink CDN links; images are not copied into the repo).
// Usage: node build/update-portraits.js   -> writes build/src/portraits.json, then run build.js
const fs = require("fs");
const path = require("path");

(async () => {
  const r = await fetch("https://nikke-api.pages.dev/api/nikkes?limit=500");
  if (!r.ok) throw new Error("nikke-api " + r.status);
  const j = await r.json();
  const list = (j.characters || []).map((c) => ({
    ko: c.name && c.name.ko, en: c.name && c.name.en, corp: c.corporation,
    icon: c.images && c.images.icon, medium: c.images && c.images.medium,
  })).filter((c) => c.ko && c.icon);
  fs.writeFileSync(path.join(__dirname, "src", "portraits.json"), JSON.stringify({ at: new Date().toISOString().slice(0, 10), list }, null, 1));
  console.log("portraits", list.length);
})();
