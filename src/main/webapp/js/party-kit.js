/*
 * 산악회 방 - 위치 보내기(2026-10-20 홍TV님). party.html(방 화면)과 hike.html(따라가기)이 같이 씀.
 * 참가한 방이 있을 때만(이 기기 localStorage "rf-party" 에 열쇠) 보냅니다 - 참가할 때 위치 제공에 동의함.
 * 서버(PartyServlet)는 사람마다 마지막 위치 하나만 메모리에 두고 그 방 인솔자에게 보여 주며(회원에게는 자기 것만), 방이 끝나면 지웁니다.
 * 출발 전 위치는 서버가 버림(위치는 출발할 때부터, 2026-10-27 홍TV님).
 * 보내는 간격: 30초(SOS 를 켜고 끌 때는 바로). 방이 끝났다고 오면 이 기기의 방 정보도 지움.
 */
(function (g) {
    var KEY = "rf-party", EVERY_MS = 30000;
    var last = 0, busy = false, busyAt = 0, lastSos = null, again = null, seq = 0;   // seq - 25초 넘어 풀린 옛 보내기가 늦게 끝나도 새 보내기의 busy 를 풀지 않게
    // 2026-10-20 PC: 앱 화면을 끈 직후(Doze) 4분 동안 위치가 안 갔음 - 보내기(fetch) · 배터리 읽기가 끝나지 않아 busy 가 풀리지 않은 것으로 봄.
    // 보내기는 20초, 배터리는 2초에 끊고, 25초 넘게 busy 면 풀어 다음 위치를 보냄
    var POST_MS = 20000, BATT_MS = 2000, STUCK_MS = 25000;
    function stuck() { if (busy && Date.now() - busyAt > STUCK_MS) { busy = false; again = null; } return busy; }   // again - 보내는 중에 꼭 보낼 것(SOS)이 오면 끝난 뒤 한 번 더

    /** 앱(Capacitor)에서 보내나 - 서버가 "10분 소식 없음" 경고를 앱 회원에게만(웹은 화면을 끄면 멈춤, 2026-10-28). */
    function isApp() { return !!(g.Capacitor && (!g.Capacitor.isNativePlatform || g.Capacitor.isNativePlatform())); }

    // 회사 사무실이 "열기" 로 연 방(office:true)은 이 탭에만(sessionStorage, 2026-10-29 홍TV님 - 회사 2곳 · 방 5개를 PC 탭마다 따로 봄).
    // 내가 참가한 방(localStorage)을 덮지 않고, 탭끼리도 섞이지 않음. 탭을 닫으면 잊음(사무실에서 다시 "열기").
    function tab() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
    function get() {
        try {
            var p = JSON.parse(tab() || localStorage.getItem(KEY) || "null");
            return p && p.token && p.code ? p : null;
        } catch (e) { return null; }
    }
    function set(p) {
        try {
            if (p && p.office) sessionStorage.setItem(KEY, JSON.stringify(p));
            else { sessionStorage.removeItem(KEY); localStorage.setItem(KEY, JSON.stringify(p)); }
        } catch (e) { /* 이번만 */ }
    }
    function clear() { try { if (tab()) sessionStorage.removeItem(KEY); else localStorage.removeItem(KEY); } catch (e) { /* 없음 */ } }

    /**
     * 알림(2026-10-28 홍TV님 - 인솔자도 혼자 산행해 화면을 못 봄): 무엇을 울릴지는 RF.partyAlerts(course-kit, 시험 있음).
     * 화면이 보이면 진동 · 소리(따라가기는 onNotice - 알림 띠 · 읽어 주기), 화면이 꺼졌거나 앱이면 폰 알림(앱 LocalNotifications · 브라우저 Notification).
     * 이미 울린 것은 이 기기 "rf-party-al" 에(방이 바뀌면 처음부터).
     */
    var AL_KEY = "rf-party-al", alId = 7400;
    function alerts(s) {
        if (!g.RF || !g.RF.partyAlerts) return;
        var st = null;
        try { st = JSON.parse(localStorage.getItem(AL_KEY) || "null"); } catch (e) { /* 처음 */ }
        if (!st || st.code !== s.code) st = { code: s.code, fired: {} };
        var r = g.RF.partyAlerts(s, st.fired);
        try { localStorage.setItem(AL_KEY, JSON.stringify({ code: s.code, fired: r.fired })); } catch (e) { /* 이번만 */ }
        var msgs = r.msgs.filter(function (m) { return !(g.RFParty.ownSos && !document.hidden && m.indexOf("🆘") === 0); });   // 인솔자 방 화면은 SOS 를 따로 읽음(두 번 읽지 않게, 10-28 PC)
        if (msgs.length) notify(msgs.join("\n"));
    }
    function notify(text) {
        if (g.RFParty && g.RFParty.onNotice && !document.hidden) { g.RFParty.onNotice(text); return; }   // 따라가기 - 띠 · 읽어 주기 · 진동(그쪽이 울림 - 두 번 울리지 않게, 10-28 PC)
        try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { /* 없음 */ }
        if (!document.hidden && g.speechSynthesis && g.SpeechSynthesisUtterance) {
            try { var u = new SpeechSynthesisUtterance(text.replace(/[^\uAC00-\uD7A3\w\s:·,.-]/g, " ")); u.lang = "ko-KR"; speechSynthesis.speak(u); } catch (e) { /* 없음 */ }
        }
        var CAP = g.Capacitor, LN = CAP && CAP.isNativePlatform && CAP.isNativePlatform() && CAP.Plugins && CAP.Plugins.LocalNotifications;
        if (LN) {   // 앱 - 화면이 꺼져 있어도
            Promise.resolve(LN.schedule({ notifications: [{ id: alId++, title: "routefly 산악회 방", body: text }] })).catch(function () { /* 권한 없음 */ });
        } else if (document.hidden && g.Notification && Notification.permission === "granted") {
            try { new Notification("routefly 산악회 방", { body: text, tag: "rf-party-" + (alId++) }); } catch (e) { /* 안드로이드 크롬은 서비스워커로만 - 진동 · 소리로 갈음 */ }
        }
    }
    /** 알림 켜기(인솔자 화면 단추 - 사용자가 눌러야 권한 창을 띄울 수 있음). */
    function alertsOn() {
        var CAP = g.Capacitor, LN = CAP && CAP.isNativePlatform && CAP.isNativePlatform() && CAP.Plugins && CAP.Plugins.LocalNotifications;
        if (LN) return Promise.resolve(LN.requestPermissions()).then(function (r) { return r && r.display === "granted"; }).catch(function () { return false; });
        if (g.Notification && Notification.requestPermission) return Promise.resolve(Notification.requestPermission()).then(function (p) { return p === "granted"; }).catch(function () { return false; });
        return Promise.resolve(false);
    }

    /** 서버에 보내기 - 실패하면 서버 글을 담은 Error. 방이 끝났으면(열쇠가 안 맞음) 이 기기 방 정보를 지움. */
    function post(path, body) {
        var ctl = typeof AbortController === "function" ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, POST_MS) : 0;
        return fetch("api/party/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
            cache: "no-store", keepalive: true, signal: ctl ? ctl.signal : undefined }).finally(function () { clearTimeout(timer); }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (!r.ok || j.success === false) {
                    var ended = r.status === 410 || (r.status === 400 && /끝났거나 열쇠/.test(j.message || ""));   // 410 - 방이 끝남(까닭이 글로 옴)
                    var mine = get();   // 지금 이 기기 방의 열쇠일 때만 지움(다른 열쇠 - 예전 방 · 들어오기 전 답 - 로 지우지 않게)
                    if (ended && mine && body && mine.token === body.token) clear();
                    var e = new Error(j.message || ("오류 " + r.status));
                    e.status = r.status;
                    e.ended = ended;
                    throw e;
                }
                if (j && j.role && j.members) alerts(j);   // 방 화면이 올 때마다(위치 · 켜짐 · 새로 받기 답) - 화면을 꺼도 앱이 보내는 답으로
                return j;
            });
        });
    }

    function battery() {
        if (!navigator.getBattery) return Promise.resolve(null);
        return Promise.race([navigator.getBattery().then(function (b) { return Math.round(b.level * 100); }).catch(function () { return null; }),
            new Promise(function (r) { setTimeout(function () { r(null); }, BATT_MS); })]);
    }

    /**
     * 위치가 생길 때마다 부름(따라가기 onFix · 방 화면 watchPosition). 30초에 한 번만 보냄, SOS 가 바뀌면 바로.
     * 돌려줌: 보냈으면 서버 답(Promise), 안 보냈으면 null.
     */
    function fix(lat, lon, acc, force) {
        var p = get();
        if (!p || lat == null || lon == null) return null;
        var now = Date.now(), sos = !!p.sos;
        if (stuck()) {   // 보내는 중 - SOS 를 켜고 끈 것 · 꼭 보낼 것은 끝난 뒤 다시(2026-10-20 시험: 위치 보내는 사이 누른 SOS 가 빠졌음)
            if (force || sos !== lastSos) again = [lat, lon, acc];
            return null;
        }
        if (!force && sos === lastSos && now - last < EVERY_MS) return null;
        busy = true;
        busyAt = now;
        last = now;
        lastSos = sos;
        var my = ++seq;
        return battery().then(function (b) {
            return post("loc", { token: p.token, lat: +(+lat).toFixed(6), lon: +(+lon).toFixed(6), acc: acc == null ? null : Math.round(acc), batt: b, sos: sos, app: isApp() });
        }).then(function (j) {
            var q = get();
            if (q && j.notice && j.noticeAt && j.noticeAt !== q.noticeAt) {   // 새 공지 - 따라가기 화면에서도 알림
                q.noticeAt = j.noticeAt;
                set(q);
                if (g.RFParty.onNotice) g.RFParty.onNotice(j.notice);
            }
            return j;
        }).finally(function () { done(my); });
    }

    /**
     * 위치를 못 잡을 때(화면 끈 실내 · 골짜기 - 앱 BackgroundGeolocation 이 "Location not available") "폰은 켜짐" · 배터리 · SOS 를 보냄(2026-10-20 PC).
     * 위치와 같은 30초 간격을 씀(force - SOS 를 켜고 끌 때 바로). 돌려줌: 보냈으면 서버 답(Promise), 안 보냈으면 null.
     */
    function ping(force) {
        var p = get();
        if (!p || stuck()) return null;
        var now = Date.now(), sos = !!p.sos;
        if (!force && sos === lastSos && now - last < EVERY_MS) return null;
        busy = true;
        busyAt = now;
        last = now;
        lastSos = sos;
        var my = ++seq;
        return battery().then(function (b) { return post("ping", { token: p.token, batt: b, sos: sos, app: isApp() }); })
            .finally(function () { done(my); });
    }
    /** 보내기가 끝남 - 가장 최근 보내기일 때만 busy 를 풀고, 그 사이 온 꼭 보낼 것(SOS)을 바로 보냄. */
    function done(my) {
        if (my !== seq) return;
        busy = false;
        if (again) { var a = again; again = null; fix(a[0], a[1], a[2], true); }
    }

    /** SOS 켜기 · 끄기 - 다음 위치에 실어 바로 보냄. */
    function sos(on) {
        var p = get();
        if (!p) return;
        p.sos = !!on;
        set(p);
    }

    /**
     * 순수 함수 - 날짜를 숫자로(2026-10-20 홍TV님: 폰 달력 창 대신 숫자 칸). "1022" · "10-22" · "10/22" · "10.22" · "10월 22일" · "922"(9/22) → Date(그 날 0시).
     * 해는 now 의 해 - 어제보다 앞이면 다음 해. 틀리면 null.
     */
    function parseDay(s, now) {
        var t = String(s == null ? "" : s).replace(/\(.*\)/, "").trim().replace(/^\d{4}\D+/, ""), m = t.match(/^(\d{1,2})\D+(\d{1,2})\D*$/), mo, d;
        if (m) { mo = +m[1]; d = +m[2]; }
        else if (/^\d{3,4}$/.test(t)) { mo = +t.slice(0, t.length - 2); d = +t.slice(-2); }
        else return null;
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        var n = new Date(now), x = new Date(n.getFullYear(), mo - 1, d);
        if (x.getMonth() !== mo - 1) return null;   // 2/30 등
        if (x.getTime() < new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1).getTime()) x = new Date(n.getFullYear() + 1, mo - 1, d);
        return x;
    }
    /** 순수 함수 - 시각을 숫자로: "0700" · "700" · "7:00" · "7" · "15" · "15시 30분" · "7시" · "15시" → [시, 분](24시간). 틀리면 null. */
    function parseTime(s) {
        var t = String(s == null ? "" : s).trim(), m = t.match(/^(\d{1,2})(?:\D+(\d{1,2}))?\D*$/), h, mi;
        if (m && !(m[2] === undefined && /^\d{3,}$/.test(t))) { h = +m[1]; mi = m[2] === undefined ? 0 : +m[2]; }
        else if (/^\d{3,4}$/.test(t)) { h = +t.slice(0, t.length - 2); mi = +t.slice(-2); }
        else return null;
        return h < 24 && mi < 60 ? [h, mi] : null;
    }

    /** 순수 함수 - 숫자만 친 우리나라 번호에 - (서버 Party.dashes 와 같음, 2026-10-21 홍TV님 "01000000000 → 010-0000-0000"). 모르는 꼴이면 그대로. */
    function dashes(s) {
        var t = String(s == null ? "" : s).trim(), d = t.replace(/[\s-]/g, "");
        if (!/^\d{8,12}$/.test(d)) return t;
        if (/^1[5-9]\d{6}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4);
        if (/^02/.test(d) && (d.length === 9 || d.length === 10)) return "02-" + d.slice(2, d.length - 4) + "-" + d.slice(-4);
        if (/^050\d{9}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8);
        if (/^0\d{9,10}$/.test(d)) return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(-4);
        return t;
    }

    g.RFParty = { alertsOn: alertsOn, isApp: isApp, dashes: dashes, KEY: KEY, get: get, set: set, clear: clear, post: post, fix: fix, ping: ping, sos: sos, onNotice: null, parseDay: parseDay, parseTime: parseTime };
})(window);
