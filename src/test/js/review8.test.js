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

// ---- 🌙 주머니 모드(2026-11-03 홍TV님): 검은 화면 · 지도 쉼 · 두 번 눌러 풀기 · 알림이면 저절로 풂
(function () {
    var tap = function (prev, t, pointer) { return vm.runInNewContext("(function () {" + fn(HIKE, "pocketTap") + " return pocketTap(" + prev + ", " + t + ", " + pointer + "); })()", { POCKET_TAP_MS: 600 }); };
    eq("한 번 누름은 풀지 않음(주머니 속 스침)", tap(0, 1000, true), { unlock: false, tapT: 1000 });
    eq("0.6초 안 두 번째 누름 - 풂", tap(1000, 1500, true), { unlock: true, tapT: 0 });
    eq("0.6초 넘게 뒤 - 새 첫 누름", tap(1000, 1700, true), { unlock: false, tapT: 1700 });
    eq("화면 읽기 · 키보드(포인터 없는 click) - 한 번에 풂", tap(0, 1000, false), { unlock: true, tapT: 0 });

    function el(id) { return { id: id, tagName: "DIV", hidden: true, inert: false, focused: 0, focus: function () { this.focused++; focusNow = this; } }; }
    var focusNow = null, els = { pocket: el("pocket"), pocketOff: el("pocketOff"), top: el("top"), mapWrap: el("mapWrap"), sheet: el("sosSheet"), go: el("go") };
    els.sheet.inert = true;   // 다른 곳이 막아 둔 것은 그대로
    var calls = [], hike = { running: false, follow: true, fix: { lat: 37.6, lon: 127.0 } };
    var ctx = {
        $: function (id) { return els[id]; }, hike: hike, c: { id: "x" }, POCKET_TAP_MS: 600, pocket: { on: false, tapT: 0, back: null, inert: [] },
        map: { stop: function () { calls.push("stop"); }, jumpTo: function (o) { calls.push("jump " + o.center.join(",") + " z" + o.zoom); }, getZoom: function () { return 13; } },
        render: function () { calls.push("render pocket=" + ctx.pocket.on); }, setMe: function (la, lo) { calls.push("me " + la + "," + lo); },
        document: { body: { children: [els.top, els.mapWrap, els.sheet, els.pocket, { tagName: "SCRIPT", id: "" }], contains: function () { return true; } }, get activeElement() { return els.go; } }
    };
    vm.createContext(ctx);
    vm.runInContext(fn(HIKE, "pocketSet"), ctx);
    ctx.pocketSet(true);
    eq("걷는 중이 아니면 켜지 않음", [ctx.pocket.on, els.pocket.hidden, calls], [false, true, []]);
    hike.running = true;
    ctx.pocketSet(true);
    eq("켜면 검은 화면 · 지도 멈춤 · 풀기 단추로", [ctx.pocket.on, els.pocket.hidden, calls, focusNow.id], [true, false, ["stop"], "pocketOff"]);
    eq("뒤 화면은 누를 수 없게(이미 막힌 창 · 주머니 화면 · script 는 빼고)", [els.top.inert, els.mapWrap.inert, ctx.pocket.inert.length], [true, true, 2]);
    ctx.pocketSet(true);
    eq("두 번 켜도 한 번", calls, ["stop"]);
    ctx.pocketSet(false);
    eq("풀면 화면 · 내 점 · 따라가기를 바로", calls.slice(1), ["render pocket=false", "me 37.6,127", "jump 127,37.6 z15"]);
    eq("뒤 화면 돌려놓고 막힌 창은 그대로 · 누른 단추로 돌아감", [els.top.inert, els.mapWrap.inert, els.sheet.inert, els.pocket.hidden, focusNow.id], [false, false, true, true, "go"]);

    // 알림 · 급한 안내 · SOS · 움직임 없음 · 도착 · 산행 끝이면 풂
    var off = 0, sctx = { pocketSet: function (on) { if (!on) off++; }, voice: { on: false }, TTS: null, window: {}, Date: Date };
    vm.runInNewContext(fn(HIKE, "say") + " say('코스에서 벗어났습니다.', { urgent: true }); say('1킬로미터 지났습니다.');", sctx);
    eq("급한 음성 안내만 풂(소리를 꺼 두었어도)", off, 1);
    has("알림 글(toast)이면 풂", fn(HIKE, "toast"), "pocketSet(false);");
    has("SOS 를 열면 풂", HIKE, '$("sos").addEventListener("click", function () {\n        pocketSet(false);');
    has("움직임 없음 물을 때 풂", HIKE, "hike.stillAsk = t;\n        pocketSet(false);");
    has("도착하면 풂", HIKE, "hike.arrived = true;\n            pocketSet(false);");
    has("산행 끝내면 풀고 단추 숨김", HIKE, 'pocketSet(false);\n        $("pocketBtn").style.display = "none";');
    has("화면 숫자 쓰기는 쉼(알림 · 판단은 그대로)", HIKE, "renderHidden = document.hidden === true || pocket.on;");
    has("지도 내 점 · 따라가기 쉼", HIKE, "if (!pocket.on) {   // 주머니 모드는 지도를 건드리지 않음");
    has("고도 그림 · 지나온 길 색 쉼", HIKE, "if (pocket.on) return;   // 주머니 모드 - 고도 그림");
    var html = read("hike.html");
    has("검은 화면 · 풀기 단추(한국어 · 영어)", html, '<div id="pocket" hidden><button type="button" id="pocketOff" data-en="🔒 Tap twice to unlock" data-en-aria-label="Turn off pocket mode" aria-label="주머니 모드 풀기">🔒 두 번 눌러 풀기</button></div>');
    has("두 번 눌러도 확대되지 않게", html, "touch-action:manipulation");
})();

console.log("OK " + n);
