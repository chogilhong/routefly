/*
 * 처음 안내(js/onboard.js, 2026-11-02 홍TV님 "온보딩을 studio.html 에 넣어줘. 다른 곳에 온보딩 할 곳 있으면 추가해주고") - 가짜 화면(DOM)으로 돌려 봄.
 * 처음 한 번 · 다시 보지 않기 · 다시 열기 · Esc · 저장소가 막힌 기기 · 자동 브라우저 · 따라가기(산행 중 · 산악회 회원은 안 띄움) · GPX 편집 네 장(운영자 장) · 산악회 방 인솔자(SOS 때 안 띄움 · 치움)
 * + GPX 편집 새 길 그리기의 길 찾기(멀면 곧은 선 · 오래 걸리면 곧은 선 · 다 그림 때 멈춤).
 * OnboardTest 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/onboard.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
function read(f) { return fs.readFileSync(path.join(web, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var ONBOARD = read("js/onboard.js"), STUDIO = read("js/studio.js"), PARTY = read("js/party.js");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }
function ok(name, v) { assert(v, name); n++; }
/** 화면 js 에서 "    function 이름(" 로 시작하는 함수 하나(한 줄짜리도). */
function fn(src, name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[^\\n]*\\}\\n").exec(src)
        || new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(src);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}

// ---- 가짜 화면(이 테스트에 필요한 만큼만)
function makeDom(lang, className) {
    var doc;
    function El(tag) {
        this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.hidden = false; this.style = {};
        this.className = ""; this.listeners = {}; this.textContent = ""; this.innerHTML = ""; this.parentNode = null; this.id = "";
    }
    El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
    El.prototype.removeChild = function (c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; };
    El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); };
    El.prototype.getAttribute = function (k) { return k in this.attrs ? this.attrs[k] : null; };
    El.prototype.addEventListener = function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); };
    El.prototype.focus = function () { doc.activeElement = this; };
    El.prototype.fire = function (t, ev) {
        ev = ev || {};
        ev.target = ev.target || this;
        ev.preventDefault = function () { ev.prevented = true; };
        for (var x = this; x; x = x.parentNode) (x.listeners[t] || []).forEach(function (f) { f(ev); });
        return ev;
    };
    El.prototype.click = function () { return this.fire("click"); };
    function cls(e, c) { return (" " + e.className + " ").indexOf(" " + c + " ") >= 0; }
    function match(e, sel) {
        if (sel === "[data-onboard]") return "data-onboard" in e.attrs;
        if (sel === ".ob-page[hidden]") return cls(e, "ob-page") && e.hidden;
        if (sel === ".ob-page") return cls(e, "ob-page");
        if (sel === ".ob-dots span") return e.tagName === "SPAN" && !!e.parentNode && cls(e.parentNode, "ob-dots");
        if (sel === "a[href], button") return e.tagName === "BUTTON" || (e.tagName === "A" && "href" in e.attrs);
        throw new Error("가짜 화면이 모르는 고르기: " + sel);
    }
    El.prototype.closest = function (sel) { for (var x = this; x && x.attrs; x = x.parentNode) if (match(x, sel)) return x; return null; };
    El.prototype.querySelectorAll = function (sel) {
        var out = [];
        (function walk(e) { e.children.forEach(function (c) { if (match(c, sel)) out.push(c); walk(c); }); })(this);
        return out;
    };
    var root = new El("html"), head = root.appendChild(new El("head")), body = root.appendChild(new El("body"));
    root.lang = lang || "ko";
    root.className = className || "";
    doc = {
        documentElement: root, head: head, body: body, activeElement: body,
        createElement: function (t) { return new El(t); },
        getElementById: function (id) {
            var hit = null;
            (function walk(e) { e.children.forEach(function (c) { if (!hit && c.id === id) hit = c; walk(c); }); })(root);
            return hit;
        },
        addEventListener: function (t, f) { root.addEventListener(t, f); }
    };
    doc.El = El;
    return doc;
}
function memStore(data, broken) {
    return {
        data: data,
        getItem: function (k) { if (broken) throw new Error("막힘"); return k in data ? data[k] : null; },
        setItem: function (k, v) { if (broken) throw new Error("막힘"); data[k] = String(v); }
    };
}
/** onboard.js 를 이 화면에서 돌림. extra: 더 둘 전역(RFParty 등). */
function load(doc, store, nav, extra) {
    var ctx = { document: doc, localStorage: store, navigator: nav || { userAgent: "Mozilla/5.0" } };
    Object.keys(extra || {}).forEach(function (k) { ctx[k] = extra[k]; });
    ctx.window = ctx;
    vm.runInNewContext(ONBOARD, ctx);
    return ctx;
}
function dialog(doc) { return doc.body.children.filter(function (e) { return e.className === "rfob"; })[0]; }
function buttons(box) { return box.querySelectorAll("a[href], button"); }
function visiblePage(box) { return box.querySelectorAll(".ob-page").filter(function (p) { return !p.hidden; }); }

