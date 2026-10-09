package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-10-09 2차 점검 2단계(속도 · API 호출 줄이기). */
public class CheckupStage2Test {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of("src", "main", "webapp").resolve(path), StandardCharsets.UTF_8);
    }

    @Test
    public void etagMatchesSameBodyOnly() {
        String a = Json.etag("{\"a\":1}"), b = Json.etag("{\"a\":2}");
        assertTrue(a.startsWith("W/\""));
        assertEquals(a, Json.etag("{\"a\":1}"));
        assertNotEquals(a, b);
        assertTrue(Json.matches(a, a));
        assertTrue("약한 표시 없이 와도", Json.matches(a.substring(2), a));
        assertTrue("여럿 중 하나", Json.matches(b + ", " + a, a));
        assertTrue("gzip 꼬리", Json.matches(a.substring(0, a.length() - 1) + "-gzip\"", a));
        assertTrue(Json.matches("*", a));
        assertFalse(Json.matches(b, a));
        assertFalse(Json.matches(null, a));
    }

    @Test
    public void trailsOnlyRealCrossingsNearestFirst() {
        assertTrue(TrailsServlet.SQL.contains("MBRIntersects(path"));   // 공간 인덱스
        assertTrue(TrailsServlet.SQL.contains("ST_Intersects(path"));
        assertTrue(TrailsServlet.SQL.contains("ORDER BY ST_Distance("));
        assertEquals(3, TrailsServlet.SQL.chars().filter(ch -> ch == '?').count());
        assertEquals("[[128.1,38.1],[128.3,38.3]]",
                TrailsServlet.thinWkt("MULTILINESTRING((128.1 38.1,128.2 38.2),(128.3 38.3))", 5).toString());
    }

    @Test
    public void serviceWorkerKeepsCachesBounded() throws Exception {
        String sw = read("sw.js");
        assertTrue(sw.contains("trim(API, API_KEEP)"));
        assertTrue("오프라인 저장 타일은 지나가며 본 타일 캐시에 넣지 않음", sw.contains("req.cache === \"no-store\" ? null : TILES"));
        assertTrue("화면 주소는 오프라인 안내 화면", sw.contains("req.mode === \"navigate\""));
    }

    @Test
    public void previewDoesNotAskTwice() throws Exception {
        String app = read("js/app.js");
        assertFalse("내 주변: moveend 에서 또 받지 않음", app.contains("map.once(\"moveend\", function () { loadCourses(); });"));
        assertTrue(app.contains("return nationwide(list.kind);"));
    }
}
