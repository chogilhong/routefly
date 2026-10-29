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
     * 화면의 data-en 글을 영어로(hike.html): data-en 은 안의 HTML(우리가 쓴 글만 - 바깥 자료 아님), data-en-title · -placeholder · -aria-label · -alt · -href(영어판 문서로, 2026-10-29) 는 그 속성.
     */
    function applyEn(root) {
        Array.prototype.forEach.call(root.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
        ["title", "placeholder", "aria-label", "alt", "href"].forEach(function (a) {
            Array.prototype.forEach.call(root.querySelectorAll("[data-en-" + a + "]"), function (el) { el.setAttribute(a, el.getAttribute("data-en-" + a)); });
        });
    }

    /**
     * 새로 배포되면 화면 위에 "새 버전이 있습니다 · 누르면 새로 고침" 띠를 띄웁니다(2026-10-10 홍TV님 - 저절로 새로 고치지 않고
     * 사용자가 누를 때만. 그 전에는 다시 볼 때 저절로 새로 고쳐 보던 창 · 지도 위치가 처음으로 돌아갔음).
     * 처음에 화면 파일들(files)의 서버 표시(ETag · Last-Modified · 크기)를 HEAD 로 받아 두고, 화면이 1분 넘게 가려졌다가
     * 다시 보일 때 한 번 더 받아 달라졌으면 띠를 띄웁니다. canShow() 가 거짓인 동안(걷는 중 · 날아가는 중)은 기다렸다가
     * 다음에 다시 보일 때 띄웁니다. 인터넷이 안 되거나 서버가 표시를 안 주면 아무것도 하지 않습니다(서비스 워커는 HEAD 를 거치지 않음).
     */
    function notifyDeploy(files, canShow) {
        if (!global.fetch || !global.document) return;
        // 2026-10-10 점검: 파일 하나라도 HEAD 가 실패하면(!ok) 표시 전체를 버립니다 - 예전에는 빈 칸을 넣은 채 first 로 남아,
        // 다음에 다 받으면 "달라졌다" 로 띠가 잘못 떴습니다.
        function sign() {
            return Promise.all(files.map(function (f) {
                return fetch(f, { method: "HEAD", cache: "no-store" }).then(function (r) {
                    if (!r.ok) throw new Error("HEAD " + f + " " + r.status);
                    return [r.headers.get("ETag"), r.headers.get("Last-Modified"), r.headers.get("Content-Length")].join("|");
                });
            })).then(function (a) { return a.join(";"); });
        }
        var first = null, latest = null, hiddenAt = 0, pending = false, bar = null;
        function show() {
            if (bar || !canShow()) return;
            // 띠 = 누르면 새로 고침, 오른쪽 작은 ✕ = 이번 배포는 띄우지 않음(걷는 중이 아니어도 지금 새로 고치기 싫을 때)
            bar = document.createElement("div");
            bar.id = "rfNewVersion";
            bar.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top, 0px) + 8px);z-index:1000;"
                + "display:flex;align-items:center;border-radius:22px;background:#38d9ea;box-shadow:0 2px 10px rgba(0,0,0,0.45);white-space:nowrap";
            var go = document.createElement("button");
            go.type = "button";
            go.textContent = tr("새 버전이 있습니다 · 누르면 새로 고침", "New version available · tap to reload");
            go.style.cssText = "min-height:44px;padding:0 6px 0 16px;border:0;background:none;color:#062b30;font:bold 14px sans-serif;cursor:pointer";
            go.onclick = function () { location.reload(); };
            var x = document.createElement("button");
            x.type = "button";
            x.textContent = "✕";
            x.setAttribute("aria-label", tr("새 버전 알림 닫기", "Close"));
            x.style.cssText = "min-width:44px;min-height:44px;border:0;background:none;color:#062b30;font:bold 16px sans-serif;cursor:pointer";
            x.onclick = function () {
                if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
                bar = null;
                pending = false;
                if (latest) first = latest;   // 다음 배포 때 다시 띄움
            };
            bar.appendChild(go);
            bar.appendChild(x);
            document.body.appendChild(bar);
        }
        sign().then(function (v) { if (v.replace(/[|;]/g, "")) first = v; }).catch(function () { /* 오프라인 · 하나라도 실패 - 확인 안 함 */ });
        // 서비스 워커가 신호가 늦어 받아 둔 옛 화면을 먼저 줬는데 새 파일이 왔을 때(sw.js tellUpdated - 2026-10-20 홍TV님 "폰에서 예전 버전")
        if (global.navigator && navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
            navigator.serviceWorker.addEventListener("message", function (ev) {
                if (ev.data && ev.data.type === "rf-updated") { pending = true; show(); }
            });
            if (navigator.serviceWorker.startMessages) navigator.serviceWorker.startMessages();
        }
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
            if (pending) { show(); return; }
            if (!first || !hiddenAt || Date.now() - hiddenAt < 60000) return;
            sign().then(function (v) {
                if (v.replace(/[|;]/g, "") && v !== first) { latest = v; pending = true; show(); }
            }).catch(function () { /* 오프라인 */ });
        });
    }
    /**
     * "3시간 5분" - 2026-10-09 점검: 분을 먼저 반올림하고 시 · 분을 나눕니다(예전에는 3시간 59분 40초가 "3시간 0분").
     * withZeroHour 면 1시간 안 될 때도 "0시간 40분".
     */
    function hm(ms, withZeroHour) {
        var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
        if (LANG === "en") return (h || withZeroHour ? h + " h " : "") + (m % 60) + " min";
        return (h || withZeroHour ? h + "시간 " : "") + (m % 60) + "분";
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 안내도(탐방 안내도 park.html · 노선 안내도 route.html) 바탕 지도 - V-World 지도(위성은 숨겨 둠) + 지형 음영, 키가 없으면 음영만.
     * c: {demUrl, vworldKey} (/api/map-config).
     */
    function baseStyle(c) {
        var dem = { type: "raster-dem", tiles: [c.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: tr("지형: ", "Terrain: ") + "Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": c.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (c.vworldKey) {
            var key = encodeURIComponent(c.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: tr("위성사진: 국토교통부 V-World", "Satellite: V-World (Korea MOLIT)"),
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"] };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: tr("지도: 국토교통부 V-World", "Map: V-World (Korea MOLIT)"),
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"] };
            layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });
            layers.push({ id: "base", type: "raster", source: "base" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.3 } });
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    function indexAt(c, d) {
        var dist = c.dist, lo = 0, hi = dist.length - 1;
        if (d <= 0) return 0;
        if (d >= c.total) return hi;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (dist[mid] <= d) lo = mid; else hi = mid;
        }
        return lo;
    }

    /** 진행 거리 d(m)의 위치 · 고도. 누적 거리 배열에서 이분 탐색 후 선형 보간. */
    function at(c, d) {
        var n = c.dist.length;
        if (d <= 0) return { lon: c.lon[0], lat: c.lat[0], ele: c.ele[0] };
        if (d >= c.total) return { lon: c.lon[n - 1], lat: c.lat[n - 1], ele: c.ele[n - 1] };
        var lo = indexAt(c, d), hi = lo + 1;
        var span = c.dist[hi] - c.dist[lo], t = span > 0 ? (d - c.dist[lo]) / span : 0;
        var e0 = c.ele[lo], e1 = c.ele[hi];
        return {
            lon: c.lon[lo] + (c.lon[hi] - c.lon[lo]) * t,
            lat: c.lat[lo] + (c.lat[hi] - c.lat[lo]) * t,
            ele: e0 == null || e1 == null ? null : e0 + (e1 - e0) * t
        };
    }

    /** 순수 함수 - 걸음 수 추정. 보폭 = 키 × 0.415(등산은 오르내림으로 10% 짧게). 자전거는 null. */
    function steps(kind, cm, distM) {
        if (kind === "bike") return null;
        var stride = cm / 100 * 0.415 * (kind === "walk" ? 1 : 0.9);
        return Math.round(distM / stride);
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
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
    /** 순수 함수 - 다음 글자 크기(140% 다음은 100%). */
    function nextTextScale(v) { return TEXT_STEPS[(TEXT_STEPS.indexOf(v) + 1) % TEXT_STEPS.length]; }
    /** "가+" 단추 - 누를 때마다 다음 크기. 모든 화면이 같은 설정을 씁니다. */
    function textButton() {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rfTextBtn";
        b.title = tr("글자 크기(누를 때마다 100 → 120 → 140%)", "Text size (100 → 120 → 140% each tap)");
        b.setAttribute("aria-label", tr("글자 크기", "Text size"));
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var n = nextTextScale(textScale());
            try { localStorage.setItem(TEXT_KEY, String(n)); } catch (err) { /* 이번 화면만 */ }
            applyTextScale(n);
        });
        setTimeout(function () { applyTextScale(textScale()); }, 0);
        return b;
    }
    if (global.document && document.documentElement) applyTextScale(textScale());
    // 안드로이드는 크롬의 "routefly 설치"(웹 앱) 권유를 띄우지 않음(2026-10-21 PC: 홍TV님이 설치해 원래 앱과 아이콘이 둘이 됨 -
    // 웹 앱은 화면을 끄면 위치가 멈춰 산악회 방 · 따라가기는 routefly 앱이 맞음). PC 등 다른 기기는 그대로. 크롬 메뉴의 "앱 설치"는 남음
    if (global.addEventListener && global.navigator && /Android/i.test(navigator.userAgent || "") && !global.Capacitor)
        global.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); });

    /**
     * 순수 함수 - 트립닷컴 제휴 링크(설정 partner.trip.url)를 들머리 근처 숙소 검색으로(2026-10-28 홍TV님 "들머리 근처 숙소가 나와야").
     * PC 가 kr.trip.com 에서 확인한 꼴: /hotels/list?cityId=0&searchType=LM&searchWord=이름&searchValue=13|0*13*위도|경도|이름|0|1
     * (cityId 가 없으면 0개, lat · lon 쿼리는 무시됨). 제휴 꼬리(Allianceid · SID · trip_sub1 · curr · locale 등)는 그대로 붙임.
     * listFilters=17~5*17*5 - 직선거리 가까운 순(17 = 정렬, 5 = 직선거리, 2026-10-28 PC 확인 - 붙이면 둘레 숙소만 남음).
     * trip.com 주소가 아니면 null. name 은 숙소 카드의 "{이름}에서 직선 거리" 에 나옴.
     */
    /**
     * 산악회 방 알림(2026-10-28 홍TV님 - 인솔자도 혼자 산행하느라 화면을 못 봄). 순수 함수: 방 화면(view) s · 이미 울린 것 fired({키: true}) →
     * {msgs: 새로 울릴 글, fired: 새 fired}. 풀린 것(SOS 해제 · 소식 옴)은 지워 다시 울릴 수 있게.
     * 인솔자(사무실 자리 빼고): 🆘 SOS · 📵 앱 회원 10분 소식 없음(산행 시작 10분 뒤부터, 폰 없는 명단 빼고) · ⏰ 하산 마감 60 · 30분 전 미하산 인원.
     * 회원: ⏰ 하산 마감 60 · 30분 전(하산 탑승 · 안 탐이면 없음).
     */
    function partyAlerts(s, fired) {
        var out = [], now = s && s.now || 0, f = {}, old = fired || {};
        if (!s || !s.role) return { msgs: out, fired: old };
        function hm(ms) { var d = new Date(ms + 9 * 3600000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
        function hit(k, msg) { f[k] = true; if (!old[k]) out.push(msg); }
        var en = LANG === "en";
        if (s.role === "lead" && !s.officeMe) {
            var groups = {};   // 하산 마감마다(하산 탑승지 시각 · 없으면 방 하산 마감) 아직 안 탄 사람 수
            (s.members || []).forEach(function (m) {
                if (m.role !== "hiker" || m.cancelled || m.aboard) return;
                var at = m.pickup && s.pickupAt && s.pickupAt[m.pickup] || s.endAt;
                if (at) { var gk = m.pickup && s.pickupAt && s.pickupAt[m.pickup] ? m.pickup : ""; groups[gk] = groups[gk] || { at: at, n: 0 }; groups[gk].n++; }
                if (m.sos) hit("sos" + m.id, en ? "🆘 SOS - " + m.nick : "🆘 SOS - " + m.nick + " 님");
                if (m.app && !m.listed && s.departedAt && !m.sos) {
                    var a = m.seen != null ? m.seen : m.ago, eff = Math.min(a == null ? Infinity : a, (now - s.departedAt) / 1000);
                    if (eff > 600) hit("quiet" + m.id, en ? "📵 No update from " + m.nick + " for over 10 min" : "📵 " + m.nick + " 님 10분 넘게 소식 없음");
                }
            });
            Object.keys(groups).forEach(function (gk) {   // 하산 탑승지마다(2026-10-28 홍TV님 일정표 - 설악동 17:00 · 남교리 17:35)
                var g = groups[gk], left = Math.ceil((g.at - now) / 60000);   // 실제 남은 분
                [60, 30].forEach(function (w) {
                    if (s.departed && now >= g.at - w * 60000 && now < g.at && !(w === 60 && left <= 30))   // 30분 안에 처음 보면 30분 것 하나만
                        hit("end" + w + gk, en ? "⏰ " + (gk ? gk + " pickup " : "Back-down deadline ") + hm(g.at) + " (" + left + " min left) - " + g.n + " not back yet"
                            : "⏰ " + (gk ? gk + " 하산 탑승 " : "하산 마감 ") + hm(g.at) + " (" + left + "분 남음) - 아직 " + g.n + "명 하산 전");
                });
            });
        } else if (s.role === "hiker") {
            // 하차 안내(인솔자 "⬇ 한계령 도착") - 버스 안 회원
            if (s.arrive && !s.aboard && !s.cancelled) hit("arr" + s.arrive.at, en ? "⬇ We're at " + s.arrive.drop + ". If you get off here, tap \"I'm getting off here\"." : "⬇ 지금 " + s.arrive.drop + "입니다. 여기서 내리시면 \"여기서 내려요\"를 눌러 주세요.");
            var mine = s.myEndAt || s.endAt, pk = s.pickup && s.pickupAt && s.pickupAt[s.pickup] ? s.pickup : "";   // 내 하산 탑승지 시각(없으면 방 하산 마감)
            if (s.departed && mine && !s.aboard && !s.cancelled) {
                var mleft = Math.ceil((mine - now) / 60000);
                [60, 30].forEach(function (w) {
                    if (now >= mine - w * 60000 && now < mine && !(w === 60 && mleft <= 30))
                        hit("mine" + w + "_" + mine, en ? "⏰ " + (pk ? pk + " pickup " : "Back-down deadline ") + hm(mine) + " - " + mleft + " min left. Please head back to the bus."
                            : "⏰ " + (pk ? pk + " 하산 탑승 " : "하산 마감 ") + hm(mine) + " - " + mleft + "분 남았습니다. " + (pk ? "하산 탑승지(" + pk + ")로 내려와 주세요." : "버스로 내려와 주세요."));
                });
            }
        }
        return { msgs: out, fired: f };
    }

    /**
     * 순수 함수 - 예약 명단 읽기(2026-10-28 홍TV님 "예약 명단을 TXT나 엑셀 등 문서로 업로드 돼?"). 붙여 넣은 글 · TXT · CSV(엑셀) 모두.
     * 표(탭 · 쉼표 칸)면 머리 줄(이름 · 좌석 · 호차)로, 없으면 칸 모양으로 이름 · 좌석 칸을 찾고 나머지 칸(전화번호 · 탑승지 · 금액 등)은 버림.
     * 전화번호는 서버로 보내지 않음. → {people: [{name, bus, seat}], phones: 버린 전화번호 수, dropped: [버린 칸 이름]}
     * 화면은 people 을 /roster rows 로 그대로 보냄(이름 · 호차 · 좌석 따로).
     */
    var PHONE_RE = /^(\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}$|^0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}$/;
    var SEAT_RE = /^(?:(\d{1,2})\s*[-호차]+\s*)?(\d{1,3})\s*번?$/;
    /** 머리 줄 낱말(2026-10-28 버그 점검: "이름 좌석" · "고객명" · "예약자 이름" 이 회원으로 들어갔음) - 칸 이름은 낱말이 들어 있으면. */
    var HEAD_WORD = /^(이름|성명|성함|회원명?|예약자(명)?|참가자(명)?|고객명?|좌석(번호)?|자리(번호)?|호차|버스|차량|연락처|전화(번호)?|휴대폰|핸드폰|탑승지|순번|번호|no\.?|name|seat|bus|phone|tel)$/i;
    function rosterName(t) {
        var n = String(t == null ? "" : t).replace(/[\s"'`]/g, "").slice(0, 12);
        return n && !/^\d+$/.test(n) && !PHONE_RE.test(String(t).trim()) && /[가-힣A-Za-z]/.test(n) ? n : "";
    }
    function csvCells(line, sep) {
        if (sep === "\t") return line.split("\t");
        var out = [], cur = "", q = false;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (q) { if (c === "\"" && line.charAt(i + 1) === "\"") { cur += "\""; i++; } else if (c === "\"") q = false; else cur += c; }
            else if (c === "\"") q = true;
            else if (c === sep) { out.push(cur); cur = ""; }
            else cur += c;
        }
        out.push(cur);
        return out;
    }
    function rosterRead(text) {
        text = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
        var lines = text.split("\n").filter(function (l) { return l.trim(); });
        var sep = lines.some(function (l) { return l.indexOf("\t") >= 0; }) ? "\t"
            : lines.length >= 2 && lines.filter(function (l) { return l.indexOf(",") >= 0; }).length >= lines.length * 0.8 && lines.every(function (l) { return !/[가-힣]+\s*\d{1,3}\s*,\s*[가-힣]+\s*\d{1,3}/.test(l); }) ? "," : null;
        var people = [], phones = 0, dropped = [];
        if (!sep) {   // 자유 글 "일식이 5 이식이 6 삼식이 · 홍길동 2호차 15번" - 전화번호 · 머리 낱말(이름 · 좌석 등)은 버림
            var toks = text.replace(/(\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, function () { phones++; return " "; })
                .replace(/(\d{1,2})\s*호차\s*(\d{1,3})\s*번?/g, "$1-$2").split(/[\s,·;/]+/).filter(Boolean);
            var seatTok = /^(?:(\d{1,2})-)?(\d{1,3})번?$/;
            toks.forEach(function (t, i) {
                if (HEAD_WORD.test(t)) { if (dropped.indexOf(t) < 0) dropped.push(t); return; }
                var bo = /^(\d{1,2})호차$/.exec(t), last = people[people.length - 1];
                if (bo) { if (last && last.seat == null) last.bus = +bo[1]; return; }
                var mm = seatTok.exec(t);
                if (mm) {   // 앞 이름의 좌석("N호차" 뒤면 그 호차 그대로)
                    if (last && last.seat == null) { if (mm[1]) last.bus = +mm[1]; last.seat = +mm[2]; }
                    return;
                }
                // "김철수2 5" - 뒤에 좌석 낱말이 따로 오면 이름 끝 숫자는 이름(2026-10-28 버그 점검)
                var nm = seatTok.test(toks[i + 1] || "") ? null : /^(.*?\D)((?:\d{1,2}-)?\d{1,3})번?$/.exec(t), name = rosterName(nm ? nm[1] : t);
                if (!name) return;
                var e = { name: name, bus: 1, seat: null };
                if (nm) { var bm = /^(?:(\d{1,2})-)?(\d{1,3})$/.exec(nm[2]); if (bm) { e.bus = bm[1] ? +bm[1] : 1; e.seat = +bm[2]; } }
                people.push(e);
            });
            return { people: people, phones: phones, dropped: dropped };
        }
        var rows = lines.map(function (l) { return csvCells(l, sep).map(function (c) { return c.trim(); }); });
        var width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        var head = rows[0], col = { name: -1, seat: -1, bus: -1 };
        head.forEach(function (h, i) {
            var k = h.replace(/\s/g, "").toLowerCase();
            if (col.name < 0 && /이름|성명|성함|회원|예약자|참가자|고객|name/.test(k) && !/연락|전화|번호$/.test(k)) col.name = i;
            else if (col.seat < 0 && /좌석|자리|seat/.test(k)) col.seat = i;
            else if (col.bus < 0 && /호차|버스|bus/.test(k) && !/번호|plate/.test(k)) col.bus = i;
        });
        var hasHead = col.name >= 0;
        var body = hasHead ? rows.slice(1) : rows;
        if (!hasHead) {   // 머리 줄이 없음 - 칸 모양으로: 이름 칸 = 이름 같은 값이 가장 많은 칸, 좌석 칸 = 숫자 칸
            var best = -1, bestN = 0, seatBest = -1;
            for (var c = 0; c < width; c++) {
                var nN = 0, sN = 0, filled = 0;
                body.forEach(function (r) { var v = (r[c] || "").replace(/\s/g, ""); if (v) filled++; if (rosterName(v) && !SEAT_RE.test(v) && !/^\d{1,2}월\d{1,2}일$/.test(v)) nN++; if (/^(?:\d{1,2}-)?\d{1,3}번?$|^\d{1,2}월\d{1,2}일$|^\d{1,2}\/\d{1,2}$/.test(v)) sN++; });
                if (nN > bestN) { best = c; bestN = nN; }
                // 좌석 칸 - 채운 칸이 거의 다 번호이고 절반 넘게 채움. 여럿이면 오른쪽(앞의 "순번" 칸보다 좌석이 뒤에 옴, 빈 좌석이 있어도)
                if (sN && sN >= filled * 0.8 && sN >= body.length * 0.5) seatBest = c;
            }
            col.name = best;
            col.seat = seatBest === best ? -1 : seatBest;
        }
        if (col.name < 0) return { people: [], phones: 0, dropped: [] };
        for (var i = 0; i < width; i++) if (i !== col.name && i !== col.seat && i !== col.bus) dropped.push(hasHead && head[i] ? head[i] : (i + 1) + "번째 칸");
        body.forEach(function (r) {
            r.forEach(function (v) { if (PHONE_RE.test(v)) phones++; });
            var name = rosterName(r[col.name]);
            if (!name) return;
            var e = { name: name, bus: 1, seat: null }, sv = col.seat >= 0 ? (r[col.seat] || "").replace(/\s/g, "") : "";
            // 엑셀이 "2-15" 를 날짜로 바꿈(2026-10-28 PC: 칸에 "2월 15일" · "2/15" · "02-15") - 좌석 칸에서는 2호차 15번
            sv = sv.replace(/^(?:\d{4}[-./년])?(\d{1,2})월(\d{1,2})일$/, "$1-$2").replace(/^(?:\d{4}[-./])?(\d{1,2})[/.](\d{1,2})\.?$/, "$1-$2").replace(/^0(\d)-/, "$1-");
            var sm = /^(?:(\d{1,2})-)?(\d{1,3})번?$/.exec(sv);
            if (sm) { e.seat = +sm[2]; if (sm[1]) e.bus = +sm[1]; }
            if (col.bus >= 0) { var bm = /(\d{1,2})/.exec(r[col.bus] || ""); if (bm) e.bus = +bm[1]; }
            people.push(e);
        });
        return { people: people, phones: phones, dropped: dropped };
    }

    /**
     * 순수 함수 - 인솔자 "지금 할 일"(2026-10-28 홍TV님 추천 2 - 단계마다 할 일만). s - 인솔자 view.
     * → {phase: "before" · "hiking" · "after", steps: [{done, text, act}]} (act - 누르면 할 단추 id: departBtn · endBtn · arrive · list).
     */
    function leadSteps(s, en) {
        var T = function (ko, e) { return en ? e : ko; };
        var hk = (s.members || []).filter(function (m) { return m.role === "hiker" && !m.cancelled; });
        var nh = hk.length, boarded = hk.filter(function (m) { return m.boarded; }).length, aboard = hk.filter(function (m) { return m.aboard; });
        var over = s.endAt && s.now > s.endAt, steps = [];
        if (!s.departed) {
            steps.push({ done: nh > 0, text: nh > 0 ? T("회원 참가 " + nh + "명", nh + " members joined") : T("안내 글 · QR 로 회원 참가받기", "Invite members (text · QR)"), act: nh > 0 ? "" : "copyBtn" });
            steps.push({ done: nh > 0 && boarded >= nh, text: T("출발 탑승 확인 " + boarded + " / " + nh + (nh > boarded ? (s.seats ? " - 좌석표에서 탄 사람 누르기" : " - 명단에서 탄 사람 누르기") : ""), "Boarding " + boarded + " / " + nh + (nh > boarded ? (s.seats ? " - tap who's on in the seat map" : " - tap who's on in the list") : "")), act: nh > boarded ? (s.seats ? "seatSec" : "list") : "" });   // 좌석 없는 방은 좌석표가 숨음(2026-10-28 점검)
            steps.push({ done: false, text: T("들머리에 도착하면 산행 시작", "At the trailhead, start the hike"), act: s.role === "lead" && !over ? "departBtn" : "" });
            return { phase: "before", steps: steps };
        }
        var sos = hk.filter(function (m) { return m.sos && !m.aboard; }), left = hk.filter(function (m) { return !m.aboard; });
        var done = nh > 0 && left.length === 0;
        if (!done && !over) {
            steps.push({ done: !sos.length, text: sos.length ? T("🆘 SOS " + sos.length + "명 - 바로 연락", "🆘 SOS: " + sos.length + " - call now") : T("SOS 없음", "No SOS"), act: sos.length ? "list" : "" });
            if ((s.drops || []).length) steps.push({ done: false, text: T("하차 지점에 서면 \"⬇ 도착\" 누르기", "At each drop-off, tap \"⬇ Arrived\""), act: "arriveRow" });
            steps.push({ done: false, text: T("하산 탑승 " + aboard.length + " / " + nh + (left.length && left.length <= 5 ? " · 남은 사람 " + left.map(function (m) { return m.nick; }).join(", ") : ""),
                "Back on bus " + aboard.length + " / " + nh + (left.length && left.length <= 5 ? " · still out: " + left.map(function (m) { return m.nick; }).join(", ") : "")), act: "list" });
            return { phase: "hiking", steps: steps };
        }
        steps.push({ done: done, text: done ? T("모두 하산 탑승 " + nh + "명", "All " + nh + " back on the bus") : T("하산 미확인 " + left.length + "명 - 전화로 확인", left.length + " not confirmed down - call them"), act: done ? "" : "list" });
        steps.push({ done: false, text: T("출발하면 방 끝내기(모두의 위치를 지움)", "When you leave, end the room (deletes locations)"), act: s.chief ? "endBtn" : "" });
        return { phase: "after", steps: steps };
    }

    global.RF = {
        notifyDeploy: notifyDeploy,
        baseStyle: baseStyle,
        textButton: textButton,
        setLang: setLang,
        applyEn: applyEn,
        partyAlerts: partyAlerts,
        rosterRead: rosterRead,
        leadSteps: leadSteps
    };
})(window);
