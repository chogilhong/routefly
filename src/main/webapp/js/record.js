/*
 * 공개 기록 화면(record.html?id=…, 2026-11-22 홍TV님 - 유튜버가 영상 설명란에 넣는 코스 · 루트 링크).
 * api/record-share?id= 의 길 모양을 지도 · 고도 그래프로. "이 길 따라가기" 는 GPX 로 바꿔 이 기기에 넣고(RF.storeGpx) 따라가기로 - 서버에 다시 올리지 않음.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var LANG = RF.pageLang(location.search, (function () { try { return localStorage.getItem("rf-lang"); } catch (e) { return null; } })());
    var EN = LANG === "en", T = RF.tr;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - Shared record"; RF.applyEn(document); }
    var id = new URLSearchParams(location.search).get("id") || "";

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().catch(function () { return { success: false, message: "HTTP " + r.status }; }).then(function (j) {
                if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || ("HTTP " + r.status));
                return j;
            });
        });
    }
    function hhmm(ms) { var m = Math.round(ms / 60000); return Math.floor(m / 60) + T("시간 ", "h ") + (m % 60) + T("분", "m"); }

    if (!/^[0-9A-Za-z]{10}$/.test(id)) { $("msg").textContent = T("링크가 올바르지 않습니다.", "The link is not valid."); return; }
    Promise.all([getJson("api/record-share?id=" + encodeURIComponent(id)), getJson("api/map-config").catch(function () { return {}; })]).then(function (r) {
        var j = r[0], cfg = { demUrl: r[1].demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: r[1].vworldKey || null };
        var gpx = RF.trackGpx(j.name, j.kind, j.track.map(function (p) { return [p[0], p[1], null, p[2]]; })), gid = RF.gpxId(gpx), api = RF.gpxToApi(gpx, j.name + ".gpx");
        var c = RF.fromApi(gid, api);
        $("title").textContent = j.name;
        document.title = j.name + T(" - routefly 공개 기록", " - routefly shared record");
        $("stat").textContent = j.date + " · " + RF.km(j.dist_m) + " km · " + hhmm(j.time_ms) + (j.up_m != null ? T(" · 오른 높이 ", " · climb ") + RF.num(j.up_m) + " m" : "");
        RF.profile($("prof"), c, { labels: false });
        $("follow").hidden = false;
        $("follow").addEventListener("click", function (e) {
            e.preventDefault();
            try { RF.storeGpx(gid, api); location.href = "hike.html" + (EN ? "?lang=en" : "") + "#c=" + encodeURIComponent(gid); }
            catch (x) { alert(T("이 기기에 넣지 못했습니다(저장 공간).", "Could not store it on this device (storage).")); }
        });
        var b = new maplibregl.LngLatBounds();
        j.track.forEach(function (p) { b.extend([p[1], p[0]]); });
        var map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), bounds: b, fitBoundsOptions: { padding: 40, maxZoom: 15 }, locale: RF.mapLocale(), attributionControl: false });
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors | <a href=\"" + T("about.html", "about-en.html") + "\">" + T("안내", "About") + "</a>" }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        map.once("load", function () {
            $("msg").hidden = true;
            map.addSource("rec", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: j.track.map(function (p) { return [p[1], p[0]]; }) } } });
            map.addLayer({ id: "rec-halo", type: "line", source: "rec", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#000", "line-opacity": 0.45, "line-width": 9 } });
            map.addLayer({ id: "rec", type: "line", source: "rec", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#38d9ea", "line-width": 5 } });
            [[j.track[0], "#2fb344"], [j.track[j.track.length - 1], "#ff5c5c"]].forEach(function (e) {
                var d = document.createElement("div");
                d.style.cssText = "width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.6);background:" + e[1];
                new maplibregl.Marker({ element: d }).setLngLat([e[0][1], e[0][0]]).addTo(map);
            });
        });
    }).catch(function (e) {
        $("msg").textContent = e && e.message ? (EN ? "This record is not available (turned off or the link is wrong)." : e.message) : T("기록을 읽지 못했습니다.", "Could not load the record.");
    });
})();
