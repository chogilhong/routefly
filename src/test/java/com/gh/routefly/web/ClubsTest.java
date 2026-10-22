package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 안내산악회 일정(2026-10-22 홍TV님) - 관리 링크(아이디 · 비밀번호 없음): 신청 → 운영자 확인 · 링크 → 링크로 로그인,
 * 확인 뒤에만 공개 · 광고는 2개까지 · 예약 주소는 누리집과 같은 곳 · 여러 일정 한꺼번에 · 파일.
 */
public class ClubsTest {

    static final long T0 = 1_760_000_000_000L, D = Clubs.DAY;

    static JsonObject j(String s) {
        return JsonParser.parseString(s).getAsJsonObject();
    }

    /** 신청 → 확인 → 관리 링크 → 로그인. */
    static Clubs.Club ready(Clubs s, String name, String url) {
        Clubs.Club c = s.apply(name, "010-0000-0000", null, url, T0);
        s.approve(c.id, true);
        String key = s.newLink(c.id);
        return s.who(s.enter(key, T0), T0);
    }

    @Test
    public void applyApproveLink() {
        Clubs s = new Clubs();
        Clubs.Club c = s.apply("반짝<b>산악회", "01000000000", "02-000-0000", "https://cafe.daum.net/x", T0);
        assertEquals("반짝b산악회", c.name);
        assertEquals("010-0000-0000", c.phone);
        assertFalse(c.approved);
        try { s.newLink(c.id); fail("확인 전에는 링크 없음"); } catch (IllegalStateException e) { /* 맞음 */ }
        s.approve(c.id, true);
        String key = s.newLink(c.id);
        assertNull("틀린 링크", s.enter(key + "x", T0));
        String tok = s.enter(key, T0);
        assertEquals(c.id, s.who(tok, T0).id);
        String key2 = s.newLink(c.id);
        assertNull("링크를 새로 만들면 옛 링크 · 로그인 끊김", s.who(tok, T0));
        assertNull(s.enter(key, T0));
        assertNotNull(s.enter(key2, T0));
        s.approve(c.id, false);
        assertNull("확인을 풀면 로그인도 안 됨", s.enter(key2, T0));
        try { s.apply("x", "010-1111-2222", null, "https://routefly/cafe/test", T0); fail(".com · .kr 없는 주소"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.apply("x", "010-1111-2222", null, "javascript:alert(1)", T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { s.apply("x", "", null, null, T0); fail("연락처 없음"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("https://xn--9m1bj1idyc.com/travel/detail.html?tid=3148182&tour_date=2026/10/23", Clubs.httpsUrl("https://xn--9m1bj1idyc.com/travel/detail.html?tid=3148182&tour_date=2026/10/23"));
        assertEquals("반더룽.com", Clubs.host("https://xn--9m1bj1idyc.com/travel/detail.html?tid=1"));
    }

    @Test
    public void sessionsCappedAndPendingPurged() {
        Clubs s = new Clubs();
        Clubs.Club c = s.apply("가", "010-0000-0000", null, null, T0);
        s.approve(c.id, true);
        String key = s.newLink(c.id), first = s.enter(key, T0);
        for (int i = 0; i < Clubs.MAX_SESSIONS; i++) s.enter(key, T0 + i + 1);
        assertNull("한 산악회 로그인은 10개까지 - 오래된 것부터", s.who(first, T0 + 100));
        Clubs.Club p = s.apply("확인 안 됨", "010-0000-0000", null, null, T0);
        assertTrue(s.all(T0 + D).stream().anyMatch(x -> x.id == p.id));
        assertFalse("확인 안 된 신청은 14일 뒤 지움", s.all(T0 + 15 * D).stream().anyMatch(x -> x.id == p.id));
    }

    @Test
    public void tripsAdsAndHosts() {
        Clubs.mountains(Set.of("가야산", "설악산"));
        try {
            Clubs s = new Clubs();
            Clubs.Club a = ready(s, "가산악회", "https://a.kr");
            Clubs.Club b = ready(s, "나산악회", "https://cafe.daum.net/bbb");
            s.saveTrip(a, null, T0 + 3 * D, "가야산", "가야산 만물상 당일", "사당 06:50", 39000, "https://a.kr/t/1", 0, T0);
            List<Clubs.Trip> rep = s.saveTrip(b, null, T0 + 2 * D, "가야산", "가야산 칠불봉", null, 0, null, 3, T0);
            assertEquals("3주 더 반복", 4, rep.size());
            assertEquals(T0 + 2 * D + 21 * D, rep.get(3).departAt);
            try { s.saveTrip(a, null, T0 + D, "가야산(합천)", "x", null, 0, null, 0, T0); fail("100대 명산 목록에 없음"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("기타")); }
            assertEquals("기타", s.saveTrip(a, null, T0 + D, "기타", "운문산", null, 0, null, 0, T0).get(0).mountain);
            try { s.saveTrip(a, null, T0 + D, "가야산", "x", null, 0, "https://phish.example.com/a", 0, T0); fail("누리집과 다른 곳"); } catch (IllegalArgumentException e) { /* 맞음 */ }
            try { s.saveTrip(b, rep.get(0).id + 100, T0 + D, "가야산", "x", null, 0, null, 0, T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }

            // 광고 - 2개까지만 위로, 나머지는 날짜순 안에
            s.feature(b.id, 30, T0);
            List<Object[]> l = s.upcoming("가야산", T0, 10, Clubs.MAX_ADS);
            assertEquals(5, l.size());
            assertTrue((Boolean) l.get(0)[2] && (Boolean) l.get(1)[2] && !(Boolean) l.get(2)[2]);
            assertEquals("광고가 아닌 첫 줄은 날짜순", "가야산 만물상 당일", ((Clubs.Trip) l.get(2)[0]).title);
            String li = Clubs.item((Clubs.Trip) l.get(0)[0], b, true, T0);
            assertTrue(li, li.contains("<span class=\"ad\">광고</span>") && li.contains("rel=\"sponsored noopener nofollow\"") && li.contains("cafe.daum.net"));
            assertFalse("공개 번호가 없으면 전화 안 보임", li.contains("tel:"));

            // 누리집을 바꾸면 다시 확인
            assertTrue(s.edit(a, "가산악회", "010-0000-0000", null, "https://other.kr", null, 1, 28));
            assertFalse(a.approved);
            assertTrue("다시 확인 전에는 안 보임", s.upcoming("가야산", T0, 10, 2).stream().noneMatch(x -> ((Clubs.Club) x[1]).id == a.id));
            assertFalse("같은 곳이면 그대로", s.edit(b, "나", "010-0000-0000", "02-000-0000", "https://cafe.daum.net/bbb2", "사당, 양재", 2, 45));
            assertEquals("기본 탑승지", "사당, 양재", s.saveTrip(b, null, T0 + D, "설악산", "공룡", null, 0, null, 0, T0).get(0).stops);
        } finally {
            Clubs.mountains(Set.of());
        }
    }

    @Test
    public void bulkPaste() {
        Clubs.mountains(Set.of("가야산", "설악산"));
        try {
            String text = "10/25 07:00 가야산 만물상 당일 39,000원 https://a.kr/1\n1026 0650 설악산 공룡능선 무박 4만원\n2026-11-01 운문산 산행\n그냥 글\n１０/２７　가야산　칠불봉";
            JsonObject p = Clubs.parseTrips(text, T0);   // T0 = 2025-10-09
            assertEquals(4, p.getAsJsonArray("trips").size());
            assertEquals(1, p.getAsJsonArray("bad").size());
            JsonObject t1 = p.getAsJsonArray("trips").get(0).getAsJsonObject();
            assertEquals("가야산", t1.get("mountain").getAsString());
            assertEquals("가야산 만물상 당일", t1.get("title").getAsString());
            assertEquals(39000, t1.get("price").getAsInt());
            assertEquals("10/25(토) 07:00", Clubs.when(t1.get("departAt").getAsLong()));
            JsonObject t2 = p.getAsJsonArray("trips").get(1).getAsJsonObject();
            assertEquals(40000, t2.get("price").getAsInt());
            assertEquals("10/26(일) 06:50", Clubs.when(t2.get("departAt").getAsLong()));
            assertEquals("100대 명산이 없으면 기타", "기타", p.getAsJsonArray("trips").get(2).getAsJsonObject().get("mountain").getAsString());
            assertEquals("전각 숫자 · 빈칸", "10/27(월) 07:00", Clubs.when(p.getAsJsonArray("trips").get(3).getAsJsonObject().get("departAt").getAsLong()));

            Clubs s = new Clubs();
            Clubs.Club a = ready(s, "가", "https://a.kr");
            JsonObject r = ClubServlet.handle(s, a, "/bulk", j("{\"text\":" + new com.google.gson.Gson().toJson(text) + ",\"save\":false}"), T0);
            assertEquals("미리보기는 넣지 않음", 0, r.getAsJsonArray("trips").size());
            r = ClubServlet.handle(s, a, "/bulk", j("{\"text\":" + new com.google.gson.Gson().toJson(text) + ",\"save\":true}"), T0);
            assertEquals("2026-11-01 은 T0 에서 180일 넘어 못 넣음", 3, r.getAsJsonArray("trips").size());
            assertTrue(r.getAsJsonObject("bulk").getAsJsonArray("bad").toString().contains("180일"));
        } finally {
            Clubs.mountains(Set.of());
        }
    }

    @Test
    public void servletHandleAndAdmin() {
        Clubs s = new Clubs();
        Clubs.Club a = ready(s, "가", "https://a.kr");
        JsonObject me = ClubServlet.handle(s, a, "/trip", j("{\"departAt\":" + (T0 + 2 * D) + ",\"mountain\":\"설악산\",\"title\":\"공룡능선\",\"price\":45000}"), T0);
        assertEquals(1, me.getAsJsonArray("trips").size());
        assertEquals("화면은 한국 시각 글", Clubs.when(T0 + 2 * D), me.getAsJsonArray("trips").get(0).getAsJsonObject().get("when").getAsString());
        int id = me.getAsJsonArray("trips").get(0).getAsJsonObject().get("id").getAsInt();
        assertEquals(0, ClubServlet.handle(s, a, "/trip-delete", j("{\"id\":" + id + "}"), T0).getAsJsonArray("trips").size());
        try { ClubServlet.handle(s, a, "/trip-delete", j("{\"id\":\"abc\"}"), T0); fail(); } catch (IllegalArgumentException e) { assertFalse("내부 글 없음", e.getMessage().contains("For input")); }
        JsonObject ad = ClubServlet.admin(s, "/admin/list", new JsonObject(), T0);
        assertEquals(1, ad.getAsJsonArray("clubs").size());
        assertFalse("목록에 링크 해시 없음", ad.toString().contains("linkHash"));
        String key = ClubServlet.admin(s, "/admin/link", j("{\"id\":" + a.id + "}"), T0).get("key").getAsString();
        assertNotNull(s.enter(key, T0));
        ClubServlet.admin(s, "/admin/delete", j("{\"id\":" + a.id + "}"), T0);
        assertNull(s.enter(key, T0));
    }

    @Test
    public void fileKeepsAndBrokenFileIsNotOverwritten() throws Exception {
        Path dir = Files.createTempDirectory("clubs"), f = dir.resolve("clubs.json");
        Clubs s = new Clubs(f).lazySave();
        String tok;
        long now = System.currentTimeMillis();   // 파일 쓰기는 지금 시각으로 지난 것을 지우므로
        try {
            Clubs.Club c = s.apply("다산악회", "010-0000-0000", null, null, now);
            s.approve(c.id, true);
            tok = s.enter(s.newLink(c.id), now);
            s.saveTrip(c, null, now + D, "북한산", "백운대", null, 0, null, 0, now);
            s.flush();
        } finally { s.shutdown(); }
        assertFalse("로그인 열쇠는 파일에 그대로 안 씀", Files.readString(f).contains(tok));
        Clubs again = new Clubs(f);
        Clubs.Club c = again.who(tok, now);
        assertEquals("다산악회", c.name);
        assertEquals(1, again.tripsOf(c, now).size());

        Files.writeString(f, "{\"v\":2,\"clubs\":[{\"id\":1}]}");   // 망가진 파일
        Clubs bad = new Clubs(f);
        assertTrue(bad.broken());
        bad.apply("새", "010-0000-0000", null, null, T0);
        bad.flush();
        assertTrue("망가진 파일은 덮어쓰지 않음", Files.readString(f).contains("\"id\":1}"));
        try (var ls = Files.list(dir)) { assertTrue(ls.anyMatch(x -> x.getFileName().toString().startsWith("clubs.json.bad-"))); }
    }
}
