package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산악회 방(2026-10-20 홍TV님 - 안내 산악회). 흐름: 인솔자가 산행 전에 방을 만들어 예약한 회원에게 코드 · 링크를 보냄 → 회원이 참가(좌석 · 탑승지)
 * → 출발 날 탑승지에서 "버스 탔어요"(또는 인솔자가 좌석표에서) → 인솔자 "출발" 때 안 탄 사람은 취소 → 산행 중 서로 위치(인솔자는 다 봄) · SOS
 * → 하산 뒤 "하산 탑승" → 나가기 · 인솔자가 방 끝내기. 최소 인원이 안 차면 인솔자가 "산행 취소".
 *
 * <ul>
 *   <li>방 정보(이름 · 시각 · 좌석 · 탑승지 · 별명 · 탑승 표시 · 열쇠)는 서버 파일(party.json, 600)에 - 산행 며칠 전에 만든 방이 배포 · 재시작에도 남게.
 *       위치(좌표 · 배터리 · SOS)는 메모리에만, 사람마다 마지막 하나. 방이 끝나면 파일에서도 지움.</li>
 *   <li>위치는 출발 3시간 전부터만 받음(그 전에는 보내도 버림). 회원끼리 서로 위치 · 별명을 보고, 인솔자 · 운전자는 배터리 · 그 자리에 머문 시간까지.</li>
 *   <li>위치정보법 확인자료: 참가 · 나감 · 취소 · 방 끝 · SOS 의 때만 "party" 기록에(좌표 · 별명 없음, 방 안 번호).</li>
 * </ul>
 */
final class Party {

    private static final Logger log = LogManager.getLogger(Party.class);
    private static final Logger audit = LogManager.getLogger("party");

    static final int MAX_ROOMS = 2000, MAX_MEMBERS = 300, MAX_SEATS = 60, MAX_STOPS = 8, MAX_BUSES = 8;
    static final long HOUR = 3600_000L;
    /** 하산 마감(없으면 출발 + 24시간, 그것도 없으면 만든 뒤 30시간) 6시간 뒤 방을 지움. 만든 지 40일이 넘어도. */
    static final long AFTER_END_MS = 6 * HOUR, NO_TIME_MS = 30 * HOUR, MAX_LIFE_MS = 40L * 24 * HOUR;
    /** 위치는 출발 이만큼 전부터 받음. */
    static final long LOC_BEFORE_MS = 3 * HOUR;
    /** 끝난 방의 열쇠로 오면 왜 끝났는지 알려 줌(이만큼 동안). */
    static final long ENDED_KEEP_MS = 48 * HOUR;
    static final double STILL_M = 30;
    static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 헷갈리는 0 · O · 1 · I 뺌

    /** 방이 끝났음(취소 · 끝냄 · 시간 지남) - PartyServlet 이 410 으로. */
    static final class Ended extends RuntimeException {
        private static final long serialVersionUID = 1L;
        Ended(String why) { super(why); }
    }

    static final class Member {
        final int id;
        final String token, nick, role;   // role: lead · hiker · driver
        final Room room;
        final long joinedAt;
        int bus = 1;           // 몇 호차(단풍철 - 한 인솔자가 차 두세 대, 2026-10-20 홍TV님)
        Integer seat;          // 버스 좌석(없으면 null)
        String stop;           // 탑승지
        boolean boarded;       // 출발 때 버스 탐(본인 · 인솔자)
        boolean aboard;        // 하산 뒤 버스 탐
        boolean cancelled;     // 출발 때 안 타서 취소(인솔자가 좌석표에서 "탐" 으로 되돌릴 수 있음)
        // ---- 메모리에만(파일에 안 씀)
        Double lat, lon, acc;
        Integer batt;
        long t;                // 마지막 위치 받은 때(0 = 아직)
        boolean sos;
        double anchorLat, anchorLon;
        long stillSince;

        Member(int id, String token, String nick, String role, Room room, long joinedAt) {
            this.id = id; this.token = token; this.nick = nick; this.role = role; this.room = room; this.joinedAt = joinedAt;
        }

        boolean staff() { return "lead".equals(role) || "driver".equals(role); }
    }

