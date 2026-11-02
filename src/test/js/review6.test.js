/*
 * 점검 6차(2026-11-02 홍TV님) 속도 조각을 실제로 돌려 봄 - 화면 js 에서 함수만 꺼내 가짜 지도 · 위치 · 화면으로.
 * ReviewRound6Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/review6.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var HIKE = read("js/hike.js"), PARTY = read("js/party.js"), STUDIO = read("js/studio.js"), KIT = read("js/course-kit.js"), PKIT = read("js/party-kit.js");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, name); n++; }   // vm 안에서 만든 배열도 견줌
/** js 에서 "    function 이름(" 로 시작하는 함수 하나(한 줄짜리도). */
function fn(js, name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[^\\n]*\\}(   //[^\\n]*)?\\n").exec(js)   // 한 줄짜리(뒤 주석도)
        || new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(js);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}

// ---- C1: 지형 음영 - 따라가기 · 안내도 · GPX 편집이 같은 한도(바탕 지도가 있으면 지형 z12 까지 · 음영 z9 부터)
function demOf(st) {
    var hs = st.layers.filter(function (l) { return l.id === "hillshade"; })[0];
    return { max: st.sources.hillshade.maxzoom, min: hs.minzoom || 0 };
}
function hikeStyle(key, hold) {
    return vm.runInNewContext("var SAT_HOLD_Z = 7, basemap = 'sat';" + fn(HIKE, "buildStyle") + " buildStyle(cfg, hold);",
        { cfg: { demUrl: "d", vworldKey: key }, hold: hold, RF: { tr: function (k) { return k; } }, T: function (k) { return k; } });
}
function kitStyle(key) { return vm.runInNewContext(fn(KIT, "baseStyle") + " baseStyle(c);", { c: { demUrl: "d", vworldKey: key }, tr: function (k) { return k; } }); }
function studioStyle(key) {
    return vm.runInNewContext(fn(STUDIO, "style") + " style(cfg);", { cfg: { demUrl: "d", vworldKey: key }, BASES: [], OVERS: [], usable: function () { return true; },
        mapPref: function () { return { base: "sat", over: { hillshade: 1 } }; }, encodeURIComponent: encodeURIComponent });
}
[["키 있음", "k", { max: 12, min: 9 }], ["키 없음(음영이 바탕)", null, { max: 15, min: 0 }]].forEach(function (c) {
    eq("따라가기 " + c[0], demOf(hikeStyle(c[1])), c[2]);
    eq("안내도 " + c[0], demOf(kitStyle(c[1])), c[2]);
    eq("GPX 편집 " + c[0], demOf(studioStyle(c[1])), c[2]);
});

