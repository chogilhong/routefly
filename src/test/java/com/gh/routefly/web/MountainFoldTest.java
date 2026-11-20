package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 산 페이지 칸 접기(2026-11-20 홍TV님 "좁혔다 펼 수 있게 해줘. 이들끼리는 서로 토글 되게") - 코스 · 벚꽃 · 단풍 시기 · 선정 이유 · 자주 묻는 질문 · 산행 안전 팁. */
public class MountainFoldTest {

    @Test
    public void 접는_칸() {
        assertEquals("<section class=\"faq\"><details class=\"fold sec\" name=\"msec\"><summary><h2 class=\"ft\">계룡산 자주 묻는 질문</h2><span class=\"fa\">▾</span></summary>"
                + "<div class=\"fb\"><dl><dt>a</dt></dl></div></details></section>",
                MountainServlet.foldSec("<section class=\"faq\"><h2>계룡산 자주 묻는 질문</h2><dl><dt>a</dt></dl></section>", false));
        assertTrue("코스만 처음에 펴 둠", MountainServlet.foldSec("<section id=\"trails\"><h2>코스 13개</h2><ul></ul></section>", true).startsWith("<section id=\"trails\"><details class=\"fold sec\" name=\"msec\" open>"));
        assertEquals("빈 칸(선정 이유가 없는 산 등)은 빈 글", "", MountainServlet.foldSec("", false));
        assertEquals("꼴이 다르면 그대로", "<p>x</p>", MountainServlet.foldSec("<p>x</p>", false));
        // 안전 팁 함수 자체는 그대로(코스 페이지 · 목록이 펼친 채 씀) - 산 페이지에서만 접음
        assertTrue(MountainServlet.tips().startsWith("<section><h2>⚠ 산행 안전 팁</h2>"));
    }
}
