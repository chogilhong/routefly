package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 산악회 방 링크에 말을 붙임(2026-10-22 홍TV님 "/m/ 에서 산악회 방으로 갔더니 영어로 나오네") - 말이 없으면 party.js 가
 * 이 기기에 기억된 말(rf-lang, 영어 페이지 · 따라가기에서 영어를 고른 적 있으면 en)을 써서 한국어 페이지에서 와도 영어였음.
 */
public class PartyLangLinkTest {

    @Test
    public void koreanPagesLinkKoreanPartyRoom() throws Exception {
        String hike = Files.readString(Path.of("src/main/webapp/hike.html"), StandardCharsets.UTF_8);
        assertTrue("따라가기 한국어 링크", hike.contains("<a href=\"party.html?lang=ko\""));
        assertTrue("따라가기 영어 링크(data-en)", hike.contains("party.html?lang=en&quot;"));
        assertFalse("말 없는 링크 없음", hike.contains("href=\"party.html\"") || hike.contains("party.html&quot;"));
        String ms = Files.readString(Path.of("src/main/java/com/gh/routefly/web/MountainServlet.java"), StandardCharsets.UTF_8);
        assertTrue("한국어 산 페이지", ms.contains("/party.html?lang=ko"));
        assertFalse(ms.contains("/party.html\\\""));
    }
}
