/*
 * 점검 11차(2026-11-16 홍TV님 "전부 작업해") - docs/review-11-2026-11-16.md 의 화면 조각을 실제로 돌려 봄.
 * CheckupRound11Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/review11.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }
var HIKE = read("js/hike.js");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, name); n++; }
/** js 에서 "    function 이름(" 로 시작하는 함수 하나. */
function fn(js, name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[^\\n]*\\}(   //[^\\n]*)?\\n").exec(js)
        || new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(js);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}
var pending = [];

// ---- A2: 오프라인 저장 - 망이 끊기거나 저장 공간이 차면 "✅ 저장됨" 이 아님
function saveRun(fail) {
    var btn = { textContent: "", disabled: false }, saved = [], toasts = [], put = 0;
    var cache = { put: function (u) { put++; if (fail === "quota" && !/offline-index/.test(String(u))) return Promise.reject(new Error("QuotaExceededError")); return Promise.resolve(); } };
    var ctx = {
        c: { id: "c1", course: { name: "산" }, total: 1000 }, EN: false, Math: Math, JSON: JSON, Response: function () { },
        $: function () { return btn; }, T: function (k) { return k; }, num: String, toast: function (t) { toasts.push(t); },
        courseUrls: function () { return ["api/course?id=c1"]; }, courseBbox: function () { return "b"; }, absUrl: function (u) { return u; },
        offlineIndex: function () { return Promise.resolve([]); }, offlineIndexKey: function () { return "offline-index?c1"; },
        offlineIds: function () { return saved.slice(); }, setOfflineIds: function (l) { saved = l; }, setOfflineName: function () { },
        OFFLINE_CACHE: "rf-offline-v1", caches: { open: function () { return Promise.resolve(cache); } },
        fetch: function (u) { return fail === "net" ? Promise.reject(new Error("offline")) : Promise.resolve({ ok: true }); }, navigator: {}, lsGet: function () { return null; },
        Promise: Promise
    };
    vm.runInNewContext(fn(HIKE, "saveOffline") + " this.p = saveOffline({ urls: ['https://t/1', 'https://t/2', 'https://t/3'] });", ctx);
    return ctx.p.then(function () { return { text: btn.textContent, saved: saved, toast: toasts[0] || "" }; });
}
pending.push(Promise.all([saveRun(null), saveRun("net"), saveRun("quota")]).then(function (r) {
    eq("다 받으면 저장됨", [r[0].text, r[0].saved], ["✅ 저장됨", ["c1"]]);
    eq("망이 끊기면 일부만 · 저장 코스로 안 침", [r[1].text, r[1].saved, /와이파이에서 다시/.test(r[1].toast)], ["⚠️ 일부만", [], true]);
    eq("저장 공간이 차도(cache.put 실패) 일부만", [r[2].text, r[2].saved], ["⚠️ 일부만", []]);
}));

// ---- E2: 산행 중 90분마다 특보 · 산불 다시 보기 - 약 5km 칸 가운데만, 새 경고만 알림
(function () {
    var asked = [], toasts = [], said = [], t = 1000000;
    var ctx = {
        Date: { now: function () { return t; } }, hike: { running: true, safeT: 0, safeLast: null }, loadSeq: 1, EN: false, Object: Object,
        RF: { cellCenter: function (a, b) { return [Math.round(a * 20) / 20, Math.round(b * 20) / 20]; },
              safetyAlert: function (j) { return j.warn ? "⛑️ 오늘의 산행 안전: " + j.warn : ""; } },
        fetch: function (u) { asked.push(u); return Promise.resolve({ json: function () { return { success: true, warn: asked.length >= 2 ? "호우주의보" : null }; } }); },
        toast: function (m) { toasts.push(m); }, say: function (m) { said.push(m); }, navigator: {}
    };
    vm.runInNewContext("var SAFE_EVERY_MS = 90 * 60000;" + fn(HIKE, "safetyRecheck") + " this.f = safetyRecheck;", ctx);
    ctx.f(37.6789, 127.0123);                       // 처음 - 시각만 잡음(출발 때 이미 봄)
    t += 30 * 60000; ctx.f(37.6789, 127.0123);      // 30분 - 아직
    t += 61 * 60000; ctx.f(37.6789, 127.0123);      // 91분 - 물음(경고 없음)
    t += 91 * 60000; ctx.f(37.6789, 127.0123);      // 또 - 호우주의보
    pending.push(new Promise(function (r) { setTimeout(r, 20); }).then(function () {
        eq("90분마다 · 칸 가운데 좌표만", asked, ["api/safety?lat=37.7000&lon=127.0000", "api/safety?lat=37.7000&lon=127.0000"]);
        eq("새 경고만 알림", [toasts.length, /호우주의보/.test(toasts[0] || ""), said.length], [1, true, 1]);
    }));
})();

// ---- E5: 이 자리 지도 저장됨 · 안 됨 - 저장한 코스일 때만, 저장소에 z12 칸이 있는지
(function () {
    function run(saved, has) {
        var el = { hidden: true, className: "", textContent: "" };
        var ctx = {
            Date: { now: function () { return 999999; } }, hike: { mapSavedT: 0 }, c: { id: "c1" }, OFFLINE_CACHE: "o", Promise: Promise, Object: Object,
            $: function () { return el; }, T: function (k) { return k; }, offlineIds: function () { return saved ? ["c1"] : []; },
            map: { getStyle: function () { return { sources: { sat: { type: "raster", tiles: ["https://t/{z}/{x}/{y}.jpg"] } }, layers: [{ source: "sat", layout: { visibility: "visible" } }] }; } },
            caches: { open: function () { return Promise.resolve({ match: function (u) { return Promise.resolve(has ? { u: u } : undefined); } }); } },
            window: {}
        };
        ctx.window.caches = ctx.caches;
        vm.runInNewContext("var MAP_SAVED_EVERY_MS = 120000;" + fn(HIKE, "tileUrls") + fn(HIKE, "mapSavedCheck") + " this.f = mapSavedCheck;", ctx);
        ctx.f(37.5, 127.0);
        return new Promise(function (r) { setTimeout(function () { r(el); }, 20); });
    }
    pending.push(Promise.all([run(true, true), run(true, false), run(false, true)]).then(function (r) {
        eq("저장된 자리", [r[0].hidden, r[0].className, r[0].textContent], [false, "", "📥 이 자리 지도 저장됨"]);
        eq("저장 안 된 자리", [r[1].hidden, r[1].className], [false, "no"]);
        eq("저장 안 한 코스는 숨김", r[2].hidden, true);
    }));
})();

Promise.all(pending).then(function () { console.log("OK " + n); }, function (e) { console.error(e); process.exit(1); });
