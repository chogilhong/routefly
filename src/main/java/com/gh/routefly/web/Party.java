package com.gh.routefly.web;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 산악회 방(2026-10-20 홍TV님 - 안내 산악회: 인솔자가 회원 위치를 봄). 메모리에만 두고, 산행이 끝나면(인솔자가 끝내기 · 시간이 지나면) 통째로 지웁니다.
 *
 * <ul>
 *   <li>인솔자가 방을 만들면 방 코드(6자) + 인솔자 열쇠. 회원 · 운전자는 방 코드 + 별명 + 위치 제공 동의로 참가 → 각자 열쇠.</li>
 *   <li>위치는 사람마다 마지막 하나만(지난 자취는 두지 않음). 인솔자 · 운전자만 회원 위치를 봄. 회원은 버스 자리 · 공지 · 하산 마감만.</li>
 *   <li>위치정보법 확인자료: 누가 언제 참가(제공 시작) · 나감 · 방 끝(제공 끝)했는지만 "party" 기록에(좌표 없음). 별명 대신 방 안 번호.</li>
 *   <li>위치기반서비스사업 신고 전에는 열지 않음 - 설정 party.enabled=true 일 때만 PartyServlet 이 받음.</li>
 * </ul>
 */
final class Party {

    private static final Logger audit = LogManager.getLogger("party");

    static final int MAX_ROOMS = 2000, MAX_MEMBERS = 80;
    /** 방이 사는 시간 - 만든 뒤 30시간(무박 산행 · 하산 마감이 늦어도 넉넉히). 마감 뒤 6시간이 먼저 오면 그때. */
    static final long LIFE_MS = 30L * 3600_000, AFTER_END_MS = 6L * 3600_000;
    /** 이만큼 넘게 움직이면 "움직임" - 그 자리에 머문 시간을 다시 셈. */
    static final double STILL_M = 30;
    static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 헷갈리는 0 · O · 1 · I 뺌

    static final class Member {
        final int id;
        final String token, nick, role;   // role: lead · hiker · driver
        final Room room;
        final long joinedAt;
        Double lat, lon, acc;
        Integer batt;
        long t;            // 마지막 위치 받은 때(0 = 아직)
        boolean sos, aboard;   // aboard - 하산 뒤 버스 탑승
        Integer seat;          // 버스 좌석(없으면 null)
        String stop;           // 탑승지(사당 · 양재 …)
        boolean boarded;       // 출발 때 탑승지에서 탐(인솔자 · 운전자가 좌석표에서 표시)
        double anchorLat, anchorLon;
        long stillSince;   // 이 자리(STILL_M 안)에 온 때

        Member(int id, String token, String nick, String role, Room room, long now) {
            this.id = id; this.token = token; this.nick = nick; this.role = role; this.room = room; this.joinedAt = now;
        }
    }

    static final class Room {
        final String code, name;
        final long created, endAt;   // endAt - 하산 마감(0 = 없음)
        final Map<String, Member> members = new LinkedHashMap<>();
        String notice;
        long noticeAt;
        Double busLat, busLon;
        int nextId = 1;
        final int seats;                  // 버스 좌석 수(0 = 좌석표 없음)
        final List<String> stops;         // 탑승지 차례
        final java.util.TreeSet<Integer> reserved = new java.util.TreeSet<>();   // 예약됨(아직 참가 안 한 자리) - 인솔자가 좌석표에서 표시

        Room(String code, String name, long endAt, long now, int seats, List<String> stops) {
            this.code = code; this.name = name; this.endAt = endAt; this.created = now; this.seats = seats; this.stops = stops;
        }

        Member atSeat(int seat) {
            for (Member m : members.values()) if (m.seat != null && m.seat == seat) return m;
            return null;
        }

        boolean expired(long now) {
            return now - created > LIFE_MS || (endAt > 0 && now - endAt > AFTER_END_MS);
        }
    }

    private final SecureRandom rnd = new SecureRandom();
    private final Map<String, Room> rooms = new HashMap<>();
    private final Map<String, Member> byToken = new HashMap<>();

    /** 서버 하나에 하나. */
    static final Party STORE = new Party();

