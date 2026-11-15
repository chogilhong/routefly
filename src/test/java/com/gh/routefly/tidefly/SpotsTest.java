package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 갯바위 · 선상 자리(2026-11-15 3단계, 홍TV님 "2번으로 해주고 찾기에도 찾아질 수 있도록") - 받은 파일 그대로 · 좌표 바꾸기 · 찾기. */
public class SpotsTest {

    private static String rock() throws Exception {
        return new String(Files.readAllBytes(SpotsBuild.ROCK_CSV), Charset.forName("MS949"));
    }

    private static String boat() throws Exception {
        return new String(Files.readAllBytes(SpotsBuild.BOAT_CSV), Charset.forName("MS949"));
    }

    @Test
    public void spots_json_은_받은_파일로_다시_만든_것과_같음() throws Exception {
        String now = Files.readString(SpotsBuild.OUT, StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertEquals("자리 파일이 바뀌었거나 포인트가 바뀌었으면 tidefly.SpotsBuild 를 다시 돌려 커밋",
                SpotsBuild.spots(Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8), Files.readString(PortsBuild.WRN, StandardCharsets.UTF_8), rock(), boat()), now);
        JsonArray a = JsonParser.parseString(now).getAsJsonArray();
        assertEquals("갯바위 1,076 + 선상 329", 1405, a.size());
        int extra = 0, boats = 0;
        Set<String> names = new java.util.HashSet<>();
        for (JsonElement e : a) {
            JsonObject s = e.getAsJsonObject();
            assertTrue("이름 겹침 " + s, names.add(s.get("name").getAsString()));
            assertTrue(s.toString(), s.get("baseKm").getAsDouble() <= 21);
            if (s.has("extra")) extra++;
            if (s.get("boat").getAsBoolean()) boats++;
        }
        assertEquals(329, boats);
        assertEquals("앞바다 경계선 바깥 · 3km 안이라 먼바다를 더한 자리", 91, extra);
    }

    /** 공간정보(UTM-K) → 위경도가 같은 줄 도분초 칸과 맞는지 - 4곳은 도분초 칸 오타(위도 35 ↔ 34 · 경도 28 ↔ 128 등). */
    @Test
    public void UTMK_를_바꾼_위경도는_도분초_칸과_100m_안() throws Exception {
        int ok = 0, n = 0;
        List<String> off = new ArrayList<>();
        for (int b = 0; b < 2; b++) {
            List<List<String>> rows = PortsBuild.csv(b == 0 ? rock() : boat());
            List<String> h = rows.get(0);
            int iGeo = h.indexOf("공간정보"), iLat = h.indexOf(b == 0 ? "갯바위낚시포인트도분초위도" : "선상낚시포인트도분초위도"),
                    iLon = h.indexOf(b == 0 ? "갯바위낚시포인트경도" : "선상낚시포인트도분초경도"), iName = h.indexOf(b == 0 ? "포인트명" : "포인트명2");
            for (List<String> r : rows.subList(1, rows.size())) {
                double[] xy = SpotsBuild.point(r.get(iGeo));
                double[] ll = SpotsBuild.utmk(xy[0], xy[1]);
                Double lat = SpotsBuild.dms(r.get(iLat)), lon = SpotsBuild.dms(r.get(iLon));
                n++;
                if (Math.abs(ll[0] - lat) * 111_000 < 100 && (lon == null || Math.abs(ll[1] - lon) * 90_000 < 100)) ok++;
                else off.add(r.get(iName).trim());
            }
        }
        assertEquals(1405, n);
        assertEquals(off.toString(), 1401, ok);
        assertTrue(off.toString(), off.containsAll(List.of("복여", "하조도 매동여(낚시배)", "고이도 서측 철탑밑", "대항승선장부근해상")));
    }

    @Test
    public void 작은_순수_함수() {
        assertEquals("참돔 · 농어 · 노래미", SpotsBuild.fish("▶참돔 - 부력/ 잠수▶농어 - 루어/ 릴찌 ▶노래미 - 루어/ 릴찌▶참돔 - 부력"));
        assertEquals("빈칸 없이 붙은 줄(원본 그대로)", "황어 · 무늬오징어", SpotsBuild.fish("▶황어-릴찌/ 루어▶무늬오징어-릴찌/  루어"));
        assertEquals("두 고기를 한 줄에", "농어 · 삼치 · 감성돔", SpotsBuild.fish("▶농어/  삼치 - 루어▶감성돔 - 릴찌"));
        assertEquals(34 + 39 / 60.0 + 41.6 / 3600, SpotsBuild.dms("34-39-41.6N"), 1e-9);
        assertEquals("원본 \"21.8.\" 같은 점 하나 더", 35 + 4 / 60.0 + 21.8 / 3600, SpotsBuild.dms("35-04-21.8.N"), 1e-9);
        assertNull(SpotsBuild.dms(""));
        assertNull(SpotsBuild.point("POINT EMPTY"));
    }

    @Test
    public void 찾기는_이름이_같을_때만() {
        Set<String> names = Set.of("방포항", "신암항", "가의도", "가의도남측해변동측갯바위", "차돌이");
        assertEquals("방포항", TideflyServlet.find("방포항", names));
        assertEquals("뒤에 항", "방포항", TideflyServlet.find("방포", names));
        assertEquals("괄호 · 빈칸", "신암항", TideflyServlet.find(" 신암항(부산) ", names));
        assertEquals("끝의 낚시 · 갯바위", "가의도", TideflyServlet.find("가의도 갯바위 낚시", names));
        assertEquals("가의도남측해변동측갯바위", TideflyServlet.find("가의도 · 남측 해변 동측 갯바위", names));
        assertNull("들어 있기만은 아님(산 찾기를 가로채지 않게)", TideflyServlet.find("가의", names));
        assertNull(TideflyServlet.find("설악산", names));
        assertNull(TideflyServlet.find("낚시", names));
        assertEquals("가의도남측", TideflyServlet.bare("가의도 · 남측(갯바위)"));
    }

    @Test
    public void 코스_모음_찾기는_두_벌_모두_낚시_이름을_물음() throws Exception {
        for (String f : new String[] {"mountain.js", "mountain-en.js"}) {
            String js = Files.readString(java.nio.file.Path.of("src/main/webapp/js", f), StandardCharsets.UTF_8);
            assertTrue(f, js.contains("api/tidefly?find=") && js.contains("tidefly.html?lang=") && js.contains("mSearch.submit()"));
        }
        assertFalse("위치를 보내지 않음 - 자리는 화면이 셈", Files.readString(java.nio.file.Path.of("src/main/webapp/js/tidefly.js"), StandardCharsets.UTF_8).contains("spots=1&lat"));
    }
}
