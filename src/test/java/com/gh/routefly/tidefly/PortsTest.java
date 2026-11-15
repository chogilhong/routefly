package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

/**
 * 국가어항 포인트(2026-11-15 홍TV님 "바로 시작해") - 어항정보(3083027) 실제 파일 · 기상청 예보업무규정 별표 4 · 5(docs/tidefly/kma-coastal-zones.md) 대로인지.
 */
public class PortsTest {

    private static String csv() throws Exception {
        return new String(Files.readAllBytes(PortsBuild.CSV), Charset.forName("MS949"));
    }

    private static String local() throws Exception {
        return new String(Files.readAllBytes(PortsBuild.LOCAL_CSV), Charset.forName("MS949"));
    }

    private static String base() throws Exception {
        return PointsBuild.build(PointsBuild.fishingPages(), Files.readString(PointsBuild.RES.resolve("apihub/marine-large-all.txt"), StandardCharsets.UTF_8),
                Files.readString(PointsBuild.TIDE_STATIONS, StandardCharsets.UTF_8));
    }

    @Test
    public void 짝_json_은_규정으로_다시_만든_것과_같음() throws Exception {
        String now = Files.readString(PortsBuild.WRN, StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertEquals("어항 짝은 PortsBuild.zones 그대로, 바다낚시지수 49곳은 손본 그대로", PortsBuild.withPortZones(now, base(), csv(), local()), now);
    }

    @Test
    public void 겹친_곳_원본_잘못은_빼고_이름은_겹치지_않게() throws Exception {
        List<String> names = new ArrayList<>();
        for (String[] p : PortsBuild.ports(base(), csv())) names.add(p[0]);
        assertEquals(103, names.size());
        for (String same : new String[] {"아야진항", "남애항", "계마항", "김녕항", "모항항", "대포항", "능포항", "저동항", "어청도항"}) assertFalse(same, names.contains(same));
        assertFalse("원본에 사동항과 주소 · 위경도가 같게 잘못 들어 있음", names.contains("소안항"));
        assertTrue(names.contains("사동항(전남)") || names.contains("사동항"));
        assertTrue("삼척 대진항 포인트와 이름이 겹쳐 시도를 붙임", names.contains("대진항(경북)") && !names.contains("대진항"));
    }

    @Test
    public void 지방어항은_위치_없는_곳_가까운_곳을_빼고_이름은_겹치지_않게() throws Exception {
        List<String[]> national = PortsBuild.ports(base(), csv());
        List<String> names = new ArrayList<>();
        for (String[] p : PortsBuild.localPorts(base(), national, local())) {
            names.add(p[0]);
            assertEquals("지방", p[4]);
        }
        assertEquals("242곳 - 위치 빈 창후항 1 - 1.5km 안 9", 232, names.size());
        assertFalse("공간정보가 빈 줄", names.contains("창후항"));
        for (String same : new String[] {"초곡항", "관포항", "은점항", "만리포항", "어사항", "무녀도항", "식도항", "어불항", "원평항"}) assertFalse(same, names.contains(same));
        assertTrue("파일 안에서 겹친 이름은 시도", names.containsAll(List.of("신암항(부산)", "신암항(울산)", "동백항(부산)", "동백항(전남)", "송포항(경남)", "송포항(전북)")));
        assertTrue("바다낚시지수 방포항과 같은 동네", names.contains("방포항(어항)"));
        assertTrue("국가어항 금진항(강원)과 겹침", names.contains("금진항(전남)"));
        assertEquals(List.of("S1311100"), PortsBuild.zones("부산광역시 해운대구 송정동", "송정항", 35.18, 129.20));
        assertEquals("동만 있는 서귀포 주소", List.of("S1323300"), PortsBuild.zones("제주특별자치도 서귀포시 법환동", "법환항", 33.24, 126.51));
    }

    @Test
    public void 앞바다는_규정_별표_4_의_시군_읍면() {
        assertEquals(List.of("S1151200"), PortsBuild.zones("강원도 강릉시 창해로 14번길 51-26", "강릉항", 37.77, 128.95));
        assertEquals(List.of("S1151100"), PortsBuild.zones("강원도 양양군 손양면 수산1길 26-41", "수산항", 38.08, 128.67));
        assertEquals(List.of("S1131200"), PortsBuild.zones("경상북도 경주시 감포읍 감포로2길 103", "감포항", 35.81, 129.51));
        assertEquals("제주시 구좌읍 → 동부", List.of("S1323200"), PortsBuild.zones("제주특별자치도 제주시 구좌읍 김녕항3길", "김녕항", 33.56, 126.74));
        assertEquals("추자면도 제주시 → 북부", List.of("S1323100"), PortsBuild.zones("제주특별자치도 제주시 추자면 추자로 576-4", "신양항", 33.94, 126.33));
        assertEquals("대정읍 송악산 서쪽 → 서부", List.of("S1323400"), PortsBuild.zones("제주특별자치도 서귀포시 대정읍 하모항구로 30", "모슬포항", 33.22, 126.25));
        assertEquals(List.of("S1323300"), PortsBuild.zones("제주특별자치도 서귀포시 남원읍 위미중앙로196번길 6-13", "위미항", 33.27, 126.66));
        assertEquals("해남 송지면은 규정이 두 앞바다로 나눔", List.of("S1231500", "S1321100"), PortsBuild.zones("전라남도 해남군 송지면 어란로 469", "어란진항", 34.35, 126.48));
        assertEquals("거제 장목면 → 경남중부", List.of("S1311300"), PortsBuild.zones("경상남도 거제시 장목면 외포5길 62", "외포항", 34.94, 128.72));
        assertEquals("충남 줄임 주소", List.of("S1251400"), PortsBuild.zones("충남 보령시 웅천읍 열린바다2길 46", "무창포항", 36.25, 126.54));
        assertEquals("강화군 → 북부", List.of("S1251100"), PortsBuild.zones("인천광역시 강화군 삼산면 어류정길177번길 117", "어유정항", 37.64, 126.34));
    }

    @Test
    public void 앞바다가_없거나_경계_바깥이면_먼바다() {
        assertEquals("신안 흑산면은 앞바다에서 빠짐 · 상태도 북단 위도선 남쪽", List.of("S1232210", "S1232220"), PortsBuild.zones("전라남도 신안군 흑산면 가거도길 1", "가거도항", 34.05, 125.13));
        assertEquals("울릉군 - 기존 울릉도 포인트와 같게", List.of("S1152010", "S1152020"), PortsBuild.zones("경상북도 울릉군 서면 울릉순환로 1310", "남양항", 37.47, 130.83));
        assertEquals("외연도 - 대길산도 · 말도 경계선 바깥, 북위 36도 북쪽", List.of("S1251400", "S1252010", "S1252020"), PortsBuild.zones("충청남도 보령시 오천면 외연도리 472-2", "외연도항", 36.23, 126.08));
        assertEquals("매물도 - 거제시동부 · 경남서부 경계가 지나고 앞바다 경계에 가까움", List.of("S1311200", "S1311400", "S1312010", "S1312020"),
                PortsBuild.zones("경상남도 통영시 한산면 당금길 33", "매물도항", 34.65, 128.57));
        assertTrue(PortsBuild.seaward(36.23, 126.08));
        assertFalse("소래포구는 안쪽", PortsBuild.seaward(37.40, 126.74));
        assertFalse(PortsBuild.seaward(35.13, 129.23));
        assertTrue("소래포구는 경계에서 멂", PortsBuild.lineKm(37.40, 126.74) > 50);
    }

    @Test
    public void 별표_5_경계_지점은_도분초_그대로() {
        assertEquals(37 + 57 / 60.0 + 41 / 3600.0, PortsBuild.LINE[0][0], 1e-9);   // 백령도 동단 37° 57′ 41″
        assertEquals(129 + 25 / 60.0, PortsBuild.LINE[PortsBuild.LINE.length - 1][1], 1e-9);   // 고리 남동쪽 12해리 129° 25′
        assertEquals(26, PortsBuild.LINE.length);
    }
}