    String token() {
        byte[] b = new byte[18];
        rnd.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private String newCode() {
        for (int tries = 0; tries < 50; tries++) {
            StringBuilder s = new StringBuilder();
            for (int i = 0; i < 6; i++) s.append(CODE_CHARS.charAt(rnd.nextInt(CODE_CHARS.length())));
            if (!rooms.containsKey(s.toString())) return s.toString();
        }
        throw new IllegalStateException("방 코드를 만들지 못함");
    }

    /** 순수 함수 - 별명 · 방 이름: 앞뒤 빈칸 빼고, 꺾쇠 · 따옴표 · 제어 문자는 빼고, 길이 제한. 비면 null. */
    static String clean(String s, int max) {
        if (s == null) return null;
        String t = s.replaceAll("\\s+", " ").replaceAll("[\\p{Cntrl}<>\"'`&]", "").replaceAll(" +", " ").trim();   // 줄바꿈 · 탭은 빈칸으로 먼저
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** 순수 함수 - 받을 수 있는 좌표(한국 둘레 넉넉히 - 제주 · 독도 · 백령도 포함). */
    static boolean okPos(Double lat, Double lon) {
        return lat != null && lon != null && lat >= 32 && lat <= 39.5 && lon >= 123.5 && lon <= 132.5;
    }

    static final int MAX_SEATS = 60, MAX_STOPS = 8;

    /** 순수 함수 - 탑승지 목록(쉼표 · 줄바꿈으로 나눔, 8곳 · 곳마다 12자까지, 같은 이름 한 번). */
    static List<String> stops(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        for (String t : text.split("[,\n·]")) {
            String c = clean(t, 12);
            if (c != null && !out.contains(c) && out.size() < MAX_STOPS) out.add(c);
        }
        return out;
    }

    synchronized Member create(String name, long endAt, long now, int seats, List<String> stops) {
        sweep(now);
        String n = clean(name, 30);
        if (n == null) throw new IllegalArgumentException("산행 이름을 적어 주세요.");
        if (rooms.size() >= MAX_ROOMS) throw new IllegalStateException("지금은 방을 더 만들 수 없습니다. 잠시 뒤 다시 해 주세요.");
        if (seats < 0 || seats > MAX_SEATS) throw new IllegalArgumentException("좌석 수는 0 ~ " + MAX_SEATS + " 입니다.");
        Room r = new Room(newCode(), n, endAt, now, seats, List.copyOf(stops));
        rooms.put(r.code, r);
        Member lead = add(r, "인솔자", "lead", now);
        audit.info("create room={} members=1", r.code);
        return lead;
    }

    /** 방 코드로 찾기(참가 화면이 좌석표 · 탑승지를 먼저 보여 주려고). 없으면 IllegalArgumentException. */
    synchronized Room room(String code, long now) {
        sweep(now);
        Room r = code == null ? null : rooms.get(code.trim().toUpperCase());
        if (r == null) throw new IllegalArgumentException("방 코드를 찾지 못했습니다. 인솔자에게 다시 확인해 주세요.");
        return r;
    }

    synchronized Member join(String code, String nick, String role, Integer seat, String stop, long now) {
        Room r = room(code, now);
        String n = clean(nick, 12);
        if (n == null) throw new IllegalArgumentException("별명을 적어 주세요.");
        if (!"hiker".equals(role) && !"driver".equals(role)) throw new IllegalArgumentException("역할을 골라 주세요.");
        if (r.members.size() >= MAX_MEMBERS) throw new IllegalStateException("이 방은 인원이 다 찼습니다(" + MAX_MEMBERS + "명).");
        if (seat != null) {
            if (seat < 1 || seat > r.seats) throw new IllegalArgumentException("좌석 번호는 1 ~ " + r.seats + " 입니다.");
            if (r.atSeat(seat) != null) throw new IllegalArgumentException(seat + "번 자리는 이미 참가한 사람이 있습니다. 좌석 번호를 확인해 주세요.");
        }
        String st = clean(stop, 12);
        if (st != null && !r.stops.isEmpty() && !r.stops.contains(st)) throw new IllegalArgumentException("탑승지를 골라 주세요.");
        Member m = add(r, n, role, now);
        m.seat = "driver".equals(role) ? null : seat;
        m.stop = st;
        if (m.seat != null) r.reserved.remove(m.seat);
        audit.info("join room={} member={} role={} (위치 제공 동의 - 인솔자 · 운전자에게)", r.code, m.id, role);
        return m;
    }

    private Member add(Room r, String nick, String role, long now) {
        Member m = new Member(r.nextId++, token(), nick, role, r, now);
        r.members.put(m.token, m);
        byToken.put(m.token, m);
        return m;
    }

    /** 열쇠로 회원 찾기(지난 방은 지우고 null). */
    synchronized Member who(String token, long now) {
        sweep(now);
        return token == null ? null : byToken.get(token);
    }

    synchronized void loc(Member m, Double lat, Double lon, Double acc, Integer batt, boolean sos, long now) {
        if (!okPos(lat, lon)) throw new IllegalArgumentException("위치가 올바르지 않습니다.");
        if (m.t == 0 || MountainServlet.distM(m.anchorLat, m.anchorLon, lat, lon) > STILL_M) {
            m.anchorLat = lat; m.anchorLon = lon; m.stillSince = now;
        }
        m.lat = lat; m.lon = lon; m.acc = acc; m.batt = batt == null ? null : Math.max(0, Math.min(100, batt)); m.t = now;
        if (sos && !m.sos) audit.info("sos room={} member={}", m.room.code, m.id);
        m.sos = sos;
    }

    synchronized void aboard(Member m, boolean on) {
        m.aboard = on;
        if (on) m.sos = false;
    }

    /** 인솔자 · 운전자 - 좌석표에서 그 자리를 "출발 탑승" (사람이 있으면) 또는 "예약됨"(빈자리) 으로 켜고 끔. */
    synchronized void mark(Member staff, int seat, String what, boolean on) {
        Room r = staff.room;
        if (seat < 1 || seat > r.seats) throw new IllegalArgumentException("없는 좌석입니다.");
        Member m = r.atSeat(seat);
        if ("boarded".equals(what)) {
            if (m == null) throw new IllegalArgumentException(seat + "번 자리에 참가한 사람이 없습니다.");
            m.boarded = on;
        } else if ("reserved".equals(what)) {
            if (m != null) throw new IllegalArgumentException(seat + "번 자리는 이미 참가했습니다.");
            if (on) r.reserved.add(seat); else r.reserved.remove(seat);
        } else {
            throw new IllegalArgumentException("모르는 표시입니다.");
        }
    }

    synchronized void notice(Member lead, String text, long now) {
        lead.room.notice = clean(text, 120);
        lead.room.noticeAt = now;
    }

    synchronized void bus(Member m, Double lat, Double lon) {
        if (!okPos(lat, lon)) throw new IllegalArgumentException("위치가 올바르지 않습니다.");
        m.room.busLat = lat; m.room.busLon = lon;
    }

    synchronized void leave(Member m) {
        if (m.room.members.remove(m.token) != null) audit.info("leave room={} member={}", m.room.code, m.id);
        byToken.remove(m.token);
    }

    synchronized void end(Member lead) {
        drop(lead.room, "인솔자가 끝냄");
    }

    private void drop(Room r, String why) {
        rooms.remove(r.code);
        for (String t : r.members.keySet()) byToken.remove(t);
        audit.info("end room={} members={} ({})", r.code, r.members.size(), why);
        r.members.clear();
    }

    synchronized void sweep(long now) {
        for (Iterator<Room> it = new ArrayList<>(rooms.values()).iterator(); it.hasNext();) {
            Room r = it.next();
            if (r.expired(now)) drop(r, "시간이 지남");
        }
    }

    synchronized int size() {
        return rooms.size();
    }

    // ---------------------------------------------------------------- 보여 줄 것

    /** 참가 전에 보는 것 - 이름 · 좌석 수 · 탑승지 · 찬 좌석 번호(누가 앉았는지는 없음). */
    synchronized JsonObject info(String code, long now) {
        Room r = room(code, now);
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("code", r.code);
        o.addProperty("name", r.name);
        o.addProperty("seats", r.seats);
        JsonArray st = new JsonArray(), taken = new JsonArray();
        r.stops.forEach(st::add);
        for (Member m : r.members.values()) if (m.seat != null) taken.add(m.seat);
        o.add("stops", st);
        o.add("taken", taken);
        return o;
    }

    /** 모두가 보는 것: 방 이름 · 코드 · 하산 마감 · 공지 · 버스 자리 · 내 상태. */
    synchronized JsonObject common(Member me, long now) {
        Room r = me.room;
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("code", r.code);
        o.addProperty("name", r.name);
        o.addProperty("role", me.role);
        o.addProperty("me", me.id);
        o.addProperty("nick", me.nick);
        o.addProperty("aboard", me.aboard);
        o.addProperty("boarded", me.boarded);
        if (me.seat != null) o.addProperty("seat", me.seat);
        if (me.stop != null) o.addProperty("stop", me.stop);
        o.addProperty("endAt", r.endAt);
        o.addProperty("now", now);
        if (r.notice != null) { o.addProperty("notice", r.notice); o.addProperty("noticeAt", r.noticeAt); }
        if (r.busLat != null) { o.addProperty("busLat", r.busLat); o.addProperty("busLon", r.busLon); }
        o.addProperty("count", r.members.size());
        return o;
    }

    /** 인솔자 · 운전자가 보는 것: 위에 더해 회원마다 마지막 위치 · 지난 시간 · 배터리 · SOS · 탑승 · 그 자리에 머문 분. */
    synchronized JsonObject full(Member me, long now) {
        JsonObject o = common(me, now);
        JsonArray list = new JsonArray();
        int aboard = 0;
        for (Member m : me.room.members.values()) {
            JsonObject x = new JsonObject();
            x.addProperty("id", m.id);
            x.addProperty("nick", m.nick);
            x.addProperty("role", m.role);
            x.addProperty("aboard", m.aboard);
            x.addProperty("boarded", m.boarded);
            if (m.seat != null) x.addProperty("seat", m.seat);
            if (m.stop != null) x.addProperty("stop", m.stop);
            x.addProperty("sos", m.sos);
            if (m.aboard) aboard++;
            if (m.t > 0) {
                x.addProperty("lat", m.lat);
                x.addProperty("lon", m.lon);
                if (m.acc != null) x.addProperty("acc", Math.round(m.acc));
                x.addProperty("ago", (now - m.t) / 1000);
                x.addProperty("stillMin", (now - m.stillSince) / 60000);
            }
            if (m.batt != null) x.addProperty("batt", m.batt);
            list.add(x);
        }
        o.add("members", list);
        o.addProperty("seats", me.room.seats);
        JsonArray st = new JsonArray(), rs = new JsonArray();
        me.room.stops.forEach(st::add);
        me.room.reserved.forEach(rs::add);
        o.add("stops", st);
        o.add("reserved", rs);
        o.addProperty("aboardCount", aboard);
        return o;
    }
}
