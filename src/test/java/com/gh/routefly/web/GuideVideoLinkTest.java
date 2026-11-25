package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;

/** 코스 모음(/m/) 첫 화면 설명 아래 영상 단추 - 사용법 · 산악회 방 설명서(2026-11-25 홍TV님 "그림 아래에"). */
public class GuideVideoLinkTest {

    @Test
    public void 첫_화면_설명_아래_영상() throws Exception {
        String ko = MountainServlet.indexPage(new JsonArray(), new JsonArray(), "https://r.kr", false, "", "");
        int lead = ko.indexOf("<p class=\"lead\">"), vids = ko.indexOf("<nav class=\"vids\""), form = ko.indexOf("<form");
        assertTrue("설명 아래 · 찾기 칸 위", lead >= 0 && vids > lead && form > vids);
        assertTrue(ko.contains("href=\"https://youtu.be/K1oKGDTY5t0\" target=\"_blank\" rel=\"noopener\">▶ 사용법 영상</a>"));
        assertTrue(ko.contains("href=\"https://youtu.be/AoQexAxZ-58\" target=\"_blank\" rel=\"noopener\">▶ 산악회 방 설명서</a>"));
        long autumn = java.time.Instant.parse("2026-11-25T03:00:00Z").toEpochMilli();
        String fire = MountainServlet.withFire(ko, autumn);
        assertTrue("산불 안내 다음에 영상", fire.indexOf("<p class=\"fire\">") > lead && fire.indexOf("<nav class=\"vids\"") > fire.indexOf("<p class=\"fire\">"));
        assertFalse("영어 코스 모음에는 없음(영상이 한국어)", MountainEn.indexPage(new JsonArray(), new JsonArray(), "https://r.kr", "").contains("class=\"vids\""));
        String css = new String(Files.readAllBytes(Paths.get("src/main/webapp/css/mountain.css")), StandardCharsets.UTF_8);
        assertTrue(css.contains(".vids { display:flex;") && css.contains(":root[data-theme=\"light\"] .vids a {"));
    }
}
