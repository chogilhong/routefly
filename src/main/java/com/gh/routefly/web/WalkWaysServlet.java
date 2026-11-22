package com.gh.routefly.web;

import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
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
 * 우리 서버의 OpenStreetMap 걷는 길(2026-11-22 홍TV님 "방법 1 로 해"). {@code GET /api/walk-ways?bbox=minLon,minLat,maxLon,maxLat}
 *
 * <p>GPX 편집 "길 따라 잇기"(studio.js)가 우리 코스 선 다음으로 씁니다 - 예전에는 브라우저가 공용 Overpass 세 곳에 직접 물어 구간마다 15 ~ 25초 기다리고
 * 자주 실패했음(송산처럼 준비된 코스가 없는 동네 산). 자료는 routefly-batch 가 내 준 칸 파일(WebTiles - 설정 walk.dir, 그 배치의 osm.webDir 과 같은 경로):
 * walk.dir/current.txt(폴더 이름) + 그 폴더의 c_위칸_경칸.tsv(0.05° 칸, 줄 "길번호 \t highway \t access \t foot \t 위도e7,경도e7;…").
 * 답은 Overpass JSON 과 같은 모양이라 RF.osmRoute 를 그대로 씁니다. 노드 번호는 좌표로 매겨 갈림길(같은 좌표)에서 길이 이어집니다.
 * <pre>{success, date, elements:[{type:"node", id, lat, lon} …, {type:"way", id, nodes:[…], tags:{highway, access?, foot?}} …]}</pre>
 * 자료가 없거나(walk.dir 비움 · 배치가 아직 안 내 줌) 범위가 넓으면 실패 - 화면은 예전처럼 공용 Overpass 로.
 * 자료: © OpenStreetMap contributors, ODbL(GPX 편집 지도 출처 표시).</p>
 */
