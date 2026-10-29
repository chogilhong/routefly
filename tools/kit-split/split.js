/*
 * 화면별 작은 course-kit 만들기(2026-10-30 홍TV님 "9번 해줘" - 점검 4차: course-kit.js 가 커서 산 페이지 · 산악회 방이 안 쓰는 것까지 받음).
 * course-kit.js(원본 - 늘 이것을 고침)에서 그 화면 스크립트들이 쓰는 RF.이름 과, 그 이름이 안에서 부르는 것만 남겨 js/kit-<이름>.js 로 씀.
 *
 * 사용: node tools/kit-split/split.js          → 만든 파일을 새로 씀(course-kit.js 를 고친 뒤 한 번)
 *       node tools/kit-split/split.js --check  → 지금 파일이 원본과 맞는지만(틀리면 끝 번호 1) - node 시험(course-kit.test.js)도 같은 것을 봄
 * 원본은 맨 바깥 함수 안에서 4칸 들여 쓴 줄(function · var · if …)이 문장 하나의 시작이라는 모양을 씀. 바깥 도구 없이 돎.
 */
"use strict";
var fs = require("fs"), path = require("path");
var WEB = path.join(__dirname, "../../src/main/webapp");

/** 만들 파일과 그 화면에서 RF 를 쓰는 파일들(웹앱 기준, .java 는 그 화면을 만드는 서버 코드). */
var BUNDLES = [
    { out: "js/kit-m.js", users: ["js/mountain.js", "js/mountain-en.js", "js/seen.js", "../java/com/gh/routefly/web/MountainServlet.java", "../java/com/gh/routefly/web/MountainEn.java"] },
    { out: "js/kit-party.js", users: ["party.html", "js/no-kakao.js", "js/rf-dialog.js", "js/party-kit.js", "js/party.js", "js/seen.js", "js/sw-reg.js"] },
    { out: "js/kit-tools.js", users: ["tools.html", "js/tools.js", "js/sw-reg.js", "js/seen.js"] },
    { out: "js/kit-anbu.js", users: ["anbu.html", "js/anbu.js", "js/sw-reg.js", "js/seen.js"] }
];

var HEAD = "/* 만든 파일 - 고치지 마세요. course-kit.js 를 고친 뒤 node tools/kit-split/split.js (이 화면이 쓰는 것만 남긴 course-kit) */\n";

/** 원본 → {pro, chunks:[{text, names[], code}], exportText, epi}. */
function parse(src) {
    var lines = src.replace(/\r\n/g, "\n").split("\n");
    var us = lines.indexOf("    \"use strict\";"), ex = -1;
    for (var i = lines.length - 1; i >= 0; i--) if (/^    global\.RF = \{\s*$/.test(lines[i])) { ex = i; break; }
    if (us < 0 || ex < 0) throw new Error("course-kit.js 모양이 다름(use strict · global.RF = { 를 못 찾음)");
    var end = -1;
    for (var j = ex + 1; j < lines.length; j++) if (/^    \};\s*$/.test(lines[j])) { end = j; break; }
    var raw = [], cur = [];
    var isComment = function (l) { var t = l.trim(); return t === "" || /^(\/\/|\/\*|\*)/.test(t); };
    for (var k = us + 1; k < ex; k++) {
        var l = lines[k];
        if (/^    [^\s})\]]/.test(l) && cur.length) { raw.push(cur); cur = []; }
        cur.push(l);
    }
    if (cur.length) raw.push(cur);
    var chunks = [], pend = [];
    raw.forEach(function (c) {
        if (c.every(isComment)) { pend = pend.concat(c); return; }
        var text = pend.concat(c).join("\n"), first = c.filter(function (l) { return !isComment(l); })[0] || "", names = [], m;
        if ((m = /^    function ([A-Za-z_$][\w$]*)\s*\(/.exec(first))) names.push(m[1]);
        else if (/^    var /.test(first)) { var re = /(?:^    var |,\s*)([A-Za-z_$][\w$]*)\s*(?:=(?!=)|;|,)/g; while ((m = re.exec(first))) names.push(m[1]); }
        chunks.push({ text: text, names: names, code: names.length === 0 });
        pend = [];
    });
    if (pend.length) chunks.push({ text: pend.join("\n"), names: [], code: false, tail: true });
    return { pro: lines.slice(0, us + 1).join("\n"), chunks: chunks, exportText: lines.slice(ex + 1, end).join("\n"), epi: lines.slice(end + 1).join("\n") };
}

