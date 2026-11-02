/*
 * 산악회 방 SOS 보내기(party-kit.js, 2026-11-02 홍TV님 점검): 못 보낸 SOS 는 10초 뒤 다시(전에는 보낸 것으로 쳐 30초 동안 · 위치가 없으면 영영 안 갔음),
 * SOS 가 켜진 동안은 위치가 없어도 살펴서 ping. 가짜 fetch · 시계 · setInterval 로 party-kit.js 를 vm 에서 돌림.
 * PartySafetyFixTest 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/party-sos.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/party-kit.js"), "utf8");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }

var NOW = Date.UTC(2026, 10, 2, 3, 0), store = {}, calls = [], down = true, timers = [];
function FakeDate(a) { return a === undefined ? new Date(NOW) : new Date(a); }
FakeDate.now = function () { return NOW; };
var ctx = {
    Date: FakeDate, Promise: Promise, JSON: JSON, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout,
    AbortController: AbortController, console: console,
    setInterval: function (f, ms) { timers.push({ f: f, ms: ms, on: true }); return timers.length; },
    clearInterval: function (id) { if (timers[id - 1]) timers[id - 1].on = false; },
    localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    location: { pathname: "/routefly/hike.html", search: "" },
    navigator: {}, document: { hidden: false },
    fetch: function (url, o) {
        calls.push({ url: url, body: JSON.parse(o.body) });
        if (down) return Promise.reject(new TypeError("Failed to fetch"));
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ success: true }); } });
    }
};
ctx.window = ctx;
vm.createContext(ctx);
store["rf-party"] = JSON.stringify({ token: "tok", code: "ABCDEF" });
vm.runInContext(src, ctx);
var P = ctx.RFParty;
function settle(p) { return p ? p.then(function () { return "ok"; }, function () { return "fail"; }) : Promise.resolve(null); }
function live() { return timers.filter(function (t) { return t.on; }); }

eq("SOS 끔 - 살피는 타이머 없음", live().length, 0);
P.sos(true);
eq("SOS 켬 - 살피는 타이머", live().length, 1);

settle(P.ping(true)).then(function (r) {
    eq("위치 없는 SOS - 신호 없음으로 실패", [r, calls.length, calls[0].body.sos], ["fail", 1, true]);
    NOW += 1000;
    eq("1초 뒤 - 몰아 보내지 않음", P.ping(), null);
    NOW += 10000;
    down = false;
    var again = P.ping();
    assert(again, "10초 뒤 - 못 보낸 SOS 를 다시 보내야 함(전에는 보낸 것으로 쳐 안 보냈음)"); n++;
    return settle(again);
}).then(function (r) {
    eq("다시 보낸 SOS 는 감", [r, calls.length, calls[1].body.sos], ["ok", 2, true]);
    NOW += 5000;
    eq("보낸 뒤 30초 안 - 위치도 그대로 기다림", P.fix(37.5, 127, 10), null);
    NOW += 40000;   // 위치가 안 옴(실내 · 골짜기) - 살피는 타이머가 ping
    live()[0].f();
    return new Promise(function (r) { setTimeout(r, 10); });
}).then(function () {
    eq("살피는 타이머가 SOS ping", [calls.length, calls[2].url, calls[2].body.sos], [3, "api/party/ping", true]);
    P.sos(false);
    eq("SOS 를 끄면 타이머 멈춤", live().length, 0);
    console.log("OK " + n);
}).catch(function (e) { console.error(e); process.exit(1); });
