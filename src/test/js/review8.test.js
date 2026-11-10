/*
 * 점검 8차(2026-11-03 홍TV님) 화면 조각을 실제로 돌려 봄 - 하산 시간 · 주머니 모드 · 화면 고침들.
 * ReviewRound8Test 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/review8.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var HIKE = read("js/hike.js");
var n = 0, later = [];   // later - 비동기 조각(차례대로)
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
    // 0 → 600 → 0m 왕복형 4km 걷기: 거리 1시간 + 오르막 1시간 + 내리막 600m 20분 = 2시간 20분(등산은 2026-11-04 부터 공단 기준 1km 34분 - 아래)
    var c = { course: { kind: "walk" }, dist: [0, 2000, 4000], asc: [0, 600, 600], ele: [0, 600, 0], total: 4000 };
    var remaining = function (hike) {
        return vm.runInNewContext("(function () {" + fn(HIKE, "remainingMs") + " return remainingMs(0); })()", { RF: RF, c: c, hike: hike, now: function () { return 0; } });
    };
    eq("출발 때 남은 시간 - 내리막 포함", Math.round(remaining({ d: 0, d0: 0 }) / 60000), 140);
    eq("정상에서 남은 시간 - 내려가는 2km 30분 + 내리막 20분", Math.round(remaining({ d: 2000, d0: 0 }) / 60000), 50);
    c.course.kind = "hike";
    eq("등산은 국립공원공단 기준 1km 34분(4km 136분 · 남은 2km 68분)", [Math.round(remaining({ d: 0, d0: 0 }) / 60000), Math.round(remaining({ d: 2000, d0: 0 }) / 60000)], [136, 68]);
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

// ---- 2: 따라가기 아래 창 - Tab 은 창 안에서 돌고, 창 이름은 제목 글만("가" 단추 빼고)
(function () {
    var to = function (items, now, back) { return vm.runInNewContext("(function () {" + fn(HIKE, "sheetTabTo") + " return sheetTabTo(items, now, back); })()", { items: items, now: now, back: back }); };
    var a = { id: "a" }, b = { id: "b" }, cc = { id: "c" }, out = { id: "밖" };
    eq("마지막에서 Tab - 처음으로", to([a, b, cc], cc, false).id, "a");
    eq("처음에서 Shift+Tab - 마지막으로", to([a, b, cc], a, true).id, "c");
    eq("가운데는 그대로(브라우저가)", to([a, b, cc], b, false), null);
    eq("제목(창 밖 자리)에서 Tab - 처음 · Shift+Tab - 마지막", [to([a, b], out, false).id, to([a, b], out, true).id], ["a", "b"]);
    eq("누를 것이 없으면 그대로", to([], out, false), null);
    var key = fn(HIKE, "sheetKey");
    has("Tab 을 잡음", key, 'if (e.key === "Tab") {');
    has("창 이름은 제목 span - h2 의 id 도 span 으로(textContent 로 바꿔도 가 단추가 남음)", HIKE, 'sp.id = h.id || el.id + "Title";\n            h.removeAttribute("id");\n            el.setAttribute("aria-labelledby", sp.id);');
    has("가 단추는 span 을 만든 뒤 h2 에", HIKE.slice(HIKE.indexOf('el.setAttribute("aria-labelledby", sp.id);')), '".sheet .sbox > h2, #safety .sbox > h2"), function (h) { h.appendChild(RF.textButton()); }');
})();

// ---- 3: 이름 없이 연 공원 고르기 - 위에서부터 · 넘치면 상자 안에서 밀기, 링크 색, "가" 44px
(function () {
    var html = read("park.html"), js = read("js/park.js");
    has("위에서부터 · 가운데 옮김 없음 · 넘치면 밀기", html, "#msg.pick { left:10px; right:10px; top:10px; transform:none; max-width:none; max-height:calc(100% - 20px); overflow:auto; }");
    has("링크 색", html, "#msg.pick a.more { color:var(--sky); }");
    has("가 44px", html, "#top .rfTextBtn { height:44px;");
    has("고르기 상자 표시", js, 'box.classList.add("pick");');
    has("말", js, 'T("다른 산 보기 ›", "Other mountains ›")');
})();

// ---- 5: 난이도 하나 - 공단 공식 난이도가 있으면 그것(우리 어림 대신)
(function () {
    eq("officialLevel", [RF.officialLevel("보통(2.57)"), RF.officialLevel("매우 어려움"), RF.officialLevel(" 쉬움 "), RF.officialLevel("상"), RF.officialLevel(null)], [2, 4, 1, null, null]);
    var made = [];
    var ctx = { console: console, navigator: { language: "ko" }, localStorage: { getItem: function () { return null; }, setItem: function () {} },
        document: { documentElement: { lang: "ko", style: { setProperty: function () {} }, classList: { add: function () {}, remove: function () {}, toggle: function () {} } },
            createElement: function (t) { var e = { tag: t, className: "", textContent: "", title: "", appendChild: function () {} }; made.push(e); return e; },
            getElementById: function () { return null; }, querySelectorAll: function () { return []; }, querySelector: function () { return null; }, addEventListener: function () {} },
        location: { search: "", pathname: "/" } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read("js/course-kit.js"), ctx);
    var R = ctx.RF;
    var a = R.levelChip(1000, 10, false, null, { level: "보통(2.57)" }), b = R.levelChip(1000, 10, false, null, null), e = R.levelChip(1000, 10, true, null, { level: "보통(2.57)" });
    eq("공단 난이도가 있으면 그것 하나", [a.className, a.textContent, a.title], ["lv lv2", "공단 보통(2.57)", "국립공원공단 공식 난이도"]);
    eq("없으면 routefly 어림", [b.className, b.textContent], ["lv lv0", "매우 쉬움"]);
    eq("영어", e.textContent, "Park service: Moderate (2.57)");
    eq("영어 - 숫자 없으면", R.levelChip(1, 1, true, null, { level: "쉬움" }).textContent, "Park service: Easy");
    has("3D 는 공단 정보를 넘김", read("js/app.js"), "RF.steepest(c.dist, c.ele), j.info);");
    has("따라가기도", HIKE, "RF.steepest(c.dist, c.ele), c.info);");
})();

// ---- 6: 3D 영어 단수 · 가로 화면 출처 ⓘ 접기
(function () {
    var APP = read("js/app.js");
    var en = function (spots) { return vm.runInNewContext(fn(APP, "spotSummaryEn") + " spotSummaryEn(spots);", { spots: spots }); };
    eq("하나는 단수", en([{ kind: "danger" }, { kind: "view" }]), "⚠️ 1 hazard spot · 🔭 1 viewpoint");
    eq("둘은 복수", en([{ kind: "danger" }, { kind: "danger" }, { kind: "view" }, { kind: "view" }]), "⚠️ 2 hazard spots · 🔭 2 viewpoints");
    has("가로 화면은 출처 접기", APP, 'window.matchMedia("(max-height: 500px) and (orientation: landscape)").matches');
    has("▶ routefly 단추 글은 그대로(홍TV님 결정)", read("index.html"), "routefly");
})();

// ---- 7: 코스 자료 알림은 다음 지점 아래 한 줄(알림 글이 숫자 칸을 6 ~ 12초 가렸음) · 쉬운 말
(function () {
    has("칸", read("hike.html"), '<div id="courseNote" hidden></div>\n    <div id="sign" hidden ');
    has("한 줄로 씀", HIKE, '$("courseNote").textContent = warns.join("\\n");');
    has("쉬운 말", HIKE, '"⚠ 이 선은 " + c.course.summit_miss + " 정상 전에서 끝납니다. 정상은 현지 안내판을 따르세요."');
    eq("알림(toast)으로 띄우지 않음", HIKE.indexOf('toast(warns.join('), -1);
})();

// ---- 9: 영어 화면 응급실 종류 · 한/EN 단추의 말(lang)
(function () {
    eq("erKindEn", [RF.erKindEn("종합병원"), RF.erKindEn(" 병원 "), RF.erKindEn("모르는곳"), RF.erKindEn(null)], ["General hospital", "Hospital", "모르는곳", ""]);
    has("safetyRender 영어는 erKindEn", read("js/course-kit.js"), '(en ? erKindEn(h.kind) : h.kind || "")');
    has("한 은 ko", read("js/course-kit.js"), 'ko.lang = "ko";');
    has("🌐 한국어 는 ko", HIKE, 'a.lang = EN ? "ko" : "en";');
})();

// ---- 10: 산악회 방 만들기 - 시각 안내는 한 꼴 "예: 07:00"(0700 도 받음), 회사 코드 설명, 이름 · 연락처 자동 채움
(function () {
    var html = read("party.html"), P = read("js/party.js"), K = read("js/party-kit.js");
    var parse = function (t) { return vm.runInNewContext(fn(K, "parseTime") + " parseTime(" + JSON.stringify(t) + ");", {}); };
    eq("0700 · 07:00 · 7시 모두", [parse("0700"), parse("07:00"), parse("7시"), parse("23:20"), parse("2320")], [[7, 0], [7, 0], [7, 0], [23, 20], [23, 20]]);
    eq("시각 칸 안내에 숫자만 꼴(0700 · 1600) 없음", /placeholder="예: (0700|1600)"/.test(html) || /e\.g\. (0700|1600)\b/.test(P), false);
    has("출발 시각", html, 'placeholder="예: 07:00" data-en-placeholder="e.g. 07:00"');
    has("하산 마감", html, 'placeholder="예: 16:00" data-en-placeholder="e.g. 16:00"');
    has("회사 코드 설명", html, '회사 코드는 회사 사무실에서 받은 코드(없으면 비움).');
    has("이름 자동 채움", html, 'id="mkLead" type="text" maxlength="12" autocomplete="name"');
    has("연락처 자동 채움", html, 'id="mkPhone" type="tel" maxlength="20" autocomplete="tel"');
})();

// ---- 11: 노선 없이 연 노선 안내도 - 노선 고르기 + 도장 · 완주 · 코스 모음
(function () {
    var R = read("js/route.js"), d = JSON.parse(read("data/series.json"));
    var links = vm.runInNewContext(fn(R, "routeLinks") + " routeLinks(d, false);", { d: d });
    var n = 0;
    d.groups.forEach(function (g) { g.series.forEach(function (s) { if (s.summits == null && s.name) n++; }); });
    eq("series.json 노선 모두(100대 명산 빼고)", [links.length, links.length > 5], [n, true]);
    eq("주소 꼴", /^route\.html\?(prefix|trail)=[^&]+&name=/.test(links[0].href), true);
    eq("영어", vm.runInNewContext(fn(R, "routeLinks") + " routeLinks(d, true)[0].href;", { d: d }).slice(-8), "&lang=en");
    has("노선이 없으면 고르기", R, "if (!/^(osmb|kmf|osmh)-[0-9]+-$/.test(prefix) && !trail) { pickRoute(); return; }");
})();

// ---- 12: 별거 별거 · 안부 - 칸 이름표 · 체크 상자 24px · 알림 글 읽기
(function () {
    var t = read("tools.html"), a = read("anbu.html");
    has("사다리 이름표", t, '<label for="ldNames"');
    has("사다리 결과 이름표", t, '<label for="ldRes"');
    has("별거 체크 24px · 안 줄어듦", t, ".chk2 input { width:24px; height:24px; flex:none;");
    has("안부 체크 24px · 안 줄어듦", a, ".chk input { width:24px; height:24px; flex:none;");
    has("별거 알림 글", t, '<div id="toast" role="status" aria-live="polite"></div>');
    has("안부 알림 글", a, '<div id="toast" role="status" aria-live="polite"></div>');
})();

// ---- 15: 도장 · 완주 아래 설명 - 세 줄 요점 + 출처는 접어 둠
(function () {
    var h = read("series.html");
    eq("요점 세 줄", (h.slice(h.indexOf('<ul class="tip notes">'), h.indexOf("</ul>", h.indexOf('<ul class="tip notes">'))).match(/<li /g) || []).length, 3);
    has("출처는 접힘", h, '<details class="tip src"><summary data-en="Sources · more">출처 · 더 보기</summary>');
    eq("출처는 접힌 칸 안에만", h.indexOf("나무위키") > h.indexOf('<details class="tip src">'), true);
})();

// ---- 16: 지도 단추 글 한국어 · 손가락 화면 40px · 지도 글 12px 이상
(function () {
    eq("한국어 화면 단추 글", [RF.mapLocale()["NavigationControl.ZoomIn"], RF.mapLocale()["NavigationControl.ZoomOut"]], ["확대", "축소"]);
    eq("나침반 글도 한국어(주석에 묻히지 않음 - 2026-11-03 PC 확인)", RF.mapLocale()["NavigationControl.ResetBearing"], "끌면 지도 돌리기, 누르면 북쪽을 위로");
    RF.setLang("en");
    eq("영어 화면은 MapLibre 기본", RF.mapLocale() === undefined, true);
    RF.setLang("ko");
    ["js/hike.js", "js/app.js", "js/park.js", "js/party.js", "js/route.js", "js/studio.js"].forEach(function (f) {
        var src = read(f), maps = (src.match(/new maplibregl\.Map\(\{/g) || []).length, loc = (src.match(/locale: RF\.mapLocale\(\)/g) || []).length;
        eq(f + " 지도마다 locale", [maps > 0, loc], [true, maps]);
    });
    has("손가락 화면 40px", read("css/course-kit.css"), "@media (pointer: coarse) {\n    .maplibregl-ctrl-group button { width:40px; height:40px; }");
    [["hike.html", ".poi .lb .more { display:block; font-size:12px; }"], ["route.html", ".ctr .lb { margin-top:2px; color:#fff; font-size:12px;"], ["index.html", ".poi .lb small { display:block; font-size:12px;"]]
        .forEach(function (x) { has(x[0] + " 지도 글 12px", read(x[0]), x[1]); });
})();

// ---- 17: 찾기 칸 초점 표시 · 주요 칸(main) 표시
(function () {
    has("찾기 칸 초점", read("hike.html"), "#pick input:focus-visible { outline:2px solid var(--sky);");
    [["hike.html", '<div id="mapWrap" role="main">'], ["park.html", '<div id="mapWrap" role="main">'], ["route.html", '<div id="mapWrap" role="main">'], ["studio.html", '<div id="app" role="main" hidden>']]
        .forEach(function (x) { var h = read(x[0]); has(x[0] + " main", h, x[1]); eq(x[0] + " main 하나", (h.match(/role="main"|<main[ >]/g) || []).length, 1); });
})();

// ---- 18: 못 연 코스 띠 · 지도 표시 이름 · 첫 화면 제목
(function () {
    var T = function (k, e) { return k; };
    var f = function (e) { return vm.runInNewContext("(function () {" + fn(HIKE, "loadFailText") + " return loadFailText(e); })()", { T: T, e: e }); };
    var net = new TypeError("Failed to fetch");
    eq("신호 없음 - 브라우저 글은 감춤 · 다시 시도", [f(net).text.indexOf("Failed") < 0, f(net).again], [true, true]);
    eq("없어진 코스 - 다시 시도 없음", f({ status: 404, message: "코스가 없습니다" }), { text: "⚠ 코스가 없어졌거나 주소가 잘못됐습니다. 목록에서 다시 골라 주세요.", again: false });
    eq("서버 글(우리 말)은 보임", f({ status: 429, message: "잠시 뒤 다시" }).text.indexOf("(잠시 뒤 다시)") > 0, true);
    has("서버 답 번호를 오류에", HIKE, "err.status = r.status;");
    has("지도 이름표 이름은 쉼표로", HIKE, 'e.setAttribute("aria-label", said.join(", "));');
    has("위험 아이콘 이름", HIKE, 'e.title = RF.spotText(sp);\n            e.setAttribute("aria-label", e.title);');
    eq("이름 없는 표시도 한국어", RF.mapLocale()["Marker.Title"], "지도 표시");
    has("첫 화면 제목 안 잘림", read("hike.html"), "#pick .pickTop h1.ttl { flex:1 1 auto; min-width:0; margin:0; font-size:min(1em, 5.6vw); line-height:1.25; word-break:keep-all;");
})();

// ---- P1: 3D 지도 받는 양 - 지형 z14 · 음영 z12(위성 위 음영은 z9 부터) · 미리 받기 1단계 · #c= 면 코스 자리에서 시작
(function () {
    var APP = read("js/app.js");
    var sb = function (j) { return vm.runInNewContext(fn(APP, "startBounds") + " startBounds(j);", { j: j, isFinite: isFinite, Infinity: Infinity, Math: Math }); };
    eq("코스 범위", sb({ points: [[127.1, 37.5, 10, 0], [127.3, 37.4, 20, 100], [127.2, 37.7, 5, 200]] }), [[127.1, 37.4], [127.3, 37.7]]);
    eq("점이 없으면 전국에서", [sb(null), sb({ points: [] })], [null, null]);
    has("지형 z14", APP, 'encoding: "terrarium", tileSize: 256, maxzoom: 14,');
    has("음영 z12", APP, "hillshade: Object.assign({}, demSource, { maxzoom: 12 })");
    has("위성 위 음영 z9 부터", APP, 'layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", minzoom: 9,');
    has("미리 받기 1단계", APP, "prefetchZoomDelta: 1,");
    has("#c= 면 그 범위로 시작", APP, "bounds: b0 || undefined, fitBoundsOptions: { padding: 40, maxZoom: 14 },");
    has("코스를 지도 설정과 같이 받음(3초까지)", APP, ".then(function (r) { start(r[0], r[1]); });");
})();

// ---- P2 · P3 · P6: 서비스 워커 - 판 붙은 미리 담기(이미 있으면 건너뜀 · ?없는 주소도) · icon-512 뺌 · 가벼운 화면은 등록 안 함 · 못 받은 타일은 잠시 다시 안 물음
(function () {
    var SW = read("sw.js");
    has("SHELL 번호", SW, 'var SHELL = "rf-shell-v220"');
    eq("icon-512 뺌", SW.indexOf('"img/icon-512.png"'), -1);
    eq("별거 별거 · GPX 편집은 서비스 워커를 등록하지 않음", [read("tools.html").indexOf("js/sw-reg.js\""), read("studio.html").indexOf("js/sw-reg.js\"")], [-1, -1]);
    has("따라가기는 그대로 등록", read("hike.html"), '<script src="js/sw-reg.js"></script>');
    function fakeCache(store) {
        return {
            match: function (k) { return Promise.resolve(store[typeof k === "string" ? new URL(k, "https://r.kr/routefly/sw.js").href : k.url] || undefined); },
            put: function (k, v) { store[typeof k === "string" ? new URL(k, "https://r.kr/routefly/sw.js").href : k.url] = v; return Promise.resolve(); },
            keys: function () { return Promise.resolve(Object.keys(store).map(function (u) { return { url: u }; })); },
            delete: function (k) { delete store[k.url]; return Promise.resolve(true); }
        };
    }
    var fetched = [], store = { "https://r.kr/routefly/js/hike.js?v=old0000000": "옛 판", "https://r.kr/routefly/js/app.js?v=keep000000": "다른 파일" };
    var res = function (body) { return { ok: true, body: body, clone: function () { return res(body); } }; };
    var ctx = { self: { location: "https://r.kr/routefly/sw.js" }, URL: URL, Promise: Promise,
        Request: function (u) { this.url = u; }, fetch: function (r) { fetched.push(r.url); return Promise.resolve(res("새 " + r.url)); } };
    vm.createContext(ctx);
    vm.runInContext(fn(SW.replace(/\n\/\*\*/g, "\n    /**").replace(/\nfunction /g, "\n    function ").replace(/\n}\n/g, "\n    }\n"), "shellPut"), ctx);
    var c = fakeCache(store);
    later.push(function () {
        return ctx.shellPut(c, "js/hike.js?v=abc1234567").then(function () {
            eq("판 주소 · ?없는 주소 둘 다 담음", [store["https://r.kr/routefly/js/hike.js?v=abc1234567"].body, store["https://r.kr/routefly/js/hike.js"].body], ["새 js/hike.js?v=abc1234567", "새 js/hike.js?v=abc1234567"]);
            eq("같은 파일 예전 판은 지움 · 다른 파일은 그대로", [!!store["https://r.kr/routefly/js/hike.js?v=old0000000"], store["https://r.kr/routefly/js/app.js?v=keep000000"]], [false, "다른 파일"]);
            return ctx.shellPut(c, "js/hike.js?v=abc1234567");
        }).then(function () {
            eq("이미 담은 판은 다시 받지 않음", fetched, ["js/hike.js?v=abc1234567"]);
            return ctx.shellPut(c, "hike.html");
        }).then(function () {
            eq("판 없는 화면 파일은 그 주소만", [fetched.length, store["https://r.kr/routefly/hike.html"].body], [2, "새 hike.html"]);
        });
    });
    // 못 받은 타일
    var now = 1000000, nets = 0, down = true;
    var tctx = { TILES: "t", TILE_KEEP: 1500, puts: 0, TILE_FAIL_MS: 90000, TILE_FAIL_KEEP: 2000, tileFails: new Map(), Date: { now: function () { return now; } }, Promise: Promise,
        isTile: function () { return true; }, trim: function () {},
        caches: { match: function () { return Promise.resolve(undefined); }, open: function () { return Promise.resolve({ put: function () {} }); } },
        Response: function (b, o) { this.status = o.status; },
        fetch: function () { nets++; return down ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(res("타일")); } };
    vm.createContext(tctx);
    vm.runInContext(fn(SW.replace(/\n\/\*\*/g, "\n    /**").replace(/\nfunction /g, "\n    function ").replace(/\n}\n/g, "\n    }\n"), "cacheFirst"), tctx);
    var tile = { url: "https://api.vworld.kr/req/wmts/1.0.0/k/Satellite/15/1/2.jpeg" };
    later.push(function () {
        return tctx.cacheFirst(tile, "t").then(function () { throw new Error("실패해야 함"); }, function () {
            return tctx.cacheFirst(tile, "t");
        }).then(function (r) {
            eq("90초 안에 다시 - 묻지 않고 바로 504", [r.status, nets], [504, 1]);
            now += 91000; down = false;
            return tctx.cacheFirst(tile, "t");
        }).then(function (r) {
            eq("90초 뒤 - 다시 받음 · 받으면 실패 기억 지움", [r.body, nets, tctx.tileFails.size], ["타일", 2, 0]);
        });
    });
})();

