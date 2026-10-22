package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 안내산악회 계정 · 일정(2026-10-22 홍TV님) - 가입 · 로그인 · 운영자 확인 뒤 공개 · 추천 먼저 · 자기 것만 · 파일. */
public class ClubsTest {

    static final long T0 = 1_760_000_000_000L, D = Clubs.DAY;

    static JsonObject j(String s) {
        return JsonParser.parseString(s).getAsJsonObject();
    }

    @Test
    public void signupLoginAndChecks() {
        Clubs s = new Clubs();
        String tok = s.signup("bandi_01", "pass1234", "반짝<b>산악회", "01000000000", "https://cafe.daum.net/x", T0);
        Clubs.Club c = s.who(tok, T0);
        assertEquals("반짝b산악회", c.name);
        assertEquals("010-0000-0000", c.phone);
        assertFalse("가입하면 확인 기다림", c.approved);
        assertFalse("비밀번호는 해시로만", c.pw.contains("pass1234"));
        assertNotNull(s.login("BANDI_01", "pass1234", T0 + 1));
        try { s.login("bandi_01", "wrong123", T0); fail(); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("아이디 또는 비밀번호")); }
        try { s.login("nobody", "pass1234", T0); fail(); } catch (IllegalArgumentException e) { assertTrue("없는 아이디도 같은 글", e.getMessage().contains("아이디 또는 비밀번호")); }
        try { s.signup("bandi_01", "pass1234", "x", "010-1111-2222", null, T0); fail("같은 아이디"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.signup("ab", "pass1234", "x", "010-1111-2222", null, T0); fail("짧은 아이디"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.signup("other1", "abcdefgh", "x", "010-1111-2222", null, T0); fail("숫자 없는 비번"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.signup("other1", "other1234", "x", "010-1111-2222", null, T0); fail("아이디가 든 비번"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.signup("other1", "pass1234", "x", "010-1111-2222", "javascript:alert(1)", T0); fail("https 만"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.signup("other1", "pass1234", "x", "010-1111-2222", "https://a.kr/\"onload=x", T0); fail("따옴표"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.signup("other1", "pass1234", "x", "010-1111-2222", "https://routefly/cafe/test", T0); fail(".com · .kr 없는 주소"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("https://xn--9m1bj1idyc.com/travel/detail.html?tid=3148182&tour_date=2026/10/23", Clubs.httpsUrl("https://xn--9m1bj1idyc.com/travel/detail.html?tid=3148182&tour_date=2026/10/23"));
        assertEquals("https://cafe.daum.net/abc", Clubs.httpsUrl(" https://cafe.daum.net/abc "));
        assertNull("로그인 30일 지나면 끝", s.who(tok, T0 + Clubs.SESSION_MS + 1));
        assertNull(s.who("x", T0));
        s.logout(tok);
        assertNull(s.who(tok, T0));
    }

    @Test
    public void tripsVisibleAfterApprovalFeaturedFirst() {
        Clubs s = new Clubs();
        Clubs.Club a = s.who(s.signup("clubaaa", "pass1234", "가산악회", "010-1111-1111", "https://a.kr", T0), T0);
        Clubs.Club b = s.who(s.signup("clubbbb", "pass1234", "나산악회", "010-2222-2222", null, T0), T0);
        s.saveTrip(a, null, T0 + 3 * D, "가야산", "가야산 만물상 당일", "사당 06:50", 39000, null, T0);
        Clubs.Trip tb = s.saveTrip(b, null, T0 + 5 * D, "가야산", "가야산 칠불봉", null, 0, "https://b.kr/book?id=3", T0);
        assertTrue("확인 전에는 안 보임", s.upcoming("가야산", T0, 10).isEmpty());
        s.approve(a.id, true); s.approve(b.id, true);
        assertEquals("날짜순", "가야산 만물상 당일", ((Clubs.Trip) s.upcoming("가야산", T0, 10).get(0)[0]).title);
        s.feature(b.id, 30, T0);
        assertEquals("추천이 먼저", "가야산 칠불봉", ((Clubs.Trip) s.upcoming("가야산", T0, 10).get(0)[0]).title);
        assertTrue(s.upcoming("설악산", T0, 10).isEmpty());
        String li = Clubs.item(tb, b, T0, false);
        assertTrue(li, li.contains("추천 · 광고") && li.contains("href=\"https://b.kr/book?id=3\"") && li.contains("rel=\"noopener nofollow\""));
        assertTrue("예약 주소가 없으면 누리집", Clubs.item(s.tripsOf(a, T0).get(0), a, T0, false).contains("href=\"https://a.kr\""));
        try { s.saveTrip(a, tb.id, T0 + D, "가야산", "남의 것", null, 0, null, T0); fail("남의 일정"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.deleteTrip(a, tb.id); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.saveTrip(a, null, T0 - 2 * D, "가야산", "지난", null, 0, null, T0); fail("지난 날"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("출발 하루 뒤 지움", 0, s.upcoming("가야산", T0 + 7 * D, 10).size());
        s.feature(b.id, 0, T0);
        assertFalse(b.featured(T0));

        // 처리(ClubServlet.handle) - 일정 올리기 · 지우기
        JsonObject me = ClubServlet.handle(s, a, "/trip", j("{\"departAt\":" + (T0 + 2 * D) + ",\"mountain\":\"설악산\",\"title\":\"공룡능선 무박\",\"price\":45000}"), T0);
        assertEquals(1, me.getAsJsonArray("trips").size());
        int id = me.getAsJsonArray("trips").get(0).getAsJsonObject().get("id").getAsInt();
        assertEquals(0, ClubServlet.handle(s, a, "/trip-delete", j("{\"id\":" + id + "}"), T0).getAsJsonArray("trips").size());
        JsonObject ad = ClubServlet.admin(s, "/admin/list", new JsonObject(), T0);
        assertEquals(2, ad.getAsJsonArray("clubs").size());
        assertFalse("운영자 목록에도 비밀번호 해시 없음", ad.toString().contains("pw"));
        String temp = ClubServlet.admin(s, "/admin/reset", j("{\"id\":" + a.id + "}"), T0).get("temp").getAsString();
        assertNotNull(s.login("clubaaa", temp, T0));
        s.delete(a);
        assertTrue("탈퇴하면 지움", s.all().stream().noneMatch(x -> x.id == a.id));
        assertTrue(s.tripsOf(a, T0).isEmpty());
    }

    @Test
    public void fileKeepsClubsTripsAndSessions() throws Exception {
        Path f = Files.createTempDirectory("clubs").resolve("clubs.json");
        Clubs s = new Clubs(f).lazySave();
        String tok;
        try {
            tok = s.signup("keepme1", "pass1234", "다산악회", "010-3333-3333", null, T0);
            s.saveTrip(s.who(tok, T0), null, T0 + D, "북한산", "백운대", null, 0, null, T0);
            s.flush();
        } finally { s.shutdown(); }
        assertFalse("로그인 열쇠는 파일에 그대로 안 씀", Files.readString(f).contains(tok));
        Clubs again = new Clubs(f);
        Clubs.Club c = again.who(tok, T0);
        assertEquals("다산악회", c.name);
        assertEquals(1, again.tripsOf(c, T0).size());
        assertNotNull(again.login("keepme1", "pass1234", T0));
    }
}
