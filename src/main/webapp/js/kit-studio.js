/* 만든 파일 - 고치지 마세요. course-kit.js 를 고친 뒤 node tools/kit-split/split.js (이 화면이 쓰는 것만 남긴 course-kit) */
/*
 * routefly 공통 도구 - 비행 화면(app.js)과 산행 화면(hike.js)이 같이 씁니다.
 *   - 코스 위치 계산: at(진행 거리 → 위치 · 고도), grade(경사), snap(GPS 위치 → 코스 위 진행 거리 · 벗어난 거리)
 *   - 고도 그래프: 지점 이름(비스듬히) · km 눈금 · 지금 위치 점
 *   - 작은 평면 지도: 북쪽이 위, km 번호 · 지점 · 지금 위치
 * 코스 c = {lon[], lat[], ele[], dist[], total, pois[], course}
 */
(function (global) {
    "use strict";
    function num(n, digits) {
        if (n == null || !isFinite(n)) return "-";
        return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }
    function km(m) { return num(m / 1000, 2); }

    // ------------------------------------------------------------------ 화면 말(2026-10-17 홍TV님 - 따라가기 영어 1 · 2단계)
    // 따라가기(hike.js)가 RF.setLang("en") 을 부를 때만 영어 - 비행 화면 · 산 페이지(/m/ · /en/m/)는 이 값을 쓰지 않음(늘 그대로).
    var LANG = "ko";
    function setLang(l) {
        LANG = l === "en" ? "en" : "ko";
        // 종류 말(KINDS 는 같은 객체로 견주는 곳이 있어 안의 말만 바꿈)
        Object.keys(KINDS).forEach(function (k) {
            var o = KINDS[k];
            if (!o.ko) o.ko = { label: o.label, act: o.act, sos: o.sos };
            var w = LANG === "en" ? KINDS_EN[k] : o.ko;
            o.label = w.label; o.act = w.act; o.sos = w.sos;
        });
    }
    /** 지금 말로 고르기 - tr("출발", "Start"). */
    function tr(ko, en) { return LANG === "en" ? en : ko; }
    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 순수 함수 - 도장 인식 거리(m): GPS 오차 + 20m, 40m 보다 좁히지 않고 max(정상 150 · 인증센터 100)를 넘지 않음. 오차를 모르면 max.
     * 2026-10-16 홍TV님: 다른 도장 앱은 보통 30 ~ 40m(오차를 생각해 50 ~ 200m 까지 넓히기도) - 신호가 좋으면 정상에 가까이 가야 찍히게.
     */
    /**
     * 순수 함수 - 기록 점(track [위도, 경도, 시각, GPS 높이])의 오른 높이(m). GPS 높이는 흔들려서 step(기본 10m) 넘게 바뀐 것만 셈.
     * 2026-10-17 홍TV님 송산: 코스 밖(새 들머리)을 걸으면 코스 고도로 세는 오른 높이가 0m 였음 - 기록에는 이것과 큰 쪽을 남김.
     */
    function trackClimb(track, step) {
        step = step || 10;
        var up = 0, ref = null;
        (track || []).forEach(function (p) {
            var a = p && p[3];
            if (a == null || !isFinite(a)) return;
            if (ref == null) { ref = a; return; }
            if (a - ref >= step) { up += a - ref; ref = a; } else if (ref - a >= step) ref = a;
        });
        return Math.round(up);
    }

    // 2026-10-09 점검: 남이 준 파일이라 크기 · 지점 수에 한도(지점마다 모든 점을 훑어서, 지점이 아주 많으면 화면이 멈춤)
    var GPX_MAX_CHARS = 30 * 1024 * 1024, GPX_MAX_WPT = 1000;
    /**
     * 순수 함수 - GPX 글 → 길마다 {name, track:[[위도, 경도, 시각ms|null, 높이|null]]}(GPX 편집 studio.html, 2026-10-31 홍TV님).
     * trk 하나가 길 하나(조각 trkseg 는 이어 붙임), trk 가 없으면 rte. 점은 솎지 않음(편집용). 브라우저 없이도 돌게 정규식으로.
     */
    function gpxTracks(text) {
        var src = String(text || ""), out = [];
        if (src.length > GPX_MAX_CHARS) throw new Error("GPX 파일이 너무 큽니다(30MB 까지).");
        if (!/<gpx[\s>]/.test(src)) throw new Error("GPX 파일이 아닙니다.");
        var unesc = function (x) { return String(x).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim(); };
        function pts(block, tag) {
            var re = new RegExp("<" + tag + "\\b([^>]*?)(?:/>|>([\\s\\S]*?)</" + tag + ">)", "g"), m, a = [];
            while ((m = re.exec(block))) {
                var la = /\blat\s*=\s*["']([^"']+)["']/.exec(m[1]), lo = /\blon\s*=\s*["']([^"']+)["']/.exec(m[1]);
                var lat = la ? +la[1] : NaN, lon = lo ? +lo[1] : NaN;
                if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) continue;
                var body = m[2] || "", e = /<ele>\s*([^<]+)<\/ele>/.exec(body), t = /<time>\s*([^<]+)<\/time>/.exec(body);
                var ev = e ? +e[1] : NaN, tv = t ? Date.parse(t[1].trim()) : NaN;
                a.push([lat, lon, isFinite(tv) ? tv : null, isFinite(ev) ? ev : null]);
            }
            return a;
        }
        function nameOf(block) { var n = /<name>([\s\S]*?)<\/name>/.exec(block.replace(/<(trkseg|rtept|trkpt)\b[\s\S]*$/, "")); return n ? unesc(n[1]) : ""; }
        var re = /<trk\b[^>]*>([\s\S]*?)<\/trk>/g, m;
        while ((m = re.exec(src))) { var tr = pts(m[1], "trkpt"); if (tr.length >= 2) out.push({ name: nameOf(m[1]), track: tr }); }
        if (!out.length) { re = /<rte\b[^>]*>([\s\S]*?)<\/rte>/g; while ((m = re.exec(src))) { var rt = pts(m[1], "rtept"); if (rt.length >= 2) out.push({ name: nameOf(m[1]), track: rt }); } }
        if (!out.length) throw new Error("GPX 에 경로 점이 2개보다 적습니다(trk · rte).");
        var meta = /<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(src);
        out.forEach(function (x, i) { if (!x.name) x.name = (meta ? unesc(meta[1]) : "GPX") + (out.length > 1 ? " " + (i + 1) : ""); });
        return out;
    }

    /** 순수 함수 - 길 요약: 거리(m) · 오르막 · 내리막(10m 문턱, trackClimb) · 걸린 시간(ms, 시각이 있을 때) · 점 수. */
    function trackStats(track) {
        var t = track || [], d = 0;
        for (var i = 1; i < t.length; i++) d += distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]);
        var t0 = null, t1 = null;
        t.forEach(function (p) { if (p[2] != null) { if (t0 == null) t0 = p[2]; t1 = p[2]; } });
        return { dist: d, up: trackClimb(t), down: trackClimb(t.slice().reverse()), ms: t0 != null && t1 > t0 ? t1 - t0 : null, n: t.length,
            hasEle: t.some(function (p) { return p[3] != null; }) };
    }

    /** 순수 함수 - atM(m) 에서 둘로 나눔(나눈 점은 양쪽에 다). 한쪽이 점 2개가 안 되면 null. */
    function splitTrack(track, atM) {
        var t = track || [], d = 0, k = 0;
        for (var i = 1; i < t.length; i++) { d += distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]); if (d >= atM) { k = i; break; } }
        if (k < 1 || k > t.length - 2) return null;
        return [t.slice(0, k + 1), t.slice(k)];
    }

    /** 순수 함수 - 두 길 잇기(b 의 첫 점이 a 의 끝과 5m 안이면 겹친 점 하나 뺌). */
    function joinTracks(a, b) {
        var x = (a || []).slice(), y = b || [];
        if (x.length && y.length && distM(x[x.length - 1][0], x[x.length - 1][1], y[0][0], y[0][1]) < 5) y = y.slice(1);
        return x.concat(y);
    }

    /** 순수 함수 - 길 → GPX 1.1 글(이름 · 종류 · 점마다 높이 · 시각이 있으면). */
    function trackGpx(name, kind, track) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly studio" xmlns="http://www.topografix.com/GPX/1/1">\n'
            + "<trk><name>" + esc(name || "GPX") + "</name>" + (kind ? "<type>" + esc(kind) + "</type>" : "") + "<trkseg>\n"
            + (track || []).map(function (p) {
                return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + Math.round(p[3] * 10) / 10 + "</ele>" : "")
                    + (p[2] != null ? "<time>" + new Date(p[2]).toISOString() + "</time>" : "") + "</trkpt>";
            }).join("\n") + "\n</trkseg></trk>\n</gpx>\n";
    }

    /**
     * 순수 함수 - 기록 점들의 앞 · 뒤를 자름(코스로 올리기 전, 2026-10-31 홍TV님 "앱 안에서 자르는 기능 - 관리자만").
     * cut0 · cut1 = 앞 · 뒤에서 뺄 거리(m). 남는 점 · 남는 길이 · 자른 자리(앞 · 뒤 점 번호). 남는 점이 2개 안 되면 track 은 빈 배열.
     */
    function trimTrack(track, cut0, cut1) {
        var t = track || [], cum = [0];
        for (var i = 1; i < t.length; i++) cum.push(cum[i - 1] + distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
        var total = cum.length ? cum[cum.length - 1] : 0, a = 0, b = t.length - 1;
        while (a < t.length && cum[a] < (cut0 || 0)) a++;
        while (b >= 0 && total - cum[b] < (cut1 || 0)) b--;
        var ok = b - a >= 1;
        return { track: ok ? t.slice(a, b + 1) : [], from: a, to: b, total: total, kept: ok ? cum[b] - cum[a] : 0 };
    }

    /** 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 걷기는 오르막 600m/h 를 더합니다(네이스미스). */
    var KINDS = {
        hike: { label: "등산", kmh: 4, climb: 600, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 4, climb: 600, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
    };

    var KINDS_EN = { hike: { label: "Hiking", act: "Hike", sos: "hiking" }, walk: { label: "Walking", act: "Walk", sos: "walking" },
                     bike: { label: "Cycling", act: "Ride", sos: "cycling" }, trek: { label: "Hiking · Walking", act: "Hike", sos: "hiking" } };

    /**
     * 글자 크기(2026-10-14 홍TV님: 핸드폰에서 글씨가 작음) - 100 → 120 → 140%, 이 기기에 저장(rf-text).
     * 지도 · 그래프는 그대로 두고 글 칸(안내 칸 · 아래 창 · 목록 · 안내 화면)만 CSS zoom 으로 키웁니다(<html class="rfz"> + --rfz).
     */
    var TEXT_KEY = "rf-text", TEXT_STEPS = [1, 1.2, 1.4];
    function textScale() {
        try { var v = +localStorage.getItem(TEXT_KEY); return TEXT_STEPS.indexOf(v) >= 0 ? v : 1; } catch (e) { return 1; }
    }
    function applyTextScale(v) {
        if (!global.document || !document.documentElement) return;
        document.documentElement.style.setProperty("--rfz", String(v));
        document.documentElement.classList.toggle("rfz", v !== 1);
        // 단추 글은 짧게(가 · 가+ · 가++) - "가 140%" 는 위 줄 제목을 밀어 잘랐음(2026-10-14 PC: 다도해해상 탐방 안내도). 몇 %인지는 title 로
        var enPage = document.documentElement.lang === "en";   // /en/m/ 은 setLang 을 안 불러도 영어(2026-10-18 PC: "가/가++" 로 보였음)
        var t = textLabel(v, enPage || LANG === "en"), tip = enPage ? "Text size " + Math.round(v * 100) + "% - tap for 100 → 120 → 140%"   // 영어 산 페이지(2026-10-15 PC)
            : "글자 크기 " + Math.round(v * 100) + "% - 누를 때마다 100 → 120 → 140%";
        Array.prototype.forEach.call(document.querySelectorAll(".rfTextBtn"), function (b) { b.textContent = t; b.title = tip; b.setAttribute("aria-label", tip); });   // 화면 읽기 프로그램에도 지금 크기(2026-10-29 점검)
        // 화면마다 크기를 다시 맞출 수 있게 알림(2026-10-18 PC: 별거 별거 카카오 창 - 단추 클릭은 stopPropagation 이라 document click 으로는 못 받음)
        try { if (global.dispatchEvent && typeof Event === "function") global.dispatchEvent(new Event("rf-textscale")); } catch (e) { /* 옛 브라우저 */ }
    }
    /** 순수 함수 - 단추 글(100% 가 · 120% 가+ · 140% 가++). en - 영어 화면(없으면 지금 말). */
    function textLabel(v, en) { var a = (en === undefined ? LANG === "en" : en) ? "A" : "가"; return v >= 1.4 ? a + "++" : v >= 1.2 ? a + "+" : a; }
    if (global.document && document.documentElement) applyTextScale(textScale());
    // 안드로이드는 크롬의 "routefly 설치"(웹 앱) 권유를 띄우지 않음(2026-10-21 PC: 홍TV님이 설치해 원래 앱과 아이콘이 둘이 됨 -
    // 웹 앱은 화면을 끄면 위치가 멈춰 산악회 방 · 따라가기는 routefly 앱이 맞음). PC 등 다른 기기는 그대로. 크롬 메뉴의 "앱 설치"는 남음
    if (global.addEventListener && global.navigator && /Android/i.test(navigator.userAgent || "") && !global.Capacitor)
        global.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); });

    global.RF = {
        num: num,
        km: km,
        trimTrack: trimTrack,
        gpxTracks: gpxTracks,
        trackStats: trackStats,
        splitTrack: splitTrack,
        joinTracks: joinTracks,
        trackGpx: trackGpx,
        distM: distM
    };
})(window);
