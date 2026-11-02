/*
 * 첫 화면 속도(2026-11-02 홍TV님 속도 점검) - 사이트 첫 주소의 넘기기(js/root-go.js)와 따라가기의 지도 설정 미리 묻기(js/early.js)를
 * 가짜 location · fetch 로 돌려 봄. FirstScreenSpeedTest 가 부름(node 가 없으면 건너뜀).
 * 사용: node src/test/js/first-screen.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var web = path.join(__dirname, "../../main/webapp");
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }

/** root-go.js 를 이 주소(경로 · ? · #) · 기기 언어 · 신호로 돌려 넘어간 곳(없으면 null). */
function go(pathname, search, hash, lang, online) {
    var to = null;
    var ctx = {
        location: { pathname: pathname, search: search, hash: hash, replace: function (u) { to = u; } },
        localStorage: { getItem: function () { return lang || null; } },
        navigator: { onLine: online !== false }
    };
    vm.runInNewContext(fs.readFileSync(path.join(web, "js/root-go.js"), "utf8"), ctx);
    return to;
}
eq("첫 주소 → 코스 모음", go("/routefly/", "", ""), "m/");
eq("영어", go("/routefly/", "?lang=en", ""), "en/m/");
eq("이 기기가 영어", go("/routefly/", "", "", "en"), "en/m/");
eq("?lang=ko 가 기기 언어보다 먼저", go("/routefly/", "?lang=ko", "", "en"), "m/");
eq("신호 없음 → 따라가기", go("/routefly/", "", "", null, false), "hike.html");
eq("예전 따라가기 꼬리", go("/routefly/", "?q=%EC%84%A4%EC%95%85", ""), "hike.html?q=%EC%84%A4%EC%95%85");
eq("예전 공유 링크(#c=) → 3D 화면", go("/routefly/", "", "#c=knps-1"), "index.html#c=knps-1");
eq("? · # 그대로", go("/routefly/", "?lang=ko", "#c=knps-1&m=x"), "index.html?lang=ko#c=knps-1&m=x");
eq("신호 없어도 #c= 는 3D 화면(서비스 워커가 index.html 을 담아 둠)", go("/routefly/", "", "#c=knps-1", null, false), "index.html#c=knps-1");
eq("root.html 을 직접 연 주소도", go("/routefly/root.html", "", "#c=knps-2"), "index.html#c=knps-2");
eq("3D 화면(index.html)의 #c= 는 그대로 머묾", go("/routefly/index.html", "", "#c=knps-1"), null);
eq("3D 화면을 코스 없이 열면 코스 모음", go("/routefly/index.html", "", ""), "m/");

/** early.js 를 돌려 지도 설정을 미리 묻는지 · 몇 번 묻는지. */
function early(withFetch) {
    var calls = [];
    var ctx = {
        location: { hash: "", search: "", replace: function () { throw new Error("넘기면 안 됨"); } },
        document: { documentElement: { className: "" } },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
        localStorage: { getItem: function () { return null; } },
        navigator: { onLine: true }
    };
    ctx.window = ctx;
    if (withFetch) ctx.fetch = function (u, o) { calls.push([u, o && o.headers && o.headers.Accept]); return Promise.resolve({ ok: true }); };
    vm.runInNewContext(fs.readFileSync(path.join(web, "js/early.js"), "utf8"), ctx);
    return { calls: calls, has: !!ctx.rfMapCfg, picking: ctx.document.documentElement.className };
}
var e = early(true);
eq("지도 설정을 한 번 미리 물음(hike.js 의 getJson 과 같은 Accept)", e.calls, [["api/map-config", "application/json"]]);
eq("답은 window.rfMapCfg", e.has, true);
eq("코스 없이 열면 코스 고르기(예전 그대로)", e.picking, " picking");
eq("fetch 가 없는 브라우저는 그대로(hike.js 가 예전처럼 물음)", early(false).has, false);

console.log("OK " + n);
