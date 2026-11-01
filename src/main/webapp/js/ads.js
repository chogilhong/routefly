/*
 * 구글 애드센스(2026-10-28 홍TV님) - 산 · 코스 소개 페이지에 서버가 광고 칸(.adBox, 설정이 있을 때만)을 넣었을 때만 애드센스를 부름.
 * 정적 화면(도구 tools.html 맨 아래 · 도장 series.html 목록 아래, 2026-11-01 홍TV님)은 빈 자리(.adSpot data-where)만 두고, api/ad 로 설정을 받아 칸을 만듦.
 * 앱(Capacitor 웹뷰) 안에서는 광고 칸을 지움(애드센스는 웹용 - 앱 광고는 정책이 다름). 따라가기 · 산악회 방 화면에는 이 파일을 넣지 않음.
 */
(function () {
    function each(list, f) { Array.prototype.forEach.call(list, f); }
    function drop(list) { each(list, function (b) { if (b.parentNode) b.parentNode.removeChild(b); }); }
    function load(boxes) {
        var ins = document.querySelector("ins.adsbygoogle"), client = ins && ins.getAttribute("data-ad-client");
        if (!client || !/^ca-pub-\d{10,20}$/.test(client)) return;
        var s = document.createElement("script");
        s.async = true;
        s.crossOrigin = "anonymous";
        s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
        s.onerror = function () { each(boxes, function (b) { b.style.display = "none"; }); };   // 광고 차단기 · 막힘 - 빈 칸 숨김
        document.head.appendChild(s);
        each(document.querySelectorAll("ins.adsbygoogle"), function () {
            try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 이번만 */ }
        });
    }
    var boxes = document.querySelectorAll(".adBox"), spots = document.querySelectorAll(".adSpot[data-where]");
    if (window.Capacitor) { drop(boxes); drop(spots); return; }
    if (boxes.length) { load(boxes); return; }
    if (!spots.length || !window.fetch) return;
    var spot = spots[0], where = spot.getAttribute("data-where");
    fetch("api/ad?where=" + encodeURIComponent(where)).then(function (r) { return r.ok ? r.json() : {}; }).then(function (a) {
        if (!a || !/^ca-pub-\d{10,20}$/.test(a.client || "") || !/^\d{6,12}$/.test(a.slot || "")) return;
        var en = document.documentElement.lang === "en";
        var box = document.createElement("aside"), note = document.createElement("p"), ins = document.createElement("ins");
        box.className = "adBox";
        box.setAttribute("aria-label", en ? "Ad" : "광고");
        box.style.cssText = "margin:18px 0 8px";
        note.className = "adNote";
        note.textContent = en ? "Ad" : "광고";
        note.style.cssText = "margin:0 0 4px;font-size:12px;color:#8a94a0";
        ins.className = "adsbygoogle";
        ins.style.display = "block";
        ins.setAttribute("data-ad-client", a.client);
        ins.setAttribute("data-ad-slot", a.slot);
        ins.setAttribute("data-ad-format", "auto");
        ins.setAttribute("data-full-width-responsive", "true");
        box.appendChild(note);
        box.appendChild(ins);
        spot.appendChild(box);
        load([box]);
    }).catch(function () { /* 광고 없이 */ });
})();
