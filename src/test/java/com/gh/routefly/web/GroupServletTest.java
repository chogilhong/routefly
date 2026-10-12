package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 국토종주 · 국가숲길 모아 보기 - /api/group 앞부분 검사와 data/series.json 의 앞부분. */
public class GroupServletTest {

    @Test
    public void validPrefix() {
        assertTrue(GroupServlet.validPrefix("osmb-6374513-"));
        assertTrue(GroupServlet.validPrefix("kmf-9900000006-"));
        assertFalse("끝의 - 없이는 다른 노선까지 잡힘", GroupServlet.validPrefix("osmb-637"));
        assertFalse("코스 하나의 ID 는 아님", GroupServlet.validPrefix("osmb-6374513-1"));
        assertFalse("LIKE 와일드카드", GroupServlet.validPrefix("osmb-%-"));
        assertFalse(GroupServlet.validPrefix("knps-1-"));
        assertFalse(GroupServlet.validPrefix(""));
        assertFalse(GroupServlet.validPrefix(null));
    }

    @Test
    public void seriesJsonPrefixesAreValid() throws Exception {
        String txt = new String(Files.readAllBytes(Paths.get("src/main/webapp/data/series.json")), StandardCharsets.UTF_8);
        JsonObject d = JsonParser.parseString(txt).getAsJsonObject();
        int n = 0, named = 0, peaks = 0, certs = 0, seriesCerts = 0;
        for (JsonElement g : d.getAsJsonArray("groups")) {
            if (g.getAsJsonObject().has("cert")) {   // 공식 인증 링크 - 나라 · 공공기관(https)만
                String u = g.getAsJsonObject().getAsJsonObject("cert").get("url").getAsString();
                assertTrue(u, u.startsWith("https://www.bike.go.kr/") || u.startsWith("https://www.durunubi.kr/"));
                certs++;
            }
            for (JsonElement s : g.getAsJsonObject().getAsJsonArray("series")) {
                JsonObject o = s.getAsJsonObject();
                if (o.has("cert")) {   // 길 하나의 인증(지리산둘레길 - (사)숲길, https 안 됨 2026-10-12 PC)
                    assertEquals("http://www.trail.or.kr/wp/?page_id=8966", o.getAsJsonObject("cert").get("url").getAsString());
                    seriesCerts++;
                }
                if (o.has("q")) {   // 코리아둘레길 - 이름으로 찾음(/api/courses?q=), 검색어 길이 안
                    assertTrue(o.get("q").getAsString(), o.get("q").getAsString().length() <= CourseQueries.MAX_QUERY);
                    named++;
                    continue;
                }
                if (o.has("summits")) {   // 100대 명산 - 정상 목록 파일(코스 묶음 아님)
                    assertTrue(Files.exists(Paths.get("src/main/webapp/" + o.get("summits").getAsString())));
                    peaks++;
                    continue;
                }
                String p = o.get("prefix").getAsString();
                assertTrue(p + " 은 /api/group 이 받는 모양", GroupServlet.validPrefix(p));
                n++;
            }
        }
        assertEquals("국토종주 13 + 국가숲길 6", 19, n);
        assertEquals("코리아둘레길 4", 4, named);
        assertEquals("100대 명산 1", 1, peaks);
        assertEquals("공식 인증 링크 - 국토종주 · 코리아둘레길", 2, certs);
        assertEquals("길 하나의 인증 링크 - 지리산둘레길", 1, seriesCerts);
    }
}
