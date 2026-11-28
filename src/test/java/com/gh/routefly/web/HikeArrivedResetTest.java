package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 다른 코스를 열면 앞 코스의 "🎉 … 도착!" 띠를 치움(2026-11-28 PC 매뉴얼 1편 녹화: 시험 걷기 도착 → 끝내기 → 목록 → 다른 코스(26.48km)를 열어도
 * "🎉 대청봉 도착!" 이 남았음 - 띠는 산행 시작 · 걷는 중 코스 바꾸기(adoptCourse)에서만 숨겼음).
 */
public class HikeArrivedResetTest {

    @Test
    public void 코스를_열면_도착_띠를_치움() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/hike.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int at = js.indexOf("    function loadCourse(id) {");
        assertTrue("코스 열기", at > 0);
        String body = js.substring(at, js.indexOf("\n    function ", at + 10));
        int set = body.indexOf("            c = nc;\n");
        assertTrue("새 코스를 정한 곳", set > 0);
        assertTrue("바로 뒤에서 도착 띠를 숨김", body.startsWith("            c = nc;\n            $(\"arrived\").style.display = \"none\";", set));
    }
}
