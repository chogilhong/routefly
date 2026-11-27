package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산 페이지 첫 줄 - 높이가 GPX 정상이 아닌 최고봉 것일 때 "최고봉 자운봉 740m · 오를 수 있는 정상 신선대"(2026-11-27 홍TV님 "가 로 해").
 * 전에는 "정상 도봉산신선대 740m" - 신선대(GPX 정상) 이름에 자운봉 높이(백과 「도봉산」 "높이는 740.2m이며, 주봉은 자운봉")가 붙었음.
 */
public class DobongTopTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    private static JsonObject peak(JsonArray peaks, String id) {
        for (JsonElement e : peaks) if (id.equals(e.getAsJsonObject().get("id").getAsString())) return e.getAsJsonObject();
        throw new AssertionError(id);
    }

    @Test
    public void 도봉산은_최고봉_자운봉_오를_수_있는_정상_신선대() throws Exception {
        JsonArray peaks = JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
        MountainServlet.withElev(peaks, JsonParser.parseString(read("src/main/webapp/data/peak-elev.json")).getAsJsonObject());
        JsonObject d = peak(peaks, "도봉산");
        assertEquals("높이 740.2 의 봉우리", "자운봉", MountainServlet.topName(d));
        assertEquals("신선대", MountainServlet.climbName(d));
        assertEquals(Integer.valueOf(740), MountainServlet.elev(d));
        JsonObject s = peak(peaks, "설악산");
        assertNull("다른 산은 그대로", MountainServlet.climbName(s));
        assertEquals("대청봉", MountainServlet.topName(s));

        String ko = read("src/main/java/com/gh/routefly/web/MountainServlet.java"), en = read("src/main/java/com/gh/routefly/web/MountainEn.java");
        assertTrue("한국어 첫 줄", ko.contains("(climb != null ? \" · 최고봉 \" : \" · 정상 \")") && ko.contains(".append(climb != null ? \" · 오를 수 있는 정상 \" + esc(climb) : \"\")"));
        assertTrue("영어 첫 줄도 같게", en.contains("climb != null ? \" · Highest peak \" : \" · Summit \"") && en.contains("\" · Accessible summit \""));
    }
}
