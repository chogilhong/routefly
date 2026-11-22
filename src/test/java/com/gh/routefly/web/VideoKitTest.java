package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.PrintWriter;
import java.io.StringReader;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 유튜버용 · 사진 넣기(2026-11-22 홍TV님 "모두 작업해"): 사진을 찍힌 자리에(셈은 course-kit.test.js exifInfo · photoPlace · trimEnds) · 여러 장 넣기 ·
 * 사진 작은 그림 표시 · 🎬 영상용 그림 · 고도 영상 · 3D 비행 영상 · 공개 기록 링크(RecordShareServlet).
 */
public class VideoKitTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 사진_넣기_화면() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        assertTrue("여러 장 고르기", html.contains("<input type=\"file\" id=\"recPhotoFiles\" accept=\"image/*\" multiple hidden>") && html.contains("id=\"photoPick\""));
        assertTrue("EXIF 는 줄이기 전 원본에서", js.contains("var pl = RF.photoPlace(rec.track, info)") && js.contains("return RF.exifInfo(b, -new Date().getTimezoneOffset());"));
        assertTrue("자리를 못 찾은 사진은 못 고름", js.contains("ck.checked = !!pl && !dup;") && js.contains("ck.disabled = !pl;"));
        assertTrue("넣은 뒤 찍은 때 차례 · 저장", js.contains("rec.notes = (rec.notes || []).concat(added).sort(function (a, b) { return a.t - b.t; });") && js.contains("return writeRecords(records());"));
        assertTrue("산행 중 갤러리 사진도 찍힌 자리에", js.contains("var pl = old ? RF.photoPlace(hike.track, info) : null;"));
        assertTrue("지도에 사진 작은 그림 · 크게", js.contains("el.className = \"noteMark thumb\";") && js.contains("photoBig(u, n.text);") && html.contains("<div id=\"photoBig\""));
        assertTrue("찍기 · 갤러리 고르기 둘(capture 가 있으면 카메라로만 감 - 홍TV님 폰)", html.contains("<input type=\"file\" id=\"notePick\" accept=\"image/*\" hidden>")
                && html.contains("id=\"notePickBtn\"") && js.contains("if (!noteFromGallery) toGallery(noteFile, blob, note.t);"));
        assertTrue("주머니 모드 단추는 📴(테마 🌙 와 다르게 - 2026-11-22 홍TV님)", html.contains("aria-label=\"주머니 모드\"") && html.contains("은 그대로\">📴</button>"));
        assertTrue("사진 · 메모 창에 이번 산행에 앞서 남긴 것(홍TV님)", html.contains("<div id=\"noteHaveBox\" hidden>") && js.contains("        noteHaveShow();\n")
                && js.contains("var list = (hike.notes || []).slice().reverse()") && js.contains("b.onclick = function () { photoBig(u, b.title); };"));
        assertTrue("표시를 지우면 그림 주소도 놓음", js.contains("function dropMarks(list) {") && js.contains("dropMarks(recMarks); recMarks = [];"));
    }

    @Test
    public void 영상용_그림과_영상() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), app = read("src/main/webapp/js/app.js"), html = read("src/main/webapp/hike.html");
        for (String id : new String[] {"vidRoute", "vidProfile", "vidSum", "vidProfileMov", "vid3d", "vidPub", "vidTrim", "vidShape"}) assertTrue(id, html.contains("id=\"" + id + "\""));
        assertTrue("처음 · 끝 300m 빼기가 기본", html.contains("<input type=\"checkbox\" id=\"vidTrim\" checked>") && js.contains("var VID_TRIM_M = 300"));
        assertTrue("고도 영상은 초록 바탕", js.contains("var cv = vidProfile(rc, z[0], z[1], 0, VID_GREEN);"));
        assertTrue("3D 화면으로 - 위성 없이(sat 없음)", js.contains("location.href = \"index.html?video=1&rec=1&secs=\" + secs") && !js.contains("video=1&rec=1&sat=1"));
        assertTrue("3D 영상은 출처 줄을 늘 영상에", app.contains("if (VIDEO.rec) videoRecord(c, credit.textContent);") && app.contains("lines.forEach(function (l, i) { g.fillText(l, 20,"));
        assertTrue("지도 그림을 옮겨 그리려면 영상 만들 때만 preserveDrawingBuffer",
                app.contains("canvasContextAttributes: VIDEO && VIDEO.rec ? { preserveDrawingBuffer: true } : undefined"));
        assertTrue("만든 영상을 따라가기로 넘겨 보내기", app.contains("location.href = \"hike.html#vid\";") && js.contains("if (location.hash === \"#vid\") {"));
        assertTrue("기록 창(31) 위로 - 뒤에 열려 안 보였음(홍TV님)", html.contains("#recView { z-index:31; }") && html.contains("#vidSheet, #photoPick { z-index:32; }"));
        assertTrue("그림 · 영상 같은 보내기", js.contains("function shareBlob(blob, name, text, url) {"));
    }

    @Test
    public void 방침에_새_저장소와_공개_기록() throws Exception {
        for (String page : new String[] {"privacy.html", "privacy-en.html"}) {
            String p = read("src/main/webapp/" + page);
            for (String k : new String[] {"rf-pub", "rf-video", "rf-fly-rec", "id=\"record-share\""}) assertTrue(page + " " + k, p.contains(k));
        }
        assertTrue(read("src/main/resources/config.properties.example").contains("record.shareDir="));
        assertTrue("검색에 내지 않음", read("src/main/webapp/record.html").contains("<meta name=\"robots\" content=\"noindex, nofollow\">"));
    }

    /** 산행 끝 🍜 맛집 - 봉우리 이름만으로는 다른 지방(덕기봉 → 전북 익산)이 나와 그 동네(행정동)로(2026-11-22 홍TV님). 셈은 course-kit.test.js afterHikeLinks. */
    @Test
    public void 맛집은_그_동네로() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), wx = read("src/main/java/com/gh/routefly/web/WxServlet.java");
        assertTrue("코스 끝 점 · 없으면 5km 칸 가운데만", js.contains("RF.cellCenter(end.lat, end.lon) : null;")
                && js.contains("food.href = RF.afterHikeLinks(p, end, EN).links[0].href;"));
        assertTrue("서버는 행정동만", wx.contains("if (\"1\".equals(req.getParameter(\"regionOnly\"))) {"));
        assertTrue(read("src/main/webapp/privacy.html").contains("\"🍜 맛집\" 은 코스 끝 점") && read("src/main/webapp/privacy-en.html").contains("The \"🍜 Food\" link after a hike"));
    }

    /** 내 기록 줄 정리(2026-11-22 홍TV님): GPX 편집 열기 · ⬆ 코스로 · 🎁 routefly 기록으로 뺌, 📤 GPX 보내기 = 📮 코스 등록 · 💾 GPX 파일 저장(사진 · 메모까지), 지우기는 ✕. */
    @Test
    public void 내_기록_GPX_보내기() throws Exception {
        String js = read("src/main/webapp/js/hike.js");
        int a = js.indexOf("    function drawRecords() {"), b = js.indexOf("    function drawRecStats(", a);
        String rows = js.substring(a, b);
        assertFalse("GPX 편집 고리 · 코스로 단추 없음", rows.contains("studio.html") || rows.contains("⬆ 코스로") || js.contains("function uploadCourse(") || js.contains("var upOwner"));
        assertTrue(rows.contains("g.textContent = T(\"📤 GPX 보내기\", \"📤 Send GPX\");") && rows.contains("x.textContent = \"✕\";"));
        assertFalse("🎁 routefly 기록으로 없음", js.contains("🎁 routefly 기록으로") || js.contains("function shareRecord("));
        assertTrue("📮 코스 등록 - 이름이 올라간다는 안내", js.contains("📮 routefly 에 보내 코스 등록하기") && js.contains("\\\"만든 이: (적은 이름)\\\" 으로 내 이름이 함께 보입니다"));
        assertTrue("💾 사진 · 메모까지 든 GPX", js.contains("💾 GPX 파일 저장") && js.contains("saveGpxText(rec, RF.recordGpx(rec, ph));"));
        assertTrue("받은 GPX 기록은 내 기록으로", js.contains("try { got = RF.gpxRecord(text); } catch (e) { got = null; }") && js.contains("if (ok) importGpxRecord(got); else openGpxCourse(text, name);"));
    }

    /** 기록 보기 trip.html(2026-11-22 홍TV님 "램블러 화면 같은 것") - GPX · 내 기록을 지도 · 사진 카드 · 그래프로, 표시 ↔ 카드 서로 따라감, 🔍 사진만 크게. */
    @Test
    public void 기록_보기_화면() throws Exception {
        String js = read("src/main/webapp/js/trip.js"), html = read("src/main/webapp/trip.html"), hike = read("src/main/webapp/js/hike.js");
        assertTrue("GPX 는 이 기기 안에서 읽음 · 시각 없는 코스 GPX 도(홍TV님 \"왜 안 열리지?\")", js.contains("var got = RF.gpxRecord(text, true);") && !js.contains("fetch(\"api/record") && html.contains("<meta name=\"robots\" content=\"noindex, nofollow\">"));
        assertTrue("표시를 누르면 카드 · 카드를 누르면 지도", js.contains("select(i, false, true); });") && js.contains("card.onclick = function () { select(i, true, false); };"));
        assertTrue("🔍 사진만 크게 · ‹ › 넘김", js.contains("z.onclick = function (e) { e.stopPropagation(); big(i); };") && html.contains("id=\"bigPrev\"") && html.contains("id=\"bigNext\""));
        assertTrue("고도 · 속도 그래프", js.contains("prof = RF.profile($(\"prof\"), rc, { speed: RF.speedProfile(rc), labels: false });"));
        assertTrue("지도 출처(OSM) 그대로", js.contains("customAttribution: \"© OpenStreetMap contributors"));
        assertFalse("🖥 크게 보기는 뺌(2026-11-22 홍TV님 원복) - 입구는 코스 모음 📂 GPX 열기", hike.contains("trip.html?rec=") || js.contains("?rec="));
        assertTrue(read("src/main/webapp/js/kit-trip.js").contains("function gpxRecord("));
    }

    @Test
    public void 공개_기록_남길_것만() {
        JsonObject in = JsonParser.parseString("{\"name\":\"덕기봉 <b>\\n산행\",\"kind\":\"hike\",\"date\":\"2026-11-22\",\"dist_m\":5123.4,\"time_ms\":7200000,\"up_m\":612,"
                + "\"extra\":\"버림\",\"track\":[[37.1234567,127.1,120.6],[37.124,127.101,null,1700000000000]]}").getAsJsonObject();
        JsonObject o = RecordShareServlet.clean(in);
        assertEquals("덕기봉 b 산행", o.get("name").getAsString());
        assertFalse("모르는 칸은 버림", o.has("extra"));
        assertEquals("[[37.123457,127.1,121],[37.124,127.101,null]]", o.get("track").toString());   // 시각(넷째 값)은 버림
        assertEquals(5123, o.get("dist_m").getAsLong());
        assertNull("점 하나", RecordShareServlet.clean(JsonParser.parseString("{\"name\":\"a\",\"kind\":\"hike\",\"date\":\"2026-11-22\",\"dist_m\":1,\"time_ms\":1,\"track\":[[37,127]]}").getAsJsonObject()));
        assertNull("종류", RecordShareServlet.clean(JsonParser.parseString("{\"name\":\"a\",\"kind\":\"car\",\"date\":\"2026-11-22\",\"dist_m\":1,\"time_ms\":1,\"track\":[[37,127],[37,127.1]]}").getAsJsonObject()));
        assertNull("위도", RecordShareServlet.clean(JsonParser.parseString("{\"name\":\"a\",\"kind\":\"hike\",\"date\":\"2026-11-22\",\"dist_m\":1,\"time_ms\":1,\"track\":[[97,127],[37,127.1]]}").getAsJsonObject()));
    }

    @Test
    public void 공개_기록_만들기_보기_끄기() throws Exception {
        Path dir = Files.createTempDirectory("recshare");
        RouteflyConfig.get("record.shareDir");   // 설정을 한 번 읽힌 뒤 그 표에 시험 폴더만 넣었다 뺌(ReviewRound5Test 와 같은 방법)
        java.lang.reflect.Field f = RouteflyConfig.class.getDeclaredField("props");
        f.setAccessible(true);
        java.util.Properties props = (java.util.Properties) f.get(null);
        Object before = props.setProperty("record.shareDir", dir.toString());
        try {
            RecordShareServlet s = new RecordShareServlet();
            Map<String, Object> made = call(s, "POST", "", null, "{\"name\":\"덕기봉\",\"kind\":\"hike\",\"date\":\"2026-11-22\",\"dist_m\":5000,\"time_ms\":7200000,\"track\":[[37.1,127.1,100],[37.11,127.11,300]]}", "203.0.113.91");
            assertEquals(200, made.get("status"));
            JsonObject m = JsonParser.parseString((String) made.get("body")).getAsJsonObject();
            String id = m.get("id").getAsString(), key = m.get("key").getAsString();
            assertTrue(id.matches("[0-9A-Za-z]{10}") && key.matches("[0-9a-f]{32}"));
            String file = Files.readString(dir.resolve(id + ".json"), StandardCharsets.UTF_8);
            assertFalse("열쇠 자체는 서버에 없음", file.contains(key));
            Map<String, Object> got = call(s, "GET", "", id, null, "203.0.113.92");
            assertEquals(200, got.get("status"));
            assertFalse("열쇠 지문은 내보내지 않음", ((String) got.get("body")).contains("keyHash"));
            assertEquals(403, call(s, "POST", "/delete", null, "{\"id\":\"" + id + "\",\"key\":\"" + "0".repeat(32) + "\"}", "203.0.113.93").get("status"));
            assertEquals(200, call(s, "POST", "/delete", null, "{\"id\":\"" + id + "\",\"key\":\"" + key + "\"}", "203.0.113.91").get("status"));
            assertEquals("끄면 바로 지움", 404, call(s, "GET", "", id, null, "203.0.113.92").get("status"));
            // 1년 지난 것은 지움
            Files.writeString(dir.resolve("AAAAAAAAAA.json"), "{\"created\":1}", StandardCharsets.UTF_8);
            assertEquals(1, RecordShareServlet.sweep(dir.toFile(), 1 + RecordShareServlet.KEEP_MS + 1));
        } finally {
            if (before == null) props.remove("record.shareDir"); else props.put("record.shareDir", before);
            try (var st = Files.list(dir)) { st.forEach(x -> x.toFile().delete()); }
            Files.deleteIfExists(dir);
        }
    }

    private static Map<String, Object> call(RecordShareServlet s, String method, String path, String id, String body, String ip) throws Exception {
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(VideoKitTest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (pr, m, a) -> switch (m.getName()) {
                    case "getContentType" -> "application/json";
                    case "getPathInfo" -> path;
                    case "getParameter" -> "id".equals(a[0]) ? id : null;
                    case "getRemoteAddr" -> ip;
                    case "getReader" -> new BufferedReader(new StringReader(body == null ? "" : body));
                    case "getMethod" -> method;
                    default -> null;
                });
        Map<String, Object> out = new HashMap<>();
        StringWriter sw = new StringWriter();
        out.put("status", 200);
        HttpServletResponse resp = (HttpServletResponse) Proxy.newProxyInstance(VideoKitTest.class.getClassLoader(), new Class<?>[] {HttpServletResponse.class},
                (pr, m, a) -> {
                    if ("setStatus".equals(m.getName()) || "sendError".equals(m.getName())) out.put("status", a[0]);
                    if ("getWriter".equals(m.getName())) return new PrintWriter(sw, true);
                    return null;
                });
        if ("GET".equals(method)) s.doGet(req, resp); else s.doPost(req, resp);
        out.put("body", sw.toString());
        return out;
    }
}
