package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 자정 넘은 탑승 시각 "24:00 · 24:15"(2026-11-11 홍TV님이 준 반더룽 설악산 일정표: 사당역 23:50 · 양재역 24:00 · 복정역 24:15, 하산 탑승 설악동C지구 17:30 · 용대리 18:00 · 남교리 18:05).
 * 전에는 시각 꼴이 23시까지라 양재 · 복정 시각이 빠졌음 → 다음 날 00:00 · 00:15 로 읽음. "24시간" 같은 글은 시각이 아님.
 */
public class PartyStopMidnightTest {

    @Test
    public void midnightTimes() {
        assertEquals(List.of("23:50", "00:00", "00:15"), Party.stopTimes("사당역 23:50, 양재역 24:00, 복정역 24:15"));
        assertEquals("숫자만도", List.of("23:50", "00:15"), Party.stopTimes("사당 2350, 복정 2415"));
        assertEquals("24시간 은 이름", List.of(""), Party.stopTimes("24시간 편의점 앞"));
        assertEquals(List.of("17:30", "18:00", "18:05"), Party.stopTimes("설악동C지구 17:30, 용대리 18:00, 남교리 18:05"));
    }

    @Test
    public void midnightStopsDepartInOrder() {
        Party p = new Party();
        // 출발(첫 탑승지) 23:50 - 양재 · 복정은 다음 날 00:00 · 00:15
        long depart = java.time.ZonedDateTime.of(2026, 11, 21, 23, 50, 0, 0, java.time.ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        long end = depart + 17 * H + 40 * 60_000L, now = depart - 3 * 24 * H;   // 다음 날 17:30 · 사흘 전에 방을 만듦
        JsonObject room = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + depart + ",\"endAt\":" + end + ",\"leaderName\":\"시험대장\",\"seats\":45,"
                + "\"stops\":\"사당역 23:50, 양재역 24:00, 복정역 24:15\",\"pickups\":\"설악동C지구 17:30, 용대리 18:00, 남교리 18:05\",\"home\":\"20:30\"}", now);
        JsonObject info = call(p, "/info", "{\"code\":\"" + room.get("code").getAsString() + "\"}", now);
        assertEquals("[\"사당역\",\"양재역\",\"복정역\"]", info.getAsJsonArray("stops").toString());
        Party.Room r = p.room(room.get("code").getAsString(), now);
        assertEquals(depart, Party.stopAt(r, "사당역"));
        assertEquals("양재 - 다음 날 00:00", depart + 10 * 60_000L, Party.stopAt(r, "양재역"));
        assertEquals("복정 - 다음 날 00:15", depart + 25 * 60_000L, Party.stopAt(r, "복정역"));
        assertEquals("남교리 18:05", end + 35 * 60_000L, Party.pickupAt(r, "남교리"));
    }
}
