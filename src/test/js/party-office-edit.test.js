/*
 * 사무실 자리는 보기부터(2026-11-02 홍TV님) - party.js 의 화면 조각을 가짜 화면으로 돌려 봄.
 * 고친 것 한 줄(officeLogText, 한국어 · 영어) · 보기인가(officeLocked) · 막는 단추가 화면에 있는지 · 인솔자 알림 줄(msgAlert) · 사무실 방 끝내기 두 번 묻기(officeSure).
 * PartyOfficeEditTest 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/party-office-edit.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var main = path.join(__dirname, "../../main");
function read(f) { return fs.readFileSync(path.join(main, f), "utf8").replace(/\r\n/g, "\n"); }   // PC(core.autocrlf)는 CRLF
var PARTY = read("webapp/js/party.js"), HTML = read("webapp/party.html");
var JAVA = read("java/com/gh/routefly/web/PartyServlet.java") + read("java/com/gh/routefly/web/Party.java");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }
function ok(name, v) { assert(v, name); n++; }
/** 화면 js 에서 "    function 이름(" 로 시작하는 함수 하나(한 줄짜리도). */
function fn(name) {
    var m = new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[^\\n]*\\}\\n").exec(PARTY)
        || new RegExp("\\n    function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n").exec(PARTY);
    assert(m, name + " 를 찾지 못함");
    return m[0];
}
function ctx(en, extra) {
    var c = { T: function (ko, e) { return en ? e : ko; } };
    Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; });
    return c;
}

// ---- 고친 것 한 줄
var CODES = ["edit", "plate", "roster", "board", "boardOff", "aboard", "aboardOff", "apart", "bus", "notice", "kick", "depart", "drop", "pickup", "seat"];
function logText(en, x) { var c = ctx(en); vm.runInNewContext(fn("officeLogText") + " this.f = officeLogText;", c); return c.f(x); }
eq("차량번호 - 홍TV님 예시 그대로", logText(false, { what: "plate", arg: "2" }), "🏢 사무실이 차량번호를 바꿨습니다(2호차)");
eq("영어", logText(true, { what: "plate", arg: "2" }), "🏢 The office changed the plate number (bus 2)");
eq("이름", logText(false, { what: "kick", arg: "영희" }), "🏢 사무실이 영희 님을 내보냈습니다");
var dflt = logText(false, { what: "?" }), dfltEn = logText(true, { what: "?" });
CODES.forEach(function (k) {
    ok(k + " - 따로 글이 있음", logText(false, { what: k, arg: "1" }) !== dflt && logText(true, { what: k, arg: "1" }) !== dfltEn);
    ok(k + " - 🏢 로 시작", /^🏢 /.test(logText(false, { what: k, arg: "1" })));
});
// 서버가 남기는 what 이 모두 위 목록에(새 것을 더하면 화면 글도)
var java = [], re = /officeDid\(m, "(\w+)"/g, mm;
while ((mm = re.exec(JAVA))) java.push(mm[1]);
ok("서버 what 을 찾음", java.length >= 10);
java.forEach(function (k) { ok("서버 " + k + " 이 화면에", CODES.indexOf(k) >= 0); });
ok("좌석표 체크는 board · aboard · apart + Off", JAVA.indexOf("\"apart\".equals(what) && on ? \"apart\" : (\"aboard\".equals(what) || \"apart\".equals(what) ? \"aboard\" : \"board\") + (on ? \"\" : \"Off\")") >= 0);

// ---- 보기인가
var lc = ctx(false); vm.runInNewContext(fn("officeLocked") + " this.f = officeLocked;", lc);
eq("사무실 · 고치기 꺼짐", lc.f({ officeMe: true, officeEdit: false }), true);
eq("사무실 · 고치기 켜짐", lc.f({ officeMe: true, officeEdit: true }), false);
eq("인솔자는 늘 고침", lc.f({ role: "lead" }), false);
eq("아직 화면 없음", lc.f(null), false);

// ---- 막는 단추가 화면에 있음(이름이 바뀌면 막지 못하게 되므로)
var sel = /var OFFICE_EDIT_SEL = ("[^"]*")\s*\+ ("[^"]*");/.exec(PARTY);
ok("막는 단추 목록", sel);
var ids = (JSON.parse(sel[1]) + JSON.parse(sel[2])).match(/#[A-Za-z]+/g);
ids.forEach(function (id) { ok(id + " 가 화면 · 코드에", HTML.indexOf("id=\"" + id.slice(1) + "\"") >= 0 || PARTY.indexOf("id=\\\"" + id.slice(1) + "\\\"") >= 0); });
["data-kick", "data-aboard", "data-apart", "data-board", "data-undo"].forEach(function (a) { ok(a + " 단추를 막음", sel[0].indexOf("[" + a + "]") >= 0 && PARTY.indexOf(a + "=\\\"") >= 0); });
ok("띠 · 단추가 화면에", HTML.indexOf("id=\"officeEdit\"") >= 0 && HTML.indexOf("id=\"officeEditBtn\"") >= 0 && HTML.indexOf("id=\"officeEditText\"") >= 0);
ok("누르기를 먼저 가로챔(capture)", /if \(!officeLocked\(state\) \|\| !e\.target\.closest \|\| !e\.target\.closest\(OFFICE_EDIT_SEL\)\) return;[\s\S]{0,400}\}, true\);/.test(PARTY));
ok("render 가 띠를 그림", PARTY.indexOf("officeBar(s);") >= 0);

