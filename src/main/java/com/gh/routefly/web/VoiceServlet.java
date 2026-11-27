package com.gh.routefly.web;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.YearMonth;
import java.util.regex.Pattern;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 🎙 목소리 만들기(2026-11-21 홍TV님 "이거 만들자" - Vrew 무료 크레딧이 모자라 산 이야기 해설 목소리를 우리 화면에서).
 * 운영자만: 통계와 같은 열쇠(stats.key) 또는 /stats 보기 쿠키(경로 /check 라 이 주소에도 감), 아니면 404.
 *
 * <ul>
 *   <li>{@code GET /check/voice} - 화면(js/voice.js). 해설 한 줄 = 한 장면, 줄마다 만들어 이어 붙여 wav · srt 를 내려받음.</li>
 *   <li>{@code GET /check/voice?list=1} - 한국어(ko-KR) 목소리 목록(Azure voices/list, 하루 담아 둠).</li>
 *   <li>{@code POST /check/voice} {text, voice, rate} - 한 줄을 Azure 음성(신경망 TTS)으로 만들어 wav(24kHz 16bit 모노) 그대로.</li>
 * </ul>
 * 키는 설정 voice.azure.key · voice.azure.region(서버에만, 브라우저로 나가지 않음). 무료 등급(F0)은 한 달 50만 자를 넘으면 멈출 뿐 돈이 나가지 않음.
 * 이번 달에 보낸 글자 수는 파일(stats.dir/voice-usage.txt "달 글자")에 남김 - 서버를 다시 켜도 이어 셈(2026-11-26 홍TV님 "50만자 중 기존 얼마를 사용했고").
 * 이 셈을 시작하기 전(2026-11-26 전)에 쓴 양 · 다른 곳에서 같은 키로 쓴 양은 모름 - 정확한 양은 Azure 포털.
 */
