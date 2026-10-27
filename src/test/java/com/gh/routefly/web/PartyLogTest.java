package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 확인자료 - 2026-10-27 위치정보지원센터 답: 동의를 철회하면(그만 보내기 · 나가기) 법 제24조 제4항에 따라 그 회원의 확인자료를 즉시 파기.
 * 다른 회원 · 방 단위 기록은 그대로, 줄에는 이름 · 좌표가 없음.
 */
public class PartyLogTest {

    @Test
    public void withdrawPurgesOnlyThatMember() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98,\"sos\":true}", DEPART);
        List<String> before = p.memberLog.lines();
        assertEquals("참가 둘 + SOS 하나", 3, before.size());
        for (String l : before) assertFalse("이름 · 좌표 없음", l.contains("철수") || l.contains("영희") || l.contains("37.47"));
        int aId = call(p, "/view", tok(a), DEPART).get("me").getAsInt();

        call(p, "/leave", tok(a), DEPART);   // 그만 보내기 = 철회
        List<String> after = p.memberLog.lines();
        assertEquals("영희 참가 줄만 남음", 1, after.size());
        assertFalse(after.get(0).contains("member=" + aId + " "));
        assertNotNull("명단에는 이름이 남음", member(call(p, "/view", tok(b), DEPART), "영희"));
    }

    @Test
    public void filesArePrivateAndOld() throws Exception {
        Path dir = Files.createTempDirectory("partylog");
        try {
            PartyLog log = new PartyLog(dir);
            log.add(T0, "ABCDEF", 3, "join role=hiker");
            log.add(T0, "ABCDEF", 30, "join role=hiker");
            log.add(T0, "ABCDEF", 3, "sos");
            assertEquals(3, log.lines().size());
            Path f;
            try (var s = Files.list(dir)) { f = s.findFirst().get(); }
            assertTrue(f.getFileName().toString().matches("party-member-\\d{4}-\\d{2}\\.log"));
            try { assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(f))); }
            catch (UnsupportedOperationException e) { /* POSIX 아님 */ }
            assertEquals("member=3 만(30 은 그대로)", 2, log.purge("ABCDEF", 3));
            assertEquals(1, log.lines().size());
            assertTrue(log.lines().get(0).contains("member=30"));
            log.sweep(T0 + 100L * 24 * 3600_000L);
            assertEquals("200일 전에는 남김", 1, log.lines().size());
            log.sweep(T0 + 240L * 24 * 3600_000L);
            assertEquals("그 달이 끝나고 200일 지나면 지움", 0, log.lines().size());
        } finally {
            try (var s = Files.list(dir)) { s.forEach(x -> x.toFile().delete()); }
            Files.deleteIfExists(dir);
        }
    }
}
