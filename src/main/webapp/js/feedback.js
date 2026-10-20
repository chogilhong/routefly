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
    function msg(t, ok) { $("msg").textContent = t || ""; $("msg").className = ok ? "ok" : ""; }
    $("fbText").addEventListener("input", function () { $("fbCount").textContent = $("fbText").value.length; });
    $("fbBack").addEventListener("click", function (e) {
        e.preventDefault();
        if (history.length > 1) history.back(); else location.href = "hike.html";
    });
    $("fbSend").addEventListener("click", function () {
        var text = $("fbText").value.trim(), reply = $("fbReply").value.trim();
        if (text.length < 2) { msg("내용을 적어 주세요."); return; }
        if (reply && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(reply)) { msg("답장 받을 메일 주소를 확인해 주세요."); return; }
        $("fbSend").disabled = true;
        msg("보내는 중…");
        fetch("api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ text: text, reply: reply || null, page: from }) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.message || "보내지 못했습니다(" + r.status + ")."); return j; }); })
            .then(function () {
                $("fbText").value = ""; $("fbCount").textContent = "0";
                msg("보냈습니다. 고맙습니다!" + (reply ? " 답장은 적어 주신 메일로 드립니다." : ""), true);
            })
            .catch(function (e) { msg(navigator.onLine === false ? "인터넷에 연결되지 않았습니다. 연결된 뒤 다시 보내 주세요." : e.message); })
            .finally(function () { $("fbSend").disabled = false; });
    });
})();