@WebServlet(urlPatterns = {"/check/voice"})
public class VoiceServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    /** 한 번에 보내는 한 줄의 최대 글자 수 - 대본 한 줄은 100자 안팎. */
    static final int MAX_CHARS = 400;
    /** 빠르기 범위(%) - 0 이 보통. */
    static final int MIN_RATE = -50, MAX_RATE = 50;
    /** Azure 목소리 이름 모양(예 ko-KR-…Neural) - SSML 에 그대로 넣으므로 이 모양만 받음. */
    static final Pattern VOICE = Pattern.compile("^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+Neural$");
    static final String FORMAT = "riff-24khz-16bit-mono-pcm";

    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private static volatile String voicesJson;
    private static volatile long voicesAt;
    private static String month = "";
    private static long monthChars;
    /** 이번 달 글자 파일 - null 이면 아직 안 읽음. 테스트는 바꿔 끼움. */
    static java.nio.file.Path usageFile;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!StatsServlet.seeOk(req, resp)) return;
        resp.setHeader("Cache-Control", "no-store");
        resp.setHeader("X-Robots-Tag", "noindex");
        if (req.getParameter("list") != null) {
            String key = RouteflyConfig.get("voice.azure.key"), region = region();
            if (blank(key) || region == null) { json(resp, 503, err("voice.azure.key · voice.azure.region 설정이 없습니다")); return; }
            String list = voicesJson;
            if (list == null || System.currentTimeMillis() - voicesAt > 24 * 3600_000L) {
                try {
                    HttpResponse<String> r = HTTP.send(HttpRequest.newBuilder(URI.create("https://" + region + ".tts.speech.microsoft.com/cognitiveservices/voices/list"))
                            .timeout(Duration.ofSeconds(20)).header("Ocp-Apim-Subscription-Key", key).GET().build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    if (r.statusCode() != 200) { json(resp, 502, err("목소리 목록을 받지 못했습니다(HTTP " + r.statusCode() + ")")); return; }
                    list = koVoices(r.body()).toString();
                    voicesJson = list;
                    voicesAt = System.currentTimeMillis();
                } catch (IOException | RuntimeException e) {
                    json(resp, 502, err("목소리 목록을 받지 못했습니다"));
                    return;
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    json(resp, 502, err("목소리 목록을 받지 못했습니다"));
                    return;
                }
            }
            JsonObject out = new JsonObject();
            out.add("voices", JsonParser.parseString(list));
            out.addProperty("monthChars", used(0));
            json(resp, 200, out);
            return;
        }
        resp.setContentType("text/html");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.getWriter().print(page());
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!StatsServlet.seeOk(req, resp)) return;
        resp.setHeader("Cache-Control", "no-store");
        String key = RouteflyConfig.get("voice.azure.key"), region = region();
        if (blank(key) || region == null) { json(resp, 503, err("voice.azure.key · voice.azure.region 설정이 없습니다")); return; }
        JsonObject in;
        try {
            byte[] body = req.getInputStream().readNBytes(8192);
            in = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (RuntimeException e) {
            json(resp, 400, err("요청 모양이 틀렸습니다"));
            return;
        }
        String text = str(in, "text"), voice = str(in, "voice");
        int rate;
        try {
            rate = in.has("rate") && in.get("rate").isJsonPrimitive() ? in.get("rate").getAsInt() : 0;
        } catch (NumberFormatException e) {
            json(resp, 400, err("rate 는 숫자입니다"));   // 점검 14차(2026-11-24): 전에는 500
            return;
        }
        String bad = check(text, voice, rate);
        if (bad != null) { json(resp, 400, err(bad)); return; }
        try {
            HttpResponse<byte[]> r = HTTP.send(HttpRequest.newBuilder(URI.create("https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1"))
                    .timeout(Duration.ofSeconds(30)).header("Ocp-Apim-Subscription-Key", key).header("Content-Type", "application/ssml+xml")
                    .header("X-Microsoft-OutputFormat", FORMAT).header("User-Agent", "routefly-voice")
                    .POST(HttpRequest.BodyPublishers.ofString(ssml(text.trim(), voice, rate), StandardCharsets.UTF_8)).build(), HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() != 200) {
                // 429 - 무료 등급 한도 · 너무 잦음, 401 · 403 - 키 · 지역이 틀림
                json(resp, r.statusCode() == 429 ? 429 : 502, err(r.statusCode() == 429 ? "Azure 한도에 걸렸습니다(잠시 뒤 · 이번 달 무료 양 확인)" : "목소리를 만들지 못했습니다(HTTP " + r.statusCode() + ")"));
                return;
            }
            used(text.trim().length());
            resp.setContentType("audio/wav");
            resp.setContentLength(r.body().length);
            resp.getOutputStream().write(r.body());
        } catch (IOException | RuntimeException e) {
            json(resp, 502, err("목소리를 만들지 못했습니다"));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            json(resp, 502, err("목소리를 만들지 못했습니다"));
        }
    }

    /** 순수 함수 - 보낼 수 없는 요청이면 까닭, 되면 null. */
    static String check(String text, String voice, int rate) {
        if (text == null || text.isBlank()) return "글이 비었습니다";
        if (text.trim().length() > MAX_CHARS) return "한 줄은 " + MAX_CHARS + "자까지입니다";
        if (voice == null || !VOICE.matcher(voice).matches()) return "목소리 이름이 틀렸습니다";
        if (rate < MIN_RATE || rate > MAX_RATE) return "빠르기는 " + MIN_RATE + " ~ " + MAX_RATE + "% 입니다";
        return null;
    }

    /** 순수 함수 - Azure 에 보낼 SSML. 글은 XML 이스케이프, 목소리는 {@link #VOICE} 모양만(check 를 지난 값), 빠르기는 +n% · -n%. */
    static String ssml(String text, String voice, int rate) {
        String lang = voice.substring(0, voice.indexOf('-', voice.indexOf('-') + 1));
        return "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"" + lang + "\"><voice name=\"" + voice + "\"><prosody rate=\""
                + (rate >= 0 ? "+" : "") + rate + "%\">" + xml(text) + "</prosody></voice></speak>";
    }

    static String xml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }

    /** 순수 함수 - Azure voices/list 응답 → 한국어 목소리만 [{name(ShortName), local(LocalName), gender}]. */
    static JsonArray koVoices(String body) {
        JsonArray out = new JsonArray();
        for (JsonElement e : JsonParser.parseString(body).getAsJsonArray()) {
            JsonObject v = e.getAsJsonObject();
            if (!"ko-KR".equals(str(v, "Locale"))) continue;
            String name = str(v, "ShortName");
            if (name == null || !VOICE.matcher(name).matches()) continue;
            JsonObject o = new JsonObject();
            o.addProperty("name", name);
            o.addProperty("local", str(v, "LocalName"));
            o.addProperty("gender", str(v, "Gender"));
            out.add(o);
        }
        return out;
    }

    /** 이번 달 보낸 글자 수(n 을 더하고 돌려줌). 달이 바뀌면 0부터. 처음 부를 때 파일에서 읽고, 더하면 파일에 씀(못 쓰면 메모리로만). */
    static synchronized long used(int n) {
        String m = YearMonth.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        if (usageFile == null) {
            String dir = RouteflyConfig.get("stats.dir");
            if (dir == null) dir = System.getProperty("catalina.base", System.getProperty("java.io.tmpdir")) + "/routefly-stats";
            usageFile = java.nio.file.Paths.get(dir, "voice-usage.txt");
            readUsage();
        }
        if (!m.equals(month)) { month = m; monthChars = 0; }
        monthChars += n;
        if (n > 0) {
            try {
                java.nio.file.Files.createDirectories(usageFile.getParent());
                java.nio.file.Files.writeString(usageFile, month + " " + monthChars + "\n", StandardCharsets.UTF_8);
            } catch (IOException | RuntimeException e) { /* 메모리로만 셈 */ }
        }
        return monthChars;
    }

    /** voice-usage.txt "2026-11 8059" → month · monthChars. 없거나 모양이 다르면 그대로. */
    private static void readUsage() {
        try {
            String[] a = java.nio.file.Files.readString(usageFile, StandardCharsets.UTF_8).trim().split("\\s+");
            if (a.length == 2 && a[0].matches("\\d{4}-\\d{2}")) { month = a[0]; monthChars = Long.parseLong(a[1]); }
        } catch (IOException | RuntimeException e) { /* 처음 */ }
    }

    /** 테스트용 - 파일을 바꿔 끼우고 메모리 셈을 비움. */
    static synchronized void resetUsage(java.nio.file.Path file) { usageFile = file; month = ""; monthChars = 0; if (file != null) readUsage(); }

    /** 지역 이름은 영문 소문자 · 숫자만(주소에 들어감). */
    static String region() {
        String r = RouteflyConfig.get("voice.azure.region");
        return r != null && r.trim().matches("[a-z0-9]{3,30}") ? r.trim() : null;
    }

    static String page() {
        // 2026-11-25 홍TV님 "나만 사용해도 화면 디자인이 영 없어. 잘 만들어 줘" - 설정 · 해설 · 줄 카드, 아래 고정 단추 줄, 진행 막대
        return "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<meta name=\"robots\" content=\"noindex\"><title>목소리 만들기 - routefly</title>" + MountainServlet.icons("..")
                + "<link rel=\"stylesheet\" href=\"../" + AssetVersion.of("css/mountain.css") + "\">"
                + "<style>"
                + "main.vc{max-width:880px;margin:0 auto;padding:18px 16px 120px;font-size:14px}"
                + ".vc-hd{display:flex;align-items:center;gap:12px;margin:4px 0 14px}.vc-hd .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-size:24px;background:linear-gradient(135deg,#7ED321,#0E9F57)}"
                + ".vc-hd h1{font-size:21px;margin:0;line-height:1.2}.vc-hd p{margin:2px 0 0;color:var(--dim);font-size:13px}"
                + ".vc-card{background:var(--panel);border:1px solid var(--ln);border-radius:14px;padding:14px 16px;margin-bottom:14px}"
                + ".vc-card h2{font-size:14px;margin:0 0 10px;color:var(--dim);font-weight:600;letter-spacing:.02em}"
                + ".vc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 14px}"
                + ".vc-f{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--dim)}.vc-f.wide{grid-column:span 2}"
                + ".vc input,.vc select,.vc textarea{font:inherit;font-size:14px;color:var(--tx);background:var(--bg);border:1px solid var(--ln);border-radius:9px;padding:8px 10px;box-sizing:border-box;width:100%}"
                + ".vc input:focus,.vc select:focus,.vc textarea:focus{outline:2px solid var(--sky);outline-offset:-1px}"
                + ".vc-unit{display:flex;align-items:center;gap:6px}.vc-unit span{color:var(--dim)}"
                + ".vc-try{display:flex;gap:8px;align-items:flex-end;margin-top:12px;padding-top:12px;border-top:1px dashed var(--ln);flex-wrap:wrap}.vc-try .vc-f{flex:1;min-width:200px}"
                + ".vc textarea{min-height:240px;line-height:1.7;resize:vertical}"
                // 해설 칸 왼쪽 줄 번호(2026-11-26 홍TV님 "해설에 있는 글에도 동일하게 숫자 표시") - 줄 목록과 같은 번호(빈 줄 · ``` 줄은 번호 없음), 줄이 꺾여도 첫 줄에
                + ".vc-ed{position:relative}.vc-ed textarea{padding-left:46px;display:block}.vc-no{position:absolute;left:1px;top:1px;bottom:1px;width:38px;overflow:hidden;pointer-events:none;border-right:1px solid var(--ln);border-radius:9px 0 0 9px;background:var(--panel)}"
                + ".vc-no span{position:absolute;right:6px;font-size:11.5px;color:var(--sky);font-variant-numeric:tabular-nums}"
                + ".vc-tip{margin:8px 0 0;font-size:12.5px;color:var(--dim)}.vc-tip code{background:var(--bg);border:1px solid var(--ln);border-radius:6px;padding:1px 6px;color:var(--tx)}"
                + ".vc button{font:inherit;font-size:14px;cursor:pointer;border-radius:10px;border:1px solid var(--ln);background:var(--bg);color:var(--tx);padding:8px 12px;min-height:38px;white-space:nowrap}"
                + ".vc button:hover:not(:disabled){border-color:var(--sky)}.vc button:disabled{opacity:.4;cursor:default}"
                + ".vc-open{display:flex;gap:8px;align-items:center;margin-bottom:8px}.vc-open select{flex:1;min-width:0}"
                + ".vc button.pri{background:var(--sky);border-color:var(--sky);color:#06222a;font-weight:700}"
                + ".vc-bar{position:sticky;bottom:0;z-index:5;margin:0 -16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--panel);border-top:1px solid var(--ln);box-shadow:0 -6px 18px rgba(0,0,0,.18)}"
                + ".vc-btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.vc-btns .sp{flex:1}"
                + ".vc-prog{height:4px;border-radius:2px;background:var(--ln);margin:8px 0 4px;overflow:hidden}.vc-prog i{display:block;height:100%;width:0;background:var(--sky);transition:width .2s}"
                + "#vcInfo{display:block;font-size:12.5px}"
                + ".vc-sum{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--dim);margin:0 0 8px}.vc-sum b{color:var(--tx)}"
                + "#vcLines{list-style:none;margin:0;padding:0;counter-reset:n}"
                + "#vcLines li{display:grid;grid-template-columns:30px 1fr auto;gap:4px 10px;align-items:start;padding:10px 0;border-top:1px solid var(--ln)}#vcLines li:first-child{border-top:0}"
                + "#vcLines .no{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:var(--bg);border:1px solid var(--ln);color:var(--dim)}"
                + "#vcLines li.ok .no{background:rgba(56,217,234,.15);border-color:var(--sky);color:var(--sky)}#vcLines li.bad .no{background:rgba(255,135,135,.15);border-color:#ff8787;color:#ff8787}"
                + "#vcLines li.now{background:rgba(56,217,234,.10);box-shadow:inset 3px 0 0 var(--sky);border-radius:8px}"   // 전체 듣기 중 읽는 줄(2026-11-26)
                + "#vcLines .tx{line-height:1.6}#vcLines .rd{display:block;font-size:12.5px;color:#ffb84d;margin-top:2px}#vcLines .rd::before{content:'🔈 읽기 {';}#vcLines .rd::after{content:'}';}"   // 읽는 말은 주황 · { } (2026-11-26 홍TV님 "{읽기} 이렇게 하든가 색을 넣든가")
                + "#vcLines .st{grid-column:2;font-size:12px;color:var(--dim)}#vcLines li.bad .st{color:#ff8787}"
                + "#vcLines .bt{grid-row:1 / span 2;grid-column:3;display:flex;gap:6px}#vcLines .bt button{padding:6px 9px;min-height:34px}"
                + "@media(max-width:560px){.vc-f.wide{grid-column:auto}#vcLines li{grid-template-columns:26px 1fr}#vcLines .bt{grid-row:auto;grid-column:2}.vc-btns .sp{display:none}.vc-btns{gap:6px}.vc button{padding:7px 9px;font-size:13px}}"
                + "</style></head><body><main class=\"vc\">"
                + "<div class=\"vc-hd\"><div class=\"ic\">🎙</div><div><h1>목소리 만들기</h1><p>해설 한 줄 = 한 장면 · 줄마다 만들어 이어 붙여 &lt;산&gt;.wav · &lt;산&gt;.srt(make_v2 --voice --srt 에 그대로)</p></div></div>"
                + "<div class=\"vc-card\"><h2>설정</h2><div class=\"vc-grid\">"
                + "<label class=\"vc-f\">산 이름(파일 이름)<input id=\"vcName\" placeholder=\"두타산\"></label>"
                + "<label class=\"vc-f wide\">목소리<select id=\"vcVoice\"><option value=\"\">불러오는 중…</option></select></label>"
                + "<label class=\"vc-f\">빠르기<span class=\"vc-unit\"><input id=\"vcRate\" type=\"number\" min=\"" + MIN_RATE + "\" max=\"" + MAX_RATE + "\" step=\"5\" value=\"0\"><span>%</span></span></label>"
                + "<label class=\"vc-f\">줄 사이<span class=\"vc-unit\"><input id=\"vcGap\" type=\"number\" min=\"0\" max=\"2000\" step=\"50\" value=\"300\"><span>ms</span></span></label></div>"
                // 견줘 듣기(2026-11-25 홍TV님) - 줄마다 🎧 로 한두 줄만 들어 보고, 마음에 들면 바꾸기(만든 소리는 그대로)
                + "<div class=\"vc-try\"><label class=\"vc-f\">견줘 듣기 - 줄마다 🎧 로 이 목소리를 한두 줄만<select id=\"vcTry\"><option value=\"\">고르기</option></select></label>"
                + "<button id=\"vcUse\" title=\"견줄 목소리를 쓰는 목소리로\">⇄ 이 목소리로 바꾸기</button></div></div>"
                + "<div class=\"vc-card\"><h2>해설</h2>"
                // 📂 열기 · 산마다 저장(2026-11-27 홍TV님) - 대본 md 의 해설 블록 · srt · txt 를 해설 칸에, 고친 글은 산 이름마다 이 브라우저에(voice.js fromFile · savedNames)
                + "<div class=\"vc-open\"><button id=\"vcOpen\" title=\"💾 저장한 목소리 작업(.rfvoice - 소리까지) · 대본 md(해설 블록) · srt · txt\">📂 열기</button>"
                + "<button id=\"vcSave\" title=\"글 · 목소리 · 빠르기 · 만든 소리를 파일(.rfvoice)로 - 저장할 곳을 고름\">💾 저장</button>"
                + "<input id=\"vcFile\" type=\"file\" accept=\".rfvoice,.md,.srt,.txt,text/plain,text/markdown\" hidden>"
                + "<select id=\"vcSaved\" aria-label=\"저장한 산\"><option value=\"\">📚 저장한 산 (0)</option></select>"
                + "<button id=\"vcForget\" title=\"고른 산을 저장한 목록에서 지우기\" aria-label=\"저장한 산 지우기\">✕</button></div>"
                + "<div class=\"vc-ed\"><div class=\"vc-no\" id=\"vcNo\" aria-hidden=\"true\"></div><textarea id=\"vcText\" placeholder=\"해설 블록을 붙여 넣으세요 - 한 줄이 한 장면\"></textarea></div>"
                // 2026-11-25 홍TV님 - 읽는 말만 바꾸고 자막은 그대로(voice.js spoken · shown)
                + "<p class=\"vc-tip\">발음이 어색한 낱말은 바로 뒤에 { } 로 읽는 말 - 예) <code>대가야{대 가야}</code> → 소리는 { } 안 말, 자막 · srt 는 대가야 그대로. 띄어 쓴 낱말을 붙여 읽을 때는 그대로 - <code>리만 가설{리만가설}</code>, 다르게 읽을 때는 [ ] 로 묶기 - <code>[켜 두어야]{켜 두워야}</code>.</p></div>"
                + "<div class=\"vc-card\"><h2>줄</h2><div class=\"vc-sum\" id=\"vcSum\"></div><ol id=\"vcLines\"></ol></div>"
                + "<p class=\"dim\">글은 Microsoft Azure 음성 서비스로 보내 목소리를 만듭니다(운영자만). 같은 줄 · 같은 목소리 · 같은 빠르기는 다시 보내지 않습니다(이 창을 닫으면 처음부터 - 💾 저장하면 만든 소리까지 파일(.rfvoice)로 남아 📂 열기로 다시 넣음 - 이 브라우저의 📚 저장한 산에도).</p>"
                + "<div class=\"vc-bar\"><div class=\"vc-btns\"><button id=\"vcMake\" class=\"pri\">▶ 바뀐 줄만 만들기</button><button id=\"vcPlay\">🔊 전체 듣기</button>"
                + "<button id=\"vcRestart\" hidden title=\"처음부터 듣기\">⏮ 처음부터</button><span class=\"sp\"></span><button id=\"vcWav\">⬇ wav</button><button id=\"vcSrt\">⬇ srt</button></div>"
                + "<div class=\"vc-prog\"><i id=\"vcProg\"></i></div><span id=\"vcInfo\" class=\"dim\"></span></div>"
                + "</main><script src=\"../" + AssetVersion.of("js/voice.js") + "\"></script></body></html>";
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() ? null : e.getAsString();
    }

    private static JsonObject err(String m) {
        JsonObject o = new JsonObject();
        o.addProperty("error", m);
        return o;
    }

    private static void json(HttpServletResponse resp, int code, JsonObject o) throws IOException {
        resp.setStatus(code);
        resp.setContentType("application/json");
        resp.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resp.getWriter().print(o.toString());
    }
}
