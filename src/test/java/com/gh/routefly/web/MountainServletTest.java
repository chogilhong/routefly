package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.Arrays;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산 소개 페이지(/m/ - 2026-10-14) · 사이트맵. 코스는 테스트 데이터, 산은 웹 앱의 data/mountains100.json. */
public class MountainServletTest {

    private static JsonObject course(String id, String name, double sLat, double sLon, double eLat, double eLon) {
        JsonObject c = new JsonObject();
        c.addProperty("course_id", id);
        c.addProperty("name", name);
        c.addProperty("distance_m", 3980);
        c.addProperty("ascent_m", 779);
        c.addProperty("ele_max_m", 1430.4);
        c.addProperty("start_lat", sLat);
        c.addProperty("start_lon", sLon);
        c.addProperty("end_lat", eLat);
        c.addProperty("end_lon", eLon);
        return c;
    }

    @Test
    public void nearPicksCoursesToSummitOrAlt() {
        JsonObject gaya = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"summit\":\"칠불봉\",\"lat\":35.822544,\"lon\":128.122849,"
                + "\"alt\":[{\"name\":\"상왕봉(우두봉)\",\"lat\":35.823298,\"lon\":128.120373}]}").getAsJsonObject();
        JsonArray rows = new JsonArray();
        rows.add(course("far", "가야산 · 먼 곳", 35.70, 128.00, 35.71, 128.01));
        rows.add(course("knps-7013", "가야산 · 해인사 → 상왕봉(우두봉)", 35.80, 128.09, 35.8233, 128.1204));
        rows.add(course("x", "가야산 · 비법정 길", 35.80, 128.09, 35.8226, 128.1229));
        rows.add(course("near", "가야산 · 백운동 → 서성재", 35.83, 128.13, 35.8300, 128.1300));
        List<JsonObject> out = MountainServlet.near(rows, gaya, MountainServlet.NEAR_M);
        assertEquals(Arrays.asList("knps-7013", "near"), out.stream().map(c -> c.get("course_id").getAsString()).toList());
        String html = MountainServlet.page(gaya, out, "https://routefly.kr/routefly");
        assertTrue(html.contains("<title>가야산 등산코스 · 날씨 · 일출 일몰 - routefly</title>"));
        assertTrue(html.contains("rel=\"canonical\" href=\"https://routefly.kr/routefly/m/%EA%B0%80%EC%95%BC%EC%82%B0\""));
        assertTrue(html.contains("\"../index.html#c=knps-7013&amp;m=%EA%B0%80%EC%95%BC%EC%82%B0\">fly(3D)") && html.contains("\"../hike.html#c=knps-7013&amp;m=%EA%B0%80%EC%95%BC%EC%82%B0\">따라가기"));
        assertTrue("css · js 는 상대 주소(터널 https 에서 http 절대 주소가 막혔음)", html.contains("href=\"../css/mountain.css\"") && html.contains("src=\"../js/mountain.js\""));
        assertFalse(html.contains("src=\"https://routefly.kr"));
        assertTrue("홈 화면에 추가 - 앱 설치(manifest)", html.contains("<link rel=\"manifest\" href=\"../manifest.json\">"));
        assertTrue("예상 시간(4km/h + 600m/h)", html.contains("약 2시간 18분"));
        assertTrue("코스 최고점", html.contains("코스 최고점 약 1,430m"));
        assertTrue("날씨 칸 좌표", html.contains("data-lat=\"35.822544\""));
        assertFalse("스크립트는 파일로만(CSP)", html.matches("(?s).*<script>.*"));
    }

    @Test
    public void escapesAndFinds() {
        JsonArray peaks = JsonParser.parseString("[{\"id\":\"a<b\",\"name\":\"a<b\",\"lat\":37,\"lon\":127}]").getAsJsonArray();
        assertNotNull(MountainServlet.find(peaks, "a<b"));
        assertNull(MountainServlet.find(peaks, "없는산"));
        assertTrue(MountainServlet.indexPage(peaks, "").contains(">a&lt;b</a>"));
        assertTrue(MountainServlet.notFoundPage("<x>", "").contains("&lt;x&gt;"));
        assertEquals("45분", MountainServlet.hours(3000, null));
    }

    @Test
    public void sitemapAndRobots() {
        String sm = SitemapServlet.sitemap("https://routefly.kr/routefly", List.of("가야산"));
        assertTrue(sm.contains("<loc>https://routefly.kr/routefly/m/%EA%B0%80%EC%95%BC%EC%82%B0</loc>"));
        assertTrue(sm.contains("<loc>https://routefly.kr/routefly/hike.html</loc>"));
        String r = SitemapServlet.robots("https://routefly.kr/routefly");
        assertTrue(r.contains("Disallow: /routefly/api/") && r.contains("Sitemap: https://routefly.kr/routefly/sitemap.xml"));
    }

    @Test
    public void hiddenCoursesDropped() {
        JsonObject parks = JsonParser.parseString("{\"가야산\":{\"hide\":[\"knps-7014\"]}}").getAsJsonObject();
        List<JsonObject> cs = new java.util.ArrayList<>(List.of(course("knps-7014-abc", "가야산 · 3코스", 0, 0, 0, 0), course("knps-7013", "가야산 · 해인사 → 상왕봉", 0, 0, 0, 0)));
        MountainServlet.names(cs, parks);
        assertEquals(1, cs.size());
        assertEquals("knps-7013", cs.get(0).get("course_id").getAsString());
        assertFalse(MountainServlet.hidden(parks, "knps-70145"));
    }

    @Test
    public void sameNamesByRegion() {
        JsonArray peaks = JsonParser.parseString("[{\"id\":\"백운산(광양)\",\"name\":\"백운산\",\"lat\":35.1,\"lon\":127.6},"
                + "{\"id\":\"백운산(포천)\",\"name\":\"백운산\",\"lat\":38.07,\"lon\":127.44},{\"id\":\"가리산\",\"name\":\"가리산\",\"lat\":37.87,\"lon\":127.95}]").getAsJsonArray();
        assertNull("이름이 여럿이면 고르게", MountainServlet.find(peaks, "백운산"));
        assertEquals("백운산(포천)", MountainServlet.find(peaks, "백운산(포천)").get("id").getAsString());
        assertEquals("가리산", MountainServlet.find(peaks, "가리산").get("id").getAsString());
        String ch = MountainServlet.choosePage("백운산", MountainServlet.byName(peaks, "백운산"), "");
        assertTrue(ch.contains(">백운산(광양)</a>") && ch.contains(">백운산(포천)</a>"));
        assertTrue(MountainServlet.indexPage(peaks, "").contains(">백운산(광양)</a>"));
        assertTrue(MountainServlet.page(peaks.get(1).getAsJsonObject(), List.of(), "").contains("<h1>백운산(포천) 등산코스</h1>"));
    }
}
