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

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산악회 방(2026-10-20 홍TV님 - 안내 산악회). 흐름: 인솔자가 산행 전에 방을 만들어 예약한 회원에게 코드 · 링크를 보냄 → 회원이 참가(좌석 · 탑승지)
 * → 출발 날 탑승지에서 "버스 탔어요"(또는 인솔자가 좌석표에서) → 인솔자 "출발" 때 안 탄 사람은 취소 → 산행 중 서로 위치(인솔자는 다 봄) · SOS
 * → 하산 뒤 "하산 탑승" → 나가기 · 인솔자가 방 끝내기. 산행을 안 하게 되면 인솔자가 "산행 취소".
 *
 * <ul>
 *   <li>방 정보(이름 · 시각 · 좌석 · 탑승지 · 별명 · 탑승 표시 · 열쇠)는 서버 파일(party.json, 600)에 - 산행 며칠 전에 만든 방이 배포 · 재시작에도 남게.
 *       위치(좌표 · 배터리 · SOS)는 메모리에만, 사람마다 마지막 하나. 방이 끝나면 파일에서도 지움.</li>
 *   <li>위치는 출발 3시간 전부터만 받음(그 전에는 보내도 버림). 회원끼리 서로 위치 · 별명을 보고, 인솔자는 배터리 · 그 자리에 머문 시간까지.</li>
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
    /** SOS 를 켠 회원(하산 탑승 전)이 있으면 하산 마감 이만큼 뒤까지 방을 남김 - 조난자 위치를 인솔자가 계속 보게(2026-10-21 홍TV님 "조난자가 있으면 도움"). */
    static final long SOS_KEEP_MS = 24 * HOUR;
    /** 하산 마감은 출발 뒤 이 안으로 - 지리산 · 설악산 1박 2일 ~ 3박 4일 종주(2026-10-21 홍TV님, 전엔 48시간). */
    static final long MAX_TRIP_MS = 5 * 24 * HOUR;
    /** 지나온 길(출발 뒤 산행 회원만, 메모리) - 이만큼 움직였을 때 한 점, 사람마다 TRACK_MAX 점까지(넘으면 하나 걸러 버림). 인솔자는 최근 TRAIL_MS 만 봄(조난 대비). */
    static final double TRACK_MIN_M = 10;
    static final int TRACK_MAX = 4000;
    static final long TRAIL_MS = 2 * HOUR;
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
        final String token, nick, role;   // role: lead(인솔자 · 공동 인솔자) · hiker
        final Room room;
        final long joinedAt;
        int bus = 1;           // 몇 호차(단풍철 - 한 인솔자가 차 두세 대, 2026-10-20 홍TV님)
        Integer seat;          // 버스 좌석(없으면 null)
        String stop;           // 탑승지
        /** 하차 지점(2026-10-28 홍TV님 - 회원을 한계령 · 오색 · 소공원 등 여러 곳에 내려 줌, 인솔자도 골라 내려 산행하거나 "버스 대기"). */
        String drop;
        /** 실제로 내린 곳을 어떻게 알았나(2026-10-28 홍TV님 "소공원 골랐다가 한계령에서 갑자기 생각을 바꿔 내리는 경우도"): me(여기서 내려요) · auto(위치) · edit(내린 뒤 회원이 직접 바꿈) · lead(인솔자), null = 계획만. */
        String dropHow;
        /** 실제 하차가 계획과 다를 때 처음 계획(인솔자 명단 "계획: 소공원"). */
        String dropPlan;
        /** 하산 탑승지(2026-10-28 홍TV님 일정표 - 설악동C지구 17:00 · 용대리 17:30 · 남교리 17:35, 곳마다 출발 시각) - 하산 마감 알림이 이 시각으로. */
        String pickup;
        /** 하차 안내에 답한 도착(그 도착 시각) - 같은 안내를 다시 띄우지 않음. 메모리. */
        long arrAns;
        boolean boarded;       // 출발 때 버스 탐(본인 · 인솔자)
        boolean aboard;        // 하산 뒤 버스 탐(따로 귀가도 끝난 것으로 함께 true)
        boolean apart;         // 하산 뒤 버스를 타지 않고 따로 귀가(2026-10-27 홍TV님 - 설악산에서 더 여행하다 오는 회원)
        boolean cancelled;     // 출발 때 안 탐(QR · NFC 도 안 찍고 인솔자 체크도 없음) - 인솔자가 "탔음" 으로 되돌릴 수 있음
        /** 인솔자가 붙여 넣은 예약 명단에서 온 사람(2026-10-24 홍TV님 - 회원은 앱 · 화면을 안 열 수도 있음). */
        boolean rostered;
        /** 명단에만 있고 아직 이 사람 핸드폰이 들어오지 않음 - 위치 없음. 출발 때 안 탔으면 취소(2026-10-27 홍TV님), 핸드폰 없이 탄 사람은 인솔자가 "탔음". */
        boolean listed;
        /** 회사 사무실이 방을 보려고 들어온 자리(2026-10-28) - 보조 자리를 쓰지 않고, 위치를 보내지 않음. */
        boolean office;
        /** 마지막으로 앱에서 보냈나(2026-10-28 홍TV님 "크롬 안에 있는 웹도 보내나?") - 웹은 화면을 끄면 멈추므로 "10분 소식 없음" 경고는 앱 회원만. */
        boolean app;
        // ---- 메모리에만(파일에 안 씀)
        Double lat, lon, acc;
        Integer batt;
        long t;                // 마지막 위치 받은 때(0 = 아직)
        long seen;             // 마지막으로 폰이 살아 있다고 알린 때(위치 · ping - 위치를 못 잡아도, 2026-10-20 PC: 화면 끈 실내)
        boolean sos;
        /** 인솔자에게 한 줄(2026-10-27 홍TV님 - 공지의 반대 방향) - 메모리에만, 방이 끝나면 사라짐. */
        String msg;
        long msgAt;
        /** 인솔자 화면이 이 회원의 위치를 마지막으로 받아 간 때(제3자 제공 - 위치정보법 제19조 제3항 매회 즉시 통보, 2026-10-27 위치정보지원센터 답 · 홍TV님 (가)). */
        long providedAt;
        /** 지나온 길 [위도, 경도, ms] - 메모리에만, 방이 끝나면 익명 통계(PartyTrack)로 넘기고 버림(2026-10-21 홍TV님). */
        final List<double[]> track = new ArrayList<>();
        double anchorLat, anchorLon;
        long stillSince;

        Member(int id, String token, String nick, String role, Room room, long joinedAt) {
            this.id = id; this.token = token; this.nick = nick; this.role = role; this.room = room; this.joinedAt = joinedAt;
        }

        /** 인솔자(방을 만든 사람 · 공동 인솔자 코드로 들어온 회사 관계자). 2026-10-27 홍TV님: 운전자 역할은 없앰(차량 임대로 온 기사님에게 회원 안전 책임이 가지 않게). */
        boolean staff() { return "lead".equals(role); }

        /** 주 인솔자 = 방을 만든 사람(인솔자 가운데 번호가 가장 작은 사람). 나머지 인솔자는 보조(2026-10-28 홍TV님 "주 인솔자, 보조 인솔자"). */
        boolean chief() { return staff() && !office && room.chief() == this; }
    }

    static final class Room {
        final String code, name;
        final long created, departAt, endAt;   // departAt 출발 · endAt 하산 마감(0 = 없음)
        final int seats, buses;   // seats - 차 한 대 좌석 수(최소 인원은 2026-10-26 뺌 - 미달이면 산악회가 미리 취소해 방을 만들 일이 없음)
        final List<String> stops;
        final String leaderName, leaderPhone;
        final Map<String, Member> members = new LinkedHashMap<>();
        String notice;
        long noticeAt;
        /** 탑승지마다 출발 시각 "HH:MM"(없으면 "") - stops 와 같은 차례(2026-10-27 홍TV님 "정각에 출발, 기다려 주지 않아"). */
        List<String> stopTimes = List.of();
        /** 하차 지점(없으면 빈 것) - 회원은 참가할 때 · 인솔자가 명단에서 고름. */
        List<String> drops = List.of();
        /** 하산 탑승지 · 출발 시각 "HH:MM"(없으면 ""), 서울 도착 예정 "HH:MM"(없으면 null). */
        List<String> pickups = List.of(), pickupTimes = List.of();
        String homeTime;
        /** 하차 지점 도착(인솔자 "⬇ 한계령 도착") - [지점, 때, 위도, 경도(없으면 NaN)], 최근 8개. 메모리. */
        final List<Object[]> arrivals = new ArrayList<>();

        Object[] lastArrival() { return arrivals.isEmpty() ? null : arrivals.get(arrivals.size() - 1); }
        final Map<Integer, double[]> busAt = new java.util.TreeMap<>();   // 호차 → 버스 세운 자리
        final String[] plates;   // 호차 - 1 → 차량번호(null = 아직)
        boolean departed;
        /** 출발한 탑승지 수(2026-10-23 홍TV님 "영종에서 태우고 출발, 가면서 중동에서 태우고 출발") - 탑승지 차례대로, 마지막 탑승지를 떠나면 departed. */
        int stopsDone;
        int nextId = 1;
        /** 공동 인솔자 코드(2026-10-27 - 예전 운전자 코드): 방 코드는 카톡 · QR · NFC 로 널리 퍼지므로, 인솔자 권한은 인솔자가 회사 관계자 · 다른 버스 인솔자에게만 주는 이 코드로만. */
        String leadCode;
        /** 주 인솔자 "내 폰에서도 보기" 한 번 쓰는 코드(10분) - 같은 사람으로 들어감(보조 자리를 쓰지 않음). 메모리에만. */
        String meCode;
        long meCodeUntil;
        /** 회사 사무실(회사 코드 · 이름) - 있으면 회사 화면에 올라가고 회원에게도 받는 사람으로 보임(2026-10-28). */
        String officeCode, officeName;
        /** 산행 중 SOS 가 한 번이라도 켜졌나(끝난 산행 요약). */
        boolean sosEver;
        /** 산행 시작한 때 - 사무실 "10분 소식 없음" 은 이때부터 셈(출발 직후 위치를 아직 안 보낸 회원을 바로 세지 않게, 2026-10-28 PC). */
        long departedAt;
        /** 누가 끝냈나(요약) - drop 바로 전에 정함. */
        String endedBy;
        boolean cancelled;
        String cancelWhy;

        Member chief() {
            Member c = null;
            for (Member m : members.values()) if (m.staff() && !m.office && (c == null || m.id < c.id)) c = m;
            return c;
        }

        /** 보조 인솔자 수(주 인솔자 빼고). */
        int assistants() {
            int n = 0;
            for (Member m : members.values()) if (m.staff() && !m.office) n++;
            return Math.max(0, n - 1);
        }

        Room(String code, String name, long created, long departAt, long endAt, int buses, int seats, List<String> stops, String leaderName, String leaderPhone) {
            this.code = code; this.name = name; this.created = created; this.departAt = departAt; this.endAt = endAt; this.buses = Math.max(1, buses); this.seats = seats;
            this.stops = stops; this.leaderName = leaderName; this.leaderPhone = leaderPhone;
            this.plates = new String[this.buses];
            this.busSeats = new int[this.buses];
            java.util.Arrays.fill(this.busSeats, seats);
        }

        /** 호차마다 좌석 수(2026-10-27 홍TV님 "1호차 45인승, 2호차 28인승"). seats 는 그 가운데 가장 큰 값. */
        final int[] busSeats;

        int seatsOf(int bus) {
            return bus >= 1 && bus <= buses ? busSeats[bus - 1] : 0;
        }

        Member atSeat(int bus, int seat) {
            for (Member m : members.values()) if (m.seat != null && m.seat == seat && m.bus == bus && !m.cancelled) return m;
            return null;
        }

        long endBase() {
            return endAt > 0 ? endAt : departAt > 0 ? departAt + 24 * HOUR : created + NO_TIME_MS - AFTER_END_MS;
        }

        /** 방이 저절로 끝나는 때 - 하산 마감 6시간 뒤, SOS 가 켜져 있으면 24시간 뒤. */
        long closesAt() {
            return Math.max(endBase(), homeAt(this)) + (sosOn() ? SOS_KEEP_MS : AFTER_END_MS);   // 서울 도착 예정이 더 늦으면 그 뒤로
        }

        boolean sosOn() {
            for (Member m : members.values()) if (m.sos && !m.aboard && !m.cancelled) return true;
            return false;
        }

        boolean expired(long now) {
            return now > closesAt() || now - created > MAX_LIFE_MS;
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

    /** 방이 끝날 때 익명 자취를 받을 곳(null = 버림 - 시험). */
    private final java.util.function.Consumer<JsonObject> trackSink;

    /** 회원별 확인자료(철회하면 그 사람 것만 지움, 2026-10-27) - party.json 옆 party-log 폴더, 시험은 메모리. */
    final PartyLog memberLog;

    /** 회사 사무실(2026-10-28) - party.json 옆 office.json, 시험은 메모리. */
    final PartyOffice offices;

    Party(Path file, java.util.function.Consumer<JsonObject> trackSink) {
        this.file = file;
        this.trackSink = trackSink;
        this.memberLog = new PartyLog(file == null ? null : file.toAbsolutePath().getParent().resolve("party-log"));
        this.offices = new PartyOffice(file == null ? null : file.toAbsolutePath().getParent().resolve("office.json"));
        load();
    }

    /**
     * 파일 쓰기를 모아서(2026-10-22 점검): 바뀔 때마다 모든 방을 통째로 쓰느라 한 자물쇠 아래 다른 방 요청이 모두 기다렸음.
     * 바뀐 표시만 해 두고 SAVE_MS 마다 한 번 - 쓸 글은 자물쇠 안에서 만들고 디스크 쓰기는 밖에서. 운영(STORE)만, 시험은 바로 씀.
     */
    static final long SAVE_MS = 3000;
    private volatile boolean lazy, dirty;
    private java.util.concurrent.ScheduledExecutorService saver;

    Party lazySave() {
        lazy = true;
        saver = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "routefly-party-save"); t.setDaemon(true); return t; });
        saver.scheduleWithFixedDelay(this::flush, SAVE_MS, SAVE_MS, java.util.concurrent.TimeUnit.MILLISECONDS);
        return this;
    }

    /** 바뀐 것이 있으면 지금 파일로(모아 쓰기 · 내려갈 때). */
    void flush() {
        String text;
        synchronized (this) {
            if (!dirty) return;
            dirty = false;
            text = snapshot();
        }
        write(text);
    }

    /** 웹앱이 내려갈 때 - 남은 것을 쓰고 멈춤(DbShutdown). */
    void shutdown() {
        if (saver != null) saver.shutdownNow();
        flush();
    }

    /** 방 둘러보기(끝난 방 정리)는 이 간격에 한 번(요청마다 모든 방을 훑었음, 2026-10-22 점검). 자기 방이 끝났는지는 who · room 이 바로 봄. */
    static final long SWEEP_MS = 30_000;
    private long lastSweep = Long.MIN_VALUE / 4;   // /4 - 빼기가 넘치지 않게

    Party(Path file) {
        this(file, null);
    }

    Party() {
        this(null, null);
    }

    /** 서버 하나에 하나 - 파일은 설정 party.dir(없으면 stats.dir, 그것도 없으면 톰캣 폴더/routefly-party)/party.json. */
    static final Party STORE = new Party(defaultFile(), PartyTrack::save).lazySave();

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

    private Room byLeadCode(String c) {
        for (Room r : rooms.values()) if (c.equals(r.leadCode)) return r;
        return null;
    }

    private Room byMeCode(String c, long now) {
        for (Room r : rooms.values()) if (c.equals(r.meCode) && now <= r.meCodeUntil) return r;
        return null;
    }

    private String newCode() {
        for (int tries = 0; tries < 50; tries++) {
            StringBuilder s = new StringBuilder();
            for (int i = 0; i < 6; i++) s.append(CODE_CHARS.charAt(rnd.nextInt(CODE_CHARS.length())));
            String c = s.toString();
            if (!rooms.containsKey(c) && !endedWhy.containsKey("#" + c) && byLeadCode(c) == null && byMeCode(c, Long.MIN_VALUE + 1) == null && !offices.has(c)) return c;   // 막 끝난 방 코드 · 공동 인솔자 코드도 피함
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
        if (t.isEmpty()) return null;
        String f = dashes(t);
        return f != null ? f : t.length() > 20 ? t.substring(0, 20) : t;
    }

    /**
     * 순수 함수 - 숫자만 친 우리나라 번호에 - 를 넣음(2026-10-21 홍TV님 "01000000000 → 010-0000-0000"). 모르는 꼴이면 null(그대로 둠).
     * 휴대폰 010-1234-5678 · 011-123-4567, 서울 02-123-4567 · 02-1234-5678, 지역 031-123-4567 · 031-1234-5678, 070 · 050x, 대표번호 1588-1234.
     */
    static String dashes(String s) {
        String d = s.replaceAll("[\\s-]", "");
        if (!d.matches("\\d{8,12}")) return null;
        if (d.matches("1[5-9]\\d{6}")) return d.substring(0, 4) + "-" + d.substring(4);
        if (d.startsWith("02") && (d.length() == 9 || d.length() == 10)) return "02-" + d.substring(2, d.length() - 4) + "-" + d.substring(d.length() - 4);
        if (d.matches("050\\d{9}")) return d.substring(0, 4) + "-" + d.substring(4, 8) + "-" + d.substring(8);
        if (d.matches("0\\d{9,10}")) return d.substring(0, 3) + "-" + d.substring(3, d.length() - 4) + "-" + d.substring(d.length() - 4);
        return null;
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
        for (String[] e : stopEntries(text)) out.add(e[0]);
        return out;
    }

    /** 순수 함수 - 탑승지마다 출발 시각 "HH:MM"(없으면 ""). "사당 17:00, 양재 17시20분, 복정" → ["17:00", "17:20", ""]. stops 와 같은 차례. */
    static List<String> stopTimes(String text) {
        List<String> out = new ArrayList<>();
        for (String[] e : stopEntries(text)) out.add(e[1]);
        return out;
    }

    private static final java.util.regex.Pattern STOP_TIME = java.util.regex.Pattern.compile("(?<!\\d)([01]?\\d|2[0-3])\\s*(?:[:.]|시)\\s*([0-5]\\d)?\\s*분?(?!\\d)");

    private static List<String[]> stopEntries(String text) {
        List<String[]> out = new ArrayList<>();
        if (text == null) return out;
        List<String> names = new ArrayList<>();
        for (String t : text.split("[,\n·]")) {
            String time = "";
            java.util.regex.Matcher m = STOP_TIME.matcher(t);
            if (m.find()) {
                time = String.format("%02d:%s", Integer.parseInt(m.group(1)), m.group(2) == null ? "00" : m.group(2));
                t = t.substring(0, m.start()) + t.substring(m.end());
            }
            String c = clean(t, 12);
            if (c != null && !names.contains(c) && out.size() < MAX_STOPS) { names.add(c); out.add(new String[] {c, time}); }
        }
        return out;
    }

    /** 방 만들 때 탑승지 시각(PartyServlet - create 다음). 이름 수와 다르면 버림. */
    synchronized void stopTimes(Member lead, List<String> times) {
        Room r = lead.room;
        r.stopTimes = times != null && times.size() == r.stops.size() && times.stream().anyMatch(x -> !x.isEmpty()) ? List.copyOf(times) : List.of();
        save();
    }

    // ---------------------------------------------------------------- 만들기 · 참가

    synchronized Member create(String name, long departAt, long endAt, int buses, int seats, List<String> stops,
                               String leaderName, String leaderPhone, List<String> plates, long now) {
        return create(name, departAt, endAt, buses, seats, null, stops, leaderName, leaderPhone, plates, now);
    }

    /** busSeats - 호차마다 좌석 수(없거나 모자라면 seats). */
    synchronized Member create(String name, long departAt, long endAt, int buses, int seats, List<Integer> busSeats, List<String> stops,
                               String leaderName, String leaderPhone, List<String> plates, long now) {
        sweep(now);
        String n = clean(name, 30);
        if (n == null) throw new IllegalArgumentException("산행 이름을 적어 주세요.");
        if (rooms.size() >= MAX_ROOMS) throw new IllegalStateException("지금은 방을 더 만들 수 없습니다. 잠시 뒤 다시 해 주세요.");
        if (seats < 0 || seats > MAX_SEATS) throw new IllegalArgumentException("좌석 수는 0 ~ " + MAX_SEATS + " 입니다.");
        int[] per = new int[Math.max(1, buses)];
        for (int i = 0; i < per.length; i++) {
            per[i] = busSeats != null && i < busSeats.size() && busSeats.get(i) != null ? busSeats.get(i) : seats;
            if (per[i] < 0 || per[i] > MAX_SEATS) throw new IllegalArgumentException("좌석 수는 0 ~ " + MAX_SEATS + " 입니다.");
        }
        int maxSeats = java.util.Arrays.stream(per).max().orElse(0);
        // 인솔자 연락처는 꼭(2026-10-27 홍TV님 - 회원 따라가기의 "☎ 인솔자" · 출발 때 빠진 회원 연락)
        if (phone(leaderPhone) == null) throw new IllegalArgumentException("인솔자 연락처를 적어 주세요(회원이 산에서 인솔자에게 전화할 때 씁니다).");
        if (buses < 1 || buses > MAX_BUSES) throw new IllegalArgumentException("차량은 1 ~ " + MAX_BUSES + "대입니다.");
        if (departAt < 0 || endAt < 0) throw new IllegalArgumentException("시각이 올바르지 않습니다.");
        if (departAt > 0 && (departAt < now - 24 * HOUR || departAt > now + 30L * 24 * HOUR)) throw new IllegalArgumentException("출발은 오늘부터 30일 안으로 정해 주세요.");
        // 출발 시각 없이 하산 마감만 - 지난 때 · 너무 먼 때는 받지 않음(점검: 방이 40일 동안 남았음)
        if (endAt > 0 && departAt == 0 && (endAt <= now || endAt > now + 30L * 24 * HOUR + MAX_TRIP_MS)) throw new IllegalArgumentException("하산 마감은 지금부터 35일 안으로 정해 주세요.");
        if (endAt > 0 && departAt > 0 && endAt <= departAt) throw new IllegalArgumentException("하산 마감은 출발보다 뒤여야 합니다.");
        if (endAt > 0 && departAt > 0 && endAt > departAt + MAX_TRIP_MS) throw new IllegalArgumentException("하산 마감은 출발 뒤 5일 안으로 정해 주세요(3박 4일까지).");   // 방이 40일 동안 남지 않게(점검)
        String lead = clean(leaderName, 12);
        Room r = new Room(newCode(), n, now, departAt, endAt, buses, maxSeats, List.copyOf(stops), lead, phone(leaderPhone));
        System.arraycopy(per, 0, r.busSeats, 0, Math.min(per.length, r.busSeats.length));
        if (plates != null) for (int i = 0; i < Math.min(plates.size(), r.buses); i++) r.plates[i] = plate(plates.get(i));
        do r.leadCode = newCode(); while (r.leadCode.equals(r.code));   // 방 코드와 같으면 모두 인솔자로 들어옴(점검)
        rooms.put(r.code, r);
        Member m = add(r, lead != null ? lead : "인솔자", "lead", now);
        audit.info("create room={} members=1", r.code);
        save();
        return m;
    }

    /** 방 코드(또는 공동 인솔자 코드)로 찾기. 없으면 IllegalArgumentException. */
    synchronized Room room(String code, long now) {
        sweep(now);
        if (code != null) { Room hit = rooms.get(code.trim().toUpperCase()); if (hit == null) hit = byLeadCode(code.trim().toUpperCase()); if (hit != null && hit.expired(now)) sweep(now, true); }
        Room r = code == null ? null : rooms.get(code.trim().toUpperCase());
        if (r == null && code != null) r = byLeadCode(code.trim().toUpperCase());
        if (r == null && code != null) r = byMeCode(code.trim().toUpperCase(), now);
        if (r == null && code != null && String.valueOf(endedWhy.get("#" + code.trim().toUpperCase())).startsWith("인솔자 코드가 바뀌"))
            throw new IllegalArgumentException(endedWhy.get("#" + code.trim().toUpperCase()));   // 바뀐 옛 인솔자 코드 - 방은 그대로
        if (r == null && code != null && endedWhy.containsKey("#" + code.trim().toUpperCase())) throw new Ended("이미 끝난 방입니다 - " + endedWhy.get("#" + code.trim().toUpperCase()));
        if (r == null) throw new IllegalArgumentException("방 코드를 찾지 못했습니다. 인솔자에게 다시 확인해 주세요.");
        return r;
    }

    synchronized Member join(String code, String nick, String role, Integer bus, Integer seat, String stop, long now) {
        return join(code, nick, role, bus, seat, stop, false, now);
    }

    /**
     * 참가. onBus - 버스에 붙인 QR · NFC 로 들어옴(2026-10-24 홍TV님): 출발 1시간 전부터면 "버스 탔어요" 까지 한 번에.
     * 인솔자 명단에 같은 이름이 있으면 그 사람으로 들어옴(좌석 · 탑승지 그대로). 같은 이름이 둘 넘으면 좌석 번호로 가림.
     */
    synchronized Member join(String code, String nick, String role, Integer bus, Integer seat, String stop, boolean onBus, long now) {
        Room r = room(code, now);
        String up = code.trim().toUpperCase();
        if (up.equals(r.meCode) && now <= r.meCodeUntil) {   // 주 인솔자 내 폰 - 같은 사람(한 번만)
            r.meCode = null;
            Member c = r.chief();
            if (c == null) throw new IllegalStateException("주 인솔자가 없는 방입니다.");
            return c;
        }
        String n = clean(nick, 12);
        if (n == null) throw new IllegalArgumentException("이름을 적어 주세요.");
        // 역할은 코드가 정함 - 공동 인솔자 코드면 인솔자, 방 코드면 산행 회원(보낸 role 은 보지 않음)
        role = code.trim().toUpperCase().equals(r.leadCode) ? "lead" : "hiker";
        boolean boardNow = onBus && !r.departed;   // 버스 안 QR · NFC 로 들어오면 출발 탑승(2026-10-27 홍TV님 - "버스 탔어요" 단추는 없앰)
        if ("hiker".equals(role)) {
            Member c = claim(r, n, bus, seat, stop, boardNow, now);
            if (c != null) return c;
        }
        // 출발한 방에는 산행 회원이 새로 못 들어옴(2026-10-20 홍TV님 - 하산 탑승한 폰이 같은 링크로 또 참가됐음). 공동 인솔자는 됨
        if (r.departed && "hiker".equals(role)) throw new IllegalStateException("이미 출발한 방이라 새로 참가할 수 없습니다. 인솔자에게 연락해 주세요.");
        if (r.members.size() >= MAX_MEMBERS) throw new IllegalStateException("이 방은 인원이 다 찼습니다(" + MAX_MEMBERS + "명).");
        if ("lead".equals(role) && r.assistants() >= r.buses)   // 보조 인솔자는 차량 수만큼(2026-10-28 홍TV님)
            throw new IllegalStateException("보조 인솔자 자리가 다 찼습니다(차량 " + r.buses + "대 - " + r.buses + "명). 주 인솔자에게 확인해 주세요.");
        int b = checkBus(r, bus);
        if ("hiker".equals(role)) checkSeat(r, null, b, seat);
        String st = checkStop(r, stop);
        Member m = add(r, n, role, now);
        m.bus = b;
        m.seat = "lead".equals(role) ? null : seat;
        m.stop = st;
        if (boardNow && "hiker".equals(role)) m.boarded = true;
        memberLog.add(now, r.code, m.id, "join role=" + role);   // 위치 제공 동의
        save();
        return m;
    }

    /** 이름 비교 - 빈칸은 빼고. */
    private static String nameKey(String s) {
        return s == null ? "" : s.replace(" ", "");
    }

    /** 명단에 있는 사람이면 그 사람으로(아직 핸드폰이 안 들어온 사람만). 없으면 null. */
    private Member claim(Room r, String n, Integer bus, Integer seat, String stop, boolean boardNow, long now) {
        List<Member> same = new ArrayList<>();
        for (Member x : r.members.values()) if (x.listed && !x.cancelled && nameKey(x.nick).equals(nameKey(n))) same.add(x);
        if (same.isEmpty()) return null;
        Member pick = null;
        if (same.size() == 1) pick = same.get(0);
        else if (seat != null) for (Member x : same) if (x.seat != null && x.seat.intValue() == seat && (bus == null || x.bus == bus)) pick = x;
        if (pick == null) throw new IllegalArgumentException("명단에 \"" + n + "\" 이(가) " + same.size() + "명 있습니다. 좌석 번호도 함께 넣어 주세요.");
        if (pick.seat == null && seat != null) {
            int b = checkBus(r, bus);
            checkSeat(r, pick, b, seat);
            pick.bus = b;
            pick.seat = seat;
        }
        String st = checkStop(r, stop);
        if (st != null) pick.stop = st;
        pick.listed = false;
        if (boardNow) pick.boarded = true;
        memberLog.add(now, r.code, pick.id, "join role=hiker roster");   // 명단 사람 · 위치 제공 동의
        save();
        return pick;
    }

    /**
     * 인솔자 - 예약 명단 붙여 넣기(2026-10-24 홍TV님 "일식이 5 이식이 6 삼식이 7"). 이름 뒤 숫자는 좌석, "2-15" 는 2호차 15번, 숫자가 없으면 자리 없이.
     * 이름만 받습니다(연락처 없음). 이미 있는 같은 이름 · 같은 자리는 건너뜀. 돌려줌: 새로 넣은 사람 수.
     */
    synchronized int roster(Member lead, String text, long now) {
        Room r = lead.room;
        List<Object[]> es = rosterParse(text);
        if (es.isEmpty()) throw new IllegalArgumentException("명단을 읽지 못했습니다. \"홍길동 5 김철수 6\" 처럼 이름(과 좌석 번호)을 적어 주세요.");
        if (r.members.size() + es.size() > MAX_MEMBERS) throw new IllegalStateException("이 방은 " + MAX_MEMBERS + "명까지입니다.");
        java.util.Set<Integer> used = new java.util.HashSet<>();
        List<Object[]> add = new ArrayList<>();
        for (Object[] e : es) {
            String n = (String) e[0];
            int b = (Integer) e[1];
            Integer seat = (Integer) e[2];
            boolean dup = false;
            for (Member x : r.members.values()) if (nameKey(x.nick).equals(nameKey(n)) && x.bus == b && java.util.Objects.equals(x.seat, seat)) dup = true;
            if (dup) continue;
            try {
                checkBus(r, b);
                checkSeat(r, null, b, seat);
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException(n + ": " + ex.getMessage());
            }
            if (seat != null && !used.add(b * 100 + seat)) throw new IllegalArgumentException(n + ": " + busName(r, b) + seat + "번이 명단에 두 번 있습니다.");
            add.add(e);
        }
        for (Object[] e : add) {
            Member m = add(r, (String) e[0], "hiker", now);
            m.bus = (Integer) e[1];
            m.seat = (Integer) e[2];
            m.rostered = true;
            m.listed = true;
        }
        audit.info("roster room={} added={}", r.code, add.size());
        save();
        return add.size();
    }

    /** 순수 함수 - 명단 글 → [이름, 호차, 좌석(null)]. "일식이 5 이식이6 삼식이 2-7 사식이" · 줄 · 쉼표 나눔, "5번" 도 됨. */
    static List<Object[]> rosterParse(String text) {
        List<Object[]> out = new ArrayList<>();
        if (text == null) return out;
        java.util.regex.Pattern busSeat = java.util.regex.Pattern.compile("(?:(\\d{1,2})-)?(\\d{1,3})번?");
        java.util.regex.Pattern nameNum = java.util.regex.Pattern.compile("(.*?\\D)((?:\\d{1,2}-)?\\d{1,3})번?");
        for (String t : text.split("[\\s,·;/]+")) {
            if (t.isEmpty()) continue;
            java.util.regex.Matcher m = busSeat.matcher(t);
            if (m.matches()) {   // 앞 이름의 좌석
                if (out.isEmpty()) continue;
                Object[] last = out.get(out.size() - 1);
                if (last[2] != null) continue;
                last[1] = m.group(1) == null ? 1 : Integer.parseInt(m.group(1));
                last[2] = Integer.parseInt(m.group(2));
                continue;
            }
            String name = t, num = null;
            java.util.regex.Matcher nm = nameNum.matcher(t);
            if (nm.matches()) { name = nm.group(1); num = nm.group(2); }
            name = clean(name, 12);
            if (name == null) continue;
            Object[] e = {name, 1, null};
            if (num != null) {
                java.util.regex.Matcher bm = busSeat.matcher(num);
                if (bm.matches()) { e[1] = bm.group(1) == null ? 1 : Integer.parseInt(bm.group(1)); e[2] = Integer.parseInt(bm.group(2)); }
            }
            out.add(e);
        }
        return out;
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

    /**
     * 이 회원의 위치를 받기 시작하는 때(2026-10-27 홍TV님 - 전엔 출발 3시간 전부터라 집 위치가 인솔자에게 갔음): 자기 탑승지 출발 시각 또는 버스에 탄 때(QR · NFC · 인솔자 체크) 가운데 먼저 오는 때.
     * 뒤 탑승지 회원은 첫 탑승지 출발 시각에 아직 집일 수 있음. 탑승지 시각이 없으면 방 출발 시각. 산행 시작 뒤에는 모두.
     */
    static boolean started(Member m, long now) {
        Room r = m.room;
        if (r.departed || m.boarded || r.departAt == 0) return true;
        long at = stopAt(r, m.stop);
        return now >= (at > 0 ? at : r.departAt);
    }

    /** 탑승지 출발 시각(ms) - 방 출발 날의 HH:MM, 방 출발보다 이르면 다음 날(자정을 넘는 경우). 시각이 없으면 0. */
    static long stopAt(Room r, String stop) {
        int i = stop == null ? -1 : r.stops.indexOf(stop);
        if (i < 0 || r.stopTimes.isEmpty() || r.stopTimes.get(i).isEmpty() || r.departAt == 0) return 0;
        String[] hm = r.stopTimes.get(i).split(":");
        java.time.ZonedDateTime d = java.time.Instant.ofEpochMilli(r.departAt).atZone(java.time.ZoneId.of("Asia/Seoul"))
                .withHour(Integer.parseInt(hm[0])).withMinute(Integer.parseInt(hm[1])).withSecond(0).withNano(0);
        long t = d.toInstant().toEpochMilli();
        return t < r.departAt - 12 * HOUR ? t + 24 * HOUR : t;
    }

    /** 그 시각 "HH:MM" 을 base 날(서울 시각)에 놓은 ms. */
    private static long onDay(long base, String hhmm) {
        String[] hm = hhmm.split(":");
        return java.time.Instant.ofEpochMilli(base).atZone(java.time.ZoneId.of("Asia/Seoul"))
                .withHour(Integer.parseInt(hm[0])).withMinute(Integer.parseInt(hm[1])).withSecond(0).withNano(0).toInstant().toEpochMilli();
    }

    /** 하산 탑승지 출발 때(ms, 없으면 0) - 하산 마감 날 기준(±12시간 안으로), 하산 마감이 없으면 출발 뒤 첫 그 시각. */
    static long pickupAt(Room r, String pickup) {
        int i = pickup == null ? -1 : r.pickups.indexOf(pickup);
        if (i < 0 || i >= r.pickupTimes.size() || r.pickupTimes.get(i).isEmpty()) return 0;
        if (r.endAt > 0) {
            long t = onDay(r.endAt, r.pickupTimes.get(i));
            return t > r.endAt + 12 * HOUR ? t - 24 * HOUR : t < r.endAt - 12 * HOUR ? t + 24 * HOUR : t;
        }
        if (r.departAt == 0) return 0;
        long t = onDay(r.departAt, r.pickupTimes.get(i));
        return t < r.departAt ? t + 24 * HOUR : t;
    }

    /** 서울 도착 예정(ms, 없으면 0) - 마지막 하산 탑승(없으면 하산 마감) 뒤 첫 그 시각. */
    static long homeAt(Room r) {
        if (r.homeTime == null) return 0;
        long base = r.endAt;
        for (String p : r.pickups) base = Math.max(base, pickupAt(r, p));
        if (base == 0) base = r.departAt;
        if (base == 0) return 0;
        long t = onDay(base, r.homeTime);
        return t < base - HOUR ? t + 24 * HOUR : t;
    }

    /** 그 회원의 하산 마감 - 하산 탑승지 시각, 없으면 방 하산 마감. */
    static long deadline(Member m) {
        long p = pickupAt(m.room, m.pickup);
        return p > 0 ? p : m.room.endAt;
    }

    /** 인솔자 - 하산 탑승지 · 서울 도착 예정(방 만들 때). text 는 "설악동C지구 17:00, 용대리 17:30". */
    synchronized void pickups(Member lead, String text, String home) {
        if (!lead.staff()) throw new SecurityException("인솔자만 정합니다.");
        Room r = lead.room;
        List<String> names = stops(text), times = stopTimes(text);
        int n = Math.min(names.size(), MAX_STOPS);
        r.pickups = List.copyOf(names.subList(0, n));
        r.pickupTimes = List.copyOf(times.subList(0, n));
        String h = home == null ? null : home.trim();
        List<String> ht = h == null || h.isEmpty() ? List.of() : stopTimes("x " + h);
        r.homeTime = ht.isEmpty() || ht.get(0).isEmpty() ? null : ht.get(0);
        save();
    }

    /** 하산 탑승지 고르기 - id 가 없으면 나, 있으면 인솔자가 그 사람(빈 값 = 지움). */
    synchronized void pickup(Member actor, Integer id, String pickup) {
        Member t = actor;
        if (id != null && id != actor.id) {
            if (!actor.staff()) throw new SecurityException("다른 사람의 하산 탑승지는 인솔자만 바꿉니다.");
            t = null;
            for (Member x : actor.room.members.values()) if (x.id == id) t = x;
            if (t == null) throw new IllegalArgumentException("이미 나간 사람입니다.");
        }
        t.pickup = checkPickup(actor.room, pickup);
        save();
    }

    private static String checkPickup(Room r, String pickup) {
        String p = clean(pickup, 12);
        if (p != null && !r.pickups.contains(p)) throw new IllegalArgumentException("하산 탑승지를 골라 주세요.");
        return p;
    }

    /** 참가 전에 하산 탑승지 확인. */
    synchronized void checkPickup(String code, String pickup, long now) {
        checkPickup(room(code, now), pickup);
    }

    private static void checkSeat(Room r, Member self, int bus, Integer seat) {
        if (seat == null) return;
        if (r.seatsOf(bus) == 0) throw new IllegalArgumentException(busName(r, bus) + "좌석표가 없는 차입니다. 좌석 없이 참가해 주세요.");
        if (seat < 1 || seat > r.seatsOf(bus)) throw new IllegalArgumentException(busName(r, bus) + "좌석 번호는 1 ~ " + r.seatsOf(bus) + " 입니다.");
        Member there = r.atSeat(bus, seat);
        if (there != null && there != self) throw new IllegalArgumentException(busName(r, bus) + seat + "번 자리는 이미 다른 분이 골랐습니다. 좌석 번호를 확인해 주세요.");   // 참가 전 사람에게 별명은 안 보임(점검)
    }

    /** 버스에 남음(몸이 안 좋을 때 · 인솔자 대기) - 하차 지점 목록에 없어도 됨. */
    static final String BUS_STAY = "버스 대기";

    private static String checkDrop(Room r, String drop) {
        String d = clean(drop, 12);
        if (d != null && !BUS_STAY.equals(d) && !r.drops.contains(d)) throw new IllegalArgumentException("하차 지점을 골라 주세요.");
        return d;
    }

    /** 참가 전에 하차 지점 확인(틀리면 사람이 들어가기 전에 막음). */
    synchronized void checkDrop(String code, String drop, long now) {
        checkDrop(room(code, now), drop);
    }

    /** 인솔자 - 하차 지점 목록(방 만들 때). */
    synchronized void drops(Member lead, List<String> drops) {
        if (!lead.staff()) throw new SecurityException("인솔자만 정합니다.");
        lead.room.drops = drops == null ? List.of() : List.copyOf(drops.subList(0, Math.min(drops.size(), MAX_STOPS)));
        save();
    }

    /** 하차 지점 고르기 - id 가 없으면 나, 있으면 인솔자가 그 사람(빈 값 = 지움). */
    synchronized void drop(Member actor, Integer id, String drop) {
        Member t = actor;
        if (id != null && id != actor.id) {
            if (!actor.staff()) throw new SecurityException("다른 사람의 하차 지점은 인솔자만 바꿉니다.");
            t = null;
            for (Member x : actor.room.members.values()) if (x.id == id) t = x;
            if (t == null) throw new IllegalArgumentException("이미 나간 사람입니다.");
        }
        String d = checkDrop(actor.room, drop);
        if (actor.room.arrivals.isEmpty()) { t.drop = d; t.dropHow = null; t.dropPlan = null; }   // 내리기 전 - 계획 바꾸기
        else setActual(t, d, t == actor ? "edit" : "lead");   // 내린 뒤 - 실제(회원이 직접 바꿈 · 인솔자, 10-28 PC: 바꿔도 "여기서 내림" 이 남았음)
        save();
    }

    /** 하차 안내를 보여 주는 동안(도착 뒤). */
    static final long ARRIVE_MS = 15 * 60_000L;
    /** 위치로 하차 확인 - 도착 뒤 이만큼 지나서도 그 자리 둘레(AUTO_M)에 있으면 내린 것(버스는 떠났음). */
    static final long AUTO_AFTER_MS = 10 * 60_000L, AUTO_UNTIL_MS = 60 * 60_000L;
    static final double AUTO_M = 400;

    /** 실제 하차를 정함 - 계획과 다르면 계획을 남김. */
    private static void setActual(Member m, String drop, String how) {
        if (drop != null && m.drop != null && !drop.equals(m.drop) && m.dropPlan == null && m.dropHow == null) m.dropPlan = m.drop;
        m.drop = drop;
        m.dropHow = how;
    }

    /** 인솔자 - 하차 지점 도착: 버스 안 회원 폰에 "지금 한계령입니다 - 여기서 내리세요?"(15분). lat · lon - 그 자리(위치로 하차 확인에 씀). */
    synchronized void arrive(Member lead, String drop, Double lat, Double lon, long now) {
        if (!lead.staff() || lead.office) throw new SecurityException("인솔자만 알립니다.");
        Room r = lead.room;
        String d = clean(drop, 12);
        if (d == null || !r.drops.contains(d)) throw new IllegalArgumentException("하차 지점을 골라 주세요.");
        boolean pos = okPos(lat, lon);
        r.arrivals.add(new Object[] {d, now, pos ? lat : Double.NaN, pos ? lon : Double.NaN});
        while (r.arrivals.size() > 8) r.arrivals.remove(0);
        audit.info("arrive room={} drop#{}", r.code, r.drops.indexOf(d) + 1);
    }

    /** 회원 - 하차 안내에 답함(yes = 여기서 내려요 → 실제 하차). */
    synchronized void alight(Member m, boolean yes, long now) {
        Object[] a = m.room.lastArrival();
        if (a == null || now - (Long) a[1] > ARRIVE_MS) throw new IllegalArgumentException("지금은 하차 안내가 없습니다.");
        m.arrAns = (Long) a[1];
        if (yes) setActual(m, (String) a[0], "me");
        save();
    }

    /** 위치로 하차 확인(앱 회원 등 계속 보내는 폰): 도착 10분 ~ 1시간 뒤에 그 자리 400m 안이면 거기서 내린 것. 이미 정해졌으면 그대로. */
    private static void autoDrop(Member m, double lat, double lon, long now) {
        if (m.dropHow != null || !"hiker".equals(m.role) || m.aboard || m.cancelled || BUS_STAY.equals(m.drop)) return;   // 버스 대기 - 버스가 그 자리에 서 있어도 내린 것 아님
        Object[] best = null;
        for (Object[] a : m.room.arrivals) {
            long at = (Long) a[1];
            double alat = (Double) a[2], alon = (Double) a[3];
            if (Double.isNaN(alat) || now - at < AUTO_AFTER_MS || now - at > AUTO_UNTIL_MS) continue;
            if (MountainServlet.distM(alat, alon, lat, lon) <= AUTO_M) best = a;   // 뒤의 도착일수록 나중(가까운 곳을 다시 지나면 마지막 것)
        }
        if (best != null) setActual(m, (String) best[0], "auto");
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
        if (m != null && m.room.expired(now)) { sweep(now, true); m = byToken.get(token); }
        if (m == null && endedWhy.containsKey(token)) throw new Ended(endedWhy.get(token));
        return m;
    }

    // ---------------------------------------------------------------- 산행 중

    /** 위치 - 출발 전이면 버림(false). 취소된 사람은 받지 않음. */
    synchronized boolean loc(Member m, Double lat, Double lon, Double acc, Integer batt, boolean sos, long now) {
        if (!okPos(lat, lon)) throw new IllegalArgumentException("위치가 올바르지 않습니다.");
        if (m.cancelled) throw new IllegalArgumentException("출발 때 탑승하지 않아 이 산행에서 빠졌습니다. 인솔자에게 연락해 주세요.");
        if (m.office) return false;   // 회사 사무실 자리는 위치를 받지 않음
        if (m.aboard) { m.sos = false; return false; }   // 하산 탑승 뒤 - 위치 받지 않음
        if (!started(m, now)) { m.sos = false; return false; }
        if (m.t == 0 || MountainServlet.distM(m.anchorLat, m.anchorLon, lat, lon) > STILL_M) {
            m.anchorLat = lat; m.anchorLon = lon; m.stillSince = now;
        }
        m.lat = lat; m.lon = lon; m.acc = acc; m.batt = batt == null ? null : Math.max(0, Math.min(100, batt)); m.t = now; m.seen = now;
        if (m.room.departed && "hiker".equals(m.role) && (acc == null || acc <= 100)) {   // 출발 뒤 산행 회원만 - 집 · 집결지 길은 남기지 않음
            double[] last = m.track.isEmpty() ? null : m.track.get(m.track.size() - 1);
            if (last == null || MountainServlet.distM(last[0], last[1], lat, lon) >= TRACK_MIN_M) {
                if (m.track.size() >= TRACK_MAX) for (int i = m.track.size() - 1; i > 0; i -= 2) m.track.remove(i);
                m.track.add(new double[] {lat, lon, now});
            }
        }
        autoDrop(m, lat, lon, now);   // 위치로 하차 확인(2026-10-28)
        if (sos && !m.sos) memberLog.add(now, m.room.code, m.id, "sos");
        m.sos = sos;
        if (sos) m.room.sosEver = true;
        return true;
    }

    /**
     * 위치 없이 "폰은 켜져 있음" · 배터리 · SOS(2026-10-20 PC: 화면을 끈 실내 · 골짜기에서 GPS 를 못 잡으면 인솔자에게 소식이 끊긴 것처럼 보였고,
     * 위치가 없으면 SOS 도 못 보냈음). 출발 전 · 취소 · 하산 탑승이면 받지 않음.
     */
    /** sos - null 이면 그대로 둠(앱의 "폰 켜짐" 신호 RfAlive 는 sos 를 안 보냄 - 전에는 1분마다 SOS 가 꺼져 인솔자에게 "새 SOS" 가 되풀이됐음, 2026-10-22 점검). */
    /** 앱 · 웹 어디서 보냈나(loc · ping 마다). */
    synchronized void via(Member m, boolean app) {
        m.app = app;
    }

    synchronized void ping(Member m, Integer batt, Boolean sos, long now) {
        if (m.cancelled || m.aboard || !started(m, now)) return;
        m.seen = now;
        if (batt != null) m.batt = Math.max(0, Math.min(100, batt));
        if (sos == null) return;
        if (sos && !m.sos) memberLog.add(now, m.room.code, m.id, "sos noloc");
        m.sos = sos;
        if (sos) m.room.sosEver = true;
    }

    /** 이미 참가한 폰으로 버스 안 QR · NFC 를 찍음 - 출발 탑승(2026-10-27 홍TV님 - "버스 탔어요" 단추 대신). 출발 뒤 · 취소된 사람은 그대로(인솔자가 되돌림). */
    synchronized void board(Member m) {
        if (!"hiker".equals(m.role) || m.room.departed || m.cancelled) return;
        m.boarded = true;
        save();
    }

    /** 본인 - 하산 뒤 "하산 탑승"(SOS 도 풂). */
    /** 하산 탑승 - 산행 끝이라 위치를 지우고 더 받지 않음(loc). 명단 · 좌석표에는 "하산 탑승" 으로 남아 인솔자가 봄(2026-10-20 PC). */
    /** apart - "따로 귀가"(버스를 안 타고 끝남): 하산 탑승과 같이 위치를 지우고 하산 인원에 들어감. */
    synchronized void aboard(Member m, boolean on, boolean apart) {
        m.aboard = on;
        m.apart = on && apart;
        if (on) { m.sos = false; m.lat = null; m.lon = null; m.acc = null; }
        save();
    }

    /** 인솔자 - 출발: 안 탄 산행 회원은 취소(좌석표에서 "탐" 으로 되돌리면 다시 들어옴). 돌려줌: 취소된 수. */
    /**
     * 인솔자 - 산행 시작(2026-10-27 홍TV님 "사당 출발 등 필요 없을 것 같아"): 버스는 탑승지마다 정각에 떠나므로 탑승지마다 누르지 않고,
     * 들머리에서 한 번 누르면 그때까지 안 탄 산행 회원(명단에만 있는 사람 포함)을 "안 탐"으로 하고 산행으로(departed). 돌려줌: 안 탐이 된 수.
     */
    synchronized int depart(Member lead, long now) {
        Room r = lead.room;
        if (r.departed) throw new IllegalStateException("이미 산행을 시작했습니다.");
        int n = 0;
        for (Member m : r.members.values()) {
            if (!"hiker".equals(m.role) || m.boarded || m.cancelled) continue;
            m.cancelled = true;
            n++;
            memberLog.add(now, r.code, m.id, "notonbus");   // 산행 시작 때 안 탐
        }
        r.stopsDone = r.stops.size();
        r.departed = true;
        r.departedAt = now;
        save();
        return n;
    }

    /** 자리 · 탑승지 바꾸기 - 회원은 자기 것만, 인솔자는 아무나(targetId). seat null = 자리 빼기. 옮기면 출발 탑승 표시는 새로. */
    synchronized void seat(Member actor, Integer targetId, Integer bus, Integer seat, String stop) {
        Room r = actor.room;
        Member t = target(actor, targetId);
        // 출발 뒤 회원은 못 바꿈(2026-10-20 홍TV님 - 탑승지는 의미 없고 자리는 인솔자 좌석표에서) - 인솔자는 그대로
        if (r.departed && !actor.staff()) throw new IllegalStateException("출발한 뒤에는 자리를 인솔자가 좌석표에서 옮깁니다.");
        int b = checkBus(r, bus == null ? t.bus : bus);
        if (!"hiker".equals(t.role)) throw new IllegalArgumentException("자리는 산행 회원만 고릅니다.");
        checkSeat(r, t, b, seat);
        String st = checkStop(r, stop);
        if (seat != null && (!seat.equals(t.seat) || b != t.bus)) t.boarded = false;
        t.bus = b;
        t.seat = seat;
        t.stop = st;
        save();
    }

    private Member target(Member actor, Integer targetId) {
        if (targetId == null || targetId == actor.id) return actor;
        if (!actor.staff()) throw new SecurityException("다른 사람은 인솔자만 바꿀 수 있습니다.");
        for (Member m : actor.room.members.values()) if (m.id == targetId) return m;
        throw new IllegalArgumentException("그 회원을 찾지 못했습니다.");
    }

    /**
     * 인솔자 - 명단에서 사람으로 "탔음"(출발 때 취소된 사람 되돌리기, 2026-10-21 점검: 그 자리에 다른 사람이 앉으면 좌석표로는 고를 수 없었음).
     * 자리가 이미 찼으면 자리는 비우고(좌석 없음) 되돌림 - 인솔자가 좌석표에서 새 자리로 옮김.
     */
    synchronized void boardById(Member staff, int id, boolean on, long now) {
        Member m = null;
        for (Member x : staff.room.members.values()) if (x.id == id) m = x;
        if (m == null || !"hiker".equals(m.role)) throw new IllegalArgumentException("그 회원을 찾지 못했습니다.");
        m.boarded = on;
        if (on && m.cancelled) {
            m.cancelled = false;
            if (m.seat != null) { Member there = staff.room.atSeat(m.bus, m.seat); if (there != null && there != m) m.seat = null; }
            memberLog.add(now, staff.room.code, m.id, "onbus");   // 안 탐 되돌림
        }
        save();
    }

    /** 인솔자 - 핸드폰 없는(명단에만 있는) 회원도 하산 탑승을 체크(2026-10-24 홍TV님). */
    synchronized void aboardById(Member staff, int id, boolean on, boolean apart) {
        Member m = null;
        for (Member x : staff.room.members.values()) if (x.id == id) m = x;
        if (m == null || !"hiker".equals(m.role)) throw new IllegalArgumentException("그 회원을 찾지 못했습니다.");
        aboard(m, on, apart);
    }

    /** 인솔자 - 좌석표에서 그 자리 사람을 "출발 탑승"(취소도 풂, 2026-10-27 홍TV님 - 예약 · 인솔 자리 표시는 없앰). */
    synchronized void mark(Member staff, Integer bus, int seat, boolean on, long now) {
        Room r = staff.room;
        int b = checkBus(r, bus);
        if (seat < 1 || seat > r.seatsOf(b)) throw new IllegalArgumentException("없는 좌석입니다.");
        Member m = r.atSeat(b, seat);
        if (m == null) for (Member x : r.members.values()) if (x.seat != null && x.seat == seat && x.bus == b) m = x;   // 취소된 사람도
        if (m == null) throw new IllegalArgumentException(busName(r, b) + seat + "번 자리에 사람이 없습니다.");
        m.boarded = on;
        if (on && m.cancelled) { m.cancelled = false; memberLog.add(now, r.code, m.id, "onbus"); }
        save();
    }

    /** 인솔자에게 한 줄 - 산행 회원이 보냄(80자, 1분에 한 번). 메모리에만(파일 · 로그에 안 씀), 방이 끝나면 사라짐. */
    synchronized void say(Member m, String text, long now) {
        if (!"hiker".equals(m.role)) throw new IllegalArgumentException("인솔자는 \"공지\" 로 보냅니다.");
        String t = clean(text, 80);
        if (t == null) throw new IllegalArgumentException("보낼 말을 적어 주세요.");
        if (m.msgAt > 0 && now - m.msgAt < 60_000) throw new IllegalStateException("1분 뒤에 다시 보내 주세요.");
        m.msg = t;
        m.msgAt = now;
    }

    synchronized void notice(Member lead, String text, long now) {
        lead.room.notice = clean(text, 120);
        lead.room.noticeAt = now;
        save();
    }

    /** 차량번호 - 고른 호차(bus). 빈 글이면 지움. */
    synchronized void plate(Member m, Integer bus, String plate) {
        int b = checkBus(m.room, bus);
        m.room.plates[b - 1] = plate(plate);
        save();
    }

    /** 버스 세운 자리 - 고른 호차(bus). */
    synchronized void bus(Member m, Integer bus, Double lat, Double lon) {
        if (!okPos(lat, lon)) throw new IllegalArgumentException("위치가 올바르지 않습니다.");
        int b = checkBus(m.room, bus);
        m.room.busAt.put(b, new double[] {lat, lon});
        save();
    }

    /** 인솔자 - 회원 내보내기(2026-10-20 홍TV님 - 모르는 사람이 들어왔을 때). 그 폰에는 410 + 까닭. 인솔자 자신은 못 내보냄. */
    synchronized void kick(Member lead, int id, long now) {
        Member t = null;
        for (Member x : lead.room.members.values()) if (x.id == id) t = x;
        if (t == null) throw new IllegalArgumentException("이미 나간 사람입니다.");
        if (t == lead) throw new IllegalArgumentException("인솔자 자신은 내보낼 수 없습니다.");
        boolean assist = "lead".equals(t.role);
        if (assist && !lead.chief()) throw new SecurityException("보조 인솔자는 주 인솔자만 내보냅니다.");
        if (t.chief()) throw new IllegalArgumentException("주 인솔자는 내보낼 수 없습니다.");
        if (t.office) throw new IllegalArgumentException("회사 사무실은 내보낼 수 없습니다.");
        lead.room.members.remove(t.token);
        byToken.remove(t.token);
        endedWhy.put(t.token, assist ? "주 인솔자가 보조 인솔자에서 내보냈습니다." : "인솔자가 이 방에서 내보냈습니다. 잘못이면 인솔자에게 연락하세요.");
        endedAt.put(t.token, now);
        memberLog.add(now, lead.room.code, t.id, "kick");
        save();
    }

    /**
     * 그만 보내기 · 나가기 = 위치 제공 동의 철회. 위치정보지원센터 답(2026-10-27): 법 제24조 제4항에 따라 그 회원의 확인자료를 즉시 파기(PartyLog.purge).
     * 인솔자(인솔자 코드로 들어온 사람)가 나가도 같음.
     */
    synchronized void leave(Member m, long now) {
        if (m.chief()) throw new IllegalStateException("주 인솔자는 \"방 끝내기\" 로 끝냅니다.");   // 보조 인솔자는 언제든 나감
        if ("hiker".equals(m.role)) {   // 산행 회원 - 위치만 그만 보내고 명단 · 좌석 · 탑승은 남김(인솔자 인원 확인, 2026-10-26 홍TV님 "좌석표에서도 빠지는데")
            m.rostered = true;   // 명단으로 들어오지 않았어도 이제 명단 사람(같은 이름으로 다시 참가하면 그 자리로)
            m.listed = true;
            m.lat = null; m.lon = null; m.acc = null; m.t = 0; m.sos = false; m.track.clear();
            memberLog.purge(m.room.code, m.id);   // 철회 - 이 회원의 확인자료 즉시 파기
            save();
            return;
        }
        if (m.room.members.remove(m.token) != null) memberLog.purge(m.room.code, m.id);   // 철회 - 확인자료 즉시 파기
        byToken.remove(m.token);
        save();
    }

    /** 인솔자 - 방 끝내기 · 산행 취소(cancel). */
    synchronized void end(Member lead, boolean cancel, long now) {
        end(lead, cancel, null, true, now);
    }

    /**
     * 방 끝내기 · 산행 취소 - 주 인솔자 · 회사 사무실만(2026-10-28).
     * 안전(2026-10-28 홍TV님 "모두 구현"): SOS 가 켜진 회원이 있으면 막음. 출발한 뒤 하산 확인이 안 된 회원이 있으면 force 없이는 막음(NotDown - 화면이 한 번 더 묻고 보냄).
     * 끝나면 회사 화면에 요약(누가 · 미확인 몇 명)이 남음.
     */
    synchronized void end(Member lead, boolean cancel, String why, boolean force, long now) {
        if (!lead.chief() && !lead.office) throw new SecurityException("방은 주 인솔자(또는 회사 사무실)만 끝냅니다.");
        Room r = lead.room;
        if (r.sosOn()) throw new IllegalStateException("SOS 를 켠 회원이 있어 방을 끝낼 수 없습니다. 그 회원을 찾거나 하산 탑승을 확인한 뒤 끝내 주세요.");
        List<String> notDown = notDown(r);
        if (r.departed && !notDown.isEmpty() && !force)
            throw new NotDown("아직 하산 확인이 안 된 회원이 " + notDown.size() + "명 있습니다(" + String.join(" · ", notDown.subList(0, Math.min(5, notDown.size()))) + (notDown.size() > 5 ? " 등" : "") + ").");
        r.endedBy = lead.office ? "사무실" : "주 인솔자";
        r.cancelled = cancel;
        r.cancelWhy = clean(why, 60);
        if (!cancel) keepTracks(r);
        drop(r, cancel ? "인솔자가 산행을 취소했습니다." : lead.office ? "회사 사무실이 방을 끝냈습니다." : "인솔자가 방을 끝냈습니다. 산행 수고하셨습니다.", now);
        save();
    }

    /** 하산 확인이 안 된 산행 회원 이름(안 탐 · 하산 탑승 · 따로 귀가 빼고). */
    private static List<String> notDown(Room r) {
        List<String> out = new ArrayList<>();
        for (Member m : r.members.values()) if ("hiker".equals(m.role) && !m.cancelled && !m.aboard) out.add(m.nick);
        return out;
    }

    /** 하산 미확인 회원이 있어 끝내기를 한 번 더 물음 - 메시지가 "아직 하산 확인이" 로 시작. */
    static final class NotDown extends IllegalStateException {
        private static final long serialVersionUID = 1L;
        NotDown(String m) { super(m); }
    }

    // ---- 회사 사무실(2026-10-28)

    /** 새 사무실 - 돌려줌 [회사 코드, 비밀 열쇠, 이름]. */
    synchronized String[] createOffice(String name, long now) {
        String n = clean(name, 30);
        if (n == null) throw new IllegalArgumentException("회사 이름을 적어 주세요.");
        PartyOffice.Office o = offices.create(n, newCode(), now);
        return new String[] {o.code, o.key, o.name};
    }

    /** 주 인솔자 - 이 방을 회사 사무실에 올림(회사 코드). 회원 화면에도 받는 사람으로 보임. */
    synchronized void linkOffice(Member lead, String code) {
        if (!lead.chief()) throw new SecurityException("회사 연결은 주 인솔자만 합니다.");
        PartyOffice.Office o = offices.byCode(code);
        if (o == null) throw new IllegalArgumentException("회사 코드를 찾지 못했습니다. 회사에 다시 확인해 주세요.");
        lead.room.officeCode = o.code;
        lead.room.officeName = o.name;
        audit.info("office room={} office={}", lead.room.code, o.code);
        save();
    }

    /** 사무실 화면 - 이 회사의 지금 방들(숫자만, 위치 없음) + 끝난 산행 요약. */
    synchronized JsonObject officeRooms(String key, long now) {
        PartyOffice.Office o = offices.byKey(key);
        sweep(now);
        JsonObject out = new JsonObject();
        out.addProperty("name", o.name);
        out.addProperty("code", o.code);
        out.addProperty("now", now);
        JsonArray live = new JsonArray();
        for (Room r : rooms.values()) {
            if (!o.code.equals(r.officeCode)) continue;
            JsonObject x = summary(r, now);
            x.addProperty("code", r.code);
            int silent = 0;
            long last = 0;
            for (Member m : r.members.values()) {
                if (!"hiker".equals(m.role) || m.cancelled) continue;
                last = Math.max(last, Math.max(m.t, m.seen));
                if (r.departed && m.app && !m.aboard && !m.listed && now - Math.max(Math.max(m.t, m.seen), r.departedAt) > 10 * 60_000L) silent++;   // 앱 회원만(웹은 화면을 끄면 멈춤)
            }
            x.addProperty("sos", (int) r.members.values().stream().filter(m -> m.sos && !m.aboard && !m.cancelled).count());
            x.addProperty("silent", silent);   // 출발 뒤 10분 넘게 소식 없는 회원
            if (last > 0) x.addProperty("lastAgo", (now - last) / 1000);
            Member c = r.chief();
            if (c != null) x.addProperty("chief", c.nick);
            if (r.leaderPhone != null) x.addProperty("leaderPhone", r.leaderPhone);   // 사무실이 바로 전화(2026-10-28 홍TV님 "더 해")
            x.addProperty("assistants", r.assistants());
            JsonArray an = new JsonArray();   // 보조 인솔자 이름 - 모르는 사람이 들어왔는지 사무실도 봄
            for (Member m : r.members.values()) if (m.staff() && !m.office && m != c) an.add(m.nick);
            x.add("assistantNames", an);
            JsonArray plates = new JsonArray(), seats = new JsonArray();   // 호차마다 차량번호 · 좌석 수
            for (String pl : r.plates) plates.add(pl);
            for (int n : r.busSeats) seats.add(n);
            x.add("plates", plates);
            x.add("busSeats", seats);
            x.add("stops", strings(r.stops));
            x.add("stopTimes", strings(r.stopTimes));
            if (c != null && c.drop != null) x.addProperty("chiefDrop", c.drop);   // 인솔자는 어디서 내려 산행 중인지 · 버스 대기
            JsonObject dc = new JsonObject();   // 하차 지점마다 산행 회원 수
            for (Member m : r.members.values()) if ("hiker".equals(m.role) && !m.cancelled) { String k = m.drop != null ? m.drop : "미정"; dc.addProperty(k, (dc.has(k) ? dc.get(k).getAsInt() : 0) + 1); }
            x.add("drops", dc);
            if (!r.pickups.isEmpty()) {   // 하산 탑승지마다 [탄 사람, 그곳 회원], 출발 때
                JsonArray pk = new JsonArray();
                for (String pn : r.pickups) {
                    int on = 0, all = 0;
                    for (Member m : r.members.values()) if ("hiker".equals(m.role) && !m.cancelled && pn.equals(m.pickup)) { all++; if (m.aboard) on++; }
                    JsonObject q = new JsonObject();
                    q.addProperty("name", pn); q.addProperty("at", pickupAt(r, pn)); q.addProperty("on", on); q.addProperty("all", all);
                    pk.add(q);
                }
                x.add("pickups", pk);
            }
            if (homeAt(r) > 0) x.addProperty("homeAt", homeAt(r));
            live.add(x);
        }
        out.add("rooms", live);
        out.add("ended", offices.endedOf(o, now));
        return out;
    }

    /** 사무실이 방 하나를 엶 - 그 방에 사무실 자리(보조 자리를 쓰지 않음)를 만들거나 있던 것을 돌려줌. 화면은 인솔자 화면 그대로. */
    synchronized Member officeEnter(String key, String code, long now) {
        PartyOffice.Office o = offices.byKey(key);
        Room r = code == null ? null : rooms.get(code.trim().toUpperCase());
        if (r == null || !o.code.equals(r.officeCode)) throw new IllegalArgumentException("이 회사의 방이 아니거나 이미 끝난 방입니다.");
        for (Member m : r.members.values()) if (m.office) return m;
        Member m = add(r, clean(o.name + " 사무실", 12) != null ? clean(o.name + " 사무실", 12) : "사무실", "lead", now);
        m.office = true;
        save();
        return m;
    }

    /** 사무실 - 이 방을 회사 화면에서 뺌(잘못 연결된 방). 사무실 자리도 지움. */
    synchronized void officeDetach(String key, String code) {
        PartyOffice.Office o = offices.byKey(key);
        Room r = code == null ? null : rooms.get(code.trim().toUpperCase());
        if (r == null || !o.code.equals(r.officeCode)) throw new IllegalArgumentException("이 회사의 방이 아닙니다.");
        r.officeCode = null;
        r.officeName = null;
        for (Member m : new ArrayList<>(r.members.values())) if (m.office) { r.members.remove(m.token); byToken.remove(m.token); }
        save();
    }

    /** 사무실 - 링크 바꾸기. 돌려줌: 새 열쇠. */
    synchronized String officeNewKey(String key) {
        return offices.newKey(offices.byKey(key));
    }

    /**
     * 사무실 없애기(탈퇴, 2026-10-28 홍TV님 "만들어") - 회사 이름을 한 번 더 적어야 함. 사무실 · 끝난 산행 요약을 지우고,
     * 진행 중인 방은 그대로 두되 회사 연결 · 사무실 자리만 뺌(회원 화면의 "○○ 사무실" 도 빠짐).
     */
    synchronized void officeDelete(String key, String name) {
        PartyOffice.Office o = offices.byKey(key);
        if (name == null || !name.trim().equals(o.name)) throw new IllegalArgumentException("회사 이름이 맞지 않습니다. 없애려면 회사 이름을 그대로 적어 주세요.");
        for (Room r : rooms.values()) {
            if (!o.code.equals(r.officeCode)) continue;
            r.officeCode = null;
            r.officeName = null;
            for (Member m : new ArrayList<>(r.members.values())) if (m.office) { r.members.remove(m.token); byToken.remove(m.token); }
        }
        offices.delete(o);
        save();
    }

    /** 방 요약 - 숫자만(이름 · 좌표 없음): 사무실 화면 · 끝난 산행. */
    private static JsonObject summary(Room r, long now) {
        int hikers = 0, boarded = 0, aboard = 0, apart = 0, cancelled = 0;
        for (Member m : r.members.values()) {
            if (!"hiker".equals(m.role)) continue;
            if (m.cancelled) { cancelled++; continue; }
            hikers++;
            if (m.boarded) boarded++;
            if (m.aboard) aboard++;
            if (m.apart) apart++;
        }
        JsonObject x = new JsonObject();
        x.addProperty("name", r.name);
        x.addProperty("departAt", r.departAt);
        x.addProperty("endAt", r.endAt);
        x.addProperty("buses", r.buses);
        x.addProperty("departed", r.departed);
        x.addProperty("hikers", hikers);
        x.addProperty("boarded", boarded);
        x.addProperty("aboard", aboard);   // 따로 귀가 포함
        x.addProperty("apart", apart);
        x.addProperty("notBoarded", cancelled);
        x.addProperty("notDown", r.departed ? hikers - aboard : 0);
        x.addProperty("sosEver", r.sosEver);
        return x;
    }

    /** 인솔자 - 한 회원의 최근 TRAIL_MS

    /** 방이 끝남(취소 빼고) - 산행 회원마다 익명 자취를 넘김(누구인지 · 방 · 시각 없이, PartyTrack.anon). 방을 나간 사람은 이미 지워져 없음. */
    private void keepTracks(Room r) {
        if (trackSink == null || !r.departed) return;
        List<JsonObject> out = new ArrayList<>();
        for (Member m : r.members.values()) {
            if (!"hiker".equals(m.role) || m.cancelled) continue;
            JsonObject t = PartyTrack.anon(m.track);
            if (t != null) out.add(t);
        }
        java.util.Collections.shuffle(out);   // 넣는 차례로 같은 방 사람을 잇지 못하게
        out.forEach(trackSink);
    }

    /** 주 인솔자 - 인솔자 코드 바꾸기(샜을 때). 옛 코드는 48시간 다시 안 씀. 이미 들어온 보조는 그대로(필요하면 내보내기). 돌려줌: 새 코드. */
    synchronized String newLeadCode(Member lead, long now) {
        if (!lead.chief()) throw new SecurityException("인솔자 코드는 주 인솔자만 바꿉니다.");
        Room r = lead.room;
        if (r.leadCode != null) { endedWhy.put("#" + r.leadCode, "인솔자 코드가 바뀌었습니다. 주 인솔자에게 새 코드를 받으세요."); endedAt.put("#" + r.leadCode, now); }
        String c;
        do c = newCode(); while (c.equals(r.code));
        r.leadCode = c;
        audit.info("leadcode room={}", r.code);
        save();
        return c;
    }

    /** 주 인솔자 - 내 폰에서도 보기 코드(10분 · 한 번). */
    synchronized String meCode(Member lead, long now) {
        if (!lead.chief()) throw new SecurityException("주 인솔자만 씁니다.");
        Room r = lead.room;
        String c;
        do c = newCode(); while (c.equals(r.code) || c.equals(r.leadCode));
        r.meCode = c;
        r.meCodeUntil = now + ME_CODE_MS;
        return c;
    }

    static final long ME_CODE_MS = 10 * 60_000L;

    /** 인솔자 - 한 회원의 최근 TRAIL_MS 지나온 길(조난 대비 - SOS · 연락 끊긴 회원이 어디로 갔는지). [[위도, 경도, 몇 초 전], …] */
    synchronized JsonObject trail(Member staff, int id, long now) {
        if (!staff.staff()) throw new SecurityException("인솔자만 지나온 길을 봅니다.");
        Member m = null;
        for (Member x : staff.room.members.values()) if (x.id == id) m = x;
        if (m == null) throw new IllegalArgumentException("그 회원을 찾지 못했습니다.");
        JsonArray path = new JsonArray();
        for (double[] p : m.track) {
            if (now - p[2] > TRAIL_MS) continue;
            JsonArray a = new JsonArray();
            a.add(p[0]); a.add(p[1]); a.add(Math.round((now - p[2]) / 1000));
            path.add(a);
        }
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("id", id);
        o.add("path", path);
        return o;
    }

    private void drop(Room r, String why, long now) {
        if (r.officeCode != null) {   // 회사 화면에 끝난 산행 요약(2026-10-28)
            JsonObject x = summary(r, now);
            x.addProperty("endedAt", now);
            x.addProperty("by", r.endedBy != null ? r.endedBy : "자동(하산 마감이 지남)");
            if (r.cancelled) x.addProperty("cancelled", true);
            if (r.cancelWhy != null) x.addProperty("why", r.cancelWhy);
            offices.ended(r.officeCode, x, now);
        }
        rooms.remove(r.code);
        for (String t : r.members.keySet()) {
            byToken.remove(t);
            endedWhy.put(t, why);
            endedAt.put(t, now);
        }
        endedWhy.put("#" + r.code, why);   // 방 코드로 새로 들어오려는 사람에게도(48시간, 2026-10-20 PC)
        endedAt.put("#" + r.code, now);
        if (r.leadCode != null) { endedWhy.put("#" + r.leadCode, why); endedAt.put("#" + r.leadCode, now); }   // 공동 인솔자 코드도 48시간 다시 안 씀(점검)
        audit.info("end room={} members={} ({})", r.code, r.members.size(), why);
        r.members.clear();
    }

    synchronized void sweep(long now) {
        sweep(now, false);
    }

    synchronized void sweep(long now, boolean force) {
        if (!force && now >= lastSweep && now - lastSweep < SWEEP_MS) return;
        lastSweep = now;
        boolean changed = false;
        for (Room r : new ArrayList<>(rooms.values())) {
            if (r.expired(now)) { keepTracks(r); drop(r, "산행 시간이 지나 방이 끝났습니다.", now); changed = true; }
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
        if (lazy) { dirty = true; return; }
        write(snapshot());
    }

    /** 파일에 쓸 글(자물쇠 안에서). */
    private String snapshot() {
        JsonArray arr = new JsonArray();
        for (Room r : rooms.values()) {
            JsonObject o = new JsonObject();
            o.addProperty("code", r.code); o.addProperty("name", r.name); o.addProperty("created", r.created); o.addProperty("leadCode", r.leadCode);
            o.addProperty("departAt", r.departAt); o.addProperty("endAt", r.endAt); o.addProperty("buses", r.buses); o.addProperty("seats", r.seats);
            JsonArray bs = new JsonArray(); for (int x : r.busSeats) bs.add(x); o.add("busSeats", bs);
            o.add("stops", strings(r.stops)); o.addProperty("leaderName", r.leaderName); o.addProperty("leaderPhone", r.leaderPhone);
            o.add("plates", plateArray(r));
            o.addProperty("notice", r.notice); o.addProperty("noticeAt", r.noticeAt); o.add("stopTimes", strings(r.stopTimes));
            JsonObject ba = new JsonObject();
            r.busAt.forEach((k, v) -> { JsonArray p = new JsonArray(); p.add(v[0]); p.add(v[1]); ba.add(String.valueOf(k), p); });
            o.add("busAt", ba); o.addProperty("departed", r.departed); o.addProperty("stopsDone", r.stopsDone); o.addProperty("nextId", r.nextId);
            o.addProperty("officeCode", r.officeCode); o.addProperty("officeName", r.officeName); o.addProperty("sosEver", r.sosEver); o.addProperty("departedAt", r.departedAt); o.add("drops", strings(r.drops)); o.add("pickups", strings(r.pickups)); o.add("pickupTimes", strings(r.pickupTimes)); o.addProperty("homeTime", r.homeTime);
            JsonArray ms = new JsonArray();
            for (Member m : r.members.values()) {
                JsonObject x = new JsonObject();
                x.addProperty("id", m.id); x.addProperty("token", m.token); x.addProperty("nick", m.nick); x.addProperty("role", m.role); x.addProperty("joinedAt", m.joinedAt);
                x.addProperty("bus", m.bus); x.addProperty("seat", m.seat); x.addProperty("stop", m.stop); x.addProperty("boarded", m.boarded); x.addProperty("aboard", m.aboard); x.addProperty("apart", m.apart); x.addProperty("cancelled", m.cancelled);
                x.addProperty("rostered", m.rostered); x.addProperty("listed", m.listed);
                if (m.office) x.addProperty("office", true);
                if (m.app) x.addProperty("app", true);
                if (m.drop != null) x.addProperty("drop", m.drop);
                if (m.pickup != null) x.addProperty("pickup", m.pickup);
                if (m.dropHow != null) x.addProperty("dropHow", m.dropHow);
                if (m.dropPlan != null) x.addProperty("dropPlan", m.dropPlan);
                ms.add(x);
            }
            o.add("members", ms);
            arr.add(o);
        }
        return arr.toString();
    }

    private final Object fileLock = new Object();

    private void write(String text) {
        if (file == null) return;
        synchronized (fileLock) { writeLocked(text); }
    }

    private void writeLocked(String text) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling("party.json.tmp");
            Files.deleteIfExists(tmp);
            // 처음부터 600 으로 만듦(점검: 쓴 뒤 바꾸면 잠깐 남이 읽을 수 있었음 - 열쇠가 들어 있음)
            try { Files.createFile(tmp, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
            catch (UnsupportedOperationException e) { /* 윈도 */ }
            Files.writeString(tmp, text, StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            log.warn("[PARTY] 방 파일을 쓰지 못함 - {}", e.toString());
        }
    }

    private void load() {
        if (file == null || !Files.isRegularFile(file)) return;
        JsonArray all;
        try {
            all = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonArray();
        } catch (Exception e) {
            log.warn("[PARTY] 방 파일을 읽지 못함 - {}", e.toString());
            backup();
            return;
        }
        int bad = 0;
        for (JsonElement e : all) {   // 방마다 따로(2026-10-21 점검: 한 방이 틀리면 뒤의 방들을 못 읽고 다음 저장 때 지워졌음) - 없는 칸은 기본값
            try {
                JsonObject o = e.getAsJsonObject();
                List<String> st = new ArrayList<>();
                if (o.has("stops")) o.getAsJsonArray("stops").forEach(x -> st.add(x.getAsString()));
                Room r = new Room(o.get("code").getAsString(), o.get("name").getAsString(), lng(o, "created"), lng(o, "departAt"), lng(o, "endAt"),
                        o.has("buses") ? o.get("buses").getAsInt() : 1, (int) lng(o, "seats"), List.copyOf(st), str(o, "leaderName"), str(o, "leaderPhone"));
                if (o.has("busSeats")) { JsonArray bs = o.getAsJsonArray("busSeats"); for (int i = 0; i < Math.min(bs.size(), r.buses); i++) r.busSeats[i] = bs.get(i).getAsInt(); }   // 없으면(10-27 전 방) 모두 seats
                if (o.has("plates")) {
                    JsonArray pa = o.getAsJsonArray("plates");
                    for (int i = 0; i < Math.min(pa.size(), r.buses); i++) r.plates[i] = pa.get(i).isJsonNull() ? null : pa.get(i).getAsString();
                }
                r.notice = str(o, "notice"); r.noticeAt = lng(o, "noticeAt");
                if (o.has("stopTimes")) { List<String> tt = new ArrayList<>(); o.getAsJsonArray("stopTimes").forEach(x -> tt.add(x.getAsString())); if (tt.size() == r.stops.size()) r.stopTimes = List.copyOf(tt); }
                if (o.has("busAt")) for (var be : o.getAsJsonObject("busAt").entrySet()) {
                    JsonArray p = be.getValue().getAsJsonArray();
                    r.busAt.put(Integer.parseInt(be.getKey()), new double[] {p.get(0).getAsDouble(), p.get(1).getAsDouble()});
                }
                r.departed = boolOf(o, "departed"); r.stopsDone = (int) lng(o, "stopsDone"); r.nextId = Math.max(1, (int) lng(o, "nextId"));
                r.leadCode = str(o, "leadCode") != null ? str(o, "leadCode") : str(o, "driverCode");   // 10-27 전 파일은 driverCode
                r.officeCode = str(o, "officeCode"); r.officeName = str(o, "officeName"); r.sosEver = boolOf(o, "sosEver"); r.departedAt = lng(o, "departedAt");
                if (o.has("drops")) { List<String> dd = new ArrayList<>(); o.getAsJsonArray("drops").forEach(x -> dd.add(x.getAsString())); r.drops = List.copyOf(dd); }
                if (o.has("pickups") && o.has("pickupTimes")) {
                    List<String> pp = new ArrayList<>(), pt = new ArrayList<>();
                    o.getAsJsonArray("pickups").forEach(x -> pp.add(x.getAsString())); o.getAsJsonArray("pickupTimes").forEach(x -> pt.add(x.getAsString()));
                    if (pp.size() == pt.size()) { r.pickups = List.copyOf(pp); r.pickupTimes = List.copyOf(pt); }
                }
                r.homeTime = str(o, "homeTime");
                List<Member> ms = new ArrayList<>();
                if (o.has("members")) for (JsonElement me : o.getAsJsonArray("members")) {
                    JsonObject x = me.getAsJsonObject();
                    if ("driver".equals(str(x, "role"))) continue;   // 운전자 역할은 없앰(2026-10-27) - 예전 방의 기사님은 빼고 읽음
                    Member m = new Member(x.get("id").getAsInt(), x.get("token").getAsString(), x.get("nick").getAsString(), x.get("role").getAsString(), r, lng(x, "joinedAt"));
                    m.seat = num(x, "seat") == null ? null : num(x, "seat").intValue();
                    m.bus = x.has("bus") ? x.get("bus").getAsInt() : 1;
                    m.stop = str(x, "stop"); m.boarded = boolOf(x, "boarded"); m.aboard = boolOf(x, "aboard"); m.apart = boolOf(x, "apart"); m.cancelled = boolOf(x, "cancelled");
                    m.rostered = boolOf(x, "rostered"); m.listed = boolOf(x, "listed"); m.office = boolOf(x, "office"); m.app = boolOf(x, "app"); m.drop = str(x, "drop"); m.dropHow = str(x, "dropHow"); m.dropPlan = str(x, "dropPlan"); m.pickup = str(x, "pickup");
                    ms.add(m);
                    r.nextId = Math.max(r.nextId, m.id + 1);
                }
                for (Member m : ms) { r.members.put(m.token, m); byToken.put(m.token, m); }   // 방을 다 읽은 뒤에만 열쇠를 올림
                rooms.put(r.code, r);
            } catch (Exception ex) {
                bad++;
                log.warn("[PARTY] 방 하나를 읽지 못해 건너뜀 - {}", ex.toString());
            }
        }
        if (bad > 0) backup();   // 건너뛴 방이 다음 저장에 영영 지워지지 않게 옛 파일을 남김
        boolean filled = false;
        for (Room r : rooms.values()) if (r.leadCode == null) { r.leadCode = newCode(); filled = true; }   // 코드 전에 만든 방(10-21)
        if (filled) save();   // 다시 켤 때 다른 코드가 되지 않게
        log.info("[PARTY] 방 {}개 읽음{}", rooms.size(), bad > 0 ? " (" + bad + "개 건너뜀 - party.json.bad-* 에 옛 파일)" : "");
    }

    /** 읽지 못한 파일을 party.json.bad-<시각> 으로 남김(600). */
    private void backup() {
        try {
            Path b = file.resolveSibling("party.json.bad-" + System.currentTimeMillis());
            Files.copy(file, b);
            try { Files.setPosixFilePermissions(b, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")); } catch (UnsupportedOperationException e) { /* 윈도 */ }
        } catch (Exception e) {
            log.warn("[PARTY] 옛 파일을 남기지 못함 - {}", e.toString());
        }
    }

    private static long lng(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsLong() : 0;
    }

    private static boolean boolOf(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() && o.get(k).getAsBoolean();
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
        o.addProperty("closesAt", r.closesAt());   // 방이 저절로 끝나는 때(하산 마감 6시간 뒤 - 2026-10-21 홍TV님: 마감이 지난 방에 "출발까지 9시간 지남"만 보였음)
        o.addProperty("hikers", r.hikers());
        if (r.leaderName != null) o.addProperty("leaderName", r.leaderName);
        if (r.leaderPhone != null && me != null) o.addProperty("leaderPhone", r.leaderPhone);   // 참가한 사람에게만(방 코드만 아는 사람에게 연락처가 안 보이게 - 점검, 참가 안내 글에는 그대로)
        o.addProperty("buses", r.buses);
        o.add("plates", plateArray(r));
        o.addProperty("seats", r.seats);
        JsonArray bs = new JsonArray();
        for (int x : r.busSeats) bs.add(x);
        o.add("busSeats", bs);   // 호차마다 좌석 수(seats 는 가장 큰 값)
        o.add("stops", strings(r.stops));
        if (!r.stopTimes.isEmpty()) o.add("stopTimes", strings(r.stopTimes));   // 탑승지마다 출발 시각
        if (!r.drops.isEmpty()) o.add("drops", strings(r.drops));   // 하차 지점(2026-10-28)
        if (!r.pickups.isEmpty()) {   // 하산 탑승지 · 출발 때(ms)
            o.add("pickups", strings(r.pickups));
            o.add("pickupTimes", strings(r.pickupTimes));
            JsonObject pa = new JsonObject();
            for (String p : r.pickups) if (pickupAt(r, p) > 0) pa.addProperty(p, pickupAt(r, p));
            o.add("pickupAt", pa);
        }
        if (homeAt(r) > 0) { o.addProperty("homeAt", homeAt(r)); o.addProperty("homeTime", r.homeTime); }   // 서울 도착 예정
        JsonArray taken = new JsonArray(), booked = new JsonArray();   // 호차 × 100 + 좌석
        for (Member m : r.members.values()) if (m.seat != null && !m.cancelled && m != me)
            (m.listed ? booked : taken).add(m.bus * 100 + m.seat);   // 명단에만 있는 자리는 "예약" - 같은 이름이 둘일 때 좌석으로 고름(2026-10-26 PC)
        o.add("booked", booked);
        o.add("taken", taken);
        o.addProperty("departed", r.departed);
        o.addProperty("stopsDone", r.departed ? r.stops.size() : r.stopsDone);   // 출발한 탑승지 수(차례대로)
        return o;
    }

    synchronized JsonObject info(String code, long now) {
        Room r = room(code, now);
        JsonObject o = about(r, null);
        if (code.trim().toUpperCase().equals(r.leadCode)) o.addProperty("leadInvite", true);
        if (code.trim().toUpperCase().equals(r.meCode) && now <= r.meCodeUntil) { o.addProperty("leadInvite", true); o.addProperty("meInvite", true); }   // 주 인솔자 내 폰
        o.addProperty("assistMax", r.buses);   // 공동 인솔자 코드로 들어옴 - 참가 칸에 좌석 · 탑승지 없음
        return o;
    }

    /**
     * 방 화면. 모두: 방 소개 · 공지 · 버스 · 내 상태 · 회원(별명 · 좌석 · 위치 · SOS · 하산 탑승).
     * 인솔자는 더해서: 배터리 · 정확도 · 그 자리에 머문 분 · 탑승지 · 출발 탑승 · 취소 · 명단만.
     */
    synchronized JsonObject view(Member me, long now) {
        Room r = me.room;
        boolean staff = me.staff();
        JsonObject o = about(r, me);
        o.addProperty("role", me.role);
        o.addProperty("me", me.id);
        if (me.chief()) o.addProperty("chief", true);
        if (me.office) o.addProperty("officeMe", true);   // 회사 사무실 자리 - 위치를 보내지 않음, 방 끝내기 됨
        if (r.officeName != null) o.addProperty("office", r.officeName);   // 회원에게도 - 위치를 받는 사람
        o.addProperty("assistMax", r.buses);
        if (me.chief() && r.leadCode != null) o.addProperty("leadCode", r.leadCode);   // 보조 인솔자 코드는 주 인솔자만(보조가 또 퍼뜨리지 않게, 2026-10-28)
        o.addProperty("nick", me.nick);
        o.addProperty("boarded", me.boarded);
        o.addProperty("aboard", me.aboard);
        if (me.apart) o.addProperty("apart", true);
        if (me.providedAt > 0) o.addProperty("providedAt", me.providedAt);   // 내 위치를 인솔자에게 마지막으로 제공한 때(매회 즉시 통보)
        o.addProperty("cancelled", me.cancelled);
        o.addProperty("bus", me.bus);
        if (me.seat != null) o.addProperty("seat", me.seat);
        if (me.stop != null) o.addProperty("stop", me.stop);
        if (me.drop != null) o.addProperty("drop", me.drop);
        if (me.pickup != null) o.addProperty("pickup", me.pickup);
        if (deadline(me) > 0) o.addProperty("myEndAt", deadline(me));   // 내 하산 마감 = 내 하산 탑승지 시각
        Object[] arr = r.lastArrival();   // 하차 안내 - 버스 안 회원에게 15분(답했으면 안 띄움)
        if (arr != null && now - (Long) arr[1] <= ARRIVE_MS && "hiker".equals(me.role) && !me.cancelled && !me.aboard && me.arrAns != (Long) arr[1]) {
            JsonObject a = new JsonObject();
            a.addProperty("drop", (String) arr[0]);
            a.addProperty("at", (Long) arr[1]);
            o.add("arrive", a);
        }
        if (staff && !r.arrivals.isEmpty()) {   // 인솔자 - 도착 기록 · 거기서 내린 사람 수
            JsonArray al = new JsonArray();
            for (Object[] x : r.arrivals) {
                JsonObject a = new JsonObject();
                a.addProperty("drop", (String) x[0]);
                a.addProperty("at", (Long) x[1]);
                int n = 0;
                for (Member m : r.members.values()) if ("hiker".equals(m.role) && m.dropHow != null && x[0].equals(m.drop)) n++;
                a.addProperty("off", n);
                al.add(a);
            }
            o.add("arrivals", al);
        }
        o.addProperty("now", now);
        if (r.departedAt > 0) o.addProperty("departedAt", r.departedAt);   // "10분 소식 없음" 은 산행 시작 10분 뒤부터
        o.addProperty("locOn", started(me, now));   // 위치는 내 탑승지 출발 시각 · 탄 때 · 산행 시작부터(2026-10-27 홍TV님)
        if (stopAt(r, me.stop) > 0) o.addProperty("locFrom", stopAt(r, me.stop));
        if (r.notice != null) { o.addProperty("notice", r.notice); o.addProperty("noticeAt", r.noticeAt); }
        JsonArray pins = new JsonArray();   // 버스 세운 자리 - 회원은 자기 호차만, 인솔자는 다
        r.busAt.forEach((k, v) -> {
            if (!staff && k != me.bus) return;
            JsonObject p = new JsonObject();
            p.addProperty("bus", k); p.addProperty("lat", v[0]); p.addProperty("lon", v[1]);
            pins.add(p);
        });
        o.add("busPins", pins);
        o.addProperty("count", r.members.size());
        JsonArray list = new JsonArray();
        int aboard = 0, apart = 0;
        for (Member m : r.members.values()) {
            if (m.cancelled && !staff) continue;
            JsonObject x = new JsonObject();
            x.addProperty("id", m.id);
            x.addProperty("nick", m.nick);
            x.addProperty("role", m.role);
            if (m.office) x.addProperty("office", true);   // 회사 사무실 자리
            if (m.drop != null && (staff || m == me || m.staff())) x.addProperty("drop", m.drop);   // 하차 지점 - 인솔자는 모두, 회원은 자기 것 · 인솔자 것
            if (m.pickup != null && (staff || m == me)) x.addProperty("pickup", m.pickup);   // 하산 탑승지
            if (staff && m.dropHow != null) x.addProperty("dropHow", m.dropHow);   // 실제로 내림: me · auto(위치) · lead
            if (staff && m.dropPlan != null) x.addProperty("dropPlan", m.dropPlan);   // 처음 계획
            if (m.chief()) x.addProperty("chief", true);   // 주 인솔자(나머지 lead 는 보조) - 회원도 위치를 받는 사람을 모두 봄
            x.addProperty("bus", m.bus);
            if (m.seat != null) x.addProperty("seat", m.seat);
            x.addProperty("sos", m.sos);
            x.addProperty("aboard", m.aboard);
            if (m.apart) { x.addProperty("apart", true); apart++; }
            if (m.aboard) aboard++;
            // 위치는 인솔자와 자기 것만(2026-10-24 홍TV님 - 인솔자 위주, 회원은 따라가기 지도로 걷고 남의 위치는 안 봄)
            if (m.t > 0 && m.lat != null && (staff || m == me)) {   // 하산 탑승하면 위치를 지움(aboard)
                if (staff && m != me) m.providedAt = now;   // 인솔자에게 제공한 때 - 회원 화면에 바로 알림
                x.addProperty("lat", m.lat);
                x.addProperty("lon", m.lon);
                x.addProperty("ago", (now - m.t) / 1000);
            }
            if (m.msg != null && (staff || m == me)) { x.addProperty("msg", m.msg); x.addProperty("msgAt", m.msgAt); }   // 인솔자에게 한 줄
            if (staff) {
                if (m.app) x.addProperty("app", true);   // 📱 앱(화면을 꺼도 보냄) · 아니면 🌐 웹
                x.addProperty("boarded", m.boarded);
                x.addProperty("cancelled", m.cancelled);
                if (m.listed) x.addProperty("listed", true);   // 명단에만(핸드폰 안 들어옴)
                if (m.stop != null) x.addProperty("stop", m.stop);
                if (m.batt != null) x.addProperty("batt", m.batt);
                if (m.seen > 0) x.addProperty("seen", (now - m.seen) / 1000);   // 폰이 살아 있다고 알린 지 몇 초(위치보다 새로울 수 있음)
                if (m.t > 0) {
                    if (m.acc != null) x.addProperty("acc", Math.round(m.acc));
                    x.addProperty("stillMin", (now - m.stillSince) / 60000);
                }
            }
            list.add(x);
        }
        o.add("members", list);
        o.addProperty("aboardCount", aboard);   // 따로 귀가 포함(하산이 끝난 사람)
        o.addProperty("apartCount", apart);
        return o;
    }
}
