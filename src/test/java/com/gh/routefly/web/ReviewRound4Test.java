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

    private static JsonObject lo(JsonObject o, double ele) {
        o.addProperty("ele_min_m", ele);
        return o;
    }

    @Test
    public void trailheadPrefill() {
        assertEquals("소공원", MountainServlet.trailheadName("설악산 · 소공원 → 대청봉"));
        assertEquals("중산리", MountainServlet.trailheadName("지리산 · 중산리(탐방지원센터) → 천왕봉"));
        assertNull("들머리 → 없음", MountainServlet.trailheadName("둘레길 한 바퀴"));
        assertEquals("높이를 모르면 많이 시작하는 들머리", "설악산 소공원", MountainServlet.stayPrefill("설악산",
                List.of(c("설악산 · 오색 → 대청봉"), c("설악산 · 소공원 → 대청봉"), c("설악산 · 소공원 → 울산바위"))));
        // 2026-10-30 PC: 설악산은 남설악탐방지원센터, 한라산은 남벽분기점이 골라졌음 - 가장 낮은 들머리, 갈림길은 뺌
        assertEquals("가장 낮은 들머리", "설악산 소공원", MountainServlet.stayPrefill("설악산",
                List.of(lo(c("설악산 · 남설악탐방지원센터 → 대청봉"), 340), lo(c("설악산 · 소공원 → 대청봉"), 180), lo(c("설악산 · 한계령 → 대청봉"), 1000))));
        assertEquals("갈림길은 들머리가 아님", "한라산 성판악", MountainServlet.stayPrefill("한라산",
                List.of(lo(c("한라산 · 남벽분기점 → 윗세오름"), 1500), lo(c("한라산 · 성판악 → 백록담"), 750), lo(c("한라산 · 어리목 → 윗세오름"), 970))));
        assertEquals("들머리에 산 이름이 있으면 그대로", "한라산 성판악", MountainServlet.stayPrefill("한라산", List.of(c("한라산 · 한라산 성판악 → 백록담"))));
        assertEquals("지역 붙은 이름은 떼고", "백운산 진틀", MountainServlet.stayPrefill("백운산(광양)", List.of(c("백운산 · 진틀 → 백운산"))));
        assertEquals("코스가 없으면 산 이름", "가리산", MountainServlet.stayPrefill("가리산", new ArrayList<>()));
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
