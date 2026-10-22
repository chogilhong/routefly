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

    /** 의견 보내기 영어(2026-10-22 홍TV님 "이 화면 영어로 안 돼") - 영어 화면에서 온 링크(?lang=en)만 영어. */
    @Test
    public void feedbackEnglishFromEnglishPages() throws Exception {
        String hike = Files.readString(Path.of("src/main/webapp/hike.html"), StandardCharsets.UTF_8);
        assertTrue("따라가기 영어 줄의 의견 보내기", hike.contains("feedback.html?from=/hike.html&amp;amp;lang=en"));
        assertTrue("산악회 방 영어", Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8).contains("feedback.html?from=/party.html&lang=en"));
        String fb = Files.readString(Path.of("src/main/webapp/js/feedback.js"), StandardCharsets.UTF_8);
        assertTrue(fb.contains("Send feedback") && fb.contains("/[?&]lang=en\\b/"));
        assertFalse("기억된 말(rf-lang)은 쓰지 않음", fb.contains("rf-lang\")"));
    }

    /** 산악회 방 한글 · 영어(2026-10-22 홍TV님) - ?lang=en 만 영어(기억된 말 안 씀), 화면 글은 data-en, 움직이는 글은 T(), 한/EN 단추. */
    @Test
    public void partyRoomBilingual() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8);
        assertTrue(js.contains("/[?&]lang=en\\b/.test(location.search)"));
        assertTrue("화면 글 바꾸기", js.contains("RF.applyEn(document)"));
        assertTrue("한/EN 단추", js.contains("langBtn"));
        assertFalse("예전 \"Korean only\" 안내는 없음", js.contains("Korean only"));
        assertTrue("서버 오류 글 영어", js.contains("function enMsg("));
        String html = Files.readString(Path.of("src/main/webapp/party.html"), StandardCharsets.UTF_8);
        int n = html.split("data-en", -1).length - 1;
        assertTrue("영어 글 " + n, n > 80);
        assertTrue(html.contains("I am 14 or older"));
    }
}
