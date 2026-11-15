package com.gh.routefly.tidefly;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TreeMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 포인트 목록 만들기(테스트가 아님 - 파일을 씀, 네트워크는 안 씀). 2026-11-14 홍TV님 "작업해" - 처음 포인트는 바다낚시지수 49곳.
 * 받아 둔 실제 응답(바다낚시지수 전체 쪽 · API허브 대해구 전체)에서만 만듭니다. 지은 값 없음.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run tidefly.PointsBuild    (또는 클라우드에서 같은 클래스를 java 로)
 * </pre>
 * 결과 src/main/webapp/data/tidefly-points.json [{name, lat, lon, boat, lzone, szone, tide, tideName, tideKm}] (이름 차례). PointsTest 가 받아 둔 응답과 같은지 봅니다.
 * <ul>
 *   <li>boat: 이름에 "(2km)" 처럼 항구 기준 거리가 붙은 곳(선상 자리로 보임 - 응답에 구분 칸이 없어 이름으로만 나눔)</li>
 *   <li>lzone: 그 위경도가 든 대해구 번호(marine_large_zone 의 네 귀퉁이). 들지 않으면 0</li>
 *   <li>szone: 그 대해구 안 소해구 번호(1 ~ 9). 3 x 3, 북쪽 줄부터 줄 안은 서 → 동(2026-11-14 PC 가 받은 대해구 1 · 210 · 233 의 칸 - PointsTest 가 대해구 1 의 아홉 칸으로 봄)</li>
 *   <li>tide · tideName · tideKm: 가장 가까운 조석 예보지점(data/tide-stations.json - routefly 가 DT_0001 ~ 0099 를 실제로 물어 모은 62곳,
 *       2026-11-14 routefly 517febd 에서 그대로 가져옴)과 곧은 거리(km, 소수 한 자리)</li>
 * </ul>
 */
public final class PointsBuild {

    private PointsBuild() {
    }

    static final Path RES = Path.of("src", "test", "resources", "tidefly");
    static final Path OUT = Path.of("src", "main", "webapp", "data", "tidefly-points.json");
    static final Path TIDE_STATIONS = Path.of("src", "main", "webapp", "data", "tide-stations.json");

