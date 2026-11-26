package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDate;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 사람 확인 순위(2026-11-26 홍TV님 "사람 확인(js 돈 사람)만으로 센 순위") - 화면 js 가 돈 사람만, 한 사람 · 한 화면 하루 한 번. */
public class JsRankTest {

    private static int n(JsonObject d, String kind, String key) {
        return d != null && d.has(kind) && d.getAsJsonObject(kind).has(key) ? d.getAsJsonObject(kind).get(key).getAsInt() : 0;
    }

    @Test
    public void 사람_확인된_사람이_본_화면만() throws Exception {
        String ip = "203.0.113.91", day = LocalDate.now(WeatherServlet.KST).toString();
        String mt = "https://routefly.kr/routefly/m/%EC%A7%80%EB%A6%AC%EC%82%B0?x=1", course = "https://routefly.kr/routefly/c/knps-9001";
        Stats.hit("/m/지리산", null, ip, null, null, null, "PC", null);
        Stats.hit("/c/", "knps-9001", ip, null, null, null, "PC", null);
        assertFalse("사람 확인(js) 전에는 안 셈", Stats.jsPage(ip, "/routefly", mt));
        Stats.js(ip, "PC", false);
        JsonObject d0 = Stats.days().get(day);
        int m0 = n(d0, "jsPages", "/m/지리산"), c0 = n(d0, "jsCourses", "knps-9001");
        assertTrue(Stats.jsPage(ip, "/routefly", mt));
        assertFalse("같은 사람 · 같은 화면 또", Stats.jsPage(ip, "/routefly", mt));
        assertTrue("코스 페이지", Stats.jsPage(ip, "/routefly", course));
        assertFalse("그 날 열리지 않은 화면은 안 셈(아무 주소나 보내 칸을 늘리지 못하게)", Stats.jsPage(ip, "/routefly", "https://routefly.kr/routefly/m/없는산"));
        assertFalse("다른 사람(방문 · js 없음)", Stats.jsPage("203.0.113.92", "/routefly", mt));
        JsonObject d = Stats.days().get(day);
        assertEquals(m0 + 1, n(d, "jsPages", "/m/지리산"));
        assertEquals(c0 + 1, n(d, "jsCourses", "knps-9001"));

        String pg = StatsServlet.page(Stats.days(), 7, null);
        assertTrue(pg.contains("사람 확인 인기 산 페이지(") && pg.contains("일 - 11-26 부터, 화면 js 가 돈 사람 수") && pg.contains("사람 확인 인기 코스 상위 20(") && pg.contains("사람 확인 화면별("));
        assertTrue("지금 순위 표는 그대로", pg.indexOf("사람 확인 인기 산 페이지(") > pg.indexOf("화면별(") && pg.contains("코스 소개 페이지, 10-21 부터 셈)"));

        String sv = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/SeenServlet.java")), StandardCharsets.UTF_8);
        assertTrue(sv.contains("Stats.jsPage(ip, req.getContextPath(), req.getHeader(\"Referer\"));"));
    }
}
