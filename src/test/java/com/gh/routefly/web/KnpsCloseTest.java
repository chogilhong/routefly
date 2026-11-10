package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Assume;
import org.junit.Test;

/**
 * 국립공원 산불예방 통제 안내(2026-11-10 홍TV님 "작업해"): data/knps-close.json 은 실제 통제이력 CSV(data.go.kr 15165806)와 공단 통제정보 목록에서
 * tools/knps-close/build.py 가 만든 것 - 손으로 고치지 않음(다시 만들면 같아야 함). 공단 robots.txt 가 긁기를 막아 지금 상태는 링크로만.
 * 화면: 탐방 안내도(park.js #closeNote) · 산 페이지(mountain.js) · 따라가기 코스 아래 안내 줄(hike.js #courseNote). 글은 RF.parkClose(course-kit.test.js).
 */
public class KnpsCloseTest {

    static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void dataIsBuiltFromRealFiles() throws Exception {
        Assume.assumeTrue("python3 없음 - 건너뜀", LogKeyAccessTest.pythonOk());
        Process p = new ProcessBuilder("python3", "-I", "tools/knps-close/build.py", "src/test/resources/knps-close/탐방로_통제이력.csv",
                "src/test/resources/knps-close/acsCtrList.html").start();
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(new String(p.getErrorStream().readAllBytes(), StandardCharsets.UTF_8), 0, p.waitFor());
        assertEquals("tools/knps-close/build.py 로 다시 만든 것과 같아야 함", out, read("src/main/webapp/data/knps-close.json"));
        assertTrue(out.contains("\"설악산\"") && out.contains("\"마등령\",\n") && out.contains("\"0008\""));
        assertFalse("지금 상태(정상 · 부분통제)는 넣지 않음", out.contains("부분통제"));
    }

    @Test
    public void screensUseIt() throws Exception {
        assertTrue(read("src/main/webapp/park.html").contains("<p id=\"closeNote\" hidden></p>"));
        assertTrue(read("src/main/webapp/js/park.js").contains("var pc = RF.parkClose(d, park, Date.now(), EN, 6);"));
        assertTrue(read("src/main/webapp/js/mountain.js").contains("var pc = window.RF.parkClose(d, pkName, Date.now(), false);"));
        assertTrue(read("src/main/webapp/js/hike.js").contains("var pc = my === loadSeq && RF.parkClose(d, noteOf, Date.now(), EN, 5);"));
        for (String kit : new String[] {"kit-park", "kit-m", "kit-hike"})
            assertTrue(kit, read("src/main/webapp/js/" + kit + ".js").contains("function parkClose("));
        assertTrue("신호 없을 때도", read("src/main/webapp/sw.js").contains("\"data/knps-close.json\""));
    }
}