    public static void main(String[] args) throws Exception {
        Files.writeString(OUT, build(fishingPages(), Files.readString(RES.resolve("apihub/marine-large-all.txt"), StandardCharsets.UTF_8),
                Files.readString(TIDE_STATIONS, StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        System.out.println("→ " + OUT.toAbsolutePath());
    }

    /** 받아 둔 바다낚시지수 쪽 파일들(fishing-갯바위-p1 ~ ). */
    static List<String> fishingPages() throws Exception {
        List<String> out = new ArrayList<>();
        for (int p = 1; Files.isRegularFile(RES.resolve("portal/fishing-갯바위-p" + p + ".json")); p++) {
            out.add(Files.readString(RES.resolve("portal/fishing-갯바위-p" + p + ".json"), StandardCharsets.UTF_8));
        }
        return out;
    }

    /** 순수 함수 - 바다낚시지수 쪽들 + 대해구 전체 글 + 조석 예보지점 → points.json 글. */
    static String build(List<String> fishingPages, String largeZones, String tideStations) {
        List<double[]> zones = largeZones(largeZones);
        JsonArray stations = JsonParser.parseString(tideStations).getAsJsonArray();
        TreeMap<String, String> rows = new TreeMap<>();
        for (String page : fishingPages) {
            JsonObject root = JsonParser.parseString(page).getAsJsonObject();
            if (root.has("response")) root = root.getAsJsonObject("response");
            JsonElement it = root.getAsJsonObject("body").getAsJsonObject("items").get("item");
            JsonArray items = it.isJsonArray() ? it.getAsJsonArray() : new JsonArray();
            if (it.isJsonObject()) items.add(it);
            for (JsonElement e : items) {
                JsonObject o = e.getAsJsonObject();
                String name = o.get("seafsPstnNm").getAsString().trim();
                if (rows.containsKey(name)) continue;
                double lat = o.get("lat").getAsDouble(), lon = o.get("lot").getAsDouble();
                double[] z = zone(zones, lat, lon);
                JsonObject st = nearest(stations, lat, lon);
                double km = km(lat, lon, st.get("lat").getAsDouble(), st.get("lon").getAsDouble());
                rows.put(name, String.format(Locale.ROOT, "{\"name\":\"%s\",\"lat\":%.5f,\"lon\":%.5f,\"boat\":%b,\"lzone\":%d,\"szone\":%d,\"tide\":\"%s\",\"tideName\":\"%s\",\"tideKm\":%.1f}",
                        name.replace("\"", ""), lat, lon, boat(name), z == null ? 0 : (int) z[0], z == null ? 0 : szone(z, lat, lon),
                        st.get("code").getAsString(), st.get("name").getAsString().replace("\"", ""), km));
            }
        }
        return "[\n" + String.join(",\n", rows.values()) + "\n]\n";
    }

    /** 순수 함수 - 가장 가까운 조석 예보지점. */
    static JsonObject nearest(JsonArray stations, double lat, double lon) {
        JsonObject best = null;
        double bestKm = Double.MAX_VALUE;
        for (JsonElement e : stations) {
            JsonObject s = e.getAsJsonObject();
            double d = km(lat, lon, s.get("lat").getAsDouble(), s.get("lon").getAsDouble());
            if (d < bestKm) {
                bestKm = d;
                best = s;
            }
        }
        return best;
    }

    /** 순수 함수 - 두 위경도 사이 곧은 거리(km, 지구 반지름 6371km 의 대원 거리). */
    static double km(double lat1, double lon1, double lat2, double lon2) {
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2), dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** 순수 함수 - 이름 끝에 "(숫자km)" 가 붙었는지(항구 기준 거리 = 선상 자리로 봄). */
    static boolean boat(String name) {
        return name.matches(".*\\(\\d+km\\)\\s*");
    }

    /** 순수 함수 - 대해구 글(#START7777 … 빈칸으로 나뉜 줄) → [번호, 아래 위도, 왼쪽 경도, 위 위도, 오른쪽 경도]. */
    static List<double[]> largeZones(String text) {
        List<double[]> out = new ArrayList<>();
        for (String line : text.split("\n")) {
            if (line.startsWith("#") || line.isBlank()) continue;
            String[] f = line.trim().split("\\s+");
            if (f.length < 9) continue;
            // 3 LZONE · 4 LAT_LB · 5 LON_LB · 8 LAT_RT · 9 LON_RT (머리말 차례)
            out.add(new double[] {Double.parseDouble(f[2]), Double.parseDouble(f[3]), Double.parseDouble(f[4]), Double.parseDouble(f[7]), Double.parseDouble(f[8])});
        }
        return out;
    }

    /** 순수 함수 - 그 자리가 든 대해구(아래 · 왼쪽 경계는 포함, 위 · 오른쪽은 빼서 한 곳만). 없으면 null. */
    static double[] zone(List<double[]> zones, double lat, double lon) {
        for (double[] z : zones) {
            if (lat >= z[1] && lat < z[3] && lon >= z[2] && lon < z[4]) return z;
        }
        return null;
    }

    /** 순수 함수 - 대해구 z 안 소해구 번호: 3 x 3, 북쪽 줄부터(1 ~ 3), 줄 안은 서 → 동. */
    static int szone(double[] z, double lat, double lon) {
        int row = Math.min(2, (int) Math.floor((z[3] - lat) / (z[3] - z[1]) * 3));
        int col = Math.min(2, (int) Math.floor((lon - z[2]) / (z[4] - z[2]) * 3));
        return row * 3 + col + 1;
    }
}
