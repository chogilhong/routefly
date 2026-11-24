package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDate;

import org.junit.Test;

/** 광고 카드 누름 수 - 자리별(2026-11-24 홍TV님 "광고 자리별 누름 수를 /stats 에") - 사람 확인된 방문자만(같은 날 "사람 확인만 통계에 잡히게"). */
public class AdClickTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 자리_이름() {
        assertEquals("코스 모음", Stats.adArea("https://routefly.kr/routefly/m/"));
        assertEquals("산 페이지", Stats.adArea("https://routefly.kr/routefly/m/%EC%A7%80%EB%A6%AC%EC%82%B0?x=1#trails"));
        assertEquals("코스 모음(영어)", Stats.adArea("https://routefly.kr/routefly/en/m/"));
        assertEquals("산 페이지(영어)", Stats.adArea("https://routefly.kr/routefly/en/m/jirisan"));
        assertEquals("코스 페이지", Stats.adArea("https://routefly.kr/routefly/c/knps-1"));
        assertEquals("따라가기 목록", Stats.adArea("https://routefly.kr/routefly/hike.html?q=x"));
        assertEquals("기록 보기 카드", Stats.adArea("http://localhost/routefly/trip.html?c=u-1"));
        assertEquals("산악회 안내", Stats.adArea("https://routefly.kr/routefly/party-guide-en.html"));
        assertNull("자리가 없는 화면 · 없음", Stats.adArea("https://routefly.kr/routefly/studio.html"));
        assertNull(Stats.adArea(null));
    }

    @Test
    public void 한_사람_한_자리_하루_한_번() throws Exception {
        String ip = "203.0.113.77", day = LocalDate.now(WeatherServlet.KST).toString();
        assertFalse("방문으로 안 센 곳(그 날 화면을 안 연 주소)은 안 셈", Stats.adClick("203.0.113.78", "산 페이지"));
        Stats.hit("/m/지리산", null, ip, null, null, null, "PC", null);
        assertFalse("방문자여도 사람 확인(화면 js)이 안 됐으면 안 셈(2026-11-24 홍TV님)", Stats.adClick(ip, "산 페이지"));
        Stats.js(ip, "PC", false);   // 화면 js 가 돎(/api/seen)
        int before = count(day, "산 페이지");
        assertTrue(Stats.adClick(ip, "산 페이지"));
        assertFalse("같은 자리 또 누름", Stats.adClick(ip, "산 페이지"));
        assertTrue("다른 자리는 따로", Stats.adClick(ip, "코스 모음"));
        assertFalse("자리 이름이 없으면 안 셈", Stats.adClick(ip, null));
        assertEquals(before + 1, count(day, "산 페이지"));
        // 화면 · 통계 이음
        String ads = read("src/main/webapp/js/ads.js");
        assertTrue(ads.contains("navigator.sendBeacon(root + \"api/adclick\")"));
        assertTrue(read("src/main/java/com/gh/routefly/web/AdClickServlet.java").contains("Stats.adClick(ip, Stats.adArea(req.getHeader(\"Referer\")));"));
        assertTrue(StatsServlet.page(Stats.days(), 7, null).contains("광고 카드 누름 - 자리별"));
        for (String p : new String[] {"privacy.html", "privacy-en.html"}) assertTrue(p, read("src/main/webapp/" + p).contains("2026-11-24 - "));
    }

    private static int count(String day, String area) {
        var d = Stats.days().get(day);
        return d != null && d.has("adClicks") && d.getAsJsonObject("adClicks").has(area) ? d.getAsJsonObject("adClicks").get(area).getAsInt() : 0;
    }
}
