package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 산악회 점검 뒤 홍TV님이 정한 것(2026-11-22): 버스 QR 은 출발 1시간 전부터 · 사무실 고치기는 다시 열어도 그대로 + 알림 · 취소 사유 30일 · 확인자료 지우기는 방 만든 때까지 봄. */
public class PartyDecisionTest {

    @Test
    public void 버스_QR_은_출발_1시간_전부터() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        // 이틀 전 단톡방 QR 사진을 집에서 찍음 - 참가만, 탑승 아님(집 위치가 인솔자에게 가지 않게)
        JsonObject early = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"onBus\":true,\"agree\":true}", DEPART - 2 * H);
        assertFalse("출발 1시간 전 전에는 탑승 아님", early.get("boarded").getAsBoolean());
        assertEquals(Party.BOARD_EARLY, early.get("boardEarly").getAsString());
        String a = early.get("token").getAsString();
        try { call(p, "/board", tok(a), DEPART - 61 * 60_000L); fail("1시간 1분 전 QR"); }
        catch (IllegalStateException e) { assertEquals(Party.BOARD_EARLY, e.getMessage()); }
        call(p, "/board", tok(a), DEPART - H);   // 딱 1시간 전부터
        assertTrue(member(call(p, "/view", tok(lead), DEPART - H), "철수").get("boarded").getAsBoolean());
        JsonObject onTime = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"onBus\":true,\"agree\":true}", DEPART - H / 2);
        assertTrue("버스에서 찍으면 탑승", onTime.get("boarded").getAsBoolean());
        assertFalse(onTime.has("boardEarly"));
        assertFalse("링크로 들어오면 알림 없음", call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"민수\",\"agree\":true}", DEPART - 2 * H).has("boardEarly"));
    }

    @Test
    public void 사무실_다시_열어도_고치기_그대로() throws Exception {
        Party p = new Party();
        JsonObject o = call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        String key = o.get("key").getAsString();
        JsonObject r = call(p, "/create", "{\"name\":\"한라산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,"
                + "\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        String code = r.get("code").getAsString();
        PartyOfficeTest.approve(p, key, code);
        String enter = "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}";
        String ot = call(p, "/office/enter", enter, T0).get("token").getAsString();
        call(p, "/office-edit", "{\"token\":\"" + ot + "\",\"on\":true}", T0);
        // 다른 직원이 같은 방을 엶 - 고치던 사람의 고치기가 꺼지지 않고, 연 사람에게는 남은 때를 알려 줌
        JsonObject again = call(p, "/office/enter", enter, T0 + 10 * 60_000L);
        assertTrue("고치기 그대로", again.get("officeEdit").getAsBoolean());
        assertEquals(T0 + Party.OFFICE_EDIT_MS, again.get("officeEditUntil").getAsLong());
        assertTrue(call(p, "/view", tok(ot), T0 + 11 * 60_000L).get("officeEdit").getAsBoolean());
        assertFalse("30분 지나면 저절로 보기", call(p, "/office/enter", enter, T0 + Party.OFFICE_EDIT_MS).get("officeEdit").getAsBoolean());
        String js = Files.readString(Path.of("src/main/webapp/js/party-office.js"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("사무실 화면이 열기 전에 물음", js.contains("j.officeEdit && j.officeEditUntil ? ask(editElsewhere(j.officeEditUntil - Date.now())") && js.contains("다른 곳에서 고치는 중입니다(남은 시간 "));
    }

    @Test
    public void 취소_사유는_30일() {
        PartyOffice po = new PartyOffice(null);
        PartyOffice.Office o = po.create("시험산악회", "OFC123", T0);
        JsonObject s = new JsonObject();
        s.addProperty("endedAt", T0);
        s.addProperty("cancelled", true);
        s.addProperty("why", "태풍으로 취소");
        po.ended(o.code, s, T0);
        long d = 24 * H;
        assertEquals("태풍으로 취소", po.endedOf(o, T0 + 29 * d).get(0).getAsJsonObject().get("why").getAsString());
        String sig = po.endedSig(o, T0 + 29 * d);
        JsonObject later = po.endedOf(o, T0 + 31 * d).get(0).getAsJsonObject();
        assertFalse("30일 지나면 사유 글은 안 보임", later.has("why"));
        assertTrue("요약은 그대로(200일)", later.get("cancelled").getAsBoolean());
        assertFalse("사유가 빠지면 화면도 다시 받음", sig.equals(po.endedSig(o, T0 + 31 * d)));
        po.sweepIdle(T0 + 31 * d, java.util.Set.of());
        assertFalse("저장한 것에서도 지움", o.ended.get(0).has("why"));
    }

    @Test
    public void 확인자료_지우기는_같은_방만() {
        PartyLog log = new PartyLog(null);
        long oldRoom = T0, newRoom = T0 + 3 * 24 * H;   // 같은 방 코드가 48시간 뒤 다시 쓰임
        log.add(T0, "ABCDEF", oldRoom, 3, "join role=hiker");
        log.add(newRoom, "ABCDEF", newRoom, 3, "join role=hiker");
        assertEquals("새 방 3번만", 1, log.purge("ABCDEF", newRoom, 3));
        assertEquals(1, log.lines().size());
        assertTrue("앞 방 3번(다른 사람) 줄은 남음", log.lines().get(0).contains(" rs=" + Long.toString(oldRoom, 36)));
        assertEquals(1, log.purge("ABCDEF", oldRoom, 3));
    }

    /** 2026-11-22 전에 쓴 줄(rs 없음)은 예전처럼 방 코드 · 회원 번호로 지움. */
    @Test
    public void 옛_줄은_코드와_번호로_지움() throws Exception {
        Path dir = Files.createTempDirectory("partylog");
        try {
            PartyLog log = new PartyLog(dir);
            log.add(T0, "ABCDEF", T0, 30, "join role=hiker");
            Path f;
            try (var st = Files.list(dir)) { f = st.findFirst().get(); }
            String day = log.lines().get(0).substring(0, log.lines().get(0).indexOf(' '));
            Files.writeString(f, day + " join room=ABCDEF member=3 role=hiker\n" + day + " sos room=ABCDEF member=3\n", StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
            assertEquals(3, log.lines().size());
            assertEquals("옛 줄 둘", 2, log.purge("ABCDEF", T0, 3));
            assertEquals(1, log.lines().size());
            assertTrue(log.lines().get(0).contains("member=30 "));
        } finally {
            try (var st = Files.list(dir)) { st.forEach(x -> x.toFile().delete()); }
            Files.deleteIfExists(dir);
        }
    }

    /** 사무실 이름 바꾸기 한도는 /48 로(만들기 한도와 같게) · 영어 화면 오류 글(party-en.test.js, node 가 없으면 그 부분만 건너뜀). */
    @Test
    public void 이름_바꾸기_한도와_영어_글() throws Exception {
        String sv = Files.readString(Path.of("src/main/java/com/gh/routefly/web/PartyServlet.java"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(sv.contains("if (\"/office/rename\".equals(path) && !RENAMES.take(makeKey, now))"));
        String node = null;
        for (String c : new String[] {"node", "C:\\Program Files\\nodejs\\node.exe"}) {
            try { Process v = new ProcessBuilder(c, "--version").redirectErrorStream(true).start(); v.getInputStream().readAllBytes(); if (v.waitFor() == 0) { node = c; break; } }
            catch (Exception e) { /* 다음 */ }
        }
        if (node == null) return;
        Process pr = new ProcessBuilder(node, "src/test/js/party-en.test.js").redirectErrorStream(true).start();
        String out = new String(pr.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(out, 0, pr.waitFor());
    }
}
