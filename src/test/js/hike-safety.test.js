/*
 * 따라가기(hike.js) 안전 · 저장 조각(2026-11-02 홍TV님 점검 5차) - hike.js 는 큰 한 덩어리라 그 함수만 꺼내 가짜 hike · localStorage 로 돌려 봄.
 * ReviewRound5Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/hike-safety.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var js = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/hike.js"), "utf8").replace(/\r\n/g, "\n");   // PC(core.autocrlf)는 CRLF(2026-11-02 PC)
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

// ---- 속도 · 배터리(2026-11-02 점검)
has("코스로 맞출 때 사이 단계 타일을 덜", "prefetchZoomDelta: 1");
has("화면 배율은 2 까지", "pixelRatio: Math.min(window.devicePixelRatio || 1, 2)");
has("옅은 음영 지형은 z12 까지", "maxzoom: cfg.vworldKey ? 12 : 15");
has("따라가기는 followMe", "if (hike.follow) followMe(co.latitude, co.longitude);");
has("나침반 3° 넘을 때만 지도 돌림", "turn > 3");
has("산행 중 표시(party-bar 가 GPS 를 따로 안 켬)", "window.rfHikeRunning = on;");
var bar = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/party-bar.js"), "utf8").replace(/\r\n/g, "\n");
assert(bar.indexOf("&& !window.rfHikeRunning); }") >= 0 && bar.indexOf("document.addEventListener(\"rf-hike\"") >= 0, "party-bar 가 산행 중엔 watchPosition 을 안 켬"); n++;


// ---- 2026-11-02 홍TV님 점검(안전): 여러 날 산행 저장분 · 기록 쓰기 · 사진 지우기 · SOS 창
// 2: 이어 하는 산행 저장분은 마지막 저장(t)에서 하루 - 시작에서 하루로 셌더니 1박 2일 이튿날 첫날 길 · 사진이 지워졌음
function fresh(v) { return vm.runInNewContext("(function () {" + fn("savedFresh") + " return savedFresh(v); })()", { v: v, Date: { now: function () { return NOW; } } }); }
eq("시작 30시간 전 · 마지막 저장 1시간 전 - 남김", fresh({ start: NOW - 30 * 3600000, t: NOW - 3600000 }), true);
eq("마지막 저장 25시간 전 - 지움", fresh({ start: NOW - 30 * 3600000, t: NOW - 25 * 3600000 }), false);
eq("t 없는 옛 저장분은 시작으로", [fresh({ start: NOW - 3600000 }), fresh({ start: NOW - 25 * 3600000 })], [true, false]);
eq("빈 것 · 깨진 것", [fresh(null), fresh({})], [false, false]);
has("loadSaved 도 savedFresh", "return savedFresh(s) ? s : null;");
has("처음 지우기도 savedFresh", "if (!savedFresh(v)) old.push(k);");

// 8: 기록 쓰기 - 늘 다시 읽어 합침(탭 둘이 서로 덮지 않게), 이 화면에 보였는데 없는 것만 지운 것
var recKeyLine = /\n    function recKey\(r\) \{[^\n]*\}\n/.exec(js)[0];
function recSandbox(store, opt) {
    opt = opt || {};
    var ls = {}, toasts = [];
    var ctx = {
        store: store, ls: ls, toasts: toasts,
        localStorage: { setItem: function (k, v) { if (opt.lsFull) throw new Error("full"); ls[k] = v; }, getItem: function (k) { return ls[k] || null; } },
        toast: function (t) { toasts.push(t); }, T: function (ko) { return ko; }, Promise: Promise, JSON: JSON, Array: Array,
        recTx: function (mode, f) {
            if (opt.idbDown) return Promise.reject(new Error("no idb"));
            var st = { get: function () { return { result: store.list }; }, put: function (v) { store.list = JSON.parse(JSON.stringify(v)); } };
            var out = f(st);
            return Promise.resolve(out && out.result);
        }
    };
    vm.runInNewContext("var REC_LS = \"rf-records\", REC_MAX = 30, recCache = " + JSON.stringify(opt.cache || []) + ", recBad = false;" + recKeyLine + fn("writeRecords") + fn("mergeSeen")
        + " this.write = writeRecords; this.cache = function () { return recCache; };", ctx);
    return ctx;
}
var r1 = { start: 1, courseId: "a" }, r2 = { start: 2, courseId: "b" }, r3 = { start: 3, courseId: "c" };
var pending = [];
(function () {
    var st = { list: [r2, r1] }, x = recSandbox(st, { cache: [r1] });   // 다른 탭이 r2 를 남김 - 이 탭은 r1 만 봄
    pending.push(x.write([r3, r1]).then(function (ok) {
        eq("다른 탭 기록을 덮지 않음", st.list.map(function (r) { return r.courseId; }), ["c", "b", "a"]);
        eq("저장했으면 true", ok, true);
    }));
})();
(function () {
    var st = { list: [r2, r1] }, x = recSandbox(st, { cache: [r2, r1] });
    pending.push(x.write([r1]).then(function () { eq("이 화면에서 지운 기록은 지움", st.list.map(function (r) { return r.courseId; }), ["a"]); }));
})();
(function () {
    var st = { list: [r1] }, x = recSandbox(st, { cache: [r1], idbDown: true });
    pending.push(x.write([r3, r1]).then(function (ok) {
        eq("못 읽으면 IndexedDB 는 그대로", st.list, [r1]);
        eq("localStorage 에 남기고 true", [JSON.parse(x.ls["rf-records"]).length, ok], [2, true]);
    }));
})();
(function () {
    var x = recSandbox({ list: [] }, { idbDown: true, lsFull: true });
    pending.push(x.write([r3]).then(function (ok) { eq("어디에도 못 쓰면 false · 알림", [ok, x.toasts.length], [false, 1]); }));
})();

// 2 · 8: 사진 지우기 - 저장소 기록을 다시 읽어(다른 탭 기록의 사진도) 함께 봄, 못 읽으면 지우지 않음
function gc(opt) {
    var deleted = [], lsd = opt.ls || {};
    var ctx = {
        deleted: deleted, Promise: Promise, JSON: JSON, Array: Array, hike: { notes: opt.notes || [] },
        localStorage: { get length() { return Object.keys(lsd).length; }, key: function (i) { return Object.keys(lsd)[i]; }, getItem: function (k) { return lsd[k]; } },
        records: function () { return opt.cache || []; }, recLs: function () { return opt.lsRecs || []; },
        recTx: function () { return opt.idbDown ? Promise.reject(new Error("x")) : Promise.resolve(opt.idb); },
        photoTx: function (mode, f) {
            var q = { result: opt.photos.slice() }, st = { getAllKeys: function () { return q; }, delete: function (k) { deleted.push(k); } };
            f(st); q.onsuccess(); return Promise.resolve();
        }
    };
    return vm.runInNewContext("var recBad = false;" + fn("gcPhotos") + fn("photoKeep") + " gcPhotos();", ctx).then(function () { return deleted.sort(); });
}
pending.push(gc({ photos: ["p1", "p2", "p3", "p4", "p9"], cache: [{ notes: [{ photo: "p1" }] }], idb: [{ notes: [{ photo: "p2" }] }],
    lsRecs: [{ notes: [{ photo: "p3" }] }], ls: { "rf-hike-x-notes": JSON.stringify([{ photo: "p4" }]) } })
    .then(function (d) { eq("어느 기록 · 저장분에도 없는 사진만 지움(다른 탭 기록 p2 는 남김)", d, ["p9"]); }));
pending.push(gc({ photos: ["p1"], idbDown: true }).then(function (d) { eq("기록을 못 읽으면 지우지 않음", d, []); }));

// 9: 산행 저장분은 기록을 다 쓴 뒤에만 지움
has("끝낼 때 기록 저장 뒤 지움", "if (stored) stored.then(function (ok) { if (ok && !(hike.running && c && c.id === doneId)) clearSaved(doneId); });");
assert(!/finishRecord\(\);\s*clearSaved\(\);/.test(js), "finishRecord 바로 뒤에 clearSaved 가 남음"); n++;
has("finishRecord 가 저장 약속을 돌려줌", "        return stored;\n    }\n");

// 3: SOS 창 - 새 위치로 다시 채움, 닫기는 SOS 를 말없이 끄지 않음
function better(prev, f) {
    var RFs = { distM: function (a, b, c2, d) { var k = 111320; return Math.hypot((a - c2) * k, (b - d) * k * Math.cos(a * Math.PI / 180)); } };
    return vm.runInNewContext("(function () {" + fn("sosBetter") + " return sosBetter(p, f); })()", { p: prev, f: f, RF: RFs, Math: Math });
}
var P = { lat: 37.5, lon: 127, acc: 60 };
eq("처음 잡은 위치", better(null, P), true);
eq("오차 60 → 20m", better(P, { lat: 37.5, lon: 127, acc: 20 }), true);
eq("오차 60 → 45m 는 그대로", better(P, { lat: 37.5, lon: 127, acc: 45 }), false);
eq("200m 움직임", better(P, { lat: 37.5018, lon: 127, acc: 60 }), true);
eq("위치 없음", better(P, null), false);
has("onFix 가 SOS 창을 새로", "if (!hike.sim) sosTake(hike.fix);");
has("산행 중이 아니면 창이 열린 동안 위치를 받음", "hike.sosWatch = navigator.geolocation.watchPosition(");
var closeH = /\$\("sosClose"\)\.addEventListener\("click", function \(\) \{[\s\S]*?\n    \}\);\n/.exec(js)[0];
assert(closeH.indexOf("hAsk(") >= 0 && closeH.indexOf("partySosOff();") > closeH.indexOf("hAsk("), "닫기는 묻고 나서만 SOS 를 끔"); n++;
has("SOS 끄기 단추", "$(\"sosOff\").addEventListener(\"click\", function () { sosHide(); partySosOff();");
var html = fs.readFileSync(path.join(__dirname, "../../main/webapp/hike.html"), "utf8");
assert(html.indexOf("id=\"sosOff\"") >= 0, "hike.html 에 SOS 끄기 단추"); n++;

// 4: GPS 를 잃어도 인솔자에게 ping · SOS 를 받지 않았으면 알림
has("GPS 오류 때 ping", "if (window.RFParty && hike.running && !hike.sim) { var pr = RFParty.ping(); if (pr) pr.catch(");
has("sosKept false 알림", "if (j && j.sosKept === false) toast(");

Promise.all(pending).then(function () { console.log("OK " + n); }, function (e) { console.error(e); process.exit(1); });
