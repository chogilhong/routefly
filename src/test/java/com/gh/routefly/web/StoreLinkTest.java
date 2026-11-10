package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 산악회 방 "routefly 앱으로 열기"(app.released=true 일 때) - 앱이 없으면 원스토어로(2026-11-10 출시, 공유 주소 https://onesto.re/0001012263).
 * 플레이스토어는 아직 없어 예전 대체 주소(play.google.com)로 가면 "앱을 찾을 수 없음" 이었음.
 */
public class StoreLinkTest {

    static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void appOpenFallsBackToOneStore() throws Exception {
        String js = read("src/main/webapp/js/party.js"), html = read("src/main/webapp/party.html");
        assertTrue(js.contains("var STORE_URL = \"https://onesto.re/0001012263\";"));
        assertTrue("앱이 없을 때 intent 대체 주소", js.contains("var back = STORE_URL;"));
        assertTrue("눈에 보이는 받기 링크", js.contains("$(\"appStore\").href = STORE_URL;") && html.contains("id=\"appStore\""));
        assertFalse("아직 없는 플레이스토어 주소", js.contains("play.google.com"));
        assertTrue(html.contains("앱이 없으면 원스토어 설치 화면으로 갑니다"));
    }
}
