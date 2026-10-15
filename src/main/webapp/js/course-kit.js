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
            go.textContent = "새 버전이 있습니다 · 누르면 새로 고침";
            go.style.cssText = "min-height:44px;padding:0 6px 0 16px;border:0;background:none;color:#062b30;font:bold 14px sans-serif;cursor:pointer";
            go.onclick = function () { location.reload(); };
            var x = document.createElement("button");
            x.type = "button";
            x.textContent = "✕";
            x.setAttribute("aria-label", "새 버전 알림 닫기");
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
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
            if (pending) { show(); return; }
            if (!first || !hiddenAt || Date.now() - hiddenAt < 60000) return;
            sign().then(function (v) {
                if (v.replace(/[|;]/g, "") && v !== first) { latest = v; pending = true; show(); }
            }).catch(function () { /* 오프라인 */ });
        });
    }
    /** 검색칸 안내 글 - 종류 탭마다(2026-10-09 홍TV님: 모두 "설악산, 공룡" 이라 구분이 안 됨). 두 화면이 같이 씁니다. */
    function searchPlaceholder(kind) {
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

    function routePlaces(courses, lines, nearM) {
        var near = nearM == null ? 500 : nearM, out = [];
        function add(name, p, start) {
            name = placeName(name);
            // 어디나 있는 이름(삼각점 · 정상 · 안부 · 갈림길 …)은 지명이 아님 - 그 자리는 끝 점만
            if (!p || !name || /^(삼각점|정상|안부\s*\d*|갈림길|삼거리|사거리|헬기장|이정표)$/.test(name)) name = "";
            if (!p) return;
            var at = out.filter(function (o) { return distM(o.lat, o.lon, p[1], p[0]) < near; })[0];
            if (at) { if (start >= 0 && at.start < 0) at.start = start; if (!at.name) at.name = name; return; }
            out.push({ name: name, lon: p[0], lat: p[1], start: start });
        }
        var flips = routeFlips(courses, lines);
        (courses || []).forEach(function (c, i) {
            var line = lines && lines[c.course_id], e = routeEnds(c.name);
            if (!line || !line.length) return;
            // 선이 이름과 거꾸로면 이름을 바꿔 붙임(선 처음 = 걸어 나가는 곳)
            var first = flips[c.course_id] ? e.to : e.from, last = flips[c.course_id] ? e.from : e.to;
            if (first) add(first, line[0], i);
            if (last) add(last, line[line.length - 1], -1);
        });
        return out.filter(function (o, k) { o.last = k === out.length - 1; return o.name; });
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
    function infoText(info) {
        if (!info) return null;
        var parts = [];
        if (+info.up_min > 0) parts.push("오름 " + hm(+info.up_min * 60000));
        if (+info.down_min > 0) parts.push("내림 " + hm(+info.down_min * 60000));
        if (info.level != null && String(info.level).trim()) parts.push("난이도 " + String(info.level).trim());
        return parts.length ? "공단 기준 " + parts.join(" · ") : null;
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
            g.textContent = "[" + p.group + "] ";
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
        items.slice().sort(function (a, b) { return a.prio - b.prio; }).forEach(function (it) {
            var r = it.el.getBoundingClientRect();
            if (!r.width) { it.el.classList.remove("hid"); return; }
            var hit = kept.some(function (k) {
                return r.left < k.right + p && r.right > k.left - p && r.top < k.bottom + p && r.bottom > k.top - p;
            });
            it.el.classList.toggle("hid", hit);
            if (!hit) kept.push(r);
        });
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
        var s = ns.sign, place = s.place_name ? " (" + s.place_name + ")" : "";
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

    function stampKey(name) { return String(name || "").replace(/\s+/g, "").replace(/인증센터$/, ""); }

    /**
     * 순수 함수 - series.json 의 센터 이름(n)에 찍힌 도장. 똑같은 키가 없으면 키에 n 이 든 것
     * (2026-10-11 PC: 공식 파일 이름은 "통일전망대(민통선내)" · "삼척임원무인" 처럼 길어 "통일전망대" · "임원" 과 안 맞았음).
     * alts: 다른 이름(series.json aka - "영산하구둑" · OSM 오타 "망양휴계소").
     */
    function stampOf(stamps, n, alts) {
        if (!stamps) return null;
        var ks = [n].concat(alts || []).map(stampKey).filter(Boolean);
        for (var i = 0; i < ks.length; i++) if (stamps[ks[i]]) return stamps[ks[i]];
        for (var key in stamps) {
            if (!Object.prototype.hasOwnProperty.call(stamps, key)) continue;
            for (var j = 0; j < ks.length; j++) if (key.indexOf(ks[j]) >= 0) return stamps[key];
        }
        return null;
    }

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

    function peakCourses(courses, peak, nearM) {
        var r = nearM || 2000, out = [];
        (courses || []).filter(function (c) { return !isClosedTrail(c.name); }).forEach(function (c) {
            var d = Math.min(c.end_lat != null ? peakGapM(peak, +c.end_lat, +c.end_lon) : Infinity,
                             c.start_lat != null ? peakGapM(peak, +c.start_lat, +c.start_lon) : Infinity);
            if (d <= r) out.push({ c: c, d: d });
        });
        return out.sort(function (a, b) { return a.d - b.d; }).map(function (x) { return x.c; });
    }

    /**
     * 순수 함수 - 인증센터마다 따라갈 구간 코스(centers 와 같은 길이, 못 찾으면 null).
     * marks: /api/group 의 centers - 구간마다 지나는 인증센터 이름표 {course_id, name, dist_m(구간 시작에서)}. aka: 센터의 다른 이름(series.json).
     * 그 센터에서 출발하거나 구간 안에 있는 구간(도착 500m 앞까지) 중 가장 앞(dist_m 작은) 것, 없으면 도착하는 구간(노선 마지막 센터).
     * 이름표가 없으면(예전 서버) 구간 이름 "… · A인증센터 → B인증센터" 의 출발 · 도착으로. 공식 이름이 길어("통일전망대(민통선내)") 이름 안에 든 것으로 봄.
     * 2026-10-12 홍TV님 "인증센터마다 따라가기" - PC: 이름만으로는 구간 안 센터가 다음 구간에 붙었음(낙단보 → 9구간).
     */
    function centerCourses(courses, centers, marks, aka) {
        var byId = {};
        (courses || []).forEach(function (c) { byId[c.course_id] = c; });
        function key(n) { return String(n || "").replace(/\s+/g, ""); }
        function ends(c) {
            var tail = key(String((c && c.name) || "").split(" · ").slice(1).join(" · "));
            var parts = tail ? tail.split("→") : [];
            return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : null;
        }
        return (centers || []).map(function (n) {
            var ks = [n].concat((aka && aka[n]) || []).map(stampKey).filter(Boolean);
            if (!ks.length) return null;
            var has = function (t) { return ks.some(function (k) { return t.indexOf(k) >= 0; }); };
            var best = null, bestD = Infinity, last = null;
            (marks || []).forEach(function (m) {
                var c = byId[m.course_id];
                if (!c || !has(key(m.name))) return;
                var d = +m.dist_m || 0, len = +c.distance_m || 0;
                if (len && d > len - 500) { last = last || c; return; }   // 도착 - 다음 구간에서 출발하면 그쪽
                if (d < bestD) { bestD = d; best = c; }
            });
            if (best || last) return best || last;
            var hit = null;
            (courses || []).some(function (c) { var e = ends(c); return e && has(e[0]) && (hit = c); });
            if (!hit) (courses || []).some(function (c) { var e = ends(c); return e && has(e[1]) && (hit = c); });
            return hit;
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
        (rows || []).forEach(function (r) {
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
                var tn = (nameParts(r.name).group || String(r.name || "")).replace(/\s*\d+(?:-\d+)?\s*코스.*$/, "").trim();
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

    /**
     * 안내도(탐방 안내도 park.html · 노선 안내도 route.html) 바탕 지도 - V-World 지도(위성은 숨겨 둠) + 지형 음영, 키가 없으면 음영만.
     * c: {demUrl, vworldKey} (/api/map-config).
     */
    function baseStyle(c) {
        var dem = { type: "raster-dem", tiles: [c.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "지형: Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": c.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (c.vworldKey) {
            var key = encodeURIComponent(c.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: "위성사진: 국토교통부 V-World",
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"] };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: "지도: 국토교통부 V-World",
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

    /** 순수 함수 - 코스를 끝까지 갔다고 볼까(가장 멀리 간 곳이 코스 길이의 90% 넘음). */
    function isComplete(dMax, total) { return total > 0 && dMax >= total * 0.9; }

    /**
     * 순수 함수 - 묶음 하나의 진행: 자전거길은 인증센터 도장 수/센터 수, 숲길은 끝까지 간 코스 수/코스 수.
     * series: series.json 의 한 줄, stamps: {stampKey: …}, done: {코스ID: …}, peakStamps: {peakKey: …}(100대 명산 정상).
     */
    function seriesProgress(series, stamps, done, peakStamps) {
        if (Array.isArray(series.peaks)) {   // 100대 명산 - 정상 도장(rf-peaks)
            return { got: series.peaks.filter(function (p) { return peakStamps && peakStamps[peakKey(p)]; }).length, of: series.peaks.length };
        }
        if (series.centers) {
            var got = series.centers.filter(function (n) { return stampOf(stamps, n, series.aka && series.aka[n]); }).length;
            return { got: got, of: series.centers.length };
        }
        // 이름으로 찾는 길(코리아둘레길 - 두루누비 코스 번호에 길 번호가 없음)은 받아 온 코스 ID 목록(ids)으로 셈
        if (series.ids) {
            return { got: series.ids.filter(function (id) { return done && done[id]; }).length, of: series.ids.length };
        }
        var n = 0;
        Object.keys(done || {}).forEach(function (id) { if (id.indexOf(series.prefix) === 0) n++; });
        return { got: n, of: series.courses || 0 };
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

    function trailCourses(courses, name) {
        var key = String(name || "").replace(/\s+/g, "");
        // 원래 이름으로 봄(nameText 는 "[해파랑길] 1코스 · …" 로 바꿔 앞이 길 이름이 아님)
        // "19-1코스(우회로)" 는 19 와 20 사이(예전에는 뒤의 1 만 읽어 1코스 앞에 왔음 - 2026-10-12 PC)
        function no(c) { var n = courseNo(c.name); if (!n) return 1e9; var p = n.split("-"); return +p[0] + (p[1] ? +p[1] / 100 : 0); }
        return (courses || []).filter(function (c) { return String(c.name || "").replace(/\s+/g, "").indexOf(key) === 0; })
            .sort(function (a, b) { return no(a) - no(b) || (a.name < b.name ? -1 : 1); });
    }

    /**
     * 순수 함수 - 코스를 걷는 차례로: 이름 끝 "가-나"(지리산둘레길 "주천-운봉")를 from 부터 끝 → 다음 코스 처음으로 잇습니다.
     * 갈림(오미 → 방광 · 난동)에서는 그다음이 이어지는 쪽을 먼저. 잇지 못한 코스는 원래 순서로 뒤에.
     * 2026-10-11 PC: 지리산둘레길 21개가 가나다 순(가탄-송정 …)이었음 - 이름에 구간 번호가 없어서.
     */
    function chainOrder(courses, from) {
        var ends = function (c) { var m = /([가-힣]+)-([가-힣]+)\s*$/.exec((c && c.name) || ""); return m ? [m[1], m[2]] : null; };
        var left = courses.slice(), out = [], at = from;
        while (at) {
            var cands = left.filter(function (c) { var e = ends(c); return e && e[0] === at; });
            if (!cands.length) break;
            var next = cands.filter(function (c) {
                var to = ends(c)[1];
                return left.some(function (o) { var e = ends(o); return o !== c && e && e[0] === to; });
            })[0] || cands[0];
            out.push(next);
            left.splice(left.indexOf(next), 1);
            at = ends(next)[1];
        }
        return out.concat(left);
    }

    /**
     * 순수 함수 - 구간 코스를 땅 위 차례로: 앞 구간 끝(end_lat/lon)과 가장 가까운(nearM 안) 시작을 다음으로 잇습니다.
     * 맨 앞은 다른 구간 끝이 nearM 안에 없는 시작. 한 바퀴(맨 앞이 없음) · 잇지 못한 구간은 원래 순서로 뒤에.
     * 2026-10-11 PC: 동해안(강원) 5구간(고포 → 오분동)은 실제로 1구간 앞인데 맨 뒤에 보였음 - 끊긴 묶음이라 번호가 뒤.
     */
    function geoOrder(courses, nearM) {
        nearM = nearM || 10000;
        var ok = function (c) { return c && c.start_lat != null && c.end_lat != null; };
        var gap = function (a, b) { return distM(a.end_lat, a.end_lon, b.start_lat, b.start_lon); };
        var left = courses.slice(), out = [];
        var head = left.filter(function (c) {
            return ok(c) && !left.some(function (o) { return o !== c && ok(o) && gap(o, c) <= nearM; });
        })[0];
        for (var cur = head; cur; ) {
            out.push(cur);
            left.splice(left.indexOf(cur), 1);
            var best = null, bestD = nearM;
            left.forEach(function (o) { if (ok(o) && gap(cur, o) <= bestD) { bestD = gap(cur, o); best = o; } });
            cur = best;
        }
        return out.concat(left);
    }

    /** 국립공원 위험지역 · 조망점 종류 → 지도 아이콘. */
    var SPOT_ICONS = { danger: "⚠️", aid: "⛑️", heli: "🚁", ranger: "🏠", view: "🔭" };
    function spotIcon(kind) { return SPOT_ICONS[kind] || "•"; }

    /** 순수 함수 - 방위(도) → 8 방위 말(255 → 서남서가 아니라 "서"). 모르면 "". */
    function azWord(az) {
        if (az == null || isNaN(+az)) return "";
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
    }

    /** 순수 함수 - 이름표 글: 위험 "낙석주의", 이름과 종류가 다르면 "미끄럼주의(추락주의)", 조망점 "제석봉 조망점 · 서쪽 0.7km". */
    function spotText(s) {
        if (!s) return "";
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

    /** 순수 함수 - 미리보기 정보 줄에 붙일 말: "⚠️ 위험 2곳 · 🔭 조망점 1곳". 없으면 "". */
    function spotSummary(spots) {
        var n = { danger: 0, view: 0 };
        (spots || []).forEach(function (s) { if (n[s.kind] != null) n[s.kind]++; });
        return [n.danger ? "⚠️ 위험 " + n.danger + "곳" : "", n.view ? "🔭 조망점 " + n.view + "곳" : ""].filter(Boolean).join(" · ");
    }

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

    /**
     * 순수 함수 - "내 기록" 하나(rec.track: [[위도, 경도, 시각, 고도|null], …], rec.notes) → 고도 그래프 · 지도에 그릴 코스 모양.
     * 점은 10m 보다 가까우면 솎고(끝점은 남김), 사진 · 메모는 가장 가까운 기록 점의 거리에 이름표로 둡니다.
     */
    function recordCourse(rec) {
        var c = { id: "rec", course: { name: rec.name, kind: rec.kind }, lon: [], lat: [], ele: [], dist: [], markers: [], pois: [], junctions: [] };
        var tr = rec.track || [], last = null, d = 0;
        tr.forEach(function (p, i) {
            var step = last ? distM(last[0], last[1], p[0], p[1]) : 0;
            if (last && step < GPX_SPACING_M && i < tr.length - 1) return;
            d += step;
            c.lat.push(+p[0]); c.lon.push(+p[1]); c.ele.push(p[3] == null ? null : +p[3]); c.dist.push(d);
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
        if (a < 0) return name + " (거꾸로)";
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
        r.dist = c.dist.map(function (d) { return T - d; }).reverse();
        r.pois = c.pois.map(function (p) {
            var q = {};
            for (var k2 in p) if (Object.prototype.hasOwnProperty.call(p, k2)) q[k2] = p[k2];
            q.dist_m = T - (+p.dist_m);
            return q;
        }).sort(function (a, b) { return a.dist_m - b.dist_m; });
        r.junctions = (c.junctions || []).map(function (d) { return T - d; }).sort(function (a, b) { return a - b; });
        r.asc = cumAscent(r.ele);
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

    /**
     * 순수 함수 - 공단 탐방로(trails)에 빠진 길을 다른 자료 등산 코스(others - /api/park 의 others)로 메웁니다(2026-10-12 홍TV님:
     * 설악산 소공원 → 비선대 → 천불동이 공단 자료에 없어 원점회귀를 못 만듦, 지도가 비어 보임).
     * 다른 코스에서 공단 탐방로와 FAR_M 넘게 떨어진 점이 이어진 부분만 떼어(양 끝 한 점씩 붙여 공단 탐방로에 닿게), 양 끝이 공단 탐방로에 닿거나
     * 한 끝은 닿고 다른 끝이 들머리(heads · 코스 끝) 둘레면 씀. 300m 안은 뺌, 같은 자리 · 같은 길이는 하나(dedupeSegs).
     * → [{id: "다른코스ID@비율-비율:처음>끝", base, name: "공원 · 처음 → 끝", coords, distance_m, ascent_m: null, extra: true, nocut: true}]
     * 끝 이름은 places · heads 가운데 300m 안 가까운 것, 없으면 "갈림길"(코스 끝이면 그 코스 이름의 처음 · 끝).
     */
    function gapFill(trails, others, places, heads, park) {
        var FAR_M = 120, MIN_M = 300, d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        if (!others || !others.length || !trails || !trails.length) return [];
        var grid = {}, cell = function (p) { return Math.round(p[0] * 300) + "," + Math.round(p[1] * 300); };
        trails.forEach(function (t) { t.coords.forEach(function (p) { (grid[cell(p)] = grid[cell(p)] || []).push(p); }); });
        var nearKnps = function (p, lim) {
            var cx = Math.round(p[0] * 300), cy = Math.round(p[1] * 300);
            for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
                var g = grid[(cx + dx) + "," + (cy + dy)];
                if (g) for (var i = 0; i < g.length; i++) if (d(p, g[i]) < lim) return true;
            }
            return false;
        };
        // 점이 닿은 공단 탐방로와 그 탐방로 위 거리(처음부터 m) - 같은 탐방로 옆을 나란히 그린 선을 거르려고
        var tcum = trails.map(function (t) { var cu = [0]; for (var i = 1; i < t.coords.length; i++) cu.push(cu[i - 1] + d(t.coords[i - 1], t.coords[i])); return cu; });
        var onTrail = function (p) {
            var best = null, bd = 200;
            trails.forEach(function (t, ti) { t.coords.forEach(function (q, k) { var x = d(p, q); if (x < bd) { bd = x; best = { t: ti, at: tcum[ti][k] }; } }); });
            return best;
        };
        var named = (places || []).concat(heads || []);
        var nameAt = function (p) {
            var best = null, bd = 300;
            named.forEach(function (pl) {
                var nm = placeName(pl.name);
                if (!nm || /^(삼각점|정상|갈림길|삼거리|사거리|헬기장|이정표)$/.test(nm)) return;
                var x = d(p, [+pl.lon, +pl.lat]);
                // 가장 가까운 것이 먼 봉우리면 이름 없이(그 뒤 다른 이름을 붙이지 않음 - 치악산 남대봉 237m · 남대봉안전센터 239m)
                if (x < bd) { bd = x; best = x > peakNearM(nm) ? null : nm; }
            });
            return best;
        };
        var nearHead = function (p) { return (heads || []).some(function (h) { return d(p, [+h.lon, +h.lat]) < 500; }); };
        var out = [];
        others.forEach(function (o) {
            var c = o.coords;
            if (!c || c.length < 3) return;
            var cum = [0];
            for (var i = 1; i < c.length; i++) cum.push(cum[i - 1] + d(c[i - 1], c[i]));
            var total = cum[cum.length - 1], far = c.map(function (p) { return !nearKnps(p, FAR_M); }), e = routeEnds(o.name);
            for (var a = 0; a < c.length; a++) {
                if (!far[a]) continue;
                var b = a;
                while (b + 1 < c.length && far[b + 1]) b++;
                var i0 = Math.max(0, a - 1), i1 = Math.min(c.length - 1, b + 1);
                var attA = a > 0, attB = b < c.length - 1;   // 앞 · 뒤 점이 공단 탐방로 둘레
                var headA = !attA && nearHead(c[0]), headB = !attB && nearHead(c[c.length - 1]);
                a = b;
                if (!((attA && attB) || (attA && headB) || (attB && headA))) continue;
                if (cum[i1] - cum[i0] < MIN_M || !total) continue;
                // 양 끝이 같은 공단 탐방로에 닿고 그 사이 공단 길이와 비슷하면(0.6 ~ 1.6배) 같은 길을 옆에 나란히 그린 것 - 뺌
                // (2026-10-13: 설악산 "대청봉 → 중청봉 → 대청봉" 같은 가짜 고리가 생겼음)
                var ta = onTrail(c[i0]), tb = onTrail(c[i1]);
                if (ta && tb && ta.t === tb.t) {
                    var along = Math.abs(tb.at - ta.at), run = cum[i1] - cum[i0];
                    if (along > 0.6 * run && along < 1.6 * run) continue;
                }
                var from = nameAt(c[i0]) || (i0 === 0 && e.from) || "갈림길", to = nameAt(c[i1]) || (i1 === c.length - 1 && e.to) || "갈림길";
                var r0 = cum[i0] / total, r1 = cum[i1] / total;
                out.push({ id: o.id + "@" + r0.toFixed(4) + "-" + r1.toFixed(4) + ":" + from + ">" + to, base: o.id,
                           name: (park ? park + " · " : "") + endsText(from, to), coords: c.slice(i0, i1 + 1),
                           distance_m: Math.round(cum[i1] - cum[i0]), ascent_m: null, extra: true, nocut: true });
            }
        });
        return dedupeSegs(out);
    }

    /** 순수 함수 - 고른 구간 안에 이은 구간(mergeBare)이 있으면 풀어서 코스 조각 차례로(거꾸로면 차례 · ~ 도 뒤집음). */
    function flattenSel(sel) {
        var out = [];
        (sel || []).forEach(function (s) {
            var parts = s.id.indexOf(",") >= 0 ? parseJoinId(s.id) : null;
            if (!parts) { out.push(s); return; }
            (s.rev ? reverseSel(parts) : parts).forEach(function (p) { out.push({ id: p.id, rev: p.rev }); });
        });
        return out;
    }

    /*
     * 산의 입산 · 통제 안내(data/park-notes.json - 2026-10-12 한라산: 하절기 4~9월 · 동절기 10~3월, 코스마다 통제 지점 · 시각).
     */

    /** 순수 함수 - 그날의 계절과 코스(이름들 가운데 match 가 맞는 것)의 통제 · 하산 시각. note 가 없으면 null. */
    function parkRules(note, names, date) {
        if (!note) return null;
        var m = date.getMonth() + 1, season = null;
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
        c.gates.forEach(function (g) { parts.push(g.name + " " + g.time + " 입산 통제"); });
        c.down.forEach(function (g) { parts.push(g.name + " " + g.time + " 하산"); });
        if (c.reserve) parts.push(c.reserve);
        if (r.open) parts.unshift("입산 " + r.open + "부터");
        return c.label + (r.season ? "(" + r.season + ")" : "") + ": " + parts.join(" · ");
    }

    /**
     * 순수 함수 - 지금(now) 알릴 통제 · 하산 시각: 60 · 30 · 10분 앞과 지난 때. said 에 이미 알린 열쇠가 있으면 빼고 [{key, text}].
     * 걷는 중에만 부름(따라가기). 시각은 그날 기준.
     */
    function gateAlerts(r, now, said) {
        var out = [];
        if (!r || !r.course) return out;
        var at = function (hm) { var p = String(hm).split(":"), d = new Date(now); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); };
        var check = function (g, kind) {
            var left = (at(g.time) - now) / 60000;
            [60, 30, 10].forEach(function (th) {
                var key = kind + "|" + g.name + "|" + th;
                if (left <= th && left > th - 10 && !(said && said[key]))
                    out.push({ key: key, text: g.name + (kind === "in" ? " 입산 통제" : " 하산 시각") + "까지 " + th + "분 남았습니다(" + g.time + ")." });
            });
            var key0 = kind + "|" + g.name + "|0";
            if (left <= 0 && left > -15 && !(said && said[key0]))
                out.push({ key: key0, text: g.name + (kind === "in" ? " 입산 통제 시각(" + g.time + ")이 지났습니다. 통제 지점을 지나 오를 수 없습니다."
                    : " 하산 시각(" + g.time + ")입니다. 내려가기 시작하세요.") });
        };
        r.course.gates.forEach(function (g) { check(g, "in"); });
        r.course.down.forEach(function (g) { check(g, "down"); });
        return out;
    }

    /** 순수 함수 - 처음 · 끝 이름 → "가 → 나"(같으면 "가 부근", 한쪽만이면 "가에서" · "나까지", 둘 다 없으면 ""). */
    function endsText(from, to) {
        // 같은 곳이면 "가 부근"(갈림길 · 끝처럼 어디인지 모르는 이름은 그대로 둘)
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
        s.course.ascent_m = Math.round(s.asc[s.asc.length - 1] || 0);
        endPois(s);
        return s;
    }

    /**
     * 순수 함수 - 노선 안내도에서 구간을 누를 때 고른 구간(차례대로 [{id, rev}])을 바꿈. 한 번 누르면 고르고 다시 누르면 뺌.
     * 고른 것의 앞 끝 · 뒤 끝에 nearM 안으로 이어지는 구간이면 그쪽에 붙이고(방향은 이어지게), 이어지지 않으면 그 구간만 새로 고름.
     * 가운데 구간을 빼면 긴 쪽을 남김(건너뛴 구간 없이 늘 이어진 것만). lines: {코스ID: [[경도, 위도]…]}.
     */
    function chainPick(sel, id, lines, nearM) {
        var near = nearM == null ? 500 : nearM, l = lines && lines[id];
        sel = (sel || []).slice();
        var k = sel.map(function (s) { return s.id; }).indexOf(id);
        if (k >= 0) {
            if (k === 0) return sel.slice(1);
            if (k === sel.length - 1) return sel.slice(0, -1);
            return k >= sel.length - 1 - k ? sel.slice(0, k) : sel.slice(k + 1);
        }
        if (!l || l.length < 2) return sel;
        if (!sel.length) return [{ id: id, rev: false }];
        var endOf = function (s, last) { var q = lines[s.id]; return (!!s.rev !== last) ? q[q.length - 1] : q[0]; };
        var S = endOf(sel[0], false), E = endOf(sel[sel.length - 1], true), a = l[0], z = l[l.length - 1];
        var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        if (d(a, E) < near) return sel.concat([{ id: id, rev: false }]);
        if (d(z, E) < near) return sel.concat([{ id: id, rev: true }]);
        if (d(z, S) < near) return [{ id: id, rev: false }].concat(sel);
        if (d(a, S) < near) return [{ id: id, rev: true }].concat(sel);
        return [{ id: id, rev: false }];   // 이어지지 않음 - 그 구간만 새로
    }

    /**
     * 순수 함수 - 고른 구간(차례대로)이 등산 코스 모양인가(2026-10-12 홍TV님: 칼바위를 두 번 지나며 오르내리는 코스는 없음 - 둘레길과 다름).
     * 지나는 갈림길(구간 사이 점)을 차례로 보고:
     *   path  - 같은 곳을 두 번 지나지 않음(한쪽에서 올라 다른 쪽으로)
     *   loop  - 끝이 처음 자리(원점회귀)
     *   lolli - 끝이 지나온 갈림길 k(들머리 → 갈림길 → 한 바퀴 → 갈림길 → 들머리: 중산리 → 칼바위 → 로터리 → 천왕봉 → 장터목 → 칼바위 → 중산리) -
     *           따라가기는 처음 k 구간을 거꾸로 붙여 들머리로 돌아옴
     *   bad   - 그 밖(같은 곳을 엉뚱하게 두 번)
     * → {type, k}. nearM 안이면 같은 곳.
     */
    /**
     * 순수 함수 - 이어 걷기 그림: 구간마다 걷는 방향 좌표 + 빈틈 점선. 다음 구간 시작이 갈림길을 지나쳐 그려진 자료면(지리산 벽소령 -
     * 연하천삼거리 선 끝이 대피소 남쪽 120m) 앞 구간 끝에서 가장 가까운 점까지 잘라 V 자로 내려갔다 오지 않게(2026-10-14 PC).
     * 앞 구간 끝이 지나쳐 그려진 것 · 둘 다 지나쳐 나란히 그려진 것도 같은 방법. 잘라도 더 가까워지지 않으면 그대로. → {lines: [[[lon,lat]…]…], gaps: [[a, b]…]}
     */
    function joinDraw(sel, lines, maxM) {
        var max = maxM == null ? 200 : maxM, segs = [];
        (sel || []).forEach(function (s) {
            var q = lines[s.id];
            if (q && q.length) segs.push(s.rev ? q.slice().reverse() : q.slice());
        });
        var gaps = [];
        var d = function (a, b) { return distM(a[1], a[0], b[1], b[0]); };
        for (var i = 0; i + 1 < segs.length; i++) {
            var A = segs[i], B = segs[i + 1], aEnd = A[A.length - 1], gap0 = d(aEnd, B[0]);
            // A 뒤쪽 절반 × B 앞쪽 절반에서 가장 가까운 두 점 - 둘 다 갈림길을 지나쳐 나란히 그려진 자료도(지리산 세석평전 - 2026-10-14 PC: 15m 간격으로 나란히)
            var ai = A.length - 1, bj = 0, best = gap0, k, m;
            for (k = Math.floor(A.length / 2); k < A.length; k++) {
                for (m = 0; m < Math.ceil(B.length / 2); m++) { var x = d(A[k], B[m]); if (x < best) { best = x; ai = k; bj = m; } }
            }
            if (best < gap0 - 10) { segs[i] = A = A.slice(0, ai + 1); segs[i + 1] = B = B.slice(bj); }
            var g = d(A[A.length - 1], B[0]);
            if (g > 3 && g <= max) gaps.push([A[A.length - 1], B[0]]);
        }
        return { lines: segs, gaps: gaps };
    }

    function chainShape(sel, lines, nearM) {
        var near = nearM == null ? 150 : nearM, pts = [];
        if (!sel || !sel.length) return { type: "path", k: -1 };
        var endOf = function (s, last) { var q = lines[s.id]; return (!!s.rev !== last) ? q[q.length - 1] : q[0]; };
        pts.push(endOf(sel[0], false));
        sel.forEach(function (s) { pts.push(endOf(s, true)); });
        var same = function (i, j) { return distM(pts[i][1], pts[i][0], pts[j][1], pts[j][0]) < near; };
        var n = pts.length - 1, reps = [];
        for (var i = 0; i <= n; i++) for (var j = i + 1; j <= n; j++) if (j - i >= 2 && same(i, j)) reps.push([i, j]);
        if (!reps.length) return { type: "path", k: -1 };
        if (reps.length === 1 && reps[0][1] === n) return reps[0][0] === 0 ? { type: "loop", k: 0 } : { type: "lolli", k: reps[0][0] };
        return { type: "bad", k: -1 };
    }

    /**
     * el 에 이름 글을 넣되 "탐방지원센터" · "탐방안내소" 는 작은 글씨로(2026-10-12 홍TV님: 중산리탐방지원센터 등 - 전체 동일).
     * 글은 textContent 로만(이름에 꺾쇠가 있어도 안전).
     */
    var SMALL_SUFFIX = /(탐방지원센터|탐방안내소)/;
    function nameNodes(el, text) {
        el.textContent = "";
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
     * 순수 함수 - 탐방로 이름의 처음 · 끝이 들머리 이름의 앞부분이고(중산리 ↔ 중산리탐방지원센터) 그 끝 500m 안에 그 들머리가 있으면 들머리 이름으로.
     * heads: [{name, lat, lon}](/api/park - 다른 자료 코스 이름에서 모은 탐방지원센터 · 탐방안내소). 2026-10-12 홍TV님.
     */
    function headAlias(trails, heads, nearM) {
        var near = nearM == null ? 500 : nearM;
        if (!heads || !heads.length) return trails;
        return (trails || []).map(function (t) {
            var e = routeEnds(t.name), names = {};
            [e.from, e.to].forEach(function (w) {
                // 폭포 · 봉우리 · 고개 · 절 같은 자연 · 지명은 그대로(2026-10-13 PC: 설악산 용소폭포가 용소폭포탐방지원센터로 바뀌었음)
                if (!w || SMALL_SUFFIX.test(w) || /(폭포|봉|산|대|령|재|고개|골|계곡|담|소|암|굴|바위)$/.test(w)) return;
                var key = w.replace(/\s+/g, "");
                [t.coords[0], t.coords[t.coords.length - 1]].forEach(function (p) {
                    heads.forEach(function (h) {
                        var hn = String(h.name || "");
                        if (names[w] || hn.replace(SMALL_SUFFIX, "") !== key) return;
                        if (distM(p[1], p[0], +h.lat, +h.lon) < near) names[w] = hn;
                    });
                });
            });
            if (!Object.keys(names).length) return t;
            var x = {};
            for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) x[k] = t[k];
            x.name = aliasName(t.name, names);
            return x;
        });
    }

    /**
     * 순수 함수 - 고른 탐방로 묶음(차례 없음)을 실제로 걷는 순서로(2026-10-12 홍TV님: 중산리 → 칼바위 → 로터리 → 천왕봉 → 로터리 → 순두류 → 중산리 처럼
     * 정상은 올랐다 같은 길로 내려와 다른 길로 - 한 줄로 잇는 방식으로는 못 골랐음).
     *   - 출발: 들머리(heads 500m 안 막다른 끝), 없으면 처음 고른 탐방로의 막다른 끝, 없으면 그 처음
     *   - 막다른 끝 가운데 다른 들머리는 도착(한쪽으로 가는 코스), 들머리가 아닌 막다른 끝(정상 · 폭포 …)은 올랐다 같은 길로(두 번)
     *   - 그래도 갈림길에서 끝나면 출발까지 가장 짧은 길로 돌아옴(원점회귀)
     * ids: 고른 탐방로 ID, lines: {ID: 좌표}, opts: {heads, first(처음 고른 ID), nearM, start([경도, 위도] - 출발을 정할 때, 300m 안 끝)}.
     * → {ok, walk:[{id, rev}], loop, start:[경도, 위도], end:[경도, 위도]}. 이어지지 않으면 ok:false.
     */
    function planWalk(ids, lines, opts) {
        opts = opts || {};
        var near = opts.nearM == null ? 150 : opts.nearM, d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        ids = (ids || []).filter(function (id) { return lines[id] && lines[id].length > 1; });
        if (!ids.length) return { ok: false };
        var nodes = [], node = function (p) {
            for (var i = 0; i < nodes.length; i++) if (d(p, nodes[i]) < near) return i;
            nodes.push(p);
            return nodes.length - 1;
        };
        var E = ids.map(function (id) { var l = lines[id]; return { id: id, a: node(l[0]), b: node(l[l.length - 1]) }; });
        var adj = nodes.map(function () { return []; });
        E.forEach(function (e, i) { adj[e.a].push(i); adj[e.b].push(i); });
        // 이어져 있나
        var seen = { 0: true }, st = [0];
        while (st.length) adj[st.pop()].forEach(function (i) { [E[i].a, E[i].b].forEach(function (n) { if (!seen[n]) { seen[n] = true; st.push(n); } }); });
        if (Object.keys(seen).length !== nodes.length) return { ok: false, reason: "apart" };   // 아직 이어지지 않음
        var deg = adj.map(function (a) { return a.length; }), leaves = [];
        deg.forEach(function (g, n) { if (g === 1) leaves.push(n); });
        var isHead = function (n) { return (opts.heads || []).some(function (h) { return d(nodes[n], [+h.lon, +h.lat]) < 500; }); };
        var firstE = E.filter(function (e) { return e.id === opts.first; })[0] || E[0];
        // 들머리가 여럿이면 탐방지원센터에 가장 가까운 곳(중산리탐방지원센터 3m · 법계교 257m)
        var headD = function (n) { return Math.min.apply(null, (opts.heads || []).map(function (h) { return d(nodes[n], [+h.lon, +h.lat]); }).concat([Infinity])); };
        // 먼저 누른 탐방로 쪽 들머리가 출발(2026-10-13 홍TV님: 한계령을 먼저 누르고 남설악을 눌렀는데 남설악이 출발이 됐음)
        var s = [firstE.a, firstE.b].filter(function (n) { return deg[n] === 1 && isHead(n); })[0];
        if (s == null) s = leaves.filter(isHead).sort(function (x, y) { return headD(x) - headD(y); })[0];
        if (s == null) s = [firstE.a, firstE.b].filter(function (n) { return deg[n] === 1; })[0];
        if (s == null) s = firstE.a;
        // 출발을 정해 줌(원점회귀 예시의 들머리 - 고리 위 들머리는 막다른 끝이 아니라 첫 탐방로 끝이 출발이 됐음, 2026-10-13)
        if (opts.start) {
            var sd = 300;
            nodes.forEach(function (q, n) { var x = d(q, opts.start); if (x < sd) { sd = x; s = n; } });
        }
        var others = leaves.filter(function (n) { return n !== s; }), ends = others.filter(isHead);
        var end = ends.length ? ends[0] : null, spurs;
        // 들머리 자료가 없고 막다른 끝이 하나뿐인 그냥 길이면 거기가 도착
        if (end == null && others.length === 1 && E.length === nodes.length - 1) end = others[0];
        spurs = others.filter(function (n) { return n !== end; });
        // 막다른 갈래(올랐다 같은 길로 돌아올 곳)는 하나만 - 둘 이상이면 사이 탐방로가 빠진 것(2026-10-13 홍TV님: 설악산 무너미고개 · 양폭대피소
        // 사이가 빠졌는데 둘 다 되돌아오는 26km 원점회귀로 짰음). 아직 이어지지 않은 것으로 봄
        // 막다른 끝 자리(loose)도 줌 - "끝이 소공원 · 양폭대피소 · 무너미고개 세 곳으로 갈라져 있습니다"(2026-10-13 PC)
        if (spurs.length > 1) return { ok: false, reason: "apart", loose: leaves.map(function (n) { return nodes[n]; }) };
        var M = E.map(function (e) { return { id: e.id, a: e.a, b: e.b }; });   // 걷는 길(두 번 걷는 길은 두 벌)
        // 막다른 갈래는 막다른 끝에서 갈림길(세 갈래 이상)까지 전부 두 번(2026-10-13 PC: 천왕봉 370m 앞에서 잘려 "법계사 → 갈림길 → 천왕봉" 두 조각이면
        // 마지막 조각만 두 번이라 못 짰음)
        spurs.forEach(function (n) {
            var prevE = -1, cur = n;
            while (true) {
                var nxt = adj[cur].filter(function (i) { return i !== prevE; })[0];
                if (nxt == null) break;
                M.push({ id: E[nxt].id, a: E[nxt].a, b: E[nxt].b });
                cur = E[nxt].a === cur ? E[nxt].b : E[nxt].a;
                prevE = nxt;
                if (adj[cur].length !== 2 || cur === s || cur === end) break;
            }
        });
        var mdeg = nodes.map(function () { return 0; });
        M.forEach(function (e) { mdeg[e.a]++; mdeg[e.b]++; });
        var odd = mdeg.map(function (g, n) { return g % 2 ? n : -1; }).filter(function (n) { return n >= 0; });
        if (odd.length === 2 && odd.indexOf(s) >= 0) {
            var t = odd[0] === s ? odd[1] : odd[0];
            if (t !== end) {
                // 갈림길에서 끝남 - 출발까지 가장 짧은 길(고른 탐방로 안)을 한 번 더 걸어 돌아옴
                var dist = {}, prev = {}, q = [t];
                dist[t] = 0;
                while (q.length) {
                    q.sort(function (x, y) { return dist[x] - dist[y]; });
                    var u = q.shift();
                    adj[u].forEach(function (i) {
                        var v = E[i].a === u ? E[i].b : E[i].a, L = d(nodes[E[i].a], nodes[E[i].b]) + 1;
                        if (dist[v] == null || dist[u] + L < dist[v]) { dist[v] = dist[u] + L; prev[v] = i; q.push(v); }
                    });
                }
                for (var v = s; v !== t && prev[v] != null; v = E[prev[v]].a === v ? E[prev[v]].b : E[prev[v]].a)
                    M.push({ id: E[prev[v]].id, a: E[prev[v]].a, b: E[prev[v]].b });
                mdeg = nodes.map(function () { return 0; });
                M.forEach(function (e) { mdeg[e.a]++; mdeg[e.b]++; });
                odd = mdeg.map(function (g, n) { return g % 2 ? n : -1; }).filter(function (n) { return n >= 0; });
            }
        }
        if (!(odd.length === 0 || (odd.length === 2 && odd.indexOf(s) >= 0))) return { ok: false, reason: "shape" };
        // 한 붓 그리기(Hierholzer) - s 에서
        var madj = nodes.map(function () { return []; }), used = M.map(function () { return false; });
        M.forEach(function (e, i) { madj[e.a].push(i); madj[e.b].push(i); });
        var stack = [{ n: s, e: -1 }], path = [];
        while (stack.length) {
            var top = stack[stack.length - 1], nx = -1;
            while (madj[top.n].length) { var i2 = madj[top.n].pop(); if (!used[i2]) { nx = i2; break; } }
            if (nx < 0) { path.push(stack.pop()); continue; }
            used[nx] = true;
            stack.push({ n: M[nx].a === top.n ? M[nx].b : M[nx].a, e: nx, from: top.n });
        }
        path.reverse();
        var walk = path.filter(function (x) { return x.e >= 0; }).map(function (x) { return { id: M[x.e].id, rev: M[x.e].a !== x.from }; });
        if (walk.length !== M.length) return { ok: false, reason: "shape" };
        var last = path[path.length - 1].n;
        // 끝이 출발 600m 안이면 원점회귀(중산리탐방지원센터 ↔ 법계교 375m)
        // 한 구간이 정상을 지나 조금 되돌아 끝나는 것(지리산 "갈림길 → 천왕봉" 491m)은 원점회귀가 아님 - 2km 넘게 걸을 때만(2026-10-13 PC)
        var walkM = walk.reduce(function (m, x) { var l = lines[x.id]; for (var i = 1; i < l.length; i++) m += d(l[i - 1], l[i]); return m; }, 0);
        return { ok: true, walk: walk, loop: last === s || (d(nodes[last], nodes[s]) < 600 && walkM > 2000), start: nodes[s], end: nodes[last] };
    }

    /**
     * 순수 함수 - 탐방 안내도의 원점회귀 예시(2026-10-13 홍TV님: 모든 산에 원점회귀 코스 예시). 들머리에서 봉우리까지 가장 짧은 길로 오르고,
     * 그 길을 되도록 피한 다른 길로 내려오는 고리(올라간 길과 1km 넘게 · 30% 넘게 달라야). 고리가 없으면 같은 길 왕복.
     * 옅은 선(gapFill - 산림청 · 등산트레킹 자료)은 1.5km 안 짧은 이음만 - 한라산 남벽분기점 → 정상처럼 막힌 길이 섞였음.
     * segs: [{id, coords, distance_m, extra}], heads: [{name, lat, lon}](들머리 - 300m 안 구간 끝), peaks: [{name, lat, lon, ele_m}](150m 안 구간 끝),
     * opts: {max(3), minM(3000), maxM(20000), planHeads(planWalk 의 heads), block([[경도, 위도]] - 지나갈 수 없는 곳, park-notes 의 noPass)}.
     * → [{ids, walk, loop, head, peak, m, start}] - 높은 봉우리부터, 봉우리마다 하나, 앞 예시와 절반 넘게 같은 길이면 뺌.
     */
    function loopExamples(segs, heads, peaks, opts) {
        opts = opts || {};
        var max = opts.max || 3, minM = opts.minM || 3000, maxM = opts.maxM || 20000;
        var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); }, nodes = [], lines = {}, len = {};
        var node = function (p) {
            for (var i = 0; i < nodes.length; i++) if (d(p, nodes[i]) < 150) return i;
            nodes.push(p);
            return nodes.length - 1;
        };
        var E = [];
        (segs || []).forEach(function (s) {
            // 옅은 선은 1.5km 안 짧은 이음만(설악산 중청 → 대청봉 600m 는 공단 자료에 없음), 지나갈 수 없는 곳(opts.block - 한라산 남벽분기점) 둘레는 빼고
            if (!s.coords || s.coords.length < 2 || (s.extra && !(+s.distance_m <= 1500))) return;
            if (s.extra && (opts.block || []).some(function (b) { return d(s.coords[0], b) < 300 || d(s.coords[s.coords.length - 1], b) < 300; })) return;
            lines[s.id] = s.coords;
            len[s.id] = +s.distance_m || 1;
            E.push({ id: s.id, a: node(s.coords[0]), b: node(s.coords[s.coords.length - 1]), m: len[s.id] });
        });
        var adj = nodes.map(function () { return []; });
        E.forEach(function (e, i) { if (e.a !== e.b) { adj[e.a].push(i); adj[e.b].push(i); } });
        var nearest = function (p, lim) {
            var best = -1, bd = lim;
            nodes.forEach(function (q, n) { var x = d(p, q); if (x < bd) { bd = x; best = n; } });
            return best;
        };
        var path = function (from, to, cost) {
            var dist = nodes.map(function () { return Infinity; }), pe = nodes.map(function () { return -1; }), done = {}, q = [from];
            dist[from] = 0;
            while (q.length) {
                q.sort(function (x, y) { return dist[x] - dist[y]; });
                var u = q.shift();
                if (done[u]) continue;
                done[u] = true;
                if (u === to) break;
                adj[u].forEach(function (i) {
                    var v = E[i].a === u ? E[i].b : E[i].a, w = dist[u] + cost(i);
                    if (w < dist[v]) { dist[v] = w; pe[v] = i; q.push(v); }
                });
            }
            if (!isFinite(dist[to])) return null;
            var out = [], n = to;
            while (n !== from) { out.push(pe[n]); n = E[pe[n]].a === n ? E[pe[n]].b : E[pe[n]].a; }
            return out.reverse();
        };
        var H = (heads || []).map(function (h) { return { h: h, n: nearest([+h.lon, +h.lat], 300) }; }).filter(function (x) { return x.n >= 0; });
        var P = (peaks || []).filter(function (p) { return p.ele_m != null; }).slice().sort(function (x, y) { return +y.ele_m - +x.ele_m; })
            .map(function (p) { return { p: p, n: nearest([+p.lon, +p.lat], 150) }; }).filter(function (x) { return x.n >= 0; });
        var out = [], usedHead = {};
        P.forEach(function (pk) {
            // 이웃한 봉우리(1km - 도봉산 신선대 · 자운봉, 설악산 대청봉 · 중청봉)는 같은 산행이라 빼고
            if (out.length >= max) return;
            if (out.some(function (o) { return o.at !== pk.p && d([+o.at.lon, +o.at.lat], [+pk.p.lon, +pk.p.lat]) < 1000; })) return;
            var cands = [];
            H.forEach(function (hd) {
                if (hd.n === pk.n) return;
                var up = path(hd.n, pk.n, function (i) { return E[i].m; });
                if (!up) return;
                var upSet = {};
                up.forEach(function (i) { upSet[i] = true; });
                var upM = up.reduce(function (m, i) { return m + E[i].m; }, 0);
                var down = path(pk.n, hd.n, function (i) { return upSet[i] ? E[i].m * 5 : E[i].m; });
                var other = down ? down.filter(function (i) { return !upSet[i]; }) : [];
                var otherM = other.reduce(function (m, i) { return m + E[i].m; }, 0);
                var ids = (otherM >= 1000 && otherM >= 0.3 * upM ? up.concat(other) : up).map(function (i) { return E[i].id; })
                    .filter(function (id, k, a) { return a.indexOf(id) === k; });
                var loop = ids.length > up.length;
                var at0 = [+hd.h.lon, +hd.h.lat];
                var plan = planWalk(ids, lines, { heads: opts.planHeads || heads, first: ids[0], start: at0 });
                if (!plan.ok) return;
                if (loop && !plan.loop) return;
                // 왕복은 봉우리에서 돌아서야(지리산 범왕교 ↔ 반야봉이 쟁기소까지 가는 편도였음 - 2026-10-13 PC)
                if (!loop && d(plan.end, nodes[pk.n]) > 200) return;
                var walk = plan.walk;
                if (!loop) walk = walk.concat(reverseSel(walk));   // 같은 길 왕복
                var m = walk.reduce(function (t, x) { return t + len[x.id]; }, 0);
                if (m < minM || m > maxM) return;
                // "한라산동능정상" → "한라산 정상", "도봉산신선대" → "신선대"
                var pn = String(pk.p.name).replace(/^(\S+산)\S*정상$/, "$1 정상").replace(/^\S+산(?=\S*(봉|대)$)(?!$)/, "");
                cands.push({ ids: ids, walk: walk, loop: loop, head: hd.h.name, peak: pn || pk.p.name, m: m, at: pk.p, start: at0 });
            });
            // 고리가 왕복보다 먼저, 그다음 아직 안 쓴 들머리, 짧은 것
            cands = cands.filter(function (c) { return !usedHead[c.head]; });
            cands.sort(function (x, y) { return (y.loop - x.loop) || x.m - y.m; });
            // 앞 예시와 절반 넘게 같은 길(도봉산 신선대 · 자운봉, 설악산 중청봉 · 소청봉)은 빼고
            cands = cands.filter(function (c) {
                return !out.some(function (o) { return c.ids.filter(function (id) { return o.ids.indexOf(id) >= 0; }).length > 0.5 * Math.min(c.ids.length, o.ids.length); });
            });
            // 높은 봉우리는 다른 들머리로 한 번 더(설악산 대청봉 - 남설악 · 한계령)
            var per = 0;
            cands.forEach(function (c) {
                if (out.length >= max || usedHead[c.head] || per >= 2) return;
                if (out.some(function (o) { return o.ids.filter(function (id) { return c.ids.indexOf(id) >= 0; }).length > 0.5 * Math.min(c.ids.length, o.ids.length); })) return;
                out.push(c);
                usedHead[c.head] = true;
                per++;
            });
        });
        return out;
    }

    /**
     * 순수 함수 - 탐방로망의 들머리 · 날머리(2026-10-13 홍TV님: 모든 산에 표시). 구간 끝을 150m 로 묶은 자리마다:
     *   - 이름이 탐방지원센터 · 탐방안내소 · 분소 · 매표소 · 주차장이면 들머리(원효분소 · 화엄사탐방안내소 - 여러 탐방로가 만나도)
     *   - 거기 닿은 탐방로가 모두 거기서 시작하면 들머리(송추 → 사패능선 · 송추 → 오봉능선)
     *   - 막다른 끝이 탐방로의 끝(이름 "… → X" 의 X)이면 X 가 마을 · 입구 · 교 같은 곳일 때만(운봉아래 · 제방 · 숯가마터는 산 위 끝)
     *   - "관음사 탐방로" 처럼 이름에 출발 · 도착이 없으면 다른 탐방로가 덜 닿은 끝이 "관음사"
     *   - 다른 자료 코스가 마을 · 휴게소 · 주차장에서 시작하는 자리(300m - 성삼재휴게소)
     * 다른 탐방로 가운데를 지나는 자리는 빼고, 봉우리 · 폭포 같은 산 위 이름도 뺌. 이름은 그 자리의 탐방지원센터 이름 → 500m 안 heads → 탐방로 끝 이름.
     * 서버 heads 가운데 가까운 들머리가 없는 것도 넣음. 같은 이름 · 300m 안, "백무동" · "백무동탐방지원센터" 처럼 앞이 같은 이름(2km 안)은 하나.
     * 탐방로 옆 다른 자료 코스가 절 · 주차장에서 시작하는 곳(대원사석등 → 대원사), want(park-notes heads)에 적은 이름표(도선사)도.
     * segs: [{id, name, coords}], flips: routeFlips, others: [{name, coords}](다른 자료 코스), places: [{name, lat, lon}], want: [이름]. → [{name, lat, lon}].
     */
    function trailHeads(segs, heads, flips, others, places, want) {
        var near = 150, d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); }, ends = [];
        var HEAD = /(탐방지원센터|탐방안내소|안내센터|분소|매표소|주차장|휴게소)$/;
        var ACCESS = /(마을|리|동|입구|재|령|고개|주차장|휴게소|매표소|분소|탐방지원센터|탐방안내소|교|IC|정류장|중|초|중학교|초등학교)$/;
        var HIGH = /(대피소|산장|봉|산|대|단|정상|오름|폭포|전망대|암|굴|바위|능선|고지|갈림길|탐방로 끝|쪽 끝|부근|분기점|코스\d*|탐방로\s*\d*|삼거리|사거리|경계|문)$/;
        var DEAD_HIGH = /(대피소|산장|봉|산|정상|오름|폭포|전망대|굴|바위|능선|고지|갈림길|끝|부근|분기점|삼거리|사거리|터|옛길|제방|소|담|탕|치|대|단|문|암|코스\d*|탐방로\s*\d*)$/;
        var JUNK = /(소리길|둘레길|옛길|대피소|산장|봉|산|정상|오름|폭포|능선|갈림길|쪽끝|탐방로끝|부근|분기점|삼거리|사거리|코스\d*|탐방로\d*|문|연결선|해안가|산행)$/;
        // "우이분소 밑" → 우이분소, "강북구 우이동" → 우이동(2026-10-13 홍TV님)
        var clean = function (n) { return String(n || "").replace(/\s*(밑|아래|뒤)$/, "").replace(/^[가-힣]{1,4}[구군시]\s+(?=[가-힣])/, "").trim(); };
        (segs || []).forEach(function (s) {
            if (!s.coords || s.coords.length < 2) return;
            var e = routeEnds(s.name), f = flips && flips[s.id];
            // "관음사 탐방로", 이름이 한 곳뿐인 탐방로("설악산 · 백담사")
            var rt = nameParts(s.name).route, title = !e.from && !e.to && !s.extra && (/^(.+?)\s*탐방로$/.exec(rt) || (/^[가-힣]{2,8}$/.test(rt) && !/(코스|탐방로)$/.test(rt) && !HIGH.test(rt) && !DEAD_HIGH.test(rt) ? [rt, rt] : null));
            ends.push({ p: s.coords[0], name: f ? e.to : e.from, from: !f, s: s, title: title && title[1], other: f ? e.from : e.to });
            ends.push({ p: s.coords[s.coords.length - 1], name: f ? e.from : e.to, from: !!f, s: s, title: title && title[1], other: f ? e.to : e.from });
        });
        // 끝 묶기
        var groups = [];
        ends.forEach(function (x) {
            var g = groups.filter(function (g) { return d(g[0].p, x.p) < near; })[0];
            if (g) g.push(x); else groups.push([x]);
        });
        var count = function (s, p) { return groups.filter(function (g) { return d(g[0].p, p) < near; })[0].length; };
        var otherStarts = (others || []).map(function (o) {
            var e = routeEnds(o.name);
            return o.coords && o.coords.length && e.from && ACCESS.test(e.from.replace(/\s+/g, "")) ? o.coords[0] : null;
        }).filter(Boolean);
        // 길이 닿는 곳(휴게소 · 주차장 · 마을 …)에서 시작하는 다른 자료 코스 - 고개가 들머리인지 볼 때(성삼재휴게소)
        var roadStarts = (others || []).map(function (o) {
            var e = routeEnds(o.name);
            return o.coords && o.coords.length && e.from && /(휴게소|주차장|마을|리|동|입구|정류장|탐방지원센터|탐방안내소|분소|매표소)$/.test(e.from.replace(/\s+/g, "")) ? o.coords[0] : null;
        }).filter(Boolean);
        var out = [];
        groups.forEach(function (g) {
            var p = g[0].p;
            // 다른 탐방로 가운데를 지나는 자리(자르지 않은 곳)는 들머리 아님
            // 같은 자리에서 나란히 시작하는 탐방로(300m 안 - 북한산 송추 → 사패능선 · 송추폭포입구 → 오봉능선)는 괜찮음
            var mid = (segs || []).some(function (s) {
                if (g.some(function (x) { return x.s === s; })) return false;
                var c = s.coords, cum = 0;
                for (var k = 1; k < c.length - 1; k++) {
                    cum += d(c[k - 1], c[k]);
                    if (d(p, c[k]) < 60 && cum > 300 && d(p, c[0]) > 300 && d(p, c[c.length - 1]) > 300) return true;
                }
                return false;
            });
            if (mid) return;
            var names = g.map(function (x) { return x.name; }).filter(Boolean);
            var own = names.filter(function (n) { return HEAD.test(n.replace(/\s+/g, "")); })[0];
            var server = (heads || []).filter(function (h) { return d(p, [+h.lon, +h.lat]) < 500; })
                .sort(function (x, y) { return d(p, [+x.lon, +x.lat]) - d(p, [+y.lon, +y.lat]); })[0];
            // 이름에 출발 · 도착이 없는 탐방로("관음사 탐방로")는 다른 탐방로가 덜 닿은 끝
            var title = g.filter(function (x) {
                if (!x.title) return false;
                var c = x.s.coords, other = x.p === c[0] ? c[c.length - 1] : c[0];
                return g.length <= count(x.s, other);
            })[0];
            // 옅은 선(다른 자료로 메운 길) 끝은 빼고 봄(북한산 송추 - "갈림길 → 갈림길" 옅은 선이 닿아 있었음)
            var own2 = g.filter(function (x) { return !x.s.extra; });
            var allFrom = own2.length > 0 && own2.every(function (x) { return x.from && x.name; });
            // 탐방로 끝이 막다른 곳이면 내려온 들머리(장수대 · 운봉아래 · 다불마을) - 산 위 이름 · 옛터 · 제방은 빼고
            // 출발이 산 위(봉 · 폭포 · 삼거리)면 끝은 아래, 출발이 마을 · 입구 · 절이면 끝은 산 위, 모르면 끝 이름으로
            var deadTo = false;
            if (g.length === 1 && !g[0].from && g[0].name) {
                var o = String(g[0].other || "").replace(/\s+/g, ""), nm0 = String(g[0].name).replace(/\s+/g, "");
                // 끝 이름이 마을 · 리면 늘(설악산 "곰배골입구 → 곰배령 → 강선리")
                deadTo = /(마을|리)$/.test(nm0) || (HIGH.test(o) ? !/(봉|산|정상|오름)$/.test(nm0) : ACCESS.test(o) || /(사|약수터)$/.test(o) ? false : !DEAD_HIGH.test(nm0));
            }
            // 다른 자료 코스가 시작하는 곳은 막다른 끝이거나 마을 · 입구 같은 이름일 때만(지리산 숯가마터 · 북한산 부왕동암문은 산 위)
            var started = (g.length === 1 && g[0].from || names.some(function (n) { return ACCESS.test(n.replace(/\s+/g, "")); }))
                && otherStarts.some(function (q) { return d(p, q) < 300; });
            if (!(own || allFrom || deadTo || title || server || started)) return;
            // 마을 · 입구 같은 이름 먼저("새재" 보다 "윗새재마을")
            var fromNames = g.filter(function (x) { return x.from && x.name && !HIGH.test(x.name); }).map(function (x) { return x.name; });
            var fromName = fromNames.filter(function (n) { return /(마을|리|동|입구|주차장)$/.test(n.replace(/\s+/g, "")); })[0] || fromNames[0];
            var name = own || (server && server.name) || (title && title.title) || fromName
                || names.filter(function (n) { return !HIGH.test(n); })[0];
            if (deadTo && !own && !server) name = g[0].name;
            var raw = String(name || "");   // "운봉아래" 는 산 아래(봉우리 이름 빼기는 원래 이름으로)
            name = clean(name);
            if (!name || (!own && !server && !title && !deadTo && (HIGH.test(name) || name === "삼거리"))) return;
            // 길 이름 · 갈림길 · 산 위 이름은 어느 쪽이든 빼고(포대능선 · 대성문 · "배나무등 쪽 끝" · 금수산코스 · 제3폭포)
            if (!own && !server && JUNK.test(raw.replace(/\s+/g, ""))) return;
            // 고개(재 · 령 · 고개 · 치)는 길이 닿는 곳만 - 다른 자료 코스가 거기서 시작할 때(성삼재 · 육십령), 능선 위 고개(덕유산 횡경재 · 주왕산 칼등고개)는 빼고
            if (!own && !server && /(재|령|고개|치)$/.test(name.replace(/\s+/g, "")) && !roadStarts.some(function (q) { return d(p, q) < 300; })) return;
            out.push({ name: name, lat: p[1], lon: p[0] });
        });
        // 탐방로에서 먼 서버 heads 도(다른 자료 코스 끝 - 지리산남부탐방안내소)
        (heads || []).forEach(function (h) { out.push({ name: String(h.name), lat: +h.lat, lon: +h.lon, server: true }); });
        // park-notes heads 에 적은 들머리(2026-10-13 홍TV님: 도선사 · 대원사 · 육십령 …) - 같은 이름 이름표, 다른 자료 코스 출발
        // ("대원사석등 → 써리봉" · "진고개정상휴게소 → 두로봉"), 그 낱말이 든 이름표 차례로 자리를 찾음. 적지 않은 절 · 주차장은 넣지 않음(북한산 54곳이 됐었음)
        var extra = [];
        (want || []).forEach(function (w) {
            var key0 = String(w).replace(/\s+/g, ""), hit = null;
            (places || []).forEach(function (q) { if (!hit && String(q.name || "").replace(/\s+/g, "") === key0) hit = [+q.lon, +q.lat]; });
            (others || []).forEach(function (o) {
                var f = String(routeEnds(o.name).from || "").replace(/\s+/g, "");
                if (!hit && o.coords && o.coords.length && f.indexOf(key0) >= 0) hit = o.coords[0];
            });
            // 낱말이 든 이름표는 마지막(지리산 "대원사집단시설지구주차장" 이름표가 중산리 자리에 있었음)
            (places || []).forEach(function (q) { if (!hit && String(q.name || "").replace(/\s+/g, "").indexOf(key0) >= 0) hit = [+q.lon, +q.lat]; });
            if (hit) extra.push({ name: String(w), lat: hit[1], lon: hit[0], want: true });
        });
        extra.sort(function (x, y) { return x.name.length - y.name.length; });   // "대원사" 가 "산청대원사" 보다 먼저
        out = out.concat(extra);
        var key = function (n) { return n.replace(/\s+/g, "").replace(/(탐방지원센터|탐방안내소|안내센터|분소|매표소)$/, "").replace(/산$/, ""); };
        // 탐방지원센터 · 탐방안내소 > 분소 > 매표소(옛 이름) > 그 밖
        var rank = function (n) { return /(탐방지원센터|탐방안내소)$/.test(n) ? 3 : /분소$/.test(n) ? 2 : /매표소$/.test(n) ? 1 : 0; };
        var kept = [];
        out.forEach(function (h) {
            var dup = kept.filter(function (o) {
                var x = d([o.lon, o.lat], [h.lon, h.lat]);
                // 절은 탐방지원센터 옆이어도 따로(백운대탐방지원센터 · 도선사) - 같은 자리(100m)만 하나
                var temple = /사$/.test(o.name) !== /사$/.test(h.name);
                // 탐방지원센터 600m 안 그냥 지명(오색약수터 · 남설악탐방지원센터)은 같은 들머리 - 절은 빼고
                if (!temple && Math.abs(rank(o.name) - rank(h.name)) === 3 && x < 600) return true;
                return o.name === h.name || x < (temple ? 100 : 300) || (key(o.name) === key(h.name) && x < 2000) || key(h.name).indexOf(key(o.name)) >= 0 && x < 1000;   // "산청대원사" · "우이동공영주차장" 은 "대원사" · "우이동" 옆이면 하나
            })[0];
            if (!dup) { kept.push(h); return; }
            // 같은 곳이면 탐방지원센터 이름을, 자리는 탐방로 위(서버 heads 는 다른 자료 코스 끝이라 조금 떨어짐)
            if (rank(h.name) > rank(dup.name) && key(dup.name) === key(h.name)) dup.name = h.name;
        });
        return kept.map(function (h) { return { name: h.name, lat: h.lat, lon: h.lon }; });
    }

    /**
     * 순수 함수 - 이름에 거쳐 가는 곳이 있는 탐방로("쟁기소 → 반야봉 → 삼도봉삼거리")의 선이 그 가운데서 시작 · 끝나면 이름을 거기까지로.
     * 2026-10-13 PC: 공단 선은 반야봉 → 삼도봉삼거리 970m 뿐인데 처음이 "쟁기소" 라 범왕교 ↔ 반야봉 왕복이 "쟁기소" 까지 가는 편도로 보였음.
     * 선 끝 200m 안의 places 이름이 거쳐 가는 곳이면 그 끝을 그 이름으로. → 바꾼 것만 새 객체.
     */
    function viaTrim(trails, places) {
        var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        var at = {};
        (places || []).forEach(function (p) { var k = String(p.name || "").replace(/\s+/g, ""); (at[k] = at[k] || []).push([+p.lon, +p.lat]); });
        return (trails || []).map(function (t) {
            var np = nameParts(t.name), parts = String(np.route || "").split(" → ");
            if (parts.length < 3 || !t.coords || t.coords.length < 2) return t;
            var idx = function (p) {
                var best = -1, bd = 200;
                parts.forEach(function (w, i) { (at[w.replace(/\s+/g, "")] || []).forEach(function (q) { var x = d(p, q); if (x < bd) { bd = x; best = i; } }); });
                return best;
            };
            var a = idx(t.coords[0]), z = idx(t.coords[t.coords.length - 1]);
            var mid = function (i) { return i > 0 && i < parts.length - 1; };
            if (!mid(a) && !mid(z)) return t;
            // 거꾸로 그린 선이면 처음 쪽이 이름의 끝
            var lo, hi;
            if (a >= 0 && z >= 0) { lo = Math.min(a, z); hi = Math.max(a, z); }
            else if (a >= 0) { lo = a; hi = parts.length - 1; }
            else { lo = 0; hi = z; }
            if (hi - lo < 1) return t;
            var x = {};
            for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) x[k] = t[k];
            x.name = (np.group ? np.group + " · " : "") + parts.slice(lo, hi + 1).join(" → ");
            return x;
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

    /**
     * 순수 함수 - 같은 자리(150m) 이름표 가운데 산 이름만 앞에 더 붙은 것("설악산 울산바위" · "울산바위")은 짧은 것 하나만.
     * 2026-10-13 PC: 설악산 탐방 안내도에 둘이 같은 자리에 겹쳐 보였음. places: [{name, lat, lon, ele_m}].
     */
    function dedupePlaceNames(places) {
        var key = function (n) { return String(n || "").replace(/\s+/g, ""); };
        return (places || []).filter(function (p, i, all) {
            var k = key(p.name);
            return !all.some(function (q, j) {
                var kq = key(q.name);
                return j !== i && kq.length < k.length && k.slice(-kq.length) === kq && /^[가-힣]{1,6}산$/.test(k.slice(0, k.length - kq.length))
                    && distM(+p.lat, +p.lon, +q.lat, +q.lon) < 150;
            });
        });
    }

    /** 순수 함수 - 이름의 길 부분에서 다른 이름으로("지리산 · 중산리 → 천왕봉" + {중산리: 중산리탐방지원센터}). names 가 없으면 그대로. */
    function aliasName(name, names) {
        if (!names) return name;
        var n = String(name || ""), i = n.indexOf(" · "), head = i > 0 ? n.slice(0, i + 3) : "", route = i > 0 ? n.slice(i + 3) : n;
        return head + route.split(" → ").map(function (x) { return Object.prototype.hasOwnProperty.call(names, x.trim()) ? names[x.trim()] : x; }).join(" → ");
    }

    /** 순수 함수 - 고른 구간을 반대 방향으로(차례도 거꾸로, 구간마다 ~ 도 바꿈). */
    function reverseSel(sel) {
        return (sel || []).slice().reverse().map(function (s) { return { id: s.id, rev: !s.rev }; });
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
        g = String(g || String(first.name || "").replace(/\s*\(?[가-힣]+-[가-힣]+\)?\s*$/, "")).replace(/\s*\d+(?:-\d+)?\s*(?:구간|코스).*$/, "").trim();
        // 자전거길은 "인증센터" 를 뗌(제목이 길어 잘림 - 2026-10-12 PC)
        var short = function (x) { return x ? String(x).replace(/인증센터/g, "") : x; };
        var from = short(routeEnds(first.name).from), to = short(routeEnds(last.name).to);
        // "[백두대간 3구간]" 이 3구간째로 읽혀 헷갈림(2026-10-12 PC) - 번호가 있으면 "2~4구간", 없으면 "3구간 이어 걷기"
        var nos = list.map(function (p) { return courseNo(p.course && p.course.name); });
        var nums = nos.every(Boolean) ? nos.map(function (x) { return +String(x).split("-")[0]; }) : null;
        var unit = /코스/.test(String(first.name || "")) ? "코스" : "구간";
        var span = nums ? Math.min.apply(null, nums) + "~" + Math.max.apply(null, nums) + unit : list.length + "구간 이어 걷기";
        var lo = null, hi = null, down = 0;
        c.ele.forEach(function (e) { if (e != null) { lo = lo == null ? e : Math.min(lo, e); hi = hi == null ? e : Math.max(hi, e); } });
        var asc = c.asc[c.asc.length - 1] || 0, e0 = c.ele[0], e1 = c.ele[c.ele.length - 1];
        down = e0 == null || e1 == null ? null : Math.max(0, Math.round(asc - (e1 - e0)));
        // 처음 자리로 돌아오면 "중산리탐방지원센터 원점회귀"(2026-10-12 홍TV님 - 지리산 대표 원점회귀 코스)
        var back = c.lat.length > 1 && distM(c.lat[0], c.lon[0], c.lat[c.lat.length - 1], c.lon[c.lon.length - 1]) < 600;   // 끝이 출발 600m 안(중산리 ↔ 법계교 257m)
        var route = from && (from === to || back) ? from + " 원점회귀" : endsText(from, to);
        c.course = { name: g + " " + span + (route ? " · " + route : ""), kind: first.kind,
                     distance_m: Math.round(c.total), ascent_m: Math.round(asc), descent_m: down,
                     ele_min_m: lo == null ? null : Math.round(lo), ele_max_m: hi == null ? null : Math.round(hi),
                     start_lat: c.lat[0], start_lon: c.lon[0], end_lat: c.lat[c.lat.length - 1], end_lon: c.lon[c.lon.length - 1] };
        return c;
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
        var up = c.asc[i1] - c.asc[i0], e0 = c.ele[i0], e1 = c.ele[i1];
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

    /** 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 걷기는 오르막 600m/h 를 더합니다(네이스미스). */
    var KINDS = {
        hike: { label: "등산", kmh: 4, climb: 600, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 4, climb: 600, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
    };

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
        var t = textLabel(v), tip = "글자 크기 " + Math.round(v * 100) + "% - 누를 때마다 100 → 120 → 140%";
        Array.prototype.forEach.call(document.querySelectorAll(".rfTextBtn"), function (b) { b.textContent = t; b.title = tip; });
    }
    /** 순수 함수 - 단추 글(100% 가 · 120% 가+ · 140% 가++). */
    function textLabel(v) { return v >= 1.4 ? "가++" : v >= 1.2 ? "가+" : "가"; }
    /** 순수 함수 - 다음 글자 크기(140% 다음은 100%). */
    function nextTextScale(v) { return TEXT_STEPS[(TEXT_STEPS.indexOf(v) + 1) % TEXT_STEPS.length]; }
    /** "가+" 단추 - 누를 때마다 다음 크기. 모든 화면이 같은 설정을 씁니다. */
    function textButton() {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rfTextBtn";
        b.title = "글자 크기(누를 때마다 100 → 120 → 140%)";
        b.setAttribute("aria-label", "글자 크기");
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

    /** 귀가 확인 시각 - 표준 시간의 1.5배, 적어도 1시간 더(2026-10-14). 지나도록 못 끝내면 따라가기가 알림. */
    function lateAt(startMs, planMs) {
        return startMs + Math.max(planMs * 1.5, planMs + 3600000);
    }

    function standardMs(kind, distM, ascM) {
        var k = kindOf(kind);
        return (distM / 1000 / k.kmh + (k.climb ? ascM / k.climb : 0)) * 3600000;
    }

    /**
     * 순수 함수 - fly(3D) 일정: 출발 시각(ms)에 떠나면 이름표마다 닿는 시각(표준 소요 시간 - 거리 · 오른 높이). 2026-10-14 홍TV님.
     * c: fromApi 결과(dist · asc · pois · total). → {rows:[{name, d, ele, at}], end}
     */
    function scheduleRows(c, startMs, kind) {
        var t = function (d) { var i = indexAt(c, d); return startMs + standardMs(kind, d, c.asc[i] || 0); };
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

    /** 순수 함수 - 들머리 기온으로 정상 기온 추정(100m 오를 때마다 0.65℃ 낮게). 높이를 모르면 null. */
    function summitTemp(tmp, startEle, topEle) {
        if (tmp == null || startEle == null || topEle == null) return null;
        return Math.round((tmp - 0.0065 * (topEle - startEle)) * 10) / 10;
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
            box.appendChild(el("div", "rf-cap rf-empty", "고도 자료가 없는 코스입니다 - 거리만 표시합니다."));
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
        var capMax = el("div", "rf-cap", "최고 " + num(max) + "m"); capMax.style.cssText = "left:3px;top:0"; box.appendChild(capMax);
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

    /**
     * 순수 함수 - 챙길 것(2026-10-15 홍TV님). month 1~12, ascentM 오르막(m), kind hike · walk · bike.
     * key 는 PartnersServlet.GEAR 와 같음(쿠팡 파트너스 링크를 설정에 넣으면 그 물건 옆에 링크).
     */
    function gearList(month, ascentM, kind) {
        var winter = month >= 11 || month <= 3, cold = month >= 10 || month <= 4, sunny = month >= 4 && month <= 9, hike = kind === "hike", out = [];
        out.push({ key: "water", label: "물 · 간식", why: "1시간에 물 500ml 남짓" });
        out.push({ key: "rain", label: "우비 · 바람막이", why: "산 위는 날씨가 빨리 바뀝니다" });
        if (kind !== "bike") out.push({ key: "headlamp", label: "헤드랜턴", why: "늦어지면 산은 해 지기 전에 어두워집니다" });
        out.push({ key: "battery", label: "보조배터리", why: "GPS · 119 신고용" });
        // 2026-10-15 홍TV님: 등산화 · 가방 · 구급약(늘), 모자 · 선크림(4~9월), 보온병 · 핫팩(11~3월), 무릎 보호대(오르막이 클 때)
        out.push({ key: "firstaid", label: "구급약 · 밴드", why: "물집 · 까진 곳 · 벌레 물림" });
        if (kind !== "bike") out.push({ key: "shoes", label: hike ? "등산화" : "걷기 편한 신발", why: hike ? "미끄럼을 막고 발목을 받쳐 줌" : "오래 걸어도 발이 편하게" });
        out.push({ key: "pack", label: hike ? "등산 가방" : "가벼운 배낭", why: "두 손을 비워 두면 넘어질 때 안전합니다" });
        if (hike && ascentM >= 500) out.push({ key: "stick", label: "등산 스틱", why: "오르막 " + num(ascentM) + "m - 무릎 부담을 덜어 줌" });
        if (hike && ascentM >= 800) out.push({ key: "knee", label: "무릎 보호대", why: "긴 내리막에서 무릎을 받쳐 줌" });
        if (sunny) out.push({ key: "sun", label: "모자 · 선크림", why: "능선 · 정상은 햇볕을 가릴 곳이 없습니다" });
        if (winter) out.push({ key: "warm", label: "보온병 · 핫팩", why: "쉴 때 몸이 빨리 식습니다" });
        if (hike && winter) out.push({ key: "crampon", label: "아이젠", why: "겨울 · 이른 봄 응달은 얼어 있습니다" });
        if (cold) out.push({ key: "glove", label: "장갑", why: "아침 · 정상은 쌀쌀합니다" });
        return out;
    }

    /** 쿠팡 파트너스 링크를 보일 때 함께 붙이는 문구(공정거래위원회 추천 · 보증 심사지침 - 경제적 이해관계 표시). */
    var COUPANG_NOTE = "이 안내는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

    /** 순수 함수 - 쿠팡 링크 주소들(api/partners 의 물건 하나, 예전 글 하나도) → [{text:"쿠팡 ›" 또는 "쿠팡 1 ›" …, href}]. */
    function partnerLinks(urls) {
        var l = (Array.isArray(urls) ? urls : urls ? [urls] : []).filter(function (u) { return /^https:\/\//.test(u); });
        return l.map(function (u, i) { return { text: "쿠팡" + (l.length > 1 ? " " + (i + 1) : "") + " ›", href: u }; });
    }

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
            b.title = on ? "찜 풀기" : "찜하기 - 따라가기 첫 화면 '☆ 찜' 에 모아 둡니다(이 기기에만)";
            b.setAttribute("aria-label", on ? "찜 풀기" : "찜하기");
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
            out.walked += +r.walked || 0;
            out.up += +r.up || 0;
            if (r.end > r.start) out.ms += r.end - r.start;
            var k = r.courseId || r.name;
            if (k && !seen[k]) { seen[k] = 1; out.courses++; }
        });
        return out;
    }

    /** 백업에 함께 담는 이 기기 저장값(도장 · 완주 · 정상 · 찜 · 몸무게). 기록 · 사진은 IndexedDB 라 따로. */
    var BACKUP_KEYS = ["rf-stamps", "rf-done", "rf-peaks", "rf-fav", "rf-body"];

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

    /** 순수 함수 - 기록들에 든 사진 열쇠. */
    function photoIds(records) {
        var ids = [];
        (records || []).forEach(function (r) {
            (r && r.notes || []).forEach(function (n) { if (n && n.photo && ids.indexOf(n.photo) < 0) ids.push(n.photo); });
        });
        return ids;
    }

    global.RF = {
        LINE_COLOR: LINE_COLOR, num: num, km: km, hm: hm, notifyDeploy: notifyDeploy, searchPlaceholder: searchPlaceholder, fromApi: fromApi, gpxToApi: gpxToApi, recordCourse: recordCourse, isGpxId: isGpxId, gpxId: gpxId, storeGpx: storeGpx, storedGpx: storedGpx, isAccess: isAccess, isTopName: isTopName, reverseCourse: reverseCourse, reverseName: reverseName, cleanName: cleanName, nameParts: nameParts, infoText: infoText, nearSign: nearSign, signText: signText, spotIcon: spotIcon, parkOf: parkOf, mountainOf: mountainOf, regionNames: regionNames, stampKey: stampKey, summitName: summitName, guideMaps: guideMaps, routeGuides: routeGuides, baseStyle: baseStyle, stampOf: stampOf, safeDecode: safeDecode, snapOut: snapOut, gridCells: gridCells, GRID_DEG: GRID_DEG, stampsDue: stampsDue, peakKey: peakKey, peaksDue: peaksDue, peakGapM: peakGapM, peakCourses: peakCourses, isClosedTrail: isClosedTrail, isHiddenCourse: isHiddenCourse, centerCourses: centerCourses, isComplete: isComplete, seriesProgress: seriesProgress, trailCourses: trailCourses, chainOrder: chainOrder, geoOrder: geoOrder, azWord: azWord, spotText: spotText, dangerAhead: dangerAhead, viewAt: viewAt, spotKey: spotKey, spotSummary: spotSummary, nearSpot: nearSpot, flightMs: flightMs, summitIndex: summitIndex, showName: showName, nameText: nameText, dedupePois: dedupePois, at: at, grade: grade, ascentLeft: ascentLeft,
        nextPoi: nextPoi, snap: snap, turnWord: turnWord, bearingOf: bearingOf, utmk: utmk, nationalPoint: nationalPoint,
        sunset: sunset, sunrise: sunrise, KINDS: KINDS, kindOf: kindOf, personSvg: personSvg, groupPois: groupPois, declutter: declutter, courseNo: courseNo, cumAscent: cumAscent, routeEnds: routeEnds, routeFlips: routeFlips, joinId: joinId, parseJoinId: parseJoinId, splitTrails: splitTrails, sliceCourse: sliceCourse, endsText: endsText, dedupeSegs: dedupeSegs, mergeBare: mergeBare, gapFill: gapFill, flattenSel: flattenSel, chainShape: chainShape, planWalk: planWalk, trailHeads: trailHeads, viaTrim: viaTrim, noteTrailName: noteTrailName, officialName: officialName, courseAccess: courseAccess, officialMatches: officialMatches, dedupePlaceNames: dedupePlaceNames, SPOT_ZOOM: SPOT_ZOOM, spotsByZoom: spotsByZoom, headLoopName: headLoopName, loopExamples: loopExamples, aliasName: aliasName, nameNodes: nameNodes, headAlias: headAlias, parkRules: parkRules, rulesText: rulesText, gateAlerts: gateAlerts, chainPick: chainPick, reverseSel: reverseSel, joinCourses: joinCourses, routePlaces: routePlaces, placeName: placeName, peakNearM: peakNearM, climbBetween: climbBetween, kcal: kcal, steps: steps, standardMs: standardMs, lateAt: lateAt, joinDraw: joinDraw, textScale: textScale, nextTextScale: nextTextScale, textLabel: textLabel, textButton: textButton, fitPath: fitPath, scheduleRows: scheduleRows, weatherWord: weatherWord, summitTemp: summitTemp, distM: distM, recordSkip: recordSkip, JUNCTION: JUNCTION, kmStep: kmStep, poiIcon: poiIcon, profile: profile, miniMap: miniMap,
        favList: favList, isFav: isFav, favToggle: favToggle, favButton: favButton, recordStats: recordStats, BACKUP_KEYS: BACKUP_KEYS, backupCheck: backupCheck, mergeRecords: mergeRecords, mergeStore: mergeStore, photoIds: photoIds, airText: airText, gearList: gearList, COUPANG_NOTE: COUPANG_NOTE, partnerLinks: partnerLinks
    };
})(window);
