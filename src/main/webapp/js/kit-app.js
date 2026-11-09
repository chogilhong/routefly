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

    var LINE_COLOR = "#38d9ea";
    var NS = "http://www.w3.org/2000/svg";

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
        // 2026-11-01 점검: 첫 표시는 화면이 다 뜬 뒤 3초에 - 화면을 열자마자 HEAD 여러 개가 첫 화면 파일과 연결을 다퉜음
        function base() { sign().then(function (v) { if (v.replace(/[|;]/g, "")) first = v; }).catch(function () { /* 오프라인 · 하나라도 실패 - 확인 안 함 */ }); }
        var later = function () { setTimeout(base, 3000); };
        if (!global.addEventListener) base();   // 창 사건이 없는 곳(node 테스트)은 바로
        else if (document.readyState === "complete") later();
        else global.addEventListener("load", later);
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
            if (!canShow()) return;   // 걷는 중 - 띠를 못 띄우니 묻지도 않음(2026-11-02 홍TV님 점검: 화면을 켤 때마다 HEAD 4번). 끝낸 뒤 다시 볼 때 물음
            sign().then(function (v) {
                if (v.replace(/[|;]/g, "") && v !== first) { latest = v; pending = true; show(); }
            }).catch(function () { /* 오프라인 */ });
        });
    }
    /** 검색칸 안내 글 - 종류 탭마다(2026-10-09 홍TV님: 모두 "설악산, 공룡" 이라 구분이 안 됨). 두 화면이 같이 씁니다. */
    function searchPlaceholder(kind) {
        if (LANG === "en") return kind === "hike" ? "Mountain or peak (e.g. Seoraksan, Bukhansan)" : kind === "walk" ? "Walking trail (e.g. 둘레길, 올레)"
            : kind === "bike" ? "Bike path (e.g. 국토종주, 한강)" : "Mountain or trail (e.g. Seoraksan, Jirisan)";
        return kind === "hike" ? "산 · 봉우리 이름 (예: 설악산, 대청봉)"
            : kind === "walk" ? "걷기길 이름 (예: 둘레길, 해파랑길, 올레)"
            : kind === "bike" ? "자전거길 이름 (예: 국토종주, 한강, 낙동강)"   // 국가 자전거길은 배치가 '국토종주 ○○' 로 넣음(network=ncn)
            : "코스 · 산 이름 (예: 설악산, 둘레길, 국토종주)";
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

    /** 화면에 쓸 장소 이름 - "설악산국립공원사무소남설악탐방지원센터" → "남설악탐방지원센터", "중청 대피소" → "중청대피소". */
    /**
     * 순수 함수 - "…정상" 이름 줄이기: 봉우리 이름이 있으면 그 봉 이름("지리산 천왕봉 정상" · "천왕봉정상" → 천왕봉),
     * 없으면 "정상"("공주향교뒷산 정상" → 정상). "정상" 으로 끝나지 않으면 그대로. 2026-10-12 홍TV님.
     */
    var NOT_PASS = ["고수치"];

    /**
     * 순수 함수 - 노선 안내도의 구간 시작 · 끝 지명(2026-10-12 홍TV님). courses 는 그릴 차례, lines 는 {코스ID: [[경도, 위도]…]}.
     * 이름은 코스 이름 길("복지봉 → 팔성사")의 처음과 끝. 앞 구간 끝과 다음 구간 시작처럼 nearM 안에 이미 지명이 있으면 하나만.
     * → [{name, lon, lat, start: 이 지명에서 시작하는 courses 번호(없으면 -1)}]
     */
    /**
     * 순수 함수 - 코스 이름의 출발 · 도착 이름 {from, to}(모르면 null). "가 → 나 → 다" 는 가 · 다,
     * 화살표 없는 "창옥봉에서" · "삼각점까지"(OSM 구간 한쪽 끝 - 2026-10-12 PC: 백두대간 끝 점이 둘로 보였음),
     * 국가숲길 "지리산둘레길 가탄-송정"(2026-10-12 홍TV님: 어디가 가탄이고 어디가 송정인지).
     */
    function routeEnds(name) {
        var parts = nameParts(name).route.split(" → ");
        if (parts.length >= 2) return { from: parts[0].trim(), to: parts[parts.length - 1].trim() };
        var one = /^(.+?)(에서|까지)$/.exec(parts[0].trim());
        if (one) return one[2] === "에서" ? { from: one[1], to: null } : { from: null, to: one[1] };
        // "덕전리 순환" - 거기서 나가 거기로 돌아옴(산림청 · 등산트레킹 · 자전거 순환 코스, 2026-10-13 홍TV님: 들머리 · 날머리 이름)
        var loop = /^(.+?)\s*순환$/.exec(parts[0].trim());
        if (loop) return { from: loop[1], to: loop[1] };
        var ab = /([가-힣]+)-([가-힣]+)\s*\)?\s*$/.exec(String(name || ""));
        return ab ? { from: ab[1], to: ab[2] } : { from: null, to: null };
    }

    /**
     * 순수 함수 - 선이 이름과 거꾸로 그려진 코스({코스ID: true}). 2026-10-12: 국가숲길 지리산둘레길 GPX 가운데 "금계-동강" ·
     * "성심원-운리" 들은 선이 이름 뒤쪽(동강 · 운리)에서 시작함. 같은 이름이 여러 코스 끝에 나오면 그 끝들이 모이는 점이
     * 그 곳 - 그 점이 이름 앞쪽(from)인데 선 끝에 있으면 거꾸로. 모르면 이름 차례 그대로.
     */
    function routeFlips(courses, lines, nearM) {
        var near = nearM == null ? 300 : nearM, cands = {}, at = {}, out = {};
        function key(n) { return String(n || "").replace(/\s+/g, ""); }
        (courses || []).forEach(function (c) {
            var l = lines && lines[c.course_id], e = routeEnds(c.name);
            if (!l || l.length < 2) return;
            [e.from, e.to].forEach(function (n) {
                if (!n) return;
                (cands[key(n)] = cands[key(n)] || []).push(l[0], l[l.length - 1]);
            });
        });
        Object.keys(cands).forEach(function (k) {
            var best = null, bn = 1;
            cands[k].forEach(function (p) {
                var n = cands[k].filter(function (q) { return distM(p[1], p[0], q[1], q[0]) < near; }).length;
                if (n > bn) { bn = n; best = p; }
            });
            if (best) at[k] = best;
        });
        (courses || []).forEach(function (c) {
            var l = lines && lines[c.course_id], e = routeEnds(c.name);
            if (!l || l.length < 2) return;
            var a = l[0], z = l[l.length - 1], f = e.from && at[key(e.from)], t = e.to && at[key(e.to)];
            var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
            if ((f && d(f, z) < near && d(f, a) >= near) || (t && d(t, a) < near && d(t, z) >= near)) out[c.course_id] = true;
        });
        return out;
    }

    // 지명으로 다듬기(2026-10-12 PC: 해파랑길 · 백두대간 지명에 가게 · 창고 이름, 긴 괄호)
    // 가게 · 시설 이름은 빼고, 긴 괄호("(경상북도기념물제39호)")와 뒤 숫자("솔잎공원267")는 떼고, "660 봉" 은 붙이고,
    // 탐방지원센터 · 휴게소는 앞 지명만("죽령탐방지원센터" → 죽령, "제3관문휴게소" → 제3관문)
    function placeName(raw) {
        var n = cleanName(raw || "").replace(/\(([^)]*)\)/g, function (m, x) { return x.length > 6 || /[0-9]/.test(x) ? "" : m; })
            .replace(/([0-9]+)\s+(봉|고지)$/, "$1$2").replace(/([가-힣])[0-9]+$/, "$1").trim();
        // 마을 이름 뒤 민박 · 펜션 · 식당은 마을 이름으로("가탄마을민박" → 가탄마을 - 2026-10-12 홍TV님: 지리산둘레길 끝 지명이 없었음)
        var vil = /^(.+(마을|리|동))(민박|펜션|식당|슈퍼|가게)$/.exec(n);
        if (vil) n = vil[1];
        if (/(본점|해변점|역점|항점|샵|민박|낚시점|창고|쉼터|관리본부|식당|카페|펜션|모텔|마트|편의점)$|^(씨유|GS25|세븐일레븐)/.test(n)) return "";
        var cut = n.replace(/(탐방지원센터|휴게소)$/, "");
        return cut.length >= 2 ? cut : n;
    }

    function summitName(name) {
        var n = String(name || "").trim();
        if (!/정상$/.test(n)) return n;
        var words = n.replace(/\s*정상$/, "").trim().split(/\s+/), bong = null, last = words[words.length - 1];
        // 봉 · 단 · 대 봉우리 이름(노고단 · 백운대 · 마천대 - 2026-10-12: 이어 걷기 이름이 "만복대 → 정상" 으로 흐렸음), 전망대는 아님
        words.forEach(function (w) { if (/[가-힣](봉|단|대)(\(.*\))?$/.test(w) && !/(전망대|전망단)$/.test(w)) bong = w; });
        // 고개의 "정상" 은 고갯마루 - 고개 이름을 그대로(2026-10-12 홍TV님: "진부령정상" → 진부령, 등산 · 걷기 · 자전거 모두)
        // 고개가 아닌 것: 고수치(제주 서귀포 안덕면 고수치오름 - 2026-10-12 홍TV님 확인)
        if (!bong && /[가-힣](령|재|고개|치|티)$/.test(last) && NOT_PASS.indexOf(last) < 0) return last;
        return bong || "정상";
    }

    function cleanName(name) {
        var n = summitName(String(name || "").trim().replace(/\s+/g, " "));
        // 한글 이름 뒤 영어 이름은 뺌("피아골 대피소 Piagol Shelter" - OSM, 2026-10-12 지리산 전체 보기 글자 겹침)
        if (/[가-힣]/.test(n)) n = n.replace(/\s*\([A-Za-z0-9 '.\-]*\)\s*$/, "").replace(/\s+[A-Za-z][A-Za-z0-9 '.\-]*$/, "");   // 괄호 안 영어도("안부1 (Anbu 1)")
        var cut = n.replace(/^\S{0,12}?(국립공원(관리)?(공단|사무소)?|도립공원(관리)?사무소|군립공원(관리)?사무소|관리사무소)\s*(?=\S*(탐방지원센터|탐방안내소|안내소|안내센터|분소|매표소))/, "").trim();
        if (cut.length < 2) cut = n;
        return cut.replace(/\s+(탐방지원센터|탐방안내소|안내소|분소|매표소|대피소|휴게소|주차장|폭포)$/, "$1");
    }

    /**
     * 공식 정보(국립공원 탐방로 자료) → "공단 기준 오름 4시간 · 내림 3시간 · 난이도 2.27". 없으면 null.
     * info: {up_min, down_min, level} (api/course 의 info).
     */
    /**
     * 순수 함수 - 자료가 끊긴 구간(courseGaps 와 같은 기준)의 선 GeoJSON(FeatureCollection) - 지도에 붉은 점선으로(2026-10-30).
     * 등산 · 장거리 코스만(kind hike · trek) - 내 GPX · 걷기 · 자전거의 곧은 길은 빼고. c: {lon, lat, course.kind, id}.
     */
    function gapLines(c, minM) {
        var out = { type: "FeatureCollection", features: [] }, lim = minM || 250;
        if (!c || !c.lat || isGpxId(c.id) || !/^(hike|trek)$/.test(String(c.course && c.course.kind))) return out;
        for (var i = 1; i < c.lat.length; i++)
            if (distM(c.lat[i - 1], c.lon[i - 1], c.lat[i], c.lon[i]) > lim)
                out.features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[c.lon[i - 1], c.lat[i - 1]], [c.lon[i], c.lat[i]]] } });
        return out;
    }

    /** 순수 함수 - 화면에 알릴 끊긴 구간(등산 · 장거리 코스만, gapLines 와 같은 거름) [{at, m}]. */
    function shownGaps(c) {
        return !c || isGpxId(c.id) || !/^(hike|trek)$/.test(String(c.course && c.course.kind)) ? [] : courseGaps(c);
    }

    /** 공단 오름 시간이 선 1km 에 이보다 길면 선이 공식 구간의 일부(2026-10-30 점검: 공단 코스 147개는 40 ~ 55분, 설악산 소공원 → 희운각 1.47km 에 230분). */
    var INFO_PART_MIN_PER_KM = 65;

    /** 순수 함수 - 공단 시간이 이 선(distM) 전체가 아니라 더 긴 공식 구간 것인가. 거리 · 시간이 없으면 false. */
    function infoPartial(info, distM) {
        return !!info && +info.up_min > 0 && +distM > 0 && +info.up_min / (+distM / 1000) > INFO_PART_MIN_PER_KM;
    }

    /** distM - 선 길이(있으면 공단 시간이 더 긴 공식 구간 것일 때 그렇다고 덧붙임 - infoPartial). */
    function infoText(info, distM) {
        if (!info) return null;
        var parts = [], part = infoPartial(info, distM);
        if (LANG === "en") {
            if (+info.up_min > 0) parts.push("up " + hm(+info.up_min * 60000));
            if (+info.down_min > 0) parts.push("down " + hm(+info.down_min * 60000));
            return parts.length ? "Park service: " + parts.join(" · ") + (part ? " (for the whole official route - this line is only part of it)" : "") : null;
        }
        if (+info.up_min > 0) parts.push("오름 " + hm(+info.up_min * 60000));
        if (+info.down_min > 0) parts.push("내림 " + hm(+info.down_min * 60000));
        if (info.level != null && String(info.level).trim()) parts.push("난이도 " + String(info.level).trim());
        return parts.length ? "공단 기준 " + parts.join(" · ") + (part ? " (공단 시간은 전체 구간 기준 - 이 선은 그 일부)" : "") : null;
    }

    /** 코스 미리보기 1× 의 비행 시간(ms) - 코스 길이에 맞춰 20초 ~ 90초. 시험 걷기 1× 도 같은 시간에 코스를 다 걷습니다. */
    function flightMs(totalM) {
        var k = Math.max(totalM / 1000, 0.5);
        return Math.max(20000, Math.min(k * 2500, 90000));
    }

    /**
     * 코스 이름 → {group, route}. 2026-10-10 홍TV님: "[무등산 서인봉 1코스] 증심사 → 무등산" 처럼 보이게 -
     * 첫 " · " 앞(산 · 코스 이름)을 group, 뒤(들머리 → 정상)를 route 로. " · " 가 없으면 group 없음.
     */
    function nameParts(name) {
        var n = String(name || "");
        var i = n.indexOf(" · ");
        // 무리에 든 산 이름이 길 이름 앞에 또 붙은 봉우리는 떼어 냄("[가야산 동성봉 자락 2코스] … → 가야산칠불봉" → 칠불봉, 2026-10-14 홍TV님)
        var mts = i > 0 ? n.slice(0, i).split(/\s+/).map(function (w) { return w.replace(/\(.*\)$/, ""); }).filter(function (w) { return /산$/.test(w); }) : [];
        var route = (i > 0 ? n.slice(i + 3) : n).split(" → ").map(function (x) { return summitName(numberedPark(stripMountain(x, mts))); }).join(" → ");   // "→ 공주향교뒷산 정상" → "→ 정상", 문화공원11(부안공원) → 부안공원
        return i > 0 ? { group: n.slice(0, i), route: route } : { group: null, route: route };
    }

    /** 순수 함수 - "가야산칠불봉" 처럼 산 이름(mts 가운데 하나) 바로 뒤에 봉우리 · 고개 이름이 붙었으면 봉우리 이름만. 아니면 그대로("가야산소리길" · "남산제일봉"). */
    function stripMountain(x, mts) {
        var t = String(x || "").trim();
        for (var k = 0; k < (mts || []).length; k++) {
            var m = mts[k], rest = t.indexOf(m) === 0 ? t.slice(m.length) : "";
            // "남산제일봉" 처럼 차례 이름(제일 · 제이 …)이 붙은 봉우리는 한 이름이라 그대로
            // 봉우리(…봉 · …대)만 - 고개("어산이재") · 전망대("무등산전망대")는 그대로(2026-10-14 PC, 배치 MountainNames.liftMountain 과 같게)
            if (rest && !/^제[일이삼사오]/.test(rest) && !/전망대$/.test(rest) && /^[가-힣]{1,8}(봉|대)(\(.*\))?$/.test(rest)) return rest;
        }
        return x;
    }

    /** el 에 코스 이름을 "[무리] 길" 로(무리는 흐리게). 글은 textContent 로만 넣습니다. */
    function showName(el, name, routeFirst) {
        var p = nameParts(name);
        el.textContent = "";
        // routeFirst - 좁은 머리글(따라가기 제목)은 길("하동호 → 덕산")만.
        // 2026-10-12 홍TV님: "[지리산둘레길 2구…" 에서 잘려 어느 쪽으로 가는지 안 보였고, 무리를 뒤에 붙여도 길어서 길만
        if (routeFirst) {
            nameNodes(el, routeOnly(name));
            return;
        }
        if (p.group) {
            var g = document.createElement("span");
            g.className = "rf-grp";
            g.textContent = "[" + (LANG === "en" ? enName(p.group) : p.group) + "] ";
            el.appendChild(g);
        }
        var r = document.createElement("span");
        nameNodes(r, p.route);
        el.appendChild(r);
    }

    /** 길만 - "가 → 나", 국가숲길 "지리산둘레길 가탄-송정" 은 "가탄 → 송정"(2026-10-12 PC: 머리글 117px 를 넘어 잘림). */
    function routeOnly(name) {
        var p = nameParts(name);
        if (p.route.indexOf(" → ") >= 0) return p.route;
        var e = routeEnds(name);
        // "덕전리 순환" 은 그대로("덕전리 → 덕전리" 가 됐음 - 2026-10-13 PC)
        return e.from && e.to && e.from !== e.to ? e.from + " → " + e.to : p.route;
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 이름표 정리 - 이름을 다듬고, 같은 곳이 여러 이름으로 들어온 것을 하나만 남깁니다
     * (이름이 서로 들어 있고 200m 안, 또는 40m 안이면 같은 곳). 경로 순서 · 짧은 이름 먼저.
     */
    function dedupePois(pois) {
        var key = function (s) { return s.replace(/[\s()·]/g, ""); };
        var list = (pois || []).map(function (p) { return Object.assign({}, p, { name: cleanName(p.name) }); })
            .sort(function (a, b) { return Math.round(+a.dist_m / 20) - Math.round(+b.dist_m / 20) || a.name.length - b.name.length; });
        var kept = [];
        list.forEach(function (p) {
            var k = key(p.name);
            var dup = kept.some(function (w) {
                var d = distM(+w.lat, +w.lon, +p.lat, +p.lon), wk = key(w.name);
                // 이름이 다르면 가까워도 남깁니다 - 같은 자리 이름표는 groupPois 가 한 이름표로 묶습니다
                // 2026-10-09 점검: 같은 이름도 200m 안일 때만 - 3km 떨어진 두 "쉼터" · "약수터" 는 다른 곳입니다
                return (wk === k || wk.indexOf(k) >= 0 || k.indexOf(wk) >= 0) && d < 200;
            });
            if (!dup) kept.push(p);
        });
        return kept;
    }

    /**
     * 순수 함수 - 같은 자리(radiusM 안) 이름표를 한 묶음으로. 코스에 가장 가까운 것이 대표(그림 · 고도), 나머지는 이름만 덧붙입니다
     * (예: 로타리대피소 / 법계사 / 로타리대피소샘터). [{lead, names[], pois[]}] - 대표의 진행 거리 순.
     */
    function groupPois(pois, radiusM) {
        var r = radiusM || 80, groups = [];
        (pois || []).slice().sort(function (a, b) { return (+a.off_route_m || 0) - (+b.off_route_m || 0); }).forEach(function (p) {
            var g = null;
            for (var i = 0; i < groups.length && !g; i++) {
                if (distM(+groups[i].lead.lat, +groups[i].lead.lon, +p.lat, +p.lon) <= r) g = groups[i];
            }
            // 같은 이름은 한 번만(원점회귀는 출발 · 도착 이름표가 같은 자리 같은 이름 - 2026-10-13 홍TV님: 윗새재마을이 두 줄)
            if (g) { g.pois.push(p); if (g.names.indexOf(p.name) < 0) g.names.push(p.name); } else groups.push({ lead: p, names: [p.name], pois: [p] });
        });
        return groups.sort(function (a, b) { return +a.lead.dist_m - +b.lead.dist_m; });
    }

    /**
     * 화면에서 포개지는 이름표 숨기기. items: [{el, prio}] (prio 작을수록 먼저 남김). 남긴 것과 겹치면 el 에 "hid" 를 붙입니다.
     * 3D 로 기울여 보면 떨어진 지점도 화면에서 겹칩니다 - 출발 · 도착 · 지금 위치에 가까운 것을 남깁니다.
     */
    function declutter(items, pad) {
        var p = pad == null ? 3 : pad, kept = [];
        // 자리를 모두 먼저 읽고 그다음 한꺼번에 숨김(2026-11-02 홍TV님 점검: 읽기 · 쓰기를 번갈아 이름표마다 화면 배치를 다시 셈).
        // hid 는 opacity · visibility 만 바꿔 자리는 그대로라 먼저 읽어도 같음
        var sorted = items.slice().sort(function (a, b) { return a.prio - b.prio; }), rects = sorted.map(function (it) { return it.el.getBoundingClientRect(); });
        var hide = rects.map(function (r) {
            if (!r.width) return false;
            var hit = kept.some(function (k) {
                return r.left < k.right + p && r.right > k.left - p && r.top < k.bottom + p && r.bottom > k.top - p;
            });
            if (!hit) kept.push(r);
            return hit;
        });
        sorted.forEach(function (it, i) { it.el.classList.toggle("hid", hide[i]); });
    }

    /**
     * 순수 함수 - 정상 이름표(늘 보이게 할 것)의 번호. 2026-10-10 홍TV님: 백무동 → 천왕봉 → 중산리 미리보기에 제석봉은 보이고
     * 천왕봉이 겹침으로 숨었음. 코스 이름 길(" → ") 가운데 출발이 아닌 이름과 같은 이름표, 없으면 가장 높은 이름표. 없으면 -1.
     * pois: [{name, ele_m}] (같은 자리 묶음이면 names 도 봄).
     */
    function summitIndex(pois, courseName) {
        var route = nameParts(courseName).route.split(" → ").slice(1).map(function (x) { return x.trim(); });
        var best = -1, bestEle = -Infinity;
        (pois || []).forEach(function (p, i) {
            var names = p.names || [p.name];
            var named = names.some(function (n) { return route.indexOf(n) >= 0; }) && !/(탐방지원센터|안내소|매표소|분소|주차장|휴게소|마을)$/.test(p.name);
            var e = p.ele_m == null ? -1 : +p.ele_m;
            var score = (named ? 1e6 : 0) + e;
            if (score > bestEle) { bestEle = score; best = i; }
        });
        return best;
    }

    var JUNCTION = "갈림길";   // routefly-batch 가 넣는 갈림길 이름표 - 지도 글자 대신 산행 화면 미리 알림에 씁니다

    /** 코스 자료(api/course 응답) → 계산하기 쉬운 모양. 갈림길은 이름표와 따로 c.junctions(진행 거리 목록). */
    /** 두루누비 사진 지점 이름("49코스 (거진항~통일안보 공원)_12.3km-0") - 지점 이름표로 쓰지 않음(2026-10-13 PC: 해파랑길 처음 · 끝 이름표). */
    var PHOTO_POI = /_[\d.]+\s*km(-\d+)?$/;
    /** 기계가 붙인 번호 이름("GPX-726" · "WPT012") - 이름표가 아님(2026-10-13 홍TV님: 서해랑길 20코스 지점 730개가 GPX-n. 배치 GpxReader.autoName 과 같게). */
    var AUTO_POI = /^(gpx|wpt|wp|waypoint|point|pt)[-_ ]?\d+$/i;

    var NUMBERED_PARK = /[^\s·→()\d]+\d+\s*\(([^()]+공원)\)/g;
    // "수변공원49까지"(서해랑길 16코스) - 공원 이름 뒤 관리 번호도 뗌
    var PARK_NO = /([가-힣](?:공원|광장))\d+(?![\d)])/g;
    function numberedPark(name) { return name == null ? name : String(name).replace(NUMBERED_PARK, "$1").replace(PARK_NO, "$1"); }

    function fromApi(id, j) {
        var raw = j.pois || [];
        // 사진 지점 이름의 "(가~나)" 는 코스 이름에 출발 · 도착이 없을 때 들머리 · 날머리 이름으로
        var photoEnds = null;
        raw.forEach(function (p) {
            var m = PHOTO_POI.test(String(p.name || "")) && /\(([^~()]+)~([^~()]+)\)/.exec(p.name);
            if (m && !photoEnds) photoEnds = { start: m[1].trim(), end: m[2].trim() };
        });
        var all = raw.filter(function (p) { var n = String(p.name || ""); return !PHOTO_POI.test(n) && !AUTO_POI.test(n.trim()); });
        // OSM 의 띄어 쓴 "남벽분 기점" → 남벽분기점(배치 tidyEnd 와 같게 - 이름표는 배치를 다시 돌리기 전 것도 있음)
        all.forEach(function (p) { if (/\s+기점$/.test(String(p.name || ""))) p.name = String(p.name).replace(/\s+기점$/, "기점"); });
        // 관리 번호가 붙은 공원 이름은 괄호 안 공원 이름으로(서해랑길 50코스 "문화공원11(부안공원)" → 부안공원, 배치 EndNames.firstName 과 같게)
        all.forEach(function (p) { p.name = numberedPark(p.name); });
        // "931 봉" → 931봉(배치 EndNames.firstName 과 같게 - 덕유산 육십령, 2026-10-13 PC)
        all.forEach(function (p) { p.name = String(p.name || "").replace(/^(\d+)\s+(봉|고지)$/, "$1$2"); });
        // 이름 없는 안부에 붙은 번호("안부1")는 뗌 - 번호는 자료가 붙인 것이라 현장에서 알 수 없음
        all.forEach(function (p) { p.name = String(p.name || "").replace(/^안부\s*\d+(\s*\([^()]*\))?$/, "안부"); });   // 실제 이름은 "안부1 (Anbu 1)"
        // 같은 번호가 뒤에 한 번 더 붙은 이름("551계단 551" - 화대종주, 2026-10-13 PC)
        all.forEach(function (p) { p.name = String(p.name || "").replace(/^(\d+)(\S+)\s+\1(\s+[A-Za-z][A-Za-z ]*)?$/, "$1$2"); });   // 실제 이름은 "551계단 551 Stairs"(PC 확인)
        if (j.course && j.course.name) j.course.name = numberedPark(j.course.name);
        var se = j.ends || {};
        // 코스 자기 자료("(거진항~통일안보 공원)")가 서버가 찾은 둘레 이름(고성군관광안내소)보다 먼저(2026-10-13 PC)
        var ends = photoEnds || se.start || se.end ? { start: (photoEnds && photoEnds.start) || se.start, end: (photoEnds && photoEnds.end) || se.end } : null;
        var c = { id: id, course: j.course, info: j.info || null, ends: ends, signs: j.signs || [], spots: j.spots || [], lon: [], lat: [], ele: [], dist: [], markers: [],
                  pois: dedupePois(all.filter(function (p) { return p.name !== JUNCTION; })),
                  junctions: all.filter(function (p) { return p.name === JUNCTION; }).map(function (p) { return +p.dist_m; })
                      .sort(function (a, b) { return a - b; }) };
        (j.points || []).forEach(function (p) {
            c.lon.push(+p[0]); c.lat.push(+p[1]); c.ele.push(p[2] == null ? null : +p[2]); c.dist.push(+p[3]);
        });
        c.total = c.dist.length ? c.dist[c.dist.length - 1] : 0;
        c.asc = cumAscent(c.ele);
        endPois(c);
        return c;
    }

    /**
     * 출발 · 도착 자리에 이름표가 없으면 코스 이름의 출발 · 도착 이름으로 하나씩(지도 · 고도 그래프 이름표).
     * 2026-10-12 PC: 국가숲길(kmf) 코스는 이름표가 없어 그래프 이름 0개 · 지도 "출발 · 도착" 만 - "지리산둘레길 가탄-송정" 이면 가탄 · 송정.
     */
    function endPois(c) {
        var n = c.lon.length - 1, e = routeEnds(c.course && c.course.name);
        if (n < 1) return;
        // 이름에 출발 · 도착이 없으면 서버가 찾은 둘레 다른 코스 끝 이름(api/course ends - 2026-10-13 홍TV님: 모든 산 · 걷기 · 자전거 "출발" 대신 들머리 이름)
        e = { from: e.from || (c.ends && c.ends.start) || null, to: e.to || (c.ends && c.ends.end) || null };
        // 코스 끝 이름이 탐방지원센터 같은 들머리면, 그 끝 500m 안 다른 들머리 이름표(배치가 지도용으로 받은 OSM 주차장 · 안내소)는 빼고
        // (2026-10-13 PC: 중산리 출발 이름표가 "중산리탐방안내소" + "중산리주차장" 두 줄, 그래프 처음 "중산리주차장")
        var HEADISH = /(탐방지원센터|탐방안내소|안내소|분소|매표소|주차장)$/;
        // 길찾기의 들머리 주차장 · 정류장(hike.js accessOf)은 아래 이름표 정리 전 것으로(2026-11-09 PC: 광양 가야산 - 출발 500m 안 주차장 둘 가운데
        // 길에 가까운 "주차장"(37m)만 남고 길 밖 "공영주차장"(255m)이 빠져, 길찾기 창에 주차장 고르기가 안 나왔음). 거꾸로 걷기는 reverseCourse 가 함께 뒤집음
        c.access = c.pois.filter(function (q) { return isAccess(q); });
        c.pois = c.pois.filter(function (q) {
            var nm = String(q.name || "").replace(/\s+/g, "");
            if (!HEADISH.test(nm)) return true;
            if (e.from && HEADISH.test(e.from) && +q.dist_m < 500 && nm !== e.from.replace(/\s+/g, "")) return false;
            if (e.to && HEADISH.test(e.to) && +q.dist_m > c.total - 500 && nm !== e.to.replace(/\s+/g, "")) return false;
            return true;
        });
        // 끝 이름이 "중산리" 처럼 짧으면, 그 끝 500m 안 들머리 이름표(주차장 · 안내소) 가운데 그 낱말이 든 것 하나만(없으면 길에 가장 가까운 것)
        // (2026-10-13 PC: 중산리 → 천왕봉 그래프 처음이 "중산리주차장", 지도에 "대원사집단시설지구주차장" 까지)
        [[e.from, function (q) { return +q.dist_m < 500; }], [e.to, function (q) { return +q.dist_m > c.total - 500; }]].forEach(function (w) {
            if (!w[0] || HEADISH.test(w[0])) return;
            var key = w[0].replace(/\s+/g, "");
            var hs = c.pois.filter(function (q) { return HEADISH.test(String(q.name || "").replace(/\s+/g, "")) && w[1](q); });
            if (hs.length < 2) return;
            var byOff = hs.slice().sort(function (a, b) { return +a.off_route_m - +b.off_route_m; });
            var keep = byOff.filter(function (q) { return String(q.name).replace(/\s+/g, "").indexOf(key) >= 0; }).concat(byOff)[0];
            c.pois = c.pois.filter(function (q) { return hs.indexOf(q) < 0 || q === keep; });
        });
        var near = function (d) { return c.pois.some(function (q) { return Math.abs(+q.dist_m - d) < 60 && +q.off_route_m < 60; }); };
        // 같은 이름 이름표가 그 끝 300m 안에 있으면 더 붙이지 않음(2026-10-12 PC: 중산리 → 천왕봉 은 천왕봉 이름표가 끝 123m 앞 - 두 번 나왔음)
        // 같은 이름이 길에서 떨어져 있으면(설악산 백담사 이름표 - 길에서 117m) 그 이름표를 들머리 · 날머리 자리로 옮김 - "출발" 로 남았었음(2026-10-13 홍TV님)
        var same = function (nm, d) {
            var q = c.pois.filter(function (x) { return x.name === nm && Math.abs(+x.dist_m - d) < 300; })[0];
            if (q && +q.off_route_m >= 60) {
                var k = d ? n : 0;
                q.lat = c.lat[k]; q.lon = c.lon[k]; q.ele_m = c.ele[k]; q.dist_m = d; q.off_route_m = 0; q.end = true;
            }
            return !!q;
        };
        if (e.from && !near(0) && !same(e.from, 0)) c.pois.unshift({ name: e.from, lat: c.lat[0], lon: c.lon[0], ele_m: c.ele[0], dist_m: 0, off_route_m: 0, end: true });
        // 원점회귀(처음 · 끝 이름 같고 300m 안)는 끝 둘레 다른 이름표가 있어도 끝 이름을 붙임(탄금호 순환 그래프 끝이 "루암리" 였음)
        var back = e.from && e.from === e.to && distM(c.lat[0], c.lon[0], c.lat[n], c.lon[n]) < 300;
        // again - 순환 코스 끝(출발과 같은 이름 · 같은 자리)은 그래프에만, 지도에는 출발 이름표 하나(9px 차이로 둘 다 보였음)
        var atEnd = function (nm) { return c.pois.some(function (q) { return q.name === nm && +q.dist_m > c.total - 60; }); };
        if (back ? !atEnd(e.to) : e.to && !near(c.total) && !same(e.to, c.total)) c.pois.push({ name: e.to, lat: c.lat[n], lon: c.lon[n], ele_m: c.ele[n], dist_m: c.total, off_route_m: 0, end: true, again: back });
    }

    /** 국립공원 이름(서버 ParkServlet.PARKS 와 같은 차례). */
    var PARKS = ["지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산", "오대산", "주왕산",
        "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산", "팔공산"];

    /**
     * 순수 함수 - 코스 이름이 국립공원 이름으로 시작하면 그 공원("지리산 · 백무동 → 천왕봉" · "지리산 자락 21코스" · "지리산(천왕봉) 1코스" → 지리산).
     * 아니면 null. 2026-10-10 홍TV님: 공원 전체 보기 · 공식 안내도 바로가기.
     */
    function parkOf(name) {
        var n = String(name || "").replace(/^\[|\]/g, "").trim();
        for (var i = 0; i < PARKS.length; i++) {
            var p = PARKS[i];
            if (n.indexOf(p) === 0 && (n.length === p.length || /[\s·(]/.test(n.charAt(p.length)))) return p;
        }
        return null;
    }

    /** 순수 함수 - 인증센터 도장 열쇠("섬진강댐인증센터" · "섬진강댐 인증센터" · "섬진강댐" → "섬진강댐"). */
    /**
     * 위치를 서버로 보내지 않기(2026-10-11 위치기반서비스 비신고 요건 ② - 위치는 단말기에서만 쓰고 사업자 시스템으로 보내지 않음):
     * 내 둘레 코스를 찾을 때 서버에는 모든 사용자에게 같은 고정 격자 칸(GRID_DEG, 약 10km)만 물어, 요청이 내 위치를 담지 않게 합니다
     * (그 칸으로 지도를 옮겨 본 사람과 같은 요청). 거리 계산 · 고르기는 핸드폰이 합니다.
     */
    var GRID_DEG = 0.1;

    /** 순수 함수 - 범위 [서, 남, 동, 북] 을 고정 격자 칸 경계로 바깥쪽으로 넓힘. */
    function snapOut(bb, cell) {
        cell = cell || GRID_DEG;
        var k = 1e6;   // 0.1 배수의 소수 오차(0.30000000000000004) 없이
        function down(v) { return Math.round(Math.floor(v / cell + 1e-9) * cell * k) / k; }
        function up(v) { return Math.round(Math.ceil(v / cell - 1e-9) * cell * k) / k; }
        return [down(bb[0]), down(bb[1]), up(bb[2]), up(bb[3])];
    }

    /** 순수 함수 - 주소의 % 글자 풀기. 깨진 값(#c=%E0)이면 예외 대신 null - 화면이 멈추지 않게(2026-10-11 오픈 전 점검). */
    function safeDecode(s) {
        try { return decodeURIComponent(s); } catch (e) { return null; }
    }

    /**
     * 🎒 추천 상품 상품 하나(2026-11-03 홍TV님 "가민 택틱스 8", 챙길 것 목록은 뺌) - 쿠팡 파트너스 배너(이미지 + 텍스트) 그림을 원래 크기로, 그림 전체가 링크.
     * 그림은 줄이지 않음(2026-11-03 홍TV님 "1로 해줘" - 72px 로 줄이니 글이 안 읽혔음). 배너 안 이름은 한 줄로 잘려 그림 아래에 이름 전체를 글로(같은 날 "대부분 짤리잖아"), 그림 설명(alt)도 이름.
     * f - api/partners 의 featured {name, img, href}(서버가 쿠팡 주소인지 봄). 그림은 화면에 가까워질 때 받음(loading=lazy). 없으면 null.
     */
    /** 순수 함수 - api/partners 의 featured(여러 개, 2026-11-03 홍TV님 "5개쯤 넣어 놓고 랜덤하게")에서 하나를 고름. rnd 는 0 이상 1 미만(없으면 Math.random). 없으면 null. */
    function featuredPick(list, rnd) {
        var l = Array.isArray(list) ? list : list ? [list] : [];
        if (!l.length) return null;
        var r = rnd == null ? Math.random() : rnd;
        return l[Math.min(l.length - 1, Math.floor(r * l.length))];
    }
    function featuredCard(f) {
        if (!f || !/^https:\/\//.test(f.href || "") || !/^https:\/\//.test(f.img || "") || !f.name) return null;
        var a = document.createElement("a"), img = document.createElement("img");
        a.href = f.href; a.target = "_blank"; a.rel = "noopener sponsored"; a.className = "rfFeat";
        a.style.cssText = "display:block;width:fit-content;max-width:100%;margin:4px auto 12px;border-radius:12px;overflow:hidden;line-height:0;text-decoration:none";   // 이름 글 밑줄 없음(2026-11-04 홍TV님)
        img.src = f.img; img.alt = f.name; img.loading = "lazy";
        img.style.cssText = "display:block;max-width:min(100%,240px);height:auto;background:#fff";
        a.appendChild(img);
        // 상품 이름 전체를 그림 아래 글로(2026-11-03 홍TV님 "제품 설명이 그림 안에 있으니 대부분 짤리잖아" - 배너 안 이름은 한 줄로 잘림)
        var cap = document.createElement("span");
        cap.textContent = f.name;
        cap.style.cssText = "display:block;max-width:240px;padding:8px 2px 0;line-height:1.45;font-size:14px;color:inherit;text-align:center;word-break:keep-all;overflow-wrap:anywhere";
        a.appendChild(cap);
        return a;
    }
    /**
     * 순수 함수 - 코스 목록에 든 노선(국토종주 자전거길 osmb- · 국가숲길 kmf- · 코리아둘레길 drnb-)의 노선 안내도(route.html) 카드.
     * [{prefix 또는 trail, name, kind, n}],
     * 코스가 많은 노선 먼저. 이름은 "국토종주 섬진강 자전거길 1구간 · …" → 섬진강 자전거길, "지리산둘레길 주천-운봉" → 지리산둘레길.
     * 2026-10-12 홍TV님: 국토종주 자전거길 지도(나무위키 노선도)처럼 노선 전체를 한 장으로.
     */
    function routeGuides(rows, max, series, q) {
        var by = {}, order = [];
        // 다른 자료의 같은 노선(산림청 "금호남정맥 · …" = OSM 금남호남정맥) - series.json 의 이름 · aka 와 무리 이름이 같으면 그 노선(2026-10-12 PC)
        var named = {};
        (series || []).forEach(function (s) {
            if (!s.prefix) return;
            [s.name].concat(s.aka || []).forEach(function (n) { named[String(n).replace(/\s+/g, "")] = s; });
        });
        (rows || []).forEach(function (r) {
            var id = String(r.course_id || ""), m = /^((osmb|kmf|osmh)-[0-9]+-)/.exec(id);
            var alias = !m && named[String(nameParts(r.name).group || "").replace(/\s+/g, "")];
            if (alias) {
                var ak = /^((osmb|kmf|osmh)-[0-9]+-)/.exec(alias.prefix);
                if (!ak) return;
                if (!by[ak[1]]) { by[ak[1]] = { prefix: ak[1], name: alias.name, kind: ak[2] === "osmb" ? "bike" : ak[2] === "osmh" ? "ridge" : "walk", n: 0 }; order.push(by[ak[1]]); }
                by[ak[1]].n++;
                return;
            }
            // 코리아둘레길(두루누비 drnb-) - 코스 ID 에 노선 묶음이 없어 이름("해파랑길 1코스 · …")으로 묶음, trail 로 찾음
            if (!m && /^drnb-/.test(id)) {
                var tn = (nameParts(r.name).group || String(r.name || "")).replace(/\s*\d+(?:-\d+)?\s*(?:코스|\().*$/, "").trim();   // "64-3(지선3코스)" 도 번호에서 뗌(2026-11-03 코스 점검 - "서해랑길 64-3(지선" 카드가 따로 생겼음)
                if (!tn || tn === String(r.name || "").trim()) return;
                var tk = "trail:" + tn.replace(/\s+/g, "");
                if (!by[tk]) { by[tk] = { trail: tn, name: tn, kind: "walk", n: 0 }; order.push(by[tk]); }
                by[tk].n++;
                return;
            }
            if (!m) return;
            if (!by[m[1]]) {
                var g = nameParts(r.name).group, nm = g ? g : String(r.name || "").split(/\s+/)[0];
                nm = nm.replace(/^국토종주\s*/, "").replace(/\s*[0-9]+구간$/, "").trim();
                // ⛰ 는 백두대간 · 정맥만(OSM 등산 · 걷기 노선에는 둘레길 한 구간도 있음 - "지리산둘레길 (가탄-송정)")
                by[m[1]] = { prefix: m[1], name: nm, kind: m[2] === "osmb" ? "bike" : m[2] === "osmh" && /대간|정맥/.test(nm) ? "ridge" : "walk", n: 0 };
                order.push(by[m[1]]);
            }
            by[m[1]].n++;
        });
        // 다른 자료의 같은 길 한 구간(OSM "지리산둘레길 (가탄-송정)" ⊂ 국가숲길 지리산둘레길)은 그 길 카드에 맡김 - 2026-10-12 홍TV님
        var key = function (s) { return String(s || "").replace(/\s+/g, ""); };
        order = order.filter(function (g) {
            return !order.some(function (h) { return h !== g && key(h.name) !== key(g.name) && key(g.name).indexOf(key(h.name) + "(") === 0; });   // "백두대간트레일" 은 다른 길
        });
        // 검색어와 이름이 같은 노선을 맨 앞에(2026-10-12 PC: "호남정맥" 에 금남호남정맥(33) 이 호남정맥(32) 보다 위)
        var qk = key(q), same = function (g) { return qk && key(g.name) === qk ? 1 : 0; };
        return order.map(function (g, i) { return { g: g, i: i }; }).sort(function (a, b) { return same(b.g) - same(a.g) || b.g.n - a.g.n || a.i - b.i; })
            .slice(0, max || 3).map(function (x) { return x.g; });
    }

    /**
     * 순수 함수 - 이름 검색 결과에서 그 길 코스만(이름이 길 이름으로 시작 - "해파랑길 1코스 · …"), "n코스" 번호 순.
     * 길 이름의 띄어쓰기는 무시("DMZ 평화의 길" · "DMZ평화의길"). 2026-10-11 코리아둘레길 완주.
     */
    /**
     * 순수 함수 - 코스 · 구간 번호("해파랑길 19-1코스 · …" → "19-1", "백두대간 46구간" → "46"). 없으면 null.
     * 이름 앞(" · " 앞)의 첫 번호 - 2026-10-12 PC: "서해랑길 64-3(지선3코스)" 가 괄호 안 3 으로 읽혀 3코스와 겹쳤음.
     */
    function courseNo(name) {
        var head = String(name || "").split(" · ")[0];
        if (!/코스|구간/.test(head)) return null;
        var m = /(\d+(?:-\d+)?)/.exec(head);
        return m ? m[1] : null;
    }

    /** 순수 함수 - 방위(도) → 8 방위 말(255 → 서남서가 아니라 "서"). 모르면 "". */
    function azWord(az) {
        if (az == null || isNaN(+az)) return "";
        if (LANG === "en") return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
    }

    /** 순수 함수 - 이름표 글: 위험 "낙석주의", 이름과 종류가 다르면 "미끄럼주의(추락주의)", 조망점 "제석봉 조망점 · 서쪽 0.7km". */
    function spotText(s) {
        if (!s) return "";
        if (LANG === "en") {
            if (s.kind === "danger") return enName(s.info && s.info !== "기타" && s.name.indexOf(s.info) < 0 ? s.name + "(" + s.info + ")" : s.name);
            if (s.kind === "view" && s.view_az != null) return enName(s.name) + " · to the " + azWord(s.view_az) + (s.view_m ? " " + km(+s.view_m) + " km" : "");
            return enName(s.name);
        }
        if (s.kind === "danger") return s.info && s.info !== "기타" && s.name.indexOf(s.info) < 0 ? s.name + "(" + s.info + ")" : s.name;
        if (s.kind === "view" && s.view_az != null) return s.name + " · " + azWord(s.view_az) + "쪽" + (s.view_m ? " " + km(+s.view_m) + "km" : "");
        return s.name;
    }

    /** 순수 함수 - 미리보기 정보 줄에 붙일 말: "⚠️ 위험 2곳 · 🔭 조망점 1곳". 없으면 "". */
    function spotSummary(spots) {
        var n = { danger: 0, view: 0 };
        (spots || []).forEach(function (s) { if (n[s.kind] != null) n[s.kind]++; });
        return [n.danger ? "⚠️ 위험 " + n.danger + "곳" : "", n.view ? "🔭 조망점 " + n.view + "곳" : ""].filter(Boolean).join(" · ");
    }

    /**
     * 2026-10-08 (홍TV님 - 다른 앱 · 친구가 준 GPX 를 열어 따라가기): GPX 글 → /api/course 와 같은 모양
     * {course: {name, kind}, points: [[경도, 위도, 고도|null, 누적 거리]], pois: [{seq, name, lat, lon, ele_m, dist_m}]}.
     * 규칙은 routefly-batch 의 GpxReader · CourseMath.thin 과 같습니다 - 이름공간은 보지 않고 태그 이름만, trk/trkseg/trkpt 를
     * 파일 순서대로 이어 붙이고 trk 가 없으면 rte/rtept, 위경도가 비었거나 범위 밖이거나 (0,0) 인 점은 버림, 이름 없는 wpt 는 버림,
     * 점은 10m 보다 가까우면 솎음(끝점은 남김). 경로 점이 2개보다 적으면 오류. 이름: metadata → trk → rte → 파일 이름.
     * DOMParser 는 외부 엔티티 · DTD 를 받아 오지 않습니다(남이 만든 파일이라).
     */
    var GPX_SPACING_M = 10;

    /**
     * 불러온 GPX 를 이 기기에 둡니다(따라가기 · 코스 미리보기가 같이 씀). 코스 ID "gpx-<글자 지문>"(같은 파일은 같은 ID),
     * 최근 GPX_KEEP 개만. 서버에는 올리지 않습니다.
     */
    var GPX_PREFIX = "gpx-", GPX_LIST_KEY = "rf-gpx-list", GPX_KEEP = 10;
    function isGpxId(id) { return String(id).indexOf(GPX_PREFIX) === 0; }
    function gpxId(text) {
        var h = 5381;
        for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
        return GPX_PREFIX + (h >>> 0).toString(36) + "-" + text.length.toString(36);
    }
    function storeGpx(id, api) {
        var list;
        try { list = JSON.parse(localStorage.getItem(GPX_LIST_KEY) || "[]"); } catch (e) { list = []; }
        list = [id].concat(list.filter(function (x) { return x !== id; }));
        list.slice(GPX_KEEP).forEach(function (old) { try { localStorage.removeItem("rf-" + old); } catch (e) { /* 무시 */ } });
        localStorage.setItem("rf-" + id, JSON.stringify(api));   // 공간이 모자라면 여기서 던집니다(부르는 쪽이 알림)
        localStorage.setItem(GPX_LIST_KEY, JSON.stringify(list.slice(0, GPX_KEEP)));
    }
    function storedGpx(id) {
        try {
            var j = JSON.parse(localStorage.getItem("rf-" + id) || "null");
            if (j) return Promise.resolve(j);
        } catch (e) { /* 아래로 */ }
        return Promise.reject(new Error("이 기기에 그 GPX 가 없습니다. 📂 GPX 열기로 다시 여세요."));
    }

    var GPX_JOIN_M = 60;   // 구간(trk · trkseg) 끝끼리 이 안이면 이어진 길

    /**
     * 순수 함수 - 여러 구간을 한 줄로. 가장 긴 구간에서 시작해 끝이 GPX_JOIN_M 안에 닿는 구간만(필요하면 뒤집어) 붙입니다.
     * 떨어진 구간(옆 가지 · 다른 날 기록)은 뺍니다 - 다 이으면 빈 곳이 곧은 선으로 지도에 그려지고 거리에도 들어갑니다
     * (komount 돌산 4: trk 3개, 빈 곳 241m · 1,396m - 배치는 1.75km, 다 이으면 3.67km).
     */
    function joinSegments(segs) {
        if (!segs.length) return [];
        var len = function (s) { var d = 0; for (var i = 1; i < s.length; i++) d += distM(s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]); return d; };
        var rest = segs.slice().sort(function (a, b) { return len(b) - len(a); });
        var line = rest.shift().slice();
        for (;;) {
            var best = null;
            rest.forEach(function (s, k) {
                var h = line[0], t = line[line.length - 1], a = s[0], z = s[s.length - 1];
                [[distM(t[0], t[1], a[0], a[1]), "tail", false], [distM(t[0], t[1], z[0], z[1]), "tail", true],
                 [distM(h[0], h[1], z[0], z[1]), "head", false], [distM(h[0], h[1], a[0], a[1]), "head", true]].forEach(function (o) {
                    if (o[0] <= GPX_JOIN_M && (!best || o[0] < best.d)) best = { k: k, d: o[0], at: o[1], rev: o[2] };
                });
            });
            if (!best) break;
            var s = rest.splice(best.k, 1)[0].slice();
            if (best.rev) s.reverse();
            line = best.at === "tail" ? line.concat(s) : s.concat(line);
        }
        return line;
    }

    // 2026-10-09 점검: 남이 준 파일이라 크기 · 지점 수에 한도(지점마다 모든 점을 훑어서, 지점이 아주 많으면 화면이 멈춤)
    var GPX_MAX_CHARS = 30 * 1024 * 1024, GPX_MAX_WPT = 1000;
    function gpxToApi(text, fileName) {
        if (String(text || "").length > GPX_MAX_CHARS) throw new Error("GPX 파일이 너무 큽니다(30MB 까지).");
        var doc = new DOMParser().parseFromString(String(text || ""), "application/xml");
        var root = doc.documentElement;
        if (!root || (root.localName || root.nodeName) !== "gpx" || doc.getElementsByTagName("parsererror").length) {
            throw new Error("GPX 파일이 아닙니다.");
        }
        function kids(el, name) {
            var out = [];
            if (!el) return out;
            for (var n = el.firstElementChild; n; n = n.nextElementSibling) if ((n.localName || n.nodeName) === name) out.push(n);
            return out;
        }
        function first(el, name) { return kids(el, name)[0] || null; }
        function txt(el) { var t = el && el.textContent != null ? el.textContent.trim() : ""; return t === "" ? null : t; }
        function numOf(s) { var v = s == null || String(s).trim() === "" ? NaN : Number(s); return v; }
        function valid(lat, lon) { return isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0); }
        function point(el) {
            var lat = numOf(el.getAttribute("lat")), lon = numOf(el.getAttribute("lon")), e = numOf(txt(first(el, "ele")));
            return valid(lat, lon) ? [lat, lon, isFinite(e) ? e : null] : null;
        }
        var segs = [];
        kids(root, "trk").forEach(function (t) { kids(t, "trkseg").forEach(function (s) {
            var seg = [];
            kids(s, "trkpt").forEach(function (p) { var q = point(p); if (q) seg.push(q); });
            if (seg.length) segs.push(seg);
        }); });
        if (!segs.length) kids(root, "rte").forEach(function (r) {
            var seg = [];
            kids(r, "rtept").forEach(function (p) { var q = point(p); if (q) seg.push(q); });
            if (seg.length) segs.push(seg);
        });
        var raw = joinSegments(segs);
        if (raw.length < 2) throw new Error("GPX 에 경로 점이 2개보다 적습니다(trk · rte).");
        // 솎기 - CourseMath.thin 과 같은 규칙
        var pts = [raw[0]], kept = raw[0], last = raw.length - 1;
        for (var i = 1; i < last; i++) {
            if (distM(kept[0], kept[1], raw[i][0], raw[i][1]) >= GPX_SPACING_M) { pts.push(raw[i]); kept = raw[i]; }
        }
        if (pts.length > 1 && distM(kept[0], kept[1], raw[last][0], raw[last][1]) < GPX_SPACING_M / 2) pts[pts.length - 1] = raw[last];
        else pts.push(raw[last]);
        var points = [], d = 0;
        pts.forEach(function (p, k) {
            if (k) d += distM(pts[k - 1][0], pts[k - 1][1], p[0], p[1]);
            points.push([p[1], p[0], p[2] == null ? null : Math.round(p[2] * 10) / 10, Math.round(d)]);
        });
        var pois = [];
        kids(root, "wpt").slice(0, GPX_MAX_WPT).forEach(function (w) {
            var lat = numOf(w.getAttribute("lat")), lon = numOf(w.getAttribute("lon")), nm = txt(first(w, "name"));
            if (nm && nm.length > 80) nm = nm.slice(0, 80);
            if (!valid(lat, lon) || nm == null) return;
            var best = 0, bd = Infinity;
            points.forEach(function (p, k) { var x = distM(lat, lon, p[1], p[0]); if (x < bd) { bd = x; best = k; } });
            var e = numOf(txt(first(w, "ele")));
            pois.push({ name: nm, lat: lat, lon: lon, ele_m: isFinite(e) ? e : null, dist_m: points[best][3], off_route_m: Math.round(bd) });
        });
        pois.sort(function (a, b) { return a.dist_m - b.dist_m; });
        pois.forEach(function (p, k) { p.seq = k + 1; });
        var name = txt(first(first(root, "metadata"), "name")) || txt(first(first(root, "trk"), "name")) || txt(first(first(root, "rte"), "name"))
            || String(fileName || "GPX").replace(/\.gpx$/i, "");
        var type = (txt(first(first(root, "trk"), "type")) || "").toLowerCase();
        var kind = /bik|cycl|자전거|ride/.test(type) ? "bike" : /walk|걷기/.test(type) ? "walk" : "hike";
        // 요약 칸(서버 코스와 같은 이름) - 목록 · 코스 미리보기 거리 줄이 씁니다(없으면 "-km · 약 NaN분")
        var up = 0, down = 0, ref = null, lo = null, hi = null;
        points.forEach(function (p) {
            var e = p[2];
            if (e == null) return;
            lo = lo == null ? e : Math.min(lo, e);
            hi = hi == null ? e : Math.max(hi, e);
            // GPS 고도 흔들림은 3m 넘게 바뀔 때만 셉니다
            if (ref == null) ref = e;
            else if (e - ref >= 3) { up += e - ref; ref = e; }
            else if (ref - e >= 3) { down += ref - e; ref = e; }
        });
        var a = pts[0], z = pts[pts.length - 1];
        var course = { name: name, kind: kind, distance_m: points[points.length - 1][3], point_cnt: points.length,
                       ascent_m: hi == null ? null : Math.round(up), descent_m: hi == null ? null : Math.round(down),
                       ele_min_m: lo == null ? null : Math.round(lo), ele_max_m: hi == null ? null : Math.round(hi),
                       start_lat: a[0], start_lon: a[1], end_lat: z[0], end_lon: z[1] };
        return { course: course, points: points, pois: pois };
    }

    /**
     * 누적 오르막(m) - 남은 오르막을 빨리 구하려고 미리 셉니다. 배치(CourseMath.elevation, course.ascentThresholdM 5m)와 같게
     * 5m 넘게 바뀔 때만 셉니다 - 2026-10-12 PC: 노선 안내도 "오르막 1,012m"(DB) · 따라가기 "남은 오르막 1,191m"(잔 오르내림까지 더함)이 달랐음.
     */
    var ASCENT_STEP_M = 5;
    function cumAscent(ele) {
        var asc = [0], ref = null, up = 0;
        for (var i = 0; i < ele.length; i++) {
            var e = ele[i];
            if (e != null) {
                if (ref == null) ref = e;
                else if (e - ref >= ASCENT_STEP_M) { up += e - ref; ref = e; }
                else if (ref - e >= ASCENT_STEP_M) ref = e;
            }
            if (i > 0) asc.push(up);
        }
        return asc;
    }

    /** 순수 함수 - 코스 이름을 거꾸로: "송산 · 들머리 → 정상" → "송산 · 정상 → 들머리". 화살표가 없으면 "(거꾸로)" 를 붙입니다. */
    function reverseName(name) {
        name = name || "";
        var a = name.indexOf(" → ");
        // "무등산 · 가에서" ↔ "무등산 · 가까지"(이은 구간의 첫 · 끝 조각 이름 - 거꾸로 이어도 처음 · 끝 이름이 남게)
        var one = a < 0 && /^(.*?)(\S+?)(에서|까지)$/.exec(name);
        if (one) return one[1] + one[2] + (one[3] === "에서" ? "까지" : "에서");
        // 국가숲길 "지리산둘레길 가탄-송정" → "지리산둘레길 송정-가탄"(2026-10-12 PC: "(거꾸로)" 대신)
        var ab = a < 0 && /^(.*?)([가-힣]+)-([가-힣]+)(\s*\)?\s*)$/.exec(name);
        if (ab) return ab[1] + ab[3] + "-" + ab[2] + ab[4];
        // 2026-10-23 지리산: 두 번 뒤집으면 "(거꾸로) (거꾸로)" 가 붙었음 - 떼어 원래 이름으로
        if (a < 0) return / \(거꾸로\)$/.test(name) ? name.slice(0, -6) : name + " (거꾸로)";
        var dot = name.lastIndexOf(" · ", a);
        var head = dot >= 0 ? name.slice(0, dot + 3) : "";
        return head + name.slice(head.length).split(" → ").reverse().join(" → ");
    }

    /**
     * 코스를 거꾸로(끝 → 처음) - 올라가다 되돌아 내려올 때 그 길로 안내하려고. 이름표 · 갈림길 거리도 뒤집습니다.
     * c.rev 는 원래 방향인지(저장한 산행을 이어 갈 때 다시 뒤집으려고).
     */
    function reverseCourse(c) {
        // 위치표지 · 위험지역 · 공식 정보는 자리(좌표)로 쓰므로 그대로 - 예전에는 빠져 거꾸로 걸으면 가까운 위치표지가 안 나왔음
        var T = c.total, r = { id: c.id, rev: !c.rev, markers: [], lon: c.lon.slice().reverse(), lat: c.lat.slice().reverse(),
                               ele: c.ele.slice().reverse(), total: T, signs: c.signs || [], spots: c.spots || [], info: c.info || null, parts: c.parts };
        r.course = {};
        for (var k in c.course) if (Object.prototype.hasOwnProperty.call(c.course, k)) r.course[k] = c.course[k];
        r.course.name = reverseName(c.course.name);
        // 거꾸로 걸으면 오르막 ↔ 내리막, 처음 ↔ 끝(2026-11-03 코스 점검: 3D 시간 · 난이도가 원래 방향 값이었음). 내리막을 모르면 점으로 셈한 오르막
        r.asc = cumAscent(r.ele);
        var up = c.course.ascent_m;
        r.course.ascent_m = c.course.descent_m != null ? c.course.descent_m : Math.round(r.asc[r.asc.length - 1] || 0);
        r.course.descent_m = up;
        if (c.course.start_lat != null || c.course.end_lat != null) {
            r.course.start_lat = c.course.end_lat; r.course.start_lon = c.course.end_lon;
            r.course.end_lat = c.course.start_lat; r.course.end_lon = c.course.start_lon;
        }
        r.dist = c.dist.map(function (d) { return T - d; }).reverse();
        r.pois = c.pois.map(function (p) {
            var q = {};
            for (var k2 in p) if (Object.prototype.hasOwnProperty.call(p, k2)) q[k2] = p[k2];
            q.dist_m = T - (+p.dist_m);
            return q;
        }).sort(function (a, b) { return a.dist_m - b.dist_m; });
        r.junctions = (c.junctions || []).map(function (d) { return T - d; }).sort(function (a, b) { return a - b; });
        if (c.access) r.access = c.access.map(function (p) { var q = Object.assign({}, p); q.dist_m = T - (+p.dist_m); return q; });   // 길찾기 주차장 · 정류장(fromApi)
        return r;
    }

    /*
     * 여러 구간 이어 걷기(2026-10-12 홍TV님: 지리산둘레길 위태-하동호에 덕산-위태 · 하동호-삼화실을 이어서).
     * 이은 코스 ID 는 "구간ID,구간ID~,…"(~ 는 그 구간을 거꾸로). 한 구간이면 예전처럼 그 ID 하나.
     */

    /** 순수 함수 - [{id, rev}] → 이은 코스 ID. */
    function joinId(sel) {
        return (sel || []).map(function (s) { return s.id + (s.rev ? "~" : ""); }).join(",");
    }

    /**
     * 순수 함수 - 이은 코스 ID → [{id, rev, base, r0, r1, from, to}]. 이은 것도 자른 것도 아니면 null.
     * 구간 하나는 "코스ID" 또는 자른 구간 "코스ID@0.1234-0.5678:노고단고개>장터목"(코스 길이의 비율 · 끝 이름 - splitTrails),
     * 뒤의 ~ 는 거꾸로. 자른 구간은 base 코스를 받아 sliceCourse 로 자름.
     */
    function parseJoinId(id) {
        id = String(id || "");
        if (id.indexOf(",") < 0 && id.indexOf("@") < 0) return null;
        return id.split(",").filter(Boolean).map(function (s) {
            var rev = /~$/.test(s), one = rev ? s.slice(0, -1) : s;
            var m = /^([^@]+)@([0-9.]+)-([0-9.]+)(?::([^>]*)>(.*))?$/.exec(one);
            return m ? { id: one, rev: rev, base: m[1], r0: +m[2], r1: +m[3], from: m[4] || null, to: m[5] || null }
                : { id: one, rev: rev, base: one, r0: null, r1: null, from: null, to: null };
        });
    }

    /**
     * 순수 함수 - 탐방로를 다른 탐방로 끝이 닿는 곳(갈림길)에서 잘라 작은 구간으로(2026-10-12 홍TV님: 주능선 노고단고개 → 천왕봉 25km 를
     * 장터목 · 세석에서 갈라지는 탐방로와 이어 고를 수 있게). trails: [{id, name, coords, distance_m, ascent_m}], flips: routeFlips.
     * 끝에서 150m 안 · 갈림길끼리 150m 안은 자르지 않음. 자른 구간 id 는 "코스ID@비율-비율:처음>끝", 이름은 "무리 · 처음 → 끝", 오르막은 모름(null).
     */
    /**
     * 순수 함수 - 이 이름을 붙여도 되는 거리(m). 봉우리 · 정상은 한 점이라 120m, 그 밖(고개 · 대피소 · 마을)은 제한 없음(부르는 쪽 한도).
     * 2026-10-13 홍TV님: 정상 291m 아래(산림청 제석봉 코스 조각 끝)가 "천왕봉" 이 되어 깃발이 "도착 천왕봉" 이었음.
     */
    function peakNearM(name) {
        var n = String(name || "").replace(/\s+/g, "").replace(/\(.*\)$/, "");   // "남대봉 (망경봉)"
        if (/(전망대|쉼터)$/.test(n)) return Infinity;
        // 성문 · 바위문(통천문 · 개천문 · 대남문)도 한 점 - 지리산 정상 아래 갈림길이 263m 떨어진 "통천문" 이 됐음
        return /(봉|정상|오름|대)$/.test(n) ? 120 : /문$/.test(n) ? 150 : Infinity;
    }

    function splitTrails(trails, flips, nearM, poiNames) {
        // near 150m - 대피소가 능선에서 조금 떨어짐(음정 → 벽소령 끝 129m). MIN_M 300m - 짧은 조각은 처음 화면에서 10px 도 안 돼
        // 누를 수 없었음(2026-10-12 PC: 북한산 300m 안 34개) - 끝에서 · 갈림길끼리 이만큼 안은 자르지 않음
        // 갈림길끼리는 JOIN_M(100m) 안만 하나로 - 300m 로 합치면 북한산 대동문 · 보국문처럼 가까운 두 갈림길이 하나가 되어 길이 끊겼음(2026-10-12)
        var near = nearM == null ? 150 : nearM, MIN_M = 300, JOIN_M = 100, out = [];
        var ends = (trails || []).map(function (t) {
            var e = routeEnds(t.name), f = flips && flips[t.id];
            // 국립공원 "성판악 탐방로" · "관음사 탐방로" 는 들머리 이름(2026-10-12 홍TV님: 성판악탐방안내소 → … → 백록담)
            var head = !e.from && !e.to && /^(.+?)\s*탐방로$/.exec(nameParts(t.name).route);
            if (head) e = { from: head[1], to: null };
            return { a: t.coords[0], z: t.coords[t.coords.length - 1], an: f ? e.to : e.from, zn: f ? e.from : e.to };
        });
        (trails || []).forEach(function (t, ti) {
            var c = t.coords, cum = [0];
            for (var i = 1; i < c.length; i++) cum.push(cum[i - 1] + distM(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0]));
            var total = cum[cum.length - 1], cuts = [];
            ends.forEach(function (u, ui) {
                if (ui === ti || trails[ui].id === t.id) return;
                [[u.a, u.an], [u.z, u.zn]].forEach(function (pn) {
                    var best = -1, bd = near;
                    for (var k = 0; k < c.length; k++) {
                        var d = distM(pn[0][1], pn[0][0], c[k][1], c[k][0]);
                        if (d < bd) { bd = d; best = k; }
                    }
                    if (best < 0 || cum[best] < MIN_M || cum[best] > total - MIN_M) return;
                    cuts.push({ k: best, name: pn[1] });
                });
            });
            cuts.sort(function (x, y) { return x.k - y.k; });
            var kept = [];
            cuts.forEach(function (x) {
                var prev = kept[kept.length - 1];
                if (prev && cum[x.k] - cum[prev.k] < JOIN_M) { if (!prev.name) prev.name = x.name; return; }
                kept.push(x);
            });
            if (!kept.length || !total || t.merged || t.nocut) { out.push(t); return; }   // 이은 구간(mergeBare)은 자르지 않음 - 따라가기가 자를 수 없음
            var e = ends[ti], g = nameParts(t.name).group || "", title = nameParts(t.name).route;
            // 갈림길 이름을 모르면("동엽령코스" · "성판악 탐방로" 처럼 이름에 출발 · 도착이 없는 탐방로 끝) 300m 안 다른 탐방로의 이름 있는 끝에서
            var named = function (k) {
                var best = null, bd = 300;
                ends.forEach(function (u) {
                    [[u.a, u.an], [u.z, u.zn]].forEach(function (pn) {
                        // "삼거리" · "갈림길" 은 어디인지 모름(2026-10-12 PC: 지리산 "대원교 → 삼거리")
                        if (!pn[1] || /^(삼거리|갈림길|사거리|정상)$/.test(pn[1])) return;
                        var d = distM(pn[0][1], pn[0][0], c[k][1], c[k][0]);
                        if (d < bd) { bd = d; best = d > peakNearM(pn[1]) ? null : pn[1]; }
                    });
                });
                return best;
            };
            // 그 탐방로 자신의 이름표(api/course 의 pois - 이름에 출발 · 도착이 없는 "종주코스" · "성판악 탐방로" 만 받아 옴, 2026-10-12 홍TV님:
            // 덕유산 종주코스 향적봉 · 중봉 · 백암봉 · 동엽령 …, 성판악 속밭대피소 · 진달래밭대피소 …) - 갈림길은 300m, 탐방로 끝은 700m 안
            var own = function (k, lim, end) {
                var pn = poiNames && poiNames[t.id];
                if (!pn || !pn.total) return null;
                var want = cum[k] / total * pn.total, best = null, bd = lim;
                (pn.pois || []).forEach(function (q) {
                    var nm = placeName(q.name);
                    // 탐방로 끝의 "정상" 은 그 산 정상("한라산동능정상" → 한라산 정상)
                    if (end && nm === "정상" && g) nm = g.replace(/^\S+\s+(?=\S+$)/, "") + " 정상";
                    if (!nm || /^(삼각점|정상|안부\s*\d*|갈림길|삼거리|사거리|헬기장|이정표)$/.test(nm)) return;
                    var d = Math.abs(+q.dist_m - want);
                    // 탐방로 끝에서 700m 까지는 봉우리 · 정상만(산 위 끝), 그 밖 이름은 200m 안(2026-10-13 PC: 북한산 "비매칭코스" 끝 229m 앞 청봉사가 끝 이름 · 들머리가 됐음)
                    if (end && d > 200 && !isTopName(nm) && !/(정상|오름|악)$/.test(nm)) return;
                    if (d < bd) { bd = d; best = nm; }
                });
                return best;
            };
            var bounds = [{ k: 0, name: e.an, end: true }].concat(kept, [{ k: c.length - 1, name: e.zn, end: true }]);
            bounds.forEach(function (x) { if (!x.name) x.name = x.end ? own(x.k, 700, true) || named(x.k) : named(x.k) || own(x.k, 300); });
            for (var b = 0; b < bounds.length - 1; b++) {
                var s0 = bounds[b], s1 = bounds[b + 1], r0 = cum[s0.k] / total, r1 = cum[s1.k] / total;
                var from = s0.name || "", to = s1.name || "";
                // 한쪽만 아는 갈림길(탐방로 끝이 아닌 자른 자리)은 "갈림길" - "월하탄 → 갈림길"
                // 모르는 갈림길은 "갈림길", 모르는 탐방로 끝은 원래 탐방로 이름("대청봉코스(백담) → 황장폭포") - 한 탐방로 안에서 이름 방식이
                // 섞이지 않게("(1/4)" 조각 이름은 뺐음, 2026-10-12 PC)
                // "낙타봉까지" · "선정암에서" · "장불재 부근" 같은 이름은 탐방로 이름으로 쓰지 않음("낙타봉까지 → 안양산" 이 됐음 - 2026-10-13 PC)
                var plain = /(에서|까지|부근)$/.test(title) ? null : title;
                if (!from) from = s0.end ? plain || "탐방로 끝" : "갈림길";
                if (!to) to = s1.end ? plain || "탐방로 끝" : "갈림길";
                out.push({ id: t.id + "@" + r0.toFixed(4) + "-" + r1.toFixed(4) + ":" + from + ">" + to, base: t.id,
                           name: (g ? g + " · " : "") + endsText(from, to), coords: c.slice(s0.k, s1.k + 1),
                           distance_m: Math.round((cum[s1.k] - cum[s0.k]) * (+t.distance_m || total) / total), ascent_m: null });
            }
        });
        return dedupeSegs(out);
    }

    /**
     * 순수 함수 - 같은 길이 여러 벌(산림청 코스는 같은 길을 지나는 코스가 많음 · 백무동 탐방로와 주능선의 장터목 → 천왕봉)이면 하나만.
     * 처음 · 끝이 서로 150m 안(같은 방향이든 거꾸로든)이고 길이가 25% 안이면 같은 것 - 먼저 나온 것(자르지 않은 것 먼저)을 남김.
     * 2026-10-12 PC: 겹친 선을 누르면 다른 것이 잡혔음.
     */
    function dedupeSegs(segs) {
        var keep = [], d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        segs.slice().sort(function (x, y) { return (x.base ? 1 : 0) - (y.base ? 1 : 0); }).forEach(function (s) {
            var a = s.coords[0], z = s.coords[s.coords.length - 1], L = +s.distance_m || 0;
            var same = keep.some(function (k) {
                var ka = k.coords[0], kz = k.coords[k.coords.length - 1], kl = +k.distance_m || 0;
                // 150m - 자른 자리가 탐방로마다 조금 다름(장터목 → 천왕봉 1,361m · 1,464m 가 하나로 안 됐음 - 2026-10-12 PC)
                var ends = (d(a, ka) < 150 && d(z, kz) < 150) || (d(a, kz) < 150 && d(z, ka) < 150);
                return ends && Math.abs(L - kl) <= 0.25 * Math.max(L, kl, 1);   // 25% - 같은 길 두 벌(설악산 중청봉 → 대청봉 550 · 436m)
            });
            if (!same) keep.push(s);
        });
        // 원래 차례대로(그리는 차례 · 테스트가 보는 차례)
        return segs.filter(function (s) { return keep.indexOf(s) >= 0; });
    }

    /**
     * 순수 함수 - 이름 없는 탐방로 조각(무등산 knps-pg… 103개가 모두 "무등산" - 2026-10-12 홍TV님: 무등산도 확인)을 갈림길 사이 한 구간으로 잇고
     * 이름을 붙입니다. 두 조각만 만나는 점(갈림길이 아님)은 지나서 이음. 끝 이름은 places(탐방 안내도 지명) 가운데 가까운 것
     * (갈림길 300m · 막다른 끝 600m), 없으면 "갈림길" · "탐방로 끝". 이은 구간 id 는 이은 코스 ID(첫 조각에 처음 이름, 끝 조각에 끝 이름 -
     * 따라가기 제목), 하나뿐이면 "코스ID@0.0000-1.0000:처음>끝". 이름 있는 탐방로는 그대로.
     */
    function mergeBare(trails, places) {
        var bare = [], out = [], d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        (trails || []).forEach(function (t) {
            // 이름이 산 이름뿐인 조각만(무등산 knps-pg "무등산") - "덕유산 · 종주코스" 같은 공식 탐방로까지 잇던 것(2026-10-12 PC)
            // 공단 2017 자료의 이름 없는 조각(knps-pg…)은 배치가 끝 이름을 붙여도("무등산 · 군왕봉까지") 조각이라 이어 붙임(2026-10-13 PC)
            var piece = /^knps-pg/.test(String(t.id));
            if ((String(t.name || "").indexOf(" · ") >= 0 && !piece) || !t.coords || t.coords.length < 2) out.push(t); else bare.push(t);
        });
        if (!bare.length) return out;
        var nodes = [], node = function (p) {
            for (var i = 0; i < nodes.length; i++) if (d(p, nodes[i].p) < 30) return i;
            nodes.push({ p: p, inc: [] });
            return nodes.length - 1;
        };
        bare.forEach(function (t, i) {
            t._a = node(t.coords[0]); t._z = node(t.coords[t.coords.length - 1]);
            nodes[t._a].inc.push(i); nodes[t._z].inc.push(i);
        });
        var nameAt = function (n) {
            var deg = nodes[n].inc.length, best = null, bd = Infinity;
            (places || []).forEach(function (pl) {
                var nm = placeName(pl.name);
                if (!nm || /^(삼각점|정상|갈림길|삼거리|사거리|헬기장|이정표)$/.test(nm)) return;
                var x = d([+pl.lon, +pl.lat], nodes[n].p);
                if (x < bd) { bd = x; best = nm; }
            });
            if (best && bd < (deg === 1 ? 600 : 300)) return best;
            // 가까이 없으면 1.5km 안 지명 쪽("큰암산 쪽 갈림길") - "갈림길 → 갈림길" 만으로는 어디인지 모름
            var kind = deg === 1 ? "끝" : "갈림길";
            return best && bd < 1500 ? best + " 쪽 " + kind : (deg === 1 ? "탐방로 끝" : "갈림길");
        };
        var used = {}, chains = [];
        var walk = function (n, i) {
            var parts = [], cur = n;
            while (i != null && !used[i]) {
                used[i] = true;
                var t = bare[i], rev = t._a !== cur;
                parts.push({ t: t, rev: rev });
                cur = rev ? t._a : t._z;
                var inc = nodes[cur].inc;
                i = inc.length === 2 ? (inc[0] === bare.indexOf(t) && inc[1] !== inc[0] ? inc[1] : inc[0]) : null;
            }
            chains.push({ parts: parts, a: n, z: cur });
        };
        nodes.forEach(function (nd, n) { if (nd.inc.length !== 2) nd.inc.forEach(function (i) { if (!used[i]) walk(n, i); }); });
        bare.forEach(function (t, i) { if (!used[i]) walk(t._a, i); });   // 갈림길 없는 고리
        chains.forEach(function (ch) {
            // 끝 이름: 그 조각 이름의 처음 · 끝(배치가 붙인 이름 - 무등산 · 군왕봉까지) 먼저, 없으면 지명
            var own = function (p, atStart) {
                var e = routeEnds(p.t.name);
                return atStart ? (p.rev ? e.to : e.from) : (p.rev ? e.from : e.to);
            };
            var fp = ch.parts[0], lp = ch.parts[ch.parts.length - 1];
            var A = own(fp, true) || nameAt(ch.a), B = own(lp, false) || nameAt(ch.z), g = nameParts(bare[0].name).group || bare[0].name, coords = [], L = 0;
            ch.parts.forEach(function (p) {
                var c = p.rev ? p.t.coords.slice().reverse() : p.t.coords;
                coords = coords.concat(coords.length ? c.slice(1) : c);
                L += +p.t.distance_m || 0;
            });
            var id;
            if (ch.parts.length === 1) {
                var one = ch.parts[0];
                id = one.t.id + "@0.0000-1.0000:" + (one.rev ? B + ">" + A : A + ">" + B);
                coords = one.t.coords;   // 하나면 원래 방향 그대로(이름도 그 방향으로)
                if (one.rev) { var x = A; A = B; B = x; }
            } else {
                // 이름은 그 조각 선이 그려진 방향으로 적음(선 처음 = 에서, 선 끝 = 까지) - 거꾸로 걷는 조각은 뒤집으면 맞게 바뀜
                id = joinId(ch.parts.map(function (p, k) {
                    var at = function (nm, walkStart) { return walkStart !== p.rev ? nm + ">" : ">" + nm; };
                    var lab = k === 0 ? "@0.0000-1.0000:" + at(A, true) : k === ch.parts.length - 1 ? "@0.0000-1.0000:" + at(B, false) : "";
                    return { id: p.t.id + lab, rev: p.rev };
                }));
            }
            out.push({ id: id, name: g + " · " + endsText(A, B), coords: coords, distance_m: Math.round(L), ascent_m: ch.parts.length === 1 ? ch.parts[0].t.ascent_m : null, merged: true });
        });
        bare.forEach(function (t) { delete t._a; delete t._z; });
        return out;
    }

    /** 순수 함수 - 처음 · 끝 이름 → "가 → 나"(같으면 "가 부근", 한쪽만이면 "가에서" · "나까지", 둘 다 없으면 ""). */
    function endsText(from, to) {
        // 같은 곳이면 "가 부근"(갈림길 · 끝처럼 어디인지 모르는 이름은 그대로 둘)
        if (LANG === "en") return from && to ? (from === to && !/(갈림길|끝)$/.test(from) ? "around " + from : from + " → " + to) : from ? "from " + from : to ? "to " + to : "";
        if (from && to) return from === to && !/(갈림길|끝)$/.test(from) ? from + " 부근" : from + " → " + to;
        if (from) return from + "에서";
        if (to) return to + "까지";
        return "";
    }

    /**
     * 순수 함수 - 코스의 r0 ~ r1(길이 비율) 부분만. 이름표 · 갈림길은 그 안의 것만 거리를 당겨서, 위치표지 · 위험지역은 그대로(자리로 씀).
     * name 은 새 이름("지리산 · 노고단고개 → 장터목") - 끝 이름표는 endPois 가 이 이름으로.
     */
    function sliceCourse(c, r0, r1, name, id) {
        var d0 = Math.max(0, r0) * c.total, d1 = Math.min(1, r1) * c.total;
        // 끝은 d1 에 닿는 첫 점(점 바로 위에서 자르면 그 점까지)
        var i0 = indexAt(c, d0), j1 = indexAt(c, d1), i1 = Math.min(c.lon.length - 1, c.dist[j1] >= d1 - 0.5 ? j1 : j1 + 1), base = c.dist[i0];
        var s = { id: id || c.id, rev: false, markers: [], lon: c.lon.slice(i0, i1 + 1), lat: c.lat.slice(i0, i1 + 1), ele: c.ele.slice(i0, i1 + 1),
                  signs: c.signs || [], spots: c.spots || [], info: null };
        s.dist = c.dist.slice(i0, i1 + 1).map(function (d) { return d - base; });
        s.total = s.dist[s.dist.length - 1];
        s.pois = (c.pois || []).filter(function (p) { return !p.end && +p.dist_m >= base - 1 && +p.dist_m <= base + s.total + 1; }).map(function (p) {
            var q = {};
            for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k];
            q.dist_m = +p.dist_m - base;
            return q;
        });
        s.junctions = (c.junctions || []).filter(function (d) { return d >= base && d <= base + s.total; }).map(function (d) { return d - base; });
        s.course = {};
        for (var k2 in c.course) if (Object.prototype.hasOwnProperty.call(c.course, k2)) s.course[k2] = c.course[k2];
        s.course.name = name || c.course.name;
        s.course.distance_m = Math.round(s.total);
        s.asc = cumAscent(s.ele);
        // 내리막 · 최고 · 최저 · 두 끝도 자른 구간 것으로(2026-11-03 코스 점검: 오르기만 하는 앞 절반에 코스 전체의 내리막 1,000m 가 남아 3D 시간 · 난이도가 틀렸음)
        var asc = s.asc[s.asc.length - 1] || 0, rg = eleRange(s);
        s.course.ascent_m = Math.round(asc);
        s.course.descent_m = descentOf(s, asc);
        s.course.ele_min_m = rg[0] == null ? null : Math.round(rg[0]);
        s.course.ele_max_m = rg[1] == null ? null : Math.round(rg[1]);
        s.course.start_lat = s.lat[0];
        s.course.start_lon = s.lon[0];
        s.course.end_lat = s.lat[s.lat.length - 1];
        s.course.end_lon = s.lon[s.lon.length - 1];
        endPois(s);
        return s;
    }

    /**
     * el 에 이름 글을 넣되 "탐방지원센터" · "탐방안내소" 는 작은 글씨로(2026-10-12 홍TV님: 중산리탐방지원센터 등 - 전체 동일).
     * 글은 textContent 로만(이름에 꺾쇠가 있어도 안전).
     */
    var SMALL_SUFFIX = /(탐방지원센터|탐방안내소)/;
    function nameNodes(el, text) {
        el.textContent = "";
        if (LANG === "en") text = enName(text);   // 따라가기 영어 - 한글 이름은 로마자(2026-10-17)
        String(text == null ? "" : text).split(SMALL_SUFFIX).forEach(function (part, i) {
            if (!part) return;
            if (i % 2) {
                var s = document.createElement("small");
                s.className = "rf-sfx";
                s.textContent = part;
                el.appendChild(s);
            } else el.appendChild(document.createTextNode(part));
        });
    }

    /**
     * 순수 함수 - "… · 새재 원점회귀" 의 들머리 이름을 바꿈("… · 윗새재마을 원점회귀"). 원점회귀 이름이 아니면 그대로,
     * back(제자리로 돌아오는 코스)이면 "설악산 2구간 이어 걷기" → "설악산 2구간 이어 걷기 · 남설악탐방지원센터 원점회귀".
     */
    function headLoopName(name, head, back) {
        var n = String(name || ""), i = n.lastIndexOf(" · ");
        if (!head || (!back && !/원점회귀$/.test(n))) return n;
        if (!/원점회귀$/.test(n) && !routeEnds(n).from) return n + " · " + head + " 원점회귀";
        return (i >= 0 ? n.slice(0, i + 3) : "") + head + " 원점회귀";
    }

    /**
     * 순수 함수 - park-notes 의 trails(공단 자료 이름이 틀리거나 비어 있는 탐방로 - "knps-4016": "백담사 → 소청봉")로 코스 이름을 바로잡음.
     * notes: park-notes.json 의 parks, id: 코스 ID("knps-4016-55eabbcc"). 없으면 그대로. 2026-10-13 홍TV님: "출발" · "도착" 보다 들머리 · 날머리 이름.
     */
    function noteTrailName(notes, id, name) {
        var out = name;
        Object.keys(notes || {}).forEach(function (park) {
            var tr = notes[park] && notes[park].trails;
            Object.keys(tr || {}).forEach(function (k) {
                // 코스 ID 그대로("kmp-2322010639-1") 또는 앞부분("knps-4016" → knps-4016-55eabbcc), 값에 " · " 가 있으면 이름 전체
                if (String(id) !== k && String(id).indexOf(k + "-") !== 0) return;
                out = tr[k].indexOf(" · ") >= 0 ? tr[k] : (nameParts(name).group || park) + " · " + tr[k];
            });
        });
        return out;
    }

    /**
     * 순수 함수 - 공단 코스의 교통(park-notes access): {car: "치인대형주차장 → 토신골탐방지원센터(도보)", url: 공단 교통편 안내} 또는 null.
     * 키는 코스 ID 그대로나 앞부분("knps-7013"), vcurs 는 공단 누리집 코스 번호("120700V002" - 앞 6자리가 공원 번호).
     * 2026-10-14 홍TV님: 가야산1코스 교통편 안내를 코스마다(먼저 가야산).
     */
    function courseAccess(notes, id) {
        var out = null, s = String(id || "");
        Object.keys(notes || {}).forEach(function (park) {
            var ac = notes[park] && notes[park].access;
            Object.keys(ac || {}).forEach(function (k) {
                if (s !== k && s.indexOf(k + "-") !== 0) return;
                var a = ac[k] || {}, v = /^(\d{6})V\d+$/.exec(a.vcurs || "");
                out = { car: a.car || "", url: v ? "https://www.knps.or.kr/front/portal/visit/visitCourseSubMain.do?parkId=" + v[1]
                    + "&vcursId=" + a.vcurs + "&parkNavGb=traffic&menuNo=7020084" : "" };   // traffic = 교통편 탭(guide 는 코스별난이도 탭 - 2026-10-14 PC)
            });
        });
        return out && (out.car || out.url) ? out : null;
    }

    /** 순수 함수 - 이름의 길 부분에서 다른 이름으로("지리산 · 중산리 → 천왕봉" + {중산리: 중산리탐방지원센터}). names 가 없으면 그대로. */
    function aliasName(name, names) {
        if (!names) return name;
        var n = String(name || ""), i = n.indexOf(" · "), head = i > 0 ? n.slice(0, i + 3) : "", route = i > 0 ? n.slice(i + 3) : n;
        return head + route.split(" → ").map(function (x) { return Object.prototype.hasOwnProperty.call(names, x.trim()) ? names[x.trim()] : x; }).join(" → ");
    }

    /**
     * 순수 함수 - 이은 코스 ID(parseJoinId 조각들)와 조각마다 받은 /api/course 답 → 하나로 이은 코스(fromApi 모양). 따라가기 · fly(3D) 가 함께 씀
     * (2026-10-30 홍TV님 "fly(3D) 가 없는데 - 우리가 그 코스를 만들면 되잖아": 대표 코스 숨은벽 · 백운대(밤골)). 조각 하나(갈림길에서 자른 것)도.
     */
    function joinedCourse(id, parts, jsons) {
        var one = function (p, j) {
            var x = fromApi(p.base, j);
            if (x.lon.length < 2) throw new Error("코스 조각 " + p.base + " 의 선이 없습니다");   // 이을 수 없음(2026-10-30 점검: NaN 거리로 그렸음)
            if (p.r0 != null) {
                var g = nameParts(x.course.name).group;
                var label = endsText(p.from, p.to);   // 이은 구간의 첫 조각은 "가에서", 끝 조각은 "나까지"(mergeBare)
                x = sliceCourse(x, p.r0, p.r1, label ? (g || x.course.name) + " · " + label : x.course.name, p.id);
            }
            return x;
        };
        return parts.length === 1 ? one(parts[0], jsons[0])   // 자른 구간 하나 - 거꾸로는 &rev=1 로
            : joinCourses(jsons.map(function (j, i) { var x = one(parts[i], j); return parts[i].rev ? reverseCourse(x) : x; }), id);
    }

    /**
     * 순수 함수(j 를 고침) - /api/course 답 하나(이은 코스의 조각도)를 산 안내(park-notes parks)로 다듬음: 바로잡은 탐방로 이름(noteTrailName),
     * 산마다 다른 지명(설악산 신흥사 → 소공원 - 이름표는 처음 · 끝 300m 안 들머리 · 날머리 자리만). 따라가기 · 3D 가 같게(2026-10-30 점검). → j
     */
    function fixPart(notes, cid, j) {
        if (!j || !j.course) return j;
        j.course.name = noteTrailName(notes, cid, j.course.name);
        var pk = parkOf(j.course.name), nm = pk && notes && notes[pk] && notes[pk].names;
        if (nm) {
            j.course.name = aliasName(j.course.name, nm);
            var T = j.points && j.points.length ? +j.points[j.points.length - 1][3] : 0;
            (j.pois || []).forEach(function (q) {
                if (Object.prototype.hasOwnProperty.call(nm, q.name) && !(+q.off_route_m > 300) && (+q.dist_m < 300 || +q.dist_m > T - 300)) q.name = nm[q.name];
            });
        }
        return j;
    }

    /**
     * 순수 함수(c 를 고침) - 탐방 안내도 대표 코스의 들머리 이름(hn, &head=)을 이름 · 이름표에: 길 이름(tt, &title=)이 없고 원점회귀면 "… 들머리 원점회귀",
     * 처음 100m(원점회귀면 끝 100m 도) 안 이름표는 들머리 이름으로(돌아온 끝은 again), 처음 300m 안에 없으면 맨 앞에 넣음. 따라가기 · 3D 가 같게(2026-10-30).
     */
    function applyHead(c, hn, tt) {
        if (!hn || hn.length > 30 || !c || c.lon.length < 2) return c;
        var back = distM(c.lat[0], c.lon[0], c.lat[c.lat.length - 1], c.lon[c.lon.length - 1]) < 600, total = +c.total || 0;
        if (!tt && (back || /원점회귀$/.test(c.course.name))) c.course.name = headLoopName(c.course.name, hn, true);
        c.pois.forEach(function (q) {
            if (+q.off_route_m > 100) return;   // 길에서 떨어진 것(소공원 정류장 · 화장실)은 그대로
            if (+q.dist_m < 100) q.name = hn;
            else if (back && +q.dist_m > total - 100) { q.name = hn; q.again = true; }   // 돌아온 끝 이름표는 그래프에만
        });
        if (!c.pois.some(function (q) { return q.name === hn && +q.dist_m < 300; }))
            c.pois.unshift({ name: hn, lat: c.lat[0], lon: c.lon[0], ele_m: c.ele[0], dist_m: 0, off_route_m: 0, end: true });
        return c;
    }

    /**
     * 순수 함수 - 주소 hash 에서 이은 코스(대표 코스)의 이름 · 들머리 · 거꾸로(&title= · &head= · &rev=1) 부분만 "&…" 로. 없으면 "".
     * 찜 · 3D 공유 · 되돌아가기가 같은 이름으로 다시 열게(2026-10-30 점검: 찜에서 열면 "6구간 이어 걷기" 로 바뀌었음).
     */
    /**
     * 순수 함수 - 찜에 남길 이은 코스 주소 꼬리: joinHashExtra 에 &title= 이 없으면 지금 보이는 이름의 길(nameParts route)을 넣음
     * (2026-10-30 PC: 탐방 안내도 예시처럼 &head= 만 있는 주소로 찜하면 다시 열 때 "밤골입구 원점회귀" 로 바뀌었음).
     */
    function favJoinExtra(hash, name) {
        var x = joinHashExtra(hash), route = nameParts(name).route;
        if (!/&title=/.test(x) && route && route.length <= 60) x += "&title=" + encodeURIComponent(route);
        return x;
    }

    function joinHashExtra(hash) {
        var h = String(hash || ""), out = "";
        if (/[#&]rev=1(&|$)/.test(h)) out += "&rev=1";
        ["title", "head"].forEach(function (k) {
            var m = new RegExp("[#&](" + k + "=[^&]*)").exec(h);
            if (m && m[1].length <= 200) out += "&" + m[1];
        });
        return out;
    }

    /** 순수 함수 - 이은 코스 조각들의 서로 다른 코스 ID(같은 코스를 앞뒤로 쓰면 한 번만 받게 - 2026-10-30 점검: 밤골 8조각 · 4코스). */
    function partBases(parts) {
        var out = [];
        (parts || []).forEach(function (p) { if (out.indexOf(p.base) < 0) out.push(p.base); });
        return out;
    }

    /** 순수 함수 - partBases 차례로 받은 답들 → 조각 차례 답(조각마다 따로 고치므로 복사). */
    function partAnswers(parts, bases, answers) {
        return parts.map(function (p) { return JSON.parse(JSON.stringify(answers[bases.indexOf(p.base)])); });
    }

    /** 순수 함수 - 코스(fromApi 모양) → /api/course 답 모양 {course, points, pois, info, spots, signs, ends}. 갈림길은 이름표로 되돌림. fly(3D) 가 이은 코스를 받는 길. */
    function toApi(c) {
        var pts = c.lon.map(function (lon, i) { return [lon, c.lat[i], c.ele[i], c.dist[i]]; });
        var at = function (d) {   // 그 거리의 점 자리
            var k = 0;
            while (k < c.dist.length - 1 && c.dist[k + 1] <= d) k++;
            return k;
        };
        var pois = (c.pois || []).slice().concat((c.junctions || []).map(function (d) { var k = at(d); return { name: JUNCTION, lat: c.lat[k], lon: c.lon[k], ele_m: c.ele[k], dist_m: d, off_route_m: 0 }; }));
        pois.sort(function (a, b) { return +a.dist_m - +b.dist_m; });
        return { course: c.course, points: pts, pois: pois, info: c.info || null, spots: c.spots || [], signs: c.signs || [], ends: c.ends || null };
    }

    /**
     * 순수 함수 - 코스 여러 개(이미 걷는 방향으로 돌린 것)를 하나로 잇습니다. 끝과 다음 처음이 떨어져 있으면 그 거리만큼 더함.
     * 이름은 "무리 N구간 · 처음 → 끝", 이름표 · 갈림길 · 위치표지 · 위험지역은 거리를 밀어 모두. id 는 이은 코스 ID, parts 는 [{id, rev}].
     */
    function joinCourses(list, id) {
        var c = { id: id, rev: false, markers: [], lon: [], lat: [], ele: [], dist: [], pois: [], junctions: [], signs: [], spots: [], info: null,
                  parts: parseJoinId(id) || [] };
        list.forEach(function (p, k) {
            var off = 0, skip = 0;
            if (c.lon.length) {
                var n = c.lon.length - 1, gap = distM(c.lat[n], c.lon[n], p.lat[0], p.lon[0]);
                off = c.dist[n] + gap;
                if (gap < 1) { skip = 1; off = c.dist[n]; }
            }
            for (var i = skip; i < p.lon.length; i++) {
                c.lon.push(p.lon[i]); c.lat.push(p.lat[i]); c.ele.push(p.ele[i]); c.dist.push(off + p.dist[i]);
            }
            (p.pois || []).forEach(function (q) {
                var r = {};
                for (var key in q) if (Object.prototype.hasOwnProperty.call(q, key)) r[key] = q[key];
                r.dist_m = off + (+q.dist_m);
                // 이은 곳의 끝 이름표는 하나만(앞 구간 도착 = 다음 구간 출발)
                // 이름표가 끝 이름이든 지점 이름표든(2026-10-12 PC: 원점회귀 그래프에 천왕봉이 바로 붙어 두 번)
                // 이은 곳 둘레 300m 안(2026-10-12 PC: 중산리 → 천왕봉 선은 천왕봉 이름표 123m 뒤에서 끝나고, 다음 구간 끝과도 115m 떨어짐)
                if (k > 0 && +q.dist_m < 150 && c.pois.some(function (o) { return o.name === q.name && Math.abs(+o.dist_m - r.dist_m) < 300; })) return;
                c.pois.push(r);
            });
            (p.junctions || []).forEach(function (d) { c.junctions.push(off + d); });
            c.signs = c.signs.concat(p.signs || []);
            c.spots = c.spots.concat(p.spots || []);
        });
        c.total = c.dist.length ? c.dist[c.dist.length - 1] : 0;
        c.asc = cumAscent(c.ele);
        var first = list[0].course || {}, last = list[list.length - 1].course || {}, g = nameParts(first.name).group;
        // 무리 이름: "지리산둘레길 가탄-송정" 처럼 · 가 없으면 끝의 "가-나" 를 뗀 것, "N구간 · N코스" 도 뗌
        g = String(g || String(first.name || "").replace(/\s*\(?[가-힣]+-[가-힣]+\)?\s*$/, "")).replace(/\s*\d+(?:-\d+)?\s*(?:구간|코스|\().*$/, "").trim();   // "64-3(지선3코스)" 도(routeGuides 와 같게)
        // 자전거길은 "인증센터" 를 뗌(제목이 길어 잘림 - 2026-10-12 PC)
        var short = function (x) { return x ? String(x).replace(/인증센터/g, "") : x; };
        var from = short(routeEnds(first.name).from), to = short(routeEnds(last.name).to);
        // "[백두대간 3구간]" 이 3구간째로 읽혀 헷갈림(2026-10-12 PC) - 번호가 있으면 "2~4구간", 없으면 "3구간 이어 걷기"
        var nos = list.map(function (p) { return courseNo(p.course && p.course.name); });
        var nums = nos.every(Boolean) ? nos.map(function (x) { return +String(x).split("-")[0]; }) : null;
        var unit = /코스/.test(String(first.name || "")) ? "코스" : "구간";
        var span = nums ? Math.min.apply(null, nums) + "~" + Math.max.apply(null, nums) + unit : list.length + "구간 이어 걷기";
        var asc = c.asc[c.asc.length - 1] || 0, down = descentOf(c, asc), rg = eleRange(c), lo = rg[0], hi = rg[1];
        // 처음 자리로 돌아오면 "중산리탐방지원센터 원점회귀"(2026-10-12 홍TV님 - 지리산 대표 원점회귀 코스)
        var back = c.lat.length > 1 && distM(c.lat[0], c.lon[0], c.lat[c.lat.length - 1], c.lon[c.lon.length - 1]) < 600;   // 끝이 출발 600m 안(중산리 ↔ 법계교 257m)
        var route = from && (from === to || back) ? from + " 원점회귀" : endsText(from, to);
        // 등산 조각이 하나라도 있으면 등산(2026-10-30 밤골 대표 코스: 매표소 → 효자길(둘레길 walk) 로 시작해 걷기가 됐음 - 난이도 · 시간이 빠짐)
        var kinds = list.map(function (p) { return p.course && p.course.kind; });
        c.course = { name: g + " " + span + (route ? " · " + route : ""), kind: kinds.indexOf("hike") >= 0 ? "hike" : kinds.indexOf("trek") >= 0 ? "trek" : first.kind,
                     distance_m: Math.round(c.total), ascent_m: Math.round(asc), descent_m: down,
                     ele_min_m: lo == null ? null : Math.round(lo), ele_max_m: hi == null ? null : Math.round(hi),
                     start_lat: c.lat[0], start_lon: c.lon[0], end_lat: c.lat[c.lat.length - 1], end_lon: c.lon[c.lon.length - 1] };
        return c;
    }

    /**
     * 순수 함수 - 코스(점 · 이름표)의 [가장 낮은, 가장 높은] 높이(m, 모르면 null). 이은 코스 · 자른 구간이 같이 씀.
     * 지나는 정상의 공식 높이(서버가 이름표에 ele_official 로 붙임)도 최고에 - 이은 코스는 선 높이만 봐서 백운대 836m 가 808m 로 보였음(2026-10-30 PC).
     */
    function eleRange(c) {
        var lo = null, hi = null;
        c.ele.forEach(function (e) { if (e != null) { lo = lo == null ? e : Math.min(lo, e); hi = hi == null ? e : Math.max(hi, e); } });
        (c.pois || []).forEach(function (q) { if (q.ele_official && q.ele_m != null && !(+q.off_route_m > 160)) hi = hi == null ? +q.ele_m : Math.max(hi, +q.ele_m); });
        return [lo, hi];
    }

    /**
     * 순수 함수 - 이은 코스 이름에 길 이름(#…&title=화엄사 → 노고단 → 천왕봉)을 붙임: "무리 · 길 이름"("N구간 이어 걷기" 는 뗌), 무리가 없으면 길 이름만.
     * 3D · 따라가기가 같이 씀(2026-11-03 코스 점검: 따라가기는 무리 이름이 없으면 오류로 코스를 못 열었음).
     */
    function titledName(name, title) {
        var g = nameParts(name).group;
        return (g || "").replace(/\s*\d+구간 이어 걷기$/, "") + (g ? " · " : "") + title;
    }

    /** 순수 함수 - 오르막 합(asc)과 두 끝 높이로 내리막(m). 끝 높이를 모르면 null. 이은 코스 · 자른 구간이 같이 씀. */
    function descentOf(c, asc) {
        var e0 = c.ele[0], e1 = c.ele[c.ele.length - 1];
        return e0 == null || e1 == null ? null : Math.max(0, Math.round(asc - (e1 - e0)));
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

    /** 경사(%) - d 앞뒤 50m 고도 차. 고도를 모르면 null. */
    function grade(c, d) {
        var a = at(c, Math.max(0, d - 50)), b = at(c, Math.min(c.total, d + 50));
        var run = Math.min(c.total, d + 50) - Math.max(0, d - 50);
        if (a.ele == null || b.ele == null || run < 20) return null;
        return (b.ele - a.ele) / run * 100;
    }

    /** 순수 함수 - 코스 위 d0 → d1 사이에 오른 · 내려간 높이(m). 코스 고도로 셉니다(GPS 고도는 많이 흔들림). */
    function climbBetween(c, d0, d1) {
        var i0 = indexAt(c, Math.min(d0, d1)), i1 = indexAt(c, Math.max(d0, d1));
        var up = c.asc[i1] - c.asc[i0], e0 = c.ele ? c.ele[i0] : null, e1 = c.ele ? c.ele[i1] : null;
        var down = e0 == null || e1 == null ? 0 : Math.max(0, up - (e1 - e0));
        return { up: Math.max(0, up), down: down };
    }

    /** 순수 함수 - 걸음 수 추정. 보폭 = 키 × 0.415(등산은 오르내림으로 10% 짧게). 자전거는 null. */
    function steps(kind, cm, distM) {
        if (kind === "bike") return null;
        var stride = cm / 100 * 0.415 * (kind === "walk" ? 1 : 0.9);
        return Math.round(distM / stride);
    }

    /** d 다음의 이름표(출발 자리 것은 빼고). 없으면 null. */
    /**
     * 경로 밖 이름표(들머리 가는 길의 주차장 · 버스 정류장 - routefly-batch 가 들머리 1km 안에서 넣음).
     * 지도에는 보이되 '다음 지점' · 음성 · 그래프 이름 · 비행 자막에는 쓰지 않습니다.
     */
    function isAccess(p) { return +p.off_route_m > (isTopName(p.name) ? 160 : 100); }

    /**
     * 봉우리 · 고개 이름인가 - 능선 길이 꼭대기를 비켜 가 경로에서 조금 멀어도(배치는 150m 까지 넣음) 경로 위 지점으로 봅니다.
     * 2026-10-10 PC: 상재봉 1코스 소지봉(경로에서 95m)이 지도 · 그래프에 안 보였음.
     */
    function isTopName(name) { return /(봉|산|령|재|고개|峰|정상)(\s*\(.*\))?$/.test(String(name || "").trim()); }

    /** 순수 함수 - 길 → GPX 1.1 글(이름 · 종류 · 점마다 높이 · 시각이 있으면). */
    /**
     * 순수 함수 - 올릴 코스 이름 "북한산 숨은벽 · 밤골 → 백운대 → 우이동"(2026-11-01 홍TV님 "[산 · 코스 이름] 들머리 - 정상 - 날머리").
     * 묶음(산 · 코스 이름)과 길(들머리 → 정상 → 날머리)은 " · " 하나로, 길은 " → " 로 - 목록 · 따라가기가 이 꼴로 들머리 · 날머리를 읽음(nameParts · routeEnds).
     * 칸 안의 " · " · "→" · 괄호는 지움. 빈 칸은 뺌, 길이 없으면 묶음만. 보낸 사람(만든 이)은 이름에 넣지 않고 코스 화면에 따로 한 줄(2026-11-01 홍TV님 "이름은 깨끗하게").
     */
    function courseName(o) {
        function f(x) { return String(x || "").replace(/\s*(·|→)\s*/g, " ").replace(/[()]/g, "").replace(/\s+/g, " ").trim(); }
        o = o || {};
        var head = [f(o.mountain), f(o.title)].filter(Boolean).join(" ");
        var route = [f(o.start), f(o.top), f(o.end)].filter(Boolean).join(" → ");
        return head && route ? head + " · " + route : head || route;
    }

    /** 코스 길이에 맞는 km 표시 간격(1 · 2 · 5 · 10 · 20 · 50km) - 표시가 20개 안쪽이 되게. */
    function kmStep(total) {
        var steps = [1000, 2000, 5000, 10000, 20000, 50000];
        for (var i = 0; i < steps.length; i++) if (total / steps[i] <= 20) return steps[i];
        return 100000;
    }

    /** 순수 함수 - 지점 이름으로 아이콘(이름표 종류는 표에 없어 이름 끝말로 봅니다). */
    /**
     * 이름표 그림. Windows 10 글꼴에도 있는 이모지만 씁니다(🪨 · 🛖 · 🛕 처럼 최근 이모지는 빈칸으로 보임).
     * 걷기길 · 자전거길 지명(해수욕장 · 공원 · 역 · 항 · 다리 · 인증센터)도.
     */
    var UNIV = /^(서울|부산|대구|인천|광주|대전|울산|강원|충북|충남|전북|전남|경북|경남|제주|목포|순천|군산|창원|안동|공주|전주|청주|춘천|원주|강릉|포항|진주|여수|목원|한밭|부경|경상|경기|한림|동아|조선|영남|계명|인하|아주|한남|배재|우석|원광|호남|동신|초당|세한|한서|선문|호서|상지|가톨릭관동)대$/;
    function poiIcon(name) {
        var n = (name || "").replace(/\(.*\)$/, "").trim();
        if (/인증센터/.test(n)) return "🚲";
        if (/(지원센터|안내소|안내센터|분소|매표소|사무소)/.test(name)) return "ℹ️";
        if (/주차장/.test(n)) return "🅿️";
        if (/(정류장|정류소)$/.test(n)) return "🚏";
        if (/케이블카/.test(n)) return "🚡";
        if (/(대피소|산장|쉼터|휴게소)/.test(n)) return "🏠";
        if (/(해수욕장|해변|해안)/.test(n)) return "🏖️";
        if (/(등대|항|포구|선착장|부두)$/.test(n)) return "⚓";
        if (/(역|터미널)$/.test(n)) return "🚉";
        // 학교("…학교" 가 다리 "교" 로 보이지 않게 먼저) - "목포대" 처럼 도시 이름 + 대는 대학(2026-10-13 홍TV님: 서해랑길 20코스 목포대가 바위 🗻). 비선대 · 문장대 같은 바위는 그대로
        if (/(대학교|대학|학교|초교|중교|고교|캠퍼스)$/.test(n) || UNIV.test(n)) return "🏫";
        if (/(대교|다리|교)$/.test(n)) return "🌉";
        if (/(공원|수목원|광장)$/.test(n) || /공원/.test(n)) return "🌳";
        if (/시장$/.test(n)) return "🛒";
        if (/(호|저수지|댐|보)$/.test(n)) return "💧";
        if (/폭포/.test(n)) return "💧";
        if (/(굴|동굴)$/.test(n)) return "🕳️";
        if (/(사|암)$/.test(n)) return "🏯";
        if (/(령|재|고개|치|목)$/.test(n)) return "🚩";
        if (/(봉|산|정상|峰)$/.test(n) || /정상/.test(n)) return "⛰️";
        if (/전망대$/.test(n)) return "🔭";
        if (/(대|바위)$/.test(n)) return "🗻";
        return "📍";
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
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

    /** 종류별 사람 그림(흰색, 24×24) - 비행 화면의 현재 위치 배지. 등산은 스틱 든 등산객, 걷기는 걷는 사람, 자전거는 자전거 탄 사람. */
    var PERSON = {
        hiker: '<g fill="#fff"><circle cx="13" cy="4" r="2.2"/>'
            + '<path d="M11.2 7.6l-2.6 1.6-1 4 1.6.4.8-3 1.2-.6-1 5.2-2.4 5.6 1.8.8 2.4-5.4 1.8 2v5h1.9v-5.8l-2.2-2.6.6-3 1 1.6 2.6.6.4-1.7-2-.5-1.6-2.8c-.5-.8-1.5-1.2-2.4-.9z"/>'
            + '<path d="M18.6 9.2l-1 .2 1.2 13.4h.9z"/></g>',
        walker: '<g fill="#fff"><circle cx="13" cy="4" r="2.2"/>'
            + '<path d="M11.2 7.6l-2.6 1.6-1 4 1.6.4.8-3 1.2-.6-1 5.2-2.4 5.6 1.8.8 2.4-5.4 1.8 2v5h1.9v-5.8l-2.2-2.6.6-3 1 1.6 2.6.6.4-1.7-2-.5-1.6-2.8c-.5-.8-1.5-1.2-2.4-.9z"/></g>',
        cyclist: '<g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
            + '<circle cx="5.5" cy="17" r="3.6"/><circle cx="18.5" cy="17" r="3.6"/>'
            + '<path d="M5.5 17l4-7h6l3 7M9.5 10l3.5 7h-7.5M15.5 10l-1-2.5h-2"/>'
            + '<path d="M12.5 13.5l-2.3-4.2 3.6-2.2 2.4 3.3h2.3" stroke-width="2"/></g>'
            + '<circle cx="16.2" cy="4" r="2.1" fill="#fff"/>'
    };
    function personSvg(kind, size) {
        var s = size || 18;
        return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true">' + PERSON[kindOf(kind).svg] + '</svg>';
    }
    function kindOf(k) { return KINDS[k] || KINDS.hike; }

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

    /** 순수 함수 - 표준 소요 시간(ms): 거리 ÷ 빠르기 + 오르막 ÷ climb + 내리막 ÷ down(KINDS). descM 이 없으면 내리막 0. */
    function standardMs(kind, distM, ascM, descM) {
        var k = kindOf(kind);
        return (distM / 1000 / k.kmh + (k.climb ? (+ascM || 0) / k.climb : 0) + (k.down ? (+descM || 0) / k.down : 0)) * 3600000;
    }
    /** 순수 함수 - 코스 위 d0 → d1 표준 소요 시간(ms) - 그 사이 오르막 · 내리막(climbBetween)을 함께(2026-11-03 홍TV님). */
    function legMs(c, d0, d1) {
        var cl = climbBetween(c, d0, d1);
        return standardMs(c.course && c.course.kind, Math.abs(d1 - d0), cl.up, cl.down);
    }

    /**
     * 순수 함수 - fly(3D) 일정: 출발 시각(ms)에 떠나면 이름표마다 닿는 시각(표준 소요 시간 - 거리 · 오른 높이). 2026-10-14 홍TV님.
     * c: fromApi 결과(dist · asc · pois · total). → {rows:[{name, d, ele, at}], end}
     */
    function scheduleRows(c, startMs, kind) {
        var t = function (d) { var cl = climbBetween(c, 0, d); return startMs + standardMs(kind, d, cl.up, cl.down); };
        var rows = (c.pois || []).filter(function (p) { return p.dist_m != null && +p.dist_m > 50 && +p.dist_m < c.total - 50; })
            .map(function (p) { return { name: p.name, d: +p.dist_m, ele: p.ele_m == null ? null : +p.ele_m, at: t(+p.dist_m) }; });
        return { rows: rows, end: t(c.total) };
    }

    /** 순수 함수 - 기상청 하늘(sky 1 · 3 · 4) · 강수 형태(pty 0 ~ 4) → "☀️ 맑음" 같은 말. */
    function weatherWord(sky, pty) {
        var p = { 1: "🌧 비", 2: "🌨 비/눈", 3: "❄️ 눈", 4: "🌦 소나기" }[+pty];
        if (p) return p;
        return { 1: "☀️ 맑음", 3: "⛅ 구름많음", 4: "☁️ 흐림" }[+sky] || "-";
    }

    /** 순수 함수 - 기상청 날씨누리 동네예보 주소. region {code, name}(api/wx 의 행정동)이 없으면 날씨누리 첫 화면. */
    function kmaLink(region, lat, lon) {
        if (!region || !/^\d{10}$/.test(String(region.code)) || !isFinite(lat) || !isFinite(lon)) return "https://www.weather.go.kr/w/index.do";
        var la = (+lat).toFixed(4), lo = (+lon).toFixed(4);
        return "https://www.weather.go.kr/w/index.do#dong/" + region.code + "/" + la + "/" + lo + "/" + encodeURIComponent(String(region.name || ""))
            + "/LOC/" + encodeURIComponent("위경도(" + (+lat).toFixed(2) + "," + (+lon).toFixed(2) + ")").replace(/%2C/g, ",");   // 날씨누리 주소처럼 쉼표는 그대로
    }

    /** 순수 함수 - 들머리 기온으로 정상 기온 추정(100m 오를 때마다 0.65℃ 낮게). 높이를 모르면 null. */
    function summitTemp(tmp, startEle, topEle) {
        if (tmp == null || startEle == null || topEle == null) return null;
        return Math.round((tmp - 0.0065 * (topEle - startEle)) * 10) / 10;
    }

    /**
     * 순수 함수 - 체감온도(℃, 기상청 겨울철 식: 기온 10℃ 이하 · 바람 1.3m/s 이상일 때만, 아니면 null). 정상 기온 + 들머리 바람으로 어림.
     * 2026-10-16 홍TV님(추가 기능 6번 강풍) - 산 위는 바람에 체감이 크게 떨어짐.
     */
    function windChill(tmp, wsd) {
        if (tmp == null || wsd == null || tmp > 10 || wsd < 1.3) return null;
        var v = Math.pow(wsd * 3.6, 0.16);
        return Math.round(13.12 + 0.6215 * tmp - 11.37 * v + 0.3965 * tmp * v);
    }

    /**
     * 순수 함수 - 날마다 가장 센 바람(단기예보 wsd, 매시간)으로 경고 줄. 7m/s 넘으면 "바람 강함", 10m/s 넘으면 "강풍".
     * 능선 · 정상은 격자 바람(땅 위 10m)보다 셈. where - 격자 자리 말("들머리" · "정상 둘레"). 몇 시인지도 적음 -
     * 2026-10-16 PC: 산 페이지는 3시간 줄만 보여 줄의 최댓값(7.2)과 경고(20시 8.3)가 안 맞아 보였음. [{day, wsd, hour, text}] - 없으면 빈 배열.
     */
    function windNote(hours, today, where) {
        var max = {};
        (hours || []).forEach(function (h) {
            var d = String(h.t || "").slice(0, 10), w = h.wsd == null ? null : +h.wsd;
            if (d && w != null && isFinite(w) && (max[d] == null || w > max[d].w)) max[d] = { w: w, hour: +String(h.t).slice(11, 13) };
        });
        return Object.keys(max).sort().filter(function (d) { return max[d].w >= 7; }).map(function (d) {
            var w = max[d].w, at = dayLabel(d, today) + " " + max[d].hour + "시 무렵 " + (where || "들머리") + " " + w + "m/s";
            return { day: d, wsd: w, hour: max[d].hour, text: w >= 10
                ? "⚠ 강풍 - " + at + ". 능선 · 정상은 더 세서 몸을 가누기 어렵습니다. 암릉 · 능선 산행은 미루는 것을 생각하세요."
                : "⚠ 바람 강함 - " + at + ", 능선은 더 셉니다. 바람막이 · 모자 끈을 챙기고 암릉에서는 조심하세요." };
        });
    }

    // ------------------------------------------------------------------ ① 고도 그래프

    var PW = 1000, PH = 100;

    /**
     * box 안에 고도 그래프를 그립니다. 지나온 부분은 하늘색, 지점은 빨간 점 + 비스듬한 이름, 아래에 km 눈금.
     * 돌려주는 값: {set(d)} - 지금 위치를 옮깁니다. opts.onSeek(d) 가 있으면 누른 자리로.
     */
    /**
     * 그래프 이름표의 기울어진 글자 상자(네 모서리, 화면 px). CSS 와 같게: 보통은 왼쪽 아래를 축으로 -38°,
     * 끝 이름(.end)은 오른쪽 아래를 축으로 +38°, 둘 다 translate(±2px, -8px).
     */
    function labelRect(x, yTop, w, h, end) {
        var cs = Math.cos(38 * Math.PI / 180), sn = Math.sin(38 * Math.PI / 180);
        var ax = end ? x - 2 : x + 2, ay = yTop + h - 8;
        var u = end ? [-cs, -sn] : [cs, -sn], v = end ? [sn, -cs] : [-sn, -cs];
        var pad = 2;   // 글자 그림자만큼
        ax -= u[0] * pad; ay -= u[1] * pad;
        w += pad * 2;
        return [[ax, ay], [ax + u[0] * w, ay + u[1] * w], [ax + u[0] * w + v[0] * h, ay + u[1] * w + v[1] * h], [ax + v[0] * h, ay + v[1] * h]];
    }

    /** 순수 함수 - 눕힌 이름(.rf-plabel.flat - 점 아래 4px, 끝 이름은 점 왼쪽으로)의 네 꼭짓점. */
    function flatRect(x, y, w, h, end) {
        var l = end ? x - 4 - w : x + 4, t = y + 4;
        return [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
    }

    /** 순수 함수 - 점 위에 눕힌 출발 이름(.rf-plabel.flat.up - 점 오른쪽 위 9px)의 네 꼭짓점. */
    function flatUpRect(x, y, w, h) {
        var l = x + 9, t = y - 9 - h;
        return [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
    }

    /** 순수 함수 - 볼록 사각형 둘이 겹치는가(분리축). */
    function rectsOverlap(a, b) {
        var axes = [a, b].reduce(function (acc, r) {
            for (var i = 0; i < 2; i++) acc.push([r[i + 1][1] - r[i][1], r[i][0] - r[i + 1][0]]);
            return acc;
        }, []);
        return axes.every(function (ax) {
            var pa = a.map(function (p) { return p[0] * ax[0] + p[1] * ax[1]; }), pb = b.map(function (p) { return p[0] * ax[0] + p[1] * ax[1]; });
            return Math.max.apply(null, pa) > Math.min.apply(null, pb) && Math.max.apply(null, pb) > Math.min.apply(null, pa);
        });
    }

    function profile(box, c, opts) {
        opts = opts || {};
        box.textContent = "";
        box.classList.add("rf-profile");
        var eles = c.ele.filter(function (e) { return e != null; });
        if (eles.length < 2) {
            box.appendChild(el("div", "rf-cap rf-empty", tr("고도 자료가 없는 코스입니다 - 거리만 표시합니다.", "No elevation data for this trail - distance only.")));
            return { set: function () {} };
        }
        var min = Math.min.apply(null, eles), max = Math.max.apply(null, eles);
        var pad = Math.max((max - min) * 0.12, 5);
        var lo = min - pad, hi = max + pad * (opts.labels === false ? 1 : 3.2);   // 위쪽은 지점 이름 자리
        function y(e) { return (1 - (e - lo) / (hi - lo)) * PH; }
        var pts = [];
        for (var i = 0; i < c.dist.length; i++) {
            if (c.ele[i] == null) continue;
            pts.push((c.dist[i] / c.total * PW).toFixed(1) + "," + y(c.ele[i]).toFixed(1));
        }
        var uid = "rf" + Math.random().toString(36).slice(2, 8);
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + PW + " " + PH);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML =
            '<defs><linearGradient id="' + uid + 'g" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0" stop-color="' + LINE_COLOR + '" stop-opacity="0.55"/>'
            + '<stop offset="1" stop-color="' + LINE_COLOR + '" stop-opacity="0.06"/></linearGradient>'
            + '<clipPath id="' + uid + 'c"><rect class="done" x="0" y="0" width="0" height="' + PH + '"/></clipPath></defs>'
            + '<polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="rgba(255,255,255,0.10)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
            + '<g clip-path="url(#' + uid + 'c)"><polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="url(#' + uid + 'g)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + LINE_COLOR + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/></g>'
            + '<line class="cursor" x1="0" x2="0" y1="0" y2="' + PH + '" stroke="rgba(255,255,255,0.8)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
        // 자료가 끊긴 구간(opts.gaps = courseGaps) - 그래프에 붉은 띠(2026-10-30 홍TV님 "추천한 것 작업해줘")
        (opts.gaps || []).forEach(function (g) {
            if (!(c.total > 0) || g.at == null) return;
            var r = document.createElementNS(NS, "rect");
            r.setAttribute("x", (g.at / c.total * PW).toFixed(1));
            r.setAttribute("width", Math.max(2, g.m / c.total * PW).toFixed(1));
            r.setAttribute("y", "0");
            r.setAttribute("height", String(PH));
            r.setAttribute("fill", "rgba(255,90,60,0.32)");
            r.setAttribute("class", "gap");
            svg.insertBefore(r, svg.querySelector(".cursor"));
        });
        box.appendChild(svg);

        // km 눈금(아래)
        var step = kmStep(c.total), bw = box.clientWidth || 300;
        for (var m = step; m < c.total - Math.max(step * 0.3, c.total * 0.07) && (c.total - m) / c.total * bw > 64; m += step) {   // 끝의 총 거리(10.45km)와 겹치지 않게
            var t = el("div", "rf-tick", String(Math.round(m / 1000)));
            t.style.left = (m / c.total * 100) + "%";
            box.appendChild(t);
        }
        // 지점 - 빨간 점 + 비스듬한 이름(영상처럼). 이름끼리 실제로 겹치면(기울어진 글자 상자로 셈) 뒤의 것을 뺍니다.
        // 오르막이 이어지면 다음 이름이 앞 이름 위로 올라가 겹치므로 가로 간격만으로는 모자랍니다(지리산 그래프).
        if (opts.labels !== false) {
            var bw = box.clientWidth, bh = box.clientHeight, placed = [], lastX = -1;
            var list = c.pois.filter(function (p) { return !isAccess(p); }).map(function (p) {
                var pd = Math.max(0, Math.min(c.total, +p.dist_m));
                return { p: p, d: pd, a: at(c, pd) };
            }).filter(function (q) { return q.a.ele != null; });
            list.forEach(function (q) {
                var dot = el("div", "rf-pdot");
                dot.style.left = (q.d / c.total * 100) + "%";
                dot.style.top = (y(q.a.ele) / PH * 100) + "%";
                box.appendChild(dot);
            });
            // 이름을 놓는 차례: 출발 · 도착 → 가장 높은 곳 → 나머지는 거리 순
            var top = list.reduce(function (m, q) { return m == null || q.a.ele > m.a.ele ? q : m; }, null);
            // 코스 이름에 든 지점(구기분소 → 대남문 → 구기분소 의 대남문)도 정상처럼 먼저 - 반환점에 옆 봉우리 "잠룡봉" 만 남았었음(2026-10-13 PC)
            var titled = nameParts(c.course && c.course.name).route.split(" → ").map(function (x) { return x.trim(); });
            // 이름 앞이 같아도(제목 "노고단" ↔ 이름표 "노고단고개" - 화대종주, 2026-10-13 PC)
            var inTitle = function (n) { return titled.some(function (t) { return t.length >= 2 && (n === t || n.indexOf(t) === 0); }); };
            // 이름 없는 고갯마루("안부") 같은 흔한 이름은 맨 나중에 - 자리가 남을 때만(2026-10-13 홍TV님: 화대종주 안부1 은 돼지령 → 임걸령 사이 안부)
            var plain = function (n) { return /^(안부|갈림길|삼거리)$/.test(n); };
            var rank = function (q) { return q.d < 60 || q.d > c.total - 60 ? 0 : q === top || inTitle(q.p.name) ? 1 : plain(q.p.name) ? 3 : 2; };
            // 같은 자리면 출발 · 도착 이름표(end) 먼저 - 순환 코스 끝이 옆 지명 "루암리" 로 남았었음(2026-10-13 PC)
            list.slice().sort(function (u, v) { return rank(u) - rank(v) || (v.p.end ? 1 : 0) - (u.p.end ? 1 : 0) || u.d - v.d; }).forEach(function (q) {
                var xp = q.d / c.total * 100;
                if (!bw && lastX >= 0 && Math.abs(xp - lastX) < 6) return;   // 크기를 모를 때(숨은 화면)는 예전처럼 간격으로
                var nm = q.p.name.replace(/\(.*\)$/, "").trim() || q.p.name;
                if (LANG === "en") { nm = enName(nm.replace(/(탐방지원센터|탐방안내소)$/, "") || nm); if (nm.length > 13) nm = nm.slice(0, 12) + "…"; }
                // 길면 탐방지원센터 · 탐방안내소는 떼고("관음사지구탐방지…" 로 잘렸음 - 2026-10-13 PC), 그래도 길면 말줄임
                if (nm.length > 9) nm = nm.replace(/(탐방지원센터|탐방안내소)$/, "") || nm;
                if (nm.length > 9) nm = nm.slice(0, 8) + "…";   // 비스듬한 이름이 길면 그래프 위 칸까지 올라감(전체 이름은 지도 · '다음' 줄에)
                var lb = el("div", "rf-plabel" + (rank(q) < 2 ? " key" : ""), nm);   // key - 출발 · 도착 · 정상(좁은 화면에서도 남김)
                nameNodes(lb, nm);   // 탐방지원센터는 작은 글씨
                lb.title = q.p.name;
                var end = xp > 72;   // 오른쪽 끝 이름은 왼쪽 위로 기울여 잘리지 않게
                if (end) {
                    lb.classList.add("end");
                    lb.style.right = (100 - xp) + "%";
                } else {
                    lb.style.left = xp + "%";
                }
                lb.style.top = (y(q.a.ele) / PH * 100) + "%";
                box.appendChild(lb);
                if (bw) {
                    // 비스듬한 이름이 그래프 위로 삐져나가면(정상이 끝에 있는 짧은 코스 - 위 줄 단추와 겹침) 점 아래에 눕혀 씀
                    // (2026-10-12 홍TV님: 공주향교뒷산 "공주향교뒷산 정상" 이 미리보기 단추 줄까지 올라감)
                    var px = xp / 100 * bw, py = y(q.a.ele) / PH * bh;
                    // 출발 이름은 지금 자리 동그라미(.rf-me, 지름 15px) 오른쪽에서 시작(22px)(2026-10-13 홍TV님: 한계령탐방지원센터의 "한" 이 가렸음)
                    var first = q.d < 60 && !end;
                    if (first) lb.classList.add("first");
                    var r = labelRect(first ? px + 20 : px, py, lb.offsetWidth, lb.offsetHeight, end);
                    if (Math.min(r[0][1], r[1][1], r[2][1], r[3][1]) < -2) {
                        lb.classList.add("flat");
                        r = flatRect(px, py, lb.offsetWidth, lb.offsetHeight, end);
                        // 출발 이름은 지금 자리 동그라미(.rf-me)에 첫 글자가 가렸음 - 점 위로 눕혀 씀(2026-10-13 홍TV님: 한계령탐방지원센터의 "한")
                        if (first) {
                            var ru = flatUpRect(px, py, lb.offsetWidth, lb.offsetHeight);
                            if (ru[0][1] >= -2) { lb.classList.add("up"); r = ru; }
                            else lb.classList.add("past");   // 위로도 넘치면 동그라미 오른쪽으로 비켜
                        }
                    }
                    if (placed.some(function (o) { return rectsOverlap(o, r); })) { box.removeChild(lb); return; }
                    placed.push(r);
                }
                lastX = xp;
            });
        }
        // 최고 - 서버가 정상을 지나는 코스는 공식 높이로 바꿔 보냄(course.ele_max_m, 2026-10-16 PC: 그래프만 선 고도 1,700m 였음). 선보다 낮으면 선 값
        var top = c.course && c.course.ele_max_m != null && +c.course.ele_max_m >= max ? +c.course.ele_max_m : max;
        var capMax = el("div", "rf-cap", tr("최고 ", "top ") + num(top) + "m"); capMax.style.cssText = "left:3px;top:0"; box.appendChild(capMax);
        var capTot = el("div", "rf-cap", km(c.total) + "km"); capTot.style.cssText = "right:3px;bottom:1px"; box.appendChild(capTot);
        var me = el("div", "rf-me");
        box.appendChild(me);

        var cursor = svg.querySelector(".cursor"), done = svg.querySelector(".done");
        if (opts.onSeek) {
            box.style.cursor = "pointer";
            box.onclick = function (ev) {
                var r = box.getBoundingClientRect();
                opts.onSeek(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * c.total);
            };
        }
        return {
            set: function (d) {
                var x = d / c.total * PW;
                cursor.setAttribute("x1", x.toFixed(1));
                cursor.setAttribute("x2", x.toFixed(1));
                done.setAttribute("width", x.toFixed(1));
                var p = at(c, d);
                me.style.left = (d / c.total * 100) + "%";
                me.style.top = p.ele == null ? "50%" : (y(p.ele) / PH * 100) + "%";
            }
        };
    }

    // ------------------------------------------------------------------ ③ 작은 평면 지도

    /**
     * box 안에 북쪽이 위인 평면 지도(SVG). 코스 선 · km 번호(동그라미) · 지점(빨간 점) · 출/도 · 지금 위치.
     * 돌려주는 값: {set(d)}.
     */
    function miniMap(box, c) {
        box.textContent = "";
        box.classList.add("rf-mini");
        var lat0 = c.lat.reduce(function (a, b) { return a + b; }, 0) / c.lat.length;
        var kx = Math.cos(lat0 * Math.PI / 180);
        var xs = c.lon.map(function (v) { return v * kx; }), ys = c.lat.map(function (v) { return -v; });
        var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        var w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6), S = 100 / Math.max(w, h);
        function X(lon) { return (lon * kx - minX) * S + (100 - w * S) / 2; }
        function Y(lat) { return (-lat - minY) * S + (100 - h * S) / 2; }
        var d = c.lon.map(function (lon, i) { return (i ? "L" : "M") + X(lon).toFixed(2) + " " + Y(c.lat[i]).toFixed(2); }).join("");
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "-12 -12 124 124");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        var html = '<path d="' + d + '" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>'
            + '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
            + '<path class="done" d="' + d + '" pathLength="1000" fill="none" stroke="' + LINE_COLOR + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="0 1000"/>';
        var step = kmStep(c.total);
        for (var m = step; m < c.total - step * 0.3; m += step) {
            var p = at(c, m);
            html += '<g transform="translate(' + X(p.lon).toFixed(2) + ' ' + Y(p.lat).toFixed(2) + ')"><circle r="4.6" fill="rgba(0,0,0,0.6)" stroke="#fff" stroke-width="0.9"/>'
                + '<text y="1.9" text-anchor="middle" font-size="5.4" font-weight="bold" fill="#fff">' + Math.round(m / 1000) + '</text></g>';
        }
        c.pois.forEach(function (q) {
            html += '<circle cx="' + X(+q.lon).toFixed(2) + '" cy="' + Y(+q.lat).toFixed(2) + '" r="1.8" fill="#ff4d4f" stroke="#fff" stroke-width="0.6"/>';
        });
        var n = c.lon.length - 1;
        html += '<text x="' + X(c.lon[0]).toFixed(2) + '" y="' + (Y(c.lat[0]) + 9).toFixed(2) + '" text-anchor="middle" font-size="6" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">출</text>'
            + '<text x="' + X(c.lon[n]).toFixed(2) + '" y="' + (Y(c.lat[n]) - 5).toFixed(2) + '" text-anchor="middle" font-size="6" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">도</text>'
            + '<g transform="translate(106 -4)"><path d="M0 -6 L3 2 L0 0.5 L-3 2 Z" fill="#ff4d4f" stroke="#fff" stroke-width="0.5"/>'
            + '<text y="9" text-anchor="middle" font-size="5.5" font-weight="bold" fill="#fff">N</text></g>'
            + '<circle class="me" r="3.4" cx="-50" cy="-50" fill="' + LINE_COLOR + '" stroke="#fff" stroke-width="1.2"/>';
        svg.innerHTML = html;
        box.appendChild(svg);
        var done = svg.querySelector(".done"), me = svg.querySelector(".me");
        return {
            set: function (dd) {
                var f = Math.max(0, Math.min(1, dd / c.total)) * 1000;
                done.setAttribute("stroke-dasharray", f.toFixed(1) + " 1000");
                var p = at(c, dd);
                me.setAttribute("cx", X(p.lon).toFixed(2));
                me.setAttribute("cy", Y(p.lat).toFixed(2));
            }
        };
    }

    /** 순수 함수 - api/air 의 미세먼지 예보(에어코리아, 오늘 · 내일 · 모레) 가운데 그 날 → "미세먼지 보통 · 초미세먼지 좋음(경남 예보)". 없으면 "". 2026-10-15 */
    function airForecastText(a, date) {
        var f = a && a.forecast && a.forecast[date];
        if (!f || (!f.pm10 && !f.pm25)) return "";
        return [f.pm10 ? "미세먼지 " + f.pm10 : "", f.pm25 ? "초미세먼지 " + f.pm25 : ""].filter(Boolean).join(" · ") + "(" + a.region + " 예보)";
    }

    /** 순수 함수 - "최저 7℃ / 최고 19℃", 한쪽만 있으면 그것만("최저 11℃"), 둘 다 없으면 "". 2026-10-15 PC: 낮 자료가 없는 날 "최고 -" */
    function tempRange(tmn, tmx) {
        return [tmn != null ? "최저 " + tmn + "℃" : "", tmx != null ? "최고 " + tmx + "℃" : ""].filter(Boolean).join(" / ");
    }

    /** 순수 함수 - 중기예보 하루(api/mid days 의 값) → ["오전 맑음 · 비 20%", "오후 구름많음 · 비 30%"](하루 한 값이면 한 줄). */
    function midLines(d) {
        if (!d) return [];
        var half = function (n, w, p) { return (n ? n + " " : "") + (w || "-") + (p != null ? " · 비 " + p + "%" : ""); };
        if (d.wfAm === d.wfPm && d.popAm === d.popPm) return [half("", d.wfAm, d.popAm)];
        return [half("오전", d.wfAm, d.popAm), half("오후", d.wfPm, d.popPm)];
    }

    /**
     * 순수 함수 - 산불조심기간(산림보호법 - 봄 2/1 ~ 5/15, 가을 11/1 ~ 12/15, 한국 날짜)이면 안내 글, 아니면 "". 2026-10-15 홍TV님.
     * 통제 구간 자료가 아니라 기간 안내 - 현지 · 공원 누리집 확인을 권함.
     */
    function fireNote(ms) {
        var d = new Date(ms + 9 * 3600000), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
        var season = md >= 201 && md <= 515 ? "봄철" : md >= 1101 && md <= 1215 ? "가을철" : "";
        if (LANG === "en") return season ? "🔥 " + (season === "봄철" ? "Spring" : "Autumn") + " wildfire season - some trails are closed and fire or smoking on the mountain is banned. Check local signs and the park website." : "";
        return season ? "🔥 " + season + " 산불조심기간 - 일부 탐방로는 입산이 통제되고 산에서 불 · 담배는 금지입니다. 현지 안내판 · 공원 누리집을 확인하세요." : "";
    }

    /** 순수 함수 - 코스에서 가장 높은 점(정상)까지 표준 소요 시간(ms). 고도가 없으면 끝까지. */
    function msToTop(c) {
        var i = -1, top = -Infinity;
        (c.ele || []).forEach(function (e, k) { if (e != null && e > top) { top = e; i = k; } });
        if (i < 0) i = c.lat.length - 1;
        return c.asc ? legMs(c, 0, c.dist[i]) : standardMs(c.course && c.course.kind, c.dist[i], 0);
    }

    /** 순수 함수 - 일출을 정상에서 보려면 들머리 출발 시각(ms): 일출 - 오름 시간 - 여유(분, 기본 15). */
    function sunriseStart(sunriseMs, upMs, marginMin) {
        return sunriseMs - upMs - (marginMin == null ? 15 : marginMin) * 60000;
    }

    /** 순수 함수 - 날짜 이름표 "내일 10/16(금)". today 는 "2026-10-15". */
    function dayLabel(date, today) {
        var d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)), t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
        var n = Math.round((d - t) / 86400000), w = "일월화수목금토".charAt(new Date(d).getUTCDay());
        return (["오늘", "내일", "모레", "글피"][n] || "") + (n >= 0 && n <= 3 ? " " : "") + (+date.slice(5, 7)) + "/" + (+date.slice(8, 10)) + "(" + w + ")";
    }

    /**
     * 순수 함수 - 코스 d 지점이 공식 높이 지점(서버 Peaks 가 ele_official 로 표시한 정상 - 100대 명산)에서 50m 안이면 그 높이, 아니면 null.
     * 2026-10-16 홍TV님: 대청봉에 도착했는데 "해발 1,700m"(코스 지형 높이) - 정상에서는 1,708m 로.
     */
    function officialEleAt(c, d) {
        var hit = null;
        ((c && c.pois) || []).forEach(function (q) { if (q.ele_official && q.ele_m != null && Math.abs(+q.dist_m - d) <= 50) hit = +q.ele_m; });
        return hit;
    }

    // ------------------------------------------------------------------ 로마자(Roman.java 를 옮김 - 영어 화면의 지점 이름, 2026-10-16)
    var RO_INI = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
    var RO_VOW = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
    var RO_FS = [0, 1, 1, 1, 2, 2, 2, 3, 4, 1, 5, 4, 4, 4, 6, 4, 5, 6, 6, 3, 3, 7, 3, 3, 1, 3, 6, 3];
    var RO_LINK = ["", "g", "kk", "ks", "n", "nj", "n", "d", "r", "lg", "lm", "lb", "ls", "lt", "lp", "r", "m", "b", "ps", "s", "ss", "ng", "j", "ch", "k", "t", "p", ""];
    var RO_SND = ["", "k", "n", "t", "l", "m", "p", "ng"];
    function roNasal(s) { return s === 1 ? 7 : s === 3 ? 2 : s === 6 ? 5 : s; }
    function roFirst(link) { return { k: 1, n: 4, l: 8 }[link.charAt(0)] || 17; }
    function roWord(w) {
        var ini = [], vow = [], fin = [], b = "", carry = null, len = w.length;
        for (var k = 0; k < len; k++) { var code = w.charCodeAt(k) - 0xAC00; ini.push(Math.floor(code / 588)); vow.push(Math.floor(code % 588 / 28)); fin.push(code % 28); }
        for (k = 0; k < len; k++) {
            b += (carry != null ? carry : RO_INI[ini[k]]) + RO_VOW[vow[k]];
            carry = null;
            if (!fin[k]) continue;
            if (k === len - 1) { b += RO_SND[RO_FS[fin[k]]]; continue; }
            var next = ini[k + 1], snd = RO_FS[fin[k]];
            if (k === len - 2 && w.charAt(k + 1) === "리") { b += RO_SND[snd] + "-"; continue; }
            if (next === 11) {
                var link = RO_LINK[fin[k]];
                if (fin[k] === 21) b += "ng";
                else if (link.length === 2 && ["kk", "ss", "ng", "ch"].indexOf(link) < 0) { b += RO_SND[RO_FS[roFirst(link)]]; carry = link.slice(1); }
                else carry = link;
                continue;
            }
            if (snd === 4 && (next === 5 || next === 2)) { b += "l"; carry = "l"; }
            else if (snd === 2 && next === 5) { b += "l"; carry = "l"; }
            else if (next === 5) { b += RO_SND[roNasal(snd)]; carry = "n"; }
            else if (next === 2 || next === 6) b += RO_SND[roNasal(snd)];
            else b += RO_SND[snd];
        }
        return b;
    }
    /** 순수 함수 - 한글 로마자(국어의 로마자 표기법 - Roman.of 와 같은 결과). "설악산" → "Seoraksan". */
    function roman(s) {
        s = String(s == null ? "" : s);
        return s.replace(/[가-힣]+/g, function (w, i) {
            var r = roWord(w), prev = i > 0 ? s.charAt(i - 1) : "";
            return (/[A-Za-z]/.test(prev) ? " " : "") + (/\d/.test(prev) ? r : r.charAt(0).toUpperCase() + r.slice(1));
        });
    }
    /** 영어로 옮길 낱말(MountainEn.WORDS 와 같은 목록 · 차례 - MountainEnTest 가 봄, 2026-11-07) - 나머지는 로마자. */
    var EN_WORDS = [["남동쪽", "southeast"], ["남서쪽", "southwest"], ["북동쪽", "northeast"], ["북서쪽", "northwest"],
        ["동쪽", "east"], ["서쪽", "west"], ["남쪽", "south"], ["북쪽", "north"], ["들머리", "trailhead"], ["날머리", "trail end"],   // 2026-10-18 PC: 남동쪽 들머리
        ["국립공원", "National Park"], ["국림공원", "National Park"], ["화장실", "restroom"], ["탐방지원센터", "visitor center"], ["탐방안내소", "visitor center"], ["공원지킴터", "ranger post"], ["매표소", "ticket booth"], ["주차장", "parking"],
        ["대피소", "shelter"], ["휴게소", "rest area"], ["삼거리", "junction"], ["사거리", "crossroads"], ["갈림길", "junction"], ["탐방로", "trail"], ["등산로", "trail"],
        ["입구", "entrance"], ["정상", "summit"], ["코스", "course"], ["구간", "section"], ["순환", "loop"], ["왕복", "round trip"], ["분소", "office"],
        // 따라가기 영어(2026-10-17) - 위험지역 · 시설 이름
        ["급경사", "steep slope"], ["낙석", "falling rocks"], ["추락", "fall"], ["미끄럼", "slippery"], ["실족", "slip"], ["주의", "caution"], ["위험", "danger"],
        ["조망점", "viewpoint"], ["전망대", "observatory"], ["약수터", "spring"], ["샘터", "spring"], ["쉼터", "rest spot"], ["헬기장", "helipad"],
        ["구급함", "first-aid box"], ["정류장", "bus stop"],
        ["자전거길", " bike path"], ["관광안내소", " tourist info center"], ["해수욕장", " beach"], ["계곡", " valley"], ["아래", " below"]];
    /** 순수 함수 - 지점 · 코스 이름 영어로(MountainEn.courseName 과 같음). "수렴동대피소" → "Suryeomdong shelter". */
    function enName(ko) {
        // 붙어 쓴 산 이름 + 봉우리 · 고개 · 절은 띄움("설악산대청봉" → "Seoraksan Daecheongbong", MountainEn.courseName 과 같음)
        var s = String(ko == null ? "" : ko).replace(/([가-힣]+산)([가-힣]{1,4}(?:봉|대|령|재|사|암|폭포|계곡))(?![가-힣])/g, "$1 $2");
        s = s.replace(/(^|\s)위(?=\s|\d|$)/g, "$1above");   // 따로 쓴 '위'만("갈림길 위 250m") - 위봉 · 위례 같은 이름은 그대로(2026-10-17 PC)
        EN_WORDS.forEach(function (w) { s = s.split(w[0]).join(" " + w[1] + " "); });
        return roman(s).replace(/([a-z])(\d)/g, "$1 $2").replace(/\s+/g, " ").replace(/ ([)\],])/g, "$1").replace(/([(\[]) /g, "$1").trim();
    }

    // ------------------------------------------------------------------ 난이도 · 안내판 고도 그래프(2026-10-15 홍TV님 - 국립공원 탐방로 안내판처럼)

    /** 5단계 - 색은 공단 탐방로 안내판 범례(매우쉬움 연두 · 쉬움 초록 · 보통 주황 · 어려움 자주 · 매우어려움 검정)에 맞춤. MountainServlet.LEVELS 와 같음. */
    // 영어는 한국어 단계 그대로(2026-11-02 홍TV님 점검: 쉬움이 "Moderate" 로 한 칸씩 밀려 보였음)
    var LEVELS = [{ ko: "매우 쉬움", en: "Very easy", color: "#a3c93a" }, { ko: "쉬움", en: "Easy", color: "#3fae5c" }, { ko: "보통", en: "Moderate", color: "#e8822a" },
                  { ko: "어려움", en: "Hard", color: "#a23a6b" }, { ko: "매우 어려움", en: "Very hard", color: "#3a3f46" }];
    /** 구간 경사(%) 단계 경계 - 안내판 구간 색 · 음성. 코스 난이도는 시간 · 오르막 총량(HOUR_STEPS · ASC_STEPS). MountainServlet 과 같은 값. */
    var SLOPE_STEPS = [5, 10, 18, 28], HOUR_STEPS = [1.5, 3, 5, 8], ASC_STEPS = [300, 700, 1100, 1500], STEEP_STEPS = [20, 28, 36, 46];
    function stepOf(v, steps) { var i = 0; while (i < steps.length && v >= steps[i]) i++; return i; }

    /**
     * 순수 함수 - 등산 코스 난이도 0~4(routefly 기준 - 공단 공식 등급이 아님). 표준 시간(4km/h + 오르막 600m/h) · 오르막 총량 ·
     * 가장 가파른 1km 경사(steep %, 오르막 · 내리막 - 서버 Steep 이 목록에 steep_pct 로 줌, 없으면 뺌) 가운데 높은 단계.
     * 코스가 길어지거나 오르막이 늘면 절대 내려가지 않음 - 2026-10-16 홍TV님: 예전 기준(전체 평균 경사)은 남설악 → 대청봉(4.7km · 1,273m)이 어려움인데
     * 대청봉 → 가라피로 이어 내려가는 10.5km · 1,480m 코스가 평균 경사가 묽어져 보통이었음. 가파른 구간은 📈 고도 · 📋 안내판의 구간 경사로 봄.
     */
    function difficulty(distM, ascM, steep) {
        distM = +distM || 0;
        ascM = +ascM || 0;
        if (distM <= 0) return null;
        var base = Math.max(stepOf(distM / 1000 / 4 + ascM / 600, HOUR_STEPS), stepOf(ascM, ASC_STEPS));
        // 가파름은 한 단계까지 올림(2026-10-16 PC: 문턱 12 · 18 · 25 · 32% 로는 설악산 57 중 47 이 매우 어려움 - 산길은 1km 30 ~ 40% 가 흔함).
        // 다만 가장 가파른 1km 가 36% 이상이면 짧아도 적어도 어려움(2026-10-18 홍TV님: 내장사 → 신선봉 2.2km · 41% 가 보통) - MountainServlet.difficulty 와 같음
        if (steep == null || !isFinite(+steep)) return base;
        var s = stepOf(+steep, STEEP_STEPS);
        return Math.max(base, Math.min(s, s >= 3 ? Math.max(base + 1, 3) : base + 1));
    }

    /** 순수 함수 - 가장 가파른 1km 구간 경사(%, 오르막 · 내리막) - Steep.steepest 와 같음. 1km 보다 짧으면 처음 ~ 끝, 300m 보다 짧거나 고도가 없으면 null. */
    function steepest(dist, ele) {
        var p = [];
        for (var i = 0; i < (dist || []).length; i++) if (ele[i] != null) p.push([+dist[i], +ele[i]]);
        if (p.length < 2) return null;
        var total = p[p.length - 1][0] - p[0][0], best = 0;
        if (total < 300) return null;
        if (total < 1000) best = Math.abs(p[p.length - 1][1] - p[0][1]) / total * 100;
        else for (var a = 0, b = 0; a < p.length; a++) {
            if (b < a) b = a;
            while (b < p.length && p[b][0] - p[a][0] < 1000) b++;
            if (b >= p.length) break;
            best = Math.max(best, Math.abs(p[b][1] - p[a][1]) / (p[b][0] - p[a][0]) * 100);
        }
        return Math.round(best * 10) / 10;
    }

    /** 난이도 표(i.lv) - 거리가 없으면 null. MountainServlet.levelChip 과 같은 모양. */
    function levelChip(distM, ascM, en, steep, info) {
        // 공단 공식 난이도가 있으면 그것 하나만(2026-11-03 홍TV님 점검: 한 코스에 "매우 쉬움" 칩과 공단 "보통(2.57)" 이 함께 나와 헷갈렸음)
        var off = info && info.level != null ? String(info.level).trim() : "";
        if (off) {
            var k = officialLevel(off), o = el("i", "lv" + (k != null ? " lv" + k : ""), en ? "Park service: " + (k != null ? LEVELS[k].en + off.replace(/^[^(]*/, " ").replace(/^ $/, "") : off) : "공단 " + off);
            o.title = en ? "Official difficulty (Korea National Park Service)" : "국립공원공단 공식 난이도";
            return o;
        }
        var lv = difficulty(distM, ascM, steep);
        if (lv == null) return null;
        var i = el("i", "lv lv" + lv, en ? LEVELS[lv].en : LEVELS[lv].ko);
        i.title = en ? "Difficulty (routefly estimate from time and total ascent)" : "난이도(걸리는 시간 · 오르막 총량으로 어림 - 공단 공식 등급 아님)";
        return i;
    }

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

    /** 순수 함수 - 공단 난이도 글("보통(2.57)" · "매우 어려움") → LEVELS 차례(0 ~ 4). 모르는 말이면 null. MountainServlet.officialLevel 과 같음. */
    function officialLevel(text) {
        var t = String(text == null ? "" : text).replace(/\(.*$/, "").replace(/\s+/g, " ").trim();
        for (var i = 0; i < LEVELS.length; i++) if (t === LEVELS[i].ko) return i;
        return null;
    }

    /** 순수 함수 - 기상청 중기예보 날씨 말 → 영어(영어 산 페이지). "구름많고 비" → "⛅ Mostly cloudy, rain". 모르는 말은 그대로. */
    function wfEn(w) {
        if (!w) return "";
        var sky = { "맑음": "☀️ Clear", "구름많음": "⛅ Mostly cloudy", "흐림": "☁️ Overcast" }, m = /^(구름많고|흐리고) ?(.+)$/.exec(w);
        if (sky[w]) return sky[w];
        if (!m) return w;
        var rain = { "비": "rain", "눈": "snow", "비/눈": "rain/snow", "눈/비": "snow/rain", "소나기": "showers" }[m[2]];
        return rain ? (m[1] === "흐리고" ? "☁️ Overcast, " : "⛅ Mostly cloudy, ") + rain : w;
    }

    /** 순수 함수 - 이번 주말 날씨(api/weekend)의 중기예보 권역 이름 → 영어(영어 코스 모음 /en/m/ - 2026-10-17). 모르는 이름은 로마자. */
    var REGION_EN = { "서울 · 인천 · 경기": "Seoul · Incheon · Gyeonggi", "강원 영서": "Gangwon (inland)", "강원 영동": "Gangwon (east coast)",
        "대전 · 세종 · 충남": "Daejeon · Sejong · Chungnam", "충북": "Chungbuk", "광주 · 전남": "Gwangju · Jeonnam", "전북": "Jeonbuk",
        "대구 · 경북": "Daegu · Gyeongbuk", "부산 · 울산 · 경남": "Busan · Ulsan · Gyeongnam", "제주": "Jeju" };
    function regionEn(name) { return REGION_EN[name] || roman(name); }

    /** 순수 함수 - 이번 주말 날씨 말(단기 "맑음" · "비", 중기 "구름많고 비", 오전 → 오후 "맑음 → 흐림") → 영어. */
    function weekendWordEn(word) {
        var one = { "맑음": "☀️ Clear", "구름많음": "⛅ Mostly cloudy", "흐림": "☁️ Overcast", "비": "🌧 Rain", "눈": "❄️ Snow" };
        return String(word || "").split(" → ").map(function (w) { return one[w] || wfEn(w); }).join(" → ");
    }

    /** 쿠팡 파트너스 링크를 보일 때 함께 붙이는 문구(공정거래위원회 추천 · 보증 심사지침 - 경제적 이해관계 표시). */
    var COUPANG_NOTE = "이 안내는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

    /** 순수 함수 - api/air 응답 → "미세먼지 보통(42) · 초미세먼지 좋음(14) - 가야면 측정소 14시". 못 받았으면 "". 2026-10-15 */
    function airText(a) {
        if (!a || a.unavailable || (a.pm10 == null && a.pm25 == null)) return "";
        var parts = [];
        if (a.pm10 != null) parts.push("미세먼지 " + a.pm10Word + "(" + a.pm10 + ")");
        if (a.pm25 != null) parts.push("초미세먼지 " + a.pm25Word + "(" + a.pm25 + ")");
        var hh = /\d{4}-\d\d-\d\d (\d\d):/.exec(a.time || "");
        return parts.join(" · ") + " - " + a.station + " 측정소" + (hh ? " " + (+hh[1]) + "시" : "") + (a.dist_km != null ? "(" + a.dist_km + "km)" : "");
    }

    // ------------------------------------------------------------------ 찜 · 통계 · 백업(2026-10-15 홍TV님)

    /** 찜한 코스 - 이 기기 localStorage "rf-fav" [{id, name, kind, dist, asc, t}], 새로 찜한 것이 앞. */
    var FAV_KEY = "rf-fav", FAV_MAX = 50;
    function favList() {
        try { var l = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    }
    /** 순수 함수 - 찜했는가. */
    function isFav(list, id) { return (list || []).some(function (f) { return f && f.id === id; }); }
    /** 순수 함수 - 찜했으면 빼고, 아니면 맨 앞에 넣음(FAV_MAX 개까지). */
    function favToggle(list, item) {
        list = (list || []).filter(function (f) { return f && f.id; });
        if (isFav(list, item.id)) return list.filter(function (f) { return f.id !== item.id; });
        return [item].concat(list).slice(0, FAV_MAX);
    }
    /**
     * ☆ 찜 단추 - getItem() 이 {id, name, kind, dist, asc} 를 돌려주면(없으면 null - 단추가 안 보임) 누를 때마다 넣고 뺍니다.
     * 돌려준 단추의 refresh() 로 코스가 바뀐 뒤 모양을 다시 맞춥니다.
     */
    function favButton(getItem) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rfFavBtn";
        function paint() {
            var it = getItem(), on = !!it && isFav(favList(), it.id);
            b.hidden = !it;
            b.textContent = on ? "★" : "☆";
            b.classList.toggle("on", on);
            b.title = on ? tr("찜 풀기", "Remove from favorites") : tr("찜하기 - 따라가기 첫 화면 '☆ 찜' 에 모아 둡니다(이 기기에만)", "Add to favorites - listed on the first screen (this phone only)");
            b.setAttribute("aria-label", on ? tr("찜 풀기", "Remove from favorites") : tr("찜하기", "Add to favorites"));
            b.setAttribute("aria-pressed", on ? "true" : "false");
        }
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var it = getItem();
            if (!it) return;
            it.t = Date.now();
            try { localStorage.setItem(FAV_KEY, JSON.stringify(favToggle(favList(), it))); } catch (err) { /* 저장 공간 */ }
            paint();
        });
        b.refresh = paint;
        paint();
        return b;
    }

    /**
     * 순수 함수 - 코스 선에서 점 사이가 minM(기본 250m) 넘게 뛰는 곳(자료가 끊긴 구간) [{at(누적 m), m}] - 따라가기가 알림(2026-10-30 홍TV님 "끊어짐 없이"
     * - 코스 점검(tools/course-audit) 에서 공단 공식 선도 2곳: 설악산 양폭대피소 → 무너미고개 344m · 지리산 추성동 → 천왕봉 315m). c: {lon, lat, dist}.
     */
    function courseGaps(c, minM) {
        var lim = minM || 250, out = [];
        for (var i = 1; c && c.lat && i < c.lat.length; i++) {
            var m = distM(c.lat[i - 1], c.lon[i - 1], c.lat[i], c.lon[i]);
            if (m > lim) out.push({ at: c.dist ? Math.round(+c.dist[i - 1]) : null, m: Math.round(m) });
        }
        return out;
    }

    function tripLink(base, lat, lon, name) {
        var m = /^https:\/\/((?:[a-z0-9-]+\.)*trip\.com)(?=[\/?#]|$)/i.exec(String(base || ""));
        if (!m || !isFinite(lat) || !isFinite(lon)) return null;
        var qi = base.indexOf("?"), q = qi < 0 ? "" : base.slice(qi + 1).split("#")[0];
        var keep = q.split("&").filter(function (kv) {
            var k = kv.split("=")[0];
            return k && !/^(cityId|city|cityName|provinceId|countryId|districtId|optionId|destName|searchType|searchWord|searchValue|searchCoordinate|lat|lon|checkIn|checkOut|checkin|checkout|listFilters)$/i.test(k);
        });
        var nm = String(name || "").replace(/[|*&#?=]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30) || "들머리";
        var la = (+lat).toFixed(6), lo = (+lon).toFixed(6);
        return "https://" + m[1].toLowerCase() + "/hotels/list?" + ["cityId=0", "searchType=LM", "searchWord=" + encodeURIComponent(nm),
            "searchValue=" + encodeURIComponent("13|0*13*" + la + "|" + lo + "|" + nm + "|0|1")].concat(keep).join("&");
    }

    global.RF = {
        num: num,
        km: km,
        hm: hm,
        notifyDeploy: notifyDeploy,
        searchPlaceholder: searchPlaceholder,
        fromApi: fromApi,
        gpxToApi: gpxToApi,
        isGpxId: isGpxId,
        gpxId: gpxId,
        storeGpx: storeGpx,
        storedGpx: storedGpx,
        isAccess: isAccess,
        reverseCourse: reverseCourse,
        infoText: infoText,
        parkOf: parkOf,
        safeDecode: safeDecode,
        snapOut: snapOut,
        spotText: spotText,
        spotSummary: spotSummary,
        flightMs: flightMs,
        summitIndex: summitIndex,
        showName: showName,
        at: at,
        grade: grade,
        sunset: sunset,
        sunrise: sunrise,
        kindOf: kindOf,
        personSvg: personSvg,
        groupPois: groupPois,
        declutter: declutter,
        parseJoinId: parseJoinId,
        titledName: titledName,
        noteTrailName: noteTrailName,
        courseAccess: courseAccess,
        aliasName: aliasName,
        standardMs: standardMs,
        textButton: textButton,
        scheduleRows: scheduleRows,
        weatherWord: weatherWord,
        kmaLink: kmaLink,
        summitTemp: summitTemp,
        distM: distM,
        poiIcon: poiIcon,
        profile: profile,
        miniMap: miniMap,
        nameIn: function (s) { return LANG === "en" && s != null ? enName(s) : s; },
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        favButton: favButton,
        tripLink: tripLink,
        airText: airText,
        COUPANG_NOTE: COUPANG_NOTE,
        airForecastText: airForecastText,
        dayLabel: dayLabel,
        midLines: midLines,
        tempRange: tempRange,
        fireNote: fireNote,
        msToTop: msToTop,
        sunriseStart: sunriseStart,
        regionEn: regionEn,
        weekendWordEn: weekendWordEn,
        levelChip: levelChip,
        mapLocale: mapLocale,
        roman: roman,
        steepest: steepest,
        officialEleAt: officialEleAt,
        windChill: windChill,
        windNote: windNote,
        featuredCard: featuredCard,
        featuredPick: featuredPick,
        gapLines: gapLines,
        shownGaps: shownGaps,
        joinedCourse: joinedCourse,
        toApi: toApi,
        partBases: partBases,
        fixPart: fixPart,
        applyHead: applyHead,
        joinHashExtra: joinHashExtra,
        favJoinExtra: favJoinExtra,
        partAnswers: partAnswers
    };
})(window);
