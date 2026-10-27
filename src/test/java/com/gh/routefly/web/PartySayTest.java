package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 2026-10-27 홍TV님: 회원 → 인솔자 한 줄(공지의 반대 방향), 탑승지마다 출발 시각("정각에 출발, 기다려 주지 않아"). */
public class PartySayTest {

    @Test
    public void stopTimesParse() {
        String t = "사당 17:00, 양재 17시20분\n복정 · 판교 9.05 · 17:00 죽전";
        assertEquals(List.of("사당", "양재", "복정", "판교", "죽전"), Party.stops(t));
        assertEquals(List.of("17:00", "17:20", "", "09:05", "17:00"), Party.stopTimes(t));
        assertEquals(List.of("사당", "양재"), Party.stops("사당, 양재"));
        assertEquals(List.of("", ""), Party.stopTimes("사당, 양재"));
        assertEquals("시각만 다르고 이름이 같으면 한 번", List.of("사당"), Party.stops("사당 17:00, 사당 18:00"));
    }

    @Test
    public void stopTimesInRoom() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"설악\",\"departAt\":" + DEPART + ",\"stops\":\"사당 17:00, 양재 17:20, 복정\"}", T0);
        assertEquals("[\"사당\",\"양재\",\"복정\"]", room.getAsJsonArray("stops").toString());
        assertEquals("[\"17:00\",\"17:20\",\"\"]", room.getAsJsonArray("stopTimes").toString());
        JsonObject info = call(p, "/info", "{\"code\":\"" + room.get("code").getAsString() + "\"}", T0);
        assertEquals("참가 전 소개에도", "[\"17:00\",\"17:20\",\"\"]", info.getAsJsonArray("stopTimes").toString());
        JsonObject plain = call(p, "/create", "{\"name\":\"x\",\"departAt\":" + DEPART + ",\"stops\":\"사당, 양재\"}", T0);
        assertFalse("시각이 하나도 없으면 안 보냄", plain.has("stopTimes"));
    }

    @Test
    public void say() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/say", "{\"token\":\"" + a + "\",\"text\":\"화장실 들렀다 10분 늦어요\"}", T0);
        JsonObject v = call(p, "/view", tok(lead), T0);
        assertEquals("화장실 들렀다 10분 늦어요", member(v, "철수").get("msg").getAsString());
        assertEquals(T0, member(v, "철수").get("msgAt").getAsLong());
        assertFalse("다른 회원은 못 봄", member(call(p, "/view", tok(b), T0), "철수").has("msg"));
        try { call(p, "/say", "{\"token\":\"" + a + "\",\"text\":\"또\"}", T0 + 30_000); fail("1분에 한 번"); }
        catch (IllegalStateException e) { assertTrue(e.getMessage().contains("1분")); }
        call(p, "/say", "{\"token\":\"" + a + "\",\"text\":\"양재에서 탈게요\"}", T0 + 61_000);
        assertEquals("양재에서 탈게요", member(call(p, "/view", tok(lead), T0), "철수").get("msg").getAsString());
        try { call(p, "/say", "{\"token\":\"" + a + "\",\"text\":\"  \"}", T0 + 200_000); fail("빈 글"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/say", "{\"token\":\"" + lead + "\",\"text\":\"x\"}", T0); fail("인솔자는 공지로"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertTrue("80자까지", call(p, "/say", "{\"token\":\"" + b + "\",\"text\":\"" + "가".repeat(100) + "\"}", T0).toString().length() > 0);
        assertEquals(80, member(call(p, "/view", tok(lead), T0), "영희").get("msg").getAsString().length());
    }

    /** 제3자 제공 매회 즉시 통보(위치정보지원센터 답 · 홍TV님 (가)): 인솔자 화면이 받아 간 때가 회원 화면에 바로. */
    @Test
    public void providedAtTellsMember() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"agree\":true}", T0).get("token").getAsString();
        assertFalse("아직 제공 전", call(p, "/view", tok(a), T0).has("providedAt"));
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.12,\"lon\":128.46}", DEPART);
        call(p, "/view", tok(lead), DEPART);
        assertEquals("인솔자 화면이 위치를 받아 감", DEPART, call(p, "/view", tok(a), DEPART).get("providedAt").getAsLong());
        call(p, "/view", tok(lead), DEPART + 60_000);
        assertEquals("인솔자가 받아 간 때", DEPART + 60_000, call(p, "/view", tok(a), DEPART + 61_000).get("providedAt").getAsLong());
        call(p, "/view", tok(a), DEPART + 120_000);
        assertEquals("본인 화면은 제공이 아님", DEPART + 60_000, call(p, "/view", tok(a), DEPART + 121_000).get("providedAt").getAsLong());
    }
}
