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

console.log("OK " + n);
