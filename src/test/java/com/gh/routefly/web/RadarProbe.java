package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDateTime;

/**
 * 기상청 API허브 레이더(2026-11-14 홍TV님 "레이더 비구름 추가해줘") 실제 응답을 받아 보는 확인용 프로그램(테스트가 아님 - 네트워크 · 키를 씀).
 * 지도 그림(LCC 투영 이미지)이 아니라 "AWS 지점마다 레이더 강우강도"(전국 약 600곳, 10분)를 써서, 따라가기 · 산 페이지에
 * "지금 내 둘레 몇 km 안에 비 오는 곳" 을 보이려는 것입니다. 응답 모양을 보기 전에는 화면에 넣지 않습니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.RadarProbe                 → 지금(20분 전, 10분 단위) 전국 AWS 지점 레이더 값 + AWS 지점 정보
 * .claude\run-tests.ps1 -Run web.RadarProbe 202611151230    → 그 시각(KST) - 비가 온 때를 하나 더 받아 두면 테스트 데이터로 좋음
 *   src/test/resources/radar/rdr-aws-all-&lt;시각&gt;.txt   nph-rdr_cmp_aws_all_pt_data(cmp=HSP 강우강도 mm/h, qcd=EXT, help=1)
 *   src/test/resources/radar/stn-aws.txt               stn_inf.php?inf=AWS(지점번호 · 경도 · 위도 · 이름)
 * </pre>
 *
 * 명세(2026-11-14 웹 Claude 가 apihub.kma.go.kr apiList.do?seqApi=5&amp;seqApiSub=269 공개 페이지에서 옮김):
 *   GET https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-rdr_cmp_aws_all_pt_data?tm=YYYYMMDDHHMI&amp;qcd=EXT&amp;cmp=HSP&amp;help=1&amp;authKey=…
 *   → tm · stn · cmp · QCD · ECHO(HSP 는 강우강도 mm/h, -250 강수없음, -300 관측반경 밖) · HT(에코 고도 m) · STN_KO
 * 활용신청: API허브 레이더 › 레이더 AWS지점별 합성자료값(따로), 지점정보는 이미 신청한 지상관측 지점정보(stn_inf) 그대로.
 * 키: kma.apihub.key(KmaSeasonProbe 와 같음). 저장 글에서 키를 지움(KmaSeasonProbe.save).
 */
public final class RadarProbe {

    private RadarProbe() {
    }

    static final String BASE = Radar.BASE;

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("kma.apihub.key");
        if (key == null || key.isBlank()) {
            System.out.println("kma.apihub.key 가 비어 있습니다.");
            return;
        }
        String tm = args.length > 0 ? args[0] : Radar.slot(LocalDateTime.now(WeatherServlet.KST));
        String k = "&authKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
        Path dir = Path.of("src", "test", "resources", "radar");
        KmaSeasonProbe.save(dir.resolve("rdr-aws-all-" + tm + ".txt"), BASE + "cgi-bin/url/nph-rdr_cmp_aws_all_pt_data?tm=" + tm + "&qcd=EXT&cmp=HSP&help=1" + k, key);
        KmaSeasonProbe.save(dir.resolve("stn-aws.txt"), BASE + "url/stn_inf.php?inf=AWS&help=1" + k, key);
    }

}
