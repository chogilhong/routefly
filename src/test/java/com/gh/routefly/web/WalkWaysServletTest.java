package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 우리 서버 OSM 걷는 길 API(2026-11-22 홍TV님 "방법 1 로 해"). 칸 파일 모양은 routefly-batch LocalOsm.row()(그 배치 LocalOsmTest 의 길 w1 · w2 · w3 과 같은 좌표)
 * 이고 WebTiles 가 walk.dir 로 내 줌. 테스트 자료 src/test/resources/walk/.
 */
public class WalkWaysServletTest {

    @Test
    public void 칸_파일에서_Overpass_꼴로() throws Exception {
        File tiles = WalkWaysServlet.current(new File("src/test/resources/walk"));
        assertTrue(tiles != null && tiles.getName().equals("tiles-1700000000000-123-v1"));
        List<WalkWaysServlet.Row> rows = WalkWaysServlet.rows(new File(tiles, "c_" + WalkWaysServlet.cell(38.01) + "_" + WalkWaysServlet.cell(128.0) + ".tsv"));
        assertEquals("깨진 줄은 뺌", 3, rows.size());
        JsonArray el = WalkWaysServlet.elements(rows, new double[] {127.99, 38.0, 128.01, 38.02}).getAsJsonArray("elements");
        int nodes = 0, ways = 0;
        for (int i = 0; i < el.size(); i++) if ("node".equals(el.get(i).getAsJsonObject().get("type").getAsString())) nodes++; else ways++;
        assertEquals("길 셋 · 갈림길(38.0125,128.001)과 출발점(38.010,128.000)은 같은 노드", 3, ways);
        assertEquals(4, nodes);
        JsonObject w3 = el.get(el.size() - 1).getAsJsonObject();
        assertEquals("private", w3.getAsJsonObject("tags").get("access").getAsString());
        assertEquals("먼 곳은 비어 있음", 0, WalkWaysServlet.elements(rows, new double[] {126.0, 36.0, 126.01, 36.01}).getAsJsonArray("elements").size());
    }

    @Test
    public void 다른_경로로_새지_않음() throws Exception {
        File d = Files.createTempDirectory("walk").toFile();
        Files.writeString(new File(d, "current.txt").toPath(), "../etc\n", StandardCharsets.UTF_8);
        assertNull(WalkWaysServlet.current(d));
        assertNull("current.txt 가 없으면 자료 없음", WalkWaysServlet.current(Files.createTempDirectory("walk2").toFile()));
        assertNull(WalkWaysServlet.row("w1\tpath\t\t\t380100000,1280000000"));   // 점 하나
    }

    @Test
    public void 화면은_우리_자료_먼저() throws Exception {
        String st = new String(Files.readAllBytes(new File("src/main/webapp/js/studio.js").toPath()), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(st.contains("fetch(\"api/walk-ways?bbox=\" + key"));
        assertTrue("자료가 없을 때만 공용 Overpass", st.contains("}, function () { return overpass(a, b, sig).then(function (el) {"));
        assertTrue("서버 한도와 같게", st.contains("if (bb[2] - bb[0] > 0.06 || bb[3] - bb[1] > 0.06)") && WalkWaysServlet.MAX_SPAN == 0.06);
    }
}
