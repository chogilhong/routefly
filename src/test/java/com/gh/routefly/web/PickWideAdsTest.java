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
        assertTrue("ads.js · 1200px 아래 숨김", html.contains("<script src=\"js/ads.js\" defer></script>") && html.contains(".adRail { display:none; }\n@media (min-width:1200px) {\n  #pick > .adRail { display:block;"));
        assertTrue("숨은 자리는 보일 때 채움", read("src/main/webapp/js/ads.js").contains("whenShown(spot, function () { load(a.client, [makeBox(spot, a)]); });"));
    }

    @Test
    public void 코스_모음_양옆_광고는_PC_만() throws Exception {
        String rails = Ads.rails(), ads = read("src/main/webapp/js/ads.js"), css = read("src/main/webapp/css/mountain.css");
        assertTrue("빈 자리 둘 + ads.js", rails.contains("<div class=\"adSpot adRail left\" data-where=\"side\"></div><div class=\"adSpot adRail right\" data-where=\"side\"></div>") && rails.contains("js/ads.js"));
        Map<String, String> cfg = Map.of("adsense.client", "ca-pub-1234567890123456", "adsense.slot.m", "1111111111");
        assertEquals("양옆 칸이 따로 없으면 산 페이지 칸", "1111111111", Ads.spot("side", cfg::get).get("slot").getAsString());
        assertTrue("1200px 아래 · 앱은 지움", ads.contains("window.matchMedia(\"(min-width: 1200px)\").matches") && ads.contains("if (!wide) drop(rails);") && ads.contains("if (window.Capacitor) { drop(boxes); drop(spots); return; }"));
        assertTrue("한 번만 돎 · api 는 파일 자리 기준", ads.contains("if (window.__rfAds) return;") && ads.contains("fetch(root + \"api/ad?where=\""));
        assertTrue("CSS 도 1200px 아래는 숨김", css.contains(".adRail { display:none; }\n@media (min-width:1200px) {"));
        assertTrue("코스 모음 한 · 영", read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains(".append(Ads.rails())") && read("src/main/java/com/gh/routefly/web/MountainEn.java").contains(".append(Ads.rails())"));
    }
}
