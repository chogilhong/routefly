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
    var NS = "http://www.w3.org/2000/svg";

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
    /** 지금 말로 고르기 - tr("출발", "Start"). */
    function tr(ko, en) { return LANG === "en" ? en : ko; }
    /**
     * "3시간 5분" - 2026-10-09 점검: 분을 먼저 반올림하고 시 · 분을 나눕니다(예전에는 3시간 59분 40초가 "3시간 0분").
     * withZeroHour 면 1시간 안 될 때도 "0시간 40분".
     */
    function hm(ms, withZeroHour) {
        var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
        if (LANG === "en") return (h || withZeroHour ? h + " h " : "") + (m % 60) + " min";
        return (h || withZeroHour ? h + "시간 " : "") + (m % 60) + "분";
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 재미로 보는 산행 한마디(2026-10-17 홍TV님) - 정상 도장 카드 · 코스 모음 첫 화면. 안전 · 날씨에 관한 말은 넣지 않음
     * (실제 예보 · 강풍 경고와 어긋나면 위험 - "오늘은 산에 가기 좋은 날" 같은 말 금지).
     */
    var FORTUNE = {
        ko: ["끝까지 오른 사람에게 바람이 시원하게 분다.", "오늘 만난 풍경이 한 주의 힘이 된다.", "천천히 걸은 길이 가장 오래 남는다.",
             "정상에서 마신 물 한 모금이 오늘의 행운.", "함께 오른 사람과의 이야기가 복을 부른다.", "작은 오르막을 넘으면 큰 일도 풀린다.",
             "발밑의 들꽃을 본 사람에게 좋은 소식이 온다.", "쉬어 간 자리에서 좋은 생각이 떠오른다.", "오늘 찍은 사진 한 장이 오래 웃음을 준다.",
             "다음 산을 정한 사람에게 새 길이 열린다.", "땀 흘린 만큼 마음이 가벼워진다.", "내려가는 길에서 반가운 얼굴을 만난다.",
             "정상의 하늘처럼 머릿속이 맑아진다.", "한 걸음씩 쌓은 것이 큰 열매가 된다.", "오늘의 인사 한마디가 좋은 인연이 된다.",
             "아껴 둔 간식이 가장 맛있는 날.", "느긋한 마음이 가장 좋은 지도.", "돌아보면 꽤 높이 와 있다.",
             "산이 준 기운으로 미뤄 둔 일을 시작하기 좋다.", "고마운 사람에게 사진 한 장 보내면 복이 두 배.",
             "오늘 오른 높이만큼 자신감도 올라간다.", "산길에서 나눈 인사가 하루를 밝힌다.", "숨이 찰 때 한 번 쉬면 길이 다시 열린다.",
             "정상 사진보다 오르는 길의 웃음이 더 오래 간다.", "새소리를 들은 사람에게 기분 좋은 일이 생긴다.", "오늘은 처음 보는 풍경이 반가운 날.",
             "도시락 뚜껑을 여는 순간이 오늘의 보물.", "나무 그늘 아래에서 좋은 계획이 떠오른다.", "가벼운 가방처럼 마음의 짐도 가벼워진다.",
             "정상석 앞에서 웃으면 한 해가 즐겁다.", "오늘의 한 걸음이 내일의 체력이 된다.", "꾸준히 걷는 사람에게 산이 길을 보여 준다.",
             "능선에서 본 하늘이 마음을 넓혀 준다.", "함께 걷는 발걸음이 맞으면 일도 잘 맞는다.", "내려와서 먹는 국수 한 그릇이 최고의 상.",
             "오늘 본 나무 한 그루가 오래 기억에 남는다.", "서두르지 않는 마음에 좋은 일이 따라온다.", "산에 내려놓은 걱정은 다시 따라오지 않는다.",
             "오늘의 땀방울이 내일의 웃음이 된다.", "정상에서 보낸 문자 한 통이 누군가를 웃게 한다.", "산을 닮은 사람은 흔들려도 무너지지 않는다.",
             "작은 돌탑처럼 하루하루가 쌓인다.", "오르막 끝의 평지가 오늘의 선물.", "오늘 걸은 길을 기록하면 다음 산이 쉬워진다.",
             "산 아래 첫 커피가 유난히 맛있는 날.", "발걸음이 가벼운 날, 좋은 소식도 가볍게 온다.", "산은 꾸준한 사람의 편이다.",
             "정상에서 크게 숨 한 번, 걱정이 반으로 준다.", "옆 사람에게 건넨 사탕 하나가 복이 되어 돌아온다.", "지도 위 점 하나가 오늘의 추억이 된다.",
             "오늘의 풍경은 오늘만 볼 수 있다.", "천천히 가도 멈추지 않으면 닿는다.", "산에서 들은 이야기가 좋은 실마리가 된다.",
             "나를 위한 하루, 산이 박수를 친다.", "오늘 만난 다람쥐가 행운을 전해 준다.", "정상 표지판 앞 사진이 올해의 사진이 된다.",
             "등산화 끈을 단단히 맨 날은 일도 술술 풀린다.", "땀을 닦는 손수건 한 장에도 고마움이 담긴다.", "산을 다녀온 저녁, 단잠이 기다린다.",
             "어제보다 한 걸음 더, 그게 오늘의 기록."],
        en: ["The wind is kindest to those who reach the top.", "Today's view will carry you through the week.", "The slowest trail stays longest in memory.",
             "A sip of water at the summit is today's luck.", "Good talk on the trail brings good fortune.", "Small climbs today, big wins tomorrow.",
             "Notice the wildflowers - good news is on its way.", "A great idea waits at your next rest stop.", "One photo from today will make you smile for years.",
             "Pick your next mountain and a new path opens.", "Every drop of sweat lightens the mind.", "Look back - you have come further than you think.",
             "Every step today builds tomorrow's strength.", "A friendly hello on the trail brightens the whole day.", "Lunch on the mountain tastes like treasure.",
             "Birdsong is a sign of good things ahead.", "A light pack, a light heart.", "Smile at the summit stone - the year will smile back.",
             "Steady feet find the way.", "The sky from the ridge widens the mind.", "Noodles after the hike are the best prize.",
             "No rush - good things follow a calm heart.", "Worries left on the mountain don't follow you home.", "Today's sweat is tomorrow's smile.",
             "A message from the top will make someone smile.", "Mountains favour the patient.", "One deep breath at the top halves your worries.",
             "Share a snack, and luck comes back to you.", "Today's view is yours alone.", "A good sleep waits after a mountain day."]
    };

    /** 순수 함수 - 같은 씨앗(날짜 + 산 이름)이면 같은 한마디. lang "ko" · "en". */
    function fortune(seed, lang) {
        var list = FORTUNE[lang === "en" ? "en" : "ko"], h = 0, str = String(seed || "");
        for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return list[Math.abs(h) % list.length];
    }

    /**
     * 순수 함수 - 오늘의 한마디(코스 모음 /m/ · /en/m/): 바퀴마다 섞은 순서로 하루 하나 - 한 바퀴(한국어 60일 · 영어 30일) 안에서는 겹치지 않음
     * (2026-10-17 홍TV님: 20개면 21일째에 반복? - 예전 해시 방식은 18일째에 겹쳤음). y · m(1~12) · d 는 폰의 날짜.
     */
    function fortuneDay(y, m, d, lang) {
        var list = FORTUNE[lang === "en" ? "en" : "ko"], len = list.length, n = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
        var round = Math.floor(n / len), pos = n - round * len, order = [], i, j, t, r = (round * 2654435761 + 12345) >>> 0;
        // 바퀴마다 순서를 섞음(랜덤처럼 - 2026-10-17 홍TV님). 같은 날이면 늘 같은 순서
        for (i = 0; i < len; i++) order.push(i);
        for (i = len - 1; i > 0; i--) { r = (r * 1103515245 + 12345) >>> 0; j = r % (i + 1); t = order[i]; order[i] = order[j]; order[j] = t; }
        return list[order[pos]];
    }

    /** 순수 함수 - 핸드폰에서만 열리는 송금 링크(카카오페이 송금 코드 qr.kakaopay.com - PC 브라우저는 404). */
    function mobileOnlyUrl(url) { return /^https:\/\/qr\.kakaopay\.com\//i.test(url || ""); }
    /** PC 에서 그런 링크를 누르면 열지 않고 안내(2026-10-17 홍TV님: 핸드폰은 되는데 PC 는 404). */
    function mobileOnlyGuard(a, url, box, pcUrl) {
        if (!mobileOnlyUrl(url) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")) return;
        a.addEventListener("click", function (e) {
            e.preventDefault();
            if (box.querySelector(".rfMobileOnly")) return;
            var p = document.createElement("small");
            p.className = "rfMobileOnly";
            p.style.cssText = "display:block;margin-top:6px;color:#9aa6b4";
            p.textContent = "카카오페이 송금은 핸드폰에서만 열립니다. 핸드폰으로 이 페이지를 열어 눌러 주세요.";
            // PC 에서는 PayPal(카드 결제 - donate.en.url)로도(2026-10-17 홍TV님: 토스 아이디는 서비스 종료)
            if (/^https:\/\//.test(pcUrl || "")) {
                var pp = document.createElement("a");
                pp.href = pcUrl; pp.target = "_blank"; pp.rel = "noopener";
                pp.textContent = "PC 에서는 PayPal(카드)로 후원 ›";
                pp.style.color = "#38d9ea";
                p.appendChild(document.createTextNode(" "));   // 문장과 링크 사이(링크 글 앞 빈칸은 붙어 보였음 - 2026-10-17 PC)
                p.appendChild(pp);
            }
            box.appendChild(p);
        });
    }

    /** 산 페이지 맨 아래 ☕ 후원 줄(2026-10-17 홍TV님) - https 주소일 때만 보임. 한국어 donate.url · 영어 donate.en.url(PayPal). */
    /**
     * 🏨 근처 숙소 줄(산 페이지 /m/ · /en/m/, 2026-10-29 점검) - 정상 좌표로 트립닷컴(없으면 아고다) 제휴 링크 + 수수료 알림. 설정이 없으면 숨김 그대로.
     * box 의 data-name(한글 산 이름)으로 찾음. 돌려줌: 보였나.
     */
    /** 순수 함수 - 숙소 링크 하나({text, href}) 또는 null. 서버 Stays.pick 과 같은 규칙(코스 페이지 /c/ 는 서버가 그림). */
    function staysItem(p, name, lat, lon, en) {
        if (!p) return null;
        // afterHikeLinks 는 {links: [...]} 를 돌려줌(2026-10-29 PC: .filter 를 바로 불러 산 페이지 숙소 줄이 안 나왔음)
        return (afterHikeLinks({ trip: p.trip, agoda: p.agoda }, { name: name || "", lat: lat, lon: lon }, en).links || []).filter(function (x) { return x.sponsored && /🏨/.test(x.text); })[0] || null;
    }
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
    function staySearch(form, out, partnersP, base, en) {
        if (!form || !out || form.rfBound) return;
        form.rfBound = true;
        var T = function (ko, e) { return en ? e : ko; }, input = form.querySelector("input");
        // 접어도 검색 칸은 보이게(/m/ 처음부터 펴 둔 칸, data-keep - 2026-10-30 홍TV님 "접으면? 그래도 검색창은 보이게 해"):
        // 접으면 검색 칸을 칸 밖(제목 바로 아래)으로 옮기고 결과 · 지도만 접힘, 펴면 제자리로. 접힌 채로 찾으면 다시 폄
        var det = form.closest ? form.closest("details[data-keep]") : null, home = form.parentNode;
        if (det) det.addEventListener("toggle", function () {
            var had = document.activeElement === input;   // 옮기면 입력 칸 초점이 풀림 - 다시 줌(2026-10-30 점검, 키보드 · 화면 읽기)
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
        var cities = null, citiesP = null;
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
            out.appendChild(row);
            if (spon) out.appendChild(el("p", T("🏨 표시는 제휴 링크 - 예약하면 routefly 가 수수료를 받습니다(값은 같음).", "🏨 links are affiliate links - routefly earns a commission if you book (same price)."), "dim"));
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
            links(p, pl.name, pl.lat, pl.lon, areaOf(pl.addr), agodaCity(pl.lat, pl.lon));
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
                out.appendChild(el("p", T("숙소 목록: " + (kk ? "카카오 · " : "") + "한국관광공사(TourAPI) · 위치: " + (src || "국토교통부 V-World") + ". 요금 · 빈방은 예약 사이트에서 확인하세요.", "Lodging list: " + (kk ? "Kakao · " : "") + "Korea Tourism Organization · location: " + (src === "카카오" ? "Kakao" : "V-World") + ". Check prices and rooms on the booking sites."), "dim"));
            }).catch(function () { if (my !== seq) return; list.textContent = ""; list.appendChild(el("li", T("숙소 목록을 받지 못했습니다.", "Couldn't load the lodging list."))); });
        }
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (det && !det.open) det.open = true;   // 결과가 보이게
            var q = String(input.value || "").trim();
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
    }
    function staysLine(box, p, lat, lon, en) {
        if (!box || !p) return false;
        var it = staysItem(p, box.getAttribute("data-name"), lat, lon, en);
        if (!it) return false;
        var a = document.createElement("a"), s = document.createElement("small");
        a.href = it.href; a.target = "_blank"; a.rel = "noopener sponsored"; a.textContent = it.text + " ›";
        s.textContent = en ? " Affiliate link - routefly earns a commission if you book (same price)." : " 제휴 링크 - 예약하면 routefly 가 수수료를 받습니다(값은 같음).";
        box.textContent = "";
        box.appendChild(a); box.appendChild(s);
        box.hidden = false;
        return true;
    }
    function supportLine(box, url, text, pcUrl) {
        if (!box || !/^https:\/\//.test(url || "")) return false;
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = text;
        box.textContent = "";
        box.appendChild(a);
        box.hidden = false;
        mobileOnlyGuard(a, url, box, pcUrl);
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

    /** 순수 함수 - 걸음 수 추정. 보폭 = 키 × 0.415(등산은 오르내림으로 10% 짧게). 자전거는 null. */
    function steps(kind, cm, distM) {
        if (kind === "bike") return null;
        var stride = cm / 100 * 0.415 * (kind === "walk" ? 1 : 0.9);
        return Math.round(distM / stride);
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /** 순수 함수 - 그날 해 지는 시각(ms, 그 위치 기준). 극지방처럼 해가 안 지면 null. (Almanac for Computers 공식) */
    function sunset(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, false); }
    /** 순수 함수 - 그 날 해 뜨는 시각(산 소개 페이지, 2026-10-14). 계산은 sunset 과 같음. */
    function sunrise(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, true); }

    function sunTime(dateMs, lat, lon, rise) {
        // 그 자리의 날짜로(경도로 어림한 현지 시각) - UTC 날짜를 쓰면 한국 아침 9시 전은 전날 일몰이 나왔음(2026-10-14 PC: 08:00 출발에 일몰 경고)
        var r = Math.PI / 180, d = new Date(dateMs + lon / 15 * 3600000);
        var start = Date.UTC(d.getUTCFullYear(), 0, 0), N = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
        var lngHour = lon / 15, t = N + ((rise ? 6 : 18) - lngHour) / 24;
        var Mn = 0.9856 * t - 3.289;
        var L = (Mn + 1.916 * Math.sin(Mn * r) + 0.020 * Math.sin(2 * Mn * r) + 282.634 + 360) % 360;
        var RA = (Math.atan(0.91764 * Math.tan(L * r)) / r + 360) % 360;
        RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
        var sinDec = 0.39782 * Math.sin(L * r), cosDec = Math.cos(Math.asin(sinDec));
        var cosH = (Math.cos(90.833 * r) - sinDec * Math.sin(lat * r)) / (cosDec * Math.cos(lat * r));
        if (cosH > 1 || cosH < -1) return null;
        var H = (rise ? 360 - Math.acos(cosH) / r : Math.acos(cosH) / r) / 15;
        var UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
        var day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), out = day + UT * 3600000;
        // UT 는 0~24시라 해 뜨는 시각(한국 아침 = 전날 UTC 저녁)은 하루 뒤로 나옴 - 현지 날짜가 그 날이 되게 맞춤
        var local = Math.floor((out + lngHour * 3600000 - day) / 86400000);
        return out - local * 86400000;
    }

    /** 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 걷기는 오르막 600m/h 를 더합니다(네이스미스). */
    var KINDS = {
        hike: { label: "등산", kmh: 4, climb: 600, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 4, climb: 600, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
    };

    var KINDS_EN = { hike: { label: "Hiking", act: "Hike", sos: "hiking" }, walk: { label: "Walking", act: "Walk", sos: "walking" },
                     bike: { label: "Cycling", act: "Ride", sos: "cycling" }, trek: { label: "Hiking · Walking", act: "Hike", sos: "hiking" } };

    function kindOf(k) { return KINDS[k] || KINDS.hike; }

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
    /** 순수 함수 - 다음 글자 크기(140% 다음은 100%). */
    function nextTextScale(v) { return TEXT_STEPS[(TEXT_STEPS.indexOf(v) + 1) % TEXT_STEPS.length]; }
    /** "가+" 단추 - 누를 때마다 다음 크기. 모든 화면이 같은 설정을 씁니다. */
    function textButton() {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rfTextBtn";
        b.title = tr("글자 크기(누를 때마다 100 → 120 → 140%)", "Text size (100 → 120 → 140% each tap)");
        b.setAttribute("aria-label", tr("글자 크기", "Text size"));
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var n = nextTextScale(textScale());
            try { localStorage.setItem(TEXT_KEY, String(n)); } catch (err) { /* 이번 화면만 */ }
            applyTextScale(n);
        });
        setTimeout(function () { applyTextScale(textScale()); }, 0);
        return b;
    }
    if (global.document && document.documentElement) applyTextScale(textScale());
    // 안드로이드는 크롬의 "routefly 설치"(웹 앱) 권유를 띄우지 않음(2026-10-21 PC: 홍TV님이 설치해 원래 앱과 아이콘이 둘이 됨 -
    // 웹 앱은 화면을 끄면 위치가 멈춰 산악회 방 · 따라가기는 routefly 앱이 맞음). PC 등 다른 기기는 그대로. 크롬 메뉴의 "앱 설치"는 남음
    if (global.addEventListener && global.navigator && /Android/i.test(navigator.userAgent || "") && !global.Capacitor)
        global.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); });

    function standardMs(kind, distM, ascM) {
        var k = kindOf(kind);
        return (distM / 1000 / k.kmh + (k.climb ? ascM / k.climb : 0)) * 3600000;
    }

    /** 순수 함수 - 기상청 하늘(sky 1 · 3 · 4) · 강수 형태(pty 0 ~ 4) → "☀️ 맑음" 같은 말. */
    function weatherWord(sky, pty) {
        var p = { 1: "🌧 비", 2: "🌨 비/눈", 3: "❄️ 눈", 4: "🌦 소나기" }[+pty];
        if (p) return p;
        return { 1: "☀️ 맑음", 3: "⛅ 구름많음", 4: "☁️ 흐림" }[+sky] || "-";
    }

    // ── 기상청 날씨누리처럼 시간별 가로 표(2026-10-30 홍TV님 "참고해" - 날씨누리 동네예보 화면) ──
    var DIR16 = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동", "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"];
    var DIR16_EN = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    /** 순수 함수 - 강수량 글("강수없음" · "1mm 미만" · "1.0mm" · "30.0~50.0mm") → 칸 글. */
    function pcpText(p, en) {
        var t = String(p == null ? "" : p).trim();
        if (!t || /없음/.test(t) || t === "0") return "-";
        if (/미만/.test(t)) return en ? "<1mm" : "1mm 미만";
        return t.replace(/\.0(?=mm|~)/g, "");
    }
    /**
     * 순수 함수 - 그 날(day "2026-10-30")의 시간별 칸 [{h, icon, word, tmp, pop, pcp, wsd, reh, arrow, dir}] - 날씨누리 표의 한 열씩.
     * arrow 는 바람이 불어 가는 쪽 화살표(VEC 는 불어오는 쪽), dir 은 "북서" 처럼 불어오는 쪽 이름(…풍).
     */
    function wxCols(hours, day, en) {
        var arrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"];
        return (hours || []).filter(function (h) { return String(h.t).slice(0, 10) === day; }).map(function (h) {
            var w = weatherWord(h.sky, h.pty), sp = w.indexOf(" "), v = h.vec != null && isFinite(h.vec) ? ((+h.vec % 360) + 360) % 360 : null;
            var word = sp > 0 ? w.slice(sp + 1) : w;
            if (en) word = { "맑음": "Clear", "구름많음": "Mostly cloudy", "흐림": "Overcast", "비": "Rain", "비/눈": "Rain/snow", "눈": "Snow", "소나기": "Showers" }[word] || word;
            return { h: String(h.t).slice(11, 13), icon: sp > 0 ? w.slice(0, sp) : w, word: word, tmp: h.tmp, pop: h.pop, pcp: pcpText(h.pcp, en), wsd: h.wsd, reh: h.reh,
                arrow: v == null ? "" : arrows[Math.round(v / 45) % 8], dir: v == null ? "" : (en ? DIR16_EN : DIR16)[Math.round(v / 22.5) % 16] };
        });
    }
    /** 시간별 가로 표(옆으로 밀어 봄). cols - wxCols. 표 하나를 돌려줌. */
    function wxTable(cols, en) {
        var t = function (ko, e) { return en ? e : ko; };
        var wrap = document.createElement("div"), tb = document.createElement("table");
        wrap.className = "wxt";
        wrap.setAttribute("tabindex", "0");   // 키보드로도 옆으로
        wrap.setAttribute("role", "region");
        wrap.setAttribute("aria-label", t("시간별 날씨 - 옆으로 밀어 보기", "Hourly weather - scroll sideways"));
        var rows = [[t("시각", "Time"), function (c) { return c.h + t("시", ""); }], [t("날씨", "Sky"), function (c) { return c.icon; }, function (c) { return c.word; }],
            [t("기온", "Temp"), function (c) { return c.tmp != null ? c.tmp + "°" : "-"; }], [t("강수확률", "Rain %"), function (c) { return c.pop != null ? c.pop + "%" : "-"; }],
            [t("강수량", "Rain"), function (c) { return c.pcp; }], [t("바람", "Wind"), function (c) { return (c.arrow ? c.arrow + " " : "") + (c.wsd != null ? c.wsd : "-"); },
                function (c) { return (c.dir ? c.dir + t("풍 ", " wind ") : "") + (c.wsd != null ? c.wsd + "m/s" : ""); }],
            [t("습도", "Humidity"), function (c) { return c.reh != null ? c.reh + "%" : "-"; }]];
        rows.forEach(function (r, i) {
            var tr = document.createElement("tr"), th = document.createElement("th");
            th.scope = "row";
            th.textContent = r[0] + (i === 5 ? " m/s" : "");
            tr.appendChild(th);
            cols.forEach(function (c) {
                var td = document.createElement(i ? "td" : "th");
                if (!i) td.scope = "col";
                td.textContent = r[1](c);
                if (r[2]) { td.title = r[2](c); td.setAttribute("aria-label", r[2](c)); }
                if (i === 3 && c.pop >= 60) td.className = "wet";
                if (i === 5 && c.wsd >= 9) td.className = "windy";   // 9m/s 넘으면 능선은 더 셈
                tr.appendChild(td);
            });
            tb.appendChild(tr);
        });
        wrap.appendChild(tb);
        // PC: 마우스 휠(위아래)을 옆으로 밀기로 · 마우스로 끌어 밀기(2026-10-30 홍TV님 "pc에서 좌우 스크롤이 움직이지 않아"). 끝에 닿으면 휠은 화면 스크롤 그대로
        wrap.addEventListener("wheel", function (e) {
            if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            var max = wrap.scrollWidth - wrap.clientWidth;
            if (max <= 0 || (e.deltaY < 0 && wrap.scrollLeft <= 0) || (e.deltaY > 0 && wrap.scrollLeft >= max - 1)) return;
            wrap.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
            e.preventDefault();
        }, { passive: false });
        var drag = null;
        wrap.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button === 0) { drag = { x: e.clientX, l: wrap.scrollLeft }; wrap.classList.add("drag"); } });
        wrap.addEventListener("pointermove", function (e) { if (drag) { wrap.scrollLeft = drag.l - (e.clientX - drag.x); e.preventDefault(); } });
        var stop = function () { drag = null; wrap.classList.remove("drag"); };
        wrap.addEventListener("pointerup", stop);
        wrap.addEventListener("pointerleave", stop);
        wrap.addEventListener("keydown", function (e) {   // 키보드 ← →
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") { wrap.scrollLeft += (e.key === "ArrowRight" ? 1 : -1) * 80; e.preventDefault(); }
        });
        return wrap;
    }
    /** 순수 함수 - 기상청 날씨누리 동네예보 주소. region {code, name}(api/wx 의 행정동)이 없으면 날씨누리 첫 화면. */
    function kmaLink(region, lat, lon) {
        if (!region || !/^\d{10}$/.test(String(region.code)) || !isFinite(lat) || !isFinite(lon)) return "https://www.weather.go.kr/w/index.do";
        var la = (+lat).toFixed(4), lo = (+lon).toFixed(4);
        return "https://www.weather.go.kr/w/index.do#dong/" + region.code + "/" + la + "/" + lo + "/" + encodeURIComponent(String(region.name || ""))
            + "/LOC/" + encodeURIComponent("위경도(" + (+lat).toFixed(2) + "," + (+lon).toFixed(2) + ")").replace(/%2C/g, ",");   // 날씨누리 주소처럼 쉼표는 그대로
    }

    /**
     * 순수 함수 - 날마다 가장 센 바람(단기예보 wsd, 매시간)으로 경고 줄. 7m/s 넘으면 "바람 강함", 10m/s 넘으면 "강풍".
     * 능선 · 정상은 격자 바람(땅 위 10m)보다 셈. where - 격자 자리 말("들머리" · "정상 둘레"). 몇 시인지도 적음 -
     * 2026-10-16 PC: 산 페이지는 3시간 줄만 보여 줄의 최댓값(7.2)과 경고(20시 8.3)가 안 맞아 보였음. [{day, wsd, hour, text}] - 없으면 빈 배열.
     */
    function windNote(hours, today, where) {
        var max = {};
        (hours || []).forEach(function (h) {
            var d = String(h.t || "").slice(0, 10), w = h.wsd == null ? null : +h.wsd;
            if (d && w != null && isFinite(w) && (max[d] == null || w > max[d].w)) max[d] = { w: w, hour: +String(h.t).slice(11, 13) };
        });
        return Object.keys(max).sort().filter(function (d) { return max[d].w >= 7; }).map(function (d) {
            var w = max[d].w, at = dayLabel(d, today) + " " + max[d].hour + "시 무렵 " + (where || "들머리") + " " + w + "m/s";
            return { day: d, wsd: w, hour: max[d].hour, text: w >= 10
                ? "⚠ 강풍 - " + at + ". 능선 · 정상은 더 세서 몸을 가누기 어렵습니다. 암릉 · 능선 산행은 미루는 것을 생각하세요."
                : "⚠ 바람 강함 - " + at + ", 능선은 더 셉니다. 바람막이 · 모자 끈을 챙기고 암릉에서는 조심하세요." };
        });
    }

    /**
     * 순수 함수 - 챙길 것(2026-10-15 홍TV님). month 1~12, ascentM 오르막(m), kind hike · walk · bike.
     * key 는 PartnersServlet.GEAR 와 같음(쿠팡 파트너스 링크를 설정에 넣으면 그 물건 옆에 링크).
     */
    function gearList(month, ascentM, kind) {
        var winter = month >= 11 || month <= 3, cold = month >= 10 || month <= 4, sunny = month >= 4 && month <= 9, hike = kind === "hike", out = [];
        out.push({ key: "water", label: "물 · 간식", why: "1시간에 물 500ml 남짓" });
        out.push({ key: "rain", label: "우비 · 바람막이", why: "산 위는 날씨가 빨리 바뀝니다" });
        if (kind !== "bike") out.push({ key: "headlamp", label: "헤드랜턴", why: "늦어지면 산은 해 지기 전에 어두워집니다" });
        out.push({ key: "battery", label: "보조배터리", why: "GPS · 119 신고용" });
        // 2026-10-15 홍TV님: 등산화 · 가방 · 구급약(늘), 모자 · 선크림(4~9월), 보온병 · 핫팩(11~3월), 무릎 보호대(오르막이 클 때)
        out.push({ key: "firstaid", label: "구급약 · 밴드", why: "물집 · 까진 곳 · 벌레 물림" });
        if (kind !== "bike") out.push({ key: "shoes", label: hike ? "등산화" : "걷기 편한 신발", why: hike ? "미끄럼을 막고 발목을 받쳐 줌" : "오래 걸어도 발이 편하게" });
        out.push({ key: "pack", label: hike ? "등산 가방" : "가벼운 배낭", why: "두 손을 비워 두면 넘어질 때 안전합니다" });
        if (hike && ascentM >= 500) out.push({ key: "stick", label: "등산 스틱", why: "오르막 " + num(ascentM) + "m - 무릎 부담을 덜어 줌" });
        if (hike && ascentM >= 800) out.push({ key: "knee", label: "무릎 보호대", why: "긴 내리막에서 무릎을 받쳐 줌" });
        if (sunny) out.push({ key: "sun", label: "모자 · 선크림", why: "능선 · 정상은 햇볕을 가릴 곳이 없습니다" });
        if (winter) out.push({ key: "warm", label: "보온병 · 핫팩", why: "쉴 때 몸이 빨리 식습니다" });
        if (hike && winter) out.push({ key: "crampon", label: "아이젠", why: "겨울 · 이른 봄 응달은 얼어 있습니다" });
        if (cold) out.push({ key: "glove", label: "장갑", why: "아침 · 정상은 쌀쌀합니다" });
        return out;
    }

    /** 순수 함수 - api/air 의 미세먼지 예보(에어코리아, 오늘 · 내일 · 모레) 가운데 그 날 → "미세먼지 보통 · 초미세먼지 좋음(경남 예보)". 없으면 "". 2026-10-15 */
    function airForecastText(a, date) {
        var f = a && a.forecast && a.forecast[date];
        if (!f || (!f.pm10 && !f.pm25)) return "";
        return [f.pm10 ? "미세먼지 " + f.pm10 : "", f.pm25 ? "초미세먼지 " + f.pm25 : ""].filter(Boolean).join(" · ") + "(" + a.region + " 예보)";
    }

    /** 순수 함수 - "최저 7℃ / 최고 19℃", 한쪽만 있으면 그것만("최저 11℃"), 둘 다 없으면 "". 2026-10-15 PC: 낮 자료가 없는 날 "최고 -" */
    function tempRange(tmn, tmx) {
        return [tmn != null ? "최저 " + tmn + "℃" : "", tmx != null ? "최고 " + tmx + "℃" : ""].filter(Boolean).join(" / ");
    }

    /** 순수 함수 - 중기예보 하루(api/mid days 의 값) → ["오전 맑음 · 비 20%", "오후 구름많음 · 비 30%"](하루 한 값이면 한 줄). */
    function midLines(d) {
        if (!d) return [];
        var half = function (n, w, p) { return (n ? n + " " : "") + (w || "-") + (p != null ? " · 비 " + p + "%" : ""); };
        if (d.wfAm === d.wfPm && d.popAm === d.popPm) return [half("", d.wfAm, d.popAm)];
        return [half("오전", d.wfAm, d.popAm), half("오후", d.wfPm, d.popPm)];
    }

    /** 쉬운 코스 거르기(2026-10-15 홍TV님) - {key, label, ms}, ms 0 은 모두. */
    var EASY = [{ key: "", label: "모두", ms: 0 }, { key: "2h", label: "2시간 이내", ms: 2 * 3600000 }, { key: "4h", label: "4시간 이내", ms: 4 * 3600000 }];
    /** 순수 함수 - 그 거르기에 드는 코스인가(표준 소요 시간). key 가 없거나 모르면 모두 듦. */
    function easyOk(key, kind, distM, ascM) {
        var e = EASY.filter(function (x) { return x.key === key; })[0];
        return !e || !e.ms || standardMs(kind || "hike", +distM || 0, +ascM || 0) <= e.ms;
    }

    // ── ⛑️ 오늘의 산행 안전(api/safety - SafetyServlet) - 별거 별거 · 산 페이지 · 따라가기가 함께 씀(2026-10-18 홍TV님) ──
    var UV_WORD = [[2, "낮음", "Low"], [5, "보통", "Moderate"], [7, "높음", "High"], [10, "매우 높음", "Very high"], [99, "위험", "Extreme"]];
    var WARN_EN = { "강풍": "Strong wind", "호우": "Heavy rain", "한파": "Cold wave", "건조": "Dry air", "폭풍해일": "Storm surge", "풍랑": "High seas", "태풍": "Typhoon", "대설": "Heavy snow", "황사": "Yellow dust", "폭염": "Heat wave" };
    var FIRE_WORD = [["낮음", "Low"], ["다소 높음", "Moderate"], ["높음", "High"], ["매우 높음", "Very high"]];
    /** 순수 함수 - 특보 이름(영어 화면은 "강풍주의보" → "Strong wind advisory", 모르는 것은 그대로). */
    function warnName(t, en) {
        if (!en) return t;
        var m = /^(.+?)(주의보|경보)$/.exec(t || "");
        return m && WARN_EN[m[1]] ? WARN_EN[m[1]] + (m[2] === "경보" ? " warning" : " advisory") : t;
    }
    function uvWord(v, en) { for (var i = 0; i < UV_WORD.length; i++) if (v <= UV_WORD[i][0]) return en ? UV_WORD[i][2] : UV_WORD[i][1]; return ""; }
    /**
     * 순수 함수 - api/safety 응답 → 줄 [{icon, label, val, cls("bad" · "mid" · "")}]: 특보(내 시도 것은 빨강, 전국은 한 줄) · 산불위험 · 자외선.
     * 자외선은 발표 시각(date "yyyyMMddHH" KST) + h 시간. 저녁(오늘 남은 자외선이 없음)이면 내일 가장 높을 때(2026-10-18 PC).
     */
    function safetyRows(j, now, en) {
        var out = [], t = function (ko, e) { return en ? e : ko; };
        if (!j || j.unavailable) return out;
        if (j.warn && j.warn.lines) {
            var mine = j.warn.lines.filter(function (l) { return l.mine; }), all = j.warn.lines.map(function (l) { return warnName(l.type, en); });
            if (mine.length) mine.forEach(function (l) { out.push({ icon: "⚠", label: warnName(l.type, en), val: t("내 지역 발효 중", "in effect here"), cls: "bad", alert: true }); });
            else out.push({ icon: "✅", label: t("기상특보", "Weather warnings"), val: t("내 지역 없음", "None here"), cls: "" });
            if (all.length) out.push({ icon: "🗺", label: t("전국 특보", "Nationwide"), val: all.join(" · "), cls: "" });
        }
        if (j.fire) {
            var lv = Math.max(0, Math.min(3, j.fire.level || 0));
            out.push({ icon: "🔥", label: t("산불위험", "Wildfire risk"), val: FIRE_WORD[lv][en ? 1 : 0] + (j.fire.meanavg != null ? " (" + Math.round(j.fire.meanavg) + ")" : ""),
                cls: lv >= 2 ? "bad" : lv === 1 ? "mid" : "", alert: lv >= 2 });
        }
        if (j.uv && j.uv.hours && j.uv.hours.length && /^\d{10}$/.test(j.uv.date || "")) {
            var d = j.uv.date, base = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10)) - 9 * 3600000, cur = null, max = null;
            var todayKST = new Date(now + 9 * 3600000).toISOString().slice(0, 10), tomKST = new Date(now + 33 * 3600000).toISOString().slice(0, 10), tmax = null, restToday = false;
            j.uv.hours.forEach(function (p) {
                var at = base + p.h * 3600000, day = new Date(at + 9 * 3600000).toISOString().slice(0, 10);
                if (at <= now) cur = p.v;
                if (day === todayKST) { max = Math.max(max == null ? 0 : max, p.v); if (at > now && p.v > 0) restToday = true; }
                if (day === tomKST) tmax = Math.max(tmax == null ? 0 : tmax, p.v);
            });
            var tomorrow = !restToday && (cur == null || cur === 0) && tmax != null && new Date(now + 9 * 3600000).getUTCHours() >= 15;
            if (tomorrow) out.push({ icon: "☀", label: t("자외선(내일 가장 높을 때)", "UV (tomorrow's peak)"), val: tmax + " " + uvWord(tmax, en), cls: tmax >= 8 ? "bad" : tmax >= 6 ? "mid" : "" });
            else if (max != null) out.push({ icon: "☀", label: t("자외선(오늘 가장 높을 때)", "UV (today's peak)"), val: max + " " + uvWord(max, en) + (cur != null ? t(" · 지금 ", " · now ") + cur : ""),
                cls: max >= 8 ? "bad" : max >= 6 ? "mid" : "", alert: max >= 8 && restToday });
        }
        return out;
    }
    /**
     * api/safety 응답을 목록으로(ul - 줄, er - 가까운 응급실 ul, 없으면 null). erMax - 응급실 몇 곳(없으면 모두). 받은 줄 수를 돌려줌.
     * 응급실 이름은 카카오맵 검색, 전화는 tel: 링크.
     */
    function safetyRender(ul, er, j, en, erMax) {
        ul.innerHTML = "";
        var rows = safetyRows(j, Date.now(), en);
        rows.forEach(function (r) {
            var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b");
            sp.textContent = r.icon + " " + r.label; b.textContent = r.val;
            if (r.cls) li.className = r.cls;
            li.appendChild(sp); li.appendChild(b);
            ul.appendChild(li);
        });
        if (!rows.length) {
            var li0 = document.createElement("li"), s0 = document.createElement("span"), b0 = document.createElement("b");
            s0.textContent = "ℹ " + (en ? "Safety info" : "안전 정보"); b0.textContent = en ? "Not available" : "받지 못했습니다";
            li0.appendChild(s0); li0.appendChild(b0); ul.appendChild(li0);
        }
        if (er) {
            er.innerHTML = "";
            ((j && j.er) || []).slice(0, erMax || 99).forEach(function (h) {
                var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b"), a = document.createElement("a");
                a.href = "https://map.kakao.com/link/search/" + encodeURIComponent(h.addr || h.name); a.target = "_blank"; a.rel = "noopener";
                a.textContent = h.name; a.style.color = "var(--sky)";
                sp.appendChild(a);
                var sm = document.createElement("small"); sm.style.display = "block"; sm.textContent = (h.km != null ? h.km + "km · " : "") + (h.kind || "");
                sp.appendChild(sm);
                if (h.tel) { var t = document.createElement("a"); t.href = "tel:" + h.tel.replace(/[^0-9]/g, ""); t.textContent = "📞 " + h.tel; t.style.color = "var(--tx)"; b.appendChild(t); }
                li.appendChild(sp); li.appendChild(b);
                er.appendChild(li);
            });
        }
        return rows.length;
    }

    /**
     * 순수 함수 - 산불조심기간(산림보호법 - 봄 2/1 ~ 5/15, 가을 11/1 ~ 12/15, 한국 날짜)이면 안내 글, 아니면 "". 2026-10-15 홍TV님.
     * 통제 구간 자료가 아니라 기간 안내 - 현지 · 공원 누리집 확인을 권함.
     */
    function fireNote(ms) {
        var d = new Date(ms + 9 * 3600000), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
        var season = md >= 201 && md <= 515 ? "봄철" : md >= 1101 && md <= 1215 ? "가을철" : "";
        if (LANG === "en") return season ? "🔥 " + (season === "봄철" ? "Spring" : "Autumn") + " wildfire season - some trails are closed and fire or smoking on the mountain is banned. Check local signs and the park website." : "";
        return season ? "🔥 " + season + " 산불조심기간 - 일부 탐방로는 입산이 통제되고 산에서 불 · 담배는 금지입니다. 현지 안내판 · 공원 누리집을 확인하세요." : "";
    }

    /** 순수 함수 - 일출을 정상에서 보려면 들머리 출발 시각(ms): 일출 - 오름 시간 - 여유(분, 기본 15). */
    function sunriseStart(sunriseMs, upMs, marginMin) {
        return sunriseMs - upMs - (marginMin == null ? 15 : marginMin) * 60000;
    }

    /** 순수 함수 - 날짜 이름표 "내일 10/16(금)". today 는 "2026-10-15". */
    function dayLabel(date, today) {
        var d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)), t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
        var n = Math.round((d - t) / 86400000), w = "일월화수목금토".charAt(new Date(d).getUTCDay());
        return (["오늘", "내일", "모레", "글피"][n] || "") + (n >= 0 && n <= 3 ? " " : "") + (+date.slice(5, 7)) + "/" + (+date.slice(8, 10)) + "(" + w + ")";
    }

    /**
     * 한/EN 단추(산 페이지 - 2026-10-15 홍TV님) - 글자 크기 "가" 옆. 페이지 아래의 다른 말 링크(a[hreflang])로 갑니다.
     * lang - 이 페이지 말("ko" · "en"). 다른 말 페이지가 없으면(같은 이름 고르기 · 못 찾음) null.
     */
    function langToggle(lang) {
        // 아래 "한국어 · English" 링크(hreflang + lang 둘 다) - 2026-10-21 홍TV님: hreflang="ko" 만 찾아 산악회 방 링크(한국어 화면)로 갔음
        var o = lang === "en" ? "ko" : "en", other = document.querySelector('a[hreflang="' + o + '"][lang="' + o + '"]') || document.querySelector('link[rel="alternate"][hreflang="' + o + '"]');
        if (!other) return null;
        var a = document.createElement("a"), ko = document.createElement("span"), en = document.createElement("span");
        a.className = "rfLang";
        a.href = other.getAttribute("href");
        a.title = lang === "en" ? "한국어로 보기" : "View in English";
        a.setAttribute("aria-label", a.title);
        ko.textContent = "한";
        en.textContent = "EN";
        (lang === "en" ? en : ko).className = "on";
        a.appendChild(ko);
        a.appendChild(en);
        return a;
    }

    /** 접는 칸(details.kind · details.group)은 하나를 펴면 같은 줄의 나머지는 접힘(2026-10-15 홍TV님) - name 속성이 없는 브라우저 · 나중에 붙인 칸까지. */
    function foldOne(doc) {
        doc.addEventListener("toggle", function (e) {
            var d = e.target;
            if (!d || d.tagName !== "DETAILS" || !d.open) return;
            var cls = d.classList.contains("kind") ? "kind" : d.classList.contains("group") ? "group" : null;
            if (!cls) return;
            // 처음부터 펴 둔 /m/ 근처 숙소 찾기(data-keep)만 같이 접지 않음 - 나중에 붙인 주말 칸(name 없음)은 그대로 접음(2026-10-30 점검)
            Array.prototype.forEach.call(doc.querySelectorAll("details." + cls + "[open]:not([data-keep])"), function (o) { if (o !== d) o.open = false; });
        }, true);
    }

    // ------------------------------------------------------------------ 로마자(Roman.java 를 옮김 - 영어 화면의 지점 이름, 2026-10-16)
    var RO_INI = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
    var RO_VOW = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
    var RO_FS = [0, 1, 1, 1, 2, 2, 2, 3, 4, 1, 5, 4, 4, 4, 6, 4, 5, 6, 6, 3, 3, 7, 3, 3, 1, 3, 6, 3];
    var RO_LINK = ["", "g", "kk", "ks", "n", "nj", "n", "d", "r", "lg", "lm", "lb", "ls", "lt", "lp", "r", "m", "b", "ps", "s", "ss", "ng", "j", "ch", "k", "t", "p", ""];
    var RO_SND = ["", "k", "n", "t", "l", "m", "p", "ng"];
    function roNasal(s) { return s === 1 ? 7 : s === 3 ? 2 : s === 6 ? 5 : s; }
    function roFirst(link) { return { k: 1, n: 4, l: 8 }[link.charAt(0)] || 17; }
    function roWord(w) {
        var ini = [], vow = [], fin = [], b = "", carry = null, len = w.length;
        for (var k = 0; k < len; k++) { var code = w.charCodeAt(k) - 0xAC00; ini.push(Math.floor(code / 588)); vow.push(Math.floor(code % 588 / 28)); fin.push(code % 28); }
        for (k = 0; k < len; k++) {
            b += (carry != null ? carry : RO_INI[ini[k]]) + RO_VOW[vow[k]];
            carry = null;
            if (!fin[k]) continue;
            if (k === len - 1) { b += RO_SND[RO_FS[fin[k]]]; continue; }
            var next = ini[k + 1], snd = RO_FS[fin[k]];
            if (k === len - 2 && w.charAt(k + 1) === "리") { b += RO_SND[snd] + "-"; continue; }
            if (next === 11) {
                var link = RO_LINK[fin[k]];
                if (fin[k] === 21) b += "ng";
                else if (link.length === 2 && ["kk", "ss", "ng", "ch"].indexOf(link) < 0) { b += RO_SND[RO_FS[roFirst(link)]]; carry = link.slice(1); }
                else carry = link;
                continue;
            }
            if (snd === 4 && (next === 5 || next === 2)) { b += "l"; carry = "l"; }
            else if (snd === 2 && next === 5) { b += "l"; carry = "l"; }
            else if (next === 5) { b += RO_SND[roNasal(snd)]; carry = "n"; }
            else if (next === 2 || next === 6) b += RO_SND[roNasal(snd)];
            else b += RO_SND[snd];
        }
        return b;
    }
    /** 순수 함수 - 한글 로마자(국어의 로마자 표기법 - Roman.of 와 같은 결과). "설악산" → "Seoraksan". */
    function roman(s) {
        s = String(s == null ? "" : s);
        return s.replace(/[가-힣]+/g, function (w, i) {
            var r = roWord(w), prev = i > 0 ? s.charAt(i - 1) : "";
            return (/[A-Za-z]/.test(prev) ? " " : "") + (/\d/.test(prev) ? r : r.charAt(0).toUpperCase() + r.slice(1));
        });
    }
    /** 영어로 옮길 낱말(MountainEn.WORDS 와 같음) - 나머지는 로마자. */
    var EN_WORDS = [["남동쪽", "southeast"], ["남서쪽", "southwest"], ["북동쪽", "northeast"], ["북서쪽", "northwest"],
        ["동쪽", "east"], ["서쪽", "west"], ["남쪽", "south"], ["북쪽", "north"], ["들머리", "trailhead"], ["날머리", "trail end"],   // 2026-10-18 PC: 남동쪽 들머리
        ["국립공원", "National Park"], ["국림공원", "National Park"], ["화장실", "restroom"], ["탐방지원센터", "visitor center"], ["탐방안내소", "visitor center"], ["공원지킴터", "ranger post"], ["매표소", "ticket booth"], ["주차장", "parking"],
        ["대피소", "shelter"], ["휴게소", "rest area"], ["삼거리", "junction"], ["사거리", "crossroads"], ["갈림길", "junction"], ["탐방로", "trail"], ["등산로", "trail"],
        ["입구", "entrance"], ["정상", "summit"], ["코스", "course"], ["구간", "section"], ["순환", "loop"], ["왕복", "round trip"], ["분소", "office"],
        // 따라가기 영어(2026-10-17) - 위험지역 · 시설 이름
        ["급경사", "steep slope"], ["낙석", "falling rocks"], ["추락", "fall"], ["미끄럼", "slippery"], ["실족", "slip"], ["주의", "caution"], ["위험", "danger"],
        ["조망점", "viewpoint"], ["전망대", "observatory"], ["약수터", "spring"], ["샘터", "spring"], ["쉼터", "rest spot"], ["헬기장", "helipad"],
        ["구급함", "first-aid box"], ["정류장", "bus stop"],
        ["자전거길", " bike path"], ["관광안내소", " tourist info center"], ["해수욕장", " beach"], ["계곡", " valley"], ["아래", " below"]];
    /** 순수 함수 - 지점 · 코스 이름 영어로(MountainEn.courseName 과 같음). "수렴동대피소" → "Suryeomdong shelter". */
    function enName(ko) {
        // 붙어 쓴 산 이름 + 봉우리 · 고개 · 절은 띄움("설악산대청봉" → "Seoraksan Daecheongbong", MountainEn.courseName 과 같음)
        var s = String(ko == null ? "" : ko).replace(/([가-힣]+산)([가-힣]{1,4}(?:봉|대|령|재|사|암|폭포|계곡))(?![가-힣])/g, "$1 $2");
        s = s.replace(/(^|\s)위(?=\s|\d|$)/g, "$1above");   // 따로 쓴 '위'만("갈림길 위 250m") - 위봉 · 위례 같은 이름은 그대로(2026-10-17 PC)
        EN_WORDS.forEach(function (w) { s = s.split(w[0]).join(" " + w[1] + " "); });
        return roman(s).replace(/([a-z])(\d)/g, "$1 $2").replace(/\s+/g, " ").replace(/ ([)\],])/g, "$1").replace(/([(\[]) /g, "$1").trim();
    }

    // ------------------------------------------------------------------ 난이도 · 안내판 고도 그래프(2026-10-15 홍TV님 - 국립공원 탐방로 안내판처럼)

    /** 5단계 - 색은 공단 탐방로 안내판 범례(매우쉬움 연두 · 쉬움 초록 · 보통 주황 · 어려움 자주 · 매우어려움 검정)에 맞춤. MountainServlet.LEVELS 와 같음. */
    var LEVELS = [{ ko: "매우 쉬움", en: "Easy", color: "#a3c93a" }, { ko: "쉬움", en: "Moderate", color: "#3fae5c" }, { ko: "보통", en: "Intermediate", color: "#e8822a" },
                  { ko: "어려움", en: "Advanced", color: "#a23a6b" }, { ko: "매우 어려움", en: "Expert", color: "#3a3f46" }];
    /** 구간 경사(%) 단계 경계 - 안내판 구간 색 · 음성. 코스 난이도는 시간 · 오르막 총량(HOUR_STEPS · ASC_STEPS). MountainServlet 과 같은 값. */
    var SLOPE_STEPS = [5, 10, 18, 28], HOUR_STEPS = [1.5, 3, 5, 8], ASC_STEPS = [300, 700, 1100, 1500], STEEP_STEPS = [20, 28, 36, 46];
    function stepOf(v, steps) { var i = 0; while (i < steps.length && v >= steps[i]) i++; return i; }

    /**
     * 순수 함수 - 등산 코스 난이도 0~4(routefly 기준 - 공단 공식 등급이 아님). 표준 시간(4km/h + 오르막 600m/h) · 오르막 총량 ·
     * 가장 가파른 1km 경사(steep %, 오르막 · 내리막 - 서버 Steep 이 목록에 steep_pct 로 줌, 없으면 뺌) 가운데 높은 단계.
     * 코스가 길어지거나 오르막이 늘면 절대 내려가지 않음 - 2026-10-16 홍TV님: 예전 기준(전체 평균 경사)은 남설악 → 대청봉(4.7km · 1,273m)이 어려움인데
     * 대청봉 → 가라피로 이어 내려가는 10.5km · 1,480m 코스가 평균 경사가 묽어져 보통이었음. 가파른 구간은 📈 고도 · 📋 안내판의 구간 경사로 봄.
     */
    function difficulty(distM, ascM, steep) {
        distM = +distM || 0;
        ascM = +ascM || 0;
        if (distM <= 0) return null;
        var base = Math.max(stepOf(distM / 1000 / 4 + ascM / 600, HOUR_STEPS), stepOf(ascM, ASC_STEPS));
        // 가파름은 한 단계까지 올림(2026-10-16 PC: 문턱 12 · 18 · 25 · 32% 로는 설악산 57 중 47 이 매우 어려움 - 산길은 1km 30 ~ 40% 가 흔함).
        // 다만 가장 가파른 1km 가 36% 이상이면 짧아도 적어도 어려움(2026-10-18 홍TV님: 내장사 → 신선봉 2.2km · 41% 가 보통) - MountainServlet.difficulty 와 같음
        if (steep == null || !isFinite(+steep)) return base;
        var s = stepOf(+steep, STEEP_STEPS);
        return Math.max(base, Math.min(s, s >= 3 ? Math.max(base + 1, 3) : base + 1));
    }

    /**
     * 순수 함수 - 안내판 구간: 지점(pois - 이름 · dist_m)마다 끊어 구간별 거리 · 고도 · 경사(%) · 단계. points 는 api/course 의 [경도, 위도, 고도, 누적 거리].
     * 올라가는 쪽으로(첫 고도가 끝보다 높으면 뒤집음 - 안내판처럼 들머리에서 정상으로). keepDir 이면 뒤집지 않음(따라가기 - 걷는 쪽이 오른쪽,
     * 2026-10-16 PC: 내려가는 코스에서 현위치가 오른쪽에서 왼쪽으로 움직이고 km 가 걷는 거리와 반대였음). 지점이 없으면 거리를 다섯 토막.
     * → {total, up, flip, cuts:[{d, name}], segs:[{d0, d1, e0, e1, pct, lv}], line:[[d, e]]}
     */
    function boardSegments(points, pois, startName, endName, keepDir) {
        var line = (points || []).filter(function (p) { return p[2] != null; }).map(function (p) { return [+p[3], +p[2]]; });
        if (line.length < 2) return null;
        var total = line[line.length - 1][0], flip = !keepDir && line[0][1] > line[line.length - 1][1];
        if (flip) line = line.map(function (p) { return [total - p[0], p[1]]; }).reverse();
        var cuts = [{ d: 0, name: flip ? endName : startName }];
        (pois || []).forEach(function (q) {
            if (q.dist_m == null || !q.name) return;
            var d = flip ? total - q.dist_m : +q.dist_m;
            if (d > total * 0.03 && d < total * 0.97 && cuts.every(function (c) { return Math.abs(c.d - d) > total * 0.04; })) cuts.push({ d: d, name: String(q.name) });
        });
        if (cuts.length < 3) for (var k = 1; k < 5; k++) if (cuts.every(function (c) { return Math.abs(c.d - total * k / 5) > total * 0.04; })) cuts.push({ d: total * k / 5, name: "" });
        cuts.push({ d: total, name: flip ? startName : endName });
        cuts.sort(function (a, b) { return a.d - b.d; });
        function eleAt(d) {
            for (var i = 1; i < line.length; i++) if (line[i][0] >= d) {
                var a = line[i - 1], b = line[i], f = b[0] > a[0] ? (d - a[0]) / (b[0] - a[0]) : 0;
                return a[1] + (b[1] - a[1]) * f;
            }
            return line[line.length - 1][1];
        }
        var up = 0;
        for (var j = 1; j < line.length; j++) if (line[j][1] > line[j - 1][1]) up += line[j][1] - line[j - 1][1];
        var segs = [];
        for (var c = 1; c < cuts.length; c++) {
            var d0 = cuts[c - 1].d, d1 = cuts[c].d, e0 = eleAt(d0), e1 = eleAt(d1), pct = d1 > d0 ? Math.round(Math.abs(e1 - e0) / (d1 - d0) * 1000) / 10 : 0;
            segs.push({ d0: d0, d1: d1, e0: e0, e1: e1, pct: pct, lv: stepOf(pct, SLOPE_STEPS) });
        }
        return { total: total, up: Math.round(up), flip: flip, cuts: cuts, segs: segs, line: line };
    }

    /**
     * 순수 함수 - 현위치(따라가기 - 2026-10-16 홍TV님): 코스 처음부터 걸은 거리 d(m) → 안내판 위 자리와 다음 지점.
     * 안내판이 뒤집혀 있으면(내려가는 코스) 걷는 쪽이 왼쪽. → {d(안내판 거리), e(고도), pct(지금 구간 경사), next:{name, m(남은 거리)} 또는 null}
     */
    function boardHere(b, d) {
        if (!b) return null;
        var hd = Math.max(0, Math.min(b.total, b.flip ? b.total - d : d)), e = b.line[0][1];
        for (var i = 1; i < b.line.length; i++) if (b.line[i][0] >= hd) {
            var a = b.line[i - 1], c = b.line[i], f = c[0] > a[0] ? (hd - a[0]) / (c[0] - a[0]) : 0;
            e = a[1] + (c[1] - a[1]) * f;
            break;
        }
        var seg = b.segs.filter(function (s) { return hd >= s.d0 && hd <= s.d1; })[0] || b.segs[b.segs.length - 1];
        var named = b.cuts.filter(function (c) { return c.name && (b.flip ? c.d < hd - 10 : c.d > hd + 10); });
        var nx = b.flip ? named[named.length - 1] : named[0];
        return { d: hd, e: e, pct: seg.pct, lv: seg.lv, next: nx ? { name: nx.name, m: Math.round(Math.abs(nx.d - hd)) } : null };
    }

    /** 안내판 세로 과장 - 가로 1m 에 세로 3m(실제 비율이면 산이 납작해 보임). 모든 코스 같게. */
    var BOARD_EXAG = 3, BOARD_MAX_H = 320;   // 260 이면 1,300m 넘게 오르는 코스가 0.87 배로 눌렸음(PC)   // 그 비율로 이 높이(px)를 넘는 코스만 이 높이에 맞춤

    /** 안내판 고도 그래프 - box 에 그림. b = boardSegments(…), en - 영어 글, here - 걸은 거리(m, 따라가기 현위치 - 없으면 안 그림). */
    function boardProfile(box, b, en, here) {
        box.textContent = "";
        if (!b) { box.appendChild(el("p", "dim", en ? "No elevation data for this trail." : "고도 자료가 없는 코스입니다.")); return; }
        // 그림 폭 = 실제 칸 폭(글자가 줄지 않게 - 640 으로 그려 줄였더니 핸드폰에서 7px 로 작았음)
        var W = Math.max(300, Math.round((box.clientWidth || 360) - 4)), L = 8, R = 8, T = 62;
        var es = b.line.map(function (p) { return p[1]; }), lo = Math.min.apply(null, es), hi = Math.max.apply(null, es), pad = Math.max((hi - lo) * 0.08, 10);
        lo -= pad; hi += pad;
        function x(d) { return L + d / b.total * (W - L - R); }
        // 세로는 모든 코스 같은 비율(가로 1m 당 세로 BOARD_EXAG m) - 칸에 꽉 차게 늘리면 오르내림이 작은 곰배령이 가파르게, 1,300m 를 오르는
        // 남설악 → 대청봉이 완만하게 보였음(2026-10-16 홍TV님). 가파른 코스는 칸도 높게(BOARD_MAX_H 까지)
        var plotH = Math.min(BOARD_MAX_H, Math.max(24, (hi - lo) * (W - L - R) / b.total * BOARD_EXAG)), B = T + plotH, H = B + 44;   // 가파르면 칸도 높게
        function y(e) { return B - (e - lo) / (hi - lo) * plotH; }
        var svg = document.createElementNS(NS, "svg"), html = "";
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        svg.setAttribute("class", "rf-board");
        svg.setAttribute("role", "img");
        b.segs.forEach(function (sg) {
            var pts = b.line.filter(function (p) { return p[0] >= sg.d0 && p[0] <= sg.d1; }).map(function (p) { return x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); });
            pts.unshift(x(sg.d0).toFixed(1) + "," + y(sg.e0).toFixed(1));
            pts.push(x(sg.d1).toFixed(1) + "," + y(sg.e1).toFixed(1));
            var c = LEVELS[sg.lv].color;
            html += '<polygon points="' + x(sg.d0).toFixed(1) + "," + B + " " + pts.join(" ") + " " + x(sg.d1).toFixed(1) + "," + B + '" fill="' + c + '" fill-opacity="0.28"/>'
                + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + c + '" stroke-width="4" stroke-linejoin="round"' + (sg.lv === 4 ? ' class="lv4"' : "") + "/>";
            var mx = x((sg.d0 + sg.d1) / 2);
            // % 글자 - 선 아래에 자리가 있으면 아래 바닥 쪽, 없으면(평평한 낮은 구간) 선 위에(2026-10-16 PC: 곰배령 11.8% 가 선에 겹쳤음)
            var yMid = y((sg.e0 + sg.e1) / 2), py = B - yMid > 22 ? B - 6 : yMid - 7;
            if (x(sg.d1) - x(sg.d0) > 38) html += '<text x="' + mx.toFixed(1) + '" y="' + py.toFixed(1) + '" class="pct">' + sg.pct + "%</text>";
        });
        var rowEnd = [-1e9, -1e9], lastKm = -1e9;   // 이름 두 줄 - 줄마다 마지막 이름의 오른쪽 끝(겹치면 다른 줄, 둘 다 겹치면 뺌)
        var label = function (n) { return en ? enName(n) : String(n); };   // 영어 화면은 지점 이름도 영어 · 로마자(2026-10-16 PC)
        var textW = function (t) { var w = 6; for (var q = 0; q < t.length; q++) w += t.charCodeAt(q) >= 0x1100 ? 14 : 7.5; return w; };
        var endName = b.cuts[b.cuts.length - 1].name, endLeft = x(b.total) - (endName ? textW(label(endName)) : 0);   // 끝(정상) 이름은 첫 줄 맨 오른쪽에 늘 둠
        b.cuts.forEach(function (c, i) {
            var cx = x(c.d), cy = y(i === 0 ? b.segs[0].e0 : b.segs[i - 1].e1);
            html += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5" class="pt"/>';
            if (c.name) {
                var nm = label(c.name), last = i === b.cuts.length - 1, tw = textW(nm), anchor = i === 0 ? "start" : last ? "end" : "middle";
                var left = anchor === "start" ? cx : anchor === "end" ? cx - tw : cx - tw / 2;
                var row = last ? 0 : left > rowEnd[0] && left + tw < endLeft ? 0 : left > rowEnd[1] ? 1 : -1;
                if (row >= 0) {
                    var ty = row ? 44 : 22;
                    html += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + (ty + 5) + '" y2="' + (cy - 6).toFixed(1) + '" class="lead"/>'
                        + '<text x="' + cx.toFixed(1) + '" y="' + ty + '" text-anchor="' + anchor + '" class="nm">' + String(nm).replace(/[&<>"]/g, function (ch) { return "&#" + ch.charCodeAt(0) + ";"; }) + "</text>";
                    rowEnd[row] = left + tw;
                }
            }
            if (cx - lastKm > 50 && (i === b.cuts.length - 1 || x(b.total) - cx > 64)) {
                html += '<text x="' + cx.toFixed(1) + '" y="' + (H - 18) + '" text-anchor="' + (i === 0 ? "start" : i === b.cuts.length - 1 ? "end" : "middle") + '" class="km">'
                    + (Math.round(c.d / 100) / 10) + "km</text>";
                lastKm = cx;
            }
        });
        html += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + B + '" y2="' + B + '" class="base"/>';
        var hp = here != null ? boardHere(b, here) : null;
        if (hp) {   // 🔴 현위치 - 안내판의 "현위치(You are here)" 처럼
            var hx = x(hp.d), hy = y(hp.e), ha = hx < 50 ? "start" : hx > W - 50 ? "end" : "middle";
            html += '<line x1="' + hx.toFixed(1) + '" x2="' + hx.toFixed(1) + '" y1="' + (hy + 8).toFixed(1) + '" y2="' + B + '" class="here"/>'
                + '<circle cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" r="7" class="here"/>'
                + '<text x="' + hx.toFixed(1) + '" y="' + (hy - 13).toFixed(1) + '" text-anchor="' + ha + '" class="hereT">' + (en ? "You are here" : "현위치") + "</text>";
        }
        svg.innerHTML = html;
        box.appendChild(svg);
        var legend = el("div", "rf-legend");
        LEVELS.forEach(function (lv) { var i = el("i", null, en ? lv.en : lv.ko); i.style.setProperty("--c", lv.color); legend.appendChild(i); });
        box.appendChild(legend);
        if (hp && hp.next) box.appendChild(el("p", "hereNext", (en ? "Next: " + enName(hp.next.name) + " in " : "다음 " + hp.next.name + "까지 ")
            + (hp.next.m >= 1000 ? (Math.round(hp.next.m / 100) / 10) + "km" : hp.next.m + "m") + (en ? " · slope " : " · 지금 구간 경사 ") + hp.pct + "% (" + (en ? LEVELS[hp.lv].en : LEVELS[hp.lv].ko) + ")"));
        box.appendChild(el("p", "dim", en ? "Colors show the slope of each section (between named points); % is the average slope. Elevation from GPS/terrain data - for reference."
            : "색은 구간(이름 있는 지점 사이) 경사, % 는 그 구간 평균 경사입니다. 고도는 GPS · 지형 자료라 참고용입니다."));
    }

    /** 순수 함수 - 코스 이름에서 들머리 · 날머리("설악산 · 백담사 → 대청봉" → ["백담사", "대청봉"]). 못 나누면 null. */
    function nameEnds(name) {
        var tail = String(name || "").split(" · ").pop(), parts = tail.split(/\s*(?:→|->|~| - )\s*/).filter(Boolean);
        return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : null;
    }

    /** 산 페이지 코스마다 "📈 고도" - 누르면 그 코스 자료(api/course)를 받아 안내판 그래프를 펼침. rel - 앱 뿌리 상대 주소, en - 영어. */
    function boardButtons(rel, en) {
        Array.prototype.forEach.call(document.querySelectorAll(".cs li[data-id]"), function (li) {
            var go = li.querySelector(".go");
            if (!go) return;
            var btn = el("button", "boardBtn", en ? "📈 Elevation" : "📈 고도"), box = el("div", "board rfBoardBox"), loaded = false;
            btn.type = "button";
            box.hidden = true;
            btn.addEventListener("click", function () {
                box.hidden = !box.hidden;
                btn.classList.toggle("on", !box.hidden);
                if (box.hidden || loaded) return;
                loaded = true;
                box.textContent = en ? "Loading…" : "불러오는 중…";
                fetch(rel + "/api/course?id=" + encodeURIComponent(li.getAttribute("data-id"))).then(function (r) { return r.json(); }).then(function (j) {
                    var ends = nameEnds(li.getAttribute("data-name")) || [(j.ends && j.ends.start) || (en ? "Start" : "출발"), (j.ends && j.ends.end) || (en ? "End" : "도착")];
                    boardProfile(box, boardSegments(j.points, j.pois, ends[0], ends[1]), en);
                }).catch(function () { loaded = false; box.textContent = en ? "Could not load the trail." : "코스를 받지 못했습니다."; });
            });
            go.insertBefore(btn, go.firstChild);
            li.appendChild(box);
        });
    }

    // ------------------------------------------------------------------ 🕘 최근 본 산 · ⚖️ 코스 견주기(2026-10-16 홍TV님)

    /** 순수 함수 - 최근 본 목록에 넣기(같은 주소는 앞으로, 많으면 뒤를 버림). list - [{href, name, t}]. */
    function recentAdd(list, item, max) {
        var out = [item].concat((list || []).filter(function (x) { return x && x.href !== item.href; }));
        return out.slice(0, max || 8);
    }

    /** 최근 본 산 - 이 기기 localStorage(key). add 가 있으면 넣고 저장. → 목록. */
    function recentPages(key, add) {
        var list = [];
        try { list = JSON.parse(localStorage.getItem(key) || "[]") || []; } catch (e) { /* 빈 것 */ }
        if (add) {
            list = recentAdd(list, add, 8);
            try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* 이번만 */ }
        }
        return list;
    }

    /**
     * 산 페이지면 최근 본 산에 넣고, 목록(/m/ · /en/m/ - #near 가 있는 화면)이면 "🕘 최근 본 산" 접는 칸을 그림.
     * T - {key, title, sub(n)}. 이름은 h1 의 첫 글(작은 글씨 · 난이도 표는 빼고).
     */
    function recentFold(T) {
        var near = document.getElementById("near"), h1 = document.querySelector("h1"), seg = location.pathname.split("/").pop();
        if (document.querySelector("#wx") && h1 && seg) {
            var nm = (h1.firstChild && h1.firstChild.nodeType === 3 ? h1.firstChild.nodeValue : h1.textContent).trim().replace(T.strip, "").trim();
            recentPages(T.key, { href: seg, name: nm, t: Date.now() });
            return;
        }
        if (!near) return;
        var list = recentPages(T.key);
        if (!list.length) return;
        var sec = el("section"), det = el("details", "fold kind"), sum = el("summary"), body = el("div", "fb"), ul = el("ul", "ms");
        sec.id = "recent";
        det.setAttribute("name", "kind");
        sum.appendChild(el("span", "ft", T.title));
        sum.appendChild(el("span", "fs", T.sub(list)));
        sum.appendChild(el("span", "fa", "▾"));
        list.forEach(function (x) {
            var li = el("li"), a = el("a", null, x.name);
            a.href = x.href;
            li.appendChild(a);
            ul.appendChild(li);
        });
        body.appendChild(ul);
        det.appendChild(sum);
        det.appendChild(body);
        sec.appendChild(det);
        near.parentNode.insertBefore(sec, near.nextSibling);
    }

    /** 순수 함수 - 견주기 표의 줄들. a · b = {name, dist, asc}. → [[항목, a 값, b 값], …] (en - 영어). */
    function compareRows(a, b, en) {
        var row = function (o) {
            var lv = difficulty(o.dist, o.asc, o.steep), ms = standardMs("hike", o.dist, o.asc || 0);
            return [(o.dist / 1000).toFixed(2) + " km", o.asc != null ? Math.round(o.asc).toLocaleString("en-US") + " m" : "-",
                    en ? (function (m) { return (m >= 60 ? Math.floor(m / 60) + " h " : "") + m % 60 + " min"; })(Math.round(ms / 60000)) : hm(ms), lv == null ? "-" : en ? LEVELS[lv].en : LEVELS[lv].ko,
                    // 각도 · 경사 · 가파른 1km - 가파른 산 순위 · 산 페이지 코스 줄과 같은 기준(SteepRank.slopeText, 2026-10-18 홍TV님 "통일"): 1km 이상 · 오르막 있는 코스만
                    o.dist >= 1000 && o.asc > 0 ? (Math.atan(o.asc / o.dist) * 180 / Math.PI).toFixed(1) + "°" : "-",
                    o.dist >= 1000 && o.asc > 0 ? (o.asc / o.dist * 100).toFixed(1) + "%" : "-",
                    o.steep != null ? (+o.steep).toFixed(1) + "%" : "-"];
        };
        var ra = row(a), rb = row(b), names = en ? ["Distance", "Ascent", "Time (one way)", "Difficulty", "Angle", "Grade", "Steepest 1 km"] : ["거리", "오르막", "예상 시간(편도)", "난이도", "각도", "경사", "가파른 1km"];
        return names.map(function (n, i) { return [n, ra[i], rb[i]]; });
    }

    /** 산 페이지 코스마다 "⚖️" - 두 개를 고르면 목록 위에 표 + 안내판 그래프 둘. rel - 앱 뿌리, en - 영어. */
    function compareButtons(rel, en) {
        var list = document.querySelector(".cs");
        if (!list || list.querySelectorAll("li[data-id]").length < 2) return;
        var picked = [], panel = el("div", "cmp");
        panel.hidden = true;
        list.parentNode.insertBefore(panel, list);
        function info(li) {
            var asc = li.getAttribute("data-asc"), st = li.getAttribute("data-steep");
            return { id: li.getAttribute("data-id"), name: li.getAttribute("data-name"), dist: +li.getAttribute("data-dist"), asc: asc != null ? +asc : null, steep: st != null ? +st : null, li: li };
        }
        function draw() {
            Array.prototype.forEach.call(list.querySelectorAll(".cmpBtn"), function (b) { var on = picked.indexOf(b._li) >= 0; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
            panel.textContent = "";
            if (picked.length < 2) {
                panel.hidden = picked.length === 0;
                if (picked.length === 1) panel.appendChild(el("p", "dim", en ? "⚖️ Pick one more trail to compare." : "⚖️ 견줄 코스를 하나 더 고르세요."));
                return;
            }
            panel.hidden = false;
            var a = info(picked[0]), b = info(picked[1]), nm = function (x) { return en ? enName(x.name) : x.name; };
            var head = el("div", "cmpHead", en ? "⚖️ Compare trails" : "⚖️ 코스 견주기"), close = el("button", "cmpClose", "✕");
            close.type = "button";
            close.setAttribute("aria-label", en ? "Close" : "닫기");
            close.addEventListener("click", function () { picked = []; draw(); });
            head.appendChild(close);
            panel.appendChild(head);
            var t = el("table", "cmpT"), tr = el("tr");
            tr.appendChild(el("th"));
            tr.appendChild(el("th", "a", "A " + nm(a)));
            tr.appendChild(el("th", "b", "B " + nm(b)));
            t.appendChild(tr);
            compareRows(a, b, en).forEach(function (r) {
                var row = el("tr");
                row.appendChild(el("th", null, r[0]));
                row.appendChild(el("td", null, r[1]));
                row.appendChild(el("td", null, r[2]));
                t.appendChild(row);
            });
            panel.appendChild(t);
            [a, b].forEach(function (x, i) {
                var cap = el("div", "cmpCap", (i ? "B " : "A ") + nm(x)), box = el("div", "rfBoardBox");
                box.textContent = en ? "Loading…" : "불러오는 중…";
                panel.appendChild(cap);
                panel.appendChild(box);
                fetch(rel + "/api/course?id=" + encodeURIComponent(x.id)).then(function (r) { return r.json(); }).then(function (j) {
                    var ends = nameEnds(x.name) || [(j.ends && j.ends.start) || (en ? "Start" : "출발"), (j.ends && j.ends.end) || (en ? "End" : "도착")];
                    boardProfile(box, boardSegments(j.points, j.pois, ends[0], ends[1]), en);
                }).catch(function () { box.textContent = en ? "Could not load the trail." : "코스를 받지 못했습니다."; });
            });
            panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        Array.prototype.forEach.call(list.querySelectorAll("li[data-id]"), function (li) {
            var go = li.querySelector(".go");
            if (!go) return;
            var b = el("button", "cmpBtn", en ? "⚖️ Compare" : "⚖️ 견주기");
            b.type = "button";
            b._li = li;
            b.addEventListener("click", function () {
                var i = picked.indexOf(li);
                if (i >= 0) picked.splice(i, 1);
                else { picked.push(li); if (picked.length > 2) picked.shift(); }   // 셋째를 고르면 가장 먼저 고른 것이 빠짐
                draw();
            });
            go.appendChild(b);
        });
    }

    /**
     * 산 페이지 오프라인 저장(2026-10-15 홍TV님 - 산에서는 신호가 약함). 페이지 · css · js · 날씨 응답 · 코스 자료(따라가기가 쓰는 api/course)를
     * 서비스 워커의 지우지 않는 캐시(rf-offline-v1 - sw.js OFFLINE)에 담습니다. 서비스 워커가 없으면 등록부터(../sw.js - 앱 뿌리 범위).
     * urls - 담을 주소(상대 주소 가능). → Promise(담은 수). 캐시를 못 쓰는 브라우저면 거부.
     */
    function saveOffline(urls, swUrl) {
        if (!window.caches || !navigator.serviceWorker || !window.isSecureContext) return Promise.reject(new Error("no-cache"));
        var reg = navigator.serviceWorker.controller ? Promise.resolve() : navigator.serviceWorker.register(swUrl).then(function () { return null; }, function () { return null; });
        return reg.then(function () { return caches.open("rf-offline-v1"); }).then(function (c) {
            return Promise.all(urls.map(function (u) {
                var abs = new URL(u, location.href).href.split("#")[0];
                return fetch(abs, { cache: "no-cache" }).then(function (r) { return r.ok ? c.put(abs, r).then(function () { return 1; }) : 0; }, function () { return 0; });
            }));
        }).then(function (n) { return n.reduce(function (a, b) { return a + b; }, 0); });
    }

    /**
     * 산 페이지의 "📥 신호 없을 때 보기" 칸(한국어 · 영어 산 페이지). T - 글(title · btn · again · saving · fail · tip · done(시각)),
     * rel - 앱 뿌리 상대 주소(".." · "../.."), script - 이 페이지 스크립트 이름(mountain.js · mountain-en.js). 코스 목록 · 날씨 칸이 없으면 안 그림.
     */
    function offlineBox(T, rel, script) {
        var anchor = document.getElementById("wx");
        if (!anchor || !window.caches) return;
        var sec = document.createElement("section"), h = document.createElement("h2"), b = document.createElement("button"), p = document.createElement("p"), key = location.pathname;
        var when = function (t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); };
        var saved = savedPages()[key];
        sec.className = "offline";
        h.textContent = T.title;
        b.type = "button";
        b.textContent = saved ? T.again : T.btn;
        p.className = "dim";
        p.textContent = saved ? T.done(when(saved)) : T.tip;
        b.addEventListener("click", function () {
            var q = "?lat=" + (+anchor.getAttribute("data-lat")).toFixed(4) + "&lon=" + (+anchor.getAttribute("data-lon")).toFixed(4);
            var urls = [location.href, rel + "/css/course-kit.css", rel + "/css/mountain.css", rel + "/js/kit-m.js", rel + "/js/" + script, rel + "/img/logo-dark.svg",
                rel + "/api/wx" + q, rel + "/api/partners", rel + "/hike.html" + (script === "mountain-en.js" ? "?lang=en" : "")];
            Array.prototype.forEach.call(document.querySelectorAll(".cs li[data-id]"), function (li) { urls.push(rel + "/api/course?id=" + encodeURIComponent(li.getAttribute("data-id"))); });
            b.disabled = true;
            p.textContent = T.saving;
            saveOffline(urls, rel + "/sw.js").then(function (n) {
                if (!n) throw new Error("none");
                savedPages(key);
                b.textContent = T.again;
                p.textContent = T.done(when(Date.now()));
            }).catch(function () { p.textContent = T.fail; }).then(function () { b.disabled = false; });
        });
        sec.appendChild(h);
        sec.appendChild(b);
        sec.appendChild(p);
        var before = document.querySelector(".faq");
        if (before) before.parentNode.insertBefore(sec, before);
        else anchor.parentNode.appendChild(sec);
    }

    /** 오프라인 저장한 산 페이지 {주소: 저장 시각} - 이 기기 localStorage "rf-offline-m". */
    function savedPages(set) {
        var all = {};
        try { all = JSON.parse(localStorage.getItem("rf-offline-m") || "{}") || {}; } catch (e) { /* 빈 것 */ }
        if (set) { all[set] = Date.now(); try { localStorage.setItem("rf-offline-m", JSON.stringify(all)); } catch (e) { /* 이번만 */ } }
        return all;
    }

    /** 순수 함수 - 기상청 중기예보 날씨 말 → 영어(영어 산 페이지). "구름많고 비" → "⛅ Mostly cloudy, rain". 모르는 말은 그대로. */
    function wfEn(w) {
        if (!w) return "";
        var sky = { "맑음": "☀️ Clear", "구름많음": "⛅ Mostly cloudy", "흐림": "☁️ Overcast" }, m = /^(구름많고|흐리고) ?(.+)$/.exec(w);
        if (sky[w]) return sky[w];
        if (!m) return w;
        var rain = { "비": "rain", "눈": "snow", "비/눈": "rain/snow", "눈/비": "snow/rain", "소나기": "showers" }[m[2]];
        return rain ? (m[1] === "흐리고" ? "☁️ Overcast, " : "⛅ Mostly cloudy, ") + rain : w;
    }

    /** 순수 함수 - 이번 주말 날씨(api/weekend)의 중기예보 권역 이름 → 영어(영어 코스 모음 /en/m/ - 2026-10-17). 모르는 이름은 로마자. */
    var REGION_EN = { "서울 · 인천 · 경기": "Seoul · Incheon · Gyeonggi", "강원 영서": "Gangwon (inland)", "강원 영동": "Gangwon (east coast)",
        "대전 · 세종 · 충남": "Daejeon · Sejong · Chungnam", "충북": "Chungbuk", "광주 · 전남": "Gwangju · Jeonnam", "전북": "Jeonbuk",
        "대구 · 경북": "Daegu · Gyeongbuk", "부산 · 울산 · 경남": "Busan · Ulsan · Gyeongnam", "제주": "Jeju" };
    function regionEn(name) { return REGION_EN[name] || roman(name); }

    /** 순수 함수 - 이번 주말 날씨 말(단기 "맑음" · "비", 중기 "구름많고 비", 오전 → 오후 "맑음 → 흐림") → 영어. */
    function weekendWordEn(word) {
        var one = { "맑음": "☀️ Clear", "구름많음": "⛅ Mostly cloudy", "흐림": "☁️ Overcast", "비": "🌧 Rain", "눈": "❄️ Snow" };
        return String(word || "").split(" → ").map(function (w) { return one[w] || wfEn(w); }).join(" → ");
    }

    /** 쿠팡 파트너스 링크를 보일 때 함께 붙이는 문구(공정거래위원회 추천 · 보증 심사지침 - 경제적 이해관계 표시). */
    var COUPANG_NOTE = "이 안내는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

    /** 순수 함수 - 쿠팡 링크 주소들(api/partners 의 물건 하나, 예전 글 하나도) → [{text:"쿠팡 ›" 또는 "쿠팡 1 ›" …, href}]. */
    function partnerLinks(urls) {
        var l = (Array.isArray(urls) ? urls : urls ? [urls] : []).filter(function (u) { return /^https:\/\//.test(u); });
        return l.map(function (u, i) { return { text: (LANG === "en" ? "Coupang" : "쿠팡") + (l.length > 1 ? " " + (i + 1) : "") + " ›", href: u }; });
    }

    /** 순수 함수 - api/air 응답 → "미세먼지 보통(42) · 초미세먼지 좋음(14) - 가야면 측정소 14시". 못 받았으면 "". 2026-10-15 */
    function airText(a) {
        if (!a || a.unavailable || (a.pm10 == null && a.pm25 == null)) return "";
        var parts = [];
        if (a.pm10 != null) parts.push("미세먼지 " + a.pm10Word + "(" + a.pm10 + ")");
        if (a.pm25 != null) parts.push("초미세먼지 " + a.pm25Word + "(" + a.pm25 + ")");
        var hh = /\d{4}-\d\d-\d\d (\d\d):/.exec(a.time || "");
        return parts.join(" · ") + " - " + a.station + " 측정소" + (hh ? " " + (+hh[1]) + "시" : "") + (a.dist_km != null ? "(" + a.dist_km + "km)" : "");
    }

    // ------------------------------------------------------------------ 찜 · 통계 · 백업(2026-10-15 홍TV님)

    /** 찜한 코스 - 이 기기 localStorage "rf-fav" [{id, name, kind, dist, asc, t}], 새로 찜한 것이 앞. */
    var FAV_KEY = "rf-fav", FAV_MAX = 50;
    function favList() {
        try { var l = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    }
    /** 순수 함수 - 찜했는가. */
    function isFav(list, id) { return (list || []).some(function (f) { return f && f.id === id; }); }
    /** 순수 함수 - 찜했으면 빼고, 아니면 맨 앞에 넣음(FAV_MAX 개까지). */
    function favToggle(list, item) {
        list = (list || []).filter(function (f) { return f && f.id; });
        if (isFav(list, item.id)) return list.filter(function (f) { return f.id !== item.id; });
        return [item].concat(list).slice(0, FAV_MAX);
    }
    /**
     * ☆ 찜 단추 - getItem() 이 {id, name, kind, dist, asc} 를 돌려주면(없으면 null - 단추가 안 보임) 누를 때마다 넣고 뺍니다.
     * 돌려준 단추의 refresh() 로 코스가 바뀐 뒤 모양을 다시 맞춥니다.
     */
    function favButton(getItem) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rfFavBtn";
        function paint() {
            var it = getItem(), on = !!it && isFav(favList(), it.id);
            b.hidden = !it;
            b.textContent = on ? "★" : "☆";
            b.classList.toggle("on", on);
            b.title = on ? tr("찜 풀기", "Remove from favorites") : tr("찜하기 - 따라가기 첫 화면 '☆ 찜' 에 모아 둡니다(이 기기에만)", "Add to favorites - listed on the first screen (this phone only)");
            b.setAttribute("aria-label", on ? tr("찜 풀기", "Remove from favorites") : tr("찜하기", "Add to favorites"));
            b.setAttribute("aria-pressed", on ? "true" : "false");
        }
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var it = getItem();
            if (!it) return;
            it.t = Date.now();
            try { localStorage.setItem(FAV_KEY, JSON.stringify(favToggle(favList(), it))); } catch (err) { /* 저장 공간 */ }
            paint();
        });
        b.refresh = paint;
        paint();
        return b;
    }

    /**
     * 순수 함수 - 산행을 마친 화면의 "다음은?" 줄(2026-10-28 홍TV님 추천 - 수익: 끝난 때가 가장 반가운 때, 안전 화면에는 광고 없이).
     * p - api/partners, end - {lat, lon, name: "설악산 오색"(날머리), up: 오른 높이 m, month: 1~12}. → {links: [{text, href, sponsored}], coupang, affiliate}.
     * 맛집은 카카오맵 검색(제휴 아님), 숙소는 트립닷컴(날머리 좌표 검색) · 아고다({lat}{lon}), 쿠팡은 무릎 보호대 · 스틱, 다음 산은 산 모음(광고 있는 쪽).
     */
    /**
     * 순수 함수 - 산행을 마친 화면의 쿠팡 물건(2026-10-28 홍TV님 "a, b"). coupang - api/partners 의 coupang, up - 오늘 오른 높이(m), month - 1~12.
     * recovery: 산행 뒤 회복 용품 배열(설정 partner.coupang.recovery, "이름|주소" 면 이름마다 - names 는 api/partners 의 coupangNames). gear: 다음 산행에 맞는 것 하나 -
     * 한겨울(12~2월) 아이젠 → 오늘 오르막 800m 넘으면 무릎 보호대 → 11 · 3월 보온 → 6~8월 모자 · 선크림 → 400m 넘으면 스틱 → 무릎 보호대 · 스틱. 링크가 없는 것은 건너뜀.
     */
    function afterHikeGear(coupang, up, month, names) {
        var cp = coupang || {}, first = function (k) { var u = cp[k] && cp[k][0]; return /^https:\/\//.test(u || "") ? u : null; };
        var NAMES = { crampon: "🧊 아이젠", knee: "🦵 무릎 보호대", warm: "🔥 보온병 · 핫팩", sun: "🧢 모자 · 선크림", stick: "🥢 등산 스틱" };
        up = +up || 0; month = +month || 0;
        var order = [];
        if (month === 12 || month === 1 || month === 2) order.push("crampon");
        if (up >= 800) order.push("knee");
        if (month === 11 || month === 3 || month === 12 || month === 1 || month === 2) order.push("warm");
        if (month >= 6 && month <= 8) order.push("sun");
        if (up >= 400) order.push("stick");
        order.push("knee", "stick");
        var gear = null;
        for (var i = 0; i < order.length && !gear; i++) if (first(order[i])) gear = { key: order[i], label: NAMES[order[i]], href: first(order[i]) };
        // 회복 용품 - 이름이 있으면 이름마다 단추(폼롤러 · 마사지건 · 콘드로이친, 2026-10-28 홍TV님), 없으면 "산행 뒤 회복 용품" 하나
        var recovery = [], ru = cp.recovery || [], rn = (names && names.recovery) || [];
        for (var j = 0; j < ru.length && j < 3; j++) {
            if (!/^https:\/\//.test(ru[j] || "")) continue;
            if (rn[j]) recovery.push({ key: "recovery", label: "🧴 " + rn[j], href: ru[j] });
            else if (!recovery.length) recovery.push({ key: "recovery", label: "🧴 산행 뒤 회복 용품", href: ru[j] });
        }
        return { recovery: recovery, gear: gear };
    }

    function afterHikeLinks(p, end, en) {
        var T = function (ko, e) { return en ? e : ko; }, out = [], co = false, af = false;
        p = p || {};
        end = end || {};
        var name = String(end.name || "").replace(/\s+/g, " ").trim().slice(0, 30), ok = isFinite(end.lat) && isFinite(end.lon) && end.lat !== null && end.lon !== null;
        if (name) out.push({ text: T("🍜 " + name + " 맛집", "🍜 Food near " + enName(name)), href: "https://map.kakao.com/link/search/" + encodeURIComponent(name + " 맛집"), sponsored: false });
        var trip = p.trip && ok ? tripLink(p.trip, end.lat, end.lon, name) : null;
        if (trip) { out.push({ text: T("🏨 근처 숙소(트립닷컴)", "🏨 Stays nearby (Trip.com)"), href: trip, sponsored: true }); af = true; }
        else if (p.agoda && ok && /\{lat\}/.test(p.agoda)) {
            out.push({ text: T("🏨 근처 숙소(아고다)", "🏨 Stays nearby (Agoda)"), href: p.agoda.replace(/\{lat\}/g, (+end.lat).toFixed(5)).replace(/\{lon\}/g, (+end.lon).toFixed(5)), sponsored: true });
            af = true;
        }
        if (!en) {   // 쿠팡(한국어만) - 회복 용품 하나 + 오늘 산행 · 계절에 맞는 것 하나(2026-10-28 홍TV님 "a, b 로 하자")
            var pick = afterHikeGear(p.coupang, end.up, end.month, p.coupangNames);
            pick.recovery.concat(pick.gear ? [pick.gear] : []).forEach(function (x) { out.push({ text: x.label + "(쿠팡)", href: x.href, sponsored: true }); co = true; });
        }
        out.push({ text: T("⛰️ 다음 산 고르기", "⛰️ Pick your next mountain"), href: en ? "en/m/" : "m/", sponsored: false });
        return { links: out, coupang: co, affiliate: af };
    }

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
            "searchValue=" + encodeURIComponent("13|0*13*" + la + "|" + lo + "|" + nm + "|0|1"), "listFilters=17~5*17*5"].concat(keep).join("&");
    }

    global.RF = {
        sunset: sunset,
        sunrise: sunrise,
        standardMs: standardMs,
        textButton: textButton,
        wxCols: wxCols,
        wxTable: wxTable,
        kmaLink: kmaLink,
        distM: distM,
        safetyRender: safetyRender,
        favButton: favButton,
        airText: airText,
        gearList: gearList,
        COUPANG_NOTE: COUPANG_NOTE,
        partnerLinks: partnerLinks,
        airForecastText: airForecastText,
        dayLabel: dayLabel,
        midLines: midLines,
        tempRange: tempRange,
        fireNote: fireNote,
        sunriseStart: sunriseStart,
        EASY: EASY,
        easyOk: easyOk,
        langToggle: langToggle,
        foldOne: foldOne,
        wfEn: wfEn,
        regionEn: regionEn,
        weekendWordEn: weekendWordEn,
        offlineBox: offlineBox,
        boardButtons: boardButtons,
        enName: enName,
        recentFold: recentFold,
        compareButtons: compareButtons,
        windNote: windNote,
        fortune: fortune,
        fortuneDay: fortuneDay,
        supportLine: supportLine,
        staysLine: staysLine,
        staySearch: staySearch
    };
})(window);
