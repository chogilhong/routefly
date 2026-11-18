package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

/**
 * 2026-11-18 홍TV님 "1~8 전부" - 드론(비행 날씨 · 날 수 있는 시간 · 점검표 · 기록장)과 출조(★ 포인트 · 이번 주 좋은 날 · 조과 일지).
 * 순수 함수는 dronefly.test.js · tidefly.test.js 가 봄. 여기는 화면 자리 · 서버로 나가는 값 · 개인정보처리방침이 코드와 맞는지.
 */
public class FlyExtrasTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 코드가 쓰는 저장 열쇠(prefix 로 시작하는 '…' 글)가 개인정보처리방침 한 · 영 둘 다에 있어야 함. */
    private static void keysInPolicy(String js, String prefix) throws Exception {
        Matcher m = Pattern.compile("'(" + prefix + "[a-z-]+)'").matcher(js);
        TreeSet<String> keys = new TreeSet<>();
        while (m.find()) keys.add(m.group(1));
        assertFalse(prefix + " 열쇠가 하나도 없음", keys.isEmpty());
        for (String page : new String[] {"privacy.html", "privacy-en.html"}) {
            String pol = read("src/main/webapp/" + page);
            for (String k : keys) assertTrue(page + " 에 " + k, pol.contains(k));
        }
    }

    @Test
    public void 드론_날씨_시간_점검표_기록장() throws Exception {
        String h = read("src/main/webapp/dronefly.html"), js = read("src/main/webapp/js/dronefly.js");
        for (String id : new String[] {"id=\"wx\"", "id=\"sun\"", "id=\"wxHead\"", "id=\"windMax\"", "id=\"check\"", "id=\"checkList\"", "id=\"log\"", "id=\"logForm\"", "id=\"logCsv\""}) assertTrue(id, h.contains(id));
        // 날씨는 내 위치 그대로가 아니라 약 5km 고정 칸 가운데로만 묻음(개인정보처리방침 dronefly 줄과 같음)
        assertTrue(js.contains("var c = wxCell(lat, lon), key = c.join(',');") && js.contains("fetch('api/weather?lat=' + c[0] + '&lon=' + c[1])"));
        assertFalse("날씨에 내 위치 그대로를 보내지 않음", js.contains("api/weather?lat=' + lat") || js.contains("api/weather?lat=' + here.lat"));
        assertTrue(read("src/main/webapp/privacy.html").contains("비행 날씨도 내 위치가 아니라 그 자리가 든 약 5km 고정 칸"));
        assertTrue(read("src/main/webapp/privacy-en.html").contains("Flying weather is also looked up by the operator's server"));
        keysInPolicy(js, "df-");
        // 해 뜨고 지는 시각은 산 페이지와 같은 RF.sunrise · RF.sunset - 만든 파일(kit-dronefly.js)에 있어야 함
        String kit = read("src/main/webapp/js/kit-dronefly.js");
        assertTrue(kit.contains("function sunrise(") && kit.contains("function sunset("));
        assertTrue("야간 근거 조문", js.contains("시행규칙 제310조 ① 6호"));
        assertTrue("야간 특별비행 기한(2026-11-18)", h.contains("id=\"nightDue\"") && js.contains("var nd = win && win.night ? specialDue(today, date) : null;"));
        assertTrue("hidden 이 .btn 의 display 에 덮이지 않게(2026-11-18 PC: PC 에서 숨긴 보내기 단추가 보였음)", read("src/main/webapp/css/tidefly.css").contains("[hidden] { display: none !important; }"));
        assertTrue("신청 정리 보내기(2026-11-18)", h.contains("id=\"share\" class=\"btn\" hidden") && h.contains("id=\"shareShoot\"") && js.contains("navigator.share({ title: c[2], text: $(c[1]).value })"));
        assertTrue("기록장 조종자(2026-11-18)", h.contains("id=\"logPilot\"") && h.contains("id=\"logPilots\"") && js.contains("pilot: $('logPilot').value.trim()"));
        assertTrue("비행 계획 → 기록장(2026-11-18)", h.contains("id=\"toLog\"") && js.contains("var v = planToLog({ name: here && here.name"));
        // 📝 4종 필기 연습(2026-11-18 홍TV님 블로그 95문항) - 문항 파일 · 출처 링크 · 원문 테스트 데이터
        assertTrue(h.contains("id=\"quiz\"") && js.contains("fetch('data/drone-quiz.json')"));
        assertFalse("칸 아래 출처 줄은 뺌(2026-11-18 홍TV님 \"출처는 빼줘\") - 문항마다 블로그 글 링크만", h.contains("홍TV 블로그 - 무인동력비행장치 4종 평가시험 95문항 ›"));
        assertTrue(js.contains("'<p class=\"small\"><a href=\"https://hongtv.tistory.com/' + q.post"));
        for (int n : new int[] {145, 146, 147, 148, 149, 85, 89, 92, 93, 95, 97, 98, 99, 100, 101}) assertTrue("원문 " + n, Files.exists(Path.of("src/test/resources/drone/quiz/" + n + ".html")));
        assertTrue("시험 고르기(2026-11-18 \"교관과정도 4종처럼\")", h.contains("<option value=\"inst\""));
        // △ 는 "비행 자제 권장"(2026-11-18 홍TV님 "가 로해") - ✕ 로 올리지 않음
        assertTrue(js.contains("var care = r.level === 'care' ? tr('비행 자제 권장(돌풍 여유 없음) - '") && h.contains("△ 최대 풍속의 70% 넘음 - 비행 자제 권장"));
    }

    @Test
    public void 출조_자주_가는_곳_이번_주_조과_일지() throws Exception {
        String h = read("src/main/webapp/tidefly.html"), js = read("src/main/webapp/js/tidefly.js");
        for (String id : new String[] {"id=\"catchLog\"", "id=\"catchList\"", "id=\"catchCsv\"", "id=\"catchSum\""}) assertTrue(id, h.contains(id));
        assertTrue("★ 단추는 펼침 단추 밖(단추 안에 단추 없음)", js.contains("hh.appendChild(head);") && js.contains("hh.appendChild(fv);"));
        assertTrue("★ 자주 가는 곳 묶음", js.contains("tr('★ 자주 가는 곳 ' + fl.length + '곳'"));
        assertTrue("이번 주는 물때로만 - 바람 · 파고 숫자로 좋은 날을 정하지 않음", js.contains("box.appendChild(weekEl(d.days, good));") && js.contains("물때로만 고른 날입니다."));
        assertTrue("조과 기록 칸에 치는 중에는 1분 다시 그리기를 건너뜀", js.contains("(fa.tagName === 'SELECT' || fa.tagName === 'INPUT')"));
        keysInPolicy(js, "tf-");   // tf-photos(조과 사진 IndexedDB, 2026-11-18) 포함
        assertTrue("조과 사진은 줄여서 이 폰에만, 기록을 지우면 사진도", js.contains("var k = Math.min(1, 1024 / Math.max(img.width, img.height))") && js.contains("if (gone && gone.photo) pdo('readwrite', function (s) { s.delete(gone.photo); })"));
        // 출조 알림을 앱은 화면을 닫아도(2026-11-18 "모두 해 줘" 6) - 앱에 이미 있는 LocalNotifications, 고를 때 · 새 물때를 받을 때 다시 맞춤, 방침과 같게
        assertTrue(js.contains("LN.schedule({ notifications: list.map(") && js.contains("appSchedule();   // 앱이면 폰 알림도 다시 맞춤") && js.contains("appSchedule();   // 새 물때 · 해 시각으로 앱 알림 다시 맞춤"));
        assertTrue(read("src/main/webapp/privacy.html").contains("앱에서는 그 시각을 핸드폰 알림으로 맞춰 두어 화면을 닫아도 울립니다"));
        assertTrue("앱에 알림 플러그인", read("app/package.json").contains("\"@capacitor/local-notifications\""));
        // 저장 안내는 쉬운 말로 - 드론 기록장과 같은 글(2026-11-18 홍TV님 "바꿔")
        for (String page : new String[] {"tidefly.html", "dronefly.html"}) {
            String ph = read("src/main/webapp/" + page);
            assertTrue(page, ph.contains("인터넷 기록을 지우거나 폰을 바꾸면 사라지니"));
            // 2026-11-18 PC: 영어 글 안 큰따옴표가 data-en 속성을 닫아 "… now and then with " 에서 끊겼음 - 속성 안은 “ ” 로
            assertTrue(page, ph.contains("so save a file now and then with “⬇ Save as CSV”.\""));
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("data-en(?:-ph|-aria)?=\"([^\"]*)\"([^\\s>/])").matcher(ph);
            assertFalse(page + " data-en 속성 뒤에 바로 글자가 붙음(속성 안 큰따옴표): " + (m.find() ? m.group() : ""), m.reset().find());
        }
    }

    /** 앱 아이콘 길게 누르기 바로가기(2026-11-18) - 웹앱 manifest · 안드로이드 shortcuts.xml · MainActivity 허용 목록 세 곳이 같은 넷. */
    @Test
    public void 바로가기_세_곳이_같음() throws Exception {
        // 차례가 뜻이 있음 - 크롬 웹앱은 "사이트 설정" 이 한 칸을 써 앞의 셋만 보임(2026-11-18 홍TV님 폰: 드론이 빠졌음) → 코스 모음을 맨 뒤로
        String[] pages = {"hike.html", "tidefly.html", "dronefly.html", "m/"};
        com.google.gson.JsonArray sc = com.google.gson.JsonParser.parseString(read("src/main/webapp/manifest.json")).getAsJsonObject().getAsJsonArray("shortcuts");
        assertEquals(pages.length, sc.size());
        String xml = read("app/android/app/src/main/res/xml/shortcuts.xml"), act = read("app/android/app/src/main/java/kr/routefly/app/MainActivity.java");
        for (int i = 0; i < pages.length; i++) {
            assertEquals(pages[i], sc.get(i).getAsJsonObject().get("url").getAsString());
            assertTrue("shortcuts.xml " + pages[i], xml.contains("android:data=\"https://routefly.kr/routefly/" + pages[i] + "\""));
            if (i > 0) assertTrue("shortcuts.xml 차례 " + pages[i], xml.indexOf("/routefly/" + pages[i - 1] + "\"") < xml.indexOf("/routefly/" + pages[i] + "\""));
            assertTrue("MainActivity " + pages[i], act.contains("\"/routefly/" + pages[i] + "\""));
        }
        assertEquals("shortcuts.xml 은 넷만", pages.length, xml.split("<shortcut ").length - 1);
        assertTrue(read("app/android/app/src/main/AndroidManifest.xml").contains("<meta-data android:name=\"android.app.shortcuts\" android:resource=\"@xml/shortcuts\" />"));
        assertTrue("바로가기는 산악회 방 열쇠 처리 앞에서 따로", act.contains("if (isShortcutLink(u)) { final String s = u.toString();"));
        for (String d : new String[] {"sc_routefly", "sc_tidefly", "sc_dronefly"}) assertTrue(d, Files.exists(Path.of("app/android/app/src/main/res/drawable-nodpi/" + d + ".png")));
    }

    /** 드론 공역을 서버가 하루 한 번 새로 받음(2026-11-18 홍TV님 "모두 해 줘" 1) - 받은 응답이 이상하면 앞의 것 그대로, 화면은 못 받으면 고정 파일. */
    @Test
    public void 공역_새로_받기() throws Exception {
        String fixed = read("src/main/webapp/data/drone-airspace.json");
        java.util.Map<String, Integer> base = AirspaceServlet.counts(fixed);
        assertEquals("{prh=15, res=84, ctr=53, moa=75, ua=48, port=243, tmp=3}", base.toString());
        assertTrue("고정 파일 자체는 믿을 만함", AirspaceServlet.sane(fixed, base));
        com.google.gson.JsonObject o = com.google.gson.JsonParser.parseString(fixed).getAsJsonObject();
        o.add("tmp", new com.google.gson.JsonArray());
        assertTrue("임시 비행금지는 0곳일 수도 있음", AirspaceServlet.sane(o.toString(), base));
        o.add("prh", new com.google.gson.JsonArray());
        assertFalse("비행금지가 비면 바꾸지 않음", AirspaceServlet.sane(o.toString(), base));
        com.google.gson.JsonObject half = com.google.gson.JsonParser.parseString(fixed).getAsJsonObject();
        com.google.gson.JsonArray res = new com.google.gson.JsonArray();
        for (int i = 0; i < 41; i++) res.add(half.getAsJsonArray("res").get(i));
        half.add("res", res);
        assertFalse("84 → 41 처럼 절반 아래로 줄면 바꾸지 않음", AirspaceServlet.sane(half.toString(), base));
        assertFalse("꼴이 틀린 글", AirspaceServlet.sane("<html>", base));
        // 받은 응답이 오류면 만들지 않음(브이월드 INCORRECT_KEY 실제 응답 - DroneProbeTest 와 같은 파일)
        java.util.Map<String, String> data = new java.util.LinkedHashMap<>(), wfs = new java.util.LinkedHashMap<>();
        for (String[] k : AirspaceServlet.KINDS) data.put(k[1], read("src/test/resources/drone/err-incorrect-key.json"));
        try { AirspaceServlet.build(data, wfs, "2026-11-18"); fail("오류 응답으로 만들면 안 됨"); } catch (RuntimeException expected) { /* 앞의 것 그대로 */ }
        assertTrue(AirspaceServlet.data("lt_c_aisprhc", AirspaceServlet.BOX).startsWith("https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&format=json&errorformat=json&size=1000"));
        String js = read("src/main/webapp/js/dronefly.js");
        assertTrue("화면은 /api/airspace 먼저, 못 받으면 고정 파일", js.contains("fetch('api/airspace')") && js.contains("return d || fetch('data/drone-airspace.json')"));
    }
}
