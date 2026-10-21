package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산악회 방(2026-10-20 홍TV님) - 산행 전에 방 만들기 → 참가(좌석 · 탑승지) → 출발 때 버스 탔어요 · 안 탄 사람 취소 → 산행 중 서로 위치 · SOS
 * → 하산 탑승 → 끝. 방 정보는 파일로 남고(재시작) 위치는 메모리에만.
 */
public class PartyTest {

    static final long H = 3600_000L, T0 = 1_760_000_000_000L, DEPART = T0 + 3 * 24 * H, END = DEPART + 16 * H;

    static JsonObject j(String s) {
        return JsonParser.parseString(s).getAsJsonObject();
    }

    static JsonObject call(Party p, String path, String body, long now) {
        return PartyServlet.handle(p, path, j(body), now);
    }

    static String tok(String t) {
        return "{\"token\":\"" + t + "\"}";
    }

    static JsonObject member(JsonObject view, String nick) {
        for (var e : view.getAsJsonArray("members")) if (e.getAsJsonObject().get("nick").getAsString().equals(nick)) return e.getAsJsonObject();
        return null;
    }

    static String create(Party p, long now) {
        return call(p, "/create", "{\"name\":\"설악산 공룡능선 <b>\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"minPeople\":2,"
                + "\"leaderName\":\"김대장\",\"leaderPhone\":\"010-1234-5678 (x)\",\"seats\":28,\"stops\":\"사당, 양재 · 복정,사당\"}", now).toString();
    }

    @Test
    public void flow() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertTrue(code.matches("[A-HJ-NP-Z2-9]{6}"));
        assertEquals("꺾쇠는 뺌", "설악산 공룡능선 b", room.get("name").getAsString());
        assertEquals("010-1234-5678", room.get("leaderPhone").getAsString());
        assertEquals("[\"사당\",\"양재\",\"복정\"]", room.getAsJsonArray("stops").toString());

