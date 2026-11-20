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
 * 이번 달에 보낸 글자 수는 메모리에서만 셈(서버를 다시 켜면 0부터) - 화면에 참고로 보임.
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
        int rate = in.has("rate") && in.get("rate").isJsonPrimitive() ? in.get("rate").getAsInt() : 0;
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

    /** 이번 달 보낸 글자 수(n 을 더하고 돌려줌). 달이 바뀌면 0부터. */
    static synchronized long used(int n) {
        String m = YearMonth.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        if (!m.equals(month)) { month = m; monthChars = 0; }
        monthChars += n;
        return monthChars;
    }

    /** 지역 이름은 영문 소문자 · 숫자만(주소에 들어감). */
    static String region() {
        String r = RouteflyConfig.get("voice.azure.region");
        return r != null && r.trim().matches("[a-z0-9]{3,30}") ? r.trim() : null;
    }

    static String page() {
        return "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<meta name=\"robots\" content=\"noindex\"><title>목소리 만들기 - routefly</title>" + MountainServlet.icons("..")
                + "<link rel=\"stylesheet\" href=\"../" + AssetVersion.of("css/mountain.css") + "\">"
                + "<style>main{font-size:14px}textarea{width:100%;min-height:220px;box-sizing:border-box;font:inherit;background:var(--panel);color:var(--tx);border:1px solid var(--ln);border-radius:8px;padding:8px}"
                + ".vc-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.vc-bar select,.vc-bar input{font:inherit}"
                + "#vcLines li{display:flex;gap:6px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--ln)}#vcLines li span{flex:1}#vcLines li small{color:var(--dim);white-space:nowrap}"
                + "#vcLines li.bad span{color:#ff8787}button{font:inherit;cursor:pointer}</style></head><body><main>"
                + "<h1>🎙 목소리 만들기</h1>"
                + "<p class=\"lead\">대본의 해설(한 줄 = 한 장면)을 붙여 넣고 목소리를 고르면 줄마다 만들어 이어 붙입니다. 결과는 &lt;산&gt;.wav · &lt;산&gt;.srt(make_v2 --voice --srt 에 그대로).</p>"
                + "<div class=\"vc-bar\"><label>산 이름 <input id=\"vcName\" size=\"10\" placeholder=\"두타산\"></label>"
                + "<label>목소리 <select id=\"vcVoice\"><option value=\"\">불러오는 중…</option></select></label>"
                + "<label>빠르기 <input id=\"vcRate\" type=\"number\" min=\"" + MIN_RATE + "\" max=\"" + MAX_RATE + "\" step=\"5\" value=\"0\" style=\"width:4.5em\">%</label>"
                + "<label>줄 사이 <input id=\"vcGap\" type=\"number\" min=\"0\" max=\"2000\" step=\"50\" value=\"300\" style=\"width:5em\">ms</label></div>"
                + "<textarea id=\"vcText\" placeholder=\"해설 블록을 붙여 넣으세요 - 한 줄이 한 장면\"></textarea>"
                + "<div class=\"vc-bar\"><button id=\"vcMake\">▶ 바뀐 줄만 만들기</button><button id=\"vcPlay\">🔊 전체 듣기</button>"
                + "<button id=\"vcWav\">⬇ wav</button><button id=\"vcSrt\">⬇ srt</button><span id=\"vcInfo\" class=\"dim\"></span></div>"
                + "<ol id=\"vcLines\"></ol>"
                + "<p class=\"dim\">글은 Microsoft Azure 음성 서비스로 보내 목소리를 만듭니다(운영자만). 같은 줄 · 같은 목소리 · 같은 빠르기는 다시 보내지 않습니다(이 창을 닫으면 처음부터).</p>"
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
