수산자원관리법 시행령 별표 1 · 별표 2 원문 (국가법령정보센터 www.law.go.kr)
받은 날: 2026-11-15 (클라우드 세션, curl)

법령: 수산자원관리법 시행령
페이지 머리글(lsInfoR.do): [시행 2026. 7. 1.] [대통령령 제36423호, 2026. 6. 23., 타법개정]
lsiSeq = 287151, efYd = 20260701

별표 제목(조문 목록에 적힌 그대로):
  [별표 1] 수산자원의 포획ㆍ채취 금지 기간ㆍ구역 및 수심(제6조제1항 관련)
  [별표 2] 수산자원의 포획ㆍ채취금지 체장 또는 체중(제6조제2항 관련), 수산동물의 종류별 체장 계측도
별표 파일 첫머리(HWP/PDF 안의 글):
  ■ 수산자원관리법 시행령 [별표 1] <개정 2026. 6. 23.>
    수산자원의 포획·채취 금지 기간·구역 및 수심(제6조제1항 관련)
  ■ 수산자원관리법 시행령 [별표 2] <개정 2024. 6. 4.>
    수산자원의 포획·채취금지 체장 또는 체중(제6조제2항 관련)

출처 URL:
  법령 페이지(JS 껍데기): https://www.law.go.kr/법령/수산자원관리법시행령
  본문:  https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq=287151&efYd=20260701&chrClsCd=010202&ancYnChk=0
         -> sigheng-lsInfoR.html
  별표 1 HWP: https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=165059789&bylClsCd=110201
         -> sigheng-byl1-closed-season.hwp  (sha256 1d2b6f24e21c007aabba2079068e4848e85c11802ddffa90371c100fabc7ff66)
  별표 1 PDF: https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=165059791&bylClsCd=110201
         -> sigheng-byl1-closed-season.pdf  (sha256 78dc7b07ecdf1d72b5c31c83611a5c2b2fc8a79a49ca1b66c5dfd957e2853360)
  별표 2 HWP: https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=165059805&bylClsCd=110201
         -> sigheng-byl2-min-size.hwp  (sha256 1d004387d2c8b690820e953adf4abc3eb690e1cccab96950afed5395a860064a)
  별표 2 PDF: https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=165059807&bylClsCd=110201
         -> sigheng-byl2-min-size.pdf  (sha256 aaf38503f48f86f328a53d94072283c25431f1dc5449edf456d00d84c3422b4b)
  (별표 HTML 보기 lsBylContentsInfoR.do?bylSeq=18198489 / 18198491 은 뷰어 껍데기뿐이라 글이 없음)

뽑은 방법:
  *.pdftotext.txt  : pdftotext -layout 결과(눈으로 대조용, 칸이 섞임)
  *.hwp-cells.json : HWP5 BodyText 의 표 칸(행 · 열 · 병합)별 문단 글(olefile + zlib 로 직접 읽음)
  closed-season.tsv, min-size.tsv : 위 hwp-cells.json 의 첫 표에서 한 종 한 줄.
    - 2번째 칸(period / limit)은 원문 칸 글 그대로. 칸 안 문단 나눔과 연속 공백만 공백 하나로 합침.
    - 원문은 "기간·구역 및 수심" 이 한 칸이라 area_or_note 는 비워 둠(구역 조건은 period 글 안에 있음).
    - 뒤 3칸 category · item · scientific_name 은 원문의 구분(예: "2. 어류"), 항목 기호(예: "나."), 학명.
      category 칸이 비어 있는 행(병합 깨짐)은 앞 구분을 이어 씀(번호 순서로 확인).
    - "삭제" 항목은 뺌.
    - min-size.tsv 의 마대오분자기 · 오분자기는 원문 한 칸(다.)을 두 줄로 나눴고 note 에 그 사실을 적음.
  closed-season-footnotes.txt : 별표 1 아래 주1)~주7) 원문.
  min-size-bigo.txt : 별표 2 비고 원문.
  부도(지도 · 계측도 그림)는 그림이라 뽑지 않음.

원문 그대로 둔 눈에 띄는 표기: 별표 2 갯장어 "40센터미터 이하", 소라 "각고 5센티미터. 이하".
