package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 따라가기 지도 거리 재기(2026-11-22 홍TV님 - 램블러 플러스 전용 "직선거리 · 경로거리"). 셈은 course-kit.test.js(RF.measureSum · measureSamples). */
public class HikeMeasureTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC git 은 CRLF 로 체크아웃
    }

    @Test
    public void 거리_재기_단추와_셈() throws Exception {
        String html = read("src/main/webapp/hike.html"), js = read("src/main/webapp/js/hike.js"), kit = read("src/main/webapp/js/kit-hike.js");
        assertTrue(html.contains("id=\"measureBtn\"") && html.contains("id=\"measureBox\"") && html.contains("id=\"measureUndo\"") && html.contains("id=\"measureEnd\""));
        assertTrue("두 줄(거리 · 오르막)", html.contains("#measureText { white-space:pre-line; }"));
        assertTrue("따라가기 화면이 받는 kit 에 셈 함수", kit.contains("function measureSum(pts, eles)") && kit.contains("function measureSamples(pts, stepM, maxN)"));
        // 켠 때만 누른 자리를 점으로 - 지도 클릭은 거리 재기만 씀
        assertTrue(js.contains("if (!measure.on) return;\n                    measure.pts.push({ lat: e.lngLat.lat, lon: e.lngLat.lng });"));
        assertTrue("높이는 바탕 음영과 같은 지형 타일 · 약 30m 마다 300점까지", js.contains("RF.measureSamples(pts, 30, 300)") && js.contains("src.getDemTile(z, tx, ty)"));
        assertTrue("긴 거리는 덜 자세한 타일(받는 장 수를 줄임)", js.contains("var z = RF.measureZoom(Math.max(30, path / 300), pts[0].lat, cfg.vworldKey ? 12 : 15);"));
        assertTrue("칸은 지도 위쪽 - 낮은 지도 가운데를 가리지 않게", html.contains("#measureBox { position:absolute; left:66px; right:64px; top:10px;"));
        assertTrue("처음 · 끝 점이 코스 50m 안이면 코스 따라(2026-11-22 홍TV님 - 직선 · 이은 거리가 같게 나왔음)", js.contains("var along = c ? RF.courseBetween(c, pts[0], pts[pts.length - 1], 50) : null;")
                && kit.contains("function courseBetween(c, a, b, maxOff)"));
        assertTrue("점이 둘이면 직선만", js.contains("(pts.length > 2 ? \" · \" + T(\"찍은 점 \" + pts.length + \"개 이은 거리 \""));
        assertTrue("늦게 온 높이는 버림", js.contains("if (run !== measure.run || !measure.on) return;"));
        assertTrue("누른 자리로 지도가 옮겨 가지 않게", js.contains("if (measure.on) setFollow(false);"));
        assertTrue(js.contains("$(\"measureUndo\").addEventListener(\"click\", function () { measure.pts.pop(); drawMeasure(); });"));
    }
}