// ---- P4: 산악회 방 - MapLibre 는 방 지도를 열 때 받음(대기실 · 만들기에서는 안 받음)
(function () {
    var P = read("js/party.js"), html = read("party.html");
    eq("party.html 이 처음부터 부르지 않음", html.indexOf('<script src="vendor/maplibre-gl-5.24.0/maplibre-gl.js"></script>'), -1);
    has("서비스 워커가 담아 둠(신호 없을 때)", read("sw.js"), '"vendor/maplibre-gl-5.24.0/maplibre-gl.js"');
    var added = [], win = {};
    var ctx = { window: win, Promise: Promise, Error: Error, document: { createElement: function () { return {}; }, head: { appendChild: function (s) { added.push(s); } } } };
    vm.createContext(ctx);
    vm.runInContext('var MAPLIBRE_JS = "vendor/maplibre-gl-5.24.0/maplibre-gl.js", maplibreP = null;' + fn(P, "loadMaplibre"), ctx);
    var p1 = ctx.loadMaplibre(), p2 = ctx.loadMaplibre();
    eq("한 번만 붙임", [added.length, added[0].src, p1 === p2], [1, "vendor/maplibre-gl-5.24.0/maplibre-gl.js", true]);
    later.push(function () {
        added[0].onerror();
        return p1.then(function () { throw new Error("실패해야 함"); }, function () {
            ctx.loadMaplibre();
            eq("못 받으면 다음에 다시", added.length, 2);
            added[1].onload();
            win.maplibregl = {};
            return ctx.loadMaplibre();
        }).then(function () { eq("받은 뒤에는 붙이지 않음", added.length, 2); });
    });
    has("지도를 열 때 받음", P, "Promise.all([loadMaplibre(), fetch(\"api/map-config\")");
})();

