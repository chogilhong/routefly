package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 점검 7차(2026-11-03 홍TV님) - 산악회 방 안전: SOS 를 끄면 하산 탑승 · 따로 귀가로 되돌림 · 다시 켠 뒤 주는 시간의 끝 ·
 * 깨진 파일(좌표) 7일 뒤 지움 · 그만 보내기가 SOS 를 끔 · 파일 쓰기(바로 가기 따라가지 않음) · 명단에 없는 SOS 는 끝내기를 막지 않음 ·
 * 회사 연결을 바꾸거나 빼면 옛 사무실 자리를 뺌. 화면 js 조각은 review7.test.js.
 */
public class ReviewRound7Test {

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/review7.test.js");
    }

    /** 방 + 탄 회원 하나("산돌이") → 산행 시작. [방 코드, 주 인솔자, 회원]. */
    private static String[] departed(Party p) {
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"산돌이\",\"role\":\"hiker\",\"seat\":3,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", tok(a), DEPART - H);
        departAll(p, lead, DEPART);
        return new String[] {code, lead, a};
    }

    private static String loc(String t, boolean sos) {
        return "{\"token\":\"" + t + "\",\"lat\":37.51,\"lon\":127.02" + (sos ? ",\"sos\":true" : "") + "}";
    }

    /** 2: 따로 귀가 회원이 SOS 를 켰다 끄면 따로 귀가로 되돌리고 SOS 때 위치를 지움(전에는 집 가는 길 위치를 받고 방이 24시간 남았음). 재시작해도. */
    @Test
    public void sosOffRestoresApart() throws Exception {
        Path f = Files.createTempDirectory("rf-r7-apart").resolve("party.json");
        Party p = new Party(f);
        String[] r = departed(p);
        call(p, "/aboard", "{\"token\":\"" + r[2] + "\",\"on\":true,\"apart\":true}", DEPART + 5 * H);
        call(p, "/loc", loc(r[2], true), DEPART + 6 * H);
        JsonObject m = member(call(p, "/view", tok(r[1]), DEPART + 6 * H), "산돌이");
        assertTrue(m.get("sos").getAsBoolean() && !m.get("aboard").getAsBoolean());

        Party again = new Party(f);   // SOS 중에 재시작
        assertFalse("SOS 를 끈 위치는 받지 않음", call(again, "/loc", loc(r[2], false), DEPART + 6 * H + 60_000).get("locKept").getAsBoolean());
        m = member(call(again, "/view", tok(r[1]), DEPART + 6 * H + 60_000), "산돌이");
        assertFalse(m.get("sos").getAsBoolean());
        assertTrue("따로 귀가로 되돌림", m.get("aboard").getAsBoolean() && m.get("apart").getAsBoolean());
        assertFalse("SOS 때 위치도 지움", m.has("lat"));
        assertEquals("모두 하산 - 6시간", END + 6 * H, call(again, "/info", "{\"code\":\"" + r[0] + "\"}", END).get("closesAt").getAsLong());

        // ping 으로 끄는 것도(하산 탑승)
        Party q = new Party();
        String[] s = departed(q);
        call(q, "/aboard", "{\"token\":\"" + s[2] + "\",\"on\":true}", DEPART + 5 * H);
        call(q, "/ping", "{\"token\":\"" + s[2] + "\",\"sos\":true}", DEPART + 6 * H);
        call(q, "/loc", loc(s[2], true), DEPART + 6 * H + 1000);
        call(q, "/ping", "{\"token\":\"" + s[2] + "\",\"sos\":false}", DEPART + 6 * H + 2000);
        m = member(call(q, "/view", tok(s[1]), DEPART + 6 * H + 3000), "산돌이");
        assertTrue(m.get("aboard").getAsBoolean() && !m.has("apart") && !m.has("lat") && !m.get("sos").getAsBoolean());
    }

    /** 5: 다시 켤 때마다 한 시간씩 늘지 않음 - 방이 끝날 때에서 3시간까지만. */
    @Test
    public void restartGraceIsCapped() throws Exception {
        Path f = Files.createTempDirectory("rf-r7-grace").resolve("party.json");
        Party p = new Party(f);
        String[] r = departed(p);
        call(p, "/aboard", "{\"token\":\"" + r[2] + "\",\"on\":true}", END);   // 모두 하산 - END + 6시간에 끝남
        long closes = END + 6 * H;
        call(new Party(f), "/view", tok(r[1]), closes + 2 * H + H / 2);   // 다시 켬 - 아직 남음
        Party third = new Party(f);
        call(third, "/view", tok(r[1]), closes + 2 * H + 54 * 60_000L);   // 또 다시 켬
        call(third, "/view", tok(r[1]), closes + Party.RESTART_GRACE_CAP_MS - 1);
        try { call(third, "/view", tok(r[1]), closes + Party.RESTART_GRACE_CAP_MS + 1); fail("다시 켜도 3시간 뒤엔 끝남"); } catch (Party.Ended e) { /* 맞음 */ }

        Path g = Files.createTempDirectory("rf-r7-grace2").resolve("party.json");
        Party q = new Party(g);
        String[] s = departed(q);
        call(q, "/aboard", "{\"token\":\"" + s[2] + "\",\"on\":true}", END);
        try { call(new Party(g), "/view", tok(s[1]), closes + 4 * H); fail("끝날 때가 3시간 넘게 지났으면 바로 끝남"); } catch (Party.Ended e) { /* 맞음 */ }
    }

    /** 6: party.json · office.json · office-bundle.json 의 깨진 파일(*.bad-시각)은 7일 지나면 읽을 때 지움. 깨진 묶음 파일도 남김. */
    @Test
    public void oldBadFilesDropped() throws Exception {
        Path dir = Files.createTempDirectory("rf-r7-bad");
        long now = System.currentTimeMillis(), old = now - PrivateFile.BAD_KEEP_MS - 60_000, fresh = now - 3600_000;
        for (String n : new String[] {"party.json", "office.json", "office-bundle.json"}) {
            Files.writeString(dir.resolve(n + ".bad-" + old), "[38.12]");
            Files.writeString(dir.resolve(n + ".bad-" + fresh), "[38.12]");
        }
        Files.writeString(dir.resolve("office-bundle.json"), "[{\"key\":\"k\"},");   // 깨진 묶음
        new Party(dir.resolve("party.json"));
        for (String n : new String[] {"party.json", "office.json", "office-bundle.json"}) {
            assertFalse(n + " 7일 지난 것은 지움", Files.exists(dir.resolve(n + ".bad-" + old)));
            assertTrue(n + " 최근 것은 남김", Files.exists(dir.resolve(n + ".bad-" + fresh)));
        }
        try (var ls = Files.list(dir)) {
            assertEquals("깨진 묶음 파일을 새로 남김", 2, ls.filter(x -> x.getFileName().toString().startsWith("office-bundle.json.bad-")).count());
        }
    }

    /** 9: 위치 없이 SOS 만 켠 채(t == 0) 그만 보내도 SOS 를 끔. */
    @Test
    public void leaveTurnsOffSos() {
        Party p = new Party();
        String[] r = departed(p);
        call(p, "/leave", tok(r[2]), DEPART + H);   // 그만 보냄 - listed · t == 0
        call(p, "/ping", "{\"token\":\"" + r[2] + "\",\"sos\":true}", DEPART + 2 * H);
        assertTrue(member(call(p, "/view", tok(r[1]), DEPART + 2 * H), "산돌이").get("sos").getAsBoolean());
        call(p, "/leave", tok(r[2]), DEPART + 3 * H);
        assertFalse(member(call(p, "/view", tok(r[1]), DEPART + 3 * H), "산돌이").get("sos").getAsBoolean());
    }

    /** 13: 파일 쓰기 - 600, .tmp 가 바로 가기면 따라가지 않음. */
    @Test
    public void privateFileDoesNotFollowLinks() throws Exception {
        Path dir = Files.createTempDirectory("rf-r7-write"), f = dir.resolve("party.json"), outside = dir.resolve("outside.txt");
        Files.writeString(outside, "그대로");
        Files.createSymbolicLink(dir.resolve("party.json.tmp"), outside);
        PrivateFile.write(f, "[1]");
        assertEquals("[1]", Files.readString(f));
        assertEquals("바깥 파일은 그대로", "그대로", Files.readString(outside));
        assertFalse(Files.exists(dir.resolve("party.json.tmp"), java.nio.file.LinkOption.NOFOLLOW_LINKS));
        if (f.getFileSystem().supportedFileAttributeViews().contains("posix"))
            assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(f)));
        PrivateFile.write(f, "[2]");   // 덮어쓰기
        assertEquals("[2]", Files.readString(f));
    }

    /** 14: 명단이 있는 방에서 명단에 없는 참가자의 SOS 는 따로 보이고, 끝내기는 한 번 더 묻고 끝냄. 명단 회원의 SOS 는 그대로 막음. */
    @Test
    public void oddSosDoesNotBlockEnd() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        call(p, "/roster", "{\"token\":\"" + lead + "\",\"rows\":[{\"name\":\"산돌이\",\"bus\":1,\"seat\":3}]}", T0);
        String real = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"산돌이\",\"agree\":true}", T0).get("token").getAsString();
        String fake = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"가짜\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", tok(real), DEPART - H);
        call(p, "/board", tok(fake), DEPART - H);
        departAll(p, lead, DEPART);
        call(p, "/ping", "{\"token\":\"" + fake + "\",\"sos\":true}", DEPART + H);
        JsonObject v = call(p, "/view", tok(lead), DEPART + H);
        assertTrue(member(v, "가짜").get("sosOdd").getAsBoolean());
        assertFalse(member(v, "산돌이").has("sosOdd"));
        assertFalse("회원 화면에는 없음", call(p, "/view", tok(fake), DEPART + H).toString().contains("sosOdd"));
        try { call(p, "/end", tok(lead), DEPART + H); fail("한 번 더 물음"); }
        catch (IllegalStateException e) { assertTrue(e.getMessage(), e.getMessage().startsWith("아직 하산 확인이") && e.getMessage().contains("명단에 없는 참가자")); }
        call(p, "/ping", "{\"token\":\"" + real + "\",\"sos\":true}", DEPART + H);
        try { call(p, "/end", "{\"token\":\"" + lead + "\",\"force\":true}", DEPART + H); fail("명단 회원의 SOS 는 막음"); }
        catch (IllegalStateException e) { assertTrue(e.getMessage().startsWith("SOS 를 켠 회원이")); }
        call(p, "/ping", "{\"token\":\"" + real + "\",\"sos\":false}", DEPART + H);
        call(p, "/end", "{\"token\":\"" + lead + "\",\"force\":true}", DEPART + H);
        assertEquals(0, p.size());
    }

    /** 15: 방을 다른 회사로 옮기거나 빼거나 사무실을 없애면 옛 사무실 자리를 빼고 까닭을 알려 줌. */
    @Test
    public void officeSeatDroppedWhenLinkChanges() {
        String[][] cases = {{"link", "회사 연결이 바뀌었습니다"}, {"detach", "회사 화면에서 뺐습니다"}, {"delete", "사무실이 없어졌습니다"}};
        for (String[] c : cases) {
            Party p = new Party();
            JsonObject a = call(p, "/office/create", "{\"name\":\"가산악회\"}", T0), b = call(p, "/office/create", "{\"name\":\"나산악회\"}", T0);
            JsonObject r = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,\"office\":\"" + a.get("code").getAsString() + "\"}", T0);
            String code = r.get("code").getAsString(), chief = r.get("token").getAsString(), key = a.get("key").getAsString();
            PartyOfficeTest.approve(p, key, code);
            String seat = call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0).get("token").getAsString();
            call(p, "/link", "{\"token\":\"" + chief + "\",\"office\":\"" + a.get("code").getAsString() + "\"}", T0);   // 같은 회사로 다시 - 그대로
            call(p, "/view", tok(seat), T0);
            switch (c[0]) {
                case "link" -> call(p, "/link", "{\"token\":\"" + chief + "\",\"office\":\"" + b.get("code").getAsString() + "\"}", T0);
                case "detach" -> call(p, "/office/detach", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0);
                default -> call(p, "/office/delete", "{\"key\":\"" + key + "\",\"name\":\"가산악회\"}", T0);
            }
            try { call(p, "/view", tok(seat), T0); fail(c[0] + " - 옛 사무실 자리는 끊김"); }
            catch (RuntimeException e) { assertTrue(c[0] + ": " + e.getMessage(), e.getMessage().contains(c[1])); }
            assertNull(c[0], member(call(p, "/view", tok(chief), T0), "가산악회 사무실"));
        }
    }
}
