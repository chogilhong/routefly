package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 주 인솔자 · 보조 인솔자(2026-10-28 홍TV님 "주 인솔자, 보조 인솔자 이렇게 하면 되지 않나?" - 추천대로).
 * 보조는 차량 수만큼, 회원도 위치를 받는 인솔자를 모두 봄, 방 끝내기 · 보조 내보내기 · 코드 바꾸기는 주 인솔자만, 내 폰 코드는 같은 사람.
 */
public class PartyLeadsTest {

    private static JsonObject joinLead(Party p, String code, String nick) {
        return call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"" + nick + "\",\"agree\":true}", T0);
    }

    @Test
    public void assistantsUpToBuses() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));   // 차 1대
        String chief = room.get("token").getAsString(), lc = room.get("leadCode").getAsString();
        assertTrue(room.get("chief").getAsBoolean());
        JsonObject a = joinLead(p, lc, "사무실");
        assertEquals("lead", a.get("role").getAsString());
        assertFalse("보조는 주 인솔자 아님", a.has("chief"));
        try { joinLead(p, lc, "몰래"); fail("차 1대면 보조 1명"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("보조 인솔자 자리")); }
        // 회원은 위치를 받는 사람을 모두 봄
        String h = call(p, "/join", "{\"code\":\"" + room.get("code").getAsString() + "\",\"nick\":\"회원\",\"agree\":true}", T0).get("token").getAsString();
        JsonObject v = call(p, "/view", tok(h), T0);
        assertTrue(member(v, "김대장").get("chief").getAsBoolean());
        assertEquals("lead", member(v, "사무실").get("role").getAsString());
        assertFalse(member(v, "사무실").has("chief"));
        // 보조가 나가면 자리가 다시 남
        call(p, "/leave", tok(a.get("token").getAsString()), T0);
        joinLead(p, lc, "다시");
        assertEquals(1, call(p, "/view", tok(chief), T0).get("assistMax").getAsInt());
    }

    @Test
    public void onlyChiefEndsKicksAndChangesCode() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String chief = room.get("token").getAsString(), lc = room.get("leadCode").getAsString();
        String a = joinLead(p, lc, "사무실").get("token").getAsString();
        int chiefId = member(call(p, "/view", tok(a), T0), "김대장").get("id").getAsInt();
        int aId = member(call(p, "/view", tok(chief), T0), "사무실").get("id").getAsInt();
        try { call(p, "/end", tok(a), T0); fail("보조는 방을 못 끝냄"); } catch (SecurityException e) { /* 맞음 */ }
        try { call(p, "/leadcode", tok(a), T0); fail("보조는 코드를 못 바꿈"); } catch (SecurityException e) { /* 맞음 */ }
        try { call(p, "/kick", "{\"token\":\"" + a + "\",\"id\":" + chiefId + "}", T0); fail("보조가 주 인솔자를"); } catch (RuntimeException e) { /* 맞음 */ }
        try { call(p, "/leave", tok(chief), T0); fail("주 인솔자는 방 끝내기로"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("방 끝내기")); }
        // 코드 바꾸기 - 옛 코드로는 못 들어옴, 이미 든 보조는 그대로
        String nc = call(p, "/leadcode", tok(chief), T0).get("leadCode").getAsString();
        assertNotEquals(lc, nc);
        try { joinLead(p, lc, "옛코드"); fail("옛 코드"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("코드가 바뀌")); }
        call(p, "/view", tok(a), T0);
        // 주 인솔자가 보조를 내보냄 → 자리가 남아 새 코드로 들어옴
        call(p, "/kick", "{\"token\":\"" + chief + "\",\"id\":" + aId + "}", T0);
        try { call(p, "/view", tok(a), T0); fail("내보낸 보조"); } catch (RuntimeException e) { /* 맞음 */ }
        assertEquals("lead", joinLead(p, nc, "새보조").get("role").getAsString());
        call(p, "/end", tok(chief), T0);
    }

    @Test
    public void myPhoneCodeIsSamePersonOnce() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String chief = room.get("token").getAsString(), lc = room.get("leadCode").getAsString();
        JsonObject mc = call(p, "/mecode", tok(chief), T0);
        String code = mc.get("code").getAsString();
        assertTrue(call(p, "/info", "{\"code\":\"" + code + "\"}", T0).get("meInvite").getAsBoolean());
        JsonObject phone = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"아무개\",\"agree\":true}", T0);
        assertEquals("같은 사람(같은 열쇠)", chief, phone.get("token").getAsString());
        assertTrue(phone.get("chief").getAsBoolean());
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"또\",\"agree\":true}", T0); fail("한 번만"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("보조 자리를 쓰지 않음", "lead", joinLead(p, lc, "사무실").get("role").getAsString());
        String late = call(p, "/mecode", tok(chief), T0).get("code").getAsString();
        try { call(p, "/join", "{\"code\":\"" + late + "\",\"nick\":\"늦음\",\"agree\":true}", T0 + Party.ME_CODE_MS + 1); fail("10분 지남"); } catch (RuntimeException e) { /* 맞음 */ }
        String a = call(p, "/view", tok(chief), T0).get("members").toString();
        assertFalse("내 폰 코드로 사람이 늘지 않음", a.contains("아무개"));
    }
}
