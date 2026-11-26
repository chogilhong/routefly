package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 코스로 올릴 이름 - "정상 · 거치는 곳" 칸은 60자까지(2026-11-26 설악산 공룡능선 "… 양폭대피소 비선대" 가 30자에서 "비선" 으로 잘렸음). */
public class StudioViaLengthTest {

    @Test
    public void 거치는_곳은_60자() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/studio.js")), StandardCharsets.UTF_8);
        assertTrue(js.contains("maxlength=\"' + (f[0] === \"maker\" ? 20 : f[0] === \"top\" ? 60 : 30) + '\""));
        assertTrue("다 합친 이름은 60자(서버 CourseUploadServlet 2 ~ 60자와 같게)", js.contains("close({ name: n.slice(0, 60), maker:"));
        assertEquals(30, "비선대 마등령삼거리 공룡능선 무너미고개 양폭대피소 비선".length());
    }
}
