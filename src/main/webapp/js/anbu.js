/*
 * 🏠 오늘의 안부(anbu.html - 2026-10-17 홍TV님): 혼자 사는 분을 위한 가벼운 안부 확인. 서버 없이 이 핸드폰에서만.
 *   - 하루 한 번 "오늘도 잘 지내요" → 오늘 확인(rf-anbu.log), 켜 두면 보호자에게 보낼 문자를 내 문자 앱으로 열어 줌(보내기는 사람이)
 *   - 앱(Capacitor LocalNotifications): 정한 시각 · 2시간 뒤 · 4시간 뒤 알림(5분마다 다시 울림을 켜면 처음 1시간은 5분마다 - RF.anbuPlan). 오늘 확인하면 오늘 남은 알림은 지움
 *   - 119 자동 신고는 하지 않음(기술로도 막혀 있고 잘못된 신고가 생김) - 큰 119 전화 단추만
 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var LANG = RF.pageLang(location.search, lsGet("rf-lang"));
    if (/[?&]lang=(en|ko)\b/.test(location.search)) { try { localStorage.setItem("rf-lang", LANG); } catch (e) { /* 이번만 */ } }
    var EN = LANG === "en", T = RF.tr;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - Daily check-in"; RF.applyEn(document); }
    // 가 · A 글자 크기(2026-10-18 홍TV님 - 어르신은 글자가 작아 못 봄). 누를 때마다 100 → 120 → 140%, 모든 화면이 같은 설정
    document.getElementById("top").appendChild(RF.textButton());
    if (EN) document.getElementById("backLink").setAttribute("href", "en/m/");

    var KEY = "rf-anbu";
    var st = { on: false, time: "10:00", gName: "", gTel: "", sms: true, rep5: false, log: [] };   // on - 설정을 저장한 뒤부터 매일 알림
    try { var s0 = JSON.parse(lsGet(KEY) || "null"); if (s0) for (var k in s0) if (Object.prototype.hasOwnProperty.call(st, k)) st[k] = s0[k]; } catch (e) { /* 처음 */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장 공간 */ } }

    // 앱 알림(Capacitor - 서버 주소를 띄우는 앱이라 registerPlugin 이 없음, hike.js 와 같게 Plugins 에서)
    var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    var LN = NATIVE && (!CAP.isPluginAvailable || CAP.isPluginAvailable("LocalNotifications")) && CAP.Plugins && CAP.Plugins.LocalNotifications || null;
    var CH = "rf-anbu";

    function toast(t, ms) {
        var el = $("toast");
        el.textContent = t;
        el.style.display = "block";
        clearTimeout(toast.t);
        toast.t = setTimeout(function () { el.style.display = "none"; }, ms || 3500);
    }
    function clock(ms) { var d = new Date(ms); return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
    function smsHref(tel, body) { return "sms:" + (tel || "") + (/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?") + "body=" + encodeURIComponent(body); }
    function today() { return RF.dayKey(Date.now()); }
    function checkedToday() { var l = st.log[st.log.length - 1]; return l && l.day === today() ? l : null; }

    /** 앱 알림 다시 맞춤 - 안부(7일 치). 앱이 아니면 아무것도 안 함. */
    function reschedule() {
        if (!LN) return Promise.resolve();
        var ids = [];
        for (var i = 7100; i < 7232; i++) ids.push({ id: i });   // 7일 × 16 + 예전 늦은 귀가(7130 · 7131)
        return Promise.resolve(LN.createChannel({ id: CH, name: T("routefly 안부 확인", "routefly check-in"), importance: 5, visibility: 1, vibration: true })).catch(function () { /* 이미 있음 */ })
            .then(function () { return Promise.resolve(LN.cancel({ notifications: ids })).catch(function () { /* 없음 */ }); })
            .then(function () {
                var c = checkedToday(), plan = st.on ? RF.anbuPlan(Date.now(), st.time, c ? c.day : null, 7, st.rep5) : [];
                var list = plan.map(function (p) {
                    var tx = RF.anbuText(p.k, EN);
                    return { id: p.id, title: tx[0], body: tx[1], schedule: { at: new Date(p.at), allowWhileIdle: true }, channelId: CH, extra: { page: "anbu" } };
                });
                if (!list.length) return null;
                return Promise.resolve(LN.requestPermissions()).catch(function () { return null; })
                    .then(function () { return LN.schedule({ notifications: list }); });
            }).catch(function () { toast(T("알림을 맞추지 못했습니다(알림 권한을 확인하세요).", "Could not set reminders (check notification permission)."), 5000); });
    }

    function draw() {
        var c = checkedToday(), s = $("status");
        s.className = "status" + (c ? "" : " todo");
        s.innerHTML = "";
        var b = document.createElement("b");
        b.textContent = c ? T("✅ 오늘 안부 확인 " + clock(c.t), "✅ Checked in today at " + clock(c.t)) : T("오늘 안부를 아직 안 남겼어요", "No check-in yet today");
        s.appendChild(b);
        s.appendChild(document.createElement("br"));
        s.appendChild(document.createTextNode(!st.on ? T("아래 설정에서 시각 · 보호자를 정하고 저장하세요", "Set your time and guardian below, then Save") : LN ? T("매일 " + st.time + " 에 알림이 울립니다", "Reminder every day at " + st.time) : T("알림은 routefly 앱에서만 울립니다", "Reminders ring only in the routefly app")));
        $("okBtn").classList.toggle("done", !!c);
        $("okBtn").textContent = c ? T("✅ 오늘 확인 완료", "✅ Done for today") : T("😊 오늘도 잘 지내요", "😊 I'm fine today");
        var last = st.log.slice(-7).reverse().map(function (l) { return l.day.slice(5).replace("-", "/") + " " + clock(l.t); });
        $("log").textContent = last.length ? T("최근 확인: ", "Recent: ") + last.join(" · ") : "";
        // 📞 보호자에게 전화(2026-10-18 홍TV님 - 119 처럼 누르면 전화 걸기 화면). 번호가 없으면 설정으로
        $("helpCall").href = st.gTel ? "tel:" + st.gTel : "#settings";
        timeSel.set.time(st.time);
        $("gName").value = st.gName;
        $("gTel").value = RF.telFormat(st.gTel);
        $("smsOn").checked = !!st.sms;
        $("rep5").checked = !!st.rep5;
    }

    $("okBtn").addEventListener("click", function () {
        var now = Date.now(), c = checkedToday();
        if (!c) { st.log.push({ day: today(), t: now }); st.log = st.log.slice(-60); save(); }
        draw();
        reschedule();
        // 설정 전(보호자 번호 · 매일 알림 없음)이면 이 핸드폰에만 남는다는 것을 알리고 설정으로(2026-10-18 홍TV님: 설정 없이 눌러도 그냥 됐음)
        if (!st.on || !st.gTel) {
            toast(T("오늘 안부를 이 핸드폰에 남겼어요. 보호자에게 알리고 매일 알림을 받으려면 아래 설정을 저장해 주세요.",
                "Checked in on this phone. To let your guardian know and get daily reminders, save the settings below."), 6000);
            $("settings").scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        // 오늘 이미 확인했으면 문자는 물어보고(2026-10-18 PC: 다시 누를 때마다 문자가 또 열렸음 - 여러 번 누르는 어르신)
        if (c) {
            if (st.sms && confirm(T("오늘은 이미 안부를 남겼어요(" + clock(c.t) + "). 보호자에게 문자를 다시 보낼까요?", "Already checked in today (" + clock(c.t) + "). Text your guardian again?")))
                location.href = smsHref(st.gTel, RF.anbuSms(clock(now), EN));
            return;
        }
        toast(T("😊 고맙습니다. 오늘 안부를 남겼어요.", "😊 Thanks! Checked in for today."));
        if (st.sms) location.href = smsHref(st.gTel, RF.anbuSms(clock(now), EN));
    });
    $("saveBtn").addEventListener("click", function () {
        var tel = $("gTel").value.trim();
        if (tel && !RF.telClean(tel)) { toast(T("전화번호를 확인해 주세요(숫자 8 ~ 15자리).", "Check the phone number (8-15 digits)."), 4000); return; }
        st.time = $("time").value || "10:00";
        st.gName = $("gName").value.trim().slice(0, 20);
        st.gTel = RF.telClean(tel);
        st.sms = $("smsOn").checked;
        st.rep5 = $("rep5").checked;
        st.on = true;
        save();
        draw();
        reschedule().then(function () { toast(LN ? T("저장했습니다. 매일 " + st.time + " 에 알림이 울립니다.", "Saved. Reminder every day at " + st.time + ".") : T("저장했습니다.", "Saved.")); });
    });

    /** 시 · 분 선택 상자 - 숨긴 입력(id)에 "HH:MM" 을 맞춤. 분은 5분 단위(지금 값이 5분 단위가 아니면 그 값도). */
    function hourLabel(h) { return EN ? (h % 12 || 12) + (h < 12 ? " AM" : " PM") : (h < 12 ? "오전 " : "오후 ") + (h % 12 || 12) + "시"; }
    function timeSel(id) {
        var box = document.querySelector('.tsel[data-for="' + id + '"]'), inp = $(id), hs = document.createElement("select"), ms = document.createElement("select"), sep = document.createElement("b");
        hs.setAttribute("aria-label", T("시", "Hour"));
        ms.setAttribute("aria-label", T("분", "Minute"));
        sep.textContent = ":";
        for (var h = 0; h < 24; h++) hs.add(new Option(hourLabel(h), String(h)));
        box.appendChild(hs); box.appendChild(sep); box.appendChild(ms);
        function minutes(cur) {
            ms.textContent = "";
            for (var m = 0; m < 60; m += 5) ms.add(new Option(String(m).padStart(2, "0") + T("분", ""), String(m)));
            if (cur % 5) { var o = new Option(String(cur).padStart(2, "0") + T("분", ""), String(cur)); ms.add(o, ms.options[Math.ceil(cur / 5)] || null); }
        }
        function sync() { inp.value = String(hs.value).padStart(2, "0") + ":" + String(ms.value).padStart(2, "0"); }
        hs.addEventListener("change", sync);
        ms.addEventListener("change", sync);
        timeSel.set[id] = function (v) {
            var p = /^(\d{1,2}):(\d{2})$/.exec(v || "") || [0, "10", "00"];
            minutes(+p[2]);
            hs.value = String(+p[1]);
            ms.value = String(+p[2]);
            sync();
        };
    }
    timeSel.set = {};
    timeSel("time");
    // 설정 초기화(2026-10-18 홍TV님) - 시각 · 보호자 · 안부 기록을 지우고 앱 알림도 끔
    $("resetBtn").addEventListener("click", function () {
        if (!confirm(T("안부 설정을 처음으로 되돌릴까요?\n보호자 이름 · 번호, 안부 기록, 매일 알림이 모두 지워집니다.",
            "Reset check-in settings?\nGuardian name and number, check-in history and daily reminders will be cleared."))) return;
        st = { on: false, time: "10:00", gName: "", gTel: "", sms: true, rep5: false, log: [] };
        try { localStorage.removeItem(KEY); } catch (e) { /* 이번만 */ }
        reschedule();   // on 이 꺼져 매일 알림은 지우기만 함
        draw();
        toast(T("처음 상태로 되돌렸습니다.", "Settings reset."));
    });
    $("helpCall").addEventListener("click", function () {
        if (!st.gTel) toast(T("먼저 아래 설정에서 보호자 전화번호를 저장해 주세요.", "Save your guardian's number in Settings below first."), 4000);
    });
    // 전화번호는 숫자만 쳐도 010-1234-5678 로, - 를 쳐도 무시(2026-10-18 홍TV님)
    $("gTel").addEventListener("input", function () { var v = RF.telFormat(this.value); if (v !== this.value) this.value = v; });
    draw();
    reschedule();
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") draw(); });   // 날이 바뀐 뒤 다시 열 때
})();
