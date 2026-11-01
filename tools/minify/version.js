/*
 * war 의 js · css 주소에 내용 판 붙이기(2026-11-01 점검 - html · js · css 가 no-cache 라 화면을 열 때마다 파일 20여 개를 서버에 304 로 물었음).
 * minify.js 가 줄인 뒤 부름. 바깥 도구 없이 돎(esbuild 가 없어도 판은 붙임) - 시험: node src/test/js/version.test.js
 * - war 임시 폴더의 js/*.js · css/*.css 내용 해시(앞 10자) → 그 폴더 *.html 의 src="js/x.js" · href="css/x.css"(../ 도)에 ?v=해시
 * - WEB-INF/asset-versions.json 에 같은 표(밖에서 못 읽음) - 서버가 만드는 산 페이지(AssetVersion.of)와 NoStaleFilter(지금 판이면 1년 캐시)가 읽음
 * - 고친 html 의 파일 시각은 그 html 과 그것이 부르는 js · css 중 가장 늦은 시각 - 톰캣 ETag(길이-시각)가 js 만 바뀌어도 달라져야 손님이 새 html 을 받음
 */
"use strict";
var fs = require("fs"), path = require("path"), crypto = require("crypto");

var REF = /(\b(?:src|href)\s*=\s*["'])((?:\.\.?\/)*)((?:js|css)\/[\w.-]+\.(?:js|css))(?=["'])/g;

/** 파일 내용 → 판(sha256 앞 10자). */
function hashOf(buf) {
    return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
}

/** html 글 · 판 표({"js/x.js": "해시"}) → {text, used:[판을 붙인 파일]}. 표에 없는 파일 · 이미 ? 가 붙은 주소는 그대로. */
function rewrite(html, versions) {
    var used = [];
    var text = html.replace(REF, function (all, pre, up, file) {
        if (!Object.prototype.hasOwnProperty.call(versions, file)) return all;
        if (used.indexOf(file) < 0) used.push(file);
        return pre + up + file + "?v=" + versions[file];
    });
    return { text: text, used: used };
}

/** war 임시 폴더 → 판을 붙이고 표를 씀. {files: 판 붙인 js · css 수, pages: 고친 html 수}. */
function run(root) {
    var versions = {};
    ["js", "css"].forEach(function (d) {
        var dir = path.join(root, d);
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).sort().forEach(function (f) {
            if (new RegExp("\\." + d + "$").test(f)) versions[d + "/" + f] = hashOf(fs.readFileSync(path.join(dir, f)));
        });
    });
    var pages = 0;
    fs.readdirSync(root).forEach(function (f) {
        if (!/\.html$/.test(f)) return;
        var file = path.join(root, f), src = fs.readFileSync(file, "utf8"), r = rewrite(src, versions);
        if (r.text === src) return;
        var st = fs.statSync(file), last = st.mtime;
        r.used.forEach(function (u) { var m = fs.statSync(path.join(root, u)).mtime; if (m > last) last = m; });
        fs.writeFileSync(file, r.text);
        fs.utimesSync(file, st.atime, last);
        pages++;
    });
    fs.mkdirSync(path.join(root, "WEB-INF"), { recursive: true });
    fs.writeFileSync(path.join(root, "WEB-INF", "asset-versions.json"), JSON.stringify(versions, null, 1));
    return { files: Object.keys(versions).length, pages: pages };
}

module.exports = { hashOf: hashOf, rewrite: rewrite, run: run };
