package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.Test;

/** 확인용 프로그램(PortalProbe · ApiHubProbe · Probes)의 순수 함수 - 네트워크 · 키 없이. */
public class ProbeTest {

    @Test
    public void 저장하는_글에서_키를_지움_그대로와_인코딩한_것_모두() {
        String key = "ab+c/d==";
        String body = "url=...serviceKey=ab%2Bc%2Fd%3D%3D&x=1 raw=ab+c/d==";
        String out = Probes.hideKey(body, key);
        assertFalse(out.contains("ab+c/d=="));
        assertFalse(out.contains("ab%2Bc%2Fd%3D%3D"));
        assertEquals("url=...serviceKey={KEY}&x=1 raw={KEY}", out);
        assertEquals(body, Probes.hideKey(body, null));
    }

    @Test
    public void 응답_글자는_머리글_charset_그다음_UTF8_아니면_EUCKR() {
        String ko = "통영 갯바위";
        assertEquals(ko, KmaText.text(ko.getBytes(StandardCharsets.UTF_8), "application/json"));
        assertEquals(ko, KmaText.text(ko.getBytes(Charset.forName("EUC-KR")), ""));
        assertEquals(ko, KmaText.text(ko.getBytes(Charset.forName("EUC-KR")), "text/plain; charset=euc-kr"));
    }

    @Test
    public void 포털_all_은_일곱_API_를_명세의_예시값으로() {
        List<PortalProbe.Ask> all = PortalProbe.asks(new String[] {"all"}, "20261114");
        assertEquals(7, all.size());
        assertEquals("hghlw-DT_0018-20261114.json", all.get(0).file());
        assertEquals(PortalProbe.BASE + "tideFcstHghLw/GetTideFcstHghLwApiService?type=json&pageNo=1&numOfRows=20&obsCode=DT_0018&reqDate=20261114", all.get(0).url());
        assertTrue(all.get(1).url().startsWith(PortalProbe.BASE + "tideFcstTime/GetTideFcstTimeApiService?"));
        assertTrue(all.get(2).url().contains("tidebed/GetTidebedApiService?") && all.get(2).url().contains("&lat=33.96194&lot=126.44527&"));
        assertTrue(all.get(3).url().contains("dtRecent/GetDTRecentApiService?") && all.get(3).url().endsWith("obsCode=DT_0018"));
        assertTrue(all.get(4).url().contains("twRecent/GetTWRecentApiService?") && all.get(4).url().endsWith("obsCode=TW_0089"));
        assertTrue(all.get(5).url().contains("noonWave/GetNoonWaveApiService?") && all.get(5).url().endsWith("obsCode=TW_0089"));
        assertTrue(all.get(6).url().contains("fcstFishingv2/GetFcstFishingApiServicev2?"));
        for (PortalProbe.Ask a : all) assertFalse(a.url().contains("serviceKey"));   // 키는 main 에서만 붙임
    }

    @Test
    public void 포털_바다낚시지수는_구분과_장소를_인코딩() {
        PortalProbe.Ask a = PortalProbe.asks(new String[] {"fishing", "선상", "김녕"}, "20261114").get(0);
        assertEquals("fishing-선상-김녕.json", a.file());
        assertTrue(a.url().endsWith("&gubun=%EC%84%A0%EC%83%81&placeName=%EA%B9%80%EB%85%95"));
        assertTrue(PortalProbe.asks(new String[] {"모름"}, "20261114").isEmpty());
        // TideBED 10분 간격(포인트 자리 만조 · 간조 찾기 확인용)
        PortalProbe.Ask tb = PortalProbe.asks(new String[] {"tidebed", "35.97555", "126.56305", "20261114", "10"}, "20261115").get(0);
        assertEquals("tidebed-35.97555_126.56305-20261114-10m.json", tb.file());
        assertTrue(tb.url().contains("&min=10&lat=35.97555&lot=126.56305&reqDate=20261114"));
        assertTrue(PortalProbe.asks(new String[] {"tidebed"}, "20261114").get(0).url().contains("&min=60&"));

        // 쪽 넘겨 받기(갯바위 1990줄 = 300줄씩 7쪽)
        List<PortalProbe.Ask> pages = PortalProbe.asks(new String[] {"fishing-pages", "선상", "7"}, "20261114");
        assertEquals(7, pages.size());
        assertEquals("fishing-선상-p7.json", pages.get(6).file());
        assertTrue(pages.get(6).url().contains("&pageNo=7&numOfRows=300&gubun=%EC%84%A0%EC%83%81"));
        assertEquals(1, PortalProbe.asks(new String[] {"fishing-pages"}, "20261114").size());
        assertEquals(1, PortalProbe.asks(new String[] {"fishing-pages", "갯바위", "x"}, "20261114").size());
        assertTrue(PortalProbe.asks(new String[0], "20261114").isEmpty());
    }

    @Test
    public void API허브는_예시_주소의_authKey_를_빼고_내_키를_붙임() {
        assertEquals("https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php?tmfc=0&help=1&authKey=k%2B1",
                ApiHubProbe.withKey("https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php?tmfc=0&authKey=SAMPLE&help=1", "k+1"));
        assertEquals("https://apihub.kma.go.kr/api/typ01/url/stn_inf.php?authKey=k",
                ApiHubProbe.withKey("https://apihub.kma.go.kr/api/typ01/url/stn_inf.php", "k"));
    }

    @Test
    public void API허브가_아닌_주소로는_키를_보내지_않음() {
        assertNull(ApiHubProbe.withKey("https://evil.example/api?x=1", "k"));
        assertNull(ApiHubProbe.withKey("http://apihub.kma.go.kr/api/typ01/url/stn_inf.php", "k"));
        assertNull(ApiHubProbe.withKey("https://apihub.kma.go.kr.evil.example/x", "k"));
        assertNull(ApiHubProbe.withKey("not a url", "k"));
    }
}
