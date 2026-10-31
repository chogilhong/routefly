package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

/** 내 기록 → 코스로 올리기(2026-10-31 홍TV님). GPX 는 routefly "GPX 보내기" 모양(hike.js toGpx), 좌표는 테스트 데이터. */
public class CourseUploadTest {

    private static String rec(int n, boolean ele) {
        StringBuilder sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<gpx version=\"1.1\" creator=\"routefly\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n"
                + "<metadata><name>시험</name><time>2026-10-31T03:40:03.921Z</time></metadata>\n"
                + "<wpt lat=\"37.5\" lon=\"127.0\"><time>2026-10-31T03:41:00Z</time><name>사진</name></wpt>\n<trk><name>시험</name><type>hike</type><trkseg>\n");
        for (int i = 0; i < n; i++) sb.append("<trkpt lat=\"").append(37.5 + i * 0.0005).append("\" lon=\"127.0\">").append(ele ? "<ele>" + (100 + i) + "</ele>" : "")
                .append("<time>2026-10-31T03:40:0").append(i % 10).append("Z</time></trkpt>\n");
        return sb.append("</trkseg></trk>\n</gpx>\n").toString();
    }

    @Test
    public void pointsOnlyNoTimeNoPhoto() {
        List<double[]> p = CourseUploadServlet.points(rec(20, true));
        assertEquals("wpt(사진 자리)는 점이 아님", 20, p.size());
        assertEquals(37.5, p.get(0)[0], 1e-9);
        assertEquals(100, p.get(0)[2], 1e-9);
        assertTrue(Double.isNaN(CourseUploadServlet.points(rec(12, false)).get(0)[2]));
        assertEquals("속성 순서 · 빈 태그", 1, CourseUploadServlet.points("<trkpt lon=\"127.1\" lat=\"37.2\"/>").size());
        String out = CourseUploadServlet.gpx("송산 · 마을회관 → 정상", "hike", p);
        assertFalse("시각은 남기지 않음", out.contains("<time>"));
        assertFalse("사진 · 메모 자리도", out.contains("<wpt"));
        assertTrue(out.contains("<name>송산 · 마을회관 → 정상</name><type>hike</type>"));
        assertEquals(20, CourseUploadServlet.points(out).size());
    }

    @Test
    public void checks() {
        List<double[]> ok = CourseUploadServlet.points(rec(20, true));   // 20점 · 약 1km
        assertNull(CourseUploadServlet.check("송산 · 마을회관 → 정상", "hike", ok));
        assertNotNull("이름 짧음", CourseUploadServlet.check("송", "hike", ok));
        assertNotNull("쓸 수 없는 글자", CourseUploadServlet.check("<script>", "hike", ok));
        assertNotNull("종류", CourseUploadServlet.check("송산 정상", "ski", ok));
        assertNotNull("점 적음", CourseUploadServlet.check("송산 정상", "hike", CourseUploadServlet.points(rec(5, true))));
        assertNotNull("짧음(300m 미만)", CourseUploadServlet.check("송산 정상", "hike", CourseUploadServlet.points(rec(10, true)).subList(0, 10).stream().map(x -> new double[] {37.5 + (x[0] - 37.5) / 10, 127.0, x[2]}).toList()));
        assertNotNull("한국 밖", CourseUploadServlet.check("송산 정상", "hike", CourseUploadServlet.points(rec(20, true).replace("lon=\"127.0\"", "lon=\"140.0\""))));
    }
}
