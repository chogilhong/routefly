/*
 * war 의 js · css 주소 판 붙이기(tools/minify/version.js, 2026-11-01) - 임시 폴더에서 돌려 봄. AssetVersionTest 가 부름(node 가 없으면 건너뜀).
 * 사용: node src/test/js/version.test.js
 */
"use strict";
var fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
var version = require(path.join(__dirname, "../../../tools/minify/version.js"));
var n = 0;
function eq(name, a, b) { assert.deepStrictEqual(a, b, name); n++; }

var V = { "js/a.js": "1111111111", "css/b.css": "2222222222" };
eq("rewrite - src · href · ../ · 작은따옴표, 표에 없는 파일 · vendor · 이미 ? 붙은 것은 그대로",
    version.rewrite('<script src="js/a.js"></script><link rel="stylesheet" href="../css/b.css"><script src=\'./js/a.js\'></script>'
        + '<script src="js/c.js"></script><script src="vendor/x/js/a.js"></script><script src="js/a.js?x=1"></script><a href="js/a.json">', V).text,
    '<script src="js/a.js?v=1111111111"></script><link rel="stylesheet" href="../css/b.css?v=2222222222"><script src=\'./js/a.js?v=1111111111\'></script>'
        + '<script src="js/c.js"></script><script src="vendor/x/js/a.js"></script><script src="js/a.js?x=1"></script><a href="js/a.json">');
eq("rewrite - 붙인 파일 목록", version.rewrite('<script src="js/a.js"></script><script src="js/a.js"></script>', V).used, ["js/a.js"]);
eq("hashOf - 10자 · 내용이 같으면 같음", [version.hashOf("x").length, version.hashOf("x") === version.hashOf(Buffer.from("x")), version.hashOf("x") === version.hashOf("y")], [10, true, false]);

eq("stampSw - 미리 담을 js · css 에만 판(2026-11-03 P2), 표에 없는 · html · ? 붙은 것은 그대로",
    version.stampSw('var F=["hike.html","js/a.js",\'css/b.css\',"js/c.js","js/a.js?v=1","vendor/x/js/a.js"];', V),
    'var F=["hike.html","js/a.js?v=1111111111",\'css/b.css?v=2222222222\',"js/c.js","js/a.js?v=1","vendor/x/js/a.js"];');
var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-version-"));
try {
    fs.mkdirSync(path.join(dir, "js")); fs.mkdirSync(path.join(dir, "css"));
    fs.writeFileSync(path.join(dir, "js", "a.js"), "var a = 1;");
    fs.writeFileSync(path.join(dir, "css", "b.css"), "b{}");
    fs.writeFileSync(path.join(dir, "p.html"), '<link href="css/b.css"><script src="js/a.js"></script>');
    fs.writeFileSync(path.join(dir, "q.html"), "<p>그대로</p>");
    fs.writeFileSync(path.join(dir, "sw.js"), 'var SHELL_FILES = ["hike.html", "js/a.js", "css/b.css"];');
    var old = new Date(2026, 0, 1), late = new Date(2026, 5, 1);
    fs.utimesSync(path.join(dir, "p.html"), old, old);
    fs.utimesSync(path.join(dir, "q.html"), old, old);
    fs.utimesSync(path.join(dir, "css", "b.css"), old, old);
    fs.utimesSync(path.join(dir, "js", "a.js"), late, late);
    var r = version.run(dir), ha = version.hashOf("var a = 1;"), hb = version.hashOf("b{}");
    eq("run - 판 수 · 고친 html 수", r, { files: 2, pages: 1 });
    eq("run - html 주소", fs.readFileSync(path.join(dir, "p.html"), "utf8"), '<link href="css/b.css?v=' + hb + '"><script src="js/a.js?v=' + ha + '"></script>');
    eq("run - 표(WEB-INF)", JSON.parse(fs.readFileSync(path.join(dir, "WEB-INF", "asset-versions.json"), "utf8")), { "js/a.js": ha, "css/b.css": hb });
    eq("run - 고친 html 시각은 부르는 js 의 늦은 시각(ETag 가 바뀌게)", fs.statSync(path.join(dir, "p.html")).mtime.getTime(), late.getTime());
    eq("run - 안 고친 html 은 시각 그대로", [fs.readFileSync(path.join(dir, "q.html"), "utf8"), fs.statSync(path.join(dir, "q.html")).mtime.getTime()], ["<p>그대로</p>", old.getTime()]);
    eq("run - sw.js 미리 담기에도 같은 판", fs.readFileSync(path.join(dir, "sw.js"), "utf8"), 'var SHELL_FILES = ["hike.html", "js/a.js?v=' + ha + '", "css/b.css?v=' + hb + '"];');
    eq("run - 두 번 돌려도 같음(이미 ? 붙음)", [version.run(dir).pages, fs.readFileSync(path.join(dir, "sw.js"), "utf8").split("?v=").length], [0, 3]);
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}
console.log("OK " + n);
