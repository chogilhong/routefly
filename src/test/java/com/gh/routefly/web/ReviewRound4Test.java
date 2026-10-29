package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

/** 점검 4차(2026-10-30 홍TV님 "작업해") - 산 페이지 근처 숙소 찾기 칸(대표 들머리를 미리 채움). */
public class ReviewRound4Test {

    private static JsonObject c(String name) {
        JsonObject o = new JsonObject();
        o.addProperty("course_id", "t-" + name.hashCode());
        o.addProperty("name", name);
        o.addProperty("distance_m", 5000);
        return o;
    }

    @Test
    public void stayBasePrefill() {
        // 2026-10-30 PC: 코스 들머리로 고르니 "남벽분 기점" · "관심사" 등이 나옴 - 이름난 산은 거점 표, 나머지는 산 이름
        assertEquals("설악산 소공원", MountainServlet.stayPrefill("설악산"));
        assertEquals("한라산 성판악", MountainServlet.stayPrefill("한라산"));
        assertEquals("표에 없는 산은 산 이름", "가리산", MountainServlet.stayPrefill("가리산"));
        assertEquals("지역 붙은 이름은 지역을 앞에(통영 지리산이 큰 지리산과 섞이지 않게)", "통영 지리산", MountainServlet.stayPrefill("지리산(통영)"));
        com.google.gson.JsonArray peaks;
        try {
            peaks = JsonParser.parseString(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/data/mountains100.json"))).getAsJsonObject().getAsJsonArray("peaks");
        } catch (java.io.IOException e) {
            throw new AssertionError(e);
        }
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (com.google.gson.JsonElement e : peaks) ids.add(e.getAsJsonObject().get("id").getAsString());
        assertTrue("거점 표의 산은 모두 100대 명산 id", ids.containsAll(MountainServlet.STAY_BASE.keySet()));
    }

    @Test
    public void mountainPagesHaveBox() {
        JsonObject gaya = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.822544,\"lon\":128.122849}").getAsJsonObject();
        List<JsonObject> cs = List.of(c("가야산 · 해인사 → 상왕봉"));
        String ko = MountainServlet.page(gaya, cs, List.of(), null, ""), en = MountainEn.page(gaya, cs, List.of(), null, "");
        assertTrue(ko, ko.contains("id=\"ssForm\"") && ko.contains("value=\"가야산 해인사\"") && ko.contains("들머리 · 군청 · 역 이름으로"));
        assertTrue(en.contains("id=\"ssForm\"") && en.contains("value=\"가야산 해인사\"") && en.contains(">Search</button>"));
        assertEquals("칸은 한 번만", ko.indexOf("id=\"ssForm\""), ko.lastIndexOf("id=\"ssForm\""));
        assertTrue("값에 꺾쇠가 있어도 그대로 나가지 않음", MountainServlet.staySearchBox("<x>", false).contains("value=\"&lt;x&gt;\""));
        assertFalse("모음(/m/) 칸은 비워 둠", MountainServlet.staySearchBox(null, false).contains("value="));
    }
}
