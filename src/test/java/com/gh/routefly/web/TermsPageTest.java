package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 서비스 이용약관(terms.html, 2026-10-29 홍TV님 - 베트맨 약관 참고)이 있고, 화면들에서 찾아갈 수 있으며, 다른 문서와 어긋나지 않는지.
 */
public class TermsPageTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8);
    }

    @Test
    public void termsExistAndAreLinked() throws Exception {
        String t = read("src/main/webapp/terms.html");
        for (int i = 1; i <= 18; i++) assertTrue("제" + i + "조", t.contains("<section id=\"a" + i + "\">\n        <h2>제" + i + "조 "));
        assertTrue(t.contains("<h2>부칙</h2>") && t.contains("2026년 10월 29일부터 시행"));
        // 목차 링크마다 그 조가 있음
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("href=\"#(a\\d+)\"").matcher(t);
        int n = 0;
        while (m.find()) { n++; assertTrue(m.group(1), t.contains("id=\"" + m.group(1) + "\"")); }
        assertEquals(19, n);
        assertTrue("무료", t.contains("모든 서비스가 무료"));
        assertTrue("119 대신 아님", t.contains("119 신고를 대신하지 않습니다"));
        assertTrue("수집 프로그램 금지", t.contains("자동 수집 프로그램"));
        assertTrue("사업자 연락처는 위치 약관 제4조로", t.contains("lbs-terms.html#a4") && read("src/main/webapp/lbs-terms.html").contains("<section id=\"a4\">"));
        assertFalse("전화 · 주소를 적지 않음", t.matches("(?s).*\\b01[016789]-?\\d{3,4}-?\\d{4}\\b.*"));
        // 찾아가는 곳
        assertTrue(read("src/main/webapp/hike.html").contains("<a href=\"terms.html\">이용약관</a>"));
        assertTrue(read("src/main/webapp/index.html").contains("<a href=\"terms.html\">이용약관</a>"));
        assertTrue(read("src/main/webapp/about.html").contains("<a href=\"terms.html\">이용약관</a>"));
        assertTrue(read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains("/terms.html\\\">이용약관</a>"));
        assertTrue(read("src/main/java/com/gh/routefly/web/SitemapServlet.java").contains("\"/terms.html\""));
    }
}
