package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;

import javax.imageio.ImageIO;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산 페이지 맨 위 대표 사진 · 공유 그림 바탕(2026-11-21 홍TV님 "고급지게" 1 · 5번) - data/hero.json. */
public class MountainHeroTest {

    private static final String OK = "{\"src\":\"img/hero/dutasan.jpg\",\"w\":1600,\"h\":1067,\"credit\":\"ⓒ한국관광콘텐츠랩 - 손명권 (공공누리 제1유형)\",\"license\":\"kogl1\"}";

    private static JsonObject peak() {
        return JsonParser.parseString("{\"id\":\"두타산\",\"name\":\"두타산\",\"summit\":\"두타산\",\"lat\":37.4220,\"lon\":129.0033}").getAsJsonObject();
    }

    @Test
    public void 쓸_수_있는_사진만() {
        assertNotNull(MountainServlet.heroOk(JsonParser.parseString(OK)));
        assertNotNull("CC0", MountainServlet.heroOk(JsonParser.parseString(OK.replace("kogl1", "cc0"))));
        assertNull("CC BY-SA 는 잘라 쓸 수 없어 뺌", MountainServlet.heroOk(JsonParser.parseString(OK.replace("kogl1", "cc-by-sa"))));
        assertNull("출처 없음", MountainServlet.heroOk(JsonParser.parseString(OK.replace("ⓒ한국관광콘텐츠랩 - 손명권 (공공누리 제1유형)", " "))));
        assertNull("img/hero/ 밖", MountainServlet.heroOk(JsonParser.parseString(OK.replace("img/hero/dutasan.jpg", "../x.jpg"))));
        assertNull("따옴표 넣기", MountainServlet.heroOk(JsonParser.parseString(OK.replace("dutasan.jpg", "a\\\" onerror=\\\"x.jpg"))));
        assertNull("크기 없음", MountainServlet.heroOk(JsonParser.parseString(OK.replace("\"w\":1600,", ""))));
        assertNull(MountainServlet.heroOk(null));
    }

