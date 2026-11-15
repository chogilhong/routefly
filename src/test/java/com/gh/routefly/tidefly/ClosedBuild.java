package com.gh.routefly.tidefly;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 연안 출입통제구역 경고 만들기(테스트가 아님 - 파일을 씀, 네트워크 안 씀). 2026-11-15 3단계(안전).
 * 해양경찰청_연안 출입통제구역 현황(공공데이터 15110667, 2023-05-01, SHP 43개 면 - WGS84 위경도, 칸 pname · name · plave_type · address · announceme, EUC-KR).
 * 포인트(tidefly-points.json) · 자리(tidefly-spots.json)에서 구역 안이거나 {@link #NEAR_M} 안이면 data/tidefly-closed.json 에 {이름: [{area, type, notice, m}]}(가까운 차례, 3개까지).
 * 국립해양조사원_낚시금지구역(15130115)은 쓰지 않음 - 25개 면 대부분 이름이 비고 구분 코드(RSN028) 뜻이 파일에 없으며 북위 42도 바다 같은 우리 연안 밖 면도 섞여 있음(docs/tidefly/README.md).
 */
public final class ClosedBuild {

    private ClosedBuild() {
    }

    static final Path SHP = PointsBuild.RES.resolve("points/15110667-coast-closed/연안_출입통제구역(2023).shp");
    static final Path DBF = PointsBuild.RES.resolve("points/15110667-coast-closed/연안_출입통제구역(2023).dbf");
    static final Path OUT = Path.of("src", "main", "webapp", "data", "tidefly-closed.json");
    /** 이만큼(m) 안이면 경고 - 국가어항 위경도가 소수 둘째 자리(약 1km)라 1km. */
    static final double NEAR_M = 1000;
    static final int MAX_PER_POINT = 3;

    public static void main(String[] args) throws Exception {
        Files.writeString(OUT, build(Files.readAllBytes(SHP), Files.readAllBytes(DBF), Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8),
                Files.readString(SpotsBuild.OUT, StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        System.out.println("→ " + OUT.toAbsolutePath());
    }

    /** 순수 함수 - SHP(다각형 5) → 면마다 고리들([경도, 위도] 점 목록). */
    static List<List<double[][]>> polygons(byte[] shp) {
        ByteBuffer b = ByteBuffer.wrap(shp);
        List<List<double[][]>> out = new ArrayList<>();
        int pos = 100;
        while (pos + 8 <= shp.length) {
            int len = b.order(ByteOrder.BIG_ENDIAN).getInt(pos + 4) * 2, c = pos + 8;
            b.order(ByteOrder.LITTLE_ENDIAN);
            List<double[][]> rings = new ArrayList<>();
            if (b.getInt(c) == 5) {
                int parts = b.getInt(c + 36), points = b.getInt(c + 40), p0 = c + 44 + 4 * parts;
                for (int i = 0; i < parts; i++) {
                    int from = b.getInt(c + 44 + 4 * i), to = i + 1 < parts ? b.getInt(c + 44 + 4 * (i + 1)) : points;
                    double[][] ring = new double[to - from][];
                    for (int k = from; k < to; k++) ring[k - from] = new double[] {b.getDouble(p0 + 16 * k), b.getDouble(p0 + 16 * k + 8)};
                    rings.add(ring);
                }
            }
            out.add(rings);
            pos = c + len;
        }
        return out;
    }

    /** 순수 함수 - DBF → 줄마다 {칸 이름: 값(앞뒤 빈칸 뺌)}. */
    static List<Map<String, String>> records(byte[] dbf, Charset cs) {
        ByteBuffer b = ByteBuffer.wrap(dbf).order(ByteOrder.LITTLE_ENDIAN);
        int n = b.getInt(4), head = b.getShort(8) & 0xffff, size = b.getShort(10) & 0xffff;
        List<String> names = new ArrayList<>();
        List<Integer> lens = new ArrayList<>();
        for (int i = 32; i + 32 <= head - 1; i += 32) {
            int end = i;
            while (end < i + 11 && dbf[end] != 0) end++;
            names.add(new String(dbf, i, end - i, StandardCharsets.US_ASCII));
            lens.add(dbf[i + 16] & 0xff);
        }
        List<Map<String, String>> out = new ArrayList<>();
        for (int r = 0; r < n; r++) {
            int p = head + r * size + 1;
            Map<String, String> row = new LinkedHashMap<>();
            for (int f = 0; f < names.size(); f++) {
                row.put(names.get(f), new String(dbf, p, lens.get(f), cs).trim());
                p += lens.get(f);
            }
            out.add(row);
        }
        return out;
    }

    /** 순수 함수 - 점에서 면까지 거리(m). 안이면 0. 짧은 거리라 평면으로 셈. */
    static double meters(double lat, double lon, List<double[][]> rings) {
        boolean in = false;
        double best = Double.MAX_VALUE, kx = 111_320 * Math.cos(Math.toRadians(lat)), ky = 110_574;
        for (double[][] ring : rings) {
            for (int i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                double[] a = ring[i], c = ring[j];
                if ((a[1] > lat) != (c[1] > lat) && lon < (c[0] - a[0]) * (lat - a[1]) / (c[1] - a[1]) + a[0]) in = !in;
                double ax = a[0] * kx, ay = a[1] * ky, bx = c[0] * kx, by = c[1] * ky, px = lon * kx, py = lat * ky, dx = bx - ax, dy = by - ay;
                double t = dx == 0 && dy == 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
                best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
            }
        }
        return in ? 0 : best;
    }

    /** 순수 함수 - 경고 json 글(이름 차례, 한 줄에 한 포인트 · 자리). */
    static String build(byte[] shp, byte[] dbf, String pointsJson, String spotsJson) {
        List<List<double[][]>> polys = polygons(shp);
        List<Map<String, String>> recs = records(dbf, Charset.forName("MS949"));
        TreeMap<String, String> lines = new TreeMap<>();
        for (String json : new String[] {pointsJson, spotsJson}) {
            for (JsonElement e : JsonParser.parseString(json).getAsJsonArray()) {
                JsonObject p = e.getAsJsonObject();
                double lat = p.get("lat").getAsDouble(), lon = p.get("lon").getAsDouble();
                List<double[]> near = new ArrayList<>();   // [거리, 면 번호]
                for (int i = 0; i < polys.size(); i++) {
                    double m = meters(lat, lon, polys.get(i));
                    if (m < NEAR_M) near.add(new double[] {m, i});
                }
                if (near.isEmpty()) continue;
                near.sort((a, c) -> Double.compare(a[0], c[0]));
                JsonArray a = new JsonArray();
                for (double[] x : near.subList(0, Math.min(MAX_PER_POINT, near.size()))) {
                    Map<String, String> r = recs.get((int) x[1]);
                    JsonObject o = new JsonObject();
                    o.addProperty("area", r.get("name"));
                    o.addProperty("type", r.get("plave_type"));
                    o.addProperty("notice", r.get("announceme"));
                    o.addProperty("m", Math.round(x[0] / 10) * 10);
                    a.add(o);
                }
                String name = p.get("name").getAsString();
                lines.put(name, new com.google.gson.JsonPrimitive(name) + ":" + a);
            }
        }
        return "{\n" + String.join(",\n", lines.values()) + "\n}\n";
    }
}
