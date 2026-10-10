/*
 * routefly 산행 화면(hike.html) - 핸드폰으로 걸으면서 봅니다.
 *
 *   GPS 위치 → 코스 위 진행 거리(course-kit snap) → ① 고도 그래프 ② 산행 기록 ③ 경로 지도를 함께 움직입니다.
 *   코스에서 50m 넘게 벗어나면 빨간 알림, 끝점에 닿으면 도착 알림. 브라우저는 화면이 꺼지지 않게 Wake Lock 을 겁니다
 *   (앱은 화면을 꺼도 백그라운드 위치로 이어지므로 걸지 않습니다 - 배터리).
 *   새로 고침해도 산행 기록(시작 시각 · 진행 거리)은 이 기기에 남아 이어집니다(localStorage).
 *   "모의 산행" 은 GPS 없이 코스를 따라 걷는 흉내(실제 빠르기 - SIM_X) - 집에서 화면을 시험할 때.
 */
(function () {
    "use strict";

    var OFF_ROUTE_M = 50;      // 이보다 멀면 "코스에서 벗어남"
    var ARRIVE_M = 30;         // 끝점까지 이 안이면 도착
    var FAR_M = 3000;          // 코스에서 이보다 멀면 "벗어남" 대신 출발점(마지막 자리)까지 안내(집 · 차 안에서 시작했을 때)
    var SIM_X = 1;             // 모의 산행 - 시간 배속(2026-10-10 홍TV님: 40 → 1, 실제 걷는 빠르기로)
    var TURN_BACK_M = 150;     // 코스를 따라 이만큼 되돌아가면 거꾸로 된 코스(내려가는 길)로 안내를 바꿉니다
    var BRANCH_ON_M = 20;      // 다른 길에서 이 안이면 "그 길 위" (코스에서는 40m 넘게 떨어졌을 때)
    var BRANCH_SWITCH_M = 120; // 다른 길로 이만큼 더 가면 그 길로 코스를 바꿉니다(들어설 때 한 번 알린 뒤)

    var $ = function (id) { return document.getElementById(id); };
    var num = RF.num, km = RF.km;

    var map, mapReady, cfg;
    var c = null;              // 지금 코스
    var prof = null;           // ① 고도 그래프
    var meMarker = null;
    var hike = { running: false, sim: false, start: 0, d: 0, off: 0, watch: null, timer: 0, simTimer: 0, simClock: 0,
                 simLast: 0, simD: 0, speed: null, hist: [], wake: null, follow: true, arrived: false, lastFix: 0,
                 fix: null,            // 마지막 위치 {lat, lon, acc, alt, t} - SOS 에 씁니다
                 track: [],            // 걸은 자리 [[위도, 경도, 시각, 고도]] - 기록 · GPX
                 notes: [],            // 사진 · 메모 [{t, lat, lon, ele, text, photo}] - 기록 · GPX(wpt). 사진은 IndexedDB(photo = 열쇠)
                 walked: 0,            // 걸은 거리(m)
                 alerted: {},          // 이미 알린 갈림길(진행 거리)
                 sunWarned: false,
                 passed: {},           // 음성으로 알린 지점(이름)
                 kmSpoken: 0,          // 음성으로 알린 거리 이정(1km · 자전거 5km 단위)
                 wasOff: false,        // 코스에서 벗어나 있음(음성 - 벗어날 때 · 돌아올 때 한 번씩)
                 d0: null,             // 처음 코스에 닿은 진행 거리(오른 높이 · 칼로리는 여기서부터, 아직 안 닿았으면 null)
                 base: null,           // 코스를 바꾸기 전까지 한 것 {dist, up, down} - 칼로리 · 걸음 · 오른 높이에 더합니다
                 branch: null,         // 코스가 아닌 다른 길 위 {id, name, d0, lastD, loading}
                 segT0: 0,             // 지금 코스로 걷기 시작한 시각(예상 도착 빠르기 비율)
                 bgWatch: null };      // 앱 - 백그라운드 위치 감시 번호
    var trails = [];                   // 주변 등산로(api/trails) - 코스에서 벗어났을 때 가장 가까운 길 찾기
    var compass = { on: false, up: false, heading: null, lastTurn: 0, raw: null, raf: 0, listening: false };   // 나침반 - on: 켜짐, up: 내 방향으로 지도 돌림, raw: 센서가 준 마지막 방위
    var kindFilter = "";

    function now() { return hike.sim ? hike.simClock : Date.now(); }

    /** 지금 코스 종류의 말 · 빠르기(등산 "산행" · 걷기 "걷기" · 자전거 "라이딩"). 코스를 고르기 전에는 고른 탭. */
    function K() { return RF.kindOf(c ? c.course.kind : kindFilter || "hike"); }

    /** 시작 버튼 · 기록 제목을 코스 종류에 맞춥니다. */
    function setKindWords() {
        var k = K();
        if (!hike.running) $("go").textContent = k.act + " 시작";
        $("doneTitle").textContent = k.act + " 기록";
        $("sim").title = "코스를 따라 " + (k === RF.KINDS.bike ? "달리는" : "걷는") + " 흉내(GPS 없이 시험)";
    }

    function toast(text, ms) {
        var t = $("toast");
        t.textContent = text;
        t.style.display = "block";
        clearTimeout(toast.timer);
        toast.timer = setTimeout(function () { t.style.display = "none"; }, ms || 3500);
    }

    // ------------------------------------------------------------------ 앱(안드로이드 · Capacitor) 안에서만

    /**
     * routefly 앱(app/ - Capacitor)이 이 화면을 띄우면 window.Capacitor 가 있습니다. 그때만 앱 기능을 씁니다:
     *   BackgroundGeolocation - 화면을 꺼도 위치(알림창에 "따라가는 중"), TextToSpeech - 화면이 꺼져도 음성,
     *   Filesystem + Share - SOS 사진 · GPX 를 공유 창으로(앱 안 웹뷰는 navigator.share · 내려받기가 안 됨).
     * 브라우저에서는 모두 null 이라 지금까지처럼 웹 기능을 씁니다.
     */
    var CAP = window.Capacitor;
    var NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    function plugin(name) { return NATIVE && CAP.registerPlugin ? CAP.registerPlugin(name) : null; }
    var BATTERY_KEY = "rf-battery", batterySave = false;
    try { batterySave = localStorage.getItem(BATTERY_KEY) === "1"; } catch (e) { /* 기본은 끔 */ }
    var BG = plugin("BackgroundGeolocation"), TTS = plugin("TextToSpeech"), FS = plugin("Filesystem"), SHARE = plugin("Share");

    /** 앱 - 파일을 앱 임시 폴더에 쓰고 공유 창으로(문자 · 카카오톡 · 파일 저장 …). */
    function nativeShareFile(name, base64, text) {
        return FS.writeFile({ path: name, data: base64, directory: "CACHE" }).then(function (r) {
            return SHARE.share({ title: name, text: text || "", files: [r.uri], dialogTitle: "보내기" });
        });
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });
    }

    // ------------------------------------------------------------------ 음성 안내

    /**
     * 음성 안내 - 브라우저 내장 읽어 주기(Web Speech API, 한국어). 갈림길 · 지점 · 1km 마다 · 코스 이탈 · 일몰 · 도착.
     * 지도 왼쪽 버튼으로 자세히(🔊) → 짧게(🔉) → 끔(🔇) 차례로 바꿉니다(이 기기에 기억).
     * 짧게는 지점 이름 · 거리 이정 · 갈림길 · 이탈만 말하고 지난 시간 · 다음 지점까지는 빼고 말합니다.
     * 화면이 켜져 있을 때 확실히 나옵니다(꺼지면 브라우저가 멈출 수 있음).
     */
    var VOICE_KEY = "rf-voice";
    var VOICE_LEVELS = ["on", "short", "off"];   // 저장 값 - 예전 "on" 은 자세히
    var voice = { on: true, level: "on", ko: null, last: {} };
    try { var v0 = localStorage.getItem(VOICE_KEY); if (VOICE_LEVELS.indexOf(v0) >= 0) voice.level = v0; } catch (e) { /* 기본은 자세히 */ }
    voice.on = voice.level !== "off";

    function pickVoice() {
        if (!("speechSynthesis" in window)) return;
        var vs = speechSynthesis.getVoices();
        voice.ko = vs.filter(function (v) { return /^ko/i.test(v.lang); })[0] || null;
    }
    if ("speechSynthesis" in window) {
        pickVoice();
        speechSynthesis.onvoiceschanged = pickVoice;
    }

    /**
     * 말하기. opt.key 가 있으면 같은 key 는 opt.gap(기본 60초) 안에 다시 말하지 않습니다.
     * opt.urgent 면 하던 말을 끊고 바로(코스 이탈 · 갈림길), 아니면 말하는 중일 때 건너뜁니다(모의 40배속에서 쌓이지 않게).
     */
    function say(text, opt) {
        opt = opt || {};
        if (!voice.on || !text || !TTS && !("speechSynthesis" in window)) return;
        var t = Date.now();
        if (opt.key) {
            if (voice.last[opt.key] && t - voice.last[opt.key] < (opt.gap || 60000)) return;
            voice.last[opt.key] = t;
        }
        if (TTS) {   // 앱 - 화면이 꺼져도 말합니다
            if (opt.urgent) TTS.stop().catch(function () { /* 말하는 중이 아니면 */ });
            else if (voice.busy) return;
            var my = voice.busy = (voice.busy || 0) + 1;
            TTS.speak({ text: text, lang: "ko-KR", rate: 1.0, category: "playback" })
                .catch(function () { /* 끊긴 말 */ })
                .then(function () { if (voice.busy === my) voice.busy = 0; });
            return;
        }
        if (opt.urgent) speechSynthesis.cancel();
        else if (speechSynthesis.speaking || speechSynthesis.pending) return;
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "ko-KR";
        u.rate = 1.05;
        if (voice.ko) u.voice = voice.ko;
        speechSynthesis.speak(u);
    }

    function setVoice(level) {
        voice.level = level;
        voice.on = level !== "off";
        try { localStorage.setItem(VOICE_KEY, level); } catch (e) { /* 저장 못 해도 이번에는 */ }
        $("voice").textContent = level === "on" ? "🔊" : level === "short" ? "🔉" : "🔇";
        $("voice").setAttribute("aria-label", "음성 안내 " + (level === "on" ? "자세히" : level === "short" ? "짧게" : "꺼짐") + " - 누르면 바꿈");
        $("voice").classList.toggle("on", voice.on);
        if (!voice.on) stopTalking();
    }

    function stopTalking() {
        if (TTS) TTS.stop().catch(function () { /* 무시 */ });
        else if ("speechSynthesis" in window) speechSynthesis.cancel();
        voice.busy = 0;
    }

    /** 받침이 있으면 a, 없으면 b(을/를 · 이/가). 한글이 아니면 b. */
    function josa(word, a, b) {
        var ch = (word || "").replace(/\(.*\)$/, "").trim().slice(-1), code = ch.charCodeAt(0) - 0xAC00;
        return code >= 0 && code < 11172 && code % 28 !== 0 ? a : b;
    }

    /**
     * 말할 코스 이름 - "지리산 천왕봉 · 산오름 → 천왕봉 → 탐방지원센터"
     *   → "지리산 천왕봉, 산오름에서 천왕봉을 거쳐 탐방지원센터까지". 둘이면 "A에서 B까지".
     */
    function spokenName(name) {
        var parts = String(name || "").split(" · ");
        return parts.map(function (p) {
            var seg = p.split(/\s*→\s*/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
            if (seg.length < 2) return p;
            var first = seg[0], last = seg[seg.length - 1], mid = seg.slice(1, -1);
            return first + "에서 " + (mid.length ? mid.join(", ") + josa(mid[mid.length - 1], "을", "를") + " 거쳐 " : "") + last + "까지";
        }).join(", ");
    }

    /** 화면 거리 - 1km 미만은 m, 넘으면 km 한 자리(179.5km) */
    function distText(m) { return m < 1000 ? num(m) + "m" : skm(m) + "km"; }
    function distSpoken(m) { return m < 1000 ? num(m) + "미터" : skm(m) + "킬로미터"; }

    /** 출발점 이름표(없으면 null) */
    function startName() {
        var p = c && c.pois.filter(function (q) { return +q.dist_m < 60 && +q.off_route_m < 60; })[0];
        return p ? p.name : null;
    }

    /** 말할 거리 - 소수 한 자리(5.8킬로미터) */
    function skm(m) { return (Math.round(m / 100) / 10).toString(); }

    /** "1시간 5분" · "40분" */
    function spokenTime(ms) {
        var m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60);
        return (h ? h + "시간 " : "") + (m % 60 ? (m % 60) + "분" : "").trim();
    }

    /**
     * 지점을 지날 때 덧붙이는 말(2026-10-09 홍TV님 - 등산 앱처럼 지난 시간 · 다음 지점까지):
     * "출발한 지 5시간 20분. 다음 소청대피소까지 1.3킬로미터, 오르막 250미터입니다." 다음 지점이 없으면 도착까지.
     */
    function passInfo(atD) {
        if (voice.level === "short") return "";
        var out = "출발한 지 " + spokenTime(now() - hike.start) + ".";
        var nx = RF.nextPoi(c, atD), nd = nx ? Math.min(+nx.dist_m, c.total) : c.total;
        if (nd - atD < 100) return out;   // 바로 앞이면 거리는 빼고
        var up = RF.ascentLeft(c, atD) - RF.ascentLeft(c, nd);
        return out + " " + (!nx ? "도착" : nd < c.total - 60 ? "다음 " + nx.name : nx.name) + "까지 " + distSpoken(Math.round((nd - atD) / 10) * 10)
            + (up >= 30 && K() !== RF.KINDS.bike ? ", 오르막 " + num(up) + "미터입니다." : "입니다.");
    }

    /** 1km(자전거 5km) 마다 · 지점을 지날 때 - onFix 에서 코스 위에 있을 때. */
    function voiceProgress() {
        if (!hike.running || hike.off > OFF_ROUTE_M) return;
        var d = hike.d;
        // 지점(이름표) - 지날 때 한 번. 출발 · 도착 자리는 시작 · 도착 안내가 대신합니다.
        // 같은 자리(80m 안) 지점은 한 문장으로 - "법계사, 로타리대피소샘터입니다. …"(지리산 3,351m 에 둘이 겹쳐 같은 말을 두 번 했음)
        var spoken = function (q) {
            var qd = +q.dist_m;
            return !(qd < 60 || qd > c.total - 60 || +q.off_route_m > 80 || hike.passed[q.name + "@" + Math.round(qd)]);
        };
        var hit = c.pois.filter(function (q) { return spoken(q) && Math.abs(d - +q.dist_m) <= 30; })[0];
        if (hit) {
            var group = c.pois.filter(function (q) { return spoken(q) && Math.abs(+q.dist_m - +hit.dist_m) <= 80; });
            var names = [], ele = null, far = 0;
            group.forEach(function (q) {
                hike.passed[q.name + "@" + Math.round(+q.dist_m)] = true;   // 이름 + 자리(같은 이름 다른 쉼터)
                if (names.indexOf(q.name) < 0) names.push(q.name);
                if (ele == null && q.ele_m != null) ele = +q.ele_m;
                far = Math.max(far, +q.dist_m);
            });
            say((names.join(", ") + "입니다." + (ele != null ? " 해발 " + num(ele) + "미터." : "") + " " + passInfo(far)).trim());
        }
        // 거리 이정
        var step = K() === RF.KINDS.bike ? 5000 : 1000;
        var k = Math.floor(d / step);
        if (c.total > step * 1.5 && k > hike.kmSpoken && c.total - d > 300) {
            hike.kmSpoken = k;
            var asc = RF.ascentLeft(c, d);
            say(num(k * step / 1000) + "킬로미터 지났습니다. " + (voice.level === "short" ? "" : "출발한 지 " + spokenTime(now() - hike.start) + ". ") + "남은 거리 " + skm(c.total - d) + "킬로미터"
                + (asc >= 50 && K() !== RF.KINDS.bike ? ", 남은 오르막 " + num(asc) + "미터." : "."));
        }
    }

    // ------------------------------------------------------------------ 칼로리 · 걸음

    /** 몸무게 · 키 - 칼로리 · 걸음 수 추정에 씁니다. 이 기기에만 둡니다(rf-body). 넣지 않으면 65kg · 170cm. */
    var BODY_KEY = "rf-body";
    var body = { kg: 65, cm: 170, set: false };
    try { var b0 = JSON.parse(localStorage.getItem(BODY_KEY) || "null"); if (b0 && b0.kg) body = { kg: b0.kg, cm: b0.cm || 170, set: true }; } catch (e) { /* 기본값 */ }

    function saveBody() {
        body.set = true;
        try { localStorage.setItem(BODY_KEY, JSON.stringify({ kg: body.kg, cm: body.cm })); } catch (e) { /* 이번만 */ }
    }

    function askNumber(msg, cur, min, max) {
        var v = prompt(msg, String(cur));
        if (v == null) return null;
        var n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
        if (!isFinite(n) || n < min || n > max) { toast(min + " ~ " + max + " 사이로 넣어 주세요."); return null; }
        return Math.round(n);
    }

    /** 이번 기록의 칼로리 · 걸음 · 오른 높이. 거리는 GPS 로 걸은 거리(없으면 코스 진행), 높이는 코스 고도로. */
    function effort() {
        // 가장 멀리 간 자리(dMax)까지로 셉니다 - 되돌아 내려오면 진행 거리는 줄어도 칼로리 · 걸음 · 오른 높이는 줄지 않게
        // (송산: 1.07km 에서 되돌아와 0.85km 가 되자 116 → 79kcal, 오른 높이 104 → 60m)
        var s = segEffort(), b = hike.base || { dist: 0, up: 0, down: 0 };
        var dist = Math.max(hike.walked || 0, b.dist + s.dist), up = b.up + s.up, down = b.down + s.down;
        var kind = c ? c.course.kind : "hike";
        return { dist: dist, up: Math.round(up), kcal: RF.kcal(kind, body.kg, dist, up, down), steps: RF.steps(kind, body.cm, dist) };
    }

    /** 지금 코스에서 한 것(코스를 바꾸면 hike.base 에 더하고 0 부터). */
    function segEffort() {
        var d0 = hike.d0 == null ? hike.d : hike.d0;   // 아직 코스에 닿기 전이면 코스 진행은 0
        var dm = Math.max(hike.dMax || 0, hike.d);
        var cl = c ? RF.climbBetween(c, d0, Math.max(d0, dm)) : { up: 0, down: 0 };
        return { dist: Math.max(0, dm - d0), up: cl.up, down: cl.down };
    }

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            // 2026-10-10 점검: JSON 이 아닌 답(429 · 프록시 HTML)이면 r.json() 의 SyntaxError 대신 HTTP 번호를 알립니다(app.js 와 같음)
            return r.json().catch(function () { return { success: false, message: "응답을 읽지 못했습니다 (HTTP " + r.status + ")" }; }).then(function (j) {
                if (!r.ok || !j || j.success === false) {
                    var err = new Error(j.message || ("HTTP " + r.status));
                    err.data = j;   // 없는 코스면 같은 산 코스(similar)가 들어 있습니다
                    throw err;
                }
                return j;
            });
        });
    }

    function hhmmss(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
        return h + ":" + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
    }

    function clock(ms) {
        var d = new Date(ms);
        return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    }

    function bearing(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
        var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }

    function dirWord(b) {
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(b / 45) % 8] + "쪽";
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    // ------------------------------------------------------------------ 지도

    /**
     * 2026-10-09 (홍TV님): 바탕 지도 - 위성사진(sat) · 밝은 지도(light, V-World 일반지도 Base). 밖 햇빛 아래에서는
     * 밝은 지도가 더 잘 보이기도 합니다(등산 앱 비교 영상의 연한 바탕 지도). 고른 것은 이 기기에 기억합니다.
     */
    var BASEMAP_KEY = "rf-basemap";
    var basemap = "sat";
    try { if (localStorage.getItem(BASEMAP_KEY) === "light") basemap = "light"; } catch (e) { /* 기본 위성 */ }

    function buildStyle(cfg) {
        var dem = { type: "raster-dem", tiles: [cfg.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15,
            attribution: "지형: Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": cfg.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (cfg.vworldKey) {
            var key = encodeURIComponent(cfg.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"], attribution: "위성사진: 국토교통부 V-World" };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"], attribution: "지도: 국토교통부 V-World" };
            layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: basemap === "sat" ? "visible" : "none" } });
            layers.push({ id: "base", type: "raster", source: "base", layout: { visibility: basemap === "light" ? "visible" : "none" } });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.2 } });
            // V-World 지명 겹침은 쓰지 않습니다 - 우리 이름표와 같은 이름이 비스듬히 한 번 더 나와 겹쳐 보입니다
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    /** 바탕 지도 바꾸기 - 타일 층은 보이기만 바꾸고, 밝은 지도에서는 코스 선을 진한 주황(흰 선이 안 보임)으로. */
    function setBasemap(mode, quiet) {
        basemap = mode === "light" ? "light" : "sat";
        try { localStorage.setItem(BASEMAP_KEY, basemap); } catch (e) { /* 기억 못 해도 됨 */ }
        var light = basemap === "light";
        if (map.getLayer("sat")) map.setLayoutProperty("sat", "visibility", light ? "none" : "visible");
        if (map.getLayer("base")) map.setLayoutProperty("base", "visibility", light ? "visible" : "none");
        if (map.getLayer("hillshade")) map.setPaintProperty("hillshade", "hillshade-exaggeration", light ? 0.3 : 0.2);
        if (map.getLayer("route-case")) {
            map.setPaintProperty("route-case", "line-color", light ? "#ffffff" : "#000");
            map.setPaintProperty("route-case", "line-opacity", light ? 0.95 : 0.45);
            map.setPaintProperty("route-all", "line-color", light ? "#e8590c" : "#ffffff");
            map.setPaintProperty("trails", "line-color", light ? "#8a6d00" : "#ffe8a3");
        }
        $("layerBtn").textContent = light ? "🛰️" : "🗺️";
        $("layerBtn").setAttribute("aria-label", light ? "위성사진으로" : "밝은 지도로");
        $("layerBtn").title = light ? "위성사진으로" : "밝은 지도로(햇빛 아래에서 잘 보임)";
        document.body.classList.toggle("lightmap", light);
        if (!quiet) toast(light ? "밝은 지도" : "위성사진", 1500);
    }

    function progressGradient(p) {
        var on = RF.LINE_COLOR, clear = "rgba(56,217,234,0)";
        if (p <= 0.0001) return ["step", ["line-progress"], clear, 1, clear];
        if (p >= 0.9999) return ["step", ["line-progress"], on, 1, on];
        return ["step", ["line-progress"], on, p, clear];
    }

    function startMap() {
        map = new maplibregl.Map({ container: "map", style: buildStyle(cfg), center: [127.8, 36.3], zoom: 6.2,
            attributionControl: false, pitchWithRotate: false, dragRotate: false, touchPitch: false });
        map.touchZoomRotate.disableRotation();   // 북쪽이 늘 위(작은 화면에서 길 잃지 않게)
        map.addControl(new maplibregl.AttributionControl({ compact: true,
            customAttribution: "등산로: 산림청 등산로정보 | 걷기길: 한국관광공사 두루누비 | 지명 · 자전거길: © OpenStreetMap contributors | <a href=\"about.html\">안내</a>" }), "top-right");
        // 작은 화면에서는 출처를 ⓘ 로 접어 둡니다(누르면 펼쳐짐) - 지도를 가리지 않게
        // (MapLibre 는 처음에 펼쳐 두고 첫 끌기 때 접습니다 - 바로 접고, 지도가 다 뜬 뒤에도 한 번 더)
        function foldAttrib() {
            var a = document.querySelector(".maplibregl-ctrl-attrib");
            if (a) a.classList.remove("maplibregl-compact-show");
        }
        foldAttrib();
        map.once("styledata", foldAttrib);
        map.once("load", foldAttrib);
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        // 이름표 겹침 - 지도가 움직이는 동안 0.15초마다 다시(정상 · 출발 · 도착 먼저, 그다음 지금 위치에 가까운 순)
        var declutterTimer = 0;
        map.on("rotate", function () {   // 나침반이 꺼져 있으면 바늘은 지도의 북쪽(두 손가락으로 돌렸을 때)
            if (compass.heading == null) setNeedle(-map.getBearing());
            if (hike.guideBr != null && compass.heading == null) turnGuideArrow();
        });
        map.on("render", function () {
            if (declutterTimer || !drawCourse.pois) return;
            declutterTimer = setTimeout(function () {
                declutterTimer = 0;
                RF.declutter(drawCourse.pois.map(function (q) { return { el: q.el, prio: q.top ? -2 : q.end ? -1 : Math.abs(q.d - (hike.d || 0)) }; }));
            }, 150);
        });
        ["dragstart", "zoomstart"].forEach(function (ev) {
            map.on(ev, function (e) { if (e.originalEvent) setFollow(false); });   // 손으로 움직이면 따라가기를 끕니다
        });
        mapReady = new Promise(function (resolve) {
            map.once("style.load", function () {
                var empty = { type: "FeatureCollection", features: [] };
                // 주변 다른 등산로 - 흐린 선(코스 밖으로 빠졌을 때 어느 길로 돌아갈지 보이게)
                map.addSource("trails", { type: "geojson", data: empty });
                map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffe8a3", "line-opacity": 0.55, "line-width": 2, "line-dasharray": [2, 1.5] } });
                map.addSource("route", { type: "geojson", lineMetrics: true, data: empty });
                map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#000", "line-opacity": 0.45, "line-width": 8 } });
                map.addLayer({ id: "route-all", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffffff", "line-width": 4.5 } });
                map.addLayer({ id: "route-done", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-width": 5, "line-gradient": progressGradient(0) } });
                // 갈림길 - 글자 없이 작은 점
                map.addSource("junctions", { type: "geojson", data: empty });
                map.addLayer({ id: "junctions", type: "circle", source: "junctions",
                    paint: { "circle-radius": 4.5, "circle-color": "#ffffff", "circle-stroke-color": "#1a73e8", "circle-stroke-width": 2 } });
                // 코스에서 벗어났을 때 가장 가까운 길까지 점선
                // 내 기록 하나를 지도에 볼 때 - 보라 선(코스 선과 헷갈리지 않게)
                map.addSource("recTrack", { type: "geojson", data: empty });
                map.addLayer({ id: "recTrack", type: "line", source: "recTrack", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#c77dff", "line-width": 4, "line-opacity": 0.9 } });
                map.addSource("guide", { type: "geojson", data: empty });
                map.addLayer({ id: "guide", type: "line", source: "guide",
                    paint: { "line-color": "#ff5d5d", "line-width": 3, "line-dasharray": [1.5, 1.2] } });
                if (cfg.vworldKey) setBasemap(basemap, true);
                resolve();
            });
        });
    }

    function marker(elm, lngLat, anchor) {
        return new maplibregl.Marker({ element: elm, anchor: anchor || "center" }).setLngLat(lngLat).addTo(map);
    }

    function drawCourse(keepView) {
        (drawCourse.markers || []).forEach(function (m) { m.remove(); });
        var ms = drawCourse.markers = [];
        map.getSource("route").setData({ type: "Feature", properties: {},
            geometry: { type: "LineString", coordinates: c.lon.map(function (lon, i) { return [lon, c.lat[i]]; }) } });
        // km 번호(동그라미)
        var step = RF.kmStep(c.total);
        for (var m = step; m < c.total - step * 0.3; m += step) {
            var p = RF.at(c, m), e = document.createElement("div");
            e.className = "km";
            e.textContent = String(Math.round(m / 1000));
            ms.push(marker(e, [p.lon, p.lat]));
        }
        // 지점 - 아이콘 + 이름. 출발 · 도착 자리에 이름표가 없으면 "출발" · "도착".
        var n = c.lon.length - 1;
        var hasStart = c.pois.some(function (q) { return +q.dist_m < 60 && +q.off_route_m < 60; });
        var hasEnd = c.pois.some(function (q) { return +q.dist_m > c.total - 60 && +q.off_route_m < 60; });
        // 같은 자리(80m 안) 이름표는 하나로 - 대표 이름 + 아래에 다른 이름들
        var groups = RF.groupPois(c.pois, 80);
        var top = RF.summitIndex(groups.map(function (g) { return { name: g.lead.name, names: g.names, ele_m: g.lead.ele_m }; }), c.course.name);
        var list = groups.map(function (g, gi) {
            var more = g.names.slice(1, 3);
            if (g.names.length > 3) more[1] += " 외 " + (g.names.length - 3);
            return { name: g.lead.name, lon: +g.lead.lon, lat: +g.lead.lat, d: +g.lead.dist_m, more: more, top: gi === top };
        });
        if (!hasStart) list.unshift({ name: "출발", lon: c.lon[0], lat: c.lat[0], d: 0, more: [] });
        if (!hasEnd) list.push({ name: "도착", lon: c.lon[n], lat: c.lat[n], d: c.total, more: [] });
        drawCourse.pois = [];
        list.forEach(function (q) {
            var e = document.createElement("div");
            e.className = "poi";
            e.innerHTML = '<div class="lb"></div><div class="ic"></div>';
            var lb = e.querySelector(".lb");
            lb.textContent = q.name;
            q.more.forEach(function (nm) { var m = document.createElement("span"); m.className = "more"; m.textContent = nm; lb.appendChild(m); });
            e.querySelector(".ic").textContent = RF.poiIcon(q.name);
            drawCourse.pois.push({ el: e, d: q.d, end: q.d < 60 || q.d > c.total - 60, top: !!q.top });
            ms.push(new maplibregl.Marker({ element: e, anchor: "bottom", offset: [0, 11] }).setLngLat([q.lon, q.lat]).addTo(map));
        });
        map.getSource("junctions").setData({ type: "FeatureCollection", features: (c.junctions || []).map(function (jd) {
            var jp = RF.at(c, jd);
            return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [jp.lon, jp.lat] } };
        }) });
        if (!keepView) {   // 걷는 중에 코스를 바꿀 때는 지도를 그대로(내 위치를 따라감)
            var b = new maplibregl.LngLatBounds();
            for (var i = 0; i < c.lon.length; i++) b.extend([c.lon[i], c.lat[i]]);
            // 들머리 근처 주차장 · 버스 정류장도 처음 화면에 보이게
            c.pois.forEach(function (q) { if (RF.isAccess(q) && +q.dist_m < 300) b.extend([+q.lon, +q.lat]); });
            map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });
        }
        loadTrails();
    }

    /** 코스 범위(+약 1km)의 주변 등산로. 오프라인이면 저장해 둔 것(서비스 워커)을 씁니다. */
    function courseBbox(pad) {
        var w = Math.min.apply(null, c.lon) - pad, e = Math.max.apply(null, c.lon) + pad;
        var s = Math.min.apply(null, c.lat) - pad, n = Math.max.apply(null, c.lat) + pad;
        // API 는 0.2° 안만 받습니다 - 넓은 코스는 가운데 0.2° 만
        if (e - w > 0.2) { var cx = (w + e) / 2; w = cx - 0.099; e = cx + 0.099; }
        if (n - s > 0.2) { var cy = (s + n) / 2; s = cy - 0.099; n = cy + 0.099; }
        return [w, s, e, n].map(function (v) { return v.toFixed(5); }).join(",");
    }

    // 같은 범위(되돌아가기 · 같은 산 갈래 바꾸기)는 다시 묻지 않습니다 - 마지막 몇 개만 기억
    var trailsMemo = [];
    function trailsJson(url) {
        for (var i = 0; i < trailsMemo.length; i++) if (trailsMemo[i].url === url) return trailsMemo[i].p;
        var p = getJson(url);
        trailsMemo.unshift({ url: url, p: p });
        trailsMemo.length = Math.min(trailsMemo.length, 4);
        p.catch(function () { trailsMemo = trailsMemo.filter(function (m) { return m.p !== p; }); });
        return p;
    }

    function loadTrails() {
        trails = [];
        var id = c.id;
        trailsJson("api/trails?bbox=" + courseBbox(0.01)).then(function (j) {
            if (!c || c.id !== id) return;
            trails = (j.trails || []).filter(function (t) { return t.id !== id && t.coords.length > 1; }).map(function (t) {
                var tc = { id: t.id, name: t.name, lon: [], lat: [], dist: [0], ele: [] };
                t.coords.forEach(function (p, i) {
                    tc.lon.push(p[0]); tc.lat.push(p[1]); tc.ele.push(null);
                    if (i) tc.dist.push(tc.dist[i - 1] + RF.distM(tc.lat[i - 1], tc.lon[i - 1], p[1], p[0]));
                });
                tc.total = tc.dist[tc.dist.length - 1];
                return tc;
            });
            map.getSource("trails").setData({ type: "FeatureCollection", features: trails.map(function (t) {
                return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.lon.map(function (lon, i) { return [lon, t.lat[i]]; }) } };
            }) });
        }).catch(function () { /* 주변 길은 없어도 됩니다 */ });
    }

    /** 가장 가까운 등산로 자리 - 지금 코스와 주변 길 가운데. {lat, lon, off, name(다른 길이면)} */
    /** 길 안내 화살표: 나침반이 있으면 핸드폰 위쪽 기준(그쪽으로 몸을 돌려 걷게), 없으면 지도(북쪽 위) 기준. */
    function turnGuideArrow() {
        var rel = compass.heading != null ? hike.guideBr - compass.heading : hike.guideBr - map.getBearing();
        $("guideArrow").style.transform = "rotate(" + rel + "deg)";   // 화살표 그림은 위쪽을 가리킵니다
    }

    // 2026-10-09 점검: 화면은 1초마다 다시 그리는데 위치는 그대로일 때가 많습니다 - 같은 위치 · 코스 · 주변 길이면 지난 답을 씁니다
    // (코스에서 벗어나 있는 동안 1초마다 모든 주변 길에 맞춰 보던 계산)
    var ntMemo = null;
    function nearestTrail(lat, lon) {
        if (ntMemo && ntMemo.lat === lat && ntMemo.lon === lon && ntMemo.c === c && ntMemo.trails === trails) return ntMemo.best;
        var best = nearestTrailNow(lat, lon);
        ntMemo = { lat: lat, lon: lon, c: c, trails: trails, best: best };
        return best;
    }

    /** 칸 이름 + 고칠 수 있는 값(파란 글자) - 값이 바뀔 때만 다시 만듭니다(1초마다 innerHTML 로 새로 쓰던 것, 2026-10-09 점검). */
    function setLabel(id, word, val) {
        var el = $(id);
        if (el.dataset.v === val) return;
        el.dataset.v = val;
        el.textContent = word;
        var sp = document.createElement("span");
        sp.className = "set";
        sp.textContent = val;
        el.appendChild(sp);
    }

    function nearestTrailNow(lat, lon) {
        var s0 = RF.snap(c, lat, lon, null), p0 = RF.at(c, s0.d);
        var best = { lat: p0.lat, lon: p0.lon, off: s0.off, name: null, course: true };
        trails.forEach(function (t) {
            var st = RF.snap(t, lat, lon, null);
            // 같은 길을 쓰는 다른 코스가 1m 가깝다고 그 이름을 대면 헷갈립니다(송산: 52m 인데 '가장 가까운 길(송산 · … → 들머리 1)')
            if (st.off < best.off - 15) {
                var pt = RF.at(t, st.d);
                best = { lat: pt.lat, lon: pt.lon, off: st.off, name: t.name };
            }
        });
        return best;
    }

    function setMe(lat, lon, heading) {
        // 멈춰 있을 때(GPS 방향이 없을 때)는 나침반 방향을 씁니다
        if ((heading == null || !isFinite(heading) || (hike.speed != null && hike.speed < 0.5)) && compass.heading != null) heading = compass.heading;
        if (!meMarker) {
            var e = document.createElement("div");
            e.className = "me";
            e.innerHTML = '<div class="cone"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M9 1 L16 16 L9 12 L2 16 Z" fill="#1a73e8" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div><div class="dot"></div>';
            meMarker = marker(e, [lon, lat]);
        }
        meMarker.setLngLat([lon, lat]);
        var cone = meMarker.getElement().querySelector(".cone");
        if (heading != null && isFinite(heading)) {
            cone.style.display = "block";
            cone.style.transform = "rotate(" + heading + "deg)";
        } else {
            cone.style.display = "none";
        }
    }

    function setFollow(on) {
        hike.follow = on;
        $("follow").classList.toggle("on", on);
    }

    // ------------------------------------------------------------------ 코스

    // ---- 2026-10-08 (홍TV님): GPX 열기 - 불러온 GPX 를 서버 코스와 같은 모양(RF.gpxToApi)으로 이 기기에 두고(최근 GPX_KEEP 개),
    //      코스 ID "gpx-<글자 지문>" 으로 엽니다. 새로 고침 · 이어서 산행도 서버 코스처럼 됩니다. 서버에는 올리지 않습니다.
    var isGpxId = RF.isGpxId, gpxId = RF.gpxId, storeGpx = RF.storeGpx, storedGpx = RF.storedGpx;   // course-kit(코스 미리보기와 같이 씀)
    $("gpxOpen").addEventListener("click", function () { $("gpxFile").value = ""; $("gpxFile").click(); });
    $("gpxFile").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast("GPX 가 너무 큽니다(5MB 까지).", 5000); return; }
        f.text().then(function (text) {
            var api = RF.gpxToApi(text, f.name), id = gpxId(text);
            storeGpx(id, api);
            toast("GPX 를 열었습니다 - " + api.course.name + " · " + km(api.points[api.points.length - 1][3]) + "km"
                + (api.pois.length ? " · 지점 " + api.pois.length + "개" : ""), 5000);
            location.hash = "c=" + encodeURIComponent(id);
        }).catch(function (e) {
            toast("GPX 를 열지 못했습니다: " + (e && e.message || e), 6000);
        });
    });

    var loadSeq = 0;   // 2026-10-09 점검: A 를 누르고 바로 B 를 누르면 늦게 온 A 가 B 를 덮지 않게
    function loadCourse(id) {
        var my = ++loadSeq;
        $("pick").style.display = "none";
        $("share").style.display = isGpxId(id) ? "none" : "";   // 이 기기에만 있는 GPX 는 링크로 보낼 수 없습니다
        return Promise.all([isGpxId(id) ? storedGpx(id) : getJson("api/course?id=" + encodeURIComponent(id)), mapReady]).then(function (r) {
            if (my !== loadSeq) return;   // 그 사이 다른 코스를 골랐음
            c = RF.fromApi(id, r[0]);
            if (c.lon.length < 2) throw new Error("경로 점이 없습니다.");
            var sv = loadSaved();
            if (sv && sv.rev) c = RF.reverseCourse(c);   // 되돌아가는 길로 바꿔 걷던 산행을 이어 갈 때
            RF.showName($("name"), c.course.name);
            document.title = RF.nameText(c.course.name) + " - routefly";
            setKindWords();
            drawCourse();
            prof = RF.profile($("profile"), c, {});
            $("save").textContent = offlineIds().indexOf(id) >= 0 ? "✅ 저장됨" : "📥 저장";
            // 이 기기에 남은 산행 기록(새로 고침 · 화면 꺼짐 뒤에도 이어서)
            var saved = loadSaved();
            hike.d = saved ? saved.d : 0;
            render();
            if (saved && saved.t && Date.now() - saved.t < RESUME_MS && safetyOk()) {
                // 길찾기 · 전화 등으로 나갔다가 화면이 다시 열림 - 기다리지 않고 바로 이어서 안내
                start(false);
                toast("진행 중이던 " + K().act + "을 이어서 안내합니다(" + km(saved.d) + "km).", 5000);
            } else if (saved) {
                $("go").textContent = "이어서 " + K().act;
                toast("진행 중이던 기록이 있습니다(" + km(saved.d) + "km). \"이어서 " + K().act + "\" 버튼을 누르세요.", 5000);
            }
        }).catch(function (e) {
            if (my !== loadSeq) return;
            // 배치를 다시 돌려 코스 번호가 바뀐 예전 링크 · 기록 - 같은 산 코스를 골라 보여 줍니다
            var similar = e.data && e.data.similar || [];
            showPick(similar.length > 0);   // 같은 산 목록을 보여 줄 때는 마지막 검색을 다시 하지 않습니다(늦게 온 검색이 덮어씀)
            if (similar.length) { pickSeq++; listCourses(similar, null, "이 코스는 자료가 새로 바뀌어 번호가 달라졌습니다. 같은 산의 코스에서 골라 주세요."); }
            else toast("코스를 불러오지 못했습니다: " + e.message, 6000);
        });
    }

    function saveKey() { return "rf-hike-" + c.id; }

    function loadSaved() {
        try {
            var s = JSON.parse(localStorage.getItem(saveKey()) || "null");
            return s && Date.now() - s.start < 24 * 3600 * 1000 ? s : null;   // 하루 지난 기록은 버립니다
        } catch (e) {
            return null;
        }
    }

    function save() {
        if (hike.sim) return;
        try { localStorage.setItem(saveKey(), JSON.stringify({ start: hike.start, d: hike.d, walked: hike.walked, d0: hike.d0, dMax: hike.dMax,
                                                        base: hike.base, rev: !!c.rev, segT0: hike.segT0, t: Date.now() }));
              localStorage.setItem(ACTIVE_KEY, c.id); } catch (e) { /* 저장 못 해도 산행은 계속 */ }
    }

    /**
     * 걷는 중인 코스 ID - 길찾기(카카오맵 등)로 나갔다가 이 화면이 닫혀도, 주소 없이 다시 열면 그 코스로 이어 가려고.
     * 산행을 끝내면 지웁니다.
     */
    var ACTIVE_KEY = "rf-hike-active";

    /** 2026-10-09 점검: 하루 지나 이어 할 수 없는 산행 저장분(rf-hike-<코스> · -track · -notes)을 처음에 지웁니다(쌓여 저장 공간을 채움). */
    (function purgeOldHikes() {
        try {
            var old = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!/^rf-hike-/.test(k) || k === ACTIVE_KEY || /-(track|notes)$/.test(k)) continue;
                var v = null;
                try { v = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { /* 깨진 값도 지움 */ }
                if (!v || !(Date.now() - v.start < 24 * 3600 * 1000)) old.push(k);
            }
            old.forEach(function (k) { localStorage.removeItem(k); localStorage.removeItem(k + "-track"); localStorage.removeItem(k + "-notes"); });
        } catch (e) { /* 다음에 */ }
    })();
    var RESUME_MS = 3 * 3600 * 1000;   // 마지막 위치 저장이 이보다 오래되면 저절로 이어 가지 않고 단추로

    function clearSaved() {
        try {
            localStorage.removeItem(saveKey());
            localStorage.removeItem(saveKey() + "-track");
            localStorage.removeItem(saveKey() + "-notes");
            if (localStorage.getItem(ACTIVE_KEY) === c.id) localStorage.removeItem(ACTIVE_KEY);
        } catch (e) { /* 무시 */ }
    }

    // ------------------------------------------------------------------ 기록(걸은 길) · GPX

    function loadTrack() {
        try { return JSON.parse(localStorage.getItem(saveKey() + "-track") || "[]"); } catch (e) { return []; }
    }

    /** 걸은 자리 하나 - 8m 넘게 움직였거나 1분 지났을 때만(배터리 · 저장 공간 아끼게). */
    function addTrack(lat, lon, t, alt) {
        var last = hike.track[hike.track.length - 1];
        if (last) {
            var d = RF.distM(last[0], last[1], lat, lon);
            if (d < 8 && t - last[2] < 60000) return;
            if (d < 300) hike.walked += d;   // GPS 튐(한 번에 300m 넘게)은 거리에 넣지 않습니다
        }
        hike.track.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, Math.round(t), alt == null ? null : Math.round(alt)]);
        // 2026-10-09 점검: 점마다 기록 전체를 다시 쓰면 긴 산행에서 점점 무거워집니다(점 n 개면 n² 글자) -
        // 10점 또는 30초마다, 그리고 화면이 가려질 때(flushTrack) 씁니다. 잃어도 마지막 30초 남짓입니다.
        if (hike.track.length % 10 === 0 || t - (hike.trackSavedT || 0) > 30000) flushTrack();
    }

    function flushTrack() {
        if (hike.sim || !c || !hike.track.length) return;
        hike.trackSavedT = now();
        try {
            localStorage.setItem(saveKey() + "-track", JSON.stringify(hike.track));
        } catch (e) {   // 공간이 모자라도 산행은 계속 - 한 번만 알립니다
            if (!hike.trackFull) { hike.trackFull = true; toast("핸드폰 저장 공간이 모자라 걸은 길을 저장하지 못했습니다. 내 기록에서 지난 기록을 지워 주세요.", 7000); }
        }
    }

    /**
     * 내 기록 목록. 2026-10-09 점검: 걸은 길이 든 기록 20개를 localStorage(5MB 남짓)에 두면 긴 자전거 기록 몇 개로 차서
     * 예전 기록이 말없이 지워졌습니다 - IndexedDB("rf-records", 사진과 같은 방식)로 옮깁니다. 화면은 메모리 사본(recCache)을 읽고,
     * 바꿀 때 IndexedDB 에 씁니다. 예전 localStorage 기록은 처음 한 번 옮기고 지웁니다. IndexedDB 가 없으면 예전처럼.
     */
    var REC_LS = "rf-records", REC_MAX = 30, recCache = [];
    function recLs() { try { return JSON.parse(localStorage.getItem(REC_LS) || "[]"); } catch (e) { return []; } }
    function recTx(mode, fn) {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error("no indexedDB")); return; }
            var r = indexedDB.open("rf-records", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("r"); };
            r.onerror = function () { reject(r.error); };
            r.onsuccess = function () {
                // 2026-10-10 점검: transaction 이 던지면(저장소 없음 · 닫힘) 약속이 끝나지 않아 기록 화면이 멈췄습니다 - 실패로 돌려줌
                var db = r.result;
                try {
                    var tx = db.transaction("r", mode), out = fn(tx.objectStore("r"));
                    tx.oncomplete = function () { db.close(); resolve(out && out.result); };
                    tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error("기록 저장이 취소되었습니다.")); };
                } catch (e) { db.close(); reject(e); }
            };
        });
    }
    var recordsReady = recTx("readonly", function (st) { return st.get("list"); }).then(function (list) {
        if (Array.isArray(list)) { recCache = list; return; }
        recCache = recLs();   // 처음 - 예전 기록을 옮김
        if (!recCache.length) return;
        return recTx("readwrite", function (st) { st.put(recCache, "list"); }).then(function () {
            try { localStorage.removeItem(REC_LS); } catch (e) { /* 다음에 다시 */ }
        });
    }).catch(function () { recCache = recLs(); });

    function records() { return recCache.slice(); }

    /** 기록 목록을 바꿉니다. 저장에 실패하면 알립니다(예전에는 말없이 5개만 남겼음). */
    function writeRecords(list) {
        recCache = list.slice(0, REC_MAX);
        return recTx("readwrite", function (st) { st.put(recCache, "list"); }).catch(function () {
            try {
                localStorage.setItem(REC_LS, JSON.stringify(recCache));
            } catch (e) {
                toast("핸드폰 저장 공간이 모자라 기록을 저장하지 못했습니다. 지난 기록을 GPX 로 보내 두고 지워 주세요.", 8000);
            }
        });
    }

    /** 순수 함수 - 기록 → GPX 1.1 글. */
    function toGpx(rec) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        var pts = rec.track.map(function (p) {
            return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + p[3] + "</ele>" : "")
                + "<time>" + new Date(p[2]).toISOString() + "</time></trkpt>";
        }).join("\n");
        // 2026-10-08: 사진 · 메모는 지점(wpt)으로 - 이름은 메모 앞 30자(없으면 "사진"), 사진 자체는 GPX 에 넣지 않습니다
        var wpts = (rec.notes || []).map(function (n) {
            var nm = n.text ? n.text.replace(/\s+/g, " ").slice(0, 30) : "사진";
            return '<wpt lat="' + n.lat + '" lon="' + n.lon + '">' + (n.ele != null ? "<ele>" + n.ele + "</ele>" : "")
                + "<time>" + new Date(n.t).toISOString() + "</time><name>" + esc(nm) + "</name>"
                + (n.text ? "<desc>" + esc(n.text) + "</desc>" : "") + (n.photo ? "<type>photo</type>" : "") + "</wpt>";
        }).join("\n");
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly" xmlns="http://www.topografix.com/GPX/1/1">\n'
            + "<metadata><name>" + esc(rec.name) + "</name><time>" + new Date(rec.start).toISOString() + "</time></metadata>\n"
            + (wpts ? wpts + "\n" : "")
            + "<trk><name>" + esc(rec.name) + "</name><type>" + esc(rec.kind || "hike") + "</type><trkseg>\n" + pts + "\n</trkseg></trk>\n</gpx>\n";
    }

    /** 공유 창으로 파일을 보낼 수 있는가(앱 · 핸드폰 브라우저). 단추 이름에만 씁니다. */
    function canShareFiles() {
        if (FS && SHARE) return true;
        try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "a.txt", { type: "text/plain" })] })); } catch (e) { return false; }
    }

    function downloadGpx(rec) {
        var d = new Date(rec.start);
        var name = "routefly-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")
            + "-" + (rec.courseId || "track") + ".gpx";
        if (FS && SHARE) {   // 앱 - 공유 창으로(파일 저장 · 다른 앱으로 보내기)
            nativeShareFile(name, btoa(unescape(encodeURIComponent(toGpx(rec)))), rec.name)
                .catch(function (e) { toast("GPX 를 보내지 못했습니다: " + (e && e.message || e), 5000); });
            return;
        }
        // 핸드폰 브라우저 - 공유 창(카카오톡 · 메일 · 드라이브 · 다른 등산 앱 …). 브라우저마다 받는 파일 종류가 달라 되는 것으로
        var text = toGpx(rec), file = null;
        if (navigator.canShare) {
            ["application/gpx+xml", "application/xml", "text/xml", "text/plain"].some(function (type) {
                var f = new File([text], name, { type: type });
                try { if (navigator.canShare({ files: [f] })) { file = f; return true; } } catch (e) { /* 다음 종류 */ }
                return false;
            });
        }
        if (file) {
            navigator.share({ files: [file], title: rec.name, text: rec.name + " - routefly 기록" }).catch(function (e) {
                if (e && e.name === "AbortError") return;   // 사용자가 닫음
                saveFile(text, name);   // 공유가 막히면 내려받기로
            });
            return;
        }
        saveFile(text, name);
    }

    /** 내려받기(공유 창이 없는 컴퓨터 브라우저 등). */
    function saveFile(text, name) {
        var blob = new Blob([text], { type: "application/gpx+xml" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    /** 산행을 끝낼 때 - 기록을 "내 기록" 에 남기고 요약을 보여 줍니다(최근 30개만). 아주 짧거나 코스와 먼 곳이면 남기지 않습니다. */
    function finishRecord() {
        if (hike.track.length < 2) return;
        if (RF.recordSkip(hike.walked, hike.track, c)) return;   // 알림 없이(2026-10-09 홍TV님)
        var rec = { courseId: c.id, name: c.course.name, kind: c.course.kind, start: hike.start, end: now(),
                    walked: Math.round(hike.walked), done: Math.round(hike.d), track: hike.track };
        if (hike.notes.length) rec.notes = hike.notes.slice();
        var ef = effort();
        rec.kcal = ef.kcal;
        rec.steps = ef.steps;
        rec.up = ef.up;
        recordsReady.then(function () {
            var list = records();
            list.unshift(rec);
            return writeRecords(list);
        }).then(gcPhotos);   // 30개 밖으로 밀려난 기록의 사진
        var sum = $("doneSum");
        sum.innerHTML = "";
        [["코스", rec.name], ["걸은 거리", km(rec.walked) + " km"], ["코스 진행", km(rec.done) + " / " + km(c.total) + " km"],
         ["걸린 시간", hhmmss(rec.end - rec.start)], ["오른 높이", num(rec.up) + " m"],
         ["칼로리(추정)", num(rec.kcal) + " kcal · " + body.kg + "kg 기준"]]
            .concat(rec.steps != null ? [["걸음(추정)", num(rec.steps) + " 보"]] : [])
            .concat([["기록 점", rec.track.length + "개"]])
            .concat(rec.notes ? [["사진 · 메모", rec.notes.filter(function (n) { return n.photo; }).length + "장 · " + rec.notes.filter(function (n) { return n.text; }).length + "개"]] : [])
            .forEach(function (r) {
            var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
            a.textContent = r[0]; b.textContent = r[1];
            row.appendChild(a); row.appendChild(b); sum.appendChild(row);
        });
        $("doneGpx").onclick = function () { downloadGpx(rec); };
        $("doneGpx").textContent = canShareFiles() ? "📤 GPX 보내기" : "GPX 저장";
        $("doneSheet").style.display = "flex";
    }

    function showRecords() {
        recordsReady.then(drawRecords);
    }

    function drawRecords() {
        var box = $("recList"), list = records();
        box.innerHTML = "";
        if (!list.length) {
            box.innerHTML = '<p class="tip">아직 기록이 없습니다. 시작했다가 "끝내기" 를 누르면 남습니다.</p>';
        }
        list.forEach(function (r, i) {
            var row = document.createElement("div");
            row.className = "rec";
            var info = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span");
            b.textContent = r.name;
            var d = new Date(r.start);
            sp.textContent = d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " · " + km(r.walked) + "km · " + hhmmss(r.end - r.start)
                + (r.kcal != null ? " · " + num(r.kcal) + "kcal" : "") + (r.steps != null ? " · " + num(r.steps) + "보" : "");
            info.appendChild(b); info.appendChild(sp);
            var g = document.createElement("button"); g.textContent = canShareFiles() ? "📤 GPX" : "GPX"; g.title = "GPX 파일 보내기 · 저장"; g.onclick = function () { downloadGpx(r); };
            if (r.notes && r.notes.length) {
                var nb = document.createElement("button"); nb.textContent = "📝 " + r.notes.length; nb.title = "사진 · 메모 보기";
                nb.onclick = function () { showNotes(r); };
                row.appendChild(info); info = null; row.appendChild(nb);
            }
            var v = document.createElement("button"); v.textContent = "📈"; v.title = "고도 그래프 · 지도에 보기";
            v.onclick = function () { showRecord(r); };
            var x = document.createElement("button"); x.textContent = "지우기";
            x.onclick = function () {
                if (!confirm("이 기록을 지울까요?")) return;
                var l = records(); l.splice(i, 1);
                writeRecords(l).then(gcPhotos);
                drawRecords();
            };
            if (info) row.appendChild(info);
            row.appendChild(v); row.appendChild(g); row.appendChild(x);
            box.appendChild(row);
        });
        $("recSheet").style.display = "flex";
    }

    /**
     * 기록 하나 보기(2026-10-09) - 요약, 고도 그래프(사진 · 메모 자리 표시), "지도에 보기" 는 지금 지도에 보라 선으로 그리고
     * 그 범위로 옮깁니다(코스는 그대로, 다시 누르면 선을 지움). 기록에 고도가 없으면 그래프 대신 안내 글.
     */
    function showRecord(rec) {
        var rc = RF.recordCourse(rec), sum = $("recViewSum");
        $("recViewTitle").textContent = "📈 " + rec.name;
        sum.innerHTML = "";
        var d = new Date(rec.start);
        var eles = rc.ele.filter(function (e) { return e != null; });
        [["날짜", d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " " + clock(rec.start)],
         ["걸은 거리", km(rec.walked) + " km"], ["걸린 시간", hhmmss(rec.end - rec.start)]]
            .concat(rec.up != null ? [["오른 높이", num(rec.up) + " m"]] : [])
            .concat(eles.length ? [["가장 높은 곳", num(Math.max.apply(null, eles)) + " m"]] : [])
            .concat(rec.kcal != null ? [["칼로리(추정)", num(rec.kcal) + " kcal"]] : [])
            .forEach(function (r) {
                var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
                a.textContent = r[0]; b.textContent = r[1];
                row.appendChild(a); row.appendChild(b); sum.appendChild(row);
            });
        $("recView").style.display = "flex";   // 그래프 이름표 자리를 재려면 먼저 보여야 합니다
        if (rc.lat.length > 1) RF.profile($("recViewProfile"), rc, {}).set(rc.total);   // 다 걸은 기록이라 끝까지 색칠
        else $("recViewProfile").textContent = "";
        $("recViewMap").disabled = rc.lat.length < 2;
        $("recViewMap").onclick = function () {
            if (!mapReady) { toast("지도가 아직 준비되지 않았습니다.", 2500); return; }
            mapReady.then(function () {
                map.getSource("recTrack").setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {},
                    geometry: { type: "LineString", coordinates: rc.lon.map(function (lon, i) { return [lon, rc.lat[i]]; }) } }] });
                var b = new maplibregl.LngLatBounds();
                for (var i = 0; i < rc.lon.length; i++) b.extend([rc.lon[i], rc.lat[i]]);
                setFollow(false);
                map.fitBounds(b, { padding: 50, duration: 0, maxZoom: 16 });
                $("recClear").style.display = "block";
            });
            $("recView").style.display = "none";
            $("recSheet").style.display = "none";
            $("pick").style.display = "none";   // 코스를 고르기 전(내 기록으로 바로 온 때)에도 지도가 보이게
        };
        $("recViewClose").onclick = function () { $("recView").style.display = "none"; };
    }

    // ------------------------------------------------------------------ 사진 · 메모 (2026-10-08 홍TV님 - 램블러처럼 기록에 사진 · 메모)

    /** 사진 저장소 - IndexedDB "rf-photos"(localStorage 는 5MB 남짓이라 사진이 안 들어감). 열쇠 → JPEG Blob. */
    function photoDb() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error("이 브라우저는 사진을 저장할 수 없습니다.")); return; }
            var r = indexedDB.open("rf-photos", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("p"); };
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
        });
    }
    function photoTx(mode, fn) {
        return photoDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                try {   // 2026-10-10 점검: 던지면 db 를 닫고 실패로(열린 채 남지 않게)
                    var tx = db.transaction("p", mode), st = tx.objectStore("p"), out = fn(st);
                    tx.oncomplete = function () { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
                    tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error("사진 저장이 취소되었습니다.")); };
                } catch (e) { db.close(); reject(e); }
            });
        });
    }
    function photoPut(id, blob) { return photoTx("readwrite", function (st) { st.put(blob, id); }); }
    function photoGet(id) { return photoTx("readonly", function (st) { return st.get(id); }); }
    /** 어느 기록 · 지금 산행에도 없는 사진을 지웁니다(기록을 지우거나 30개 밖으로 밀려났을 때). */
    function gcPhotos() {
        var keep = {}, lists = records().concat([{ notes: hike.notes }]);
        // 2026-10-09 점검: 이어 하려고 남겨 둔 산행(rf-hike-<코스>-notes)의 사진도 남깁니다
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (/^rf-hike-.+-notes$/.test(k)) lists.push({ notes: JSON.parse(localStorage.getItem(k) || "[]") });
            }
        } catch (e) { return; }   // 못 읽으면 지우지 않습니다
        lists.forEach(function (r) { (r.notes || []).forEach(function (n) { if (n.photo) keep[n.photo] = 1; }); });
        photoTx("readwrite", function (st) {
            var q = st.getAllKeys();
            q.onsuccess = function () { q.result.forEach(function (k) { if (!keep[k]) st.delete(k); }); };
        }).catch(function () { /* 사진 저장소가 없으면 할 일 없음 */ });
    }
    /** 사진을 긴 변 PHOTO_MAX px JPEG 로 줄입니다(저장 공간). */
    var PHOTO_MAX = 1600;
    function shrinkPhoto(file) {
        return new Promise(function (resolve, reject) {
            var img = new Image(), url = URL.createObjectURL(file);
            img.onload = function () {
                var k = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
                var cv = document.createElement("canvas");
                cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
                cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url);
                cv.toBlob(function (b) { if (b) resolve(b); else reject(new Error("사진을 줄이지 못했습니다.")); }, "image/jpeg", 0.8);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했습니다.")); };
            img.src = url;
        });
    }

    function loadNotes() {
        try { return JSON.parse(localStorage.getItem(saveKey() + "-notes") || "[]"); } catch (e) { return []; }
    }
    var noteMarkers = [];
    function drawNoteMarkers() {
        noteMarkers.forEach(function (m) { m.remove(); });
        noteMarkers = (hike.notes || []).map(function (n) {
            var el = document.createElement("div");
            el.className = "noteMark";
            el.textContent = n.photo ? "📷" : "📝";
            el.title = n.text || "사진";
            return marker(el, [n.lon, n.lat], "bottom");
        });
    }

    var noteFile = null;
    $("noteBtn").addEventListener("click", function () {
        var f = hike.fix;
        if (!f) { toast("아직 위치를 받지 못했습니다. GPS 를 잡은 뒤 다시 누르세요.", 4000); return; }
        noteFile = null;
        $("noteText").value = "";
        $("notePreview").style.display = "none";
        $("noteWhere").textContent = "지금 자리 · " + clock(now()) + (c ? " · " + km(hike.d) + "km 지점" : "") + (f.acc != null ? " · 오차 ±" + Math.round(f.acc) + "m" : "");
        $("noteSheet").style.display = "flex";
    });
    $("notePhotoBtn").addEventListener("click", function () { $("notePhoto").value = ""; $("notePhoto").click(); });
    $("notePhoto").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        noteFile = f;
        var pv = $("notePreview");
        if (pv.src) URL.revokeObjectURL(pv.src);
        pv.src = URL.createObjectURL(f);
        pv.style.display = "block";
    });
    $("noteCancel").addEventListener("click", function () { $("noteSheet").style.display = "none"; });
    $("noteSave").addEventListener("click", function () {
        var f = hike.fix, text = $("noteText").value.trim();
        if (!f) return;
        if (!text && !noteFile) { toast("메모를 쓰거나 사진을 고르세요.", 3000); return; }
        // 해발: 코스 위면 코스 고도(GPS 고도는 흔들림 - README), 벗어나 있으면 GPS 고도
        var at = c && hike.off <= OFF_ROUTE_M ? RF.at(c, hike.d) : null;
        var ele = at && at.ele != null ? at.ele : f.alt;
        var note = { t: now(), lat: Math.round(f.lat * 1e6) / 1e6, lon: Math.round(f.lon * 1e6) / 1e6,
                     ele: ele != null ? Math.round(ele) : null, text: text || null, photo: null };
        var btn = $("noteSave");
        btn.disabled = true;
        (noteFile ? shrinkPhoto(noteFile).then(function (blob) {
            note.photo = "p" + note.t.toString(36) + Math.random().toString(36).slice(2, 6);
            return photoPut(note.photo, blob);
        }) : Promise.resolve()).then(function () {
            hike.notes.push(note);
            if (!hike.sim) try { localStorage.setItem(saveKey() + "-notes", JSON.stringify(hike.notes)); } catch (e) { /* 공간 부족 - 이번 산행 동안은 화면에 남음 */ }
            drawNoteMarkers();
            $("noteSheet").style.display = "none";
            toast((note.photo ? "📷 사진" : "📝 메모") + "을 남겼습니다(" + hike.notes.length + "개).", 2500);
        }).catch(function (e) {
            toast("남기지 못했습니다: " + (e && e.message || e), 5000);
        }).then(function () { btn.disabled = false; });
    });

    /** 기록 하나의 사진 · 메모 보기. 사진을 누르면 크게(새 창). */
    function showNotes(rec) {
        var box = $("notesList"), urls = [];
        box.innerHTML = "";
        $("notesTitle").textContent = "📝 " + rec.name;
        rec.notes.forEach(function (n) {
            var row = document.createElement("div"), t = document.createElement("div"), sm = document.createElement("small");
            row.className = "noteRow";
            t.className = "nt";
            sm.textContent = clock(n.t) + (n.ele != null ? " · 해발 " + num(n.ele) + "m" : "");
            t.appendChild(sm);
            t.appendChild(document.createTextNode(n.text || ""));
            if (n.photo) {
                var img = document.createElement("img");
                img.alt = "사진";
                row.appendChild(img);
                photoGet(n.photo).then(function (blob) {
                    if (!blob) { img.alt = "(사진 없음)"; return; }
                    var u = URL.createObjectURL(blob);
                    urls.push(u);
                    img.src = u;
                    img.onclick = function () { window.open(u, "_blank"); };
                }).catch(function () { img.alt = "(사진을 읽지 못함)"; });
            }
            row.appendChild(t);
            box.appendChild(row);
        });
        $("notesClose").onclick = function () {
            $("notesSheet").style.display = "none";
            urls.forEach(function (u) { URL.revokeObjectURL(u); });
        };
        $("notesSheet").style.display = "flex";
    }

    // ------------------------------------------------------------------ 산행

    var SAFETY_KEY = "rf-safety-ok-v1";   // 안전 · 위치 안내를 읽었는지(내용을 크게 바꾸면 v2 로)

    function safetyOk() {
        try { return localStorage.getItem(SAFETY_KEY) === "1"; } catch (e) { return false; }
    }

    /** 실제 산행을 처음 시작할 때 안전 · 위치 안내를 보여 주고, 확인하면 시작합니다. */
    function askSafety(then) {
        var box = $("safety");
        box.style.display = "flex";
        $("safetyChk").checked = false;
        $("safetyGo").disabled = true;
        $("safetyGo").onclick = function () {
            try { localStorage.setItem(SAFETY_KEY, "1"); } catch (e) { /* 저장 못 하면 다음에 다시 물음 */ }
            box.style.display = "none";
            then();
        };
        $("safetyNo").onclick = function () { box.style.display = "none"; };
    }

    function start(sim) {
        if (!c) return;
        if (!sim && !safetyOk()) { askSafety(function () { start(false); }); return; }
        if (!sim && !BG && !navigator.geolocation) { toast("이 기기는 위치(GPS)를 쓸 수 없습니다."); return; }
        if (!sim && !BG && !window.isSecureContext) {
            toast("GPS 는 https 주소에서만 켜집니다. 지금은 \"시험 걷기\" 로 화면을 시험해 보세요.", 6000);
            return;
        }
        var saved = sim ? null : loadSaved();
        setCompact(false);   // 시작할 때는 기록 칸을 펼쳐서(아래로 밀면 접힘)
        hike.sim = sim;
        hike.running = true;
        hike.arrived = false;
        hike.hist = [];
        hike.speed = null;
        hike.simClock = Date.now();
        hike.start = saved ? saved.start : now();
        hike.d = saved ? saved.d : 0;
        hike.track = saved ? loadTrack() : [];
        hike.notes = saved ? loadNotes() : [];
        hike.walked = saved && saved.walked ? saved.walked : 0;
        hike.alerted = {};
        hike.sunWarned = false;
        hike.passed = {};
        hike.wasOff = false;
        hike.d0 = saved && saved.d0 != null ? saved.d0 : null;   // 첫 위치가 코스 위일 때 정합니다(코스 중간에서 시작하면 그 자리)
        hike.dMax = saved && saved.dMax != null ? saved.dMax : hike.d;
        hike.base = saved && saved.base ? saved.base : null;
        hike.segT0 = saved && saved.segT0 ? saved.segT0 : hike.start;
        hike.branch = null;
        hike.kmSpoken = Math.floor(hike.d / (K() === RF.KINDS.bike ? 5000 : 1000));
        voice.last = {};
        // 시작 버튼을 누른 그 순간에 말해야 아이폰도 소리를 냅니다(사용자 동작 안에서 처음 말하기)
        say(saved ? "이어서 안내합니다. 남은 거리 " + skm(Math.max(0, c.total - hike.d)) + "킬로미터."
            : spokenName(c.course.name) + " 안내를 시작합니다. 전체 " + skm(c.total) + "킬로미터, 예상 "
                + spokenTime(RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0))) + ".", { urgent: true });
        $("save").style.display = "none";
        setFollow(true);
        $("go").textContent = sim ? "시험 걷기 끝내기" : K().act + " 끝내기";
        $("go").classList.add("stop");
        $("sim").style.display = "none";
        $("share").style.display = "none";
        $("arrived").style.display = "none";
        $("noteBtn").style.display = sim ? "none" : "block";   // 시험 걷기는 기록이 남지 않아 사진 · 메모도 받지 않습니다
        drawNoteMarkers();
        if (sim) {
            hike.simD = 0;
            hike.simLast = performance.now();
            $("gps").textContent = SIM_X === 1 ? "시험 걷기" : "시험 " + SIM_X + "배속";
            $("gps").className = "";
            hike.simTimer = setInterval(simStep, 500);
            simStep();
        } else if (BG) {
            // 앱 - 화면을 끄거나 다른 앱으로 가도 위치를 받습니다(알림창에 "따라가는 중"이 떠 있는 동안)
            $("gps").textContent = "GPS 찾는 중…";
            $("gps").className = "";
            BG.addWatcher({ backgroundTitle: "routefly - " + K().act + " 중",
                            backgroundMessage: "화면을 꺼도 위치를 기록하고 갈림길 · 코스 이탈을 알려 줍니다.",
                            requestPermissions: true, stale: false, distanceFilter: batterySave ? 10 : 3 },
                function (loc, err) {
                    if (err) {
                        if (err.code === "NOT_AUTHORIZED" && confirm("위치 권한이 꺼져 있습니다. 설정을 열어 routefly 의 위치를 '앱 사용 중에만 허용' 으로 바꿀까요?")) {
                            BG.openSettings();
                        }
                        onGpsError({ code: err.code === "NOT_AUTHORIZED" ? 1 : 2 });
                        return;
                    }
                    if (loc) onFix({ timestamp: loc.time, coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy,
                                                                altitude: loc.altitude, speed: loc.speed, heading: loc.bearing } });
                }).then(function (id) {
                    if (hike.running && !hike.sim) hike.bgWatch = id;
                    else BG.removeWatcher({ id: id });   // 그 사이 끝냈으면
                });
            // 2026-10-08 (홍TV님 - 배터리): 앱은 화면을 꺼도 위치 · 음성 안내가 이어지므로 화면을 켜 두지 않습니다(Wake Lock 안 함).
            // 화면이 가장 큰 배터리 소비라, 주머니에 넣고 다니라고 한 번 알립니다. 브라우저는 화면이 꺼지면 멈추므로 아래처럼 켜 둡니다.
            toast("화면을 꺼도 기록 · 갈림길 · 코스 이탈 음성 안내가 이어집니다. 배터리를 아끼려면 화면을 꺼 두세요."
                + (batterySave ? " (배터리 절약 켬)" : " 위쪽 GPS 글자를 누르면 배터리 절약 모드."), 7000);
        } else {
            $("gps").textContent = "GPS 찾는 중…";
            $("gps").className = "";
            hike.watch = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
            keepAwake();
        }
        hike.timer = setInterval(render, 1000);
        render();
    }

    /** 끝내기 확인 - 기록은 지우지 않고 "내 기록" 에 남깁니다(finishRecord). */
    function askStop() {
        if (!hike.running) return;
        if (hike.sim) { stopHike(); return; }
        $("endTitle").textContent = K().act + "을 여기서 끝낼까요?";
        $("endSheet").style.display = "flex";
    }

    function stopHike() {
        if (!hike.running) return;
        hike.running = false;
        stopTalking();
        if (hike.watch != null) navigator.geolocation.clearWatch(hike.watch);
        if (hike.bgWatch != null && BG) BG.removeWatcher({ id: hike.bgWatch }).catch(function () { /* 이미 멈춤 */ });
        hike.bgWatch = null;
        hike.watch = null;
        clearInterval(hike.timer);
        clearInterval(hike.simTimer);
        if (hike.wake) { try { hike.wake.release(); } catch (e) { /* 무시 */ } hike.wake = null; }
        var wasSim = hike.sim;
        if (!wasSim) {
            finishRecord();
            clearSaved();
        }
        hike.sim = false;
        compassOff();   // 2026-10-10 점검: 다 걸은 뒤에도 센서를 계속 받던 것
        $("go").textContent = K().act + " 시작";
        $("go").classList.remove("stop");
        $("sim").style.display = "";
        $("save").style.display = "";
        $("share").style.display = isGpxId(c.id) ? "none" : "";
        $("turn").style.display = "none";
        $("noteBtn").style.display = "none";
        hike.notes = [];
        drawNoteMarkers();
        map.getSource("guide").setData({ type: "FeatureCollection", features: [] });
        hike.guideShown = false;
        $("gps").textContent = "GPS 꺼짐";
        $("gps").className = "";
        $("offroute").style.display = "none";
    }

    /** 화면이 꺼지지 않게(지원하는 브라우저에서). 다른 앱에 갔다 오면 다시 겁니다. */
    function keepAwake() {
        if (!("wakeLock" in navigator)) return;
        navigator.wakeLock.request("screen").then(function (w) { hike.wake = w; }).catch(function () { /* 배터리 절약 모드 등 */ });
    }
    // 2026-10-09 (카카오톡 브라우저에 며칠 전 화면이 남아 'GPX 열기' 가 안 보였음) → 2026-10-10 새로 배포되면 '새 버전' 띠만 띄우고
    // 누를 때 새로 고침(저절로 고치지 않음). 걷는 중에는 띠도 띄우지 않고 끝낸 뒤에.
    RF.notifyDeploy(["hike.html", "js/hike.js", "js/course-kit.js", "css/course-kit.css"], function () { return !hike.running; });
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden" && hike.running) flushTrack();   // 앱이 닫히기 전에 걸은 길을 남김
        if (compass.on) compassListen(document.visibilityState === "visible");   // 안 보이는 동안 나침반 센서를 놓음
        if (document.visibilityState === "visible" && hike.running && !hike.sim && !BG) keepAwake();   // 앱은 화면을 켜 두지 않음(위 start)
    });

    function onGpsError(e) {
        $("gps").className = "bad";
        $("gps").textContent = e.code === 1 ? "위치 권한 없음" : "GPS 신호 없음";
        if (e.code === 1) toast("위치 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.", 7000);
    }

    /** 위치 한 번 - 코스에 맞추고 화면을 고칩니다. */
    function onFix(pos) {
        if (!c || !hike.running) return;
        var co = pos.coords, t = pos.timestamp || now();
        var acc = co.accuracy;
        if (!hike.sim) {
            $("gps").className = acc != null && acc <= 30 ? "ok" : "";
            $("gps").textContent = "GPS ±" + (acc == null ? "?" : Math.round(acc)) + "m";
            if (acc != null && acc > 100) return;   // 너무 부정확한 위치는 쓰지 않습니다(실내 · 계곡 첫 신호)
        }
        hike.fix = { lat: co.latitude, lon: co.longitude, acc: acc, alt: co.altitude, t: t };
        addTrack(co.latitude, co.longitude, t, co.altitude);
        var s = RF.snap(c, co.latitude, co.longitude, hike.lastFix ? hike.d : null);
        hike.lastFix = t;
        hike.off = s.off;
        if (s.off <= OFF_ROUTE_M * 2) {   // 코스에서 아주 멀면 진행 거리는 그대로 둡니다
            // 송산: 시작 버튼을 누른 뒤 코스 0.86km 지점으로 들어갔는데 0 부터 걸은 것으로 쳐서 3분 만에 81kcal · 1,353보
            if (hike.d0 == null) hike.d0 = s.d;
            hike.d = s.d;
            hike.dMax = Math.max(hike.dMax || 0, s.d);
        }
        // 빠르기 - GPS 가 주면 그것, 아니면 최근 1분 이동 거리로
        hike.hist.push({ t: t, lat: co.latitude, lon: co.longitude });
        while (hike.hist.length > 2 && t - hike.hist[0].t > 60000) hike.hist.shift();
        var v = co.speed;
        if (v == null || !isFinite(v)) {
            var h0 = hike.hist[0], dt = (t - h0.t) / 1000;
            v = dt >= 10 ? distM(h0.lat, h0.lon, co.latitude, co.longitude) / dt : null;
        }
        if (v != null) hike.speed = hike.speed == null ? v : hike.speed * 0.7 + v * 0.3;
        setMe(co.latitude, co.longitude, co.heading);
        if (hike.follow) map.easeTo({ center: [co.longitude, co.latitude], zoom: Math.max(map.getZoom(), 15), duration: 600 });
        // 코스를 따라 되돌아가면(올라가다 내려옴) 거꾸로 된 코스로 - "벗어났다" 대신 내려가는 길 안내
        if (!hike.sim && s.off <= OFF_ROUTE_M && hike.dMax - hike.d >= TURN_BACK_M) {
            adoptCourse(RF.reverseCourse(c), "되돌아가는 길로 안내를 바꿨습니다.");
            s = { d: hike.d, off: hike.off };
        }
        checkBranch(co.latitude, co.longitude, s);
        if (!hike.arrived && c.total - hike.d <= ARRIVE_M && s.off <= OFF_ROUTE_M) {
            hike.arrived = true;
            var endPoi = c.pois.filter(function (q) { return +q.dist_m > c.total - 60 && +q.off_route_m < 60; }).pop();
            $("arrived").textContent = "🎉 " + (endPoi ? endPoi.name + " " : "") + "도착! " + km(c.total) + "km · " + hhmmss(now() - hike.start);
            $("arrived").style.display = "block";
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            say((endPoi ? endPoi.name + " " : "") + "도착입니다. " + skm(c.total) + "킬로미터, " + spokenTime(now() - hike.start)
                + ", 약 " + num(effort().kcal) + "킬로칼로리. 수고하셨습니다.",
                { urgent: true });
        }
        checkJunction();
        voiceProgress();
        save();
        render();
    }

    /**
     * 갈림길에서 코스가 아닌 다른 길(주변 코스)로 들어섰는지. 들어설 때 한 번 알리고(빨간 띠 · 음성 - render),
     * 그 길로 BRANCH_SWITCH_M 더 가면 그 길을 새 코스로 바꿉니다(가는 쪽으로 뒤집어서).
     */
    function checkBranch(lat, lon, s) {
        if (hike.sim || s.off <= 40 || s.off > FAR_M) { hike.branch = null; return; }
        var cur = hike.branch, pick = null;
        trails.forEach(function (t) {
            if (!t.id) return;
            var st = RF.snap(t, lat, lon, cur && cur.id === t.id ? cur.lastD : null);
            if (st.off > BRANCH_ON_M) return;
            // 같은 길을 쓰는 코스가 여럿이면 하던 것을 그대로(번갈아 바뀌면 거리를 못 셉니다)
            var keep = cur && cur.id === t.id;
            if (!pick || keep || (!pick.keep && st.off < pick.st.off - 3)) {
                if (!pick || !pick.keep) pick = { t: t, st: st, keep: keep };
            }
        });
        if (!pick) { hike.branch = null; return; }
        if (!cur || cur.id !== pick.t.id) {
            hike.branch = { id: pick.t.id, name: pick.t.name, d0: pick.st.d, lastD: pick.st.d, loading: false };
            return;
        }
        cur.lastD = pick.st.d;
        if (!cur.loading && Math.abs(pick.st.d - cur.d0) >= BRANCH_SWITCH_M) {
            cur.loading = true;
            var back = pick.st.d < cur.d0;   // 그 코스를 거꾸로 걷는 중
            getJson("api/course?id=" + encodeURIComponent(cur.id)).then(function (j) {
                if (!hike.running || hike.branch !== cur) return;
                var nc = RF.fromApi(cur.id, j);
                if (nc.lon.length < 2) throw new Error("경로 점 없음");
                adoptCourse(back ? RF.reverseCourse(nc) : nc, "가시는 길로 코스를 바꿨습니다.");
            }).catch(function () { cur.loading = false; });
        }
    }

    /** 걷는 중에 코스를 바꿉니다(거꾸로 · 다른 길). 걸은 길 · 시간은 그대로, 칼로리 등은 지금까지 한 것에 이어 셉니다. */
    function adoptCourse(nc, msg) {
        var sg = segEffort(), b = hike.base || { dist: 0, up: 0, down: 0 };
        hike.base = { dist: b.dist + sg.dist, up: b.up + sg.up, down: b.down + sg.down };
        var track = hike.track;
        clearSaved();   // 예전 코스 이름으로 남긴 것
        c = nc;
        var f = hike.fix, s = f ? RF.snap(c, f.lat, f.lon, null) : { d: 0, off: 0 };
        hike.d = s.d;
        hike.off = s.off;
        hike.d0 = s.d;
        hike.dMax = s.d;
        hike.segT0 = now();
        hike.passed = {};
        hike.alerted = {};
        hike.arrived = false;
        hike.branch = null;
        hike.wasOff = false;
        hike.guideBr = null;
        hike.kmSpoken = Math.floor(s.d / (K() === RF.KINDS.bike ? 5000 : 1000));
        voice.last = {};
        $("arrived").style.display = "none";
        $("offroute").style.display = "none";
        RF.showName($("name"), c.course.name);
        document.title = RF.nameText(c.course.name) + " - routefly";
        try { history.replaceState(null, "", "#c=" + encodeURIComponent(c.id)); } catch (e) { /* 주소만 못 바꿈 */ }   // 새로 고침하면 이 코스로 이어서
        drawCourse(true);
        prof = RF.profile($("profile"), c, {});
        try {
            localStorage.setItem(saveKey() + "-track", JSON.stringify(track));
            // 2026-10-09 점검: 사진 · 메모도 새 이름으로 다시 남깁니다(clearSaved 가 지워 다시 열면 메모가 사라졌음)
            if (hike.notes.length && !hike.sim) localStorage.setItem(saveKey() + "-notes", JSON.stringify(hike.notes));
        } catch (e) { /* 공간 부족 */ }
        save();
        var end = c.course.name.split(" → ").pop();
        toast("🔀 " + msg + "\n" + c.course.name, 6000);
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
        say(msg + " " + spokenName(end) + "까지 " + skm(Math.max(0, c.total - hike.d)) + "킬로미터입니다.", { urgent: true });
        render();
    }

    /** 갈림길 80m 앞이면 한 번 알립니다(진동 + 파란 띠) - "40m 앞 갈림길 · 오른쪽 길". */
    function checkJunction() {
        var box = $("turn");
        if (hike.off > OFF_ROUTE_M) { box.style.display = "none"; return; }
        var next = null;
        (c.junctions || []).forEach(function (jd) { if (jd > hike.d - 15 && (next == null || jd < next)) next = jd; });
        if (next == null || next - hike.d > 80) { box.style.display = "none"; return; }
        var ahead = Math.max(0, Math.round(next - hike.d));
        box.textContent = "🔀 " + (ahead < 15 ? "갈림길" : ahead + "m 앞 갈림길") + " · " + RF.turnWord(c, next);
        box.style.display = "block";
        if (!hike.alerted[next]) {
            hike.alerted[next] = true;
            if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
            var w = RF.turnWord(c, next);
            say((ahead < 15 ? "갈림길입니다. " : ahead + "미터 앞 갈림길, ") + w + (/길$/.test(w) ? "입니다." : "하세요."), { urgent: true });
        }
    }

    /** 모의 산행 - 코스를 따라 걷는 위치를 만들어 onFix 에 넣습니다(약간 흔들리게). */
    function simStep() {
        var nowP = performance.now(), dtReal = nowP - hike.simLast;
        hike.simLast = nowP;
        hike.simClock += dtReal * SIM_X;
        hike.simD = Math.min(c.total, hike.simD + K().simKmh / 3.6 * dtReal / 1000 * SIM_X);
        var p = RF.at(c, hike.simD), q = RF.at(c, Math.min(c.total, hike.simD + 20));
        var jitter = 4 / 111320;
        onFix({ timestamp: hike.simClock, coords: {
            latitude: p.lat + (Math.random() - 0.5) * jitter, longitude: p.lon + (Math.random() - 0.5) * jitter,
            accuracy: 6, speed: K().simKmh / 3.6, heading: bearing(p.lat, p.lon, q.lat, q.lon) } });
        if (hike.simD >= c.total) clearInterval(hike.simTimer);
    }

    // ------------------------------------------------------------------ ② 산행 기록

    function setV(id, text, unit) {
        $(id).innerHTML = "";
        $(id).appendChild(document.createTextNode(text));
        if (unit) {
            var s = document.createElement("small");
            s.textContent = unit;
            $(id).appendChild(s);
        }
    }

    /**
     * 남은 시간(ms) - 표준 산행 시간(평지 4km/h + 오르막 600m/h, 네이스미스 규칙)에
     * 지금까지 걸은 빠르기 비율을 곱합니다(10분 넘게 걸은 뒤부터, 0.6~2.5배).
     */
    function remainingMs(elapsed) {
        var std = function (distM, ascM) { return RF.standardMs(c.course.kind, distM, ascM); };
        var left = std(c.total - hike.d, RF.ascentLeft(c, hike.d));
        var factor = 1;
        // 빠르기 비율은 지금 코스에서 걸은 만큼으로(코스를 바꾼 뒤에도 맞게)
        var d0 = hike.d0 == null ? hike.d : Math.min(hike.d0, hike.d);
        var doneStd = std(hike.d - d0, RF.ascentLeft(c, d0) - RF.ascentLeft(c, hike.d));
        var segEl = hike.running && hike.segT0 ? now() - hike.segT0 : elapsed;
        if (segEl > 600000 && doneStd > 300000) factor = Math.max(0.6, Math.min(2.5, segEl / doneStd));
        return left * factor;
    }

    function render() {
        if (!c) return;
        var d = hike.d, p = RF.at(c, d), g = RF.grade(c, d);
        setV("sDone", km(d), "km");
        setV("sLeft", km(Math.max(0, c.total - d)), "km");
        setV("sEle", p.ele == null ? "-" : num(p.ele), "m");
        setV("sGrade", g == null ? "-" : (g > 0 ? "↗ " : g < 0 ? "↘ " : "") + num(Math.abs(g)), "%");
        setV("sSpeed", hike.speed == null || !hike.running ? "-" : num(hike.speed * 3.6, 1), "km/h");
        var elapsed = hike.running ? now() - hike.start : 0;
        setV("sTime", hhmmss(elapsed));
        setV("sAsc", num(RF.ascentLeft(c, d)), "m");
        var ef = effort(), bike = K() === RF.KINDS.bike;
        setV("sKcal", num(ef.kcal), "kcal");
        setV("sUp", num(ef.up), "m");
        $("stepsBox").style.display = bike ? "none" : "";
        if (!bike) setV("sSteps", num(ef.steps), "보");
        setLabel("kcalK", "칼로리 ", body.kg + "kg ✎");
        setLabel("stepsK", "걸음 ", body.cm + "cm ✎");
        var nowMs = hike.running ? now() : Date.now();
        var sun = RF.sunset(nowMs, c.lat[0], c.lon[0]);
        $("sunTxt").textContent = sun ? "· 일몰 " + clock(sun) : "";
        $("etaBox").classList.remove("late");
        if (d >= c.total - ARRIVE_M) setV("sEta", "도착");
        else {
            var rem = remainingMs(elapsed), eta = nowMs + rem;
            setV("sEta", clock(eta), " (" + RF.hm(rem, true) + ")");
            // 해 지기 30분 전까지 못 닿을 것 같으면 빨갛게 + 한 번 알림
            if (sun && eta > sun - 1800000) {
                $("etaBox").classList.add("late");
                if (hike.running && !hike.sunWarned) {
                    hike.sunWarned = true;
                    toast("⚠ 예상 도착이 해 지기 30분 전(" + clock(sun - 1800000) + ")보다 늦습니다. 일찍 돌아서는 것도 생각하세요.", 8000);
                    say("주의하세요. 예상 도착이 해 지기 30분 전보다 늦습니다. 일찍 돌아서는 것도 생각하세요.", { urgent: true });
                    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
                }
            }
        }
        var nx = RF.nextPoi(c, d);
        if (nx) {
            var np = RF.at(c, +nx.dist_m);
            var dEle = np.ele != null && p.ele != null ? np.ele - p.ele : null;
            $("next").innerHTML = "";
            $("next").appendChild(document.createTextNode("다음 지점 "));
            var b = document.createElement("b");
            b.textContent = nx.name;
            $("next").appendChild(b);
            $("next").appendChild(document.createTextNode(" · " + km(+nx.dist_m - d) + "km 앞"
                + (dEle == null ? "" : " · " + (dEle >= 0 ? "오르막 +" : "내리막 ") + num(dEle) + "m")));
        } else {
            $("next").textContent = "다음 지점 없음 - 도착까지 " + km(Math.max(0, c.total - d)) + "km";
        }
        // 코스에서 벗어남 - 가장 가까운 등산로(지금 코스 · 주변 길)까지 거리 · 방향, 지도에 점선
        if (hike.running && hike.off > OFF_ROUTE_M && hike.fix) {
            var me = hike.fix, nt, br, far = hike.off > FAR_M;
            if (far !== hike.farMode) {   // 멀리 ↔ 코스 근처로 바뀌면 그 상황 안내를 바로 다시
                hike.farMode = far;
                hike.wasOff = false;
                voice.last.off = 0;
            }
            // 아직 코스에 닿기 전이고 멀면(먼 산 · 차로 가야 할 때) 출발점 길찾기 단추
            var notYet = hike.d0 == null || hike.d <= 60;
            hike.navTo = far || (notYet && hike.off > 100)   // 주차장 · 정류장(들머리 100m 밖)부터
                ? (notYet ? { lat: c.lat[0], lon: c.lon[0], name: startName() || "코스 출발점", head: true }
                          : { lat: RF.at(c, hike.d).lat, lon: RF.at(c, hike.d).lon, name: "코스 마지막 자리" })
                : null;
            $("navBtn").style.display = hike.navTo ? "inline-block" : "none";
            // 3km 안이면 걷기 길찾기(네이버 지도 앱은 실제 길을 따라 걷기 경로) - 주차장 · 정류장에서 들머리까지
            var nearNav = hike.navTo && !far && hike.fix && distM(hike.fix.lat, hike.fix.lon, hike.navTo.lat, hike.navTo.lon) <= 3000;
            $("navBtn").textContent = hike.navTo && !notYet ? (nearNav ? "🚶 코스로 돌아가는 걷기 길찾기" : "🚗 코스로 돌아가는 길찾기")
                : nearNav ? "🚶 들머리 걷기 길찾기" : "🚗 출발점 길찾기";
            if (far) {
                // 아주 멀리(집 · 차로 이동 중 등) - 주변 길 말고, 아직 출발 전이면 출발점, 가던 중이면 마지막으로 있던 코스 자리로
                var tp = RF.at(c, hike.d <= 60 ? 0 : hike.d), sp = hike.d <= 60 ? startName() : null;
                nt = { lat: tp.lat, lon: tp.lon, off: distM(me.lat, me.lon, tp.lat, tp.lon) };
                br = bearing(me.lat, me.lon, nt.lat, nt.lon);
                $("offText").textContent = hike.d <= 60
                    ? "코스 출발점" + (sp ? "(" + sp + ")" : "") + "까지 " + distText(nt.off) + " · " + dirWord(br) + ". 출발점에 가면 안내가 시작됩니다."
                    : "코스에서 " + distText(hike.off) + " 떨어져 있습니다 · 마지막 자리까지 " + distText(nt.off) + " · " + dirWord(br);
                say(hike.d <= 60 ? "코스 출발점까지 " + distSpoken(nt.off) + " 남았습니다. 출발점에 가면 안내를 시작합니다."
                                 : "코스에서 " + distSpoken(hike.off) + " 떨어져 있습니다.", { key: "off", gap: 600000 });
            } else {
                nt = nearestTrail(me.lat, me.lon);
                if (hike.branch) {   // 다른 길 위 - 코스 쪽을 가리키고, 계속 가면 바꾼다고 한 번 알림
                    var cs = RF.snap(c, me.lat, me.lon, null), cp = RF.at(c, cs.d);
                    nt = { lat: cp.lat, lon: cp.lon, off: cs.off, course: true };
                }
                // 아직 코스에 닿기 전 - 주차장 · 정류장에서 들머리까지 걷기 안내(코스 중간이 훨씬 가까우면 거기로)
                var toHead = false;
                if (notYet && !hike.branch) {
                    var h0 = RF.at(c, 0), dHead = distM(me.lat, me.lon, h0.lat, h0.lon);
                    if (!(nt.course && nt.off < dHead / 3)) { nt = { lat: h0.lat, lon: h0.lon, off: dHead, course: true }; toHead = true; }
                }
                br = bearing(me.lat, me.lon, nt.lat, nt.lon);
                if (toHead) {
                    var hn = startName();
                    $("offText").textContent = (hn ? "들머리(" + hn + ")" : "코스 출발점") + "까지 " + distText(nt.off) + " · " + dirWord(br)
                        + ". 도착하면 안내가 시작됩니다.";
                    say((hn ? spokenName(hn) : "코스 출발점") + "까지 " + dirWord(br) + " " + distSpoken(nt.off) + "입니다.", { key: "off", gap: 300000 });
                } else if (hike.branch) {
                    $("offText").textContent = "코스가 아닌 다른 길로 들어섰습니다 · 코스는 " + dirWord(br) + " " + distText(nt.off)
                        + ". 이 길로 계속 가면 이 길로 코스를 바꿉니다.";
                    say("코스가 아닌 다른 길로 들어섰습니다. 코스는 " + dirWord(br) + " " + distSpoken(nt.off) + "입니다. 이 길로 계속 가시면 코스를 바꿉니다.",
                        { key: "branch", gap: 600000, urgent: true });
                } else if (notYet && nt.course) {   // 아직 코스에 닿기 전(벗어난 것이 아님)
                    $("offText").textContent = "아직 코스 밖입니다 · 코스까지 " + distText(nt.off) + " · " + dirWord(br);
                    say("코스까지 " + dirWord(br) + " " + distSpoken(nt.off) + "입니다.", { key: "off", gap: 300000 });
                } else {
                    $("offText").textContent = "코스에서 " + distText(hike.off) + " 벗어남 · "
                        + (nt.course ? "코스로 돌아가는 길 " : (nt.name ? "가장 가까운 길(" + nt.name + ")" : "가장 가까운 등산로") + "까지 ")
                        + distText(nt.off) + " · " + dirWord(br);
                    // 벗어난 순간 한 번, 계속 벗어나 있으면 2분마다
                    say("코스에서 벗어났습니다. " + (nt.course ? "코스는 " : "가장 가까운 길은 ") + dirWord(br) + " " + distSpoken(nt.off) + "입니다.",
                        { key: "off", gap: hike.wasOff ? 120000 : 0, urgent: !hike.wasOff });
                }
            }
            // 화살표: 나침반이 있으면 핸드폰 위쪽 기준(그쪽으로 몸을 돌려 걷게), 없으면 지도(북쪽 위) 기준
            hike.guideBr = br;
            turnGuideArrow();
            $("offroute").style.display = "flex";
            hike.wasOff = true;
            hike.guideShown = true;
            map.getSource("guide").setData({ type: "Feature", properties: {},
                geometry: { type: "LineString", coordinates: [[me.lon, me.lat], [nt.lon, nt.lat]] } });
        } else {
            if (hike.running && hike.wasOff && hike.off <= OFF_ROUTE_M) {
                hike.wasOff = false;
                voice.last.off = 0;
                say("코스로 돌아왔습니다.", { urgent: true });
            }
            $("offroute").style.display = "none";
            hike.guideBr = null;
            // 2026-10-10 점검: 매초 빈 자료를 다시 넣던 것 - 안내선을 그려 둔 때(guideShown)에만 지웁니다
            if (hike.guideShown && map.getSource("guide")) {
                map.getSource("guide").setData({ type: "FeatureCollection", features: [] });
                hike.guideShown = false;
            }
        }
        if (prof) prof.set(d);
        if (map.getLayer("route-done")) map.setPaintProperty("route-done", "line-gradient", progressGradient(d / c.total));
    }

    // ------------------------------------------------------------------ 코스 고르기

    // 미리보기 화면에서 '← 뒤로' 로 돌아왔을 때 브라우저가 이 화면을 그대로 살리면(bfcache) 검색어를 다시 맞춥니다
    window.addEventListener("pageshow", function (e) {
        if (e.persisted && $("pick").style.display !== "none" && !hike.running) showPick();
    });

    function showPick(noRestore) {
        $("pick").style.display = "flex";
        // 목록이 비었거나(이 화면을 새로 열었을 때) 미리보기 화면에서 다른 말로 찾고 왔으면 마지막 검색을 다시
        if (!noRestore) {
            var last = null;
            try { last = JSON.parse(localStorage.getItem(SEARCH_KEY) || "null"); } catch (e) { /* 없음 */ }
            // 2026-10-10 점검: 검색어 없이 종류 탭만 바꾸고 왔을 때도 탭을 맞춥니다(app.js readSharedSearch 와 같음)
            var lastKind = last ? last.kind || "" : "";
            var kindChanged = last && lastKind !== (kindFilter || "");
            var changed = last && last.q && (last.q !== $("q").value.trim() || kindChanged);
            if (last && last.q && (changed || !$("pickList").querySelector(".it"))) {
                $("q").value = last.q;
                var tab = document.querySelector('#kindTabs button[data-kind="' + lastKind + '"]');
                if (tab) tab.click(); else { var ev = document.createEvent("Event"); ev.initEvent("input", true, true); $("q").dispatchEvent(ev); }
            } else if (kindChanged) {
                var kt = document.querySelector('#kindTabs button[data-kind="' + lastKind + '"]');
                if (kt) kt.click();
            }
        }
    }

    /**
     * 길찾기 - 지금 위치 → 출발점을 지도 앱으로(카카오맵 · 네이버 지도 앱 · 구글 지도). 3km 넘으면 차, 아니면 걷기.
     * 앱(안드로이드)에서는 바깥 주소를 그 앱 · 브라우저로 엽니다(Capacitor).
     */
    /** 들머리 가는 길 이름표(배치가 들머리 1km 안에서 넣은 주차장 하나 · 정류장 둘) - 출발 쪽 것만. */
    function accessOf() {
        var out = { parking: null, buses: [] };
        (c ? c.pois : []).forEach(function (p) {
            if (!RF.isAccess(p) || +p.dist_m > 300) return;   // 끝(내려오는 들머리) 쪽 것은 빼고
            if (/주차장/.test(p.name) && !out.parking) out.parking = p;
            else if (/(정류장|정류소)$/.test(p.name)) out.buses.push(p);
        });
        return out;
    }

    function openNav() {
        if (!hike.navTo) return;
        // 차로 가야 할 만큼 멀고 들머리 근처 주차장이 있으면 주차장이 먼저(차는 들머리까지 못 들어감)
        var acc = hike.navTo.head ? accessOf() : { parking: null, buses: [] }, me0 = hike.fix;
        var farHead = me0 ? distM(me0.lat, me0.lon, hike.navTo.lat, hike.navTo.lon) > 3000 : true;
        var targets = [hike.navTo];
        if (acc.parking) {
            var pk = { lat: +acc.parking.lat, lon: +acc.parking.lon, name: acc.parking.name, parking: true };
            targets = farHead ? [pk, hike.navTo] : [hike.navTo, pk];
        }
        var box = $("navTargets");
        box.textContent = "";
        targets.forEach(function (t, i) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = (t.parking ? "🅿️ " : "⛰️ ") + t.name;
            b.onclick = function () { navTo(t, acc, b); };
            box.appendChild(b);
            if (i === 0) navTo(t, acc, b);
        });
        box.style.display = targets.length > 1 ? "flex" : "none";
        save();
        $("navSheet").style.display = "flex";
    }

    /** 길찾기 창 - 고른 목적지로 세 지도 앱 주소를 만듭니다. */
    function navTo(to, acc, btn) {
        [].forEach.call($("navTargets").children, function (x) { x.classList.toggle("on", x === btn); });
        var me = hike.fix, far = me ? distM(me.lat, me.lon, to.lat, to.lon) > 3000 : true;
        var nm = String(to.name).replace(/[,/?#&]/g, " ").trim(), lat = to.lat.toFixed(6), lon = to.lon.toFixed(6);
        $("navTitle").textContent = nm + " 길찾기";
        $("navKakao").href = "https://map.kakao.com/link/to/" + encodeURIComponent(nm) + "," + lat + "," + lon;
        // 네이버 지도 앱은 출발지를 비워 두면 '출발지 입력' 으로 남습니다 - 지금 위치를 출발지로 넣습니다
        var from = me ? { lat: me.lat.toFixed(6), lon: me.lon.toFixed(6) } : null;
        $("navNaver").href = "nmap://route/" + (far ? "car" : "walk") + "?"
            + (from ? "slat=" + from.lat + "&slng=" + from.lon + "&sname=" + encodeURIComponent("내 위치") + "&" : "")
            + "dlat=" + lat + "&dlng=" + lon + "&dname=" + encodeURIComponent(nm) + "&appname=" + encodeURIComponent(location.origin);
        // 구글 지도는 우리나라에서 자동차 · 걷기 길찾기를 하지 않습니다('경로를 찾을 수 없음') - 대중교통으로
        $("navGoogle").href = "https://www.google.com/maps/dir/?api=1" + (from ? "&origin=" + from.lat + "," + from.lon : "")
            + "&destination=" + lat + "," + lon + "&travelmode=transit";
        // 카카오톡 안 브라우저는 지도 앱으로 넘어가면 이 화면을 닫기도 합니다 - 다시 열면 이어진다고 알려 둡니다
        var h0 = RF.at(c, 0), walk = to.parking ? distM(to.lat, to.lon, h0.lat, h0.lon) : 0;
        $("navTip").textContent = "지금 위치에서 " + nm + "까지 길을 지도 앱으로 엽니다."
            + (to.parking ? " 주차장에서 들머리까지는 약 " + distText(walk) + " 걸어서 - 이 화면이 들머리까지 안내합니다." : "")
            + (acc.buses.length ? " 가까운 버스 정류장: " + acc.buses.map(function (b) {
                return b.name + "(들머리에서 " + distText(distM(+b.lat, +b.lon, h0.lat, h0.lon)) + ")"; }).join(", ") + "." : "")
            + " 산행 기록은 이 핸드폰에 저장되어 있어, "
            + (/KAKAOTALK/i.test(navigator.userAgent)
                ? "카카오톡 안에서 이 화면이 닫혀도 같은 링크를 다시 열면 그대로 이어집니다."
                : "길찾기 뒤 이 화면으로 돌아오거나 다시 열면 그대로 이어집니다.");
    }
    $("layerBtn").addEventListener("click", function () { setBasemap(basemap === "light" ? "sat" : "light"); });
    $("navBtn").addEventListener("click", openNav);
    $("navClose").addEventListener("click", function () { $("navSheet").style.display = "none"; });
    ["navKakao", "navNaver", "navGoogle"].forEach(function (id) {
        $(id).addEventListener("click", function () { $("navSheet").style.display = "none"; });
    });

    // ‹ - 코스 목록(검색 결과 그대로)으로. 산행 중이면 먼저 끝내도록.
    $("back").addEventListener("click", function (e) {
        e.preventDefault();
        if (hike.running) { toast("산행 중입니다. 코스 목록으로 가려면 먼저 아래 '" + K().act + " 끝내기' 를 눌러 주세요.", 4000); return; }
        if (fromList) { fromList = false; history.back(); }
        else location.hash = "";
    });

    function listCourses(rows, from, note) {
        var box = $("pickList");
        box.textContent = "";
        if (note) {
            var nd = document.createElement("div");
            nd.className = "msg";
            nd.textContent = note;
            box.appendChild(nd);
        }
        if (!rows.length) {
            var m = document.createElement("div");
            m.className = "msg";
            m.textContent = from ? "주변 5km 안에 코스가 없습니다. 산 이름으로 찾아보세요." : "찾은 코스가 없습니다.";
            box.appendChild(m);
            return;
        }
        rows.forEach(function (r) {
            var it = document.createElement("div");
            it.className = "it";
            var b = document.createElement("b");
            RF.showName(b, r.name);
            var s = document.createElement("span");
            s.textContent = km(+r.distance_m) + "km" + (r.ascent_m != null ? " · 오르막 " + num(+r.ascent_m) + "m" : "")
                + (r.ele_max_m != null ? " · 최고 " + num(+r.ele_max_m) + "m" : "")
                + (r.away != null ? " · 출발점까지 " + km(r.away) + "km" : "");
            it.appendChild(b);
            it.appendChild(s);
            it.onclick = function () { fromList = true; location.hash = "#c=" + encodeURIComponent(r.course_id); };
            box.appendChild(it);
        });
    }

    var searchTimer = 0, fromList = false;
    var pickSeq = 0;   // 목록을 새로 그릴 때마다 +1 - 늦게 온 예전 검색 응답이 새 목록을 덮지 않게
    // 마지막 검색어 · 종류 - 코스에 들어갔다 돌아와도(새로 고침 · 앱 다시 열기 포함) 그대로.
    // 2026-10-09 홍TV님: 코스 미리보기(index.html · app.js)와 같은 열쇠 - 한쪽에서 '지리산' 을 넣고 넘어가면 다른 쪽에도.
    var SEARCH_KEY = "rf-search";
    $("q").addEventListener("input", function () {
        clearTimeout(searchTimer);
        var q = this.value.trim();
        try { localStorage.setItem(SEARCH_KEY, JSON.stringify({ q: q, kind: kindFilter })); } catch (e) { /* 무시 */ }
        // 2026-10-10 점검: 검색창을 비우면 순번을 올려, 비우기 전에 보낸 검색 응답(성공 · 실패)이 늦게 와도 버립니다
        if (!q) { pickSeq++; return; }
        searchTimer = setTimeout(function () {
            var my = ++pickSeq;
            getJson("api/courses?q=" + encodeURIComponent(q) + (kindFilter ? "&kind=" + kindFilter : ""))
                .then(function (j) { if (my === pickSeq) listCourses(j.courses || [], null); })
                .catch(function (e) { if (my === pickSeq) toast("검색 실패: " + e.message); });
        }, 300);
    });

    $("nearMe").addEventListener("click", function () {
        if (!navigator.geolocation || !window.isSecureContext) { toast("위치는 https 주소에서만 쓸 수 있습니다. 산 이름으로 찾아보세요.", 5000); return; }
        toast("현재 위치를 찾는 중…");
        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude, lon = pos.coords.longitude, r = 0.045, my = ++pickSeq;   // 약 5km
            getJson("api/courses?bbox=" + [lon - r, lat - r, lon + r, lat + r].map(function (v) { return v.toFixed(5); }).join(",")
                    + (kindFilter ? "&kind=" + kindFilter : ""))
                .then(function (j) {
                    var rows = (j.courses || []).map(function (x) {
                        x.away = distM(lat, lon, +x.start_lat, +x.start_lon);
                        return x;
                    }).sort(function (a, b) { return a.away - b.away; });
                    if (my === pickSeq) listCourses(rows, true);
                }).catch(function (e) { if (my === pickSeq) toast("코스를 찾지 못했습니다: " + e.message); });
        }, function (e) { onGpsError(e); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });

    // ------------------------------------------------------------------ 시작

    $("safetyChk").addEventListener("change", function () { $("safetyGo").disabled = !this.checked; });
    [].forEach.call(document.querySelectorAll("#kindTabs button"), function (b) {
        b.addEventListener("click", function () {
            kindFilter = b.getAttribute("data-kind");
            $("q").placeholder = RF.searchPlaceholder(kindFilter);   // 종류마다 다른 안내 글
            setKindWords();
            [].forEach.call(document.querySelectorAll("#kindTabs button"), function (x) {
                x.classList.toggle("on", x === b);
                x.setAttribute("aria-pressed", x === b ? "true" : "false");   // 화면 읽기 프로그램에 지금 탭을 알림
            });
            var ev = document.createEvent("Event"); ev.initEvent("input", true, true); $("q").dispatchEvent(ev);
        });
    });
    $("myRecords").addEventListener("click", showRecords);
    $("recClose").addEventListener("click", function () { $("recSheet").style.display = "none"; });
    $("recClear").addEventListener("click", function () {
        if (mapReady) mapReady.then(function () { map.getSource("recTrack").setData({ type: "FeatureCollection", features: [] }); });
        $("recClear").style.display = "none";
        if (!c) showPick();   // 코스 없이 기록만 보던 때 - 코스 고르기로 돌아감
    });
    $("doneClose").addEventListener("click", function () { $("doneSheet").style.display = "none"; });

    // ------------------------------------------------------------------ 나침반

    // 2026-10-10 점검: 센서는 초당 60번 남짓 오는데 그때마다 화살표 · 지도 · 내 위치 표시를 다시 그려 배터리를 먹었습니다.
    // 받은 방위만 적어 두고 그리기는 화면 한 장(requestAnimationFrame)에 한 번.
    function onOrientation(e) {
        var h = null;
        if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;                 // 아이폰
        else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;              // 안드로이드(절대 방위)
        if (h == null) return;
        var sa = screen.orientation && screen.orientation.angle ? screen.orientation.angle : (window.orientation || 0);
        compass.raw = (h + sa + 360) % 360;   // 가로 화면 보정
        if (!compass.raf) compass.raf = requestAnimationFrame(drawOrientation);
    }
    function drawOrientation() {
        compass.raf = 0;
        if (!compass.listening || compass.raw == null) return;
        var h = compass.raw;
        compass.heading = h;
        if (hike.guideBr != null) turnGuideArrow();   // 몸을 돌리면 화살표도 바로(GPS 를 기다리지 않고)
        setNeedle(-h);   // 빨간 끝 = 실제 북쪽(핸드폰 위쪽 기준)
        $("compassText").textContent = Math.round(h) + "°";
        var t = performance.now();
        if (compass.up && t - compass.lastTurn > 120) {   // 내 방향으로 지도 돌리기(초당 8번까지)
            compass.lastTurn = t;
            map.rotateTo(h, { duration: 100 });
        }
        if (meMarker && hike.fix) setMe(hike.fix.lat, hike.fix.lon, null);
    }

    /** 나침반 바늘 - 나침반이 켜져 있으면 실제 북쪽, 꺼져 있으면 지도의 북쪽. */
    function setNeedle(deg) {
        $("compass").querySelector(".needle").style.transform = "rotate(" + deg + "deg)";
    }

    /** 센서 받기 켜기 · 끄기 - 두 번 붙지 않게 compass.listening 으로 봅니다. */
    function compassListen(on) {
        if (on === !!compass.listening) return;
        compass.listening = on;
        var ev = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
        if (on) window.addEventListener(ev, onOrientation);
        else {
            window.removeEventListener(ev, onOrientation);
            if (compass.raf) { cancelAnimationFrame(compass.raf); compass.raf = 0; }
        }
    }

    /** 나침반 끄기(산행을 끝냈을 때) - 센서를 놓고 바늘은 다시 지도의 북쪽. */
    function compassOff() {
        if (!compass.on) return;
        compassListen(false);
        compass.on = false;
        compass.raw = compass.heading = null;
        if (compass.up) { compass.up = false; if (map) map.rotateTo(0, { duration: 300 }); }
        $("compass").classList.remove("on", "up");
        if (map) setNeedle(-map.getBearing());
    }

    function compassOn() {
        var go = function () {
            compass.on = true;
            compassListen(true);
            $("compass").classList.add("on");
            setTimeout(function () { if (compass.heading == null) toast("이 기기에서는 나침반 방향을 읽지 못했습니다(센서 없음 · 권한 거부).", 5000); }, 2500);
        };
        // 아이폰은 사용자가 누른 순간에 권한을 물어야 합니다
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
            DeviceOrientationEvent.requestPermission().then(function (r) { if (r === "granted") go(); else toast("나침반 권한이 거부되었습니다."); })
                .catch(function () { toast("나침반 권한을 받지 못했습니다."); });
        } else {
            go();
        }
    }

    // 배터리 절약(앱만, 2026-10-09): 위치를 3m 대신 10m 움직일 때마다 받습니다. 코스 이탈(수십 m) 판단에는 충분하고
    // 기록 선이 조금 거칠어집니다. 위쪽 GPS 글자를 눌러 바꾸고, 다음 "산행 시작" 부터 적용합니다. 브라우저는 바꿀 것이 없어 보이지 않습니다.
    if (BG) {
        $("gps").style.cursor = "pointer";   // className 은 GPS 상태가 바꿉니다
        $("gps").title = "누르면 배터리 절약 모드 켜기 · 끄기";
        $("gps").addEventListener("click", function () {
            batterySave = !batterySave;
            try { localStorage.setItem(BATTERY_KEY, batterySave ? "1" : "0"); } catch (e) { /* 이번만 */ }
            toast((batterySave ? "배터리 절약 켬 - 위치를 10m 마다 받습니다." : "배터리 절약 끔 - 위치를 3m 마다 받습니다.")
                + (hike.running && !hike.sim ? " 다음 산행 시작부터 적용됩니다." : ""), 4000);
        });
    }

    $("kcalBox").addEventListener("click", function () {
        var kg = askNumber("몸무게(kg)를 넣어 주세요. 칼로리 추정에만 쓰고 이 핸드폰에만 저장합니다.", body.kg, 20, 200);
        if (kg == null) return;
        body.kg = kg;
        saveBody();
        if (c) render();
    });
    $("stepsBox").addEventListener("click", function () {
        var cm = askNumber("키(cm)를 넣어 주세요. 걸음 수(보폭) 추정에만 쓰고 이 핸드폰에만 저장합니다.", body.cm, 100, 230);
        if (cm == null) return;
        body.cm = cm;
        saveBody();
        if (c) render();
    });

    // 기록 칸 접기 · 펴기 - 아래로 밀면 접고(지도가 커짐) 위로 밀면 폅니다. 손잡이를 눌러도 됩니다. 이 기기에 기억.
    function setCompact(on) {
        document.body.classList.toggle("compact", on);
        try { localStorage.setItem("rf-compact", on ? "1" : "0"); } catch (e) { /* 무시 */ }
        if (map) setTimeout(function () { map.resize(); }, 0);
    }
    try { if (localStorage.getItem("rf-compact") === "1") document.body.classList.add("compact"); } catch (e) { /* 무시 */ }
    $("grip").addEventListener("click", function () { setCompact(!document.body.classList.contains("compact")); });
    var swipeY = null;
    $("stats").addEventListener("touchstart", function (e) { swipeY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
    $("stats").addEventListener("touchend", function (e) {
        if (swipeY == null || !e.changedTouches.length) return;
        var dy = e.changedTouches[0].clientY - swipeY;
        swipeY = null;
        if (dy > 40) setCompact(true);
        else if (dy < -40) setCompact(false);
    }, { passive: true });

    $("voice").addEventListener("click", function () {
        setVoice(VOICE_LEVELS[(VOICE_LEVELS.indexOf(voice.level) + 1) % VOICE_LEVELS.length]);
        if (voice.level === "on") say("음성 안내를 자세히 합니다.", { urgent: true });
        else if (voice.level === "short") say("음성 안내를 짧게 합니다.", { urgent: true });
        else toast("음성 안내를 껐습니다.", 2000);
    });
    setVoice(voice.level);
    if (!TTS && !("speechSynthesis" in window)) $("voice").style.display = "none";   // 읽어 주기가 없는 브라우저

    $("compass").addEventListener("click", function () {
        if (!compass.on) { compassOn(); return; }
        compass.up = !compass.up;   // 켜진 뒤 누르면: 내 방향으로 지도 돌리기 ↔ 북쪽 위로
        $("compass").classList.toggle("up", compass.up);
        if (!compass.up) map.rotateTo(0, { duration: 300 });
        toast(compass.up ? "내가 보는 방향이 위로 오게 지도를 돌립니다." : "북쪽이 위로 오게 되돌렸습니다.", 2500);
    });

    // ------------------------------------------------------------------ SOS

    function fillSos(f) {
        $("sosGrid").textContent = f ? (RF.nationalPoint(f.lat, f.lon) || "범위 밖") : "위치를 찾는 중…";
        $("sosLatLon").textContent = f ? f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (±" + Math.round(f.acc) + "m)" : "") : "-";
        // 해발: GPS 고도가 있으면 그것, 없으면 산행 중 코스 위에 있을 때만 코스 고도(아니면 엉뚱한 값이라 비움)
        var ele = null, eleNote = "";
        if (f && f.alt != null) ele = Math.round(f.alt);
        else if (c && hike.running && hike.off <= OFF_ROUTE_M) { ele = RF.at(c, hike.d).ele; eleNote = " (코스 기준)"; }
        $("sosEle").textContent = ele == null ? "-" : num(ele) + "m" + eleNote;
        var where = c && hike.running ? km(hike.d) + "km 지점" + (hike.off > OFF_ROUTE_M ? " · 코스에서 " + num(hike.off) + "m 벗어남" : "") : "";
        $("sosCourse").textContent = c ? c.course.name + (where ? " · " + where : "") : "-";

        // 보낼 글 - 화면에 보이는 내용 그대로(구조대가 읽기 쉽게 줄바꿈)
        var lines = ["[" + K().sos + " 긴급 신고]"];
        if (f) {
            lines.push("국가지점번호: " + (RF.nationalPoint(f.lat, f.lon) || "-"));
            lines.push("위치: " + f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (오차 약 " + Math.round(f.acc) + "m)" : ""));
            if (f.acc && f.acc > 100) lines.push("※ GPS 오차가 큼 - 주변 위치표지판 번호를 함께 확인 바람");
        } else {
            lines.push("위치: 확인 못 함 - 위치표지판 번호로 연락 바람");
        }
        if (ele != null) lines.push("해발: " + Math.round(ele) + "m" + eleNote);
        if (c) lines.push("코스: " + c.course.name + (where ? " (" + where + ")" : ""));
        var nx = c && hike.running ? RF.nextPoi(c, hike.d) : null;
        if (nx) lines.push("다음 지점: " + nx.name + "까지 " + km(+nx.dist_m - hike.d) + "km");
        lines.push("시각: " + clock(Date.now()));
        var body = lines.join("\n");
        sosNow = { f: f, lines: lines, body: body };
        $("sosPhoto").disabled = !f;
        $("sosBody").textContent = body;
        $("sosSms").href = "sms:119" + (/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?") + "body=" + encodeURIComponent(body);
        $("sosCopy").onclick = function () {
            (navigator.clipboard ? navigator.clipboard.writeText(body) : Promise.reject()).then(function () { toast("위치를 복사했습니다."); })
                .catch(function () { prompt("아래 글을 길게 눌러 복사하세요", body); });
        };
    }

    // ---- 위치 사진: 지금 지도(내 위치 · 코스 · 주변 등산로) + 문자와 같은 위치 글을 한 장으로 만들어 공유 창으로 보냅니다
    //      (문자 앱이 링크로 글만 받으므로 사진은 공유 창 → 메시지 → 받는 사람 119 로 보냅니다)

    var sosNow = { f: null, lines: [], body: "" };

    function waitIdle(ms) {
        return new Promise(function (resolve) {
            var done = false, finish = function () { if (!done) { done = true; resolve(); } };
            map.once("idle", finish);
            setTimeout(finish, ms);
        });
    }

    /** 지도 그림을 2D 그림판으로 옮깁니다 - WebGL 은 그린 바로 그때(render 이벤트 안)에만 읽을 수 있습니다. */
    function grabMap() {
        return new Promise(function (resolve) {
            map.once("render", function () {
                var cv = map.getCanvas(), out = document.createElement("canvas");
                out.width = cv.width; out.height = cv.height;
                out.getContext("2d").drawImage(cv, 0, 0);
                resolve(out);
            });
            map.triggerRepaint();
        });
    }

    function scaleBar(mpp) {   // 화면 90px 안에 들어가는 깔끔한 거리
        var steps = [20, 50, 100, 200, 500, 1000, 2000, 5000], m = steps[0];
        steps.forEach(function (x) { if (x / mpp <= 110) m = x; });
        return { m: m, px: m / mpp, label: m >= 1000 ? (m / 1000) + "km" : m + "m" };
    }

    function drawLabel(g, text, x, y, size, color) {
        g.font = "bold " + size + "px sans-serif";
        g.lineWidth = size * 0.28; g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineJoin = "round";
        g.strokeText(text, x, y);
        g.fillStyle = color; g.fillText(text, x, y);
    }

    function sosImage(f, lines) {
        var cam = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing() };
        var zoom = f.acc && f.acc > 300 ? 14 : 15;
        map.jumpTo({ center: [f.lon, f.lat], zoom: zoom, bearing: 0 });
        return waitIdle(8000).then(grabMap).then(function (shot) {
            var cssW = map.getContainer().clientWidth || shot.width;
            var px = shot.width / cssW;                        // 화면 1px 이 그림에서 몇 px
            var W = Math.max(720, shot.width), k = W / shot.width, u = px * k;   // u: 화면 1px → 결과 px
            var mapH = Math.round(shot.height * k);
            var fs = Math.round(W / 26), lh = Math.round(fs * 1.45), pad = Math.round(fs * 0.8);
            var H = mapH + pad * 2 + lh * lines.length + Math.round(fs * 1.2);
            var out = document.createElement("canvas");
            out.width = W; out.height = H;
            var g = out.getContext("2d");
            g.fillStyle = "#11161d"; g.fillRect(0, 0, W, H);
            g.drawImage(shot, 0, 0, W, mapH);

            function xy(lon, lat) { var p = map.project([lon, lat]); return { x: p.x * u, y: p.y * u }; }
            g.save();
            g.beginPath(); g.rect(0, 0, W, mapH); g.clip();
            // 코스 이름표(지도 위 DOM 표시는 사진에 안 찍히므로 직접 씁니다)
            g.textAlign = "left"; g.textBaseline = "middle";
            (c ? c.pois : []).forEach(function (q) {
                var p = xy(+q.lon, +q.lat);
                if (p.x < 0 || p.y < 0 || p.x > W || p.y > mapH) return;
                g.beginPath(); g.arc(p.x, p.y, 4 * u, 0, Math.PI * 2);
                g.fillStyle = "#ffd43b"; g.fill(); g.lineWidth = 1.5 * u; g.strokeStyle = "#000"; g.stroke();
                drawLabel(g, RF.poiIcon(q.name) + " " + q.name, p.x + 7 * u, p.y, Math.round(12 * u), "#fff");
            });
            // 내 위치 - 오차 원 + 빨간 점 + "내 위치"
            var me = xy(f.lon, f.lat);
            var mpp = 40075016.686 * Math.cos(f.lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));   // 화면 1px 당 m
            if (f.acc) {
                g.beginPath(); g.arc(me.x, me.y, Math.max(8 * u, f.acc / mpp * u), 0, Math.PI * 2);
                g.fillStyle = "rgba(255,59,48,0.18)"; g.fill();
                g.lineWidth = 2 * u; g.strokeStyle = "rgba(255,59,48,0.9)"; g.stroke();
            }
            g.beginPath(); g.arc(me.x, me.y, 9 * u, 0, Math.PI * 2);
            g.fillStyle = "#ff3b30"; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = "#fff"; g.stroke();
            g.textAlign = "center";
            drawLabel(g, "내 위치", me.x, me.y - 22 * u, Math.round(15 * u), "#ff8787");
            g.restore();
            // 북쪽 · 축척
            g.textAlign = "left";
            drawLabel(g, "▲ 북", 10 * u, 18 * u, Math.round(13 * u), "#fff");
            var sb = scaleBar(mpp), y0 = mapH - 14 * u;
            g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(8 * u, y0 - 18 * u, sb.px * u + 16 * u, 26 * u);
            g.fillStyle = "#fff"; g.fillRect(16 * u, y0, sb.px * u, 3 * u);
            g.font = "bold " + Math.round(11 * u) + "px sans-serif"; g.textBaseline = "alphabetic";
            g.fillText(sb.label, 16 * u, y0 - 4 * u);
            // 위치 글(문자와 똑같은 내용)
            var y = mapH + pad + lh * 0.75;
            lines.forEach(function (t, i) {
                g.font = (i === 0 ? "bold " : "") + fs + "px sans-serif";
                g.fillStyle = i === 0 ? "#ff6b6b" : (/^국가지점번호/.test(t) ? "#ffd43b" : "#eef2f6");
                g.fillText(t, pad, y, W - pad * 2);
                y += lh;
            });
            g.font = Math.round(fs * 0.62) + "px sans-serif"; g.fillStyle = "#8a96a3";
            g.fillText("지도: " + (cfg.vworldKey ? "위성사진 국토교통부 V-World · " : "") + "지형 Terrain Tiles · 등산로 산림청 · routefly", pad, H - pad * 0.7, W - pad * 2);
            return out;
        }).finally(function () {
            map.jumpTo(cam);
        });
    }

    function stamp(ms) {
        var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
    }

    var PHOTO_LABEL = "📷 위치 사진 보내기(지도 + 위치 글)";
    var photoReady = null;   // 만든 사진 {file, url, body} - 공유가 막히면(누른 지 오래됨) 한 번 더 누를 때 보냅니다

    function sharePhoto(p) {
        if (FS && SHARE) {   // 앱 - 공유 창(메시지 → 받는 사람 119)
            $("sosPhotoTip").innerHTML = "공유 창에서 <b>메시지</b> → 받는 사람 <b>119</b> → 보내기. 공유 창이 닫혔으면 버튼을 다시 누르세요.";
            return blobToBase64(p.file).then(function (b64) { return nativeShareFile(p.file.name, b64, p.body); })
                .catch(function (e) { if (!/cancel/i.test(String(e && e.message || e))) throw e; });
        }
        if (!(navigator.canShare && navigator.canShare({ files: [p.file] }))) {
            // 공유 창을 못 쓰는 브라우저 - 사진을 저장하게 합니다
            var a = document.createElement("a");
            a.href = p.url; a.download = p.file.name;
            document.body.appendChild(a); a.click(); a.remove();
            $("sosPhotoTip").innerHTML = "이 브라우저는 바로 보내기를 못 합니다. 사진을 저장했습니다(안 되면 사진을 <b>길게 눌러 저장</b>).<br>" +
                "문자 앱에서 119 에게 사진을 붙여 보내세요.";
            return Promise.resolve();
        }
        $("sosPhotoTip").innerHTML = "공유 창에서 <b>메시지</b> → 받는 사람 <b>119</b> → 보내기. 공유 창이 닫혔으면 버튼을 다시 누르세요.";
        return navigator.share({ files: [p.file], text: p.body }).catch(function (e) {
            if (e && e.name === "NotAllowedError") {   // 사진 만드는 사이 '누름'이 만료됨 - 한 번 더 누르게
                $("sosPhoto").textContent = "📤 사진 보내기(한 번 더 누르세요)";
                toast("사진이 준비됐습니다. 📤 버튼을 한 번 더 누르세요.", 5000);
                return "again";
            }
            if (e && e.name !== "AbortError") throw e;
        });
    }

    $("sosPhoto").addEventListener("click", function () {
        var now0 = sosNow, btn = $("sosPhoto");
        if (!now0.f) { toast("위치를 찾은 뒤에 만들 수 있습니다."); return; }
        if (photoReady && photoReady.f === now0.f && photoReady.body === now0.body) {   // 이미 만든 사진 - 바로 보냅니다
            sharePhoto(photoReady).then(function (r) { if (r !== "again") btn.textContent = PHOTO_LABEL; })
                .catch(function (e) { toast("보내기 실패: " + (e && e.message || e), 5000); });
            return;
        }
        btn.disabled = true;
        btn.textContent = "📷 사진 만드는 중…";
        var label = PHOTO_LABEL;
        sosImage(now0.f, now0.lines).then(function (cv) {
            return new Promise(function (resolve, reject) {
                cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("그림 저장 실패")); }, "image/jpeg", 0.88);
            });
        }).then(function (blob) {
            var name = "sos119-" + stamp(Date.now()) + ".jpg";
            var img = $("sosPhotoImg");
            if (photoReady) URL.revokeObjectURL(photoReady.url);
            photoReady = { f: now0.f, body: now0.body, url: URL.createObjectURL(blob), file: new File([blob], name, { type: "image/jpeg" }) };
            img.src = photoReady.url;
            $("sosPhotoBox").style.display = "block";
            return sharePhoto(photoReady);
        }).then(function (r) {
            if (r === "again") label = "📤 사진 보내기(한 번 더 누르세요)";
        }).catch(function (e) {
            toast("사진을 못 만들었습니다: " + (e && e.message || e) + " - 문자 신고를 쓰세요.", 5000);
        }).finally(function () { btn.disabled = false; btn.textContent = label; });
    });

    $("sos").addEventListener("click", function () {
        $("sosSheet").style.display = "flex";
        $("sosPhotoBox").style.display = "none";
        $("sosPhoto").textContent = PHOTO_LABEL;
        var fresh = hike.fix && Date.now() - (hike.sim ? Date.now() : hike.fix.t) < 60000 ? hike.fix : null;
        fillSos(fresh);
        if (!fresh && navigator.geolocation && window.isSecureContext) {
            navigator.geolocation.getCurrentPosition(function (pos) {
                fillSos({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, alt: pos.coords.altitude, t: Date.now() });
            }, function () { $("sosGrid").textContent = "위치를 못 찾음 - 표지판 번호를 불러 주세요"; },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
        } else if (!fresh) {
            $("sosGrid").textContent = "위치를 못 씀(https 필요) - 표지판 번호를 불러 주세요";
        }
    });
    $("sosClose").addEventListener("click", function () { $("sosSheet").style.display = "none"; });

    // ------------------------------------------------------------------ 공유 · 오프라인 저장

    $("share").addEventListener("click", function () {
        if (!c) return;
        var url = new URL("s/" + encodeURIComponent(c.id) + "?to=hike", location.href).href;
        var text = c.course.name + " · " + km(c.total) + "km";
        if (navigator.share) navigator.share({ title: c.course.name, text: text, url: url }).catch(function () {});
        else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("링크를 복사했습니다: " + url, 5000); })
            .catch(function () { prompt("링크를 복사하세요", url); });
    });

    /** 지도 타일 주소들 - 코스 범위의 z(lo~hi). */
    function tileUrls(template, z0, z1, bbox) {
        var out = [];
        function tx(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
        function ty(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }
        for (var z = z0; z <= z1; z++) {
            for (var x = tx(bbox[0], z); x <= tx(bbox[2], z); x++) {
                for (var y = ty(bbox[3], z); y <= ty(bbox[1], z); y++) {
                    out.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
                }
            }
        }
        return out;
    }

    /**
     * 오프라인 저장 - 코스 · 주변 길 자료와 지도 그림을 핸드폰에 받아 둡니다(서비스 워커가 통신이 끊기면 씀).
     * 2026-10-08 (홍TV님 - 오프라인 범위 넓히기): 범위를 고릅니다 - 코스 둘레 약 500m(전과 같음) · 넓게 약 3km · 지금 보이는 지도.
     * 타일은 OFFLINE_MAX 장 안으로 - 넘으면 가장 자세한 단계를 줄이고(최소 z12), z12 로도 넘으면 받지 않습니다.
     */
    var OFFLINE_MAX = 3000, OFFLINE_ZMIN = 10, OFFLINE_ZMAX = 16;
    var SAVE_RANGES = { near: { pad: 0.005, label: "코스 둘레 약 500m" }, wide: { pad: 0.03, label: "넓게 - 코스 둘레 약 3km" } };

    /** 그 범위([서경, 남위, 동경, 북위])에서 받을 타일 주소 - OFFLINE_MAX 안으로 가장 자세한 단계를 정합니다. 넘치면 null. */
    function offlinePlan(b) {
        var style = map.getStyle(), zMax = OFFLINE_ZMAX, list;
        do {
            list = [];
            Object.keys(style.sources).forEach(function (k) {
                var src = style.sources[k];
                if (!src.tiles || !src.tiles[0]) return;
                // 지금 보이는 바탕 지도만(위성 · 밝은 지도 둘 다 받으면 두 배)
                var used = style.layers.filter(function (l) { return l.source === k; });
                if (used.length && used.every(function (l) { return l.layout && l.layout.visibility === "none"; })) return;
                list = list.concat(tileUrls(src.tiles[0], OFFLINE_ZMIN, Math.min(zMax, src.maxzoom || OFFLINE_ZMAX), b));
            });
            zMax--;
        } while (list.length > OFFLINE_MAX && zMax >= 12);
        return list.length > OFFLINE_MAX ? null : { urls: list, zMax: zMax + 1 };
    }
    function rangeBbox(key) {
        if (key === "view") { var v = map.getBounds(); return [v.getWest(), v.getSouth(), v.getEast(), v.getNorth()]; }
        var pad = SAVE_RANGES[key].pad;
        return [Math.min.apply(null, c.lon) - pad, Math.min.apply(null, c.lat) - pad, Math.max.apply(null, c.lon) + pad, Math.max.apply(null, c.lat) + pad];
    }

    $("save").addEventListener("click", function () {
        if (!c) return;
        if (!("caches" in window) || !window.isSecureContext) { toast("오프라인 저장은 https 주소에서만 됩니다.", 5000); return; }
        [["saveNear", "near", "📍 " + SAVE_RANGES.near.label], ["saveWide", "wide", "🏔 " + SAVE_RANGES.wide.label], ["saveView", "view", "🗺 지금 보이는 지도 범위"]].forEach(function (x) {
            var plan = offlinePlan(rangeBbox(x[1])), btn = $(x[0]);
            btn.disabled = !plan;
            btn.textContent = x[2] + (plan ? " · " + num(plan.urls.length) + "장(가장 자세히 z" + plan.zMax + ")" : " · 너무 넓습니다(지도를 확대하세요)");
            btn.onclick = function () { $("saveSheet").style.display = "none"; saveOffline(plan); };
        });
        $("saveDelete").style.display = offlineIds().indexOf(c.id) >= 0 ? "" : "none";   // 저장해 둔 코스면 지우기
        $("saveSheet").style.display = "flex";
    });
    $("saveClose").addEventListener("click", function () { $("saveSheet").style.display = "none"; });

    /*
     * 2026-10-10 점검: 저장한 코스를 지울 수 없어 rf-offline-v1 이 끝없이 커졌습니다.
     * 코스마다 받은 주소 목록을 같은 캐시의 "offline-index?c=<코스>" 에 JSON 으로 남기고(localStorage 는 3,000장 주소를 담기에 작음),
     * 지울 때는 다른 저장 코스가 함께 쓰는 주소(겹치는 타일 · map-config)는 남깁니다.
     */
    var OFFLINE_CACHE = "rf-offline-v1";   // sw.js 의 OFFLINE 과 같은 이름
    /** 오프라인 저장한 코스 번호들(localStorage "rf-offline") - 코스를 열 때(loadCourse)도 부릅니다. */
    function offlineIds() { try { return JSON.parse(localStorage.getItem("rf-offline") || "[]"); } catch (e) { return []; } }
    function setOfflineIds(ids) { try { localStorage.setItem("rf-offline", JSON.stringify(ids)); } catch (e) { /* 무시 */ } }
    function offlineIndexKey(id) { return new URL("offline-index?c=" + encodeURIComponent(id), location.href).href; }
    /** 그 코스가 받은 주소 목록(절대 주소). 예전에 저장해 목록이 없으면 null. */
    function offlineIndex(cache, id) {
        return cache.match(offlineIndexKey(id)).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
    }
    function absUrl(u) { return new URL(u, location.href).href; }

    /** 저장 지우기 - 이 코스의 주소 중 다른 저장 코스가 쓰지 않는 것만 지웁니다. */
    function deleteOffline(id) {
        var others = offlineIds().filter(function (x) { return x !== id; });
        return caches.open(OFFLINE_CACHE).then(function (cache) {
            return Promise.all([offlineIndex(cache, id)].concat(others.map(function (o) { return offlineIndex(cache, o); }))).then(function (idx) {
                var mine = idx[0], keep = {}, legacyOther = false;
                idx.slice(1).forEach(function (l) { if (l) l.forEach(function (u) { keep[u] = true; }); else legacyOther = true; });
                var drop;
                if (mine && !legacyOther) {
                    drop = Promise.resolve(mine.filter(function (u) { return !keep[u]; }));
                } else if (mine) {
                    // 목록 없는 예전 저장 코스가 남아 있으면 겹치는지 알 수 없어 코스 자료만 지움(타일은 그대로)
                    drop = Promise.resolve(mine.filter(function (u) { return u.indexOf("/api/course?") >= 0; }));
                } else if (!others.length) {
                    return caches.delete(OFFLINE_CACHE);   // 예전 저장 · 남은 저장 없음 - 통째로
                } else if (!legacyOther) {
                    // 이 코스만 예전 저장 - 다른 코스 목록에 없는 것(목록 자체는 빼고)을 모두 지움
                    drop = cache.keys().then(function (ks) {
                        return ks.map(function (k) { return k.url; }).filter(function (u) { return !keep[u] && u.indexOf("/offline-index?") < 0; });
                    });
                } else {
                    drop = Promise.resolve(isGpxId(id) ? [] : [absUrl("api/course?id=" + encodeURIComponent(id))]);
                }
                return drop.then(function (urls) {
                    return Promise.all(urls.concat([offlineIndexKey(id)]).map(function (u) { return cache.delete(u); }));
                });
            });
        }).then(function () {
            setOfflineIds(others);
        });
    }
    $("saveDelete").addEventListener("click", function () {
        if (!c || !("caches" in window)) return;
        var id = c.id;
        if (!confirm("이 코스의 오프라인 저장(지도 그림)을 지울까요? 다른 저장 코스와 겹치는 지도는 남깁니다.")) return;
        $("saveSheet").style.display = "none";
        deleteOffline(id).then(function () {
            if (c && c.id === id) $("save").textContent = "📥 저장";
            toast("오프라인 저장을 지웠습니다.", 3000);
        }).catch(function (e) { toast("지우지 못했습니다: " + (e && e.message || e), 5000); });
    });

    function saveOffline(plan) {
        // 주변 길은 화면이 부르는 그 주소(loadTrails 의 courseBbox(0.01))로 받아야 오프라인에서 서비스 워커가 내줍니다.
        var head = (isGpxId(c.id) ? [] : ["api/course?id=" + encodeURIComponent(c.id)]).concat(["api/trails?bbox=" + courseBbox(0.01), "api/map-config"]);
        var urls = head.concat(plan.urls), id = c.id;
        var btn = $("save"), done = 0, failed = 0, i = 0;
        btn.disabled = true;
        caches.open(OFFLINE_CACHE).then(function (cache) {
            function next() {
                if (i >= urls.length) return Promise.resolve();
                var u = urls[i++];
                // 지도 타일은 no-store 로 - 서비스 워커가 이것을 보고 지나가며 본 타일 캐시에 두 번 넣지 않습니다(sw.js)
                return fetch(u, { mode: "cors", cache: /^https?:/.test(u) ? "no-store" : "default" }).then(function (r) {
                    if (r.ok) return cache.put(u, r);
                    failed++;
                }).catch(function () { failed++; }).then(function () {
                    done++;
                    btn.textContent = Math.round(done / urls.length * 100) + "%";
                    return next();
                });
            }
            return Promise.all([next(), next(), next(), next(), next(), next()]).then(function () {
                // 받은 주소 목록 - 다시 저장하면 예전 목록과 합칩니다(범위를 바꿔 다시 받아도 예전 타일까지 지울 수 있게)
                return offlineIndex(cache, id).then(function (old) {
                    var all = {};
                    (old || []).concat(urls.map(absUrl)).forEach(function (u) { all[u] = true; });
                    return cache.put(offlineIndexKey(id), new Response(JSON.stringify(Object.keys(all)), { headers: { "Content-Type": "application/json" } }));
                });
            });
        }).then(function () {
            btn.disabled = false;
            btn.textContent = "✅ 저장됨";
            var saved = offlineIds();
            if (saved.indexOf(id) < 0) { saved.push(id); setOfflineIds(saved); }
            toast("오프라인 저장 끝 - 지도 " + num(plan.urls.length) + "장" + (failed ? " (못 받은 " + failed + "장)" : "") + ". 통신이 끊겨도 이 범위는 보입니다.", 6000);
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = "📥 저장";
            toast("저장하지 못했습니다: " + e.message, 5000);
        });
    }

    $("go").addEventListener("click", function () { if (hike.running) askStop(); else start(false); });
    $("endNo").addEventListener("click", function () { $("endSheet").style.display = "none"; });
    $("endYes").addEventListener("click", function () { $("endSheet").style.display = "none"; stopHike(); });
    $("sim").addEventListener("click", function () { start(true); });
    $("follow").addEventListener("click", function () {
        setFollow(true);
        if (meMarker) map.easeTo({ center: meMarker.getLngLat(), zoom: Math.max(map.getZoom(), 15), duration: 500 });
    });

    function route() {
        var m = /[#&]c=([^&]+)/.exec(location.hash);
        // 2026-10-09 점검: 핸드폰 뒤로 가기(단추 · 밀기)로 주소가 바뀌어도 걷는 중이면 묻지 않고 끝내지 않습니다 -
        // 주소를 이 코스로 되돌리고 "끝낼까요?" 를 묻습니다(화면의 ‹ 단추와 같음). 시험 걷기는 그냥 멈춥니다.
        if (hike.running && !hike.sim && c && !(m && decodeURIComponent(m[1]) === c.id)) {
            try { history.pushState(null, "", "#c=" + encodeURIComponent(c.id)); } catch (e) { /* 주소만 못 되돌림 */ }
            askStop();
            return;
        }
        if (hike.running && m && c && decodeURIComponent(m[1]) === c.id) return;   // 같은 코스(되돌린 주소) - 그대로
        if (hike.running) stopHike();
        if (m) loadCourse(decodeURIComponent(m[1]));
        else {
            showPick();
            if (/^#rec\b/.test(location.hash)) showRecords();   // 코스 미리보기의 '📒 내 기록'
        }
    }
    window.addEventListener("hashchange", route);

    getJson("api/map-config").catch(function () {
        return { demUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: null };
    }).then(function (j) {
        cfg = { demUrl: j.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: j.vworldKey || null };
        startMap();
        if (cfg.vworldKey) $("layerBtn").style.display = "block";   // 키가 없으면 바탕은 지형 음영 하나뿐
        if (/[?&]debug\b/.test(location.search)) window.routeflyHike = { map: map, hike: hike, get c() { return c; },   // 시험용
            fix: function (lat, lon) { onFix({ timestamp: now(), coords: { latitude: lat, longitude: lon, accuracy: 5, speed: 1, heading: null } }); },
            heading: function (h) { onOrientation({ webkitCompassHeading: h }); } };
        // 주소에 코스가 없이 열렸는데 걷던 코스가 있으면 그 코스로(카카오톡 안 브라우저에서 길찾기 뒤 화면이 닫혔을 때 등)
        if (!/[#&]c=/.test(location.hash)) {
            try {
                var act = localStorage.getItem(ACTIVE_KEY);
                var sv = act && JSON.parse(localStorage.getItem("rf-hike-" + act) || "null");
                if (sv && sv.t && Date.now() - sv.t < RESUME_MS) history.replaceState(null, "", "#c=" + encodeURIComponent(act));
            } catch (e) { /* 그냥 목록 */ }
        }
        route();
    });
})();
