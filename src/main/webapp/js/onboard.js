/*
 * 처음 안내 - 화면을 처음 열 때 한 번 뜨는 몇 장짜리 안내 창(한 벌로 여러 화면이 씀).
 *   - 따라가기(hike.html, 2026-10-11 오픈 전): 화면에 있는 #onboard 다섯 장(무엇 · 코스 찾기 · fly(3D) · 산행하기 · 안전 · 개인정보).
 *     코스 목록 아래 '❓ 사용법' 으로 다시 봅니다. 산행 시작 때의 안전 안내(hike.js SAFETY_KEY)는 그대로 따로 나옵니다.
 *     내용을 크게 바꾸면 KEY 의 판 번호를 올려 한 번 더 보이게 합니다.
 *   - 2026-11-02 홍TV님 "온보딩을 studio.html 에 넣어줘. 다른 곳에 온보딩 할 곳 있으면 추가해주고":
 *     GPX 편집(studio.js) · 산악회 방 인솔자 화면(party.js)이 RFOnboard.start({ key, cards }) 로 같은 창을 만들어 띄움.
 * 같은 규칙: 이 기기에 처음 한 번(localStorage, 못 쓰면 띄우지 않음) · '건너뛰기' · '시작하기' 모두 다시 보지 않기 · [data-onboard] 를 누르면 다시
 *   · Esc 닫기 · 탭은 창 안에서만 돎 · 처음 포커스는 '다음' · 닫으면 누르던 곳으로 · 자동 브라우저(navigator.webdriver) · 검색 로봇 · 점검(routefly-check)에는 저절로 안 띄움.
 */
