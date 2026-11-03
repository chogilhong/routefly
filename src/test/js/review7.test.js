/*
 * 점검 7차(2026-11-03 홍TV님) 화면 조각을 실제로 돌려 봄 - 화면 js 에서 함수만 꺼내 가짜 지도 · 위치 · 화면으로.
 * ReviewRound7Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/review7.test.js
 */
"use strict";
process.env.TZ = "America/New_York";   // 한국이 아닌 시간대(한국 PC 에서도 한국 시간 처리를 봄) - Date 를 쓰기 전에
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

// ---- 3: 움직임 없음 - 받은 시각(rx)으로(GPS 시각 t 가 폰 시계와 5분 어긋나도 묻기를 건너뛰지 않음)
(function () {
    var NOW = Date.UTC(2026, 10, 3, 3, 0), got = [];
    var ctx = { hike: { running: true, fix: { lat: 37.5, lon: 127, acc: 10, t: NOW - 5 * 60000, rx: NOW - 1000 } }, now: function () { return NOW; },
        RF: { stillCheck: function (a, f, t) { got.push([f.t, t]); return { anchor: a, due: false }; } }, STILL_M: 30, STILL_MS: 1200000 };
    vm.runInNewContext(fn(HIKE, "stillTick") + " this.f = stillTick;", ctx);
    ctx.f();
    eq("GPS 시각이 5분 늦어도 받은 시각으로 셈", got, [[NOW - 1000, NOW]]);
    ctx.hike.fix.rx = NOW - 200000;
    ctx.f();
    eq("받은 지 3분 넘으면 묻지 않음", got.length, 1);
})();

// ---- 4: #c= 로 연 지도 - 코스에 맞추면(긴 코스는 z7 아래) 줌과 상관없이 위성 · 밝은 지도를 풂
(function () {
    var m = /\n        if \(hold\) \{[\s\S]*?\n        \}\n/.exec(HIKE);
    assert(m, "startMap 의 hold 조각"); n++;
    var on = {}, ranges = [];
    var map = { getZoom: function () { return 6.5; }, on: function (e, f) { on[e] = f; }, off: function (e, f) { if (on[e] === f) delete on[e]; },
        getLayer: function () { return true; }, setLayerZoomRange: function (id, a, b) { ranges.push([id, a, b]); } };
    var ctx = { map: map, SAT_HOLD_Z: 7, satRelease: null, hold: true };
    vm.runInNewContext(m[0] + " this.rel = function () { return satRelease; };", ctx);
    on.zoomend();
    eq("z6.5 에서는 그대로", ranges.length, 0);
    ctx.rel()();   // drawCourse 가 코스에 맞춘 뒤
    eq("코스에 맞추면 풂", ranges, [["sat", 0, 24], ["base", 0, 24]]);
    eq("한 번만 · 줌 지켜보기도 멈춤", [ctx.rel(), !!on.zoomend], [null, false]);
    assert(/map\.fitBounds\(b, \{ padding: 40, duration: 0, maxZoom: 16 \}\);\n\s*if \(satRelease\) satRelease\(\);/.test(HIKE), "drawCourse 가 맞춘 뒤 부름"); n++;
})();

