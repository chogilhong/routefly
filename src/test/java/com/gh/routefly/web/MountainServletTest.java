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
        JsonArray peaks = JsonParser.parseString("[{\"id\":\"가야산\",\"lat\":35.822544,\"lon\":128.122849},{\"id\":\"비슬산\",\"lat\":35.69,\"lon\":128.52},"
                + "{\"id\":\"덕유산\",\"lat\":35.86,\"lon\":127.75},{\"id\":\"한라산\",\"lat\":33.36,\"lon\":126.53}]").getAsJsonArray();
        List<Object[]> nb = MountainServlet.nearby(peaks, gaya, 6, MountainServlet.NEARBY_M);
        assertEquals("자기 빼고 60km 안, 가까운 차례", Arrays.asList("덕유산", "비슬산"), nb.stream().map(o -> ((JsonObject) o[0]).get("id").getAsString()).toList());
        gaya.addProperty("elev", 1433);   // 공식 높이(height 는 GPS 라 화면에 안 씀 - 2026-10-15)
        String html = MountainServlet.page(gaya, out, nb, 7, "https://routefly.kr/routefly");
        assertTrue("가까운 산 링크", html.contains("<a href=\"../m/%EB%8D%95%EC%9C%A0%EC%82%B0\">덕유산 <small>34km</small></a>"));
        assertTrue("정상 높이", html.contains("정상 칠불봉 1,433m"));
        assertTrue("찜 단추용 코스 정보", html.contains("<li data-id=\"knps-7013\" data-name=\"가야산 · 해인사 → 상왕봉(우두봉)\" data-dist=\"3980\" data-asc=\"779\">"));
        assertTrue("구조 정보(JSON-LD)", html.contains("<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"Mountain\",\"name\":\"가야산\""));
        assertTrue(MountainServlet.jsonLd(JsonParser.parseString("{\"lat\":1,\"lon\":2}").getAsJsonObject(), "</script><x>", "u").contains("\\u003c/script\\u003e"));
        assertTrue(html.contains("<title>가야산 등산코스 · 날씨 · 일출 일몰 - routefly</title>"));
        assertTrue(html.contains("rel=\"canonical\" href=\"https://routefly.kr/routefly/m/%EA%B0%80%EC%95%BC%EC%82%B0\""));
        assertTrue(html.contains("\"../index.html#c=knps-7013&amp;m=%EA%B0%80%EC%95%BC%EC%82%B0\">fly(3D)") && html.contains("\"../hike.html#c=knps-7013&amp;m=%EA%B0%80%EC%95%BC%EC%82%B0\">따라가기"));
        assertTrue("css · js 는 상대 주소(터널 https 에서 http 절대 주소가 막혔음)", html.contains("href=\"../css/mountain.css\"") && html.contains("src=\"../js/mountain.js\""));
        assertFalse(html.contains("src=\"https://routefly.kr"));
        assertTrue("예상 시간(4km/h + 600m/h)", html.contains("약 2시간 18분"));
        assertTrue("코스 최고점", html.contains("코스 최고점 약 1,430m"));
        assertTrue("☆ 찜 설명", html.contains("☆ 를 누르면 그 코스를 찜(즐겨찾기)합니다"));
        assertTrue("문답 - 코스 수 · 짧은 코스", html.contains("<dt>가야산 등산코스는 몇 개인가요?</dt><dd>정상까지 가는 코스 2개를 소개합니다. 가장 짧은 코스는"));
        assertTrue("문답 - 주차장", html.contains("들머리 3km 안에 주차장 7곳이 있습니다"));
        assertTrue("문답 - 높이", html.contains("정상 칠불봉은 해발 약 1,433m 입니다"));
        assertTrue("문답 구조 정보", html.contains("\"@type\":\"FAQPage\"") && html.contains("\"acceptedAnswer\""));
        assertTrue("위 줄은 코스 모음으로(100대 명산 펼침)", html.contains("<p class=\"crumb\"><a href=\"../m/?open=peaks\">‹ 코스 모음</a></p>"));
        assertTrue("날씨 칸 좌표", html.contains("data-lat=\"35.822544\""));
        assertFalse("스크립트는 파일로만(CSP)", html.matches("(?s).*<script>.*"));
        assertTrue("산행 안전 팁(영어판과 짝 - 2026-10-18)", html.contains("<h2>⚠ 산행 안전 팁</h2>") && html.contains("다목적위치표지판(국가지점번호)") && html.contains("📨 가족에게 산행 계획 알리기"));
        assertTrue("목록에도 안전 팁", MountainServlet.indexPage(peaks, new JsonArray(), "", false).contains("<h2>⚠ 산행 안전 팁</h2>"));
        assertTrue("안부 링크는 한국어로(영어를 쓴 적 있어도 - 2026-10-18)", MountainServlet.indexPage(peaks, new JsonArray(), "", false).contains("/anbu.html?lang=ko\">🏠 오늘의 안부"));
        assertTrue("🧰 별거 별거 링크", MountainServlet.indexPage(peaks, new JsonArray(), "", false).contains("/tools.html?lang=ko\">🧰 별거 별거"));
        assertTrue("🚇 지하철 노선도 - 별거 별거 아래", MountainServlet.indexPage(peaks, new JsonArray(), "", false).matches("(?s).*🧰 별거 별거.*/subway.html\\?lang=ko\">🚇 지하철 노선도.*"));
    }

    @Test
    public void escapesAndFinds() {
        JsonArray peaks = JsonParser.parseString("[{\"id\":\"a<b\",\"name\":\"a<b\",\"lat\":37,\"lon\":127}]").getAsJsonArray();
        assertNotNull(MountainServlet.find(peaks, "a<b"));
        assertNull(MountainServlet.find(peaks, "없는산"));
        assertTrue("series.json 을 못 읽어도 100대 명산", MountainServlet.indexPage(peaks, new JsonArray(), "", false).contains(">a&lt;b</a>"));
        JsonArray gs = JsonParser.parseString("[{\"key\":\"peaks\",\"kind\":\"hike\",\"title\":\"100대 명산\",\"icon\":\"⛰️\",\"series\":[{\"summits\":\"x\"}]},"
                + "{\"key\":\"forest\",\"kind\":\"walk\",\"title\":\"국가숲길\",\"icon\":\"🌲\",\"series\":[{\"name\":\"지리산둘레길\",\"prefix\":\"kmf-9900000006-\",\"km\":289}]},"
                + "{\"key\":\"korea\",\"kind\":\"walk\",\"title\":\"코리아둘레길\",\"icon\":\"🥾\",\"series\":[{\"name\":\"DMZ 평화의 길\",\"match\":\"DMZ평화의길\"}]},"
                + "{\"key\":\"bike\",\"kind\":\"bike\",\"title\":\"국토종주 자전거길\",\"icon\":\"🚴\",\"series\":[{\"name\":\"아라 자전거길\",\"prefix\":\"osmb-4145848-\",\"km\":21}]}]").getAsJsonArray();
        String idx = MountainServlet.indexPage(peaks, gs, "", false);
        assertFalse("처음엔 모두 접힘", idx.contains(" open>"));
        String opened = MountainServlet.indexPage(peaks, gs, "", true);
        assertTrue("산 페이지에서 돌아오면 등산 › 100대 명산 펼침", opened.contains("<details class=\"fold kind\" name=\"kind\" open><summary><span class=\"ft\">⛰️ 등산")
                && opened.contains("<details class=\"fold group\" name=\"group\" open><summary><span class=\"ft\">⛰️ 100대 명산") && !opened.contains("name=\"kind\" open><summary><span class=\"ft\">🥾"));
        assertTrue("100대 명산은 산 페이지로", idx.contains(">a&lt;b</a>"));
        assertTrue("등산 · 걷기 · 자전거 접는 칸", idx.contains("<span class=\"ft\">⛰️ 등산</span><span class=\"fs\">100대 명산</span>")
                && idx.contains("<span class=\"ft\">🥾 걷기</span><span class=\"fs\">국가숲길 · 코리아둘레길</span>") && idx.contains("<span class=\"ft\">🚴 자전거</span>"));
        assertTrue("길은 노선 안내도로(돌아오기 back=m)", idx.contains("href=\"../route.html?prefix=kmf-9900000006-&amp;name=%EC%A7%80%EB%A6%AC%EC%82%B0%EB%91%98%EB%A0%88%EA%B8%B8&amp;back=m\">지리산둘레길 <small>289km</small>"));
        assertTrue("코리아둘레길은 trail=(match)", idx.contains("route.html?trail=DMZ%ED%8F%89%ED%99%94%EC%9D%98%EA%B8%B8&amp;"));
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
        assertTrue(MountainServlet.indexPage(peaks, JsonParser.parseString("[{\"kind\":\"hike\",\"title\":\"100대 명산\",\"icon\":\"⛰️\",\"series\":[{\"summits\":\"x\"}]}]").getAsJsonArray(), "", false)
                .contains(">백운산(광양)</a>"));
        assertTrue(MountainServlet.page(peaks.get(1).getAsJsonObject(), List.of(), List.of(), null, "").contains("<h1>백운산(포천) 등산코스</h1>"));
    }
}
