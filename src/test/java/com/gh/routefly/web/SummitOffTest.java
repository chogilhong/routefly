package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산 페이지 - 그 산 정상을 안 지나는 옆 봉우리 코스에 "⚠ ○○ 정상에 안 감"(2026-11-20 홍TV님 "고쳐 줘").
 * 코스 선은 운영 /api/course 응답(src/test/resources/course/summit-off): /m/백운산(정선) 의 유일한 코스 "푯대봉 1코스 · 백룡동굴 → 푯대봉"(정상에서 1,065m)
 * · /m/칠갑산 의 "칠갑산 · 천장 → 칠갑산"(정상까지).
 */
public class SummitOffTest {

    private static JsonObject json(String path) throws Exception {
        return JsonParser.parseString(new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static Set<String> passed(String id, List<Peaks.Top> tops) throws Exception {
        JsonArray pts = json("src/test/resources/course/summit-off/" + id + ".json").getAsJsonArray("points");
        double[] lat = new double[pts.size()], lon = new double[pts.size()];
        for (int i = 0; i < lat.length; i++) {
            lon[i] = pts.get(i).getAsJsonArray().get(0).getAsDouble();
            lat[i] = pts.get(i).getAsJsonArray().get(1).getAsDouble();
        }
        return Peaks.passed(lat, lon, tops);
    }

    private static JsonObject peak(JsonArray peaks, String id) {
        for (JsonElement e : peaks) if (id.equals(e.getAsJsonObject().get("id").getAsString())) return e.getAsJsonObject();
        throw new AssertionError(id);
    }

    @Test
    public void 정상에_안_가는_코스() throws Exception {
        JsonArray peaks = json("src/main/webapp/data/mountains100.json").getAsJsonArray("peaks");
        List<Peaks.Top> tops = Peaks.named(peaks);
        assertFalse("푯대봉 코스는 백운산(정선) 정상을 안 지남", passed("kmp-2322010655-1", tops).contains("백운산(정선)"));
        assertTrue("천장 → 칠갑산 은 칠갑산 정상을 지남", passed("frst-447902001-0c83ce", tops).contains("칠갑산"));
        assertTrue(Peaks.passed(null, null, tops).isEmpty());

        // 산 페이지 표시: passes 에 그 산이 없으면 summit_off = 산 이름, 뒤로. passes 가 없으면(점을 못 읽음) · 이미 summit_miss 면 그대로
        JsonObject baek = peak(peaks, "백운산(정선)");
        JsonObject off = new JsonObject(), on = new JsonObject(), unknown = new JsonObject(), miss = new JsonObject();
        off.addProperty("name", "푯대봉 1코스 · 백룡동굴 → 푯대봉");
        JsonArray pa = new JsonArray();
        passed("kmp-2322010655-1", tops).forEach(pa::add);
        off.add("passes", pa);
        on.addProperty("name", "가");
        JsonArray pb = new JsonArray();
        pb.add("백운산(정선)");
        on.add("passes", pb);
        unknown.addProperty("name", "나");
        miss.addProperty("name", "다");
        miss.add("passes", new JsonArray());
        miss.addProperty("summit_miss", "백운산");
        List<JsonObject> got = MountainServlet.markOff(new ArrayList<>(List.of(off, on, unknown, miss)), baek);
        assertEquals("백운산", off.get("summit_off").getAsString());
        assertFalse(on.has("summit_off") || unknown.has("summit_off") || miss.has("summit_off"));
        assertEquals("정상에 가는 코스가 앞", List.of(on, unknown, miss, off), got);

        // 들머리 · 끝이 2km 넘게 떨어진 원점회귀도 정상을 지나면 산 페이지에(2026-11-21 PC - 운영 u-20261121-161922: 들머리 37.259615, 128.596859, 정상에서 약 2.3km)
        JsonArray rows = new JsonArray();
        JsonObject loop = new JsonObject(), farOff = new JsonObject(), close = new JsonObject();
        for (JsonObject o : List.of(loop, farOff)) { o.addProperty("start_lat", 37.259615); o.addProperty("start_lon", 128.596859); o.addProperty("end_lat", 37.259631); o.addProperty("end_lon", 128.596878); }
        loop.addProperty("name", "정선 백운산 · 동강자연휴양림 → 나리소전망대 점재교 백운산 칠족령 → 동강자연휴양림");
        farOff.addProperty("name", "같은 들머리 · 정상 안 감");
        close.addProperty("name", "정선 백운산 · 점재교 → 백운산");   // 운영 u-20261121-150912 끝 37.280061, 128.596079
        close.addProperty("start_lat", 37.276265); close.addProperty("start_lon", 128.610881); close.addProperty("end_lat", 37.280061); close.addProperty("end_lon", 128.596079);
        rows.add(loop); rows.add(farOff); rows.add(close);
        assertEquals("2km 안은 가까운 코스 하나", List.of(close), MountainServlet.near(rows, baek, MountainServlet.NEAR_M, 30));
        List<JsonObject> far = MountainServlet.near(rows, baek, MountainServlet.NEAR_M, MountainServlet.FAR_M, MountainServlet.FAR_MAX);
        assertEquals("2 ~ 5km 후보 둘(가까운 것은 빠짐)", 2, far.size());
        JsonArray pass = new JsonArray();
        pass.add("백운산(정선)");
        loop.add("passes", pass);
        farOff.add("passes", new JsonArray());
        assertEquals("정상을 지나는 원점회귀만", List.of(loop), MountainServlet.through(far, baek));

        // 문답: 정상에 안 가는 코스는 "정상까지 가는 코스" 로 세지 않음(2026-11-21 PC - 백운산(정선) 문답이 푯대봉 코스를 정상 코스로 적었음)
        List<String[]> qa = MountainServlet.faq(baek, "백운산(정선)", List.of(off), null);
        assertEquals("정상까지 가는 코스는 아직 찾지 못했습니다. 둘레 코스 1개는 정상에 가지 않으니 코스 칸의 ⚠ 표시를 보세요.", qa.get(0)[1]);
        assertFalse("시간 문답도 없음", qa.stream().anyMatch(q -> q[0].contains("몇 시간")));
        assertTrue(MountainEn.faq(baek, "Baegunsan", List.of(off), null).get(0)[1].startsWith("No trail to the summit has been found yet. The 1 nearby trail does not reach"));
        assertEquals("정상 코스만 셈", "정상까지 가는 코스 1개를 소개합니다.", MountainServlet.faq(baek, "백운산(정선)", List.of(off, miss, courseRow(on)), null).get(0)[1].substring(0, 21));

        // 페이지 글(한국어 · 영어)
        assertTrue(MountainServlet.page(baek, new ArrayList<>(List.of(courseRow(off))), new ArrayList<>(), null, "", 11).contains(" · ⚠ 백운산 정상에 안 감"));
        assertTrue(MountainEn.page(baek, new ArrayList<>(List.of(courseRow(off))), new ArrayList<>(), null, "https://r.kr").contains(" · ⚠ does not reach the summit of Baegunsan"));
    }

    /** DB 를 읽는 곳(산 페이지 load · Steep.fill)이 실제로 잇는지 - DB 없이 돌리는 테스트라 글로 봄. */
    @Test
    public void 이어짐() throws Exception {
        String m = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/MountainServlet.java")), StandardCharsets.UTF_8);
        String s = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/Steep.java")), StandardCharsets.UTF_8);
        assertTrue(m.contains("courses = markOff(courses, peak);"));
        // 2 ~ 5km 후보도 Steep.fill(passes) 에 넣고, 정상을 지나는 것만 더함 - markOff 앞(2026-11-21)
        int far = m.indexOf("far.forEach(picked::add);"), fill = m.indexOf("Steep.fill(c, picked,"), add = m.indexOf("courses.addAll(through(far, peak));"), off = m.indexOf("courses = markOff(courses, peak);");
        assertTrue(far > 0 && far < fill && fill < add && add < off);
        assertTrue(s.contains("PASSED.put(id, Peaks.passed(pa, pb, named));") && s.contains("o.add(\"passes\", pa);"));
    }

    /** 페이지가 그리는 데 필요한 칸 - 운영 응답의 course 그대로에 summit_off 만 더함. */
    private static JsonObject courseRow(JsonObject marked) throws Exception {
        JsonObject c = json("src/test/resources/course/summit-off/kmp-2322010655-1.json").getAsJsonObject("course");
        c.add("summit_off", marked.get("summit_off"));
        return c;
    }
}
