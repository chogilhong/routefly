package com.gh.routefly.web;

import static com.gh.routefly.web.PartyTest.*;
import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 하산 예상 → 늦을 회원 미리 경보(2026-11-11 홍TV님 "작업해"): 회원 폰 따라가기 코스의 도착 예상(eta) · 남은 거리 · 코스 끝을 위치와 함께 받아,
 * 그 호차 버스 세운 자리까지 걸음(3km 안)을 더하고, 그 회원 하산 탑승지 시각과 견줌. 인솔자는 모두, 회원은 자기 것만.
 */
public class PartyEtaTest {

    static final double END_LAT = 38.1720, END_LON = 128.4900, BUS_LAT = 38.1700, BUS_LON = 128.4900;   // 코스 끝 · 버스(약 222m)

    static String loc(String t, long eta, int left, double endLat) {
        return "{\"token\":\"" + t + "\",\"lat\":38.15,\"lon\":128.45,\"acc\":10,\"sos\":false" + (eta > 0 ? ",\"eta\":" + eta + ",\"endLat\":" + endLat + ",\"endLon\":" + END_LON : "") + "}";
    }

    @Test
    public void lateMemberShowsToLeaderAndSelf() {
        Party p = new Party();
        JsonObject room = call(p, "/create", "{\"name\":\"설악산\",\"departAt\":" + DEPART + ",\"endAt\":" + END + ",\"leaderName\":\"시험대장\",\"seats\":28,"
                + "\"pickups\":\"설악동C지구 17:00, 남교리 17:35\"}", T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        long seorak = call(p, "/info", "{\"code\":\"" + code + "\"}", T0).getAsJsonObject("pickupAt").get("설악동C지구").getAsLong();
        String a = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"늦음\",\"pickup\":\"설악동C지구\",\"agree\":true}", T0).get("token").getAsString();
        String b = call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"빠름\",\"pickup\":\"설악동C지구\",\"agree\":true}", T0).get("token").getAsString();
        for (String t : new String[] {a, b}) call(p, "/board", tok(t), DEPART - H);
        departAll(p, lead, DEPART);
        call(p, "/bus", "{\"token\":\"" + lead + "\",\"bus\":1,\"lat\":" + BUS_LAT + ",\"lon\":" + BUS_LON + "}", DEPART + H);
        long now = seorak - 2 * H;
        call(p, "/loc", loc(a, seorak + 30 * 60_000L, 3200, END_LAT), now);   // 코스 끝 도착이 탑승보다 30분 늦음
        call(p, "/loc", loc(b, seorak - H, 900, END_LAT), now);              // 1시간 일찍

        long walk = Math.round(MountainServlet.distM(END_LAT, END_LON, BUS_LAT, BUS_LON) * Party.BUS_WALK_ROAD / Party.BUS_WALK_MPS * 1000);
        JsonObject lv = call(p, "/view", tok(lead), now), ma = member(lv, "늦음"), mb = member(lv, "빠름");
        assertEquals("코스 끝 도착 + 버스까지 걸음", seorak + 30 * 60_000L + walk, ma.get("arr").getAsLong());
        assertEquals("탑승보다 늦는 분(올림)", (int) Math.ceil((30 * 60_000L + walk) / 60000.0), ma.get("late").getAsInt());
        assertFalse("남은 거리는 받지도 보내지도 않음(2026-11-12 점검 - 아무도 안 읽음)", ma.has("left"));
        assertTrue("일찍 오는 회원 - 예상만, 늦음 없음", mb.has("arr") && !mb.has("late"));
        JsonObject av = call(p, "/view", tok(a), now);
        assertTrue("회원은 자기 것", member(av, "늦음").get("late").getAsInt() > 30);
        assertNull("남의 줄은 회원 화면에 없음", member(av, "빠름"));

        // 버스가 3km 넘게 떨어져 있으면(다른 곳에 선 버스) 걸음을 더하지 않음
        call(p, "/bus", "{\"token\":\"" + lead + "\",\"bus\":1,\"lat\":38.10,\"lon\":128.40}", now);
        assertEquals(30, member(call(p, "/view", tok(lead), now), "늦음").get("late").getAsInt());
        // 새 예상이 10분 넘게 안 오면 안 보임
        assertFalse(member(call(p, "/view", tok(lead), now + Party.ETA_FRESH_MS + 1), "늦음").has("arr"));
        // 코스 없이 보낸 위치(eta 없음)면 지움
        call(p, "/loc", loc(a, 0, 0, 0), now + 60_000);
        assertFalse(member(call(p, "/view", tok(lead), now + 60_000), "늦음").has("arr"));
        // 이상한 값은 버림(48시간 넘게 뒤)
        call(p, "/loc", loc(a, now + 49 * H, 100, END_LAT), now + 90_000);
        assertFalse(member(call(p, "/view", tok(lead), now + 90_000), "늦음").has("arr"));
        // 하산 탑승하면 끝
        call(p, "/loc", loc(a, seorak + 30 * 60_000L, 3200, END_LAT), now + 120_000);
        call(p, "/aboard", "{\"token\":\"" + a + "\",\"on\":true}", now + 150_000);
        assertFalse(member(call(p, "/view", tok(lead), now + 150_000), "늦음").has("arr"));
    }

    @Test
    public void phoneSendsCourseEta() throws Exception {
        String kit = new String(Files.readAllBytes(Path.of("src/main/webapp/js/party-kit.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(kit.contains("e = g.RFParty.etaNow ? g.RFParty.etaNow() : null;") && kit.contains("body.eta = Math.round(e.eta);") && !kit.contains("body.left"));
        String hike = new String(Files.readAllBytes(Path.of("src/main/webapp/js/hike.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("실제 산행 · 코스 따라가는 중만", hike.contains("if (!c || !hike.running || hike.sim || !c.lat || !c.lat.length) return null;"));
        assertTrue(hike.contains("return { eta: Date.now() + remainingMs(now() - hike.start), endLat: c.lat[n], endLon: c.lon[n] };"));
        assertTrue(hike.contains("if (window.RFParty) RFParty.etaNow = partyEta;"));
        assertTrue("인솔자 회원 줄", new String(Files.readAllBytes(Path.of("src/main/webapp/js/party.js")), StandardCharsets.UTF_8).contains("T(\"하산 예상 \", \"ETA \") + clock(m.arr)"));
        String pv = new String(Files.readAllBytes(Path.of("src/main/webapp/privacy.html")), StandardCharsets.UTF_8);
        assertTrue("개인정보처리방침 받는 것", pv.contains("그 코스의 도착 예상 시각 · 코스 끝 자리(하산 예상 - 인솔자 · 회사 사무실 화면에"));
    }
}
