package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 코스 소개 페이지(/c/ - 2026-10-19 CoursePageServlet) · 사이트맵의 코스 · 공유 링크 canonical. 산은 웹 앱의 data/mountains100.json, 코스는 테스트 데이터. */
public class CoursePageTest {

    private static JsonArray peaks() throws Exception {
        try (Reader r = Files.newBufferedReader(Paths.get("src/main/webapp/data/mountains100.json"), StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(r).getAsJsonObject().getAsJsonArray("peaks");
        }
    }

    private static JsonObject course(String id, String name, String kind, double sLat, double sLon, double eLat, double eLon) {
        JsonObject c = new JsonObject();
        c.addProperty("course_id", id);
        c.addProperty("name", name);
        c.addProperty("kind", kind);
        c.addProperty("distance_m", 3980);
        c.addProperty("ascent_m", 779);
        c.addProperty("descent_m", 12);
        c.addProperty("ele_min_m", 200.4);
        c.addProperty("ele_max_m", 836.0);
        c.addProperty("start_lat", sLat);
        c.addProperty("start_lon", sLon);
        c.addProperty("end_lat", eLat);
        c.addProperty("end_lon", eLon);
        return c;
    }

    /** 북한산 정상(mountains100.json 37.658722, 126.978088) 가까이에서 끝나는 코스. */
    private static JsonObject bukhan(String id, String kind) {
        return course(id, "북한산 · 우이동 → 백운대", kind, 37.6600, 127.0100, 37.6585, 126.9780);
    }

    @Test
    public void peakOfFindsMountainNearStartOrEnd() throws Exception {
        JsonObject p = CoursePageServlet.peakOf(peaks(), bukhan("frst-1-a", "hike"));
        assertNotNull(p);
        assertEquals("북한산", p.get("id").getAsString());
        assertNull("2km 밖이면 없음", CoursePageServlet.peakOf(peaks(), course("x", "x", "hike", 37.40, 127.30, 37.41, 127.31)));
    }

    @Test
    public void indexableOnlyOfficialOrPeakHikes() throws Exception {
        JsonObject parks = JsonParser.parseString("{\"북한산\":{\"hide\":[\"knps-9\"]}}").getAsJsonObject();
        JsonObject peak = CoursePageServlet.peakOf(peaks(), bukhan("frst-1-a", "hike"));
        assertTrue("공식 코스", CoursePageServlet.indexable("drnb-12", "해파랑길 1코스", "walk", null, parks));
        assertTrue(CoursePageServlet.indexable("kmp-3-1", "봉우리 코스", "hike", null, parks));
        assertTrue("100대 명산에 닿는 등산", CoursePageServlet.indexable("frst-1-a", "북한산 · 우이동 → 백운대", "hike", peak, parks));
        assertFalse("산에 안 닿는 자동 생성 코스", CoursePageServlet.indexable("frst-1-b", "어느 산 · 마을 → 봉우리", "hike", null, parks));
        assertFalse("자전거 조각", CoursePageServlet.indexable("osmb-5-1", "국토종주 1", "bike", peak, parks));
        assertFalse("비법정", CoursePageServlet.indexable("frst-1-c", "북한산 · 비법정 길", "hike", peak, parks));
        assertFalse("지금은 없는 탐방로(park-notes hide)", CoursePageServlet.indexable("knps-9-1", "북한산 · 옛길", "hike", peak, parks));
    }

    @Test
    public void profileSvgThinsAndLabels() {
        int n = 1000;
        double[] d = new double[n];
        Double[] e = new Double[n];
        for (int i = 0; i < n; i++) {
            d[i] = i * 4;
            e[i] = i == 500 ? null : 200.0 + i * 0.6;
        }
        String svg = CoursePageServlet.profileSvg(d, e);
        assertTrue(svg.startsWith("<svg class=\"prof\""));
        int pts = svg.substring(svg.indexOf("<polyline points=\"") + 18).split("\"")[0].split(" ").length;
        assertTrue("점은 240개 남짓으로 솎음: " + pts, pts <= CoursePageServlet.PROFILE_MAX + 1 && pts > 100);
        assertTrue("최고 · 최저 · 거리는 그림 밖 한 줄(그림 안 글자는 검색 본문에 붙어 읽힘)", svg.endsWith("</svg><p class=\"dim profCap\">출발 0km → 도착 4.0km · 높이 200m ~ 799m</p>"));
        assertFalse(svg.contains("<text"));
        assertEquals("높이가 없으면 그림 없음", "", CoursePageServlet.profileSvg(new double[] {0, 10}, new Double[] {null, null}));
    }

    @Test
    public void passesKeepsOnRouteNamesOnce() {
        JsonArray pois = JsonParser.parseString("[{\"name\":\"우이동\",\"ele_m\":120.5,\"dist_m\":0,\"off_route_m\":10},"
                + "{\"name\":\"우이동\",\"ele_m\":121,\"dist_m\":50,\"off_route_m\":5},{\"name\":\"먼 곳\",\"ele_m\":null,\"dist_m\":900,\"off_route_m\":400},"
                + "{\"name\":\"백운대\",\"ele_m\":null,\"dist_m\":3980,\"off_route_m\":3}]").getAsJsonArray();
        List<Object[]> out = CoursePageServlet.passes(pois, new double[] {0, 2000, 3980}, new Double[] {120.0, 500.0, 712.0});
        assertEquals(2, out.size());
        assertEquals("우이동", out.get(0)[0]);
        assertEquals("백운대", out.get(1)[0]);
        assertEquals("높이는 코스선 높이(이름표 높이 아님)", 712.0, (Double) out.get(1)[2], 0.01);
        assertEquals(120.0, CoursePageServlet.eleAt(new double[] {0, 2000}, new Double[] {120.0, 500.0}, 900), 0.01);
        assertEquals(500.0, CoursePageServlet.eleAt(new double[] {0, 2000}, new Double[] {120.0, 500.0}, 1100), 0.01);
    }

    @Test
    public void pageHasSummaryLinksSourceAndRobots() throws Exception {
        JsonObject c = bukhan("knps-77", "hike");
        c.addProperty("imported_at", "2026-10-11 05:12:00");
        JsonObject peak = CoursePageServlet.peakOf(peaks(), c);
        JsonObject info = JsonParser.parseString("{\"up_min\":120,\"down_min\":90,\"level\":\"어려움\",\"notice\":null}").getAsJsonObject();
        JsonArray pois = JsonParser.parseString("[{\"name\":\"<b>백운대\",\"ele_m\":836,\"dist_m\":3980,\"off_route_m\":3},"
                + "{\"name\":\"만경대\",\"ele_m\":801,\"dist_m\":1800,\"off_route_m\":120}]").getAsJsonArray();
        String html = CoursePageServlet.page(c, peak, info, new double[] {0, 2000, 3980}, new Double[] {200.0, 500.0, 836.0}, pois, true, "https://routefly.kr/routefly");
        assertTrue(html.contains("<title>북한산 · 우이동 → 백운대 등산 코스 - routefly</title>"));
        assertTrue(html.contains("rel=\"canonical\" href=\"https://routefly.kr/routefly/c/knps-77\""));
        assertFalse("검색에 냄", html.contains("noindex"));
        assertTrue("산 페이지로 돌아가기", html.contains("<a href=\"../m/%EB%B6%81%ED%95%9C%EC%82%B0\">‹ 북한산</a>"));
        assertTrue("예상 시간", html.contains("약 2시간 18분"));
        assertTrue("오르막 · 내리막", html.contains("779m · 12m"));
        assertTrue("공식 안내", html.contains("오르는 시간 120분 · 내려오는 시간 90분") && html.contains("난이도 어려움"));
        assertTrue("3D · 따라가기", html.contains("\"../index.html?lang=ko#c=knps-77&amp;m=%EB%B6%81%ED%95%9C%EC%82%B0\"")
                && html.contains("\"../hike.html?lang=ko#c=knps-77&amp;m=%EB%B6%81%ED%95%9C%EC%82%B0\""));
        assertTrue("출발점 가는 길(정상에서 먼 쪽 = 시작)", html.contains("https://map.kakao.com/link/to/%EB%B6%81%ED%95%9C%EC%82%B0%20%EC%B6%9C%EB%B0%9C%EC%A0%90,37.660000,127.010000"));
        assertTrue("고도 그림", html.contains("<svg class=\"prof\""));
        assertTrue("자료 날짜", html.contains("코스 자료 날짜 <time datetime=\"2026-10-11\">2026-10-11</time>"));
        assertFalse("날짜가 없으면 줄 없음", CoursePageServlet.page(course("x-1", "x", "walk", 37.5, 127.0, 37.6, 127.1), null, null, null, null, new JsonArray(), false, "").contains("자료 날짜"));
        assertTrue("옆을 지나는 봉우리는 코스선 높이 + 떨어진 거리", html.contains("만경대</b> <span>1.8km · 해발 500m · 길에서 120m 옆</span>"));
        assertTrue("이름표는 이스케이프", html.contains("&lt;b&gt;백운대") && !html.contains("<b><b>"));
        assertTrue("출처", html.contains("국립공원공단 「국립공원 탐방로 공간데이터」"));
        assertTrue("안전 팁(등산)", html.contains("산행 안전 팁"));
        assertFalse("mountain.js 없음(산 페이지만)", html.contains("mountain.js"));
        assertEquals("스크립트는 사람 확인 신호 하나만(2026-10-22)", html.indexOf("<script"), html.lastIndexOf("<script"));
        assertTrue(html.contains("/js/seen.js\"></script>"));
        String no = CoursePageServlet.page(course("osmb-1-2", "국토종주 <x>", "bike", 37.5, 127.0, 37.6, 127.1), null, null, null, null, new JsonArray(), false, "https://r.kr");
        assertTrue(no.contains("<meta name=\"robots\" content=\"noindex, follow\">"));
        assertTrue("자전거 시간", no.contains("시속 15km"));
        assertTrue("OSM 출처", no.contains("© OpenStreetMap contributors</a>(ODbL)"));
        assertTrue(no.contains("국토종주 &lt;x&gt; 자전거 코스"));
        assertFalse("등산이 아니면 안전 팁 · 난이도 없음", no.contains("산행 안전 팁") || no.contains("<dt>난이도</dt>"));
    }

    @Test
    public void sitemapShareStatsAndMountainLinks() throws Exception {
        String sm = SitemapServlet.sitemap("https://r.kr", List.of(), List.of(new String[] {"knps-77", "2026-10-11"}, new String[] {"drnb-1", null}));
        assertTrue(sm.contains("<url><loc>https://r.kr/c/knps-77</loc><lastmod>2026-10-11</lastmod></url>"));
        assertTrue(sm.contains("<url><loc>https://r.kr/c/drnb-1</loc></url>"));
        assertTrue("공유 링크는 코스 페이지를 canonical 로",
                ShareServlet.page("t", "d", "https://r.kr/s/a", "https://r.kr/c/a", "https://r.kr/img/og.png", "https://r.kr/#c=a").contains("<link rel=\"canonical\" href=\"https://r.kr/c/a\">"));
        assertEquals("/c/", Stats.pageKey("/c/knps-77"));
        assertTrue("다음 웹마스터도구 확인 줄은 robots.txt 맨 아래", SitemapServlet.robots("https://r.kr/routefly")
                .endsWith("\n#DaumWebMasterTool:e657a6d3b5a3bc76c259c18ecd78af8ae7d569dcaca333f0644af9989bc4ec56:1T0ZRs6bn/unEVfM5aXupg==\n"));
        JsonObject gaya = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.822544,\"lon\":128.122849}").getAsJsonObject();
        String m = MountainServlet.page(gaya, List.of(course("knps-7013", "가야산 · 해인사 → 상왕봉", "hike", 35.80, 128.09, 35.8233, 128.1204)), List.of(), null, "https://r.kr");
        assertTrue("산 페이지 코스 이름 → 코스 페이지", m.contains("<b><a href=\"../c/knps-7013\">가야산 · 해인사 → 상왕봉</a> "));
        assertTrue("스크립트가 채울 칸은 '불러오는 중' 대신 무슨 칸인지(검색 본문)", m.contains("id=\"wxBody\">오늘부터 며칠 뒤까지의 날씨") && !m.contains("불러오는 중"));
        String en = MountainEn.page(gaya, List.of(), List.of(), null, "https://r.kr");
        assertTrue(en.contains("id=\"wxBody\">Weather, air quality") && !en.contains("Loading…"));
    }
}