        // 참가 전 소개 - 인솔자 · 인원 · 최소 인원
        JsonObject info = call(p, "/info", "{\"code\":\"" + code.toLowerCase() + "\"}", T0);
        assertEquals("김대장", info.get("leaderName").getAsString());
        assertEquals(0, info.get("hikers").getAsInt());
        assertEquals(2, info.get("minPeople").getAsInt());

        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\"}", T0); fail("동의 없이"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("동의")); }
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":21,\"stop\":\"사당\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"role\":\"hiker\",\"seat\":11,\"stop\":\"양재\",\"agree\":true}", T0).get("token").getAsString();
        String c = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦잠\",\"role\":\"hiker\",\"seat\":5,\"agree\":true}", T0).get("token").getAsString();
        String d = call(p, "/join", "{\"code\":\"" + room.get("driverCode").getAsString() + "\",\"nick\":\"기사님\",\"role\":\"driver\",\"agree\":true}", T0).get("token").getAsString();
        assertEquals(3, call(p, "/info", "{\"code\":\"" + code + "\"}", T0).get("hikers").getAsInt());
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"seat\":21,\"agree\":true}", T0); fail("같은 자리"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("이미 다른 분") && !e.getMessage().contains("철수")); }

        // 출발 3시간 전보다 이른 위치는 버림
        JsonObject early = call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98}", T0 + H);
        assertFalse(early.get("locKept").getAsBoolean());
        assertFalse("버린 위치는 안 보임", member(call(p, "/view", tok(lead), T0 + H), "철수").has("lat"));

        // 출발 날: 철수 · 영희 탐, 늦잠은 안 탐 → 출발 때 취소
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"seat\":11,\"what\":\"boarded\",\"on\":true}", DEPART - H);   // 인솔자가 좌석표에서
        try { call(p, "/depart", tok(a), DEPART); fail("회원은 출발 못 함"); } catch (SecurityException e) { /* 맞음 */ }
        JsonObject dep = call(p, "/depart", tok(lead), DEPART);
        assertEquals(1, dep.get("cancelledNow").getAsInt());
        assertTrue(dep.get("departed").getAsBoolean());
        assertTrue(member(dep, "늦잠").get("cancelled").getAsBoolean());
        assertEquals("취소된 사람은 인원에서 빠짐", 2, dep.get("hikers").getAsInt());
        JsonObject cv = call(p, "/view", tok(c), DEPART);
        assertTrue(cv.get("cancelled").getAsBoolean());
        try { call(p, "/loc", "{\"token\":\"" + c + "\",\"lat\":38.12,\"lon\":128.46}", DEPART); fail("취소된 사람 위치"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("빠졌")); }
        assertNull("회원 화면에는 취소된 사람이 안 보임", member(call(p, "/view", tok(a), DEPART), "늦잠"));

        // 산행 중: 서로 위치(회원은 배터리 · 머문 시간 없이), 인솔자는 다
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.1192,\"lon\":128.4656,\"acc\":12,\"batt\":64}", DEPART + H);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.1193,\"lon\":128.4657,\"batt\":63}", DEPART + H + 20 * 60_000);
        call(p, "/loc", "{\"token\":\"" + b + "\",\"lat\":38.12,\"lon\":128.47,\"sos\":true}", DEPART + H + 20 * 60_000);
        JsonObject seenByB = member(call(p, "/view", tok(b), DEPART + H + 21 * 60_000), "철수");
        assertEquals(38.1193, seenByB.get("lat").getAsDouble(), 1e-9);
        assertFalse("회원은 남의 배터리를 안 봄", seenByB.has("batt"));
        JsonObject seenByLead = member(call(p, "/view", tok(lead), DEPART + H + 21 * 60_000), "철수");
        assertEquals(63, seenByLead.get("batt").getAsInt());
        assertEquals("처음 온 뒤 21분째 그 자리(10m 남짓만 움직임)", 21, seenByLead.get("stillMin").getAsLong());
        assertTrue(member(call(p, "/view", tok(d), DEPART + H), "영희").get("sos").getAsBoolean());

        // 공지 · 버스, 하산 탑승(SOS 풂)
        try { call(p, "/notice", "{\"token\":\"" + a + "\",\"text\":\"x\"}", T0); fail(); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/notice", "{\"token\":\"" + lead + "\",\"text\":\"15시까지 소공원 주차장\"}", END - H);
        call(p, "/bus", "{\"token\":\"" + d + "\",\"lat\":38.1726,\"lon\":128.4890}", END - H);
        JsonObject bv = call(p, "/aboard", "{\"token\":\"" + b + "\",\"on\":true}", END - H);
        assertEquals("15시까지 소공원 주차장", bv.get("notice").getAsString());
        assertEquals(38.1726, bv.getAsJsonArray("busPins").get(0).getAsJsonObject().get("lat").getAsDouble(), 1e-9);
        assertFalse(member(call(p, "/view", tok(lead), END - H), "영희").get("sos").getAsBoolean());

        // 끝 - 회원 열쇠로 오면 까닭(410)
        try { call(p, "/end", tok(a), END); fail(); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/end", tok(lead), END);
        assertEquals(0, p.size());
        try { call(p, "/view", tok(a), END); fail(); } catch (Party.Ended e) { assertTrue(e.getMessage().contains("끝냈")); }
    }

    @Test
    public void cancelTripAndExpiry() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String lead = room.get("token").getAsString(), code = room.get("code").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/end", "{\"token\":\"" + lead + "\",\"cancel\":true}", T0 + H);   // 인원 미달 - 산행 취소
        try { call(p, "/view", tok(a), T0 + 2 * H); fail(); } catch (Party.Ended e) { assertTrue(e.getMessage().contains("취소")); }
        // 새로 들어오려는 사람도 방 코드로 "끝난 방" 을 앎(2026-10-20 PC) - 48시간 뒤엔 그냥 "못 찾음"
        try { call(p, "/info", "{\"code\":\"" + code.toLowerCase() + "\"}", T0 + 2 * H); fail(); } catch (Party.Ended e) { assertTrue(e.getMessage().startsWith("이미 끝난 방입니다") && e.getMessage().contains("취소")); }
        try { call(p, "/info", "{\"code\":\"" + code + "\"}", T0 + 60 * H); fail(); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("찾지 못했습니다")); }

        String lead2 = j(create(p, T0)).get("token").getAsString();
        p.sweep(END + 6 * H + 1);
        assertEquals("하산 마감 6시간 뒤 지움", 0, p.size());
        try { p.who(lead2, END + 6 * H + 2); fail(); } catch (Party.Ended e) { assertTrue(e.getMessage().contains("시간")); }
        try { call(p, "/create", "{\"name\":\"x\",\"departAt\":" + (T0 + 40 * 24 * H) + "}", T0); fail("30일 넘게 뒤"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/create", "{\"name\":\"x\",\"departAt\":" + DEPART + ",\"endAt\":" + (DEPART - H) + "}", T0); fail("마감이 출발보다 앞"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("철수 b", Party.clean("  철수\n<b>\t ", 12));
        assertEquals(8, Party.stops("a,b,c,d,e,f,g,h,i,j").size());
    }

    /** 자리 바꾸기 · 예약 표시 - 회원은 자기 것, 인솔자는 아무나. */
    @Test
    public void seats() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"seat\":21,\"what\":\"reserved\",\"on\":true}", T0);
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":21,\"stop\":\"사당\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"role\":\"hiker\",\"seat\":5,\"agree\":true}", T0).get("token").getAsString();
        assertEquals("참가하면 예약 표시는 빠짐", "[]", call(p, "/view", tok(lead), T0).getAsJsonArray("reserved").toString());
        assertFalse("회원에게 예약 표시는 안 감", call(p, "/view", tok(a), T0).has("reserved"));
        JsonObject bv = call(p, "/seat", "{\"token\":\"" + b + "\",\"seat\":6,\"stop\":\"복정\"}", T0);
        assertEquals(6, bv.get("seat").getAsInt());
        assertEquals("찬 자리(나 빼고) - 호차 × 100 + 좌석", "[121]", bv.getAsJsonArray("taken").toString());
        try { call(p, "/seat", "{\"token\":\"" + b + "\",\"seat\":21}", T0); fail("남의 자리"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("이미 다른 분")); }
        int aId = call(p, "/view", tok(a), T0).get("me").getAsInt();
        try { call(p, "/seat", "{\"token\":\"" + b + "\",\"id\":" + aId + ",\"seat\":9}", T0); fail("회원이 남을 옮김"); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"seat\":21,\"what\":\"boarded\",\"on\":true}", T0);
        call(p, "/seat", "{\"token\":\"" + lead + "\",\"id\":" + aId + ",\"seat\":9,\"stop\":\"사당\"}", T0);
        JsonObject av = call(p, "/view", tok(a), T0);
        assertEquals(9, av.get("seat").getAsInt());
        assertFalse("자리를 옮기면 출발 탑승 표시는 새로", av.get("boarded").getAsBoolean());
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"stop\":\"강남\",\"agree\":true}", T0); fail("없는 탑승지"); }
        catch (IllegalArgumentException e) { /* 맞음 */ }
    }

    /** 방 정보는 파일에 남아 재시작(배포)해도 이어짐 - 위치는 남지 않음. 파일 권한 600. */
    @Test
    public void survivesRestart() throws Exception {
        Path dir = Files.createTempDirectory("party");
        Path f = dir.resolve("party.json");
        Party p = new Party(f);
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":21,\"stop\":\"사당\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.12,\"lon\":128.47}", DEPART - H);
        String text = Files.readString(f);
        assertFalse("좌표는 파일에 없음", text.contains("38.12"));
        try { assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(f))); } catch (UnsupportedOperationException e) { /* 윈도 */ }

        Party again = new Party(f);   // 재시작
        JsonObject v = call(again, "/view", tok(lead), DEPART - H);
        JsonObject m = member(v, "철수");
        assertEquals(21, m.get("seat").getAsInt());
        assertTrue(m.get("boarded").getAsBoolean());
        assertFalse("위치는 메모리에만 - 재시작하면 없음", m.has("lat"));
        assertEquals("설악산 공룡능선 b", v.get("name").getAsString());
        call(again, "/end", tok(lead), END);
        JsonArray left = JsonParser.parseString(Files.readString(f)).getAsJsonArray();
        assertEquals("끝내면 파일에서도 지움", 0, left.size());
    }

    /** 단풍철 - 한 인솔자가 차 두세 대(2026-10-20 홍TV님): 호차마다 같은 좌석 번호, 운전자는 자기 호차 버스 자리, 회원은 자기 호차 버스만 봄. */
    @Test
    public void buses() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"buses\":3,\"seats\":28}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertEquals(3, room.get("buses").getAsInt());
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"bus\":1,\"seat\":21,\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"role\":\"hiker\",\"bus\":2,\"seat\":21,\"agree\":true}", T0).get("token").getAsString();   // 다른 호차 같은 번호
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"bus\":2,\"seat\":21,\"agree\":true}", T0); fail("같은 호차 같은 자리"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("2호차 21번") && !e.getMessage().contains("영희")); }
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"bus\":4,\"seat\":1,\"agree\":true}", T0); fail("없는 호차"); }
        catch (IllegalArgumentException e) { /* 맞음 */ }
        String d2 = call(p, "/join", "{\"code\":\"" + room.get("driverCode").getAsString() + "\",\"nick\":\"2호차 기사\",\"role\":\"driver\",\"bus\":2,\"agree\":true}", T0).get("token").getAsString();
        assertEquals("[121,221]", call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonArray("taken").toString());

        call(p, "/bus", "{\"token\":\"" + d2 + "\",\"bus\":1,\"lat\":38.17,\"lon\":128.48}", T0);   // 운전자는 자기 호차(2)로
        call(p, "/bus", "{\"token\":\"" + lead + "\",\"bus\":1,\"lat\":38.16,\"lon\":128.47}", T0);
        JsonArray pinsB = call(p, "/view", tok(b), T0).getAsJsonArray("busPins");
        assertEquals("회원은 자기 호차 버스만", 1, pinsB.size());
        assertEquals(2, pinsB.get(0).getAsJsonObject().get("bus").getAsInt());
        assertEquals("인솔자는 다", 2, call(p, "/view", tok(lead), T0).getAsJsonArray("busPins").size());

        call(p, "/mark", "{\"token\":\"" + lead + "\",\"bus\":2,\"seat\":21,\"what\":\"boarded\",\"on\":true}", T0);
        assertTrue(member(call(p, "/view", tok(lead), T0), "영희").get("boarded").getAsBoolean());
        assertFalse("1호차 21번(철수)은 그대로", member(call(p, "/view", tok(lead), T0), "철수").get("boarded").getAsBoolean());
        call(p, "/seat", "{\"token\":\"" + a + "\",\"bus\":3,\"seat\":21}", T0);   // 철수가 3호차로
        assertEquals(3, call(p, "/view", tok(a), T0).get("bus").getAsInt());
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"bus\":1,\"seat\":21,\"what\":\"reserved\",\"on\":true}", T0);
        assertEquals("[121]", call(p, "/view", tok(lead), T0).getAsJsonArray("reserved").toString());
    }

    /** 차량번호(2026-10-20 홍TV님) - 인솔자가 적으면 참가 전 소개 · 회원 화면에 나감. 운전자는 자기 호차만. 재시작해도 남음. */
    @Test
    public void plates() throws Exception {
        assertEquals("12가 3456", Party.plate(" 12가  3456 "));
        assertNull(Party.plate("  "));
        try { Party.plate("<b>1234</b>x"); fail("이상한 글자"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { Party.plate("버스"); fail("숫자 없음"); } catch (IllegalArgumentException e) { /* 맞음 */ }

        Path f = Files.createTempDirectory("party").resolve("party.json");
        Party p = new Party(f);
        JsonObject room = call(p, "/create", "{\"name\":\"내장산\",\"departAt\":" + DEPART + ",\"buses\":2,\"seats\":28,\"plates\":[\"서울70사1234\",\"\",\"99가9999\"]}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertEquals("호차 수만큼, 빈 칸은 null", "[\"서울70사1234\",null]", room.getAsJsonArray("plates").toString());
        assertEquals("[\"서울70사1234\",null]", call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonArray("plates").toString());

        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"bus\":2,\"seat\":3,\"agree\":true}", T0).get("token").getAsString();
        String d1 = call(p, "/join", "{\"code\":\"" + room.get("driverCode").getAsString() + "\",\"nick\":\"기사\",\"role\":\"driver\",\"bus\":1,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/plate", "{\"token\":\"" + lead + "\",\"bus\":2,\"plate\":\"경기71바5678\"}", T0);
        call(p, "/plate", "{\"token\":\"" + d1 + "\",\"bus\":2,\"plate\":\"서울70사4321\"}", T0);   // 운전자는 자기 호차(1)로
        assertEquals("[\"서울70사4321\",\"경기71바5678\"]", call(p, "/view", tok(a), T0).getAsJsonArray("plates").toString());
        try { call(p, "/plate", "{\"token\":\"" + a + "\",\"bus\":2,\"plate\":\"1\"}", T0); fail("회원은 못 고침"); } catch (SecurityException e) { /* 맞음 */ }

        Party again = new Party(f);
        assertEquals("[\"서울70사4321\",\"경기71바5678\"]", call(again, "/view", tok(a), T0).getAsJsonArray("plates").toString());
    }

    /** 내보내기(2026-10-20 홍TV님) - 인솔자만, 내보낸 폰은 410 까닭. */
    @Test
    public void kick() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        JsonObject x = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"모르는이\",\"role\":\"hiker\",\"seat\":3,\"agree\":true}", T0);
        String a = x.get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        int id = member(call(p, "/view", tok(lead), T0), "모르는이").get("id").getAsInt();
        try { call(p, "/kick", "{\"token\":\"" + b + "\",\"id\":" + id + "}", T0); fail("회원은 못 함"); } catch (SecurityException e) { /* 맞음 */ }
        JsonObject v = call(p, "/kick", "{\"token\":\"" + lead + "\",\"id\":" + id + "}", T0);
        assertNull(member(v, "모르는이"));
        assertEquals("자리도 빔", "[]", call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonArray("taken").toString());
        try { call(p, "/view", tok(a), T0); fail(); } catch (Party.Ended e) { assertTrue(e.getMessage().contains("내보냈습니다")); }
        try { call(p, "/kick", "{\"token\":\"" + lead + "\",\"id\":" + id + "}", T0); fail("두 번"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/kick", "{\"token\":\"" + lead + "\",\"id\":1}", T0); fail("인솔자 자신"); } catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("인솔자")); }
    }

    /** 출발 뒤 회원은 자리 · 탑승지를 못 바꿈, 인솔자는 됨(2026-10-20 홍TV님). */
    @Test
    public void noSeatChangeAfterDepart() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":3,\"agree\":true}", T0).get("token").getAsString();
        try { call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - 2 * H); fail("출발 1시간 전보다 이름"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("1시간 전")); }
        assertEquals(DEPART - H, call(p, "/view", tok(a), T0).get("boardFrom").getAsLong());
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        call(p, "/depart", tok(lead), T0);
        try { call(p, "/seat", "{\"token\":\"" + a + "\",\"seat\":4}", T0); fail("출발 뒤 회원"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("인솔자")); }
        int id = member(call(p, "/view", tok(lead), T0), "철수").get("id").getAsInt();
        call(p, "/seat", "{\"token\":\"" + lead + "\",\"id\":" + id + ",\"seat\":4}", T0);
        assertEquals(4, member(call(p, "/view", tok(lead), T0), "철수").get("seat").getAsInt());
    }

    /** 하산 탑승 - 회원은 명단에 "하산 탑승" 으로 남고 위치는 지워지며 더 받지 않음(2026-10-20 PC: 나가기로 지워져 인솔자에게 0 / 0). */
    @Test
    public void aboardKeepsMemberDropsPosition() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":3,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        call(p, "/depart", tok(lead), DEPART);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.12,\"lon\":128.47,\"sos\":true}", DEPART + H);
        assertTrue(member(call(p, "/view", tok(lead), DEPART + H), "철수").has("lat"));
        call(p, "/aboard", "{\"token\":\"" + a + "\",\"on\":true}", DEPART + 8 * H);
        JsonObject loc = call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.2,\"lon\":128.5}", DEPART + 8 * H);
        assertFalse("하산 탑승 뒤 위치는 안 받음", loc.get("locKept").getAsBoolean());
        JsonObject m = member(call(p, "/view", tok(lead), DEPART + 8 * H), "철수");
        assertTrue("명단에 남음", m.get("aboard").getAsBoolean());
        assertFalse("위치 지움", m.has("lat"));
        assertFalse("SOS 풂", m.get("sos").getAsBoolean());
        assertEquals(1, call(p, "/view", tok(lead), DEPART + 8 * H).get("aboardCount").getAsInt());
    }

    /** 위치를 못 잡아도 폰은 켜짐 · 배터리 · SOS(2026-10-20 PC - 화면 끈 실내). */
    @Test
    public void pingWithoutPosition() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/ping", "{\"token\":\"" + a + "\",\"batt\":55}", T0);   // 출발 3시간 전보다 이르면 안 받음
        assertFalse(member(call(p, "/view", tok(lead), T0), "철수").has("seen"));
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.12,\"lon\":128.47}", DEPART);
        call(p, "/ping", "{\"token\":\"" + a + "\",\"batt\":54,\"sos\":true}", DEPART + 5 * 60_000);
        JsonObject m = member(call(p, "/view", tok(lead), DEPART + 5 * 60_000), "철수");
        assertEquals(0, m.get("seen").getAsLong());
        assertEquals("위치는 5분 전 그대로", 300, m.get("ago").getAsLong());
        assertEquals(54, m.get("batt").getAsInt());
        assertTrue("위치 없이도 SOS", m.get("sos").getAsBoolean());
        assertFalse("회원에게는 seen 안 감", member(call(p, "/view", tok(a), DEPART + 5 * 60_000), "철수").has("seen"));
    }

    /** 출발한 방에는 산행 회원이 새로 못 들어옴, 운전자는 됨(2026-10-20 홍TV님 - 하산 탑승한 폰이 같은 링크로 다시 참가됐음). */
    @Test
    public void noJoinAfterDepart() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        call(p, "/depart", tok(lead), DEPART);
        assertTrue(call(p, "/info", "{\"code\":\"" + code + "\"}", DEPART).get("departed").getAsBoolean());
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", DEPART); fail("출발 뒤 회원"); }
        catch (IllegalStateException e) { assertTrue(e.getMessage().contains("이미 출발")); }
        call(p, "/join", "{\"code\":\"" + room.get("driverCode").getAsString() + "\",\"nick\":\"교대 기사\",\"role\":\"driver\",\"agree\":true}", DEPART);
    }

    /** 보안 점검(2026-10-21): 운전자 코드 · 연락처 · 인솔자 나가기 · 하산 마감 · 요청 횟수. */
    @Test
    public void securityChecks() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString(), dc = room.get("driverCode").getAsString();
        assertNotEquals(code, dc);
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"가짜기사\",\"role\":\"driver\",\"agree\":true}", T0); fail("방 코드로 운전자"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("운전자 코드")); }
        JsonObject info = call(p, "/info", "{\"code\":\"" + code + "\"}", T0);
        assertFalse("참가 전엔 연락처 없음", info.has("leaderPhone"));
        assertFalse(info.has("driverCode"));
        assertTrue(call(p, "/info", "{\"code\":\"" + dc.toLowerCase() + "\"}", T0).get("driverInvite").getAsBoolean());
        JsonObject d = call(p, "/join", "{\"code\":\"" + dc + "\",\"nick\":\"기사\",\"role\":\"hiker\",\"agree\":true}", T0);
        assertEquals("운전자 코드로 오면 운전자", "driver", d.get("role").getAsString());
        assertFalse("운전자에게 운전자 코드는 안 감", d.has("driverCode"));
        assertTrue("참가하면 연락처", d.has("leaderPhone"));
        long endAt = info.get("endAt").getAsLong(), base = endAt > 0 ? endAt : DEPART + 24 * H;
        assertEquals("방이 저절로 끝나는 때 = 하산 마감 6시간 뒤(화면에 보여 줌)", base + 6 * H, info.get("closesAt").getAsLong());
        try { call(p, "/leave", tok(lead), T0); fail("인솔자 나가기"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("방 끝내기")); }
        try { call(p, "/create", "{\"name\":\"x\",\"departAt\":" + DEPART + ",\"endAt\":" + (DEPART + 49 * H) + "}", T0); fail("48시간 넘게"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"agree\":{}}", T0); fail("동의가 객체"); } catch (IllegalArgumentException e) { /* 거짓으로 봄 */ }
        PartyServlet.Quota q = new PartyServlet.Quota(2, 1000);
        assertTrue(q.take("a", 0) && q.take("a", 1) && !q.take("a", 2) && q.over("a", 2) && q.take("b", 2) && q.take("a", 1002));
    }

    /** 버그 점검(2026-10-21): 취소된 사람을 명단에서 되돌림(자리가 찼으면 좌석 없이) · 틀린 방 하나가 있어도 나머지는 읽음. */
    @Test
    public void bugChecks() throws Exception {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦잠\",\"role\":\"hiker\",\"seat\":5,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/depart", tok(lead), DEPART);
        int aId = member(call(p, "/view", tok(lead), DEPART), "늦잠").get("id").getAsInt();
        String b = call(p, "/join", "{\"code\":\"" + room.get("driverCode").getAsString() + "\",\"nick\":\"기사\",\"agree\":true}", DEPART).get("token").getAsString();
        String c = j(create(p, T0)).get("token").getAsString();   // 다른 방 - 남의 방 사람은 못 고침
        try { call(p, "/mark", "{\"token\":\"" + c + "\",\"id\":" + aId + ",\"what\":\"boarded\",\"on\":true}", DEPART); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        call(p, "/mark", "{\"token\":\"" + b + "\",\"id\":" + aId + ",\"what\":\"boarded\",\"on\":true}", DEPART);
        JsonObject m = member(call(p, "/view", tok(lead), DEPART), "늦잠");
        assertFalse(m.get("cancelled").getAsBoolean());
        assertEquals("자리가 비어 있었으면 그대로", 5, m.get("seat").getAsInt());

        Path f = Files.createTempDirectory("party").resolve("party.json");
        Party q = new Party(f);
        String good = j(create(q, T0)).get("token").getAsString();
        String text = Files.readString(f);
        Files.writeString(f, "[{\"name\":\"코드 없는 방\"}," + text.substring(1));
        Party again = new Party(f);
        assertNotNull("틀린 방 뒤의 방도 읽음", again.who(good, T0));
        try (var st = Files.list(f.getParent())) { assertTrue("옛 파일을 남김", st.anyMatch(x -> x.getFileName().toString().startsWith("party.json.bad-"))); }
    }
}
