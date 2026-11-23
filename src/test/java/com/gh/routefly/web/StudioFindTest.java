package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** GPX 편집 산 · 동네 찾기 · 내 위치 · 산 페이지에서 그 자리로 열기(2026-11-22 홍TV님 - 송산처럼 준비된 코스가 없는 산). */
public class StudioFindTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 찾기_내위치_산자리() throws Exception {
        String html = read("src/main/webapp/studio.html"), js = read("src/main/webapp/js/studio.js");
        assertTrue(html.contains("<form id=\"findForm\" role=\"search\">") && html.contains("id=\"hereBtn\""));
        assertTrue("장소 찾기는 서버 api/place(찾는 말을 남기지 않음)", js.contains("fetch(\"api/place?q=\" + encodeURIComponent(q)"));
        assertTrue("내 위치는 이 기기 GPS", js.contains("navigator.geolocation.getCurrentPosition(function (p) { goTo(p.coords.latitude, p.coords.longitude, 16);"));
        assertTrue("?at= 은 우리나라 안만 · 되살린 길 다음", js.contains("+m[1] > 32 && +m[1] < 39.5 && +m[2] > 123 && +m[2] < 133") && js.contains("restoreWork().then(openFromGuide).then(openFromRecord).then(openAt);"));
        JsonObject peak = JsonParser.parseString("{\"id\":\"월출산\",\"name\":\"월출산\",\"summit\":\"천황봉\",\"lat\":34.76656,\"lon\":126.703896}").getAsJsonObject();
        assertEquals("<p class=\"studioHere\"><a href=\"../studio.html?at=34.76656,126.70390\">📐 이 산 GPX 만들기 <small class=\"dim\">지도에 길을 그려 내 코스로 - 등산로를 따라 이어 줌</small> ›</a></p>",
                MountainServlet.studioHere(peak));
        assertTrue("산 페이지에 들어감", MountainServlet.page(peak, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("studio.html?at=34.76656,126.70390"));
        assertEquals("좌표가 없으면 없음", "", MountainServlet.studioHere(JsonParser.parseString("{\"id\":\"x\"}").getAsJsonObject()));
    }
}
