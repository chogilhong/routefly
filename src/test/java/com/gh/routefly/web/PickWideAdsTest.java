package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Map;

import org.junit.Test;

/** 따라가기 코스 목록 PC 폭 · "▶ 따라가기" 표시 · 코스 모음 PC 양옆 광고(2026-11-24 홍TV님). */
public class PickWideAdsTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 목록은_PC_에서_가운데_760px_줄마다_따라가기() throws Exception {
        String html = read("src/main/webapp/hike.html"), js = read("src/main/webapp/js/hike.js");
        assertTrue("PC 900px 넘으면 가운데 760px", html.contains("@media (min-width:900px) {\n  #pick { align-items:center; }")
                && html.contains("#pick > header, #pick > #pickList, #pick > #pickFoot, #pick > [data-app-store] { width:100%; max-width:760px; box-sizing:border-box; }"));
        assertTrue("줄마다 ▶ 따라가기 · 맨 위 한 줄", js.contains("go.textContent = T(\"▶ 따라가기\", \"▶ Follow\");") && js.contains("hint.className = \"msg tapHint\";"));
        // 2026-11-24 홍TV님 "목록에서만, 세 번째(따라가기 지도) 화면에서는 광고는 달지 않아" - 양옆 자리는 목록(#pick) 안에만
        int pick = html.indexOf("<div id=\"pick\">"), rails = html.indexOf("<div class=\"adSpot adRail left\" data-where=\"side\"></div><div class=\"adSpot adRail right\" data-where=\"side\"></div>"), foot = html.indexOf("<div id=\"pickFoot\"");
        assertTrue("양옆 자리는 목록 안(코스를 열면 함께 숨음)", pick > 0 && rails > pick && rails < foot && html.indexOf("adRail", foot + 1) < 0);
        assertTrue("ads.js · 1200px 아래 숨김", html.contains("<script src=\"js/ads.js\" defer></script>") && html.contains("<link rel=\"stylesheet\" href=\"css/course-kit.css\">")
                && read("src/main/webapp/js/ads.js").contains("s.style.cssText = \"position:fixed;top:90px;width:160px;min-height:600px;z-index:11;\""));   // 모양은 ads.js 한 벌(2026-11-24)
        assertTrue("숨은 자리는 보일 때 채움", read("src/main/webapp/js/ads.js").contains("whenShown(spot, function () { load(a.client, [makeBox(spot, a)]); });"));
    }

    @Test
    public void 코스_모음_양옆_광고는_PC_만() throws Exception {
        String rails = Ads.rails(), ads = read("src/main/webapp/js/ads.js"), css = read("src/main/webapp/css/course-kit.css");   // 코스 모음 · 따라가기 목록이 같이 쓰는 한 벌(점검 14차 F2)
        assertTrue("빈 자리 둘 + ads.js", rails.contains("<div class=\"adSpot adRail left\" data-where=\"side\"></div><div class=\"adSpot adRail right\" data-where=\"side\"></div>") && rails.contains("js/ads.js"));
        Map<String, String> cfg = Map.of("adsense.client", "ca-pub-1234567890123456", "adsense.slot.m", "1111111111");
        assertEquals("양옆 칸이 따로 없으면 산 페이지 칸", "1111111111", Ads.spot("side", cfg::get).get("slot").getAsString());
        assertTrue("1200px 아래 · 앱은 지움", ads.contains("window.matchMedia(\"(min-width: 1200px)\").matches") && ads.contains("if (!wide) drop(rails);") && ads.contains("if (window.Capacitor) { drop(boxes); drop(spots); return; }"));
        assertTrue("한 번만 돎 · api 는 파일 자리 기준", ads.contains("if (window.__rfAds) return;") && ads.contains("fetch(root + \"api/ad?where=\""));
        assertTrue("모양은 ads.js 한 벌 - 1200px 넘을 때만 붙이고 CSS 에는 없음", ads.contains("else rails.forEach(function (s) {") && !css.contains(".adRail {"));
        assertTrue("코스 모음 한 · 영", read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains(".append(Ads.rails())") && read("src/main/java/com/gh/routefly/web/MountainEn.java").contains(".append(Ads.rails(REL))"));
    }

    /** 산 페이지(/m/산 · /en/m/산)도 PC 양옆 광고(2026-11-24 홍TV님 "넣어줘. 승인나면 구글 그 전에는 쿠팡으로") - 한 페이지에 한 쌍. 승인 전 쿠팡 · 뒤 애드센스는 ads.js(위 시험). */
    @Test
    public void 산_페이지_양옆_광고() throws Exception {
        com.google.gson.JsonObject gaya = com.google.gson.JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.822544,\"lon\":128.122849}").getAsJsonObject();
        String ko = MountainServlet.page(gaya, java.util.List.of(), java.util.List.of(), null, "https://r.kr", java.time.LocalDate.now(WeatherServlet.KST).getMonthValue());
        String en = MountainEn.page(gaya, java.util.List.of(), java.util.List.of(), null, "https://r.kr");
        String pair = "<div class=\"adSpot adRail left\" data-where=\"side\"></div><div class=\"adSpot adRail right\" data-where=\"side\"></div>";
        for (String h : new String[] {ko, en}) {
            assertEquals("한 쌍", 1, h.split(java.util.regex.Pattern.quote(pair), -1).length - 1);
            assertTrue("ads.js", h.contains("js/ads.js"));
        }
        // 주소 깊이 - 한국어 /m/산 은 ../js, 영어 /en/m/산 은 ../../js(2026-11-24 PC: 영어가 ../js/ads.js 로 /en/js 404)
        assertTrue(ko.contains("<script src=\"../js/ads.js\" defer>") && en.contains("<script src=\"../../js/ads.js\" defer>") && !en.contains("<script src=\"../js/ads.js\""));
        assertTrue("영어 가운데 광고 칸도 같은 깊이", Ads.box("ca-pub-1234567890123456", "1234567890", MountainEn.REL).contains("<script src=\"../../js/ads.js\" defer>"));
    }

    /** 넣을 만한 정적 화면 전부(2026-11-24 홍TV님 "넣을 만한 곳에는 전부 넣어줘. 지금은 승인 전이라 쿠팡으로") - 도장 · 별거별거 · 출조 · 드론. 지도 · 산악회 · 게임 · 약관은 없음. */
    @Test
    public void 정적_화면_양옆_광고() throws Exception {
        String pair = "<div class=\"adSpot adRail left\" data-where=\"side\"></div><div class=\"adSpot adRail right\" data-where=\"side\"></div>";
        // 산악회 화면도(2026-11-24 홍TV님 "'/routefly/party-office.html' '/routefly/party.html' 등도 /m/ 처럼 넓이를 통일 시키고 광고 넣어줘") - 넓이 760px
        for (String f : new String[] {"series.html", "tools.html", "tidefly.html", "dronefly.html", "party.html", "party-office.html", "party-guide.html", "party-guide-en.html", "games.html"}) {   // 게임도(2026-11-24 홍TV님)
            String h = read("src/main/webapp/" + f);
            assertEquals(f + " 한 쌍", 1, h.split(java.util.regex.Pattern.quote(pair), -1).length - 1);
            assertTrue(f + " ads.js", h.contains("<script src=\"js/ads.js\" defer></script>"));
        }
        for (String f : new String[] {"index.html", "park.html", "route.html", "trip.html", "studio.html", "anbu.html", "terms.html", "privacy.html", "record.html"})
            assertFalse(f + " 광고 없음", read("src/main/webapp/" + f).contains("adRail"));
        assertEquals("출조 · 드론도 애드센스 곳을 엶(승인 뒤)", SecurityFilter.CSP_ADS, SecurityFilter.cspFor("/tidefly.html"));
        assertEquals(SecurityFilter.CSP_ADS, SecurityFilter.cspFor("/dronefly.html"));
        for (String f : new String[] {"party.html", "party-office.html", "party-guide.html", "party-guide-en.html"}) {
            assertEquals(f, f.startsWith("party-guide") ? SecurityFilter.CSP_ADS : SecurityFilter.CSP_ADS_HIKE, SecurityFilter.cspFor("/" + f));   // 방 · 사무실은 좁은 곳만
            assertEquals(SecurityFilter.CSP_ADS, SecurityFilter.cspFor("/games.html"));
            assertTrue(f + " 넓이 760px(/m/ 과 같게)", read("src/main/webapp/" + f).contains("main { max-width:760px; margin:0 auto;"));
        }
        assertTrue(read("src/main/webapp/css/mountain.css").contains("main { max-width:760px; margin:0 auto;"));
    }
}
