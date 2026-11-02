/*
 * 따라가기(hike.js) 안전 · 저장 조각(2026-11-02 홍TV님 점검 5차) - hike.js 는 큰 한 덩어리라 그 함수만 꺼내 가짜 hike · localStorage 로 돌려 봄.
 * ReviewRound5Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/hike-safety.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var js = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/hike.js"), "utf8");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }
function has(name, s) { assert(js.indexOf(s) >= 0, name + " - hike.js 에 없음: " + s); n++; }
/** hike.js 에서 "    function 이름(" 로 시작하는 함수 하나(4칸 들여쓰기 끝 "    }" 까지). */
function fn(name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(js);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}

// ---- SOS · 산악회 방 위치: 시험 걷기 위치(앞당긴 시계 - 늘 "방금")는 쓰지 않음
var NOW = Date.UTC(2026, 10, 2, 3, 0);
function realFix(hike) {
    return vm.runInNewContext("(function () {" + fn("realFix") + " return realFix(); })()", { hike: hike, Date: { now: function () { return NOW; } } });
}
var f = { lat: 37.5, lon: 127, acc: 5, t: NOW - 10000 };
eq("실제 위치 10초 전 - 씀", realFix({ sim: false, fix: f }), f);
eq("시험 걷기 중 - 안 씀", realFix({ sim: true, fix: f }), null);
eq("1분 넘은 위치 - 안 씀", realFix({ sim: false, fix: { lat: 1, lon: 1, t: NOW - 61000 } }), null);
eq("앞당긴 시계(시험 걷기에서 남은 위치) - 안 씀", realFix({ sim: false, fix: { lat: 1, lon: 1, t: NOW + 30 * 60000 } }), null);
eq("위치 없음", realFix({ sim: false, fix: null }), null);
has("SOS 창은 realFix", "var fresh = realFix();");
has("방 SOS 보내기도 realFix, 없으면 ping", "var f = realFix(), r = f ? RFParty.fix(f.lat, f.lon, f.acc, true) : RFParty.ping(true);");
has("시험 걷기를 끝내면 위치를 버림", "if (wasSim) hike.fix = null;");
has("실제 산행 시작 때도", "if (!sim) hike.fix = null;");
has("방에 보내는 위치의 거부를 잡음", "if (pr) pr.catch(function () {");

// ---- 오프라인 저장 지우기: 저장한 산 페이지(rf-offline-m)가 쓰는 이 사이트 주소는 남김
function keeps(mSaved, u) {
    var ctx = {
        localStorage: { getItem: function (k) { return k === "rf-offline-m" ? mSaved : null; } },
        location: { origin: "https://routefly.kr" }
    };
    return vm.runInNewContext("(function () {" + fn("mountainKeeps") + fn("mountainSaved") + " return mountainKeeps(" + JSON.stringify(u) + "); })()", ctx);
}
var M = JSON.stringify({ "/routefly/m/설악산": 1 });
eq("산 페이지 저장 없음 - 코스 자료도 지움", keeps(null, "https://routefly.kr/routefly/api/course?id=knps-1"), false);
eq("산 페이지 저장 있음 - 코스 자료 남김", keeps(M, "https://routefly.kr/routefly/api/course?id=knps-1"), true);
eq("산 페이지 화면 · js 남김", keeps(M, "https://routefly.kr/routefly/js/kit-m.js"), true);
eq("지도 그림(바깥 주소)은 지움", keeps(M, "https://xdworld.vworld.kr/2d/Satellite/service/15/1/2.jpeg"), false);
eq("주변 길 · 지도 설정은 따라가기만 씀 - 지움", [keeps(M, "https://routefly.kr/routefly/api/trails?bbox=1,2,3,4"), keeps(M, "https://routefly.kr/routefly/api/map-config")], [false, false]);
eq("저장 표를 못 읽으면 남기는 쪽", keeps("{깨짐", "https://routefly.kr/routefly/api/course?id=x"), true);
has("산 페이지 저장이 있으면 캐시를 통째로 지우지 않음", "} else if (!others.length && !mountainSaved()) {");
has("지울 목록에서 산 페이지 주소는 뺌", "urls = urls.filter(function (u) { return !mountainKeeps(u); });");

// ---- 입산 통제 · 하산 시각 알림: 알린 것을 산행 저장분에(이어서 · 새로 고침 뒤 되풀이 안 함)
has("저장분에 said", "segT0: hike.segT0, said: ruleSaid, t: Date.now() }");
has("이어 할 때 되살림", "ruleSaid = saved && saved.said ? saved.said : {};");

console.log("OK " + n);
