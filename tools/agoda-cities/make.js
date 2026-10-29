/*
 * 아고다 도시 번호표 만들기(2026-10-29 홍TV님 - 근처 숙소 찾기의 🏨 아고다가 그 지역 결과로 열리게).
 * 아고다 파트너스 "도구 → 숙소 데이터 파일" 에서 홍TV님이 받은 CSV(압축을 푼 것)에서 한국(KR) 숙소만 읽어,
 * 도시 번호마다 이름 · 숙소 수 · 숙소 좌표의 가운데를 data/agoda-cities.json 으로 씀. 파트너 번호 · 숙소 이름 · 주소는 넣지 않음.
 *
 * 사용: node tools/agoda-cities/make.js <받은 CSV 파일> [--head] [--out=다른 곳.json]
 *   --head : 머리 줄(칸 이름)과 첫 줄만 보여 주고 끝(칸 이름이 다르면 아래 COLS 를 고침)
 * 큰 파일도 한 줄씩 읽음(메모리에 다 올리지 않음).
 */
"use strict";
var fs = require("fs"), path = require("path"), readline = require("readline");
var file = process.argv[2], headOnly = process.argv.indexOf("--head") > 0;
if (!file || !fs.existsSync(file)) { console.log("파일을 찾지 못했습니다: " + file); process.exit(2); }
// 칸 이름 후보(소문자로 견줌) - 아고다 파일마다 조금씩 다를 수 있어 여럿
var COLS = {
    country: ["countryisocode", "country_iso_code", "countrycode", "country_code", "country_iso", "countryiso"],
    cityId: ["city_id", "cityid"],
    city: ["city", "city_name", "cityname"],
    lat: ["latitude", "lat"],
    lon: ["longitude", "lon", "lng"]
};
function split(line, sep) {   // 따옴표 안의 구분자는 칸을 나누지 않음
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === "\"") { if (q && line[i + 1] === "\"") { cur += "\""; i++; } else q = !q; }
        else if (c === sep && !q) { out.push(cur); cur = ""; }
        else cur += c;
    }
    out.push(cur);
    return out;
}
var rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
var head = null, sep = ",", idx = {}, cities = {}, rows = 0, kr = 0;
rl.on("line", function (line) {
    if (!head) {
        line = line.replace(/^﻿/, "");
        sep = line.split("\t").length > line.split(",").length ? "\t" : ",";
        head = split(line, sep).map(function (h) { return h.trim().toLowerCase(); });
        Object.keys(COLS).forEach(function (k) { idx[k] = head.findIndex(function (h) { return COLS[k].indexOf(h) >= 0; }); });
        if (headOnly) { console.log("구분자: " + (sep === "\t" ? "탭" : "쉼표") + "\n칸 이름: " + head.join(" | ") + "\n찾은 칸: " + JSON.stringify(idx)); }
        var miss = Object.keys(idx).filter(function (k) { return idx[k] < 0; });
        if (miss.length && !headOnly) { console.log("칸을 찾지 못했습니다: " + miss.join(", ") + " - --head 로 칸 이름을 보고 COLS 를 고쳐 주세요."); process.exit(3); }
        return;
    }
    if (headOnly) { console.log("첫 줄 칸 수: " + split(line, sep).length); rl.close(); return; }
    rows++;
    var f = split(line, sep);
    var c = String(f[idx.country] || "").trim().toUpperCase();
    if (c !== "KR" && c !== "KOR" && c !== "SOUTH KOREA") return;
    var id = String(f[idx.cityId] || "").trim(), lat = +f[idx.lat], lon = +f[idx.lon];
    if (!/^\d{1,9}$/.test(id) || !(lat >= 33 && lat <= 39 && lon >= 124 && lon <= 132)) return;
    kr++;
    var x = cities[id] || (cities[id] = { name: String(f[idx.city] || "").trim().slice(0, 40), n: 0, la: 0, lo: 0 });
    x.n++; x.la += lat; x.lo += lon;
});
rl.on("close", function () {
    if (headOnly) return;
    var out = Object.keys(cities).map(function (id) {
        var x = cities[id];
        return { id: +id, name: x.name, n: x.n, lat: Math.round(x.la / x.n * 1e4) / 1e4, lon: Math.round(x.lo / x.n * 1e4) / 1e4 };
    }).sort(function (a, b) { return b.n - a.n; });
    var o = process.argv.filter(function (a) { return a.indexOf("--out=") === 0; })[0];
    var dest = o ? o.slice(6) : path.join(__dirname, "../../src/main/webapp/data/agoda-cities.json");
    fs.writeFileSync(dest, JSON.stringify({ source: "Agoda hotel data file (city id · name · hotel count · center of hotels)", made: new Date().toISOString().slice(0, 10), cities: out }) + "\n");
    console.log("AGODA-CITIES-OK 읽은 줄 " + rows + " · 한국 숙소 " + kr + " · 도시 " + out.length + " → " + dest);
});
