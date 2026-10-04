package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.math.BigDecimal;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 설정 · 요청 값 검사 · 응답 모양(DB 없이). */
public class WebBasicsTest {

    @Test
    public void configPath() {
        assertEquals(RouteflyConfig.DEFAULT_PATH, RouteflyConfig.resolvePath(null));
        assertEquals(RouteflyConfig.DEFAULT_PATH, RouteflyConfig.resolvePath("  "));
        assertEquals("D:\\x.properties", RouteflyConfig.resolvePath(" D:\\x.properties "));
    }

    /** routefly-batch 의 코스 ID 규칙과 같아야 합니다(파일 이름). */
    @Test
    public void courseIdRules() {
        assertTrue(CourseQueries.validId("seorak-dinosaur-ridge"));
        assertTrue(CourseQueries.validId("bukhan_01"));
        assertFalse(CourseQueries.validId(null));
        assertFalse(CourseQueries.validId(""));
        assertFalse("대문자", CourseQueries.validId("Seorak"));
        assertFalse("경로 문자", CourseQueries.validId("../etc"));
        assertFalse("따옴표", CourseQueries.validId("a' OR '1'='1"));
        assertFalse("- 로 시작", CourseQueries.validId("-a"));
        assertFalse("65자", CourseQueries.validId("a".repeat(65)));
    }

    @Test
    public void kindFilter() {
        assertNull(CourseQueries.parseKind(null));
        assertNull(CourseQueries.parseKind(" "));
        assertEquals("hike", CourseQueries.parseKind(" Hike "));
        try {
            CourseQueries.parseKind("hike;drop");
            fail();
        } catch (IllegalArgumentException e) {
            // 기대한 대로
        }
    }

    @Test
    public void bboxParsing() {
        assertNull(CourseQueries.parseBbox(null));
        assertNull(CourseQueries.parseBbox(""));
        assertArrayEquals(new double[] {128.4, 38.1, 128.5, 38.2}, CourseQueries.parseBbox("128.4, 38.1,128.5,38.2"), 1e-12);
        String[] bad = {"1,2,3", "a,b,c,d", "128.5,38.1,128.4,38.2", "128.4,38.2,128.5,38.1", "-190,0,0,1", "0,0,1,95", "NaN,0,1,1"};
        for (String b : bad) {
            try {
                CourseQueries.parseBbox(b);
                fail("받으면 안 됩니다: " + b);
            } catch (IllegalArgumentException e) {
                // 기대한 대로
            }
        }
    }

    /** MariaDB 는 SRID 4326 에서도 (경도 위도) 순서 - 닫힌 사각형, 지수 표기 없음. */
    @Test
    public void bboxWkt() {
        assertEquals("POLYGON((128.4 38.1,128.5 38.1,128.5 38.2,128.4 38.2,128.4 38.1))",
                CourseQueries.bboxWkt(new double[] {128.4, 38.1, 128.5, 38.2}));
        assertFalse(CourseQueries.bboxWkt(new double[] {0.00001, 0, 1, 1}).contains("E"));
    }

    @Test
    public void mapConfigDefaults() {
        JsonObject j = MapConfigServlet.body(null, null);
        assertTrue(j.get("vworldKey").isJsonNull());
        assertEquals(MapConfigServlet.DEFAULT_DEM_URL, j.get("demUrl").getAsString());
        JsonObject k = MapConfigServlet.body("KEY", "https://x/{z}/{x}/{y}.png");
        assertEquals("KEY", k.get("vworldKey").getAsString());
        assertEquals("https://x/{z}/{x}/{y}.png", k.get("demUrl").getAsString());
    }

    @Test
    public void jsonValues() {
        assertTrue(Json.value(null).isJsonNull());
        assertEquals("38.171600", Json.value(new BigDecimal("38.171600")).getAsBigDecimal().toPlainString());
        assertEquals(5567, Json.value(5567).getAsInt());
        assertEquals("2026-10-04 20:47:19", Json.value(java.sql.Timestamp.valueOf("2026-10-04 20:47:19")).getAsString());
    }

    @Test
    public void nameSearch() {
        assertNull(CourseQueries.parseQuery(null));
        assertNull(CourseQueries.parseQuery("   "));
        assertEquals("설악산 공룡", CourseQueries.parseQuery("  설악산   공룡 "));
        assertEquals(CourseQueries.MAX_QUERY, CourseQueries.parseQuery("가".repeat(80)).length());
        assertEquals("%공룡%", CourseQueries.likePattern("공룡"));
        // % _ \ 는 글자 그대로 찾습니다(모든 코스가 걸리지 않게)
        assertEquals("%100\\%%", CourseQueries.likePattern("100%"));
        assertEquals("%a\\_b%", CourseQueries.likePattern("a_b"));
        assertEquals("%a\\\\b%", CourseQueries.likePattern("a\\b"));
    }
}
