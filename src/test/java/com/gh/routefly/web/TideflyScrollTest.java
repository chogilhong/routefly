package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 타이드플라이 묶음 · 카드를 펴면 그 맨 위로 스크롤(2026-11-15 홍TV님 "펴기를 누르면 펴지고 제일 상단 데이터로 스크롤 되게"). */
public class TideflyScrollTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void openingScrollsToTop() throws Exception {
        String js = read("src/main/webapp/js/tidefly.js");
        assertTrue("묶음: 편 때만, 다시 그린 뒤", js.contains("        draw();\n        if (opening) bringTop('data-area', area);"));
        assertTrue("카드도", js.contains("      draw();\n      if (opening) bringTop('data-card', p.name);"));
        assertTrue("다시 그린 것에서 찾음", js.contains("sec.setAttribute('data-area', area);") && js.contains("li.setAttribute('data-card', p.name);"));
        assertTrue("맨 위 · 움직임 줄이기 존중", js.contains("node.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });"));
        assertTrue(read("src/main/webapp/css/tidefly.css").contains(".area, .card { scroll-margin-top: 8px; }"));
    }
}
