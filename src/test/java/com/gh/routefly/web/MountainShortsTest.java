package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산 페이지 ▶ 이 산 이야기(유튜브 쇼츠) - data/shorts.json(홍TV님이 올린 영상 주소, 2026-11-19). */
public class MountainShortsTest {

    private static JsonObject json(String path) throws Exception {
        return JsonParser.parseString(new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    @Test
    public void 산_페이지에_쇼츠() throws Exception {
        JsonObject videos = json("src/main/webapp/data/shorts.json").getAsJsonObject("videos");
        JsonArray peaks = json("src/main/webapp/data/mountains100.json").getAsJsonArray("peaks");
        // shorts.json 의 산 이름은 모두 mountains100.json 의 id(틀리면 칸이 안 붙음)
        for (String id : videos.keySet()) {
            boolean found = false;
            for (JsonElement e : peaks) found |= id.equals(e.getAsJsonObject().get("id").getAsString());
            assertTrue(id, found);
        }
        // 2판(Vrew · 밝은 판)으로 다시 올린 영상(2026-11-20 - docs/youtube/v2/): 계룡산 Elzwl8pQ8vQ(아래) · 공작산 dHGzzqRUsCE · 금산 eWfqp97Uwco · 가리왕산 bFC_tTjoaFA · 명성산 Vq2UPp31dtM · 용문산 wyo-8TdOXsQ · 강천산 icz6CCy-hBE · 오봉산 VwPdgUtgg0g · 칠갑산 cAi60TLaI_w · 오대산 DbQOtOK3rnk · 적상산 GKlusMikJvI · 지리산 s9D8pcz0RvY
        assertEquals("dHGzzqRUsCE", videos.getAsJsonArray("공작산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("eWfqp97Uwco", videos.getAsJsonArray("금산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("bFC_tTjoaFA", videos.getAsJsonArray("가리왕산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("Vq2UPp31dtM", videos.getAsJsonArray("명성산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("wyo-8TdOXsQ", videos.getAsJsonArray("용문산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("icz6CCy-hBE", videos.getAsJsonArray("강천산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("VwPdgUtgg0g", videos.getAsJsonArray("오봉산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("cAi60TLaI_w", videos.getAsJsonArray("칠갑산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("DbQOtOK3rnk", videos.getAsJsonArray("오대산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("GKlusMikJvI", videos.getAsJsonArray("적상산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("R8yW3K7rDvk", videos.getAsJsonArray("두타산").get(0).getAsJsonObject().get("id").getAsString());   // 새 산(2026-11-21)
        assertEquals("nc2cHCHNr_k", videos.getAsJsonArray("백운산(정선)").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("n2BHPYH3QXQ", videos.getAsJsonArray("주왕산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("s9D8pcz0RvY", videos.getAsJsonArray("지리산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("JkNWEU9SGgM", videos.getAsJsonArray("대암산").get(0).getAsJsonObject().get("id").getAsString());   // 2026-11-22 새 산
        assertEquals("nqLq_YegQXk", videos.getAsJsonArray("재약산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("NowM2MZfCDI", videos.getAsJsonArray("태백산").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject tb = new JsonObject();
        tb.add("shorts", videos.getAsJsonArray("태백산"));
        String th = MountainServlet.shortsBlock(tb, false);
        assertTrue(th, th.contains("<p class=\"hook\">산꼭대기에서 하늘에 제사를 지낸다!</p><p>천제단 · 주목 · 망경사 - 그 이야기를 2분 28초 영상에 담았습니다.</p>"));
        assertEquals("hm56jt5CDpc", videos.getAsJsonArray("화왕산").get(0).getAsJsonObject().get("id").getAsString());   // 2026-11-24
        JsonObject hw = new JsonObject();
        hw.add("shorts", videos.getAsJsonArray("화왕산"));
        String hh = MountainServlet.shortsBlock(hw, false);
        assertTrue(hh, hh.contains("<p class=\"hook\">용 9마리 · 못 3개 · 성 2개</p><p>화왕산성 · 억새평전 · 관룡사 - 그 이야기를 2분 30초 영상에 담았습니다.</p>"));
        // 속리산 6RXD-zFKZZQ · 조계산 d372NAouBvM(2026-11-25)은 국가유산청 4유형 사진이 섞여 같은 날 지우고 1유형으로 다시 만들어 올림
        assertEquals("DZdCt8KVPKE", videos.getAsJsonArray("속리산").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject sn = new JsonObject();
        sn.add("shorts", videos.getAsJsonArray("속리산"));
        String snh = MountainServlet.shortsBlock(sn, false);
        assertTrue(snh, snh.contains("<p class=\"hook\">소가 무릎을 꿇은 산!</p><p>법주사 팔상전 · 정이품송 · 천왕봉 - 그 이야기를 2분 37초 영상에 담았습니다.</p>"));
        assertEquals("uOaY93h58DU", videos.getAsJsonArray("조계산").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject jg = new JsonObject();
        jg.add("shorts", videos.getAsJsonArray("조계산"));
        String jgh = MountainServlet.shortsBlock(jg, false);
        assertTrue(jgh, jgh.contains("<p class=\"hook\">이 돌을 뽑으면 다리가 무너진다?</p><p>송광사 · 선암사 승선교 · 쌍향수 - 그 이야기를 2분 29초 영상에 담았습니다.</p>"));
        // 2026-11-25 가야산 · 백암산
        assertEquals("7z0FJ8ViUj4", videos.getAsJsonArray("가야산").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject gy = new JsonObject();
        gy.add("shorts", videos.getAsJsonArray("가야산"));
        assertTrue(MountainServlet.shortsBlock(gy, false).contains("<p class=\"hook\">수천만 글자에 틀린 글자가 없다?</p><p>해인사 · 팔만대장경 · 홍류동 - 그 이야기를 2분 25초 영상에 담았습니다.</p>"));
        assertEquals("cIrihN0ipak", videos.getAsJsonArray("백암산").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject ba = new JsonObject();
        ba.add("shorts", videos.getAsJsonArray("백암산"));
        assertTrue(MountainServlet.shortsBlock(ba, false).contains("<p class=\"hook\">흰 양이 불경을 들으러 왔다?</p><p>백양사 · 백학봉 · 쌍계루 - 그 이야기를 2분 26초 영상에 담았습니다.</p>"));
        // 2026-11-26 덕숭산 · 월출산 · 마이산 · 치악산 · 내연산
        assertEquals("Q6jGk_qwRUQ", videos.getAsJsonArray("덕숭산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("xgtZpayQtTs", videos.getAsJsonArray("월출산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("x2ssEkOJXIE", videos.getAsJsonArray("마이산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("xRDKMHTRlQc", videos.getAsJsonArray("치악산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("0AmMq5qZbfM", videos.getAsJsonArray("내연산").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject ds = new JsonObject();
        ds.add("shorts", videos.getAsJsonArray("덕숭산"));
        assertTrue(MountainServlet.shortsBlock(ds, false).contains("<p class=\"hook\">지은 해가 적힌 가장 오래된 나무 건물?</p><p>수덕사 대웅전 · 만공탑 · 정혜사 돌계단 - 그 이야기를 2분 17초 영상에 담았습니다.</p>"));
        assertFalse("지운 옛 판 주소는 없음", new com.google.gson.Gson().toJson(videos).contains("6RXD-zFKZZQ") || new com.google.gson.Gson().toJson(videos).contains("d372NAouBvM"));
        // 물음표 없는 제목은 hook 을 큰 글로(2026-11-22 홍TV님 "전부다 ? 가 있는 것 같아")
        JsonObject jy = new JsonObject();
        jy.add("shorts", videos.getAsJsonArray("재약산"));
        String jh = MountainServlet.shortsBlock(jy, false);
        assertTrue(jh, jh.contains("<p class=\"hook\">여름엔 얼고 겨울엔 녹는다!</p><p>얼음골 · 사자평 · 표충사 - 그 이야기를 2분 31초 영상에 담았습니다.</p>"));
        MountainServlet.withShorts(peaks, videos);
        JsonObject gyeryong = null, gaya = null;
        for (JsonElement e : peaks) {
            String id = e.getAsJsonObject().get("id").getAsString();
            if (id.equals("계룡산")) gyeryong = e.getAsJsonObject();
            if (id.equals("황석산")) gaya = e.getAsJsonObject();   // 영상이 없는 산(2026-11-25 가야산은 영상이 생겨 황석산으로)
        }
        // 한국어: 예고 칸(2026-11-21 홍TV님 시안 승인) - 제목의 물음 · 볼거리 이름 · 단추 · 자료 · 길이(PC ffprobe 151.6초)
        String ko = MountainServlet.shortsBlock(gyeryong, false);
        assertEquals("<section class=\"shorts story\"><h2>이 산 이야기</h2><p class=\"hook\">닭볏 쓴 용이 사는 산?</p>"
                + "<p>무학대사 · 중악단 · 동학사 · 갑사 - 그 이야기를 2분 32초 영상에 담았습니다.</p>"
                + "<a class=\"watch\" href=\"https://www.youtube.com/shorts/Elzwl8pQ8vQ\" target=\"_blank\" rel=\"noopener\" title=\"닭볏 쓴 용이 사는 산? 계룡산 이야기\">▶ 영상으로 보기 (2분 32초)</a>"
                + "<p class=\"src\">자료: 한국민족문화대백과사전 · 국가유산청 · 산림청 100대 명산</p></section>", ko);
        // 두타산 153.1초
        JsonObject duta = null;
        for (JsonElement e : peaks) if (e.getAsJsonObject().get("id").getAsString().equals("두타산")) duta = e.getAsJsonObject();
        String dk = MountainServlet.shortsBlock(duta, false);
        assertTrue(dk, dk.contains("<p class=\"hook\">밟으면 흔들리는 바위가 있다고?</p><p>무릉계곡 · 용추폭포 · 삼화사 - 그 이야기를 2분 33초 영상에 담았습니다.</p>"));
        assertTrue(dk, dk.contains(">▶ 영상으로 보기 (2분 33초)</a>"));
        assertEquals("2분 33초", MountainServlet.clock(153.0));
        assertEquals("1분 49초", MountainServlet.clock(108.6));
        assertEquals("2분", MountainServlet.clock(120.2));
        assertEquals("45초", MountainServlet.clock(45));
        // 15곳 모두 예고 칸(볼거리가 빠진 산이 없게)
        for (String id : videos.keySet()) {
            JsonObject p = new JsonObject();
            p.add("shorts", videos.getAsJsonArray(id));
            assertTrue(id, MountainServlet.shortsBlock(p, false).startsWith("<section class=\"shorts story\">"));
            assertTrue("길이도 모두(PC ffprobe 2026-11-21) " + id, videos.getAsJsonArray(id).get(0).getAsJsonObject().has("sec"));
        }
        // 길이가 없으면 "짧은 영상" · 단추에 길이 없음
        JsonObject nolen = JsonParser.parseString("{\"shorts\":[{\"id\":\"Elzwl8pQ8vQ\",\"title\":\"t?\",\"sights\":[\"a\"]}]}").getAsJsonObject();
        assertTrue(MountainServlet.shortsBlock(nolen, false).contains("<p>a - 그 이야기를 짧은 영상에 담았습니다.</p>") && MountainServlet.shortsBlock(nolen, false).contains(">▶ 영상으로 보기</a>"));
        // 볼거리가 없으면 옛 링크 칸, 영어는 늘 링크 칸
        JsonObject old = JsonParser.parseString("{\"shorts\":[{\"id\":\"Elzwl8pQ8vQ\",\"title\":\"t?\"}]}").getAsJsonObject();
        assertTrue(MountainServlet.shortsBlock(old, false).startsWith("<section class=\"shorts\"><h2>▶ 이 산 이야기</h2><ul class=\"tips\">"));
        assertTrue(MountainServlet.shortsBlock(gyeryong, true).contains("▶ Story of this mountain (in Korean)"));
        assertFalse(MountainServlet.shortsBlock(gyeryong, true).contains("story"));
        assertEquals("영상이 없는 산은 칸 없음", "", MountainServlet.shortsBlock(gaya, false));
        // 페이지에 실제로 붙음(한국어 · 영어)
        assertTrue(MountainServlet.page(gyeryong, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("youtube.com/shorts/Elzwl8pQ8vQ"));
        assertTrue(MountainEn.page(gyeryong, new ArrayList<>(), new ArrayList<>(), null, "https://r.kr").contains("youtube.com/shorts/Elzwl8pQ8vQ"));
        assertFalse(MountainServlet.page(gaya, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("class=\"shorts\""));
        // 자리: "코스 n개 바로 보기" 바로 위(2026-11-20 홍TV님) - 코스가 있을 때 쇼츠 칸 끝 바로 뒤가 바로 보기 줄
        JsonObject c = new JsonObject();
        c.addProperty("course_id", "knps-2016-e8499de1");
        c.addProperty("name", "계룡산 · 삼불봉 → 관음봉");
        c.addProperty("distance_m", 1820);
        String withCourse = MountainServlet.page(gyeryong, new ArrayList<>(java.util.List.of(c)), new ArrayList<>(), null, "", 11);
        assertTrue(withCourse.contains("</p></section><p class=\"jump\"><a href=\"#trails\">🥾 코스 1개 바로 보기 ↓</a></p>"));
        assertTrue(MountainEn.page(gyeryong, new ArrayList<>(java.util.List.of(c)), new ArrayList<>(), null, "https://r.kr").contains("</ul></section><p class=\"jump\"><a href=\"#trails\">🥾 See the 1 trail"));
        // 이상한 영상 ID 는 링크로 만들지 않음
        JsonObject bad = JsonParser.parseString("{\"shorts\":[{\"id\":\"x\\\" onclick=\\\"y\",\"title\":\"t\"}]}").getAsJsonObject();
        assertFalse(MountainServlet.shortsBlock(bad, false).contains("<li>"));
    }
}
