package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonParser;

/** 포인트 목록(data/points.json)이 받아 둔 실제 응답에서 만든 그대로인지. */
public class PointsTest {

    @Test
    public void points_json_은_받아_둔_응답으로_다시_만든_것과_같음() throws Exception {
        String large = Files.readString(PointsBuild.RES.resolve("apihub/marine-large-all.txt"), StandardCharsets.UTF_8), tide = Files.readString(PointsBuild.TIDE_STATIONS, StandardCharsets.UTF_8);
        // 2026-11-15 국가어항을 더함 - 바다낚시지수 49곳(build) 뒤에 PortsBuild.withPorts
        String rebuilt = PortsBuild.withPorts(PointsBuild.build(PointsBuild.fishingPages(), large, tide),
                new String(Files.readAllBytes(PortsBuild.CSV), java.nio.charset.Charset.forName("MS949")), large, tide);
        // PC 는 git core.autocrlf=true 라 체크아웃한 파일이 CRLF(2026-11-14 PC) - 줄 끝만 맞춰 비교
        assertEquals("응답이 바뀌었으면 tidefly.PortsBuild 를 다시 돌려 커밋", rebuilt, Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8).replace("\r\n", "\n"));
    }

    @Test
    public void 포인트_49곳_모두_대해구_안_선상_15곳() throws Exception {
        JsonArray a = JsonParser.parseString(Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8)).getAsJsonArray();
        assertEquals("바다낚시지수 49 + 국가어항 103(2026-11-15)", 152, a.size());
        int boat = 0, port = 0;
        for (var e : a) {
            if (e.getAsJsonObject().has("port") && e.getAsJsonObject().get("port").getAsBoolean()) port++;
            assertTrue(e.toString(), e.getAsJsonObject().get("lzone").getAsInt() > 0);
            int sz = e.getAsJsonObject().get("szone").getAsInt();
            assertTrue(e.toString(), sz >= 1 && sz <= 9);
            if (e.getAsJsonObject().get("boat").getAsBoolean()) boat++;
        }
        assertEquals(15, boat);
        assertEquals(103, port);
    }

    @Test
    public void 선상은_이름_끝_항구_기준_거리로만() {
        assertTrue(PointsBuild.boat("강릉항북동(2km)"));
        assertTrue(PointsBuild.boat("목포북항서측(53km)"));
        assertFalse(PointsBuild.boat("가거도"));
        assertFalse(PointsBuild.boat("울진 후정"));
    }

    @Test
    public void 대해구는_아래_왼쪽_경계를_넣고_위_오른쪽은_뺌() {
        List<double[]> z = PointsBuild.largeZones("#START7777\n2025012500 2025012500     1   42.5   131.5    43.0   131.5    43.0   132.0    42.5   132.0   1.5 5.0 16.0 13.3 4.0\n#7777END\n");
        assertEquals(1, z.size());
        assertEquals(1, (int) PointsBuild.zone(z, 42.5, 131.5)[0]);
        assertEquals(1, (int) PointsBuild.zone(z, 42.99, 131.99)[0]);
        assertNull(PointsBuild.zone(z, 43.0, 131.7));
        assertNull(PointsBuild.zone(z, 42.7, 132.0));
    }

    /** 2026-11-14 PC 가 받은 대해구 1 의 소해구 S1 ~ S9 실제 응답 - 각 칸 가운데 자리가 그 번호로 나오는지. */
    @Test
    public void 소해구_번호는_받아_둔_아홉_칸과_같은_차례() throws Exception {
        double[] large = {1, 42.5, 131.5, 43.0, 132.0};
        for (int s = 1; s <= 9; s++) {
            String f = s == 1 ? "apihub/marine-small-today.txt" : "apihub/marine-small-L1-S" + s + ".txt";
            String row = null;
            for (String line : Files.readString(PointsBuild.RES.resolve(f), StandardCharsets.UTF_8).split("\n")) {
                if (!line.startsWith("#") && !line.isBlank()) row = line.trim();
            }
            String[] c = row.split("\\s+");
            assertEquals(f, String.valueOf(s), c[3]);   // 4 SZONE
            double lat = (Double.parseDouble(c[4]) + Double.parseDouble(c[8])) / 2;   // LAT_LB · LAT_RT
            double lon = (Double.parseDouble(c[5]) + Double.parseDouble(c[9])) / 2;   // LON_LB · LON_RT
            assertEquals(f, s, PointsBuild.szone(large, lat, lon));
        }
        assertEquals(9, PointsBuild.szone(large, 42.5, 131.99));
        assertEquals(1, PointsBuild.szone(large, 42.9999, 131.5));
    }

    @Test
    public void 가장_가까운_조석_예보지점() throws Exception {
        // 군산 예보지점(DT_0018, 실제 응답의 위경도 35.97555 · 126.56305) 바로 옆은 군산
        var st = JsonParser.parseString(Files.readString(PointsBuild.TIDE_STATIONS, StandardCharsets.UTF_8)).getAsJsonArray();
        assertEquals("DT_0018", PointsBuild.nearest(st, 35.976, 126.563).get("code").getAsString());
        // 거리: 위도 1도 ≈ 111.2km
        assertEquals(111.2, PointsBuild.km(35, 126, 36, 126), 0.1);
        for (var e : JsonParser.parseString(Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8)).getAsJsonArray()) {
            var o = e.getAsJsonObject();
            assertTrue(o.toString(), o.get("tide").getAsString().startsWith("DT_") && o.get("tideKm").getAsDouble() >= 0);
        }
    }
}
