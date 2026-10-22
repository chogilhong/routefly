/* 🧭 안내산악회 계정 화면(2026-10-22 홍TV님) - 로그인 · 가입 · 일정 올리기 · 산악회 방 만들기 · (운영자) 확인 · 추천. 로그인은 쿠키(rf-club, HttpOnly) */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var DOW = ["일", "월", "화", "수", "목", "금", "토"], me = null;
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function when(ms) { var d = new Date(ms); return (d.getMonth() + 1) + "/" + d.getDate() + "(" + DOW[d.getDay()] + ") " + two(d.getHours()) + ":" + two(d.getMinutes()); }
    function msg(id, t, ok) { $(id).textContent = t || ""; $(id).className = "msg" + (ok ? " ok" : ""); }
    function post(path, body) {
        return fetch("api/club/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin", body: JSON.stringify(body || {}) })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    if (!r.ok) { var e = new Error(j.message || (navigator.onLine === false ? "인터넷에 연결되지 않았습니다." : "잠시 뒤 다시 해 주세요(" + r.status + ").")); e.status = r.status; throw e; }
                    return j;
                });
            });
    }

    function show(j) {
        me = j;
        $("out").hidden = true; $("in").hidden = false;
        var c = j.club;
        $("myName").textContent = c.name + " (" + c.login + ")";
        $("myState").innerHTML = c.approved
            ? "<span class=\"st ok\">✅ 확인된 산악회</span> - 일정이 산 페이지 · 일정 모음에 공개됩니다." + (c.featuredUntil ? " <span class=\"st\">⭐ 추천 " + esc(new Date(c.featuredUntil).toLocaleDateString("ko-KR")) + "까지</span>" : "")
            : "<span class=\"st wait\">⏳ 운영자 확인 기다림</span> - 확인되면 올린 일정이 공개됩니다(보통 하루 안).";
        $("edName").value = c.name; $("edPhone").value = c.phone; $("edUrl").value = c.url || ""; $("edIntro").value = c.intro || "";
        var t = j.trips || [];
        $("myTrips").innerHTML = t.length ? t.map(function (x) {
            return "<div class=\"trip\"><b>" + when(x.departAt) + "</b> [" + esc(x.mountain) + "] " + esc(x.title)
                + "<br><span class=\"dim\">" + (x.stops ? esc(x.stops) : "탑승지 없음") + (x.price ? " · " + Number(x.price).toLocaleString("ko-KR") + "원" : "") + (x.bookUrl ? " · 예약 주소 있음" : "") + "</span>"
                + "<div class=\"row\"><a class=\"btn\" href=\"" + esc(roomUrl(x, c)) + "\">🧭 산악회 방</a><button type=\"button\" data-edit=\"" + x.id + "\">✏️ 고치기</button>"
                + "<button type=\"button\" class=\"danger\" data-del=\"" + x.id + "\">지우기</button></div></div>";
        }).join("") : "<p class=\"dim\">아직 올린 일정이 없습니다.</p>";
    }
    /** 산악회 방 만들기 화면 - 이 일정으로 채움(party.js 가 mk 매개변수를 읽음). */
    function roomUrl(x, c) {
        var d = new Date(x.departAt);
        var q = new URLSearchParams({ mk: "1", n: x.title, d: two(d.getMonth() + 1) + two(d.getDate()), t: two(d.getHours()) + two(d.getMinutes()),
            st: (x.stops || "").replace(/\s*\d{1,2}:\d{2}/g, ""), ld: c.name, ph: c.phone });
        return "party.html?" + q.toString();
    }
    function out() { me = null; $("in").hidden = true; $("out").hidden = false; }

    function load() {
        post("me").then(show).catch(function (e) {
            if (e.status === 404) { $("closed").hidden = false; return; }
            out();
        }).finally(admin);
    }

    // ---------------------------------------------------------------- 로그인 · 가입
    $("liBtn").addEventListener("click", function () {
        msg("liMsg", "확인하는 중…", true);
        post("login", { login: $("liId").value.trim(), password: $("liPw").value }).then(function (j) { $("liPw").value = ""; msg("liMsg", ""); show(j); })
            .catch(function (e) { msg("liMsg", e.message); });
    });
    $("liPw").addEventListener("keydown", function (e) { if (e.key === "Enter") $("liBtn").click(); });
    $("suBtn").addEventListener("click", function () {
        if ($("suPw").value !== $("suPw2").value) { msg("suMsg", "비밀번호 확인이 다릅니다."); return; }
        if (!$("suAgree").checked) { msg("suMsg", "개인정보 수집 · 이용에 동의해 주세요."); return; }
        msg("suMsg", "가입하는 중…", true);
        post("signup", { login: $("suId").value.trim(), password: $("suPw").value, name: $("suName").value.trim(), phone: $("suPhone").value.trim(),
            url: $("suUrl").value.trim() || null, agree: true })
            .then(function (j) { $("suPw").value = $("suPw2").value = ""; msg("suMsg", ""); show(j); window.scrollTo(0, 0); })
            .catch(function (e) { msg("suMsg", e.message); });
    });
    $("loBtn").addEventListener("click", function () { post("logout").finally(out); });

    // ---------------------------------------------------------------- 일정
    function resetTrip() {
        $("trId").value = ""; $("trTitle").value = ""; $("trStops").value = ""; $("trPrice").value = ""; $("trUrl").value = "";
        $("tripTitle").textContent = "📅 일정 올리기"; $("trBtn").textContent = "일정 올리기"; $("trCancel").hidden = true;
    }
    $("trCancel").addEventListener("click", resetTrip);
    $("trBtn").addEventListener("click", function () {
        var d = $("trDate").value, t = $("trTime").value || "07:00";
        if (!d) { msg("trMsg", "출발 날짜를 골라 주세요."); return; }
        var at = new Date(d + "T" + t + ":00").getTime();
        if (!isFinite(at)) { msg("trMsg", "날짜 · 시각을 확인해 주세요."); return; }
        var body = { departAt: at, mountain: $("trMt").value.trim(), title: $("trTitle").value.trim(), stops: $("trStops").value.trim() || null,
            price: Math.max(0, Math.round(+$("trPrice").value || 0)), bookUrl: $("trUrl").value.trim() || null };
        if ($("trId").value) body.id = +$("trId").value;
        post("trip", body).then(function (j) { show(j); msg("trMsg", body.id ? "고쳤습니다." : "올렸습니다.", true); resetTrip(); }).catch(function (e) { msg("trMsg", e.message); });
    });
    $("myTrips").addEventListener("click", function (e) {
        var ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
        if (ed && me) {
            var x = (me.trips || []).filter(function (t) { return String(t.id) === ed.getAttribute("data-edit"); })[0];
            if (!x) return;
            var d = new Date(x.departAt);
            $("trId").value = x.id; $("trDate").value = d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()); $("trTime").value = two(d.getHours()) + ":" + two(d.getMinutes());
            $("trMt").value = x.mountain; $("trTitle").value = x.title; $("trStops").value = x.stops || ""; $("trPrice").value = x.price || ""; $("trUrl").value = x.bookUrl || "";
            $("tripTitle").textContent = "✏️ 일정 고치기"; $("trBtn").textContent = "고친 것 저장"; $("trCancel").hidden = false;
            $("tripTitle").scrollIntoView({ behavior: "smooth" });
        }
        if (del && confirm("이 일정을 지울까요?")) post("trip-delete", { id: +del.getAttribute("data-del") }).then(show).catch(function (er) { msg("trMsg", er.message); });
    });

    // ---------------------------------------------------------------- 정보 · 비밀번호 · 탈퇴
    $("edBtn").addEventListener("click", function () {
        post("edit", { name: $("edName").value.trim(), phone: $("edPhone").value.trim(), url: $("edUrl").value.trim() || null, intro: $("edIntro").value.trim() || null })
            .then(function (j) { show(j); msg("edMsg", "저장했습니다.", true); }).catch(function (e) { msg("edMsg", e.message); });
    });
    $("pwBtn").addEventListener("click", function () {
        post("password", { old: $("pwOld").value, password: $("pwNew").value }).then(function () { $("pwOld").value = $("pwNew").value = ""; msg("pwMsg", "바꿨습니다. 다른 기기의 로그인은 끊었습니다.", true); })
            .catch(function (e) { msg("pwMsg", e.message); });
    });
    $("delBtn").addEventListener("click", function () {
        if (!confirm("정말 탈퇴할까요? 산악회 정보와 일정이 모두 지워집니다.")) return;
        post("delete", { password: $("delPw").value }).then(function () { alert("탈퇴했습니다. 그동안 고맙습니다."); out(); }).catch(function (e) { msg("delMsg", e.message); });
    });

    // ---------------------------------------------------------------- 운영자(통계 화면을 연 기기만 - 아니면 404 라 안 보임)
    function admin() {
        post("admin/list").then(drawAdmin).catch(function () { $("admin").hidden = true; });
    }
    function drawAdmin(j) {
        $("admin").hidden = false;
        var cs = j.clubs || [];
        $("adminList").innerHTML = "<tr><th>산악회</th><th>확인</th><th>추천(일)</th><th></th></tr>" + (cs.length ? cs.map(function (c) {
            return "<tr><td>" + esc(c.name) + " <span class=\"dim\">(" + esc(c.login) + " · " + esc(c.phone) + " · 일정 " + c.trips + " · " + esc(c.created) + ")</span>"
                + (c.url ? "<br><a href=\"" + esc(c.url) + "\" target=\"_blank\" rel=\"noopener nofollow\">" + esc(c.url) + "</a>" : "") + "</td>"
                + "<td><button type=\"button\" data-ap=\"" + c.id + "\" data-on=\"" + (!c.approved) + "\">" + (c.approved ? "✅ 풀기" : "⏳ 확인") + "</button></td>"
                + "<td><input type=\"number\" min=\"0\" max=\"400\" id=\"fd" + c.id + "\" value=\"" + (c.featuredUntil ? Math.ceil((c.featuredUntil - Date.now()) / 86400000) : 0) + "\"><button type=\"button\" data-ft=\"" + c.id + "\">저장</button></td>"
                + "<td><button type=\"button\" data-rs=\"" + c.id + "\">임시 비번</button></td></tr>";
        }).join("") : "<tr><td colspan=\"4\">아직 가입한 산악회가 없습니다.</td></tr>");
    }
    $("adminList").addEventListener("click", function (e) {
        var ap = e.target.closest("[data-ap]"), ft = e.target.closest("[data-ft]"), rs = e.target.closest("[data-rs]");
        if (ap) post("admin/approve", { id: +ap.getAttribute("data-ap"), on: ap.getAttribute("data-on") === "true" }).then(drawAdmin).catch(function (er) { msg("adMsg", er.message); });
        if (ft) post("admin/feature", { id: +ft.getAttribute("data-ft"), days: Math.max(0, Math.round(+$("fd" + ft.getAttribute("data-ft")).value || 0)) })
            .then(function (j) { drawAdmin(j); msg("adMsg", "추천 기간을 저장했습니다.", true); }).catch(function (er) { msg("adMsg", er.message); });
        if (rs && confirm("전화로 본인 확인을 했나요? 임시 비밀번호를 만들면 그 산악회의 로그인이 모두 끊깁니다."))
            post("admin/reset", { id: +rs.getAttribute("data-rs") }).then(function (j) { drawAdmin(j); msg("adMsg", "임시 비밀번호: " + j.temp + " (전화로만 알려 주고, 로그인 뒤 바꾸라고 하세요)", true); })
                .catch(function (er) { msg("adMsg", er.message); });
    });

    // 산 이름 고르기(100대 명산)
    fetch("data/mountains100.json").then(function (r) { return r.json(); }).then(function (j) {
        $("mtList").innerHTML = (j.peaks || []).map(function (p) { return "<option value=\"" + esc(p.id) + "\">"; }).join("");
    }).catch(function () { /* 그냥 적기 */ });
    var tm = new Date(Date.now() + 7 * 86400000);
    $("trDate").value = tm.getFullYear() + "-" + two(tm.getMonth() + 1) + "-" + two(tm.getDate());
    load();
})();
