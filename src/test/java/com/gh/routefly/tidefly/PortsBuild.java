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
import java.util.TreeMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 국가어항 포인트 더하기(테스트가 아님 - 파일을 씀, 네트워크 안 씀). 2026-11-15 홍TV님 "우리나라 낚시 포인트가 이것 밖에 없지 않잖아" · "바로 시작해".
 * 해양수산부 어항정보(공공데이터 3083027, 국가어항 113곳 - 이름 · 주소 · 위경도 소수 둘째 자리)를 바다낚시지수 49곳 뒤에 더합니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run tidefly.PortsBuild    (또는 클라우드에서 같은 클래스를 java 로)
 * </pre>
 * <ul>
 *   <li>data/tidefly-points.json: PointsBuild 의 49곳 + 어항(port true, boat false) - 대해구 · 소해구 · 가장 가까운 조석 예보지점은 PointsBuild 와 같은 셈</li>
 *   <li>기존 포인트에서 1.5km 안 어항은 같은 곳으로 보고 뺌(아야진항 · 남애항 · 계마항 · 김녕항 · 모항항). 이름이 기존 포인트와 겹치면 "(시도)" 를 붙임(대진항(경북))</li>
 *   <li>data/tidefly-point-wrn.json 의 어항 짝: {@link #zones} - 기상청 예보업무규정 별표 4(해상국지예보구역 = 앞바다마다 시 · 군 · 읍면)와
 *       별표 5(앞바다 · 안쪽먼바다 경계 지점) 그대로(docs/tidefly/kma-coastal-zones.md). 섬 · 경계 가까운 어항은 그 바다 먼바다도 함께(특보를 놓치지 않게, 기존 포인트와 같은 방식)</li>
 * </ul>
 */
public final class PortsBuild {

    private PortsBuild() {
    }

    static final Path CSV = PointsBuild.RES.resolve("points/fishing-ports-3083027.csv");
    static final Path WRN = Path.of("src", "main", "webapp", "data", "tidefly-point-wrn.json");

    public static void main(String[] args) throws Exception {
        String base = PointsBuild.build(PointsBuild.fishingPages(), Files.readString(PointsBuild.RES.resolve("apihub/marine-large-all.txt"), StandardCharsets.UTF_8),
                Files.readString(PointsBuild.TIDE_STATIONS, StandardCharsets.UTF_8));
        String csv = new String(Files.readAllBytes(CSV), Charset.forName("MS949"));
        String large = Files.readString(PointsBuild.RES.resolve("apihub/marine-large-all.txt"), StandardCharsets.UTF_8);
        String tide = Files.readString(PointsBuild.TIDE_STATIONS, StandardCharsets.UTF_8);
        Files.writeString(PointsBuild.OUT, withPorts(base, csv, large, tide), StandardCharsets.UTF_8);
        Files.writeString(WRN, withPortZones(Files.readString(WRN, StandardCharsets.UTF_8), base, csv), StandardCharsets.UTF_8);
        System.out.println("→ " + PointsBuild.OUT.toAbsolutePath() + " · " + WRN.toAbsolutePath());
        for (String[] r : ports(base, csv)) System.out.println("| " + r[0] + " | " + r[2] + " | " + r[3] + " | " + zoneText(zones(r[1], r[0], Double.parseDouble(r[2]), Double.parseDouble(r[3]))) + " | " + r[1] + " |");
    }

    /** 순수 함수 - 짝 코드들 → 문서 표 글("강원북부앞바다(S1151100) · …"). */
    static String zoneText(List<String> ids) {
        StringBuilder b = new StringBuilder();
        for (String id : ids) b.append(b.length() == 0 ? "" : " · ").append(NAMES.get(id)).append("(").append(id).append(")");
        return b.toString();
    }

    /** 순수 함수 - 기존 points 글 + 어항 csv → 더할 어항 [이름, 주소, 위도, 경도](이름 차례). */
    static List<String[]> ports(String basePoints, String csv) {
        JsonArray base = JsonParser.parseString(basePoints).getAsJsonArray();
        Set<String> names = new java.util.HashSet<>();
        for (JsonElement e : base) names.add(e.getAsJsonObject().get("name").getAsString());
        TreeMap<String, String[]> out = new TreeMap<>();
        List<List<String>> rows = csv(csv);
        List<String> h = rows.get(0);
        int iName = h.indexOf("어항명"), iAddr = h.indexOf("어항주소"), iLat = h.indexOf("위도"), iLon = h.indexOf("경도");
        java.util.Map<String, Integer> sameRow = new java.util.HashMap<>();   // 주소 + 위경도가 같은 줄 수
        for (List<String> r : rows.subList(1, rows.size())) if (r.size() > Math.max(iLon, iAddr)) sameRow.merge(r.get(iAddr).trim() + "|" + r.get(iLat).trim() + "|" + r.get(iLon).trim(), 1, Integer::sum);
        for (List<String> r : rows.subList(1, rows.size())) {
            if (r.size() <= Math.max(iLon, iAddr)) continue;
            String name = r.get(iName).trim(), addr = r.get(iAddr).trim();
            // 원본 잘못: 소안항이 사동항(완도 금일읍 사동길)과 주소 · 위경도가 똑같음 - 겹친 줄은 주소에 제 이름이 든 것만 둠(지어내지 않으려고 고쳐 넣지 않고 뺌)
            if (sameRow.get(addr + "|" + r.get(iLat).trim() + "|" + r.get(iLon).trim()) > 1 && !addr.contains(name.replaceAll("항.*$", ""))) continue;
            double lat = Double.parseDouble(r.get(iLat).trim()), lon = Double.parseDouble(r.get(iLon).trim());
            boolean same = false;
            for (JsonElement e : base) {
                JsonObject p = e.getAsJsonObject();
                if (PointsBuild.km(lat, lon, p.get("lat").getAsDouble(), p.get("lon").getAsDouble()) < SAME_KM) same = true;
            }
            if (same) continue;
            if (names.contains(name)) name = name + "(" + sidoShort(addr) + ")";
            out.put(name, new String[] {name, addr, r.get(iLat).trim(), r.get(iLon).trim()});
        }
        return new ArrayList<>(out.values());
    }

    /** 순수 함수 - 짝 json 글에서 어항 아닌 줄(바다낚시지수 49곳 - 문서 표로 손본 것)은 그대로, 어항 줄은 zones 로 다시(이름 차례). */
    static String withPortZones(String wrnJson, String basePoints, String csv) {
        TreeMap<String, String> rows = new TreeMap<>();
        Set<String> baseNames = new java.util.HashSet<>();
        for (JsonElement e : JsonParser.parseString(basePoints).getAsJsonArray()) baseNames.add(e.getAsJsonObject().get("name").getAsString());
        JsonObject old = JsonParser.parseString(wrnJson).getAsJsonObject();
        for (String k : old.keySet()) if (baseNames.contains(k)) rows.put(k, line(k, gsonList(old.getAsJsonArray(k))));
        for (String[] p : ports(basePoints, csv)) rows.put(p[0], line(p[0], zones(p[1], p[0], Double.parseDouble(p[2]), Double.parseDouble(p[3]))));
        return "{\n" + String.join(",\n", rows.values()) + "\n}\n";
    }

    private static List<String> gsonList(JsonArray a) {
        List<String> out = new ArrayList<>();
        for (JsonElement e : a) out.add(e.getAsString());
        return out;
    }

    private static String line(String name, List<String> ids) {
        StringBuilder b = new StringBuilder("\"" + name + "\":[");
        for (int i = 0; i < ids.size(); i++) b.append(i == 0 ? "" : ", ").append("\"").append(ids.get(i)).append("\"");
        return b.append("]").toString();
    }

    /** 기존 포인트와 같은 곳으로 볼 거리(km) - 어항 위경도가 소수 둘째 자리(약 1km)라 그보다 조금 넓게. */
    static final double SAME_KM = 1.5;

    /** 순수 함수 - 기존 points 글에 어항을 더한 글(PointsBuild 와 같은 줄 모양 + "port":true, 이름 차례로 다시 섞음). */
    static String withPorts(String basePoints, String csv, String largeZones, String tideStations) {
        List<double[]> zones = PointsBuild.largeZones(largeZones);
        JsonArray stations = JsonParser.parseString(tideStations).getAsJsonArray();
        TreeMap<String, String> rows = new TreeMap<>();
        for (String line : basePoints.split("\n")) {
            if (!line.startsWith("{")) continue;
            String l = line.endsWith(",") ? line.substring(0, line.length() - 1) : line;
            rows.put(JsonParser.parseString(l).getAsJsonObject().get("name").getAsString(), l);
        }
        for (String[] p : ports(basePoints, csv)) {
            double lat = Double.parseDouble(p[2]), lon = Double.parseDouble(p[3]);
            double[] z = PointsBuild.zone(zones, lat, lon);
            JsonObject st = PointsBuild.nearest(stations, lat, lon);
            double km = PointsBuild.km(lat, lon, st.get("lat").getAsDouble(), st.get("lon").getAsDouble());
            rows.put(p[0], String.format(Locale.ROOT, "{\"name\":\"%s\",\"lat\":%.5f,\"lon\":%.5f,\"boat\":false,\"port\":true,\"lzone\":%d,\"szone\":%d,\"tide\":\"%s\",\"tideName\":\"%s\",\"tideKm\":%.1f}",
                    p[0], lat, lon, z == null ? 0 : (int) z[0], z == null ? 0 : PointsBuild.szone(z, lat, lon),
                    st.get("code").getAsString(), st.get("name").getAsString().replace("\"", ""), km));
        }
        return "[\n" + String.join(",\n", rows.values()) + "\n]\n";
    }

    static String sidoShort(String addr) {
        String s = addr.split("\\s+")[0];
        if (s.startsWith("경상북") || s.equals("경북")) return "경북";
        if (s.startsWith("경상남") || s.equals("경남")) return "경남";
        if (s.startsWith("전라남") || s.equals("전남")) return "전남";
        if (s.startsWith("전라북") || s.equals("전북")) return "전북";
        if (s.startsWith("충청남") || s.equals("충남")) return "충남";
        return s.length() >= 2 ? s.substring(0, 2) : s;
    }

    // ---------------------------------------------------------------- 해상 특보구역 짝(기상청 예보업무규정 별표 4 · 5)

    static final java.util.Map<String, String> NAMES = new java.util.HashMap<>();
    static {
        String[][] n = {{"S1251100", "인천·경기북부앞바다"}, {"S1251200", "인천·경기남부앞바다"}, {"S1251300", "충남북부앞바다"}, {"S1251400", "충남남부앞바다"},
                {"S1231100", "전북북부앞바다"}, {"S1231200", "전북남부앞바다"}, {"S1231300", "전남북부서해앞바다"}, {"S1231400", "전남중부서해앞바다"}, {"S1231500", "전남남부서해앞바다"},
                {"S1321100", "전남서부남해앞바다"}, {"S1321200", "전남동부남해앞바다"}, {"S1311100", "부산앞바다"}, {"S1311200", "경남서부남해앞바다"}, {"S1311300", "경남중부남해앞바다"},
                {"S1311400", "거제시동부앞바다"}, {"S1131100", "울산앞바다"}, {"S1131200", "경북남부앞바다"}, {"S1131300", "경북북부앞바다"}, {"S1151100", "강원북부앞바다"},
                {"S1151200", "강원중부앞바다"}, {"S1151300", "강원남부앞바다"}, {"S1323100", "제주도북부앞바다"}, {"S1323200", "제주도동부앞바다"}, {"S1323300", "제주도남부앞바다"},
                {"S1323400", "제주도서부앞바다"}, {"S1252010", "서해중부안쪽먼바다"}, {"S1252020", "서해중부바깥먼바다"}, {"S1232110", "서해남부북쪽안쪽먼바다"},
                {"S1232120", "서해남부북쪽바깥먼바다"}, {"S1232210", "서해남부남쪽안쪽먼바다"}, {"S1232220", "서해남부남쪽바깥먼바다"}, {"S1322100", "남해서부서쪽먼바다"},
                {"S1322200", "남해서부동쪽먼바다"}, {"S1312010", "남해동부안쪽먼바다"}, {"S1312020", "남해동부바깥먼바다"}, {"S1152010", "동해중부안쪽먼바다"}, {"S1152020", "동해중부바깥먼바다"}};
        for (String[] x : n) NAMES.put(x[0], x[1]);
    }

    /**
     * 별표 5 앞바다 · 안쪽먼바다 경계 지점(도 · 분 · 초 → 도). 서해 · 남해의 앞바다는 이 점들을 차례로 이은 선 안(육지 쪽).
     * 백령도 동단부터 기장군 장안읍 고리 남동쪽 12해리까지.
     */
    static final double[][] LINE = {
            {d(37, 57, 41), d(124, 44, 48)}, {d(37, 50, 33), d(124, 43, 44)}, {d(37, 46, 45), d(124, 46, 20)}, {d(37, 2, 11), d(125, 58, 30)},
            {d(36, 39, 53), d(125, 51, 18)}, {d(36, 16, 59), d(126, 11, 35)}, {d(35, 51, 29), d(126, 18, 52)}, {d(35, 22, 0), d(126, 2, 0)},
            {d(35, 20, 0), d(126, 1, 0)}, {d(35, 5, 0), d(125, 55, 0)}, {d(34, 47, 14), d(125, 47, 8)}, {d(34, 37, 0), d(125, 51, 0)},
            {d(34, 35, 0), d(125, 49, 0)}, {d(34, 20, 0), d(125, 59, 0)}, {d(34, 19, 0), d(126, 3, 0)}, {d(34, 5, 55), d(126, 35, 2)},
            {d(34, 5, 48), d(126, 36, 8)}, {d(34, 9, 1), d(126, 54, 27)}, {d(34, 11, 57), d(127, 4, 33)}, {d(34, 12, 42), d(127, 15, 48)},
            {d(34, 16, 49), d(127, 23, 55)}, {d(34, 24, 41), d(127, 29, 30)}, {d(34, 24, 29), d(127, 48, 21)}, {d(34, 36, 40), d(128, 14, 22)},
            {d(34, 37, 5), d(128, 32, 56)}, {d(35, 8, 0), d(129, 25, 0)}};

    static double d(int deg, int min, int sec) {
        return deg + min / 60.0 + sec / 3600.0;
    }

    /** 경계선에서 이만큼(km) 안이면 앞바다인지 먼바다인지 가리지 않고 둘 다(어항 위경도가 약 1km 단위라). */
    static final double NEAR_LINE_KM = 3;

    /** 순수 함수 - 경계선 바깥(바다 쪽)인가: 선 + 육지 쪽으로 닫은 다각형 밖이면 바깥. */
    static boolean seaward(double lat, double lon) {
        List<double[]> poly = new ArrayList<>(java.util.Arrays.asList(LINE));
        poly.add(new double[] {38.7, 129.6});   // 고리 바깥에서 동해 쪽 위로, 북쪽, 백령도로 닫음(서해 · 남해 어항만 묻는 다각형)
        poly.add(new double[] {38.7, 125.5});
        boolean in = false;
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            double[] a = poly.get(i), b = poly.get(j);
            if ((a[0] > lat) != (b[0] > lat) && lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1]) in = !in;
        }
        return !in;
    }

    /** 순수 함수 - 경계선(별표 5 의 점들을 이은 선)까지 가장 가까운 거리(km, 짧은 거리라 평면으로 셈). */
    static double lineKm(double lat, double lon) {
        double best = Double.MAX_VALUE, kx = 111.32 * Math.cos(Math.toRadians(lat)), ky = 110.57;
        for (int i = 0; i + 1 < LINE.length; i++) {
            double ax = LINE[i][1] * kx, ay = LINE[i][0] * ky, bx = LINE[i + 1][1] * kx, by = LINE[i + 1][0] * ky, px = lon * kx, py = lat * ky;
            double dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
            best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
        }
        return best;
    }

    /**
     * 순수 함수 - 어항 하나의 해상 특보구역 짝. 주소(시 · 군 · 읍면)로 별표 4 의 앞바다, 서해 · 남해에서 경계선 바깥이거나 가까우면 그 바다 먼바다도.
     * 규정에 앞바다가 없는 곳(울릉군 · 신안군 흑산면)은 먼바다만. 규정에서 읍면 안을 나누는 곳(해남 송지면 · 거제 동부면 · 남부면 · 매물도)은 양쪽 모두.
     */
    static List<String> zones(String addr, String name, double lat, double lon) {
        Set<String> z = new LinkedHashSet<>();
        String a = addr.replace("충남 ", "충청남도 ");
        boolean far = false;   // 앞바다 없이 먼바다만
        if (a.startsWith("인천")) {
            if (a.contains("강화군") || a.contains("백령면") || a.contains("대청면") || a.contains("연평면")) z.add("S1251100"); else z.add("S1251200");
        } else if (a.startsWith("경기")) {
            z.add(a.contains("김포시") ? "S1251100" : "S1251200");
        } else if (a.startsWith("충청남도")) {
            z.add(a.contains("보령시") || a.contains("서천군") ? "S1251400" : "S1251300");
        } else if (a.startsWith("전라북도") || a.startsWith("전북")) {
            z.add(a.contains("고창군") || a.contains("부안군") ? "S1231200" : "S1231100");
        } else if (a.startsWith("전라남도") || a.startsWith("전남")) {
            if (a.contains("영광군") || a.contains("함평군")) z.add("S1231300");
            else if (a.contains("신안군") && a.contains("흑산면")) far = true;
            else if (a.contains("목포시") || a.contains("무안군") || a.contains("신안군") || a.contains("영암군")) z.add("S1231400");
            else if (a.contains("진도군")) z.add("S1231500");
            else if (a.contains("해남군")) {
                if (a.contains("화원면") || a.contains("문내면") || a.contains("황산면") || a.contains("산이면") || a.contains("화산면")) z.add("S1231500");
                else if (a.contains("북평면") || a.contains("북일면")) z.add("S1321100");
                else { z.add("S1231500"); z.add("S1321100"); }   // 송지면은 규정이 두 앞바다로 나눔
            } else if (a.contains("강진군") || a.contains("완도군") || a.contains("장흥군")) z.add("S1321100");
            else z.add("S1321200");   // 광양 · 순천 · 여수 · 고흥 · 보성
        } else if (a.startsWith("부산")) {
            z.add("S1311100");
        } else if (a.startsWith("울산")) {
            z.add("S1131100");
        } else if (a.startsWith("경상북도") || a.startsWith("경북")) {
            if (a.contains("울릉군")) far = true;
            else z.add(a.contains("영덕군") || a.contains("울진군") ? "S1131300" : "S1131200");
        } else if (a.startsWith("강원")) {
            z.add(a.contains("강릉시") ? "S1151200" : a.contains("동해시") || a.contains("삼척시") ? "S1151300" : "S1151100");
        } else if (a.startsWith("경상남도") || a.startsWith("경남")) {
            if (a.contains("거제시")) {
                if (a.contains("장목면") || a.contains("하청면") || a.contains("연초면") || a.contains("신현") || a.contains("사등면")) z.add("S1311300");
                else if (a.contains("둔덕면") || a.contains("거제면")) z.add("S1311200");
                else if (a.contains("동부면") || a.contains("남부면")) { z.add("S1311400"); z.add("S1311200"); }   // 규정이 면 안을 나눔
                else z.add("S1311400");   // 옥포 · 아주 · 능포 · 장승포 · 마전 · 일운면
            } else if (a.contains("창원시")) z.add("S1311300");
            else if (a.contains("통영시")) {
                if (a.contains("용남면") || a.contains("광도면")) { z.add("S1311300"); z.add("S1311200"); }
                else if (name.contains("매물도")) { z.add("S1311200"); z.add("S1311400"); }   // 대 · 소매물도를 지나는 선이 경계
                else z.add("S1311200");
            } else if (a.contains("고성군")) {
                z.add(a.contains("거류면") || a.contains("동해면") || a.contains("마암면") || a.contains("회화면") ? "S1311300" : "S1311200");
            } else z.add("S1311200");   // 남해군 · 사천시 · 하동군
        } else if (a.startsWith("제주")) {
            if (a.contains("제주시")) z.add(a.contains("구좌읍") || a.contains("우도면") ? "S1323200" : a.contains("한림읍") || a.contains("한경면") ? "S1323400" : "S1323100");
            else z.add(a.contains("성산읍") || a.contains("표선면") ? "S1323200" : a.contains("대정읍") && lon < SONGAK_LON ? "S1323400" : "S1323300");
        }
        String first = z.isEmpty() ? null : z.iterator().next();
        boolean westSouth = first != null && (first.startsWith("S12") || first.startsWith("S131") || first.startsWith("S132") && !first.startsWith("S1323"));
        if (a.contains("울릉군")) { z.add("S1152010"); z.add("S1152020"); }
        else if (far || westSouth && (seaward(lat, lon) || lineKm(lat, lon) < NEAR_LINE_KM)) z.addAll(offshore(first, lat, lon));
        return new ArrayList<>(z);
    }

    /** 송악산 동단 경도(대정읍을 서부 · 남부로 나누는 규정 기준) - 송악산 동쪽 끝 약 126.29도. */
    static final double SONGAK_LON = 126.29;

    /**
     * 순수 함수 - 그 앞바다 바깥 먼바다(안쪽 · 바깥). 서해남부 북 · 남은 상태도 북단 위도선(북위 34도 27분 08초),
     * 남해서부 서 · 동쪽은 경계가 동경 126.75 ~ 127.15 사이를 지나 그 사이는 둘 다(별표 3).
     */
    static List<String> offshore(String first, double lat, double lon) {
        List<String> out = new ArrayList<>();
        if (first == null || first.startsWith("S123")) {   // 서해남부(앞바다가 없는 흑산면도)
            if (lat >= d(34, 27, 8)) { out.add("S1232110"); out.add("S1232120"); } else { out.add("S1232210"); out.add("S1232220"); }
        } else if (first.startsWith("S125")) { out.add("S1252010"); out.add("S1252020"); }
        else if (first.startsWith("S132")) {
            if (lon <= 127.15) out.add("S1322100");
            if (lon >= 126.75) out.add("S1322200");
        } else if (first.startsWith("S131")) { out.add("S1312010"); out.add("S1312020"); }
        return out;
    }

    /** 순수 함수 - 따옴표 안 쉼표를 아는 CSV 읽기(어촌계명에 "다대, 홍치" 같은 칸). */
    static List<List<String>> csv(String text) {
        if (text.startsWith("﻿")) text = text.substring(1);
        List<List<String>> rows = new ArrayList<>();
        for (String line : text.split("\r?\n")) {
            if (line.isBlank()) continue;
            List<String> row = new ArrayList<>();
            StringBuilder cell = new StringBuilder();
            boolean q = false;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if (q) { if (c == '"') q = false; else cell.append(c); }
                else if (c == '"') q = true;
                else if (c == ',') { row.add(cell.toString()); cell.setLength(0); }
                else cell.append(c);
            }
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }
}
