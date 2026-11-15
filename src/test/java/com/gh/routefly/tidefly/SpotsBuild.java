package com.gh.routefly.tidefly;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 갯바위 · 선상 낚시 자리(3단계) 만들기(테스트가 아님 - 파일을 씀, 네트워크 안 씀). 2026-11-15 홍TV님 "2번으로 해주고"(📍 내 근처 · 찾기에서만 보임).
 * 해양수산부_공동활용체계_갯바위낚시포인트(15148580, 1,076곳) · 선상낚시포인트(15148435, 329곳).
 *
 * <ul>
 *   <li>위치: "공간정보" 칸 POINT(x y) - UTM-K(EPSG:5179, GRS80 · 중앙 경선 127.5 · 기준 위도 38 · 축척 0.9996 · 동 1,000,000 · 북 2,000,000)를 위경도로.
 *       같은 줄 도분초 칸과 1,401곳이 100m 안(SpotsTest) - 도분초 칸은 갯바위 경도가 거의 비고 오타가 있어(35-04 ↔ 34-04 등) 쓰지 않음</li>
 *   <li>base: 가장 가까운 기존 포인트(tidefly-points.json) - 바다 예측 · 물때 · 해는 그 포인트 것을 씀(화면에 "○○ 기준 x km")</li>
 *   <li>extra: base 의 특보구역 짝에 더할 먼바다 - 서해 · 남해에서 이 자리가 앞바다 경계선(별표 5) 바깥이거나 3km 안이면 PortsBuild.offshore(특보를 놓치지 않게)</li>
 * </ul>
 */
public final class SpotsBuild {

    private SpotsBuild() {
    }

    static final Path ROCK_CSV = PointsBuild.RES.resolve("points/15148580-갯바위낚시포인트_20221231.csv");
    static final Path BOAT_CSV = PointsBuild.RES.resolve("points/15148435-선상낚시포인트_20231231.csv");
    static final Path OUT = Path.of("src", "main", "webapp", "data", "tidefly-spots.json");

    public static void main(String[] args) throws Exception {
        String points = Files.readString(PointsBuild.OUT, StandardCharsets.UTF_8), wrn = Files.readString(PortsBuild.WRN, StandardCharsets.UTF_8);
        String rock = new String(Files.readAllBytes(ROCK_CSV), Charset.forName("MS949")), boat = new String(Files.readAllBytes(BOAT_CSV), Charset.forName("MS949"));
        Files.writeString(OUT, spots(points, wrn, rock, boat), StandardCharsets.UTF_8);
        System.out.println("→ " + OUT.toAbsolutePath());
    }

