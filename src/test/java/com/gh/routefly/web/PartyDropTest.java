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
    /** 실제로 내린 곳(2026-10-28 홍TV님 "소공원 골랐다가 한계령에서 갑자기 생각을 바꿔 내리는 경우도") - 도착 안내 · 여기서 내려요 · 위치로 확인 · 계획 남김. */
    @Test
    public void actualDropOff() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,\"drops\":\"한계령, 오색, 소공원\"}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"마음바꿈\",\"drop\":\"소공원\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"깜빡\",\"drop\":\"소공원\",\"agree\":true}", T0).get("token").getAsString();
        String c = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"버스\",\"drop\":\"버스 대기\",\"agree\":true}", T0).get("token").getAsString();
        for (String t : new String[] {a, b, c}) call(p, "/board", tok(t), DEPART - H);
        PartyTest.departAll(p, lead, DEPART);
        long t1 = DEPART + 2 * H;
        try { call(p, "/arrive", "{\"token\":\"" + a + "\",\"drop\":\"한계령\"}", t1); fail("회원은 도착을 못 알림"); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/arrive", "{\"token\":\"" + lead + "\",\"drop\":\"한계령\",\"lat\":38.0838,\"lon\":128.4612}", t1);
        JsonObject av = call(p, "/view", tok(a), t1 + 60_000);
        assertEquals("버스 안 회원에게 하차 안내", "한계령", av.getAsJsonObject("arrive").get("drop").getAsString());
        call(p, "/alight", "{\"token\":\"" + a + "\",\"yes\":true}", t1 + 60_000);
        assertFalse("답하면 안내가 사라짐", call(p, "/view", tok(a), t1 + 2 * 60_000).has("arrive"));
        assertFalse("15분 지나면 안내 없음", call(p, "/view", tok(b), t1 + 16 * 60_000).has("arrive"));
        // 깜빡: 안 누르고 한계령에서 내림 - 15분 뒤에도 그 자리 둘레면 위치로 확인. 버스 대기는 버스가 서 있어도 내린 것 아님
        call(p, "/loc", "{\"token\":\"" + b + "\",\"lat\":38.0850,\"lon\":128.4630}", t1 + 15 * 60_000);
        call(p, "/loc", "{\"token\":\"" + c + "\",\"lat\":38.0838,\"lon\":128.4612}", t1 + 15 * 60_000);
        JsonObject lv = call(p, "/view", tok(lead), t1 + 16 * 60_000);
        JsonObject ma = member(lv, "마음바꿈"), mb = member(lv, "깜빡"), mc = member(lv, "버스");
        assertEquals("한계령", ma.get("drop").getAsString());
        assertEquals("me", ma.get("dropHow").getAsString());
        assertEquals("계획은 남김", "소공원", ma.get("dropPlan").getAsString());
        assertEquals("한계령", mb.get("drop").getAsString());
        assertEquals("auto", mb.get("dropHow").getAsString());
        assertEquals(Party.BUS_STAY, mc.get("drop").getAsString());
        assertFalse(mc.has("dropHow"));
        assertEquals("도착 기록 · 내린 사람 2명", 2, lv.getAsJsonArray("arrivals").get(0).getAsJsonObject().get("off").getAsInt());
        // 내린 뒤 회원이 직접 바꾸면 실제(me), 계획은 그대로
        call(p, "/drop", "{\"token\":\"" + a + "\",\"drop\":\"오색\"}", t1 + 20 * 60_000);
        JsonObject ma2 = member(call(p, "/view", tok(lead), t1 + 20 * 60_000), "마음바꿈");
        assertEquals("오색", ma2.get("drop").getAsString());
        assertEquals("소공원", ma2.get("dropPlan").getAsString());
    }
}
