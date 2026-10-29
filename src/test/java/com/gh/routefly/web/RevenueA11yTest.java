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
        assertTrue(ko.contains("id=\\\"stays\\\" data-name=") && en.contains("MountainServlet.staysBlock(peak, courses, true)"));   // 숙소 줄 + 근처 숙소 찾기 칸(2026-10-30)
        assertTrue("영어 산 페이지 · 목록에도 광고", en.split("Ads.box\\(\"m\", true\\)", -1).length - 1 == 2);
        assertTrue(read("src/main/webapp/js/mountain.js").contains("RF.staysLine(") && read("src/main/webapp/js/mountain-en.js").contains("RF.staysLine("));
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
}
