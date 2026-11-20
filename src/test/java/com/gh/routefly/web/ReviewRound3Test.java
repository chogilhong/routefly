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
    public void officeRoomsSkipsSameEnded() {
        Party p = new Party();
        com.google.gson.JsonObject o = PartyTest.call(p, "/office/create", "{\"name\":\"시험산악회\"}", PartyTest.T0);
        String key = o.get("key").getAsString();
        com.google.gson.JsonObject first = p.officeRooms(key, PartyTest.T0, null);
        assertTrue(first.has("ended"));
        String sig = first.get("endedSig").getAsString();
        assertFalse("같으면 끝난 산행을 다시 보내지 않음", p.officeRooms(key, PartyTest.T0, sig).has("ended"));
        assertTrue("다르면 보냄", p.officeRooms(key, PartyTest.T0, "9:1").has("ended"));
    }

    @Test
    public void searchExtras() {
        com.google.gson.JsonObject peak = com.google.gson.JsonParser.parseString("{\"lat\":35.8,\"lon\":128.1}").getAsJsonObject();
        String ko = MountainServlet.jsonLd(peak, "가야산", "https://r.kr/m/%EA%B0%80%EC%95%BC%EC%82%B0"), en = MountainServlet.jsonLd(peak, "Gayasan", "https://r.kr/en/m/gayasan");
        assertTrue(ko.contains("\"BreadcrumbList\"") && ko.contains("\"100대 명산 코스\"") && ko.contains("\"item\":\"https://r.kr/m/\""));
        assertTrue(en.contains("\"100 famous mountains\"") && en.contains("\"item\":\"https://r.kr/en/m/\""));
        String sm = SitemapServlet.sitemap("https://r.kr", java.util.List.of("가야산"), java.util.List.of());
        assertTrue("사이트맵 한 · 영 짝", sm.contains("xmlns:xhtml") && sm.contains("<loc>https://r.kr/en/m/gayasan</loc><lastmod>2026-11-04</lastmod><xhtml:link rel=\"alternate\" hreflang=\"ko\" href=\"https://r.kr/m/%EA%B0%80%EC%95%BC%EC%82%B0\"/>"));
    }

    @Test
    public void staysLinkSameAsJs() {
        // 2026-11-04 홍TV님 "코스 페이지도 똑같이": 코스 페이지(/c/)의 서버 트립닷컴 한 줄(Stays)은 빼고 산 페이지처럼 숙소 찾기 칸만 - CourseStaySearchTest
        // 2026-11-21 홍TV님 "다른 산들도 한라산 처럼 위로": 1박 산만 위였던 숙소 칸 · 쏘카를 모든 산에서 안전 칸 아래 · 코스 칸 위로(한국어 · 영어)
        com.google.gson.JsonObject gaya = null;
        try (java.io.Reader r = java.nio.file.Files.newBufferedReader(java.nio.file.Path.of("src/main/webapp/data/mountains100.json"))) {
            for (com.google.gson.JsonElement e : com.google.gson.JsonParser.parseReader(r).getAsJsonObject().getAsJsonArray("peaks"))
                if ("가야산".equals(e.getAsJsonObject().get("id").getAsString())) gaya = e.getAsJsonObject();
        } catch (java.io.IOException e) {
            fail(e.toString());
        }
        String ko = MountainServlet.page(gaya, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "", 11);
        int safe = ko.indexOf("id=\"safe\""), stay = ko.indexOf("id=\"staySearch\""), trails = ko.indexOf("id=\"trails\"");
        assertTrue(ko.indexOf("id=\"staySearch\"", stay + 1) < 0);
        assertTrue("숙소 칸은 안전 아래 · 코스 위", safe > 0 && safe < stay && stay < trails);
        String en = MountainEn.page(gaya, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "https://r.kr");
        int eSafe = en.indexOf("id=\"safe\""), eStay = en.indexOf("id=\"staySearch\""), eTrails = en.indexOf("id=\"trails\"");
        assertTrue("영어도", eSafe > 0 && eSafe < eStay && eStay < eTrails);
    }

    @Test
    public void cleanDropsInvisibleChars() {
        assertEquals("시험산악회", Party.clean("시험​산악‮회", 30));
        assertEquals("글자 단위로 자름(이모지가 반으로 갈리지 않게)", "가😀", Party.clean("가😀😀", 2));
    }
}
