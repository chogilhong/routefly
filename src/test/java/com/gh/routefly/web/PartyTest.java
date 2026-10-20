package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산악회 방(2026-10-20) - 만들기 · 참가 · 위치 · 누가 무엇을 보나 · 끝내면 지움. */
public class PartyTest {

    static final long T0 = 1_760_000_000_000L;

    static JsonObject j(String s) {
        return JsonParser.parseString(s).getAsJsonObject();
    }

    static JsonObject call(Party p, String path, String body, long now) {
        return PartyServlet.handle(p, path, j(body), now);
    }

    @Test
    public void flow() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"설악산 공룡능선 <b>\",\"endAt\":" + (T0 + 12 * 3600_000L) + "}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertTrue(code.matches("[A-HJ-NP-Z2-9]{6}"));
        assertEquals("꺾쇠는 뺌", "설악산 공룡능선 b", room.get("name").getAsString());

        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\"}", T0); fail("동의 없이 참가"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("동의")); }
        JsonObject a = call(p, "/join", "{\"code\":\"" + code.toLowerCase() + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0);
        String ta = a.get("token").getAsString();
        assertFalse("회원은 다른 사람 위치를 못 봄", a.has("members"));
        JsonObject d = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"기사님\",\"role\":\"driver\",\"agree\":true}", T0);
        String td = d.get("token").getAsString();

        call(p, "/loc", "{\"token\":\"" + ta + "\",\"lat\":38.1192,\"lon\":128.4656,\"acc\":12,\"batt\":64}", T0 + 60_000);
        call(p, "/loc", "{\"token\":\"" + ta + "\",\"lat\":38.1193,\"lon\":128.4657,\"acc\":9,\"batt\":63}", T0 + 20 * 60_000);   // 10m 남짓 - 그 자리
        JsonObject v = call(p, "/view", "{\"token\":\"" + lead + "\"}", T0 + 21 * 60_000);
        JsonObject m = v.getAsJsonArray("members").get(1).getAsJsonObject();
        assertEquals("철수", m.get("nick").getAsString());
        assertEquals(60, m.get("ago").getAsLong());
        assertEquals("20분째 그 자리", 20, m.get("stillMin").getAsLong());
        assertEquals(63, m.get("batt").getAsInt());
        assertTrue("운전자도 회원 위치를 봄", call(p, "/view", "{\"token\":\"" + td + "\"}", T0).has("members"));

        // 공지 · 버스는 인솔자(버스는 운전자도)만
        try { call(p, "/notice", "{\"token\":\"" + ta + "\",\"text\":\"x\"}", T0); fail(); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/notice", "{\"token\":\"" + lead + "\",\"text\":\"15시까지 소공원 주차장\"}", T0);
        call(p, "/bus", "{\"token\":\"" + td + "\",\"lat\":38.1726,\"lon\":128.4890}", T0);
        JsonObject seen = call(p, "/view", "{\"token\":\"" + ta + "\"}", T0);
        assertEquals("15시까지 소공원 주차장", seen.get("notice").getAsString());
        assertEquals(38.1726, seen.get("busLat").getAsDouble(), 1e-9);

        // SOS · 탑승
        call(p, "/loc", "{\"token\":\"" + ta + "\",\"lat\":38.12,\"lon\":128.47,\"sos\":true}", T0);
        assertTrue(call(p, "/view", "{\"token\":\"" + lead + "\"}", T0).getAsJsonArray("members").get(1).getAsJsonObject().get("sos").getAsBoolean());
        call(p, "/aboard", "{\"token\":\"" + ta + "\",\"on\":true}", T0);
        JsonObject after = call(p, "/view", "{\"token\":\"" + lead + "\"}", T0);
        assertEquals(1, after.get("aboardCount").getAsInt());
        assertFalse("탑승하면 SOS 풀림", after.getAsJsonArray("members").get(1).getAsJsonObject().get("sos").getAsBoolean());

        // 회원은 방을 못 끝냄, 인솔자가 끝내면 열쇠가 모두 사라짐
        try { call(p, "/end", "{\"token\":\"" + ta + "\"}", T0); fail(); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/end", "{\"token\":\"" + lead + "\"}", T0);
        assertEquals(0, p.size());
        try { call(p, "/view", "{\"token\":\"" + ta + "\"}", T0); fail(); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("끝났")); }
    }

    @Test
    public void badInputAndExpiry() {
        Party p = new Party();
        String lead = call(p, "/create", "{\"name\":\"북한산\"}", T0).get("token").getAsString();
        try { call(p, "/loc", "{\"token\":\"" + lead + "\",\"lat\":0,\"lon\":0}", T0); fail("한국 밖 좌표"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/join", "{\"code\":\"ZZZZZZ\",\"nick\":\"a\",\"role\":\"hiker\",\"agree\":true}", T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/create", "{\"name\":\"  \"}", T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals(1, p.size());
        p.sweep(T0 + Party.LIFE_MS + 1);
        assertEquals("30시간 지나면 지움", 0, p.size());
        assertNull(p.who(lead, T0 + Party.LIFE_MS + 2));
        assertEquals("철수 b", Party.clean("  철수\n<b>\t ", 12));
        assertNull(Party.clean("<>", 12));
    }
}
