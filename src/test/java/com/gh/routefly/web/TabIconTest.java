package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.util.List;
import java.util.TreeMap;

import org.junit.Test;

/** 서버가 만드는 화면마다 탭 아이콘(favicon.svg)이 있어야 함 - 2026-10-20 홍TV님: /stats · /check/heights 탭이 기본 지구본이었음. */
public class TabIconTest {

    static void hasIcon(String html, String href) {
        assertTrue(html, html.contains("<link rel=\"icon\" type=\"image/svg+xml\" href=\"" + href + "\""));
        assertTrue(html, html.contains("apple-touch-icon"));
    }

    @Test
    public void statsPage() {
        hasIcon(StatsServlet.page(new TreeMap<>(), 30, null), "./favicon.svg?v=2");   // /stats
    }

    @Test
    public void heightCheckPage() {
        hasIcon(HeightCheckServlet.page(List.of()), "../favicon.svg?v=2");   // /check/heights
    }

    @Test
    public void sharePage() {
        hasIcon(ShareServlet.page("t", "d", "https://x/s/1", "https://x/c/1", "https://x/img/og.png", "https://x/hike.html"), "../favicon.svg?v=2");   // /s/<id>
    }

    @Test
    public void mountainAndCoursePages() {
        hasIcon(MountainServlet.head("t", "d", "https://x/m/a", "https://x", null, null, true), "../favicon.svg?v=2");   // /m/ · /c/ 가 같이 씀
    }
}
