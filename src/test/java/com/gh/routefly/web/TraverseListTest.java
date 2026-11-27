package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 코스 모음(/m/ · /en/m/) 🥾 종주 > 이름난 종주(2026-11-27 홍TV님 "여기에 자료 넣어 줘, 몇 개 만들었으니까") -
 * 전에는 묶음 이름 하나가 route.html?trail=이름난 종주(빈 노선 안내도)로 갔음. 이제 series.json fixed · names 로 코스마다 코스 화면(../c/ · ../../c/), 수는 코스 수.
 */
public class TraverseListTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    // 설악 세 이름은 2026-11-27 홍TV님이 고침(공룡능선 → 남소종주 · 종주 → 용소종주 · 공룡능선 원점회귀 → 소마공천)
    public void 이름난_종주는_코스마다() throws Exception {
        JsonArray peaks = JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
        JsonArray groups = JsonParser.parseString(read("src/main/webapp/data/series.json")).getAsJsonObject().getAsJsonArray("groups");
        String ko = MountainServlet.indexPage(peaks, groups, "https://routefly.kr/routefly", false, "", "");
        String en = MountainEn.indexPage(peaks, groups, "https://routefly.kr/routefly");
        assertTrue(ko, ko.contains("<span class=\"ft\">🥾 종주</span><span class=\"fs\">8개</span>"));
        assertTrue(ko.contains("<li><a href=\"../c/u-20261116-003325\">지리산 성중종주 <small>성삼재 → 천왕봉 → 중산리 · 35.9km</small></a></li>")
                && ko.contains("<li><a href=\"../c/u-20261125-233437\">덕유산 육구종주 <small>육십령 → 남덕유산 → 향적봉 → 구천동 · 30.3km</small></a></li>")
                && ko.contains("<li><a href=\"../c/u-20261126-174929\">설악산 소마공천 <small>소공원 → 비선대 → 마등령 → 공룡능선 → 무너미고개 → 천불동 → 소공원 · 18.8km</small></a></li>")
                && ko.contains("<li><a href=\"../c/u-20261115-225753\">불수사도북 종주 <small>불암산 → 수락산 → 사패산 → 도봉산 → 북한산 · 45km</small></a></li>")
                && ko.contains("<li><a href=\"../c/u-20261115-234810\">청광종주</a></li>")
                && ko.contains("<li><a href=\"../c/u-20261126-142312\">설악산 남소종주 <small>")
                && ko.contains("<li><a href=\"../c/u-20261126-152238\">설악산 용소종주 <small>"));
        assertFalse("빈 노선 안내도로 가지 않음", ko.contains("trail=" + MountainServlet.enc("이름난 종주")) || en.contains("trail=" + MountainServlet.enc("이름난 종주")));
        assertTrue(en, en.contains("<li><a href=\"../../c/u-20261116-003832\" lang=\"ko\">지리산 화대종주 <small>화엄사 → 노고단 → 천왕봉 → 대원사 · 42.6km</small></a></li>"));
        JsonObject sr = new JsonObject();
        JsonArray f = new JsonArray();
        f.add("u-1"); f.add("../x"); f.add("u-2");
        sr.add("fixed", f);
        JsonObject nm = new JsonObject();
        nm.addProperty("u-1", "가 <b>"); nm.addProperty("../x", "나");
        sr.add("names", nm);
        assertEquals("이름 없는 것 · 규칙에 안 맞는 ID 는 빼고, 이름은 이스케이프", "<li><a href=\"../c/u-1\">가 &lt;b&gt;</a></li>", MountainServlet.fixedItems(sr, "..", false));
    }
}
