package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 오늘 접속 분석(2026-10-29 홍TV님 - 통계 화면 "사람 확인" 아래, 5분마다 새로) - 종류 나눔 · 수집기 의심 · 공격 경로 · 주소는 해시만. */
public class AccessTest {

    static final String MAC124 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    static final String NEW = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

    @Test
    public void kinds() {
        assertEquals("사람", Access.kind(NEW, "ko-KR", false));
        assertEquals("운영자", Access.kind(NEW, "ko-KR", true));
        assertEquals("오래된 크롬", Access.kind(MAC124, "ko-KR", false));
        assertEquals("숨은 로봇", Access.kind(NEW, null, false));
        assertEquals("검색 로봇", Access.kind("Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/)", null, false));
        assertEquals("AI 수집", Access.kind("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "en", false));
        assertEquals("Headless", Access.kind("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36", "en", false));
        assertEquals("프로그램", Access.kind("curl/8.5.0", null, false));
        assertEquals("미리보기", Access.kind("facebookexternalhit/1.1", null, false));
        assertTrue(Access.attack("/wp-login.php") && Access.attack("/.env") && !Access.attack("/img/og.png"));
    }

    @Test
    public void sectionShowsSuspectsAndHidesAddresses() {
        Access.reset();
        long t = System.currentTimeMillis();
        for (int i = 0; i < 6; i++) Access.page("/c/", "203.0.113." + i, MAC124, "ko-KR", false, t);   // 주소를 돌리며 js 없이 - 수집기 의심
        Access.page("/m/설악산", "198.51.100.7", NEW, "ko-KR", false, t);
        Access.js("198.51.100.7", t);
        Access.status("/wp-login.php", 404, t);
        Access.status("/img/og.png", 404, t);
        Access.status("/hike.html", 200, t);
        String h = Access.section(t);
        assertTrue(h.contains("오늘 접속 분석") && h.contains("화면 7"));
        assertTrue("수집기 의심 - 브라우저 글별 묶음(6화면 · 6곳)", h.contains(ShareServlet.esc(MAC124) + "</td><td class=\"num\">6</td><td class=\"num\">6</td>"));
        assertTrue("경로 묶음", h.contains("/c/ 6") && h.contains("/m/ 1"));
        assertTrue("공격 경로", h.contains("⚠ 공격 시도로 보이는 경로: /wp-login.php 1"));
        assertFalse("주소는 내보내지 않음", h.contains("203.0.113") || h.contains("198.51.100"));
        assertTrue("js 가 돈 곳은 ✔", h.contains("✔"));
        Access.reset();
    }

    @Test
    public void statsPagePutsItUnderHumanCheckAndRefreshes() throws Exception {
        String page = StatsServlet.page(new java.util.TreeMap<>(), 30, java.util.Map.of());
        int check = page.indexOf("사람 확인"), access = page.indexOf("오늘 접속 분석"), daily = page.indexOf("<h2>날마다");
        assertTrue("사람 확인 아래 · 날마다 위", check > 0 && access > check && daily > access);
        String js = java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/js/stats.js"));
        assertTrue("5분마다 새로", js.contains("EVERY = 5 * 60000") && js.contains("location.reload()"));
    }
}
