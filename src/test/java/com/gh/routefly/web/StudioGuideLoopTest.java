package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 탐방 · 노선 안내도의 "‹ GPX 편집" 은 들어온 GPX 편집으로 되돌아감(history.back) - 링크로 새로 열면 GPX 편집의 "‹ 뒤로" 가
 * 다시 안내도로 와 두 화면이 왔다 갔다 했음(2026-11-26 홍TV님). park.js · route.js 두 벌 함께.
 */
public class StudioGuideLoopTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 안내도_GPX_편집_단추는_되돌아감() throws Exception {
        String want = "try { var r = new URL(document.referrer); fromStudio = r.origin === location.origin && /\\/studio\\.html$/.test(r.pathname); } catch (x) { /* 다른 곳 */ }\n"
                + "                if (fromStudio && history.length > 1) { e.preventDefault(); history.back(); }";
        for (String f : new String[] {"src/main/webapp/js/park.js", "src/main/webapp/js/route.js"}) {
            String js = read(f);
            int at = js.indexOf("if (backTo === \"studio\") {");
            assertTrue(f, at >= 0 && js.indexOf(want, at) > at && js.indexOf(want, at) - at < 900);
        }
        // GPX 편집 "‹ 뒤로" 는 처음 연 화면으로(2026-11-26 홍TV님 "처음 어디서 열었느냐가 중요해. 거기로 찾아가야지") - 판정은 studio-from.test.js
        String st = read("src/main/webapp/js/studio.js");
        assertTrue(st.contains("if (from.guide) { e.preventDefault(); location.href = first || \"m/\"; return; }") && st.contains("if (from.first) sessionStorage.setItem(FROM_KEY, from.url);"));
        for (String page : new String[] {"privacy.html", "privacy-en.html"}) assertTrue("개인정보처리방침에 저장 열쇠 " + page, read("src/main/webapp/" + page).contains("(rf-studio-from,"));
        ReviewRound5Test.node("src/test/js/studio-from.test.js");
        assertTrue("park · route 는 서비스워커 화면 파일 - 캐시 이름을 올림", read("src/main/webapp/sw.js").contains("var SHELL = \"rf-shell-v429\""));
    }
}
