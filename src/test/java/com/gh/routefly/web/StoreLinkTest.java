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
        // 주소는 js/app-store.js 한 곳(2026-11-10 - 사이트 곳곳의 "원스토어에서 받기" 띠와 같은 값), party.html 은 그 파일을 party.js 보다 먼저
        assertTrue(read("src/main/webapp/js/app-store.js").contains("var URL = \"https://onesto.re/0001012263\""));
        assertTrue(js.contains("var STORE_URL = window.RFAppStore.url;"));
        assertTrue(html.indexOf("js/app-store.js") > 0 && html.indexOf("js/app-store.js") < html.indexOf("js/party.js"));
        assertTrue("앱이 없을 때 intent 대체 주소", js.contains("var back = STORE_URL;"));
        assertTrue("눈에 보이는 받기 링크", js.contains("$(\"appStore\").href = STORE_URL;") && html.contains("id=\"appStore\""));
        assertFalse("아직 없는 플레이스토어 주소", js.contains("play.google.com"));
        assertTrue(html.contains("설치 없이 웹으로 참가하려면 아래에서 그대로 참가하세요."));   // 2026-11-12 점검: "앱이 없으면 원스토어로" 와 "아래에서 참가" 가 엇갈려 한 줄로
    }
}
