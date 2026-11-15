package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonParser;

/** API허브 글 읽기 · ○ / △ / ✕ 판단 - 2026-11-14 받아 둔 실제 응답(src/test/resources/apihub)으로. */
public class SeaDataTest {

    private static String res(String f) throws Exception {
        return Files.readString(Path.of("src", "test", "resources", "tidefly", "apihub", f), StandardCharsets.UTF_8);
    }

    @Test
    public void 소해구_예측_오늘_자료는_너울까지_읽음() throws Exception {
        SeaForecast f = SeaForecast.parse(res("marine-small-today.txt"));
        assertEquals("2026111400", f.tmFc());
        assertEquals("2026111500", f.tmEf());
        assertEquals(1, f.lzone());
        assertEquals(1, f.szone());
        assertEquals(0.2, f.waveM(), 1e-9);
        assertEquals(7.0, f.windMs(), 1e-9);
        assertEquals(12250.0, f.visM(), 1e-9);
        assertEquals(7.7, f.waterC(), 1e-9);
        assertEquals(Integer.valueOf(1), f.swell());
    }

    @Test
    public void 소해구_예측_2025년_자료는_너울_칸이_없어_null() throws Exception {
        SeaForecast f = SeaForecast.parse(res("marine-small.txt"));
        assertEquals(0.1, f.waveM(), 1e-9);
        assertNull(f.swell());
        assertNull(f.visM());
    }

    @Test
    public void 잘못된_해구는_HTTP_200_이어도_자료_없음() throws Exception {
        assertNull(SeaForecast.parse(res("marine-small-L1-S10.txt")));
        assertNull(SeaForecast.parse(res("marine-small-all.txt")));
        assertNull(KmaText.rows(null));
        // 칸 수로 걸러지기 전에 첫 줄로 먼저 가림(안내 글을 자료 줄로 읽지 않게)
        assertNull(KmaText.rows(res("marine-small-L1-S10.txt")));
        assertNull(KmaText.rows(res("marine-small-all.txt")));
        assertEquals(1, KmaText.rows(res("marine-small-today.txt")).size());
    }

    @Test
    public void 특보는_쉼표_줄을_읽고_해상만() throws Exception {
        List<SeaWarning> w = SeaWarning.parse(res("wrn-now.txt"));
        assertEquals(1, w.size());
        SeaWarning a = w.get(0);
        assertEquals("S1250000", a.regUp());
        assertEquals("S1252020", a.regId());
        assertEquals("서해중부바깥먼바다", a.regKo());
        assertEquals("202611151758", a.tmEf());
        assertEquals("풍랑", a.kind());
        assertTrue(a.prelim());
        assertEquals("발표", a.cmd());
    }

    @Test
    public void 해상_관측_빈_값_99_는_null() throws Exception {
        List<String[]> rows = KmaText.rows(res("sea-obs-today.txt"));
        assertEquals(188, rows.size());
        String[] r = rows.stream().filter(f -> f[2].equals("22511")).findFirst().get();   // 기장 - 유의파고 -99.0
        assertNull(KmaText.num(r, 6));
        assertEquals(5.3, KmaText.num(r, 8), 1e-9);
    }

    private static SeaForecast sea(Integer swell) {
        return new SeaForecast("2026111400", "2026111500", 1, 1, 0.5, 4.0, 100.0, 5.0, 90.0, null, null, null, swell);
    }

    @Test
    public void 판단_특보_예비_너울() throws Exception {
        List<SeaWarning> w = SeaWarning.parse(res("wrn-now.txt"));   // 서해중부바깥먼바다 풍랑 예비
        List<String> here = List.of("S1252020");
        List<String> other = List.of("S1323100");

        assertEquals(Verdict.OK, Verdict.judge(false, other, w, sea(1)).mark());
        Verdict v = Verdict.judge(false, here, w, sea(1));
        assertEquals(Verdict.CARE, v.mark());
        assertEquals(List.of("서해중부바깥먼바다 풍랑 예비특보"), v.reasons());
        // 상위 구역 코드로 짝을 지어도 걸림
        assertEquals(Verdict.CARE, Verdict.judge(false, List.of("S1250000"), w, sea(null)).mark());

        assertEquals(Verdict.CARE, Verdict.judge(false, other, w, sea(2)).mark());
        assertEquals(Verdict.NO, Verdict.judge(false, other, w, sea(3)).mark());
        assertEquals(List.of("너울 위험"), Verdict.judge(false, other, w, sea(4)).reasons());

        SeaWarning real = new SeaWarning("S1250000", "S1252020", "서해중부바깥먼바다", "202611141600", "202611151758", "풍랑", "주의보", "발표");
        assertEquals(Verdict.NO, Verdict.judge(false, here, List.of(real), sea(1)).mark());
    }

