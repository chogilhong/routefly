/*
 * 구글 애드센스(2026-10-28 홍TV님) - 산 · 코스 소개 페이지에 서버가 광고 칸(.adBox, 설정이 있을 때만)을 넣었을 때만 애드센스를 부름.
 * 정적 화면(도구 tools.html 맨 아래 · 도장 series.html 목록 아래, 2026-11-01 홍TV님)은 빈 자리(.adSpot data-where)만 두고, api/ad 로 설정을 받아 칸을 만듦.
 * PC 양옆 광고(.adRail, 2026-11-24 홍TV님 "pc 에서만 사이드에 광고 - 앱(폰)에서는 광고를 붙히지 않고")는 화면이 1200px 넘을 때만 - 아니면 자리를 지움.
 * 앱(Capacitor 웹뷰) 안에서는 광고 칸을 모두 지움(애드센스는 웹용 - 앱 광고는 정책이 다름). 따라가기는 첫 화면(코스 목록 #pick) 양옆 자리만 - 코스를 연 지도 · SOS · 산악회 방에는 칸이 없음.
 * 애드센스 "자동 광고" 는 쓰지 않음(2026-11-24 홍TV님 "우리가 필요한 위치에 넣을거야") - 켜면 이 스크립트가 남은 따라가기 지도 위에도 광고가 뜰 수 있음.
 * 한 화면에 광고 칸과 양옆 자리가 함께 있으면 이 파일이 두 번 붙을 수 있어 한 번만 돎.
 */
(function () {
    if (window.__rfAds) return;
    window.__rfAds = true;
    // api 주소는 이 파일 자리 기준 - 산 페이지(/m/)처럼 한 단 아래 화면에서도 같은 /api/ad 로(상대 주소 "api/ad" 는 /m/api/ad 가 됨)
    var me = document.currentScript && document.currentScript.src, root = me ? me.replace(/js\/ads\.js(?:[?#].*)?$/, "") : "";
    function each(list, f) { Array.prototype.forEach.call(list, f); }
    function drop(list) { each(list, function (b) { if (b.parentNode) b.parentNode.removeChild(b); }); }
    var loaded = false;
    /** 애드센스 스크립트는 한 번만 붙이고, 칸(ins)마다 한 번씩 채워 달라고 함. */
    function load(client, boxes) {
        if (!/^ca-pub-\d{10,20}$/.test(client || "")) return;
        if (!loaded) {
            loaded = true;
            var s = document.createElement("script");
            s.async = true;
            s.crossOrigin = "anonymous";
            s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
            s.onerror = function () { each(document.querySelectorAll(".adBox"), function (b) { b.style.display = "none"; }); };   // 광고 차단기 · 막힘 - 빈 칸 숨김
            document.head.appendChild(s);
        }
        each(boxes, function (b) {
            var ins = b.querySelector("ins.adsbygoogle");
            if (!ins || ins.getAttribute("data-rf-push")) return;
            ins.setAttribute("data-rf-push", "1");
            try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 이번만 */ }
        });
    }
    var boxes = document.querySelectorAll(".adBox"), spots = document.querySelectorAll(".adSpot[data-where]");
    if (window.Capacitor) { drop(boxes); drop(spots); return; }
    var wide = !!(window.matchMedia && window.matchMedia("(min-width: 1200px)").matches);
    var rails = Array.prototype.filter.call(spots, function (s) { return s.classList.contains("adRail"); });
    if (!wide) drop(rails);
    spots = Array.prototype.filter.call(spots, function (s) { return s.parentNode; });
    if (boxes.length) { var ins0 = boxes[0].querySelector("ins.adsbygoogle"); load(ins0 && ins0.getAttribute("data-ad-client"), boxes); }
    if (!spots.length || !window.fetch) return;
    var en = document.documentElement.lang === "en", byWhere = {};
    function makeBox(spot, a) {
        var rail = spot.classList.contains("adRail");
        var box = document.createElement("aside"), note = document.createElement("p"), ins = document.createElement("ins");
        box.className = "adBox";
        box.setAttribute("aria-label", en ? "Ad" : "광고");
        box.style.cssText = rail ? "margin:0" : "margin:18px 0 8px";
        note.className = "adNote";
        note.textContent = en ? "Ad" : "광고";
        note.style.cssText = "margin:0 0 4px;font-size:12px;color:#8a94a0";
        ins.className = "adsbygoogle";
        ins.style.display = "block";
        ins.setAttribute("data-ad-client", a.client);
        ins.setAttribute("data-ad-slot", a.slot);
        ins.setAttribute("data-ad-format", rail ? "vertical" : "auto");   // 양옆은 세로 광고
        if (!rail) ins.setAttribute("data-full-width-responsive", "true");
        box.appendChild(note);
        box.appendChild(ins);
        spot.appendChild(box);
        return box;
    }
    /** 자리가 보일 때 한 번 f - 숨은 동안 시계로 계속 확인하지 않음(점검 14차 D6: 따라가기 지도를 쓰는 내내 2초마다 돌았음). IntersectionObserver 가 없으면 보일 때만. */
    function whenShown(el, f) {
        if (el.offsetWidth > 0) { f(); return; }
        if (!window.IntersectionObserver) return;
        var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting || el.offsetWidth > 0; })) { io.disconnect(); f(); } });
        io.observe(el);
    }
    spots.forEach(function (s) { var w = s.getAttribute("data-where"); (byWhere[w] = byWhere[w] || []).push(s); });
    Object.keys(byWhere).forEach(function (where) {
        fetch(root + "api/ad?where=" + encodeURIComponent(where)).then(function (r) { return r.ok ? r.json() : {}; }).then(function (a) {
            if (!a || !/^ca-pub-\d{10,20}$/.test(a.client || "") || !/^\d{6,12}$/.test(a.slot || "")) { drop(byWhere[where]); return; }
            // 숨은 자리(따라가기에 코스를 연 채로 들어와 목록이 안 보일 때)는 보일 때 채움 - 애드센스는 폭이 0 인 칸을 못 채움
            byWhere[where].forEach(function (spot) { whenShown(spot, function () { load(a.client, [makeBox(spot, a)]); }); });
        }).catch(function () { /* 광고 없이 */ });
    });
})();
