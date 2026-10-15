package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.Set;

import javax.imageio.ImageIO;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산마다 공유 그림(/og/m/설악산.png - 2026-10-15). */
public class OgServletTest {

    private static final JsonObject SEORAK = JsonParser.parseString("{\"id\":\"설악산\",\"name\":\"설악산\",\"summit\":\"대청봉\",\"height\":1708,\"lat\":38.1,\"lon\":128.4}").getAsJsonObject();

    @Test
    public void lines() {
        assertArrayEquals(new String[] {"설악산", "산림청 100대 명산 · 정상 대청봉 · 1,708m", "등산코스 · 날씨 · 일출 일몰 · 3D 미리보기"}, OgServlet.korean(SEORAK));
        assertArrayEquals(new String[] {"Seoraksan", "Korea's 100 Famous Mountains · Daecheongbong · 1,708 m", "Hiking trails · Weather · Sunrise · 3D preview"}, OgServlet.english(SEORAK));
        assertEquals("정상이 산 이름과 같으면 빼고", "산림청 100대 명산 · 1,037m",
                OgServlet.korean(JsonParser.parseString("{\"id\":\"가리산\",\"name\":\"가리산\",\"summit\":\"가리산\",\"height\":1037}").getAsJsonObject())[1]);
        assertNull("한글 글꼴이 없으면 null(영어로 그림)", OgServlet.fontFor("설악산", Set.of("DejaVu Sans")));
    }

    @Test
    public void drawsPng() throws Exception {
        System.setProperty("java.awt.headless", "true");
        byte[] png = OgServlet.png(OgServlet.korean(SEORAK), OgServlet.english(SEORAK), null);
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(png));
        assertEquals(1200, img.getWidth());
        assertEquals(630, img.getHeight());
    }

    @Test
    public void pagesPointToIt() {
        String ko = MountainServlet.page(SEORAK, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "https://r.kr");
        assertTrue(ko.contains("<meta property=\"og:image\" content=\"https://r.kr/og/m/%EC%84%A4%EC%95%85%EC%82%B0.png\">"));
        String en = MountainEn.page(SEORAK, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "https://r.kr");
        assertTrue(en.contains("<meta property=\"og:image\" content=\"https://r.kr/og/en/seoraksan.png\">"));
    }
}
