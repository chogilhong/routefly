package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산 페이지 코스 줄 정리(2026-11-21 홍TV님 "고급지게" 2번) - 따라가기 하나를 크게, 나머지는 "더 보기" 안. 한국어 · 영어 같게. */
public class MountainRowTidyTest {

    private static JsonObject peak() {
        return JsonParser.parseString("{\"id\":\"월출산\",\"name\":\"월출산\",\"summit\":\"천황봉\",\"lat\":34.76656,\"lon\":126.703896}").getAsJsonObject();
    }

    private static JsonObject course() {
        return JsonParser.parseString("{\"course_id\":\"knps-17018-20bc8e55\",\"name\":\"월출산 · 구정봉 → 홍계골\",\"distance_m\":1492,\"ascent_m\":6,\"descent_m\":345,"
                + "\"start_lat\":34.760294,\"start_lon\":126.693703,\"end_lat\":34.762772,\"end_lon\":126.68339,\"up_min\":52,\"down_min\":52}").getAsJsonObject();
    }

    @Test
    public void 따라가기_하나와_더_보기() {
        List<JsonObject> cs = new ArrayList<>(List.of(course()));
        String ko = MountainServlet.page(peak(), cs, new ArrayList<>(), null, "", 11);
        assertTrue(ko, ko.contains("</span><div class=\"go\"><a class=\"main\" href=\"../hike.html?lang=ko#c=knps-17018-20bc8e55"));
        assertTrue(ko.contains("\">따라가기</a><details class=\"more\"><summary>더 보기</summary><div class=\"mo\"><a href=\"../index.html?lang=ko#c=knps-17018-20bc8e55"));
        assertTrue("가는 길 · 로드뷰도 더 보기 안", ko.matches("(?s).*<div class=\"mo\">.*🚌 가는 길</a>.*>로드뷰</a></div></details></div></li>.*"));
        String en = MountainEn.page(peak(), cs, new ArrayList<>(), null, "");
        assertTrue(en, en.contains("</span><div class=\"go\"><a class=\"main\" href=\"../../hike.html?lang=en#c=knps-17018-20bc8e55"));
        assertTrue(en.contains("\">Follow (GPS)</a><details class=\"more\"><summary>More</summary><div class=\"mo\"><a href=\"../../index.html?lang=en#c="));
        assertTrue(en.contains("🚌 Directions</a></div></details></div></li>"));
    }

    @Test
    public void 고도_견주기도_더_보기_안() throws Exception {
        String kit = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/course-kit.js")), StandardCharsets.UTF_8);
        String board = kit.substring(kit.indexOf("function boardButtons("), kit.indexOf("function boardButtons(") + 400);
        assertTrue(board.contains("li.querySelector(\".go .mo\") || li.querySelector(\".go\")"));
        String cmp = kit.substring(kit.indexOf("\"cmpBtn\", en ?") - 200, kit.indexOf("\"cmpBtn\", en ?"));
        assertTrue(cmp.contains("li.querySelector(\".go .mo\") || li.querySelector(\".go\")"));
        String css = new String(Files.readAllBytes(Paths.get("src/main/webapp/css/mountain.css")), StandardCharsets.UTF_8);
        assertTrue(css.contains(".cs .go a.main {") && css.contains(".cs .go details.more > summary {"));
    }
}
