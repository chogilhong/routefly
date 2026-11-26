/*
 * GPX 편집 "‹ 뒤로" - 처음 연 화면 판정(studio.js studioFrom, 2026-11-26 홍TV님 "처음 어디서 열었느냐가 중요해. 거기로 찾아가야지").
 * 실행: node src/test/js/studio-from.test.js (StudioGuideLoopTest 가 부름)
 */
"use strict";
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/studio.js"), "utf8");
var m = /    function studioFrom\(ref, origin\) \{[\s\S]*?\n    \}\n/.exec(src);
if (!m) { console.log("FAIL studioFrom 을 찾지 못함"); process.exit(1); }
var studioFrom = new Function("URL", m[0] + "return studioFrom;")(URL);
var fails = 0, runs = 0, O = "https://routefly.kr";
function eq(name, got, want) { runs++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log("FAIL " + name + ": " + JSON.stringify(got) + " (기대 " + JSON.stringify(want) + ")"); } }
eq("코스 모음에서 처음 열면 기억", studioFrom(O + "/routefly/m/", O), { first: true, guide: false, self: false, url: O + "/routefly/m/" });
eq("기록 보기에서 처음 열면 기억", studioFrom(O + "/routefly/trip.html#open", O).first, true);
eq("탐방 안내도에서 오면 처음 연 곳이 아님", studioFrom(O + "/routefly/park.html?name=%EC%84%A4%EC%95%85%EC%82%B0&back=studio", O), { first: false, guide: true, self: false, url: O + "/routefly/park.html?name=%EC%84%A4%EC%95%85%EC%82%B0&back=studio" });
eq("노선 안내도도", studioFrom(O + "/routefly/route.html?prefix=x&back=studio", O).guide, true);
// 다른 곳에서 연 안내도의 "이 길을 GPX 편집으로" 는 그 안내도가 처음 연 곳(2026-11-26 홍TV님 "다른 곳에서 들어왔으면 다시 거기로")
eq("따라가기에서 연 탐방 안내도", studioFrom(O + "/routefly/park.html?name=x&back=list", O), { first: true, guide: false, self: false, url: O + "/routefly/park.html?name=x&back=list" });
eq("back 없는 노선 안내도", studioFrom(O + "/routefly/route.html?prefix=x", O).first, true);
eq("GPX 편집에서 다시 열면 기억을 그대로", [studioFrom(O + "/routefly/studio.html", O).first, studioFrom(O + "/routefly/studio.html", O).self], [false, true]);
eq("바로 열었으면(referrer 없음)", studioFrom("", O), { first: false, guide: false, self: false, url: null });
eq("다른 사이트에서 왔으면 그곳으로", studioFrom("https://cafe.naver.com/", O), { first: true, guide: false, self: false, url: "https://cafe.naver.com/" });
console.log(fails ? fails + " 실패 / " + runs : "OK " + runs + "/" + runs);
process.exit(fails ? 1 : 0);
