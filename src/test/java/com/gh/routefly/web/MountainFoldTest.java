package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 산 페이지 칸 접기(2026-11-20 홍TV님 "좁혔다 펼 수 있게 해줘. 이들끼리는 서로 토글 되게") - 코스 · 벚꽃 · 단풍 시기 · 선정 이유 · 자주 묻는 질문 · 산행 안전 팁. */
public class MountainFoldTest {

    @Test
    public void 접는_칸() throws Exception {
        assertEquals("<section class=\"faq\"><details class=\"fold sec\" name=\"msec\"><summary><h2 class=\"ft\">계룡산 자주 묻는 질문</h2><span class=\"fa\">▾</span></summary>"
                + "<div class=\"fb\"><dl><dt>a</dt></dl></div></details></section>",
                MountainServlet.foldSec("<section class=\"faq\"><h2>계룡산 자주 묻는 질문</h2><dl><dt>a</dt></dl></section>", false));
        assertTrue("코스만 처음에 펴 둠", MountainServlet.foldSec("<section id=\"trails\"><h2>코스 13개</h2><ul></ul></section>", true).startsWith("<section id=\"trails\"><details class=\"fold sec\" name=\"msec\" open>"));
        assertEquals("빈 칸(선정 이유가 없는 산 등)은 빈 글", "", MountainServlet.foldSec("", false));
        assertEquals("꼴이 다르면 그대로", "<p>x</p>", MountainServlet.foldSec("<p>x</p>", false));
        // 안전 팁 함수 자체는 그대로(코스 페이지 · 목록이 펼친 채 씀) - 산 페이지에서만 접음
        assertTrue(MountainServlet.tips().startsWith("<section><h2>⚠ 산행 안전 팁</h2>"));
        // 🥾 코스 n개 바로 보기는 빨강 계열(2026-11-20 홍TV님 "빨강색 계통으로")
        String css = java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/css/mountain.css"));
        assertTrue(css.contains(".jump a { display:inline-flex; align-items:center; min-height:44px; padding:0 14px; border-radius:22px; border:1px solid rgba(255,135,135,0.5); background:rgba(232,80,91,0.12); color:#ff8787;"));
    }
}
