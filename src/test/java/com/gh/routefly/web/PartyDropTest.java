package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 하차 지점(2026-10-28 홍TV님 - 회원을 한계령 · 오색 · 소공원 등 여러 곳에 내려 주고, 인솔자도 골라 내려 산행하거나 버스에서 쉼).
 * 회원은 참가할 때 · 인솔자는 명단에서 아무나 · "버스 대기" 는 늘 됨, 목록에 없는 곳은 안 됨, 사무실 화면에 하차 지점마다 몇 명 · 인솔자 하차.
 */
public class PartyDropTest {

    @Test
    public void dropOffPoints() {
        Party p = new Party();
        JsonObject o = call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        JsonObject room = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,"
                + "\"drops\":\"한계령, 오색, 소공원\",\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString(), key = o.get("key").getAsString();
        assertEquals("[\"한계령\",\"오색\",\"소공원\"]", call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonArray("drops").toString());
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"drop\":\"한계령\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"agree\":true}", T0);
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"민수\",\"drop\":\"대청봉\",\"agree\":true}", T0); fail("목록에 없는 곳"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("하차 지점")); }
        assertEquals("한계령", call(p, "/view", tok(a), T0).get("drop").getAsString());
        // 인솔자가 명단에서 영희를 오색으로, 자기는 버스 대기
        int yid = member(call(p, "/view", tok(lead), T0), "영희").get("id").getAsInt();
        call(p, "/drop", "{\"token\":\"" + lead + "\",\"id\":" + yid + ",\"drop\":\"오색\"}", T0);
        call(p, "/drop", "{\"token\":\"" + lead + "\",\"drop\":\"" + Party.BUS_STAY + "\"}", T0);
        try { call(p, "/drop", "{\"token\":\"" + a + "\",\"id\":" + yid + ",\"drop\":\"한계령\"}", T0); fail("회원은 남의 것 못 바꿈"); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/drop", "{\"token\":\"" + a + "\",\"drop\":\"소공원\"}", T0);   // 회원은 자기 것은 바꿈
        JsonObject hv = call(p, "/view", tok(a), T0);
        assertNull("회원은 남의 하차 지점을 못 봄", member(hv, "영희").get("drop"));
        assertEquals("회원은 인솔자 하차는 봄", Party.BUS_STAY, member(hv, "시험대장").get("drop").getAsString());
        JsonObject r = call(p, "/office/rooms", "{\"key\":\"" + key + "\"}", T0).getAsJsonArray("rooms").get(0).getAsJsonObject();
        assertEquals("{\"소공원\":1,\"오색\":1}", r.getAsJsonObject("drops").toString());
        assertEquals(Party.BUS_STAY, r.get("chiefDrop").getAsString());
    }
}
