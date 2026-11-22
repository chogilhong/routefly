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
        assertTrue("설정이 있고 pmtiles 를 읽었을 때만", js.contains("if (c.basemapUrl && window.pmtiles) {") && js.contains("maplibregl.addProtocol(\"pmtiles\", new pmtiles.Protocol().tile);"));
        assertTrue("없으면 지금 바탕", js.contains("style: style || RF.baseStyle(cfg)"));
        assertTrue("한글은 폰 글꼴", js.contains("localIdeographFontFamily:"));
        assertTrue(html.contains("<script src=\"vendor/pmtiles-4.5.0/pmtiles.js\"></script>"));
        assertTrue("지도 파일은 캐시하지 않음(Range)", sw.contains("if (/\\.pmtiles(?:[?#]|$)/.test(url)) return;"));
        for (String f : new String[] {   // 9472-9727 은 봉우리 ▲(U+25B2) - 없으면 404 뒤 폰 글꼴로 그렸음(2026-11-22 PC)
                "pmtiles-4.5.0/pmtiles.js", "pmtiles-4.5.0/LICENSE", "fonts/OFL.txt", "fonts/Noto Sans Regular/0-255.pbf", "fonts/Noto Sans Regular/8192-8447.pbf", "fonts/Noto Sans Regular/9472-9727.pbf"})
            assertTrue(f, Files.size(Path.of("src/main/webapp/vendor/" + f)) > 100);
        assertTrue("안내 페이지 사용 조건(한 · 영)", read("src/main/webapp/about.html").contains("© OpenMapTiles © OpenStreetMap contributors(ODbL)") && read("src/main/webapp/about-en.html").contains("map font Noto Sans (SIL OFL 1.1)"));
    }
}
