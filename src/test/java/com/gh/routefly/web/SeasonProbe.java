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
 * 단풍 · 철쭉은 관측장소가 100대 명산 id 와 똑같은 곳만 씁니다. 벚꽃(2026-11-14 홍TV님 "1,2 번 해주고")은 13곳 모두 이름 그대로 두고,
 * 산과 이어지는 곳만 mountain 을 붙입니다(CHERRY_MOUNTAIN - 관측장소 세부로 확인한 것만). 지어내지 않습니다 - 날짜가 빈 칸이면 그 값을 넣지 않습니다.
 */
public final class SeasonProbe {

    private SeasonProbe() {
    }

    /** 벚꽃 관측장소 → 100대 명산 id. 공주 계룡산: 세부 "계룡산 국립공원 치안센터 맞은편 벚나무 3그루"(동학사 들머리). 나머지 12곳은 도시라 없음. */
    static final java.util.Map<String, String> CHERRY_MOUNTAIN = java.util.Map.of("공주 계룡산", "계룡산");

    static final Path CSV = Path.of("src", "test", "resources", "season", "tb_flower_summary.csv");
    static final Path SSN = Path.of("src", "test", "resources", "season", "kma-ssn-2024-2026.txt");
    static final Path STN = Path.of("src", "test", "resources", "season", "kma-stn-sfc.txt");
    static final Path NORM = Path.of("src", "test", "resources", "season", "kma-ssn-norm.txt");
    /** 진달래 관측소를 산에 붙이는 거리(km) - 23곳 모두 도시라 멀면 산과 맞지 않음. 15km 안 12개 산(2026-11-14 계산, 서울 → 북한산 9.8 · 관악산 14.0 · 도봉산 14.8). */
    static final double NEAR_KM = 15;
    static final Path OUT = Path.of("src", "main", "webapp", "data", "season.json");

    public static void main(String[] args) throws Exception {
        JsonArray peaks = JsonParser.parseString(Files.readString(Path.of("src", "main", "webapp", "data", "mountains100.json"), StandardCharsets.UTF_8))
                .getAsJsonObject().getAsJsonArray("peaks");
        JsonObject o = build(Files.readString(CSV, StandardCharsets.UTF_8), peaks);
        o.add("azaleaNear", azaleaNear(Files.readString(SSN, StandardCharsets.UTF_8), Files.readString(STN, StandardCharsets.UTF_8),
                Files.readString(NORM, StandardCharsets.UTF_8), peaks));
        String json = json(o);
        Files.writeString(OUT, json, StandardCharsets.UTF_8);
        System.out.println(OUT + " 를 썼습니다.");
    }

    /** season.json 글자(끝 줄바꿈 포함) - 테스트가 커밋된 파일과 견줌. */
    static String json(JsonObject o) {
        return new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(o) + "\n";
    }

