/*
 * 끝난 산악회 방 알림(party-kit.js post · party-bar.js fail, 2026-11-07 홍TV님 폰: 가야산 따라가기를 열자 예전 시험 방이 "끝났습니다" 로 떴는데 어느 방인지 몰랐음).
 * 서버가 410(방 끝남)이면 이 기기 방 정보를 지우고, 오류에 그 방 이름(e.room)을 담음 - 다른 열쇠(예전 방)의 답이면 지우지도 이름을 붙이지도 않음.
 * FullReviewStage2Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/party-ended.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }

var store = {}, said = [];
var ctx = {
    Date: Date, Promise: Promise, JSON: JSON, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout,
    AbortController: AbortController, console: console, setInterval: function () { return 1; }, clearInterval: function () {},
    localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    location: { pathname: "/routefly/hike.html", search: "", href: "https://routefly.kr/routefly/hike.html" },
    addEventListener: function () {},
    navigator: {}, document: { hidden: false, visibilityState: "visible", addEventListener: function () {}, documentElement: { classList: { add: function () {}, remove: function () {} }, style: { setProperty: function () {} } },
        getElementById: function () { return { hidden: false, style: {}, classList: { toggle: function () {} } }; } },
    fetch: function () {   // 서버 PartyServlet 의 방 끝남 답(Party.drop 의 까닭 글)
        return Promise.resolve({ ok: false, status: 410, json: function () { return Promise.resolve({ success: false, message: "산행 시간이 지나 방이 끝났습니다." }); } });
    },
    RFDialog: { alert: function (t) { said.push(t); return Promise.resolve(); } }
};
ctx.window = ctx;
vm.createContext(ctx);
store["rf-party"] = JSON.stringify({ token: "tok", code: "ABCDEF", role: "member", name: "가야산 시험 산행" });
vm.runInContext(fs.readFileSync(path.join(web, "js/party-kit.js"), "utf8"), ctx);
var P = ctx.RFParty;

P.post("view", { token: "other" }).catch(function (e) {
    eq("다른 열쇠(예전 답) - 끝남이어도", e.ended, true);
    eq("이 기기 방은 그대로", "rf-party" in store, true);
    eq("이름도 안 붙임", e.room, undefined);
    return P.post("view", { token: "tok" });
}).catch(function (e) {
    eq("내 방 끝남", e.ended, true);
    eq("이 기기 방 정보를 지움(다음엔 안 뜸)", "rf-party" in store, false);
    eq("끝난 방 이름", e.room, "가야산 시험 산행");
}).then(function () {
    // 따라가기를 열 때와 같은 길: party-bar.js 가 뜨자마자 refresh → 서버가 410 → 알림 한 번
    store["rf-party"] = JSON.stringify({ token: "tok", code: "ABCDEF", role: "member", name: "가야산 시험 산행" });
    vm.runInContext(fs.readFileSync(path.join(web, "js/party-bar.js"), "utf8"), ctx);
    return new Promise(function (ok) { setTimeout(ok, 50); });
}).then(function () {
    eq("알림 한 번, 방 이름과 까닭", said, ["'가야산 시험 산행' 산악회 방이 끝났습니다. 인솔자에게 위치를 더 보내지 않습니다.\n산행 시간이 지나 방이 끝났습니다."]);
    eq("이 기기 방 정보를 지움", "rf-party" in store, false);
    console.log("OK " + n);
}).catch(function (e) { console.error("FAIL " + e.message); process.exit(1); });
