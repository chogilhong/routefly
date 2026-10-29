/*
 * war 에 넣을 js · css 줄이기(2026-10-28 홍TV님 "작업해" - 점검: 산속 약한 신호에서 첫 화면 10초 중 대부분이 파일 받는 시간).
 * 사용: node tools/minify/minify.js <war-stage 폴더>   (.claude/build-war.ps1 이 부름)
 * - 그 폴더의 js/*.js · css/*.css · sw.js 만, 제자리에서 줄임. vendor/(maplibre · qrcode - 이미 줄인 것) · data/ 는 손대지 않음.
 * - 원본(src/main/webapp)과 시험은 그대로 - 시험은 원본 글을 읽음.
 * - 스크립트는 모듈이 아니라 그대로 전역(window.RF · RFParty 등)을 씀: esbuild transform(묶지 않음)은 맨 바깥 이름을 바꾸지 않음.
 * - 하나라도 실패하면 그 파일은 원본 그대로 두고 끝에 알림(war 는 그대로 쓸 수 있음).
 */
"use strict";
var fs = require("fs"), path = require("path");
var esbuild;
try { esbuild = require("esbuild"); } catch (e) { console.log("MINIFY-SKIP esbuild 없음 - tools/minify 에서 npm ci 한 번"); process.exit(0); }
var root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "js"))) { console.log("MINIFY-FAIL 폴더가 이상합니다: " + root); process.exit(2); }
var files = [];
["js", "css"].forEach(function (d) {
    fs.readdirSync(path.join(root, d)).forEach(function (f) { if (/\.(js|css)$/.test(f)) files.push(path.join(root, d, f)); });
});
if (fs.existsSync(path.join(root, "sw.js"))) files.push(path.join(root, "sw.js"));
var before = 0, after = 0, bad = [];
files.forEach(function (f) {
    var src = fs.readFileSync(f, "utf8");
    try {
        var out = esbuild.transformSync(src, { loader: f.endsWith(".css") ? "css" : "js", minify: true, target: f.endsWith(".css") ? "chrome80" : "es2017", charset: "utf8", legalComments: "none" }).code;
        if (!out || out.length > src.length) return;
        var st = fs.statSync(f);
        fs.writeFileSync(f, out);
        fs.utimesSync(f, st.atime, st.mtime);   // 원래 파일 시각 그대로 - 톰캣 ETag(길이-시각)가 안 바뀐 파일은 같아 304(2026-10-29 점검: 배포마다 손님이 js · css 를 모두 다시 받았음)
        before += Buffer.byteLength(src); after += Buffer.byteLength(out);
    } catch (e) {
        bad.push(path.basename(f) + ": " + String(e.message || e).split("\n")[0]);
    }
});
console.log("MINIFY-OK " + files.length + " 파일 " + Math.round(before / 1024) + "KB → " + Math.round(after / 1024) + "KB" + (bad.length ? " / 원본 그대로: " + bad.join(" · ") : ""));
