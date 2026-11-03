package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-03 홍TV님: 산 페이지 아래 로고 옆 "앱 열기 ›" 를 위쪽 단추처럼 "🥾 따라가기 ›"(영어 "🥾 Follow a trail ›") 로. */
public class FooterFollowLabelTest {

    @Test
    public void footerUsesSameWordAsTopButton() throws Exception {
        String ko = Files.readString(Path.of("src/main/java/com/gh/routefly/web/MountainServlet.java"), StandardCharsets.UTF_8);
        String en = Files.readString(Path.of("src/main/java/com/gh/routefly/web/MountainEn.java"), StandardCharsets.UTF_8);
        assertFalse(ko.contains("앱 열기 ›"));
        assertFalse(en.contains("Open app ›"));
        assertTrue(ko.contains("height=\\\"50\\\"> 🥾 따라가기 ›</a></p>"));
        assertTrue(en.contains("height=\\\"50\\\"> 🥾 Follow a trail ›</a></p>"));
    }
}