    @Test
    public void 페이지_맨_위() throws Exception {
        JsonArray peaks = new JsonArray();
        peaks.add(peak());
        JsonObject heroes = new JsonObject();
        heroes.add("두타산", JsonParser.parseString(OK));
        MountainServlet.withHero(peaks, heroes);
        JsonObject p = peaks.get(0).getAsJsonObject();
        String ko = MountainServlet.page(p, new ArrayList<>(), new ArrayList<>(), null, "", 11);
        String fig = "<figure class=\"hero\"><img src=\"../img/hero/dutasan.jpg\" width=\"1600\" height=\"1067\" alt=\"두타산 풍경\" fetchpriority=\"high\" decoding=\"async\">"
                + "<figcaption>사진: ⓒ한국관광콘텐츠랩 - 손명권 (공공누리 제1유형)</figcaption></figure>";
        assertTrue(ko, ko.contains(fig));
        assertTrue("설명 줄 아래", ko.indexOf(fig) > ko.indexOf("<p class=\"lead\">"));
        String en = MountainEn.page(p, new ArrayList<>(), new ArrayList<>(), null, "");
        assertTrue(en.contains("<figure class=\"hero\"><img src=\"../../img/hero/dutasan.jpg\"") && en.contains("<figcaption>Photo: "));
        assertEquals("사진이 없으면 칸 없음", "", MountainServlet.heroBlock(peak(), "..", false));
        // 지금 넣어 둔 사진(PC 가 채움)은 모두 쓸 수 있는 것이고 파일도 있음
        JsonObject all = JsonParser.parseString(new String(Files.readAllBytes(Paths.get("src/main/webapp/data/hero.json")), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonObject("heroes");
        for (String id : all.keySet()) {   // 사진 하나 또는 여러 장(2026-11-21)
            JsonArray list = all.get(id).isJsonArray() ? all.getAsJsonArray(id) : new JsonArray();
            if (!all.get(id).isJsonArray()) list.add(all.get(id));
            assertTrue(id, list.size() >= 1 && list.size() <= 5);
            for (com.google.gson.JsonElement e : list) {
                JsonObject h = MountainServlet.heroOk(e);
                assertNotNull(id, h);
                assertTrue(id, Files.exists(Paths.get("src/main/webapp/" + h.get("src").getAsString())));
            }
        }
        assertTrue(new String(Files.readAllBytes(Paths.get("src/main/webapp/css/mountain.css")), StandardCharsets.UTF_8).contains(".hero img {"));
    }

    @Test
    public void 공유_그림_바탕() throws Exception {
        assertArrayEquals("넓은 사진은 양옆을", new int[] {100, 0, 1200, 630}, OgServlet.cover(1400, 630, 1200, 630));
        assertArrayEquals("높은 사진은 위아래를", new int[] {0, 185, 1200, 630}, OgServlet.cover(1200, 1000, 1200, 630));
        BufferedImage photo = new BufferedImage(1600, 1067, BufferedImage.TYPE_INT_RGB);
        byte[] png = OgServlet.photoJpg(new String[] {"Dutasan", "Korea's 100 Famous Mountains · 1,353 m", "x"}, new String[] {"Dutasan", "x", "x"}, photo, "KOGL Type 1");
        BufferedImage out = ImageIO.read(new ByteArrayInputStream(png));
        assertEquals(1200, out.getWidth());
        assertEquals(630, out.getHeight());
        assertTrue("사진 바탕은 jpg(가볍게 - 2026-11-21 PC: png 1.4MB)", OgServlet.jpeg(png));
        // 한글 글꼴이 없는 서버(2026-11-21 운영)에서 한글 출처는 그리지 않음 - 네모 글자 그림 대신 예전 그림
        assertTrue(OgServlet.creditOk("Malgun Gothic", "ⓒ한국관광콘텐츠랩 - 김지호 (공공누리 제1유형)"));
        assertFalse(OgServlet.creditOk(null, "ⓒ한국관광콘텐츠랩 - 김지호 (공공누리 제1유형)"));
        assertTrue(OgServlet.creditOk(null, "Choi Kwang-mo, CC0"));
        byte[] old = OgServlet.photoJpg(new String[] {"a", "b", "c"}, new String[] {"a", "b", "c"}, null, "x");
        assertTrue("사진을 못 읽으면 예전 그림(png)", old.length > 0 && !OgServlet.jpeg(old));
    }

    @Test
    public void 여러_장_무작위() {   // 2026-11-21 홍TV님 "3~5개를 놓고 랜덤으로 보이면" - 진행해
        String b = OK.replace("dutasan.jpg", "dutasan-2.jpg").replace("손명권", "김지호");
        String bad = OK.replace("dutasan.jpg", "dutasan-3.jpg").replace("kogl1", "cc-by-sa");
        JsonArray peaks = new JsonArray();
        peaks.add(peak());
        JsonObject heroes = new JsonObject();
        heroes.add("두타산", JsonParser.parseString("[" + OK + "," + bad + "," + b + "]"));
        MountainServlet.withHero(peaks, heroes);
        JsonObject p = peaks.get(0).getAsJsonObject();
        assertEquals("쓸 수 있는 것만(CC BY-SA 뺌)", 2, p.getAsJsonArray("heroes").size());
        assertEquals("공유 그림은 첫 장", "img/hero/dutasan.jpg", p.getAsJsonObject("hero").get("src").getAsString());
        String two = MountainServlet.heroBlock(p, "..", false, 1);
        assertTrue("고른 사진의 출처", two.contains("src=\"../img/hero/dutasan-2.jpg\"") && two.contains("<figcaption>사진: ⓒ한국관광콘텐츠랩 - 김지호 (공공누리 제1유형)</figcaption>"));
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < 200; i++) seen.add(MountainServlet.heroBlock(p, "..", false).replaceAll("(?s).*src=\"\\.\\./(img/hero/[^\"]+)\".*", "$1"));
        assertEquals("열 때마다 둘 가운데 하나", java.util.Set.of("img/hero/dutasan.jpg", "img/hero/dutasan-2.jpg"), seen);
        JsonArray none = new JsonArray();
        none.add(peak());
        JsonObject h2 = new JsonObject();
        h2.add("두타산", JsonParser.parseString("[" + bad + "]"));
        MountainServlet.withHero(none, h2);
        assertEquals("", MountainServlet.heroBlock(none.get(0).getAsJsonObject(), "..", false));
    }
}
