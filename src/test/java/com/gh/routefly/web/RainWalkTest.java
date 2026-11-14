package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 🌧 걷는 중 비구름(2026-11-14 홍TV님 "작업해줘") - 따라가기가 기록 중 위치마다 rainCheck(10분 간격), 서비스워커는 /api/rain 을 받아 두지 않음. 알림 판단은 course-kit.test(rainNews). */
public class RainWalkTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void hikeChecksRainWhileRecording() throws Exception {
        String js = read("src/main/webapp/js/hike.js");
        int onFix = js.indexOf("    function onFix(pos) {");
        assertTrue("위치가 올 때(실제 GPS 만)", js.indexOf("if (!hike.sim) rainCheck(co.latitude, co.longitude);", onFix) > onFix);
        assertTrue("10분 간격 · 가벼운 /api/rain", js.contains("var RAIN_EVERY_MS = 600000;") && js.contains("fetch(\"api/rain?lat=\""));
        assertTrue("산행마다 처음부터", js.contains("hike.rainT = 0;") && js.contains("hike.rainLast = null;"));
        assertTrue("알림 · 음성", js.contains("RF.rainNews(hike.rainLast, j.rain, EN)") && js.contains("say(news.voice, { key: \"rain\""));
        String sw = read("src/main/webapp/sw.js");
        assertTrue("옛 비를 지금 비처럼 보이지 않게 - /api/ 받아 두기보다 앞에서 빠짐",
                sw.indexOf("if (url.indexOf(\"/api/rain\") >= 0) return;") >= 0 && sw.indexOf("if (url.indexOf(\"/api/rain\") >= 0) return;") < sw.indexOf("networkFirst(e, API)"));
    }
}