// ---- C2: 주소에 코스(#c=)가 있으면 첫 나라 전체(z6.2)에서는 위성 · 밝은 지도를 받지 않음(z7 부터)
function satMin(st) { return st.layers.filter(function (l) { return l.id === "sat" || l.id === "base"; }).map(function (l) { return l.minzoom; }); }
eq("#c= 가 있으면 z7 부터", satMin(hikeStyle("k", true)), [7, 7]);
eq("없으면 그대로", satMin(hikeStyle("k", false)), [0, 0]);
assert(/var hold = \/\[#&\]c=\/\.test\(location\.hash\);/.test(HIKE) && HIKE.indexOf("map.setLayerZoomRange(id, 0, 24)") >= 0, "코스로 옮기면 풂"); n++;

// ---- C3: 산악회 방 화면 위치 받기 - 서버가 받는 때만(locOn), 하산 탑승 · 취소 · 사무실 자리 · 앱 백그라운드 위치면 끔
function watchRun(states, bg) {
    var log = [], id = 0;
    var ctx = { navigator: { geolocation: { watchPosition: function () { log.push("on"); return ++id; }, clearWatch: function () { log.push("off"); } } },
        bgOn: !!bg, T: function (k) { return k; }, RFParty: {}, render: function () {}, fail: function () {}, roomMsg: function () {} };
    vm.runInNewContext("var watch = null, lastPos = null, bgOn = " + !!bg + ";" + fn(PARTY, "watchWant") + fn(PARTY, "watchSync") + " this.f = watchSync;", ctx);
    states.forEach(function (s) { ctx.f(s); });
    return log;
}
var PRE = { locOn: false }, ON = { locOn: true }, ABOARD = { locOn: true, aboard: true };
eq("출발 전엔 안 켬 · 탑승지 시각부터 켬 · 두 번 켜지 않음 · 하산 탑승하면 끔", watchRun([PRE, PRE, ON, ON, ABOARD]), ["on", "off"]);
eq("취소 · 사무실 자리는 안 켬", watchRun([{ locOn: true, cancelled: true }, { locOn: true, officeMe: true }]), []);
eq("앱 백그라운드 위치가 돌면 안 켬", watchRun([ON], true), []);
assert(PARTY.indexOf("watchSync(s);") >= 0 && PARTY.indexOf("watch = navigator.geolocation.watchPosition(") === PARTY.lastIndexOf("watch = navigator.geolocation.watchPosition("), "render 가 부르고 다른 곳에서 켜지 않음"); n++;

// ---- C4: 숫자 칸 - 같은 값이면 다시 쓰지 않고, 화면이 숨었으면 쓰지 않음
function el() { var e = { dataset: {}, writes: 0, kids: [], appendChild: function (k) { e.kids.push(k); } }; Object.defineProperty(e, "innerHTML", { set: function () { e.writes++; e.kids = []; } }); return e; }
var cells = {};
var vctx = { $: function (id) { return cells[id] || (cells[id] = el()); }, document: { createTextNode: function (t) { return { t: t }; }, createElement: function () { return {}; } } };
vm.runInNewContext("var renderHidden = false;" + fn(HIKE, "setV") + " this.f = setV; this.hide = function (h) { renderHidden = h; };", vctx);
vctx.f("sDone", "1.2", "km"); vctx.f("sDone", "1.2", "km"); vctx.f("sDone", "1.3", "km");
eq("같은 값은 건너뜀", cells.sDone.writes, 2);
vctx.hide(true); vctx.f("sDone", "1.4", "km"); vctx.hide(false);
eq("숨은 동안은 안 씀", [cells.sDone.writes, cells.sDone.kids[0].t], [2, "1.3"]);
vctx.f("sDone", "1.4", "km");
eq("다시 보이면 씀", [cells.sDone.writes, cells.sDone.kids[0].t], [3, "1.4"]);
assert(/renderHidden = document\.hidden === true;[^\n]*\n\s*try \{ renderAll\(\); \} finally \{ renderHidden = false; \}/.test(HIKE), "render 가 숨은 동안 표시만 쉬고 판단은 함"); n++;

// ---- C6: GPX 편집 높이 타일 - 최근 64장만
(function () {
    var asked = [];
    var ctx = { demUrl: "u/{z}/{x}/{y}", fetch: function (u) { asked.push(u); return { then: function () { return { then: function () { return { then: function () { return { catch: function () { return "tile"; } }; } }; } }; } }; },
        Map: Map, createImageBitmap: null, document: {} };
    vm.runInNewContext("var demTiles = new Map(), DEM_KEEP = 64;" + fn(STUDIO, "demTile") + " this.f = demTile; this.size = function () { return demTiles.size; };", ctx);
    for (var i = 0; i < 100; i++) ctx.f(14, i, 0);
    eq("64장만 남음", ctx.size(), 64);
    ctx.f(14, 99, 0);
    eq("남은 것은 다시 받지 않음", asked.length, 100);
    ctx.f(14, 0, 0);
    eq("버린 것은 다시 받음", asked.length, 101);
    assert(STUDIO.indexOf("var demTiles = new Map(), DEM_KEEP = 64;") >= 0, "studio.js 의 한도"); n++;
})();

// ---- D4: 아래 창 - 열리면 제목으로, 닫히면 연 단추로, Esc 는 그 창의 닫기(움직임 없음 창은 Esc 로 안 닫음)
(function () {
    var doc = { activeElement: null, body: { contains: function () { return true; } } };
    function node(id) { var e = { id: id, style: { display: "none" }, attrs: {}, clicks: 0, setAttribute: function (k, v) { e.attrs[k] = v; }, focus: function () { doc.activeElement = e; }, click: function () { e.clicks++; } }; return e; }
    var opener = node("sosBtn"), sos = node("sosSheet"), h2 = node("sosH"), still = node("stillSheet"), close = node("sosClose");
    sos.querySelector = still.querySelector = function () { return h2; };
    var ctx = { document: doc, $: function (id) { return id === "sosClose" ? close : null; } };
    vm.runInNewContext("var SHEET_ESC = { sosSheet: 'sosClose' }, sheetStack = [];" + fn(HIKE, "sheetSeen") + fn(HIKE, "sheetEsc") + " this.seen = sheetSeen; this.esc = sheetEsc;", ctx);
    opener.focus();
    sos.style.display = "flex"; ctx.seen(sos);
    eq("열리면 제목으로(단추가 아니라 - Enter 한 번에 119 가 눌리지 않게)", [doc.activeElement.id, h2.attrs.tabindex], ["sosH", "-1"]);
    var ev = { key: "Escape", preventDefault: function () { ev.p = true; } };
    ctx.esc(ev);
    eq("Esc 는 SOS 닫기 단추(닫기가 인솔자 SOS 를 끌지 물음)", [close.clicks, !!ev.p], [1, true]);
    sos.style.display = "none"; ctx.seen(sos);
    eq("닫히면 연 단추로", doc.activeElement.id, "sosBtn");
    still.style.display = "flex"; ctx.seen(still);
    ctx.esc({ key: "Escape", preventDefault: function () {} });
    eq("움직임 없음 창은 Esc 로 닫지 않음(괜찮아요를 대신 누르지 않게)", close.clicks, 1);
    assert(/var SHEET_ESC = \{[^}]*sosSheet: "sosClose"/.test(HIKE) && !/stillSheet:/.test(HIKE.slice(HIKE.indexOf("var SHEET_ESC"), HIKE.indexOf("var sheetStack"))), "SOS 는 있고 움직임 없음은 없음"); n++;
})();

// ---- D14: 시각은 한국 시간(폰 시간대와 상관없이)
var at = Date.UTC(2026, 10, 2, 8, 5);   // 한국 17:05
eq("따라가기 일몰 · 도착 예상", vm.runInNewContext(fn(HIKE, "clock") + " clock(" + at + ");", {}), "17:05");
eq("산악회 방", vm.runInNewContext("function two(n) { return (n < 10 ? '0' : '') + n; }" + fn(PARTY, "clock") + " clock(" + at + ");", {}), "17:05");
eq("산악회 한 줄", vm.runInNewContext(fn(read("js/party-bar.js"), "clock") + " clock(" + at + ");", {}), "17:05");

// ---- D7: GPX 편집 도구 줄 - 길이 없으면 열기 · 그리기 말고는 흐리게
(function () {
    var bs = ["#openBtn", "#drawBtn", "trim", "#saveBtn"].map(function (g) { var b = { attrs: { "data-go": g }, getAttribute: function (k) { return b.attrs[k]; }, setAttribute: function (k, v) { b.attrs[k] = v; }, removeAttribute: function (k) { delete b.attrs[k]; } }; return b; });
    var ctx = { document: { querySelectorAll: function () { return bs; } }, Array: Array };
    vm.runInNewContext(fn(STUDIO, "toolsOff") + " this.f = toolsOff;", ctx);
    ctx.f(true);
    eq("길이 없을 때", bs.map(function (b) { return b.attrs["aria-disabled"] || ""; }), ["", "", "true", "true"]);
    ctx.f(false);
    eq("길이 있으면 풂", bs.map(function (b) { return b.attrs["aria-disabled"] || ""; }), ["", "", "", ""]);
    assert(read("studio.html").match(/<button type="button" data-go="[^"]*" title="([^"]*)" aria-label="\1">/g).length === 10, "그림 단추마다 이름"); n++;
})();

// ---- C8: QR 스크립트는 처음 쓸 때 한 번만 받음
var qrHtml = ["hike.html", "party.html", "party-office.html"].map(function (f) { return read(f).indexOf("qrcode.js") >= 0; });
eq("세 화면이 처음부터 받지 않음", qrHtml, [false, false, false]);
(function () {
    var added = [], g = { document: { createElement: function () { return {}; }, head: { appendChild: function (s) { added.push(s); } } }, Promise: Promise };
    g.g = g;
    vm.runInNewContext("var qrWait = null;" + fn(PKIT, "qrLib").replace(/\bdocument\b/g, "g.document") + " this.f = qrLib;", g);
    var a = g.f(), b = g.f();
    eq("두 번 불러도 한 번 받음", added.length, 1);
    eq("주소", added[0].src, "vendor/qrcode-generator-1.4.4/qrcode.js");
    g.qrcode = function () { return "QR"; };
    added[0].onload();
    Promise.all([a, b]).then(function (r) {
        eq("받으면 qrcode", [r[0](), r[1]()], ["QR", "QR"]);
        return g.f();
    }).then(function (q) {
        eq("이미 있으면 바로", [q(), added.length], ["QR", 1]);
        assert(read("sw.js").indexOf("\"vendor/qrcode-generator-1.4.4/qrcode.js\"") >= 0, "서비스 워커가 담아 둠(신호 없을 때)"); n++;
        console.log("OK " + n);
    }).catch(function (e) { console.error(e); process.exit(1); });
})();
