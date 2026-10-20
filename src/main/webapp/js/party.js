/*
 * 산악회 방 화면(party.html - 2026-10-20 홍TV님). 서버는 PartyServlet · 위치 보내기는 party-kit.js(RFParty).
 * - 방이 없으면: 참가하기(방 코드 · 별명 · 역할 · 동의) / 방 만들기(인솔자)
 * - 방이 있으면: 지도 + 인솔자 · 운전자는 회원 목록(SOS · 오래 소식 없음 먼저), 회원은 공지 · 버스 · 탑승 · SOS
 * 위치: 이 화면이 열린 동안 watchPosition → 30초마다(RFParty.fix). 인솔자 · 운전자 화면은 15초마다 새로 받음.
 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var q = new URLSearchParams(location.search);
    var OLD_S = 600;        // 10분 넘게 소식이 없으면 주황
    var map = null, marks = {}, state = null, watch = null, pollTimer = null, lastNoticeAt = null, lastPos = null;   // lastPos - 이 화면이 받은 마지막 위치

    /** 지금 위치로 fn(lat, lon, acc) - 2분 안에 받은 위치가 있으면 바로(시험: getCurrentPosition 을 기다리다 SOS 가 늦었음), 없으면 새로 받음. */
    function here(fn) {
        if (lastPos && Date.now() - lastPos.t < 120000) { fn(lastPos.lat, lastPos.lon, lastPos.acc); return; }
        if (!navigator.geolocation) { roomMsg("이 기기는 위치를 쓸 수 없습니다."); return; }
        navigator.geolocation.getCurrentPosition(function (pos) { fn(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); },
            function () { roomMsg("위치를 받지 못했습니다. 위치 권한을 켜 주세요."); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    }

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; });
    }
    function msg(t) { $("msg").textContent = t || ""; }
    function roomMsg(t) { $("roomMsg").textContent = t || ""; }
    function show(id) { ["closed", "start", "room"].forEach(function (x) { $(x).hidden = x !== id; }); }
    function agoText(s) {
        if (s == null) return "아직 없음";
        if (s < 60) return "방금";
        if (s < 3600) return Math.floor(s / 60) + "분 전";
        return Math.floor(s / 3600) + "시간 " + Math.floor(s % 3600 / 60) + "분 전";
    }
    function clock(ms) {
        var d = new Date(ms);
        return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    }
    /** 하산 마감 - "15:00 까지 1시간 20분" · "15:00 지남 12분". */
    function endText(endAt, now) {
        if (!endAt) return "";
        var left = Math.round((endAt - now) / 60000), a = Math.abs(left), t = (a >= 60 ? Math.floor(a / 60) + "시간 " : "") + (a % 60) + "분";
        return "하산 마감 <b>" + clock(endAt) + "</b> " + (left >= 0 ? "까지 " + t : "<span style=\"color:var(--red)\">지남 " + t + "</span>");
    }

    // ------------------------------------------------------------------ 처음 화면

    function start() {
        fetch("api/party/status", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (s) {
            if (!s.enabled) { show("closed"); return; }
            var p = RFParty.get();
            if (p) { enterRoom(); return; }
            show("start");
            if (q.get("c")) $("joinCode").value = q.get("c").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
            try { $("joinNick").value = localStorage.getItem("rf-party-nick") || ""; } catch (e) { /* 없음 */ }
        }).catch(function () { show("closed"); $("closed").querySelector("p").textContent = "서버에 닿지 않습니다. 인터넷 연결을 확인해 주세요."; });
    }

    $("joinBtn").addEventListener("click", function () {
        var code = $("joinCode").value.trim().toUpperCase(), nick = $("joinNick").value.trim();
        var role = (document.querySelector("input[name=role]:checked") || {}).value || "hiker";
        if (code.length !== 6) { msg("방 코드 6글자를 적어 주세요."); return; }
        if (!nick) { msg("별명을 적어 주세요."); return; }
        if (!$("joinAgree").checked) { msg("위치 제공에 동의해야 참가할 수 있습니다."); return; }
        $("joinBtn").disabled = true;
        RFParty.post("join", { code: code, nick: nick, role: role, agree: true }).then(function (j) {
            try { localStorage.setItem("rf-party-nick", nick); } catch (e) { /* 이번만 */ }
            RFParty.set({ code: j.code, token: j.token, role: j.role, name: j.name });
            enterRoom(j);
        }).catch(function (e) { msg(e.message); }).finally(function () { $("joinBtn").disabled = false; });
    });

    $("mkBtn").addEventListener("click", function () {
        var name = $("mkName").value.trim(), hm = $("mkEnd").value, endAt = 0;
        if (!name) { msg("산행 이름을 적어 주세요."); return; }
        if (hm) {   // 오늘 그 시각, 이미 지났으면 내일(무박 산행 - 밤에 만들고 다음 날 하산)
            var d = new Date(), p = hm.split(":");
            d.setHours(+p[0], +p[1], 0, 0);
            if (d.getTime() < Date.now() - 3600000) d.setDate(d.getDate() + 1);
            endAt = d.getTime();
        }
        $("mkBtn").disabled = true;
        RFParty.post("create", { name: name, endAt: endAt }).then(function (j) {
            RFParty.set({ code: j.code, token: j.token, role: "lead", name: j.name });
            enterRoom(j);
        }).catch(function (e) { msg(e.message); }).finally(function () { $("mkBtn").disabled = false; });
    });

    // ------------------------------------------------------------------ 방 화면

    function enterRoom(first) {
        show("room");
        var p = RFParty.get(), staff = p.role === "lead" || p.role === "driver";
        $("title").textContent = "🧑‍🤝‍🧑 " + (p.name || "산악회 방");
        $("staffBox").hidden = !staff;
        $("hikerBox").hidden = staff;
        $("leadRow").hidden = p.role !== "lead";
        $("noticeRow").hidden = p.role !== "lead";
        $("endBtn").hidden = p.role !== "lead";
        $("leaveBtn").hidden = p.role === "lead";
        startMap();
        if (first) render(first);
        else refresh();
        if (navigator.geolocation) {
            watch = navigator.geolocation.watchPosition(function (pos) {
                lastPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() };
                var r = RFParty.fix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                if (r) r.then(render).catch(fail);
            }, function () { roomMsg("위치를 받지 못하고 있습니다 - 위치 권한을 켜 주세요."); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
        }
        clearInterval(pollTimer);
        pollTimer = setInterval(refresh, staff ? 15000 : 30000);
    }

    function refresh() {
        var p = RFParty.get();
        if (!p) { location.reload(); return; }
        RFParty.post("view", { token: p.token }).then(render).catch(fail);
    }

    function fail(e) {
        if (!RFParty.get()) {   // 방이 끝남 - 이 기기 방 정보는 party-kit 이 지웠음
            clearInterval(pollTimer);
            if (watch != null) navigator.geolocation.clearWatch(watch);
            alert("방이 끝났습니다. 위치는 더 보내지 않습니다.");
            location.href = "party.html";
            return;
        }
        roomMsg("잠시 연결이 안 됩니다(" + (e && e.message || e) + "). 저절로 다시 합니다.");
    }

    function render(s) {
        state = s;
        roomMsg("");
        var p = RFParty.get() || {}, staff = s.role === "lead" || s.role === "driver";
        var bar = ["방 코드 <b id=\"code\">" + esc(s.code) + "</b>", "참가 <b>" + s.count + "</b>명"];
        if (staff) bar.push("탑승 <b>" + (s.aboardCount || 0) + "</b> / " + (s.members || []).filter(function (m) { return m.role === "hiker"; }).length);
        if (s.endAt) bar.push(endText(s.endAt, s.now));
        $("bar").innerHTML = bar.join(" · ");
        if (s.notice) {
            $("notice").style.display = "block";
            $("notice").textContent = "📢 " + s.notice + " (" + clock(s.noticeAt) + ")";
            if (lastNoticeAt !== null && s.noticeAt !== lastNoticeAt && !staff) {   // 새 공지 - 소리 · 떨림
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                try { speechSynthesis.speak(new SpeechSynthesisUtterance(s.notice)); } catch (e) { /* 없음 */ }
            }
            lastNoticeAt = s.noticeAt;
            if (p.noticeAt !== s.noticeAt) { p.noticeAt = s.noticeAt; RFParty.set(p); }
        }
        if (!staff) {
            $("aboardBtn").className = s.aboard ? "on" : "";
            $("aboardBtn").textContent = s.aboard ? "✅ 탑승함(누르면 취소)" : "🚌 버스 탑승(하산 끝)";
            $("sosBtn").className = p.sos ? "sos" : "danger";
            $("sosBtn").textContent = p.sos ? "🆘 SOS 보냄 - 누르면 풂" : "🆘 인솔자에게 SOS";
        } else {
            list(s);
        }
        drawMap(s);
    }

    /** 인솔자 · 운전자 목록 - SOS → 10분 넘게 소식 없음 → 오래 그 자리 → 나머지, 탑승한 사람은 맨 아래. */
    function list(s) {
        var rows = (s.members || []).filter(function (m) { return m.id !== s.me; });
        rows.sort(function (a, b) {
            var ka = rank(a), kb = rank(b);
            return ka !== kb ? ka - kb : (b.stillMin || 0) - (a.stillMin || 0);
        });
        $("listTitle").textContent = "회원 " + rows.length + "명";
        $("list").innerHTML = rows.map(function (m) {
            var cls = m.sos ? "sos" : m.aboard ? "aboard" : (m.ago == null || m.ago > OLD_S) ? "old" : "";
            var st = m.sos ? "🆘 SOS" : m.aboard ? "🚌 탑승" : m.role === "driver" ? "운전" : "";
            return "<tr class=\"" + cls + "\" data-id=\"" + m.id + "\"><td>" + esc(m.nick) + "</td><td>" + agoText(m.ago) + "</td><td>"
                + (m.stillMin != null && m.ago != null ? m.stillMin + "분" : "-") + "</td><td>" + (m.batt != null ? m.batt + "%" : "-") + "</td><td>" + st + "</td></tr>";
        }).join("") || "<tr><td colspan=\"5\">아직 참가한 회원이 없습니다. 참가 링크를 보내 주세요.</td></tr>";
        function rank(m) { return m.sos ? 0 : m.aboard ? 4 : (m.ago == null || m.ago > OLD_S) ? 1 : (m.stillMin || 0) >= 15 ? 2 : 3; }
    }

    $("list").addEventListener("click", function (e) {   // 줄을 누르면 지도에서 그 사람
        var tr = e.target.closest("tr[data-id]");
        if (!tr || !state || !map) return;
        var m = (state.members || []).filter(function (x) { return String(x.id) === tr.getAttribute("data-id"); })[0];
        if (m && m.lat != null) { map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(map.getZoom(), 15) }); window.scrollTo({ top: $("mapBox").offsetTop - 70, behavior: "smooth" }); }
    });

    // ------------------------------------------------------------------ 지도

    function startMap() {
        if (map) return;
        fetch("api/map-config").then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) {
            var cfg = { demUrl: c.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: c.vworldKey || null };
            map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 6,
                attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
            map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
            map.once("load", function () { if (state) drawMap(state, true); });
        });
    }

    var fitted = false;
    function drawMap(s, force) {
        if (!map || !map.loaded()) return;
        var seen = {}, pts = [];
        function put(key, lon, lat, cls, label) {
            seen[key] = 1;
            pts.push([lon, lat]);
            var mk = marks[key];
            if (!mk) {
                var el = document.createElement("div");
                el.innerHTML = "<div class=\"d\"></div><div class=\"l\"></div>";
                mk = marks[key] = new maplibregl.Marker({ element: el, anchor: "top", offset: [0, -9] }).setLngLat([lon, lat]).addTo(map);
            }
            mk.setLngLat([lon, lat]);
            mk.getElement().className = "pm " + cls;
            mk.getElement().querySelector(".l").textContent = label;
            if (cls.indexOf("bus") >= 0) mk.getElement().querySelector(".d").textContent = "🚌";
        }
        (s.members || []).forEach(function (m) {
            if (m.lat == null) return;
            var cls = m.sos ? "sos" : m.aboard ? "aboard" : m.role === "lead" ? "lead" : (m.ago > OLD_S ? "old" : "");
            put("m" + m.id, m.lon, m.lat, cls, (m.id === s.me ? "나" : m.nick) + (m.ago > OLD_S ? " · " + agoText(m.ago) : ""));
        });
        if (s.busLat != null) put("bus", s.busLon, s.busLat, "bus", "버스");
        Object.keys(marks).forEach(function (k) { if (!seen[k]) { marks[k].remove(); delete marks[k]; } });
        if ((!fitted || force) && pts.length) {   // 처음 한 번만 모두 보이게(그 뒤로는 사람이 움직인 지도 그대로)
            fitted = true;
            if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 14 });
            else {
                var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
                pts.forEach(function (x) { b.extend(x); });
                map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
            }
        }
    }

    // ------------------------------------------------------------------ 단추

    $("shareBtn").addEventListener("click", function () {
        var p = RFParty.get();
        var url = location.origin + location.pathname + "?c=" + p.code;
        var text = "[" + (p.name || "산악회") + "] routefly 산악회 방 - 코드 " + p.code + "\n" + url;
        if (navigator.share) navigator.share({ title: "산악회 방", text: text }).catch(function () { /* 닫음 */ });
        else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { roomMsg("참가 링크를 복사했습니다. 단톡방에 붙여 넣으세요."); });
        else prompt("이 글을 복사해 보내세요", text);
    });

    $("aboardBtn").addEventListener("click", function () {
        var p = RFParty.get();
        RFParty.post("aboard", { token: p.token, on: !(state && state.aboard) }).then(render).catch(fail);
    });

    $("sosBtn").addEventListener("click", function () {
        var p = RFParty.get();
        if (!p.sos && !confirm("인솔자에게 SOS 를 보낼까요? (119 신고는 따라가기의 SOS 를 쓰세요)")) return;
        RFParty.sos(!p.sos);
        here(function (lat, lon, acc) {
            var r = RFParty.fix(lat, lon, acc, true);   // 보내는 중이었으면 party-kit 이 끝난 뒤 다시 보냄
            if (r) r.then(render).catch(fail);
        });
        if (state) render(state);
    });

    $("busBtn").addEventListener("click", function () {
        var p = RFParty.get();
        here(function (lat, lon) {
            RFParty.post("bus", { token: p.token, lat: +lat.toFixed(6), lon: +lon.toFixed(6) }).then(render).catch(fail);
        });
    });

    $("noticeBtn").addEventListener("click", function () {
        var p = RFParty.get(), t = $("noticeText").value.trim();
        if (!t) return;
        RFParty.post("notice", { token: p.token, text: t }).then(function (j) { $("noticeText").value = ""; render(j); }).catch(fail);
    });

    $("leaveBtn").addEventListener("click", function () {
        if (!confirm("방을 나갈까요? 인솔자 화면에서 내 위치가 지워집니다.")) return;
        var p = RFParty.get();
        RFParty.post("leave", { token: p.token }).catch(function () { /* 이미 끝났어도 */ }).finally(function () { RFParty.clear(); location.href = "party.html"; });
    });

    $("endBtn").addEventListener("click", function () {
        if (!confirm("방을 끝낼까요? 모든 회원의 위치가 지워지고 다시 열 수 없습니다.")) return;
        var p = RFParty.get();
        RFParty.post("end", { token: p.token }).catch(function () { /* 이미 끝났어도 */ }).finally(function () { RFParty.clear(); location.href = "party.html"; });
    });

    start();
})();

// 글자 크기 "가+" - 위 줄 오른쪽(다른 화면과 같은 설정)
(function () { var top = document.getElementById("top"); if (top && window.RF && RF.textButton) top.appendChild(RF.textButton()); })();