// ---- GPX 편집 네 장(studio.js 의 studioCards)
function plain(x) { return JSON.parse(JSON.stringify(x)); }   // vm 안에서 만든 배열 · 객체(다른 realm)를 견줄 수 있게
function studioCards(own, small) { return plain(vm.runInNewContext("(function () {" + fn(STUDIO, "studioCards") + " return studioCards(" + own + ", " + small + "); })()", {})); }
var guest = studioCards(false, false), boss = studioCards(true, false), phone = studioCards(false, true);
eq("네 장", guest.length, 4);
eq("장 제목(손님)", guest.map(function (c) { return c.title[0]; }), ["GPX 편집", "시작하기", "고치기", "routefly 에 보내기"]);
eq("운영자는 마지막 장만 다름", boss.map(function (c) { return c.title[0]; }), ["GPX 편집", "시작하기", "고치기", "코스로 올리기 (운영자)"]);
ok("손님 마지막 장 - 운영자 확인 · 집 근처 자르기", /운영자가 확인한 뒤 코스 목록에/.test(guest[3].body[0].join(" ")) && /집 근처는 먼저 자르세요/.test(guest[3].body[0].join(" ")));
ok("운영자 마지막 장 - 받은 GPX", /📨 받은 GPX/.test(boss[3].body[0].join(" ")));
ok("열기 · 그리기", /📂 GPX 열기/.test(guest[1].body[0].join(" ")) && /✏️ 지도에 새 길 그리기/.test(guest[1].body[0].join(" ")));
ok("자르기 · 나누기 · 잇기 · 되돌리기", ["자르기", "나누기", "잇기", "되돌리기"].every(function (w) { return guest[2].body[0].join(" ").indexOf(w) >= 0; }));
ok("작은 화면은 첫 장에 PC 안내(따로 띄우던 알림을 합침)", /PC 에서 쓰기 좋아요/.test(phone[0].body[0].join(" ")) && !/PC 에서/.test(guest[0].body[0].join(" ")));
ok("PC 알림을 따로 띄우지 않음", STUDIO.indexOf("function pcHint") < 0 && STUDIO.indexOf("rf-studio-pc-hint") < 0);
ok("운영자인지 안 뒤에 띄움", /if \(owner\) loadSubs\(\);\n        guide\(\);/.test(STUDIO));

