package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 2026-11-07 홍TV님 전체 점검 4단계(수익 · 검색). 코스는 운영 api/course 실제 응답(광양 가야산, 2026-11-07 받음). */
public class FullReviewStage4Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    private static JsonObject real() throws Exception {
        return JsonParser.parseString(read("src/test/resources/course/frst-462300101-744138.json")).getAsJsonObject();
    }

    @Test
    public void trailheadAccessFromRealPois() throws Exception {
        JsonArray pois = real().getAsJsonArray("pois");
        List<Object[]> acc = CoursePageServlet.access(pois);
        assertEquals("주차장 하나 먼저, 출발 쪽 정류장 둘(413m 지점 주차장 · 코스 선 37m 는 뺌)", 3, acc.size());
        assertArrayEquals(new Object[] {"공영주차장", 255, true}, acc.get(0));
        assertArrayEquals(new Object[] {"가야초교 정류장", 141, false}, acc.get(1));
        assertArrayEquals(new Object[] {"현대고층아파트 정류장", 278, false}, acc.get(2));
        // 적벽 쪽으로 내려오는 코스(같은 들머리) - 3,990m 지점의 정류장 둘은 내려오는 쪽이라 뺌
        JsonArray down = JsonParser.parseString(read("src/test/resources/course/frst-462300101-b7d6aa.json")).getAsJsonObject().getAsJsonArray("pois");
        assertEquals(3, CoursePageServlet.access(down).size());
    }

    @Test
    public void coursePageShowsAccessAndBreadcrumb() throws Exception {
        JsonObject j = real(), c = j.getAsJsonObject("course");
        String page = CoursePageServlet.page(c, null, null, null, null, j.getAsJsonArray("pois"), true, "https://routefly.kr/routefly", List.of());
        assertTrue(page.contains("<h2>들머리 가는 길</h2><ul class=\"tips\"><li>🅿️ <b>공영주차장</b> <span>출발점에서 약 255m</span></li><li>🚌 <b>가야초교 정류장</b>"));
        assertTrue("경로 표시", page.contains("\"@type\":\"BreadcrumbList\"") && page.contains("\"item\":\"https://routefly.kr/routefly/c/frst-462300101-744138\""));
        JsonObject peak = JsonParser.parseString("{\"id\":\"설악산\",\"name\":\"설악산\",\"lat\":38.1192,\"lon\":128.4655}").getAsJsonObject();
        String m = MountainServlet.jsonLd(peak, "설악산", "https://routefly.kr/routefly/m/%EC%84%A4%EC%95%85%EC%82%B0");
        assertTrue("산 페이지 경로 표시는 그대로", m.contains("\"@type\":\"Mountain\"") && m.contains("{\"@type\":\"ListItem\",\"position\":1,\"name\":\"100대 명산 코스\",\"item\":\"https://routefly.kr/routefly/m/\"}"));
    }

    @Test
    public void oneAdBeforeFaq() throws Exception {
        String ko = read("src/main/java/com/gh/routefly/web/MountainServlet.java"), en = read("src/main/java/com/gh/routefly/web/MountainEn.java");
        int a = ko.indexOf("        b.append(Ads.box(\"m\"));\n        List<String[]> qa = faq(");
        assertTrue("산 페이지 광고는 코스 목록 다음 · 자주 묻는 질문 바로 앞", a > ko.indexOf("id=\\\"socar\\\" hidden"));
        assertEquals("한 페이지(산 페이지 + 코스 모음) 두 곳 그대로 - 칸을 늘리지 않음", 2, ko.split("Ads.box\\(\"m\"\\)", -1).length - 1);
        assertTrue(en.contains("        b.append(Ads.box(\"m\", true));   // 광고 - 영어 산 페이지에도(설정이 있을 때만, 2026-10-29), 한국어처럼 FAQ 앞(2026-11-07)\n        List<String[]> qa = faq("));
        assertFalse("게임에는 광고 없음", read("src/main/webapp/games.html").contains("ads.js"));
    }

    @Test
    public void privacyCookiesConsistent() throws Exception {
        String ko = read("src/main/webapp/privacy.html"), en = read("src/main/webapp/privacy-en.html");
        assertFalse("6번과 10번이 엇갈리지 않게", ko.contains("손님에게는 쿠키를 만들지 않습니다.)") || en.contains("No cookies are created for visitors.)"));
        assertTrue(ko.contains("광고가 나오는 화면에서는 구글이 광고 쿠키를 둘 수 있습니다 - 아래 10번") && en.contains("Google may set ad cookies - see section 10"));
        assertTrue(ko.contains("https://policies.google.com/technologies/ads?hl=ko") && en.contains("https://policies.google.com/technologies/ads\""));
    }
}
