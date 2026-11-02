package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-02 홍TV님 점검: 산 페이지 날씨 날짜 줄을 서버가 미리 두어 늦게 끼워 넣을 때 아래가 밀리지 않게(폰 CLS 0.098). */
public class WxDaysSlotTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void serverPlacesDaysRowAndScriptsReuseIt() throws Exception {
        assertTrue(read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains("<div class=\\\"days\\\" role=\\\"group\\\" aria-label=\\\"날짜 고르기\\\"></div><p class=\\\"dim\\\" id=\\\"wxBody\\\">"));
        assertTrue(read("src/main/java/com/gh/routefly/web/MountainEn.java").contains("<div class=\\\"days\\\" role=\\\"group\\\" aria-label=\\\"Pick a day\\\"></div><p class=\\\"dim\\\" id=\\\"wxBody\\\">"));
        for (String js : new String[] {"src/main/webapp/js/mountain.js", "src/main/webapp/js/mountain-en.js"}) {
            String s = read(js);
            assertTrue(js + " - 있는 줄을 씀", s.contains("out.parentNode.querySelector(\".days\")") && s.contains("if (!tabs) {"));
            assertEquals(js + " - 새로 만드는 것은 없을 때만", 1, s.split("tabs = document.createElement\\(\"div\"\\)", -1).length - 1);
        }
        assertTrue("빈 줄도 단추 높이", read("src/main/webapp/css/mountain.css").contains(".days { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 10px; min-height:44px; }"));
    }
}
