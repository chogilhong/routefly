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
    /**
     * 순수 함수 - 티맵 앱 길안내 링크(2026-11-08 홍TV님 "작업해" - 차로 들머리 · 주차장에 가는 분이 많이 씀). 출발은 티맵이 폰의 지금 위치로 잡음(우리 서버로 위치가 가지 않음).
     * 형식은 티맵 공식 문서가 아니라 개발 글들로 찾은 것(X 가 경도, Y 가 위도):
     * 안드로이드 tmap://route?referrer=com.skt.Tmap&goalx=경도&goaly=위도&goalname=이름(TMAP API 고객센터 안내라는 글), 아이폰 rGoName · rGoX · rGoY.
     * 2026-11-09 PC · 홍TV님 안드로이드 폰: rGo… 만 넣었더니 티맵은 열리는데 도착 칸이 비었음 → 둘 다 넣음(읽지 않는 칸은 티맵이 버림).
     */
    function tmapHref(name, lat, lon) {
        var nm = encodeURIComponent(String(name || "").trim() || "목적지"), x = (+lon).toFixed(6), y = (+lat).toFixed(6);
        return "tmap://route?referrer=com.skt.Tmap&goalx=" + x + "&goaly=" + y + "&goalname=" + nm + "&rGoName=" + nm + "&rGoX=" + x + "&rGoY=" + y;
    }

    /**
     * 순수 함수 - CSV 글 → 줄마다 칸 배열(2026-11-18 홍TV님 "1~5 번까지" 1 - 드론 기록장 · 조과 일지를 저장한 CSV 로 되살리기).
     * 맨 앞 BOM 을 떼고, 따옴표로 감싼 칸의 쉼표 · 줄바꿈 · "" 를 읽음(우리 logCsv · catchCsv 가 쓰는 모양). 빈 줄은 버림.
     */
    function csvRows(text) {
        var s = String(text || "").replace(/^\ufeff/, ""), rows = [], row = [], cell = "", q = false;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (q) {
                if (ch === '"') { if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
                else cell += ch;
            } else if (ch === '"') q = true;
            else if (ch === ",") { row.push(cell); cell = ""; }
            else if (ch === "\n" || ch === "\r") {
                if (ch === "\r" && s.charAt(i + 1) === "\n") i++;
                row.push(cell); cell = "";
                if (row.join("") !== "") rows.push(row);
                row = [];
            } else cell += ch;
        }
        row.push(cell);
        if (row.join("") !== "") rows.push(row);
        return rows;
    }

    /**
     * 순수 함수 - CSV 저장 권유(2026-11-18 홍TV님 "1, 5 작업해주고" 5 - 드론 기록장 · 조과 일지는 폰에만 있음).
     * 기록이 5개 이상인데 한 번도 저장하지 않았거나 마지막 저장이 30일 넘었으면 {days}(저장한 지 며칠, 없으면 null), 아니면 null.
     * saved · today 는 "YYYY-MM-DD"(KST 날짜).
     */
    function backupDue(n, saved, today) {
        if (!(n >= 5)) return null;
        var ok = /^\d{4}-\d\d-\d\d$/;
        if (!saved || !ok.test(saved)) return { days: null };
        if (!ok.test(today || "")) return null;
        var days = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(saved + "T00:00:00Z")) / 86400000);
        return days >= 30 ? { days: days } : null;
    }

    /**
     * 순수 함수 - 불러온 기록 합치기(드론 기록장 · 조과 일지 같이 씀): fields 칸이 모두 같은 기록은 건너뜀,
     * 날짜(d) 새 것이 위(같은 날은 있던 차례 - 있던 것 먼저), max 개까지. {list, added}.
     */
    function mergeRows(list, add, fields, max) {
        var key = function (e) { return fields.map(function (f) { return String(e[f] == null ? "" : e[f]); }).join("\u0001"); };
        var seen = {}, out = (list || []).slice(), added = 0;
        out.forEach(function (e) { seen[key(e)] = 1; });
        (add || []).forEach(function (e) { if (!seen[key(e)]) { seen[key(e)] = 1; out.push(e); added++; } });
        out = out.map(function (e, i) { return { e: e, i: i }; })
            .sort(function (a, b) { return a.e.d < b.e.d ? 1 : a.e.d > b.e.d ? -1 : a.i - b.i; }).map(function (x) { return x.e; });
        return { list: out.slice(0, max), added: added };
    }

    /**
     * 안내도(탐방 안내도 park.html · 노선 안내도 route.html) 바탕 지도 - V-World 지도(위성은 숨겨 둠) + 지형 음영, 키가 없으면 음영만.
     * c: {demUrl, vworldKey} (/api/map-config).
     */
    function baseStyle(c) {
        // V-World 지도 위 옅은 음영만이라 지형은 z12 까지(더 가까이는 늘려 씀 - 2026-11-02 홍TV님 점검: z15 까지 받던 타일). 키가 없어 음영이 바탕 전부면 z15
        var dem = { type: "raster-dem", tiles: [c.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: c.vworldKey ? 12 : 15, attribution: tr("지형: ", "Terrain: ") + "Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": c.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (c.vworldKey) {
            var key = encodeURIComponent(c.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: tr("위성사진: 국토교통부 V-World", "Satellite: V-World (Korea MOLIT)"),
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"] };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: tr("지도: 국토교통부 V-World", "Map: V-World (Korea MOLIT)"),
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"] };
            layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });
            layers.push({ id: "base", type: "raster", source: "base" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", minzoom: 9, paint: { "hillshade-exaggeration": 0.3 } });
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    /** 순수 함수 - 그날 해 지는 시각(ms, 그 위치 기준). 극지방처럼 해가 안 지면 null. (Almanac for Computers 공식) */
    function sunset(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, false); }
    /** 순수 함수 - 그 날 해 뜨는 시각(산 소개 페이지, 2026-10-14). 계산은 sunset 과 같음. */
    function sunrise(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, true); }

    function sunTime(dateMs, lat, lon, rise) {
        // 그 자리의 날짜로(경도로 어림한 현지 시각) - UTC 날짜를 쓰면 한국 아침 9시 전은 전날 일몰이 나왔음(2026-10-14 PC: 08:00 출발에 일몰 경고)
        var r = Math.PI / 180, d = new Date(dateMs + lon / 15 * 3600000);
        var start = Date.UTC(d.getUTCFullYear(), 0, 0), N = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
        var lngHour = lon / 15, t = N + ((rise ? 6 : 18) - lngHour) / 24;
        var Mn = 0.9856 * t - 3.289;
        var L = (Mn + 1.916 * Math.sin(Mn * r) + 0.020 * Math.sin(2 * Mn * r) + 282.634 + 360) % 360;
        var RA = (Math.atan(0.91764 * Math.tan(L * r)) / r + 360) % 360;
        RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
        var sinDec = 0.39782 * Math.sin(L * r), cosDec = Math.cos(Math.asin(sinDec));
        var cosH = (Math.cos(90.833 * r) - sinDec * Math.sin(lat * r)) / (cosDec * Math.cos(lat * r));
        if (cosH > 1 || cosH < -1) return null;
        var H = (rise ? 360 - Math.acos(cosH) / r : Math.acos(cosH) / r) / 15;
        var UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
        var day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), out = day + UT * 3600000;
        // UT 는 0~24시라 해 뜨는 시각(한국 아침 = 전날 UTC 저녁)은 하루 뒤로 나옴 - 현지 날짜가 그 날이 되게 맞춤
        var local = Math.floor((out + lngHour * 3600000 - day) / 86400000);
        return out - local * 86400000;
    }

    /**
     * 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 장거리(hike · trek)는 국립공원공단 기준 1km 에 34분(쉬는 시간 포함, 오르막 · 내리막 따로 더하지 않음 -
     * 2026-11-04 홍TV님 "공단과 동일하게 해. 산에서 휴식 시간도 산행이라고 봐야지": 공단 공식 시간 560개가 경사와 상관없이 1km 중앙 34분, MountainServlet.MIN_PER_KM).
     * 걷기(해안길 · 도로 둘레길 - 공단 자료 밖)는 예전처럼 시속 4km + 오르막 600m/h + 내리막 300m 에 10분(CoursePageServlet.WALK_RULE).
     */
    var KINDS = {
        hike: { label: "등산", kmh: 60 / 34, climb: 0, down: 0, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, down: 1800, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, down: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 60 / 34, climb: 0, down: 0, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
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

    /**
     * MapLibre 지도 단추 글(확대 · 축소 · 북쪽 · 출처 · 내 위치) - 한국어 화면은 한국어(2026-11-03 홍TV님 점검: 한국어 화면에 "Zoom in" 이 나왔음).
     * 영어 화면은 undefined(MapLibre 기본 영어). new maplibregl.Map({ locale: RF.mapLocale() }).
     */
    function mapLocale() {
        if (LANG === "en") return undefined;
        return { "AttributionControl.ToggleAttribution": "출처 보기 · 접기", "AttributionControl.MapFeedback": "지도 의견",
                 "FullscreenControl.Enter": "전체 화면", "FullscreenControl.Exit": "전체 화면 끝내기",
                 "GeolocateControl.FindMyLocation": "내 위치 찾기", "GeolocateControl.LocationNotAvailable": "위치를 알 수 없음",
                 "LogoControl.Title": "MapLibre 로고", "Marker.Title": "지도 표시",   // 이름을 안 붙인 표시는 "Map marker" 대신
                 "NavigationControl.ResetBearing": "끌면 지도 돌리기, 누르면 북쪽을 위로",
                 "NavigationControl.ZoomIn": "확대", "NavigationControl.ZoomOut": "축소",
                 "TerrainControl.Enable": "지형 켜기", "TerrainControl.Disable": "지형 끄기" };
    }

    global.RF = {
        baseStyle: baseStyle,
        tmapHref: tmapHref,
        csvRows: csvRows,
        mergeRows: mergeRows,
        backupDue: backupDue,
        sunset: sunset,
        sunrise: sunrise,
        mapLocale: mapLocale
    };
})(window);