// ---- 처음 한 번 · 장 넘기기 · 시작하기 = 다시 보지 않기
var KEY = "rf-studio-onboard-v1", data = {};
var doc = makeDom("ko"), w = load(doc, memStore(data));
var help = doc.body.appendChild(new doc.El("button"));
help.setAttribute("data-onboard", "");
var g = w.RFOnboard.start({ key: KEY, cards: guest });
var box = dialog(doc);
eq("만들기만 하면 숨김", box.hidden, true);
g.auto();
eq("처음이면 뜸", box.hidden, false);
eq("role=dialog · aria-modal", [box.getAttribute("role"), box.getAttribute("aria-modal"), box.getAttribute("aria-labelledby")], ["dialog", "true", "rfobT0"]);
var bt = buttons(box), skip = bt[0], next = bt[1];
eq("처음 포커스는 다음", doc.activeElement, next);
eq("단추 글", [skip.textContent, next.textContent], ["건너뛰기", "다음"]);
eq("첫 장만 보임", visiblePage(box).length, 1);
eq("첫 장 제목", visiblePage(box)[0].children[1].textContent, "GPX 편집");
next.click(); next.click(); next.click();
eq("마지막 장 - 시작하기, 건너뛰기 숨김", [next.textContent, skip.style.visibility], ["시작하기", "hidden"]);
eq("마지막 장 제목", visiblePage(box)[0].children[1].textContent, "routefly 에 보내기");
next.click();
eq("시작하기로 닫힘", box.hidden, true);
eq("다시 보지 않기", data[KEY], "1");
g.auto();
eq("이번 화면에서 다시 저절로 안 뜸", box.hidden, true);
help.click();
eq("❓ 사용법으로 다시", [box.hidden, visiblePage(box)[0].children[1].textContent], [false, "GPX 편집"]);
var esc = box.fire("keydown", { key: "Escape" });
eq("Esc 로 닫힘", box.hidden, true);
ok("Esc 이벤트", esc);

// 다음에 열 때(같은 기기)는 안 뜸
var doc2 = makeDom("ko"), w2 = load(doc2, memStore(data));
w2.RFOnboard.start({ key: KEY, cards: guest }).auto();
eq("본 기기는 다시 안 뜸", dialog(doc2).hidden, true);

// 건너뛰기도 다시 보지 않기
var d3 = {}, doc3 = makeDom("ko"), w3 = load(doc3, memStore(d3));
w3.RFOnboard.start({ key: KEY, cards: boss }).auto();
buttons(dialog(doc3))[0].click();
eq("건너뛰기 = 다시 보지 않기", [dialog(doc3).hidden, d3[KEY]], [true, "1"]);

// 탭은 창 안에서 돎
var d4 = {}, doc4 = makeDom("ko"), w4 = load(doc4, memStore(d4));
w4.RFOnboard.start({ key: KEY, cards: guest }).auto();
var b4 = buttons(dialog(doc4));
var tab = dialog(doc4).fire("keydown", { key: "Tab" });
eq("다음에서 탭 → 건너뛰기(창 밖으로 안 나감)", [doc4.activeElement, tab.prevented], [b4[0], true]);
dialog(doc4).fire("keydown", { key: "Tab", shiftKey: true });
eq("Shift+탭 → 다음", doc4.activeElement, b4[1]);

// 저장소가 막힌 기기 · 자동 브라우저 · 점검 · 로봇은 저절로 안 뜸(버튼으로는 열림)
var doc5 = makeDom("ko"), w5 = load(doc5, memStore({}, true));
var g5 = w5.RFOnboard.start({ key: KEY, cards: guest });
g5.auto();
eq("저장소가 막히면 저절로 안 뜸", dialog(doc5).hidden, true);
g5.open();
dialog(doc5).fire("keydown", { key: "Escape" });
eq("막힌 기기도 열고 닫기는 됨(오류 없음)", dialog(doc5).hidden, true);
[{ webdriver: true, userAgent: "Mozilla/5.0" }, { userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }, { userAgent: "routefly-check" }].forEach(function (nav) {
    var dd = makeDom("ko"), ww = load(dd, memStore({}), nav);
    ww.RFOnboard.start({ key: KEY, cards: guest }).auto();
    eq("저절로 안 뜸: " + JSON.stringify(nav), dialog(dd).hidden, true);
});

// hide - 닫기만(다시 보지 않기는 안 남김)
var d6 = {}, doc6 = makeDom("ko"), w6 = load(doc6, memStore(d6));
var g6 = w6.RFOnboard.start({ key: KEY, cards: guest });
g6.auto();
g6.hide();
eq("hide 는 기억하지 않음", [dialog(doc6).hidden, d6[KEY]], [true, undefined]);

