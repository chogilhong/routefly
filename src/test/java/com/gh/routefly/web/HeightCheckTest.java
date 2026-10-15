package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

/** 높이 점검 화면(/check/heights - 2026-10-16). */
public class HeightCheckTest {

    @Test
    public void page() {
        HeightCheckServlet.Row a = new HeightCheckServlet.Row(), b = new HeightCheckServlet.Row();
        a.id = "설악산";
        a.summit = "대청봉";
        a.official = 1708;
        a.gps = 1734;
        a.courseEle = 1700.4;
        a.courseGap = 12.0;
        a.courseId = "frst-1";
        a.courseSrc = "dem";
        a.courses = 9;
        a.pois.add("대청봉 1700m (15m)");
        b.id = "<x>";
        String h = HeightCheckServlet.page(List.of(a, b));
        assertTrue("요약", h.contains("100대 명산 2곳 · 공식 높이 없음 1 · 코스 높이가 공식과 30m 넘게 다름 0 · GPS 높이가 30m 넘게 다름 0"));
        assertTrue(h.contains("<td>1,708</td>") && h.contains("1734 <small>(+26)</small>") && h.contains("1700 <small>(-8)</small><br><small>dem · 12m · frst-1</small>"));
        assertTrue("이스케이프", h.contains("&lt;x&gt;") && !h.contains("<x>"));
        assertTrue("검색 엔진에 안 나오게", h.contains("noindex"));
        a.gps = 1750;
        assertTrue("30m 넘으면 칠함", HeightCheckServlet.page(List.of(a)).contains("<td class=\"bad\">1750 <small>(+42)</small>"));
    }

    @Test
    public void keyRequired() {
        assertFalse(StatsServlet.allowed(null, "x"));
    }
}
