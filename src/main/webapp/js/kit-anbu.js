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
    /** 순수 함수 - 따라가기 화면 말: 주소 ?lang=en · ?lang=ko 가 먼저(stored 는 기억해 둔 말), 없으면 stored, 없으면 "ko". */
    function pageLang(search, stored) {
        var m = /[?&]lang=(en|ko)\b/.exec(search || "");
        return m ? m[1] : stored === "en" ? "en" : "ko";
    }
    /**
     * 화면의 data-en 글을 영어로(hike.html): data-en 은 안의 HTML(우리가 쓴 글만 - 바깥 자료 아님), data-en-title · -placeholder · -aria-label · -alt · -href(영어판 문서로, 2026-10-29) 는 그 속성.
     */
    function applyEn(root) {
        Array.prototype.forEach.call(root.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
        ["title", "placeholder", "aria-label", "alt", "href"].forEach(function (a) {
            Array.prototype.forEach.call(root.querySelectorAll("[data-en-" + a + "]"), function (el) { el.setAttribute(a, el.getAttribute("data-en-" + a)); });
        });
    }

    // ------------------------------------------------------------------ 🏠 오늘의 안부(2026-10-17 홍TV님 - 혼자 사는 분, 서버 없이 가볍게. 늦은 귀가 안심은 2026-10-18 뺌)

    /** 순수 함수 - 이 기기 시각의 날짜 "2026-10-17". */
    function dayKey(ms) {
        var d = new Date(ms);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    /**
     * 순수 함수 - 안부 알림 일정(앱 알림): 오늘부터 days 일, 날마다 정한 시각(hhmm "10:00")과 2시간 · 4시간 뒤.
     * repeat5 면 정한 시각부터 1시간 동안 5분마다 더(2026-10-18 홍TV님 - '5분마다 다시 울림'). 오늘 이미 확인했으면(checkedDay === 오늘) 오늘 것은 빼고,
     * 지난 시각도 뺌. → [{id, at, k(0 처음 · 1 다시 · 2 네 시간 뒤), day}] - id 7100 + 날 × 16 + 차례(앱 알림 번호).
     */
    function anbuPlan(nowMs, hhmm, checkedDay, days, repeat5) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""), out = [];
        if (!m) return out;
        var mins = repeat5 ? [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 120, 240] : [0, 120, 240];
        for (var i = 0; i < (days || 7); i++) {
            var d = new Date(nowMs);
            d.setDate(d.getDate() + i);
            d.setHours(+m[1], +m[2], 0, 0);
            var day = dayKey(d.getTime());
            if (day === checkedDay) continue;
            mins.forEach(function (mn, n) {
                var at = d.getTime() + mn * 60000;
                if (at > nowMs) out.push({ id: 7100 + i * 16 + n, at: at, k: mn === 0 ? 0 : mn === 240 ? 2 : 1, day: day });
            });
        }
        return out;
    }

    /** 순수 함수 - 안부 알림 글(k: 0 정한 시각 · 1 두 시간 뒤 · 2 네 시간 뒤). */
    function anbuText(k, en) {
        return en ? [["😊 How are you today?", "Tap and press \"I'm fine today\"."], ["Still no check-in today", "Tap to let us know you're OK."],
                     ["No check-in for 4 hours", "Tap to check in - or contact your guardian if you need help."]][k]
            : [["😊 오늘도 잘 지내세요?", "눌러서 '오늘도 잘 지내요' 를 알려 주세요."], ["아직 오늘 안부 확인이 없어요", "괜찮으시면 눌러 주세요."],
               ["안부 확인이 4시간째 없어요", "눌러서 확인해 주세요. 도움이 필요하면 보호자에게 연락하세요."]][k];
    }

    /** 순수 함수 - 보호자에게 보낼 "잘 지내요" 문자. */
    function anbuSms(clock, en) {
        return en ? "[routefly check-in] I'm fine today 😊 (" + clock + ")" : "[routefly 안부] 오늘도 잘 지내요 😊(" + clock + ")";
    }

    /** 순수 함수 - 전화번호 정리(숫자 · + 만, 8 ~ 15자리). 아니면 "". */
    function telClean(s) {
        var t = String(s || "").replace(/[^0-9+]/g, "");
        return /^\+?\d{8,15}$/.test(t) ? t : "";
    }

    /**
     * 순수 함수 - 전화번호 입력 모양(2026-10-18 홍TV님): 숫자만 받아 "010-1234-5678" 처럼 - 를 넣음. - 를 쳐도 무시.
     * 02(서울)는 02-123-4567 · 02-1234-5678, 그 밖은 3자리 지역 · 휴대폰 번호. 다 치지 않은 중간도 그때까지 모양대로. 11자리까지.
     */
    function telFormat(s) {
        var d = String(s || "").replace(/\D/g, "").slice(0, 11);
        var a = d.indexOf("02") === 0 ? 2 : 3;
        if (d.length <= a) return d;
        var rest = d.slice(a);
        if (rest.length <= 3) return d.slice(0, a) + "-" + rest;
        var mid = rest.length <= 7 ? rest.length - 4 : 4;   // 뒷자리는 늘 4자리
        if (rest.length < 7) return d.slice(0, a) + "-" + rest.slice(0, 3) + "-" + rest.slice(3);
        return d.slice(0, a) + "-" + rest.slice(0, mid) + "-" + rest.slice(mid);
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

    global.RF = {
        textButton: textButton,
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        dayKey: dayKey,
        anbuPlan: anbuPlan,
        anbuText: anbuText,
        anbuSms: anbuSms,
        telClean: telClean,
        telFormat: telFormat
    };
})(window);
