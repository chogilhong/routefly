package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonParser;

/** 코스 모음(/m/ · /en/m/)에서 🎣 tidefly(출조) 줄이 자전거 접는 칸 바로 아래(2026-11-15 홍TV님 "자전거 아래에 위치하게 해. tidefly(출조) 로 하고"). */
public class TideflyEntryTest {

    private static final JsonArray GROUPS = JsonParser.parseString(
            "[{\"kind\":\"walk\",\"title\":\"국가숲길\",\"icon\":\"🌲\",\"series\":[{\"name\":\"지리산둘레길\",\"match\":\"지리산둘레길\"}]},"
            + "{\"kind\":\"bike\",\"title\":\"국토종주 자전거길\",\"icon\":\"🚴\",\"series\":[{\"name\":\"아라자전거길\",\"prefix\":\"osmb-1-\"}]}]").getAsJsonArray();

    @Test
    public void 한국어_코스_모음_자전거_아래() {
        String h = MountainServlet.indexPage(new JsonArray(), GROUPS, "https://r.kr/routefly", false);
        int bike = h.indexOf("🚴 자전거"), tf = h.indexOf("🎣 tidefly(출조)"), stay = h.indexOf("</div>", tf);
        assertTrue(h, bike > 0 && tf > bike);
        assertTrue("자전거 칸이 닫힌 바로 뒤", h.contains("</div></details>" + MountainServlet.tideflyRow(false)));
        String href = h.replaceFirst("(?s).*<a class=\"kindLink\" href=\"([^\"]+)\".*", "$1");
        assertTrue(href, java.net.URI.create("https://r.kr/routefly/m/").resolve(href).toString().equals("https://r.kr/routefly/tidefly.html?lang=ko"));
        assertTrue("접는 칸들(.folds) 안", stay > tf);
    }

    @Test
    public void 영어_코스_모음도() {
        String h = MountainEn.indexPage(new JsonArray(), GROUPS, "https://r.kr/routefly");
        int tf = h.indexOf("🎣 tidefly(fishing trips)");
        assertTrue(h, tf > h.indexOf("🚴"));
        // /routefly/en/m/ 에서 이 주소를 풀면 /routefly/tidefly.html 이어야 함(2026-11-15 PC: ../ 하나라 /routefly/en/tidefly.html 404)
        String href = h.replaceFirst("(?s).*<a class=\"kindLink\" href=\"([^\"]+)\".*", "$1");
        assertTrue(href, java.net.URI.create("https://r.kr/routefly/en/m/").resolve(href).toString().equals("https://r.kr/routefly/tidefly.html?lang=en"));
    }
}
