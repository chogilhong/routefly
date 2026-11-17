package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/** dronefly 문화재보호구역(2026-11-17 홍TV님 "문화재보호구역도 넣어줘") - 고정 칸 · WFS 주소 · 실제 응답 읽기. */
public class HeritageServletTest {

    @Test
    public void 고정_칸만_받음() {
        assertTrue(HeritageServlet.cell("126.9", "37.5", "127.0", "37.6") != null);
        assertNull("칸 크기가 다름", HeritageServlet.cell("126.9", "37.5", "127.1", "37.6"));
        assertNull("격자에 안 맞음 - 내 위치를 그대로 보내지 못하게", HeritageServlet.cell("126.97", "37.56", "127.07", "37.66"));
        assertNull("우리나라 밖", HeritageServlet.cell("140.0", "37.5", "140.1", "37.6"));
        assertNull(HeritageServlet.cell("x", "37.5", "127.0", "37.6"));
        assertEquals("1269,375", HeritageServlet.key(HeritageServlet.cell("126.9", "37.5", "127.0", "37.6")));
    }

    @Test
    public void 주소와_도메인() {
        String u = HeritageServlet.url("K", "routefly.kr", new double[] {126.9, 37.5, 127.0, 37.6});
        assertTrue(u, u.startsWith("https://api.vworld.kr/req/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=lt_c_uo301&srsname=EPSG:4326&output=application/json&bbox=37.5,126.9,37.6,127.0&key=K&domain=routefly.kr"));
        assertEquals("routefly.kr", HeritageServlet.domain(null));   // 빼면 INCORRECT_KEY(2026-11-17 PC)
        assertEquals("routefly.kr", HeritageServlet.domain("https://routefly.kr/routefly"));
    }

    /** 2026-11-17 PC 가 받은 lt_c_uo301 WFS(전국 상자, 20,379 중 1,000). */
    @Test
    public void 실제_응답_읽기() throws Exception {
        JsonObject o = HeritageServlet.parse(Files.readString(Path.of("src/test/resources/drone/wfs-lt_c_uo301-kr.json"), StandardCharsets.UTF_8));
        assertEquals(1000, o.getAsJsonArray("zones").size());
        assertTrue("1000곳에서 잘림을 알림", o.get("partial").getAsBoolean());
        assertEquals("[\"역사문화환경보존지역\",\"전북특별자치도\",\"전주시\"]", o.getAsJsonArray("zones").get(0).getAsJsonObject().get("l").toString());
        // 줄이기(약 2m) - 받은 글보다 훨씬 작게(2026-11-17 PC: 서울 칸 5.7MB 로 메모리 걱정, 운영 톰캣 768MB)
        String raw = Files.readString(Path.of("src/test/resources/drone/wfs-lt_c_uo301-kr.json"), StandardCharsets.UTF_8);
        assertTrue(o.toString().length() + " / " + raw.length(), o.toString().length() * 3 < raw.length());
        assertNull("오류 XML 은 null", HeritageServlet.parse(Files.readString(Path.of("src/test/resources/drone/err-incorrect-key.json"), StandardCharsets.UTF_8).replace("{", "<")));
    }
}
