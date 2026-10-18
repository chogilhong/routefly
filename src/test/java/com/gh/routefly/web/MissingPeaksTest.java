package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 100대 명산 빠졌던 2곳(천성산 · 대암산 - 2026-10-18 홍TV님, PC MissingPeakProbe · 산림청 e-book). */
public class MissingPeaksTest {

    private static JsonArray peaks() throws Exception {
        JsonArray p;
        try (InputStreamReader r = new InputStreamReader(Files.newInputStream(Path.of("src/main/webapp/data/mountains100.json")), StandardCharsets.UTF_8)) {
            p = JsonParser.parseReader(r).getAsJsonObject().getAsJsonArray("peaks");
        }
        try (InputStreamReader r = new InputStreamReader(Files.newInputStream(Path.of("src/main/webapp/data/peak-elev.json")), StandardCharsets.UTF_8)) {
            MountainServlet.withElev(p, JsonParser.parseReader(r).getAsJsonObject());
        }
        return p;
    }

    @Test
    public void 백곳_모두() throws Exception {
        JsonArray p = peaks();
        assertEquals(100, p.size());
        for (int i = 0; i < p.size(); i++) assertTrue(p.get(i).getAsJsonObject().get("id").getAsString(), MountainServlet.elev(p.get(i).getAsJsonObject()) != null);
        JsonObject cs = MountainServlet.find(p, "천성산"), da = MountainServlet.find(p, "대암산");
        assertEquals(Integer.valueOf(920), MountainServlet.elev(cs));
        assertEquals(Integer.valueOf(1313), MountainServlet.elev(da));
        assertEquals("천성산 정상(코스 끝)도 도장 자리", "천성산 정상", cs.getAsJsonArray("alt").get(0).getAsJsonObject().get("name").getAsString());
    }

    @Test
    public void 대암산은_정상_통제() throws Exception {
        JsonArray p = peaks();
        JsonObject da = MountainServlet.find(p, "대암산"), cs = MountainServlet.find(p, "천성산");
        assertFalse("갈 수 있는 끝(1,109m)이 정상처럼 1,313m 로 보이면 안 됨", MountainServlet.summitOk(da));
        assertNull(MountainServlet.topName(da));
        assertEquals("천성산", MountainServlet.topName(cs));
        for (Peaks.Top t : Peaks.tops(p)) assertFalse("공식 높이로 바꾸는 정상에서 대암산은 뺌", "대암산".equals(t.name()));
        assertTrue(Peaks.tops(p).stream().anyMatch(t -> "천성산".equals(t.name())));
        String ko = MountainServlet.page(da, new ArrayList<>(), new ArrayList<>(), null, ""), en = MountainEn.page(da, new ArrayList<>(), new ArrayList<>(), null, "");
        assertTrue(ko.contains("<p class=\"closedNote\">⛔ 정상 일대는 통제구역이라 정상까지는 오를 수 없습니다.") && ko.contains("도장 자리 대암산 정상") && !ko.contains("정상 대암산 정상"));
        assertTrue(en.contains("<p class=\"closedNote\">⛔ The summit area is a restricted zone."));
        assertFalse(MountainServlet.page(cs, new ArrayList<>(), new ArrayList<>(), null, "").contains("closedNote"));
    }
}
