package com.gh.routefly.web;

import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 들머리 근처 주차장. {@code GET /api/parking?lat=35.79&lon=128.12} - 반경 3km 안 가까운 10곳.
 *
 * <p>2026-10-14 홍TV님 - 공공데이터포털 「전국주차장정보표준데이터」(API 가 아니라 CSV 파일). 파일은 저장소에 넣지 않고
 * 설정 {@code parking.csv}(파일 경로)로 읽어 메모리에 둡니다(약 1~2만 줄). 칸은 이름으로 찾습니다(주차장명 · 위도 · 경도 …).
 * 파일이 UTF-8 이 아니면 MS949(EUC-KR)로 읽습니다. 파일이 없으면 unavailable.
 */
@WebServlet(urlPatterns = {"/api/parking"})
public class ParkingServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(ParkingServlet.class);
    static final double RADIUS_M = 3000;
    static final int MAX = 10;

    private static volatile List<Lot> lots;
    private static volatile String loadedFrom;

    /** 주차장 한 곳. */
    static final class Lot {
        final String name, kind, type, addr, fee;
        final Integer spaces;
        final double lat, lon;

        Lot(String name, String kind, String type, String addr, String fee, Integer spaces, double lat, double lon) {
            this.name = name; this.kind = kind; this.type = type; this.addr = addr; this.fee = fee; this.spaces = spaces; this.lat = lat; this.lon = lon;
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        List<Lot> all = load();
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        if (all == null) {
            out.add("lots", new JsonArray());
            out.addProperty("unavailable", true);
        } else {
            out.add("lots", near(all, at[0], at[1], RADIUS_M, MAX));
            out.addProperty("source", "전국주차장정보표준데이터");
        }
        Json.ok(req, resp, out);
    }

    /** 설정의 파일을 한 번 읽어 둠(경로가 바뀌면 다시). 없거나 못 읽으면 null. */
    private static List<Lot> load() {
        String path = RouteflyConfig.get("parking.csv");
        if (path == null || path.isBlank()) return null;
        if (lots != null && path.equals(loadedFrom)) return lots;
        synchronized (ParkingServlet.class) {
            if (lots != null && path.equals(loadedFrom)) return lots;
            try {
                List<Lot> l = parse(new StringReader(decode(Files.readAllBytes(Path.of(path.trim())))));
                log.info("[PARKING] {} 곳 읽음", l.size());
                lots = l;
                loadedFrom = path;
            } catch (Exception e) {
                log.warn("[PARKING] 파일을 읽지 못함 - {}", e.toString());
                return null;
            }
            return lots;
        }
    }

    /** 순수 함수 - UTF-8(BOM 있어도)로 읽히면 그대로, 아니면 MS949. */
    static String decode(byte[] b) {
        int off = b.length >= 3 && (b[0] & 0xff) == 0xEF && (b[1] & 0xff) == 0xBB && (b[2] & 0xff) == 0xBF ? 3 : 0;
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(b, off, b.length - off)).toString();
        } catch (CharacterCodingException e) {
            return new String(b, Charset.forName("MS949"));
        }
    }

    /** 순수 함수 - CSV(첫 줄 칸 이름) → 주차장. 위도 · 경도가 없거나 우리나라 밖이면 뺌. */
    static List<Lot> parse(Reader r) throws IOException {
        List<List<String>> rows = csv(r);
        List<Lot> out = new ArrayList<>();
        if (rows.isEmpty()) return out;
        Map<String, Integer> col = new HashMap<>();
        List<String> head = rows.get(0);
        for (int i = 0; i < head.size(); i++) col.put(head.get(i).replace("﻿", "").replaceAll("\\s+", ""), i);
        for (int k = 1; k < rows.size(); k++) {
            List<String> row = rows.get(k);
            Double lat = num(get(row, col, "위도")), lon = num(get(row, col, "경도"));
            String name = get(row, col, "주차장명");
            if (lat == null || lon == null || name == null || StaysServlet.parse(String.valueOf(lat), String.valueOf(lon)) == null) continue;
            String addr = get(row, col, "소재지도로명주소");
            if (addr == null) addr = get(row, col, "소재지지번주소");
            Double sp = num(get(row, col, "주차구획수"));
            out.add(new Lot(name, get(row, col, "주차장구분"), get(row, col, "주차장유형"), addr, fee(row, col), sp == null ? null : (int) Math.round(sp), lat, lon));
        }
        return out;
    }

    /** 순수 함수 - "무료" · "유료 · 기본 30분 1,000원" · null. */
    private static String fee(List<String> row, Map<String, Integer> col) {
        String info = get(row, col, "요금정보");
        Double min = num(get(row, col, "주차기본시간")), won = num(get(row, col, "주차기본요금"));
        if (info != null && info.contains("무료")) return "무료";
        if (min != null && won != null && won > 0) return (info != null ? info + " · " : "") + String.format(Locale.KOREA, "기본 %d분 %,d원", Math.round(min), Math.round(won));
        return info;
    }

    /** 순수 함수 - 가까운 차례로 반경 안 max 곳. */
    static JsonArray near(List<Lot> all, double lat, double lon, double radiusM, int max) {
        List<Object[]> hit = new ArrayList<>();
        for (Lot l : all) {
            if (Math.abs(l.lat - lat) > 0.05 || Math.abs(l.lon - lon) > 0.06) continue;   // 먼저 대강 거름
            double d = MountainServlet.distM(lat, lon, l.lat, l.lon);
            if (d <= radiusM) hit.add(new Object[] {l, d});
        }
        hit.sort((a, b) -> Double.compare((Double) a[1], (Double) b[1]));
        JsonArray arr = new JsonArray();
        for (int i = 0; i < hit.size() && i < max; i++) {
            Lot l = (Lot) hit.get(i)[0];
            JsonObject o = new JsonObject();
            o.addProperty("name", l.name);
            if (l.kind != null) o.addProperty("kind", l.kind);
            if (l.type != null) o.addProperty("type", l.type);
            if (l.addr != null) o.addProperty("addr", l.addr);
            if (l.fee != null) o.addProperty("fee", l.fee);
            if (l.spaces != null) o.addProperty("spaces", l.spaces);
            o.addProperty("lat", l.lat);
            o.addProperty("lon", l.lon);
            o.addProperty("dist_m", Math.round((Double) hit.get(i)[1]));
            arr.add(o);
        }
        return arr;
    }

    private static String get(List<String> row, Map<String, Integer> col, String name) {
        Integer i = col.get(name);
        if (i == null || i >= row.size()) return null;
        String v = row.get(i).trim();
        return v.isEmpty() ? null : v;
    }

    private static Double num(String s) {
        if (s == null) return null;
        try {
            double d = Double.parseDouble(s.replace(",", ""));
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 순수 함수 - 따옴표("…" · "" 은 ") 를 아는 CSV 읽기. */
    static List<List<String>> csv(Reader r) throws IOException {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean q = false;
        int ch;
        while ((ch = r.read()) != -1) {
            char c = (char) ch;
            if (q) {
                if (c == '"') {
                    r.mark(1);
                    int n = r.read();
                    if (n == '"') cell.append('"');
                    else { q = false; if (n != -1) { r.reset(); } }
                } else cell.append(c);
            } else if (c == '"') q = true;
            else if (c == ',') { row.add(cell.toString()); cell.setLength(0); }
            else if (c == '\n') { row.add(cell.toString()); cell.setLength(0); rows.add(row); row = new ArrayList<>(); }
            else if (c != '\r') cell.append(c);
        }
        if (cell.length() > 0 || !row.isEmpty()) { row.add(cell.toString()); rows.add(row); }
        return rows;
    }
}
