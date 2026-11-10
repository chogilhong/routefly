#!/usr/bin/env python3
"""
국립공원 산불예방 통제 자료(src/main/webapp/data/knps-close.json) 만들기 - 2026-11-10 홍TV님 "작업해".
  python3 -I tools/knps-close/build.py <탐방로_통제이력.csv> <acsCtrList.html> > src/main/webapp/data/knps-close.json
- CSV: data.go.kr 15165806 "국립공원공단_탐방로_통제이력"(src/test/resources/knps-close/) - 공원 · 계절마다 가장 최근 해의 "반복통제" 구간(출발 ~ 도착)과 달.
- HTML: 공단 누리집 통제정보 목록(routefly-batch src/test/resources/knps-ctrl/acsCtrList.html) - 공원(사무소) ↔ 세부 화면 번호(rstId)만.
  통제 상태(정상 · 부분통제)는 날마다 바뀌어 넣지 않음. 공단 robots.txt 가 긁기를 막아 배치로 받지 않고 링크만 검(2026-11-11 PC).
"""
import sys, csv, re, html, json, collections

def parks_of(csv_path):
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    by = collections.defaultdict(list)
    for r in rows:
        park = r["공원명"].replace("국립공원", "").strip()
        by[(park, r["계절구분"].strip())].append(r)
    out = collections.defaultdict(dict)
    for (park, season), rs in by.items():
        year = max(int(r["공고연도"]) for r in rs)
        last = [r for r in rs if int(r["공고연도"]) == year and r["반복통제여부"].strip() == "반복통제" and r["통제목적표준분류"].strip().startswith("산불예방")]   # "산불예방" · "산불예방및자연자원보호"
        if not last:
            continue
        segs, seen = [], set()
        for r in last:
            s = (r["출발지점명"].strip(), r["도착지점명"].strip())
            if s not in seen:
                seen.add(s)
                segs.append(list(s))
        out[park][season] = {"year": year, "from": int(last[0]["통제시작월"]), "to": int(last[0]["통제종료월"]), "segs": segs}
    return out

def offices_of(html_path):
    s = open(html_path, encoding="utf-8", errors="replace").read()
    out = collections.defaultdict(list)
    for m in re.finditer(r'rstId=(\d{4})', s):
        cells = [c.strip() for c in re.split(r'\s*\|\s*', html.unescape(re.sub(r'<[^>]+>', '|', s[m.end():m.end() + 400]))) if c.strip()]
        cells = [c for c in cells if not c.startswith('"') and c != '>']
        park = cells[0]
        office = cells[1] if len(cells) > 1 and cells[1] not in ("정상", "부분통제", "전면통제") else park
        if [office, m.group(1)] not in out[park]:
            out[park].append([office, m.group(1)])
    return out

def main():
    parks, offices = parks_of(sys.argv[1]), offices_of(sys.argv[2])
    data = {"_note": "국립공원 산불예방 통제 - 해마다 통제되어 온 구간(data.go.kr 15165806 통제이력, 공원 · 계절마다 가장 최근 해의 반복통제) "
                     "+ 공단 통제정보 세부 화면 번호. 지금 상태는 넣지 않음(링크로). tools/knps-close/build.py 가 만듦 - 손으로 고치지 않음",
            "detail": "https://www.knps.or.kr/front/portal/safe/acsCtrDtl.do?menuNo=8000340&rstId=",
            "list": "https://www.knps.or.kr/front/portal/safe/acsCtrList.do?menuNo=8000340",
            "parks": {}}
    for p in sorted(set(parks) | set(offices)):
        e = {"offices": offices.get(p, [])}
        e.update(parks.get(p, {}))
        data["parks"][p] = e
    json.dump(data, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")

main()