    @Test
    public void 짝이_없거나_자료를_못_받으면_판단하지_않음_선상은_선사_확인() throws Exception {
        List<SeaWarning> w = SeaWarning.parse(res("wrn-now.txt"));
        assertNull(Verdict.judge(false, null, w, sea(1)).mark());
        assertNull(Verdict.judge(false, List.of(), w, sea(1)).mark());
        assertNull(Verdict.judge(false, List.of("S1252020"), null, sea(1)).mark());
        assertNull(Verdict.judge(false, List.of("S1252020"), w, null).mark());
        assertEquals(List.of("특보구역 연결 확인 전 - 판단하지 않음", "출항은 선사에 확인"), Verdict.judge(true, null, w, sea(1)).reasons());
    }

    @Test
    public void 물어볼_발표_발효_시각() {
        List<String[]> t = TideflyServlet.times(ZonedDateTime.of(2026, 11, 14, 14, 10, 0, 0, ZoneOffset.UTC));
        assertEquals("2026111412", t.get(0)[0]);
        assertEquals("2026111415", t.get(0)[1]);   // 14:10 → 가까운 3시간 15시
        assertEquals("2026111400", t.get(1)[0]);
        assertEquals("2026111412", TideflyServlet.times(ZonedDateTime.of(2026, 11, 14, 13, 20, 0, 0, ZoneOffset.UTC)).get(0)[1]);
        assertEquals("2026111415", TideflyServlet.times(ZonedDateTime.of(2026, 11, 14, 13, 40, 0, 0, ZoneOffset.UTC)).get(0)[1]);
        List<String[]> m = TideflyServlet.times(ZonedDateTime.of(2026, 11, 15, 0, 5, 0, 0, ZoneOffset.UTC));
        assertEquals("2026111500", m.get(0)[0]);
        assertEquals("2026111412", m.get(1)[0]);
    }

    @Test
    public void 특보구역_짝은_비었으면_없음으로() {
        var regs = JsonParser.parseString("{\"김녕\":[\"S1323100\"],\"빈곳\":[]}").getAsJsonObject();
        assertEquals(List.of("S1323100"), TideflyServlet.regIds(regs, "김녕"));
        assertNull(TideflyServlet.regIds(regs, "빈곳"));
        assertNull(TideflyServlet.regIds(regs, "없음"));
    }

    @Test
    public void 목록은_북쪽부터() {
        var a = JsonParser.parseString("{\"name\":\"서귀포\",\"lat\":33.2}").getAsJsonObject();
        var b = JsonParser.parseString("{\"name\":\"거진\",\"lat\":38.4}").getAsJsonObject();
        var c = JsonParser.parseString("{\"name\":\"포항\",\"lat\":36.1}").getAsJsonObject();
        var out = TideflyServlet.sorted(List.of(a, b, c));
        assertEquals("거진", out.get(0).get("name").getAsString());
        assertEquals("서귀포", out.get(2).get("name").getAsString());
    }


    @Test
    public void 물때_실제_응답_군산() throws Exception {
        Tide t = Tide.parse(Files.readString(Path.of("src", "test", "resources", "tidefly", "portal", "hghlw-DT_0018-20261114.json"), StandardCharsets.UTF_8));
        assertEquals("군산", t.station());
        assertEquals(4, t.events().size());
        assertEquals("2026-11-14 00:00", t.events().get(0).t());
        assertEquals(false, t.events().get(0).high());   // extrSe 2 오전 저조
        assertEquals(176.0, t.events().get(0).cm(), 1e-9);
        assertEquals(true, t.events().get(1).high());    // extrSe 1 오전 고조 05:30
        assertEquals(true, t.events().get(3).high());    // extrSe 3 오후 고조 18:02
        assertEquals(612.0, t.events().get(3).cm(), 1e-9);
        assertNull(Tide.parse("{\"header\":{\"resultCode\":\"10\"}}"));
        assertEquals(0, Tide.parse("{\"header\":{\"resultCode\":\"03\"}}").events().size());
        assertNull(Tide.parse("<OpenAPI_ServiceResponse>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</OpenAPI_ServiceResponse>"));
        assertEquals(TideflyServlet.TIDE_URL + "?type=json&pageNo=1&numOfRows=20&obsCode=DT_0018&reqDate=20261114",
                TideflyServlet.tideUrl("DT_0018", java.time.LocalDate.of(2026, 11, 14)));
    }

