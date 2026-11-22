// early.js - 앱을 처음 열 때 받은 GPX 가 있으면 코스 모음(m/)으로 넘기지 않음(2026-11-22 홍TV님 폰: 카톡 .gpx → 코스 모음이 뜨고 "따라가기" 를 눌러야 열렸음)
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "../../main/webapp/js/early.js"), "utf8");
var fail = 0, n = 0;
function eq(name, got, want) { n++; if (got !== want) { fail++; console.log("FAIL " + name + ": " + got + " (기대 " + want + ")"); } }
function store() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } }; }
/** plugin: undefined(옛 앱) 또는 take 가 돌려줄 값. got: hike.js 가 먼저 가져갔나. 돌려줌: { to: 넘긴 주소, win } */
function run(plugin, got) {
    var res = { to: null }, win = { rfGpxGot: got }, cls = { className: "" };
    var cap = { Plugins: plugin === undefined ? {} : { RfGpx: { take: function () { return Promise.resolve(plugin); } } } };
    win.Capacitor = cap;
    win.fetch = function (u) { return u === "sw.js" ? Promise.resolve({ ok: true }) : new Promise(function () {}); };
    res.win = win; res.root = cls;
    new Function("window", "Capacitor", "document", "sessionStorage", "localStorage", "location", "navigator", "fetch", "setTimeout", "clearTimeout", src)(
        win, cap, { documentElement: cls }, store(), store(), { hash: "", search: "", replace: function (u) { res.to = u; } }, { onLine: true },
        win.fetch, function () { return 0; }, function () {});
    return res;
}
var a = run({ name: "a.gpx", text: "<gpx/>" }, false), b = run({}, false), c = run(undefined, false), d = run({}, true), e = run({ error: "GPX 파일이 아닙니다." }, false);
setTimeout(function () {
    eq("받은 GPX 가 있으면 넘기지 않음", a.to, null);
    eq("가져간 GPX 를 hike.js 에 넘김", a.win.rfGpxEarly && a.win.rfGpxEarly.text, "<gpx/>");
    eq("가림(rfwait)을 풂", / rfwait/.test(a.root.className), false);
    eq("받은 것이 없으면 코스 모음", b.to, "m/");
    eq("옛 앱(플러그인 없음)도 코스 모음", c.to, "m/");
    eq("hike.js 가 먼저 가져갔으면 머묾", d.to, null);
    eq("GPX 가 아니라는 알림도 따라가기에서", e.to, null);
    console.log(fail ? "FAILED " + (n - fail) + "/" + n : "OK " + n + "/" + n);
    process.exit(fail ? 1 : 0);
}, 50);
