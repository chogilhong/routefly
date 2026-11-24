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
        assertTrue("내 기록 📷 사진 넣기는 뺌(2026-11-22 홍TV님 - 사진은 따라가기 중 📝 📷 찍기로만)", !html.contains("recViewPhotos") && !html.contains("photoPick") && !js.contains("photoPlace") && !js.contains("readExif"));
        assertTrue("지도에 사진 작은 그림 · 크게", js.contains("el.className = \"noteMark thumb\";") && js.contains("photoBig(u, n.text);") && html.contains("<div id=\"photoBig\""));
        assertTrue("산행 중은 📷 찍기만(갤러리 고르기 뺌) · 여러 장 쌓았다가 남기기로 모두 지금 자리에(2026-11-22 홍TV님)",
                !html.contains("notePick") && html.contains("<input type=\"file\" id=\"notePhoto\" accept=\"image/*\" capture=\"environment\" hidden>")
                && js.contains("noteFiles.push(f);") && js.contains("return { t: t0 + i, lat: base.lat, lon: base.lon, ele: base.ele, text: i === 0 ? text || null : null, photo: null, file: file };")
                && js.contains("toGallery(note.file, blob, note.t);") && !js.contains("PHOTO_OLD_MS"));
        assertTrue("주머니 모드 단추는 📴(테마 🌙 와 다르게 - 2026-11-22 홍TV님)", html.contains("aria-label=\"주머니 모드\"") && html.contains("은 그대로\">📴</button>"));
        assertTrue("사진 · 메모 창에 이번 산행에 앞서 남긴 것(홍TV님)", html.contains("<div id=\"noteHaveBox\" hidden>") && js.contains("        noteHaveShow();\n")
                && js.contains("var list = (hike.notes || []).slice().reverse()") && js.contains("b.onclick = function () { photoBig(u, b.title); };"));
        assertTrue("표시를 지우면 그림 주소도 놓음", js.contains("function dropMarks(list) {") && js.contains("dropMarks(recMarks); recMarks = [];"));
    }

    @Test
    public void 영상용_그림과_영상() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), app = read("src/main/webapp/js/app.js"), html = read("src/main/webapp/hike.html");
        String plug = read("app/android/app/src/main/java/kr/routefly/app/RfGalleryPlugin.java");
        String trip = read("src/main/webapp/trip.html"), tjs = read("src/main/webapp/js/trip.js");
        assertTrue("내 기록 📈 창은 없애고 기록 보기 화면에 [🛩 3D 영상] [💾 GPX 저장] [📐 GPX 편집(2026-11-24, 📮 등록 요청 대신)] [✕ 삭제](2026-11-23 홍TV님), 🎬 영상용(그림 · 고도 영상 · 공개 링크 만들기)은 뺌(2026-11-22 홍TV님 \"나머지는 모두 삭제\")",
            !html.contains("recView") && !js.contains("recView") && !js.contains("function showRecord(")
            && trip.contains("<button type=\"button\" id=\"rec-fly\" data-en=\"🛩 3D video\">🛩 3D 영상</button><button type=\"button\" id=\"rec-save\" data-en=\"💾 Save GPX\">💾 GPX 저장</button><button type=\"button\" id=\"rec-edit\" data-en=\"📐 Edit GPX\">📐 GPX 편집</button>")
            && tjs.contains("$(\"openBtn\").hidden = true;") && trip.contains("#openBtn[hidden] { display:none; }") && trip.contains("#recBtns[hidden] { display:none; }") && tjs.contains("var u = (EN ? \"hike.html?lang=en\" : \"hike.html\") + \"#recdo=\" + k + \":\" + encodeURIComponent(recParam); if (k === \"fly\") vidBack(); if (k === \"del\") location.replace(u); else location.href = u;")
            && js.contains("var rd = /^#recdo=(fly|save|del):(.+)$/.exec(location.hash);") && js.contains("if (what === \"fly\") fly3d(r);\n            else if (what === \"save\") downloadGpx(r);\n            else delRecord(r);")
            && tjs.contains("$(\"rec-edit\").onclick = function () { location.href = \"studio.html#rec=\" + encodeURIComponent(recParam); };")
            && tjs.contains("RF.recordSummary(curRec, famRaw ? famRaw.peaks : [], famRaw ? famRaw.elev : {}, EN)")
            && !html.contains("vidSheet") && !html.contains("recViewVideo") && !js.contains("vidRouteImage") && !js.contains("recordCanvas") && !js.contains("pubSend"));
        assertFalse("공개 링크 끄기 단추도 뺌(2026-11-22 홍TV님)", html.contains("recViewPubOff") || js.contains("api/record-share"));
        String ck = read("src/main/webapp/js/course-kit.js");
        assertTrue("3D 영상은 처음 · 끝 300m 늘 빼고(내 기록 · 연 GPX 파일 둘 다 RF.flyStart, 2026-11-23), 산행 중에는 안 넘어감", ck.contains("var all = cleanTrack(rec.track, rec.kind === \"bike\"), tr = keepEnds ? all : trimEnds(all, FLY_TRIM_M);") && ck.contains("var FLY_TRIM_M = 300;")
            && !ck.contains("String(nameIn(rec.name)") && js.contains("var f = RF.flyStart(rec, EN);") && read("src/main/webapp/js/trip.js").contains("try { f = RF.flyStart(got.rec, EN, keepEnds); }") && read("src/main/webapp/js/trip.js").contains("$(\"rec-fly\").onclick = function () { flyFile(got, false, keepOpen(text, f.name) ? \"#open\" : \"\"); };")
            && js.contains("if (hike.running) { toast(T(\"산행 중에는 3D 영상을 만들지 않습니다."));
        assertTrue("만든 3D 영상은 이 폰에 저장 - 앱은 갤러리(영상 Movies/routefly), 브라우저는 내려받기, 옛 앱은 공유 창",
            ck.contains("b64().then(function (d) { return gal.saveMedia({ data: d, name: name }); })") && ck.contains("var gal = plug(\"RfGallery\");")
            && ck.contains("if (!nat) { down(); return; }") && ck.contains("videoSave(v.blob, v.name,") && js.contains("RF.videoReady(EN, function (t, ok) { return hAlert(t, { ok: ok }); }")
            && plug.contains("public void saveMedia(PluginCall call)") && plug.contains("(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + \"/routefly\""));
        assertTrue("3D 화면으로 - 위성 없이(sat 없음)", ck.contains("url: \"index.html?video=1&rec=1&secs=\" + secs") && !ck.contains("video=1&rec=1&sat=1") && !js.contains("video=1&rec=1&sat=1"));
        assertTrue("영상에서만 지형을 코스 높낮이에 맞춰 더 돋움 · 음영 진하게(2026-11-23 홍TV님 \"고저가 잘 표현이 안 되어\")",
            app.contains("if (map.getTerrain && map.getTerrain()) map.setTerrain({ source: \"terrain\", exaggeration: RF.videoRelief(c.ele) });")
            && app.contains("if (map.getLayer(\"hillshade\")) map.setPaintProperty(\"hillshade\", \"hillshade-exaggeration\", 0.75);")
            && read("src/main/webapp/js/kit-app.js").contains("function videoRelief(ele)"));
        assertTrue("3D 영상은 출처 줄을 늘 영상에", app.contains("if (VIDEO.rec) videoRecord(c, credit.textContent);") && app.contains("lines.forEach(function (l, i) { g.fillText(l, 20,"));
        assertTrue("지도 그림을 옮겨 그리려면 영상 만들 때만 preserveDrawingBuffer",
                app.contains("canvasContextAttributes: VIDEO && VIDEO.rec ? { preserveDrawingBuffer: true } : undefined"));
        assertTrue("만든 영상을 따라가기로 넘겨 저장", app.contains("location.href = RF.vidBackUrl() || \"hike.html#vid\";") && js.contains("if (location.hash === \"#vid\") {"));
        assertTrue("GPX 를 열 때 묻는 글도 지금 단추(🗺 기록 보기, 2026-11-24)에 맞춤", js.contains("📒 내 기록에 넣을까요? 넣은 뒤 내 기록 → 🗺 기록 보기로 지도 · 사진 · 고도 그래프를 봅니다.") && !js.contains("내 기록에 넣어 지도 · 사진 · 고도 그래프로 볼까요?"));
        assertTrue("닫기 단추가 보이게(2026-11-22 홍TV님) - 기기 옮기기 QR 창은 흰 바탕에 어두운 단추(GPX 보내기 창은 2026-11-23 없앰)",
            html.contains("id=\"xferClose\" style=\"min-height:48px;width:100%;padding:0 18px;border-radius:10px;border:0;background:#1b2430;color:#fff;"));
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
                && js.contains("var again = RF.afterHikeLinks(p, end, EN).links;") && js.contains("food.href = again[fi].href;") && js.contains("var fi = r.links.map(function (x) { return /^🍜/.test(x.text); }).indexOf(true), food = fi >= 0 ? nx.children[fi] : null,"));
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
        assertTrue("줄마다 [🗺 기록 보기] [✕](2026-11-24 이름 - 도장 옆 📂 GPX 열기와 헷갈림) - 📈 · 📤 GPX 보내기는 기록 보기 화면으로(2026-11-23 홍TV님)", rows.contains("v.textContent = T(\"🗺 기록 보기\", \"🗺 View record\");") && !rows.contains("T(\"📂 GPX 열기\", \"📂 Open GPX\")") && rows.contains("v.onclick = function () { openTrip(r); };")
            && rows.contains("x.textContent = \"✕\";") && !rows.contains("v.textContent = \"📈\"") && !rows.contains("T(\"📤 GPX 보내기\""));
        assertFalse("🎁 routefly 기록으로 없음", js.contains("🎁 routefly 기록으로") || js.contains("function shareRecord("));
        assertTrue("GPX 보낼 때 글에 PC 여는 법 · 코스 모음 주소(2026-11-22 홍TV님) - 앱 공유 · 폰 브라우저 공유 둘 다", js.contains("PC 에서는 routefly 코스 모음 📂 GPX 열기로 보세요")
                && js.contains("nativeShareFile(name, btoa(unescape(encodeURIComponent(text))), gpxShareText(rec))") && js.contains("navigator.share({ files: [file], title: NM(rec.name), text: gpxShareText(rec) })"));
        // 2026-11-23 홍TV님: 📤 GPX 보내기 창은 없애고 기록 보기 화면에 [💾 GPX 저장] [📮 등록 요청] 단추로
        assertFalse("보내기 창 없음", js.contains("function sendSheet("));
        assertTrue("알림 글은 모든 창 위로(2026-11-23 PC: 💾 GPX 저장 알림이 내 기록 창 뒤에 깔림)", read("src/main/webapp/hike.html").contains("#toast { position:fixed; left:50%; bottom:120px; transform:translateX(-50%); z-index:9600; pointer-events:none;"));
        assertTrue("📮 등록 요청 - 이름이 올라간다는 안내는 보내는 창(RF.submitSheet, GPX 편집에서)에", read("src/main/webapp/js/course-kit.js").contains("보내는 사람 이름(올리면 코스 화면에 \\\"만든 이\\\" 로 보임 · 비우면 익명)")
            && !js.contains("function submitSheet("));
        assertTrue("💾 사진 · 메모까지 든 GPX", js.contains("saveGpxText(rec, RF.recordGpx(rec, ph));"));
        assertTrue("기록에 어디서 기록했나(앱 · 브라우저) · 배터리 절약을 남김(2026-11-23 PC - 끊김 원인 가리기)", js.contains("rec.via = NATIVE ? \"app\" : \"web\";") && js.contains("rec.saver = !!batterySave;"));
        assertTrue("받은 GPX 기록은 내 기록으로", js.contains("try { got = RF.gpxRecord(text, false, name); } catch (e) { got = null; }") && js.contains("if (ok) importGpxRecord(got); else openGpxCourse(text, name);"));
    }

    /** 기록 보기 trip.html(2026-11-22 홍TV님 "램블러 화면 같은 것") - GPX · 내 기록을 지도 · 사진 카드 · 그래프로, 표시 ↔ 카드 서로 따라감, 🔍 사진만 크게. */
    @Test
    public void 기록_보기_화면() throws Exception {
        String js = read("src/main/webapp/js/trip.js"), html = read("src/main/webapp/trip.html"), hike = read("src/main/webapp/js/hike.js");
        assertTrue("GPX 는 이 기기 안에서 읽음 · 시각 없는 코스 GPX 도(홍TV님 \"왜 안 열리지?\")", js.contains("var got = RF.gpxRecord(text, true, f.name);") && !js.contains("fetch(\"api/record") && html.contains("<meta name=\"robots\" content=\"noindex, nofollow\">"));
        assertTrue("표시를 누르면 카드 · 카드를 누르면 지도", js.contains("select(i, false, true); });") && js.contains("card.onclick = function () { select(i, true, false); };"));
        assertTrue("🔍 사진만 크게 · ‹ › 넘김", js.contains("z.onclick = function (e) { e.stopPropagation(); big(i); };") && html.contains("id=\"bigPrev\"") && html.contains("id=\"bigNext\""));
        assertTrue("고도 · 속도 그래프", js.contains("prof = RF.profile($(\"prof\"), rc, { speed: RF.speedProfile(rc), labels: false });"));
        assertTrue("지도 출처(OSM) 그대로 - V-World 바탕은 여기서, 우리 지도는 바탕 출처에 있어 한 번만(2026-11-22)", js.contains("customAttribution: (style ? \"\" : \"© OpenStreetMap contributors | \") + ")
            && read("src/main/webapp/vendor/rfmap-1.1.8/rfmap.js").contains("attribution: \"© OpenMapTiles © OpenStreetMap contributors\""));
        assertFalse("🖥 크게 보기 단추는 뺀 그대로(2026-11-22 원복) - 내 기록은 🗺 지도 단추 하나로 trip.html 에 엶(2026-11-22 홍TV님 \"trip.html 화면에서 열어\")", hike.contains("🖥"));
        assertTrue(hike.contains("location.href = \"trip.html?rec=\"") && js.contains("new URLSearchParams(location.search).get(\"rec\")"));
        assertTrue(read("src/main/webapp/js/kit-trip.js").contains("function gpxRecord("));
    }

    @Test
    public void 공개_기록_남길_것만() {
        // 점검 14차(2026-11-24): 만들기 입구(POST)는 지움 - 부르는 화면이 없는데 누구나 글 · 선을 올릴 수 있었음. 남은 것은 1년 판정
        JsonObject o = JsonParser.parseString("{\"created\":1000}").getAsJsonObject();
        assertFalse("1년 안", RecordShareServlet.expired(o, 1000 + RecordShareServlet.KEEP_MS));
        assertTrue("1년 지남", RecordShareServlet.expired(o, 1000 + RecordShareServlet.KEEP_MS + 1));
        assertFalse("만든 때가 없으면 지우지 않음", RecordShareServlet.expired(new JsonObject(), Long.MAX_VALUE));
        assertFalse("깨진 값", RecordShareServlet.expired(JsonParser.parseString("{\"created\":\"x\"}").getAsJsonObject(), Long.MAX_VALUE));
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
            long now = System.currentTimeMillis();
            Files.writeString(dir.resolve("BBBBBBBBBB.json"), "{\"created\":" + now + ",\"keyHash\":\"abc\",\"name\":\"덕기봉\"}", StandardCharsets.UTF_8);
            Map<String, Object> got = call(s, "GET", "", "BBBBBBBBBB", null, "203.0.113.92");
            assertEquals(200, got.get("status"));
            assertFalse("열쇠 지문은 내보내지 않음", ((String) got.get("body")).contains("keyHash"));
            assertEquals("만들기 입구는 없음(점검 14차)", 405, call(s, "POST", "", null, "{\"name\":\"x\"}", "203.0.113.91").get("status"));
            // 1년 지난 것은 보기 때 그 자리에서 지우고 404(예전에는 만들 때만 지웠음 - 점검 14차 A2)
            Files.writeString(dir.resolve("CCCCCCCCCC.json"), "{\"created\":1}", StandardCharsets.UTF_8);
            assertEquals(404, call(s, "GET", "", "CCCCCCCCCC", null, "203.0.113.92").get("status"));
            assertFalse(Files.exists(dir.resolve("CCCCCCCCCC.json")));
            Files.writeString(dir.resolve("AAAAAAAAAA.json"), "{\"created\":1}", StandardCharsets.UTF_8);
            assertEquals(1, RecordShareServlet.sweep(dir.toFile(), 1 + RecordShareServlet.KEEP_MS + 1));
        } finally {
            if (before == null) props.remove("record.shareDir"); else props.put("record.shareDir", before);
            try (var st = Files.list(dir)) { st.forEach(x -> x.toFile().delete()); }
            Files.deleteIfExists(dir);
        }
    }

    /** 시험 걷기 중 출처 한 줄(2026-11-22 홍TV님 - 녹화한 영상에도 출처가 남게): 걷는 동안 늘 보이고 끝내면 숨김. */
    @Test
    public void simWalkShowsAttribution() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        int step = js.indexOf("function simStep() {");
        assertTrue("시험 걷기 한 걸음마다 출처 줄을 보임", step > 0 && js.indexOf("simAttr(true);", step) - step < 60 && js.indexOf("simAttr(true);", step) > step);
        assertTrue("끝내면 숨김", js.contains("if (wasSim) simAttr(false);"));
        assertTrue("글은 출처 단추 글 그대로(켜진 바탕만)", js.contains("box.querySelector(\".maplibregl-ctrl-attrib-inner\")"));
        assertTrue("아래 왼쪽 축척 위에 - 오른쪽은 ⌖ 단추에 가렸음(2026-11-22 PC)", js.contains("box.querySelector(\".maplibregl-ctrl-bottom-left\")") && js.contains("corner.insertBefore(el, corner.firstChild);"));
        assertTrue("라벨을 뗀 짧은 줄(셈은 course-kit.test.js attrShort)", js.contains("var t = inner ? RF.attrShort(inner.textContent) : \"\";"));
        assertTrue("맛집은 폰에서 카카오맵 앱(끝 지점 둘레)을 먼저, 1.5초 안에 안 가려지면 웹 검색(2026-11-22 홍TV님 A안)",
            js.contains("if (x.app && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) a.addEventListener(\"click\", function (e) { e.preventDefault(); appOrWeb(x.app, a.href); });")
            && js.contains("if (!left && !document.hidden) window.open(web, \"_blank\", \"noopener\");") && js.contains("        location.href = app;\n    }"));
        assertTrue("시험 걷기 끝에는 카드 · GPX 단추 없음(2026-11-22 홍TV님)", js.contains("$(\"doneCard\").style.display = $(\"doneGpx\").style.display = sim ? \"none\" : \"\";"));
        assertTrue("눌러도 지도를 막지 않는 모양", html.contains(".sim-attr { font-size:9px;") && html.contains("max-width:calc(100vw - 90px)") && html.contains("pointer-events:none; }") && html.contains(".sim-attr[hidden] { display:none; }"));
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
                    case "getProtocol" -> "HTTP/1.1";
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
        if ("GET".equals(method)) s.doGet(req, resp); else ((jakarta.servlet.Servlet) s).service(req, resp);   // POST 입구는 점검 14차에 지움 - 톰캣처럼 service 로(없으면 405)
        out.put("body", sw.toString());
        return out;
    }
}
