package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;

/** 공식 페이스북 페이지(2026-11-24 홍TV님 - facebook.com/routefly.kr) - 안내 화면 한 · 영 · 코스 모음 한 · 영 검색용 정보(Organization sameAs). */
public class FacebookLinkTest {

    @Test
    public void 페이스북_링크() throws Exception {
        assertEquals("https://www.facebook.com/routefly.kr", MountainServlet.FACEBOOK);
        String ld = MountainServlet.orgLd("https://r.kr");
        assertTrue(ld.startsWith("<script type=\"application/ld+json\">") && ld.contains("\"@type\":\"Organization\"") && ld.contains("\"sameAs\":[\"https://www.facebook.com/routefly.kr\"]")
                && ld.contains("\"url\":\"https://r.kr/m/\""));
        assertTrue("코스 모음 한국어", MountainServlet.indexPage(new JsonArray(), new JsonArray(), "https://r.kr", false, "", "", new com.google.gson.JsonArray()).contains(ld));
        assertTrue("코스 모음 영어", MountainEn.indexPage(new JsonArray(), new JsonArray(), "https://r.kr").contains(ld));
        for (String p : new String[] {"about.html", "about-en.html"})
            assertTrue(p, new String(Files.readAllBytes(Paths.get("src/main/webapp/" + p)), StandardCharsets.UTF_8).contains("<p class=\"dim\" id=\"social\">") );
        assertTrue(new String(Files.readAllBytes(Paths.get("src/main/webapp/about.html")), StandardCharsets.UTF_8).contains("href=\"https://www.facebook.com/routefly.kr\" target=\"_blank\" rel=\"noopener\""));
    }
}
