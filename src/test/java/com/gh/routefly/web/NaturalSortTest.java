package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** 코스 목록 이름 순 - 숫자는 크기로(2026-10-31 홍TV님 "해파랑길 1부터 2, 3, 4, 5, 6 이런 식으로"). 이름은 실제 두루누비 코스 이름. */
public class NaturalSortTest {

    @Test
    public void numbersBySize() {
        assertTrue(CourseQueries.naturalCompare("해파랑길 5코스 · 진하든솔어린이공원 → 덕하역앞", "해파랑길 10코스") < 0);
        assertTrue(CourseQueries.naturalCompare("해파랑길 49코스", "해파랑길 5코스 · 진하든솔어린이공원 → 덕하역앞") > 0);
        assertTrue(CourseQueries.naturalCompare("해파랑길 50코스", "해파랑길 49코스") > 0);
        assertEquals("앞 0 은 같은 수로", 0, CourseQueries.naturalCompare("바우길 05구간", "바우길 5구간"));
        assertTrue(CourseQueries.naturalCompare("해파랑길", "해파랑길 1코스") < 0);
    }

    @Test
    public void listOrderWithSearchHeadFirst() {
        String[] in = {"남파랑길 1코스 · 해파랑길관광안내소 → 부산역", "해파랑길 50코스", "해파랑길 5코스 · 진하든솔어린이공원 → 덕하역앞", "해파랑길 1코스 · 해파랑길관광안내소 → 해운대관광안내소",
            "해파랑길 49코스", "해파랑길 4코스 · 임랑해수욕장 → 진하든솔어린이공원", "해파랑길 10코스", "해파랑길 2코스 · 해운대관광안내소 → 대변항"};
        JsonArray rows = new JsonArray();
        for (String n : in) { JsonObject o = new JsonObject(); o.addProperty("name", n); rows.add(o); }
        List<String> out = new ArrayList<>();
        CourseQueries.naturalSorted(rows, "해파랑길").forEach(e -> out.add(e.getAsJsonObject().get("name").getAsString().replaceAll(" · .*", "")));
        assertEquals(List.of("해파랑길 1코스", "해파랑길 2코스", "해파랑길 4코스", "해파랑길 5코스", "해파랑길 10코스", "해파랑길 49코스", "해파랑길 50코스", "남파랑길 1코스"), out);
    }
}
