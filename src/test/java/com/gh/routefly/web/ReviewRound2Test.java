package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 2026-10-28 두 번째 점검(홍TV님 "한 번 더 돌리게") - 버그 · 보안 고친 것.
 * 탑승지 숫자 시각이 이름 속 숫자를 먹지 않음, 명단 줄(이름 · 호차 · 좌석 따로) · 중복 · 300명 한도, 사무실 링크 바꾸면 옛 자리 끊김,
 * 지나온 길 점 간격, 백업 파일 권한.
 */
public class ReviewRound2Test {

    @Test
    public void stopTimeDoesNotEatPlaceNumbers() {
        assertEquals("[1100고지, 사당, 양재]", Party.stops("1100고지 08:30, 사당 2320, 양재 930").toString());
        assertEquals("[08:30, 23:20, 09:30]", Party.stopTimes("1100고지 08:30, 사당 2320, 양재 930").toString());
        assertEquals("숫자 시각만 있으면 그 시각", "[23:20]", Party.stopTimes("사당 2320").toString());
        assertEquals("시각 없는 1100고지는 이름 그대로", "[1100고지]/[]", Party.stops("1100고지").toString() + "/" + Party.stopTimes("1100고지").toString());
    }

    private static JsonObject room(Party p, int buses) {
        return call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":45,\"buses\":" + buses + "}", T0);
    }

    @Test
    public void rosterRowsKeepNamesAndBuses() {
        Party p = new Party();
        String lead = room(p, 2).get("token").getAsString();
        JsonObject v = call(p, "/roster", "{\"token\":\"" + lead + "\",\"rows\":[{\"name\":\"김철수2\",\"bus\":1,\"seat\":5},{\"name\":\"홍 길동\",\"bus\":2,\"seat\":15},{\"name\":\"시험육\",\"bus\":2}]}", T0);
        assertEquals(3, v.get("added").getAsInt());
        assertEquals("이름 끝 숫자는 이름", 5, member(v, "김철수2").get("seat").getAsInt());
        assertEquals(2, member(v, "홍길동").get("bus").getAsInt());
        assertEquals(2, member(v, "시험육").get("bus").getAsInt());
        Object[] e = Party.rosterParse("홍길동 2호차 15번").get(0);
        assertEquals("글로 넣어도 2호차 15번", "홍길동/2/15", e[0] + "/" + e[1] + "/" + e[2]);
    }

    @Test
    public void rosterDuplicatesAndLimit() {
        Party p = new Party();
        JsonObject r = room(p, 7);
        String lead = r.get("token").getAsString(), code = r.get("code").getAsString();
        JsonArray rows = new JsonArray();
        for (int i = 0; i < 280; i++) rows.add(JsonParser.parseString("{\"name\":\"회원" + i + "\",\"bus\":" + (i / 45 + 1) + ",\"seat\":" + (i % 45 + 1) + "}"));
        String body = "{\"token\":\"" + lead + "\",\"rows\":" + rows + "}";
        assertEquals(280, call(p, "/roster", body, T0).get("added").getAsInt());
        assertEquals("다시 불러오기는 한도에 걸리지 않음(이미 있는 사람을 뺀 뒤 셈)", 0, call(p, "/roster", body, T0).get("added").getAsInt());
        // 좌석 없는 같은 이름: 명단 사람과 같은 호차면 건너뜀, 핸드폰으로 들어온 동명이인은 막지 않음
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"김민수\",\"agree\":true}", T0);
        String one = "{\"token\":\"" + lead + "\",\"rows\":[{\"name\":\"김민수\",\"bus\":1}]}";
        assertEquals("핸드폰 김민수와 다른 사람", 1, call(p, "/roster", one, T0).get("added").getAsInt());
        assertEquals("명단 김민수는 다시 넣지 않음", 0, call(p, "/roster", one, T0).get("added").getAsInt());
    }

    @Test
    public void newOfficeKeyDropsOldSeats() {
        Party p = new Party();
        JsonObject o = call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        String key = o.get("key").getAsString();
        JsonObject r = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        PartyOfficeTest.approve(p, key, r.get("code").getAsString());
        String seat = call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + r.get("code").getAsString() + "\"}", T0).get("token").getAsString();
        call(p, "/view", tok(seat), T0);
        String nk = call(p, "/office/newkey", "{\"key\":\"" + key + "\"}", T0).get("key").getAsString();
        try { call(p, "/view", tok(seat), T0); fail("옛 사무실 자리는 끊김"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertNotEquals(seat, call(p, "/office/enter", "{\"key\":\"" + nk + "\",\"code\":\"" + r.get("code").getAsString() + "\"}", T0).get("token").getAsString());
    }

    @Test
    public void trackPointsAreSpaced() {
        Party p = new Party();
        JsonObject r = room(p, 1);
        String lead = r.get("token").getAsString(), code = r.get("code").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", tok(a), DEPART - H);
        departAll(p, lead, DEPART);
        long t = DEPART + H;
        for (int i = 0; i < 20; i++) call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":" + (38.10 + i * 0.001) + ",\"lon\":128.46}", t + i * 1000);   // 1초마다 110m
        assertEquals("10초 안에 몰아 보낸 점은 하나씩만", 2, p.who(a, t + 20_000).track.size());
        assertEquals(2, p.who(a, t + 20_000).room.trackPts);
    }

    @Test
    public void officeBackupIsPrivate() throws Exception {
        java.nio.file.Path dir = java.nio.file.Files.createTempDirectory("rf-bk");
        java.nio.file.Path f = dir.resolve("office.json");
        java.nio.file.Files.writeString(f, "[{\"code\":\"BBBBBB\"}]");
        try { java.nio.file.Files.setPosixFilePermissions(f, java.nio.file.attribute.PosixFilePermissions.fromString("rw-r--r--")); } catch (UnsupportedOperationException e) { return; }
        new PartyOffice(f);
        try (java.util.stream.Stream<java.nio.file.Path> ls = java.nio.file.Files.list(dir)) {
            java.nio.file.Path b = ls.filter(x -> x.getFileName().toString().startsWith("office.json.bad-")).findFirst().orElseThrow();
            assertEquals("옛 파일 백업은 600(원래 644 여도)", "rw-------", java.nio.file.attribute.PosixFilePermissions.toString(java.nio.file.Files.getPosixFilePermissions(b)));
        }
    }

    /** 보조 인솔자 코드 10글자(2026-10-28 - 맞혀 들어오기 어렵게), 그 코드로 보조 인솔자 참가 · 바꾸기도 10글자. 회원 방 코드는 6글자 그대로. */
    @Test
    public void assistantCodeIsLong() {
        Party p = new Party();
        JsonObject r = room(p, 1);
        String lc = r.get("leadCode").getAsString(), chief = r.get("token").getAsString();
        assertEquals(6, r.get("code").getAsString().length());
        assertEquals(Party.LEAD_CODE_LEN, lc.length());
        assertEquals("lead", call(p, "/join", "{\"code\":\"" + lc.toLowerCase() + "\",\"nick\":\"보조\",\"agree\":true}", T0).get("role").getAsString());
        assertEquals(10, call(p, "/leadcode", tok(chief), T0).get("leadCode").getAsString().length());
    }
}