/** "a: a, b: function (s) { … }, …" → [{key, val}] (괄호 · 따옴표 안의 쉼표는 나누지 않음). */
function entries(t) {
    var out = [], depth = 0, q = null, s = 0;
    for (var i = 0; i <= t.length; i++) {
        var c = t[i];
        if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
        if (c === "\"" || c === "'") q = c;
        else if ("([{".indexOf(c) >= 0) depth++;
        else if (")]}".indexOf(c) >= 0) depth--;
        else if ((c === "," && depth === 0) || i === t.length) {
            var e = t.slice(s, i).trim();
            if (e) { var m = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/.exec(e); if (!m) throw new Error("내보내기 칸을 못 읽음: " + e.slice(0, 40)); out.push({ key: m[1], val: m[2] }); }
            s = i + 1;
        }
    }
    return out;
}

function words(t) { return t.match(/[A-Za-z_$][\w$]*/g) || []; }

/** 화면 파일 글들 → 그 화면이 쓰는 RF 이름들. */
function usedNames(texts) {
    var s = Object.create(null);
    texts.forEach(function (t) {
        var re = /\bRF\s*\.\s*([A-Za-z_$][\w$]*)|\bRF\s*\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g, m;
        while ((m = re.exec(t))) s[m[1] || m[2]] = 1;
    });
    return s;
}

/** 원본 글 · 화면 파일 글들 → 작은 파일 글. */
function build(src, userTexts) {
    var p = parse(src), used = usedNames(userTexts), ents = entries(p.exportText).filter(function (e) { return used[e.key]; });
    var byName = Object.create(null);
    p.chunks.forEach(function (c, i) { c.names.forEach(function (n) { byName[n] = i; }); });
    var keep = Object.create(null), q = [];
    var need = function (t) { words(t).forEach(function (w) { if (byName[w] != null && !keep[byName[w]]) { keep[byName[w]] = 1; q.push(byName[w]); } }); };
    p.chunks.forEach(function (c, i) { if (c.code) { keep[i] = 1; q.push(i); } });   // 불러올 때 바로 도는 문장(if …)은 늘
    ents.forEach(function (e) { need(e.val); });
    for (var i = 0; i < q.length; i++) need(p.chunks[q[i]].text);
    var body = p.chunks.filter(function (c, i) { return keep[i] || c.tail; }).map(function (c) { return c.text; });
    return HEAD + p.pro + "\n" + body.join("\n") + "\n    global.RF = {\n        " + ents.map(function (e) { return e.key + ": " + e.val; }).join(",\n        ") + "\n    };\n" + p.epi;
}

function read(f) { return fs.readFileSync(path.join(WEB, f), "utf8"); }

/** 화면마다 [{out, text}] - 지금 원본으로. */
function all() {
    var src = read("js/course-kit.js");
    return BUNDLES.map(function (b) { return { out: b.out, users: b.users, text: build(src, b.users.map(read)) }; });
}

module.exports = { parse: parse, entries: entries, usedNames: usedNames, build: build, all: all, BUNDLES: BUNDLES, WEB: WEB };

if (require.main === module) {
    var check = process.argv.indexOf("--check") > 0, bad = 0;
    all().forEach(function (b) {
        var f = path.join(WEB, b.out), now = fs.existsSync(f) ? fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n") : null;
        if (check) { if (now !== b.text) { console.log("원본과 다름: " + b.out); bad++; } return; }
        if (now !== b.text) fs.writeFileSync(f, b.text);
        console.log(b.out + " " + Math.round(Buffer.byteLength(b.text) / 1024) + "KB");
    });
    console.log("course-kit.js " + Math.round(fs.statSync(path.join(WEB, "js/course-kit.js")).size / 1024) + "KB");
    process.exit(bad ? 1 : 0);
}
