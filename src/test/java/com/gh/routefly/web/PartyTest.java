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
        JsonObject in = j(body);
        if ("/create".equals(path) && !in.has("leaderPhone")) in.addProperty("leaderPhone", "010-0000-0000");   // 인솔자 연락처는 꼭(2026-10-27) - 시험마다 적지 않게
        return PartyServlet.handle(p, path, in, now);
    }

    static String tok(String t) {
        return "{\"token\":\"" + t + "\"}";
    }

    /** 탑승지 차례대로 끝까지 출발(2026-10-23 - 탑승지마다 출발). 돌려줌: 마지막 화면 + cancelledNow 합. */
    static JsonObject departAll(Party p, String lead, long now) {
        JsonObject v;
        int n = 0;
        do { v = call(p, "/depart", tok(lead), now); n += v.get("cancelledNow").getAsInt(); } while (!v.get("departed").getAsBoolean());
        v.addProperty("cancelledNow", n);
        return v;
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

        // 참가 전 소개 - 인솔자 · 인원
        JsonObject info = call(p, "/info", "{\"code\":\"" + code.toLowerCase() + "\"}", T0);
        assertEquals("김대장", info.get("leaderName").getAsString());
        assertEquals(0, info.get("hikers").getAsInt());
        assertFalse("최소 인원은 뺌(2026-10-26)", info.has("minPeople"));

        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\"}", T0); fail("동의 없이"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("동의")); }
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":21,\"stop\":\"사당\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"role\":\"hiker\",\"seat\":11,\"stop\":\"양재\",\"agree\":true}", T0).get("token").getAsString();
        String c = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦잠\",\"role\":\"hiker\",\"seat\":5,\"agree\":true}", T0).get("token").getAsString();
        String d = call(p, "/join", "{\"code\":\"" + room.get("leadCode").getAsString() + "\",\"nick\":\"사무실\",\"agree\":true}", T0).get("token").getAsString();   // 공동 인솔자(2026-10-27 - 예전 운전자)
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
        JsonObject dep = departAll(p, lead, DEPART);
        assertEquals(1, dep.get("cancelledNow").getAsInt());
        assertTrue(dep.get("departed").getAsBoolean());
        assertTrue(member(dep, "늦잠").get("cancelled").getAsBoolean());
        assertEquals("취소된 사람은 인원에서 빠짐", 2, dep.get("hikers").getAsInt());
        JsonObject cv = call(p, "/view", tok(c), DEPART);
        assertTrue(cv.get("cancelled").getAsBoolean());
        try { call(p, "/loc", "{\"token\":\"" + c + "\",\"lat\":38.12,\"lon\":128.46}", DEPART); fail("취소된 사람 위치"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("빠졌")); }
        assertNull("회원 화면에는 취소된 사람이 안 보임", member(call(p, "/view", tok(a), DEPART), "늦잠"));

        // 산행 중: 회원은 남의 위치를 안 봄(2026-10-24 인솔자 위주), 인솔자는 다
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.1192,\"lon\":128.4656,\"acc\":12,\"batt\":64}", DEPART + H);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":38.1193,\"lon\":128.4657,\"batt\":63}", DEPART + H + 20 * 60_000);
        call(p, "/loc", "{\"token\":\"" + b + "\",\"lat\":38.12,\"lon\":128.47,\"sos\":true}", DEPART + H + 20 * 60_000);
        JsonObject seenByB = member(call(p, "/view", tok(b), DEPART + H + 21 * 60_000), "철수");
        assertFalse("회원은 남의 위치를 안 봄", seenByB.has("lat"));
        assertTrue("자기 위치는 봄", member(call(p, "/view", tok(b), DEPART + H + 21 * 60_000), "영희").has("lat"));
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
        assertEquals("찬 자리(나 빼고) - 호차 × 100 + 좌석", "[121]", bv.getAsJsonArray("taken").toString());   // 인솔 자리는 인솔자가 정할 때만(2026-10-27)
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

    /** 단풍철 - 한 인솔자가 차 두세 대(2026-10-20 홍TV님): 호차마다 같은 좌석 번호, 회원은 자기 호차 버스만 봄. 인솔 자리는 인솔자가 정함(2026-10-27). */
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
        assertEquals("인솔 자리는 정하기 전엔 없음(2026-10-27)", "[121,221]", call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonArray("taken").toString());
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"bus\":2,\"seat\":1,\"what\":\"lead\",\"on\":true}", T0);   // 2호차 1번을 인솔 자리로
        JsonObject inf = call(p, "/info", "{\"code\":\"" + code + "\"}", T0);
        assertEquals("[201]", inf.getAsJsonArray("leadSeats").toString());
        assertTrue("참가 칸에서 못 고름", inf.getAsJsonArray("taken").toString().contains("201"));
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"y\",\"bus\":2,\"seat\":1,\"agree\":true}", T0); fail("인솔 자리"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("인솔자 자리")); }
        try { call(p, "/mark", "{\"token\":\"" + lead + "\",\"bus\":2,\"seat\":21,\"what\":\"lead\",\"on\":true}", T0); fail("사람 있는 자리"); }
        catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("1호차 3번은 회원 자리", 3, call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"삼번\",\"bus\":1,\"seat\":3,\"agree\":true}", T0).get("seat").getAsInt());

        call(p, "/bus", "{\"token\":\"" + lead + "\",\"bus\":2,\"lat\":38.17,\"lon\":128.48}", T0);
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

    /** 차량번호(2026-10-20 홍TV님) - 인솔자가 적으면 참가 전 소개 · 회원 화면에 나감. 재시작해도 남음. */
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

        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"bus\":2,\"seat\":7,\"agree\":true}", T0).get("token").getAsString();
        String d1 = call(p, "/join", "{\"code\":\"" + room.get("leadCode").getAsString() + "\",\"nick\":\"사무실\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/plate", "{\"token\":\"" + lead + "\",\"bus\":2,\"plate\":\"경기71바5678\"}", T0);
        call(p, "/plate", "{\"token\":\"" + d1 + "\",\"bus\":1,\"plate\":\"서울70사4321\"}", T0);   // 공동 인솔자도 됨
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
        JsonObject x = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"모르는이\",\"role\":\"hiker\",\"seat\":7,\"agree\":true}", T0);
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
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":7,\"agree\":true}", T0).get("token").getAsString();
        try { call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - 2 * H); fail("출발 1시간 전보다 이름"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("1시간 전")); }
        assertEquals(DEPART - H, call(p, "/view", tok(a), T0).get("boardFrom").getAsLong());
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        departAll(p, lead, T0);
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
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":7,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        departAll(p, lead, DEPART);
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

    /** 출발한 방에는 산행 회원이 새로 못 들어옴, 공동 인솔자는 됨(2026-10-20 홍TV님 - 하산 탑승한 폰이 같은 링크로 다시 참가됐음). */
    @Test
    public void noJoinAfterDepart() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        departAll(p, lead, DEPART);
        assertTrue(call(p, "/info", "{\"code\":\"" + code + "\"}", DEPART).get("departed").getAsBoolean());
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", DEPART); fail("출발 뒤 회원"); }
        catch (IllegalStateException e) { assertTrue(e.getMessage().contains("이미 출발")); }
        assertEquals("lead", call(p, "/join", "{\"code\":\"" + room.get("leadCode").getAsString() + "\",\"nick\":\"사무실\",\"agree\":true}", DEPART).get("role").getAsString());
    }

    /** 보안 점검(2026-10-21): 공동 인솔자 코드 · 연락처 · 인솔자 나가기 · 하산 마감 · 요청 횟수. */
    @Test
    public void securityChecks() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString(), dc = room.get("leadCode").getAsString();
        assertNotEquals(code, dc);
        assertEquals("방 코드로는 role 을 보내도 회원", "hiker", call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"가짜\",\"role\":\"lead\",\"agree\":true}", T0).get("role").getAsString());
        JsonObject info = call(p, "/info", "{\"code\":\"" + code + "\"}", T0);
        assertFalse("참가 전엔 연락처 없음", info.has("leaderPhone"));
        assertFalse(info.has("leadCode"));
        assertTrue(call(p, "/info", "{\"code\":\"" + dc.toLowerCase() + "\"}", T0).get("leadInvite").getAsBoolean());
        JsonObject d = call(p, "/join", "{\"code\":\"" + dc + "\",\"nick\":\"사무실\",\"role\":\"hiker\",\"agree\":true}", T0);
        assertEquals("공동 인솔자 코드로 오면 인솔자", "lead", d.get("role").getAsString());
        assertTrue("공동 인솔자도 코드를 봄(다른 사람에게 줄 수 있게)", d.has("leadCode"));
        assertTrue("참가하면 연락처", d.has("leaderPhone"));
        long endAt = info.get("endAt").getAsLong(), base = endAt > 0 ? endAt : DEPART + 24 * H;
        assertEquals("방이 저절로 끝나는 때 = 하산 마감 6시간 뒤(화면에 보여 줌)", base + 6 * H, info.get("closesAt").getAsLong());
        call(p, "/leave", tok(d.get("token").getAsString()), T0);   // 공동 인솔자는 나갈 수 있음(다른 인솔자가 있으니)
        try { call(p, "/leave", tok(lead), T0); fail("마지막 인솔자 나가기"); } catch (IllegalStateException e) { assertTrue(e.getMessage().contains("방 끝내기")); }
        try { call(p, "/create", "{\"name\":\"x\",\"departAt\":" + DEPART + ",\"endAt\":" + (DEPART + 121 * H) + "}", T0); fail("5일 넘게"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        call(p, "/create", "{\"name\":\"지리산 화대종주 2박 3일\",\"departAt\":" + DEPART + ",\"endAt\":" + (DEPART + 59 * H) + "}", T0);   // 여러 날 산행(2026-10-21 홍TV님)
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"agree\":{}}", T0); fail("동의가 객체"); } catch (IllegalArgumentException e) { /* 거짓으로 봄 */ }
        PartyServlet.Quota q = new PartyServlet.Quota(2, 1000);
        assertTrue(q.take("a", 0) && q.take("a", 1) && !q.take("a", 2) && q.over("a", 2) && q.take("b", 2) && q.take("a", 1002));
        // 조난(SOS) - 하산 마감 6시간이 지나도 방을 24시간까지 남김
        room = j(create(p, T0));
        code = room.get("code").getAsString(); lead = room.get("token").getAsString();
        String h = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"조난\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/ping", "{\"token\":\"" + h + "\",\"sos\":true}", DEPART - H);
        assertEquals("SOS 가 켜져 있으면 하산 마감 24시간 뒤까지", base + 24 * H, call(p, "/info", "{\"code\":\"" + code + "\"}", T0).get("closesAt").getAsLong());
        call(p, "/view", tok(lead), base + 7 * H);   // 6시간이 지나도 방이 남음(끝났으면 Ended)
        call(p, "/ping", "{\"token\":\"" + h + "\",\"sos\":false}", base + 7 * H);
        try { call(p, "/view", tok(lead), base + 7 * H + 1); fail("SOS 를 풀면 6시간으로"); } catch (Party.Ended e) { /* 맞음 */ }
    }

    /** 버그 점검(2026-10-21): 취소된 사람을 명단에서 되돌림(자리가 찼으면 좌석 없이) · 틀린 방 하나가 있어도 나머지는 읽음. */
    @Test
    public void bugChecks() throws Exception {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦잠\",\"role\":\"hiker\",\"seat\":5,\"agree\":true}", T0).get("token").getAsString();
        departAll(p, lead, DEPART);
        int aId = member(call(p, "/view", tok(lead), DEPART), "늦잠").get("id").getAsInt();
        String b = call(p, "/join", "{\"code\":\"" + room.get("leadCode").getAsString() + "\",\"nick\":\"사무실\",\"agree\":true}", DEPART).get("token").getAsString();
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

    /** 지나온 길(2026-10-21 홍TV님): 인솔자는 최근 2시간(조난 대비), 방이 끝나면 산행 회원 자취를 익명으로(별명 · 방 · 시각 없음, 앞뒤 500m · 버스 구간 뺌). */
    @Test
    public void trackChecks() {
        java.util.List<JsonObject> got = new java.util.ArrayList<>();
        Party p = new Party(null, got::add);
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"걷는이\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.47,\"lon\":126.98}", DEPART - H);   // 출발 전(집결지) - 남기지 않음
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - 1000);
        departAll(p, lead, DEPART);
        long t = DEPART;
        double lat = 37.47;
        for (int i = 0; i < 40; i++) { lat += 0.01; t += 30_000; call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":" + lat + ",\"lon\":126.98}", t); }   // 버스(30초에 1.1km)
        lat = 38.1;
        for (int i = 0; i < 200; i++) { lat += 0.0004; t += 30_000; call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":" + lat + ",\"lon\":128.46}", t); }   // 걷기(30초에 44m) - 약 8.9km
        JsonArray trail = call(p, "/trail", "{\"token\":\"" + lead + "\",\"id\":" + member(call(p, "/view", tok(lead), t), "걷는이").get("id").getAsInt() + "}", t).getAsJsonArray("path");
        assertTrue("인솔자는 최근 2시간만(30초마다 - 약 240점)", trail.size() > 200 && trail.size() <= 241);
        assertTrue("가장 오래된 점이 2시간 안", trail.get(0).getAsJsonArray().get(2).getAsLong() <= 2 * 3600);
        try { call(p, "/trail", "{\"token\":\"" + a + "\",\"id\":1}", t); fail("회원은 남의 길을 못 봄"); } catch (SecurityException e) { /* 맞음 */ }
        call(p, "/end", tok(lead), t);
        assertEquals("산행 회원 하나", 1, got.size());
        JsonObject o = got.get(0);
        assertFalse("누구인지 · 방은 없음", o.toString().contains("걷는이") || o.toString().contains(code) || o.has("token"));
        JsonArray path = o.getAsJsonArray("path");
        assertEquals("시각은 첫 점에서 지난 초", 0, path.get(0).getAsJsonArray().get(2).getAsLong());
        assertTrue("버스 구간은 빠짐", path.get(0).getAsJsonArray().get(0).getAsDouble() > 38.1);
        double d = o.get("distM").getAsDouble();
        assertTrue("걸은 약 8.9km 에서 앞뒤 500m 씩 뺌: " + d, d > 7500 && d < 8100);

        got.clear();   // 산행 취소 · 출발 안 한 방은 남기지 않음
        String lead2 = j(create(p, T0)).get("token").getAsString();
        call(p, "/end", "{\"token\":\"" + lead2 + "\",\"cancel\":true}", T0);
        assertTrue(got.isEmpty());
        assertNull("짧으면 안 남김", PartyTrack.anon(java.util.List.of(new double[] {37, 127, 0}, new double[] {37.001, 127, 30_000})));
    }

    /** 2026-10-27 홍TV님: 운전자 역할은 없앰(기사님에게 안전 책임이 가지 않게). 예전 운전자 코드는 공동 인솔자 코드 - 회사 관계자가 모든 호차를 봄. */
    @Test
    public void driverOwnBus() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"단풍\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"buses\":2,\"seats\":28}", T0);
        String code = room.get("code").getAsString(), dc = room.get("leadCode").getAsString();
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"일호\",\"bus\":1,\"seat\":7,\"agree\":true}", T0);
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"이호\",\"bus\":2,\"seat\":7,\"agree\":true}", T0);
        String o = call(p, "/join", "{\"code\":\"" + dc + "\",\"nick\":\"사무실\",\"role\":\"driver\",\"bus\":2,\"agree\":true}", T0).get("token").getAsString();
        JsonObject ov = call(p, "/view", tok(o), T0);
        assertEquals("driver 를 보내도 공동 인솔자", "lead", ov.get("role").getAsString());
        assertNotNull("모든 호차 회원", member(ov, "일호"));
        assertNotNull(member(ov, "이호"));
        int one = member(ov, "일호").get("id").getAsInt();
        assertTrue(call(p, "/trail", "{\"token\":\"" + o + "\",\"id\":" + one + "}", T0).has("path"));
        call(p, "/mark", "{\"token\":\"" + o + "\",\"bus\":1,\"seat\":7,\"what\":\"boarded\",\"on\":true}", T0);
        assertTrue(member(call(p, "/view", tok(o), T0), "일호").get("boarded").getAsBoolean());
        assertFalse("myHikers 없음", ov.has("myHikers"));
    }

    /** 숫자만 친 연락처에 - (2026-10-21 홍TV님 "01000000000 → 010-0000-0000"). */
    @Test
    public void phoneDashes() {
        assertEquals("010-0000-0000", Party.phone("01000000000"));
        assertEquals("010-1234-5678", Party.phone("010 1234 5678"));
        assertEquals("02-123-4567", Party.phone("021234567"));
        assertEquals("031-1234-5678", Party.phone("03112345678"));
        assertEquals("1588-1234", Party.phone("15881234"));
        assertEquals("0504-1234-5678", Party.phone("050412345678"));
        assertEquals("모르는 꼴은 그대로", "+82 10-1234-5678", Party.phone("+82 10-1234-5678"));
        assertNull(Party.phone("없음"));
    }

    /** 앱의 "폰 켜짐" 신호(RfAlive - sos 를 안 보냄)가 SOS 를 끄지 않음(2026-10-22 점검: 1분마다 꺼졌다 켜져 인솔자에게 "새 SOS" 가 되풀이됐음). */
    @Test
    public void alivePingKeepsSos() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/ping", "{\"token\":\"" + a + "\",\"batt\":50,\"sos\":true}", DEPART + H);
        assertTrue(member(call(p, "/view", tok(lead), DEPART + H), "철수").get("sos").getAsBoolean());
        call(p, "/ping", "{\"token\":\"" + a + "\",\"batt\":49}", DEPART + H + 60_000);   // 앱 RfAlive
        JsonObject m = member(call(p, "/view", tok(lead), DEPART + H + 60_000), "철수");
        assertTrue("sos 가 없는 신호는 SOS 를 그대로 둠", m.get("sos").getAsBoolean());
        assertEquals(49, m.get("batt").getAsInt());
        call(p, "/ping", "{\"token\":\"" + a + "\",\"sos\":false}", DEPART + H + 120_000);   // 화면에서 끔
        assertFalse(member(call(p, "/view", tok(lead), DEPART + H + 120_000), "철수").get("sos").getAsBoolean());
    }

    /** 2026-10-22 보안 점검 - 회원 스스로 출발 뒤 못 옮김 · 취소된 회원은 남의 위치 못 봄 · 시각 범위 · 공동 인솔자 코드 ≠ 방 코드 · 모아 쓰기. */
    @Test
    public void securityChecks2() throws Exception {
        Party p = new Party();
        String two = "{\"name\":\"두 대\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"buses\":2,\"seats\":28}";
        JsonObject room = call(p, "/create", two, T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertNotEquals(code, room.get("leadCode").getAsString());

        // 출발 때 안 탄 회원(취소)은 남의 위치를 못 봄
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦잠\",\"role\":\"hiker\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        departAll(p, lead, DEPART);
        call(p, "/loc", "{\"token\":\"" + a + "\",\"lat\":37.5,\"lon\":127.0}", DEPART + H);
        assertTrue(call(p, "/view", tok(b), DEPART + H).get("cancelled").getAsBoolean());
        JsonObject seen = member(call(p, "/view", tok(b), DEPART + H), "철수");
        assertTrue("이름은 보여도", seen != null);
        assertFalse("위치는 안 보임", seen.has("lat"));
        assertTrue("인솔자는 봄", member(call(p, "/view", tok(lead), DEPART + H), "철수").has("lat"));

        // 시각 범위 - 출발 없이 하산 마감만 40일 뒤 · 음수 출발
        try { call(p, "/create", "{\"name\":\"x\",\"endAt\":" + (T0 + 40 * 24 * H) + "}", T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/create", "{\"name\":\"x\",\"departAt\":-5}", T0); fail(); } catch (IllegalArgumentException e) { /* 맞음 */ }
        call(p, "/create", "{\"name\":\"x\",\"endAt\":" + (T0 + 10 * H) + "}", T0);   // 가까운 마감은 됨

        // 모아 쓰기(운영) - flush 해야 파일에 남음
        Path f = Files.createTempDirectory("party").resolve("party.json");
        Party lz = new Party(f).lazySave();
        try {
            call(lz, "/create", "{\"name\":\"모아 쓰기\",\"departAt\":" + DEPART + "}", T0);
            assertFalse("바로는 안 씀", Files.exists(f));
            lz.flush();
            assertEquals(1, new Party(f).size());
        } finally { lz.shutdown(); }
    }

    /** 인솔자 자리 - 2026-10-27 홍TV님: 3번으로 정하지 않고 인솔자가 좌석표에서 정함(없을 수도). 정한 자리는 회원이 참가 · 자리 바꾸기 · 예약 표시 모두 못 함. */
    @Test
    public void seatOneIsLeaders() {
        Party p = new Party();
        JsonObject room = j(create(p, T0));
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        assertEquals("처음엔 인솔 자리 없음", "[]", room.getAsJsonArray("leadSeats").toString());
        call(p, "/mark", "{\"token\":\"" + lead + "\",\"seat\":3,\"what\":\"lead\",\"on\":true}", T0);
        try { call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"x\",\"role\":\"hiker\",\"seat\":3,\"agree\":true}", T0); fail(); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("인솔자 자리")); }
        assertTrue("참가 칸에 찬 자리로", call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonArray("taken").toString().contains("103"));
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"role\":\"hiker\",\"seat\":4,\"agree\":true}", T0).get("token").getAsString();
        try { call(p, "/seat", "{\"token\":\"" + a + "\",\"seat\":3}", T0); fail("자리 바꾸기로도"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        try { call(p, "/mark", "{\"token\":\"" + lead + "\",\"seat\":3,\"what\":\"reserved\",\"on\":true}", T0); fail("예약 표시도"); } catch (IllegalArgumentException e) { /* 맞음 */ }
    }

    /** 탑승지마다 출발(2026-10-23 홍TV님 "영종에서 태우고 출발, 가면서 중동에서 태우고 출발") - 이번 탑승지 안 탄 사람만 취소, 마지막에 산행으로. */
    @Test
    public void departStopByStop() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"지리산\",\"departAt\":" + DEPART + ",\"seats\":28,\"stops\":\"영종, 중동\"}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영종1\",\"role\":\"hiker\",\"seat\":1,\"stop\":\"영종\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영종2\",\"role\":\"hiker\",\"seat\":2,\"stop\":\"영종\",\"agree\":true}", T0);
        String c = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"중동1\",\"role\":\"hiker\",\"seat\":4,\"stop\":\"중동\",\"agree\":true}", T0).get("token").getAsString();
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"정해지지않음\",\"role\":\"hiker\",\"seat\":5,\"agree\":true}", T0);
        call(p, "/board", "{\"token\":\"" + a + "\",\"on\":true}", DEPART - H);
        JsonObject v1 = call(p, "/depart", tok(lead), DEPART);   // 영종 출발 - 영종2 만 취소
        assertEquals(1, v1.get("cancelledNow").getAsInt());
        assertFalse("아직 산행 아님", v1.get("departed").getAsBoolean());
        assertEquals(1, v1.get("stopsDone").getAsInt());
        assertTrue(member(v1, "영종2").get("cancelled").getAsBoolean());
        assertFalse("중동 회원은 그대로", member(v1, "중동1").get("cancelled").getAsBoolean());
        call(p, "/board", "{\"token\":\"" + c + "\",\"on\":true}", DEPART + H);   // 중동에서 탐
        JsonObject v2 = call(p, "/depart", tok(lead), DEPART + H);   // 중동 출발 - 탑승지 없는 회원도 정리
        assertEquals(1, v2.get("cancelledNow").getAsInt());
        assertTrue(v2.get("departed").getAsBoolean());
        assertTrue(member(v2, "정해지지않음").get("cancelled").getAsBoolean());
        assertFalse(member(v2, "중동1").get("cancelled").getAsBoolean());
        try { call(p, "/depart", tok(lead), DEPART + H); fail("두 번"); } catch (IllegalStateException e) { /* 맞음 */ }
        // 탑승지 없는 방은 한 번에
        Party q = new Party();
        String l2 = call(q, "/create", "{\"name\":\"x\",\"departAt\":" + DEPART + "}", T0).get("token").getAsString();
        assertTrue(call(q, "/depart", tok(l2), DEPART).get("departed").getAsBoolean());
    }
}
