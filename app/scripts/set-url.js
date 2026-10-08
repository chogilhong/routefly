// 앱이 띄울 서버 주소를 바꾸고 안드로이드 프로젝트에 반영합니다.
//   npm run url -- https://abc-def.trycloudflare.com          (뒤에 /routefly/hike.html 을 붙입니다)
//   npm run url -- https://routefly.kr/routefly/hike.html      (전체 주소를 그대로)
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let url = (process.argv[2] || "").trim();
if (!/^https:\/\/[^/\s]+/.test(url)) {
  console.error("https 로 시작하는 주소를 넣어 주세요. 예: npm run url -- https://abc-def.trycloudflare.com");
  process.exit(1);
}
if (!/\/routefly\//.test(url)) url = url.replace(/\/+$/, "") + "/routefly/hike.html";

const file = path.join(__dirname, "..", "capacitor.config.json");
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
cfg.server = Object.assign({}, cfg.server, { url: url });
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log("server.url = " + url);
execSync("npx cap sync android", { stdio: "inherit", cwd: path.join(__dirname, "..") });
