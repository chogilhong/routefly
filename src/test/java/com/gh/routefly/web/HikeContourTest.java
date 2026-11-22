package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 따라가기 지도 등고선 켜기 · 끄기(2026-11-22 홍TV님 - 램블러 플러스 전용 기능을 보고). */
public class HikeContourTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC git 은 CRLF 로 체크아웃
    }

    @Test
    public void 등고선_단추와_층() throws Exception {
        String html = read("src/main/webapp/hike.html"), js = read("src/main/webapp/js/hike.js"), sw = read("src/main/webapp/sw.js");
        String lib = "vendor/maplibre-contour-0.1.1/maplibre-contour.min.js";
        assertTrue("라이브러리는 우리 서버 파일 · BSD-3 허가문 함께", Files.exists(Paths.get("src/main/webapp/" + lib))
                && read("src/main/webapp/vendor/maplibre-contour-0.1.1/LICENSE").startsWith("BSD 3-Clause License"));
        int ml = html.indexOf("src=\"vendor/maplibre-gl-5.24.0/maplibre-gl.js\""), mc = html.indexOf("src=\"" + lib + "\""), hk = html.indexOf("src=\"js/hike.js");
        assertTrue("MapLibre 다음 · hike.js 앞", ml > 0 && mc > ml && hk > mc);
        assertTrue("오프라인에도", sw.contains("\"" + lib + "\""));
        assertTrue(html.contains("id=\"contourBtn\"") && html.contains("#contourBtn.on"));
        // 바탕 음영과 같은 지형 타일 · 같은 maxzoom - 새 자료나 키 없음, 끈 동안은 층을 만들지 않음
        assertTrue(js.contains("new mlcontour.DemSource({ url: cfg.demUrl, encoding: \"terrarium\", maxzoom: cfg.vworldKey ? 12 : 15, worker: true })"));
        assertTrue(js.contains("if (contourOn && !map.getSource(\"contours\") && demSource())"));
        assertTrue("코스 · 등산로 선 아래", js.contains("map.getLayer(\"trails\") ? \"trails\" : undefined"));
        assertTrue("켠 것 기억 · 지도가 뜨면 다시", js.contains("var CONTOUR_KEY = \"rf-contour\"") && js.contains("if (contourOn) setContour(true, true);"));
        assertTrue("바탕을 바꾸면 선 색도", js.contains("map.setPaintProperty(\"contours\", \"line-color\", cp.color);"));
        assertTrue(js.contains("$(\"contourBtn\").addEventListener(\"click\", function () { if (map) setContour(!contourOn); });"));
        // 저장 열쇠는 개인정보 방침 2장에(rf- 열쇠는 모두 적음)
        assertTrue(read("src/main/webapp/privacy.html").contains("rf-basemap) · 등고선 켬(rf-contour)"));
        assertTrue(read("src/main/webapp/privacy-en.html").contains("light map, rf-basemap) and contour lines on · off (rf-contour)"));
    }
}
