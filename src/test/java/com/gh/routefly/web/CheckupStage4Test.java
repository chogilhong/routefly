package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-10-10 3차 점검(코드 정합성 · 보안 · 속도). */
public class CheckupStage4Test {

    private static String src(String name) throws Exception {
        return Files.readString(Path.of("src", "main", "java", "com", "gh", "routefly", "web", name), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void queryCutByCodePoint() {
        String q = "가".repeat(CourseQueries.MAX_QUERY - 1) + "😀끝";   // 50번째 글자가 이모지
        String p = CourseQueries.parseQuery(q);
        assertEquals(CourseQueries.MAX_QUERY, p.codePointCount(0, p.length()));
        assertTrue("이모지가 반쪽으로 남지 않음", p.endsWith("😀"));
        assertEquals("짧으면 그대로", "선자령", CourseQueries.parseQuery(" 선자령 "));
    }

    @Test
    public void numHasNoExponent() throws Exception {
        assertFalse(CourseQueries.num(1.0E-4).contains("E"));
        assertTrue(src("TrailsServlet.java").contains("CourseQueries.num((b[0] + b[2]) / 2)"));
    }

    @Test
    public void limiterUsesDecodedServletPath() throws Exception {
        String s = src("SecurityFilter.java");
        assertTrue(s.contains("req.getServletPath()"));
        assertFalse("인코딩 · ;매개변수로 제한을 피함", s.contains("getRequestURI()"));
    }

    @Test
    public void failedSharePageNotCached() throws Exception {
        assertTrue(src("ShareServlet.java").contains("failed ? \"no-store\""));
    }
}
