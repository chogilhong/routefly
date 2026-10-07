# routefly - Claude 작업 규칙

등산 · 걷기 · 자전거 코스를 3D 지형(MapLibre) 위로 날아가며 보여 주는 웹 앱과, 폰용 등산 화면(hike.html - GPS · SOS · 오프라인 PWA · GPX 기록)입니다.
Java 17(JDK 21 로 빌드) · Jakarta Servlet 6.1 war · JDBC(MariaDB `routefly`, 연결 풀은 `Db.open()` 의 MyBatis PooledDataSource) · Gson, 톰캣 11 에서 돕니다. 로그인은 없습니다.
DB 는 routefly-batch 가 채우고, 웹은 읽기만 합니다(route_course · route_course_point · route_course_poi).

## 1. 답변

- 한국어 존댓말로 답합니다. 사용자는 "홍TV님" 이라고 부릅니다.
- 마크다운 굵은 글씨(`**`)를 쓰지 않습니다. 표 · 코드 블록은 써도 됩니다.
- 낱말은 쉬운 말로: 테스트 · 테스트 데이터 · 스크립트.

## 2. 꼭 지킬 것

- 테스트 클래스 이름은 바꾸지 않습니다. 고쳐야 하면 본문만. 새 테스트 클래스는 괜찮습니다.
- 모르는 값을 지어내지 않습니다. 코드 · 실제 응답 · SQL 로 확인합니다.
- 호출하는 곳이 없는 메서드는 남기지 않습니다. 고친 뒤 되돌려 확인합니다(고친 조각을 되돌리면 그 테스트가 실제로 깨지는지).
- 지도 출처 표시를 숨기거나 지우지 않습니다. OpenStreetMap 은 ODbL 이라 "© OpenStreetMap contributors" 가 늘 보여야 합니다(README). MapLibre 는 BSD-3.
- 안전 문구(hike.js 의 `SAFETY_KEY`)를 바꾸면 키의 버전도 올립니다(README).
- 화면 캐시: html · js · css 는 `NoStaleFilter` 가 no-cache 로 보냅니다. 서비스워커(`src/main/webapp/sw.js`)가 캐시하는 모양이 바뀌면 그 캐시 이름(rf-shell-v2 등)의 번호를 올립니다.

## 3. 테스트

- 이 PC: `.claude\run-tests.ps1 [-Only web.WebBasicsTest]` (Maven 없이 javac + JUnit 4, DB 없이 돕니다). 웹(클라우드): `mvn test` (routefly 는 웹소켓을 안 써서 totonian · investing 과 달리 그대로 됩니다).
- 전체 테스트가 모두 통과하는 것이 정상입니다(2026-10-07 기준 15건). 하나라도 실패하면 새로 깨진 것이니 고칩니다.
- 테스트 데이터는 만들거나 받으면 바로 커밋합니다.

## 4. 비밀값

- 실제 설정(`C:\GH\config\routefly\config.properties` 또는 `-Droutefly.config=`)은 저장소에 없고, 읽거나 만들지 않습니다. 예시는 `src/main/resources/config.properties.example`.
- 키: `db.url` · `db.user` · `db.password` · `map.vworld.key`(브라우저로 나가는 키) · `map.dem.url`. 키 값을 코드나 대화에 적지 않습니다.

## 5. 웹(클라우드)에서 작업할 때

- DB · 톰캣은 웹에서 닿지 않습니다. 코드 수정과 테스트까지 하고 커밋 · push 합니다.
- 배포(홍TV님 PC 에서 pull → 이클립스 F5, http://localhost:8080/routefly/)와 화면 · 로그 확인은 홍TV님 PC 의 Claude 가 합니다.
  마지막에 "홍TV님 PC 의 Claude 가 할 것" 으로 무엇을 확인하면 되는지 적어 둡니다.
- DB 표를 바꾸면 routefly-batch 의 `sql/route_ddl.sql` 에 남기고 "홍TV님이 실행할 것" 으로 적습니다.

## 6. 관련 저장소

- routefly-batch: 코스를 만들어 DB 에 담는 배치(fxms 프레임워크 - 클라우드에서는 빌드 안 됨). 표 · 칸 이름을 바꾸면 양쪽을 함께 고칩니다.