(function (g) {
    var cur = null;   // 이 화면의 안내(화면마다 하나) - [data-onboard] 가 엶

    function stored(key) {
        try { return localStorage.getItem(key) === "1"; } catch (e) { return true; }   // 저장소를 못 쓰면 매번 띄우지 않음
    }
    function robot() {
        var n = g.navigator || {};
        return !!n.webdriver || /bot|crawl|spider|slurp|routefly-check/i.test(n.userAgent || "");
    }
    function en() { return document.documentElement.lang === "en"; }   // 따라가기 · 산악회 방 영어(그 화면 js 가 먼저 정함)

    /** 안내 창 하나를 움직임. box: 창(hidden 으로 시작), pages · dots: 장 · 점, next · skip: 단추. */
    function wire(box, pages, dots, next, skip, key) {
        var at = 0, before = null, shown = false;
        function show(i) {
            at = i;
            for (var k = 0; k < pages.length; k++) {
                pages[k].hidden = k !== i;
                dots[k].className = k === i ? "on" : "";
            }
            var last = i === pages.length - 1;
            next.textContent = last ? (en() ? "Get started" : "시작하기") : (en() ? "Next" : "다음");
            // 점(●○○)은 화면 읽기가 못 읽음 - 단추 이름에 몇 장째인지(2026-11-02 홍TV님 점검)
            next.setAttribute("aria-label", next.textContent + " (" + (i + 1) + "/" + pages.length + ")");
            skip.textContent = en() ? "Skip" : "건너뛰기";
            skip.style.visibility = last ? "hidden" : "";
        }
        function open() {
            if (!box.hidden) return;
            shown = true;
            before = document.activeElement;
            show(0);
            box.hidden = false;
            next.focus();
        }
        /** 닫기만(다시 보지 않기는 남기지 않음) - 산악회 방에 SOS 가 들어오면 안내를 치움. */
        function hide() {
            if (box.hidden) return;
            box.hidden = true;
            if (before && before.focus) before.focus();
        }
        function close() {
            hide();
            try { localStorage.setItem(key, "1"); } catch (e) { /* 다음에 다시 보일 뿐 */ }
        }
        next.addEventListener("click", function () { if (at < pages.length - 1) show(at + 1); else close(); });
        skip.addEventListener("click", close);
        box.addEventListener("keydown", function (e) {
            if (e.key === "Escape") { close(); return; }
            if (e.key !== "Tab") return;
            // 탭은 창 안에서만(뒤의 화면으로 빠지지 않게) - 보이는 장의 링크 · 단추
            var f = [], all = box.querySelectorAll("a[href], button");
            for (var k = 0; k < all.length; k++) if (!all[k].closest(".ob-page[hidden]") && all[k].style.visibility !== "hidden") f.push(all[k]);
            if (!f.length) return;
            var i = f.indexOf(document.activeElement), to = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
            e.preventDefault();
            f[to].focus();
        });
        cur = {
            open: open, close: close, hide: hide,
            /** 처음이면 띄움(이번 화면에서 이미 띄웠으면 다시 안 띄움). */
            auto: function () { if (!shown && !stored(key) && !robot()) open(); },
            isOpen: function () { return !box.hidden; }
        };
        return cur;
    }

    function el(tag, cls, text) {
        var x = document.createElement(tag);
        if (cls) x.className = cls;
        if (text != null) x.textContent = text;
        return x;
    }
    var CSS = ".rfob{position:fixed;inset:0;z-index:9000;background:rgba(5,8,12,.78);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,\"Malgun Gothic\",sans-serif}"
        + ".rfob[hidden]{display:none}"
        + ".rfob .ob-card{width:100%;max-width:420px;max-height:100%;overflow:auto;box-sizing:border-box;background:#1a212b;color:#eef2f7;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:22px 20px 16px}"
        + ".rfob .ob-page{min-height:13.5em}"
        + ".rfob .ob-icon{font-size:40px;text-align:center}"
        + ".rfob h2{font-size:19px;margin:6px 0 10px;text-align:center}"
        + ".rfob p{font-size:15.5px;line-height:1.6;margin:8px 0;word-break:keep-all}"
        + ".rfob .ob-dim{color:#9aa6b4;font-size:14px}"
        + ".rfob .ob-dots{display:flex;justify-content:center;gap:7px;margin:16px 0 12px}"
        + ".rfob .ob-dots span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.22)}"
        + ".rfob .ob-dots span.on{background:#38d9ea}"
        + ".rfob .ob-row{display:flex;gap:8px}"
        + ".rfob .ob-row button{flex:1;min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef2f7;font-size:16px;cursor:pointer}"
        + ".rfob .ob-row button.main{background:#38d9ea;border-color:#38d9ea;color:#062b30;font-weight:bold}"
        + ".rfob button:focus-visible{outline:3px solid #ffd43b;outline-offset:2px}";

    /**
     * 안내 창을 만들어 이 화면의 안내로 둠(저절로 띄우려면 돌려받은 것의 auto()).
     * o: { key: 저장 열쇠, cards: [{ icon, title: [한국어, 영어], body: [[한국어 문단 ...], [영어 문단 ...]] }] } - 영어가 없으면 한국어. 글은 우리 코드의 고정 글만(<b> 정도).
     */
    function start(o) {
        if (cur && cur.box) { cur.box.parentNode.removeChild(cur.box); }   // 같은 화면에서 다시 만들면(운영자 여부가 늦게 정해짐 등) 앞의 것은 치움
        if (!document.getElementById("rfobCss")) {
            var s = el("style");
            s.id = "rfobCss";
            s.textContent = CSS;
            document.head.appendChild(s);
        }
        var E = en() ? 1 : 0;
        var box = el("div", "rfob"), card = el("div", "ob-card"), dotBox = el("div", "ob-dots"), row = el("div", "ob-row");
        var next = el("button", "main"), skip = el("button"), pages = [], dots = [];
        box.hidden = true;
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-labelledby", "rfobT0");
        dotBox.setAttribute("aria-hidden", "true");
        next.type = skip.type = "button";
        o.cards.forEach(function (c, i) {
            var page = el("div", "ob-page"), h = el("h2", null, c.title[E] || c.title[0]);
            if (i === 0) h.id = "rfobT0";
            page.appendChild(el("div", "ob-icon", c.icon));
            page.appendChild(h);
            (c.body[E] || c.body[0]).forEach(function (t) {
                var p = el("p", /^\(/.test(t) ? "ob-dim" : null);
                p.innerHTML = t.replace(/^\(|\)$/g, "");   // ( ) 로 감싼 문단은 흐린 글
                page.appendChild(p);
            });
            card.appendChild(page);
            pages.push(page);
            var d = el("span");
            dotBox.appendChild(d);
            dots.push(d);
        });
        row.appendChild(skip);
        row.appendChild(next);
        card.appendChild(dotBox);
        card.appendChild(row);
        box.appendChild(card);
        document.body.appendChild(box);
        var c = wire(box, pages, dots, next, skip, o.key);
        c.box = box;
        return c;
    }

    // [data-onboard] - 이 화면의 안내를 다시(따라가기는 검색창을 비우면 안내 글이 다시 그려지므로 문서에서 받음)
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-onboard]");
        if (!a || !cur) return;
        e.preventDefault();
        cur.open();
    });
    g.RFOnboard = { start: start };

    // ---- 따라가기(hike.html) - 화면에 있는 #onboard
    var box = document.getElementById("onboard");
    if (!box) return;
    var hike = wire(box, box.querySelectorAll(".ob-page"), box.querySelectorAll(".ob-dots span"), document.getElementById("obNext"), document.getElementById("obSkip"), "rf-onboard-v2");   // v2(2026-10-14): 도장 · 완주, fly(3D) 장 더함
    // 처음이고 코스 없이 열었을 때만(공유 링크로 코스를 바로 연 사람 · 산행 중 · 이어 하기는 picking 이 아님 - 코스 목록으로 갈 때 '❓ 사용법')
    // 산악회 참가로 막 들어온 회원은 소개 없이(2026-10-24 - 이름만 넣고 바로 따라가기, 소개 창이 "버스 탔어요" 를 가렸음)
    var party = false;
    try { party = g.RFParty ? !!RFParty.get() : !!localStorage.getItem("rf-party"); } catch (e) { /* 없음 */ }   // RFParty 가 있으면 그것으로(열쇠 · 코드 확인, 2026-10-29 점검)
    if (!party && /\bpicking\b/.test(document.documentElement.className)) hike.auto();
})(window);
