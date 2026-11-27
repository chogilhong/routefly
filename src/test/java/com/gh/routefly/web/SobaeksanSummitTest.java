package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산 페이지 정상 판정 · 코스 최고점(2026-11-27 PC 확인):
 * - /m/소백산 비로봉 코스에 "⚠ 소백산 정상에 안 감" - 산림청 GPX 정상 자리(36.957868, 128.478866)가 갈림길 자리라 비로봉에서 서쪽으로 약 540m.
 *   두 번째 정상 자리(alt) 비로봉 = 운영 /api/course "천동탐방지원센터 → 소백산 비로봉"(frst-438001301-0bb7a5) 끝점 36.95753, 128.484896(PC 가 읽은 값).
 * - /m/도봉산(740m) "코스 최고점 약 836m" - 불수사도북 종주(u-20261115-225753, ele_max 836 - 북한산 백운대)가 들어감.
 */
public class SobaeksanSummitTest {

    @Test
    public void 소백산_비로봉_끝점은_정상을_지남() throws Exception {
        String j = new String(Files.readAllBytes(Paths.get("src/main/webapp/data/mountains100.json")), StandardCharsets.UTF_8);
        List<Peaks.Top> tops = Peaks.named(JsonParser.parseString(j).getAsJsonObject().getAsJsonArray("peaks"));
        assertTrue("천동 → 비로봉 코스 끝점이 소백산 정상(200m 안)을 지남",
                Peaks.passed(new double[] {36.95753}, new double[] {128.484896}, tops).contains("소백산"));
    }

    private static JsonObject course(double ele) {
        JsonObject o = new JsonObject();
        o.addProperty("ele_max_m", ele);
        return o;
    }

    @Test
    public void 코스_최고점은_이_산보다_한참_높은_종주를_뺌() {
        List<JsonObject> cs = List.of(course(740.2), course(836), new JsonObject());
        assertEquals("도봉산 740m - 백운대 836m 를 지나는 종주는 뺌", Integer.valueOf(740), MountainServlet.courseTop(cs, 740));
        assertEquals("높이를 모르면 모두", Integer.valueOf(836), MountainServlet.courseTop(cs, null));
        assertEquals("30m 안은 그대로(DEM 차이)", Integer.valueOf(760), MountainServlet.courseTop(List.of(course(760)), 740));
        assertNull("남는 코스가 없으면 없음", MountainServlet.courseTop(List.of(course(836)), 740));
    }
}
