package com.gh.routefly.web;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 산악회 방 익명 코스 통계(2026-10-21 홍TV님 - "이왕 신고할 거면 DB 에 남겨 더 활용"). 방이 끝나면 산행 회원마다 지나온 길을
 * 누구인지 알 수 없게 만들어(별명 · 열쇠 · 방 코드 · 시각 없음, 출발 · 끝 500m 뺌, 차를 탄 구간 뺌) DB 표 party_track 에 넣습니다.
 * 코스 구간별 실제 걸린 시간 · 많이 다니는 길 · 예상 시간 바로잡기에 씁니다. 표 · 쓰기 권한이 없으면 로그만 남기고 넘어감.
 */
final class PartyTrack {

    private static final Logger log = LogManager.getLogger(PartyTrack.class);
    /** 앞뒤로 자를 길이(m) - 집 · 주차장 같은 출발 · 끝 자리를 남기지 않게. */
    static final double CUT_M = 500;
    /** 이보다 빠른 구간(km/h)은 차 - 뺌. */
    static final double WALK_KMH = 15;
    /** 이보다 짧으면 남기지 않음. */
    static final int MIN_POINTS = 20;
    static final double MIN_M = 1000;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private static final ExecutorService writer = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "routefly-party-track");
        t.setDaemon(true);
        return t;
    });

    private PartyTrack() {
    }

    /**
     * 순수 함수 - 익명 자취. pts 는 [위도, 경도, 받은 때(ms)] 차례. 차를 탄 점(앞 점에서 WALK_KMH 넘게)에서 끊어 가장 긴 걸은 토막만, 그 앞뒤 CUT_M 를 자르고,
     * 시각은 첫 점에서 지난 초로만. 남은 것이 짧으면 null.
     * 돌려줌: {hikeDate, points, distM, durS, path:[[위도, 경도, 초], …]}
     */
    static JsonObject anon(List<double[]> pts) {
        if (pts == null || pts.size() < MIN_POINTS) return null;
        // 차를 탄 점에서 끊어 걸은 토막들로 나누고, 가장 긴 토막(산행)만 씀 - 버스로 가는 길 · 막힌 길에서 선 점이 섞이지 않게
        List<List<double[]>> segs = new ArrayList<>();
        List<double[]> cur = new ArrayList<>();
        for (int i = 0; i < pts.size(); i++) {
            double[] p = pts.get(i);
            if (i > 0) {
                double[] q = pts.get(i - 1);
                double s = (p[2] - q[2]) / 1000;
                if (s <= 0 || MountainServlet.distM(q[0], q[1], p[0], p[1]) / s * 3.6 > WALK_KMH) {   // 차(또는 시각이 거꾸로)
                    if (!cur.isEmpty()) segs.add(cur);
                    cur = new ArrayList<>();
                    continue;
                }
            }
            cur.add(p);
        }
        if (!cur.isEmpty()) segs.add(cur);
        List<double[]> walk = List.of();
        double best = -1;
        for (List<double[]> g : segs) {
            double d = 0;
            for (int i = 1; i < g.size(); i++) d += MountainServlet.distM(g.get(i - 1)[0], g.get(i - 1)[1], g.get(i)[0], g.get(i)[1]);
            if (d > best) { best = d; walk = g; }
        }
        if (walk.size() < MIN_POINTS) return null;
        double[] cum = new double[walk.size()];
        for (int i = 1; i < walk.size(); i++) cum[i] = cum[i - 1] + MountainServlet.distM(walk.get(i - 1)[0], walk.get(i - 1)[1], walk.get(i)[0], walk.get(i)[1]);
        double total = cum[cum.length - 1];
        if (total - 2 * CUT_M < MIN_M) return null;
        List<double[]> keep = new ArrayList<>();
        for (int i = 0; i < walk.size(); i++) if (cum[i] >= CUT_M && cum[i] <= total - CUT_M) keep.add(walk.get(i));
        if (keep.size() < MIN_POINTS) return null;
        double t0 = keep.get(0)[2];
        JsonArray path = new JsonArray();
        double dist = 0;
        for (int i = 0; i < keep.size(); i++) {
            double[] p = keep.get(i);
            if (i > 0) dist += MountainServlet.distM(keep.get(i - 1)[0], keep.get(i - 1)[1], p[0], p[1]);
            JsonArray a = new JsonArray();
            a.add(Math.round(p[0] * 1e5) / 1e5);
            a.add(Math.round(p[1] * 1e5) / 1e5);
            a.add(Math.round((p[2] - t0) / 1000));
            path.add(a);
        }
        JsonObject o = new JsonObject();
        o.addProperty("hikeDate", LocalDate.ofInstant(Instant.ofEpochMilli((long) t0), KST).toString());
        o.addProperty("points", keep.size());
        o.addProperty("distM", Math.round(dist));
        o.addProperty("durS", Math.round((keep.get(keep.size() - 1)[2] - t0) / 1000));
        o.add("path", path);
        return o;
    }

    /** 웹앱이 내려갈 때 - 줄 선 자취를 잠깐(5초) 마저 쓰고 스레드를 멈춤(옛 웹앱이 메모리에 남지 않게, 2026-10-22 점검). */
    static void shutdown() {
        writer.shutdown();
        try {
            if (!writer.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) writer.shutdownNow();
        } catch (InterruptedException e) {
            writer.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    /** DB 에 넣기(뒤에서 - 방 끝내기를 늦추지 않게). 표가 없거나 웹 계정에 쓰기 권한이 없으면 로그만. */
    static void save(JsonObject t) {
        writer.submit(() -> {
            try (java.sql.Connection c = Db.open();
                 java.sql.PreparedStatement ps = c.prepareStatement("INSERT INTO party_track (hike_date, points, dist_m, dur_s, path) VALUES (?, ?, ?, ?, ?)")) {
                ps.setString(1, t.get("hikeDate").getAsString());
                ps.setInt(2, t.get("points").getAsInt());
                ps.setInt(3, t.get("distM").getAsInt());
                ps.setInt(4, t.get("durS").getAsInt());
                ps.setString(5, t.get("path").toString());
                ps.executeUpdate();
            } catch (Exception e) {
                log.warn("[PARTY] 익명 자취를 DB 에 넣지 못함(표 party_track · 쓰기 권한 확인) - {}", e.getClass().getSimpleName());
            }
        });
    }
}
