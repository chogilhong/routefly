package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 도착 문자 - 높은 곳에서 끝나는 코스(백담사 → 소청봉)는 "무사히 도착했어요", 내려온 코스만 "무사히 내려왔어요"(2026-11-19 홍TV님 "조금 어색한데"). RF.endsHigh 는 course-kit.test.js. */
public class ArriveSmsTest {

    @Test
    public void 정상에서_끝나면_도착() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/hike.js")), StandardCharsets.UTF_8);
        assertTrue(js.contains("up = RF.endsHigh(c.ele), endNm = endPoi ? endPoi.name : \"\";"));
        assertTrue(js.contains("(up ? (endNm || \"목적지\") + \"에 무사히 도착했습니다\" : \"산행을 무사히 마쳤습니다\")"));
        assertTrue(js.contains("safe.textContent = up ? T(\"📱 가족에게 \\\"무사히 도착했어요\\\" 문자\""));
        assertTrue("위치는 여전히 넣지 않음", !js.substring(js.indexOf("safe.href = "), js.indexOf("safe.textContent")).contains("lat"));
    }
}
