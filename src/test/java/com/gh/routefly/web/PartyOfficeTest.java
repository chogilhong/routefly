package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 회사 사무실 · 안전한 방 끝내기(2026-10-28 홍TV님 "지금 얘기한 것 모두 구현해줘").
 * 사무실 링크(비밀 열쇠)로 여러 방을 숫자로 봄, 방을 열면 사무실 자리(보조 자리 안 씀 · 위치 안 보냄), 회원도 사무실을 받는 사람으로 봄,
 * SOS 중에는 끝내기 막음, 하산 미확인은 force 로만, 끝나면 요약(이름 · 좌표 없음)이 사무실에 남음, 사무실도 끝낼 수 있음.
 */
public class PartyOfficeTest {

    private static JsonObject office(Party p) {
        return call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
    }

    private static String room(Party p, String officeCode) {
        return call(p, "/create", "{\"name\":\"한라산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28"
                + (officeCode != null ? ",\"office\":\"" + officeCode + "\"" : "") + "}", T0).toString();
    }

    @Test
    public void officeSeesRoomsAndEnters() {
        Party p = new Party();
        JsonObject o = office(p);
        String key = o.get("key").getAsString(), oc = o.get("code").getAsString();
        assertTrue(key.length() >= 30);
        try { room(p, "ZZZZZZ"); fail("틀린 회사 코드"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("회사 코드")); }
        assertEquals("틀린 코드면 방도 안 만들어짐", 0, p.size());
        JsonObject r = j(room(p, oc));
        String code = r.get("code").getAsString(), chief = r.get("token").getAsString();
        assertEquals("시험산악회", r.get("office").getAsString());
        room(p, null);   // 다른 회사 · 연결 없는 방은 안 보임
        String h = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"회원\",\"seat\":3,\"agree\":true}", T0).get("token").getAsString();
        assertEquals("회원도 사무실을 받는 사람으로 봄", "시험산악회", call(p, "/view", tok(h), T0).get("office").getAsString());

        JsonObject list = call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", T0);
        JsonArray rooms = list.getAsJsonArray("rooms");
        assertEquals(1, rooms.size());
        assertEquals(1, rooms.get(0).getAsJsonObject().get("hikers").getAsInt());
        JsonObject one = rooms.get(0).getAsJsonObject();
        assertEquals("인솔자 연락처 - 사무실이 바로 전화", "010-0000-0000", one.get("leaderPhone").getAsString());
        assertEquals("[28]", one.getAsJsonArray("busSeats").toString());
        assertFalse("목록에는 이름 · 위치 없음", list.toString().contains("회원") || list.toString().contains("\"lat\""));
        try { call(p, "/office/rooms", "{\"key\":\"" + key.substring(1) + "x\"}", T0); fail("틀린 열쇠"); } catch (SecurityException e) { /* 맞음 */ }

        // 열기 - 사무실 자리(같은 자리를 다시 줌), 보조 자리를 쓰지 않음, 위치를 받지 않음
        JsonObject v = call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0);
        String ot = v.get("token").getAsString();
        assertTrue(v.get("officeMe").getAsBoolean());
        assertFalse(v.has("chief"));
        assertEquals(ot, call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0).get("token").getAsString());
        assertEquals("lead", call(p, "/join", "{\"code\":\"" + r.get("leadCode").getAsString() + "\",\"nick\":\"보조\",\"agree\":true}", T0).get("role").getAsString());
        assertEquals("보조 이름은 보이고 사무실 자리는 빠짐", "[\"보조\"]", call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", T0).getAsJsonArray("rooms").get(0).getAsJsonObject().getAsJsonArray("assistantNames").toString());
        assertFalse("사무실 위치는 버림", call(p, "/loc", "{\"token\":\"" + ot + "\",\"lat\":37.5,\"lon\":127.0}", DEPART).get("locKept").getAsBoolean());
        int oid = member(call(p, "/view", tok(chief), T0), "시험산악회 사무실").get("id").getAsInt();
        try { call(p, "/kick", "{\"token\":\"" + chief + "\",\"id\":" + oid + "}", T0); fail("사무실은 못 내보냄"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        // 다른 회사 열쇠로는 못 엶
        String other = office(p).get("key").getAsString();
        try { call(p, "/office/enter", "{\"key\":\"" + other + "\",\"code\":\"" + code + "\"}", T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        // 빼기
        call(p, "/office/detach", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0);
        assertEquals(0, call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", T0).getAsJsonArray("rooms").size());
        assertFalse(call(p, "/view", tok(h), T0).has("office"));
        // 방을 만든 뒤 주 인솔자가 회사 코드로 올림
        call(p, "/link", "{\"token\":\"" + chief + "\",\"office\":\"" + oc + "\"}", T0);
        assertEquals(1, call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", T0).getAsJsonArray("rooms").size());
    }

    @Test
    public void safeEndAndSummary() {
        Party p = new Party();
        JsonObject o = office(p);
        String key = o.get("key").getAsString();
        JsonObject r = j(room(p, o.get("code").getAsString()));
        String code = r.get("code").getAsString(), chief = r.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"seat\":1,\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"seat\":2,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", tok(a), DEPART - H);
        call(p, "/board", tok(b), DEPART - H);
        departAll(p, chief, DEPART);
        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":true}", DEPART + H);
        try { call(p, "/end", "{\"token\":\"" + chief + "\",\"force\":true}", DEPART + H); fail("SOS 중"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("SOS")); }
        assertEquals(1, call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", DEPART + H).getAsJsonArray("rooms").get(0).getAsJsonObject().get("sos").getAsInt());
        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":false}", DEPART + H);
        call(p, "/aboard", "{\"token\":\"" + a + "\",\"on\":true}", END - H);
        try { call(p, "/end", tok(chief), END - H); fail("영희 하산 미확인"); } catch (Party.NotDown e) { assertTrue(e.getMessage().contains("1명") && e.getMessage().contains("영희")); }
        // 사무실이 끝냄(force) - 요약이 남음
        String ot = call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", END - H).get("token").getAsString();
        call(p, "/end", "{\"token\":\"" + ot + "\",\"force\":true}", END - H);
        JsonObject list = call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", END);
        assertEquals(0, list.getAsJsonArray("rooms").size());
        JsonObject s = list.getAsJsonArray("ended").get(0).getAsJsonObject();
        assertEquals("사무실", s.get("by").getAsString());
        assertEquals(2, s.get("hikers").getAsInt());
        assertEquals(1, s.get("aboard").getAsInt());
        assertEquals(1, s.get("notDown").getAsInt());
        assertTrue(s.get("sosEver").getAsBoolean());
        assertFalse("요약에 이름 없음", s.toString().contains("영희") || s.toString().contains("철수"));
        // 출발 전 취소 - 사유가 남고, 하산 확인은 묻지 않음
        JsonObject r2 = j(room(p, o.get("code").getAsString()));
        call(p, "/join", "{\"code\":\"" + r2.get("code").getAsString() + "\",\"nick\":\"민수\",\"agree\":true}", T0);
        call(p, "/end", "{\"token\":\"" + r2.get("token").getAsString() + "\",\"cancel\":true,\"why\":\"태풍\"}", T0 + H);
        JsonObject c = call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", T0 + H).getAsJsonArray("ended").get(0).getAsJsonObject();
        assertTrue(c.get("cancelled").getAsBoolean());
        assertEquals("태풍", c.get("why").getAsString());
        assertEquals("주 인솔자", c.get("by").getAsString());
    }
}
