package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Map;

import org.junit.Test;

/** 점검 14차(2026-11-24 홍TV님 "정밀하게 심도높게 해" · "전부 작업해") - 단계마다 메서드 하나. */
public class Checkup14Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 단계1_급한_것() throws Exception {
        // A1 걷기 길 칸: 없는 칸은 캐시에 넣지 않음 · 우리나라 밖 범위는 받지 않음
        java.lang.reflect.Field f = WalkWaysServlet.class.getDeclaredField("CACHE");
        f.setAccessible(true);
        Map<?, ?> cache = (Map<?, ?>) f.get(null);
        int before;
        synchronized (cache) { before = cache.size(); }
        for (int i = 0; i < 50; i++) assertTrue(WalkWaysServlet.rows(new File("/nonexistent-walk/c_" + i + ".tsv")).isEmpty());
        synchronized (cache) { assertEquals("없는 칸은 담지 않음", before, cache.size()); }
        assertTrue(WalkWaysServlet.inKorea(new double[] {127.0, 37.0, 127.05, 37.05}));
        assertFalse("바다 · 외국", WalkWaysServlet.inKorea(new double[] {0.0, 0.0, 0.05, 0.05}));
        // A3 공개 기록 만들기 입구는 없음(보기만) - VideoKitTest 가 405 · 1년 지움을 봄
        assertFalse(read("src/main/java/com/gh/routefly/web/RecordShareServlet.java").contains("doPost"));
        // A4 자동 광고는 쓰지 않음(문서)
        assertTrue(read("CLAUDE.md").contains("애드센스 \"자동 광고\" 는 켜지 않습니다"));
        // A5 이은 코스도 조각마다 받음 - 코스 보기 · 코스 GPX 저장 · GPX 편집이 같은 RF.courseFetch
        assertTrue(read("src/main/webapp/js/trip.js").contains("Promise.all([RF.courseFetch(courseParam, cJson), ownP])")
                && read("src/main/webapp/js/hike.js").contains("Promise.all([RF.courseFetch(id, getJson), ownerDevice()])")
                && read("src/main/webapp/js/studio.js").contains("RF.courseFetch(id, json).then(function (c) {"));
        // A6 밝은 모드에서 어두운 칸 글자
        assertTrue(read("src/main/webapp/trip.html").contains("<style>:root[data-theme=\"light\"] { --bg:#11161d;"));
        assertTrue(read("src/main/webapp/studio.html").contains(":root[data-theme=\"light\"] #findQ { background:var(--panel); color:var(--tx); }"));
        // F3 부르는 곳 없는 함수 · F2 같은 식 한 곳
        String st = read("src/main/webapp/js/studio.js");
        assertFalse(st.contains("function isOurs("));
        assertEquals("우리 지도 보이기 식은 한 곳", 1, st.split("l.layout.visibility !== \"none\"", -1).length - 1);
        // F4 방침 - 광고 자리 · 공개 기록 지우기
        for (String p : new String[] {"privacy.html", "privacy-en.html"}) {
            String t = read("src/main/webapp/" + p);
            assertFalse(p, t.contains("따라가기 · 산악회 방 화면과 앱에는 없음") || t.contains("not on the hike or hiking club room screens"));
            assertFalse(p, t.contains("\"공개 끄기\" 를 누르면 바로 지우고") || t.contains("\"Turn off\" deletes it immediately"));
        }
    }

    @Test
    public void 단계2_보안_오프라인() throws Exception {
        // B1 따라가기 CSP 는 좁은 애드센스 곳만
        String hikeCsp = SecurityFilter.cspFor("/hike.html");
        assertTrue(hikeCsp.contains("pagead2.googlesyndication.com") && !hikeCsp.contains("*.google.com") && !hikeCsp.contains("*.gstatic.com"));
        String hk = read("src/main/webapp/js/hike.js");
        // B2 링크만으로 내려받지 않음 · B3 이름은 서버 코스 이름 먼저 · 주소 title 은 60자
        assertTrue(hk.contains("return hAsk(T(\"\\\"\" + NM(name) + \"\\\" 코스를 GPX 파일로 저장할까요?\""));
        assertTrue(hk.contains("name = (c.course && c.course.name) || title || id;"));
        String tj = read("src/main/webapp/js/trip.js");
        assertTrue(tj.contains(".slice(0, 60), cQ") && tj.contains("var name = (c.course && c.course.name) || cTitle || courseParam"));
        // 이어 하기가 넘겨받은 일을 덮지 않음
        assertTrue(hk.contains("!/^#(recdo|coursegpx)=/.test(location.hash)"));
        // B4 routefly 이름은 보낸 사람 이름으로 못 씀
        assertTrue(read("src/main/java/com/gh/routefly/web/CourseUploadServlet.java").contains("\"routefly\".equalsIgnoreCase(maker.trim())"));
        // B5 · D1 서비스 워커
        String sw = read("src/main/webapp/sw.js");
        assertTrue(sw.contains("if (url.indexOf(\"/api/course-upload\") >= 0) return;"));
        for (String f : new String[] {"trip.html", "js/kit-trip.js", "js/trip.js", "vendor/pmtiles-4.5.0/pmtiles.js", "js/ads.js"}) assertTrue(f, sw.contains("\"" + f + "\""));
        // D6 숨은 광고 자리는 시계로 돌지 않음
        String ads = read("src/main/webapp/js/ads.js");
        assertTrue(ads.contains("new IntersectionObserver(") && !ads.contains("setInterval("));
    }

    @Test
    public void 단계3_접근_코스보기_수익() throws Exception {
        String hk = read("src/main/webapp/js/hike.js"), tj = read("src/main/webapp/js/trip.js"), ads = read("src/main/webapp/js/ads.js");
        // C1 목록 줄 · 사진 카드를 키보드로
        assertEquals("코스 · 찜 · 저장 목록 줄", 3, hk.split(java.util.regex.Pattern.quote("it.tabIndex = 0; it.setAttribute(\"role\", \"link\");"), -1).length - 1);
        assertTrue(hk.contains("$(\"pickList\").addEventListener(\"keydown\", function (e) {") && tj.contains("card.tabIndex = 0; card.setAttribute(\"role\", \"button\");"));
        // C2 코스 보기에서 따라가기 · 공유
        assertTrue(read("src/main/webapp/trip.html").contains("<button type=\"button\" id=\"rec-go\" data-en=\"🥾 Follow\" hidden>🥾 따라가기</button><button type=\"button\" id=\"rec-share\""));
        assertTrue(tj.contains("$(\"rec-go\").onclick = function () { location.href = (EN ? \"hike.html?lang=en\" : \"hike.html\") + cQ; };"));
        // C4 폰에서도 그래프 · C5 📊 · C6 제목 · 영어는 GPX 편집 숨김
        assertTrue(tj.contains("if (courseParam) narrow = false;") && hk.contains("ed.textContent = \"📊\";") && tj.contains("T(\" - routefly 코스 보기\", \" - routefly course\")"));
        // E1 /c/ 추천 상품 · E3 /c/ 양옆 · E2 양옆 칸은 애드센스 전 쿠팡
        assertTrue(read("src/main/java/com/gh/routefly/web/CoursePageServlet.java").contains("<section id=\\\"featC\\\" hidden><h2>🎒 추천 상품 · 광고</h2></section>"));
        assertTrue(read("src/main/webapp/js/course-page.js").contains("n.textContent = window.RF.COUPANG_NOTE;"));
        assertTrue(ads.contains("if (where === \"side\") { coupangRails(byWhere[where]); return; }") && ads.contains("a.rel = \"noopener sponsored\";")
                && ads.contains("/^https:\\/\\/(link\\.coupang\\.com|coupa\\.ng)\\//"));
        assertTrue("쿠팡 문구는 course-kit 과 같은 글", ads.contains(read("src/main/webapp/js/course-kit.js").replaceAll("(?s).*var COUPANG_NOTE = \"([^\"]+)\".*", "$1")));
    }

    @Test
    public void 단계4_코스보기_편집_정리() throws Exception {
        String tj = read("src/main/webapp/js/trip.js"), st = read("src/main/webapp/js/studio.js"), kit = read("src/main/webapp/js/course-kit.js"), hk = read("src/main/webapp/js/hike.js");
        // F1 정상 통제(대암산)는 "정상에 안 감" 을 붙이지 않음 - 통제 정상은 passes 에 들 수 없음
        com.google.gson.JsonObject daeam = com.google.gson.JsonParser.parseString("{\"id\":\"대암산\",\"name\":\"대암산\",\"closed\":\"군 통제구역\"}").getAsJsonObject();
        com.google.gson.JsonObject a = com.google.gson.JsonParser.parseString("{\"name\":\"가\",\"passes\":[]}").getAsJsonObject(), b = com.google.gson.JsonParser.parseString("{\"name\":\"나\",\"passes\":[\"x\"]}").getAsJsonObject();
        java.util.List<com.google.gson.JsonObject> got = MountainServlet.markOff(new java.util.ArrayList<>(java.util.List.of(a, b)), daeam);
        assertEquals(java.util.List.of(a, b), got);
        assertFalse(a.has("summit_off") || b.has("summit_off"));
        daeam.remove("closed");
        MountainServlet.markOff(new java.util.ArrayList<>(java.util.List.of(a, b)), daeam);
        assertTrue("통제가 아니면 그대로 표시", a.has("summit_off") && b.has("summit_off"));
        // D7 맛집 카카오 넷을 함께 · 8초 마감 · 일부만 받으면 남기지 않음
        String food = read("src/main/java/com/gh/routefly/web/FoodServlet.java");
        assertEquals(8_000, FoodServlet.WAIT_MS);
        assertTrue(food.contains("jobs.put(show, POOL.submit(() -> {") && food.contains("if (partial && !byShow.isEmpty()) Json.write(resp, HttpServletResponse.SC_OK, out, false);"));
        // 작은 것: 목소리 rate 400 · 공유 그림 사진 없으면 null(MountainHeroTest)
        assertTrue(read("src/main/java/com/gh/routefly/web/VoiceServlet.java").contains("json(resp, 400, err(\"rate 는 숫자입니다\"));"));
        // C3 코스 보기 정보 칸 · D2 바로 저장(앱은 따라가기) · D5 마우스 따라가기 가볍게 · C9 사진 창 · 지우기 replace · 지도 8초
        assertTrue(tj.contains("if (courseParam && courseInfo) infoBox(courseInfo);") && tj.contains("courseInfo = c;")
                && tj.contains("lv = off ? null : RF.levelChip(c.total, asc, EN, RF.steepest(c.dist, c.ele), null);") && tj.contains("RF.hm(RF.legMs(c, 0, c.total))"));
        assertTrue(tj.contains("if (window.Capacitor || !gpxText) {") && tj.contains("new Blob([gpxText], { type: \"application/gpx+xml\" })")
                && tj.contains("credit: RF.courseGpxCredit(courseParam, src, EN)"));
        assertTrue(tj.contains("var i = RF.indexAt(rc, d);") && tj.contains("var q = RF.snap(rc, lat, lon, hovD);") && tj.contains("lat < rcBox[0] - dy"));
        assertTrue(tj.contains("$(\"bigClose\").focus();") && read("src/main/webapp/trip.html").contains("<div id=\"big\" role=\"dialog\" aria-modal=\"true\""));
        assertTrue(read("src/main/webapp/trip.html").contains("@media (pointer: coarse) { #kinds .kind { width:44px; height:44px;"));
        assertTrue(hk.contains("$(\"photoBig\").focus();") && hk.contains("if (e.key === \"Escape\" || e.key === \"Enter\" || e.key === \" \") { e.preventDefault(); e.stopPropagation(); photoBigClose(); }"));
        // C7 같은 길 두 번 · C8 출처 접기 · D3 지도 설정 함께 받기
        assertEquals("안내도 · 기록(두 곳) · 넘겨받은 GPX", 4, st.split(java.util.regex.Pattern.quote("addOnce("), -1).length - 2);
        assertTrue(st.contains("        if (phone()) foldAttrib();") && st.contains("var mapCfgP = fetch(\"api/map-config\"") && st.contains("        mapCfgP.then(function (j) {"));
        assertTrue("지도 설정을 운영자 확인보다 먼저 묻기 시작", st.indexOf("var mapCfgP = fetch(") < st.indexOf("var ownerP = RF.ownerDevice()"));
        // F2 한 벌로: 시간 글 · 운영자 물음 · 기록 열쇠 · 내 기록 읽기 · 광고 자리 CSS
        assertTrue(kit.contains("recKey: recKey, myRecords: myRecords, ownerDevice: ownerDevice,") && !tj.contains("function hm("));
        for (String f : new String[] {"trip.js", "studio.js", "hike.js", "park.js", "route.js", "mountain.js"})
            assertFalse(f, read("src/main/webapp/js/" + f).contains("fetch(\"api/course-upload\", { headers: { Accept: \"application/json\" }, cache: \"no-store\" })")
                    || read("src/main/webapp/js/" + f).contains("fetch(\"../api/course-upload\""));
        // 📊 옆 "자세히" 는 PC 넓은 화면만(2026-11-24 홍TV님 "이거 해줘") - 폰은 그림만
        assertTrue(hk.contains("edTx.textContent = T(\" 자세히\", \" Details\");") && read("src/main/webapp/hike.html").contains("#pickList .it .fly .edTx { display:none;")
                && read("src/main/webapp/hike.html").contains("@media (min-width:900px) {\n  #pickList .it .fly .edTx { display:inline; }"));
        assertFalse(read("src/main/webapp/hike.html").contains(".adRail { display:none; }") || read("src/main/webapp/css/mountain.css").contains(".adRail { display:none; }"));
    }
}
