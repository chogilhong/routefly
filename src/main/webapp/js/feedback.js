/* 의견 보내기(2026-10-20 홍TV님) - feedback.html?from=<화면 경로> → POST api/feedback → 운영자 메일 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var from = new URLSearchParams(location.search).get("from") || "";
    try {   // 같은 누리집에서 왔으면 그 경로(산 페이지는 /m/가야산 처럼 산 이름까지 - 2026-10-20 PC)
        var ref = document.referrer ? new URL(document.referrer) : null;
        if (ref && ref.origin === location.origin) from = decodeURIComponent(ref.pathname).replace(/^\/routefly(?=\/)/, "") || from;
    } catch (e) { /* from 그대로 */ }
    from = from.replace(/[^A-Za-z0-9가-힣\/._\-]/g, "").slice(0, 60);
    // 영어(2026-10-22 홍TV님 "이 화면 영어로 안 돼") - 영어 화면에서 온 링크(?lang=en)만. 기억된 말(rf-lang)은 쓰지 않음(한국어 화면에서 와도 영어가 됐던 일 - 산악회 방)
    var EN = /[?&]lang=en\b/.test(location.search);
    function T(ko, en) { return EN ? en : ko; }
    if (EN) {
        document.documentElement.lang = "en";
        document.title = "routefly Feedback";
        $("fbTitle").textContent = "📮 Send feedback";
        $("fbLead").textContent = "Tell us what to fix, wrong data or features you'd like. It goes straight to the operator by email. English is fine.";
        $("fbTextL").textContent = "Message";
        $("fbText").placeholder = "e.g. The trailhead parking for Bukhansan Baegundae course is in a different place.";
        $("fbReplyL").textContent = "Your email for a reply (optional)";
        $("fbReply").placeholder = "Leave empty if you don't need a reply";
        $("fbNote").innerHTML = "We don't send your location or device info - only which page you came from. Your message and email are used only to reply and improve the service, and deleted after 1 year. <a href=\"privacy.html#feedback\">Details (Korean)</a>";
        $("fbSend").textContent = "Send";
        $("fbBack").textContent = "‹ Back";
    }
    function msg(t, ok) { $("msg").textContent = t || ""; $("msg").className = ok ? "ok" : ""; }
    $("fbText").addEventListener("input", function () { $("fbCount").textContent = $("fbText").value.length; });
    $("fbBack").addEventListener("click", function (e) {
        e.preventDefault();
        if (history.length > 1) history.back(); else location.href = "hike.html";
    });
    $("fbSend").addEventListener("click", function () {
        var text = $("fbText").value.trim(), reply = $("fbReply").value.trim();
        if (text.length < 2) { msg(T("내용을 적어 주세요.", "Please write a message.")); return; }
        if (reply && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(reply)) { msg(T("답장 받을 메일 주소를 확인해 주세요.", "Please check your email address.")); return; }
        $("fbSend").disabled = true;
        msg(T("보내는 중…", "Sending…"));
        fetch("api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ text: text, reply: reply || null, page: from }) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(EN ? "Could not send (" + r.status + "). Please try again later." : j.message || "보내지 못했습니다(" + r.status + ")."); return j; }); })
            .then(function () {
                $("fbText").value = ""; $("fbCount").textContent = "0";
                msg(T("보냈습니다. 고맙습니다!" + (reply ? " 답장은 적어 주신 메일로 드립니다." : ""), "Sent. Thank you!" + (reply ? " We'll reply to your email." : "")), true);
            })
            .catch(function (e) { msg(navigator.onLine === false ? T("인터넷에 연결되지 않았습니다. 연결된 뒤 다시 보내 주세요.", "You're offline. Please send again when connected.") : e.message); })
            .finally(function () { $("fbSend").disabled = false; });
    });
})();
