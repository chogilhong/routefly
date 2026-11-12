package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 코스 공유 그림(2026-11-12 점검 9차: 코스 페이지 · 공유 링크가 모두 같은 og.png - 100대 명산 정상에 닿으면 그 산 그림 /og/m/산.png). */
public class CourseShareImageTest {

    static String read(String p) throws Exception { return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8); }

    @Test
    public void coursePageUsesPeakImage() throws Exception {
        JsonObject j = JsonParser.parseString(read("src/test/resources/course/frst-462300101-744138.json")).getAsJsonObject(), c = j.getAsJsonObject("course");
        JsonObject jiri = null;   // 정상 자리는 data/mountains100.json 그대로
        for (var e : JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks"))
            if ("지리산".equals(e.getAsJsonObject().get("id").getAsString())) jiri = e.getAsJsonObject();
        String withPeak = CoursePageServlet.page(c, jiri, null, null, null, new JsonArray(), true, "https://routefly.kr/routefly", List.of());
        assertTrue(withPeak.contains("<meta property=\"og:image\" content=\"https://routefly.kr/routefly/og/m/" + MountainServlet.enc("지리산") + ".png\">"));
        String noPeak = CoursePageServlet.page(c, null, null, null, null, new JsonArray(), true, "https://routefly.kr/routefly", List.of());
        assertTrue("정상에 안 닿으면 기본 그림", noPeak.contains("<meta property=\"og:image\" content=\"https://routefly.kr/routefly/img/og.png"));
        String share = read("src/main/java/com/gh/routefly/web/ShareServlet.java");
        assertTrue("공유 링크(/s/)도 같은 규칙", share.contains("ogPeak != null ? base + \"/og/m/\" + MountainServlet.enc(ogPeak) + \".png\" : base + \"/img/og.png?v=2\""));
    }
}