    static final class Room {
        final String code, name;
        final long created, departAt, endAt;   // departAt 출발 · endAt 하산 마감(0 = 없음)
        final int seats, minPeople, buses;   // seats - 차 한 대 좌석 수
        final List<String> stops;
        final String leaderName, leaderPhone;
        final Map<String, Member> members = new LinkedHashMap<>();
        final TreeSet<Integer> reserved = new TreeSet<>();   // 예약됨 - 호차 × 100 + 좌석
        String notice;
        long noticeAt;
        final Map<Integer, double[]> busAt = new java.util.TreeMap<>();   // 호차 → 버스 세운 자리
        final String[] plates;   // 호차 - 1 → 차량번호(null = 아직)
        boolean departed;
        int nextId = 1;

        Room(String code, String name, long created, long departAt, long endAt, int buses, int seats, int minPeople, List<String> stops, String leaderName, String leaderPhone) {
            this.code = code; this.name = name; this.created = created; this.departAt = departAt; this.endAt = endAt; this.buses = Math.max(1, buses); this.seats = seats;
            this.minPeople = minPeople; this.stops = stops; this.leaderName = leaderName; this.leaderPhone = leaderPhone;
            this.plates = new String[this.buses];
        }

        Member atSeat(int bus, int seat) {
            for (Member m : members.values()) if (m.seat != null && m.seat == seat && m.bus == bus && !m.cancelled) return m;
            return null;
        }

        long endBase() {
            return endAt > 0 ? endAt : departAt > 0 ? departAt + 24 * HOUR : created + NO_TIME_MS - AFTER_END_MS;
        }

        boolean expired(long now) {
            return now > endBase() + AFTER_END_MS || now - created > MAX_LIFE_MS;
        }

        /** 산행 회원(취소 빼고). */
        int hikers() {
            int n = 0;
            for (Member m : members.values()) if ("hiker".equals(m.role) && !m.cancelled) n++;
            return n;
        }
    }

    private final SecureRandom rnd = new SecureRandom();
    private final Map<String, Room> rooms = new HashMap<>();
    private final Map<String, Member> byToken = new HashMap<>();
    private final Map<String, String> endedWhy = new HashMap<>();   // 끝난 방 열쇠(또는 "#" + 방 코드 - 새로 들어오려는 사람용) → 까닭
    private final Map<String, Long> endedAt = new HashMap<>();
    /** 방 정보 파일(null = 저장 안 함 - 시험). */
    private final Path file;

    Party(Path file) {
        this.file = file;
        load();
    }

    Party() {
        this(null);
    }

    /** 서버 하나에 하나 - 파일은 설정 party.dir(없으면 stats.dir, 그것도 없으면 톰캣 폴더/routefly-party)/party.json. */
    static final Party STORE = new Party(defaultFile());

    static Path defaultFile() {
        String dir = RouteflyConfig.get("party.dir");
        if (dir == null) dir = RouteflyConfig.get("stats.dir");
        if (dir == null) dir = System.getProperty("catalina.base", System.getProperty("java.io.tmpdir")) + "/routefly-party";
        return Path.of(dir, "party.json");
    }

