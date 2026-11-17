package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 타이드플라이 머리(2026-11-15 홍TV님): 기본 다크. 2026-11-17 "루트플라이처럼" - 로고 줄(🎣 tidefly · 코스 모음 ›) 아래 제목 줄에 모드 · 한/EN · 가. 다크 판단은 tidefly.test.js(isDark). */
public class TideflyHeaderTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void darkByDefaultAndOptionsOnCrumbLine() throws Exception {
        String early = read("src/main/webapp/js/tidefly-early.js");
        assertTrue("저장 없음 · 막힘도 다크", early.contains("setAttribute('data-theme', t === 'light' ? 'light' : 'dark')") && early.contains("catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }"));
        String h = read("src/main/webapp/tidefly.html");
        int logo = h.indexOf("<div class=\"logoRow\">"), back = h.indexOf("id=\"back\""), crumb = h.indexOf("<div class=\"crumb\">"), h1 = h.indexOf("<h1 "), opts = h.indexOf("<div class=\"opts\">");
        assertTrue("로고 줄(코스 모음 단추) 아래 제목 줄, 제목 오른쪽에 단추들", logo > 0 && logo < back && back < crumb && crumb < h1 && h1 < opts);
        assertTrue(h.contains("id=\"theme\"") && h.contains("data-lang=\"en\"") && h.contains("id=\"size\""));
    }
}
