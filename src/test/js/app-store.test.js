// js/app-store.js 의 wanted(띠를 보일까) - 안드로이드 브라우저만, 앱 · 아이폰 · PC · 영어 화면 · 하루 안에 닫은 기기는 안 보임(2026-11-10, 홍TV님 "강요하듯이" - 30일 → 하루).
// UA 글은 테스트에 이미 있는 실제 글(StatsTest · LogKeyAccessTest).
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/app-store.js"), "utf8");
const g = {}; vm.runInNewContext(src, { window: g, this: g });
const W = g.RFAppStore.wanted, D = 86400000, now = Date.UTC(2026, 10, 10);
const AND = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";
const WV = "Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";   // 카톡 등 앱 안 브라우저
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
ok(W(AND, false, "ko", null, now) === true, "안드로이드 브라우저");
ok(W(WV, false, "ko", null, now) === true, "카톡 안 브라우저(웹뷰)도 앱이 아니면 보임");
ok(W(WV, true, "ko", null, now) === false, "routefly 앱 안");
ok(W(IOS, false, "ko", null, now) === false, "아이폰");
ok(W(PC, false, "ko", null, now) === false, "PC");
ok(W(AND, false, "en", null, now) === false, "영어 화면(원스토어는 한국만)");
ok(W(AND, false, "ko", now - 23 * 3600000, now) === false, "닫은 지 23시간");
ok(W(AND, false, "ko", now - 25 * 3600000, now) === true, "닫은 지 25시간 - 다시");
console.log(bad ? "app-store: " + bad + " FAIL / " + n : "app-store OK " + n);
process.exit(bad ? 1 : 0);