// ---- 8: 옛 hike.html(캐시)에 없는 칸 - 없어도 멈추지 않음
assert(HIKE.indexOf('if ($("sosOff")) $("sosOff").addEventListener("click", function () { sosHide(); partySosOff();') >= 0 && !/[^(]\$\("sosOff"\)\.(hidden|addEventListener)/.test(HIKE.replace(/if \(\$\("sosOff"\)\) \$\("sosOff"\)/g, "")), "sosOff 는 있는지 보고"); n++;
assert(!/[^(]\$\("loadFail"\)\.hidden/.test(HIKE.replace(/if \(\$\("loadFail"\)\) \$\("loadFail"\)/g, "")) && /var box = \$\("loadFail"\);\n\s*if \(!box\)/.test(HIKE), "loadFail 도"); n++;

// ---- 11: 산행을 끝내면 이어 하기 표시를 바로 지움(기록을 쓰는 동안 다시 열어도 끝낸 산행이 이어지지 않게), 걸은 길은 남김
(function () {
    var store = { "rf-hike-active": "123", "rf-hike-123": JSON.stringify({ start: 1, d: 500, t: Date.now() }), "rf-hike-123-track": "[[1,2]]" };
    var ls = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
    var ctx = { localStorage: ls, JSON: JSON, Date: Date, c: { id: "123" } };
    vm.runInNewContext("var ACTIVE_KEY = 'rf-hike-active';" + fn(HIKE, "saveKey") + fn(HIKE, "savedFresh") + fn(HIKE, "loadSaved") + fn(HIKE, "endSaved")
        + " this.load = loadSaved; this.end = endSaved;", ctx);
    eq("끝내기 전에는 이어 함", ctx.load().d, 500);
    ctx.end("123");
    eq("끝내면 이어 하지 않음 · rf-hike-active 지움 · 걸은 길은 그대로", [ctx.load(), "rf-hike-active" in store, store["rf-hike-123-track"]], [null, false, "[[1,2]]"]);
    assert(/endSaved\(doneId\);[^\n]*\n\s*var stored = finishRecord\(\);/.test(HIKE), "stopHike 가 기록 쓰기 전에 부름"); n++;
})();

// ---- 12: 기록 보기 날짜도 한국 시간(이 파일은 TZ 를 뉴욕으로 - 한국 시각 01:30 이면 뉴욕은 전날)
(function () {
    var NY = new Date(Date.UTC(2026, 10, 2, 16, 30));   // 한국 11/3 01:30
    var m = /var d = new Date\(rec\.start \+ 9 \* 3600000\);[^\n]*\n[^\n]*\n\s*\[\[T\("날짜", "Date"\), (d\.getUTCFullYear\(\)[^\]]*?) \+ " " \+ clock/.exec(HIKE);
    assert(m, "showRecord 날짜 줄"); n++;
    eq("한국 날짜", vm.runInNewContext("var d = new Date(" + NY.getTime() + " + 9 * 3600000); " + m[1], {}), "2026.11.3");
})();

// ---- 10: 못 보낸 SOS 끄기는 다시 보냄(전에는 30초 뒤 · 위치가 없으면 영영 안 가 인솔자에게 SOS 가 남았음)
var later = [];
later.push(function () {
    var NOW = Date.UTC(2026, 10, 3, 3, 0), store = {}, calls = [], down = false, timers = [];
    function FakeDate(a) { return a === undefined ? new Date(NOW) : new Date(a); }
    FakeDate.now = function () { return NOW; };
    var ctx = { Date: FakeDate, Promise: Promise, JSON: JSON, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout, AbortController: AbortController, console: console,
        setInterval: function (f, ms) { timers.push({ f: f, ms: ms, on: true }); return timers.length; },
        clearInterval: function (id) { if (timers[id - 1]) timers[id - 1].on = false; },
        localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        location: { pathname: "/routefly/hike.html", search: "" }, navigator: {}, document: { hidden: false },
        fetch: function (url, o) {
            calls.push({ url: url, body: JSON.parse(o.body) });
            if (down) return Promise.reject(new TypeError("Failed to fetch"));
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ success: true }); } });
        } };
    ctx.window = ctx;
    vm.createContext(ctx);
    store["rf-party"] = JSON.stringify({ token: "tok", code: "ABCDEF" });
    vm.runInContext(read("js/party-kit.js"), ctx);
    var P = ctx.RFParty;
    function settle(x) { return x ? x.then(function () { return "ok"; }, function () { return "fail"; }) : Promise.resolve(null); }
    function live() { return timers.filter(function (t) { return t.on; }); }
    P.sos(true);
    return settle(P.ping(true)).then(function (r) {
        eq("SOS 켬 감", r, "ok");
        down = true;
        P.sos(false);
        NOW += 1000;
        return settle(P.ping(true));
    }).then(function (r) {
        eq("SOS 끄기 실패", [r, calls[1].body.sos], ["fail", false]);
        eq("끄기가 갈 때까지 살피는 타이머", live().length, 1);
        NOW += 1000;
        eq("1초 뒤 - 몰아 보내지 않음", P.ping(), null);
        NOW += 10000;
        down = false;
        var again = P.ping();
        assert(again, "10초 뒤 - 못 보낸 끄기를 다시 보내야 함(전에는 30초 · 위치가 없으면 영영)"); n++;
        return settle(again);
    }).then(function (r) {
        eq("다시 보낸 끄기는 감", [r, calls[2].body.sos], ["ok", false]);
        live()[0].f();   // 살핌 - 끄기가 갔으니 멈춤
        eq("끄기가 가면 타이머 멈춤", live().length, 0);
    });
});

later.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () { console.log("OK " + n); })
    .catch(function (e) { console.error(e); process.exit(1); });