@WebServlet(urlPatterns = {"/api/walk-ways"})
public class WalkWaysServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(WalkWaysServlet.class);

    /** 칸 크기(도) - routefly-batch LocalOsm.CELL 과 같게. */
    static final double CELL = 0.05;
    /** 범위 한도(도) - 구간 하나(두 점 ± 0.004°)는 몇 km 안. 넓으면 칸 수 · 답이 커짐. */
    static final double MAX_SPAN = 0.06;
    /** 길 수 한도(도시 칸) - 넘으면 거기까지만. */
    static final int MAX_WAYS = 6000;
    /** 읽어 둔 칸 파일 크기 합 한도. */
    static final long CACHE_BYTES = 32L << 20;

    private static final LinkedHashMap<File, Tile> CACHE = new LinkedHashMap<>(16, 0.75f, true);
    private static long cacheBytes;

    record Row(String id, String highway, String access, String foot, long[] lat, long[] lon, long[] box) {
    }

    private record Tile(List<Row> rows, long bytes) {
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] b;
        try {
            b = CourseQueries.parseBbox(req.getParameter("bbox"));
        } catch (IllegalArgumentException e) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
            return;
        }
        if (b == null || b[2] - b[0] > MAX_SPAN || b[3] - b[1] > MAX_SPAN) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "bbox 는 꼭 주고, 가로 · 세로 " + MAX_SPAN + "° 안이어야 합니다.");
            return;
        }
        String dir = RouteflyConfig.get("walk.dir");
        File tiles = dir == null ? null : current(new File(dir));
        if (tiles == null) {
            Json.fail(resp, HttpServletResponse.SC_NOT_FOUND, "우리 서버 걷는 길 자료가 없습니다.");
            return;
        }
        try {
            List<Row> rows = new ArrayList<>();
            for (long iy = cell(b[1]); iy <= cell(b[3]); iy++)
                for (long ix = cell(b[0]); ix <= cell(b[2]); ix++) rows.addAll(rows(new File(tiles, "c_" + iy + "_" + ix + ".tsv")));
            JsonObject out = elements(rows, b);
            out.addProperty("success", true);
            out.addProperty("date", tiles.getName());
            resp.setStatus(200);
            resp.setCharacterEncoding("UTF-8");
            resp.setContentType("application/json;charset=UTF-8");
            resp.setHeader("Cache-Control", "public, max-age=86400");   // 자료는 한 달에 한 번쯤 바뀜
            resp.getWriter().write(out.toString());
        } catch (IOException | RuntimeException e) {
            log.warn("[WALK] 읽기 실패 - {}", e.toString());
            Json.fail(resp, HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "길 자료를 읽지 못했습니다.");
        }
    }

    /** walk.dir/current.txt 가 가리키는 칸 폴더(이름이 tiles-… 꼴일 때만 - 다른 경로로 새지 않게). 없으면 null. */
    static File current(File dir) {
        try {
            File cur = new File(dir, "current.txt");
            if (!cur.isFile()) return null;
            String name = Files.readString(cur.toPath(), StandardCharsets.UTF_8).trim();
            if (!name.matches("tiles-[0-9A-Za-z-]{1,80}")) return null;
            File t = new File(dir, name);
            return t.isDirectory() ? t : null;
        } catch (IOException e) {
            return null;
        }
    }

    static long cell(double deg) {
        return (long) Math.floor(deg / CELL);
    }

    /** 칸 파일 줄들(최근 칸은 크기 합 CACHE_BYTES 까지 메모리에). 없으면 빈 목록, 칸이 다섯이 아닌 줄은 뺌. */
    static List<Row> rows(File f) throws IOException {
        synchronized (CACHE) {
            Tile t = CACHE.get(f);
            if (t != null) return t.rows();
        }
        List<Row> out = new ArrayList<>();
        long bytes = 0;
        if (f.isFile()) {
            bytes = f.length();
            for (String line : Files.readAllLines(f.toPath(), StandardCharsets.UTF_8)) {
                Row r = row(line);
                if (r != null) out.add(r);
            }
        }
        synchronized (CACHE) {
            Tile prev = CACHE.put(f, new Tile(out, bytes));
            if (prev != null) cacheBytes -= prev.bytes();
            cacheBytes += bytes;
            Iterator<Map.Entry<File, Tile>> it = CACHE.entrySet().iterator();
            while (cacheBytes > CACHE_BYTES && CACHE.size() > 1 && it.hasNext()) {
                Map.Entry<File, Tile> e = it.next();
                if (e.getKey().equals(f)) break;
                cacheBytes -= e.getValue().bytes();
                it.remove();
            }
        }
        return out;
    }

    /** 순수 함수 - 칸 파일 한 줄 → Row(점 둘 이상). 모양이 다르면 null. */
    static Row row(String line) {
        String[] c = line.split("\t", -1);
        if (c.length != 5 || c[0].isEmpty()) return null;
        String[] pts = c[4].split(";");
        if (pts.length < 2) return null;
        long[] la = new long[pts.length], lo = new long[pts.length];
        long s = Long.MAX_VALUE, n = Long.MIN_VALUE, w = Long.MAX_VALUE, e = Long.MIN_VALUE;
        try {
            for (int i = 0; i < pts.length; i++) {
                int comma = pts[i].indexOf(',');
                la[i] = Long.parseLong(pts[i].substring(0, comma));
                lo[i] = Long.parseLong(pts[i].substring(comma + 1));
                s = Math.min(s, la[i]);
                n = Math.max(n, la[i]);
                w = Math.min(w, lo[i]);
                e = Math.max(e, lo[i]);
            }
        } catch (RuntimeException ex) {
            return null;
        }
        return new Row(c[0], c[1], c[2], c[3], la, lo, new long[] {s, n, w, e});
    }

    /**
     * 순수 함수 - 범위(b = minLon, minLat, maxLon, maxLat)와 둘레 상자가 겹치는 길 → {elements:[…]} (Overpass JSON 꼴).
     * 여러 칸에 있는 같은 길은 한 번, 같은 좌표는 한 노드. 길은 MAX_WAYS 까지.
     */
    static JsonObject elements(List<Row> rows, double[] b) {
        long s0 = Math.round(b[1] * 1e7), w0 = Math.round(b[0] * 1e7), n0 = Math.round(b[3] * 1e7), e0 = Math.round(b[2] * 1e7);
        Map<String, Row> ways = new LinkedHashMap<>();
        for (Row r : rows) {
            if (ways.size() >= MAX_WAYS) break;
            long[] x = r.box();
            if (x[0] <= n0 && x[1] >= s0 && x[2] <= e0 && x[3] >= w0) ways.putIfAbsent(r.id(), r);
        }
        Map<String, Integer> ids = new HashMap<>();
        JsonArray nodes = new JsonArray(), wayArr = new JsonArray();
        int wayNo = 0;
        for (Row r : ways.values()) {
            JsonArray nds = new JsonArray();
            for (int i = 0; i < r.lat().length; i++) {
                String k = r.lat()[i] + "," + r.lon()[i];
                Integer id = ids.get(k);
                if (id == null) {
                    id = ids.size() + 1;
                    ids.put(k, id);
                    JsonObject nd = new JsonObject();
                    nd.addProperty("type", "node");
                    nd.addProperty("id", id);
                    nd.addProperty("lat", BigDecimal.valueOf(r.lat()[i], 7));
                    nd.addProperty("lon", BigDecimal.valueOf(r.lon()[i], 7));
                    nodes.add(nd);
                }
                nds.add(id);
            }
            JsonObject w = new JsonObject(), tags = new JsonObject();
            w.addProperty("type", "way");
            w.addProperty("id", ++wayNo);
            w.add("nodes", nds);
            tags.addProperty("highway", r.highway());
            if (!r.access().isEmpty()) tags.addProperty("access", r.access());
            if (!r.foot().isEmpty()) tags.addProperty("foot", r.foot());
            w.add("tags", tags);
            wayArr.add(w);
        }
        nodes.addAll(wayArr);
        JsonObject out = new JsonObject();
        out.add("elements", nodes);
        return out;
    }
}
