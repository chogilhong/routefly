package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 점검 8차(2026-11-03 홍TV님) - 예상 시간에 하산(내리막) 시간 · 주머니 모드 · 화면 고침. 화면 js 조각은 review8.test.js.
 */
public class ReviewRound8Test {

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/review8.test.js");
    }

    /** 산 페이지 문답: 편도에 내리막도 넣고, 같은 길로 내려오는 왕복 시간을 함께("내려오는 시간은 따로 더하세요" 대신). */
    @Test
    public void mountainTimesIncludeDescent() {
        JsonObject peak = JsonParser.parseString("{\"id\":\"가산\",\"name\":\"가산\",\"lat\":37.5,\"lon\":127.0}").getAsJsonObject();
        List<JsonObject> cs = new ArrayList<>();
        cs.add(JsonParser.parseString("{\"course_id\":\"a\",\"name\":\"가산 · 들머리 → 정상\",\"distance_m\":4000,\"ascent_m\":600,\"descent_m\":60}").getAsJsonObject());
        String qa = MountainServlet.faq(peak, "가산", cs, null).get(1)[1];
        // 편도: 1시간 + 1시간 + 2분, 왕복: 8km 2시간 + 오르막 660m 1시간 6분 + 내리막 660m 22분
        assertEquals("정상까지 편도 약 2시간 2분, 같은 길로 내려오면 왕복 약 3시간 28분입니다(시속 4km · 오르막 600m 에 1시간 · 내리막 300m 에 10분으로 어림).", qa);
        assertFalse(qa.contains("따로 더하세요"));
        String en = MountainEn.faq(peak, "Gasan", cs, null).get(1)[1];
        assertTrue(en, en.contains("About 2 h 2 min one way to the summit, or about 3 h 28 min there and back") && en.contains("10 min per 300 m down"));
        assertEquals("코스 페이지도 같은 기준", "약 2시간 2분(시속 4km · 오르막 600m 에 1시간 · 내리막 300m 에 10분 어림)", CoursePageServlet.timeText("hike", 4000, 600, 60));
        String page = MountainServlet.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue("코스 줄에 data-desc(화면 js 의 거르기 · 일출 출발이 내리막도)", page.contains("data-asc=\"600\" data-desc=\"60\""));
        assertTrue(page.contains(" · 약 2시간 2분"));
    }

    static String web(String f) throws Exception {
        return Files.readString(Path.of("src/main/webapp", f));
    }

    /** 순수 함수 - WCAG 대비(#rrggbb 둘). */
    static double contrast(String a, String b) {
        double la = lum(a), lb = lum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    private static double lum(String h) {
        double[] c = new double[3];
        for (int i = 0; i < 3; i++) {
            double v = Integer.parseInt(h.substring(1 + i * 2, 3 + i * 2), 16) / 255.0;
            c[i] = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    /** 1: 안부 화면 119 · 보호자 전화 단추 흰 글 대비 4.5:1 이상(전에는 2.78 · 4.2). */
    @Test
    public void anbuButtonContrast() throws Exception {
        String h = web("anbu.html");
        java.util.regex.Matcher sos = java.util.regex.Pattern.compile("\\.row2 \\.sos \\{ background:(#[0-9a-f]{6});[^}]*color:#fff;").matcher(h);
        java.util.regex.Matcher help = java.util.regex.Pattern.compile("\\.row2 #helpCall \\{ background:(#[0-9a-f]{6});[^}]*color:#fff;").matcher(h);
        assertTrue(sos.find() && help.find());
        assertTrue("119 " + sos.group(1), contrast(sos.group(1), "#ffffff") >= 4.5);
        assertTrue("보호자 전화 " + help.group(1), contrast(help.group(1), "#ffffff") >= 4.5);
        assertEquals(2.78, contrast("#ff6b6b", "#ffffff"), 0.01);
    }

    /** 4: 영어 산 페이지도 "코스 바로 보기" 가 날씨 칸 위 · 한/EN · 가 자리를 미리(CLS) · 제목 낱말 안 끊음. */
    @Test
    public void mountainEnJumpAndCrumb() throws Exception {
        JsonObject peak = JsonParser.parseString("{\"id\":\"가산\",\"name\":\"가산\",\"lat\":37.5,\"lon\":127.0}").getAsJsonObject();
        List<JsonObject> cs = new ArrayList<>();
        cs.add(JsonParser.parseString("{\"course_id\":\"a\",\"name\":\"가산 · 들머리 → 정상\",\"distance_m\":4000,\"ascent_m\":600}").getAsJsonObject());
        String en = MountainEn.page(peak, cs, new ArrayList<>(), null, ""), ko = MountainServlet.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue(en.indexOf("<p class=\"jump\">") > 0 && en.indexOf("<p class=\"jump\">") < en.indexOf("<section id=\"wx\""));
        assertEquals("한 번만", en.indexOf("<p class=\"jump\">"), en.lastIndexOf("<p class=\"jump\">"));
        assertTrue(ko.indexOf("<p class=\"jump\">") < ko.indexOf("<section id=\"wx\""));
        String css = web("css/mountain.css");
        assertTrue(css.contains(".crumb { margin:0 0 6px; font-size:13.5px; min-height:44px; }") && css.contains("h1 { font-size:24px; margin:0 0 4px; word-break:keep-all; }"));
    }

    /** 5: 코스 페이지 난이도 - 공단 공식 난이도가 있으면 그것 하나(전에는 routefly "매우 쉬움" 과 공단 "보통" 이 함께). */
    @Test
    public void officialLevelWins() {
        assertEquals(2, MountainServlet.officialLevel("보통(2.57)"));
        assertEquals(-1, MountainServlet.officialLevel("상"));
        JsonObject c = JsonParser.parseString("{\"course_id\":\"knps-1\",\"name\":\"가산 · 가 → 나\",\"kind\":\"hike\",\"distance_m\":1000,\"ascent_m\":20,\"descent_m\":5,"
                + "\"start_lat\":37.5,\"start_lon\":127.0,\"end_lat\":37.51,\"end_lon\":127.0}").getAsJsonObject();
        JsonObject info = JsonParser.parseString("{\"up_min\":30,\"level\":\"보통(2.57)\"}").getAsJsonObject();
        String with = CoursePageServlet.page(c, null, info, null, null, new com.google.gson.JsonArray(), false, "");
        assertTrue(with, with.contains("<dt>난이도</dt><dd><i class=\"lv lv2\" title=\"국립공원공단 공식 난이도\">공단 보통(2.57)</i>"));
        assertFalse("routefly 어림은 빼고", with.contains("매우 쉬움"));
        String without = CoursePageServlet.page(c, null, null, null, null, new com.google.gson.JsonArray(), false, "");
        assertTrue(without.contains("<dt>난이도</dt><dd><i class=\"lv lv0\">매우 쉬움</i>"));
    }
}
