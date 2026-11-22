/*
 * 기록 보기(trip.html, 2026-11-22 홍TV님 "램블러 화면 같은 것을 만들어줘 - gpx 저장한 것을 열어볼 수 있게, 사진 등 클릭하면 옆에 보이게, 확대하면 사진만").
 * 코스 모음 "📂 GPX 열기" 로 들어와 📂 GPX 열기(RF.gpxRecord - 💾 GPX 파일 저장의 사진 · 메모 · 요약까지).
 * 왼쪽 지도: 지나온 선 · 출발(초록) · 도착(빨강) · 사진(보라 📷) · 메모(파랑 📝) 표시, 아래 고도 · 속도 그래프(RF.profile).
 * 오른쪽(폰은 아래): 사진 · 메모 카드 - 표시를 누르면 그 카드가 주황 테두리로 보이게 넘어가고, 카드를 누르면 지도가 그 자리로. 🔍 는 사진만 크게(‹ › · 화살표 키).
 * 모두 이 기기 안에서만(서버로 보내지 않음). 지도는 V-World 지도 + 지형 음영(위성 아님), 출처 표시 그대로.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var LANG = RF.pageLang(location.search, (function () { try { return localStorage.getItem("rf-lang"); } catch (e) { return null; } })());
    var EN = LANG === "en", T = RF.tr, NM = RF.nameIn;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - View record"; RF.applyEn(document); }

    var map = null, cfgP = null, marks = [], cards = [], urls = [], items = [], pick = -1, prof = null, rc = null;

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : {}; });
    }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    /** 한국 시각 "2026. 11. 20. 11:33". */
    function when(t) { var d = new Date(t + 9 * 3600000); return d.getUTCFullYear() + ". " + (d.getUTCMonth() + 1) + ". " + d.getUTCDate() + ". " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()); }
    function hm(ms) { var m = Math.round(ms / 60000); return Math.floor(m / 60) + T("시간 ", "h ") + (m % 60) + T("분", "m"); }

    function clear() {
        marks.forEach(function (m) { m.remove(); });
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        marks = []; cards = []; urls = []; items = []; pick = -1;
        $("side").innerHTML = "";
    }

    /** 기록 하나 그리기. photoUrl(id) → 약속(그림 주소 | null). */
    function show(rec, photoUrl) {
        clear();
        rc = RF.recordCourse(rec);
        if (rc.lat.length < 2) { $("side").innerHTML = "<p class=\"empty\">" + T("점이 모자라 그릴 수 없습니다.", "Not enough points to draw.") + "</p>"; return; }
        $("title").textContent = NM(rec.name) || T("기록 보기", "View record");
        document.title = (NM(rec.name) || "") + T(" - routefly 기록 보기", " - routefly record");
        $("stat").textContent = (rec.start != null ? when(rec.start) + " · " : "") + RF.km(rc.total) + " km" + (rec.start != null && rec.end != null && rec.end > rec.start ? " · " + hm(rec.end - rec.start) : "")
            + (rec.up != null ? T(" · 오른 높이 ", " · climb ") + RF.num(rec.up) + " m" : rc.asc && rc.asc.length ? T(" · 오르막 ", " · ascent ") + RF.num(rc.asc[rc.asc.length - 1]) + " m" : "");
        prof = RF.profile($("prof"), rc, { speed: RF.speedProfile(rc), labels: false });
        var narrow = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;   // 폰 세로는 그래프가 지도를 많이 가려 접어 두고 📈 단추로
        $("graph").hidden = narrow; $("graphBtn").hidden = !narrow;
        items = (rec.notes || []).map(function (n, i) { return { n: n, d: rc.pois[i] ? rc.pois[i].dist_m : null, url: null }; });
        if (!items.length) $("side").innerHTML = "<p class=\"empty\">" + T("이 기록에는 사진 · 메모가 없습니다.", "This record has no photos or notes.") + "</p>";
        items.forEach(function (it, i) {
            var card = document.createElement("div"), ph = document.createElement("div"), tx = document.createElement("div"), tm = document.createElement("div");
            card.className = "card";
            tm.className = "tm";
            tm.textContent = [it.n.t != null ? when(it.n.t) : "", it.d != null ? T("출발부터 ", "from start ") + RF.km(it.d) + " km" : "", it.n.ele != null ? T("해발 ", "elev. ") + RF.num(it.n.ele) + " m" : ""]
                .filter(Boolean).join(" · ");
            tx.className = "tx";
            tx.appendChild(tm);
            if (it.n.text) tx.appendChild(document.createTextNode(it.n.text));
            if (it.n.photo) {
                ph.className = "ph";
                card.appendChild(ph);
                photoUrl(it.n.photo).then(function (u) {
                    if (!u) return;
                    it.url = u; urls.push(u);
                    var im = new Image(), z = document.createElement("button");
                    im.src = u; im.alt = it.n.text || T("사진", "Photo"); im.loading = "lazy";
                    z.type = "button"; z.className = "zoom"; z.textContent = "🔍"; z.title = T("사진만 크게", "Photo only, full screen"); z.setAttribute("aria-label", z.title);
                    z.onclick = function (e) { e.stopPropagation(); big(i); };
                    ph.appendChild(im); ph.appendChild(z);
                });
            }
            card.appendChild(tx);
            card.onclick = function () { select(i, true, false); };
            $("side").appendChild(card);
            cards.push(card);
        });
        cfgP.then(function () {
            var line = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rc.lon.map(function (x, k) { return [x, rc.lat[k]]; }) } };
            var draw = function () {
                if (map.getSource("trk")) map.getSource("trk").setData(line);
                else {
                    map.addSource("trk", { type: "geojson", data: line });
                    map.addLayer({ id: "trk-halo", type: "line", source: "trk", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 8, "line-opacity": 0.8 } });
                    map.addLayer({ id: "trk", type: "line", source: "trk", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#5b45ff", "line-width": 4.5 } });
                }
                var b = new maplibregl.LngLatBounds();
                line.geometry.coordinates.forEach(function (q) { b.extend(q); });
                map.fitBounds(b, { padding: 50, duration: 0, maxZoom: 15 });
            };
            if (map.loaded()) draw(); else map.once("load", draw);
            [[0, "#2fb344"], [rc.lat.length - 1, "#ff5c5c"]].forEach(function (e) {
                var d = document.createElement("div");
                d.className = "end"; d.style.background = e[1];
                marks.push(new maplibregl.Marker({ element: d }).setLngLat([rc.lon[e[0]], rc.lat[e[0]]]).addTo(map));
            });
            items.forEach(function (it, i) {
                var d = document.createElement("div");
                d.className = "pin" + (it.n.photo ? "" : " memo");
                d.textContent = it.n.photo ? "📷" : "📝";
                d.title = (it.n.t != null ? when(it.n.t) : "") + (it.n.text ? " · " + it.n.text : "");
                d.addEventListener("click", function (e) { e.stopPropagation(); select(i, false, true); });
                it.mark = new maplibregl.Marker({ element: d, anchor: "bottom" }).setLngLat([it.n.lon, it.n.lat]).addTo(map);
                marks.push(it.mark);
            });
        });
    }

    /** 사진 · 메모 하나를 고름 - 지도 표시 주황 · 카드 주황 테두리, fly(카드를 누름)면 지도를 그리로, scroll(표시를 누름)이면 카드를 보이게. */
    function select(i, fly, scroll) {
        if (pick >= 0 && items[pick]) { cards[pick].classList.remove("on"); if (items[pick].mark) items[pick].mark.getElement().classList.remove("on"); }
        pick = i;
        var it = items[i];
        cards[i].classList.add("on");
        if (it.mark) it.mark.getElement().classList.add("on");
        if (scroll) cards[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (fly && map) map.easeTo({ center: [it.n.lon, it.n.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
        if (prof && it.d != null) prof.set(it.d);
    }

    /** 사진만 크게(사진 있는 것끼리 ‹ › 로 넘김). */
    function big(i) {
        var it = items[i];
        if (!it || !it.url) return;
        select(i, false, false);
        $("bigImg").src = it.url;
        $("bigCap").textContent = (it.n.t != null ? when(it.n.t) : "") + (it.n.text ? " · " + it.n.text : "");
        $("big").style.display = "flex";
    }
    function step(k) {
        for (var j = pick + k; j >= 0 && j < items.length; j += k) if (items[j].url) { big(j); return; }
    }
    function bigClose() { $("big").style.display = "none"; $("bigImg").removeAttribute("src"); }
    $("bigClose").onclick = bigClose;
    $("bigPrev").onclick = function () { step(-1); };
    $("bigNext").onclick = function () { step(1); };
    $("bigImg").onclick = bigClose;
    document.addEventListener("keydown", function (e) {
        if ($("big").style.display !== "flex") return;
        if (e.key === "Escape") bigClose(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
    });
    $("graphClose").onclick = function () { $("graph").hidden = true; $("graphBtn").hidden = false; };
    $("graphBtn").onclick = function () { $("graph").hidden = false; $("graphBtn").hidden = true; };

    // 지도(V-World 지도 + 지형 음영 - 위성은 쓰지 않음)
    cfgP = getJson("api/map-config").catch(function () { return {}; }).then(function (c) {
        var cfg = { demUrl: c.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: c.vworldKey || null };
        map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 6.5, locale: RF.mapLocale(), attributionControl: false });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors | <a href=\"" + T("about.html", "about-en.html") + "\">" + T("안내", "About") + "</a>" }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        // 출처는 ⓘ 로 접어 둠(노선 · 탐방 안내도와 같게 - 폰에서 펼친 출처가 사진 표시를 가렸음), ⓘ 를 누르면 보임
        var fold = function () { var at = document.querySelector(".maplibregl-ctrl-attrib"); if (at) at.classList.remove("maplibregl-compact-show"); };
        fold();
        map.once("load", fold);
        return map;
    });

    // 📂 GPX 열기 - 이 기기 안에서만 읽음
    $("openBtn").onclick = function () { $("gpxFile").value = ""; $("gpxFile").click(); };
    $("gpxFile").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { alert(T("파일이 너무 큽니다(8MB 까지).", "The file is too big (8 MB max).")); return; }
        f.text().then(function (text) {
            var got = RF.gpxRecord(text, true, f.name);   // 시각 없는 코스 GPX 도(선 · 지점 · 고도만, 속도 · 시간 없이)
            if (!got) { alert(T("GPX 에 길(점)이 없습니다.", "The GPX has no track points.")); return; }
            show(got.rec, function (id) {
                try {
                    var bin = atob(got.photos[id]), u8 = new Uint8Array(bin.length);
                    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                    return Promise.resolve(URL.createObjectURL(new Blob([u8], { type: "image/jpeg" })));
                } catch (e) { return Promise.resolve(null); }
            });
        }).catch(function () { alert(T("파일을 읽지 못했습니다.", "Could not read the file.")); });
    });
})();
