package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 하산 탑승지 · 서울 도착 예정(2026-10-28 홍TV님 반더룽 일정표 - 설악동C지구 17:00 · 용대리 17:30 · 남교리 17:35, 서울 도착 20:30).
 * 곳마다 출발 시각 → 회원 하산 마감(myEndAt)이 그 시각, 틀린 곳은 들어가기 전에 막음, 사무실에 곳마다 탄 사람, 방은 서울 도착 뒤로 닫힘.
 */
public class PartyPickupTest {

    private static ZonedDateTime kst(long ms) {
        return Instant.ofEpochMilli(ms).atZone(ZoneId.of("Asia/Seoul"));
    }

    @Test
    public void returnPickups() {
        Party p = new Party();
        JsonObject o = call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        JsonObject room = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,"
                + "\"pickups\":\"설악동C지구 17:00, 용대리 17:30, 남교리 17:35\",\"home\":\"20:30\",\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        PartyOfficeTest.approve(p, o.get("key").getAsString(), code);
        JsonObject info = call(p, "/info", "{\"code\":\"" + code + "\"}", T0);
        assertEquals("[\"설악동C지구\",\"용대리\",\"남교리\"]", info.getAsJsonArray("pickups").toString());
        long seorak = info.getAsJsonObject("pickupAt").get("설악동C지구").getAsLong(), namgyo = info.getAsJsonObject("pickupAt").get("남교리").getAsLong();
        assertEquals(17, kst(seorak).getHour());
        assertTrue("하산 마감 날 ±12시간 안", Math.abs(seorak - END) <= 12 * H);
        assertEquals("남교리는 35분 뒤", 35 * 60_000L, namgyo - seorak);
        long home = info.get("homeAt").getAsLong();
        assertEquals(20, kst(home).getHour());
        assertTrue("서울 도착은 마지막 하산 탑승 뒤", home > namgyo);
        assertTrue("방은 서울 도착 뒤로 닫힘", info.get("closesAt").getAsLong() >= home + 6 * H);

        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"틀림\",\"pickup\":\"속초\",\"agree\":true}", T0); fail("목록에 없는 곳"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("하산 탑승지")); }
        assertNull("틀리면 사람도 안 들어감", member(call(p, "/view", tok(lead), T0), "틀림"));
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"설악\",\"pickup\":\"설악동C지구\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"남교\",\"agree\":true}", T0).get("token").getAsString();
        JsonObject av = call(p, "/view", tok(a), T0);
        assertEquals("내 하산 마감 = 내 하산 탑승지 시각", seorak, av.get("myEndAt").getAsLong());
        assertEquals("고르지 않으면 방 하산 마감", END, call(p, "/view", tok(b), T0).get("myEndAt").getAsLong());
        // 회원이 바꿈 · 인솔자가 바꿈
        call(p, "/pickup", "{\"token\":\"" + b + "\",\"pickup\":\"남교리\"}", T0);
        assertEquals(namgyo, call(p, "/view", tok(b), T0).get("myEndAt").getAsLong());
        int aid = member(call(p, "/view", tok(lead), T0), "설악").get("id").getAsInt();
        try { call(p, "/pickup", "{\"token\":\"" + b + "\",\"id\":" + aid + ",\"pickup\":\"남교리\"}", T0); fail("회원은 남의 것 못 바꿈"); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/pickup", "{\"token\":\"" + lead + "\",\"id\":" + aid + ",\"pickup\":\"용대리\"}", T0);
        assertEquals("용대리", member(call(p, "/view", tok(lead), T0), "설악").get("pickup").getAsString());
        // 사무실 - 곳마다 [탄 사람 / 그곳 회원], 서울 도착
        for (String t : new String[] {a, b}) call(p, "/board", tok(t), DEPART - H);
        departAll(p, lead, DEPART);
        call(p, "/aboard", "{\"token\":\"" + b + "\",\"on\":true}", namgyo - H);
        JsonObject r = call(p, "/office/rooms", "{\"key\":\"" + o.get("key").getAsString() + "\"}", namgyo - H).getAsJsonArray("rooms").get(0).getAsJsonObject();
        assertEquals("남교리", r.getAsJsonArray("pickups").get(2).getAsJsonObject().get("name").getAsString());
        assertEquals(1, r.getAsJsonArray("pickups").get(2).getAsJsonObject().get("on").getAsInt());
        assertEquals(1, r.getAsJsonArray("pickups").get(1).getAsJsonObject().get("all").getAsInt());
        assertEquals(home, r.get("homeAt").getAsLong());
    }
}
