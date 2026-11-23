"""
지하철 노선 색 선(data/subway-lines.json) 만들기 - 2026-11-23 홍TV님 "지하쳘 노선끼리 선을 연결해줘. 서울지하철 노선표에 색이 있을텐데".

받은 자료: src/test/resources/subway/routes.json (OSM Overpass, relation route=subway|light_rail out geom, ODbL - PC 가 받음).
노선(relation)은 계통 · 방향마다 따로 있어 같은 선이 여러 번 들어 있습니다 → 같은 노선 번호(ref) + 색(colour)끼리 묶고 같은 길(way)은 한 번만.
색 · 이름은 OSM 태그 그대로(colour · name:ko), 지어내지 않음. 점은 약 5m 안쪽 굽음을 덜어 냄.

쓰는 법: python tools/basemap/subway-lines.py src/test/resources/subway/routes.json src/main/webapp/data/subway-lines.json
"""
import sys, json, math


def simplify(pts, tol):
    """Douglas-Peucker - tol 은 도(degree) 단위 근사(위도 37도 기준)."""
    if len(pts) < 3:
        return pts
    kx = math.cos(math.radians(37.5))
    def dist(p, a, b):
        ax, ay, bx, by, px, py = a[0] * kx, a[1], b[0] * kx, b[1], p[0] * kx, p[1]
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)
    keep, stack = {0, len(pts) - 1}, [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, k = 0, -1
        for m in range(i + 1, j):
            d = dist(pts[m], pts[i], pts[j])
            if d > best:
                best, k = d, m
        if best > tol:
            keep.add(k)
            stack += [(i, k), (k, j)]
    return [pts[m] for m in sorted(keep)]


def main(src, out):
    d = json.load(open(src, encoding="utf-8"))
    lines = {}
    for r in d["elements"]:
        t = r.get("tags", {})
        colour = t.get("colour")
        if r.get("type") != "relation" or not colour:
            continue
        name = (t.get("name:ko") or t.get("name") or "").split(":")[0].strip()
        key = (t.get("ref") or name, colour.upper())
        g = lines.setdefault(key, {"ref": t.get("ref") or "", "names": set(), "colour": colour.upper(), "ways": {}, "route": t.get("route")})
        g["names"].add(name)
        for m in r.get("members", []):
            if m.get("type") == "way" and m.get("geometry") and m.get("role", "") in ("", "route", "forward", "backward"):
                g["ways"][m["ref"]] = [(round(p["lon"], 6), round(p["lat"], 6)) for p in m["geometry"] if p]
    feats = []
    for (ref, colour), g in sorted(lines.items(), key=lambda kv: (kv[1]["route"], kv[0][0])):
        name = min(g["names"], key=len)   # 계통 · 지선 이름 가운데 가장 짧은 것(예: 수도권 전철 1호선)
        segs = []
        for wid in sorted(g["ways"]):
            pts = simplify(g["ways"][wid], 0.00005)   # 약 5m
            if len(pts) >= 2:
                segs.append([[round(x, 5), round(y, 5)] for x, y in pts])
        if segs:
            feats.append({"type": "Feature", "properties": {"ref": ref, "name": name, "colour": colour, "route": g["route"]},
                          "geometry": {"type": "MultiLineString", "coordinates": segs}})
    gj = {"type": "FeatureCollection", "_source": "OpenStreetMap(ODbL) relation route=subway|light_rail - src/test/resources/subway/routes.json, tools/basemap/subway-lines.py",
          "features": feats}
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(gj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(len(feats), "노선", sum(len(c) for f in feats for c in f["geometry"]["coordinates"]), "점", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
