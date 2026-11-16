package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 점검 11차(2026-11-16 홍TV님 "전부 작업해") - docs/review-11-2026-11-16.md. 화면 조각은 review11.test.js(node), 순수 함수는 course-kit.test.js.
 */
public class CheckupRound11Test {

    static String read(String path) throws Exception {
        return Files.readString(Path.of(path), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/review11.test.js");
    }

    /** A1 · A3 ~ A6 - 따라가기 안전. */
    @Test
    public void 따라가기_안전() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        String adopt = js.substring(js.indexOf("function adoptCourse(nc, msg) {"), js.indexOf("hike.guideBr = null;", js.indexOf("function adoptCourse(nc, msg) {")));
        assertTrue("A1 하산길에서 위험 · 조망 다시 알림", adopt.contains("hike.spotDone = {};"));
        assertTrue("A3 낮은 화면 - 고도 그래프 숨김 · 안내 두 줄", html.contains("@media (max-height:760px) {") && html.contains("#courseNote:not(.open):not([hidden]) { display:-webkit-box;"));
        assertTrue("A4 괜찮으세요 · SOS 는 맨 위", html.contains("#stillSheet, #sosSheet { z-index:10000; }"));
        String still = js.substring(js.indexOf("function stillTick() {"), js.indexOf("if (hike.stillAsk) {", js.indexOf("function stillTick() {")));
        assertFalse("A5 도착이어도 끝 자리 밖이면 움직임 없음 확인", still.contains("|| hike.arrived) return;"));
        assertTrue(still.contains("< ARRIVED_STILL_M)) { hike.still = null; return; }"));
        int sun = js.indexOf("if (sun && hike.running && !hike.sun60"), late = js.indexOf("if (hike.running && hike.lateNext && nowMs > hike.lateNext)"), eta = js.indexOf("if (d >= c.total - ARRIVE_M) setV(\"sEta\"");
        assertTrue("A5 해 지기 · 귀가 예정 알림은 도착 판정 앞(늘)", sun > 0 && late > sun && eta > late);
        assertTrue("A6 벗어나면 진동", js.contains("if (!hike.wasOff && !hike.sim && navigator.vibrate) navigator.vibrate([400, 150, 400]);"));
    }

    /** B1 - 방 만들기 뒤 단계가 실패하면 방이 남지 않음(예전: 남고 하루 횟수는 돌려받아 2,000개 채우기). */
    @Test
    public void 방_만들기_실패면_방이_남지_않음() {
        Party p = new Party();
        String bad = "{\"name\":\"x\",\"leaderPhone\":\"010-1234-5678\",\"departAt\":" + PartyTest.DEPART + ",\"endAt\":" + PartyTest.END + ",\"drop\":\"없는곳\"}";
        for (int i = 0; i < 3; i++) {
            try { PartyServlet.handle(p, "/create", PartyTest.j(bad), PartyTest.T0); org.junit.Assert.fail("없는 하차 지점"); }
            catch (IllegalArgumentException e) { assertTrue(e.getMessage(), e.getMessage().contains("하차")); }
        }
        org.junit.Assert.assertEquals("실패한 만들기는 방이 없음", 0, p.size());
        PartyTest.call(p, "/create", "{\"name\":\"단풍\",\"leaderPhone\":\"010-1234-5678\",\"departAt\":" + PartyTest.DEPART + "}", PartyTest.T0);
        org.junit.Assert.assertEquals(1, p.size());
    }

    /** B2 - 통계 코스 칸은 하루 COURSES_MAX 까지(있는 칸은 계속 셈), StatsFilter 는 200 만 코스로. */
    @Test
    public void 통계_코스_칸_한도() throws Exception {
        String ip = "192.0.2.77";
        for (int i = 0; i < Stats.COURSES_MAX + 50; i++) Stats.hit("/c/", "frst-1-x" + i, ip, null, null, null, "PC", null);
        Stats.hit("/c/", "frst-1-x0", ip, null, null, null, "PC", null);
        com.google.gson.JsonObject today = null;
        for (com.google.gson.JsonObject d : Stats.days().values()) today = d;
        com.google.gson.JsonObject cs = today.getAsJsonObject("courses");
        assertTrue("한도 안", cs.size() <= Stats.COURSES_MAX);
        assertFalse("한도 넘은 새 칸은 안 생김", cs.has("frst-1-x" + (Stats.COURSES_MAX + 10)));
        org.junit.Assert.assertEquals("있는 칸은 계속 셈", 2, cs.get("frst-1-x0").getAsInt());
        assertTrue(read("src/main/java/com/gh/routefly/web/StatsFilter.java").contains("res.getStatus() == 200 ? Stats.courseKey(path) : null"));
    }

