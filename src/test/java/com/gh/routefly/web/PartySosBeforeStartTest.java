package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import com.google.gson.JsonObject;

import org.junit.Test;

/** 2026-11-01 홍TV님: 출발 전(버스 · 집결지)에 누른 SOS 도 인솔자에게. 그 위치는 SOS 동안만 받고 끄면 지움, SOS 가 아닌 위치는 예전대로 버림. */
public class PartySosBeforeStartTest {

    @Test
    public void sosBeforeStartReachesLeaderAndLocationIsClearedWhenOff() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"시험대장\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        long t = DEPART - H;

        JsonObject plain = call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98}", t);
        assertFalse("SOS 가 아니면 출발 전 위치는 버림", plain.get("locKept").getAsBoolean());
        assertFalse(member(call(p, "/view", tok(lead), t), "시험대장").has("lat"));

        JsonObject sos = call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98,\"sos\":true}", t + 1000);
        assertTrue("출발 전 SOS 는 받음", sos.get("locKept").getAsBoolean());
        JsonObject seen = member(call(p, "/view", tok(lead), t + 2000), "시험대장");
        assertTrue("인솔자에게 SOS", seen.get("sos").getAsBoolean());
        assertTrue("SOS 동안은 위치도", seen.has("lat"));

        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":false}", t + 3000);
        JsonObject after = member(call(p, "/view", tok(lead), t + 4000), "시험대장");
        assertFalse("SOS 를 끄면 풀림", after.has("sos") && after.get("sos").getAsBoolean());
        assertFalse("SOS 를 끄면 출발 전 위치는 지움", after.has("lat"));
    }

    @Test
    public void sosPingWithoutLocationBeforeStart() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"시험대장\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":true}", DEPART - H);
        assertTrue("위치 없는 SOS 도 출발 전에 받음", member(call(p, "/view", tok(lead), DEPART - H + 1), "시험대장").get("sos").getAsBoolean());
    }
}