    String token() {
        byte[] b = new byte[18];
        rnd.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private String newCode() {
        for (int tries = 0; tries < 50; tries++) {
            StringBuilder s = new StringBuilder();
            for (int i = 0; i < 6; i++) s.append(CODE_CHARS.charAt(rnd.nextInt(CODE_CHARS.length())));
            if (!rooms.containsKey(s.toString()) && !endedWhy.containsKey("#" + s)) return s.toString();   // 막 끝난 방 코드도 피함
        }
        throw new IllegalStateException("방 코드를 만들지 못함");
    }

    /** 순수 함수 - 별명 · 방 이름: 줄바꿈 · 탭은 빈칸으로, 꺾쇠 · 따옴표 · 제어 문자는 빼고, 길이 제한. 비면 null. */
    static String clean(String s, int max) {
        if (s == null) return null;
        String t = s.replaceAll("\\s+", " ").replaceAll("[\\p{Cntrl}<>\"'`&]", "").replaceAll(" +", " ").trim();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** 순수 함수 - 연락처: 숫자 · - · + · 빈칸만, 20자까지. */
    static String phone(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[^0-9+\\- ]", "").trim();
        return t.isEmpty() ? null : t.length() > 20 ? t.substring(0, 20) : t;
    }

    /** 순수 함수 - 차량번호: 숫자 · 한글 · 빈칸 · - 만, 12자까지(예: 서울70사1234 · 12가 3456). 다른 글자가 있으면 IllegalArgumentException. */
    static String plate(String s) {
        String t = clean(s, 12);
        if (t == null) return null;
        if (!t.matches("[0-9가-힣 \\-]+") || !t.matches(".*[0-9].*")) throw new IllegalArgumentException("차량번호는 숫자 · 한글로 적어 주세요(예: 12가 3456).");
        return t;
    }

    /** 순수 함수 - 받을 수 있는 좌표(한국 둘레 넉넉히 - 제주 · 독도 · 백령도 포함). */
    static boolean okPos(Double lat, Double lon) {
        return lat != null && lon != null && lat >= 32 && lat <= 39.5 && lon >= 123.5 && lon <= 132.5;
    }

    /** 순수 함수 - 탑승지 목록(쉼표 · 줄바꿈 · 가운뎃점으로 나눔, 8곳 · 곳마다 12자까지, 같은 이름 한 번). */
    static List<String> stops(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        for (String t : text.split("[,\n·]")) {
            String c = clean(t, 12);
            if (c != null && !out.contains(c) && out.size() < MAX_STOPS) out.add(c);
        }
        return out;
    }

    // ---------------------------------------------------------------- 만들기 · 참가

    synchronized Member create(String name, long departAt, long endAt, int buses, int seats, int minPeople, List<String> stops,
                               String leaderName, String leaderPhone, List<String> plates, long now) {
        sweep(now);
        String n = clean(name, 30);
        if (n == null) throw new IllegalArgumentException("산행 이름을 적어 주세요.");
        if (rooms.size() >= MAX_ROOMS) throw new IllegalStateException("지금은 방을 더 만들 수 없습니다. 잠시 뒤 다시 해 주세요.");
        if (seats < 0 || seats > MAX_SEATS) throw new IllegalArgumentException("좌석 수는 0 ~ " + MAX_SEATS + " 입니다.");
        if (buses < 1 || buses > MAX_BUSES) throw new IllegalArgumentException("차량은 1 ~ " + MAX_BUSES + "대입니다.");
        if (minPeople < 0 || minPeople > MAX_MEMBERS) throw new IllegalArgumentException("최소 인원이 올바르지 않습니다.");
        if (departAt > 0 && (departAt < now - 24 * HOUR || departAt > now + 30L * 24 * HOUR)) throw new IllegalArgumentException("출발은 오늘부터 30일 안으로 정해 주세요.");
        if (endAt > 0 && departAt > 0 && endAt <= departAt) throw new IllegalArgumentException("하산 마감은 출발보다 뒤여야 합니다.");
        String lead = clean(leaderName, 12);
        Room r = new Room(newCode(), n, now, departAt, endAt, buses, seats, minPeople, List.copyOf(stops), lead, phone(leaderPhone));
        if (plates != null) for (int i = 0; i < Math.min(plates.size(), r.buses); i++) r.plates[i] = plate(plates.get(i));
        rooms.put(r.code, r);
        Member m = add(r, lead != null ? lead : "인솔자", "lead", now);
        audit.info("create room={} members=1", r.code);
        save();
        return m;
    }

    /** 방 코드로 찾기. 없으면 IllegalArgumentException. */
    synchronized Room room(String code, long now) {
        sweep(now);
        Room r = code == null ? null : rooms.get(code.trim().toUpperCase());
        if (r == null && code != null && endedWhy.containsKey("#" + code.trim().toUpperCase())) throw new Ended("이미 끝난 방입니다 - " + endedWhy.get("#" + code.trim().toUpperCase()));
        if (r == null) throw new IllegalArgumentException("방 코드를 찾지 못했습니다. 인솔자에게 다시 확인해 주세요.");
        return r;
    }

    synchronized Member join(String code, String nick, String role, Integer bus, Integer seat, String stop, long now) {
        Room r = room(code, now);
        String n = clean(nick, 12);
        if (n == null) throw new IllegalArgumentException("별명을 적어 주세요.");
        if (!"hiker".equals(role) && !"driver".equals(role)) throw new IllegalArgumentException("역할을 골라 주세요.");
        if (r.members.size() >= MAX_MEMBERS) throw new IllegalStateException("이 방은 인원이 다 찼습니다(" + MAX_MEMBERS + "명).");
        int b = checkBus(r, bus);
        if ("hiker".equals(role)) checkSeat(r, null, b, seat);
        String st = checkStop(r, stop);
        Member m = add(r, n, role, now);
        m.bus = b;
        m.seat = "driver".equals(role) ? null : seat;
        m.stop = st;
        if (m.seat != null) r.reserved.remove(b * 100 + m.seat);
        audit.info("join room={} member={} role={} (위치 제공 동의)", r.code, m.id, role);
        save();
        return m;
    }

    private static int checkBus(Room r, Integer bus) {
        int b = bus == null ? 1 : bus;
        if (b < 1 || b > r.buses) throw new IllegalArgumentException("호차는 1 ~ " + r.buses + " 입니다.");
        return b;
    }

    /** 호차 이름 - 차가 한 대면 빈 글. */
    static String busName(Room r, int bus) {
        return r.buses > 1 ? bus + "호차 " : "";
    }

    private static void checkSeat(Room r, Member self, int bus, Integer seat) {
        if (seat == null) return;
        if (seat < 1 || seat > r.seats) throw new IllegalArgumentException("좌석 번호는 1 ~ " + r.seats + " 입니다.");
        Member there = r.atSeat(bus, seat);
        if (there != null && there != self) throw new IllegalArgumentException(busName(r, bus) + seat + "번 자리에는 " + there.nick + " 님이 있습니다. 좌석 번호를 확인해 주세요.");
    }

    private static String checkStop(Room r, String stop) {
        String st = clean(stop, 12);
        if (st != null && !r.stops.isEmpty() && !r.stops.contains(st)) throw new IllegalArgumentException("탑승지를 골라 주세요.");
        return st;
    }

    private Member add(Room r, String nick, String role, long now) {
        Member m = new Member(r.nextId++, token(), nick, role, r, now);
        r.members.put(m.token, m);
        byToken.put(m.token, m);
        return m;
    }

    /** 열쇠로 회원 찾기. 끝난 방 열쇠면 Ended(까닭), 모르는 열쇠면 null. */
    synchronized Member who(String token, long now) {
        sweep(now);
        if (token == null) return null;
        Member m = byToken.get(token);
        if (m == null && endedWhy.containsKey(token)) throw new Ended(endedWhy.get(token));
        return m;
    }

    // ---------------------------------------------------------------- 산행 중

    /** 위치 - 출발 3시간 전보다 이르면 버림(false). 취소된 사람은 받지 않음. */
    synchronized boolean loc(Member m, Double lat, Double lon, Double acc, Integer batt, boolean sos, long now) {
        if (!okPos(lat, lon)) throw new IllegalArgumentException("위치가 올바르지 않습니다.");
        if (m.cancelled) throw new IllegalArgumentException("출발 때 탑승하지 않아 이 산행에서 빠졌습니다. 인솔자에게 연락해 주세요.");
        if (m.room.departAt > 0 && now < m.room.departAt - LOC_BEFORE_MS) { m.sos = false; return false; }
        if (m.t == 0 || MountainServlet.distM(m.anchorLat, m.anchorLon, lat, lon) > STILL_M) {
            m.anchorLat = lat; m.anchorLon = lon; m.stillSince = now;
        }
        m.lat = lat; m.lon = lon; m.acc = acc; m.batt = batt == null ? null : Math.max(0, Math.min(100, batt)); m.t = now;
        if (sos && !m.sos) audit.info("sos room={} member={}", m.room.code, m.id);
        m.sos = sos;
        return true;
    }

    /** 본인 - 출발 때 "버스 탔어요". */
    synchronized void board(Member m, boolean on) {
        if (!"hiker".equals(m.role)) throw new IllegalArgumentException("산행 회원만 누릅니다.");
        if (m.cancelled) throw new IllegalArgumentException("출발 때 탑승하지 않아 이 산행에서 빠졌습니다. 인솔자에게 연락해 주세요.");
        m.boarded = on;
        save();
    }

    /** 본인 - 하산 뒤 "하산 탑승"(SOS 도 풂). */
    synchronized void aboard(Member m, boolean on) {
        m.aboard = on;
        if (on) m.sos = false;
        save();
    }

    /** 인솔자 - 출발: 안 탄 산행 회원은 취소(좌석표에서 "탐" 으로 되돌리면 다시 들어옴). 돌려줌: 취소된 수. */
    synchronized int depart(Member lead) {
        Room r = lead.room;
        int n = 0;
        for (Member m : r.members.values()) {
            if ("hiker".equals(m.role) && !m.boarded && !m.cancelled) {
                m.cancelled = true;
                n++;
                audit.info("cancel room={} member={} (출발 때 미탑승)", r.code, m.id);
            }
        }
        r.departed = true;
        save();
        return n;
    }

    /** 자리 · 탑승지 바꾸기 - 회원은 자기 것만, 인솔자 · 운전자는 아무나(targetId). seat null = 자리 빼기. 옮기면 출발 탑승 표시는 새로. */
    synchronized void seat(Member actor, Integer targetId, Integer bus, Integer seat, String stop) {
        Room r = actor.room;
        Member t = target(actor, targetId);
        int b = checkBus(r, bus == null ? t.bus : bus);
        if ("driver".equals(t.role)) { t.bus = b; save(); return; }   // 운전자 - 호차만
        if (!"hiker".equals(t.role)) throw new IllegalArgumentException("자리는 산행 회원만 고릅니다.");
        checkSeat(r, t, b, seat);
        String st = checkStop(r, stop);
        if (seat != null && (!seat.equals(t.seat) || b != t.bus)) t.boarded = false;
        t.bus = b;
        t.seat = seat;
        t.stop = st;
        if (seat != null) r.reserved.remove(b * 100 + seat);
        save();
    }

    private Member target(Member actor, Integer targetId) {
        if (targetId == null || targetId == actor.id) return actor;
        if (!actor.staff()) throw new SecurityException("다른 사람은 인솔자 · 운전자만 바꿀 수 있습니다.");
        for (Member m : actor.room.members.values()) if (m.id == targetId) return m;
        throw new IllegalArgumentException("그 회원을 찾지 못했습니다.");
    }

    /** 인솔자 · 운전자 - 좌석표에서 "출발 탑승"(사람 자리 - 취소도 풂) 또는 "예약됨"(빈자리). */
    synchronized void mark(Member staff, Integer bus, int seat, String what, boolean on) {
        Room r = staff.room;
        int b = checkBus(r, bus);
        if (seat < 1 || seat > r.seats) throw new IllegalArgumentException("없는 좌석입니다.");
        Member m = r.atSeat(b, seat);
        if (m == null) for (Member x : r.members.values()) if (x.seat != null && x.seat == seat && x.bus == b) m = x;   // 취소된 사람도
        if ("boarded".equals(what)) {
            if (m == null) throw new IllegalArgumentException(busName(r, b) + seat + "번 자리에 참가한 사람이 없습니다.");
            m.boarded = on;
            if (on && m.cancelled) { m.cancelled = false; audit.info("uncancel room={} member={}", r.code, m.id); }
        } else if ("reserved".equals(what)) {
            if (m != null && !m.cancelled) throw new IllegalArgumentException(busName(r, b) + seat + "번 자리는 이미 참가했습니다.");
            if (on) r.reserved.add(b * 100 + seat); else r.reserved.remove(b * 100 + seat);
        } else {
            throw new IllegalArgumentException("모르는 표시입니다.");
        }
        save();
    }

    synchronized void notice(Member lead, String text, long now) {
        lead.room.notice = clean(text, 120);
        lead.room.noticeAt = now;
        save();
    }

    /** 차량번호 - 운전자는 자기 호차, 인솔자는 고른 호차(bus). 빈 글이면 지움. */
    synchronized void plate(Member m, Integer bus, String plate) {
        int b = "driver".equals(m.role) ? m.bus : checkBus(m.room, bus);
        m.room.plates[b - 1] = plate(plate);
        save();
    }

    /** 버스 세운 자리 - 운전자는 자기 호차, 인솔자는 고른 호차(bus). */
    synchronized void bus(Member m, Integer bus, Double lat, Double lon) {
        if (!okPos(lat, lon)) throw new IllegalArgumentException("위치가 올바르지 않습니다.");
        int b = "driver".equals(m.role) ? m.bus : checkBus(m.room, bus);
        m.room.busAt.put(b, new double[] {lat, lon});
        save();
    }

    /** 인솔자 - 회원 내보내기(2026-10-20 홍TV님 - 모르는 사람이 들어왔을 때). 그 폰에는 410 + 까닭. 인솔자 자신은 못 내보냄. */
    synchronized void kick(Member lead, int id, long now) {
        Member t = null;
        for (Member x : lead.room.members.values()) if (x.id == id) t = x;
        if (t == null) throw new IllegalArgumentException("이미 나간 사람입니다.");
        if (t == lead || "lead".equals(t.role)) throw new IllegalArgumentException("인솔자는 내보낼 수 없습니다.");
        lead.room.members.remove(t.token);
        byToken.remove(t.token);
        endedWhy.put(t.token, "인솔자가 이 방에서 내보냈습니다. 잘못이면 인솔자에게 연락하세요.");
        endedAt.put(t.token, now);
        audit.info("kick room={} member={}", lead.room.code, t.id);
        save();
    }

    synchronized void leave(Member m) {
        if (m.room.members.remove(m.token) != null) audit.info("leave room={} member={}", m.room.code, m.id);
        byToken.remove(m.token);
        save();
    }

    /** 인솔자 - 방 끝내기 · 산행 취소(cancel). */
    synchronized void end(Member lead, boolean cancel, long now) {
        drop(lead.room, cancel ? "인솔자가 산행을 취소했습니다." : "인솔자가 방을 끝냈습니다. 산행 수고하셨습니다.", now);
        save();
    }

    private void drop(Room r, String why, long now) {
        rooms.remove(r.code);
        for (String t : r.members.keySet()) {
            byToken.remove(t);
            endedWhy.put(t, why);
            endedAt.put(t, now);
        }
        endedWhy.put("#" + r.code, why);   // 방 코드로 새로 들어오려는 사람에게도(48시간, 2026-10-20 PC)
        endedAt.put("#" + r.code, now);
        audit.info("end room={} members={} ({})", r.code, r.members.size(), why);
        r.members.clear();
    }

    synchronized void sweep(long now) {
        boolean changed = false;
        for (Room r : new ArrayList<>(rooms.values())) {
            if (r.expired(now)) { drop(r, "산행 시간이 지나 방이 끝났습니다.", now); changed = true; }
        }
        endedAt.entrySet().removeIf(e -> {
            boolean old = now - e.getValue() > ENDED_KEEP_MS;
            if (old) endedWhy.remove(e.getKey());
            return old;
        });
        if (changed) save();
    }

    synchronized int size() {
        return rooms.size();
    }

    // ---------------------------------------------------------------- 파일(방 정보만 - 위치 없음)

    private void save() {
        if (file == null) return;
        JsonArray arr = new JsonArray();
        for (Room r : rooms.values()) {
            JsonObject o = new JsonObject();
            o.addProperty("code", r.code); o.addProperty("name", r.name); o.addProperty("created", r.created);
            o.addProperty("departAt", r.departAt); o.addProperty("endAt", r.endAt); o.addProperty("buses", r.buses); o.addProperty("seats", r.seats); o.addProperty("minPeople", r.minPeople);
            o.add("stops", strings(r.stops)); o.addProperty("leaderName", r.leaderName); o.addProperty("leaderPhone", r.leaderPhone);
            o.add("plates", plateArray(r));
            JsonArray rs = new JsonArray(); r.reserved.forEach(rs::add); o.add("reserved", rs);
            o.addProperty("notice", r.notice); o.addProperty("noticeAt", r.noticeAt);
            JsonObject ba = new JsonObject();
            r.busAt.forEach((k, v) -> { JsonArray p = new JsonArray(); p.add(v[0]); p.add(v[1]); ba.add(String.valueOf(k), p); });
            o.add("busAt", ba); o.addProperty("departed", r.departed); o.addProperty("nextId", r.nextId);
            JsonArray ms = new JsonArray();
            for (Member m : r.members.values()) {
                JsonObject x = new JsonObject();
                x.addProperty("id", m.id); x.addProperty("token", m.token); x.addProperty("nick", m.nick); x.addProperty("role", m.role); x.addProperty("joinedAt", m.joinedAt);
                x.addProperty("bus", m.bus); x.addProperty("seat", m.seat); x.addProperty("stop", m.stop); x.addProperty("boarded", m.boarded); x.addProperty("aboard", m.aboard); x.addProperty("cancelled", m.cancelled);
                ms.add(x);
            }
            o.add("members", ms);
            arr.add(o);
        }
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling("party.json.tmp");
            Files.writeString(tmp, arr.toString(), StandardCharsets.UTF_8);
            try { Files.setPosixFilePermissions(tmp, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")); } catch (UnsupportedOperationException e) { /* 윈도 */ }
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            log.warn("[PARTY] 방 파일을 쓰지 못함 - {}", e.toString());
        }
    }

    private void load() {
        if (file == null || !Files.isRegularFile(file)) return;
        try {
            for (JsonElement e : JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonArray()) {
                JsonObject o = e.getAsJsonObject();
                List<String> st = new ArrayList<>();
                o.getAsJsonArray("stops").forEach(x -> st.add(x.getAsString()));
                Room r = new Room(o.get("code").getAsString(), o.get("name").getAsString(), o.get("created").getAsLong(), o.get("departAt").getAsLong(),
                        o.get("endAt").getAsLong(), o.has("buses") ? o.get("buses").getAsInt() : 1, o.get("seats").getAsInt(), o.get("minPeople").getAsInt(), List.copyOf(st), str(o, "leaderName"), str(o, "leaderPhone"));
                o.getAsJsonArray("reserved").forEach(x -> r.reserved.add(x.getAsInt()));
                if (o.has("plates")) {
                    JsonArray pa = o.getAsJsonArray("plates");
                    for (int i = 0; i < Math.min(pa.size(), r.buses); i++) r.plates[i] = pa.get(i).isJsonNull() ? null : pa.get(i).getAsString();
                }
                r.notice = str(o, "notice"); r.noticeAt = o.get("noticeAt").getAsLong();
                if (o.has("busAt")) for (var be : o.getAsJsonObject("busAt").entrySet()) {
                    JsonArray p = be.getValue().getAsJsonArray();
                    r.busAt.put(Integer.parseInt(be.getKey()), new double[] {p.get(0).getAsDouble(), p.get(1).getAsDouble()});
                }
                r.departed = o.get("departed").getAsBoolean(); r.nextId = o.get("nextId").getAsInt();
                for (JsonElement me : o.getAsJsonArray("members")) {
                    JsonObject x = me.getAsJsonObject();
                    Member m = new Member(x.get("id").getAsInt(), x.get("token").getAsString(), x.get("nick").getAsString(), x.get("role").getAsString(), r, x.get("joinedAt").getAsLong());
                    m.seat = num(x, "seat") == null ? null : num(x, "seat").intValue();
                    m.bus = x.has("bus") ? x.get("bus").getAsInt() : 1;
                    m.stop = str(x, "stop"); m.boarded = x.get("boarded").getAsBoolean(); m.aboard = x.get("aboard").getAsBoolean(); m.cancelled = x.get("cancelled").getAsBoolean();
                    r.members.put(m.token, m);
                    byToken.put(m.token, m);
                }
                rooms.put(r.code, r);
            }
            log.info("[PARTY] 방 {}개 읽음", rooms.size());
        } catch (Exception e) {
            log.warn("[PARTY] 방 파일을 읽지 못함 - {}", e.toString());
        }
    }

    /** 차량번호 - 호차 차례, 없으면 null. */
    private static JsonArray plateArray(Room r) {
        JsonArray a = new JsonArray();
        for (String p : r.plates) a.add(p);
        return a;
    }

    private static JsonArray strings(List<String> l) {
        JsonArray a = new JsonArray();
        l.forEach(a::add);
        return a;
    }

    private static String str(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : null;
    }

    private static Double num(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsDouble() : null;
    }

    // ---------------------------------------------------------------- 보여 줄 것

    /** 방 소개(참가 전 · 참가 뒤 모두) - 이름 · 시각 · 인솔자 · 인원 · 좌석 수 · 탑승지 · 찬 좌석 번호(누구인지는 없음). */
    private static JsonObject about(Room r, Member me) {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("code", r.code);
        o.addProperty("name", r.name);
        o.addProperty("departAt", r.departAt);
        o.addProperty("endAt", r.endAt);
        o.addProperty("minPeople", r.minPeople);
        o.addProperty("hikers", r.hikers());
        if (r.leaderName != null) o.addProperty("leaderName", r.leaderName);
        if (r.leaderPhone != null) o.addProperty("leaderPhone", r.leaderPhone);
        o.addProperty("buses", r.buses);
        o.add("plates", plateArray(r));
        o.addProperty("seats", r.seats);
        o.add("stops", strings(r.stops));
        JsonArray taken = new JsonArray();   // 호차 × 100 + 좌석
        for (Member m : r.members.values()) if (m.seat != null && !m.cancelled && m != me) taken.add(m.bus * 100 + m.seat);
        o.add("taken", taken);
        o.addProperty("departed", r.departed);
        return o;
    }

    synchronized JsonObject info(String code, long now) {
        return about(room(code, now), null);
    }

    /**
     * 방 화면. 모두: 방 소개 · 공지 · 버스 · 내 상태 · 회원(별명 · 좌석 · 위치 · SOS · 하산 탑승).
     * 인솔자 · 운전자는 더해서: 배터리 · 정확도 · 그 자리에 머문 분 · 탑승지 · 출발 탑승 · 취소 · 예약됨 좌석.
     */
    synchronized JsonObject view(Member me, long now) {
        Room r = me.room;
        boolean staff = me.staff();
        JsonObject o = about(r, me);
        o.addProperty("role", me.role);
        o.addProperty("me", me.id);
        o.addProperty("nick", me.nick);
        o.addProperty("boarded", me.boarded);
        o.addProperty("aboard", me.aboard);
        o.addProperty("cancelled", me.cancelled);
        o.addProperty("bus", me.bus);
        if (me.seat != null) o.addProperty("seat", me.seat);
        if (me.stop != null) o.addProperty("stop", me.stop);
        o.addProperty("now", now);
        o.addProperty("locFrom", r.departAt > 0 ? r.departAt - LOC_BEFORE_MS : 0);
        if (r.notice != null) { o.addProperty("notice", r.notice); o.addProperty("noticeAt", r.noticeAt); }
        JsonArray pins = new JsonArray();   // 버스 세운 자리 - 회원은 자기 호차만, 인솔자 · 운전자는 다
        r.busAt.forEach((k, v) -> {
            if (!staff && k != me.bus) return;
            JsonObject p = new JsonObject();
            p.addProperty("bus", k); p.addProperty("lat", v[0]); p.addProperty("lon", v[1]);
            pins.add(p);
        });
        o.add("busPins", pins);
        o.addProperty("count", r.members.size());
        JsonArray list = new JsonArray();
        int aboard = 0;
        for (Member m : r.members.values()) {
            if (m.cancelled && !staff) continue;
            JsonObject x = new JsonObject();
            x.addProperty("id", m.id);
            x.addProperty("nick", m.nick);
            x.addProperty("role", m.role);
            x.addProperty("bus", m.bus);
            if (m.seat != null) x.addProperty("seat", m.seat);
            x.addProperty("sos", m.sos);
            x.addProperty("aboard", m.aboard);
            if (m.aboard) aboard++;
            if (m.t > 0) {
                x.addProperty("lat", m.lat);
                x.addProperty("lon", m.lon);
                x.addProperty("ago", (now - m.t) / 1000);
            }
            if (staff) {
                x.addProperty("boarded", m.boarded);
                x.addProperty("cancelled", m.cancelled);
                if (m.stop != null) x.addProperty("stop", m.stop);
                if (m.batt != null) x.addProperty("batt", m.batt);
                if (m.t > 0) {
                    if (m.acc != null) x.addProperty("acc", Math.round(m.acc));
                    x.addProperty("stillMin", (now - m.stillSince) / 60000);
                }
            }
            list.add(x);
        }
        o.add("members", list);
        o.addProperty("aboardCount", aboard);
        if (staff) {
            JsonArray rs = new JsonArray();
            r.reserved.forEach(rs::add);
            o.add("reserved", rs);
        }
        return o;
    }
}