    /** A7 - 새벽(오늘 첫 발표 전)에는 어제 발표(실제 2026-10-15 응답)의 오늘 · 내일 예보를 씀, 오늘 발표가 있으면 그것이 먼저. */
    @Test
    public void 새벽_미세먼지_예보는_어제_발표로() throws Exception {
        String t = new String(CheckupRound11Test.class.getResourceAsStream("/air/forecast.json").readAllBytes(), StandardCharsets.UTF_8);
        com.google.gson.JsonObject y = AirServlet.forecastFor(t, "서울");
        com.google.gson.JsonObject m = AirServlet.mergeForecast(null, y);
        assertTrue("어제 발표의 다음 날(2026-10-16) 예보가 들어옴", m.has("2026-10-16"));
        com.google.gson.JsonObject mine = com.google.gson.JsonParser.parseString("{\"2026-10-16\":{\"pm10\":\"나쁨\"}}").getAsJsonObject();
        org.junit.Assert.assertEquals("오늘 발표가 먼저", "나쁨", AirServlet.mergeForecast(mine, y).getAsJsonObject("2026-10-16").get("pm10").getAsString());
        String src = read("src/main/java/com/gh/routefly/web/AirServlet.java");
        assertTrue("오늘 날짜가 없으면 어제 발표도", src.contains("if (out == null || !out.has(d.toString())) {") && src.contains("dayText(key, d.minusDays(1).toString(), now)"));
        assertTrue("빈 답은 10분", src.contains("FORECAST_EMPTY.put(day, \"\", now);"));
    }

    /** A8 - 공단 난이도 "매우어려움(3.16)"(띄어쓰기 없음, 운영 /m/설악산), A9 - 영어 노선 링크는 영어 화면으로. */
    @Test
    public void 매우어려움_과_영어_노선_링크() throws Exception {
        org.junit.Assert.assertEquals(4, MountainServlet.officialLevel("매우어려움(3.16)"));
        org.junit.Assert.assertEquals(4, MountainServlet.officialLevel("매우 어려움"));
        org.junit.Assert.assertEquals(2, MountainServlet.officialLevel("보통(2.57)"));
        assertTrue(read("src/main/java/com/gh/routefly/web/MountainEn.java").contains("&amp;back=en&amp;lang=en"));
    }

    /** A10 - 숙소 반쪽 답(관광공사 또는 카카오 실패)은 10분 칸에만. */
    @Test
    public void 숙소_반쪽_답은_짧게() throws Exception {
        String sv = read("src/main/java/com/gh/routefly/web/StaysServlet.java");
        assertTrue(sv.contains("if (out.remove(\"partial\") != null) PARTIAL.put(key, out, now);"));
        assertTrue("관광공사 실패", sv.contains("if (serviceKey != null && tour == null) out.addProperty(\"partial\", true);"));
        assertTrue("카카오 실패", sv.contains("if (out != null && kakao != null && kAll == null) out.addProperty(\"partial\", true);"));
        assertTrue("10분", sv.contains("PARTIAL = new OpenApi.Cache<>(200, 10L * 60 * 1000)"));
    }

    /** A11 - GPX 편집 작업 목록을 기기에 저절로 저장 · 되살림, A12 - 자른 구간 하나도 &rev=1, A15 - 뒤집기는 시각을 비춤. */
    @Test
    public void GPX_편집_작업_저장_과_방향() throws Exception {
        String js = read("src/main/webapp/js/studio.js");
        assertTrue("A11 고칠 때 · 열 때 저장 예약", js.contains("$(\"undoBtn\").disabled = false; markWork(); }") && js.contains("sel = tracks.length - 1;\n        markWork();"));
        assertTrue("A11 되살린 뒤 안내도 길", js.contains("restoreWork().then(openFromGuide);") && js.contains("indexedDB.open(\"rf-studio\", 1)"));
        assertTrue("A12", js.contains("(!parts || parts.length === 1) && get(\"rev\") === \"1\""));
        assertTrue("A15", js.contains("c.track = RF.reverseTrack(c.track);") && js.contains("RF.reverseTrack(o.track)"));
    }

