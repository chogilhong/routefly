# 옛 워드프레스 글 → 블로그스팟 (2026-10-20 홍TV님)

워드프레스 내보내기(WXR, 도구 → 내보내기) 파일을 블로그스팟 "가져오기" 파일로 바꿉니다. 마감 11-02(옛 호스팅 결제 11-03).
글 · 백업 파일은 이 저장소에 넣지 않습니다(개인정보 · 저작물). 여기에는 스크립트와 가짜 시험 파일만 있습니다.

| 파일 | 내용 |
|---|---|
| `WxrToBlogger.java` | 변환 스크립트(JDK 만 있으면 됨) |
| `blogger-sample-skeleton.xml` | 블로그스팟 백업(Takeout feed.atom)의 뼈대 - 값은 x · 0 |
| `test/sample-wxr.xml` | 가짜 WXR(글 2 · 임시 1 · 첨부 1) - 고칠 때 이것으로 돌려 봄 |

## 쓰는 법 (PC, PowerShell)

```powershell
cd C:\GH\workspace\routefly
& C:\GH\java\jdk-21\bin\java.exe tools\blog-move\WxrToBlogger.java <WXR.xml> <저장소 밖>\blogger-1.xml --site https://hongtv.co.kr --limit 3 --map <저장소 밖>\map-1.tsv
```

- `--skip N --limit N`: 오래된 글부터 N 개 건너뛰고 N 개만 - 시험 2~3개 → 30개 → 나머지처럼 나눠 넣기
- `--author 이름` · `--blog-id 숫자`: 글쓴이 이름, 블로그 ID(모르면 0 - 가져오기가 받는지 시험에서 봄)
- `--map`: 옛 경로 → 새 경로(예상) · 제목. 가져온 뒤 실제 주소와 맞춰 nginx 301 짝을 만듦

## 바꾸는 것

- 발행(publish)된 글만. 임시 · 비공개 · 페이지 · 첨부 · 댓글은 빼냄
- 라벨: 카테고리 먼저 + 태그, 같은 이름 한 번, 글당 20개 · 글자 합 200자까지(넘치면 뒤 태그부터 뺌), 미분류 뺌, 쉼표 → 빈칸
- 본문: 블록 편집기 주석 `<!-- wp:… -->` 지움, `<p>` 없는 옛 글은 빈 줄 → 문단 · 줄바꿈 → `<br>`
- 옛 사이트 주소(http · www 섞인 것)를 `--site` 모양으로 맞춤 - 그림은 옛 도메인을 routefly 서버로 돌린 뒤 거기서 내줌(docs/deploy-lightsail.md 12장)
- 날짜: GMT 그대로(.000Z), GMT 가 비면 한국 시각 - 9시간
- 새 주소 이름(blogger:filename): `/YYYY/MM/<글이름>.html`, 글이름이 영문 · 숫자가 아니면 `p<글번호>` - 블로그스팟이 이 이름을 따르는지는 시험에서 확인

## 확인할 것 (시험 블로그에 2~3개)

1. 가져오기가 이 파일을 받는지(Takeout 형식 그대로)
2. 날짜 · 라벨 · 글쓴이 · 본문 모양 · 그림(지금은 옛 호스팅에서 뜸)
3. 새 주소가 `blogger:filename` 대로인지 → 아니면 제목으로 짝 맞춤
4. 바로 공개되는지, 임시 글로 들어오는지
