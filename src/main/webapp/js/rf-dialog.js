/*
 * 큰 글씨 확인 창(2026-10-28 홍TV님 추천 3 - 접근성): 브라우저의 작은 confirm · prompt · alert 대신.
 * 글씨 19px · 단추 높이 52px · 화면 읽기 프로그램용 role="dialog"(aria-modal) · Esc 는 취소 · 처음 포커스는 확인(위험한 일은 취소) · 닫으면 누른 단추로 포커스 돌려줌.
 * 모두 Promise: confirm → true/false, prompt → 글/null, alert → undefined. 한 번에 하나만(겹치면 앞의 것이 끝난 뒤 뜸).
 * party.html · hike.html(party-bar.js)이 씀. 스타일도 여기서 넣음(두 화면 CSS 를 따로 고치지 않게).
 */
(function (g) {
    var EN = /[?&]lang=en\b/.test(location.search) || document.documentElement.lang === "en";
    var queue = Promise.resolve();
    var CSS = ".rfdlg-back{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}"
        + ".rfdlg{background:#1a212b;color:#eef2f7;border:1px solid rgba(255,255,255,.18);border-radius:16px;max-width:460px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.5);font-family:Arial,\"Malgun Gothic\",sans-serif}"
        + ".rfdlg p{font-size:19px;line-height:1.55;margin:0 0 16px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;max-height:60vh;overflow:auto}"
        + ".rfdlg input{width:100%;box-sizing:border-box;height:52px;font-size:19px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:#0f141a;color:#eef2f7;margin:0 0 16px}"
        + ".rfdlg .row{display:flex;gap:10px}.rfdlg button{flex:1;min-height:52px;font-size:18px;font-weight:bold;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#eef2f7;cursor:pointer}"
        + ".rfdlg button.ok{background:#38d9ea;color:#062026;border-color:#38d9ea}.rfdlg button.ok.danger{background:#ff6b6b;color:#2a0606;border-color:#ff6b6b}"
        + ".rfdlg button:focus-visible{outline:3px solid #ffd43b;outline-offset:2px}";
    var styled = false;
    function style() {
        if (styled) return;
        styled = true;
        var s = document.createElement("style");
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    /** kind: confirm · prompt · alert. o: {ok, cancel, danger, value}. */
    function open(kind, text, o) {
        o = o || {};
        return new Promise(function (done) {
            style();
            var back = document.createElement("div"), box = document.createElement("div"), p = document.createElement("p"), row = document.createElement("div");
            var before = document.activeElement, id = "rfdlg" + Date.now();
            back.className = "rfdlg-back";
            box.className = "rfdlg";
            box.setAttribute("role", kind === "alert" ? "alertdialog" : "dialog");
            box.setAttribute("aria-modal", "true");
            box.setAttribute("aria-labelledby", id);
            p.id = id;
            p.textContent = text;
            box.appendChild(p);
            var input = null;
            if (kind === "prompt") {
                input = document.createElement("input");
                input.type = "text";
                input.value = o.value == null ? "" : o.value;
                input.setAttribute("aria-labelledby", id);
                box.appendChild(input);
            }
            row.className = "row";
            var ok = document.createElement("button"), cancel = null;
            ok.type = "button";
            ok.className = "ok" + (o.danger ? " danger" : "");
            ok.textContent = o.ok || (EN ? "OK" : "확인");
            if (kind !== "alert") {
                cancel = document.createElement("button");
                cancel.type = "button";
                cancel.textContent = o.cancel || (EN ? "Cancel" : "취소");
                row.appendChild(cancel);
            }
            row.appendChild(ok);
            box.appendChild(row);
            back.appendChild(box);
            document.body.appendChild(back);
            function close(v) {
                document.removeEventListener("keydown", key, true);
                back.remove();
                try { if (before && before.focus) before.focus(); } catch (e) { /* 그대로 */ }
                done(v);
            }
            function yes() { close(kind === "prompt" ? input.value : kind === "confirm" ? true : undefined); }
            function no() { close(kind === "prompt" ? null : kind === "confirm" ? false : undefined); }
            function key(e) {
                // 뒤 화면의 Esc(QR · 옮기기 창 닫기)까지 가지 않게(2026-10-28 점검)
                if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); no(); }
                else if (e.key === "Enter" && input && document.activeElement === input) { e.preventDefault(); e.stopImmediatePropagation(); yes(); }
                else if (e.key === "Tab") {   // 창 안에서만 돌게
                    var f = [input, cancel, ok].filter(Boolean), i = f.indexOf(document.activeElement);
                    e.preventDefault();
                    f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
                }
            }
            ok.addEventListener("click", yes);
            if (cancel) cancel.addEventListener("click", no);
            document.addEventListener("keydown", key, true);
            (input || (o.danger && cancel) || ok).focus();
            if (input) input.select();
        });
    }
    function later(kind, text, o) {
        var r = queue.then(function () { return open(kind, text, o); });
        queue = r.catch(function () { /* 다음 것 */ });
        return r;
    }
    g.RFDialog = {
        confirm: function (text, o) { return later("confirm", text, o); },
        prompt: function (text, value, o) { o = o || {}; o.value = value; return later("prompt", text, o); },
        alert: function (text, o) { return later("alert", text, o); }
    };
})(window);
