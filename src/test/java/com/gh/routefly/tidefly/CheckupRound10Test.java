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
        assertTrue("자정 넘으면 날짜 다시", js.contains("if (document.hidden) return;\n    paintToday();"));
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

    /** C2 - 최신 발표로 받은 예측은 발효 시각이 바뀔 때까지, 앞 발표로 받은 것은 1시간. 앞 발효 시각은 3시간 전. */
    @Test
    public void 같은_발표는_다시_묻지_않음() {
        SeaForecast latest = new SeaForecast("2026111500", "2026111506", 1, 1, 0.5, 4.0, 100.0, 5.0, 90.0, null, null, null, 1);
        SeaForecast older = new SeaForecast("2026111412", "2026111506", 1, 1, 0.5, 4.0, 100.0, 5.0, 90.0, null, null, null, 1);
        long got = 1_000_000L, twoHours = 2 * 60 * 60_000L;
        assertTrue(TideflyServlet.fresh(latest, got, "2026111500", got + twoHours));
        assertFalse("앞 발표는 1시간 뒤 최신을 다시 물음", TideflyServlet.fresh(older, got, "2026111500", got + twoHours));
        assertTrue(TideflyServlet.fresh(older, got, "2026111500", got + 30 * 60_000L));
        assertEquals("2026111421", TideflyServlet.prevEf("2026111500"));
    }

    /** C11 - 빈 날(자료 없음)도 파일로 남기되 하루만 믿음. */
    @Test
    public void 빈_날은_하루만() throws Exception {
        Path dir = Files.createTempDirectory("tf-empty");
        java.time.LocalDate day = java.time.LocalDate.of(2026, 11, 20);
        TideflyServlet.saveTide(dir, "DT_0001", day, new Tide(null, java.util.List.of()));
        Path f = dir.resolve("DT_0001-2026-11-20.json");
        assertTrue("빈 날도 남김", Files.isRegularFile(f));
        assertTrue(TideflyServlet.readTide(dir, "DT_0001", day).events().isEmpty());
        Files.setLastModifiedTime(f, java.nio.file.attribute.FileTime.fromMillis(System.currentTimeMillis() - TideflyServlet.EMPTY_KEEP_MS - 60_000));
        assertEquals("하루 지난 빈 날은 다시 물음", null, TideflyServlet.readTide(dir, "DT_0001", day));
        Files.delete(f);
        Files.delete(dir);
    }

    /** C1 · C5 · C6 - 칸마다 한 번 · 실패 쉼, 쉬는 것은 받는 중이 아님, 키 없어도 물때. */
    @Test
    public void 미리_받기는_칸마다_한_번() throws Exception {
        String sv = read("src/main/java/com/gh/routefly/tidefly/TideflyServlet.java");
        assertTrue(sv.contains("if (!tried.add(lz + \":\" + sz) || exactSea(lz, sz, nowUtc) != null || seaFailing(lz, sz)) continue;"));
        assertTrue(sv.contains("CACHE.put(\"seafail:\" + lzone + \":\" + szone, new Object[] {now, null});"));
        assertTrue(sv.contains("if (key != null && !firstWarm) for (JsonObject p : points().values()) {"));
        assertFalse("키가 없다고 바퀴를 끝내지 않음", sv.contains("if (key == null) return;\n            ZonedDateTime nowUtc"));
        assertTrue(sv.contains("&& !seaFailing(p.get(\"lzone\").getAsInt(), p.get(\"szone\").getAsInt()))") && sv.contains("now >= portalRestUntil && (t0 == null"));
    }

    /** C5 · C7 · C9 - 화면은 받는 중에 10 → 30 → 60초 · 숨은 탭은 멈춤, 찾기는 0.2초 뒤 한 번, 숙소 기억 2500. */
    @Test
    public void 화면_호출_줄이기() throws Exception {
        String js = read("src/main/webapp/js/tidefly.js");
        assertTrue(js.contains("WARM_WAIT = [10000, 30000, 60000]") && js.contains("later(data.warming ? WARM_WAIT[Math.min(warmTries, WARM_WAIT.length) - 1] : 600000);"));
        assertTrue(js.contains("if (document.hidden) { waitHidden = true; return; }"));
        assertFalse("10초마다 끝없이 하던 것", js.contains("timer = setTimeout(load, data.warming ? 10000 : 600000);"));
        assertTrue(js.contains("typing = setTimeout(draw, 200);"));
        assertTrue(read("src/main/java/com/gh/routefly/web/StaysServlet.java").contains("CACHE_MAX = 2500;"));
    }

    /** D1 · D2 · D3 · D4 · D5 · D7 · D8 - 초점 되살리기 · 대비 · 모드 단추 · 44px · 제목 안 단추 · 알림 닫기 · 물때표 단추 자리. */
    @Test
    public void 화면_접근성() throws Exception {
        String js = read("src/main/webapp/js/tidefly.js"), css = read("src/main/webapp/css/tidefly.css"), html = read("src/main/webapp/tidefly.html");
        assertTrue("D1", js.contains("var fa = document.activeElement, fk = fa && listEl.contains(fa) && fa.getAttribute && fa.getAttribute('data-fk');"));
        assertTrue("D2 밝은 모드 색", css.contains("--ok: #17744a;") && css.contains("--care: #9a5d00;") && css.contains("--none: #5f6c74;") && css.contains("background: #b3261e;"));
        assertFalse("D3", html.contains("id=\"theme\" aria-pressed") || js.contains("themeBtn.setAttribute('aria-pressed'"));
        for (String sel : new String[] {".lang button { min-height: 44px", ".top .opt { display: inline-flex; align-items: center; gap: 3px; min-height: 44px", ".pick select { font: inherit; min-height: 44px", ".stay-btn { flex: 1; min-height: 44px"}) {
            assertTrue("D4 " + sel, css.contains(sel));
        }
        assertTrue("D5", js.contains("var hh = el('h3', 'card-h');") && !js.contains("el('h3', 'name'") && js.contains("sym.setAttribute('aria-hidden', 'true');"));
        assertTrue("D7", html.contains("<button type=\"button\" class=\"x\"") && js.contains("e.key === 'Escape'"));
        assertTrue("D8 물때표 단추가 숙소 칸 앞", js.indexOf("li.appendChild(more);") < js.indexOf("li.appendChild(stayBox(p, sec));"));
    }

    /** E5 · E6 · E7 · F1 · G3 - ?q= 카드 열기 · 별거 별거 링크, 방침에 tidefly(코드가 쓰는 tf-* 열쇠 모두), og 태그, 쏘카, 찾기 기다림 한도. */
    @Test
    public void 잇기_방침_미리보기_제휴_기다림() throws Exception {
        String js = read("src/main/webapp/js/tidefly.js");
        assertTrue("E5", js.contains("if (it.point && bare(it.point.name) === bare(urlOpen))") && read("src/main/webapp/tools.html").contains("<a href=\"tidefly.html?lang=ko\" data-en-href=\"tidefly.html?lang=en\""));
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("'(tf-[a-z-]+)'").matcher(js + read("src/main/webapp/js/tidefly-early.js"));
        java.util.Set<String> keys = new java.util.TreeSet<>();
        while (m.find()) keys.add(m.group(1));
        assertTrue(keys.size() >= 5);
        for (String page : new String[] {"privacy.html", "privacy-en.html"}) {
            String pol = read("src/main/webapp/" + page);
            for (String k : keys) assertTrue("E6 " + page + " " + k, pol.contains(k));
            assertTrue("E6 " + page, pol.contains("<h2>🎣 tidefly"));
        }
        String html = read("src/main/webapp/tidefly.html");
        assertTrue("E7", html.contains("<meta property=\"og:title\"") && html.contains("<meta property=\"og:url\" content=\"https://routefly.kr/routefly/tidefly.html\">") && !html.contains("noindex"));   // 2026-11-18 검색에 냄(사이트맵에도)
        assertTrue("F1", js.contains("window.RF.socarLine(sc, pp && pp.socar, navigator.userAgent,") && read("src/main/webapp/js/kit-tidefly.js").contains("function socarLine("));
        for (String f : new String[] {"mountain.js", "mountain-en.js"}) {
            String mj = read("src/main/webapp/js/" + f);
            assertTrue("G3 " + f, mj.contains("FIND_WAIT_MS = 3000") && mj.contains("setTimeout(once(function () { if (ctl) ctl.abort(); go(); }), FIND_WAIT_MS);"));
        }
    }

    /** 2026-11-15 홍TV님 "미세하게 조정이 안 돼네" - 자르기 · 가운데 지우기 · 나누기 밀대는 10m 칸 + 양옆 − · ＋(GPX 편집 · 따라가기 올리기 전 자르기 두 벌). */
    @Test
    public void 자르기_밀대는_10m_단추() throws Exception {
        String st = read("src/main/webapp/js/studio.js"), hk = read("src/main/webapp/js/hike.js");
        assertTrue(st.contains("step = 10, max") && st.contains("class=\"b nud\"") && st.contains("        nudgeWire(box);\n        box.querySelector(\".tno\").onclick = closeTool;"));
        assertTrue(st.contains("inp.dispatchEvent(new Event(\"input\"));"));
        assertFalse("따라가기 자르기 창은 없음 - 등록 요청이 GPX 편집(✂ 밀대 10m)으로 옮김(2026-11-24)", hk.contains("function trimSheet(") || hk.contains("function nudgeRow("));
        assertFalse("50m 칸은 없음", st.contains("total > 5000 ? 50 : 10") || hk.contains("full.total > 5000 ? 50 : 10"));
    }

    /** 2026-11-15 PC: 폰 375px 에서 15일 물때표를 펴면 문서 폭 686px - 띠 안 숨은 글(.sr, absolute)이 띠 밖으로 빠졌음. 띠는 relative, 숨은 글은 왼쪽 위에. */
    @Test
    public void 숨은_글이_띠_밖으로_빠지지_않음() throws Exception {
        String css = read("src/main/webapp/css/tidefly.css");
        assertTrue(css.contains(".tstrip { position: relative; display: flex;"));
        assertTrue(css.contains(".sr { position: absolute; left: 0; top: 0;"));
    }

    /** 2026-11-16 홍TV님 "안내도에서 여러개를 이어서 … 코스를 만들려고" - 안내도(탐방 · 노선, 두 벌)는 관리자 기기에 GPX 편집 단추, GPX 편집은 #c= 를 따라가기처럼 받아 한 길로. */
    @Test
    public void 안내도_길을_GPX_편집으로() throws Exception {
        for (String f : new String[] {"park.js", "route.js"}) {
            String js = read("src/main/webapp/js/" + f);
            assertTrue(f, js.contains("studioLink(row, link(") && js.contains("a.href = \"studio.html\" + followHref.slice(followHref.indexOf(\"#\"));")
                    && js.contains("RF.ownerDevice().then(function (own) {"));   // 운영자 물음은 course-kit 한 벌(점검 14차 F2)
            // 부르는 곳과 함수가 같은 본 묶음(첫 (function () { … })();) 안에 - 2026-11-16 PC: 뒤의 "가+" 묶음에 넣어 탐방로를 누르면 ReferenceError
            String main = js.substring(js.indexOf("(function () {"), js.indexOf("\n})();"));
            assertTrue(f + " studioLink 는 본 묶음 안", main.contains("function studioLink(") && main.contains("studioLink(row, link("));
            assertTrue(f + " 링크 색(어두운 바탕)", js.contains("p.className = \"tip studio\";")
                    && read("src/main/webapp/" + f.replace(".js", ".html")).contains("#sheet .studio a { color:#38d9ea;"));
        }
        String st = read("src/main/webapp/js/studio.js");
        assertTrue(st.contains("var parts = RF.parseJoinId(id)") && st.contains("RF.courseFetch(id, json).then(function (c) {") && st.contains("RF.courseTrack(c,") && st.contains("    restoreWork().then(openFromGuide)"));
        assertTrue("kit-studio 에 courseTrack", read("src/main/webapp/js/kit-studio.js").contains("function courseTrack("));
        // 🗺 안내도에서 고르기(관리자만) - 이름 찾기는 따라가기와 같은 RF.routeGuides · guideMaps(국립공원이 아닌 산은 from 이 있어야 안내도가 열림)
        assertTrue(read("src/main/webapp/studio.html").contains("<button class=\"b\" id=\"guideBtn\" type=\"button\" hidden>🗺 안내도에서 고르기</button>"));
        assertTrue(st.contains("$(\"guideBtn\").hidden = !owner;") && st.contains("RF.guideMaps(rows, 3, n)") && st.contains("\"&from=\" + encodeURIComponent(g.from)"));
        assertTrue(read("src/main/webapp/js/kit-studio.js").contains("function guideMaps("));
    }
}
