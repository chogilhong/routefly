/* 만든 파일 - 고치지 마세요. course-kit.js 를 고친 뒤 node tools/kit-split/split.js (이 화면이 쓰는 것만 남긴 course-kit) */
/*
 * routefly 공통 도구 - 비행 화면(app.js)과 산행 화면(hike.js)이 같이 씁니다.
 *   - 코스 위치 계산: at(진행 거리 → 위치 · 고도), grade(경사), snap(GPS 위치 → 코스 위 진행 거리 · 벗어난 거리)
 *   - 고도 그래프: 지점 이름(비스듬히) · km 눈금 · 지금 위치 점
 *   - 작은 평면 지도: 북쪽이 위, km 번호 · 지점 · 지금 위치
 * 코스 c = {lon[], lat[], ele[], dist[], total, pois[], course}
 */
(function (global) {
    "use strict";
    function num(n, digits) {
        if (n == null || !isFinite(n)) return "-";
        return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }
    function km(m) { return num(m / 1000, 2); }

    // ------------------------------------------------------------------ 화면 말(2026-10-17 홍TV님 - 따라가기 영어 1 · 2단계)
    // 따라가기(hike.js)가 RF.setLang("en") 을 부를 때만 영어 - 비행 화면 · 산 페이지(/m/ · /en/m/)는 이 값을 쓰지 않음(늘 그대로).
    var LANG = "ko";
    function setLang(l) {
        LANG = l === "en" ? "en" : "ko";
        // 종류 말(KINDS 는 같은 객체로 견주는 곳이 있어 안의 말만 바꿈)
        Object.keys(KINDS).forEach(function (k) {
            var o = KINDS[k];
            if (!o.ko) o.ko = { label: o.label, act: o.act, sos: o.sos };
            var w = LANG === "en" ? KINDS_EN[k] : o.ko;
            o.label = w.label; o.act = w.act; o.sos = w.sos;
        });
    }
    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /** 산 페이지 맨 아래 ☕ 후원 줄(2026-10-17 홍TV님) - https 주소일 때만 보임. 한국어 donate.url · 영어 donate.en.url(PayPal). */
    /**
     * 🏨 근처 숙소 줄(산 페이지 /m/ · /en/m/, 2026-10-29 점검) - 정상 좌표로 트립닷컴(없으면 아고다) 제휴 링크 + 수수료 알림. 설정이 없으면 숨김 그대로.
     * box 의 data-name(한글 산 이름)으로 찾음. 돌려줌: 보였나.
     */
    /**
     * 순수 함수 - "🏨 근처 숙소 찾기"(/m/, 2026-10-29 홍TV님 "산청군청 근처 숙소") 예약 단추들: 설정된 제휴(트립닷컴 · 아고다 · 호텔스컴바인) + 카카오맵 숙소 검색(제휴 아님). 여기어때 · 야놀자는 뺌(2026-10-30 홍TV님).
     * q - 찾은 장소 이름, lat · lon - 그 좌표. → [{text, href, sponsored}]
     */
    function stayLinks(p, q, lat, lon, en, area, agodaCity) {
        p = p || {};
        // area - 주소의 시 · 군 · 구(예: 산청군). 아고다 검색어로(장소 이름 "산청군청" 보다 결과가 많음, 2026-10-29). 없으면 장소 이름
        var kw = String(area || q || "").replace(/\s+/g, " ").trim().slice(0, 20);
        var out = [], ok = isFinite(lat) && isFinite(lon) && lat !== null && lon !== null, nm = String(q || "").replace(/\s+/g, " ").trim().slice(0, 30);
        var trip = p.trip && ok ? tripLink(p.trip, lat, lon, nm) : null;
        if (trip) out.push({ text: en ? "🏨 Trip.com" : "🏨 트립닷컴", href: trip, sponsored: true });
        function fill(u) { return u.replace(/\{q\}/g, encodeURIComponent(nm)).replace(/\{lat\}/g, ok ? (+lat).toFixed(5) : "").replace(/\{lon\}/g, ok ? (+lon).toFixed(5) : ""); }
        // 제휴 링크가 설정되면 그것(🏨, 수수료), 아직이면 그 사이트 첫 화면(🔎, 제휴 아님 - 2026-10-29). 여기어때 · 야놀자는 뺌(2026-10-30 홍TV님 "빼줘")
        // 첫 화면 주소만 씀 - 검색 주소 모양은 확인한 뒤(지어내지 않음). 호텔스컴바인은 설정했을 때만
        // 아고다는 도시 번호(city=)가 있어야 결과가 열려, 없으면 첫 화면
        [["agoda", "아고다", "Agoda", en ? "https://www.agoda.com/" : "https://www.agoda.com/ko-kr/"],
            ["hotels", "호텔스컴바인", "HotelsCombined", null]].forEach(function (x) {
            var u = p[x[0]];
            // 자리({q} · {lat}) 없는 제휴 링크도 씀 - 아고다 파트너스 텍스트 링크(partnersearch.aspx?cid=…)처럼 그 사이트 검색 화면으로 가고, 거기서 예약하면 수수료(2026-10-29 홍TV님 화면)
            // 아고다 도시 번호(data/agoda-cities.json 의 가까운 도시)가 있으면 그 지역 결과로 - 아고다는 city= 가 있어야 결과가 열림(2026-10-29 PC)
            var city = x[0] === "agoda" && agodaCity ? "city=" + agodaCity + (kw ? "&textToSearch=" + encodeURIComponent(kw) : "") : "";
            if (u && !(/\{lat\}/.test(u) && !ok)) { out.push({ text: "🏨 " + (en ? x[2] : x[1]), href: fill(u) + (city && !/[?&]city=/.test(u) ? (u.indexOf("?") < 0 ? "?" : "&") + city : ""), sponsored: true }); return; }
            if (city) { out.push({ text: "🔎 " + (en ? x[2] : x[1]), href: (en ? "https://www.agoda.com/search?" : "https://www.agoda.com/ko-kr/search?") + city, sponsored: false }); return; }
            if (x[3]) out.push({ text: "🔎 " + (en ? x[2] : x[1]), href: x[3], sponsored: false });
        });
        if (nm) out.push({ text: en ? "🗺 Kakao Map lodging" : "🗺 카카오맵 숙소", href: "https://map.kakao.com/link/search/" + encodeURIComponent(nm + " 숙소"), sponsored: false });
        return out;
    }
    /**
     * "🏨 근처 숙소 찾기" 칸(/m/ · /en/m/, 2026-10-29 홍TV님) - 장소 이름(산청군청 등) → api/place 로 좌표 → 예약 단추(stayLinks) + 그 근처 숙소 목록(api/stays, 한국관광공사).
     * form 안의 input · out 칸. partnersP - api/partners 약속. base - "../" 처럼 api 앞에 붙일 길.
     */
    /** 순수 함수 - 가장 가까운 아고다 도시 번호(40km 안, 숙소가 많은 도시를 조금 더 쳐 줌). 없으면 null. */
    function nearCity(cities, lat, lon) {
        if (!cities || !isFinite(lat) || !isFinite(lon)) return null;
        var best = null, bd = Infinity;
        cities.forEach(function (c) {
            if (!(c && /^\d{1,9}$/.test(String(c.id)))) return;   // 번호를 아직 못 채운 시 · 군(id null)은 건너뜀
            var d = distM(lat, lon, c.lat, c.lon), score = d / (1 + Math.log(1 + (c.n || 1)) / 10);
            if (d <= 40000 && score < bd) { bd = score; best = c.id; }
        });
        return best;
    }
    /**
     * 순수 함수 - 숙소 예약 사이트에 넘길 검색어: 찾은 말에 산 이름(…산 · …봉 낱말)이 있으면 그것, 없으면 찾은 곳 이름(place).
     * 2026-11-04 홍TV님: "월출산 천황사" 로 찾으면 트립닷컴에 "천황사" 가 넘어가 결과가 없었음 - "월출산 만 넣어". 좌표는 찾은 곳(천황사) 그대로.
     */
    function stayWord(q, place) {
        var m = /(?:^|\s)(\S{1,12}?(?:산|봉))(?=\s|$)/.exec(String(q || ""));
        return m ? m[1] : place;
    }
    function staySearch(form, out, partnersP, base, en) {
        // form 없이도(2026-11-15 홍TV님 tidefly 카드 "이런식으로 해줘") - 돌려준 함수 showAt(장소, 찾은 말)이 그 자리 숙소를 같은 모양(예약 단추 · 번호 지도 · 목록)으로
        if (!out || (form && form.rfBound)) return null;
        if (form) form.rfBound = true;
        var T = function (ko, e) { return en ? e : ko; }, input = form ? form.querySelector("input") : null;
        // 접어도 검색 칸은 보이게(/m/ 처음부터 펴 둔 칸, data-keep - 2026-10-30 홍TV님 "접으면? 그래도 검색창은 보이게 해"):
        // 접으면 검색 칸을 칸 밖(제목 바로 아래)으로 옮기고 결과 · 지도만 접힘, 펴면 제자리로. 접힌 채로 찾으면 다시 폄
        var det = form && form.closest ? form.closest("details[data-keep]") : null, home = form ? form.parentNode : null;
        // 마우스로 제목을 누르면 브라우저가 먼저 초점을 제목으로 옮김 - 누르는 순간에 입력 칸이었는지 기억(2026-10-30 PC 확인)
        var wasIn = false, sum = det && det.querySelector("summary");
        if (sum) sum.addEventListener("pointerdown", function () { wasIn = document.activeElement === input; });
        if (det) det.addEventListener("toggle", function () {
            var had = wasIn || document.activeElement === input;   // 옮기면 입력 칸 초점이 풀림 - 다시 줌(2026-10-30 점검, 키보드 · 화면 읽기)
            wasIn = false;
            if (det.open) home.insertBefore(form, home.firstChild);
            else det.parentNode.insertBefore(form, det.nextSibling);
            form.classList.toggle("ssOutside", !det.open);
            if (had) input.focus();
        });
        function el(tag, text, cls) { var x = document.createElement(tag); if (text != null) x.textContent = text; if (cls) x.className = cls; return x; }
        /** 주소에서 시 · 군 · 구 하나("경상남도 산청군 산청읍 …" → 산청군, "서울특별시 종로구 …" → 종로구). */
        function areaOf(a) { var m = /(?:^|\s)(\S+(?:군|구|시))(?=\s)/.exec(" " + String(a || "").replace(/^\S+(?:도|특별시|광역시|특별자치시|특별자치도)\s+/, "") + " "); return m ? m[1] : ""; }
        // 아고다 도시 번호표(tools/agoda-cities 로 만듦) - 없으면 그대로(도시 번호 없이)
        // 찾기를 누를 때 한 번 받고 기다림(2026-10-30 - 화면을 열자마자 받으면 다 받기 전에 누른 찾기는 도시 번호 없이 열렸음, 안 찾는 사람은 안 받음)
        var cities = null, citiesP = null, lastQ = "";
        function loadCities() {
            if (!citiesP) citiesP = fetch(base + "data/agoda-cities.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { cities = j && j.cities; }).catch(function () { /* 없음 - 도시 번호 없이 */ });
            return citiesP;
        }
        function agodaCity(lat, lon) { return nearCity(cities, lat, lon); }
        function links(p, q, lat, lon, area, city) {
            var row = el("p", null, "ssLinks"), ls = stayLinks(p, q, lat, lon, en, area, city), spon = false;
            ls.forEach(function (x) {
                var a = el("a", x.text + " ›");
                a.href = x.href; a.target = "_blank"; a.rel = x.sponsored ? "noopener sponsored" : "noopener";
                row.appendChild(a);
                spon = spon || x.sponsored;
            });
            if (spon) out.appendChild(el("p", T("🏨 표시는 제휴 링크 - 예약하면 routefly 가 수수료를 받습니다(값은 같음).", "🏨 links are affiliate links - routefly earns a commission if you book (same price)."), "dim"));   // 제휴 표시는 링크 앞에(2026-11-12 점검 - 공정위 심사지침 "처음에")
            out.appendChild(row);
        }
        // 작은 지도 - 찾은 곳(📍)과 숙소 번호 핀. V-World 지도 키(api/map-config)가 없으면 그리지 않음
        var mapKeyP = null;
        function stayMap(pl, st, before, my) {
            if (!mapKeyP) mapKeyP = fetch(base + "api/map-config").then(function (r) { return r.json(); }).then(function (c) { return c.vworldKey || null; }).catch(function () { return null; });
            var box = el("div", null, "ssMap");
            box.setAttribute("role", "group");   // 핀이 단추라 그림(img) 대신 묶음
            box.setAttribute("aria-label", T("찾은 곳과 숙소 자리 지도 - 번호는 아래 목록 번호", "Map of the place and lodging - numbers match the list below"));
            before.parentNode.insertBefore(box, before);
            mapKeyP.then(function (key) {
                if (my !== seq) return;
                var w = box.clientWidth || 320, h = box.clientHeight || 220, lay = key && stayTiles(pl, st, w, h);
                if (!lay) { box.remove(); return; }
                lay.tiles.forEach(function (t) {
                    var im = el("img"); im.alt = "";
                    im.addEventListener("error", function () { im.style.visibility = "hidden"; });
                    im.src = "https://api.vworld.kr/req/wmts/1.0.0/" + encodeURIComponent(key) + "/Base/" + lay.z + "/" + t.y + "/" + t.x + ".png";
                    im.style.left = t.left + "px"; im.style.top = t.top + "px";
                    box.appendChild(im);
                });
                // 핀을 누르면 아래 목록의 그 숙소로 내려가 잠깐 밝힘(2026-10-30)
                lay.pins.forEach(function (q, i) {
                    var pn = el("button", String(i + 1), "ssPin"); pn.type = "button"; pn.style.left = q[0] + "px"; pn.style.top = q[1] + "px";
                    pn.setAttribute("aria-label", (i + 1) + T("번 ", ". ") + (st[i] && st[i].name || "") + T(" - 목록에서 보기", " - show in the list"));
                    pn.addEventListener("click", function () {
                        var li = document.getElementById("ss" + my + "-" + (i + 1));
                        if (!li) return;
                        li.scrollIntoView({ behavior: "smooth", block: "center" });
                        li.classList.add("ssHi");
                        setTimeout(function () { li.classList.remove("ssHi"); }, 1600);
                    });
                    box.appendChild(pn);
                });
                var me = el("span", "📍", "ssHere"); me.style.left = lay.at[0] + "px"; me.style.top = lay.at[1] + "px";
                box.appendChild(me);
                box.appendChild(el("small", T("지도: 국토교통부 V-World", "Map: V-World (Korea MOLIT)"), "ssAttr"));
            });
        }
        var seq = 0;   // 찾기 · 다른 곳 고르기마다 하나씩 - 늦게 온 앞 답이 새 결과에 섞이지 않게(2026-10-30)
        var src = "";   // 위치 자료 출처(카카오 · 국토교통부 V-World) - 답의 source
        function show(p, pl, all, note) {
            var my = ++seq;
            out.textContent = "";
            if (note) out.appendChild(el("p", note, "dim"));   // 뒤 낱말은 못 찾아 앞 낱말(산 이름) 근처로(2026-10-29)
            out.appendChild(el("p", "📍 " + pl.name + (pl.addr && pl.addr !== pl.name ? " · " + pl.addr : "") + T(" 근처", " - nearby"), "ssAt"));
            if (all.length > 1) {   // 다른 곳이면 고르기
                var alt = el("p", T("다른 곳: ", "Other matches: "), "dim");
                all.forEach(function (o) {
                    if (o === pl) return;
                    // 이름이 같은 곳이 많음(산청군청 3곳 - 본청 · 별관 등, 2026-10-29 PC) - 시 · 도 · 군을 뺀 주소를 붙여 구분
                    var b = el("button", o.name + (o.addr ? " · " + String(o.addr).replace(/^(\S+(도|시)\s+)?(\S+(군|구|시)\s+)?/, "") : ""), "ssAlt");
                    b.type = "button";
                    b.addEventListener("click", function () { show(p, o, all); });
                    alt.appendChild(b);
                });
                out.appendChild(alt);
            }
            links(p, stayWord(lastQ, pl.name), pl.lat, pl.lon, areaOf(pl.addr), agodaCity(pl.lat, pl.lon));   // 트립닷컴 · 호텔스컴바인 · 카카오맵 검색어는 산 이름(있으면)
            var list = el("ul", null, "wl ssList");
            list.appendChild(el("li", T("근처 숙소를 찾는 중…", "Finding lodging nearby…")));
            out.appendChild(list);
            fetch(base + "api/stays?lat=" + pl.lat + "&lon=" + pl.lon).then(function (r) { return r.json(); }).then(function (j) {
                if (my !== seq) return;
                list.textContent = "";
                var st = (j.stays || []).slice(0, 10);
                if (st.length && j.radius_km > 5) list.appendChild(el("li", T("5km 안에 없어 " + j.radius_km + "km 까지 넓혀 찾았습니다.", "None within 5 km - widened to " + j.radius_km + " km."), "dim"));
                if (!st.length) { list.appendChild(el("li", j.unavailable ? T("숙소 목록을 지금 받지 못했습니다. 위 예약 단추로 찾아 주세요.", "Couldn't load the lodging list now. Use the buttons above.") : T((j.radius_km || 5) + "km 안에 등록된 숙소가 없습니다. 위 예약 단추로 찾아 주세요.", "No registered lodging within " + (j.radius_km || 5) + " km. Use the buttons above."))); return; }
                stayMap(pl, st, list, my);
                st.forEach(function (x, i) {
                    var li = el("li"), b = el("b"), nm = el("a", x.name), sm = el("small", " " + (x.kind ? (en ? stayKindEn(x.kind) : x.kind) + " · " : "") + (x.dist_m != null ? (x.dist_m / 1000).toFixed(1) + "km" : "") + (x.addr ? " · " + x.addr : ""));
                    li.id = "ss" + my + "-" + (i + 1);   // 지도 핀이 가리킴
                    li.appendChild(el("span", String(i + 1), "ssNo"));
                    if (x.photo) {   // 관광공사 대표 사진(있는 곳만)
                        var ph = el("img", null, "ssPh"); ph.src = x.photo; ph.alt = ""; ph.loading = "lazy"; ph.referrerPolicy = "no-referrer";
                        ph.addEventListener("error", function () { ph.remove(); });
                        li.appendChild(ph);
                    }
                    // 이름을 누르면 카카오맵 장소 화면(사진 · 후기) - 없으면 그 자리(2026-10-29 홍TV님)
                    var mh = /^https:\/\/place\.map\.kakao\.com\/\d+$/.test(x.url || "") ? x.url : stayMapLink(x.name, x.lat, x.lon);
                    if (mh) { nm.href = mh; nm.target = "_blank"; nm.rel = "noopener"; nm.setAttribute("aria-label", x.name + T(" - 카카오맵에서 보기", " - view on Kakao Map")); }
                    b.appendChild(nm); li.appendChild(b); li.appendChild(sm);
                    if (x.tel) { var t = el("a", " 📞 " + x.tel); t.href = "tel:" + String(x.tel).replace(/[^0-9+]/g, ""); li.appendChild(t); }
                    list.appendChild(li);
                });
                var kk = /카카오/.test(j.source || "");
                out.appendChild(el("p", T("숙소 목록: " + (kk ? "카카오 · " : "") + "한국관광공사(TourAPI) · 위치: " + (src || "국토교통부 V-World") + ". 요금 · 빈방은 예약 사이트에서 확인하세요.", "Lodging list: " + (kk ? "Kakao · " : "") + "Korea Tourism Organization · location: " + (src === "카카오" ? "Kakao" : !src || /V-World/.test(src) ? "V-World" : src) + ". Check prices and rooms on the booking sites."), "dim"));
            }).catch(function () { if (my !== seq) return; list.textContent = ""; list.appendChild(el("li", T("숙소 목록을 받지 못했습니다.", "Couldn't load the lodging list."))); });
        }
        if (form) form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (det && !det.open) det.open = true;   // 결과가 보이게
            var q = String(input.value || "").trim();
            lastQ = q;
            if (q.length < 2) { out.textContent = T("장소 이름을 두 글자 넘게 적어 주세요(예: 산청군청).", "Enter a place name (e.g. Sancheong County Office in Korean: 산청군청)."); input.focus(); return; }
            out.textContent = T("찾는 중…", "Searching…");
            var my = ++seq;
            Promise.all([fetch(base + "api/place?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); }), partnersP.catch(function () { return {}; }), loadCities()]).then(function (r) {
                if (my !== seq) return;   // 그사이 다시 찾음 - 늦게 온 답은 버림
                var pl = (r[0].places || []), p = r[1] || {};
                src = r[0].source || "";
                if (!pl.length) {
                    out.textContent = "";
                    out.appendChild(el("p", r[0].unavailable ? T("지금은 장소를 찾지 못합니다. 아래 지도로 찾아 주세요.", "Place search is unavailable now. Try the map below.")
                        : T("\"" + q + "\" 을(를) 찾지 못했습니다. 군청 · 역 · 터미널 · 산 이름처럼 적어 보세요.", "Couldn't find \"" + q + "\". Try a county office, station, terminal or mountain name.")));
                    links(p, q, NaN, NaN);   // 카카오맵 숙소 검색은 이름만으로
                    return;
                }
                show(p, pl[0], pl, r[0].partial ? T("\"" + q + "\" 을(를) 그대로는 찾지 못해 \"" + r[0].partial + "\" 근처로 보여 드립니다.", "Couldn't find \"" + q + "\" exactly - showing near \"" + r[0].partial + "\".") : "");
            }).catch(function () { if (my === seq) out.textContent = T("서버에 닿지 않습니다. 잠시 뒤 다시 해 주세요.", "Can't reach the server. Please try again shortly."); });
        });
        /** 이름으로 찾지 않고 이 자리(pl = {name, addr, lat, lon})로 바로 - 예약 단추 검색어는 q(산 이름 · 포인트 이름), where 는 위치 자료 출처(아래 글). */
        return function showAt(pl, q, where) {
            lastQ = q || pl.name;
            src = where || "";
            var my = ++seq;
            Promise.all([partnersP.catch(function () { return {}; }), loadCities()]).then(function (r) {
                if (my !== seq) return;
                show(r[0] || {}, pl, [pl], "");
            });
        };
    }
    /**
     * 산 페이지 코스 목록 아래 쏘카 한 줄(2026-11-03 홍TV님 - 링크프라이스 제휴). 쏘카는 휴대폰 앱 예약만 실적이라 휴대폰(ua)일 때만.
     * box - 숨겨 둔 칸, url - api/partners 의 socar(서버가 linkprice.com 인지 봄), label - 링크 글(없으면 등산 들머리 글, tidefly 는 포인트 글). 보였으면 true.
     * 제휴 안내는 링크 앞(점검 10차 F1 - 규칙: 안내가 먼저, 전에는 링크 뒤였음). esimLine 도 같게.
     */
    function socarLine(box, url, ua, label) {
        if (!box || !/^https:\/\//.test(url || "") || !/Android|iPhone|iPad|iPod/i.test(ua || "")) return false;
        var a = document.createElement("a"), s = document.createElement("small");
        a.href = url; a.target = "_blank"; a.rel = "noopener sponsored";
        a.textContent = label || "🚗 대중교통이 없는 들머리는 쏘카 ›";
        s.textContent = "[제휴] 쏘카 앱에서 예약하면 routefly 가 수수료를 받습니다(값은 같음). ";
        box.textContent = "";
        box.appendChild(s); box.appendChild(a);
        box.hidden = false;
        return true;
    }
    /**
     * 영어 산 페이지 코스 목록 아래 Airalo 한국 eSIM 한 줄(2026-11-03 홍TV님 - 링크프라이스 제휴, 외국인 등산객).
     * 112 · 119 전화는 데이터 없이도 되므로 "지도 · 날씨 · 따라가기" 데이터라고만 씀. 보였으면 true.
     */
    function esimLine(box, url) {
        if (!box || !/^https:\/\//.test(url || "")) return false;
        var a = document.createElement("a"), s = document.createElement("small");
        a.href = url; a.target = "_blank"; a.rel = "noopener sponsored";
        a.textContent = "📶 Korea eSIM - mobile data for maps, weather and GPS follow ›";
        s.textContent = "[Affiliate] Airalo - routefly earns a commission if you buy (same price). ";
        box.textContent = "";
        box.appendChild(s); box.appendChild(a);
        box.hidden = false;
        return true;
    }
    function indexAt(c, d) {
        var dist = c.dist, lo = 0, hi = dist.length - 1;
        if (d <= 0) return 0;
        if (d >= c.total) return hi;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (dist[mid] <= d) lo = mid; else hi = mid;
        }
        return lo;
    }

    /** 진행 거리 d(m)의 위치 · 고도. 누적 거리 배열에서 이분 탐색 후 선형 보간. */
    function at(c, d) {
        var n = c.dist.length;
        if (d <= 0) return { lon: c.lon[0], lat: c.lat[0], ele: c.ele[0] };
        if (d >= c.total) return { lon: c.lon[n - 1], lat: c.lat[n - 1], ele: c.ele[n - 1] };
        var lo = indexAt(c, d), hi = lo + 1;
        var span = c.dist[hi] - c.dist[lo], t = span > 0 ? (d - c.dist[lo]) / span : 0;
        var e0 = c.ele[lo], e1 = c.ele[hi];
        return {
            lon: c.lon[lo] + (c.lon[hi] - c.lon[lo]) * t,
            lat: c.lat[lo] + (c.lat[hi] - c.lat[lo]) * t,
            ele: e0 == null || e1 == null ? null : e0 + (e1 - e0) * t
        };
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /**
     * 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 장거리(hike · trek)는 국립공원공단 기준 1km 에 34분(쉬는 시간 포함, 오르막 · 내리막 따로 더하지 않음 -
     * 2026-11-04 홍TV님 "공단과 동일하게 해. 산에서 휴식 시간도 산행이라고 봐야지": 공단 공식 시간 560개가 경사와 상관없이 1km 중앙 34분, MountainServlet.MIN_PER_KM).
     * 걷기(해안길 · 도로 둘레길 - 공단 자료 밖)는 예전처럼 시속 4km + 오르막 600m/h + 내리막 300m 에 10분(CoursePageServlet.WALK_RULE).
     */
    var KINDS = {
        hike: { label: "등산", kmh: 60 / 34, climb: 0, down: 0, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, down: 1800, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, down: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 60 / 34, climb: 0, down: 0, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
    };

    var KINDS_EN = { hike: { label: "Hiking", act: "Hike", sos: "hiking" }, walk: { label: "Walking", act: "Walk", sos: "walking" },
                     bike: { label: "Cycling", act: "Ride", sos: "cycling" }, trek: { label: "Hiking · Walking", act: "Hike", sos: "hiking" } };

    /**
     * 글자 크기(2026-10-14 홍TV님: 핸드폰에서 글씨가 작음) - 100 → 120 → 140%, 이 기기에 저장(rf-text).
     * 지도 · 그래프는 그대로 두고 글 칸(안내 칸 · 아래 창 · 목록 · 안내 화면)만 CSS zoom 으로 키웁니다(<html class="rfz"> + --rfz).
     */
    var TEXT_KEY = "rf-text", TEXT_STEPS = [1, 1.2, 1.4];
    function textScale() {
        try { var v = +localStorage.getItem(TEXT_KEY); return TEXT_STEPS.indexOf(v) >= 0 ? v : 1; } catch (e) { return 1; }
    }
    function applyTextScale(v) {
        if (!global.document || !document.documentElement) return;
        document.documentElement.style.setProperty("--rfz", String(v));
        document.documentElement.classList.toggle("rfz", v !== 1);
        // 단추 글은 짧게(가 · 가+ · 가++) - "가 140%" 는 위 줄 제목을 밀어 잘랐음(2026-10-14 PC: 다도해해상 탐방 안내도). 몇 %인지는 title 로
        var enPage = document.documentElement.lang === "en";   // /en/m/ 은 setLang 을 안 불러도 영어(2026-10-18 PC: "가/가++" 로 보였음)
        var t = textLabel(v, enPage || LANG === "en"), tip = enPage ? "Text size " + Math.round(v * 100) + "% - tap for 100 → 120 → 140%"   // 영어 산 페이지(2026-10-15 PC)
            : "글자 크기 " + Math.round(v * 100) + "% - 누를 때마다 100 → 120 → 140%";
        Array.prototype.forEach.call(document.querySelectorAll(".rfTextBtn"), function (b) { b.textContent = t; b.title = tip; b.setAttribute("aria-label", tip); });   // 화면 읽기 프로그램에도 지금 크기(2026-10-29 점검)
        // 화면마다 크기를 다시 맞출 수 있게 알림(2026-10-18 PC: 별거 별거 카카오 창 - 단추 클릭은 stopPropagation 이라 document click 으로는 못 받음)
        try { if (global.dispatchEvent && typeof Event === "function") global.dispatchEvent(new Event("rf-textscale")); } catch (e) { /* 옛 브라우저 */ }
    }
    /** 순수 함수 - 단추 글(100% 가 · 120% 가+ · 140% 가++). en - 영어 화면(없으면 지금 말). */
    function textLabel(v, en) { var a = (en === undefined ? LANG === "en" : en) ? "A" : "가"; return v >= 1.4 ? a + "++" : v >= 1.2 ? a + "+" : a; }
    if (global.document && document.documentElement) applyTextScale(textScale());
    // 안드로이드는 크롬의 "routefly 설치"(웹 앱) 권유를 띄우지 않음(2026-10-21 PC: 홍TV님이 설치해 원래 앱과 아이콘이 둘이 됨 -
    // 웹 앱은 화면을 끄면 위치가 멈춰 산악회 방 · 따라가기는 routefly 앱이 맞음). PC 등 다른 기기는 그대로. 크롬 메뉴의 "앱 설치"는 남음
    if (global.addEventListener && global.navigator && /Android/i.test(navigator.userAgent || "") && !global.Capacitor)
        global.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); });

    /**
     * 순수 함수 - 작은 지도(지도 조각 그림을 이어 붙임 - 지도 라이브러리 없이): 가운데 c{lat,lon} 와 점들이 w × h 안에 다 들어가는 가장 큰 줌(6~16).
     * → {z, tiles:[{x, y, left, top}], pins:[[left, top]…], at:[left, top]} (조각은 256px, 왼쪽 위 기준 px).
     */
    function stayTiles(c, points, w, h) {
        var all = [c].concat(points || []).filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lon); });
        if (!all.length || !(w > 0) || !(h > 0)) return null;
        function px(p, z) {
            var n = 256 * Math.pow(2, z), s = Math.sin(p.lat * Math.PI / 180);
            return [(p.lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
        }
        var z = 16, pad = 18;
        for (; z > 6; z--) {
            var xs = all.map(function (p) { return px(p, z); });
            var dx = Math.max.apply(null, xs.map(function (q) { return q[0]; })) - Math.min.apply(null, xs.map(function (q) { return q[0]; }));
            var dy = Math.max.apply(null, xs.map(function (q) { return q[1]; })) - Math.min.apply(null, xs.map(function (q) { return q[1]; }));
            if (dx <= w - 2 * pad && dy <= h - 2 * pad) break;
        }
        var ps = all.map(function (p) { return px(p, z); });
        var cx = (Math.max.apply(null, ps.map(function (q) { return q[0]; })) + Math.min.apply(null, ps.map(function (q) { return q[0]; }))) / 2;
        var cy = (Math.max.apply(null, ps.map(function (q) { return q[1]; })) + Math.min.apply(null, ps.map(function (q) { return q[1]; }))) / 2;
        var x0 = cx - w / 2, y0 = cy - h / 2, tiles = [];
        for (var ty = Math.floor(y0 / 256); ty * 256 < y0 + h; ty++)
            for (var tx = Math.floor(x0 / 256); tx * 256 < x0 + w; tx++) tiles.push({ x: tx, y: ty, left: Math.round(tx * 256 - x0), top: Math.round(ty * 256 - y0) });
        var at = function (q) { return [Math.round(q[0] - x0), Math.round(q[1] - y0)]; };
        return { z: z, tiles: tiles, at: at(ps[0]), pins: ps.slice(1).map(at) };
    }

    /** 순수 함수 - 숙소 종류(카카오 분류 "호텔" · "여관,모텔" · "콘도,리조트" …) → 영어 화면 말. 모르면 Lodging. */
    function stayKindEn(k) {
        var t = String(k || "");
        var m = [[/호텔/, "Hotel"], [/모텔|여관|여인숙/, "Motel"], [/리조트|콘도/, "Resort"], [/게스트하우스|호스텔/, "Guesthouse"], [/펜션/, "Pension"],
            [/민박/, "Homestay"], [/한옥/, "Hanok stay"], [/캠핑|야영|글램핑/, "Campground"], [/휴양림/, "Forest lodge"]].filter(function (x) { return x[0].test(t); })[0];
        return m ? m[1] : "Lodging";
    }
    /** 순수 함수 - 숙소 이름 · 좌표 → 카카오맵 자리 링크(좌표가 우리나라 밖이거나 없으면 null). 이름의 쉼표 · / 는 링크를 끊어 빈칸으로. */
    function stayMapLink(name, lat, lon) {
        var a = +lat, o = +lon;
        if (!isFinite(a) || !isFinite(o) || a < 33 || a > 39 || o < 124 || o > 132) return null;
        var nm = String(name || "").replace(/[,/?#&]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "숙소";
        return "https://map.kakao.com/link/map/" + encodeURIComponent(nm) + "," + a.toFixed(6) + "," + o.toFixed(6);
    }

    function tripLink(base, lat, lon, name) {
        var m = /^https:\/\/((?:[a-z0-9-]+\.)*trip\.com)(?=[\/?#]|$)/i.exec(String(base || ""));
        if (!m || !isFinite(lat) || !isFinite(lon)) return null;
        var qi = base.indexOf("?"), q = qi < 0 ? "" : base.slice(qi + 1).split("#")[0];
        var keep = q.split("&").filter(function (kv) {
            var k = kv.split("=")[0];
            return k && !/^(cityId|city|cityName|provinceId|countryId|districtId|optionId|destName|searchType|searchWord|searchValue|searchCoordinate|lat|lon|checkIn|checkOut|checkin|checkout|listFilters)$/i.test(k);
        });
        var nm = String(name || "").replace(/[|*&#?=]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30) || "들머리";
        var la = (+lat).toFixed(6), lo = (+lon).toFixed(6);
        return "https://" + m[1].toLowerCase() + "/hotels/list?" + ["cityId=0", "searchType=LM", "searchWord=" + encodeURIComponent(nm),
            "searchValue=" + encodeURIComponent("13|0*13*" + la + "|" + lo + "|" + nm + "|0|1")].concat(keep).join("&");
    }

    global.RF = {
        socarLine: socarLine,
        staySearch: staySearch
    };
})(window);
