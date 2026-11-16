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
        fetch: function (u) { return fail === "net" ? Promise.reject(new Error("offline")) : Promise.resolve({ ok: true }); },
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

Promise.all(pending).then(function () { console.log("OK " + n); }, function (e) { console.error(e); process.exit(1); });
