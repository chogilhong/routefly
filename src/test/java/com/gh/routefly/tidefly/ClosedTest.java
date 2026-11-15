package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 연안 출입통제구역 경고(2026-11-15 3단계, 안전) - 해양경찰청 SHP(15110667) 그대로인지. */
public class ClosedTest {

    @Test
    public void closed_json_은_받은_SHP_로_다시_만든_것과_같음() throws Exception {
        String now = Files.readString(ClosedBuild.OUT, StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertEquals("SHP · 포인트 · 자리가 바뀌었으면 tidefly.ClosedBuild 를 다시 돌려 커밋", ClosedBuild.build(Files.readAllBytes(ClosedBuild.SHP), Files.readAllBytes(ClosedBuild.DBF),
                Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8), Files.readString(SpotsBuild.OUT, StandardCharsets.UTF_8)), now);
        JsonObject o = JsonParser.parseString(now).getAsJsonObject();
        assertEquals(9, o.size());
        assertEquals("위도항 방파제 테트라포드 일원", o.getAsJsonArray("위도항").get(0).getAsJsonObject().get("area").getAsString());
        assertEquals(90, o.getAsJsonArray("위도항").get(0).getAsJsonObject().get("m").getAsInt());
        assertEquals("앞산초인근해상은 APEC 등표 구역 안", 0, o.getAsJsonArray("수영만 부근 · 앞산초인근해상").get(0).getAsJsonObject().get("m").getAsInt());
        assertTrue(o.has("구시포항") && o.has("격포항") && o.has("제주도 남부 · 황우리해안 갯바위"));
    }

    @Test
    public void SHP_43개_면과_DBF_칸() throws Exception {
        List<List<double[][]>> polys = ClosedBuild.polygons(Files.readAllBytes(ClosedBuild.SHP));
        List<Map<String, String>> recs = ClosedBuild.records(Files.readAllBytes(ClosedBuild.DBF), Charset.forName("MS949"));
        assertEquals(43, polys.size());
        assertEquals(43, recs.size());
        assertEquals("하나개해수욕장 갯벌 일부(해상탐방로 끝단 부분)", recs.get(0).get("name"));
        assertEquals("인천해양경찰서 공고 제2021-22호", recs.get(0).get("announceme"));
        double[] p = polys.get(0).get(0)[0];
        assertTrue("WGS84 경도 · 위도", p[0] > 126 && p[0] < 127 && p[1] > 37 && p[1] < 38);
        assertEquals(0, ClosedBuild.meters(p[1], p[0], polys.get(0)), 1);
    }
}
