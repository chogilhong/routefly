package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 의견 보내기(2026-10-20 홍TV님 - "나에게 메일"). */
public class FeedbackTest {

    static final long T0 = 1_760_000_000_000L;

    static JsonObject j(String s) {
        return JsonParser.parseString(s).getAsJsonObject();
    }

    @Test
    public void checksInput() {
        assertEquals("가나\n다", Feedback.text("  가나\r\n다\u0007 "));
        assertEquals(1000, Feedback.text("가".repeat(1500)).length());
        try { Feedback.text(" 가 "); fail("너무 짧음"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertNull(Feedback.reply("  "));
        assertEquals("a.b@c.kr", Feedback.reply(" a.b@c.kr "));
        try { Feedback.reply("a@b.kr\r\nBcc: x@y.z"); fail("메일 머리 끼워 넣기"); } catch (IllegalArgumentException e) { /* 맞음 */ }
        assertEquals("/m/bukhansan", Feedback.page("/m/bukhansan?<x>"));
    }

    @Test
    public void savesAndLimits() throws Exception {
        Path dir = Files.createTempDirectory("fb");
        Feedback f = new Feedback(dir);
        for (int i = 0; i < 3; i++) FeedbackServlet.handle(f, j("{\"text\":\"글 " + i + "\",\"page\":\"/hike.html\",\"reply\":\"a@b.kr\"}"), "1.2.3.4", T0 + i);
        try { FeedbackServlet.handle(f, j("{\"text\":\"넷째\"}"), "1.2.3.4", T0 + 10); fail("10분에 3번"); } catch (IllegalStateException e) { /* 맞음 */ }
        FeedbackServlet.handle(f, j("{\"text\":\"다른 곳\"}"), "5.6.7.8", T0 + 10);
        FeedbackServlet.handle(f, j("{\"text\":\"10분 뒤\"}"), "1.2.3.4", T0 + 601_000);
        List<JsonObject> r = f.recent(30);
        assertEquals(5, r.size());
        assertEquals("새것부터", "10분 뒤", r.get(0).get("text").getAsString());
        assertEquals("a@b.kr", r.get(4).get("reply").getAsString());
        Path file = dir.resolve("feedback-2025-10.jsonl");
        assertTrue(Files.exists(file));
        assertFalse("IP 는 남기지 않음", Files.readString(file).contains("1.2.3.4"));
        try { assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(file))); } catch (UnsupportedOperationException e) { /* 윈도 */ }

        // 12달 지난 파일은 지움
        Files.writeString(dir.resolve("feedback-2024-09.jsonl"), "{}\n");
        Files.writeString(dir.resolve("feedback-2024-11.jsonl"), "{\"at\":1,\"text\":\"x\"}\n");
        FeedbackServlet.handle(f, j("{\"text\":\"또 하나\"}"), "9.9.9.9", T0 + 700_000);
        assertFalse(Files.exists(dir.resolve("feedback-2024-09.jsonl")));
        assertTrue(Files.exists(dir.resolve("feedback-2024-11.jsonl")));

        String html = StatsServlet.feedbackHtml(List.of(j("{\"at\":" + T0 + ",\"page\":\"/x\",\"text\":\"<script>\"}")));
        assertTrue(html.contains("&lt;script&gt;") && !html.contains("<script>"));
    }

    /** 가짜 메일 서버(평문)로 보내 봄 - 순서 · 로그인 · 한글 제목 · 본문. */
    @Test
    public void sendsMail() throws Exception {
        List<String> got = new ArrayList<>();
        try (ServerSocket ss = new ServerSocket(0)) {
            Thread t = new Thread(() -> {
                try (Socket s = ss.accept()) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
                    OutputStream out = s.getOutputStream();
                    out.write("220 hi\r\n".getBytes()); out.flush();
                    boolean data = false;
                    for (String l; (l = in.readLine()) != null;) {
                        got.add(l);
                        String a;
                        if (data) { if (!l.equals(".")) continue; data = false; a = "250 queued"; }
                        else if (l.startsWith("EHLO")) a = "250-x\r\n250 AUTH LOGIN";
                        else if (l.equals("AUTH LOGIN") || got.size() == 3) a = "334 ?";
                        else if (got.size() == 4) a = "235 ok";
                        else if (l.equals("DATA")) { data = true; a = "354 go"; }
                        else if (l.equals("QUIT")) break;
                        else a = "250 ok";
                        out.write((a + "\r\n").getBytes()); out.flush();
                    }
                } catch (Exception e) { /* 끝 */ }
            });
            t.start();
            new Feedback.Mail("127.0.0.1", ss.getLocalPort(), false, "me@gmail.com", "app pw", "to@gmail.com").send("[routefly 의견] /hike.html", "길이 달라요\n둘째 줄", "a@b.kr");
            t.join(5000);
        }
        assertEquals("EHLO routefly", got.get(0));
        assertEquals(Base64.getEncoder().encodeToString("me@gmail.com".getBytes()), got.get(2));
        assertTrue(got.contains("MAIL FROM:<me@gmail.com>") && got.contains("RCPT TO:<to@gmail.com>") && got.contains("Reply-To: <a@b.kr>"));
        String subject = got.stream().filter(l -> l.startsWith("Subject: ")).findFirst().get();
        assertEquals("[routefly 의견] /hike.html", new String(Base64.getDecoder().decode(subject.substring("Subject: =?UTF-8?B?".length(), subject.length() - 2)), StandardCharsets.UTF_8));
        int at = got.indexOf("") + 1;
        StringBuilder body = new StringBuilder();
        for (int i = at; !got.get(i).equals("."); i++) body.append(got.get(i));
        assertEquals("길이 달라요\r\n둘째 줄", new String(Base64.getDecoder().decode(body.toString()), StandardCharsets.UTF_8));
    }
}
