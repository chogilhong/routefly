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
        assertTrue("사이트맵 한 · 영 짝", sm.contains("xmlns:xhtml") && sm.contains("<loc>https://r.kr/en/m/gayasan</loc><xhtml:link rel=\"alternate\" hreflang=\"ko\" href=\"https://r.kr/m/%EA%B0%80%EC%95%BC%EC%82%B0\"/>"));
    }

    @Test
    public void staysLinkSameAsJs() {
        com.google.gson.JsonObject p = new com.google.gson.JsonObject();
        p.addProperty("trip", "https://kr.trip.com/hotels/?cityId=1&Allianceid=1&SID=2");
        String[] it = Stays.pick(p, 33.361667, 126.529167, "한라산");
        assertEquals("🏨 근처 숙소(트립닷컴)", it[0]);
        assertEquals("course-kit.test.js staysItem 과 같은 주소", "https://kr.trip.com/hotels/list?cityId=0&searchType=LM&searchWord=%ED%95%9C%EB%9D%BC%EC%82%B0&searchValue=13%7C0*13*33.361667%7C126.529167%7C%ED%95%9C%EB%9D%BC%EC%82%B0%7C0%7C1&listFilters=17~5*17*5&Allianceid=1&SID=2", it[1]);
        assertTrue(Stays.html(p, 33.361667, 126.529167, "한라산").contains("rel=\"noopener sponsored\"") && Stays.html(p, 1, 2, "x").contains("수수료"));
        assertEquals("설정이 없으면 없음", "", Stays.html(new com.google.gson.JsonObject(), 1, 2, "x"));
        assertTrue("1박 산은 위로", MountainServlet.overnight(com.google.gson.JsonParser.parseString("{\"id\":\"한라산\"}").getAsJsonObject()));
    }

    @Test
    public void cleanDropsInvisibleChars() {
        assertEquals("시험산악회", Party.clean("시험​산악‮회", 30));
        assertEquals("글자 단위로 자름(이모지가 반으로 갈리지 않게)", "가😀", Party.clean("가😀😀", 2));
    }
}
