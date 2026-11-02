package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 산악회 방 안전 점검(2026-11-02 홍TV님): 재시작 뒤 SOS · 마지막 위치가 이어짐 · 재시작 직후 산행 중인 방을 바로 끝내지 않음,
 * 하산 탑승 · 따로 귀가 · 안 탐 회원의 SOS 도 받음, 하산 미확인 회원이 있으면 방을 24시간까지 남김, 파일 쓰기 차례(옛 글이 새 글을 덮지 않음),
 * 사무실 자리는 SOS · 출발 탑승 · 하차 답을 못 보냄, 접속 분석의 경로 글은 꺾쇠를 막음.
 */
public class PartySafetyFixTest {

    /** 방 + 탄 회원 하나("산돌이") → 산행 시작. [방 코드, 주 인솔자, 회원]. */
    private static String[] departed(Party p) {
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"산돌이\",\"role\":\"hiker\",\"seat\":3,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", tok(a), DEPART - H);
        departAll(p, lead, DEPART);
        return new String[] {code, lead, a};
    }

    private static long closes(Party p, String code, long now) {
        return call(p, "/info", "{\"code\":\"" + code + "\"}", now).get("closesAt").getAsLong();
    }

    /** 1: 배포 · 재시작 뒤에도 SOS · 마지막 위치 · 배터리가 인솔자에게 남고, SOS 로 남긴 방이 첫 요청에 지워지지 않음. 그만 보내면 파일에서도 지움. */
    @Test
    public void sosAndLastLocationSurviveRestart() throws Exception {
        Path f = Files.createTempDirectory("rf-party-safety").resolve("party.json");
        Party p = new Party(f);
        String[] r = departed(p);
        call(p, "/loc", "{\"token\":\"" + r[2] + "\",\"lat\":38.12,\"lon\":128.47,\"acc\":12,\"batt\":41,\"sos\":true}", DEPART + H);

        Party again = new Party(f);   // 재시작
        long late = END + 7 * H;   // 하산 마감 6시간이 지남 - SOS 덕분에 남아야
        JsonObject m = member(call(again, "/view", tok(r[1]), late), "산돌이");
        assertTrue("SOS 가 이어짐", m.get("sos").getAsBoolean());
        assertEquals(38.12, m.get("lat").getAsDouble(), 1e-9);
        assertEquals(41, m.get("batt").getAsInt());
        assertTrue("seen 도", m.has("seen"));
        call(again, "/view", tok(r[2]), late);   // 회원도 410 이 아님

        call(again, "/leave", tok(r[2]), late + 1);   // 그만 보내기 - 위치 · SOS 지움
        assertFalse("그만 보내면 파일에도 좌표 없음", Files.readString(f).contains("38.12"));
    }

    /** 1: 꺼져 있던 사이 마감이 지난 산행 중인 방도 다시 켠 뒤 첫 요청부터 한 시간은 남음(회원이 바로 410 을 받지 않게). */
    @Test
    public void departedRoomGetsGraceAfterRestart() throws Exception {
        Path f = Files.createTempDirectory("rf-party-grace").resolve("party.json");
        Party p = new Party(f);
        String[] r = departed(p);
        call(p, "/aboard", "{\"token\":\"" + r[2] + "\",\"on\":true}", END);   // 모두 하산 - 6시간 뒤 끝남
        assertEquals(END + 6 * H, closes(p, r[0], END));

        Party again = new Party(f);
        long first = END + 8 * H;   // 마감 + 6시간이 지난 뒤 처음 온 요청
        call(again, "/view", tok(r[1]), first);
        call(again, "/view", tok(r[1]), first + Party.RESTART_GRACE_MS - 1);
        try { call(again, "/view", tok(r[1]), first + Party.RESTART_GRACE_MS + 1); fail("한 시간 뒤엔 끝남"); } catch (Party.Ended e) { /* 맞음 */ }
    }

    /** 5: 하산 탑승 · 따로 귀가 · 안 탐 회원이 누른 SOS 도 받음(전에는 소리 없이 버림). 하산 표시는 풀려 하산 미확인으로. */
    @Test
    public void sosFromAboardApartOrCancelledIsKept() {
        Party p = new Party();
        String[] r = departed(p);
        call(p, "/aboard", "{\"token\":\"" + r[2] + "\",\"on\":true,\"apart\":true}", DEPART + 5 * H);   // 따로 귀가
        JsonObject out = call(p, "/loc", "{\"token\":\"" + r[2] + "\",\"lat\":38.1,\"lon\":128.4,\"sos\":true}", DEPART + 6 * H);
        assertTrue(out.get("locKept").getAsBoolean() && out.get("sosKept").getAsBoolean());
        JsonObject m = member(call(p, "/view", tok(r[1]), DEPART + 6 * H), "산돌이");
        assertTrue("인솔자에게 SOS", m.get("sos").getAsBoolean());
        assertFalse("하산 표시는 풀림", m.get("aboard").getAsBoolean() || m.has("apart"));
        assertTrue("위치도", m.has("lat"));
        try { call(p, "/end", "{\"token\":\"" + r[1] + "\",\"force\":true}", DEPART + 6 * H); fail("SOS 가 있으면 못 끝냄"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("SOS")); }
        call(p, "/ping", "{\"token\":\"" + r[2] + "\",\"sos\":false}", DEPART + 7 * H);
        assertFalse(member(call(p, "/view", tok(r[1]), DEPART + 7 * H), "산돌이").get("sos").getAsBoolean());

        // 안 탐(산행 시작 때 버스에 없던 회원) - 위치 없는 SOS 도 받고, 끄면 SOS 때 위치도 지움
        Party q = new Party();
        JsonObject room = j(create(q, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String c = call(q, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦잠\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        departAll(q, lead, DEPART);
        assertTrue(call(q, "/ping", "{\"token\":\"" + c + "\",\"sos\":true}", DEPART + H).get("sosKept").getAsBoolean());
        call(q, "/loc", "{\"token\":\"" + c + "\",\"lat\":38.1,\"lon\":128.4,\"sos\":true}", DEPART + H + 1000);
        JsonObject cm = member(call(q, "/view", tok(lead), DEPART + H + 2000), "늦잠");
        assertTrue(cm.get("sos").getAsBoolean() && cm.get("cancelled").getAsBoolean() && cm.has("lat"));
        assertEquals("사무실 화면 SOS 수에도", 1, (int) countSos(q, lead, DEPART + H + 2000));
        call(q, "/loc", "{\"token\":\"" + c + "\",\"lat\":38.1,\"lon\":128.4}", DEPART + H + 3000);   // SOS 끔 - 던지지 않고 끔
        cm = member(call(q, "/view", tok(lead), DEPART + H + 4000), "늦잠");
        assertFalse(cm.get("sos").getAsBoolean() || cm.has("lat"));
        try { call(q, "/loc", "{\"token\":\"" + c + "\",\"lat\":38.1,\"lon\":128.4}", DEPART + H + 5000); fail("안 탐 회원의 보통 위치는 그대로 막음"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("탑승하지 않아")); }
    }

    private static long countSos(Party p, String lead, long now) {
        return call(p, "/view", tok(lead), now).getAsJsonArray("members").asList().stream().filter(e -> e.getAsJsonObject().get("sos").getAsBoolean()).count();
    }

    /** 6: 산행을 시작했는데 하산 확인이 안 된 회원이 있으면 하산 마감 24시간 뒤까지 남기고 까닭(keptFor)을 보여 줌. 모두 하산하면 6시간. */
    @Test
    public void notDownKeepsRoom() {
        Party p = new Party();
        String[] r = departed(p);
        JsonObject info = call(p, "/info", "{\"code\":\"" + r[0] + "\"}", END);
        assertEquals(END + Party.NOT_DOWN_KEEP_MS, info.get("closesAt").getAsLong());
        assertEquals("notDown", info.get("keptFor").getAsString());
        call(p, "/view", tok(r[1]), END + 7 * H);   // 6시간이 지나도 남음
        call(p, "/mark", "{\"token\":\"" + r[1] + "\",\"id\":" + member(call(p, "/view", tok(r[1]), END + 7 * H), "산돌이").get("id").getAsInt() + ",\"what\":\"aboard\",\"on\":true}", END + 7 * H);
        try { call(p, "/view", tok(r[1]), END + 7 * H + 1); fail("모두 하산하면 6시간으로 - 이미 지남"); } catch (Party.Ended e) { /* 맞음 */ }
        // 산행을 시작하지 않은 방은 그대로 6시간
        Party q = new Party();
        JsonObject room = j(create(q, T0));
        call(q, "/join", "{\"code\":\"" + room.get("code").getAsString() + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0);
        assertEquals(END + 6 * H, closes(q, room.get("code").getAsString(), T0));
    }

    /** 10: 먼저 만든 옛 글이 나중에 쓰여도 새 글을 덮지 않음(모아 쓰기 · 내려갈 때 쓰기가 겹칠 때). */
    @Test
    public void olderSnapshotNeverOverwritesNewer() throws Exception {
        Path f = Files.createTempDirectory("rf-party-seq").resolve("party.json");
        Party p = new Party(f);
        String lead = j(create(p, T0)).get("token").getAsString();
        Party.Snap old = p.snap();
        call(p, "/notice", "{\"token\":\"" + lead + "\",\"text\":\"새 공지\"}", T0);   // 바로 씀(시험은 모아 쓰지 않음)
        Party.Snap fresh = p.snap();
        p.write(fresh);
        p.write(old);   // 늦게 끝난 옛 쓰기
        assertTrue("새 글이 남음", Files.readString(f).contains("새 공지"));
    }

    /** 11: 사무실 자리(보기만)는 SOS(가짜 SOS 로 인솔자를 부르고 방 끝내기를 막음) · 출발 탑승 · 하차 답을 보내지 못함. */
    @Test
    public void officeSeatCannotRaiseSosOrBoard() {
        Party p = new Party();
        JsonObject o = call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        String key = o.get("key").getAsString();
        JsonObject r = call(p, "/create", "{\"name\":\"한라산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,"
                + "\"drops\":\"성판악\",\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        String code = r.get("code").getAsString(), lead = r.get("token").getAsString();
        PartyOfficeTest.approve(p, key, code);
        String ot = call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0).get("token").getAsString();
        JsonObject out = call(p, "/ping", "{\"token\":\"" + ot + "\",\"sos\":true}", DEPART);
        assertFalse("받지 않았다고 알림", out.get("sosKept").getAsBoolean());
        assertFalse("인솔자에게 SOS 없음", call(p, "/view", tok(lead), DEPART).getAsJsonArray("members").asList().stream().anyMatch(e -> e.getAsJsonObject().get("sos").getAsBoolean()));
        call(p, "/end", "{\"token\":\"" + lead + "\",\"force\":true}", DEPART + 1);   // 방 끝내기가 막히지 않음
        Party q = new Party();
        o = call(q, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        key = o.get("key").getAsString();
        r = call(q, "/create", "{\"name\":\"한라산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,\"drops\":\"성판악\",\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        PartyOfficeTest.approve(q, key, r.get("code").getAsString());
        ot = call(q, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + r.get("code").getAsString() + "\"}", T0).get("token").getAsString();
        for (String path : new String[] {"/board", "/alight"}) {
            try { call(q, path, "{\"token\":\"" + ot + "\",\"yes\":true}", T0); fail(path); } catch (SecurityException e) { /* 맞음 */ }
        }
    }

    /** 12: 접속 분석의 경로 묶음 · 15분별 많은 때는 손님이 보낸 주소라 꺾쇠를 막음. */
    @Test
    public void accessPathsAreEscaped() {
        Access.reset();
        long t = System.currentTimeMillis();
        Access.page("/m/<img src=x onerror=alert(1)>", "203.0.113.9", "Mozilla/5.0", "ko-KR", false, t);
        Access.page("/x<b>.html", "203.0.113.9", "Mozilla/5.0", "ko-KR", false, t);
        String h = Access.section(t);
        assertFalse(h, h.contains("<b>.html") || h.contains("<img"));
        Access.reset();
    }

    /** 4: 못 보낸 SOS 는 10초 뒤 다시, 켜진 동안은 위치가 없어도 살펴 ping(party-kit.js - party-sos.test.js). 따라가기 쪽(2 · 3 · 8 · 9)은 hike-safety.test.js(ReviewRound5Test). */
    @Test
    public void partySosJs() throws Exception {
        ReviewRound5Test.node("src/test/js/party-sos.test.js");
    }
}
