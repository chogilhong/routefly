/*
 * 🏠 오늘의 안부(anbu.html - 2026-10-17 홍TV님): 혼자 사는 분 · 늦은 귀가를 위한 가벼운 안부 확인. 서버 없이 이 핸드폰에서만.
 *   - 하루 한 번 "오늘도 잘 지내요" → 오늘 확인(rf-anbu.log), 켜 두면 보호자에게 보낼 문자를 내 문자 앱으로 열어 줌(보내기는 사람이)
 *   - 앱(Capacitor LocalNotifications): 정한 시각 · 2시간 뒤 · 4시간 뒤 알림(RF.anbuPlan). 오늘 확인하면 오늘 남은 알림은 지움
 *   - 늦은 귀가: 도착 예정 시각 · 30분 뒤 알림, "집에 왔어요" 로 끝
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

    var KEY = "rf-anbu";
    var st = { on: false, time: "10:00", gName: "", gTel: "", sms: true, log: [], late: null };   // on - 설정을 저장한 뒤부터 매일 알림
    try { var s0 = JSON.parse(lsGet(KEY) || "null"); if (s0) for (var k in s0) if (Object.prototype.hasOwnProperty.call(st, k)) st[k] = s0[k]; } catch (e) { /* 처음 */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장 공간 */ } }

    // 앱 알림(Capacitor - 서버 주소를 띄우는 앱이라 registerPlugin 이 없음, hike.js 와 같게 Plugins 에서)
    var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    var LN = NATIVE && (!CAP.isPluginAvailable || CAP.isPluginAvailable("LocalNotifications")) && CAP.Plugins && CAP.Plugins.LocalNotifications || null;
    var CH = "rf-anbu", LATE_IDS = [7130, 7131];

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

    /** 앱 알림 다시 맞춤 - 안부(7일 치) · 늦은 귀가. 앱이 아니면 아무것도 안 함. */
    function reschedule() {
        if (!LN) return Promise.resolve();
        var ids = [];
        for (var i = 0; i < 21; i++) ids.push({ id: 7100 + i });
        return Promise.resolve(LN.createChannel({ id: CH, name: T("routefly 안부 확인", "routefly check-in"), importance: 5, visibility: 1, vibration: true })).catch(function () { /* 이미 있음 */ })
            .then(function () { return Promise.resolve(LN.cancel({ notifications: ids.concat(LATE_IDS.map(function (id) { return { id: id }; })) })).catch(function () { /* 없음 */ }); })
            .then(function () {
                var c = checkedToday(), plan = st.on ? RF.anbuPlan(Date.now(), st.time, c ? c.day : null, 7) : [];
                var list = plan.map(function (p) {
                    var tx = RF.anbuText(p.k, EN);
                    return { id: p.id, title: tx[0], body: tx[1], schedule: { at: new Date(p.at), allowWhileIdle: true }, channelId: CH, extra: { page: "anbu" } };
                });
                if (st.late && !st.late.home && st.late.at > Date.now() - 1800000) {
                    if (st.late.at > Date.now()) list.push({ id: LATE_IDS[0], title: T("🌙 집에 도착하셨나요?", "🌙 Are you home?"), body: T("도착했으면 눌러서 '집에 왔어요' 를 알려 주세요.", "Tap and press \"I'm home\"."),
                        schedule: { at: new Date(st.late.at), allowWhileIdle: true }, channelId: CH, extra: { page: "anbu" } });
                    list.push({ id: LATE_IDS[1], title: T("아직 집 도착 확인이 없어요", "Still no \"I'm home\""), body: T("괜찮으면 눌러 주세요. 도움이 필요하면 친구 · 가족에게 연락하세요.", "Tap if you are fine. If you need help, contact a friend or family."),
                        schedule: { at: new Date(st.late.at + 1800000), allowWhileIdle: true }, channelId: CH, extra: { page: "anbu" } });
                }
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
        $("helpSms").href = smsHref(st.gTel, RF.anbuSms("help", clock(Date.now()), EN));
        var L = st.late;
        $("lateState").textContent = !L ? "" : L.home ? T("🏠 " + clock(L.home) + " 집 도착 확인", "🏠 Home at " + clock(L.home))
            : T("도착 예정 " + clock(L.at) + " - 도착하면 '집에 왔어요' 를 눌러 주세요", "Expected home " + clock(L.at) + " - tap \"I'm home\" when you arrive");
        $("time").value = st.time;
        $("gName").value = st.gName;
        $("gTel").value = st.gTel;
        $("smsOn").checked = !!st.sms;
    }

    $("okBtn").addEventListener("click", function () {
        var now = Date.now(), c = checkedToday();
        if (!c) { st.log.push({ day: today(), t: now }); st.log = st.log.slice(-60); save(); }
        draw();
        reschedule();
        toast(T("😊 고맙습니다. 오늘 안부를 남겼어요.", "😊 Thanks! Checked in for today."));
        if (st.sms && st.gTel) location.href = smsHref(st.gTel, RF.anbuSms("ok", clock(now), EN));
    });
    $("saveBtn").addEventListener("click", function () {
        var tel = $("gTel").value.trim();
        if (tel && !RF.telClean(tel)) { toast(T("전화번호를 확인해 주세요(숫자 8 ~ 15자리).", "Check the phone number (8-15 digits)."), 4000); return; }
        st.time = $("time").value || "10:00";
        st.gName = $("gName").value.trim().slice(0, 20);
        st.gTel = RF.telClean(tel);
        st.sms = $("smsOn").checked;
        st.on = true;
        save();
        draw();
        reschedule().then(function () { toast(LN ? T("저장했습니다. 매일 " + st.time + " 에 알림이 울립니다.", "Saved. Reminder every day at " + st.time + ".") : T("저장했습니다.", "Saved.")); });
    });
    $("lateSet").addEventListener("click", function () {
        var v = $("lateAt").value;
        if (!/^\d{1,2}:\d{2}$/.test(v)) { toast(T("도착 예정 시각을 고르세요.", "Pick your expected home time.")); return; }
        var d = new Date(), p = v.split(":");
        d.setHours(+p[0], +p[1], 0, 0);
        if (d.getTime() < Date.now() - 600000) d.setDate(d.getDate() + 1);   // 지난 시각이면 내일(밤 12시를 넘는 귀가)
        st.late = { at: d.getTime(), home: null };
        save();
        draw();
        reschedule();
        toast(T("🌙 " + clock(st.late.at) + " 까지 '집에 왔어요' 를 기다릴게요.", "🌙 Waiting for \"I'm home\" by " + clock(st.late.at) + "."));
    });
    $("lateHome").addEventListener("click", function () {
        if (!st.late) st.late = { at: Date.now(), home: null };
        st.late.home = Date.now();
        save();
        draw();
        reschedule();
        toast(T("🏠 잘 도착하셨어요.", "🏠 Glad you're home."));
        if (st.sms && st.gTel && confirm(T("보호자에게 '집에 잘 도착했어요' 문자를 보낼까요?", "Text your guardian that you're home?"))) location.href = smsHref(st.gTel, RF.anbuSms("home", clock(Date.now()), EN));
    });

    draw();
    reschedule();
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") draw(); });   // 날이 바뀐 뒤 다시 열 때
})();
