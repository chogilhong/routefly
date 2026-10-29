package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 영어판 개인정보처리방침 · 위치기반서비스 이용약관 · 이용약관(2026-10-29 홍TV님 "만들어줘").
 * 한국어판이 기준(다르면 한국어판 우선) - 한국어판을 고치면 영어판도 같이: 조(h2) 수 · 시행일이 같은지 봄.
 */
public class EnglishLegalTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of("src/main/webapp/" + p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    private static int h2(String s) {
        return s.split("<h2>", -1).length - 1;
    }

    @Test
    public void englishMatchesKorean() throws Exception {
        String[][] pairs = {
            {"privacy.html", "privacy-en.html", "2026년 10월 21일", "October 21, 2026"},
            {"lbs-terms.html", "lbs-terms-en.html", "2026년 10월 27일", "October 27, 2026"},
            {"terms.html", "terms-en.html", "2026년 10월 29일", "October 29, 2026"},
        };
        for (String[] p : pairs) {
            String ko = read(p[0]), en = read(p[1]);
            assertEquals(p[1] + " 조 수", h2(ko), h2(en));
            assertTrue(p[0] + " 시행일", ko.contains("시행일: " + p[2]));
            assertTrue(p[1] + " 시행일", en.contains("Effective: " + p[3]));
            assertTrue(p[1] + " 한국어판 우선", en.contains("the Korean original prevails") && en.contains("href=\"" + p[0] + "\""));
            assertTrue(p[0] + " → English", ko.contains("<a href=\"" + p[1] + "\" hreflang=\"en\" lang=\"en\">English</a>"));
            assertTrue(en.startsWith("<!DOCTYPE html>\n<html lang=\"en\">"));
            assertFalse(p[1] + " 에 한글 본문이 남지 않게(원문 이름 · 책임자 이름만)", en.substring(en.indexOf("<body>")).replaceAll("\\([^()]*[가-힣][^()]*\\)|조길홍", "").matches("(?s).*[가-힣].*"));
        }
        // 이용약관 목차 - 영어판도 20개, 대상 id 모두
        String t = read("terms-en.html");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("href=\"#(a\\d+)\"").matcher(t);
        int n = 0;
        while (m.find()) { n++; assertTrue(m.group(1), t.contains("id=\"" + m.group(1) + "\"")); }
        assertEquals(20, n);
        // 영어 화면은 영어판으로
        assertTrue(read("hike.html").contains("privacy-en.html") && read("hike.html").contains("terms-en.html") && read("hike.html").contains("lbs-terms-en.html"));
        assertTrue(read("index.html").contains("terms-en.html") && read("party.html").contains("privacy-en.html#party") && read("js/feedback.js").contains("privacy-en.html#feedback"));
        assertTrue(Files.readString(Path.of("src/main/java/com/gh/routefly/web/MountainEn.java")).contains("/privacy-en.html"));
        assertTrue(Files.readString(Path.of("src/main/java/com/gh/routefly/web/SitemapServlet.java")).contains("\"/terms-en.html\""));
    }
}
