package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 내 기록 그래프에 속도 겹쳐 보기(2026-11-22 홍TV님 - 램블러 그래프처럼 고도 + 속도). 셈은 course-kit.test.js(RF.speedProfile). */
public class HikeSpeedGraphTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC git 은 CRLF 로 체크아웃
    }

    @Test
    public void 기록_그래프에_속도() throws Exception {
        // 2026-11-23: 내 기록 그래프는 기록 보기 화면(trip.html)으로
        String js = read("src/main/webapp/js/trip.js"), kit = read("src/main/webapp/js/kit-trip.js");
        assertTrue("기록 보기 그래프가 속도를 넘김", js.contains("RF.profile($(\"prof\"), rc, { speed: RF.speedProfile(rc), labels: false, top: "));
        assertTrue(kit.contains("function speedProfile(c)") && kit.contains("c.time.push(typeof p[2] === \"number\" ? p[2] : null);"));
        assertTrue("붉은 선 · 최고 속도 글", kit.contains("pl.setAttribute(\"stroke\", \"#ff6b6b\");") && kit.contains("tr(\"빨강 속도 · 최고 \", \"red speed · max \")"));
    }
}
