/*
 * 점검 8차(2026-11-03 홍TV님) 화면 조각을 실제로 돌려 봄 - 하산 시간 · 주머니 모드 · 화면 고침들.
 * ReviewRound8Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/review8.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var HIKE = read("js/hike.js");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, name); n++; }
function has(name, src, s) { assert(src.indexOf(s) >= 0, name + " - 없음: " + s); n++; }
/** js 에서 "    function 이름(" 로 시작하는 함수 하나(4칸 들여쓰기 끝 "    }" 까지). */
function fn(js, name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[^\\n]*\\}(   //[^\\n]*)?\\n").exec(js)
        || new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(js);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}
/** course-kit.js 를 가짜 화면에 올려 RF 를 꺼냄. */
function kit() {
    var ctx = { console: console, navigator: { language: "ko" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
        document: { documentElement: { lang: "ko", style: { setProperty: function () {} }, classList: { add: function () {}, remove: function () {}, toggle: function () {} } },
            getElementById: function () { return null; }, querySelectorAll: function () { return []; }, querySelector: function () { return null; }, addEventListener: function () {} },
        location: { search: "", pathname: "/" } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read("js/course-kit.js"), ctx);
    return ctx.RF;
}
var RF = kit();

// ---- 하산 시간(2026-11-03 홍TV님 - 안전): 따라가기 남은 시간 · 시작 안내 · 귀가 확인에 내리막도
(function () {
    // 0 → 600 → 0m 왕복형 4km: 거리 1시간 + 오르막 1시간 + 내리막 600m 20분 = 2시간 20분
    var c = { course: { kind: "hike" }, dist: [0, 2000, 4000], asc: [0, 600, 600], ele: [0, 600, 0], total: 4000 };
    var remaining = function (hike) {
        return vm.runInNewContext("(function () {" + fn(HIKE, "remainingMs") + " return remainingMs(0); })()", { RF: RF, c: c, hike: hike, now: function () { return 0; } });
    };
    eq("출발 때 남은 시간 - 내리막 포함", Math.round(remaining({ d: 0, d0: 0 }) / 60000), 140);
    eq("정상에서 남은 시간 - 내려가는 2km 30분 + 내리막 20분", Math.round(remaining({ d: 2000, d0: 0 }) / 60000), 50);
    eq("시작 안내 · 귀가 확인 · 시작 점검 · 공유는 RF.legMs(내리막 포함)", HIKE.split("RF.legMs(c, 0, c.total)").length - 1, 6);
    eq("오르막만 쓰던 옛 식이 남지 않음", HIKE.indexOf("RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0))"), -1);
})();

console.log("OK " + n);