// 영어 화면(산악회 방 ?lang=en)
var doc7 = makeDom("en"), w7 = load(doc7, memStore({}));
w7.RFOnboard.start({ key: "k", cards: [{ icon: "1", title: ["가", "A"], body: [["나"], ["B"]] }, { icon: "2", title: ["다"], body: [["라"]] }] }).auto();
var b7 = buttons(dialog(doc7));
eq("영어 단추", [b7[0].textContent, b7[1].textContent], ["Skip", "Next"]);
eq("영어 글 · 영어가 없으면 한국어", [visiblePage(dialog(doc7))[0].children[1].textContent, dialog(doc7).querySelectorAll(".ob-page")[1].children[1].textContent], ["A", "다"]);
b7[1].click();
eq("영어 마지막 장", b7[1].textContent, "Get started");

// ---- 따라가기(hike.html #onboard) - 그대로: 같은 열쇠, 코스 목록(picking)에서만, 산악회 회원은 안 띄움
function hikeDom(className) {
    var d = makeDom("ko", className), E = d.El;
    var b = d.body.appendChild(new E("div"));
    b.setAttribute("id", "onboard");
    b.hidden = true;
    var card = b.appendChild(new E("div"));
    for (var i = 0; i < 5; i++) { var p = card.appendChild(new E("div")); p.className = "ob-page"; p.hidden = i > 0; }
    var dots = card.appendChild(new E("div"));
    dots.className = "ob-dots";
    for (var k = 0; k < 5; k++) dots.appendChild(new E("span"));
    var row = card.appendChild(new E("div")), s = row.appendChild(new E("button")), nx = row.appendChild(new E("button"));
    s.setAttribute("id", "obSkip"); nx.setAttribute("id", "obNext");
    return d;
}
var dh = hikeDom("picking"), hd = {};
load(dh, memStore(hd));
eq("따라가기 코스 목록 - 처음이면 뜸", dh.getElementById("onboard").hidden, false);
dh.getElementById("obSkip").click();
eq("따라가기 열쇠는 그대로 rf-onboard-v2", hd["rf-onboard-v2"], "1");
var dh2 = hikeDom("hiking");
load(dh2, memStore({}));
eq("산행 중 · 이어 하기(picking 아님)는 안 뜸", dh2.getElementById("onboard").hidden, true);
var dh3 = hikeDom("picking");
load(dh3, memStore({ "rf-party": "{}" }), null, { RFParty: { get: function () { return { code: "ABCDEF", token: "t" }; } } });
eq("산악회 회원은 안 뜸(2026-10-24 - 버스 탔어요를 가렸음)", dh3.getElementById("onboard").hidden, true);
var dh4 = hikeDom("picking");
load(dh4, memStore({}), { webdriver: true });
eq("따라가기도 자동 브라우저에는 안 뜸", dh4.getElementById("onboard").hidden, true);

