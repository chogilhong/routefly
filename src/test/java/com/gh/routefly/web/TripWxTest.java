package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 코스 보기(trip.html?c=) 들머리 일출 · 일몰 · 지금 날씨 한 줄(2026-11-24 홍TV님). 칸 셈은 course-kit.test.js(운영 api/wx 실제 응답 wx/wx-baekdam.json). */
public class TripWxTest {

    @Test
    public void 들머리_날씨_한_줄() throws Exception {
        String tj = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/trip.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("들머리(코스 첫 점) 자리로", tj.contains("lat0 = c.lat[0], lon0 = c.lon[0];") && tj.contains("getJson(\"api/wx?lat=\" + (+lat0).toFixed(4) + \"&lon=\" + (+lon0).toFixed(4))"));
        assertTrue("일출 · 일몰은 날씨 없이도", tj.contains("var rise = RF.sunrise(Date.now(), lat0, lon0), set = RF.sunset(Date.now(), lat0, lon0);"));
        assertTrue("첫 시각 한 칸 · 출처", tj.contains("var col = RF.wxCols(hours, String(hours[0].t).slice(0, 10), EN, 1)[0];") && tj.contains("T(\" (기상청 단기예보)\", \" (KMA forecast)\")"));
        assertTrue("정보 칸 안(코스 보기만)", tj.indexOf("sun.className = \"ci wx\";") > tj.indexOf("function infoBox(c) {") && tj.indexOf("sun.className = \"ci wx\";") < tj.indexOf("/** 기록 하나 그리기."));
        assertTrue(Files.exists(Paths.get("src/test/resources/wx/wx-baekdam.json")));
    }
}
