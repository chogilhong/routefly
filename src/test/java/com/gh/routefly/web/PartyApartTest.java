package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 따로 귀가(2026-10-27 홍TV님 - 설악산에서 더 여행하다 오는 회원): 하산 인원에 들어가고 위치를 지움. 회원 스스로 · 인솔자 둘 다. */
public class PartyApartTest {

    @Test
    public void apart() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"onBus\":true,\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"onBus\":true,\"agree\":true}", T0).get("token").getAsString();
        departAll(p, lead, DEPART);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.12,\"lon\":128.46}", DEPART + H);

        JsonObject me = call(p, "/aboard", "{\"token\":\"" + a + "\",\"on\":true,\"apart\":true}", DEPART + 5 * H);
        assertTrue(me.get("aboard").getAsBoolean());
        assertTrue(me.get("apart").getAsBoolean());
        JsonObject v = call(p, "/view", tok(lead), DEPART + 5 * H);
        assertTrue(member(v, "철수").get("apart").getAsBoolean());
        assertFalse("위치 지움", member(v, "철수").has("lat"));
        assertEquals("하산 인원에 들어감", 1, v.get("aboardCount").getAsInt());
        assertEquals(1, v.get("apartCount").getAsInt());

        int bId = member(v, "영희").get("id").getAsInt();
        v = call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + bId + ",\"what\":\"apart\",\"on\":true}", DEPART + 5 * H);
        assertEquals(2, v.get("aboardCount").getAsInt());
        assertEquals(2, v.get("apartCount").getAsInt());
        v = call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + bId + ",\"what\":\"aboard\",\"on\":true}", DEPART + 5 * H);
        assertFalse("하산 탐으로 바꾸면 따로 귀가 아님", member(v, "영희").has("apart"));
        assertEquals(1, v.get("apartCount").getAsInt());
        v = call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + bId + ",\"what\":\"aboard\",\"on\":false}", DEPART + 5 * H);
        assertEquals("되돌리기", 1, v.get("aboardCount").getAsInt());
        try { call(p, "/mark", "{\"token\":\"" + b + "\",\"id\":" + bId + ",\"what\":\"apart\",\"on\":true}", DEPART); fail("회원은 남을 못 바꿈"); }
        catch (SecurityException e) { /* 맞음 */ }
    }
}
