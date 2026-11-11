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

    /** 글로만 쓸 곳(창 제목 등) - "[무리] 길", routeFirst 면 길만(따라가기 탭 제목 - 머리글과 같게). */
    function nameText(name, routeFirst) {
        if (LANG === "en") { var en = LANG; LANG = "ko"; var t = nameText(name, routeFirst); LANG = en; return enName(t); }
        var p = nameParts(name);
        if (routeFirst) return routeOnly(name);
        return p.group ? "[" + p.group + "] " + p.route : p.route;
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

    /**
     * 위험 · 조망 아이콘(낙석주의 · 구급함 · 헬기장 …)을 보이는 확대 정도. 넓게 볼 때는 들머리 · 날머리 · 중요 지점만 보이고,
     * 확대하면 자연스럽게 나타남(2026-10-13 홍TV님: 따라가기 첫 화면에서 '낙석주의' 는 중요하지 않음). 줌 14 - 폰 축척 막대 300m 쯤.
     */
    var SPOT_ZOOM = 14;

    /** 지도가 넓게 보이면(SPOT_ZOOM 미만) 지도 상자에 "far" - CSS 가 .spot 을 숨김. 확대 · 축소할 때마다. */
    function spotsByZoom(map) {
        var box = map.getContainer(), set = function () { box.classList.toggle("far", map.getZoom() < SPOT_ZOOM); };
        map.on("zoom", set);
        set();
    }

    /** 지금 자리에서 이 거리(m) 안의 위치표지판만 "가까운 표지" 로 봅니다(멀면 구조대에 헷갈림). */
    var SIGN_M = 500;

    /**
     * 순수 함수 - (lat, lon) 에서 가장 가까운 국립공원 위치표지판 {sign, m}. SIGN_M 안에 없으면 null.
     * 2026-10-10 홍TV님: 공단 다목적위치표지판(지리10-05) - 119 에 이 번호를 말하면 자리가 전해집니다.
     */
    function nearSign(c, lat, lon) {
        var best = null;
        ((c && c.signs) || []).forEach(function (s) {
            var m = distM(lat, lon, +s.lat, +s.lon);
            if (m <= SIGN_M && (!best || m < best.m)) best = { sign: s, m: m };
        });
        return best;
    }

    /** 순수 함수 - 가까운 표지 글: "지리10-05 · 120m (백무동매표소 시발 2.5km (참샘))". 없으면 "". */
    function signText(ns) {
        if (!ns) return "";
        var s = ns.sign, place = s.place_name ? " (" + (LANG === "en" ? enName(s.place_name) : s.place_name) + ")" : "";
        if (LANG === "en") return enName(s.loc_no) + " · " + (ns.m < 10 ? "right here" : (ns.m < 100 ? Math.round(ns.m) : Math.round(ns.m / 10) * 10) + " m") + place;
        // 100m 넘으면 10m 단위(걸을 때마다 숫자가 1m 씩 바뀌어 어지럽지 않게 - 2026-10-10 PC)
        return s.loc_no + " · " + (ns.m < 10 ? "바로 옆" : (ns.m < 100 ? Math.round(ns.m) : Math.round(ns.m / 10) * 10) + "m") + place;
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

    /**
     * 순수 함수 - 코스 이름 맨 앞의 산 이름("모악산 · 화율봉 → 모악산" · "마이산 자락 2코스" · "대둔산(마천대) 1코스" → 모악산 · 마이산 · 대둔산).
     * id 가 산림청 코스(frst-)면 앞의 시 · 군 낱말을 건너뜀.
     * 도립 · 군립공원과 다른 산의 전체 보기용(2026-10-11 홍TV님). 국립공원이면 parkOf 가 먼저. 산 이름이 아니면 null.
     */
    /** 산 이름 낱말 - (숫자) + 한글 + 산 · 봉 · 악 · 령 · 대 · 오름 · 고지. 서버 ParkServlet.MOUNTAIN 과 같은 규칙. */
    var MOUNTAIN_WORD = /^(?:[0-9]{1,4}[가-힣]{0,12}|[가-힣]{1,12})(?:산|봉|악|령|대|오름|고지)(?:\(.*\))?$/;
    var MOUNTAIN_HEAD = /^((?:[0-9]{1,4}[가-힣]{0,12}|[가-힣]{1,12})(?:산|봉|악|령|대|오름|고지))(?=[\s·(]|$)/;

    function mountainOf(name, id) {
        var n = String(name || "").replace(/^\[|\]/g, "").trim();
        // 산림청 코스(frst-)는 앞에 시 · 군 - "김제 모악산 · …", "논산 대둔산 마천대 · …" 는 둘째 낱말(2026-10-11 PC)
        // 낱말이 여럿이면 "…산" 으로 끝나는 마지막 낱말("서산 덕산 가야산" → 가야산, "논산 대둔산 마천대" → 대둔산), 없으면 둘째 낱말
        // 2026-10-12 PC(전국 등산 25,809개 중 카드 없음 1,939): 앞에 시 · 구가 둘 이상("인천 영종 국사봉", "전남광주통합 동구 깃대봉"),
        // …오름(제주) · …고지(100고지)도 산으로 봄. 정맥 · 대간 · 숲길은 산이 아니라 그대로 null
        if (/^frst-/.test(id || "")) {
            var head = n.split(" · ")[0].split(/\s+/), pick = -1;
            for (var i = 1; i < head.length; i++) if (MOUNTAIN_WORD.test(head[i]) && /(산|오름|고지)(\(.*\))?$/.test(head[i])) pick = i;
            for (var j = 1; pick < 0 && j < head.length; j++) if (MOUNTAIN_WORD.test(head[j])) pick = j;   // …봉 · 악 · 령 · 대 - 앞에서 첫 것
            if (pick > 0) n = head.slice(pick).join(" ");
        }
        // 숫자로 시작하는 산 이름도("157고지우송대뒷산" - 2026-10-12 PC: 전체 보기 단추가 없었음)
        var m = MOUNTAIN_HEAD.exec(n);
        return m ? m[1] : null;
    }

    /**
     * 순수 함수 - 지역이 없는 무리 이름에 지역 붙이기(2026-10-14 홍TV님: "가야산" 검색의 "[가야산 자락 1코스] 적벽 → 금강블루빌" 이
     * 국립공원 가야산인지 광양 가야산인지 몰랐음). 같은 목록에 "광양 가야산 · …" 처럼 지역이 붙은 같은 산 코스가 출발점 20km 안에 있으면
     * 그 지역을 앞에 붙임 → {course_id: "광양 가야산 자락 1코스 · 적벽 → 금강블루빌"}. 공단 코스(knps-)는 그대로(국립공원).
     */
    function regionNames(rows) {
        var reg = [];
        (rows || []).forEach(function (r) {
            // "광양 가야산" - 마지막 낱말이 산 이름(앞은 지역). 산림청 코스가 아니면 mountainOf 가 지역 붙은 이름을 못 읽어 낱말로 봄
            var g = nameParts(r.name).group, w = g ? g.split(/\s+/) : [], m = w[w.length - 1];
            if (w.length >= 2 && MOUNTAIN_WORD.test(m) && r.start_lat != null) reg.push({ m: m, region: w.slice(0, -1).join(" "), lat: +r.start_lat, lon: +r.start_lon });
        });
        var out = {};
        (rows || []).forEach(function (r) {
            if (/^knps-/.test(String(r.course_id || "")) || r.start_lat == null) return;
            var g = nameParts(r.name).group, m = mountainOf(r.name, r.course_id);
            if (!g || !m || g.indexOf(m) !== 0) return;
            var best = null, bd = 20000;
            reg.forEach(function (x) {
                if (x.m !== m) return;
                var d = distM(+r.start_lat, +r.start_lon, x.lat, x.lon);
                if (d < bd) { bd = d; best = x; }
            });
            if (best) out[r.course_id] = best.region + " " + String(r.name);
        });
        return out;
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

    /** 순수 함수 - 범위와 겹치는 고정 격자 칸들([서, 남, 동, 북] 목록, 칸마다 한 번 물으면 칸마다 목록 한도까지 받음). */
    function gridCells(bb, cell) {
        cell = cell || GRID_DEG;
        var s = snapOut(bb, cell), out = [], k = 1e6;
        for (var x = s[0]; x < s[2] - 1e-9; x = Math.round((x + cell) * k) / k) {
            for (var y = s[1]; y < s[3] - 1e-9; y = Math.round((y + cell) * k) / k) {
                out.push([x, y, Math.round((x + cell) * k) / k, Math.round((y + cell) * k) / k]);
            }
        }
        return out;
    }

    /** 순수 함수 - 주소의 % 글자 풀기. 깨진 값(#c=%E0)이면 예외 대신 null - 화면이 멈추지 않게(2026-10-11 오픈 전 점검). */
    function safeDecode(s) {
        try { return decodeURIComponent(s); } catch (e) { return null; }
    }

    /**
     * 순수 함수 - 주소의 검색어(?q=, 코스 모음 첫 화면 검색칸 · 2026-11-07 전체 점검 2단계). + 는 띄어쓰기, 깨진 값 · 없음은 "", 40자까지.
     */
    function urlQuery(search) {
        var m = /[?&]q=([^&#]*)/.exec(String(search || ""));
        return m ? String(safeDecode(m[1].replace(/\+/g, " ")) || "").trim().slice(0, 40) : "";
    }

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

    function stampKey(name) { return String(name || "").replace(/\s+/g, "").replace(/인증센터$/, ""); }

    /**
     * 순수 함수 - 지금 자리(lat, lon)에서 radiusM(기본 100m) 안의, 아직 찍지 않은 인증센터 이름표들. have 는 찍은 것(stampKey → 무엇이든).
     * 2026-10-11 홍TV님: 국토종주 인증센터 도장 - 실제 GPS 로 그 자리에 가면 찍힘(시험 걷기는 아님).
     */
    function stampsDue(c, lat, lon, have, radiusM) {
        var r = radiusM || 100;
        return ((c && c.pois) || []).filter(function (p) {
            return /인증센터$/.test(String(p.name || "").trim()) && !(have && have[stampKey(p.name)]) && distM(lat, lon, +p.lat, +p.lon) <= r;
        });
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

    /**
     * 재미로 보는 산행 한마디(2026-10-17 홍TV님) - 정상 도장 카드 · 코스 모음 첫 화면. 안전 · 날씨에 관한 말은 넣지 않음
     * (실제 예보 · 강풍 경고와 어긋나면 위험 - "오늘은 산에 가기 좋은 날" 같은 말 금지).
     */
    var FORTUNE = {
        ko: ["끝까지 오른 사람에게 바람이 시원하게 분다.", "오늘 만난 풍경이 한 주의 힘이 된다.", "천천히 걸은 길이 가장 오래 남는다.",
             "정상에서 마신 물 한 모금이 오늘의 행운.", "함께 오른 사람과의 이야기가 복을 부른다.", "작은 오르막을 넘으면 큰 일도 풀린다.",
             "발밑의 들꽃을 본 사람에게 좋은 소식이 온다.", "쉬어 간 자리에서 좋은 생각이 떠오른다.", "오늘 찍은 사진 한 장이 오래 웃음을 준다.",
             "다음 산을 정한 사람에게 새 길이 열린다.", "땀 흘린 만큼 마음이 가벼워진다.", "내려가는 길에서 반가운 얼굴을 만난다.",
             "정상의 하늘처럼 머릿속이 맑아진다.", "한 걸음씩 쌓은 것이 큰 열매가 된다.", "오늘의 인사 한마디가 좋은 인연이 된다.",
             "아껴 둔 간식이 가장 맛있는 날.", "느긋한 마음이 가장 좋은 지도.", "돌아보면 꽤 높이 와 있다.",
             "산이 준 기운으로 미뤄 둔 일을 시작하기 좋다.", "고마운 사람에게 사진 한 장 보내면 복이 두 배.",
             "오늘 오른 높이만큼 자신감도 올라간다.", "산길에서 나눈 인사가 하루를 밝힌다.", "숨이 찰 때 한 번 쉬면 길이 다시 열린다.",
             "정상 사진보다 오르는 길의 웃음이 더 오래 간다.", "새소리를 들은 사람에게 기분 좋은 일이 생긴다.", "오늘은 처음 보는 풍경이 반가운 날.",
             "도시락 뚜껑을 여는 순간이 오늘의 보물.", "나무 그늘 아래에서 좋은 계획이 떠오른다.", "가벼운 가방처럼 마음의 짐도 가벼워진다.",
             "정상석 앞에서 웃으면 한 해가 즐겁다.", "오늘의 한 걸음이 내일의 체력이 된다.", "꾸준히 걷는 사람에게 산이 길을 보여 준다.",
             "능선에서 본 하늘이 마음을 넓혀 준다.", "함께 걷는 발걸음이 맞으면 일도 잘 맞는다.", "내려와서 먹는 국수 한 그릇이 최고의 상.",
             "오늘 본 나무 한 그루가 오래 기억에 남는다.", "서두르지 않는 마음에 좋은 일이 따라온다.", "산에 내려놓은 걱정은 다시 따라오지 않는다.",
             "오늘의 땀방울이 내일의 웃음이 된다.", "정상에서 보낸 문자 한 통이 누군가를 웃게 한다.", "산을 닮은 사람은 흔들려도 무너지지 않는다.",
             "작은 돌탑처럼 하루하루가 쌓인다.", "오르막 끝의 평지가 오늘의 선물.", "오늘 걸은 길을 기록하면 다음 산이 쉬워진다.",
             "산 아래 첫 커피가 유난히 맛있는 날.", "발걸음이 가벼운 날, 좋은 소식도 가볍게 온다.", "산은 꾸준한 사람의 편이다.",
             "정상에서 크게 숨 한 번, 걱정이 반으로 준다.", "옆 사람에게 건넨 사탕 하나가 복이 되어 돌아온다.", "지도 위 점 하나가 오늘의 추억이 된다.",
             "오늘의 풍경은 오늘만 볼 수 있다.", "천천히 가도 멈추지 않으면 닿는다.", "산에서 들은 이야기가 좋은 실마리가 된다.",
             "나를 위한 하루, 산이 박수를 친다.", "오늘 만난 다람쥐가 행운을 전해 준다.", "정상 표지판 앞 사진이 올해의 사진이 된다.",
             "등산화 끈을 단단히 맨 날은 일도 술술 풀린다.", "땀을 닦는 손수건 한 장에도 고마움이 담긴다.", "산을 다녀온 저녁, 단잠이 기다린다.",
             "어제보다 한 걸음 더, 그게 오늘의 기록."],
        en: ["The wind is kindest to those who reach the top.", "Today's view will carry you through the week.", "The slowest trail stays longest in memory.",
             "A sip of water at the summit is today's luck.", "Good talk on the trail brings good fortune.", "Small climbs today, big wins tomorrow.",
             "Notice the wildflowers - good news is on its way.", "A great idea waits at your next rest stop.", "One photo from today will make you smile for years.",
             "Pick your next mountain and a new path opens.", "Every drop of sweat lightens the mind.", "Look back - you have come further than you think.",
             "Every step today builds tomorrow's strength.", "A friendly hello on the trail brightens the whole day.", "Lunch on the mountain tastes like treasure.",
             "Birdsong is a sign of good things ahead.", "A light pack, a light heart.", "Smile at the summit stone - the year will smile back.",
             "Steady feet find the way.", "The sky from the ridge widens the mind.", "Noodles after the hike are the best prize.",
             "No rush - good things follow a calm heart.", "Worries left on the mountain don't follow you home.", "Today's sweat is tomorrow's smile.",
             "A message from the top will make someone smile.", "Mountains favour the patient.", "One deep breath at the top halves your worries.",
             "Share a snack, and luck comes back to you.", "Today's view is yours alone.", "A good sleep waits after a mountain day."]
    };

    /** 순수 함수 - 같은 씨앗(날짜 + 산 이름)이면 같은 한마디. lang "ko" · "en". */
    function fortune(seed, lang) {
        var list = FORTUNE[lang === "en" ? "en" : "ko"], h = 0, str = String(seed || "");
        for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return list[Math.abs(h) % list.length];
    }

    /**
     * 순수 함수 - 오늘의 한마디(코스 모음 /m/ · /en/m/): 바퀴마다 섞은 순서로 하루 하나 - 한 바퀴(한국어 60일 · 영어 30일) 안에서는 겹치지 않음
     * (2026-10-17 홍TV님: 20개면 21일째에 반복? - 예전 해시 방식은 18일째에 겹쳤음). y · m(1~12) · d 는 폰의 날짜.
     */
    function fortuneDay(y, m, d, lang) {
        var list = FORTUNE[lang === "en" ? "en" : "ko"], len = list.length, n = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
        var round = Math.floor(n / len), pos = n - round * len, order = [], i, j, t, r = (round * 2654435761 + 12345) >>> 0;
        // 바퀴마다 순서를 섞음(랜덤처럼 - 2026-10-17 홍TV님). 같은 날이면 늘 같은 순서
        for (i = 0; i < len; i++) order.push(i);
        for (i = len - 1; i > 0; i--) { r = (r * 1103515245 + 12345) >>> 0; j = r % (i + 1); t = order[i]; order[i] = order[j]; order[j] = t; }
        return list[order[pos]];
    }

    /** 순수 함수 - 정상 도장 카드: 제목(⛰️ 산 이름 · 정상 이름)과 그날의 한마디, 공유 글. day 는 "2026-10-17". */
    function summitCard(name, summit, day) {
        var title = "⛰️ " + name + (summit && summit !== name ? " " + summit : "");
        if (LANG === "en") {
            var t = "⛰️ " + enName(name + (summit && summit !== name ? " " + summit : "")), l = fortune(day + "|" + name, "en");
            return { title: t, line: l, share: t + " - made it!\nToday's summit fortune: " + l + "\n(just for fun · routefly)" };
        }
        var line = fortune(day + "|" + name, "ko");
        return { title: title, line: line, share: title + " 도착!\n오늘의 정상 한마디: " + line + "\n(재미로 보는 글 · routefly)" };
    }

    /**
     * 순수 함수 - 지난 기록과 비교(2026-10-16 홍TV님 추가 기능 2번): 기록의 점(track [위도, 경도, 시각, 높이])을 코스에 붙여
     * [코스 거리 m, 출발 뒤 ms] - 앞으로 나아간 점만(되돌아간 · 코스 밖 60m 넘는 점은 뺌). 2점이 안 되면 null.
     */
    function paceProfile(c, track, startMs) {
        var out = [], prevD = null;
        (track || []).forEach(function (p) {
            var s = snap(c, p[0], p[1], prevD);
            if (s.off > 60) return;
            prevD = s.d;
            if (!out.length || s.d > out[out.length - 1][0] + 10) out.push([s.d, p[2] - startMs]);
        });
        return out.length >= 2 ? out : null;
    }

    /** 순수 함수 - 지난번에 코스 거리 d 에 닿은 때(출발 뒤 ms, 사이는 고르게). 그 기록이 닿지 않은 곳이면 null. */
    function paceAt(prof, d) {
        if (!prof || d < prof[0][0] || d > prof[prof.length - 1][0]) return null;
        for (var i = 1; i < prof.length; i++) {
            if (d <= prof[i][0]) {
                var a = prof[i - 1], b = prof[i], f = (d - a[0]) / (b[0] - a[0]);
                return Math.round(a[1] + (b[1] - a[1]) * f);
            }
        }
        return prof[prof.length - 1][1];
    }

    /** 순수 함수 - 지난번 같은 시각(출발 뒤 ms)에 있던 코스 거리 - 지도 위 "지난번의 나". 기록 끝을 지나면 끝 자리. */
    function paceDistAt(prof, ms) {
        if (!prof) return null;
        if (ms <= prof[0][1]) return prof[0][0];
        for (var i = 1; i < prof.length; i++) {
            if (ms <= prof[i][1]) {
                var a = prof[i - 1], b = prof[i], f = b[1] > a[1] ? (ms - a[1]) / (b[1] - a[1]) : 1;
                return a[0] + (b[0] - a[0]) * f;
            }
        }
        return prof[prof.length - 1][0];
    }

    /** 순수 함수 - 차이(ms, 지금 - 지난번: 음수면 빠름) → "지난번보다 3분 빠름" · "지난번과 비슷". 1분 안쪽이면 비슷. */
    function paceText(diffMs) {
        if (diffMs == null || !isFinite(diffMs)) return "";
        var m = Math.round(Math.abs(diffMs) / 60000);
        if (LANG === "en") return Math.abs(diffMs) < 60000 ? "same pace as last time" : hm(m * 60000) + (diffMs < 0 ? " faster" : " slower") + " than last time";
        if (Math.abs(diffMs) < 60000) return "지난번과 비슷";
        var t = m >= 60 ? Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "") : m + "분";
        return "지난번보다 " + t + (diffMs < 0 ? " 빠름" : " 늦음");
    }

    /**
     * 순수 함수 - 움직임 없음 알림(2026-10-16 홍TV님 - 혼자 산행 안전). anchor 는 멈추기 시작한 자리 {lat, lon, t}, fix 는 마지막 위치(없으면 null).
     * moveM(+ GPS 오차, 60m 까지)보다 멀리 움직이면 그 자리 · 시각으로 다시 잼. waitMs 동안 그 안에 있으면 due.
     */
    function stillCheck(anchor, fix, nowMs, moveM, waitMs) {
        if (fix && (!anchor || distM(anchor.lat, anchor.lon, fix.lat, fix.lon) > moveM + Math.min(fix.acc || 0, 60)))
            anchor = { lat: fix.lat, lon: fix.lon, t: fix.t != null ? Math.min(fix.t, nowMs) : nowMs };
        return { anchor: anchor, due: !!anchor && nowMs - anchor.t >= waitMs };
    }

    function stampRadius(acc, max) {
        if (acc == null || !isFinite(+acc)) return max;
        return Math.max(40, Math.min(max, Math.round(+acc) + 20));
    }

    /** 산 정상 도장 열쇠 - 자료의 id(같은 이름 산이 여럿 - 백운산 등), 없으면 이름. */
    function peakKey(p) { return String((p && (p.id || p.name)) || "").replace(/\s+/g, ""); }

    /**
     * 순수 함수 - 지금 자리에서 radiusM(기본 150m) 안의, 아직 도장이 없는 정상들. peaks: data/mountains100.json 의 peaks, have: {peakKey: …}.
     * 코스와 상관없이 실제 GPS 로 그 정상에 가면 찍힘 - 핸드폰 안에서만 견줌(위치를 서버로 보내지 않음). 2026-10-11 홍TV님 100대 명산.
     */
    function peaksDue(peaks, lat, lon, have, radiusM) {
        var r = radiusM || 150;
        return (peaks || []).filter(function (p) {
            return p && isFinite(+p.lat) && isFinite(+p.lon) && !(have && have[peakKey(p)]) && peakGapM(p, lat, lon) <= r;
        });
    }

    /**
     * 순수 함수 - (lat, lon) 에서 그 산 정상까지 거리(m). 정상 둘(alt - 가야산은 산림청 자료의 칠불봉과 정상석이 있는 상왕봉이 약 240m 떨어짐,
     * 2026-10-14 홍TV님 도장 · 완주 검토: 해인사 → 상왕봉 코스는 칠불봉 150m 밖이라 도장이 안 찍혔음)이면 가까운 쪽.
     */
    function peakGapM(p, lat, lon) {
        return [p].concat(p.alt || []).reduce(function (m, q) {
            return isFinite(+q.lat) && isFinite(+q.lon) ? Math.min(m, distM(lat, lon, +q.lat, +q.lon)) : m;
        }, Infinity);
    }

    /**
     * 순수 함수 - 정상(peak.lat/lon)까지 가는 코스: 끝(없으면 시작)이 nearM(기본 2km - 2026-10-12 PC: 강천산 · 선운산 등 코스 끝이 정상에서 1~1.8km) 안인 것, 가까운 차례.
     * 이름 검색(같은 이름 산이 여럿 - 백운산)에서 그 산 코스만 고릅니다. 2026-10-12 홍TV님 "100대 명산은 따라가기 버튼이 없어?"
     */
    /**
     * 순수 함수 - 비법정탐방로(출입 금지 구간)인가. 국립공원공단 자료의 "비매칭코스"(2026-10-13 홍TV님: 북한산 상장능선 · 염초봉 · 파랑새능선 ·
     * 만경대 · 보현봉 · 향로봉 일부 · 도선사 무당골 같은 비법정탐방로). 목록 · 탐방 안내도 · 대표 산 코스에서 뺌.
     */
    function isClosedTrail(name) { return /비매칭|비법정/.test(String(name || "")); }

    /**
     * 순수 함수 - 지금은 없는 공단 탐방로(park-notes hide - 코스 ID 그대로나 앞부분). 목록 · 탐방 안내도에서만 빼고 DB 는 그대로.
     * 2026-10-14 홍TV님: 가야산3코스(knps-7014)는 공단 누리집 목록에 없음(2017 자료에만 있음).
     */
    function isHiddenCourse(notes, id) {
        var s = String(id || "");
        return Object.keys(notes || {}).some(function (park) {
            return ((notes[park] && notes[park].hide) || []).some(function (k) { return s === k || s.indexOf(k + "-") === 0; });
        });
    }

    /**
     * 순수 함수 - 코스 목록에 든 공원 · 산의 탐방 안내도(코스 목록 맨 위 카드). [{name, label, from(그 산 첫 코스 ID), n(코스 수)}].
     * 같은 이름 다른 산(광양 · 정선 · 포천 백운산)은 출발점 거리(20km)로 갈라 따로, 이름은 코스 무리 글("광양 백운산")이 있으면 그것.
     * q(검색어)가 이름에 든 산이 있으면 그 산들만. 코스가 많은 산 먼저, 같으면 목록에 먼저 나온 산.
     * 2026-10-12 홍TV님: 산에 가면 먼저 보는 것이 탐방 안내도 - 첫 화면에서 바로.
     */
    function guideMaps(rows, max, q) {
        var order = [];
        // 공단 코스(knps-)를 먼저 묶어 국립공원 카드의 출발점을 다 모은 뒤 다른 자료 코스를 견줌(2026-11-01 홍TV님 북한산 안내도 둘 -
        // 맨 앞의 이은 코스(출발점 좌표 없음)가 국립공원 카드를 점 없이 만들어, 바로 뒤 산림청 코스가 20km 비교를 못 하고 따로 "북한산(…)" 카드가 됐음)
        var list = (rows || []).filter(function (r) { return /^knps-/.test(String(r.course_id || "")); })
            .concat((rows || []).filter(function (r) { return !/^knps-/.test(String(r.course_id || "")); }));
        list.forEach(function (r) {
            // 국립공원 묶음은 공단 코스(knps-)만 이름으로 - 다른 자료의 "가야산 1코스"(광양)가 국립공원 가야산 카드에 섞여 카드 이름이 "광양 가야산"
            // 이 됐음(2026-10-14 PC). 다른 자료 코스는 아래 거리(20km) 규칙으로 같은 산인지 봄
            var park = /^knps-/.test(String(r.course_id || "")) ? parkOf(r.name) : null, n = park || parkOf(r.name) || mountainOf(r.name, r.course_id);
            if (!n) return;
            // 백두대간 · 정맥 무리("백두대간건의령고적대")는 산이 아님 - 노선 안내도(routeGuides)로(2026-10-12 PC)
            // 다만 "금남정맥안골산" 처럼 뒤에 산 이름이 붙으면 그 산(안골산 - 2026-10-12 PC)
            var tail = !park && /(?:대간|정맥)([가-힣]{1,12}(?:산|봉|악|오름))$/.exec(n), own = false;
            if (tail) { n = tail[1]; own = true; }
            else if (!park && /대간|정맥/.test(nameParts(r.name).group || String(r.name || ""))) return;
            var lat = +r.start_lat, lon = +r.start_lon, has = r.start_lat != null && isFinite(lat) && isFinite(lon);
            // 국립공원 코스는 이름으로 한 장. 그 밖은 같은 이름이고 그 묶음 어느 코스 출발점과 20km 안이면 같은 산
            // (산림청 지리산 코스 → 지리산 국립공원), 멀면 다른 산(광양 · 정선 백운산, 통영 지리산)
            // 이름이 같거나 한쪽이 다른 쪽으로 끝나면(사량도지리산 · 지리산 - 통영 사량도) 같은 이름으로 봄
            var same = function (o) { return o.name === n || (o.name.length > n.length ? o.name.slice(-n.length) === n : n.slice(-o.name.length) === o.name); };
            var g = order.filter(function (o) {
                if (!same(o)) return false;
                if (park && o.park) return true;
                return has ? o.pts.some(function (q) { return distM(lat, lon, q[0], q[1]) < 20000; }) : !o.pts.length;
            })[0];
            if (!g) {
                var grp = nameParts(r.name).group || "";
                g = { name: n, label: !own && grp.indexOf(n) > 0 && grp.length <= n.length + 6 ? grp : n, from: r.course_id, n: 0, park: !!park, pts: [] };
                order.push(g);
            }
            if (park && !g.park) { g.park = true; g.label = n; g.from = r.course_id; }   // 국립공원 코스가 있으면 그 이름 · 그 코스로
            else if (g.label === g.name && !own) {   // 지역이 붙은 무리 이름("포천 백운산")이 뒤에 나오면 그것으로
                var grp2 = nameParts(r.name).group || "";
                if (grp2.indexOf(n) > 0 && grp2.length <= n.length + 6) g.label = grp2;
            }
            if (!g.start) g.start = firstPlace(r.name);
            if (has) g.pts.push([lat, lon]);
            g.n++;
        });
        var key = String(q || "").replace(/\s+/g, "");
        var hit = key ? order.filter(function (g) { return g.label.replace(/\s+/g, "").indexOf(key) >= 0; }) : [];
        var ranked = (hit.length ? hit : order).map(function (g, i) { return { g: g, i: i }; })
            .sort(function (a, b) { return b.g.n - a.g.n || a.i - b.i; }).map(function (x) { return x.g; });
        // 국립공원 카드는 코스 수와 상관없이 맨 앞, 장 수(max)에도 세지 않음(2026-10-14 PC: "가야산" 에서 서산 40 · 나주 18 · 광양 13 에 밀려
        // 국립공원 카드가 빠졌고, 앞에 두니 광양이 빠졌음 - 같은 이름 산이 셋이면 셋 다)
        var out = ranked.filter(function (g) { return g.park; }).concat(ranked.filter(function (g) { return !g.park; }).slice(0, max || 3));
        // 그래도 같은 이름표가 둘 이상이면(지역 없는 백운산 둘) 첫 코스 들머리로 가름: "백운산(오두재)"
        var dup = out.map(function (g) { return out.filter(function (o) { return o.label === g.label; }).length > 1; });
        out.forEach(function (g, i) { if (dup[i] && g.start) g.label += "(" + g.start + ")"; });
        return out.map(function (g) { return { name: g.name, label: g.label, from: g.from, n: g.n }; });
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

    /** 순수 함수 - 코스 이름의 들머리("백운산 · 오두재 → 백운산" → 오두재). 없으면 null. */
    function firstPlace(name) {
        var r = nameParts(name).route.split(" → ")[0].trim();
        return r && r !== nameParts(name).route ? r : null;
    }

    /** 순수 함수 - 코스를 끝까지 갔다고 볼까(가장 멀리 간 곳이 코스 길이의 90% 넘음). */
    function isComplete(dMax, total) { return total > 0 && dMax >= total * 0.9; }

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

    /** 국립공원 위험지역 · 조망점 종류 → 지도 아이콘. */
    var SPOT_ICONS = { danger: "⚠️", aid: "⛑️", heli: "🚁", ranger: "🏠", view: "🔭" };
    function spotIcon(kind) { return SPOT_ICONS[kind] || "•"; }

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

    /**
     * 순수 함수 - 아직 알리지 않은 위험지역 가운데 d 에서 앞 aheadM 안까지 온 것(이미 지난 것 포함, 걷기 시작한 fromD 앞은 뺌) 중 가장 앞의 것.
     * 없으면 null. done 은 알린 것(spotKey → true). 지난 것도 돌려주는 까닭: 시험 걷기처럼 빨리 가면 한 번 그릴 사이에 120m 를 넘어감
     * (2026-10-10 PC: 북한산 보문대피소 코스 위험 4곳 중 알림 2) - 부르는 쪽이 한참 지난 것은 말없이 넘깁니다.
     * 2026-10-10 홍TV님: 국립공원 위험지역(낙석주의 · 추락주의 …) 앞에서 알림.
     */
    function dangerAhead(c, d, aheadM, done, fromD) {
        return firstUndone(c, "danger", done, (fromD || 0) - 20, d + aheadM);
    }

    /** 순수 함수 - 아직 알리지 않은 조망점 가운데 d 앞뒤 40m 까지 온 것(지난 것 포함, fromD 앞은 뺌) 중 가장 앞의 것. 없으면 null. */
    function viewAt(c, d, done, fromD) {
        return firstUndone(c, "view", done, (fromD || 0) - 40, d + 40);
    }

    function firstUndone(c, kind, done, lo, hi) {
        var best = null;
        ((c && c.spots) || []).forEach(function (s) {
            var at = +s.dist_m;
            if (s.kind === kind && at >= lo && at <= hi && !done[spotKey(s)] && (!best || at < +best.dist_m)) best = s;
        });
        return best;
    }

    function spotKey(s) { return s.kind + "|" + s.lat + "|" + s.lon; }

    /** 순수 함수 - (lat, lon) 에서 가장 가까운 kind(aid · heli · ranger) {spot, m}. 2km 넘으면 null. SOS 에 씁니다. */
    function nearSpot(c, kind, lat, lon) {
        var best = null;
        ((c && c.spots) || []).forEach(function (s) {
            if (s.kind !== kind) return;
            var m = distM(lat, lon, +s.lat, +s.lon);
            if (m <= 2000 && (!best || m < best.m)) best = { spot: s, m: m };
        });
        return best;
    }

    /** 들머리 · 날머리로 볼 이름(탐방지원센터 · 안내소 · 매표소 · 주차장 · 정류장 · 마을 · 입구 …). */
    var EXIT_NAME = /(탐방지원센터|탐방안내소|안내소|분소|매표소|공원지킴터|주차장|정류장|정류소|터미널|마을|입구|들머리|날머리)$/;

    /**
     * 순수 함수 - 가장 가까운 하산 지점 {name(모르면 null), kind("start" · "end" · "head" · "far"), m, line, back, lat, lon}. 없으면 null.
     * 2026-11-01 홍TV님 - 일몰 알림 · SOS 에 "가장 가까운 하산 지점 ○○ 1.2km".
     * 후보: 코스 처음 · 끝(봉우리 · 고개 이름이거나, 100m 넘게 오르는 코스에서 가장 높은 곳 30m 안이면 뺌 - 정상까지만 가는 코스의 끝은 내려가는 곳이 아님),
     *       코스 위 들머리 이름표(c.pois) · 공원지킴터(c.spots ranger), far(주변 코스 끝 [{name, lat, lon}] - 코스 선 밖이라 늘 직선).
     * here = {lat, lon, d}: d 가 있으면(코스 위) 코스 위 후보는 코스 따라 거리(line true, back = 되돌아가는 쪽), 없으면 모두 직선 거리.
     * 고를 때 직선 거리는 1.4배로 칩니다(산길은 직선보다 대개 그만큼 김 - 골짜기 건너 직선이 코스 길을 이기지 않게). m 은 그대로.
     */
    function nearestExit(c, here, far) {
        if (!c || !c.lat || !c.lat.length || !here) return null;
        var n = c.lat.length - 1, total = c.total || 0, cands = [];
        var eles = (c.ele || []).filter(function (e) { return e != null; });
        var top = eles.length ? Math.max.apply(null, eles) : null, climb = eles.length ? top - Math.min.apply(null, eles) >= 100 : false;
        var endName = function (d) {
            var q = (c.pois || []).filter(function (p) { return Math.abs(+p.dist_m - d) < 60 && !(+p.off_route_m >= 60); })[0];
            return q ? String(q.name) : null;
        };
        [[0, 0, "start"], [n, total, "end"]].forEach(function (e) {
            var nm = endName(e[1]), ele = c.ele ? c.ele[e[0]] : null;
            if (nm && isTopName(nm)) return;
            if (climb && ele != null && ele >= top - 30) return;
            cands.push({ name: nm, kind: e[2], lat: c.lat[e[0]], lon: c.lon[e[0]], d: e[1], off: 0 });
        });
        (c.pois || []).forEach(function (p) {
            if (EXIT_NAME.test(String(p.name || "").replace(/\s+/g, ""))) cands.push({ name: String(p.name), kind: "head", lat: +p.lat, lon: +p.lon, d: +p.dist_m, off: +p.off_route_m || 0 });
        });
        (c.spots || []).forEach(function (s) {
            if (s.kind === "ranger" && s.dist_m != null) cands.push({ name: s.name, kind: "head", lat: +s.lat, lon: +s.lon, d: +s.dist_m, off: +s.off_m || 0 });
        });
        (far || []).forEach(function (f) { if (f && f.name && !isTopName(f.name)) cands.push({ name: f.name, kind: "far", lat: +f.lat, lon: +f.lon, d: null, off: 0 }); });
        var best = null;
        cands.forEach(function (k) {
            var line = here.d != null && k.d != null, m = line ? Math.abs(k.d - here.d) + k.off : distM(here.lat, here.lon, k.lat, k.lon);
            var rank = line ? m : m * 1.4;
            if (!best || rank < best.rank) best = { name: k.name, kind: k.kind, m: m, line: line, back: line && k.d < here.d, lat: k.lat, lon: k.lon, rank: rank };
        });
        if (best) delete best.rank;
        return best;
    }

    /**
     * 순수 함수 - GPS 끊김 알림 차례(2026-11-01 홍TV님): "lost"(방금 끊김 - 띠 · 진동 한 번) · "back"(다시 잡힘) · ""(그대로).
     * wasLost 는 지금 끊김 띠를 띄우고 있는지, fixT 는 마지막으로 쓸 만한 위치를 받은 시각(아직 한 번도 못 받았으면 0 - 그때는 알리지 않음).
     */
    function gpsGap(wasLost, t, fixT, ms) {
        if (!fixT) return "";
        var lost = t - fixT >= ms;
        return lost && !wasLost ? "lost" : !lost && wasLost ? "back" : "";
    }

    /**
     * 순수 함수 - "내 기록" 하나(rec.track: [[위도, 경도, 시각, 고도|null], …], rec.notes) → 고도 그래프 · 지도에 그릴 코스 모양.
     * 점은 10m 보다 가까우면 솎고(끝점은 남김), 사진 · 메모는 가장 가까운 기록 점의 거리에 이름표로 둡니다.
     */
    /**
     * 순수 함수 - 기록 점에서 GPS 튐 빼기(2026-10-28 PC: 10-23 지리산 기록 카드에 긴 직선 왕복 - 튐 걸러내기 전에 저장된 옛 기록).
     * 앞 점에서 걸어서 못 가는 빠르기(걷기 10 · 자전거 25 m/s)로 100m 넘게 나갔다가 다시 앞 점 둘레로 돌아온 점(5개까지 이어진 것도)은 버림 - onFix 규칙과 같은 생각.
     * track: [[위도, 경도, ms, 고도], …].
     */
    function cleanTrack(tr, bike) {
        var lim = bike ? 25 : 10, out = [], i = 0;
        tr = tr || [];
        // 첫 점이 튐(폰이 옛 위치 · 기지국 위치를 먼저 줌, 2026-10-28 버그 점검) - 첫 점은 앞 점이 없어 아래에서 못 거름
        if (tr.length >= 3) {
            var d01 = distM(tr[0][0], tr[0][1], tr[1][0], tr[1][1]), d12 = distM(tr[1][0], tr[1][1], tr[2][0], tr[2][1]);
            if (d01 > 100 && d12 < d01 * 0.5 && d01 / Math.max(1, (tr[1][2] - tr[0][2]) / 1000) > lim) i = 1;
        }
        while (i < tr.length) {
            var a = out[out.length - 1], skip = 0;
            if (a) for (var k = 1; k <= 5 && i + k < tr.length; k++) {
                var f = tr[i], l = tr[i + k - 1], b = tr[i + k];
                var dOut = distM(a[0], a[1], f[0], f[1]), dBack = distM(l[0], l[1], b[0], b[1]), dAB = distM(a[0], a[1], b[0], b[1]);
                var vOut = dOut / Math.max(1, (f[2] - a[2]) / 1000), vBack = dBack / Math.max(1, (b[2] - l[2]) / 1000);
                if (dOut > 100 && dBack > 100 && dAB < Math.min(dOut, dBack) * 0.5 && (vOut > lim || vBack > lim)) { skip = k; break; }
            }
            if (skip) { i += skip; continue; }
            out.push(tr[i]);
            i++;
        }
        return out;
    }

    /**
     * 순수 함수 - 기록 선을 지도용 GeoJSON 으로(2026-10-28 홍TV님 "지도도 점선으로"): 이어 걸은 곳은 properties.gap false(실선),
     * 위치가 끊긴 구간(rc.gap)은 gap true(점선 - 지도 층에서 거름). rc = recordCourse 결과.
     */
    function recordLines(rc) {
        var feats = [], run = [];
        function flush() { if (run.length > 1) feats.push({ type: "Feature", properties: { gap: false }, geometry: { type: "LineString", coordinates: run } }); run = []; }
        for (var i = 0; i < rc.lat.length; i++) {
            var pt = [rc.lon[i], rc.lat[i]];
            if (i && rc.gap && rc.gap[i]) {
                flush();
                feats.push({ type: "Feature", properties: { gap: true }, geometry: { type: "LineString", coordinates: [[rc.lon[i - 1], rc.lat[i - 1]], pt] } });
            }
            run.push(pt);
        }
        flush();
        return { type: "FeatureCollection", features: feats };
    }

    /** 위치가 끊긴 구간(크롬 화면 꺼짐 등) - 이만큼 넘게 벌어지면 카드 · 지도에서 점선. */
    var GAP_MS = 60000, GAP_M = 300;

    function recordCourse(rec) {
        var c = { id: "rec", course: { name: rec.name, kind: rec.kind }, lon: [], lat: [], ele: [], dist: [], gap: [], markers: [], pois: [], junctions: [] };
        var tr = cleanTrack(rec.track, rec.kind === "bike"), last = null, d = 0;
        tr.forEach(function (p, i) {
            var step = last ? distM(last[0], last[1], p[0], p[1]) : 0;
            if (last && step < GPX_SPACING_M && i < tr.length - 1) return;
            d += step;
            c.lat.push(+p[0]); c.lon.push(+p[1]); c.ele.push(p[3] == null ? null : +p[3]); c.dist.push(d);
            c.gap.push(!!(last && step > GAP_M && p[2] - last[2] > GAP_MS));   // 앞 점에서 여기까지가 끊긴 구간
            last = p;
        });
        c.total = d;
        c.asc = cumAscent(c.ele);
        (rec.notes || []).forEach(function (n) {
            var best = 0, bd = Infinity;
            for (var i = 0; i < c.lat.length; i++) {
                var x = distM(n.lat, n.lon, c.lat[i], c.lon[i]);
                if (x < bd) { bd = x; best = i; }
            }
            var nm = n.text ? n.text.replace(/\s+/g, " ").slice(0, 20) : "사진";
            c.pois.push({ name: (n.photo ? "📷 " : "📝 ") + nm, lat: n.lat, lon: n.lon, ele_m: n.ele, dist_m: c.dist[best] || 0, off_route_m: 0 });
        });
        return c;
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
     * 순수 함수 - 기록의 가장 높은 곳(2026-10-28 PC: 지리산 기록이 1,950m - 천왕봉 1,915m). GPS 높이는 앞뒤 5점 가운뎃값으로 튐을 누르고,
     * 그 자리가 100대 명산 정상(peaks: mountains100 의 {id, lat, lon}) 200m 안이면 공식 높이(elev: peak-elev.json 의 elev)로.
     */
    function recordHighest(rc, peaks, elev) {
        var e = rc && rc.ele || [], best = null, at = -1;
        for (var i = 0; i < e.length; i++) {
            var w = [];
            for (var j = Math.max(0, i - 2); j <= Math.min(e.length - 1, i + 2); j++) if (e[j] != null) w.push(e[j]);
            if (!w.length) continue;
            w.sort(function (x, y) { return x - y; });
            var m = w[Math.floor(w.length / 2)];
            if (best == null || m > best) { best = m; at = i; }
        }
        if (best == null) return null;
        var hit = null, hd = 200;
        (peaks || []).forEach(function (p) {
            var id = p.id || p.name, d = distM(rc.lat[at], rc.lon[at], p.lat, p.lon);
            if (elev && elev[id] != null && d <= hd) { hd = d; hit = +elev[id]; }
        });
        return Math.round(hit != null ? hit : best);
    }
    /** "내 기록" 에 남기지 않는 기준(2026-10-09 홍TV님): 걸은 거리 100m 미만 · 코스에서 3km 넘게 떨어진 곳에서만 움직임. */
    var RECORD_MIN_M = 100, RECORD_FAR_M = 3000;

    /**
     * 순수 함수 - 산행 기록을 남기지 않을지(true 면 남기지 않음).
     * walkedM: 걸은 거리(m), track: [[위도, 경도, …], …], c: 코스({lat[], lon[]}).
     * 시작을 눌러 보고 바로 끝낸 기록(0.01km)이나, 집 · 차 안처럼 코스와 먼 곳에서 누른 기록이 쌓이지 않게 합니다.
     */
    function recordSkip(walkedM, track, c) {
        if (!(walkedM >= RECORD_MIN_M)) return true;
        var n = c.lat.length, step = Math.max(1, Math.floor(n / 400)), tstep = Math.max(1, Math.floor(track.length / 200));
        for (var i = 0; i < track.length; i += tstep) {
            for (var j = 0; j < n; j += step) {
                if (distM(track[i][0], track[i][1], c.lat[j], c.lon[j]) <= RECORD_FAR_M) return false;
            }
            if (distM(track[i][0], track[i][1], c.lat[n - 1], c.lon[n - 1]) <= RECORD_FAR_M) return false;
        }
        return true;
    }

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

    /*
     * 산의 입산 · 통제 안내(data/park-notes.json - 2026-10-12 한라산: 하절기 4~9월 · 동절기 10~3월, 코스마다 통제 지점 · 시각).
     */

    /** 순수 함수 - 그날의 계절과 코스(이름들 가운데 match 가 맞는 것)의 통제 · 하산 시각. note 가 없으면 null. 달은 한국 날짜로(폰 시간대와 관계없이, 2026-11-02 홍TV님 점검). */
    function parkRules(note, names, date) {
        if (!note) return null;
        var m = new Date(date.getTime() + 9 * 3600000).getUTCMonth() + 1, season = null;
        Object.keys(note.seasons || {}).forEach(function (k) { if (note.seasons[k].indexOf(m) >= 0) season = k; });
        var c = (note.courses || []).filter(function (x) {
            var re = new RegExp(x.match);
            return (names || []).some(function (n) { return re.test(String(n || "")); });
        })[0] || null;
        var at = function (list) { return (list || []).map(function (g) { return { name: g.name, time: season ? g[season] : null }; }).filter(function (g) { return g.time; }); };
        return { season: season, open: note.open || null,
                 course: c ? { label: c.label, reserve: c.reserve || null, gates: at(c.gates), down: at(c.down) } : null };
    }

    /** 순수 함수 - parkRules → 한 줄("성판악(하절기): 성판악 입구 · 진달래밭통제소 12:30 입산 통제 · 동릉정상(백록담) 14:30 하산 · …"). */
    function rulesText(r) {
        if (!r || !r.course) return null;
        var c = r.course, parts = [];
        if (LANG === "en") {
            c.gates.forEach(function (g) { parts.push(enName(g.name) + " closes to climbers at " + g.time); });
            c.down.forEach(function (g) { parts.push("leave " + enName(g.name) + " by " + g.time); });
            if (r.open) parts.unshift("entry from " + r.open);
            return "Trail hours" + (r.season ? " (" + r.season.replace(/(\d+)월/g, "$1/").replace(/\s*~\s*/g, " - ") + ")" : "") + ": " + parts.join(" · ");
        }
        c.gates.forEach(function (g) { parts.push(g.name + " " + g.time + " 입산 통제"); });
        c.down.forEach(function (g) { parts.push(g.name + " " + g.time + " 하산"); });
        if (c.reserve) parts.push(c.reserve);
        if (r.open) parts.unshift("입산 " + r.open + "부터");
        return c.label + (r.season ? "(" + r.season + ")" : "") + ": " + parts.join(" · ");
    }

    /**
     * 순수 함수 - 지금(now) 알릴 통제 · 하산 시각: 60 · 30 · 10분 앞과 지난 때. said 에 이미 알린 열쇠가 있으면 빼고 [{key, text}].
     * 걷는 중에만 부름(따라가기). 시각은 그날 기준. 열쇠 앞에 한국 날짜("2026-10-12|in|…") - 여러 날 산행에서 이튿날 알림이 어제 알린 것으로 빠지지 않게(2026-11-02 홍TV님 점검).
     */
    function gateAlerts(r, now, said) {
        var out = [];
        if (!r || !r.course) return out;
        // 통제 · 하산 시각은 한국 시각 - 폰 시간대가 달라도(해외 폰 · 영어 손님) 한국 날짜의 그 시각으로(fireNote 와 같이, 2026-11-02 홍TV님 점검)
        var day0 = Math.floor((now + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
        var at = function (hm) { var p = String(hm).split(":"); return day0 + (+p[0]) * 3600000 + (+p[1]) * 60000; };
        var day = new Date(day0 + 9 * 3600000).toISOString().slice(0, 10);
        var check = function (g, kind) {
            var left = (at(g.time) - now) / 60000;
            [60, 30, 10].forEach(function (th) {
                var key = day + "|" + kind + "|" + g.name + "|" + th;
                if (left <= th && left > th - 10 && !(said && said[key]))
                    out.push({ key: key, text: LANG === "en" ? th + " minutes until " + (kind === "in" ? "the trail closes at " : "the latest descent time at ") + enName(g.name) + " (" + g.time + ")."
                        : g.name + (kind === "in" ? " 입산 통제" : " 하산 시각") + "까지 " + th + "분 남았습니다(" + g.time + ")." });
            });
            var key0 = day + "|" + kind + "|" + g.name + "|0";
            if (left <= 0 && left > -15 && !(said && said[key0]))
                out.push({ key: key0, text: LANG === "en" ? (kind === "in" ? "The trail at " + enName(g.name) + " closed at " + g.time + ". You cannot climb past it."
                    : "It is " + g.time + ", the latest descent time at " + enName(g.name) + ". Start heading down.") : g.name + (kind === "in" ? " 입산 통제 시각(" + g.time + ")이 지났습니다. 통제 지점을 지나 오를 수 없습니다."
                    : " 하산 시각(" + g.time + ")입니다. 내려가기 시작하세요.") });
        };
        r.course.gates.forEach(function (g) { check(g, "in"); });
        r.course.down.forEach(function (g) { check(g, "down"); });
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
     * 순수 함수 - 공단 공식 코스 이름(park-notes official, "knps-7013": "가야산1코스"). 배치가 이름을 들머리 → 목적지로 바꿔
     * "가야산1코스" 로는 찾을 수 없었음(2026-10-13 홍TV님). 키는 코스 ID 그대로나 앞부분. 없으면 "".
     */
    function officialName(notes, id) {
        var out = "";
        Object.keys(notes || {}).forEach(function (park) {
            var of = notes[park] && notes[park].official;
            Object.keys(of || {}).forEach(function (k) {
                if (String(id) === k || String(id).indexOf(k + "-") === 0) out = of[k];
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

    /** 순수 함수 - 검색어(띄어쓰기 무시)가 든 공식 코스 이름 → [{park, key, name}]. 두 글자 미만이면 빈 목록. */
    function officialMatches(notes, q) {
        var n = String(q || "").replace(/\s+/g, "").toLowerCase(), out = [];
        if (n.length < 2) return out;
        Object.keys(notes || {}).forEach(function (park) {
            var of = notes[park] && notes[park].official;
            Object.keys(of || {}).forEach(function (k) {
                if (String(of[k]).replace(/\s+/g, "").toLowerCase().indexOf(n) >= 0) out.push({ park: park, key: k, name: of[k] });
            });
        });
        return out;
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

    /** d 부터 끝까지 남은 오르막(m). */
    function ascentLeft(c, d) {
        var i = indexAt(c, d);
        return Math.max(0, c.asc[c.asc.length - 1] - c.asc[i]);
    }

    /** 순수 함수 - 코스 위 d0 → d1 사이에 오른 · 내려간 높이(m). 코스 고도로 셉니다(GPS 고도는 많이 흔들림). */
    function climbBetween(c, d0, d1) {
        var i0 = indexAt(c, Math.min(d0, d1)), i1 = indexAt(c, Math.max(d0, d1));
        var up = c.asc[i1] - c.asc[i0], e0 = c.ele ? c.ele[i0] : null, e1 = c.ele ? c.ele[i1] : null;
        var down = e0 == null || e1 == null ? 0 : Math.max(0, up - (e1 - e0));
        return { up: Math.max(0, up), down: down };
    }

    /**
     * 순수 함수 - 소모 칼로리(kcal) 추정. 몸무게 kg × (평지 거리 + 오른 높이 + 내려간 높이).
     *   걷기 · 등산: 0.7 kcal/kg/km, 오르막 0.0094 kcal/kg/m(몸을 1m 들어 올리는 일 ÷ 효율 25%), 내리막 그 1/3
     *   자전거: 0.25 kcal/kg/km(약 15km/h), 오르막은 같고 내리막은 0
     * 기기 만보계 · 심박 없이 거리 · 높이로만 셈하는 대략값입니다.
     */
    function kcal(kind, kg, distM, upM, downM) {
        var bike = kind === "bike";
        return Math.round(kg * ((bike ? 0.25 : 0.7) * distM / 1000 + 0.0094 * upM + (bike ? 0 : 0.0031) * downM));
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

    function nextPoi(c, d) {
        var best = null;
        c.pois.forEach(function (p) {
            if (isAccess(p)) return;
            var pd = +p.dist_m;
            if (pd > d + 15 && (best == null || pd < +best.dist_m)) best = p;
        });
        return best;
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

    /**
     * 순수 함수 - 코스 ID → 출처 {kind:"source", text, en, checked:false}(서버 CourseSource.of 와 같은 앞부분 - 2026-11-01 홍TV님).
     * 서버 답의 course.source 가 먼저이고, 이것은 그 칸이 없을 때(받아 둔 옛 코스 · 내 GPX)만. 이은 코스는 첫 구간 것. 올린 코스(u-)는 만든 이를 몰라 null, 모르는 앞부분도 null.
     */
    function courseSource(id) {
        var parts = parseJoinId(id), base = parts && parts.length ? parts[0].base : String(id || "");
        var P = [["knps-", "국립공원공단", "Korea National Park Service"], ["frst-", "산림청", "Korea Forest Service"],
                 ["drnb-", "한국관광공사 두루누비", "Korea Tourism Organization Durunubi"],
                 ["kmp-", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"], ["kmf-", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"],
                 ["osm", "OpenStreetMap", "OpenStreetMap"]];
        if (isGpxId(base)) return { kind: "source", text: "내 GPX", en: "My GPX", checked: false };
        for (var i = 0; i < P.length; i++) if (base.indexOf(P[i][0]) === 0) return { kind: "source", text: P[i][1], en: P[i][2], checked: false };
        return null;
    }

    /** 순수 함수 - 출처 · 만든 이 글(CourseSource.line 과 같음): "출처: 국립공원공단" · "만든 이: 시험대장 (routefly 점검)" · 제휴는 "[제휴]". 없으면 "". */
    function sourceText(s, en) {
        if (!s || !s.text) return "";
        var t = (en && s.en) || s.text;
        if (s.kind !== "maker") return (en ? "Source: " : "출처: ") + t;
        return (en ? "Made by: " : "만든 이: ") + t + (s.partner ? (en ? " [Partner]" : " [제휴]") : s.checked ? (en ? " (checked by routefly)" : " (routefly 점검)") : "");
    }

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
     * 📮 routefly 에 코스 보내기 - 따라가기 내 기록(hike.js)과 GPX 편집(studio.js, 2026-11-02 홍TV님 "GPX 편집을 누구나 - 올리기 대신 보내기")이 같이 씀.
     * 서버(CourseSubmitServlet)가 받는 한도: 본문 3MB(CourseUploadServlet.MAX_BODY) · 점 10~5만 개 · 이름 2~60자 - 보내기 전에 여기서 먼저 알려 줌(서버도 다시 봄).
     * 동의 글에 "내가 직접 걸은 기록" 을 넣음(2026-11-02 홍TV님) - 서버의 agree:true 뜻은 그대로.
     */
    var SUBMIT_MAX_BODY = 3 * 1024 * 1024, SUBMIT_MAX_POINTS = 50000, SUBMIT_SENDER_KEY = "rf-submit-sender";
    function submitAgree() {
        return tr("내가 직접 걸은 기록입니다(다른 앱 · 사이트에서 받은 남의 기록은 보내지 마세요). 위 내용을 읽었고 보내는 데 동의합니다",
            "This is a track I walked myself (please do not send other people's tracks taken from other apps or sites). I have read the above and agree to send it");
    }
    /** 순수 함수 - 보낼 본문(시각은 빼고 선 모양 · 높이만, agree:true). */
    function submitBody(name, sender, kind, note, track) {
        return { name: name, sender: sender, kind: kind, note: note, agree: true,
            gpx: trackGpx(name, kind, (track || []).map(function (p) { return [p[0], p[1], null, p[3]]; })) };
    }
    /** 순수 함수 - 보내기 전 점검: 보내도 되면 null, 아니면 까닭(서버 한도와 같음). bodyLen = JSON 본문 글자 수. */
    function submitProblem(name, track, bodyLen) {
        var n = (track || []).length;
        if (String(name || "").trim().length < 2 || String(name).trim().length > 60) return tr("코스 이름을 2~60자로 적어 주세요.", "Please enter a course name (2-60 characters).");
        if (n < 10) return tr("기록 점이 너무 적습니다(10개 넘게).", "Too few points (needs more than 10).");
        if (n > SUBMIT_MAX_POINTS) return tr("기록 점이 너무 많습니다(5만 개까지) - 길을 나눠 보내 주세요.", "Too many points (up to 50,000) - please split the track.");
        if (bodyLen > SUBMIT_MAX_BODY) return tr("GPX 가 너무 큽니다(3MB 까지) - 길을 나눠 보내 주세요.", "The GPX is too big (up to 3 MB) - please split the track.");
        return null;
    }
    /** 순수 함수 - JSON 이 아닌 실패 응답(nginx · 요청 제한 등)의 말. */
    function submitFail(status) {
        if (status === 429) return tr("요청이 너무 잦습니다. 잠시 뒤(오늘 더 못 보내면 내일) 다시 보내 주세요.", "Too many requests. Please try again later (or tomorrow).");
        if (status === 413) return tr("GPX 가 너무 큽니다 - 길을 나눠 보내 주세요.", "The GPX is too big - please split the track.");
        return tr("보내지 못했습니다(HTTP " + status + "). 잠시 뒤 다시 보내 주세요.", "Could not send (HTTP " + status + "). Please try again later.");
    }
    /**
     * 보내기 창 - o = {name, kind, track, trim(track) → Promise(자른 점 | null) (있을 때만 ✂ 단추), sent(알림 글)}.
     * 보내도 화면의 기록 · 편집 중인 길은 그대로(창만 닫힘). 보낸 사람 이름은 이 기기에 기억(rf-submit-sender).
     */
    function submitSheet(o) {
        var track = o.track || [], sender = "";
        try { sender = localStorage.getItem(SUBMIT_SENDER_KEY) || ""; } catch (e) { /* 처음 */ }
        var wrap = document.createElement("div");
        wrap.setAttribute("role", "dialog");
        wrap.setAttribute("aria-label", tr("코스로 보내기", "Send as a course"));
        wrap.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px";
        var box = document.createElement("div");
        box.style.cssText = "background:#1b2430;color:#e9eef4;border-radius:14px;padding:14px;width:min(440px,100%);max-height:96vh;overflow:auto;font-size:15px";
        var ls = "display:block;margin-top:10px", is = "display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #3a4655;background:#0f1720;color:#e9eef4;font-size:15px";
        box.innerHTML = '<b style="font-size:17px">' + tr("📮 routefly 에 코스로 보내기", "📮 Send to routefly as a course") + '</b>'
            + '<label style="' + ls + '">' + tr("코스 이름", "Course name") + '<input type="text" class="nm" maxlength="60" style="' + is + '"></label>'
            + '<label style="' + ls + '">' + tr("보내는 사람 이름(올리면 코스 화면에 \"만든 이\" 로 보임 · 비우면 익명)", "Your name (shown as \"Made by\" on the course screens if published · leave empty to stay anonymous)") + '<input type="text" class="sd" maxlength="20" style="' + is + '"></label>'
            + '<label style="' + ls + '">' + tr("종류", "Type") + '<select class="kd" style="' + is + '"><option value="hike">' + tr("⛰️ 등산", "⛰️ Hiking") + '</option><option value="walk">' + tr("🚶 걷기", "🚶 Walking") + '</option><option value="bike">' + tr("🚴 자전거", "🚴 Cycling") + '</option></select></label>'
            + '<label style="' + ls + '">' + tr("메모(골라서 - 들머리 · 주차 등)", "Note (optional - trailhead, parking, etc.)") + '<textarea class="nt" maxlength="200" rows="2" style="' + is + '"></textarea></label>'
            + '<p class="tip" style="margin:10px 0 6px">' + tr("길 모양 · 코스 이름 · 보낸 사람 이름을 routefly 가 점검해 공개 코스로 올릴 수 있습니다. 시각 · 사진 · 메모는 보내지 않습니다. 집 근처 출발 · 도착 부분은 먼저 자르세요.",
                "routefly may review the line, course name and your name and publish them as a public course. Times, photos and photo notes are not sent. Trim the start and end near your home first.")
            + ' <a href="' + tr("privacy.html", "privacy-en.html") + '#course-submit" target="_blank" rel="noopener" style="color:#38d9ea">' + tr("개인정보처리방침", "Privacy policy") + '</a></p>'
            + '<p style="display:flex;gap:8px;align-items:center;margin:0">' + (o.trim ? '<button type="button" class="tr">' + tr("✂ 앞 · 뒤 자르기", "✂ Trim start and end") + '</button>' : "") + '<span class="km tip"></span></p>'
            + '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" class="ag" style="margin-top:3px"><span class="agt"></span></label>'
            + '<p class="er" role="alert" style="color:#ff8787;margin:8px 0 0"></p>'
            + '<p style="display:flex;gap:8px;margin:12px 0 0"><button type="button" class="no" style="flex:1">' + tr("취소", "Cancel") + '</button><button type="button" class="go main" style="flex:1">' + tr("보내기", "Send") + '</button></p>';
        box.querySelector(".agt").textContent = submitAgree();
        box.querySelector(".nm").value = String(o.name || "").slice(0, 60);
        box.querySelector(".sd").value = sender;
        box.querySelector(".kd").value = /^(hike|walk|bike)$/.test(o.kind) ? o.kind : "hike";
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        function shown() { box.querySelector(".km").textContent = km(trackStats(track).dist) + " km" + (track !== o.track ? tr(" (자름)", " (trimmed)") : ""); }
        function close() { wrap.remove(); }
        shown();
        if (o.trim) box.querySelector(".tr").onclick = function () {
            o.trim(track).then(function (kept) { if (kept) { track = kept; shown(); } });
        };
        box.querySelector(".no").onclick = close;
        wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
        var go = box.querySelector(".go"), er = box.querySelector(".er");   // 알림(toast)은 이 창 아래에 깔려 창 안에 씀
        go.onclick = function () {
            var name = box.querySelector(".nm").value.trim(), kind = box.querySelector(".kd").value;
            sender = box.querySelector(".sd").value.trim();
            var body = JSON.stringify(submitBody(name, sender, kind, box.querySelector(".nt").value.trim(), track));
            var why = submitProblem(name, track, body.length);
            if (why) { er.textContent = why; return; }
            if (!box.querySelector(".ag").checked) { er.textContent = tr("안내를 읽고 동의에 체크해 주세요.", "Please read the notice and tick the box."); return; }
            er.textContent = "";
            try { if (sender) localStorage.setItem(SUBMIT_SENDER_KEY, sender); else localStorage.removeItem(SUBMIT_SENDER_KEY); } catch (e) { /* 이번만 */ }
            go.disabled = true;
            fetch("api/course-submit", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body })
                .then(function (res) { return res.json().catch(function () { return { success: false, message: submitFail(res.status) }; }); })
                .then(function (j) {
                    if (!j || j.success === false) throw new Error(j && j.message || "?");
                    close();
                    if (o.sent) o.sent(tr("보냈습니다 - 점검 뒤 코스 목록에 올라갑니다(이미 있는 코스면 올리지 않을 수 있습니다)", "Sent - after review it will appear in the course list (we may skip it if the trail already exists)"));
                })
                .catch(function (e) { go.disabled = false; er.textContent = tr("보내지 못했습니다: ", "Could not send: ") + (e && e.message || e); });
        };
        box.querySelector(".nm").focus();
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

    /**
     * 순수 함수 - 기록 점 [위도, 경도, 시각, 높이] 가운데 높이가 없는 점은 코스의 지형 높이로(코스에서 maxOff m 안일 때만).
     * 2026-10-31 홍TV님 gpx.studio: 시험 걷기 · 높이를 안 주는 폰의 GPX 를 열면 높이 그래프가 0 이었음(화면엔 오른 높이 178m). 새 배열 - 원래 기록은 그대로.
     */
    function fillTrackEle(c, track, maxOff) {
        var lim = maxOff == null ? 100 : maxOff, prev = null;
        return (track || []).map(function (p) {
            if (!c || !c.dist || p[3] != null) return p;
            var s = snap(c, p[0], p[1], prev);
            prev = s.d;
            var e = s.off <= lim ? at(c, s.d).ele : null;
            return e == null ? p : [p[0], p[1], p[2], Math.round(e)];
        });
    }

    /**
     * GPS 위치 → 코스 위 진행 거리 d 와 코스에서 벗어난 거리 off(m).
     * 같은 길을 오가거나 도는 코스에서 엉뚱한 쪽에 붙지 않게, 지난 자리(prevD) 앞뒤 800m 를 먼저 보고
     * 거기서 멀면(80m 넘게) 전체에서 다시 찾습니다.
     */
    function snap(c, lat, lon, prevD) {
        var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
        function search(i0, i1) {
            var best = { d: 0, off: Infinity }, cands = [];
            for (var i = Math.max(0, i0); i < Math.min(c.lon.length - 1, i1); i++) {
                var ax = (c.lon[i] - lon) * kx, ay = (c.lat[i] - lat) * ky;
                var bx = (c.lon[i + 1] - lon) * kx, by = (c.lat[i + 1] - lat) * ky;
                var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
                var t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
                var px = ax + dx * t, py = ay + dy * t, off = Math.sqrt(px * px + py * py);
                var cand = { d: c.dist[i] + (c.dist[i + 1] - c.dist[i]) * t, off: off };
                if (off < best.off) best = cand;
                if (prevD != null) cands.push(cand);
            }
            // 같은 길을 갔다가 되돌아오는 코스(갔던 길로 내려옴)에서는 두 자리가 똑같이 가깝습니다 - 지난 자리에 가까운 쪽으로
            // (먼저 지나간 자리에 붙으면 진행 거리가 뒤로 튀어 "되돌아감" 으로 잘못 봅니다)
            if (prevD != null) {
                var minOff = best.off;
                cands.forEach(function (q) {
                    if (q.off <= minOff + 10 && Math.abs(q.d - prevD) < Math.abs(best.d - prevD)) best = q;
                });
            }
            return best;
        }
        if (prevD != null && isFinite(prevD)) {
            var near = search(indexAt(c, prevD - 800), indexAt(c, prevD + 800) + 1);
            if (near.off <= 80) return near;
            var all = search(0, c.lon.length);
            return all.off + 30 < near.off ? all : near;
        }
        return search(0, c.lon.length);
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

    /** 순수 함수 - 갈림길 d 에서 코스가 꺾는 쪽(앞뒤 40m 방향 차이). "오른쪽 길" · "왼쪽 길" · "직진". */
    function turnWord(c, d) {
        var a = at(c, Math.max(0, d - 40)), m = at(c, d), b = at(c, Math.min(c.total, d + 40));
        var b1 = bearingOf(a.lat, a.lon, m.lat, m.lon), b2 = bearingOf(m.lat, m.lon, b.lat, b.lon);
        var diff = ((b2 - b1 + 540) % 360) - 180;
        if (LANG === "en") return Math.abs(diff) < 25 ? "go straight" : (Math.abs(diff) < 60 ? "bear " : "turn ") + (diff > 0 ? "right" : "left");
        if (Math.abs(diff) < 25) return "직진";
        return (Math.abs(diff) < 60 ? "살짝 " : "") + (diff > 0 ? "오른쪽 길" : "왼쪽 길");
    }

    function bearingOf(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
        var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }

    /**
     * 순수 함수 - 위경도 → UTM-K(EPSG:5179, GRS80 · 중앙경선 127.5° · 원점 38° · 축척 0.9996 · 1,000,000 / 2,000,000).
     * 국가지점번호를 셈하려고 씁니다(WGS84 와 GRS80 차이는 무시해도 되는 수준).
     */
    function utmk(lat, lon) {
        var a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2), k0 = 0.9996;
        var r = Math.PI / 180, phi = lat * r, lam = lon * r, phi0 = 38 * r, lam0 = 127.5 * r;
        function M(p) {
            var e4 = e2 * e2, e6 = e4 * e2;
            return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p)
                + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
        }
        var N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi)), T = Math.tan(phi) * Math.tan(phi);
        var C = ep2 * Math.cos(phi) * Math.cos(phi), A = (lam - lam0) * Math.cos(phi);
        var x = 1000000 + k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120);
        var y = 2000000 + k0 * (M(phi) - M(phi0) + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
            + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
        return { x: x, y: y };
    }

    /**
     * 순수 함수 - 국가지점번호(예: "다사 5371 5148"). 구조대가 쓰는 전국 10m 격자 주소 - 산의 위치표지판에 적힌 번호와 같은 체계.
     * 글자는 100km 칸(가~아), 숫자는 그 안의 동 · 북 거리를 10m 단위로. 범위 밖이면 null.
     */
    function nationalPoint(lat, lon) {
        var p = utmk(lat, lon), L = "가나다라마바사아";
        var ix = Math.floor(p.x / 100000) - 7, iy = Math.floor(p.y / 100000) - 13;
        if (ix < 0 || ix > 7 || iy < 0 || iy > 7) return null;
        var pad = function (v) { v = String(Math.floor(v)); while (v.length < 4) v = "0" + v; return v; };
        return L.charAt(ix) + L.charAt(iy) + " " + pad((p.x % 100000) / 10) + " " + pad((p.y % 100000) / 10);
    }

    /** 순수 함수 - 그날 해 지는 시각(ms, 그 위치 기준). 극지방처럼 해가 안 지면 null. (Almanac for Computers 공식) */
    function sunset(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, false); }
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

    function kindOf(k) { return KINDS[k] || KINDS.hike; }

    /** 순수 함수 - 표준 소요 시간(ms). */
    /**
     * 기록 공유 카드의 선 - 위도 · 경도를 w × h 칸 안에 가로세로 비율을 지켜 가운데로(위도에 따른 경도 줄어듦 반영, 북쪽이 위).
     * 점이 없으면 빈 목록. 2026-10-14 홍TV님.
     */
    function fitPath(lat, lon, w, h, pad) {
        var n = Math.min(lat.length, lon.length);
        if (!n) return [];
        var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
        for (var i = 0; i < n; i++) { la0 = Math.min(la0, lat[i]); la1 = Math.max(la1, lat[i]); lo0 = Math.min(lo0, lon[i]); lo1 = Math.max(lo1, lon[i]); }
        var kx = Math.cos((la0 + la1) / 2 * Math.PI / 180), gw = (lo1 - lo0) * kx, gh = la1 - la0;
        var s = Math.min((w - 2 * pad) / (gw || 1e-9), (h - 2 * pad) / (gh || 1e-9));
        if (!isFinite(s) || (!gw && !gh)) s = 0;
        var ox = (w - gw * s) / 2, oy = (h - gh * s) / 2, out = [];
        for (var j = 0; j < n; j++) out.push([ox + (lon[j] - lo0) * kx * s, oy + (la1 - lat[j]) * s]);
        return out;
    }

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

    /** 귀가 확인 시각 - 표준 시간의 1.5배, 적어도 1시간 더(2026-10-14). 지나도록 못 끝내면 따라가기가 알림. */
    function lateAt(startMs, planMs) {
        return startMs + Math.max(planMs * 1.5, planMs + 3600000);
    }

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

    /**
     * 순수 함수 - 산행 계획 문자(2026-10-15 홍TV님: 출발 전 가족에게). startMs · endMs 는 출발 · 하산 예정(ms), clock 은 시각 글로 바꾸는 함수.
     */
    function planText(name, distM, ascM, startMs, endMs, url, clock, sunsetMs) {
        if (LANG === "en") {
            var en = ["[routefly hike plan] " + enName(name),
                "Distance " + num(distM / 1000, 1) + " km" + (ascM ? " · climb " + num(ascM) + " m" : ""),
                "Start " + clock(startMs) + " → back down by about " + clock(endMs) + " (standard pace)"];
            if (sunsetMs && endMs > sunsetMs) en.push("⚠ Planned finish is after sunset (" + clock(sunsetMs) + ") - bring a headlamp and start down early.");
            en.push("If I am very late and cannot be reached, call 119 (Korea emergency) and tell them this trail.");
            if (url) en.push(url);
            return en.join("\n");
        }
        var lines = ["[routefly 산행 계획] " + name,
            "거리 " + num(distM / 1000, 1) + "km" + (ascM ? " · 오르막 " + num(ascM) + "m" : ""),
            "출발 " + clock(startMs) + " → 하산 예정 " + clock(endMs) + "(표준 시간으로 어림)"];
        // 하산 예정이 일몰 뒤면 한 줄(2026-10-15 PC: 저녁에 누르면 22:10 하산 예정)
        if (sunsetMs && endMs > sunsetMs) lines.push("⚠ 하산 예정이 일몰(" + clock(sunsetMs) + ") 뒤 - 헤드랜턴을 챙기고 일찍 내려오세요.");
        lines = lines.concat([
            "예정보다 많이 늦고 연락이 안 되면 119 에 이 코스를 알려 주세요."]);
        if (url) lines.push(url);
        return lines.join("\n");
    }

    /** 쉬운 코스 거르기(2026-10-15 홍TV님) - {key, label, ms}, ms 0 은 모두. */
    var EASY = [{ key: "", label: "모두", ms: 0 }, { key: "2h", label: "2시간 이내", ms: 2 * 3600000 }, { key: "4h", label: "4시간 이내", ms: 4 * 3600000 }];
    /** 순수 함수 - 그 거르기에 드는 코스인가(표준 소요 시간). key 가 없거나 모르면 모두 듦. */
    function easyOk(key, kind, distM, ascM, descM) {
        var e = EASY.filter(function (x) { return x.key === key; })[0];
        return !e || !e.ms || standardMs(kind || "hike", +distM || 0, +ascM || 0, +descM || 0) <= e.ms;
    }

    /**
     * 순수 함수 - 점 지도(다녀온 산 - 2026-10-15 홍TV님): [{lat, lon, …}] → 같은 차례 [x, y](w × h 안, pad 여백). 경도는 cos(위도)로 줄여 모양을 맞춤.
     */
    function dotMap(points, w, h, pad) {
        if (!points.length) return [];
        var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
        points.forEach(function (p) { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); });
        var k = Math.cos((la0 + la1) / 2 * Math.PI / 180), sx = (lo1 - lo0) * k || 1e-6, sy = (la1 - la0) || 1e-6;
        var s = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy), ox = (w - sx * s) / 2, oy = (h - sy * s) / 2;
        return points.map(function (p) { return [ox + (p.lon - lo0) * k * s, oy + (la1 - p.lat) * s]; });
    }

    // ── ⛑️ 오늘의 산행 안전(api/safety - SafetyServlet) - 별거 별거 · 산 페이지 · 따라가기가 함께 씀(2026-10-18 홍TV님) ──
    var UV_WORD = [[2, "낮음", "Low"], [5, "보통", "Moderate"], [7, "높음", "High"], [10, "매우 높음", "Very high"], [99, "위험", "Extreme"]];
    var WARN_EN = { "강풍": "Strong wind", "호우": "Heavy rain", "한파": "Cold wave", "건조": "Dry air", "폭풍해일": "Storm surge", "풍랑": "High seas", "태풍": "Typhoon", "대설": "Heavy snow", "황사": "Yellow dust", "폭염": "Heat wave" };
    var FIRE_WORD = [["낮음", "Low"], ["다소 높음", "Moderate"], ["높음", "High"], ["매우 높음", "Very high"]];
    /** 순수 함수 - 특보 이름(영어 화면은 "강풍주의보" → "Strong wind advisory", 모르는 것은 그대로). */
    function warnName(t, en) {
        if (!en) return t;
        var m = /^(.+?)(주의보|경보)$/.exec(t || "");
        return m && WARN_EN[m[1]] ? WARN_EN[m[1]] + (m[2] === "경보" ? " warning" : " advisory") : t;
    }
    function uvWord(v, en) { for (var i = 0; i < UV_WORD.length; i++) if (v <= UV_WORD[i][0]) return en ? UV_WORD[i][2] : UV_WORD[i][1]; return ""; }
    /**
     * 순수 함수 - api/safety 응답 → 줄 [{icon, label, val, cls("bad" · "mid" · "")}]: 특보(내 시도 것은 빨강, 전국은 한 줄) · 산불위험 · 자외선.
     * 자외선은 발표 시각(date "yyyyMMddHH" KST) + h 시간. 저녁(오늘 남은 자외선이 없음)이면 내일 가장 높을 때(2026-10-18 PC).
     */
    function safetyRows(j, now, en) {
        var out = [], t = function (ko, e) { return en ? e : ko; };
        if (!j || j.unavailable) return out;
        if (j.warn && j.warn.lines) {
            var mine = j.warn.lines.filter(function (l) { return l.mine; }), all = j.warn.lines.map(function (l) { return warnName(l.type, en); });
            if (mine.length) mine.forEach(function (l) { out.push({ icon: "⚠", label: warnName(l.type, en), val: t("내 지역 발효 중", "in effect here"), cls: "bad", alert: true }); });
            else out.push({ icon: "✅", label: t("기상특보", "Weather warnings"), val: t("내 지역 없음", "None here"), cls: "" });
            if (all.length) out.push({ icon: "🗺", label: t("전국 특보", "Nationwide"), val: all.join(" · "), cls: "" });
        }
        if (j.fire) {
            var lv = Math.max(0, Math.min(3, j.fire.level || 0));
            out.push({ icon: "🔥", label: t("산불위험", "Wildfire risk"), val: FIRE_WORD[lv][en ? 1 : 0] + (j.fire.meanavg != null ? " (" + Math.round(j.fire.meanavg) + ")" : ""),
                cls: lv >= 2 ? "bad" : lv === 1 ? "mid" : "", alert: lv >= 2 });
        }
        if (j.uv && j.uv.hours && j.uv.hours.length && /^\d{10}$/.test(j.uv.date || "")) {
            var d = j.uv.date, base = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10)) - 9 * 3600000, cur = null, max = null;
            var todayKST = new Date(now + 9 * 3600000).toISOString().slice(0, 10), tomKST = new Date(now + 33 * 3600000).toISOString().slice(0, 10), tmax = null, restToday = false;
            j.uv.hours.forEach(function (p) {
                var at = base + p.h * 3600000, day = new Date(at + 9 * 3600000).toISOString().slice(0, 10);
                if (at <= now) cur = p.v;
                if (day === todayKST) { max = Math.max(max == null ? 0 : max, p.v); if (at > now && p.v > 0) restToday = true; }
                if (day === tomKST) tmax = Math.max(tmax == null ? 0 : tmax, p.v);
            });
            var tomorrow = !restToday && (cur == null || cur === 0) && tmax != null && new Date(now + 9 * 3600000).getUTCHours() >= 15;
            if (tomorrow) out.push({ icon: "☀", label: t("자외선(내일 가장 높을 때)", "UV (tomorrow's peak)"), val: tmax + " " + uvWord(tmax, en), cls: tmax >= 8 ? "bad" : tmax >= 6 ? "mid" : "" });
            else if (max != null) out.push({ icon: "☀", label: t("자외선(오늘 가장 높을 때)", "UV (today's peak)"), val: max + " " + uvWord(max, en) + (cur != null ? t(" · 지금 ", " · now ") + cur : ""),
                cls: max >= 8 ? "bad" : max >= 6 ? "mid" : "", alert: max >= 8 && restToday });
        }
        return out;
    }
    /** 순수 함수 - 따라가기에서 알릴 것만 한 줄로(내 지역 특보 · 산불위험 높음 이상 · 오늘 남은 시간 자외선 8 이상). 없으면 "". */
    function safetyAlert(j, now, en) {
        var a = safetyRows(j, now, en).filter(function (r) { return r.alert; });
        if (!a.length) return "";
        return "⛑️ " + (en ? "Hiking safety today: " : "오늘의 산행 안전: ") + a.map(function (r) { return r.label + (r.icon === "⚠" ? "" : " " + r.val); }).join(" · ");
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

    /**
     * 순수 함수 - 국립공원 산불예방 통제 안내(data/knps-close.json - tools/knps-close/build.py, 2026-11-10 홍TV님 "작업해"). 그 공원 그 계절(통제이력의 달 안)이 아니면 null.
     * 구간은 "해마다 통제되어 온"(공단 통제이력의 가장 최근 해 반복통제) - 오늘 상태가 아니라서 오늘 상황은 공단 통제정보 링크로(공단 robots.txt 가 긁기를 막음).
     * {text, link, url} - 사무소가 하나면 그 세부 화면, 여럿(지리산 등)이면 목록. en - 영어(구간 이름은 빼고). max - 구간을 몇 개까지(없으면 모두, 넘으면 "외 N곳").
     */
    function parkClose(data, park, ms, en, max) {
        var e = data && data.parks && data.parks[park];
        if (!e) return null;
        var m = new Date(ms + 9 * 3600000).getUTCMonth() + 1, season = null;
        ["봄철", "가을철"].forEach(function (k) { if (e[k] && m >= e[k].from && m <= e[k].to) season = k; });
        if (!season) return null;
        var c = e[season], segs = c.segs.map(function (x) { return x[0] + " ~ " + x[1]; });
        if (max && segs.length > max) segs = segs.slice(0, max).concat(["외 " + (c.segs.length - max) + "곳"]);
        var url = e.offices && e.offices.length === 1 ? data.detail + e.offices[0][1] : data.list;
        if (en) return { text: "⛔ Wildfire-season closures: some trails in this park have been closed in this season every year (KNPS records). ", link: "Check today's status (KNPS) ›", url: url };
        return { text: "⛔ " + park + " " + season + " 산불예방 통제 - 해마다 이때 통제되어 온 구간(국립공원공단 " + c.year + "년 기록): " + segs.join(" · ") + ". ",
                 link: "오늘 통제 상황 보기(국립공원공단) ›", url: url };
    }

    /**
     * 산행 결산(2026-10-15 홍TV님) - 기록(최근 30개, 걸은 길 포함)과 따로, 끝낸 산행마다 요약 한 줄을 오래 남김(localStorage "rf-log").
     * 순수 함수 - 기록 → 요약 {start, end, walked, up, courseId, name, kind}.
     */
    /** 순수 함수 - 기록의 거리: 걸은 거리와 코스 진행 가운데 큰 값(2026-10-28 - 화면이 꺼져 짧게 남은 옛 기록, 카드 · 목록 · 합계가 같은 값). */
    function recDist(r) { return Math.max(+(r && r.walked) || 0, +(r && r.done) || 0); }
    function logEntry(r) {
        return { start: r.start, end: r.end, walked: Math.round(recDist(r)), up: r.up != null ? Math.round(+r.up) : null,
                 courseId: r.courseId || null, name: r.name || "", kind: r.kind || "hike" };
    }
    /** 순수 함수 - 요약 합치기(같은 시작 · 코스는 하나), 시작 차례. */
    function mergeLog(log, add) {
        var seen = {}, out = [];
        (log || []).concat(add || []).forEach(function (e) {
            if (!e || typeof e.start !== "number") return;
            var k = e.start + "|" + (e.courseId || "");
            if (seen[k]) { var o = seen[k]; if ((+e.walked || 0) > (+o.walked || 0)) o.walked = e.walked; return; }   // 같은 산행 - 거리는 큰 값(옛 요약을 고침)
            seen[k] = e;
            out.push(e);
        });
        return out.sort(function (a, b) { return a.start - b.start; });
    }

    /** 순수 함수 - 요약에서 그 산행(같은 시작 · 코스) 빼기(2026-10-28 홍TV님 "바꿔" - 직접 지운 기록은 결산에서도 뺌). */
    function dropLog(log, r) {
        var k = r && r.start + "|" + (r.courseId || "");
        return (log || []).filter(function (e) { return !(e && e.start + "|" + (e.courseId || "") === k); });
    }

    /**
     * 순수 함수 - 결산 표. kind: "month"(그 해 1~12월) · "quarter"(1~4분기) · "ytd"(1월 1일 ~ 지금 누적) · "year"(해마다).
     * log: 요약들, peaks: rf-peaks {peakKey: {t}} - 그 기간에 처음 찍은 100대 명산 수. 한국 시각으로 나눔.
     * → [{label, from, to, n, walked, up, ms, courses, peaks}] (기간 차례)
     */
    function periodStats(log, peaks, kind, year, nowMs) {
        var K = 9 * 3600000, yOf = function (ms) { return new Date(ms + K).getUTCFullYear(); };
        var at = function (y, m) { return Date.UTC(y, m, 1) - K; };   // 그 달 1일 0시(한국)
        var ranges = [];
        var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], en = LANG === "en";
        if (kind === "month") for (var m = 0; m < 12; m++) ranges.push([en ? MON[m] + " " + year : year + "년 " + (m + 1) + "월", at(year, m), at(year, m + 1)]);
        else if (kind === "quarter") for (var q = 0; q < 4; q++) ranges.push([en ? "Q" + (q + 1) + " " + year : year + "년 " + (q + 1) + "분기", at(year, q * 3), at(year, q * 3 + 3)]);
        else if (kind === "ytd") ranges.push([en ? "Jan " + year + " - now" : year + "년 1월 ~ 지금", at(year, 0), Math.min(at(year + 1, 0), nowMs + 1)]);
        else {
            var ys = {};
            (log || []).forEach(function (e) { ys[yOf(e.start)] = 1; });
            Object.keys(peaks || {}).forEach(function (k) { if (peaks[k] && peaks[k].t) ys[yOf(peaks[k].t)] = 1; });
            Object.keys(ys).map(Number).sort().forEach(function (y) { ranges.push([en ? String(y) : y + "년", at(y, 0), at(y + 1, 0)]); });
        }
        return ranges.map(function (r) {
            var o = { label: r[0], from: r[1], to: r[2], n: 0, walked: 0, up: 0, ms: 0, courses: 0, peaks: 0 }, seen = {};
            (log || []).forEach(function (e) {
                if (e.start < r[1] || e.start >= r[2]) return;
                o.n++; o.walked += +e.walked || 0; o.up += +e.up || 0;
                if (e.end > e.start) o.ms += e.end - e.start;
                var k = e.courseId || e.name;
                if (k && !seen[k]) { seen[k] = 1; o.courses++; }
            });
            Object.keys(peaks || {}).forEach(function (k) { var t = peaks[k] && peaks[k].t; if (t >= r[1] && t < r[2]) o.peaks++; });
            return o;
        });
    }

    /**
     * 순수 함수 - 주말 날씨 한 줄(api/weekend 의 구역 하나) "☀️ 주말 토 맑음 · 일 흐리고 비 60%". 비 확률은 30% 넘을 때만. 구역이 없으면 "".
     * 좋은 날(good)이 하루라도 있으면 ☀️, 아니면 🌧.
     */
    function weekendText(w, code) {
        var r = w && code && (w.regions || []).filter(function (x) { return x.code === code; })[0];
        if (!r) return "";
        var good = false, parts = (w.dates || []).map(function (d) {
            var x = r.days && r.days[d];
            if (!x) return "";
            if (x.good) good = true;
            if (LANG === "en") return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T00:00:00Z").getUTCDay()] + " " + weekendWordEn(x.word) + (x.pop > 30 ? " " + x.pop + "%" : "");
            return "일월화수목금토".charAt(new Date(d + "T00:00:00Z").getUTCDay()) + " " + x.word + (x.pop > 30 ? " " + x.pop + "%" : "");
        }).filter(Boolean);
        return parts.length ? (good ? "☀️" : "🌧") + (LANG === "en" ? " Weekend " : " 주말 ") + parts.join(" · ") : "";
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

    /**
     * 순수 함수 - 코스(c - dist · ele 배열)의 d0 ~ d1 구간 평균 경사(%)와 단계(안내판 색과 같은 SLOPE_STEPS). 고도가 없으면 null.
     * 따라가기 음성 "다음 소청까지 1.3킬로미터, 오르막 250미터, 어려움 구간입니다(경사 19퍼센트)"(2026-10-16 홍TV님).
     */
    function slopeBetween(c, d0, d1) {
        if (!c || !c.dist || !c.ele || !(d1 > d0)) return null;
        function at(d) {
            for (var i = 1; i < c.dist.length; i++) if (c.dist[i] >= d) {
                var a = c.ele[i - 1], b = c.ele[i];
                if (a == null || b == null) return a != null ? a : b;
                var f = c.dist[i] > c.dist[i - 1] ? (d - c.dist[i - 1]) / (c.dist[i] - c.dist[i - 1]) : 0;
                return a + (b - a) * f;
            }
            return c.ele[c.ele.length - 1];
        }
        var e0 = at(d0), e1 = at(d1);
        if (e0 == null || e1 == null) return null;
        var pct = Math.round(Math.abs(e1 - e0) / (d1 - d0) * 1000) / 10;
        return { pct: pct, lv: stepOf(pct, SLOPE_STEPS), up: e1 >= e0 };
    }

    /**
     * 순수 함수 - 안내판 구간: 지점(pois - 이름 · dist_m)마다 끊어 구간별 거리 · 고도 · 경사(%) · 단계. points 는 api/course 의 [경도, 위도, 고도, 누적 거리].
     * 올라가는 쪽으로(첫 고도가 끝보다 높으면 뒤집음 - 안내판처럼 들머리에서 정상으로). keepDir 이면 뒤집지 않음(따라가기 - 걷는 쪽이 오른쪽,
     * 2026-10-16 PC: 내려가는 코스에서 현위치가 오른쪽에서 왼쪽으로 움직이고 km 가 걷는 거리와 반대였음). 지점이 없으면 거리를 다섯 토막.
     * → {total, up, flip, cuts:[{d, name}], segs:[{d0, d1, e0, e1, pct, lv}], line:[[d, e]]}
     */
    function boardSegments(points, pois, startName, endName, keepDir) {
        var line = (points || []).filter(function (p) { return p[2] != null; }).map(function (p) { return [+p[3], +p[2]]; });
        if (line.length < 2) return null;
        var total = line[line.length - 1][0], flip = !keepDir && line[0][1] > line[line.length - 1][1];
        if (flip) line = line.map(function (p) { return [total - p[0], p[1]]; }).reverse();
        var cuts = [{ d: 0, name: flip ? endName : startName }];
        (pois || []).forEach(function (q) {
            if (q.dist_m == null || !q.name) return;
            var d = flip ? total - q.dist_m : +q.dist_m;
            if (d > total * 0.03 && d < total * 0.97 && cuts.every(function (c) { return Math.abs(c.d - d) > total * 0.04; })) cuts.push({ d: d, name: String(q.name) });
        });
        if (cuts.length < 3) for (var k = 1; k < 5; k++) if (cuts.every(function (c) { return Math.abs(c.d - total * k / 5) > total * 0.04; })) cuts.push({ d: total * k / 5, name: "" });
        cuts.push({ d: total, name: flip ? startName : endName });
        cuts.sort(function (a, b) { return a.d - b.d; });
        function eleAt(d) {
            for (var i = 1; i < line.length; i++) if (line[i][0] >= d) {
                var a = line[i - 1], b = line[i], f = b[0] > a[0] ? (d - a[0]) / (b[0] - a[0]) : 0;
                return a[1] + (b[1] - a[1]) * f;
            }
            return line[line.length - 1][1];
        }
        var up = 0;
        for (var j = 1; j < line.length; j++) if (line[j][1] > line[j - 1][1]) up += line[j][1] - line[j - 1][1];
        var segs = [];
        for (var c = 1; c < cuts.length; c++) {
            var d0 = cuts[c - 1].d, d1 = cuts[c].d, e0 = eleAt(d0), e1 = eleAt(d1), pct = d1 > d0 ? Math.round(Math.abs(e1 - e0) / (d1 - d0) * 1000) / 10 : 0;
            segs.push({ d0: d0, d1: d1, e0: e0, e1: e1, pct: pct, lv: stepOf(pct, SLOPE_STEPS) });
        }
        return { total: total, up: Math.round(up), flip: flip, cuts: cuts, segs: segs, line: line };
    }

    /**
     * 순수 함수 - 현위치(따라가기 - 2026-10-16 홍TV님): 코스 처음부터 걸은 거리 d(m) → 안내판 위 자리와 다음 지점.
     * 안내판이 뒤집혀 있으면(내려가는 코스) 걷는 쪽이 왼쪽. → {d(안내판 거리), e(고도), pct(지금 구간 경사), next:{name, m(남은 거리)} 또는 null}
     */
    function boardHere(b, d) {
        if (!b) return null;
        var hd = Math.max(0, Math.min(b.total, b.flip ? b.total - d : d)), e = b.line[0][1];
        for (var i = 1; i < b.line.length; i++) if (b.line[i][0] >= hd) {
            var a = b.line[i - 1], c = b.line[i], f = c[0] > a[0] ? (hd - a[0]) / (c[0] - a[0]) : 0;
            e = a[1] + (c[1] - a[1]) * f;
            break;
        }
        var seg = b.segs.filter(function (s) { return hd >= s.d0 && hd <= s.d1; })[0] || b.segs[b.segs.length - 1];
        var named = b.cuts.filter(function (c) { return c.name && (b.flip ? c.d < hd - 10 : c.d > hd + 10); });
        var nx = b.flip ? named[named.length - 1] : named[0];
        return { d: hd, e: e, pct: seg.pct, lv: seg.lv, next: nx ? { name: nx.name, m: Math.round(Math.abs(nx.d - hd)) } : null };
    }

    /** 안내판 세로 과장 - 가로 1m 에 세로 3m(실제 비율이면 산이 납작해 보임). 모든 코스 같게. */
    var BOARD_EXAG = 3, BOARD_MAX_H = 320;   // 260 이면 1,300m 넘게 오르는 코스가 0.87 배로 눌렸음(PC)   // 그 비율로 이 높이(px)를 넘는 코스만 이 높이에 맞춤

    /** 안내판 고도 그래프 - box 에 그림. b = boardSegments(…), en - 영어 글, here - 걸은 거리(m, 따라가기 현위치 - 없으면 안 그림). */
    function boardProfile(box, b, en, here) {
        box.textContent = "";
        if (!b) { box.appendChild(el("p", "dim", en ? "No elevation data for this trail." : "고도 자료가 없는 코스입니다.")); return; }
        // 그림 폭 = 실제 칸 폭(글자가 줄지 않게 - 640 으로 그려 줄였더니 핸드폰에서 7px 로 작았음)
        var W = Math.max(300, Math.round((box.clientWidth || 360) - 4)), L = 8, R = 8, T = 62;
        var es = b.line.map(function (p) { return p[1]; }), lo = Math.min.apply(null, es), hi = Math.max.apply(null, es), pad = Math.max((hi - lo) * 0.08, 10);
        lo -= pad; hi += pad;
        function x(d) { return L + d / b.total * (W - L - R); }
        // 세로는 모든 코스 같은 비율(가로 1m 당 세로 BOARD_EXAG m) - 칸에 꽉 차게 늘리면 오르내림이 작은 곰배령이 가파르게, 1,300m 를 오르는
        // 남설악 → 대청봉이 완만하게 보였음(2026-10-16 홍TV님). 가파른 코스는 칸도 높게(BOARD_MAX_H 까지)
        var plotH = Math.min(BOARD_MAX_H, Math.max(24, (hi - lo) * (W - L - R) / b.total * BOARD_EXAG)), B = T + plotH, H = B + 44;   // 가파르면 칸도 높게
        function y(e) { return B - (e - lo) / (hi - lo) * plotH; }
        var svg = document.createElementNS(NS, "svg"), html = "";
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        svg.setAttribute("class", "rf-board");
        svg.setAttribute("role", "img");
        b.segs.forEach(function (sg) {
            var pts = b.line.filter(function (p) { return p[0] >= sg.d0 && p[0] <= sg.d1; }).map(function (p) { return x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); });
            pts.unshift(x(sg.d0).toFixed(1) + "," + y(sg.e0).toFixed(1));
            pts.push(x(sg.d1).toFixed(1) + "," + y(sg.e1).toFixed(1));
            var c = LEVELS[sg.lv].color;
            html += '<polygon points="' + x(sg.d0).toFixed(1) + "," + B + " " + pts.join(" ") + " " + x(sg.d1).toFixed(1) + "," + B + '" fill="' + c + '" fill-opacity="0.28"/>'
                + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + c + '" stroke-width="4" stroke-linejoin="round"' + (sg.lv === 4 ? ' class="lv4"' : "") + "/>";
            var mx = x((sg.d0 + sg.d1) / 2);
            // % 글자 - 선 아래에 자리가 있으면 아래 바닥 쪽, 없으면(평평한 낮은 구간) 선 위에(2026-10-16 PC: 곰배령 11.8% 가 선에 겹쳤음)
            var yMid = y((sg.e0 + sg.e1) / 2), py = B - yMid > 22 ? B - 6 : yMid - 7;
            if (x(sg.d1) - x(sg.d0) > 38) html += '<text x="' + mx.toFixed(1) + '" y="' + py.toFixed(1) + '" class="pct">' + sg.pct + "%</text>";
        });
        var rowEnd = [-1e9, -1e9], lastKm = -1e9;   // 이름 두 줄 - 줄마다 마지막 이름의 오른쪽 끝(겹치면 다른 줄, 둘 다 겹치면 뺌)
        var label = function (n) { return en ? enName(n) : String(n); };   // 영어 화면은 지점 이름도 영어 · 로마자(2026-10-16 PC)
        var textW = function (t) { var w = 6; for (var q = 0; q < t.length; q++) w += t.charCodeAt(q) >= 0x1100 ? 14 : 7.5; return w; };
        var endName = b.cuts[b.cuts.length - 1].name, endLeft = x(b.total) - (endName ? textW(label(endName)) : 0);   // 끝(정상) 이름은 첫 줄 맨 오른쪽에 늘 둠
        b.cuts.forEach(function (c, i) {
            var cx = x(c.d), cy = y(i === 0 ? b.segs[0].e0 : b.segs[i - 1].e1);
            html += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5" class="pt"/>';
            if (c.name) {
                var nm = label(c.name), last = i === b.cuts.length - 1, tw = textW(nm), anchor = i === 0 ? "start" : last ? "end" : "middle";
                var left = anchor === "start" ? cx : anchor === "end" ? cx - tw : cx - tw / 2;
                var row = last ? 0 : left > rowEnd[0] && left + tw < endLeft ? 0 : left > rowEnd[1] ? 1 : -1;
                if (row >= 0) {
                    var ty = row ? 44 : 22;
                    html += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + (ty + 5) + '" y2="' + (cy - 6).toFixed(1) + '" class="lead"/>'
                        + '<text x="' + cx.toFixed(1) + '" y="' + ty + '" text-anchor="' + anchor + '" class="nm">' + String(nm).replace(/[&<>"]/g, function (ch) { return "&#" + ch.charCodeAt(0) + ";"; }) + "</text>";
                    rowEnd[row] = left + tw;
                }
            }
            if (cx - lastKm > 50 && (i === b.cuts.length - 1 || x(b.total) - cx > 64)) {
                html += '<text x="' + cx.toFixed(1) + '" y="' + (H - 18) + '" text-anchor="' + (i === 0 ? "start" : i === b.cuts.length - 1 ? "end" : "middle") + '" class="km">'
                    + (Math.round(c.d / 100) / 10) + "km</text>";
                lastKm = cx;
            }
        });
        html += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + B + '" y2="' + B + '" class="base"/>';
        var hp = here != null ? boardHere(b, here) : null;
        if (hp) {   // 🔴 현위치 - 안내판의 "현위치(You are here)" 처럼
            var hx = x(hp.d), hy = y(hp.e), ha = hx < 50 ? "start" : hx > W - 50 ? "end" : "middle";
            html += '<line x1="' + hx.toFixed(1) + '" x2="' + hx.toFixed(1) + '" y1="' + (hy + 8).toFixed(1) + '" y2="' + B + '" class="here"/>'
                + '<circle cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" r="7" class="here"/>'
                + '<text x="' + hx.toFixed(1) + '" y="' + (hy - 13).toFixed(1) + '" text-anchor="' + ha + '" class="hereT">' + (en ? "You are here" : "현위치") + "</text>";
        }
        svg.innerHTML = html;
        box.appendChild(svg);
        var legend = el("div", "rf-legend");
        LEVELS.forEach(function (lv) { var i = el("i", null, en ? lv.en : lv.ko); i.style.setProperty("--c", lv.color); legend.appendChild(i); });
        box.appendChild(legend);
        if (hp && hp.next) box.appendChild(el("p", "hereNext", (en ? "Next: " + enName(hp.next.name) + " in " : "다음 " + hp.next.name + "까지 ")
            + (hp.next.m >= 1000 ? (Math.round(hp.next.m / 100) / 10) + "km" : hp.next.m + "m") + (en ? " · slope " : " · 지금 구간 경사 ") + hp.pct + "% (" + (en ? LEVELS[hp.lv].en : LEVELS[hp.lv].ko) + ")"));
        box.appendChild(el("p", "dim", en ? "Colors show the slope of each section (between named points); % is the average slope. Elevation from GPS/terrain data - for reference."
            : "색은 구간(이름 있는 지점 사이) 경사, % 는 그 구간 평균 경사입니다. 고도는 GPS · 지형 자료라 참고용입니다."));
    }

    /** 순수 함수 - 코스 이름에서 들머리 · 날머리("설악산 · 백담사 → 대청봉" → ["백담사", "대청봉"]). 못 나누면 null. */
    function nameEnds(name) {
        var tail = String(name || "").split(" · ").pop(), parts = tail.split(/\s*(?:→|->|~| - )\s*/).filter(Boolean);
        return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : null;
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

    /** 순수 함수 - 이번 주말 날씨 말(단기 "맑음" · "비", 중기 "구름많고 비", 오전 → 오후 "맑음 → 흐림") → 영어. */
    function weekendWordEn(word) {
        var one = { "맑음": "☀️ Clear", "구름많음": "⛅ Mostly cloudy", "흐림": "☁️ Overcast", "비": "🌧 Rain", "눈": "❄️ Snow" };
        return String(word || "").split(" → ").map(function (w) { return one[w] || wfEn(w); }).join(" → ");
    }

    /** 쿠팡 파트너스 링크를 보일 때 함께 붙이는 문구(공정거래위원회 추천 · 보증 심사지침 - 경제적 이해관계 표시). */
    var COUPANG_NOTE = "이 안내는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

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
     * 순수 함수 - 내 기록 통계. year 가 있으면 그 해(한국 시각)만. 코스 수는 같은 코스를 한 번으로.
     * → {n, walked(m), up(m), ms, courses}
     */
    function recordStats(list, year) {
        var out = { n: 0, walked: 0, up: 0, ms: 0, courses: 0 }, seen = {};
        (list || []).forEach(function (r) {
            if (!r || !r.start) return;
            if (year != null && new Date(r.start + 9 * 3600000).getUTCFullYear() !== year) return;
            out.n++;
            out.walked += recDist(r);
            out.up += +r.up || 0;
            if (r.end > r.start) out.ms += r.end - r.start;
            var k = r.courseId || r.name;
            if (k && !seen[k]) { seen[k] = 1; out.courses++; }
        });
        return out;
    }

    /** 백업에 함께 담는 이 기기 저장값(도장 · 완주 · 정상 · 찜 · 몸무게). 기록 · 사진은 IndexedDB 라 따로. */
    var BACKUP_KEYS = ["rf-stamps", "rf-done", "rf-peaks", "rf-fav", "rf-body", "rf-log", "rf-npstamps"];   // rf-npstamps: 국립공원 스탬프투어 인증지 다녀감(2026-10-28)   // rf-log: 결산용 산행 요약(2026-10-15)

    /** 순수 함수 - 백업 파일 내용인지. 맞으면 "", 아니면 까닭. */
    function backupCheck(o) {
        if (!o || typeof o !== "object" || o.app !== "routefly") return "routefly 백업 파일이 아닙니다.";
        if (o.v !== 1) return "이 앱보다 새 백업 파일입니다. 앱을 새로 고친 뒤 다시 여세요.";
        if (!Array.isArray(o.records)) return "백업 파일이 깨졌습니다.";
        return "";
    }

    /** 순수 함수 - 기록 합치기: 같은 시작 시각 · 코스는 하나로(지금 것을 남김), 최근 것부터 max 개. */
    function mergeRecords(cur, add, max) {
        var seen = {}, out = [];
        (cur || []).concat(add || []).forEach(function (r) {
            if (!r || typeof r.start !== "number" || !Array.isArray(r.track)) return;
            var k = r.start + "|" + (r.courseId || "");
            if (seen[k]) return;
            seen[k] = 1;
            out.push(r);
        });
        out.sort(function (a, b) { return b.start - a.start; });
        return out.slice(0, max);
    }

    /** 순수 함수 - 도장 · 완주 같은 {열쇠: 값} 합치기(지금 있는 것은 그대로, 없는 열쇠만 더함). 찜 · 몸무게 같은 배열 · 값은 지금 것이 없을 때만. */
    function mergeStore(cur, add) {
        if (add == null) return cur;
        if (cur == null) return add;
        if (Array.isArray(cur) && Array.isArray(add)) {
            var ids = {};
            cur.forEach(function (f) { if (f && f.id) ids[f.id] = 1; });
            return cur.concat(add.filter(function (f) { return f && f.id && !ids[f.id]; }));
        }
        if (typeof cur === "object" && typeof add === "object" && !Array.isArray(cur) && !Array.isArray(add) && !("kg" in cur)) {
            var m = {};
            Object.keys(add).forEach(function (k) { m[k] = add[k]; });
            Object.keys(cur).forEach(function (k) { m[k] = cur[k]; });
            return m;
        }
        return cur;
    }

    /**
     * 순수 함수 - 트립닷컴 제휴 링크(설정 partner.trip.url)를 들머리 근처 숙소 검색으로(2026-10-28 홍TV님 "들머리 근처 숙소가 나와야").
     * PC 가 kr.trip.com 에서 확인한 꼴: /hotels/list?cityId=0&searchType=LM&searchWord=이름&searchValue=13|0*13*위도|경도|이름|0|1
     * (cityId 가 없으면 0개, lat · lon 쿼리는 무시됨). 제휴 꼬리(Allianceid · SID · trip_sub1 · curr · locale 등)는 그대로 붙임.
     * listFilters=17~5*17*5(직선거리 가까운 순 - 붙이면 둘레 숙소만 남음, 2026-10-28 PC)는 뺌(2026-11-04 홍TV님: 월출산 홍계골처럼 공원 안쪽 끝은
     * 둘레에 숙소가 없어 빈 결과 - 빼니 "월출산" 근처 숙소가 나옴).
     * trip.com 주소가 아니면 null. name 은 숙소 카드의 "{이름}에서 직선 거리" 에 나옴.
     */
    /**
     * 산악회 방 알림(2026-10-28 홍TV님 - 인솔자도 혼자 산행하느라 화면을 못 봄). 순수 함수: 방 화면(view) s · 이미 울린 것 fired({키: true}) →
     * {msgs: 새로 울릴 글, fired: 새 fired}. 풀린 것(SOS 해제 · 소식 옴)은 지워 다시 울릴 수 있게.
     * 인솔자(사무실 자리 빼고): 🆘 SOS · 📵 앱 회원 소식 없음 10분 → 30분(전화) → 🚨 60분(마지막 위치)(산행 시작 10분 뒤부터, 폰 없는 명단 빼고) · ⏰ 하산 마감 60 · 30분 전 미하산 인원.
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
                if (m.role !== "hiker") return;
                // SOS 는 취소 · 하산 탑승 회원 것도 울림(2026-11-03 홍TV님 - 서버는 받는데 인솔자 알림이 없었음). 명단에 없는 SOS 는 따로 표시
                if (m.sos) hit("sos" + m.id, (en ? "🆘 SOS - " + m.nick : "🆘 SOS - " + m.nick + " 님") + (m.cancelled ? (en ? " (not on bus)" : " (안 탐)") : m.sosOdd ? (en ? " (not on the roster)" : " (명단에 없는 참가자)") : ""));
                if (m.cancelled || m.aboard) return;
                var at = m.pickup && s.pickupAt && s.pickupAt[m.pickup] || s.endAt;
                if (at) { var gk = m.pickup && s.pickupAt && s.pickupAt[m.pickup] ? m.pickup : ""; groups[gk] = groups[gk] || { at: at, n: 0 }; groups[gk].n++; }
                // 🐢 하산이 늦을 회원(2026-11-11) - 코스 도착 예상(+버스까지)이 그 회원 하산 탑승 시각보다 늦음. 30분 더 늦어질 때마다 다시
                if (m.late > 0 && s.departed) hit("late" + m.id + "_" + Math.floor(m.late / 30), en ? "🐢 " + m.nick + " may be about " + m.late + " min late for the bus (ETA " + hm(m.arr) + ")"
                    : "🐢 " + m.nick + " 님 하산 탑승보다 약 " + m.late + "분 늦을 예상(도착 예상 " + hm(m.arr) + ")");
                if (m.app && !m.listed && s.departedAt && !m.sos) {
                    var a = m.seen != null ? m.seen : m.ago, eff = Math.min(a == null ? Infinity : a, (now - s.departedAt) / 1000);
                    // 단계 경보(2026-11-11 홍TV님 - 무박 새벽 산행): 10분 📵 → 30분 📵 전화 → 60분 🚨 마지막 위치. 늦게 처음 보면 가장 높은 단계 하나만
                    if (eff > 600) {
                        var qs = eff > 3600 ? 60 : eff > 1800 ? 30 : 10, bt = m.batt != null ? (en ? " (last battery " + m.batt + "%)" : "(마지막 배터리 " + m.batt + "%)") : "";
                        [10, 30].forEach(function (w) { if (w < qs) f[w === 10 ? "quiet" + m.id : "quiet" + w + "_" + m.id] = true; });   // 낮은 단계는 울린 셈
                        if (qs === 10) hit("quiet" + m.id, en ? "📵 No update from " + m.nick + " for over 10 min" : "📵 " + m.nick + " 님 10분 넘게 소식 없음");
                        else if (qs === 30) hit("quiet30_" + m.id, en ? "📵 No update from " + m.nick + " for over 30 min - please call" + bt : "📵 " + m.nick + " 님 30분 넘게 소식 없음 - 전화해 보세요" + bt);
                        else hit("quiet60_" + m.id, en ? "🚨 No update from " + m.nick + " for over 1 hour - check the last position (tap the row for the trail)" + bt
                            : "🚨 " + m.nick + " 님 1시간 넘게 소식 없음 - 마지막 위치를 확인하세요(회원 줄을 누르면 지나온 길)" + bt);
                    }
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
            // 🐢 지금 속도로는 하산 탑승에 늦음(2026-11-11) - 내 줄(members 의 나)의 late. 30분 더 늦어질 때마다 다시
            var me = (s.members || []).filter(function (x) { return x.id === s.me; })[0];
            if (me && me.late > 0 && s.departed && !s.aboard && !s.cancelled)
                hit("mylate" + Math.floor(me.late / 30), en ? "🐢 At this pace you may be about " + me.late + " min late for the bus (ETA " + hm(me.arr) + "). Hurry or tell the leader."
                    : "🐢 지금 속도로는 하산 탑승에 약 " + me.late + "분 늦습니다(도착 예상 " + hm(me.arr) + "). 서두르거나 인솔자에게 알려 주세요.");
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
     * 순수 함수 - 산행을 마친 화면의 "다음은?" 줄(2026-10-28 홍TV님 추천 - 수익: 끝난 때가 가장 반가운 때, 안전 화면에는 광고 없이).
     * p - api/partners, end - {lat, lon, name: "설악산 오색"(날머리), up: 오른 높이 m, month: 1~12}. → {links: [{text, href, sponsored}], coupang, affiliate}.
     * 맛집은 카카오맵 검색(제휴 아님), 숙소는 트립닷컴(날머리 좌표 검색) · 아고다({lat}{lon}), 쿠팡은 무릎 보호대 · 스틱, 다음 산은 산 모음(광고 있는 쪽).
     */
    /**
     * 순수 함수 - 산행을 마친 화면의 쿠팡 물건(2026-10-28 홍TV님 "a, b"). coupang - api/partners 의 coupang, up - 오늘 오른 높이(m), month - 1~12.
     * recovery: 산행 뒤 회복 용품 배열(설정 partner.coupang.recovery, "이름|주소" 면 이름마다 - names 는 api/partners 의 coupangNames). gear: 다음 산행에 맞는 것 하나 -
     * 한겨울(12~2월) 아이젠 → 오늘 오르막 800m 넘으면 무릎 보호대 → 11 · 3월 보온 → 6~8월 모자 · 선크림 → 400m 넘으면 스틱 → 무릎 보호대 · 스틱. 링크가 없는 것은 건너뜀.
     */
    function afterHikeGear(coupang, up, month, names) {
        var cp = coupang || {}, first = function (k) { var u = cp[k] && cp[k][0]; return /^https:\/\//.test(u || "") ? u : null; };
        var NAMES = { crampon: "🧊 아이젠", knee: "🦵 무릎 보호대", warm: "🔥 보온병 · 핫팩", sun: "🧢 모자 · 선크림", stick: "🥢 등산 스틱" };
        up = +up || 0; month = +month || 0;
        var order = [];
        if (month === 12 || month === 1 || month === 2) order.push("crampon");
        if (up >= 800) order.push("knee");
        if (month === 11 || month === 3 || month === 12 || month === 1 || month === 2) order.push("warm");
        if (month >= 6 && month <= 8) order.push("sun");
        if (up >= 400) order.push("stick");
        order.push("knee", "stick");
        var gear = null;
        for (var i = 0; i < order.length && !gear; i++) if (first(order[i])) gear = { key: order[i], label: NAMES[order[i]], href: first(order[i]) };
        // 회복 용품 - 이름이 있으면 이름마다 단추(폼롤러 · 마사지건 · 콘드로이친, 2026-10-28 홍TV님), 없으면 "산행 뒤 회복 용품" 하나
        var recovery = [], ru = cp.recovery || [], rn = (names && names.recovery) || [];
        for (var j = 0; j < ru.length && j < 3; j++) {
            if (!/^https:\/\//.test(ru[j] || "")) continue;
            if (rn[j]) recovery.push({ key: "recovery", label: "🧴 " + rn[j], href: ru[j] });
            else if (!recovery.length) recovery.push({ key: "recovery", label: "🧴 산행 뒤 회복 용품", href: ru[j] });
        }
        return { recovery: recovery, gear: gear };
    }

    function afterHikeLinks(p, end, en) {
        var T = function (ko, e) { return en ? e : ko; }, out = [], co = false, af = false;
        p = p || {};
        end = end || {};
        var name = String(end.name || "").replace(/\s+/g, " ").trim().slice(0, 30), ok = isFinite(end.lat) && isFinite(end.lon) && end.lat !== null && end.lon !== null;
        if (name) out.push({ text: T("🍜 " + name + " 맛집", "🍜 Food near " + enName(name)), href: "https://map.kakao.com/link/search/" + encodeURIComponent(name + " 맛집"), sponsored: false });
        var trip = p.trip && ok ? tripLink(p.trip, end.lat, end.lon, name) : null;
        if (trip) { out.push({ text: T("🏨 근처 숙소(트립닷컴)", "🏨 Stays nearby (Trip.com)"), href: trip, sponsored: true }); af = true; }
        else if (p.agoda && ok && /\{lat\}/.test(p.agoda)) {
            out.push({ text: T("🏨 근처 숙소(아고다)", "🏨 Stays nearby (Agoda)"), href: p.agoda.replace(/\{lat\}/g, (+end.lat).toFixed(5)).replace(/\{lon\}/g, (+end.lon).toFixed(5)), sponsored: true });
            af = true;
        }
        if (!en) {   // 쿠팡(한국어만) - 회복 용품 하나 + 오늘 산행 · 계절에 맞는 것 하나(2026-10-28 홍TV님 "a, b 로 하자")
            var pick = afterHikeGear(p.coupang, end.up, end.month, p.coupangNames);
            pick.recovery.concat(pick.gear ? [pick.gear] : []).forEach(function (x) { out.push({ text: x.label + "(쿠팡)", href: x.href, sponsored: true }); co = true; });
        }
        out.push({ text: T("⛰️ 다음 산 고르기", "⛰️ Pick your next mountain"), href: en ? "en/m/" : "m/", sponsored: false });
        return { links: out, coupang: co, affiliate: af };
    }

    /**
     * 순수 함수 - 회원 "내 탑승 카드"(2026-10-28 홍TV님 추천 2): 큰 글씨 한 장 - 기사님 · 인솔자에게 보여 줌. s - 회원 view. → 줄 배열.
     */
    function boardingCard(s, en) {
        var T = function (ko, e) { return en ? e : ko; };
        var hm = function (ms) { var d = new Date(ms + 9 * 3600000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); };
        var out = ["🎫 " + (s.name || "") + (s.nick ? " · " + s.nick : "")], plate = (s.plates || [])[(s.bus || 1) - 1];
        if (s.buses > 1 || plate) out.push("🚌 " + (s.buses > 1 ? T(s.bus + "호차", "Bus " + s.bus) + (plate ? " · " : "") : "") + (plate || ""));
        if (s.seat) out.push("💺 " + T(s.seat + "번", "Seat " + s.seat));
        if (s.stop) { var i = (s.stops || []).indexOf(s.stop), t = i >= 0 && s.stopTimes ? s.stopTimes[i] : ""; out.push("🚏 " + s.stop + (t ? " " + t : "")); }
        if (s.drop) out.push("⬇ " + (s.drop === "버스 대기" ? T("버스 대기", "Staying on bus") : s.drop + T(" 하차", " drop-off")));
        var pk = s.pickup && s.pickupAt && s.pickupAt[s.pickup];
        if (pk) out.push(T("🚌 하산 탑승 ", "🚌 Pickup ") + s.pickup + " " + hm(pk));
        else if (s.endAt) out.push(T("⏰ 하산 마감 ", "⏰ Back by ") + hm(s.endAt));
        if (s.homeAt) out.push(T("🏠 출발지 도착 예정 ", "🏠 Back home ") + hm(s.homeAt));
        if (s.leaderPhone) out.push(T("📞 인솔자 ", "📞 Leader ") + s.leaderPhone);
        return out;
    }

    /**
     * 국립공원 스탬프투어 인증지(2026-10-28 홍TV님, data/np-stamps.json - 국립공원공단 공식 목록). 순수 함수.
     * npStampKey - 다녀감 저장 키. npStampsOn - 코스 선에서 maxM 안의 인증지 [{s, off(m), at(점 번호)}], 코스 차례대로.
     * npStampsDue - 지금 자리에서 radiusM 안이고 아직 안 다녀간 인증지.
     */
    function npStampKey(s) { return String(s.park || "") + "|" + String(s.name || "").replace(/\s+/g, ""); }
    function npStampsOn(stamps, c, maxM) {
        var out = [];
        if (!c || !c.lat || !c.lat.length) return out;
        (stamps || []).forEach(function (s) {
            if (typeof s.lat !== "number" || typeof s.lon !== "number") return;
            var best = Infinity, at = -1;
            for (var i = 0; i < c.lat.length; i++) { var d = distM(s.lat, s.lon, c.lat[i], c.lon[i]); if (d < best) { best = d; at = i; } }
            if (best <= (maxM || 300)) out.push({ s: s, off: Math.round(best), at: at });
        });
        return out.sort(function (a, b) { return a.at - b.at; });
    }
    function npStampsDue(stamps, lat, lon, have, radiusM) {
        return (stamps || []).filter(function (s) { return typeof s.lat === "number" && typeof s.lon === "number" && !(have || {})[npStampKey(s)] && distM(s.lat, s.lon, lat, lon) <= radiusM; });
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

    /**
     * 순수 함수 - 탐방 안내도 대표 코스 가운데 목록에도 둘 것(park-notes best 의 list - 이은 코스라 DB 에 없음, 2026-10-30 홍TV님 "일반 코스에도")을
     * 따라가기 검색 줄 꼴로. q 가 그 산 이름이거나 코스 이름 · 이름표에 들면. → [{course_id(이은 ID), name, kind, distance_m, ascent_m, ele_max_m, steep_pct, title, head}]
     * steep_pct(가장 가파른 1km) 가 있어야 목록 난이도가 따라가기 화면과 같음(2026-10-30 홍TV님 "맞춰줘" - 보통 ↔ 어려움).
     */
    function listBest(notes, q) {
        var k = String(q || "").replace(/\s+/g, ""), out = [];
        if (k.length < 2) return out;
        Object.keys(notes || {}).forEach(function (pk) {
            (notes[pk] && notes[pk].best || []).forEach(function (b) {
                if (!b || !b.list || !b.course || !b.name) return;
                var hay = (pk + b.name + (b.label || "")).replace(/\s+/g, "");
                if (hay.indexOf(k) < 0 && k.indexOf(pk.replace(/\s+/g, "")) !== 0) return;
                out.push({ course_id: b.course, name: pk + " · " + b.name, kind: b.list.kind || "hike", distance_m: b.list.distance_m, ascent_m: b.list.ascent_m,
                    ele_max_m: b.list.ele_max_m, steep_pct: b.list.steep_pct != null ? b.list.steep_pct : null, title: b.name, head: routeEnds(pk + " · " + b.name).from || null, best: b.label || null });
            });
        });
        return out;
    }

    /**
     * 순수 함수 - 100대 명산 이름으로 찾으면 그 정상까지 가는 코스를 먼저(2026-10-30 홍TV님: 북한산을 찾으면 백운대 코스 43개가 공단 짧은 구간 120개 뒤에 있었음).
     * 가장 높은 곳이 정상 GPS 높이(약 25m 높음) - 60m 넘는 코스, 그다음 이름에 정상 이름(산 이름을 뗀 "백운대" - 붙여 쓴 "북한산백운대" 도)이 든 코스.
     * 같은 쪽 안에서는 원래 차례. peaks - mountains100.json 의 peaks. 명산 이름이 아니면 그대로.
     */
    function summitFirst(rows, q, peaks, nameOf) {   // nameOf - 화면에 보일 이름(park-notes 로 바로잡은 탐방로 이름 - 공단 "→ 백운대" 가 실제로는 인수대피소까지)
        var k = String(q || "").replace(/\s+/g, "");
        var pk = (peaks || []).filter(function (p) { var id = String(p.id || p.name || "").replace(/\(.*\)$/, ""); return id && (k === id || k === String(p.id)); })[0];
        if (!pk || !rows || rows.length < 2) return rows;
        var base = String(pk.id || pk.name).replace(/\(.*\)$/, ""), sm = String(pk.summit || "").replace(/\s+/g, "");
        var core = sm.indexOf(base) === 0 && sm.length - base.length >= 2 ? sm.slice(base.length) : sm !== base ? sm : "";
        // 높이로 정상에 닿는 코스 먼저, 이름만 정상인 것(공단 "→ 백운대" 선이 위문 · 숨은벽에서 끝남 - 최고 494 · 594m)은 그다음
        var tier = function (r) {
            if (pk.height != null && r.ele_max_m != null && +r.ele_max_m >= +pk.height - 60) return 0;
            // 이름의 지점 하나가 정상 이름 그대로일 때만("백운대" · "북한산(백운대)" · "북한산 백운대") - "백운대탐방지원센터" 는 아님
            var n = String(nameOf ? nameOf(r) : r.name || ""), at = n.indexOf(" · "), spots = (at >= 0 ? n.slice(at + 3) : n).split(" → ").concat(at >= 0 ? [n.slice(0, at)] : []);
            return core && spots.some(function (w) {
                var x = w.replace(/\s+/g, "");
                return x === core || x === base + core || x === base + "(" + core + ")" || new RegExp("(^|[^가-힣])" + core + "$").test(x);
            }) ? 1 : 2;
        };
        var out = [[], [], []];
        rows.forEach(function (r) { out[tier(r)].push(r); });
        return out[0].concat(out[1], out[2]);
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

    /** 순수 함수 - 기록들에 든 사진 열쇠. */
    function photoIds(records) {
        var ids = [];
        (records || []).forEach(function (r) {
            (r && r.notes || []).forEach(function (n) { if (n && n.photo && ids.indexOf(n.photo) < 0) ids.push(n.photo); });
        });
        return ids;
    }

    /**
     * 순수 함수 - 출발 전 점검 줄(2026-11-01 홍TV님). o: {saved - 이 코스 오프라인 저장, battery - 0~1(모르면 null), charging,
     * eta - 예상 도착 ms, sunset - 일몰 ms, safety - 오늘의 산행 안전 한 줄(RF.safetyAlert - 알릴 것 없으면 "", 못 받았으면 null)}.
     * 줄마다 {k, ok, text}. 오프라인 저장 줄은 늘, 배터리 · 일몰 · 안전은 아는 것만. 예상 도착이 해 지기 30분 전보다 늦으면 주의.
     */
    function startChecks(o) {
        var en = LANG === "en", out = [];
        function hhmm(ms) { var d = new Date(ms + 9 * 3600000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
        out.push(o.saved ? { k: "save", ok: true, text: en ? "Map saved for offline use" : "오프라인 지도 저장됨" }
            : { k: "save", ok: false, text: en ? "Map not saved for offline use - it may not show without signal" : "오프라인 지도를 저장하지 않았습니다 - 통신이 끊기면 지도가 안 보일 수 있습니다" });
        if (o.battery != null && isFinite(o.battery)) {
            var pct = (en ? "Battery " : "배터리 ") + Math.round(o.battery * 100) + "%";
            out.push(o.battery < 0.5 && !o.charging ? { k: "battery", ok: false, text: pct + (en ? " - charge it or bring a power bank" : " - 충전하거나 보조 배터리를 챙기세요") }
                : { k: "battery", ok: true, text: pct + (o.charging ? (en ? " (charging)" : " (충전 중)") : "") });
        }
        if (o.eta && o.sunset) {
            var late = o.eta > o.sunset - 1800000;
            out.push({ k: "sun", ok: !late, text: (en ? "Expected finish " : "예상 도착 ") + hhmm(o.eta) + (en ? " · sunset " : " · 일몰 ") + hhmm(o.sunset)
                + (late ? (en ? " - later than 30 min before sunset. Start earlier or pick a shorter trail" : " - 해 지기 30분 전보다 늦습니다. 일찍 출발하거나 짧은 코스를 생각하세요") : "") });
        }
        if (o.safety != null) out.push(o.safety ? { k: "safety", ok: false, text: String(o.safety).replace(/^⛑️\s*/, "") }
            : { k: "safety", ok: true, text: en ? "No weather warning, wildfire or UV alert today" : "오늘 특보 · 산불위험 · 자외선 알림 없음" });
        return out;
    }

    /**
     * 순수 함수 - 백업 알림을 띄울지(2026-11-01 홍TV님 - 기록은 이 폰에만 있음). ends - 끝낸 산행들의 끝 시각(결산 rf-log),
     * last - 마지막 백업 시각(없으면 0), nag - 지난 알림 {at, n, off}(n - 그때 백업 뒤 산행 수, off - "나중에" 를 누름), now.
     * 백업 뒤 산행이 3번 이상이고, 이번 백업 뒤 알림이 없었거나 7일 지났을 때(나중에를 눌렀으면 그 뒤 3번 더 다녀왔을 때) 그 산행 수, 아니면 0.
     */
    function backupNag(ends, last, nag, now) {
        last = +last || 0;
        var n = (ends || []).filter(function (t) { return +t > last; }).length;
        if (n < 3) return 0;
        if (nag && +nag.at > last && (nag.off ? n < (+nag.n || 0) + 3 : now - nag.at < 7 * 86400000)) return 0;
        return n;
    }

    /** 순수 함수 - 기록 자랑 글과 링크 자리(2026-11-01). 서버 코스 기록은 코스 소개 페이지 "c/<코스>", 내 GPX · 이은 코스는 첫 화면(""). name - 화면 이름. */
    function bragShare(rec, name) {
        var en = LANG === "en", id = String(rec && rec.courseId || "");
        return { text: (en ? "Did " + name + " with routefly" : "routefly 로 " + name + " 다녀왔어요") + " · " + num(recDist(rec) / 1000, 1) + "km · " + hm((rec.end || 0) - (rec.start || 0)),
                 path: id && !isGpxId(id) && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ? "c/" + id : "" };
    }

    global.RF = {
        LINE_COLOR: LINE_COLOR,
        num: num,
        km: km,
        hm: hm,
        notifyDeploy: notifyDeploy,
        searchPlaceholder: searchPlaceholder,
        fromApi: fromApi,
        gpxToApi: gpxToApi,
        recordCourse: recordCourse,
        isGpxId: isGpxId,
        gpxId: gpxId,
        storeGpx: storeGpx,
        storedGpx: storedGpx,
        isAccess: isAccess,
        isTopName: isTopName,
        reverseCourse: reverseCourse,
        infoText: infoText,
        nearSign: nearSign,
        signText: signText,
        spotIcon: spotIcon,
        parkOf: parkOf,
        mountainOf: mountainOf,
        regionNames: regionNames,
        stampKey: stampKey,
        guideMaps: guideMaps,
        routeGuides: routeGuides,
        safeDecode: safeDecode,
        urlQuery: urlQuery,
        tmapHref: tmapHref,
        gridCells: gridCells,
        stampsDue: stampsDue,
        peakKey: peakKey,
        peaksDue: peaksDue,
        isClosedTrail: isClosedTrail,
        isHiddenCourse: isHiddenCourse,
        isComplete: isComplete,
        azWord: azWord,
        spotText: spotText,
        dangerAhead: dangerAhead,
        viewAt: viewAt,
        spotKey: spotKey,
        nearSpot: nearSpot,
        nearestExit: nearestExit,
        gpsGap: gpsGap,
        flightMs: flightMs,
        summitIndex: summitIndex,
        showName: showName,
        nameText: nameText,
        at: at,
        grade: grade,
        ascentLeft: ascentLeft,
        nextPoi: nextPoi,
        snap: snap,
        fillTrackEle: fillTrackEle,
        trimTrack: trimTrack,
        submitSheet: submitSheet,
        courseSource: courseSource,
        sourceText: sourceText,
        turnWord: turnWord,
        nationalPoint: nationalPoint,
        sunset: sunset,
        KINDS: KINDS,
        kindOf: kindOf,
        groupPois: groupPois,
        declutter: declutter,
        routeEnds: routeEnds,
        routeFlips: routeFlips,
        parseJoinId: parseJoinId,
        titledName: titledName,
        noteTrailName: noteTrailName,
        officialName: officialName,
        courseAccess: courseAccess,
        officialMatches: officialMatches,
        spotsByZoom: spotsByZoom,
        aliasName: aliasName,
        nameNodes: nameNodes,
        parkRules: parkRules,
        rulesText: rulesText,
        gateAlerts: gateAlerts,
        climbBetween: climbBetween,
        kcal: kcal,
        steps: steps,
        legMs: legMs,
        lateAt: lateAt,
        textButton: textButton,
        fitPath: fitPath,
        distM: distM,
        recordSkip: recordSkip,
        kmStep: kmStep,
        poiIcon: poiIcon,
        profile: profile,
        nameIn: function (s) { return LANG === "en" && s != null ? enName(s) : s; },
        safetyRows: safetyRows,
        safetyAlert: safetyAlert,
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        favList: favList,
        favButton: favButton,
        recordStats: recordStats,
        BACKUP_KEYS: BACKUP_KEYS,
        backupCheck: backupCheck,
        mergeRecords: mergeRecords,
        mergeStore: mergeStore,
        photoIds: photoIds,
        recDist: recDist,
        dropLog: dropLog,
        recordLines: recordLines,
        recordHighest: recordHighest,
        partyAlerts: partyAlerts,
        afterHikeLinks: afterHikeLinks,
        boardingCard: boardingCard,
        npStampKey: npStampKey,
        npStampsOn: npStampsOn,
        npStampsDue: npStampsDue,
        COUPANG_NOTE: COUPANG_NOTE,
        planText: planText,
        fireNote: fireNote,
        parkClose: parkClose,
        logEntry: logEntry,
        mergeLog: mergeLog,
        periodStats: periodStats,
        EASY: EASY,
        easyOk: easyOk,
        dotMap: dotMap,
        LEVELS: LEVELS,
        boardSegments: boardSegments,
        boardProfile: boardProfile,
        nameEnds: nameEnds,
        levelChip: levelChip,
        mapLocale: mapLocale,
        roman: roman,
        weekendText: weekendText,
        slopeBetween: slopeBetween,
        steepest: steepest,
        officialEleAt: officialEleAt,
        stampRadius: stampRadius,
        stillCheck: stillCheck,
        paceProfile: paceProfile,
        paceAt: paceAt,
        paceDistAt: paceDistAt,
        paceText: paceText,
        fortuneDay: fortuneDay,
        summitFirst: summitFirst,
        listBest: listBest,
        gapLines: gapLines,
        shownGaps: shownGaps,
        joinedCourse: joinedCourse,
        partBases: partBases,
        fixPart: fixPart,
        applyHead: applyHead,
        favJoinExtra: favJoinExtra,
        partAnswers: partAnswers,
        summitCard: summitCard,
        trackClimb: trackClimb,
        startChecks: startChecks,
        backupNag: backupNag,
        bragShare: bragShare
    };
})(window);