    /** B3 - U+2028 · U+0085 뒤의 꺾쇠도 막음(예전 matches 는 . 이 그 글자를 못 넘어 통과). */
    @Test
    public void 이름_검사_줄_나눔_글자() {
        java.util.List<double[]> none = java.util.List.of();
        org.junit.Assert.assertEquals("코스 이름에 쓸 수 없는 글자가 있습니다.", CourseUploadServlet.check("a\u2028<img src=x onerror=1>", "hike", none));
        org.junit.Assert.assertEquals("코스 이름에 쓸 수 없는 글자가 있습니다.", CourseUploadServlet.check("가나\u0085다", "hike", none));
        org.junit.Assert.assertEquals("기록 점이 너무 적습니다.", CourseUploadServlet.check("북한산 둘레", "hike", none));
        String c = CourseSubmitServlet.clean("홍\u2029<b>\u0085길");
        assertFalse(c, c.contains("<") || c.contains("\u2029") || c.contains("\u0085"));
    }

    /** B8 - 한 곳은 동시에 옮기기 자리 3개까지(다른 곳은 그대로). */
    @Test
    public void 옮기기_자리는_한_곳에_셋() {
        long now = System.currentTimeMillis();
        java.util.List<String> ids = new java.util.ArrayList<>();
        try {
            for (int i = 0; i < 3; i++) { String id = String.format("%032x", 0xB8000L + i); ids.add(id); XferServlet.handle("/open", PartyTest.j("{\"id\":\"" + id + "\"}"), now, "k11"); }
            String id4 = String.format("%032x", 0xB8010L);
            try { XferServlet.handle("/open", PartyTest.j("{\"id\":\"" + id4 + "\"}"), now, "k11"); org.junit.Assert.fail("넷째"); }
            catch (IllegalStateException e) { assertTrue(e.getMessage().contains("한 곳에서")); }
            String other = String.format("%032x", 0xB8020L);
            ids.add(other);
            XferServlet.handle("/open", PartyTest.j("{\"id\":\"" + other + "\"}"), now, "k12");
            XferServlet.handle("/open", PartyTest.j("{\"id\":\"" + ids.get(0) + "\"}"), now, "k11");   // 같은 자리 다시 열기는 됨
        } finally {
            synchronized (XferServlet.SLOTS) { ids.forEach(XferServlet.SLOTS::remove); }
        }
    }

    /** B4 · B5 · B6 · B10 - 위치 답 private 1분 · 안전 no-store · 장애 답 no-store · 사이트맵 제한 · 파기는 방 자물쇠 밖. */
    @Test
    public void 캐시_머리글_사이트맵_파기() throws Exception {
        String json = read("src/main/java/com/gh/routefly/web/Json.java");
        assertTrue("B5", json.contains("if (body.has(\"unavailable\")) { write(resp, HttpServletResponse.SC_OK, body, false); return; }"));
        assertTrue("B4", json.contains("static final String PRIVATE_CACHE = \"private, max-age=60\";"));
        for (String f : new String[] {"WxServlet", "AirServlet", "StaysServlet", "ParkingServlet", "MidServlet", "WeatherServlet"})
            assertTrue(f, read("src/main/java/com/gh/routefly/web/" + f + ".java").contains("Json.okPrivate(req, resp, "));
        assertTrue("안전은 남기지 않음", read("src/main/java/com/gh/routefly/web/SafetyServlet.java").contains("Json.write(resp, HttpServletResponse.SC_OK, out, false);   // 내 자리"));
        assertTrue("B6", SecurityFilter.limited("/sitemap.xml"));
        String sm = read("src/main/java/com/gh/routefly/web/SitemapServlet.java");
        assertTrue(sm.contains("private synchronized List<String[]> courses(") && sm.contains("if (System.currentTimeMillis() - failedAt < 60_000L) return null;"));
        String party = read("src/main/java/com/gh/routefly/web/Party.java");
        String leave = party.substring(party.indexOf("    void leave(Member m, long now) {"), party.indexOf("private synchronized Member leaveLocked("));
        assertFalse("B10 leave 는 방 자물쇠를 잡지 않음", leave.contains("synchronized"));
        assertTrue(leave.contains("memberLog.purge(gone.room.code, gone.id);"));
    }
}