    @Test
    public void 물때_오늘_내일_합치기() throws Exception {
        Tide today = Tide.parse(Files.readString(Path.of("src", "test", "resources", "tidefly", "portal", "hghlw-DT_0018-20261114.json"), StandardCharsets.UTF_8));
        Tide tomorrow = new Tide("군산", List.of(new Tide.Event("2026-11-15 06:10", 520.0, true), new Tide.Event("2026-11-15 00:40", 190.0, false)));
        Tide j = Tide.join(tomorrow, today);
        assertEquals(6, j.events().size());
        assertEquals("2026-11-14 00:00", j.events().get(0).t());
        assertEquals("2026-11-15 06:10", j.events().get(5).t());
        assertEquals("군산", j.station());
        assertEquals(today, Tide.join(today, null));
        assertEquals(tomorrow, Tide.join(null, tomorrow));
        assertNull(Tide.join(null, null));
    }

    @Test
    public void 높이_차와_물_세기() throws Exception {
        Tide t = Tide.parse(Files.readString(Path.of("src", "test", "resources", "tidefly", "portal", "hghlw-DT_0018-20261114.json"), StandardCharsets.UTF_8));
        // 군산 14일: 176 → 539 → 111 → 612, 이어진 만조 · 간조 차 363 · 428 · 501
        assertEquals(501.0, Tide.range(t.events()), 1e-9);
        assertEquals(0.0, Tide.range(List.of()), 1e-9);
        // 같은 종류가 이어지면(간조 · 간조) 그 사이는 세지 않음 - 만조 · 간조 사이만
        assertEquals(20.0, Tide.range(List.of(new Tide.Event("2026-11-14 01:00", 10.0, false), new Tide.Event("2026-11-14 07:00", 400.0, false),
                new Tide.Event("2026-11-14 13:00", 420.0, true))), 1e-9);
        assertEquals(Integer.valueOf(50), Tide.flowPct(250, List.of(250.0, 400.0, 500.0)));
        assertEquals(Integer.valueOf(100), Tide.flowPct(500, List.of(500.0, 300.0)));
        assertNull(Tide.flowPct(0, List.of(500.0)));
        assertNull(Tide.flowPct(100, List.of(0.0)));
    }

    @Test
    public void 세_시간_예보_시각() {
        List<String> t = TideflyServlet.hourlyTimes("2026111412", ZonedDateTime.of(2026, 11, 14, 15, 10, 0, 0, ZoneOffset.UTC));
        assertEquals("2026111415", t.get(0));
        assertEquals("2026111418", t.get(1));
        assertEquals(25, t.size());                       // 15시부터 72시간 뒤(17일 15시)까지
        assertEquals("2026111715", t.get(24));
        // 발표 + 75시간을 넘지 않음: 00시 발표를 15시에 쓰면 17일 03시까지
        List<String> old = TideflyServlet.hourlyTimes("2026111400", ZonedDateTime.of(2026, 11, 14, 15, 10, 0, 0, ZoneOffset.UTC));
        assertEquals("2026111703", old.get(old.size() - 1));
    }

    @Test
    public void 물때_파일로_남기고_다시_읽기_지난_날_지우기() throws Exception {
        Path dir = Files.createTempDirectory("tidefly-tide-test");
        Tide t = Tide.parse(Files.readString(Path.of("src", "test", "resources", "tidefly", "portal", "hghlw-DT_0018-20261114.json"), StandardCharsets.UTF_8));
        java.time.LocalDate d = java.time.LocalDate.of(2026, 11, 14);
        TideflyServlet.saveTide(dir, "DT_0018", d, t);
        assertEquals(t, TideflyServlet.readTide(dir, "DT_0018", d));                 // F5 뒤에도 같은 물때
        assertNull(TideflyServlet.readTide(dir, "DT_0018", d.plusDays(1)));
        TideflyServlet.saveTide(dir, "DT_0018", d.plusDays(1), new Tide("군산", List.of()));   // 빈 날은 남기지 않음
        assertNull(TideflyServlet.readTide(dir, "DT_0018", d.plusDays(1)));
        try (var f = Files.list(dir)) {
            assertEquals(1, f.count());                                            // 빈 날 파일은 생기지 않음
        }
        TideflyServlet.saveTide(dir, "../x", d, t);                                    // 이상한 지점 이름은 쓰지 않음
        assertNull(TideflyServlet.readTide(dir, "../x", d));
        assertEquals(0, TideflyServlet.dropOldTides(dir, d.plusDays(1)));               // 어제 것은 남김
        assertEquals(1, TideflyServlet.dropOldTides(dir, d.plusDays(2)));
        assertNull(TideflyServlet.readTide(dir, "DT_0018", d));
    }
}
