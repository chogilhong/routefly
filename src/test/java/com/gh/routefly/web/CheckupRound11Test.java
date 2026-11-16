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
        assertTrue("A15", js.contains("c.track = RF.reverseTrack(c.track);") && read("src/main/webapp/js/course-kit.js").contains("? reverseTrack(b) : b;"));   // 잇기의 뒤집기는 RF.joinPlan 안(2026-11-16)
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

    /** C1 ~ C11 - 호출 · 속도. */
    @Test
    public void 호출_줄이기() throws Exception {
        String mid = read("src/main/java/com/gh/routefly/web/MidServlet.java");
        assertTrue("C1 육상 · 기온 글 따로, 13시간", mid.contains("text(LAND_TEXT, land + \"|\" + tm,") && mid.contains("new OpenApi.Cache<>(200, 13L * 60 * 60 * 1000)"));
        String sf = read("src/main/java/com/gh/routefly/web/SafetyServlet.java");
        assertTrue("C2 응급실 24시간 · 자외선 13시간 · 실패 표시 따로", sf.contains("cached(erKey, ER_CACHE,") && sf.contains("UV_CACHE, () ->") && sf.contains("FAIL.put(\"x@\" + key"));
        String hd = read("src/main/java/com/gh/routefly/web/HolidayServlet.java");
        assertTrue("C3", hd.contains("Flight.once(\"holiday|\" + y,") && hd.contains("24L * 60 * 60 * 1000"));
        assertTrue("C4", read("src/main/java/com/gh/routefly/web/TideServlet.java").contains("new OpenApi.Cache<>(300, 72L * 60 * 60 * 1000)"));
        long t = 1_000_000L;
        Radar.EMPTY_AT.clear();
        Radar.EMPTY_AT.put("202611161230", t);
        assertTrue("C5 빈 시각은 3분 쉼", Radar.emptyRecently("202611161230", t + 60_000));
        assertFalse(Radar.emptyRecently("202611161230", t + Radar.EMPTY_RETRY_MS + 1));
        assertFalse(Radar.emptyRecently("202611161240", t));
        Radar.EMPTY_AT.clear();
        String wk = read("src/main/java/com/gh/routefly/web/WeekendServlet.java");
        assertTrue("C6", wk.contains("Flight.once(\"weekend|\" + ck") && wk.contains("for (String[] pl : peakLand) if (l[0].equals(pl[1])) ps.add(pl[0]);"));
        com.google.gson.JsonObject o = com.google.gson.JsonParser.parseString("{\"weather\":{\"success\":true},\"mid\":{\"success\":true},\"air\":{\"unavailable\":true,\"settled\":true}}").getAsJsonObject();
        assertFalse("C7 측정소가 먼 곳은 다 받은 것", WxServlet.partial(o));
        o.getAsJsonObject("air").remove("settled");
        assertTrue("C7 실패는 그대로 부분", WxServlet.partial(o));
        assertTrue("C8", read("src/main/java/com/gh/routefly/web/Steep.java").contains("CACHE.compute(id, (k, v) -> v == null || v[1] < now ?"));
        String st = read("src/main/webapp/js/studio.js");
        assertTrue("C9", st.contains("var midTrack = c.track.slice(r.a.length, c.track.length - r.b.length);"));
        assertTrue("C10", st.contains("hoverAt = c.track[k];\n        drawPts();"));
        String hk = read("src/main/webapp/js/hike.js");
        assertTrue("C11", hk.contains("if (hike.arrived || Date.now() - (hike.savedAt || 0) >= SAVE_EVERY_MS) save();") && hk.contains("{ flushTrack(); save(); }"));
    }

    /** D1 ~ D10 - 검색 · 방침 · 접근성 · 코스 페이지. */
    @Test
    public void 검색_방침_접근성() throws Exception {
        String w = "src/main/webapp/";
        for (String f : new String[] {"park.html", "route.html"}) assertTrue("D1 " + f, read(w + f).contains("<meta name=\"robots\" content=\"noindex, follow\">"));
        String pk = read(w + "privacy.html"), pe = read(w + "privacy-en.html");
        assertTrue("D2", pk.contains("카카오(다음) 우편번호") && pk.contains("Frankfurter") && pk.contains("Overpass") && pk.contains("GPX 편집에서 열어 둔 길"));
        assertTrue("D2 영어", pe.contains("Kakao (Daum) postcode") && pe.contains("Frankfurter") && pe.contains("Overpass") && pe.contains("Tracks open in the GPX editor"));
        String hk = read(w + "js/hike.js"), hh = read(w + "hike.html");
        assertTrue("D3", hh.contains("<span id=\"offText\"></span><span id=\"offLive\" class=\"vh\" role=\"alert\"></span>") && hk.contains("function gpsAcc(acc) {"));
        assertTrue("D4", hk.contains("hike.lastFix = null; hike.dMaxAt = null; hike.trackFull = false;") && hh.contains(".spot::after { content:\"\"; position:absolute; inset:-14px; }")
                && hh.contains("prefers-reduced-motion: reduce") && hh.contains("tabindex=\"0\" data-en=\"GPS off\""));
        assertTrue("D5", read(w + "js/park.js").contains("px.x + w > W - 8 - RIGHT_CTRL"));
        assertTrue("D6", read(w + "studio.html").contains(".b { min-height:44px;") && read(w + "about.html").contains(".back { display:inline-flex; align-items:center; min-height:44px;"));
        assertTrue("D7", read(w + "tools.html").contains(".tip a { color:#38d9ea; }"));
        assertTrue("D8", read(w + "js/games.js").contains("\"Rotate · Up\"") && read(w + "games.html").contains("<h2 id=\"grpA\">") && read(w + "js/tools.js").contains("\"⌫\": [\"한 글자 지우기\", \"Backspace\"]"));
        for (String f : new String[] {"about", "about-en", "privacy", "privacy-en", "terms", "terms-en", "lbs-terms", "lbs-terms-en"})
            assertTrue("D9 " + f, read(w + f + ".html").contains("<meta name=\"description\" content=\""));
        assertTrue("D10 광고는 검색에 내는 코스만", read("src/main/java/com/gh/routefly/web/CoursePageServlet.java").contains("if (index) b.append(Ads.box(\"c\"));"));
        org.junit.Assert.assertEquals(0, CoursePageServlet.shownEle(-3.6));
        org.junit.Assert.assertEquals(44, CoursePageServlet.shownEle(43.6));
        String svg = CoursePageServlet.profileSvg(new double[] {0, 100, 200, 300}, new Double[] {10.0, 55.0, 30.0, 12.0});
        assertTrue("D10 높이 범위는 모든 점으로", svg.contains("높이 10m ~ 55m"));
    }

    /** 2026-11-16 홍TV님 "이런 코스는 만들면 안 돼잖아" - 이웃 두 점 200m 넘는 곧은 선은 코스로 받지 않음(화면 잇기 · 올리기도). */
    @Test
    public void 곧은_선_코스는_받지_않음() throws Exception {
        java.util.List<double[]> pts = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) pts.add(new double[] {37.0 + i * 0.0005, 127.0});   // 55m 간격 · 600m 남짓
        org.junit.Assert.assertNull(CourseUploadServlet.check("시험 길", "hike", pts));
        pts.add(new double[] {37.03, 127.0});   // 2.4km 곧은 선
        String e = CourseUploadServlet.check("시험 길", "hike", pts);
        assertTrue(e, e != null && e.contains("곧은 선"));
        String st = read("src/main/webapp/js/studio.js");
        assertTrue("잇기는 멀면 막음", st.contains("box.querySelector(\".tok\").disabled = far;") && st.contains("if (!preview || preview.far) return;"));
        assertTrue("올리기 전 확인", st.contains("if (jump.m > RF.JOIN_GAP_M) {"));
        assertTrue("길이 없으면 이름 칸 비움", st.contains("if (!c) $(\"name\").value = \"\";"));
        assertTrue("가까운 끝끼리 저절로(뒤집기 · 앞에)", st.contains("var pl = RF.joinPlan(c.track, tracks[+jw.value].track), far = pl.gap > RF.JOIN_GAP_M;") && !st.contains("붙일 길을 뒤집어서(끝 → 처음)"));
    }

    /** E1 · E3 · E4 - 저장 지키기 부탁 · 하산 시각 알림 강제 · 무사히 문자(E2 · E5 는 review11.test.js). */
    @Test
    public void 따라가기_제안_E() throws Exception {
        String js = read("src/main/webapp/js/hike.js");
        assertTrue("E1", js.contains("navigator.storage.persist().then(function (kept) {"));
        assertTrue("E3", js.contains("say(a.text, { urgent: true, force: true });"));
        assertTrue("E4", js.contains("safe.className = \"safeSms\";") && !js.substring(js.indexOf("safe.href = "), js.indexOf("safe.textContent")).contains("lat"));
        assertTrue("E2 · E5 부름", js.contains("safetyRecheck(co.latitude, co.longitude); mapSavedCheck(co.latitude, co.longitude);"));
        assertTrue("E2 방침", read("src/main/webapp/privacy.html").contains("90분마다 다시 보는 특보 · 산불위험도 같은 칸 가운데로"));
    }

    /** E8 - 내보낸 기기(IPv6 /64)는 2시간 그 방에 다시 못 들어옴, IPv4(_net 없음)는 막지 않음. SOS 알림은 확인 전까지 되풀이. */
    @Test
    public void 내보낸_기기는_2시간() throws Exception {
        Party p = new Party();
        com.google.gson.JsonObject room = PartyTest.call(p, "/create", "{\"name\":\"단풍\",\"leaderPhone\":\"010-1234-5678\",\"departAt\":" + PartyTest.DEPART + "}", PartyTest.T0);
        String code = room.get("code").getAsString(), lead = room.get("token").getAsString();
        com.google.gson.JsonObject x = PartyTest.call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"낯선이\",\"agree\":true,\"_net\":\"2001:db8:5:6::/64\"}", PartyTest.T0);
        PartyTest.call(p, "/kick", "{\"token\":\"" + lead + "\",\"id\":" + x.get("me").getAsInt() + "}", PartyTest.T0);
        try { PartyTest.call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"다른이름\",\"agree\":true,\"_net\":\"2001:db8:5:6::/64\"}", PartyTest.T0 + 60_000); org.junit.Assert.fail("같은 망"); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage().contains("내보낸 기기")); }
        PartyTest.call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"회원\",\"agree\":true,\"_net\":\"2001:db8:5:7::/64\"}", PartyTest.T0 + 60_000);   // 다른 망은 됨
        PartyTest.call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"버스와이파이\",\"agree\":true}", PartyTest.T0 + 60_000);   // IPv4 - 막지 않음
        PartyTest.call(p, "/join", "{\"code\":\"" + code + "\",\"nick\":\"두시간뒤\",\"agree\":true,\"_net\":\"2001:db8:5:6::/64\"}", PartyTest.T0 + Party.KICK_BLOCK_MS + 1);
        assertTrue("서버가 _net 을 넣음(보낸 값은 버림)", read("src/main/java/com/gh/routefly/web/PartyServlet.java").contains("in.remove(\"_net\");"));
        String js = read("src/main/webapp/js/party.js");
        assertTrue("SOS 되풀이 · 확인", js.contains("var SOS_REPEAT_MS = 45000;") && js.contains("if (seen.ack || t - seen.t < SOS_REPEAT_MS) return;") && js.contains("data-sack"));
    }

    /** E6 · E7 · E9 - 점 줄이기 · 높이 채우기 · 출발/정상/도착 표시, 안내도 구간 목록 · 되돌리기, og.jpg · 영어 산 목록 링크 · 움직임 줄이기. */
    @Test
    public void 남은_제안_E6_E7_E9() throws Exception {
        String st = read("src/main/webapp/js/studio.js"), kit = read("src/main/webapp/js/course-kit.js");
        assertTrue("E6 점 줄이기 · 높이", st.contains("$(\"simpBtn\").onclick") && st.contains("$(\"eleBtn\").onclick") && kit.contains("simplifyTrack: simplifyTrack"));
        assertTrue("E6 wpt", st.contains("c.track, { wpt: true })"));
        String pk = read("src/main/webapp/js/park.js");
        assertTrue("E7", pk.contains("function segList() {") && pk.contains("closest(\"[data-undo]\")") && pk.contains("data-seg"));
        assertTrue("E9 og.jpg", Files.exists(Path.of("src/main/webapp/img/og.jpg")) && read("src/main/webapp/hike.html").contains("img/og.jpg?v=3"));
        assertFalse("E9 og.png 남음", read("src/main/webapp/hike.html").contains("og.png"));
        assertTrue("E9 영어 링크", read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains("Trails in English ›"));
        assertTrue("E9 움직임", read("src/main/webapp/index.html").contains("@media (prefers-reduced-motion: reduce) { .spotRing { animation:none; } }"));
    }
}
