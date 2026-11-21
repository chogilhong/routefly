package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 산 · 코스 페이지 칸 제목 그림 글자 정리 · 글꼴(2026-11-21 홍TV님 "고급지게" 3번). 안전 칸(⛑️ · ⚠)과 코스 모음 메뉴 줄은 그대로. */
public class MountainTitleTidyTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    public void 칸_제목은_글만() throws Exception {
        assertTrue(MountainServlet.staySearchBox("두타산", false).contains("<span class=\"ft\">근처 숙소 찾기</span>"));
        assertTrue(MountainServlet.staySearchBox("Dutasan", true).contains("<span class=\"ft\">Find lodging near a place</span>"));
        assertTrue("코스 모음 메뉴 줄은 그대로", MountainServlet.staySearchBox(null, false).contains("<span class=\"ft\">🏨 근처 숙소 찾기</span>"));
        assertTrue(read("src/main/webapp/js/mountain.js").contains("offlineBox({ title: \"신호 없을 때 보기\""));
        assertTrue(read("src/main/webapp/js/mountain-en.js").contains("offlineBox({ title: \"Save for no signal\""));
        String ms = read("src/main/java/com/gh/routefly/web/MountainServlet.java");
        assertTrue("안전 칸은 그대로", ms.contains("<h2>⛑️ 오늘의 산행 안전</h2>") && ms.contains("<h2>⚠ 산행 안전 팁</h2>"));
    }

    @Test
    public void 글꼴_한_벌() throws Exception {
        String css = read("src/main/webapp/css/mountain.css");
        assertTrue(css.contains("--font:\"Pretendard\",\"Pretendard Variable\",system-ui,") && css.contains("font-family:var(--font);"));
        assertFalse("단추마다 따로 적은 글꼴 없음", css.contains("Arial,\"Malgun Gothic\",sans-serif"));
        assertFalse("내려받는 글꼴 없음", css.contains("@font-face") || css.contains("@import"));
    }
}
