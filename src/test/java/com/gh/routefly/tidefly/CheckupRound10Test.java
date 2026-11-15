package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.Test;

/**
 * 점검 10차(2026-11-15 홍TV님 "너가 정한 순서로 작업해. 전부") - docs/review-10-2026-11-15.md 의 A · B 가운데 다른 테스트가 지키지 않는 조각.
 * (Verdict 너울 · 찾기 · 먼바다 짝 · 철 · 레이더 · 앱 신호는 SeaDataTest · SpotsTest · PointWrnTest · SeasonTest · RadarTest · StatsTest)
 */
public class CheckupRound10Test {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of(path), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** B3 - 기억은 KEEP_MS 넘게 묵은 것만 지움(지금 것 · 3일 예보 13시간짜리는 남음). */
    @Test
    public void 기억은_오래된_것만_지움() {
        long now = 100L * 24 * 60 * 60_000L;
        Map<String, Object[]> c = new ConcurrentHashMap<>();
        c.put("sea:1:1:old", new Object[] {now - TideflyServlet.KEEP_MS - 1, "x"});
        c.put("tidefail:DT_0001:2026-11-01", new Object[] {now - 2 * TideflyServlet.KEEP_MS, null});
        c.put("seaf:1:1:fc:ef", new Object[] {now - TideflyServlet.HOURLY_TTL, "y"});
        c.put("wrn", new Object[] {now, "z"});
        assertEquals(2, TideflyServlet.purge(c, now));
        assertEquals(java.util.Set.of("seaf:1:1:fc:ef", "wrn"), c.keySet());
        assertTrue("3일 예보 기억보다 오래 둠", TideflyServlet.KEEP_MS > TideflyServlet.HOURLY_TTL);
    }

    /** A1 · B2 · B6 - 목록에 자리 판단(marks)을 함께, 자세히 보기는 받아 둔 것만, ?spots=1 은 없앰(자리 목록은 정적 파일). */
    @Test
    public void 목록에_자리_판단_자세히는_받아_둔_것만() throws Exception {
        String sv = read("src/main/java/com/gh/routefly/tidefly/TideflyServlet.java");
        assertTrue(sv.contains("out.add(\"marks\", spotMarks(wrn, nowUtc));"));
        assertFalse("요청마다 330KB 를 만들던 ?spots=1", sv.contains("getParameter(\"spots\")"));
        String detail = sv.substring(sv.indexOf("JsonObject p = points().get(name.trim());"), sv.indexOf("/** 그날 해 · 음력"));
        assertFalse("자세히 보기는 포털 · 기상청을 요청 스레드에서 부르지 않음", detail.contains("tide(pkey") || detail.contains("sea(key") || detail.contains("warnings(key"));
        assertTrue(detail.contains("cachedTide(p.get(\"tide\").getAsString(), day)"));
        assertTrue("3일 예보 일꾼 줄 한도", sv.contains("new java.util.concurrent.ArrayBlockingQueue<>(DETAIL_QUEUE)") && sv.contains("RejectedExecutionException"));
        assertTrue("기다림은 모두 합쳐 한 번", sv.contains("long until = System.currentTimeMillis() + HOURLY_WAIT_MS;") && sv.contains("j.cancel(true);"));
        assertTrue("미리 받기 끝에 기억 정리", sv.contains("int gone = purge(CACHE, System.currentTimeMillis());"));
        String js = read("src/main/webapp/js/tidefly.js");
        assertTrue(js.contains("fetch('data/tidefly-spots.json')") && js.contains("spotMarks = data.marks || {};"));
        assertTrue("자리 받기 실패 뒤 1분 쉼(C8)", js.contains("Date.now() - spotsFailAt < SPOTS_RETRY_MS"));
    }

    /** A2 - 서비스 워커는 /api/tidefly 를 받아 두지 않음(옛 판단을 지금 것처럼). */
    @Test
    public void 서비스_워커는_tidefly_를_건너뜀() throws Exception {
        String sw = read("src/main/webapp/sw.js");
        int skip = sw.indexOf("if (url.indexOf(\"/api/tidefly\") >= 0) return;");
        assertTrue(skip > 0 && skip < sw.indexOf("networkFirst(e, API)"));
    }

    /** A5 · A7 · A14 - 자리 알림 · 묶음마다 숙소 칸 · 작은 글. A13 - css 짝 없는 괄호. */
    @Test
    public void 화면_조각() throws Exception {
        String js = read("src/main/webapp/js/tidefly.js");
        assertTrue("자리 알림도 돎", js.contains("items.concat(spotItems()).forEach(function (it) {"));
        assertTrue("숙소 칸은 묶음마다", js.contains("var sk = sec + '|' + p.name;") && js.contains("if (openKind === '' && stayOut[sk])"));
        assertTrue(js.contains("sunsetLeft === '곧' ? ' (곧 해 짐)'"));
        assertTrue("자정 넘으면 날짜 다시", js.contains("if (!document.hidden) { paintToday(); draw(); }"));
        assertTrue("말을 바꾸면 숙소 칸 새로", js.contains("stayOut = {};"));
        String css = read("src/main/webapp/css/tidefly.css");
        int open = 0;
        for (char ch : css.replaceAll("/\\*.*?\\*/", "").toCharArray()) {
            if (ch == '{') open++;
            if (ch == '}') open--;
            assertTrue("짝 없는 }", open >= 0);
        }
        assertEquals(0, open);
    }

    /** A9 - 따라가기 시작 안전 알림에는 비 줄을 넣지 않음(비는 rainCheck). B5 - /api/rain 은 no-store. */
    @Test
    public void 비_알림은_한_번_비_응답은_남기지_않음() throws Exception {
        String hike = read("src/main/webapp/js/hike.js");
        assertTrue(hike.contains("RF.safetyAlert(Object.assign({}, j, { rain: null }), Date.now(), EN)"));
        assertTrue("G4 - 주석이 제자리", hike.contains("/** 위치 한 번 - 코스에 맞추고 화면을 고칩니다. */\n    function onFix(pos) {"));
        String rain = read("src/main/java/com/gh/routefly/web/RainServlet.java");
        assertTrue(rain.contains("resp.setHeader(\"Cache-Control\", \"no-store\");") && !rain.contains("Json.ok("));
        for (String f : new String[] {"mountain.js", "mountain-en.js", "tools.js"}) {
            assertTrue("A12 " + f, read("src/main/webapp/js/" + f).contains("j.unavailable && !j.rain"));
        }
    }
}