// ---- P5: 산악회 방 위치 - 50m 안에 15분 넘게 머물면 90초마다, 움직이면 바로 30초 · SOS 중에는 30초
(function () {
    var src = read("js/party-kit.js"), NOW = Date.UTC(2026, 10, 3, 3, 0), store = {}, sent = [];
    function FakeDate(a) { return a === undefined ? new Date(NOW) : new Date(a); }
    FakeDate.now = function () { return NOW; };
    var ctx = { Date: FakeDate, Promise: Promise, JSON: JSON, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout, AbortController: AbortController, console: console,
        setInterval: function () { return 1; }, clearInterval: function () {},
        localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        location: { pathname: "/routefly/hike.html", search: "" }, navigator: {}, document: { hidden: false },
        fetch: function (url, o) { sent.push(NOW); return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ success: true }); } }); } };
    ctx.window = ctx;
    vm.createContext(ctx);
    store["rf-party"] = JSON.stringify({ token: "tok", code: "ABCDEF" });
    vm.runInContext(src, ctx);
    var P = ctx.RFParty, lat = 37.6, lon = 127.0;
    eq("everyMs", vm.runInNewContext(fn(src, "everyMs") + " [everyMs(false, 0), everyMs(false, 16 * 60000), everyMs(true, 60 * 60000)];", { EVERY_MS: 30000, STILL_EVERY_MS: 90000, STILL_AFTER_MS: 900000 }), [30000, 90000, 30000]);
    var stay = function (a, la, lo, t) { return vm.runInNewContext(fn(src, "stay") + " stay(a, la, lo, t);", { a: a, la: la, lo: lo, t: t, Math: Math, STILL_NEAR_M: 50 }); };
    var a0 = { lat: 37.6, lon: 127, t: 5 };
    eq("40m 안 - 머문 자리 그대로", stay(a0, 37.6003, 127, 99), a0);
    eq("60m 움직임 - 새 자리", stay(a0, 37.60054, 127, 99), { lat: 37.60054, lon: 127, t: 99 });
    // 한자리 20분: 처음 15분은 30초마다, 그 뒤 90초마다. 그다음 움직이면 30초
    var times = [];
    function step(sec, la) {
        NOW += sec * 1000;
        var r = P.fix(la || lat, lon, 5);
        if (r) times.push(Math.round((NOW - Date.UTC(2026, 10, 3, 3, 0)) / 1000));
        return r ? r.then(function () {}, function () {}) : Promise.resolve();
    }
    later.push(function () {
        var chain = step(0);
        for (var i = 0; i < 40; i++) chain = chain.then(function () { return step(30); });   // 30초마다 위치 - 20분
        return chain.then(function () {
            var gaps = times.slice(1).map(function (t, i) { return t - times[i]; });
            eq("15분까지 30초", gaps.slice(0, 30).every(function (g) { return g === 30; }), true);
            eq("15분 넘게 머물면 90초", gaps.slice(30), [90, 90, 90]);
            return step(30, 37.6010);   // 110m 움직임 - 마지막으로 보낸 지 30초가 넘었으면 바로
        }).then(function () {
            eq("움직이면 바로(30초 간격으로 돌아감)", times[times.length - 1] - times[times.length - 2] <= 60, true);
        });
    });
})();

later.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () { console.log("OK " + n); })
    .catch(function (e) { console.error(e); process.exit(1); });
