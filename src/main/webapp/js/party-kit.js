/*
 * 산악회 방 - 위치 보내기(2026-10-20 홍TV님). party.html(방 화면)과 hike.html(따라가기)이 같이 씀.
 * 참가한 방이 있을 때만(이 기기 localStorage "rf-party" 에 열쇠) 보냅니다 - 참가할 때 위치 제공에 동의함.
 * 서버(PartyServlet)는 사람마다 마지막 위치 하나만 메모리에 두고 같은 방 사람에게 보여 주며(배터리는 인솔자 · 운전자만), 방이 끝나면 지웁니다.
 * 출발 3시간 전보다 이른 위치는 서버가 버림.
 * 보내는 간격: 30초(SOS 를 켜고 끌 때는 바로). 방이 끝났다고 오면 이 기기의 방 정보도 지움.
 */
(function (g) {
    var KEY = "rf-party", EVERY_MS = 30000;
    var last = 0, busy = false, lastSos = null, again = null;   // again - 보내는 중에 꼭 보낼 것(SOS)이 오면 끝난 뒤 한 번 더

    function get() {
        try {
            var p = JSON.parse(localStorage.getItem(KEY) || "null");
            return p && p.token && p.code ? p : null;
        } catch (e) { return null; }
    }
    function set(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 이번만 */ } }
    function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* 없음 */ } }

    /** 서버에 보내기 - 실패하면 서버 글을 담은 Error. 방이 끝났으면(열쇠가 안 맞음) 이 기기 방 정보를 지움. */
    function post(path, body) {
        return fetch("api/party/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
            cache: "no-store", keepalive: true }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (!r.ok || j.success === false) {
                    var ended = r.status === 410 || (r.status === 400 && /끝났거나 열쇠/.test(j.message || ""));   // 410 - 방이 끝남(까닭이 글로 옴)
                    if (ended) clear();
                    var e = new Error(j.message || ("오류 " + r.status));
                    e.status = r.status;
                    e.ended = ended;
                    throw e;
                }
                return j;
            });
        });
    }

    function battery() {
        if (!navigator.getBattery) return Promise.resolve(null);
        return navigator.getBattery().then(function (b) { return Math.round(b.level * 100); }).catch(function () { return null; });
    }

    /**
     * 위치가 생길 때마다 부름(따라가기 onFix · 방 화면 watchPosition). 30초에 한 번만 보냄, SOS 가 바뀌면 바로.
     * 돌려줌: 보냈으면 서버 답(Promise), 안 보냈으면 null.
     */
    function fix(lat, lon, acc, force) {
        var p = get();
        if (!p || lat == null || lon == null) return null;
        var now = Date.now(), sos = !!p.sos;
        if (busy) {   // 보내는 중 - SOS 를 켜고 끈 것 · 꼭 보낼 것은 끝난 뒤 다시(2026-10-20 시험: 위치 보내는 사이 누른 SOS 가 빠졌음)
            if (force || sos !== lastSos) again = [lat, lon, acc];
            return null;
        }
        if (!force && sos === lastSos && now - last < EVERY_MS) return null;
        busy = true;
        last = now;
        lastSos = sos;
        return battery().then(function (b) {
            return post("loc", { token: p.token, lat: +(+lat).toFixed(6), lon: +(+lon).toFixed(6), acc: acc == null ? null : Math.round(acc), batt: b, sos: sos });
        }).then(function (j) {
            var q = get();
            if (q && j.notice && j.noticeAt && j.noticeAt !== q.noticeAt) {   // 새 공지 - 따라가기 화면에서도 알림
                q.noticeAt = j.noticeAt;
                set(q);
                if (g.RFParty.onNotice) g.RFParty.onNotice(j.notice);
            }
            return j;
        }).finally(function () {
            busy = false;
            if (again) { var a = again; again = null; fix(a[0], a[1], a[2], true); }
        });
    }

    /** SOS 켜기 · 끄기 - 다음 위치에 실어 바로 보냄. */
    function sos(on) {
        var p = get();
        if (!p) return;
        p.sos = !!on;
        set(p);
    }

    g.RFParty = { KEY: KEY, get: get, set: set, clear: clear, post: post, fix: fix, sos: sos, onNotice: null };
})(window);
