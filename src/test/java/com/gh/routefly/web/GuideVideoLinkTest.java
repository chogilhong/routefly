package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;

/** 코스 모음(/m/) 첫 화면 설명 아래 영상 단추 - 사용자 매뉴얼 · 산악회 방 매뉴얼 영상(2026-11-25 홍TV님 "그림 아래에", 이름은 2026-11-26). */
public class GuideVideoLinkTest {

    @Test
    public void 첫_화면_설명_아래_영상() throws Exception {
        String ko = MountainServlet.indexPage(new JsonArray(), new JsonArray(), "https://r.kr", false, "", "", new com.google.gson.JsonArray());
        int lead = ko.indexOf("<p class=\"lead\">"), vids = ko.indexOf("<nav class=\"vids\""), form = ko.indexOf("<form");
        assertTrue("설명 아래 · 찾기 칸 위", lead >= 0 && vids > lead && form > vids);
        // 2026-11-28 1안: 단추 하나 "▶ 사용법 영상 7편" 안에 전체 사용법 · 산악회 인솔자용(전에는 따로 단추 "▶ 사용자 매뉴얼 영상" · "▶ 산악회 방 매뉴얼 영상")
        assertTrue(ko.contains("<dt>처음이라면</dt><dd><a href=\"https://youtu.be/K1oKGDTY5t0\" target=\"_blank\" rel=\"noopener\">▶ 전체 사용법(약 14분)</a></dd>"));
        assertTrue(ko.contains("href=\"https://youtu.be/AoQexAxZ-58\" target=\"_blank\" rel=\"noopener\">▶ 인솔자용</a>"));
        long autumn = java.time.Instant.parse("2026-11-25T03:00:00Z").toEpochMilli();
        String fire = MountainServlet.withFire(ko, autumn);
        assertTrue("산불 안내 다음에 영상", fire.indexOf("<p class=\"fire\">") > lead && fire.indexOf("<nav class=\"vids\"") > fire.indexOf("<p class=\"fire\">"));
        assertFalse("영어 코스 모음에는 없음(영상이 한국어)", MountainEn.indexPage(new JsonArray(), new JsonArray(), "https://r.kr", "").contains("class=\"vids\""));
        String css = new String(Files.readAllBytes(Paths.get("src/main/webapp/css/mountain.css")), StandardCharsets.UTF_8);
        assertTrue(css.contains(".vids { display:flex;") && css.contains(":root[data-theme=\"light\"] .vidMore dd a {"));
    }
}
