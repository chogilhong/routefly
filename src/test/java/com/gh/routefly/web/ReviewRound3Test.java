package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

/** 2026-10-29 점검 3묶음(홍TV님 "작업해") - 만들기 한도 자리 잡기, 오래 안 쓴 빈 사무실 정리, 이름의 숨은 글자. */
public class ReviewRound3Test {

    @Test
    public void quotaReserveIsAtomic() {
        PartyServlet.Quota one = new PartyServlet.Quota(3, 1000), all = new PartyServlet.Quota(4, 1000);
        // 한꺼번에 보낸 요청도 자리를 먼저 잡으므로 넘치지 않음
        int ok = 0;
        for (int i = 0; i < 10; i++) if (PartyServlet.reserve(one, "1.2.3.4", all, 0)) ok++;
        assertEquals(3, ok);
        assertTrue(PartyServlet.reserve(one, "5.6.7.8", all, 0));
        assertFalse("서버 전체 한도", PartyServlet.reserve(one, "9.9.9.9", all, 0));
        assertTrue("전체에 막히면 IP 자리는 돌려줌", one.take("9.9.9.9", 0));
        one.give("1.2.3.4", 0);
        all.give("*", 0);
        assertTrue("실패한 요청은 돌려줘서 다시 됨", PartyServlet.reserve(one, "1.2.3.4", all, 0));
    }

    @Test
    public void idleEmptyOfficesAreRemoved() {
        PartyOffice po = new PartyOffice(null);
        PartyOffice.Office a = po.create("시험산악회", "AAAAAA", 0), b = po.create("시험관광", "BBBBBB", 0), c = po.create("시험여행", "CCCCCC", 0);
        long later = PartyOffice.IDLE_MS + 1000;
        po.seen(b, later - 1000);   // 최근에 화면을 엶
        com.google.gson.JsonObject sum = new com.google.gson.JsonObject();
        sum.addProperty("endedAt", later - 1000);
        po.ended("CCCCCC", sum, later - 1000);   // 끝난 산행 요약이 있음
        Set<String> linked = new HashSet<>();
        assertEquals(1, po.sweepIdle(later, linked));
        assertNull("1년 안 쓴 빈 사무실만 지움", po.byCode("AAAAAA"));
        assertNotNull(po.byCode("BBBBBB"));
        assertNotNull(po.byCode("CCCCCC"));
        PartyOffice.Office d = po.create("시험회사", "DDDDDD", 0);
        linked.add("DDDDDD");
        assertEquals("방이 올라와 있으면 지우지 않음", 0, po.sweepIdle(later, linked));
        assertNotNull(d);
        assertNotNull(a);
        assertNotNull(c);
    }

    @Test
    public void cleanDropsInvisibleChars() {
        assertEquals("시험산악회", Party.clean("시험​산악‮회", 30));
        assertEquals("글자 단위로 자름(이모지가 반으로 갈리지 않게)", "가😀", Party.clean("가😀😀", 2));
    }
}
