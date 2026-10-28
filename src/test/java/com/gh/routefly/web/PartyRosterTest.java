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
        assertFalse("링크로는 탑승 아님", k.get("boarded").getAsBoolean());

        // 버스 QR · NFC(onBus)로 들어오면 바로 탑승(2026-10-27 홍TV님 - 시각 제한 없음)
        JsonObject y = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"박영희\",\"onBus\":true,\"agree\":true}", DEPART - H / 2);
        assertTrue(y.get("boarded").getAsBoolean());
        JsonObject z = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"현장손님\",\"onBus\":true,\"agree\":true}", DEPART - H / 2);
        assertTrue("명단에 없으면 새 회원 + 탑승", z.get("boarded").getAsBoolean());
        assertEquals("hiker", z.get("role").getAsString());

        // 출발: QR · NFC 를 안 찍었고 인솔자 체크도 없으면 취소 - 명단에만 있는 사람도(2026-10-27 홍TV님)
        call(p, "/board", tok(a.get("token").getAsString()), T0);   // 링크로 먼저 참가한 폰이 버스에서 QR 을 찍음
        JsonObject d = departAll(p, lead, DEPART);
        assertEquals("안 탄 김철수(7번) · 명단만 김철수(6번)", 2, d.get("cancelledNow").getAsInt());
        JsonObject six = null;
        for (var e : d.getAsJsonArray("members")) { JsonObject x = e.getAsJsonObject(); if (x.has("seat") && x.get("seat").getAsInt() == 6) six = x; }
        assertNotNull(six);
        assertTrue(six.get("cancelled").getAsBoolean());
        assertFalse("시험대장은 탐", member(d, "시험대장").get("cancelled").getAsBoolean());

        // 핸드폰 없이 탄 사람 - 인솔자가 "탔음" 으로 되돌리면 취소가 풀리고, 산에서 처음 열어도 들어옴
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + six.get("id").getAsInt() + ",\"what\":\"boarded\",\"on\":true}", DEPART);
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

        // 명단 없이 방 코드로 들어온 회원도 그만 보내기 뒤 좌석표에 남음(2026-10-26 홍TV님 "좌석표에서도 빠지는데")
        String zt = z.get("token").getAsString();
        call(p, "/leave", tok(zt), DEPART + H);
        JsonObject guest = member(call(p, "/view", tok(lead), DEPART + H), "현장손님");
        assertNotNull("좌석표 · 명단에 남음", guest);
        assertTrue(guest.get("listed").getAsBoolean());
        assertTrue("탑승 표시도 그대로", guest.get("boarded").getAsBoolean());
        JsonObject back = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"현장손님\",\"agree\":true}", DEPART + H);
        assertEquals("다시 참가하면 같은 사람 · 같은 자리", zt, back.get("token").getAsString());
        assertTrue(back.get("boarded").getAsBoolean());

        // 회원은 명단을 넣을 수 없음
        try { call(p, "/roster", "{\"token\":\"" + a.get("token").getAsString() + "\",\"text\":\"x\"}", T0); fail(); }
        catch (SecurityException e) { /* 됨 */ }
    }

    /** 2026-10-27 홍TV님: 인솔자 연락처는 꼭, 호차마다 좌석 수(1호차 45인승 · 2호차 28인승). */
    @Test
    public void phoneRequiredAndSeatsPerBus() {
        Party p = new Party();
        try { PartyServlet.handle(p, "/create", j("{\"name\":\"x\",\"departAt\":" + DEPART + "}"), T0); fail("연락처 없이"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("연락처")); }
        JsonObject room = call(p, "/create", "{\"name\":\"단풍\",\"departAt\":" + DEPART + ",\"buses\":2,\"seats\":28,\"busSeats\":[45,28]}", T0);
        assertEquals("[45,28]", room.getAsJsonArray("busSeats").toString());
        assertEquals("가장 큰 값", 45, room.get("seats").getAsInt());
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertEquals(1, call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"일식이 44\"}", T0).get("added").getAsInt());
        try { call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"이식이 2-44\"}", T0); fail("2호차는 28석"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("1 ~ 28")); }
        JsonObject k = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"삼식이\",\"bus\":2,\"seat\":28,\"agree\":true}", T0);
        assertEquals("3번도 회원 자리", 3, call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"오식이\",\"bus\":2,\"seat\":3,\"agree\":true}", T0).get("seat").getAsInt());
        assertEquals(28, k.get("seat").getAsInt());
        // 좌석표 없는 차(0석)
        JsonObject z = call(p, "/create", "{\"name\":\"반반\",\"departAt\":" + DEPART + ",\"buses\":2,\"busSeats\":[28,0]}", T0);
        try { call(p, "/join", "{\"code\":\"" + z.get("code").getAsString() + "\",\"nick\":\"사식이\",\"bus\":2,\"seat\":1,\"agree\":true}", T0); fail("0석 차에 좌석"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("좌석표가 없는")); }
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
            assertEquals("호차 좌석 수도 남음", "[28]", v.getAsJsonArray("busSeats").toString());
        } finally {
            java.nio.file.Files.deleteIfExists(f);
        }
    }

    /** 2026-10-28 보안 점검 - 출발 뒤 명단 이름으로 들어온 폰은 인솔자에게 알림(가로채기 막기). 회원 화면 명단은 인솔자 · 자기만, 숫자는 모두로 셈. */
    @Test
    public void lateClaimAlertsLead() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        call(p, "/roster", "{\"token\":\"" + lead + "\",\"text\":\"박영희 6 최민수 7\"}", T0);
        String early = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"최민수\",\"agree\":true}", T0).get("token").getAsString();
        assertFalse("출발 전 들어오면 알림 없음", member(call(p, "/view", tok(lead), T0), "최민수").has("msg"));
        int id = member(call(p, "/view", tok(lead), T0), "박영희").get("id").getAsInt();
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + id + ",\"on\":true}", DEPART - H);   // 핸드폰 없이 탐
        call(p, "/board", tok(early), DEPART - H);
        PartyTest.departAll(p, lead, DEPART);
        String late = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"박영희\",\"agree\":true}", DEPART + H).get("token").getAsString();
        assertTrue("출발 뒤 들어오면 인솔자에게 알림", member(call(p, "/view", tok(lead), DEPART + H), "박영희").get("msg").getAsString().contains("확인"));
        JsonObject hv = call(p, "/view", tok(late), DEPART + H);
        assertNull("회원은 다른 회원 명단을 안 받음", member(hv, "최민수"));
        boolean leadSeen = false;
        for (com.google.gson.JsonElement e : hv.getAsJsonArray("members")) leadSeen |= "lead".equals(e.getAsJsonObject().get("role").getAsString());
        assertTrue("인솔자는 봄", leadSeen);
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"id\":" + id + ",\"what\":\"aboard\",\"on\":true}", DEPART + 5 * H);
        assertEquals("하산 탑승 수는 모두로 셈", 1, call(p, "/view", tok(early), DEPART + 5 * H).get("aboardCount").getAsInt());
    }
}