    /** 순수 함수 - csv 글자 → {_note, cherry: {관측장소: {start, peak, mountain?}}, azalea · foliage: {산 id: {start, peak}}}. 이름 순서. */
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
        TreeMap<String, JsonObject> foliage = new TreeMap<>(), azalea = new TreeMap<>(), cherry = new TreeMap<>();
        for (List<String> r : rows.subList(1, rows.size())) {
            if (r.size() <= Math.max(peak, start)) continue;
            String t = r.get(type).trim(), at = r.get(place).trim();
            TreeMap<String, JsonObject> to = "4".equals(t) ? foliage : "2".equals(t) ? azalea : "1".equals(t) ? cherry : null;
            if (to == null || (to != cherry && !ids.contains(at))) continue;
            JsonObject v = new JsonObject();
            if (day(r.get(start)) != null) v.addProperty("start", day(r.get(start)));
            if (day(r.get(peak)) != null) v.addProperty("peak", day(r.get(peak)));
            if (v.size() == 0) continue;
            if (to == cherry && CHERRY_MOUNTAIN.containsKey(at) && ids.contains(CHERRY_MOUNTAIN.get(at))) v.addProperty("mountain", CHERRY_MOUNTAIN.get(at));
            to.put(at, v);
        }
        JsonObject o = new JsonObject();
        o.addProperty("_note", "기상청 날씨누리 봄꽃 개화현황 · 유명산 단풍현황(공공데이터포털 15150373, 공공저작물 출처표시) - 단풍(나무종류 4)은 start 단풍 시작 · peak 절정, "
                + "철쭉(2) · 벚꽃(1)은 start 꽃 핌 · peak 활짝. 단풍 · 철쭉은 관측장소가 100대 명산 id 와 같은 곳만, 벚꽃은 13곳 모두(산과 이어지면 mountain). web.SeasonProbe 가 src/test/resources/season/tb_flower_summary.csv 로 만듦 - 고치지 말고 다시 만드세요.");
        JsonObject f = new JsonObject(), a = new JsonObject(), c = new JsonObject();
        foliage.forEach(f::add);
        azalea.forEach(a::add);
        cherry.forEach(c::add);
        o.add("cherry", c);
        o.add("azalea", a);
        o.add("foliage", f);
        return o;
    }

    /**
     * 순수 함수 - 진달래(SSN_ID 204) 관측소가 15km 안에 있는 산마다 {stn 관측소 이름, km, year, start 꽃 핌(202), peak 활짝(203), norm 평년 꽃 핌 "MM-DD"}.
     * 산마다 가장 가까운 관측소 하나, 그 관측소의 가장 최근 해(꽃 핌 · 활짝 중 하나라도 있는 해). 코드 뜻은 season/kma-SSN_ID.pdf · kma-SSN_MD.pdf.
     */
    static JsonObject azaleaNear(String ssnText, String stnText, String normText, JsonArray peaks) {
        java.util.Map<Integer, double[]> pos = new java.util.HashMap<>();
        java.util.Map<Integer, String> name = new java.util.HashMap<>();
        for (String l : stnText.split("\\R")) {
            if (l.startsWith("#") || l.isBlank()) continue;
            String[] f = l.trim().split("\\s+");
            if (f.length < 11 || !f[0].matches("\\d+")) continue;
            pos.put(Integer.parseInt(f[0]), new double[] {Double.parseDouble(f[2]), Double.parseDouble(f[1])});
            name.put(Integer.parseInt(f[0]), f[10]);
        }
        java.util.Map<Integer, TreeMap<Integer, String[]>> seen = new java.util.HashMap<>();   // 관측소 → 해 → {꽃 핌, 활짝}
        for (String[] f : rows(ssnText)) {
            if (f.length < 5 || !"204".equals(f[3])) continue;
            int md = Integer.parseInt(f[4]);
            if (md != 202 && md != 203) continue;
            String[] v = seen.computeIfAbsent(Integer.parseInt(f[1]), k -> new TreeMap<>()).computeIfAbsent(Integer.parseInt(f[0]), k -> new String[2]);
            v[md == 202 ? 0 : 1] = day(f[2]);
        }
        java.util.Map<Integer, String> norm = new java.util.HashMap<>();
        for (String[] f : rows(normText)) {
            if (f.length >= 6 && "204".equals(f[4]) && "202".equals(f[5]))
                norm.put(Integer.parseInt(f[1]), String.format("%02d-%02d", Integer.parseInt(f[2]), Integer.parseInt(f[3])));
        }
        TreeMap<String, JsonObject> out = new TreeMap<>();
        for (JsonElement e : peaks) {
            JsonObject p = e.getAsJsonObject();
            String id = p.has("id") ? p.get("id").getAsString() : p.get("name").getAsString();
            double lat = p.get("lat").getAsDouble(), lon = p.get("lon").getAsDouble();
            Integer best = null;
            double bestKm = Double.MAX_VALUE;
            for (Integer stn : seen.keySet()) {
                if (!pos.containsKey(stn)) continue;
                double km = km(lat, lon, pos.get(stn)[0], pos.get(stn)[1]);
                if (km < bestKm) { bestKm = km; best = stn; }
            }
            if (best == null || bestKm > NEAR_KM) continue;
            java.util.Map.Entry<Integer, String[]> last = seen.get(best).lastEntry();
            JsonObject v = new JsonObject();
            v.addProperty("stn", name.get(best));
            v.addProperty("km", Math.round(bestKm * 10) / 10.0);
            v.addProperty("year", last.getKey());
            if (last.getValue()[0] != null) v.addProperty("start", last.getValue()[0]);
            if (last.getValue()[1] != null) v.addProperty("peak", last.getValue()[1]);
            if (norm.containsKey(best)) v.addProperty("norm", norm.get(best));
            out.put(id, v);
        }
        JsonObject o = new JsonObject();
        out.forEach(o::add);
        return o;
    }

    /** API허브 typ01 글(쉼표로 나눈 줄, # 은 설명) → 칸 배열(빈 칸 · "=" 는 뺌). */
    static List<String[]> rows(String text) {
        List<String[]> out = new ArrayList<>();
        for (String l : text.split("\\R")) {
            if (l.startsWith("#") || l.isBlank()) continue;
            List<String> f = new ArrayList<>();
            for (String c : l.split(",")) if (!c.isBlank() && !c.trim().equals("=")) f.add(c.trim());
            out.add(f.toArray(new String[0]));
        }
        return out;
    }

    static double km(double aLat, double aLon, double bLat, double bLon) {
        double r = Math.toRadians(bLat - aLat), q = Math.toRadians(bLon - aLon);
        double h = Math.sin(r / 2) * Math.sin(r / 2) + Math.cos(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat)) * Math.sin(q / 2) * Math.sin(q / 2);
        return 2 * 6371 * Math.asin(Math.sqrt(h));
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
