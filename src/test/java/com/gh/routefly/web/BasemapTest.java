package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 바탕 지도 2단계(2026-11-22 홍TV님 "지도 작업을 계속 하자고") - 우리 지도 파일(PMTiles)을 기록 보기(trip.html)에. 모양 셈은 course-kit.test.js vectorStyle. */
public class BasemapTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void mapConfigBasemapUrl() {
        assertEquals("tiles/korea.pmtiles", MapConfigServlet.basemap(" tiles/korea.pmtiles "));
        assertEquals("/routefly/tiles/korea.pmtiles", MapConfigServlet.basemap("/routefly/tiles/korea.pmtiles"));
        assertEquals("https://routefly.kr/routefly/tiles/korea.pmtiles", MapConfigServlet.basemap("https://routefly.kr/routefly/tiles/korea.pmtiles"));
        for (String bad : new String[] {null, "", "http://x.kr/a.pmtiles", "tiles/korea.mbtiles", "javascript:alert(1).pmtiles", "../../etc/a.pmtiles", "a b.pmtiles", "https://x.kr/a.pmtiles?x=1"})
            assertNull(bad, MapConfigServlet.basemap(bad));
        assertTrue(MapConfigServlet.body(null, null, "tiles/korea.pmtiles").get("basemapUrl").getAsString().equals("tiles/korea.pmtiles"));
        assertTrue("설정이 없으면 null - 화면은 지금 바탕", MapConfigServlet.body(null, null, null).get("basemapUrl").isJsonNull());
    }

    @Test
    public void tripUsesBasemapWhenSet() throws Exception {
        String js = read("src/main/webapp/js/trip.js"), html = read("src/main/webapp/trip.html"), sw = read("src/main/webapp/sw.js");
        String kit = read("src/main/webapp/js/course-kit.js");
        assertTrue("설정이 있고 pmtiles 를 읽었을 때만 - 기록 보기 · 3D 영상이 같은 RF.vectorBasemap", js.contains("return RF.vectorBasemap(c.basemapUrl, cfg.demUrl).then(")
            && kit.contains("if (!basemapUrl || !global.pmtiles || !global.maplibregl) return Promise.resolve(null);") && kit.contains("global.maplibregl.addProtocol(\"pmtiles\", proto.tile);"));
        assertTrue("파일 머리를 못 읽으면(404 - 설정이 파일보다 먼저) V-World 바탕으로(2026-11-22 PC)",
            kit.contains("return file.getHeader().then(function () {") && kit.contains("}, function () { return null; });") && kit.contains("proto.add(file);"));
        assertTrue("없으면 지금 바탕", js.contains("style: style || RF.baseStyle(cfg)"));
        assertTrue("한글은 폰 글꼴", js.contains("localIdeographFontFamily:"));
        assertTrue("기록 선은 글자 층 아래(봉우리 이름을 덮지 않게, 2026-11-22 홍TV님)", js.contains("var under = firstSymbol();") && js.contains("paint: { \"line-color\": [\"coalesce\", [\"get\", \"color\"], \"#5b45ff\"], \"line-width\": 4.5 } }, under);"));
        assertTrue("지나간 봉우리 크게 - 지도 조각이 올 때마다 찾음", js.contains("map.on(\"idle\", markPeaks);") && js.contains("RF.peaksNear(feats, rc.lat, rc.lon, PEAK_NEAR_M)")
            && js.contains("map.setFilter(\"peak-on\", RF.peakOnFilter(peakKeys, true, dropPeaks));") && js.contains("map.setFilter(\"peak\", RF.peakOnFilter(peakKeys, false, dropPeaks));"));
        assertTrue("속도 선은 거리 100칸 평균(톱니 줄이기)", read("src/main/webapp/js/course-kit.js").contains("speedBuckets(opts.speed, c.dist, c.total, SPEED_BUCKETS).forEach("));
        assertTrue("등고선 켜기 · 끄기 - 따라가기와 같은 라이브러리 · 기억 · 간격 · 색", html.contains("<script src=\"vendor/maplibre-contour-0.1.1/maplibre-contour.min.js\"></script>")
            && js.contains("var CONTOUR_KEY = \"rf-contour\"") && js.contains("thresholds: RF.CONTOUR_STEPS") && js.contains("RF.contourPaint(true)")
            && js.contains("if (window.mlcontour) map.addControl(contourControl(), \"top-right\");") && js.contains("fold(); setContour(contourOn);"));
        assertTrue("따라가기도 같은 간격 · 색(두 벌 안 둠)", read("src/main/webapp/js/hike.js").contains("CONTOUR_STEPS = RF.CONTOUR_STEPS;") && read("src/main/webapp/js/hike.js").contains("var contourPaint = RF.contourPaint;"));
        assertTrue("대피소 · 절 등 아이콘은 필요할 때 그려 넣음(2026-11-22 홍TV님)", js.contains("map.on(\"styleimagemissing\", function (e) { RF.mapIconImage(map, e.id); });") && kit.contains("var ic = MAP_ICONS[id];"));
        assertTrue("지도에 routefly 로고(아이콘 + 글자, 밝은 지도용)", html.contains("<img id=\"brand\" src=\"img/logo.svg\" alt=\"routefly\""));
        assertTrue("표시별 보이기 · 숨기기 - 사진 · 메모는 표시를 감추고 대피소 등은 층 거름으로, 그래프와 안 겹치게",
            js.contains("it.mark.getElement().style.display = hidden[it.n.photo ? \"photo\" : \"memo\"] ? \"none\" : \"\";")
            && js.contains("map.setFilter(\"poi-hike\", RF.poiShowFilter(map.getLayoutProperty(\"poi-hike\", \"icon-image\")") && js.contains("kindBar();\n            placeKit();"));
        assertTrue("카드에 마우스 → 지도 표시 주황(2026-11-22 홍TV님)", js.contains("card.addEventListener(\"mouseenter\", function () { if (it.mark) it.mark.getElement().classList.add(\"hover\"); });")
            && js.contains("card.addEventListener(\"mouseleave\", function () { if (it.mark) it.mark.getElement().classList.remove(\"hover\"); });") && html.contains(".pin.on, .pin.hover {"));
        assertTrue("공단 대피소 · 100대 명산 정상은 처음부터(지도 load 를 기다리지 않음), 겹치는 OSM 것은 숨김(2026-11-22 홍TV님)",
            js.contains("if (vector) loadMarks();") && js.contains("Promise.all([RF.famousFetch(), photosP])") && kit.contains("return { gj: famousMarks(peaks, elev, shelters), peaks: peaks, elev: elev, shelters: shelters };")
            && js.contains("map.setFilter(\"peak\", RF.peakOnFilter(peakKeys, false, dropPeaks));") && js.contains("Object.keys(hidden).filter(function (k) { return hidden[k] && /^rf-/.test(k); }), dropHuts));")
            && js.contains("map.setLayoutProperty(\"rf-hut\", \"visibility\", hidden[\"rf-hut\"] ? \"none\" : \"visible\");"));
        assertTrue("구간 색 · 봉우리 대피소 누르면 그래프에(2026-11-23 홍TV님)", js.contains("if (fam) return RF.trackSegments(rc, fam.huts.concat(fam.peaks, namedPeaks), SEG_NEAR_M, SEG_GAP_M);")
            && js.contains("\"line-color\": [\"coalesce\", [\"get\", \"color\"], \"#5b45ff\"]") && js.contains("map.on(\"click\", id, pickPlace);") && js.contains("if (prof) prof.set(q.d);"));
        assertTrue("지도 모양만 준비되면 그림 - load · map.loaded() 를 기다리지 않음(2026-11-23 PC: 일찍 연 GPX 가 안 그려졌음)",
            js.contains("map.once(\"style.load\", function () { styleOk = true;") && js.contains("whenStyle(draw);") && js.contains("whenStyle(applyKinds);")
            && !js.contains("map.loaded()") && !js.contains("once(\"load\""));
        assertTrue("말풍선은 ✕ · 빈 곳 · Esc 로 닫힘(2026-11-23 PC)", js.contains("closeButton: true, closeOnClick: true") && js.contains("if (e.key === \"Escape\" && popup"));
        assertTrue("구간 표(2026-11-23 홍TV님 1 · 2) - 지도 위 구간 글은 뺌(2026-11-23 홍TV님 \"오른쪽에 있으니 안 보여줘도 돼\")", !js.contains("seglbl") && !js.contains("rf-pill")
            && js.contains("segList(segs);") && js.contains("$(\"side\").insertBefore(box, $(\"side\").firstChild);") && js.contains("map.fitBounds(bb, { padding: fitPad(),") && html.contains("#segs .seg {")
            && js.contains("kb = k ? m.bottom - k.getBoundingClientRect().top + 12 : 0;"));
        assertTrue("공원 탐방로 - 폰 안에서 공원을 정하고 이름만 보냄(2026-11-23 홍TV님), 방침에 적음", js.contains("var park = RF.recordPark(rc, parkCands, PARK_NEAR_M);")
            && js.contains("getJson(\"api/park?name=\" + encodeURIComponent(park))") && read("src/main/webapp/privacy.html").contains("그 <b>공원 이름만</b> 보내 탐방로 선을 받습니다")
            && read("src/main/webapp/privacy-en.html").contains("sends <b>only the national park name</b>"));
        assertTrue("3D 화면 트립닷컴도 넓은 지역으로(2026-11-23 홍TV님 \"다른 곳도 동일하게\")", read("src/main/webapp/js/app.js").contains("RF.tripLink(p.trip, start.lat, start.lon, wide ||")
            && read("src/main/webapp/js/course-kit.js").contains("areaOf(pl.addr), agodaCity(pl.lat, pl.lon), areaWide(pl.addr));"));
        String app = read("src/main/webapp/js/app.js"), stayPart = app.substring(app.indexOf("} else if (kind === \"stay\" || kind === \"food\") {"));
        stayPart = stayPart.substring(0, stayPart.indexOf("$(\"guideBar\").addEventListener"));
        assertTrue("3D 숙박 칸은 날씨 칸의 wxP 를 쓰지 않음 - 쓰면 숙박 칸 전체가 깨짐(2026-11-23 PC 운영 v347)", !stayPart.contains("wxP")
            && stayPart.contains("var regionP = getJson(\"api/wx?regionOnly=1&lat=\" + start.lat.toFixed(4)") && stayPart.contains("Promise.all([partners(), regionP])"));
        assertTrue("대피소 사진 - 말풍선 · 사진 목록(기록 위 거리 차례), CC BY-SA 는 자르지 않음, 출처 늘(2026-11-23 홍TV님)", js.contains("RF.stopsAlong(rc, fam.huts.filter(function (h) { return hutPhotos[h.name]; }), HUT_CARD_M)")
            && js.contains("var hp = hutPhotoAt(g[1], g[0]);") && js.contains("(p.sa ? \" asis\" : \"\")") && html.contains(".hutImg.asis { object-fit:contain !important;")
            && read("src/main/webapp/data/shelter-photos.json").contains("\"photos\":"));
        assertTrue("3D 비행 영상 바탕 = 우리 지도(2026-11-23 홍TV님) - 위성 없을 때만, 길 · 마을 · 물 이름 뺌, 출처 줄에 OpenMapTiles", app.contains("(VIDEO && !VIDEO.sat ? RF.vectorBasemap(r[0].basemapUrl, r[0].demUrl) : Promise.resolve(null))")
            && app.contains("var VIDEO_DROP = [\"road-name\", \"road-name-major\", \"place\", \"water-name\", \"gu-name\"];") && app.contains("(videoVec ? T(\"지도: \", \"Map: \") + \"© OpenMapTiles | \" : \"\")")
            && read("src/main/webapp/index.html").contains("<script src=\"vendor/pmtiles-4.5.0/pmtiles.js\"></script>"));
        assertTrue("구간: 지나간 …산 정상에서도 끊기 · 1km 안은 하나로 · 역 단추(2026-11-23 홍TV님 1 · 2 · 도시 안내)", js.contains("SEG_GAP_M = 1000") && js.contains("fam.huts.concat(fam.peaks, namedPeaks)")
            && js.contains("return /산$/.test(f.name || \"\")") && !js.contains("\"rf-rail\", \"🚉\"")
            && read("src/main/webapp/js/course-kit.js").contains("\"rf-rail\": [\"#ffffff\", \"dot\"] };") && read("src/main/webapp/js/course-kit.js").contains("[\"concat\", ko, \"역\"], ko]") && app.contains("var VIDEO_DROP = [\"road-name\", \"road-name-major\", \"place\", \"water-name\", \"gu-name\"];")
            && app.contains("map.setFilter(\"peak\", [\"!\", [\"in\", [\"get\", \"name\"], [\"literal\", videoPeakNames.concat(own)]]]);")
            && app.contains("map.setFilter(\"rf-peak\", [\"all\", [\"==\", [\"get\", \"kind\"], \"peak\"], [\"!\", [\"in\", [\"get\", \"name\"], [\"literal\", own]]]]);"));
        assertTrue("봉우리 찾기는 idle 만 믿지 않고 조각을 받을 때도(2026-11-23 PC 불수사도북 z12.95 - 사패산에서 안 나뉨)", js.contains("if (e.sourceId !== \"omt\" || !e.isSourceLoaded) return;")
            && js.contains("clearTimeout(peakT); peakT = setTimeout(markPeaks, 400);"));
        assertTrue("구 이름 자료 - 지도 파일에서 뽑은 구 이름만(…구), 서울 · 부산 등(2026-11-23 홍TV님)", read("src/main/webapp/data/gu-labels.json").contains("\"name\":\"종로구\"")
            && read("src/main/webapp/data/gu-labels.json").contains("\"name\":\"노원구\"") && read("src/main/webapp/data/gu-labels.json").contains("\"name\":\"해운대구\"")
            && !read("src/main/webapp/data/gu-labels.json").contains("동\",\"name_en"));
        assertTrue("더하기 층(아파트 단지 이름)은 바탕 옆 -extra.pmtiles 가 있을 때만 - 지도 만들기 도구는 tools 저장소 map/(2026-11-23 홍TV님)", read("src/main/webapp/js/course-kit.js").contains("var extraUrl = url.replace(/\\.pmtiles$/, \"-extra.pmtiles\")")
            && read("src/main/webapp/js/course-kit.js").contains("extraUrl: ok ? extraUrl : null") && read("docs/basemap/README.md").contains("korea-extra.pmtiles"));
        String sub = read("src/main/webapp/data/subway-lines.json"), raw = read("src/test/resources/subway/routes.json");
        assertTrue("지하철 노선 색 - 받은 OSM 자료의 colour 그대로(1호선 · 2호선 · 의정부경전철)", sub.contains("\"ref\":\"1\",\"name\":\"수도권 전철 1호선\",\"colour\":\"#004A85\"")
            && sub.contains("\"colour\":\"#00A23F\"") && sub.contains("\"colour\":\"#F0831E\"") && raw.contains("\"colour\": \"#004A85\"") && raw.contains("\"colour\": \"#F0831E\""));
        assertTrue("지나간 …산은 이름마다 한 번만(이웃 조각에 같은 봉우리가 겹쳐 있음)", js.contains(".filter(function (q, k, all) { return all.findIndex(function (o) { return o.name === q.name; }) === k; });"));
        assertTrue("처음 화면부터 작은 봉우리(사패산)에서 나눔 - 선이 지나는 확대 12 조각을 지도 파일에서 바로 읽음(2026-11-23 PC 운영 v360)", js.contains("RF.trackTilePeaks(rc.lat, rc.lon).then(function (f) { if (rc === forRc && f.length) { tileFeats = f; markPeaks(); } });")
            && js.contains("var feats = pts(\"mountain_peak\").concat(tileFeats)") && read("src/main/webapp/js/course-kit.js").contains("basemapFile = file;"));
        assertTrue("점검용 지도 엿보기는 ?debug=map 일 때만", js.contains("if (/[?&]debug=map(?:&|$)/.test(location.search)) {") && js.indexOf("window.__rfMap") > js.indexOf("debug=map"));
        assertTrue("OSM 출처는 한 번만 - 우리 지도는 바탕 출처에 이미 있음(2026-11-22 PC)", js.contains("customAttribution: (style ? \"\" : \"© OpenStreetMap contributors | \") + "));
        assertTrue(html.contains("<script src=\"vendor/pmtiles-4.5.0/pmtiles.js\"></script>"));
        assertTrue("지도 파일은 캐시하지 않음(Range)", sw.contains("if (/\\.pmtiles(?:[?#]|$)/.test(url)) return;"));
        for (String f : new String[] {   // 9472-9727 은 봉우리 ▲(U+25B2) - 없으면 404 뒤 폰 글꼴로 그렸음(2026-11-22 PC)
                "pmtiles-4.5.0/pmtiles.js", "pmtiles-4.5.0/LICENSE", "fonts/OFL.txt", "fonts/Noto Sans Regular/0-255.pbf", "fonts/Noto Sans Regular/8192-8447.pbf", "fonts/Noto Sans Regular/9472-9727.pbf"})
            assertTrue(f, Files.size(Path.of("src/main/webapp/vendor/" + f)) > 100);
        assertTrue("안내 페이지 사용 조건(한 · 영)", read("src/main/webapp/about.html").contains("© OpenMapTiles © OpenStreetMap contributors(ODbL)") && read("src/main/webapp/about-en.html").contains("map font Noto Sans (SIL OFL 1.1)"));
    }
}
