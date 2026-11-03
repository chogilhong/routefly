/*
 * 점검 7차(2026-11-03 홍TV님) 화면 조각을 실제로 돌려 봄 - 화면 js 에서 함수만 꺼내 가짜 지도 · 위치 · 화면으로.
 * ReviewRound7Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/review7.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var HIKE = read("js/hike.js"), PARTY = read("js/party.js");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, name); n++; }
/** js 에서 "    function 이름(" 로 시작하는 함수 하나(한 줄짜리도). */
function fn(js, name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[^\\n]*\\}(   //[^\\n]*)?\\n").exec(js)
        || new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(js);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}
/** course-kit.js · kit-party.js 를 가짜 화면에 올려 RF 를 꺼냄. */
function kit(f) {
    var ctx = { console: console, navigator: { language: "ko" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
        document: { documentElement: { lang: "ko", style: { setProperty: function () {} }, classList: { add: function () {}, remove: function () {}, toggle: function () {} } },
            getElementById: function () { return null; }, querySelectorAll: function () { return []; }, querySelector: function () { return null; }, addEventListener: function () {} },
        location: { search: "", pathname: "/" } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read(f), ctx);
    return ctx.RF;
}

// ---- 1: 안 탐 · 하산 탑승 회원의 SOS 도 인솔자 알림 · 지도 자리
["js/course-kit.js", "js/kit-party.js"].forEach(function (f) {
    var s = { role: "lead", now: 1, departed: true, members: [
        { id: 2, role: "hiker", nick: "늦잠", sos: true, cancelled: true, sosOdd: true },
        { id: 3, role: "hiker", nick: "산돌", sos: true, aboard: false },
        { id: 4, role: "hiker", nick: "버스", sos: true, aboard: true },
        { id: 5, role: "hiker", nick: "가짜", sos: true, sosOdd: true }] };
    eq(f + " SOS 알림", kit(f).partyAlerts(s, {}).msgs, ["🆘 SOS - 늦잠 님 (안 탐)", "🆘 SOS - 산돌 님", "🆘 SOS - 버스 님", "🆘 SOS - 가짜 님 (명단에 없는 참가자)"]);
});
(function () {
    var put = [];
    var ctx = { map: { loaded: function () { return true; } }, marks: {}, lastPos: null, OLD_S: 600, T: function (k) { return k; }, agoText: function () { return ""; },
        document: { createElement: function () { return {}; } }, maplibregl: {} };
    vm.runInNewContext("var fitted = true;" + fn(PARTY, "drawMap").replace("seen[key] = 1;", "seen[key] = 1; out.push(key); return;")
        + " this.f = drawMap;", Object.assign(ctx, { out: put }));
    ctx.f({ me: 1, members: [{ id: 2, lat: 1, lon: 2, cancelled: true, sos: true }, { id: 3, lat: 1, lon: 2, cancelled: true }, { id: 4, lat: 1, lon: 2 }] });
    eq("지도 - 취소 회원도 SOS 면 보임", put, ["m2", "m4"]);
})();

console.log("OK " + n);
