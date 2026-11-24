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

    var rcBox = null;   // 선을 둘러싼 네모 [남, 북, 서, 동] - 마우스 따라가기가 먼저 봄
    var courseInfo = null;   // 코스 보기(?c=)의 코스 자료(RF.fromApi) - 예상 시간 · 난이도 · 지점(점검 14차 C3)
    var map = null, cfgP = null, marks = [], cards = [], urls = [], items = [], pick = -1, prof = null, rc = null;
    var FIRST_ZOOM_UP = 0.1;   // 처음 화면 - 전체 맞춤보다 이만큼 더 확대
    var vector = false, peakKeys = [], PEAK_NEAR_M = 150, tileFeats = [];   // tileFeats - 선이 지나는 확대 12 조각의 봉우리(RFMap.tilePeaks)
    // 공단 대피소 · 100대 명산 정상(늘 보임, RF.famousMarks)과 겹치는 OSM 것(300m 안)은 숨김 - 두 번 그리지 않게
    var fam = null, famGj = null, famSet = false, dropPeaks = [], dropHuts = [], SAME_M = 300;
    var passMarks = [];   // 지나간 봉우리 표시(rf-peak 층) - markPeaks 가 채움
    var styleOk = false, styleQ = [];   // 지도 모양 준비(whenStyle)
    // 공원 탐방로(2026-11-23 홍TV님 "지리산 안내도 코스들을 그려줘 - 일단 표시만"): 기록이 국립공원 안이면 api/park?name=<공원> 의 탐방로 선을 연하게
    var parkCands = [], parkShown = null, PARK_NEAR_M = 1500;
    // 대피소 사진(2026-11-23 홍TV님 "대피소 사진을 클릭하면 보여줘 · 대피소가 있는 산은 옆에 사진을 · 내 사진과 위치로 비교해 자리를"): data/shelter-photos.json
    var hutPhotos = {}, HUT_CARD_M = 300;
    // 구간: 끊는 곳끼리 · 처음 · 끝에서 1km 안이면 끊지 않음(2026-11-23 홍TV님 "1km 보다 짧은 구간은 앞에 붙이기" - 전에는 300m)
    var namedPeaks = [];   // 기록이 지나간 "…산" 정상(지도 조각에서 찾음, 불암산 · 수락산 등) - 구간 끊는 곳에 더함
    var SEG_NEAR_M = 200, SEG_GAP_M = 1000, PICK_NEAR_M = 300, popup = null;   // 구간 끊는 곳(선에서 200m 안 · 300m 넘게 떨어진 것만) · 누른 곳 찾기   // 우리 지도일 때 기록이 지나간 봉우리(150m 안)
    // 표시별 보이기 · 숨기기(2026-11-22 홍TV님 "마커 별로 숨기고 보이고") - 이 화면 동안만(저장하지 않음)
    var KINDS = [["photo", "📷", "사진", "Photos"], ["memo", "📝", "메모", "Notes"], ["rf-hut", "🏠", "대피소 · 산장", "Shelters · huts"],
        ["rf-temple", "卍", "절", "Temples"], ["rf-view", "👁", "전망대", "Viewpoints"], ["rf-water", "💧", "약수터", "Drinking water"]];   // 역은 단추 없이 늘 보임(2026-11-23 홍TV님 "🚉 아이콘은 없어도 돼. 국토부처럼")
    var hidden = {};
    var CONTOUR_KEY = "rf-contour", contourOn = false, demContour = null, contourCfg = null;   // 등고선 - 따라가기와 같은 기억(rf-contour) · 간격 · 색
    try { contourOn = localStorage.getItem(CONTOUR_KEY) === "1"; } catch (e) { /* 기본 끔 */ }

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : {}; });
    }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    /** 한국 시각 "2026. 11. 20. 11:33". */
    function when(t) { var d = new Date(t + 9 * 3600000); return d.getUTCFullYear() + ". " + (d.getUTCMonth() + 1) + ". " + d.getUTCDate() + ". " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()); }

    function clear() {
        marks.forEach(function (m) { m.remove(); });
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        marks = []; cards = []; urls = []; items = []; pick = -1;
        if (popup) { popup.remove(); popup = null; }
        $("side").innerHTML = "";
    }

    /** 기록 요약 표(2026-11-23 홍TV님 "GPX 열기 화면에 두 번째 정보" - 내 기록 📈 창에 있던 것) - 100대 명산 자료가 오면 가장 높은 곳을 공식 높이로 다시 씀. */
    var curRec = null, famRaw = null;
    function drawSum() {
        var el = $("sumTbl");
        if (!el || !curRec) return;
        el.innerHTML = "";
        RF.recordSummary(curRec, famRaw ? famRaw.peaks : [], famRaw ? famRaw.elev : {}, EN).forEach(function (r) {
            var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
            a.textContent = r[0]; b.textContent = r[1];
            row.appendChild(a); row.appendChild(b); el.appendChild(row);
        });
    }

    /**
     * 마우스 따라가기(2026-11-23 홍TV님 "GPX 편집처럼 자료보기에서도 마우스 움직임을 따라가게") - 출발부터 d 미터 자리를 지도의 노란 점 · 그래프 세로선 · 그래프 머리 한 줄로.
     * 그래프 위(마우스 · 손가락)와 지도의 선 가까이(마우스)에서 부름. 시각이 있는 기록이면 출발부터 걸린 시간도.
     */
    var hov = null;
    function hoverAt(d) {
        if (!rc || !map) return;
        var p = RF.at(rc, d);
        if (!hov) { var el = document.createElement("div"); el.className = "hov"; hov = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map); }
        else hov.setLngLat([p.lon, p.lat]);
        if (prof) prof.set(d);
        var i = RF.indexAt(rc, d);   // 반으로 나눠 찾기(점검 14차 D5 - 긴 기록에서 움직일 때마다 앞에서부터 셌음)
        var t0 = rc.time && rc.time[0], ti = rc.time && rc.time[i], el2 = typeof t0 === "number" && typeof ti === "number" ? ti - t0 : null;
        $("profTip").textContent = RF.km(d) + " km" + (p.ele != null ? T(" · 해발 ", " · elev. ") + RF.num(Math.round(p.ele)) + " m" : "") + (el2 != null ? " · " + RF.hm(el2) : "");
    }
    function hoverOff() {
        if (hov) { hov.remove(); hov = null; }
        if ($("profTip")) $("profTip").textContent = "";
    }

    /**
     * 코스 보기 정보 칸(점검 14차 C3 - 받은 코스 정보를 버리고 선만 썼음): 예상 시간(따라가기 표준 시간 · 공단 시간) · 난이도 · 오르막 · 내리막,
     * 위험 · 조망 지점과 지나는 곳 - 누르면 그 자리를 지도 · 그래프에(마우스 따라가기와 같은 노란 점).
     */
    function infoBox(c) {
        var box = document.createElement("div"), asc = c.asc && c.asc.length ? c.asc[c.asc.length - 1] : 0, down = RF.climbBetween(c, 0, c.total).down;
        box.id = "cInfo";
        // 오른 높이는 위 요약 표에 있어 내리막만(두 숫자가 셈 방법 차이로 조금 달라 헷갈리지 않게). 공단 정보가 있으면 난이도는 그 줄에 - 칩은 routefly 어림일 때만
        var p = document.createElement("p"), off = RF.infoText(c.info, c.total), lv = off ? null : RF.levelChip(c.total, asc, EN, RF.steepest(c.dist, c.ele), null);
        p.className = "ci";
        p.textContent = T("⏱ 예상 ", "⏱ About ") + RF.hm(RF.legMs(c, 0, c.total)) + T(" · 내리막 ", " · down ") + RF.num(Math.round(down)) + " m ";
        if (lv) p.appendChild(lv);
        box.appendChild(p);
        if (off) { var q = document.createElement("p"); q.className = "ci"; q.textContent = "🏞 " + off; box.appendChild(q); }
        // 들머리 일출 · 일몰과 지금 날씨 한 줄(2026-11-24 홍TV님 - 오래 머무는 화면이라 산 페이지 · 따라가기와 같은 자료로). 받지 못하면 일출 · 일몰만
        var sun = document.createElement("p"), lat0 = c.lat[0], lon0 = c.lon[0];
        sun.className = "ci wx";
        var clock = function (ms) { var d = new Date(ms + 9 * 3600000); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
        var rise = RF.sunrise(Date.now(), lat0, lon0), set = RF.sunset(Date.now(), lat0, lon0);
        sun.textContent = T("🌅 일출 ", "🌅 Sunrise ") + (rise ? clock(rise) : "-") + T(" · 🌇 일몰 ", " · 🌇 Sunset ") + (set ? clock(set) : "-");
        box.appendChild(sun);
        getJson("api/wx?lat=" + (+lat0).toFixed(4) + "&lon=" + (+lon0).toFixed(4)).then(function (x) {
            var w = x && x.weather, hours = w && !w.unavailable ? w.hours || [] : [];
            if (!hours.length || !sun.isConnected) return;
            var col = RF.wxCols(hours, String(hours[0].t).slice(0, 10), EN, 1)[0];
            if (!col) return;
            sun.textContent += T(" · 지금 들머리 ", " · Now at the start ") + col.icon + " " + col.word + (col.tmp != null ? " " + col.tmp + "℃" : "")
                + (col.pop != null ? T(" · 강수 ", " · rain ") + col.pop + "%" : "") + (col.wsd != null ? T(" · 바람 ", " · wind ") + (col.dir ? col.dir + " " : "") + col.wsd + "m/s" : "");
            var src = document.createElement("span");
            src.className = "src"; src.textContent = T(" (기상청 단기예보)", " (KMA forecast)");
            sun.appendChild(src);
        }).catch(function () { /* 날씨 없이 일출 · 일몰만 */ });
        var pts = [];
        (c.spots || []).forEach(function (s) {
            if (s.dist_m == null || (s.kind !== "danger" && s.kind !== "view")) return;
            pts.push({ d: +s.dist_m, dg: s.kind === "danger", t: (s.kind === "danger" ? "⚠️ " : "🔭 ") + (NM(s.name) || T(s.kind === "danger" ? "위험" : "조망점", s.kind === "danger" ? "Danger" : "Viewpoint")) });
        });
        (c.pois || []).forEach(function (q) { if (q.name && q.dist_m != null) pts.push({ d: +q.dist_m, t: "📍 " + NM(q.name) }); });
        pts.sort(function (a, b) { return a.d - b.d; });
        if (pts.length) {
            var w = document.createElement("div");
            w.className = "pts";
            pts.slice(0, 40).forEach(function (o) {
                var b = document.createElement("button");
                b.type = "button"; if (o.dg) b.className = "dg";
                b.textContent = o.t + " · " + RF.km(o.d) + " km";
                b.onclick = function () { hoverAt(o.d); var q = RF.at(rc, o.d); if (map) map.easeTo({ center: [q.lon, q.lat], duration: 500 }); };
                w.appendChild(b);
            });
            box.appendChild(w);
        }
        $("side").appendChild(box);
    }

    /** 기록 하나 그리기. photoUrl(id) → 약속(그림 주소 | null). */
    function show(rec, photoUrl) {
        clear();
        curRec = rec;
        rc = RF.recordCourse(rec);
        rcBox = [Math.min.apply(null, rc.lat), Math.max.apply(null, rc.lat), Math.min.apply(null, rc.lon), Math.max.apply(null, rc.lon)];
        if (rc.lat.length < 2) { $("side").innerHTML = "<p class=\"empty\">" + T("점이 모자라 그릴 수 없습니다.", "Not enough points to draw.") + "</p>"; return; }
        $("title").textContent = NM(rec.name) || T("기록 보기", "View record");
        document.title = (NM(rec.name) || "") + (courseParam ? T(" - routefly 코스 보기", " - routefly course") : T(" - routefly 기록 보기", " - routefly record"));   // 코스 보기는 그 이름(점검 14차 C6)
        $("stat").textContent = (rec.start != null ? when(rec.start) + " · " : "") + RF.km(rc.total) + " km" + (rec.start != null && rec.end != null && rec.end > rec.start ? " · " + RF.hm(rec.end - rec.start) : "")
            + (rec.up != null ? T(" · 오른 높이 ", " · climb ") + RF.num(rec.up) + " m" : rc.asc && rc.asc.length ? T(" · 오르막 ", " · ascent ") + RF.num(rc.asc[rc.asc.length - 1]) + " m" : "");
        prof = RF.profile($("prof"), rc, { speed: RF.speedProfile(rc), labels: false });
        hoverOff();
        var sum = document.createElement("div");
        sum.id = "sumTbl";
        $("side").appendChild(sum);
        drawSum();
        if (courseParam && courseInfo) infoBox(courseInfo);
        // 광고 카드 하나 - 요약 · 코스 정보 아래, 사진 카드 앞(2026-11-24 홍TV님 "trip 에 넣어줘"). PC 넓은 화면만(js/ads.js 가 폰 · 앱은 지움), 승인 전 쿠팡 · 뒤 애드센스.
        // 기록 · 사진은 이 기기 안에서만 읽고 광고 쪽으로 보내지 않음
        if (window.rfAdSpots) {
            var ad = document.createElement("div");
            ad.className = "adSpot adWide adCard"; ad.setAttribute("data-where", "side");
            $("side").appendChild(ad);
            window.rfAdSpots([ad]);
        }
        var narrow = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;   // 폰 세로는 그래프가 지도를 많이 가려 접어 두고 📈 단추로
        if (courseParam) narrow = false;   // 코스 보기는 높이 그래프가 핵심이라 폰에서도 펼쳐 둠(점검 14차 C4)
        $("graph").hidden = narrow; $("graphBtn").hidden = !narrow;
        placeKit();
        items = (rec.notes || []).map(function (n, i) { return { n: n, d: rc.pois[i] ? rc.pois[i].dist_m : null, url: null }; });
        if (!items.length && !courseParam) $("side").insertAdjacentHTML("beforeend", "<p class=\"empty\">" + T("이 기록에는 사진 · 메모가 없습니다.", "This record has no photos or notes.") + "</p>");   // 코스 보기(?c=)는 사진이 없는 게 보통이라 안 씀
        items.forEach(function (it, i) {
            var card = document.createElement("div"), ph = document.createElement("div"), tx = document.createElement("div"), tm = document.createElement("div");
            card.className = "card";
            card.tabIndex = 0; card.setAttribute("role", "button");   // 키보드로도 고르기(점검 14차 C1)
            card.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); card.click(); } });
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
            // 카드에 마우스를 올리면 지도 위 그 표시도 주황으로 크게(2026-11-22 홍TV님 "사진에 마우스가 가면 거꾸로 지도상의 카메라가 활성화")
            card.addEventListener("mouseenter", function () { if (it.mark) it.mark.getElement().classList.add("hover"); });
            card.addEventListener("mouseleave", function () { if (it.mark) it.mark.getElement().classList.remove("hover"); });
            $("side").appendChild(card);
            cards.push(card);
        });
        cfgP.then(function () {
            var line = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rc.lon.map(function (x, k) { return [x, rc.lat[k]]; }) } };
            var draw = function () {
                if (!map.getSource("trk")) {
                    map.addSource("trk", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
                    // 우리 지도는 글자(봉우리 · 마을 이름) 층 아래에 그어 선이 이름을 덮지 않게(2026-11-22 홍TV님 - 세석 · 촛대봉 이름이 선 밑에 깔렸음). V-World 그림 바탕에는 글자 층이 없음
                    var under = firstSymbol();
                    if (vector) {   // 공원 탐방로 - 기록 선 아래, 연한 회청색(parkTrails)
                        map.addSource("parktr", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
                        map.addLayer({ id: "parktr", type: "line", source: "parktr", layout: { "line-join": "round", "line-cap": "round" },
                            paint: { "line-color": "#56728c", "line-opacity": 0.5, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.9, 13, 2, 16, 3.2] } }, under);   // 중간 진하기(2026-11-23 PC: 처음 0.55 #3b5b78 은 짙고, 0.4 #6f8aa3 은 거의 안 보임)
                        // 탐방로 길 위 글자(선을 따라 눕혀 씀) - 글자 층 맨 앞(봉우리 · 역 · 마을 이름에 자리를 내줌), 확대 12부터
                        map.addLayer({ id: "parktr-label", type: "symbol", source: "parktr", minzoom: 12, filter: ["!=", ["get", "label"], ""],
                            layout: { "symbol-placement": "line", "symbol-spacing": 250, "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11,
                                "text-keep-upright": true, "text-max-angle": 35, "text-padding": 2 },
                            paint: { "text-color": "#3d5a73", "text-halo-color": "#fffdf5", "text-halo-width": 1.4 } }, under);
                    }
                    map.addLayer({ id: "trk-halo", type: "line", source: "trk", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 8, "line-opacity": 0.8 } }, under);
                    map.addLayer({ id: "trk", type: "line", source: "trk", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["coalesce", ["get", "color"], "#5b45ff"], "line-width": 4.5 } }, under);   // 구간 색(segData)
                    // 구간 거리 · 시간 · 오르내림은 지도에 쓰지 않고 오른쪽 구간 표에만(2026-11-23 홍TV님 "저 거리 부분은 지도에서 안 보이게 해. 오른쪽에 있으니")
                }
                paintTrack();
                parkTrails();
                peakKeys = []; namedPeaks = []; tileFeats = []; passMarks = [];
                if (famSet) map.getSource("marks").setData(marksData());   // 앞 기록의 지나간 봉우리 지움
                markPeaks();
                // 처음 화면(확대 10 ~ 11) 조각에는 작은 봉우리가 빠져 있어, 선이 지나는 확대 12 조각을 지도 파일에서 바로 읽어 처음부터 나눔(2026-11-23 PC 운영 v360 - 사패산)
                var forRc = rc;
                RFMap.tilePeaks(rc.lat, rc.lon).then(function (f) { if (rc === forRc && f.length) { tileFeats = f; markPeaks(); } });
                var b = new maplibregl.LngLatBounds();
                line.geometry.coordinates.forEach(function (q) { b.extend(q); });
                // 처음 화면은 기록 전체를 맞춘 것보다 조금 가깝게(2026-11-23 홍TV님 "휠 한 칸 키운 것을 기본으로, 그 상태에서 조금 줄여" - 휠 한 칸은 약 0.15)
                var cam = map.cameraForBounds(b, { padding: fitPad(), maxZoom: 15 });   // 아래는 단추 줄 · 로고 · 그래프만큼 비움(2026-11-23 PC: 끝점이 단추 줄 뒤로 들어감)
                if (cam) map.jumpTo({ center: cam.center, zoom: Math.min(15, cam.zoom + FIRST_ZOOM_UP), bearing: 0 });
                else map.fitBounds(b, { padding: fitPad(), duration: 0, maxZoom: 15 });
            };
            kindBar();   // 단추 줄 · 로고를 먼저 - draw 의 처음 맞춤(fitPad)이 그 높이를 재야 함(2026-11-23 PC: 처음 열 때만 끝점이 단추 줄에 걸침)
            placeKit();
            whenStyle(draw);
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
            hutCards();
            whenStyle(applyKinds);
        });
    }

    /** 이 기록 · 이 지도에 있는 표시 종류만 단추로(사진 · 메모는 있을 때, 대피소 등은 우리 지도일 때) + 모두 숨기기 · 보이기. */
    function kindBar() {
        var bar = $("kinds"), has = { photo: items.some(function (it) { return it.n.photo; }), memo: items.some(function (it) { return !it.n.photo; }) };
        bar.innerHTML = "";
        var list = KINDS.filter(function (k) { return k[0] === "photo" || k[0] === "memo" ? has[k[0]] : vector; });
        bar.hidden = !list.length;
        list.forEach(function (k) {
            var b = document.createElement("button"), on = !hidden[k[0]], name = T(k[2], k[3]);
            b.type = "button"; b.className = "kind" + (on ? "" : " off"); b.textContent = k[1];
            b.title = (on ? T("숨기기: ", "Hide: ") : T("보이기: ", "Show: ")) + name;
            b.setAttribute("aria-label", name); b.setAttribute("aria-pressed", on ? "true" : "false");
            b.onclick = function () { hidden[k[0]] = on; applyKinds(); kindBar(); };
            bar.appendChild(b);
        });
        if (!list.length) return;
        var any = list.some(function (k) { return !hidden[k[0]]; }), all = document.createElement("button");
        all.type = "button"; all.className = "all";
        all.textContent = any ? T("모두 숨기기", "Hide all") : T("모두 보이기", "Show all");
        all.onclick = function () { list.forEach(function (k) { hidden[k[0]] = any; }); applyKinds(); kindBar(); };
        bar.appendChild(all);
    }

    /** 숨긴 종류를 지도에 반영 - 사진 · 메모 표시는 감추고, 대피소 등은 poi-hike 층 거름으로. */
    function applyKinds() {
        items.forEach(function (it) { if (it.mark) it.mark.getElement().style.display = hidden[it.n.photo ? "photo" : "memo"] ? "none" : ""; });
        if (map && map.getLayer("poi-hike")) {
            map.setFilter("poi-hike", RFMap.poiShowFilter(map.getLayoutProperty("poi-hike", "icon-image"), Object.keys(hidden).filter(function (k) { return hidden[k] && /^rf-/.test(k); }), dropHuts));
        }
        if (map && map.getLayer("rf-hut")) map.setLayoutProperty("rf-hut", "visibility", hidden["rf-hut"] ? "none" : "visible");   // 🏠 단추는 공단 대피소도
    }

    /** 지도 모양(style)이 준비되면 fn - 이미 됐으면 바로. */
    function whenStyle(fn) { if (styleOk) fn(); else styleQ.push(fn); }

    /** 첫 글자 층 id(없으면 undefined - 맨 위에 그음). */
    function firstSymbol() {
        var ls = (map.getStyle() && map.getStyle().layers) || [];
        for (var i = 0; i < ls.length; i++) if (ls[i].type === "symbol") return ls[i].id;
        return undefined;
    }

    /** 지금 받아 둔 지도 조각에서 기록이 지나간 봉우리를 찾아 "peak-on"(크게)으로 - 새 조각이 올 때마다(idle) 더함. */
    function markPeaks() {
        if (!vector || !map.getLayer("peak-on")) return;
        putMarks();
        var pts = function (layer) {
            return map.querySourceFeatures("omt", { sourceLayer: layer }).map(function (f) {
                var g = f.geometry && f.geometry.coordinates;
                return g ? { name: f.properties.name, ele: f.properties.ele, cls: f.properties["class"], sub: f.properties.subclass, lon: g[0], lat: g[1] } : null;
            }).filter(Boolean);
        };
        var feats = pts("mountain_peak").concat(tileFeats), more = function (have, add) { return add.filter(function (k) { return have.indexOf(k) < 0; }); };
        var addOn = rc ? more(peakKeys, RFMap.peaksNear(feats, rc.lat, rc.lon, PEAK_NEAR_M)) : [], addDrop = [], addHut = [];
        if (fam) {
            fam.peaks.forEach(function (p) {   // 같은 이름의 OSM 봉우리만(옆 봉우리는 그대로)
                addDrop = addDrop.concat(more(dropPeaks.concat(addDrop), RFMap.peaksNear(feats.filter(function (f) { return f.name === p.name; }), [p.lat], [p.lon], SAME_M)));
            });
            var huts = pts("poi").filter(function (f) { return RFMap.isHutPoi(f.cls, f.sub, f.name); });   // 지도에 대피소로 그리는 OSM poi 와 같은 조건(산장 · 이름에 "대피소" 든 쉼터)   // 이름이 달라도(로타리 · 로터리) 자리로
            addHut = more(dropHuts, RFMap.peaksNear(huts, fam.huts.map(function (h) { return h.lat; }), fam.huts.map(function (h) { return h.lon; }), SAME_M)
                .map(function (k) { return k.slice(0, k.lastIndexOf("|")); }));
        }
        // 지나간 "…산" 정상(2026-11-23 홍TV님 "불암산 · 수락산 · 사패산 같은 곳에서도 구간을 끊기") - 새로 찾으면 구간을 다시 나눔
        if (rc) {
            var newNamed = RF.stopsAlong(rc, feats.filter(function (f) { return /산$/.test(f.name || "") && !namedPeaks.some(function (n) { return n.name === f.name; }); }), PEAK_NEAR_M)
                .map(function (q) { return { name: q.s.name, lat: q.s.lat, lon: q.s.lon }; })
                .filter(function (q, k, all) { return all.findIndex(function (o) { return o.name === q.name; }) === k; });   // 같은 봉우리가 이웃 조각마다 들어 있어 한 번만(2026-11-23 PC: 사패산 ×4)
            if (newNamed.length) { namedPeaks = namedPeaks.concat(newNamed); if (map.getSource("trk")) paintTrack(); }
        }
        if (addOn.length || addDrop.length) {
            peakKeys = peakKeys.concat(addOn); dropPeaks = dropPeaks.concat(addDrop);
            map.setFilter("peak-on", RFMap.peakOnFilter(peakKeys, true, dropPeaks));
            map.setFilter("peak", RFMap.peakOnFilter(peakKeys, false, dropPeaks));
            // 더하기 층 봉우리(rf-summit)에도 바탕 봉우리를 옮겨 담은 것이 있어(같은 이름|높이 - tools forest-summits.py) 같은 거름: 지나간 봉우리 · 100대 명산과 두 번 안 보이게
            if (map.getLayer("rf-summit")) map.setFilter("rf-summit", RFMap.peakOnFilter(peakKeys, false, dropPeaks));
            // 지나간 봉우리는 늘 보이는 표시(rf-peak)에도 - 지도 파일은 사패산 같은 봉우리를 확대 12 조각부터 담아, 처음 화면(12 아래)에서 안 보였음(2026-11-23 홍TV님 "사패산은 보여야지")
            var seen = {};
            passMarks = feats.filter(function (f) {
                var k = RFMap.peakKey(f);
                if (seen[k] || peakKeys.indexOf(k) < 0 || dropPeaks.indexOf(k) >= 0) return false;
                return (seen[k] = true);
            }).map(function (f) {
                return { type: "Feature", properties: { kind: "peak", name: f.name, label: "▲ " + f.name + (f.ele != null ? "\n" + f.ele + "m" : "") }, geometry: { type: "Point", coordinates: [f.lon, f.lat] } };
            });
            if (famSet) map.getSource("marks").setData(marksData());
        }
        if (addHut.length) { dropHuts = dropHuts.concat(addHut); applyKinds(); }
    }

    /** 기록 선 - 우리 지도에서 공단 대피소 · 100대 명산 정상 자료가 있으면 그곳(선에서 200m 안)에서 끊어 구간마다 다른 색, 없으면 한 색. */
    function segData() {
        if (!rc) return { type: "FeatureCollection", features: [] };
        if (fam) return RF.trackSegments(rc, fam.huts.concat(fam.peaks, namedPeaks), SEG_NEAR_M, SEG_GAP_M);
        return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rc.lon.map(function (x, k) { return [x, rc.lat[k]]; }) } };
    }

    /**
     * 기록이 지나간 국립공원의 탐방로 선을 기록 선 아래에 연하게(우리 지도 · 대피소 자료가 있을 때). 공원은 폰 안에서 정하고(RF.recordPark) 서버에는 공원 이름만 보냄 -
     * 기록 위치는 보내지 않음(개인정보처리방침). 같은 공원이면 다시 받지 않음, 공원 밖 기록이면 지움.
     */
    function parkTrails() {
        if (!vector || !rc || !parkCands.length || !map.getSource("parktr")) return;
        var park = RF.recordPark(rc, parkCands, PARK_NEAR_M);
        if (park === parkShown) return;
        parkShown = park;
        map.getSource("parktr").setData({ type: "FeatureCollection", features: [] });
        if (!park) return;
        getJson("api/park?name=" + encodeURIComponent(park)).then(function (d) {
            if (parkShown !== park || !d || !d.trails) return;
            var f = d.trails.concat(d.others || []).filter(function (t) { return t.coords && t.coords.length > 1; }).map(function (t) {
                // 길 위 글자 "거리 · 표준 시간"(2026-11-23 홍TV님 "네이버처럼 - 탐방로 · 우리 코스 선에", 기록 선은 그대로) - 내리막 자료가 없어 오르막까지만 셈
                var lab = t.distance_m > 0 ? RF.segText({ m: t.distance_m, ms: RF.standardMs("hike", t.distance_m, t.ascent_m) }) : "";
                return { type: "Feature", properties: { name: t.name, label: lab }, geometry: { type: "LineString", coordinates: t.coords } };
            });
            map.getSource("parktr").setData({ type: "FeatureCollection", features: f });
        }).catch(function () { /* 못 받으면 그냥 기록만 */ });
    }

    /** 지도 맞춤 여백 - 그래프 · 왼쪽 아래 표시 단추 줄 · 로고(mapKit) 높이만큼 아래를 비움(구간을 가리지 않게, 2026-11-23 PC: 좁은 화면에서 단추 줄이 덮음). */
    function fitPad() {
        var g = $("graph"), k = $("mapKit"), m = $("map").getBoundingClientRect();
        var gb = g.hidden ? 0 : m.bottom - g.getBoundingClientRect().top + 20, kb = k ? m.bottom - k.getBoundingClientRect().top + 12 : 0;
        return { top: 60, left: 40, right: 60, bottom: Math.max(60, Math.min(Math.max(gb, kb), m.height * 0.55)) };
    }

    /** 기록 선 · 구간 글 · 구간 목록을 지금 자료(segData)로 다시 그림. */
    function paintTrack() {
        var fc = segData(), segs = fc.features || [];
        map.getSource("trk").setData(fc);
        if (map.getLayer("trk")) map.setPaintProperty("trk", "line-width", 4.5);
        segList(segs);
    }

    /**
     * 오른쪽(폰은 아래) 맨 위 구간 표(2026-11-23 홍TV님 "구간 목록") - 색 · "노고단대피소 → 연하천대피소" · 거리 · 걸린 시간 · 오르내림.
     * 누르면 그 구간을 지도에 맞추고 굵게, 그래프는 구간 가운데로. 구간이 하나뿐이면(끊은 곳 없음) 표를 두지 않음.
     */
    function segList(segs) {
        var old = $("segs");
        if (old) old.remove();
        if (segs.length < 2) return;
        var box = document.createElement("div"), h = document.createElement("div");
        box.id = "segs"; h.className = "sh"; h.textContent = T("구간 ", "Sections ") + segs.length;
        box.appendChild(h);
        segs.forEach(function (f) {
            var p = f.properties, b = document.createElement("button"), dot = document.createElement("span"), nm = document.createElement("span"), st = document.createElement("span");
            b.type = "button"; b.className = "seg";
            dot.className = "dot"; dot.style.background = p.color;
            nm.className = "nm"; nm.textContent = (p.from || T("출발", "Start")) + " → " + (p.to || T("도착", "Finish"));
            st.className = "st"; st.textContent = RF.segText(p);
            b.appendChild(dot); b.appendChild(nm); b.appendChild(st);
            b.onclick = function () {
                var bb = new maplibregl.LngLatBounds();
                f.geometry.coordinates.forEach(function (q) { bb.extend(q); });
                map.fitBounds(bb, { padding: fitPad(), duration: 600, maxZoom: 15 });
                map.setPaintProperty("trk", "line-width", ["case", ["==", ["get", "seg"], p.seg], 8, 4.5]);
                Array.prototype.forEach.call(box.querySelectorAll(".seg"), function (x) { x.classList.toggle("on", x === b); });
                if (prof) prof.set(p.d + p.m / 2);
            };
            box.appendChild(b);
        });
        $("side").insertBefore(box, $("side").firstChild);
    }

    /** 공단 대피소 사진 - (lat, lon) 에서 HUT_CARD_M 안 공단 대피소(fam.huts)에 사진이 있으면 그것, 없으면 null(OSM 대피소 이름이 달라도 자리로). */
    function hutPhotoAt(lat, lon) {
        if (!fam) return null;
        for (var i = 0; i < fam.huts.length; i++) {
            var h = fam.huts[i];
            if (hutPhotos[h.name] && RF.distM(lat, lon, h.lat, h.lon) <= HUT_CARD_M) return hutPhotos[h.name];
        }
        return null;
    }

    /** 대피소 사진 그림 - CC BY-SA 등 바꿈 금지(sa)는 자르지 않고 그대로(contain), 공공누리 제1유형 · CC0 는 칸에 맞게. */
    function hutImg(p, cls) {
        var im = new Image();
        im.src = p.file; im.alt = p.name; im.loading = "lazy"; im.className = "hutImg " + cls + (p.sa ? " asis" : "");
        return im;
    }

    /** 사진 출처 한 줄(제목 · 작가 · 라이선스, 원본 링크) - 늘 함께 보임. */
    function hutCredit(p) {
        var d = document.createElement("div"), a = document.createElement("a");
        d.className = "hutCredit";
        d.appendChild(document.createTextNode(T("사진: ", "Photo: ") + [p.title, p.author].filter(Boolean).join(" · ") + " · "));
        a.textContent = p.license; a.target = "_blank"; a.rel = "noopener";
        if (/^https:\/\//.test(p.url || "")) a.href = p.url;
        d.appendChild(a);
        return d;
    }

    /**
     * 기록이 지나간 공단 대피소의 사진을 오른쪽 사진 목록에 - 내 사진 · 메모 카드 사이, 기록 위 거리 차례로(RF.stopsAlong). 누르면 지도가 그리로 · 그래프 표시.
     * 사진이 없는 대피소는 카드를 두지 않음. 기록 · 자료가 바뀔 때마다 다시 넣음.
     */
    function hutCards() {
        Array.prototype.forEach.call(document.querySelectorAll("#side .card.hut"), function (x) { x.remove(); });
        if (!rc || !fam) return;
        RF.stopsAlong(rc, fam.huts.filter(function (h) { return hutPhotos[h.name]; }), HUT_CARD_M).forEach(function (q) {
            var p = hutPhotos[q.s.name], card = document.createElement("div"), ph = document.createElement("div"), tx = document.createElement("div"), tm = document.createElement("div");
            card.className = "card hut"; ph.className = "ph"; tx.className = "tx"; tm.className = "tm";
            ph.appendChild(hutImg(p, "card"));
            tm.textContent = "🏠 " + T("출발부터 ", "from start ") + RF.km(q.d) + " km";
            tx.appendChild(tm); tx.appendChild(document.createTextNode(q.s.name)); tx.appendChild(hutCredit(p));
            card.appendChild(ph); card.appendChild(tx);
            card.onclick = function (e) {
                if (e.target.tagName === "A") return;   // 라이선스 링크는 그대로
                map.easeTo({ center: [q.s.lon, q.s.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
                if (prof) prof.set(q.d);
            };
            // 내 사진 · 메모 카드 가운데 거리가 더 먼 첫 카드 앞에(없으면 맨 뒤)
            var after = null;
            for (var i = 0; i < items.length; i++) if (items[i].d != null && items[i].d > q.d) { after = cards[i]; break; }
            $("side").insertBefore(card, after);
        });
    }

    /**
     * 봉우리 · 대피소 · 절 등을 누르면(2026-11-23 홍TV님 "봉들 대피소를 클릭하면 카메라처럼 그래프에 위치 표시") 기록 위 가장 가까운 자리를 그래프에 표시하고
     * 이름 · 출발부터 거리 · 해발을 작은 창으로. 선에서 멀면(PICK_NEAR_M 넘음) 이름 · 선에서 거리 · 지형 해발. 확대 · 축소하면 닫힘.
     */
    function pickPlace(e) {
        var f = e.features && e.features[0];
        if (!f || !rc) return;
        var g = f.geometry.coordinates, nm = String(f.properties.name || f.properties.label || "").replace(/^▲ /, "").split("\n")[0];
        var q = RF.snap(rc, g[1], g[0]), box = document.createElement("div"), b = document.createElement("b"), t = document.createElement("div");
        b.textContent = nm;
        box.appendChild(b); box.appendChild(t);
        var hp = hutPhotoAt(g[1], g[0]);   // 공단 대피소(300m 안)면 그 사진을 말풍선에
        if (hp) { box.appendChild(hutImg(hp, "pop")); box.appendChild(hutCredit(hp)); }
        if (q && q.off <= PICK_NEAR_M) {
            var p = RF.at(rc, q.d);
            t.textContent = T("출발부터 ", "from start ") + RF.km(q.d) + " km" + (p.ele != null ? T(" · 기록 해발 ", " · recorded elev. ") + RF.num(Math.round(p.ele)) + " m" : "");
            if (prof) prof.set(q.d);
        } else if (q) t.textContent = T("기록 선에서 ", "") + RF.km(q.off) + T(" km 떨어진 곳", " km from this record");   // 기록 밖 장소 - 선에서 얼마나 먼지(2026-11-23 홍TV님 "'이 기록에서 떨어진 곳' 뭐야?")
        // 누른 자리의 지형 해발(약 30m 격자 - "약") - OSM 에 높이가 없는 곳도(2026-11-23 홍TV님 "높이 넣어주고"). 봉우리는 이름 아래 높이가 이미 있어 그대로
        var h = document.createElement("div");
        box.appendChild(h);
        if (contourCfg && contourCfg.demUrl) RFMap.demEle(contourCfg.demUrl, g[0], g[1]).then(function (m) {
            if (m != null && m > -100) h.textContent = T("해발 약 ", "elev. about ") + RF.num(Math.round(m)) + " m" + T("(지형 자료)", " (terrain data)");
        });
        if (popup) popup.remove();
        // 빈 곳을 누르거나 ✕ · Esc 로 닫힘(2026-11-23 PC: 닫는 단추가 없어 닫기 어려웠음)
        popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12, className: "placePop" }).setLngLat(g).setDOMContent(box).addTo(map);
        var pp = popup;
        map.once("zoomstart", function () { if (popup === pp) { popup.remove(); popup = null; } });   // 확대 · 축소하면 닫힘(2026-11-23 홍TV님 "지도를 축소해도 그대로 있네")
        var x = popup.getElement().querySelector(".maplibregl-popup-close-button");
        if (x) { x.setAttribute("aria-label", T("닫기", "Close")); x.title = T("닫기", "Close"); }
    }

    /** 받아 둔 표시를 지도 marks 에 한 번(지도 모양이 준비된 뒤 - 자료가 먼저 오면 다음 idle 에). */
    /** 늘 보이는 표시 자료 = 공단 대피소 · 100대 명산(famGj) + 기록이 지나간 봉우리(passMarks). */
    function marksData() { return { type: "FeatureCollection", features: famGj.features.concat(passMarks) }; }

    function putMarks() {
        if (famSet || !famGj || !map.getSource("marks")) return;
        famSet = true;
        map.getSource("marks").setData(marksData());
        if (map.getSource("trk")) { paintTrack(); parkTrails(); }   // 자료가 늦게 오면 그때 구간 색 · 공원 탐방로
    }

    /**
     * 공단 대피소 · 100대 명산 정상 자료를 지도를 만들 때 바로 받음(우리 지도일 때 한 번). 못 받으면 그냥 OSM 것만.
     * 지도 "load" 는 모든 조각(지형 등)을 받은 뒤라 늦어 쓰지 않음(2026-11-22: 늦게 받으면 멀리 본 첫 화면에 안 나왔음).
     */
    function loadMarks() {
        var photosP = fetch("data/shelter-photos.json").then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
        Promise.all([RF.famousFetch(), photosP]).then(function (d) {
            var f0 = d[0], gj = f0.gj;
            famRaw = f0;
            drawSum();   // 가장 높은 곳 - 100대 명산 정상 근처면 공식 높이로
            hutPhotos = {};
            ((d[1] && d[1].photos) || []).forEach(function (p) { if (p && p.name && /^img\/shelter\/[\w.-]+\.(?:jpe?g|png|webp)$/.test(p.file || "")) hutPhotos[p.name] = p; });
            // 국립공원 찾기 후보 - 공단 대피소의 공원 · 국립공원 이름과 같은 100대 명산(지리산 천왕봉 등)
            parkCands = f0.shelters.map(function (s) { return { park: s.park, lat: s.lat, lon: s.lon }; })
                .concat(f0.peaks.map(function (p) { return { park: p.id, lat: p.lat, lon: p.lon }; }));
            fam = { peaks: [], huts: [] };
            gj.features.forEach(function (f) { var c = f.geometry.coordinates; fam[f.properties.kind === "hut" ? "huts" : "peaks"].push({ name: f.properties.name, lon: c[0], lat: c[1] }); });
            famGj = gj;
            if (styleOk) markPeaks();
            hutCards();
        }).catch(function () { /* 자료가 없으면 OSM 것만 */ });
    }

    /**
     * 등고선 켜기 · 끄기(2026-11-22 홍TV님 "등고선을 보이고 안 보이고") - 따라가기(hike.js setContour)와 같은 지형 타일 · 간격(RFMap.CONTOUR_STEPS) · 색(RFMap.contourPaint),
     * 켠 것은 같은 기억(rf-contour). 기록 선 · 글자 아래에 그음.
     */
    function setContour(on) {
        contourOn = !!on;
        try { localStorage.setItem(CONTOUR_KEY, contourOn ? "1" : "0"); } catch (e) { /* 기억 못 해도 됨 */ }
        if (contourOn && !map.getSource("contours") && window.mlcontour) {
            if (!demContour) {
                demContour = new mlcontour.DemSource({ url: contourCfg.demUrl, encoding: "terrarium", maxzoom: contourCfg.vworldKey && !vector ? 12 : 15, worker: true });
                demContour.setupMaplibre(maplibregl);
            }
            map.addSource("contours", { type: "vector", maxzoom: 15, tiles: [demContour.contourProtocolUrl({
                thresholds: RFMap.CONTOUR_STEPS, overzoom: 1, contourLayer: "contours", elevationKey: "ele", levelKey: "level" })] });
            var cp = RFMap.contourPaint(true);   // 기록 보기 바탕은 둘 다 밝음(우리 지도 · V-World 일반 지도)
            map.addLayer({ id: "contours", type: "line", source: "contours", "source-layer": "contours", minzoom: 11,
                paint: { "line-color": cp.color, "line-opacity": cp.opacity, "line-width": ["match", ["get", "level"], 1, 1.4, 0.7] } },
                map.getLayer("trk-halo") ? "trk-halo" : firstSymbol());
        }
        if (map.getLayer("contours")) map.setLayoutProperty("contours", "visibility", contourOn ? "visible" : "none");
        var b = $("contourBtn");
        if (!b) return;
        b.classList.toggle("on", contourOn);
        b.setAttribute("aria-pressed", contourOn ? "true" : "false");
        b.title = contourOn ? T("등고선 끄기", "Hide contour lines") : T("등고선 켜기(가까이 보면 20m 간격)", "Show contour lines (20 m apart when zoomed in)");
        b.setAttribute("aria-label", b.title);
    }

    /** 지도 오른쪽 위 단추 묶음에 〰️ 등고선 단추(MapLibre 단추 모양). */
    function contourControl() {
        return {
            onAdd: function () {
                var g = document.createElement("div"), b = document.createElement("button");
                g.className = "maplibregl-ctrl maplibregl-ctrl-group";
                b.type = "button"; b.id = "contourBtn"; b.textContent = "〰️";
                b.addEventListener("click", function () { setContour(!contourOn); });
                g.appendChild(b);
                return g;
            },
            onRemove: function () { /* 이 화면에서는 떼지 않음 */ }
        };
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
        if ($("big").style.display !== "flex") bigFrom = document.activeElement;
        $("big").style.display = "flex";
        $("bigClose").focus();   // 키보드 · 화면 읽기가 사진 창 안에서(점검 14차 C9), 닫으면 누른 곳으로
    }
    function step(k) {
        for (var j = pick + k; j >= 0 && j < items.length; j += k) if (items[j].url) { big(j); return; }
    }
    var bigFrom = null;
    function bigClose() {
        $("big").style.display = "none"; $("bigImg").removeAttribute("src");
        if (bigFrom && bigFrom.focus) try { bigFrom.focus(); } catch (e) { /* 지워진 칸 */ }
        bigFrom = null;
    }
    $("bigClose").onclick = bigClose;
    $("bigPrev").onclick = function () { step(-1); };
    $("bigNext").onclick = function () { step(1); };
    $("bigImg").onclick = bigClose;
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && popup && $("big").style.display !== "flex") { popup.remove(); popup = null; return; }   // 봉우리 · 대피소 말풍선
        if ($("big").style.display !== "flex") return;
        if (e.key === "Escape") bigClose(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
    });
    $("graphClose").onclick = function () { $("graph").hidden = true; $("graphBtn").hidden = false; placeKit(); };
    $("graphBtn").onclick = function () { $("graph").hidden = false; $("graphBtn").hidden = true; placeKit(); };
    /** 표시 단추 줄 · 로고(mapKit)를 열린 그래프와 겹치지 않게 - 좌우로 겹치면 그래프 위로, 아니면 CSS 자리(왼쪽 아래). */
    function placeKit() {
        var k = $("mapKit"), g = $("graph");
        k.style.bottom = "";
        if (g.hidden) return;
        var kr = k.getBoundingClientRect(), gr = g.getBoundingClientRect();
        if (kr.right > gr.left && kr.left < gr.right && kr.bottom > gr.top) k.style.bottom = (g.parentNode.getBoundingClientRect().bottom - gr.top + 8) + "px";
    }
    window.addEventListener("resize", placeKit);

    // 지도(V-World 지도 + 지형 음영 - 위성은 쓰지 않음). 우리 바탕 지도 파일(map.basemap.url)이 설정되면 그것(2026-11-22 바탕 지도 2단계 - 기록 보기만 먼저)
    // 파일이 아직 서버에 없거나(404) 못 읽으면 V-World 바탕으로(2026-11-22 PC: 설정이 파일보다 먼저 들어가 운영 기록 보기가 바탕 없이 지형 음영만 보였음)
    cfgP = getJson("api/map-config").catch(function () { return {}; }).then(function (c) {
        var cfg = { demUrl: c.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: c.vworldKey || null };
        // 바탕 지도 파일 확인이 오래 걸리면(산속 느린 통신) 8초 뒤 V-World 바탕으로(점검 14차 C9 - 전에는 지도가 끝없이 비었음)
        var late = new Promise(function (ok) { setTimeout(function () { ok(null); }, 8000); });
        return Promise.race([RFMap.open(c.basemapUrl, cfg.demUrl, { lang: LANG }).catch(function () { return null; }), late]).then(function (style) { return { cfg: cfg, style: style }; });
    }).then(function (o) {
        var cfg = o.cfg, style = o.style;
        vector = !!style; contourCfg = cfg;
        map = new maplibregl.Map({ container: "map", style: style || RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 6.5, locale: RF.mapLocale(), attributionControl: false,
            localIdeographFontFamily: "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" });   // 한글 지명은 폰 글꼴로
        // 점검용 - 주소에 ?debug=map 일 때만 콘솔에서 지도 · 봉우리 찾기 상태를 봄(2026-11-23 PC 에서만 사패산 · 역이 안 보여서). 이 기기 안에서만, 보내는 것 없음
        if (/[?&]debug=map(?:&|$)/.test(location.search)) {
            window.__rfMap = map;
            window.__rfPeaks = function () { return { peakKeys: peakKeys, namedPeaks: namedPeaks, dropPeaks: dropPeaks, dropHuts: dropHuts, fam: !!fam, rc: !!rc, vector: vector }; };
        }
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        if (window.mlcontour) map.addControl(contourControl(), "top-right");
        // 우리 지도는 바탕 출처에 "© OpenStreetMap contributors" 가 이미 있어 한 번만(2026-11-22 PC: 두 번 보였음). V-World 바탕일 때는 여기서 붙임
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: (style ? "" : "© OpenStreetMap contributors | ") + "<a href=\"" + T("about.html", "about-en.html") + "\">" + T("안내", "About") + "</a>" }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        // 출처는 ⓘ 로 접어 둠(노선 · 탐방 안내도와 같게 - 폰에서 펼친 출처가 사진 표시를 가렸음), ⓘ 를 누르면 보임
        var fold = function () { var at = document.querySelector(".maplibregl-ctrl-attrib"); if (at) at.classList.remove("maplibregl-compact-show"); };
        fold();
        // 지도 모양(style)만 준비되면 선 · 층을 더함 - "load" 는 모든 조각(지형 등)을 받은 뒤라 늦거나 지형 조각이 실패하면 오지 않아,
        // 그 전에 연 GPX 가 그려지지 않았음(2026-11-23 PC: 새로 연 뒤 3초에 열면 선 없음 · 전국 화면). 지도의 loaded 값도 조각을 받는 동안 늘 거짓이라 쓰지 않음
        map.once("style.load", function () { styleOk = true; fold(); setContour(contourOn); var q = styleQ; styleQ = []; q.forEach(function (fn) { fn(); }); });
        if (vector) loadMarks();
        // 지도의 선 가까이에서 마우스를 움직이면 그 자리를 그래프 · 노란 점으로(2026-11-23 홍TV님 "GPX 편집처럼 마우스 움직임을 따라가게") - 화면에서 약 14px 안
        var hovRaf = 0, hovD = null;
        map.on("mousemove", function (e) {
            if (!rc || hovRaf) return;
            hovRaf = requestAnimationFrame(function () {
                hovRaf = 0;
                var lat = e.lngLat.lat, lon = e.lngLat.lng, mpp = 40075016 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom())), tol = mpp * 14;
                // 점검 14차 D5: 선을 둘러싼 네모(+여유) 밖이면 선을 훑지 않음, 안이면 지난 자리 앞뒤부터(RF.snap prevD)
                var dy = tol / 110540, dx = tol / (111320 * Math.cos(lat * Math.PI / 180));
                if (!rcBox || lat < rcBox[0] - dy || lat > rcBox[1] + dy || lon < rcBox[2] - dx || lon > rcBox[3] + dx) { hovD = null; hoverOff(); return; }
                var q = RF.snap(rc, lat, lon, hovD);
                if (q && q.off <= tol) { hovD = q.d; hoverAt(q.d); } else { hovD = null; hoverOff(); }
            });
        });
        map.getCanvas().addEventListener("mouseleave", hoverOff);
        map.on("idle", markPeaks);
        // 조각을 받을 때마다도(0.4초 모아 한 번) - "idle" 은 지형 · 사진 표시가 계속 그려지면 늦거나 안 와, 확대해도 사패산에서 안 나뉘고 ▲ 이름도 안 보였음(2026-11-23 PC 불수사도북 z12.95)
        var peakT = 0;
        map.on("sourcedata", function (e) {
            if (e.sourceId !== "omt" || !e.isSourceLoaded) return;
            clearTimeout(peakT); peakT = setTimeout(markPeaks, 400);
        });
        map.on("styleimagemissing", function (e) { RFMap.iconImage(map, e.id); });
        if (vector) RFMap.shopList(map);   // 가게 점을 누르면 그 건물 가게 목록(같은 점 "외 n곳", 2026-11-23 홍TV님)
        if (vector) {
            var PLACES = ["rf-peak", "rf-hut", "peak-on", "peak", "poi-hike"];
            PLACES.forEach(function (id) {
                map.on("click", id, pickPlace);
                map.on("mouseenter", id, function () { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", id, function () { map.getCanvas().style.cursor = ""; });
            });
        }   // 대피소 · 절 등 아이콘(우리 지도 poi-hike)   // 지도 조각이 더 오면 지나간 봉우리를 더 찾음
        return map;
    });

    /** 이 기기의 IndexedDB 에서 하나 읽기(따라가기와 같은 저장소 · 이름) - 없거나 못 읽으면 null. */
    function idbGet(name, store, key) {
        return new Promise(function (resolve) {
            if (!window.indexedDB) { resolve(null); return; }
            var r = indexedDB.open(name, 1);
            r.onupgradeneeded = function () { r.result.createObjectStore(store); };   // 따라가기와 같은 모양(처음이면 빈 저장소)
            r.onerror = function () { resolve(null); };
            r.onsuccess = function () {
                var db = r.result;
                try {
                    var q = db.transaction(store, "readonly").objectStore(store).get(key);
                    q.onsuccess = function () { db.close(); resolve(q.result == null ? null : q.result); };
                    q.onerror = function () { db.close(); resolve(null); };
                } catch (e) { db.close(); resolve(null); }
            };
        });
    }

    // 📒 내 기록의 🗺 지도로 들어옴(?rec=시작 시각|코스 - 따라가기 recKey, 2026-11-22 홍TV님): 이 기기의 기록 · 사진으로 그림, 뒤로는 따라가기 내 기록
    var recParam = new URLSearchParams(location.search).get("rec");
    if (recParam) {
        $("back").href = (EN ? "hike.html?lang=en" : "hike.html") + "#rec";   // 따라가기의 📒 내 기록 창을 열어 둠(2026-11-23 홍TV님 - 따라가기 첫 화면만 나왔음)
        $("back").textContent = T("‹ 내 기록", "‹ My records");
        // 내 기록에서 들어오면 📂 GPX 열기 대신 🛩 3D 영상 · 💾 GPX 저장 · 📐 GPX 편집 · ✕ 삭제(2026-11-23 홍TV님 - 📤 GPX 보내기 창의 두 가지를 단추로) - 하는 일은 따라가기 내 기록이 함(hike.html#recdo=무엇:기록 열쇠)
        // 📐 GPX 편집(2026-11-24 홍TV님 "'등록 요청'을 'GPX 편집' 으로 바꾸고") - 이 기록을 GPX 편집에서 열어 고친 뒤 운영자는 ⬆ 코스로 올리기, 다른 사람은 📮 등록 요청
        $("openBtn").hidden = true;
        $("recBtns").hidden = false;
        $("rec-edit").onclick = function () { location.href = "studio.html#rec=" + encodeURIComponent(recParam); };
        if (EN) $("rec-edit").hidden = true;   // GPX 편집은 한국어 화면만(점검 14차 C6)
        ["fly", "save", "del"].forEach(function (k) {
            // 지우기는 이 화면을 뒤로 가기 기록에서 바꿈 - 지운 기록 화면으로 되돌아오지 않게(점검 14차 C9)
            $("rec-" + k).onclick = function () { var u = (EN ? "hike.html?lang=en" : "hike.html") + "#recdo=" + k + ":" + encodeURIComponent(recParam); if (k === "fly") vidBack(); if (k === "del") location.replace(u); else location.href = u; };
        });
        RF.myRecords().then(function (list) {   // IndexedDB · localStorage(따라가기가 IndexedDB 를 못 쓸 때 남기는 곳) - GPX 편집과 같은 읽기(점검 14차 F2)
            var rec = list.filter(function (r) { return r && RF.recKey(r) === recParam; })[0];
            if (!rec) { $("side").innerHTML = "<p class=\"empty\">" + T("이 기기에서 그 기록을 찾지 못했습니다.", "That record is not on this device.") + "</p>"; return; }
            show(rec, function (id) {
                return idbGet("rf-photos", "p", id).then(function (blob) { return blob ? URL.createObjectURL(blob) : null; });
            });
        });
    }

    // 📐 코스 기록 보기(?c=코스 ID[&title=] - 따라가기 코스 목록의 📐, 2026-11-24 홍TV님 "모두에게 열어주고"): 지도 · 그래프 · 구간 · 마우스 따라가기는 누구나,
    // 🛩 3D 는 코스 3D 화면(목록 fly(3D) 와 같은 주소), 💾 GPX 저장은 받아도 되는 코스(RF.courseGpxFree)만 · 운영자 기기는 모두(따라가기 #coursegpx 가 저장), 📐 GPX 편집은 운영자 기기만. 삭제는 없음
    var courseParam = recParam ? null : new URLSearchParams(location.search).get("c");
    if (courseParam) {
        // 주소의 title 은 60자까지 · 줄바꿈 없이(아무 글이나 우리 화면 제목으로 길게 띄우지 못하게 - 점검 14차 B3). 이름은 서버 코스 이름이 먼저
        var cTitle = String(new URLSearchParams(location.search).get("title") || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 60), cQ = "#c=" + encodeURIComponent(courseParam) + (cTitle ? "&title=" + encodeURIComponent(cTitle) : "");
        $("back").href = EN ? "hike.html?lang=en" : "hike.html";
        $("back").textContent = T("‹ 코스 목록", "‹ Courses");
        $("openBtn").hidden = true;
        $("rec-del").hidden = $("rec-save").hidden = $("rec-edit").hidden = true;   // 운영자 · 받아도 되는지 안 뒤에 보임
        $("recBtns").hidden = false;
        // 🔗 공유(점검 14차 C2 - 자세히 본 뒤 목록으로 돌아가 다시 찾아야 했음). 공유는 검색에 내는 코스 소개 페이지(/c/) - 이은 코스는 따라가기 주소
        // 🥾 따라가기 · 3D 미리보기는 코스 목록 줄에 있어 여기서는 안 보임 - 🛩 3D 영상은 내 기록 · 연 GPX 와 같이 촬영(2026-11-25 홍TV님 "이 화면에서는 모두 촬영")
        $("rec-share").hidden = false;
        $("rec-share").onclick = function () {
            var url = new URL(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(courseParam) ? "c/" + courseParam : "hike.html" + cQ, location.href).href, ttl = $("title").textContent;
            if (navigator.share) { navigator.share({ title: ttl, url: url }).catch(function () { /* 닫음 */ }); return; }
            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { alert(T("주소를 복사했습니다.", "Link copied.")); }, function () { prompt(T("이 주소를 복사하세요", "Copy this link"), url); });
        };
        var gpxText = null, gpxName = null;   // 받아 둔 코스로 만든 GPX - 💾 가 그 자리에서 저장(점검 14차 D2)
        $("rec-save").onclick = function () {
            // 앱은 파일 저장 · 공유 창을 따라가기가 맡음(그대로), 브라우저는 이미 받은 코스로 바로 - 따라가기 페이지를 다시 열고 같은 코스를 또 받지 않음
            if (window.Capacitor || !gpxText) { location.href = (EN ? "hike.html?lang=en" : "hike.html") + "#coursegpx=" + encodeURIComponent(courseParam) + (cTitle ? "&title=" + encodeURIComponent(cTitle) : ""); return; }
            if (!confirm(T("\"" + NM(gpxName) + "\" 코스를 GPX 파일로 저장할까요?", "Save \"" + NM(gpxName) + "\" as a GPX file?"))) return;
            var a = document.createElement("a"), u = URL.createObjectURL(new Blob([gpxText], { type: "application/gpx+xml" }));
            a.href = u; a.download = "routefly-" + String(courseParam).replace(/[^\w-]+/g, "_").slice(0, 60) + ".gpx";
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(u); }, 10000);
        };
        $("rec-edit").onclick = function () { location.href = "studio.html" + cQ; };
        var ownP = RF.ownerDevice();
        // 이은 코스(대표 코스 - 쉼표 · @ 든 ID)도 조각마다 받아 이음(RF.courseFetch, 점검 14차 A5)
        var cJson = function (u) { return fetch(u, { headers: { Accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); };
        Promise.all([RF.courseFetch(courseParam, cJson), ownP]).then(function (a) {
            var c = a[0], src = (c.course && c.course.source) || null, t = RF.courseTrack(c, false);
            var name = (c.course && c.course.name) || cTitle || courseParam, got = t.length > 1 ? RF.gpxRecord(RF.trackGpx(name, c.course && c.course.kind, t), true, name) : null;
            if (!got) { $("side").innerHTML = "<p class=\"empty\">" + T("코스 선을 받지 못했습니다.", "Could not load the course line.") + "</p>"; return; }
            $("rec-save").hidden = !(a[1] || RF.courseGpxFree(courseParam, src));
            if (!$("rec-save").hidden) { gpxName = name; gpxText = RF.trackGpx(name, c.course && c.course.kind, t, { wpt: true, en: EN, credit: RF.courseGpxCredit(courseParam, src, EN) }); }   // 따라가기 courseGpx 와 같은 파일
            $("rec-edit").hidden = !a[1] || EN;
            courseInfo = c;   // RF.courseFetch 가 이미 fromApi 꼴(거리 · 높이 · 지점 · 공단 정보)
            show(got.rec, function () { return Promise.resolve(null); });
            $("rec-fly").onclick = function () { flyFile(got, true); };   // 공개 코스라 처음 · 끝을 자르지 않음
        }).catch(function () { $("side").innerHTML = "<p class=\"empty\">" + T("코스를 받지 못했습니다.", "Could not load the course.") + "</p>"; });
    }

    function photoBlob(b64) {
        try {
            var bin = atob(b64), u8 = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            return new Blob([u8], { type: "image/jpeg" });
        } catch (e) { return null; }
    }

    /**
     * 연 GPX 파일로 🛩 3D 비행 영상(2026-11-23 홍TV님) - 내 기록과 같은 준비(RF.flyStart: 처음 · 끝 300m 자름). 파일 속 사진은 3D 화면이 읽는 이 기기 사진 저장소(rf-photos)에
     * 넣어 둠(내 기록에 없는 사진은 따라가기가 나중에 저절로 지움 - hike.js gcPhotos). 영상은 따라가기 화면(hike.html#vid)에서 저장 · 보내기.
     */
    /** 촬영 · 저장 뒤 따라가기가 이 화면으로 돌아오게(hike.js vidBack) - 15분 안에만 씀. */
    function vidBack(hash) {
        try { sessionStorage.setItem("rf-vid-back", JSON.stringify({ u: "trip.html" + location.search + (hash || ""), t: Date.now() })); } catch (e) { /* 따라가기에 머묾 */ }
    }
    function flyFile(got, keepEnds, hash) {
        var f;
        try { f = RF.flyStart(got.rec, EN, keepEnds); } catch (e) { alert(T("영상을 준비하지 못했습니다: ", "Could not prepare the video: ") + (e && e.message || e)); return; }
        if (f.short) { alert(f.short); return; }
        if (!confirm(f.msg)) return;
        var ids = Object.keys(got.photos || {});
        new Promise(function (resolve) {
            if (!ids.length || !window.indexedDB) { resolve(); return; }
            var r = indexedDB.open("rf-photos", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("p"); };
            r.onerror = function () { resolve(); };
            r.onsuccess = function () {
                var db = r.result;
                try {
                    var tx = db.transaction("p", "readwrite"), st = tx.objectStore("p");
                    ids.forEach(function (id) { var b = photoBlob(got.photos[id]); if (b) st.put(b, id); });
                    tx.oncomplete = tx.onerror = tx.onabort = function () { db.close(); resolve(); };
                } catch (e) { db.close(); resolve(); }
            };
        }).then(function () { vidBack(hash); location.href = f.url; });
    }

    // 그래프 위에서 움직이면(마우스 · 손가락) 그 자리를 지도에(GPX 편집 profHover 와 같은 일)
    function profMove(e) {
        if (!rc) return;
        var r = $("prof").getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        hoverAt(Math.max(0, Math.min(1, x / r.width)) * rc.total);
    }
    $("prof").addEventListener("mousemove", profMove);
    $("prof").addEventListener("touchmove", function (e) { profMove(e); e.preventDefault(); }, { passive: false });
    $("prof").addEventListener("mouseleave", hoverOff);

    // 📂 GPX 열기 - 이 기기 안에서만 읽음
    var OPEN_KEY = "rf-trip-open";
    $("openBtn").onclick = function () { $("gpxFile").value = ""; $("gpxFile").click(); };
    $("gpxFile").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { alert(T("파일이 너무 큽니다(8MB 까지).", "The file is too big (8 MB max).")); return; }
        if (location.hash === "#open") history.replaceState(null, "", location.pathname + location.search);   // 새 파일 - 돌아올 자리 표시는 따라가기를 누를 때 다시
        f.text().then(function (text) { openText(text, f.name); }).catch(function () { alert(T("파일을 읽지 못했습니다.", "Could not read the file.")); });
    });
    // 🥾 따라가기에서 돌아오면(#open) 보던 파일을 다시 보여 줌 - 이 탭의 sessionStorage 에만(서버로 안 감). 너무 커서 못 담았으면 첫 화면
    if (!recParam && !courseParam && location.hash === "#open") {
        try { var back = JSON.parse(sessionStorage.getItem(OPEN_KEY) || "null"); if (back && back.text) openText(back.text, back.name); } catch (e) { /* 첫 화면 */ }
    }
    /** 이 파일을 이 탭에 담아 둠(따라가기 · 3D 촬영에서 돌아올 때 #open 으로 다시 그림) - 너무 크면 false(돌아올 때 첫 화면). */
    function keepOpen(text, name) {
        try { sessionStorage.setItem(OPEN_KEY, JSON.stringify({ name: name, text: text })); history.replaceState(null, "", "#open"); return true; } catch (e) { return false; }
    }
    function openText(text, fname) {
        var f = { name: fname };
        var got = RF.gpxRecord(text, true, f.name);   // 시각 없는 코스 GPX 도(선 · 지점 · 고도만, 속도 · 시간 없이)
        if (!got) { alert(T("GPX 에 길(점)이 없습니다.", "The GPX has no track points.")); return; }
        show(got.rec, function (id) {
            var b = photoBlob(got.photos[id]);
            return Promise.resolve(b ? URL.createObjectURL(b) : null);
        });
        // 연 GPX 파일도 🛩 3D 영상(2026-11-23 홍TV님) · 📐 GPX 편집(2026-11-24 홍TV님 "넣어줘") - 저장 · 삭제는 내 기록에만 있어 숨김
        $("recBtns").hidden = false; $("rec-save").hidden = true; $("rec-edit").hidden = EN; $("rec-del").hidden = true;   // GPX 편집은 한국어 화면만
        $("rec-fly").onclick = function () { flyFile(got, false, keepOpen(text, f.name) ? "#open" : ""); };
        // 🥾 따라가기(2026-11-25 홍TV님 "📂 GPX 열기로 들어오면 따라가기 버튼") - 따라가기 GPX 열기와 같은 이 기기 GPX(storeGpx, gpx- ID)로 엶.
        // 뒤로 오면 이 화면에 같은 파일(#open + sessionStorage)
        $("rec-go").hidden = false;
        $("rec-go").onclick = function () {
            var id = RF.gpxId(text);
            try { RF.storeGpx(id, RF.gpxToApi(text, f.name)); }
            catch (e) { alert(T("GPX 를 담지 못했습니다(이 기기 저장 공간): ", "Could not keep the GPX (device storage): ") + (e && e.message || e)); return; }
            keepOpen(text, f.name);
            location.href = (EN ? "hike.html?lang=en" : "hike.html") + "#c=" + encodeURIComponent(id) + "&from=trip";
        };
        // 보고 있던 길을 이 탭의 sessionStorage 로 GPX 편집에 넘김(이 기기 안에서만, 서버로 안 감 - 사진은 빼고 선 · 시각 · 높이만). 너무 커서 못 담으면 알림
        $("rec-edit").onclick = function () {
            try { sessionStorage.setItem("rf-studio-in", JSON.stringify({ name: got.rec.name || f.name, track: got.rec.track })); }
            catch (e) { alert(T("길이 너무 커서 넘기지 못했습니다. GPX 편집에서 📂 열기로 이 파일을 여세요.", "The track is too big to pass on. Open this file with 📂 Open in the GPX editor.")); return; }
            location.href = "studio.html#file";
        };
    }
})();
