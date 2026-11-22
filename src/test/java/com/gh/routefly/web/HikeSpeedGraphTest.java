package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 내 기록 그래프에 속도 겹쳐 보기(2026-11-22 홍TV님 - 램블러 그래프처럼 고도 + 속도). 셈은 course-kit.test.js(RF.speedProfile). */
public class HikeSpeedGraphTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    public void 기록_그래프에_속도() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), kit = read("src/main/webapp/js/kit-hike.js");
        assertTrue("내 기록 그래프만 속도를 넘김", js.contains("RF.profile($(\"recViewProfile\"), rc, { speed: RF.speedProfile(rc) })"));
        assertTrue(kit.contains("function speedProfile(c)") && kit.contains("c.time.push(typeof p[2] === \"number\" ? p[2] : null);"));
        assertTrue("붉은 선 · 최고 속도 글", kit.contains("pl.setAttribute(\"stroke\", \"#ff6b6b\");") && kit.contains("tr(\"빨강 속도 · 최고 \", \"red speed · max \")"));
    }
}
