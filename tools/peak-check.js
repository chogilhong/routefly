/*
 * 100대 명산 정상 점검(2026-10-14 홍TV님 "가야산만 보지 말고 전체") - 확인용 스크립트, 화면 코드가 아님.
 *
 *   node tools/peak-check.js http://localhost:8080/routefly > target/peak-check.md
 *
 * data/mountains100.json 의 산마다 서버 api/courses?q=산이름 으로 코스를 받아, 도장 · 완주 화면과 같은 규칙(course-kit.js
 * peakCourses · peakGapM - 코스 끝 · 처음이 정상 2km 안)으로 고른 코스의 끝이 정상에서 얼마나 떨어졌는지 적습니다.
 * 150m(도장 반경) 안에 닿는 코스가 하나도 없는 산 = 정상 자리가 코스와 어긋난 산(가야산 칠불봉 · 상왕봉처럼)일 수 있음.
 * 서버(DB)를 읽기만 하고 아무것도 쓰지 않습니다. 키 · 비밀번호는 쓰지 않습니다.
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const base = (process.argv[2] || "http://localhost:8080/routefly").replace(/\/$/, "");
const web = path.join(__dirname, "..", "src", "main", "webapp");
const sandbox = { window: {}, console, navigator: {}, document: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(web, "js", "course-kit.js"), "utf8"), sandbox);
const RF = sandbox.window.RF;
const GAP_MS = 700;   // 0.15초 간격은 98건 중 46건이 429 였음(2026-10-14 PC)
const peaks = JSON.parse(fs.readFileSync(path.join(web, "data", "mountains100.json"), "utf8")).peaks;

function endName(name) {
    const parts = String(name || "").split(" → ");
    return parts.length > 1 ? parts[parts.length - 1] : String(name || "");
}

(async () => {
    const rows = [];
    for (const k of peaks) {
        let courses = [];
        try {
            const r = await fetch(base + "/api/courses?q=" + encodeURIComponent(k.name));
            // 서버 속도 제한(api/courses 분당 20번 남짓 - RateLimiter(20, 2))에 걸린 429 나 courses 없는 응답은 "코스 없음" 이 아니라 오류로 셈(2026-10-14 PC)
            if (!r.ok) throw new Error("HTTP " + r.status);
            const j = await r.json();
            if (!j || !Array.isArray(j.courses)) throw new Error("courses 없음");
            courses = j.courses;
        } catch (e) {
            rows.push({ k, err: String(e.message || e) });
            await new Promise(ok => setTimeout(ok, GAP_MS));
            continue;
        }
        const cs = RF.peakCourses(courses, k, 2000).map(c => {
            const gE = c.end_lat != null ? RF.peakGapM(k, +c.end_lat, +c.end_lon) : Infinity;
            const gS = c.start_lat != null ? RF.peakGapM(k, +c.start_lat, +c.start_lon) : Infinity;
            const atEnd = gE <= gS;
            return { c, gap: Math.min(gE, gS), lat: atEnd ? c.end_lat : c.start_lat, lon: atEnd ? c.end_lon : c.start_lon };
        });
        rows.push({ k, n: cs.length, in150: cs.filter(x => x.gap <= 150).length, in300: cs.filter(x => x.gap <= 300).length, best: cs[0] });
        await new Promise(ok => setTimeout(ok, GAP_MS));   // 서버 속도 제한에 안 걸리게
    }
    const bad = rows.filter(r => !r.err && r.in150 === 0);
    const out = [];
    out.push("# 100대 명산 정상 점검 (" + new Date().toISOString().slice(0, 10) + ", " + base + ")");
    out.push("");
    out.push("산 " + rows.length + " · 150m 안 코스 없음 " + bad.length + " · 오류 " + rows.filter(r => r.err).length);
    out.push("");
    out.push("## 150m(도장 반경) 안에 닿는 코스가 없는 산");
    out.push("");
    out.push("| 산 | 정상(자료) | 2km 안 코스 | 가장 가까운 코스 끝까지 | 그 코스 | 그 끝 좌표 |");
    out.push("|---|---|---|---|---|---|");
    bad.forEach(r => {
        const b = r.best;
        out.push("| " + r.k.name + " | " + (r.k.summit || "-") + " " + r.k.lat + "," + r.k.lon + " | " + r.n + " | "
            + (b ? Math.round(b.gap) + "m" : "-") + " | " + (b ? b.c.course_id + " " + b.c.name : "-") + " | "
            + (b ? (+b.lat).toFixed(6) + "," + (+b.lon).toFixed(6) + " (" + endName(b.c.name) + ")" : "-") + " |");
    });
    out.push("");
    out.push("## 전체");
    out.push("");
    out.push("| 산 | 정상 | 2km 안 | 150m 안 | 300m 안 | 가장 가까운 끝 |");
    out.push("|---|---|---|---|---|---|");
    rows.forEach(r => {
        if (r.err) { out.push("| " + r.k.name + " | 오류 " + r.err + " | | | | |"); return; }
        out.push("| " + r.k.name + " | " + (r.k.summit || "-") + " | " + r.n + " | " + r.in150 + " | " + r.in300 + " | "
            + (r.best ? Math.round(r.best.gap) + "m " + endName(r.best.c.name) : "-") + " |");
    });
    console.log(out.join("\n"));
})();
