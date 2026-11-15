package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 포인트 → 해상 특보구역 짝(data/tidefly-point-wrn.json, 2026-11-14 홍TV님 "초안 그대로 넣어") - 문서 표와 같은지 · 모든 포인트 · 있는 코드인지. */
public class PointWrnTest {

    private static JsonObject regs() throws Exception {
        return JsonParser.parseString(Files.readString(Path.of("src", "main", "webapp", "data", "tidefly-point-wrn.json"), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    @Test
    public void 모든_포인트에_짝이_있고_특보구역_목록에_있는_해상_코드() throws Exception {
        JsonObject regs = regs();
        Set<String> known = new HashSet<>();
        for (String[] f : KmaText.rows(Files.readString(PointsBuild.RES.resolve("apihub/wrn-reg.txt"), StandardCharsets.UTF_8))) known.add(f[0]);
        int n = 0;
        for (var e : JsonParser.parseString(Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8)).getAsJsonArray()) {
            String name = e.getAsJsonObject().get("name").getAsString();
            List<String> ids = TideflyServlet.regIds(regs, name);
            assertFalse(name, ids == null);
            for (String id : ids) assertTrue(name + " " + id, id.startsWith("S") && known.contains(id));
            n++;
        }
        assertEquals("바다낚시지수 49 + 국가어항 103 + 지방어항 232(2026-11-15)", 384, n);
        assertEquals(384, regs.size());
    }

    @Test
    public void 문서_표와_같음() throws Exception {
        TreeMap<String, String> doc = new TreeMap<>();
        Pattern code = Pattern.compile("\\((S\\d{7})\\)");
        for (String line : Files.readString(Path.of("docs", "tidefly", "points-wrn-draft.md"), StandardCharsets.UTF_8).split("\n")) {
            if (!line.startsWith("| ") || line.startsWith("| 포인트")) continue;
            String[] c = line.split("\\|");
            if (c.length < 5) continue;
            Matcher m = code.matcher(c[4]);
            StringBuilder ids = new StringBuilder();
            while (m.find()) ids.append(ids.length() == 0 ? "" : ",").append(m.group(1));
            if (ids.length() > 0) doc.put(c[1].trim(), ids.toString());
        }
        TreeMap<String, String> json = new TreeMap<>();
        JsonObject regs = regs();
        for (String k : regs.keySet()) json.put(k, String.join(",", TideflyServlet.regIds(regs, k)));
        assertEquals(doc, json);
    }

    /** 안쪽먼바다가 짝이면 같은 바다 바깥먼바다도(홍TV님 "권하는 대로 해") - 22시 서해중부바깥먼바다 풍랑 예비가 안흥항서측(40km)에 걸리게. */
    @Test
    public void 안쪽먼바다_짝이면_바깥먼바다도_함께() throws Exception {
        JsonObject regs = regs();
        String[][] pairs = {{"S1152010", "S1152020"}, {"S1312010", "S1312020"}, {"S1232210", "S1232220"}, {"S1232110", "S1232120"}, {"S1252010", "S1252020"}};
        int n = 0;
        for (String k : regs.keySet()) {
            List<String> ids = TideflyServlet.regIds(regs, k);
            for (String[] p : pairs) {
                if (ids.contains(p[0])) {
                    assertTrue(k, ids.contains(p[1]));
                    n++;
                }
            }
        }
        assertEquals("기존 11 + 국가어항 섬 · 경계 · 울릉 14 + 지방어항 13(2026-11-15)", 38, n);
        List<SeaWarning> w = SeaWarning.parse(Files.readString(PointsBuild.RES.resolve("apihub/wrn-now.txt"), StandardCharsets.UTF_8));
        SeaForecast calm = new SeaForecast("2026111400", "2026111415", 163, 8, 0.6, 4.2, 319.2, 7.0, 28.5, 13300.0, 0.0, 16.3, 1);
        Verdict v = Verdict.judge(true, TideflyServlet.regIds(regs, "안흥항서측(40km)"), w, calm);
        assertEquals(Verdict.CARE, v.mark());
        assertEquals(List.of("서해중부바깥먼바다 풍랑 예비특보", "출항은 선사에 확인"), v.reasons());
    }
}
