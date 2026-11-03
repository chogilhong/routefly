/*
 * 코스 정확도 점검(2026-11-03 홍TV님 "코스가 정확해야 해") 화면 조각을 실제로 돌려 봄.
 * CourseAccuracyTest 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/course-accuracy.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var HIKE = read("js/hike.js");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, name); n++; }
/** js 에서 "    function 이름(" 로 시작하는 함수 하나(4칸 들여쓰기 끝 "    }" 까지). */
function fn(js, name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(js);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}
function konst(js, name) {
    var m = new RegExp("var " + name + " = (\\d+);").exec(js);
    assert(m, name + " 를 찾지 못함");
    return +m[1];
}

// ---- 따라가기 도착: 끝 근처에서 시작하면 걷기 전에 "🎉 도착!" 이 나오지 않음
(function () {
    var env = { ARRIVE_M: konst(HIKE, "ARRIVE_M"), OFF_ROUTE_M: konst(HIKE, "OFF_ROUTE_M"), ARRIVE_GO_M: konst(HIKE, "ARRIVE_GO_M") };
    var at = function (c, hike, off) { env.c = c; env.hike = hike; env.off = off; return vm.runInNewContext(fn(HIKE, "arrivedAt") + " arrivedAt(c, hike, off);", env); };
    var c = { total: 5000 };
    eq("끝(들머리)에서 시작 - 바로 도착 아님", at(c, { d: 4990, d0: 4990, dMax: 4990 }, 5), false);
    eq("끝 근처에서 조금 흔들려도 도착 아님", at(c, { d: 4995, d0: 4975, dMax: 4998 }, 5), false);
    eq("처음부터 걸어 끝에 닿음 - 도착", at(c, { d: 4980, d0: 0, dMax: 4980 }, 5), true);
    eq("중간에서 시작해 끝에 닿음 - 도착", at(c, { d: 4990, d0: 3000, dMax: 4990 }, 5), true);
    eq("코스에서 벗어나 있으면 아님", at(c, { d: 4990, d0: 0, dMax: 4990 }, 80), false);
    eq("아주 짧은 코스는 절반만 나아가도", at({ total: 120 }, { d: 110, d0: 40, dMax: 110 }, 5), true);
    eq("첫 위치 전(d0 없음)은 아님", at(c, { d: 4990, d0: null, dMax: 4990 }, 5), false);
})();

console.log("OK " + n);
