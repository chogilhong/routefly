package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 사무실 자리는 보기부터(2026-11-02 홍TV님 "제안대로"): 사무실이 방을 열면 보기만, "✏️ 고치기 켜기" 뒤 30분만 고침(서버가 막음),
 * 고친 것은 인솔자 화면 알림 줄(officeLog)에 남음, 방 끝내기도 고치기를 켜야, 다시 열거나 30분이 지나면 저절로 꺼짐.
 * 화면 글(officeLogText) · 막는 단추는 node(party-office-edit.test.js).
 */
public class PartyOfficeEditTest {

    /** 사무실 · 승인된 방 · 회원 둘(1 · 2번 자리) · 사무실 자리. [사무실 열쇠, 방 코드, 주 인솔자, 회원 철수, 사무실 자리]. */
    private static String[] setup(Party p) {
        JsonObject o = call(p, "/office/create", "{\"name\":\"시험산악회\"}", T0);
        String key = o.get("key").getAsString();
        JsonObject r = call(p, "/create", "{\"name\":\"한라산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,\"buses\":2,"
                + "\"drops\":\"성판악\",\"pickups\":\"관음사 17:00\",\"office\":\"" + o.get("code").getAsString() + "\"}", T0);
        String code = r.get("code").getAsString();
        PartyOfficeTest.approve(p, key, code);
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"철수\",\"seat\":1,\"agree\":true}", T0).get("token").getAsString();
        call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"영희\",\"seat\":2,\"agree\":true}", T0);
        String ot = call(p, "/office/enter", "{\"key\":\"" + key + "\",\"code\":\"" + code + "\"}", T0).get("token").getAsString();
        return new String[] {key, code, r.get("token").getAsString(), a, ot};
    }

    private static String body(String token, String rest) {
        return "{\"token\":\"" + token + "\"" + (rest.isEmpty() ? "" : "," + rest) + "}";
    }

    /** 고치는 주소마다 본문 - 사무실이 보기만일 때 모두 막혀야. */
    private static String[][] edits(Party p, String chief) {
        int yh = member(call(p, "/view", tok(chief), T0), "영희").get("id").getAsInt();
        return new String[][] {
            {"/plate", "\"bus\":2,\"plate\":\"서울70사1234\""},
            {"/roster", "\"text\":\"민수 5\""},
            {"/mark", "\"bus\":1,\"seat\":1,\"on\":true"},
            {"/mark", "\"id\":" + yh + ",\"what\":\"aboard\",\"on\":true"},
            {"/bus", "\"bus\":1,\"lat\":33.38,\"lon\":126.62"},
            {"/notice", "\"text\":\"사무실 공지\""},
            {"/kick", "\"id\":" + yh},
            {"/depart", ""},
            {"/end", "\"force\":true"},
            {"/drop", "\"id\":" + yh + ",\"drop\":\"성판악\""},
            {"/pickup", "\"id\":" + yh + ",\"pickup\":\"관음사\""},
            {"/seat", "\"id\":" + yh + ",\"bus\":1,\"seat\":7"},
        };
    }

    private static JsonArray log(Party p, String token, long now) {
        JsonObject v = call(p, "/view", tok(token), now);
        return v.has("officeLog") ? v.getAsJsonArray("officeLog") : new JsonArray();
    }

    private static JsonObject last(JsonArray a) {
        return a.get(a.size() - 1).getAsJsonObject();
    }

    @Test
    public void officeSeatIsViewOnlyUntilToggled() {
        Party p = new Party();
        String[] s = setup(p);
        String chief = s[2], ot = s[4];
        JsonObject v = call(p, "/view", tok(ot), T0);
        assertFalse("처음엔 보기만", v.get("officeEdit").getAsBoolean());
        assertFalse(v.has("officeEditUntil"));
        assertFalse("인솔자 화면에는 officeEdit 없음(사무실 자리만)", call(p, "/view", tok(chief), T0).has("officeEdit"));
        for (String[] e : edits(p, chief)) {
            try { call(p, e[0], body(ot, e[1]), T0); fail(e[0] + " - 보기만인데 고쳐짐"); }
            catch (SecurityException x) { assertEquals(e[0], "사무실은 보기만 합니다. ✏️ 고치기 켜기를 먼저 누르세요.", x.getMessage()); }
        }
        JsonObject cv = call(p, "/view", tok(chief), T0);
        assertEquals("아무도 안 늘고 안 빠짐(주 인솔자 · 철수 · 영희 · 사무실)", 4, cv.get("count").getAsInt());
        assertFalse(cv.toString().contains("서울70사1234") || cv.toString().contains("사무실 공지"));
        assertEquals("고친 것이 없으니 줄도 없음", 0, log(p, chief, T0).size());
        // 보기는 그대로
        call(p, "/view", tok(ot), T0);
        call(p, "/ping", body(ot, "\"sos\":false"), T0);
        call(p, "/trail", body(ot, "\"id\":" + member(cv, "철수").get("id").getAsInt()), T0);
        try { call(p, "/aboard", body(ot, "\"on\":true"), T0); fail("사무실 자리는 하산 탑승이 없음"); } catch (SecurityException x) { /* 맞음 */ }

        // 켜기 - 30분, 켠 것은 인솔자 화면에 남기지 않음(고친 것만 - 2026-11-02 홍TV님)
        JsonObject on = call(p, "/office-edit", body(ot, "\"on\":true"), T0);
        assertTrue(on.get("officeEdit").getAsBoolean());
        assertEquals(T0 + Party.OFFICE_EDIT_MS, on.get("officeEditUntil").getAsLong());
        assertEquals("켜기만 해서는 줄이 없음", 0, log(p, chief, T0).size());
        for (String[] e : edits(p, chief)) {
            if ("/end".equals(e[0]) || "/kick".equals(e[0])) continue;   // 끝내기 · 내보내기는 아래에서
            call(p, e[0], body(ot, e[1]), T0 + 60_000);
        }
        cv = call(p, "/view", tok(chief), T0 + 60_000);
        assertEquals("서울70사1234", cv.getAsJsonArray("plates").get(1).getAsString());
        assertEquals("사무실 공지", cv.get("notice").getAsString());
        assertTrue(cv.get("departed").getAsBoolean());
        JsonArray l = log(p, chief, T0 + 60_000);
        StringBuilder whats = new StringBuilder();
        for (var x : l) whats.append(x.getAsJsonObject().get("what").getAsString()).append(' ');
        assertEquals("고친 것마다 한 줄(10개를 넘어 맨 앞 edit 은 밀려남)", "plate roster board aboard bus notice depart drop pickup seat ", whats.toString());
        assertEquals("2", l.get(0).getAsJsonObject().get("arg").getAsString());   // 2호차
        assertEquals("1", l.get(1).getAsJsonObject().get("arg").getAsString());   // 1명
        assertEquals("철수", l.get(2).getAsJsonObject().get("arg").getAsString());   // 1번 자리
        assertEquals("영희", l.get(3).getAsJsonObject().get("arg").getAsString());
        assertFalse("공지는 글을 다시 적지 않음", l.get(5).getAsJsonObject().has("arg"));
        assertEquals("산행 시작 - 안 탄 사람 수(영희 · 명단의 민수)", "2", l.get(6).getAsJsonObject().get("arg").getAsString());
        assertEquals(T0 + 60_000, l.get(0).getAsJsonObject().get("at").getAsLong());
        assertFalse("회원 화면에는 없음", call(p, "/view", tok(s[3]), T0 + 60_000).has("officeLog"));
        assertEquals("사무실 자리도 자기 줄을 봄", l.size(), log(p, ot, T0 + 60_000).size());

        // 내보내기 - 이름은 내보내기 전에 잡음
        int yh = member(cv, "영희").get("id").getAsInt();
        call(p, "/kick", body(ot, "\"id\":" + yh), T0 + 2 * 60_000);
        assertEquals("영희", last(log(p, chief, T0 + 2 * 60_000)).get("arg").getAsString());
        assertEquals("kick", last(log(p, chief, T0 + 2 * 60_000)).get("what").getAsString());
        assertEquals("줄은 최근 10개까지", Party.OFFICE_LOG_MAX, log(p, chief, T0 + 2 * 60_000).size());

        // 인솔자가 고친 것은 남기지 않음
        int n = log(p, chief, T0 + 2 * 60_000).size();
        JsonObject before = last(log(p, chief, T0 + 2 * 60_000));
        call(p, "/plate", body(chief, "\"bus\":1,\"plate\":\"서울70사9999\""), T0 + 3 * 60_000);
        assertEquals(n, log(p, chief, T0 + 3 * 60_000).size());
        assertEquals(before, last(log(p, chief, T0 + 3 * 60_000)));

        // 끄기 - 다시 막힘
        assertFalse(call(p, "/office-edit", body(ot, "\"on\":false"), T0 + 4 * 60_000).get("officeEdit").getAsBoolean());
        try { call(p, "/notice", body(ot, "\"text\":\"다시\""), T0 + 4 * 60_000); fail("끈 뒤"); } catch (SecurityException x) { /* 맞음 */ }
    }

    /** 고치기 켜기는 사무실 자리만(PartyServlet 이 SecurityException 을 403 으로). */
    @Test
    public void toggleOnlyForOfficeSeat() {
        Party p = new Party();
        String[] s = setup(p);
        for (String t : new String[] {s[2], s[3]}) {
            try { call(p, "/office-edit", body(t, "\"on\":true"), T0); fail("사무실 자리가 아님"); }
            catch (SecurityException x) { assertEquals("사무실 자리만 씁니다.", x.getMessage()); }
        }
        assertEquals("인솔자는 그대로 고침(켜기 없이)", "서울70사1234", call(p, "/plate", body(s[2], "\"bus\":1,\"plate\":\"서울70사1234\""), T0).getAsJsonArray("plates").get(0).getAsString());
    }

    /** 30분 지나면 저절로 꺼짐 · 사무실 화면에서 다시 열면 꺼짐 · 고쳐도 늘어나지 않음. */
    @Test
    public void autoOff() {
        Party p = new Party();
        String[] s = setup(p);
        String ot = s[4];
        call(p, "/office-edit", body(ot, "\"on\":true"), T0);
        call(p, "/notice", body(ot, "\"text\":\"하나\""), T0 + Party.OFFICE_EDIT_MS - 1);
        try { call(p, "/notice", body(ot, "\"text\":\"둘\""), T0 + Party.OFFICE_EDIT_MS); fail("30분 지남"); } catch (SecurityException x) { /* 맞음 */ }
        assertFalse(call(p, "/view", tok(ot), T0 + Party.OFFICE_EDIT_MS).get("officeEdit").getAsBoolean());
        // 다시 켠 뒤 사무실 화면에서 방을 다시 엶 - 같은 자리, 고치기는 꺼짐
        call(p, "/office-edit", body(ot, "\"on\":true"), T0 + 2 * Party.OFFICE_EDIT_MS);
        String again = call(p, "/office/enter", "{\"key\":\"" + s[0] + "\",\"code\":\"" + s[1] + "\"}", T0 + 2 * Party.OFFICE_EDIT_MS).get("token").getAsString();
        assertEquals(ot, again);
        try { call(p, "/notice", body(ot, "\"text\":\"셋\""), T0 + 2 * Party.OFFICE_EDIT_MS + 1); fail("다시 열면 꺼짐"); } catch (SecurityException x) { /* 맞음 */ }
    }

    /** 방 끝내기 · 산행 취소 - 사무실도 되지만(인솔자와 연락이 안 될 때) 고치기를 켠 뒤에만. */
    @Test
    public void endNeedsToggle() {
        Party p = new Party();
        String[] s = setup(p);
        String ot = s[4];
        try { call(p, "/end", body(ot, "\"cancel\":true,\"why\":\"태풍\""), T0); fail("보기만"); } catch (SecurityException x) { assertTrue(x.getMessage().contains("고치기 켜기")); }
        assertEquals(1, p.size());
        call(p, "/office-edit", body(ot, "\"on\":true"), T0);
        call(p, "/end", body(ot, "\"cancel\":true,\"why\":\"태풍\""), T0);
        assertEquals(0, p.size());
        try { call(p, "/view", tok(s[2]), T0); fail("방이 끝남"); } catch (Party.Ended x) { assertTrue(x.getMessage().contains("취소")); }
    }

    /** 화면 - 고친 것 한 줄(한국어 · 영어) · 막는 단추 · 인솔자 알림 줄 · 사무실 방 끝내기 두 번 묻기(party-office-edit.test.js). */
    @Test
    public void screenJs() throws Exception {
        ReviewRound5Test.node("src/test/js/party-office-edit.test.js");
    }
}
