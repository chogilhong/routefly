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
        keysInPolicy(js, "tf-");
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
}
