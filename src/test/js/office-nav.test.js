/*
 * 사무실 · 방 사이 "뒤로"(2026-11-02 홍TV님: 사무실 → 열기 → ← 사무실 → ‹ 뒤로 → 방 … 이 끝없이 돌았음).
 * party-kit 의 officeNav 를 진짜로 돌리고, 가짜 브라우저 기록(쌓기 · 바꾸기 · 뒤로)으로 그 순서를 따라가 봄.
 * PartyOfficeBackTest 가 부름(node 가 없으면 건너뜀). 사용: node src/test/js/office-nav.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
var KIT = fs.readFileSync(path.join(web, "js/party-kit.js"), "utf8");
var win = { location: { pathname: "/routefly/party.html", search: "" } };
vm.runInNewContext(KIT, { window: win, location: win.location, sessionStorage: { getItem: function () { return null; } }, localStorage: { getItem: function () { return null; } } });
var nav = win.RFParty.officeNav, O = "https://routefly.kr", n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }

eq("방 ← 사무실: 앞이 사무실이면 뒤로", nav("room", O + "/routefly/party-office.html", O, 3), "back");
eq("방 ← 사무실: 앞이 사무실(?lang=en)", nav("room", O + "/routefly/party-office.html?lang=en", O, 3), "back");
eq("방 ← 사무실: 새로 고침 등 앞이 없으면 바꾸기", nav("room", "", O, 1), "replace");
eq("방 ← 사무실: 다른 곳에서 왔으면 바꾸기", nav("room", O + "/routefly/m/", O, 4), "replace");
eq("방 ← 사무실: 남의 사이트", nav("room", "https://evil.example/routefly/party-office.html", O, 4), "replace");
eq("사무실 ‹ 뒤로: 앞이 방 화면이면 들어온 문으로", nav("office", O + "/routefly/party.html", O, 4), "href");
eq("사무실 ‹ 뒤로: 앞이 방(?lang=en)", nav("office", O + "/routefly/party.html?lang=en", O, 4), "href");
eq("사무실 ‹ 뒤로: 안내 화면에서 왔으면 뒤로", nav("office", O + "/routefly/about.html", O, 3), "back");
eq("사무실 ‹ 뒤로: 카톡 링크로 처음 연 탭", nav("office", "", O, 1), "href");

// 가짜 브라우저 기록으로 그 순서 - 산악회 방 첫 화면 → 사무실 → 열기(방) → ← 사무실 → ‹ 뒤로 : 방으로 돌아오면 안 됨
function browser() {
    var st = [], i = -1, roomSeat = false;
    // 화면은 열 때 정해지고, 뒤로 가면 브라우저가 그때 화면을 그대로 되살릴 수 있음(bfcache) - 그래서 방으로 "뒤로" 가면 방이 다시 보임
    function look(url) { return /party\.html/.test(url) ? (roomSeat ? "방" : "첫 화면") : /party-office/.test(url) ? "사무실" : /\/m\/$/.test(url) ? "코스 모음" : url; }
    function go(url, ref, replace) { var e = { url: url, ref: ref, look: look(url) }; if (replace) st[i] = e; else { st = st.slice(0, i + 1); st.push(e); i++; } }
    return {
        open: function (url) { go(url, i >= 0 ? st[i].url : "", false); },
        replace: function (url) { go(url, st[i].url, true); },
        back: function () { i--; },
        cur: function () { return st[i]; },
        len: function () { return st.length; },
        seat: function (v) { if (v !== undefined) roomSeat = v; return roomSeat; }
    };
}
function roomBack(b) { if (nav("room", b.cur().ref, O, b.len()) === "back") b.back(); else b.replace(O + "/routefly/party-office.html"); }
function officeBack(b) { b.seat(false); if (nav("office", b.cur().ref, O, b.len()) === "back") b.back(); else b.open(O + "/routefly/m/"); }
function shown(b) { return b.cur().look; }

var b = browser();
b.open(O + "/routefly/party.html");            // 산악회 방 첫 화면
b.open(O + "/routefly/party-office.html");     // 사무실
b.seat(true); b.open(O + "/routefly/party.html");   // 열기 → 방
eq("열기 → 방", shown(b), "방");
roomBack(b);
eq("← 사무실 → 사무실", shown(b), "사무실");
officeBack(b);
eq("‹ 뒤로 → 방이 아니라 코스 모음", shown(b), "코스 모음");

var c = browser();                              // 카톡 링크로 사무실을 연 탭, 방에서 새로 고침한 뒤
c.open(O + "/routefly/party-office.html");
c.seat(true); c.open(O + "/routefly/party.html");
c.replace(O + "/routefly/party.html");          // 새로 고침 - 앞 주소가 자기 자신
roomBack(c);
eq("새로 고침 뒤 ← 사무실 → 사무실", shown(c), "사무실");
for (var k = 0; k < 3; k++) { officeBack(c); eq("‹ 뒤로 " + (k + 1) + "번 - 방으로 돌아오지 않음", shown(c) === "방", false); if (shown(c) !== "사무실") break; }

var d = browser();                              // 홍TV님: m/ → 사무실 → 산악회방 → 사무실 → m/
d.open(O + "/routefly/m/");
d.open(O + "/routefly/party-office.html");
d.seat(true); d.open(O + "/routefly/party.html");
roomBack(d);
eq("m/ 에서: ← 사무실 → 사무실", shown(d), "사무실");
officeBack(d);
eq("m/ 에서: ‹ 뒤로 → 코스 모음(산악회 방 첫 화면을 거치지 않음)", shown(d), "코스 모음");

console.log("OK " + n);
