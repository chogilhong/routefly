package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 드론 공역 파일 만들기(2026-11-17 홍TV님 dronefly) - DroneProbe 가 받은 브이월드 응답(src/test/resources/drone/data-*-kr.json)에서
 * 이름 · 높이 칸과 경계(소수 5자리, 약 1m)만 남겨 src/main/webapp/data/drone-airspace.json 으로. 화면(js/dronefly.js)이 받아 폰 안에서 셈.
 * <pre>.claude\run-tests.ps1 -Run web.DroneAirspace   (DroneProbe 로 다시 받은 뒤)</pre>
 */
public final class DroneAirspace {

    private DroneAirspace() {
    }

    /** 화면 이름 · 브이월드 레이어 · 남길 칸(차례대로 l 배열). */
    static final String[][] KINDS = {
        {"prh", "lt_c_aisprhc", "prh_lbl_1", "prh_lbl_2", "prh_lbl_3", "prh_lbl_4"},
        {"res", "lt_c_aisresc", "res_lbl_1", "res_lbl_2", "res_lbl_3"},
        {"ctr", "lt_c_aisctrc", "ctr_lbl_1"},
        {"moa", "lt_c_aismoac", "moa_lbl_1", "moa_lbl_2", "moa_lbl_3"},
        {"ua", "lt_c_aisuac", "uac_lbl_1", "uac_lbl_2", "uac_lbl_3"}};

    /** WFS 로 받은 것(2026-11-17 홍TV님 "항만시설이랑 임시 비행금지도 넣어줘") - 드론원스톱 지도가 부르는 레이어. temp 의 notam 칸은 기간(B · C)을 화면이 읽음. */
    static final String[][] WFS_KINDS = {
        {"port", "lt_c_aisport", "cont", "ula", "ma", "port_opr", "info_tel", "sup_org", "mgr_tel"},
        {"tmp", "lt_c_aistemp", "prh_lbl_1", "prh_lbl_2", "prh_lbl_3", "notam"}};

    static final Path OUT = Path.of("src", "main", "webapp", "data", "drone-airspace.json");

    public static void main(String[] args) throws Exception {
        String s = build(Path.of("src", "test", "resources", "drone"), args.length > 0 ? args[0] : "2026-11-17");
        Files.writeString(OUT, s, StandardCharsets.UTF_8);
        System.out.println(OUT + " ← " + s.length() + "자");
    }

    /** 순수 함수(파일만 읽음) - 공역 파일 글. date - 받은 날(화면에 보임). */
    static String build(Path dir, String date) throws Exception {
        JsonObject out = new JsonObject();
        out.addProperty("date", date);
        out.addProperty("src", "브이월드 항공 레이어(국토교통부)");
        for (String[] k : KINDS) {
            JsonObject r = JsonParser.parseString(Files.readString(dir.resolve("data-" + k[1] + "-kr.json"), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonObject("response");
            if (!"OK".equals(r.get("status").getAsString())) throw new IllegalStateException(k[1] + " 응답이 OK 가 아님");
            JsonArray list = new JsonArray();
            for (JsonElement e : r.getAsJsonObject("result").getAsJsonObject("featureCollection").getAsJsonArray("features")) list.add(zone(e.getAsJsonObject(), k));
            out.add(k[0], list);
        }
        for (String[] k : WFS_KINDS) {
            JsonObject r = JsonParser.parseString(Files.readString(dir.resolve("wfs-" + k[1] + "-kr.json"), StandardCharsets.UTF_8)).getAsJsonObject();
            JsonArray list = new JsonArray();
            for (JsonElement e : r.getAsJsonArray("features")) list.add(zone(e.getAsJsonObject(), k));
            out.add(k[0], list);
        }
        return out.toString();
    }

    /** 공역 하나 {l: [칸들], g: 경계}. */
    private static JsonObject zone(JsonObject f, String[] k) {
        JsonObject p = f.getAsJsonObject("properties"), z = new JsonObject();
        JsonArray l = new JsonArray();
        for (int i = 2; i < k.length; i++) l.add(p.has(k[i]) && !p.get(k[i]).isJsonNull() ? p.get(k[i]).getAsString().trim().replaceAll("\\s+", " ") : "");
        z.add("l", l);
        z.add("g", round(f.getAsJsonObject("geometry").getAsJsonArray("coordinates")));
        return z;
    }

    /** 좌표 배열(몇 겹이든)의 숫자를 소수 5자리로. */
    private static JsonElement round(JsonArray a) {
        JsonArray o = new JsonArray();
        for (JsonElement e : a)
            if (e.isJsonArray()) o.add(round(e.getAsJsonArray()));
            else o.add(Math.round(e.getAsDouble() * 1e5) / 1e5);
        return o;
    }
}
