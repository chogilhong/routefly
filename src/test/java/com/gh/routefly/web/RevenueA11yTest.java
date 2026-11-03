package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-10-29 점검 4묶음 - 산 페이지 숙소 제휴 · 영어 산 페이지 광고, 손가락 크기 44px, 사무실 글자 크기. */
public class RevenueA11yTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void staysAndEnglishAds() throws Exception {
        String box = Ads.box("ca-pub-1234567890123456", "1234567");
        assertTrue(box.contains(">광고</p>"));
        String ko = read("src/main/java/com/gh/routefly/web/MountainServlet.java"), en = read("src/main/java/com/gh/routefly/web/MountainEn.java");
        assertTrue(!ko.contains("id=\\\"stays\\\" data-name=") && en.contains("MountainServlet.staysBlock(peak, true)"));   // 근처 숙소 찾기 칸만 - "근처 숙소(트립닷컴)" 한 줄은 뺌(2026-11-03 홍TV님)
        assertTrue("영어 산 페이지 · 목록에도 광고", en.split("Ads.box\\(\"m\", true\\)", -1).length - 1 == 2);
        assertTrue(!read("src/main/webapp/js/mountain.js").contains("RF.staysLine(") && !read("src/main/webapp/js/mountain-en.js").contains("RF.staysLine("));
        String kit = read("src/main/webapp/js/course-kit.js");
        assertTrue("제휴 표시 · sponsored", kit.contains("a.rel = \"noopener sponsored\"") && kit.contains("예약하면 routefly 가 수수료를 받습니다"));
        assertTrue("영어 3D 링크", en.contains("/index.html?lang=en#c=") && !en.contains("The 3D and GPS screens are in Korean"));
    }

    @Test
    public void touchTargets44() throws Exception {
        String css = read("src/main/webapp/css/mountain.css");
        for (String sel : new String[] {".days button {", ".cs .go a {", ".rfTextBtn {", ".rfFavBtn {", ".cmpClose {", ".goHike {", ".rfLang {"}) {
            String rule = css.substring(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
            assertTrue(sel + " 44px", rule.contains("44px"));
        }
        String office = read("src/main/webapp/party-office.html");
        assertTrue("사무실 뒤로 44px · 글자 크기", office.contains("#top a { display:inline-flex; align-items:center; min-height:44px;") && office.contains(".rfz main { zoom: var(--rfz); }"));
        assertTrue(read("src/main/webapp/js/party-office.js").contains("localStorage.setItem(\"rf-text\""));
    }

    /** 따라가기 첫 화면 아래 링크(사용법 ~ 의견 보내기): 초창기 모양(2026-11-03 홍TV님 "예전처럼 · 초창기" - 44px · 32px 손가락 자리는 줄 사이가 벌어졌음). */
    @Test
    public void hikeFootIsCompact() throws Exception {
        String html = read("src/main/webapp/hike.html");
        String rule = html.substring(html.indexOf("#pickFoot a {"), html.indexOf("}", html.indexOf("#pickFoot a {")));
        assertTrue(rule, !rule.contains("min-height") && !rule.contains("padding"));
        assertTrue(html.contains("#pickFoot { flex:0 0 auto; padding:8px 14px calc(env(safe-area-inset-bottom) + 8px);"));
    }

    /** 산악회 방 줄이 아래에 붙으면 목록 아래는 그 줄 높이만큼만 비움(2026-11-03 홍TV님: 120px 고정이라 의견 보내기 아래가 많이 비었음). */
    @Test
    public void partyBarPadFitsBar() throws Exception {
        String html = read("src/main/webapp/hike.html"), bar = read("src/main/webapp/js/party-bar.js");
        assertTrue(html.contains("html.picking.partyOn #pick { padding-bottom:calc(var(--pbH, 120px) + 4px);"));
        assertTrue(bar.contains("document.documentElement.style.setProperty(\"--pbH\", bar.offsetHeight + \"px\")") && bar.contains("requestAnimationFrame(fitPad)"));
    }

    @Test
    public void gearIsOneFeaturedProduct() throws Exception {
        // 2026-11-03 홍TV님 - 물 · 우비 · 헤드랜턴 … 챙길 것 목록은 빼고 쿠팡 상품 하나(그림)만, 이름은 "추천 상품"(산 페이지 · 코스 모음 · 3D 안내)
        String m = read("src/main/webapp/js/mountain.js"), app = read("src/main/webapp/js/app.js");
        assertTrue("산 페이지 · 코스 모음", m.contains("\"🎒 추천 상품\"") && !m.contains("RF.gearList(") && !m.contains("\"🎒 챙길 것\""));
        assertTrue("3D 안내", app.contains("\"🎒 추천 상품\"") && !app.contains("RF.gearList(") && !app.contains("What to bring"));
        assertTrue("쿠팡 표시는 그대로", m.contains("RF.COUPANG_NOTE") && app.contains("RF.COUPANG_NOTE"));
        assertTrue("준비물 체크(도구)는 그대로", read("src/main/webapp/js/tools.js").contains("RF.gearList("));
    }
}
