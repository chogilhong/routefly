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
        String h = MountainServlet.indexPage(new JsonArray(), GROUPS, "https://r.kr/routefly", false, "", "");
        int bike = h.indexOf("🚴 자전거"), tf = h.indexOf("🎣 tide<span class=\"fly\">fly</span>(출조)"), stay = h.indexOf("</div>", tf);
        assertTrue(h, bike > 0 && tf > bike);
        assertTrue("자전거 칸이 닫힌 바로 뒤", h.contains("</div></details>" + MountainServlet.tideflyRow(false)));
        // 첫 kindLink(타이드플라이) - 그 뒤에 🚁 dronefly 줄이 붙어(2026-11-17) 마지막 것을 잡던 셈을 바꿈
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("<a class=\"kindLink\" href=\"([^\"]+)\"").matcher(h);
        String href = m.find() ? m.group(1) : "";
        assertTrue("드론플라이는 타이드플라이 바로 아래", h.contains(MountainServlet.tideflyRow(false) + MountainServlet.droneflyRow()));
        assertTrue(href, java.net.URI.create("https://r.kr/routefly/m/").resolve(href).toString().equals("https://r.kr/routefly/tidefly.html?lang=ko"));
        assertTrue("접는 칸들(.folds) 안", stay > tf);
    }

    @Test
    public void 영어_코스_모음도() {
        String h = MountainEn.indexPage(new JsonArray(), GROUPS, "https://r.kr/routefly");
        int tf = h.indexOf("🎣 tide<span class=\"fly\">fly</span>(fishing trips)");
        assertTrue(h, tf > h.indexOf("🚴"));
        // /routefly/en/m/ 에서 이 주소를 풀면 /routefly/tidefly.html 이어야 함(2026-11-15 PC: ../ 하나라 /routefly/en/tidefly.html 404)
        // 첫 kindLink(타이드플라이) - 그 뒤에 🚁 dronefly 줄이 붙어(2026-11-17) 마지막 것을 잡던 셈을 바꿈
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("<a class=\"kindLink\" href=\"([^\"]+)\"").matcher(h);
        String href = m.find() ? m.group(1) : "";
        assertTrue("영어 화면에는 드론플라이 줄 없음(한국어 화면만)", !h.contains("dronefly.html"));
        assertTrue(href, java.net.URI.create("https://r.kr/routefly/en/m/").resolve(href).toString().equals("https://r.kr/routefly/tidefly.html?lang=en"));
    }

    /** routefly 화면 모양 그대로(2026-11-15 홍TV님 "루트플라이 대로 해야지" - 탭에 routefly 아이콘이 없었음): 제목 · 아이콘 · 앱 정보 · 코스 모음으로. */
    @Test
    public void 타이드플라이_머리는_routefly_모양() throws Exception {
        String h = java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/tidefly.html"), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("탭 제목은 코스 모음 \"루트플라이 … - routefly\" 모양(2026-11-17)", h.contains("<title>타이드플라이 바다낚시 물때 · 바람 · 파고 - tidefly</title>"));
        assertTrue("탭 아이콘은 머리와 같은 🎣(2026-11-17 홍TV님)", h.contains("<link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"img/tidefly-32.png\"><link rel=\"icon\" type=\"image/png\" sizes=\"192x192\" href=\"img/tidefly-192.png\">") && !h.contains("favicon.svg"));
        for (String f : new String[] {"tidefly-32.png", "tidefly-192.png", "tidefly-180.png"}) assertTrue(f, java.nio.file.Files.size(java.nio.file.Path.of("src/main/webapp/img", f)) > 1000);
        assertTrue(h.contains("<link rel=\"manifest\" href=\"manifest.json\">") && h.contains("<link rel=\"apple-touch-icon\" href=\"img/tidefly-180.png\">"));
        assertTrue("로고 줄 오른쪽 하늘색 점선 단추(따라가기 › 모양, 2026-11-17)", h.contains("<a id=\"back\" class=\"back\" href=\"m/\" data-en=\"⛰️ Trails ›\">⛰️ 코스 모음 ›</a>"));
    }
}
