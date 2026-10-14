package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.StringReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** 들머리 근처 주차장(전국주차장정보표준데이터 CSV - 2026-10-14). 칸 이름은 표준데이터의 이름, 값은 테스트 데이터. */
public class ParkingServletTest {

    static final String CSV = "﻿주차장관리번호,주차장명,주차장구분,주차장유형,소재지도로명주소,소재지지번주소,주차구획수,요금정보,주차기본시간,주차기본요금,위도,경도\n"
            + "1,치인주차장,공영,노외,경상남도 합천군 가야면 치인리,,120,유료,30,\"1,000\",35.8010,128.1010\n"
            + "2,\"해인사 \"\"제2\"\" 주차장\",공영,노외,,경상남도 합천군 가야면 치인리 10,80,무료,,,35.7990,128.0950\n"
            + "3,먼 주차장,민영,노외,서울,,10,유료,,,37.5,127.0\n"
            + "4,좌표없음,공영,노외,,,5,무료,,,,\n";

    @Test
    public void parsesByColumnNameAndQuotes() throws Exception {
        List<ParkingServlet.Lot> l = ParkingServlet.parse(new StringReader(CSV));
        assertEquals(3, l.size());
        assertEquals("해인사 \"제2\" 주차장", l.get(1).name);
        assertEquals("경상남도 합천군 가야면 치인리 10", l.get(1).addr);   // 도로명이 없으면 지번
        assertEquals("유료 · 기본 30분 1,000원", l.get(0).fee);
        assertEquals("무료", l.get(1).fee);
        assertEquals(Integer.valueOf(120), l.get(0).spaces);
    }

    @Test
    public void nearestWithinRadius() throws Exception {
        JsonArray a = ParkingServlet.near(ParkingServlet.parse(new StringReader(CSV)), 35.8000, 128.1000, 3000, 10);
        assertEquals(2, a.size());
        JsonObject first = a.get(0).getAsJsonObject();
        assertEquals("치인주차장", first.get("name").getAsString());
        assertTrue(first.get("dist_m").getAsLong() < a.get(1).getAsJsonObject().get("dist_m").getAsLong());
        assertEquals(1, ParkingServlet.near(ParkingServlet.parse(new StringReader(CSV)), 35.8000, 128.1000, 3000, 1).size());
    }

    @Test
    public void decodesUtf8OrMs949() {
        String s = "주차장명,위도\n";
        assertEquals(s, ParkingServlet.decode(s.getBytes(StandardCharsets.UTF_8)));
        assertEquals(s, ParkingServlet.decode(s.getBytes(Charset.forName("MS949"))));
    }
}
