package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 코스 출처 · 만든 이 한 줄(2026-11-01 홍TV님 "코스 이름은 깨끗하게, 만든 이는 코스 화면에 따로"). 이름은 테스트 데이터(시험대장 · 시험산악회). */
public class CourseSourceTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static JsonObject made(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }

    @Test
    public void prefixToSource() {
        String[][] want = {
            {"knps-7013", "국립공원공단", "Korea National Park Service"},
            {"frst-287201304-c23fa6", "산림청", "Korea Forest Service"},
            {"drnb-1", "한국관광공사 두루누비", "Korea Tourism Organization Durunubi"},
            {"kmp-1", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"},
            {"kmf-9", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"},
            {"osmh-7", "OpenStreetMap", "OpenStreetMap"},
            {"osmb-6-1", "OpenStreetMap", "OpenStreetMap"},
            {"osmgap-1", "OpenStreetMap", "OpenStreetMap"},
        };
        for (String[] w : want) {
            JsonObject s = CourseSource.of(w[0], null);
            assertEquals(w[0], "source", s.get("kind").getAsString());
            assertEquals(w[0], w[1], s.get("text").getAsString());
            assertEquals(w[0], w[2], s.get("en").getAsString());
            assertFalse(s.get("checked").getAsBoolean());
        }
        assertNull("모르는 앞부분은 줄 없음", CourseSource.of("abc-1", null));
        assertNull(CourseSource.of(null, null));
        assertEquals("출처: 국립공원공단", CourseSource.line(CourseSource.of("knps-1", null), false));
        assertEquals("Source: Korea Forest Service", CourseSource.line(CourseSource.of("frst-1", null), true));
        assertEquals("", CourseSource.line(null, false));
    }

    @Test
    public void uploadedMaker() {
        JsonObject s = CourseSource.of("u-20261101-120000", made("{\"maker\":\"시험대장\",\"at\":1}"));
        assertEquals("maker", s.get("kind").getAsString());
        assertEquals("시험대장", s.get("text").getAsString());
        assertTrue(s.get("checked").getAsBoolean());
        assertEquals("만든 이: 시험대장 (routefly 점검)", CourseSource.line(s, false));
        assertEquals("Made by: 시험대장 (checked by routefly)", CourseSource.line(s, true));
        assertEquals("보낸 사람 없음 = 홍TV님이 만든 코스", "만든 이: routefly", CourseSource.line(CourseSource.of("u-20261101-120000", made("{\"maker\":\"\",\"at\":1}")), false));
        assertEquals("만든 이 기록이 없는 옛 올림도 routefly", "만든 이: routefly", CourseSource.line(CourseSource.of("u-20261031-090000", null), false));
        JsonObject p = CourseSource.of("u-20261101-120000", made("{\"maker\":\"시험산악회\",\"at\":1,\"partner\":true}"));
        assertTrue(p.get("partner").getAsBoolean());
        assertEquals("나중의 제휴 산악회", "만든 이: 시험산악회 [제휴]", CourseSource.line(p, false));
        assertEquals("Made by: 시험산악회 [Partner]", CourseSource.line(p, true));
    }

    @Test
    public void makerStoreRoundTrip() throws Exception {
        Path f = tmp.getRoot().toPath().resolve("data/course-makers.json");
        CourseMakers a = new CourseMakers(f);
        assertNull("파일이 없으면 빈 것", a.get("u-1"));
        a.put("u-20261101-120000", "시험대장", 1000L);
        a.put("u-20261101-130000", "", 2000L);
        assertTrue(Files.isRegularFile(f));
        assertFalse("임시 파일은 옮겨짐", Files.exists(f.resolveSibling("course-makers.json.tmp")));
        try { assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(f))); }
        catch (UnsupportedOperationException e) { /* 윈도우 */ }
        CourseMakers b = new CourseMakers(f);   // 다시 읽기
        assertEquals("시험대장", b.get("u-20261101-120000").get("maker").getAsString());
        assertEquals(1000L, b.get("u-20261101-120000").get("at").getAsLong());
        assertEquals("", b.get("u-20261101-130000").get("maker").getAsString());
        b.get("u-20261101-120000").addProperty("maker", "바뀜");
        assertEquals("사본을 줌", "시험대장", b.get("u-20261101-120000").get("maker").getAsString());
        Files.writeString(f, "{깨짐", StandardCharsets.UTF_8);
        assertNull("깨진 파일은 빈 것으로(웹은 그대로 돎)", new CourseMakers(f).get("u-20261101-120000"));
    }

    @Test
    public void uploadKeepsMakerOutOfName() throws Exception {
        File dir = tmp.newFolder("inbox");
        CourseMakers makers = new CourseMakers(tmp.getRoot().toPath().resolve("makers/course-makers.json"));
        List<double[]> pts = new ArrayList<>();
        for (int i = 0; i < 20; i++) pts.add(new double[] {37.5 + i * 0.0005, 127.0, 100 + i});
        long now = java.time.ZonedDateTime.of(2026, 11, 1, 12, 0, 0, 0, java.time.ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        String id = CourseUploadServlet.save(dir, "북한산 숨은벽 · 밤골 → 백운대 → 우이동", "hike", pts, "시험대장", makers, now);
        assertEquals("u-20261101-120000", id);
        String gpx = Files.readString(new File(dir, "hike/" + id + ".gpx").toPath(), StandardCharsets.UTF_8);
        assertTrue("이름은 깨끗하게(만든 이 없음)", gpx.contains("<name>북한산 숨은벽 · 밤골 → 백운대 → 우이동</name>") && !gpx.contains("시험대장"));
        assertEquals("만든 이: 시험대장 (routefly 점검)", CourseSource.line(CourseSource.of(id, makers.get(id)), false));
        assertNull("같은 번호면 null", CourseUploadServlet.save(dir, "북한산 숨은벽", "hike", pts, "", makers, now));
        assertEquals("다듬기 - 꺾쇠 · 따옴표는 빈칸으로", "a b", CourseSubmitServlet.clean("a<\"b"));
    }

    @Test
    public void apiAndPagesShowLine() {
        JsonObject d = new JsonObject(), c = new JsonObject();
        c.addProperty("course_id", "knps-7013");
        d.add("course", c);
        CourseServlet.addSource(d, "knps-7013");
        assertEquals("국립공원공단", d.getAsJsonObject("course").getAsJsonObject("source").get("text").getAsString());
        JsonObject u = new JsonObject();
        u.add("course", new JsonObject());
        CourseServlet.addSource(u, "abc-1");
        assertFalse("모르는 코스는 칸 없음", u.getAsJsonObject("course").has("source"));
        JsonObject gap = CourseServlet.gapDetail(made("{\"id\":\"osmgap-1\",\"name\":\"북한산 · 숨은벽 → 백운대\",\"coords\":[[126.98,37.66,500],[126.981,37.661,520]]}"));
        CourseServlet.addSource(gap, "osmgap-1");
        assertEquals("빈 구간도 OpenStreetMap", "OpenStreetMap", gap.getAsJsonObject("course").getAsJsonObject("source").get("text").getAsString());
        assertEquals("맨 위 OSM 표시 글은 그대로", "© OpenStreetMap contributors", gap.get("source").getAsString());

        assertEquals("<small class=\"made\">출처: 국립공원공단</small>", MountainServlet.madeLine("knps-1", false));
        assertEquals("<small class=\"made\">Source: Korea Hiking &amp; Trekking Support Center</small>", MountainServlet.madeLine("kmp-1", true));
        assertEquals("", MountainServlet.madeLine("abc-1", false));

        JsonObject k = new JsonObject();
        k.addProperty("course_id", "frst-1-a");
        k.addProperty("name", "북한산 · 우이동 → 백운대");
        k.addProperty("kind", "hike");
        k.addProperty("distance_m", 3980);
        k.addProperty("start_lat", 35.80); k.addProperty("start_lon", 128.09); k.addProperty("end_lat", 35.8233); k.addProperty("end_lon", 128.1204);
        String html = CoursePageServlet.page(k, null, null, null, null, new com.google.gson.JsonArray(), false, "https://r.kr");
        assertTrue("코스 소개 페이지 부제 아래", html.contains("<p class=\"dim made\">출처: 산림청</p>"));
        assertTrue(html.indexOf("class=\"dim made\"") > html.indexOf("class=\"lead\""));
        JsonObject gaya = made("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.822544,\"lon\":128.122849}");
        k.addProperty("course_id", "knps-7013");
        assertTrue("산 페이지 코스 카드", MountainServlet.page(gaya, List.of(k), List.of(), null, "https://r.kr").contains("<small class=\"made\">출처: 국립공원공단</small>"));
        assertTrue("영어 산 페이지", MountainEn.page(gaya, List.of(k), List.of(), null, "https://r.kr").contains("<small class=\"made\">Source: Korea National Park Service</small>"));
    }
}
