package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 타이드플라이 머리(2026-11-15 홍TV님): 기본 다크, 모드 · 한/EN · 가 단추는 "‹ 코스 모음" 줄에. 다크 판단은 tidefly.test.js(isDark). */
public class TideflyHeaderTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void darkByDefaultAndOptionsOnCrumbLine() throws Exception {
        String early = read("src/main/webapp/js/tidefly-early.js");
        assertTrue("저장 없음 · 막힘도 다크", early.contains("setAttribute('data-theme', t === 'light' ? 'light' : 'dark')") && early.contains("catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }"));
        String h = read("src/main/webapp/tidefly.html");
        int crumb = h.indexOf("<div class=\"crumb\">"), back = h.indexOf("id=\"back\""), opts = h.indexOf("<div class=\"opts\">"), h1 = h.indexOf("<h1 ");
        assertTrue("코스 모음 줄 안에 단추들, 그 아래 제목", crumb > 0 && crumb < back && back < opts && opts < h1);
        assertTrue(h.contains("id=\"theme\"") && h.contains("data-lang=\"en\"") && h.contains("id=\"size\""));
    }
}