    /** 순수 함수 - UTM-K(EPSG:5179) x · y(m) → [위도, 경도]. GRS80 횡메르카토르 역변환(Snyder 1987 식). */
    static double[] utmk(double x, double y) {
        double a = 6378137.0, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996;
        double lat0 = Math.toRadians(38), lon0 = 127.5;
        double m0 = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * lat0 - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * lat0)
                + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * lat0) - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * lat0));
        double m = m0 + (y - 2_000_000) / k0;
        double mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
        double p1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
                + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
        double c = ep2 * Math.cos(p1) * Math.cos(p1), t = Math.tan(p1) * Math.tan(p1), sin = Math.sin(p1);
        double n = a / Math.sqrt(1 - e2 * sin * sin), r = a * (1 - e2) / Math.pow(1 - e2 * sin * sin, 1.5), d = (x - 1_000_000) / (n * k0);
        double lat = p1 - (n * Math.tan(p1) / r) * (d * d / 2 - (5 + 3 * t + 10 * c - 4 * c * c - 9 * ep2) * Math.pow(d, 4) / 24
                + (61 + 90 * t + 298 * c + 45 * t * t - 252 * ep2 - 3 * c * c) * Math.pow(d, 6) / 720);
        double lon = (d - (1 + 2 * t + c) * Math.pow(d, 3) / 6 + (5 - 2 * c + 28 * t - 3 * c * c + 8 * ep2 + 24 * t * t) * Math.pow(d, 5) / 120) / Math.cos(p1);
        return new double[] {Math.toDegrees(lat), lon0 + Math.toDegrees(lon)};
    }

    /** 순수 함수 - "34-39-41.6N" 같은 도분초 → 도. 꼴이 아니면 null(갯바위 경도는 거의 빔). 원본에 "21.8." 처럼 점이 하나 더 붙은 것은 앞 숫자만. */
    static Double dms(String s) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+)-(\\d+)-(\\d+(?:\\.\\d+)?)").matcher(s == null ? "" : s.trim());
        return m.lookingAt() ? Integer.parseInt(m.group(1)) + Integer.parseInt(m.group(2)) / 60.0 + Double.parseDouble(m.group(3)) / 3600 : null;
    }

    /** 순수 함수 - "POINT (x y)" → [x, y]. 꼴이 아니면 null. */
    static double[] point(String s) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("POINT \\(([0-9.]+) ([0-9.]+)\\)").matcher(s == null ? "" : s.trim());
        return m.matches() ? new double[] {Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2))} : null;
    }

    /** 순수 함수 - "▶참돔 - 부력/ 잠수▶농어 - 루어/ 릴찌" → "참돔 · 농어"(물고기 이름만, 차례 그대로, 겹친 것 뺌). */
    static String fish(String s) {
        Set<String> out = new LinkedHashSet<>();
        for (String part : (s == null ? "" : s).split("▶")) {
            String f = part.split(" - ")[0].trim();
            if (!f.isEmpty()) out.add(f);
        }
        return String.join(" · ", out);
    }

    /** 순수 함수 - 자리 목록 json 글(한 줄에 한 자리, 갯바위 r<일련번호> 뒤 선상 b<일련번호>). */
    static String spots(String pointsJson, String wrnJson, String rockCsv, String boatCsv) {
        JsonArray base = JsonParser.parseString(pointsJson).getAsJsonArray();
        JsonObject regs = JsonParser.parseString(wrnJson).getAsJsonObject();
        Set<String> used = new java.util.HashSet<>();
        for (JsonElement e : base) used.add(e.getAsJsonObject().get("name").getAsString());
        List<String> lines = new ArrayList<>();
        for (int boat = 0; boat < 2; boat++) {
            List<List<String>> rows = PortsBuild.csv(boat == 0 ? rockCsv : boatCsv);
            List<String> h = rows.get(0);
            int iId = h.indexOf("공간정보일련번호"), iGeo = h.indexOf("공간정보"), iArea = h.indexOf(boat == 0 ? "포인트지역명" : "포인트명1"), iName = h.indexOf(boat == 0 ? "포인트명" : "포인트명2");
            int iDepth = h.indexOf("수심범위내용"), iBottom = h.indexOf("주원료내용"), iTide = h.indexOf("조수물때내용"), iFish = h.indexOf("낚시방법대상내용"), iSido = h.indexOf("행정구역명");
            for (List<String> r : rows.subList(1, rows.size())) {
                double[] xy = r.size() > iGeo ? point(r.get(iGeo)) : null;
                if (xy == null) continue;
                double[] ll = utmk(xy[0], xy[1]);
                JsonObject near = null;
                double best = Double.MAX_VALUE;
                for (JsonElement e : base) {
                    JsonObject p = e.getAsJsonObject();
                    double k = PointsBuild.km(ll[0], ll[1], p.get("lat").getAsDouble(), p.get("lon").getAsDouble());
                    if (k < best) { best = k; near = p; }
                }
                List<String> baseRegs = TideflyServlet.regIds(regs, near.get("name").getAsString());
                List<String> extra = new ArrayList<>();
                String first = baseRegs == null ? null : baseRegs.get(0);
                boolean westSouth = first != null && (first.startsWith("S12") || first.startsWith("S131") || first.startsWith("S132") && !first.startsWith("S1323"));
                if (westSouth && (PortsBuild.seaward(ll[0], ll[1]) || PortsBuild.lineKm(ll[0], ll[1]) < PortsBuild.NEAR_LINE_KM))
                    for (String z : PortsBuild.offshore(first, ll[0], ll[1])) if (!baseRegs.contains(z)) extra.add(z);
                String area = r.get(iArea).trim(), name = r.get(iName).trim();
                String show = area.isEmpty() ? name : name.isEmpty() ? area : area + " · " + name;
                String unique = show;
                for (int k = 2; used.contains(unique); k++) unique = show + " (" + k + ")";
                used.add(unique);
                JsonObject o = new JsonObject();
                o.addProperty("id", (boat == 0 ? "r" : "b") + r.get(iId).trim());
                o.addProperty("name", unique);
                o.addProperty("boat", boat == 1);
                o.addProperty("lat", Double.parseDouble(String.format(Locale.ROOT, "%.5f", ll[0])));
                o.addProperty("lon", Double.parseDouble(String.format(Locale.ROOT, "%.5f", ll[1])));
                o.addProperty("sido", r.get(iSido).trim());
                o.addProperty("depth", r.get(iDepth).trim());
                o.addProperty("bottom", r.get(iBottom).trim());
                o.addProperty("tideTime", r.get(iTide).trim());
                o.addProperty("fish", fish(r.get(iFish)));
                o.addProperty("base", near.get("name").getAsString());
                o.addProperty("baseKm", Double.parseDouble(String.format(Locale.ROOT, "%.1f", best)));
                if (!extra.isEmpty()) {
                    JsonArray x = new JsonArray();
                    for (String z : extra) x.add(z);
                    o.add("extra", x);
                }
                lines.add(o.toString());
            }
        }
        return "[\n" + String.join(",\n", lines) + "\n]\n";
    }
}
