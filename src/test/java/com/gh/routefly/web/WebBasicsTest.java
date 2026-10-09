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

    @Test
    public void trailsThinWkt() {
        assertEquals("[[128.1,38.1],[128.12346,38.3],[128.5,38.5]]",
                TrailsServlet.thinWkt("LINESTRING(128.1 38.1,128.2 38.2,128.123456 38.3,128.4 38.4,128.5 38.5)", 2).toString());
        assertEquals("[]", TrailsServlet.thinWkt(null, 3).toString());
    }

    @Test
    public void sharePageEscapesAndRedirects() {
        String html = ShareServlet.page("설악 <b>\"", "d", "https://x/s/a", "https://x/img/og.png", "https://x/#c=a");
        assertTrue(html, html.contains("og:title\" content=\"설악 &lt;b&gt;&quot;\""));
        assertTrue(html, html.contains("location.replace(\"https://x/#c=a\")"));
        assertFalse(html.contains("<b>"));
        assertEquals("5.81km · 오르막 1,460m · 최고 1,700m · 3D 로 미리 날아 보고 핸드폰으로 따라 걷기",
                ShareServlet.describe(5810, 1460, 1700.4));
    }

    @Test
    public void listOrderAndGridSql() {
        // 2026-10-09 홍TV님 - 전국을 볼 때 이름 순 앞 300개만 와서 코스가 엉뚱한 곳에만 보이던 것
        double[] korea = {124.5, 33.0, 131.0, 38.6};
        CourseQueries.Sql view = CourseQueries.listSql(korea, null, null);
        assertTrue(view.sql(), view.sql().contains("ORDER BY POW(start_lat - ?, 2) + POW((start_lon - ?) * ?, 2), name"));
        assertEquals("? 개수와 값 개수", count(view.sql()), view.params().length);
        assertEquals(35.8, (double) view.params()[1], 1e-9);   // 가운데 위도(0 은 bbox WKT)
        assertEquals(127.75, (double) view.params()[2], 1e-9);
        CourseQueries.Sql search = CourseQueries.listSql(korea, "hike", "지리산");
        assertTrue("검색이면 이름 순 그대로", search.sql().contains("ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name"));
        assertEquals(count(search.sql()), search.params().length);
        assertTrue(CourseQueries.listSql(null, null, null).sql().endsWith("ORDER BY name LIMIT " + (CourseQueries.LIST_LIMIT + 1)));

        CourseQueries.Sql g = CourseQueries.gridSql(korea, "walk");
        assertTrue(g.sql(), g.sql().contains("GROUP BY FLOOR(start_lon / ?), FLOOR(start_lat / ?)") && g.sql().contains("kind = ?"));
        assertEquals(count(g.sql()), g.params().length);
        assertEquals("walk", g.params()[1]);
        assertEquals(6.5 / CourseQueries.GRID_CELLS, (double) g.params()[2], 1e-9);
        assertEquals("아주 좁게 보면 0.01°", 0.01, CourseQueries.gridCellDeg(new double[] {127, 37, 127.01, 37.01}), 1e-12);
    }

    private static int count(String sql) {
        return (int) sql.chars().filter(ch -> ch == '?').count();
    }

    @Test
    public void groupPrefixFindsSameMountain() {
        // 배치를 다시 돌려 번호가 바뀐 예전 코스(천왕봉) → 같은 산 코스를 찾을 앞부분
        assertEquals("frst-488605302-", CourseQueries.groupPrefix("frst-488605302-24c8b1"));
        assertEquals("osmb-123456-", CourseQueries.groupPrefix("osmb-123456-2"));
        assertEquals("osmh-77-", CourseQueries.groupPrefix("osmh-77-3"));
        assertEquals("kmp-1111020009-", CourseQueries.groupPrefix("kmp-1111020009-4"));
        assertEquals("kmf-9900000003-", CourseQueries.groupPrefix("kmf-9900000003-2"));
        assertNull(CourseQueries.groupPrefix("duru-1234"));
        assertNull(CourseQueries.groupPrefix("my-course"));
        assertNull(CourseQueries.groupPrefix(null));
    }
}
