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

/** early.js 를 돌려 지도 설정을 미리 묻는지 · 몇 번 묻는지. withFetch - true(빈 ok 답) 또는 가짜 fetch 의 답(Promise)을 만드는 함수. */
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
    if (withFetch) ctx.fetch = function (u, o) { calls.push([u, o && o.headers && o.headers.Accept]); return typeof withFetch === "function" ? withFetch() : Promise.resolve({ ok: true }); };
    vm.runInNewContext(fs.readFileSync(path.join(web, "js/early.js"), "utf8"), ctx);
    return { calls: calls, has: !!ctx.rfMapCfg, picking: ctx.document.documentElement.className, cfg: ctx.rfMapCfg };
}
var e = early(true);
eq("지도 설정을 한 번 미리 물음(hike.js 의 getJson 과 같은 Accept)", e.calls, [["api/map-config", "application/json"]]);
eq("답은 window.rfMapCfg", e.has, true);
eq("코스 없이 열면 코스 고르기(예전 그대로)", e.picking, " picking");
eq("fetch 가 없는 브라우저는 그대로(hike.js 가 예전처럼 물음)", early(false).has, false);

// 2026-11-02 점검: 위 가짜 fetch 답은 .json 이 없어 hike.js 가 실제로 읽는 길(readJson)을 돌려 보지 않았음 - hike.js 의 readJson 과 기본 지형 대체를 그대로 씀
var hikeJs = fs.readFileSync(path.join(web, "js/hike.js"), "utf8");
var rj = /\n    function readJson\(r\) \{[\s\S]*?\n    \}\n/.exec(hikeJs);
assert(rj, "hike.js 에서 readJson 을 찾지 못함");
assert(hikeJs.indexOf("(window.rfMapCfg ? window.rfMapCfg.then(readJson) : getJson(\"api/map-config\")).catch(function () {") >= 0, "hike.js 가 미리 물은 답을 readJson 으로 읽음");
var readJson = vm.runInNewContext("(function () {" + rj[0] + " return readJson; })()", {});
/** hike.js 와 같은 길: 미리 물은 답 → readJson → 못 읽으면 기본 지형. → demUrl */
function mapCfg(answer) {
    return early(answer).cfg.then(readJson).catch(function () { return { demUrl: "DEFAULT" }; }).then(function (j) { return j.demUrl; });
}
function res(ok, status, body) { return function () { return Promise.resolve({ ok: ok, status: status, json: function () { return typeof body === "string" ? Promise.reject(new SyntaxError(body)) : Promise.resolve(body); } }); }; }
Promise.all([
    mapCfg(res(true, 200, { success: true, demUrl: "https://dem/{z}/{x}/{y}.png", vworldKey: null })),
    mapCfg(res(false, 500, { success: false, message: "서버 오류" })),
    mapCfg(res(false, 502, "<html>프록시</html>")),
    mapCfg(function () { return Promise.reject(new TypeError("Failed to fetch")); })
]).then(function (r) {
    eq("readJson - 200 이면 서버 설정", r[0], "https://dem/{z}/{x}/{y}.png");
    eq("readJson - 500 이면 기본 지형", r[1], "DEFAULT");
    eq("readJson - JSON 이 아닌 답(프록시 HTML)도 기본 지형", r[2], "DEFAULT");
    eq("fetch 거부(신호 없음)도 기본 지형", r[3], "DEFAULT");
    console.log("OK " + n);
}).catch(function (e) { console.error(e); process.exit(1); });
