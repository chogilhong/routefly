/*
 * 아고다 도시 번호 채우기(2026-10-29 홍TV님) - src/main/webapp/data/agoda-cities.json 의 시 · 군에 아고다 city 번호를 넣음.
 * 번호는 아고다(로그인 없이) 검색 칸에 q 를 넣고 "도시"를 골랐을 때 주소창의 city= 숫자. 지어내지 않음 - 못 찾으면 비워 둠.
 *
 * 사용: node tools/agoda-cities/fill.js            → 아직 빈 곳(이름 · 검색어) 목록
 *       node tools/agoda-cities/fill.js 속초시=123 "고성군(강원)"=456 …   → 채우고 저장(숫자만, 한 줄에 한 곳 그대로)
 */
"use strict";
var fs = require("fs"), path = require("path");
var file = path.join(__dirname, "../../src/main/webapp/data/agoda-cities.json");
var text = fs.readFileSync(file, "utf8"), doc = JSON.parse(text), bad = 0, set = 0;
process.argv.slice(2).forEach(function (a) {
    var m = /^(.+)=(\d{1,9})$/.exec(a);
    var c = m && doc.cities.filter(function (x) { return x.name === m[1]; })[0];
    if (!c) { console.log("모르는 이름이거나 번호가 숫자가 아님: " + a); bad++; return; }
    c.id = +m[2]; set++;
});
if (set) {
    var lines = ["{", "\"_note\": " + JSON.stringify(doc._note) + ",", "\"cities\": ["];
    doc.cities.forEach(function (c, i) { lines.push(JSON.stringify(c) + (i < doc.cities.length - 1 ? "," : "")); });
    lines.push("]", "}");
    fs.writeFileSync(file, lines.join("\n") + "\n");
    console.log(set + "곳 채움");
}
var left = doc.cities.filter(function (c) { return c.id == null; });
console.log("채운 곳 " + (doc.cities.length - left.length) + " / " + doc.cities.length + (left.length ? " - 빈 곳: " + left.map(function (c) { return c.name + "(" + c.q + ")"; }).join(", ") : ""));
process.exit(bad ? 1 : 0);