// ---- 인솔자 알림 줄 - 사무실이 고친 것
function alertRun(states) {
    var bar = { innerHTML: "", hidden: true }, buzz = [];
    var c = ctx(false, {
        $: function (id) { if (id === "msgBar") return bar; throw new Error(id); },
        esc: function (s) { return String(s).replace(/</g, "&lt;"); }, clock: function () { return "10:00"; }, seatName: function () { return ""; },
        navigator: { vibrate: function (p) { buzz.push(p); } }, SpeechSynthesisUtterance: function () {}, speechSynthesis: { speak: function () {} }, EN: false
    });
    vm.runInNewContext("var msgSeen = null;" + fn("officeLogText") + fn("msgAlert") + " this.f = msgAlert;", c);
    states.forEach(function (s) { c.f(s); });
    return { bar: bar, buzz: buzz.length };
}
var S0 = { now: 1000, members: [], office: "시험산악회" }, S1 = { now: 2000, members: [], office: "시험산악회", officeLog: [{ what: "plate", arg: "2", at: 1500 }] };
var r = alertRun([S0, S1]);
ok("인솔자 줄에 보임", r.bar.innerHTML.indexOf("🏢 사무실이 차량번호를 바꿨습니다(2호차)") >= 0 && !r.bar.hidden);
eq("새로 오면 인솔자 폰이 떪", r.buzz, 1);
eq("사무실 자리 자신은 안 떪", alertRun([Object.assign({}, S0, { officeMe: true }), Object.assign({}, S1, { officeMe: true })]).buzz, 0);
var many = { now: 9000, members: [{ id: 3, nick: "철수", msg: "늦어요", msgAt: 8000 }], office: "시험산악회", officeLog: [1, 2, 3, 4, 5].map(function (i) { return { what: "notice", at: 8000 + i }; }) };
var rm = alertRun([many]).bar.innerHTML;
ok("회원 한 줄은 밀리지 않음", rm.indexOf("철수") >= 0);
eq("사무실 줄은 셋까지", rm.split("사무실이 공지").length - 1, 3);
eq("6시간 지난 것은 안 보임", alertRun([{ now: 7 * 3600000, members: [], officeLog: [{ what: "notice", at: 0 }] }]).bar.hidden, true);

// ---- 사무실 방 끝내기 · 산행 취소 - 한 번 더
function sureRun(state, first) {
    var asked = [], c = ctx(false, { state: state, ask: function (t, o) { asked.push(t); return Promise.resolve("두번째"); } });
    vm.runInNewContext(fn("officeSure") + " this.f = officeSure;", c);
    return Promise.resolve(c.f(first)).then(function (v) { return { v: v, asked: asked }; });
}
Promise.all([
    sureRun({ officeMe: true, officeEdit: true }, true), sureRun({ role: "lead", chief: true }, true), sureRun({ officeMe: true }, false)
]).then(function (rs) {
    eq("사무실은 두 번째로 물음", rs[0].v, "두번째");
    ok("인솔자 · 회원이 본다고 알림", /인솔자와 모든 회원 화면에서 방이 끝나고/.test(rs[0].asked[0]));
    eq("주 인솔자는 그대로(한 번)", [rs[1].v, rs[1].asked.length], [true, 0]);
    eq("첫 창에서 그만두면 묻지 않음", [rs[2].v, rs[2].asked.length], [false, 0]);
    ok("방 끝내기 · 산행 취소 둘 다", (PARTY.match(/\.then\(officeSure\)/g) || []).length === 2);
    console.log("OK " + n);
}).catch(function (e) { console.error(e); process.exit(1); });