// ---- 산악회 방 인솔자(party.js leadGuide) - SOS 가 켜져 있으면 안 띄우고, 띄운 뒤 SOS 가 오면 치움
function partyRun(steps) {
    var log = [], sosBar = { hidden: true };
    var stub = { start: function (o) { log.push("start:" + o.key + ":" + o.cards.length); return { auto: function () { log.push("auto"); }, hide: function () { log.push("hide"); } }; } };
    var ctx = { $: function (id) { if (id === "sosBar") return sosBar; throw new Error(id); }, window: { RFOnboard: stub }, RFOnboard: stub, log: log, sosBar: sosBar };
    vm.runInNewContext("var guide = null;" + fn(PARTY, "leadGuide") + fn(PARTY, "leadCards") + " this.leadGuide = leadGuide; this.leadCards = leadCards;", ctx);
    steps(ctx);
    return log;
}
eq("회원(hiker)은 안 띄움", partyRun(function (c) { c.leadGuide({ role: "hiker" }); }), []);
eq("사무실 자리는 안 띄움", partyRun(function (c) { c.leadGuide({ role: "lead", officeMe: true }); }), []);
eq("SOS 가 켜져 있으면 안 띄우고 꺼진 뒤에", partyRun(function (c) { c.sosBar.hidden = false; c.leadGuide({ role: "lead" }); c.sosBar.hidden = true; c.leadGuide({ role: "lead" }); }), ["start:rf-party-lead-onboard-v1:4", "auto"]);
eq("띄운 뒤 SOS 가 오면 치움 · 한 번만 만듦", partyRun(function (c) { c.leadGuide({ role: "lead" }); c.leadGuide({ role: "lead" }); c.sosBar.hidden = false; c.leadGuide({ role: "lead" }); }), ["start:rf-party-lead-onboard-v1:4", "auto", "hide"]);
var lc = plain(vm.runInNewContext("(function () {" + fn(PARTY, "leadCards") + " return leadCards(); })()", {}));
eq("인솔자 장 제목", lc.map(function (c) { return c.title[0]; }), ["산악회 방 - 인솔자 화면", "회원 부르기", "출발 날", "산행 중"]);
ok("인솔자 장 영어도", lc.every(function (c) { return c.title[1] && c.body[1] && c.body[1].length === c.body[0].length; }));
ok("방 목록 그릴 때 SOS 다음에", /function list\(s\) \{\n        sosAlert\(s\);\n        leadGuide\(s\);/.test(PARTY));
ok("회원은 방 화면 없이 따라가기로(그래서 회원 안내는 없음)", PARTY.indexOf("if (!isStaff()) { location.replace(HIKE); return; }") >= 0);

// ---- GPX 편집 새 길 그리기 - 길 찾기가 멈추지 않게(2026-11-02 홍TV님: 수백 km 를 찍으면 "길 찾는 중…" 에 멈추고 다 그림이 안 눌렸음)
var head = /\n    var segQ = Promise\.resolve\(\), SNAP_MAX_M = (\d+), SNAP_WAIT_MS = (\d+);\n/.exec(STUDIO);
ok("거리 한도 · 기다림 한도", head && +head[1] === 20000 && +head[2] === 15000);
function distM(a, b, c, d) {   // 하버사인(course-kit 과 같은 식은 아니어도 이 테스트에는 충분)
    var R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
}
/** studio.js 의 길 찾기 조각을 가짜 fetch 로. fetchFn(url, opt) → Promise. waitMs: 기다림 한도(테스트용으로 줄임). */
function studioRoute(fetchFn, waitMs) {
    var ctx = {
        RF: { distM: distM, km: function (m) { return (m / 1000).toFixed(1); }, WALK_WAYS: "path", osmRoute: function () { return { error: "길 없음" }; }, trailsToElements: function (t) { return t; } },
        fetch: fetchFn, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise,
        $: function () { return { value: "hike" }; }, encodeURIComponent: encodeURIComponent
    };
    ctx.window = { AbortController: AbortController };
    ctx.AbortController = AbortController;
    var src = "var segQ = Promise.resolve(), SNAP_MAX_M = 20000, SNAP_WAIT_MS = " + waitMs + ";"
        + "var OVERPASS = ['https://o1', 'https://o2']; var osmCache = {}, trailCache = {}, drawing = { snap: true, wps: [], segs: [] };"
        + fn(STUDIO, "km") + fn(STUDIO, "overpass") + fn(STUDIO, "ourTrails") + fn(STUDIO, "tooFar") + fn(STUDIO, "segment") + fn(STUDIO, "route")
        + fn(STUDIO, "waiting") + fn(STUDIO, "stopWaiting") + fn(STUDIO, "draftTrack")
        + "this.api = { segment: segment, tooFar: tooFar, waiting: waiting, stopWaiting: stopWaiting, draftTrack: draftTrack, set: function (d) { drawing = d; } };";
    ctx.RF.joinTracks = function (a, b) { return a.concat(b.slice(1)); };
    vm.runInNewContext(src, ctx);
    return ctx.api;
}
var SEOUL = [37.5665, 126.978], BUSAN = [35.1796, 129.0756], NEAR = [37.60, 126.99];
var calls = [], hang = [];
function hangingFetch(u, o) {
    calls.push(u);
    return new Promise(function (ok2, bad) {
        hang.push(o && o.signal);
        if (o && o.signal) o.signal.addEventListener("abort", function () { bad(new Error("aborted")); });
    });
}
var A = studioRoute(hangingFetch, 60);
eq("서울 - 부산은 멂", A.tooFar(SEOUL, BUSAN), true);
eq("5km 안은 길을 찾음", A.tooFar(SEOUL, NEAR), false);

var waits = [];
var ph1 = { wait: true };
waits.push(A.segment(SEOUL, BUSAN, ph1).then(function (sg) {
    eq("멀면 묻지 않고 곧은 선", [sg.straight, sg.pts.length, calls.length], [true, 2, 0]);
    ok("멀다는 글", /^멀어서 곧은 선으로 이었습니다/.test(sg.note));
}));
var ph2 = { wait: true };
waits.push(A.segment(SEOUL, NEAR, ph2).then(function (sg) {
    eq("오래 걸리면 곧은 선", [sg.straight, sg.pts.length], [true, 2]);
    eq("오래 걸린다는 글", sg.note, "길 찾기가 오래 걸려 곧은 선으로 이었습니다.");
    ok("묻던 것을 멈춤(abort)", ph2.ctl.signal.aborted && hang.every(function (s) { return !s || s.aborted; }));
}));
// 다 그림 · 점 빼기: 기다리는 구간은 멈추고 곧은 선으로 남김
var B = studioRoute(hangingFetch, 100000);
var ph3 = { wait: true }, d = { snap: true, wps: [SEOUL, NEAR, [37.61, 127.0]], segs: [{ pts: [SEOUL, [37.58, 126.98], NEAR] }, ph3] };
B.set(d);
var late = B.segment(NEAR, [37.61, 127.0], ph3);
eq("기다리는 구간 수", B.waiting(), 1);
eq("기다리는 동안 그린 길은 그 구간을 곧은 선으로", B.draftTrack().length, 4);
B.stopWaiting(d);
eq("멈추면 기다림 없음", B.waiting(), 0);
eq("멈춘 구간은 곧은 선", plain(d.segs[1]), { pts: [NEAR, [37.61, 127.0]], straight: true });
ok("멈추면 묻던 것도 abort", ph3.ctl.signal.aborted);
waits.push(late.then(function (sg) {
    eq("멈춘 뒤 온 답은 곧은 선(자리를 못 찾아 버려짐)", sg.straight, true);
    eq("자리(ph)는 목록에 없음", d.segs.indexOf(ph3), -1);
}));
ok("다 그림은 길 찾는 중에도 눌림", STUDIO.indexOf("(drawing.wps.length > 1 && !drawing.finishing ? \"\" : \" disabled\") + '>다 그림</button>") >= 0);
ok("다 그림 때 기다리는 구간을 멈춤", /function finishDraw\(\) \{\n        if \(waiting\(\)\) \{ stopWaiting\(drawing\);/.test(STUDIO));
ok("점 빼기 · 그만도 멈춤", STUDIO.indexOf("var sg = drawing.segs.pop(); if (sg && sg.wait && sg.ctl) sg.ctl.abort();") >= 0 && STUDIO.indexOf("function () { stopWaiting(drawing); drawing = null;") >= 0);
ok("옛 답은 자리로 찾음(빼고 새로 찍은 점에 들어가지 않게)", STUDIO.indexOf("var at = d.segs.indexOf(ph);") >= 0);

Promise.all(waits).then(function () { console.log("OK " + n); }, function (e) { console.error(e); process.exit(1); });
