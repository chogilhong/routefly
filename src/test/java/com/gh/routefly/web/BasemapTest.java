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
        assertTrue("설정이 있고 pmtiles 를 읽었을 때만", js.contains("if (!c.basemapUrl || !window.pmtiles) return { cfg: cfg, style: null };") && js.contains("maplibregl.addProtocol(\"pmtiles\", proto.tile);"));
        assertTrue("파일 머리를 못 읽으면(404 - 설정이 파일보다 먼저) V-World 바탕으로(2026-11-22 PC)",
            js.contains("return file.getHeader().then(function () {") && js.contains("}, function () { return { cfg: cfg, style: null }; });") && js.contains("proto.add(file);"));
        assertTrue("없으면 지금 바탕", js.contains("style: style || RF.baseStyle(cfg)"));
        assertTrue("한글은 폰 글꼴", js.contains("localIdeographFontFamily:"));
        assertTrue("기록 선은 글자 층 아래(봉우리 이름을 덮지 않게, 2026-11-22 홍TV님)", js.contains("var under = firstSymbol();") && js.contains("paint: { \"line-color\": [\"coalesce\", [\"get\", \"color\"], \"#5b45ff\"], \"line-width\": 4.5 } }, under);"));
        assertTrue("지나간 봉우리 크게 - 지도 조각이 올 때마다 찾음", js.contains("map.on(\"idle\", markPeaks);") && js.contains("RF.peaksNear(feats, rc.lat, rc.lon, PEAK_NEAR_M)")
            && js.contains("map.setFilter(\"peak-on\", RF.peakOnFilter(peakKeys, true, dropPeaks));") && js.contains("map.setFilter(\"peak\", RF.peakOnFilter(peakKeys, false, dropPeaks));"));
        assertTrue("속도 선은 거리 100칸 평균(톱니 줄이기)", read("src/main/webapp/js/course-kit.js").contains("speedBuckets(opts.speed, c.dist, c.total, SPEED_BUCKETS).forEach("));
        assertTrue("등고선 켜기 · 끄기 - 따라가기와 같은 라이브러리 · 기억 · 간격 · 색", html.contains("<script src=\"vendor/maplibre-contour-0.1.1/maplibre-contour.min.js\"></script>")
            && js.contains("var CONTOUR_KEY = \"rf-contour\"") && js.contains("thresholds: RF.CONTOUR_STEPS") && js.contains("RF.contourPaint(true)")
            && js.contains("if (window.mlcontour) map.addControl(contourControl(), \"top-right\");") && js.contains("setContour(contourOn); });"));
        assertTrue("따라가기도 같은 간격 · 색(두 벌 안 둠)", read("src/main/webapp/js/hike.js").contains("CONTOUR_STEPS = RF.CONTOUR_STEPS;") && read("src/main/webapp/js/hike.js").contains("var contourPaint = RF.contourPaint;"));
        assertTrue("대피소 · 절 등 아이콘은 필요할 때 그려 넣음(2026-11-22 홍TV님)", js.contains("map.on(\"styleimagemissing\", function (e) { iconImage(e.id); });") && js.contains("var ic = RF.MAP_ICONS[id];"));
        assertTrue("지도에 routefly 로고(아이콘 + 글자, 밝은 지도용)", html.contains("<img id=\"brand\" src=\"img/logo.svg\" alt=\"routefly\""));
        assertTrue("표시별 보이기 · 숨기기 - 사진 · 메모는 표시를 감추고 대피소 등은 층 거름으로, 그래프와 안 겹치게",
            js.contains("it.mark.getElement().style.display = hidden[it.n.photo ? \"photo\" : \"memo\"] ? \"none\" : \"\";")
            && js.contains("map.setFilter(\"poi-hike\", RF.poiShowFilter(map.getLayoutProperty(\"poi-hike\", \"icon-image\")") && js.contains("kindBar();\n            placeKit();"));
        assertTrue("카드에 마우스 → 지도 표시 주황(2026-11-22 홍TV님)", js.contains("card.addEventListener(\"mouseenter\", function () { if (it.mark) it.mark.getElement().classList.add(\"hover\"); });")
            && js.contains("card.addEventListener(\"mouseleave\", function () { if (it.mark) it.mark.getElement().classList.remove(\"hover\"); });") && html.contains(".pin.on, .pin.hover {"));
        assertTrue("공단 대피소 · 100대 명산 정상은 처음부터(지도 load 를 기다리지 않음), 겹치는 OSM 것은 숨김(2026-11-22 홍TV님)",
            js.contains("if (vector) loadMarks();") && js.contains("RF.famousMarks(d[0] && d[0].peaks, d[1] && d[1].elev, d[2] && d[2].shelters)")
            && js.contains("map.setFilter(\"peak\", RF.peakOnFilter(peakKeys, false, dropPeaks));") && js.contains("Object.keys(hidden).filter(function (k) { return hidden[k] && /^rf-/.test(k); }), dropHuts));")
            && js.contains("map.setLayoutProperty(\"rf-hut\", \"visibility\", hidden[\"rf-hut\"] ? \"none\" : \"visible\");"));
        assertTrue("구간 색 · 봉우리 대피소 누르면 그래프에(2026-11-23 홍TV님)", js.contains("if (fam) return RF.trackSegments(rc, fam.huts.concat(fam.peaks), SEG_NEAR_M, SEG_GAP_M);")
            && js.contains("\"line-color\": [\"coalesce\", [\"get\", \"color\"], \"#5b45ff\"]") && js.contains("map.on(\"click\", id, pickPlace);") && js.contains("if (prof) prof.set(q.d);"));
        assertTrue("OSM 출처는 한 번만 - 우리 지도는 바탕 출처에 이미 있음(2026-11-22 PC)", js.contains("customAttribution: (style ? \"\" : \"© OpenStreetMap contributors | \") + "));
        assertTrue(html.contains("<script src=\"vendor/pmtiles-4.5.0/pmtiles.js\"></script>"));
        assertTrue("지도 파일은 캐시하지 않음(Range)", sw.contains("if (/\\.pmtiles(?:[?#]|$)/.test(url)) return;"));
        for (String f : new String[] {   // 9472-9727 은 봉우리 ▲(U+25B2) - 없으면 404 뒤 폰 글꼴로 그렸음(2026-11-22 PC)
                "pmtiles-4.5.0/pmtiles.js", "pmtiles-4.5.0/LICENSE", "fonts/OFL.txt", "fonts/Noto Sans Regular/0-255.pbf", "fonts/Noto Sans Regular/8192-8447.pbf", "fonts/Noto Sans Regular/9472-9727.pbf"})
            assertTrue(f, Files.size(Path.of("src/main/webapp/vendor/" + f)) > 100);
        assertTrue("안내 페이지 사용 조건(한 · 영)", read("src/main/webapp/about.html").contains("© OpenMapTiles © OpenStreetMap contributors(ODbL)") && read("src/main/webapp/about-en.html").contains("map font Noto Sans (SIL OFL 1.1)"));
    }
}
