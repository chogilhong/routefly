package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 기상청 날씨누리 봄꽃 개화현황 · 유명산 단풍현황(공공데이터포털 15150373, 2026-11-14) → src/main/webapp/data/season.json.
 * 산 페이지의 "🍁 단풍 · 🌸 철쭉 때" 칸 · 코스 모음의 단풍 순서(MountainServlet.withSeason · seasonBlock · seasonFold)가 읽습니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.SeasonProbe        → src/test/resources/season/tb_flower_summary.csv 로 season.json 을 다시 만듦(네트워크 · 키 없음)
 * </pre>
 *
 * 해마다 새 파일(다음 등록 예정 2027-09-10)이 오면 포털에서 받아 src/test/resources/season/ 의 csv 를 바꾸고 이것을 다시 돌립니다.
 * 나무종류 코드(1 벚꽃 · 2 철쭉 · 4 단풍)는 파일에 뜻이 없어 포털 설명(벚꽃 13 · 철쭉 3 · 단풍 21곳)과 지점 수 · 관측 달로 맞춘 것입니다(season/README.md).
 * 관측장소가 100대 명산 id 와 똑같은 곳만 씁니다(벚꽃 지점은 도시라 뺌). 지어내지 않습니다 - 날짜가 빈 칸이면 그 값을 넣지 않습니다.
 */
public final class SeasonProbe {

    private SeasonProbe() {
    }

    static final Path CSV = Path.of("src", "test", "resources", "season", "tb_flower_summary.csv");
    static final Path OUT = Path.of("src", "main", "webapp", "data", "season.json");

    public static void main(String[] args) throws Exception {
        JsonArray peaks = JsonParser.parseString(Files.readString(Path.of("src", "main", "webapp", "data", "mountains100.json"), StandardCharsets.UTF_8))
                .getAsJsonObject().getAsJsonArray("peaks");
        String json = json(build(Files.readString(CSV, StandardCharsets.UTF_8), peaks));
        Files.writeString(OUT, json, StandardCharsets.UTF_8);
        System.out.println(OUT + " 를 썼습니다.");
    }

    /** season.json 글자(끝 줄바꿈 포함) - 테스트가 커밋된 파일과 견줌. */
    static String json(JsonObject o) {
        return new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(o) + "\n";
    }

    /** 순수 함수 - csv 글자 → {_note, foliage: {산 id: {start, peak}}, azalea: {...}}. 산 id 순서. */
    static JsonObject build(String csvText, JsonArray peaks) {
        List<String> ids = new ArrayList<>();
        for (JsonElement e : peaks) {
            JsonObject p = e.getAsJsonObject();
            ids.add(p.has("id") ? p.get("id").getAsString() : p.get("name").getAsString());
        }
        List<List<String>> rows = csv(csvText);
        List<String> h = rows.get(0);
        int type = h.indexOf("나무종류"), place = h.indexOf("관측장소"), start = h.indexOf("개화 촬영날짜"), peak = h.indexOf("만발 촬영날짜");
        if (type < 0 || place < 0 || start < 0 || peak < 0) throw new IllegalArgumentException("머리줄이 다릅니다: " + h);
        TreeMap<String, JsonObject> foliage = new TreeMap<>(), azalea = new TreeMap<>();
        for (List<String> r : rows.subList(1, rows.size())) {
            if (r.size() <= Math.max(peak, start)) continue;
            String t = r.get(type).trim(), at = r.get(place).trim();
            TreeMap<String, JsonObject> to = "4".equals(t) ? foliage : "2".equals(t) ? azalea : null;
            if (to == null || !ids.contains(at)) continue;
            JsonObject v = new JsonObject();
            if (day(r.get(start)) != null) v.addProperty("start", day(r.get(start)));
            if (day(r.get(peak)) != null) v.addProperty("peak", day(r.get(peak)));
            if (v.size() > 0) to.put(at, v);
        }
        JsonObject o = new JsonObject();
        o.addProperty("_note", "기상청 날씨누리 봄꽃 개화현황 · 유명산 단풍현황(공공데이터포털 15150373, 공공저작물 출처표시) - 단풍(나무종류 4)은 start 단풍 시작 · peak 절정, "
                + "철쭉(2)은 start 꽃 핌 · peak 활짝. 관측장소가 100대 명산 id 와 같은 곳만. web.SeasonProbe 가 src/test/resources/season/tb_flower_summary.csv 로 만듦 - 고치지 말고 다시 만드세요.");
        JsonObject f = new JsonObject(), a = new JsonObject();
        foliage.forEach(f::add);
        azalea.forEach(a::add);
        o.add("foliage", f);
        o.add("azalea", a);
        return o;
    }

    /** "2025-10-23" 꼴만(앞뒤 빈칸 · 시각이 붙어도 날짜만), 아니면 null. */
    static String day(String s) {
        String t = s == null ? "" : s.trim();
        return t.matches("\\d{4}-\\d{2}-\\d{2}.*") ? t.substring(0, 10) : null;
    }

    /** 순수 함수 - 따옴표 안 줄바꿈 · "" 를 아는 CSV 읽기(BOM 은 지움). */
    static List<List<String>> csv(String text) {
        if (text.startsWith("﻿")) text = text.substring(1);
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (q) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') { cell.append('"'); i++; }
                else if (c == '"') q = false;
                else cell.append(c);
            } else if (c == '"') q = true;
            else if (c == ',') { row.add(cell.toString()); cell.setLength(0); }
            else if (c == '\r') continue;
            else if (c == '\n') { row.add(cell.toString()); cell.setLength(0); rows.add(row); row = new ArrayList<>(); }
            else cell.append(c);
        }
        if (cell.length() > 0 || !row.isEmpty()) { row.add(cell.toString()); rows.add(row); }
        return rows;
    }
}
