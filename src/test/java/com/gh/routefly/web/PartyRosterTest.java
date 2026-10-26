package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 산악회 방 - 인솔자 위주(2026-10-24 홍TV님): 인솔자가 예약 명단을 붙여 넣고, 회원은 링크 · 버스 QR · NFC 로 한 번 열어 이름만 넣음.
 * 아무것도 안 연 회원은 명단에만(위치 없음, 출발 때 저절로 취소하지 않음 - 인솔자가 눈으로).
 */
public class PartyRosterTest {

    @Test
    public void parse() {
        List<Object[]> es = Party.rosterParse("일식이 5 이식이6 삼식이 2-7\n사식이, 오식이 9번 육식이");
        assertEquals(6, es.size());
        assertArrayEquals(new Object[] {"일식이", 1, 5}, es.get(0));
        assertArrayEquals(new Object[] {"이식이", 1, 6}, es.get(1));
        assertArrayEquals(new Object[] {"삼식이", 2, 7}, es.get(2));
        assertArrayEquals(new Object[] {"사식이", 1, null}, es.get(3));
        assertArrayEquals(new Object[] {"오식이", 1, 9}, es.get(4));
        assertArrayEquals(new Object[] {"육식이", 1, null}, es.get(5));
        assertTrue("이름 없는 숫자는 버림", Party.rosterParse("5 6").isEmpty());
    }

    @Test
    public void rosterJoinBoardDepart() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();

        JsonObject v = call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"시험대장 5 김철수 6 김철수 7 박영희\"}", T0);
        assertEquals(4, v.get("added").getAsInt());
        assertTrue("명단에만", member(v, "박영희").get("listed").getAsBoolean());
        assertEquals("같은 걸 또 넣으면 건너뜀", 0, call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"시험대장 5\"}", T0).get("added").getAsInt());
        try { call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"누구 3\"}", T0); fail("인솔자 자리"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().startsWith("누구:")); }
        try { call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"누구 5\"}", T0); fail("이미 있는 자리"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("5번")); }

        // 참가 화면: 명단에만 있는 자리는 "예약"(고를 수 있음), 참가한 자리만 "참가함"
        JsonObject info = call(p, "/info", "{\"code\":\"" + code + "\"}", T0);
        assertTrue(info.getAsJsonArray("booked").toString().contains("106"));
        assertFalse(info.getAsJsonArray("taken").toString().contains("106"));

        // 링크로 이름만 넣으면 명단의 그 사람(좌석 그대로)
        JsonObject a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"시험 대장\",\"agree\":true}", T0);
        assertEquals("빈칸은 빼고 맞춤", 5, a.get("seat").getAsInt());
        assertEquals(5, call(p, "/view", tok(lead), T0).getAsJsonArray("members").size());
        assertFalse(member(call(p, "/view", tok(lead), T0), "시험대장").has("listed"));

        // 같은 이름 둘 - 좌석으로 가림
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"김철수\",\"agree\":true}", T0); fail("같은 이름"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("2명")); }
        JsonObject k = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"김철수\",\"seat\":7,\"agree\":true}", T0);
        assertEquals(7, k.get("seat").getAsInt());
        assertFalse("출발 1시간 전보다 이르면 링크로는 탑승 아님", k.get("boarded").getAsBoolean());

        // 버스 QR(onBus)로 출발 1시간 안에 들어오면 바로 탑승
        JsonObject y = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"박영희\",\"onBus\":true,\"agree\":true}", DEPART - H / 2);
        assertTrue(y.get("boarded").getAsBoolean());
        JsonObject z = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"현장손님\",\"onBus\":true,\"agree\":true}", DEPART - H / 2);
        assertTrue("명단에 없으면 새 회원 + 탑승", z.get("boarded").getAsBoolean());
        assertEquals("hiker", z.get("role").getAsString());

        // 출발: 핸드폰이 들어온 회원 중 안 탄 사람만 취소, 명단에만 있는 김철수(6번)는 그대로
        call(p, "/board", "{\"token\":\"" + a.get("token").getAsString() + "\",\"on\":true}", DEPART - H / 2);
        JsonObject d = departAll(p, lead, DEPART);
        assertEquals("링크로 들어와 안 탄 김철수(7번)만", 1, d.get("cancelledNow").getAsInt());
        JsonObject six = null;
        for (var e : d.getAsJsonArray("members")) { JsonObject x = e.getAsJsonObject(); if (x.has("seat") && x.get("seat").getAsInt() == 6) six = x; }
        assertNotNull(six);
        assertFalse("명단에만 있는 사람은 취소 안 함", six.get("cancelled").getAsBoolean());

        // 출발 뒤에도 명단 사람은 들어올 수 있음(산에서 처음 엶)
        JsonObject late = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"김철수\",\"seat\":6,\"agree\":true}", DEPART + H);
        assertEquals(6, late.get("seat").getAsInt());
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"모르는사람\",\"agree\":true}", DEPART + H); fail("명단 밖 새 회원은 출발 뒤 안 됨"); }
        catch (IllegalStateException e) { assertTrue(e.getMessage().contains("출발")); }

        // 그만 보내기 - 명단 사람은 명단에 남고 위치만 지움
        String lt = late.get("token").getAsString();
        call(p, "/loc", "{\"token\":\"" + lt + "\",\"lat\":35.33,\"lon\":127.73}", DEPART + H);
        assertTrue(member(call(p, "/view", tok(lead), DEPART + H), "김철수") != null);
        call(p, "/leave", tok(lt), DEPART + H);
        JsonObject after = call(p, "/view", tok(lead), DEPART + H);
        JsonObject six2 = null;
        for (var e : after.getAsJsonArray("members")) { JsonObject x = e.getAsJsonObject(); if (x.has("seat") && x.get("seat").getAsInt() == 6) six2 = x; }
        assertTrue(six2.get("listed").getAsBoolean());
        assertFalse("위치 지움", six2.has("lat"));

        // 핸드폰 없는 회원 - 인솔자가 하산 탑승 체크
        int sixId = six2.get("id").getAsInt();
        assertTrue(member(call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + sixId + ",\"what\":\"aboard\",\"on\":true}", DEPART + 2 * H), "김철수").get("aboard").getAsBoolean());

        // 회원은 명단을 넣을 수 없음
        try { call(p, "/roster", "{\"token\":\"" + a.get("token").getAsString() + "\",\"text\":\"x\"}", T0); fail(); }
        catch (SecurityException e) { /* 됨 */ }
    }

    @Test
    public void rosterSurvivesRestart() throws Exception {
        java.nio.file.Path f = java.nio.file.Files.createTempFile("party", ".json");
        try {
            Party p = new Party(f, null);
            JsonObject room = j(create(p, T0));
            String lead = room.get("token").getAsString();
            call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"시험대장 5\"}", T0);
            p.flush();
            Party q = new Party(f, null);
            JsonObject v = call(q, "/view", tok(lead), T0);
            assertTrue(member(v, "시험대장").get("listed").getAsBoolean());
        } finally {
            java.nio.file.Files.deleteIfExists(f);
        }
    }
}
