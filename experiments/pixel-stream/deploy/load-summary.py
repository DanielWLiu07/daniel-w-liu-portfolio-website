# Reads the pool's /status JSON on stdin and prints a short load summary (aws-ctl.sh load).
import json, sys

d = json.load(sys.stdin)
p = d["pool"]
line = f"  {p['busy']}/{p['seats']} seats in use | {p['warm']} warm | {p['waiting']} waiting"
if p.get("draining"):
    line += f" | DRAINING: {p['draining']}"
print(line)
for s in d["seats"]:
    tl = [r for r in (s.get("timeline") or []) if r.get("t") is not None][-10:]
    out = f"  seat {s['seat']}: {s['phase']}, {'in use' if s.get('owner') else 'free'}"
    if s.get("owner") and tl:
        fps = [x["render"] for x in tl]
        mbps = sum((x.get("kbps") or 0) for x in tl) / len(tl) / 1000
        rtt = [x["rtt"] for x in tl if x.get("rtt") is not None]
        out += f" | last {len(tl)}s: {min(fps)}-{max(fps)} fps, {mbps:.1f} Mbps"
        if rtt:
            out += f", rtt {round(sum(rtt) / len(rtt))} ms"
    vt = [r for r in (s.get("viewer") or []) if r.get("t") is not None][-10:]
    if s.get("owner") and vt:
        shown = [r["shown"] for r in vt if r.get("shown") is not None]
        frz = sum(r.get("freezes") or 0 for r in vt)
        gap = max((r.get("maxGapMs") or 0) for r in vt)
        out += f" | viewer shows {min(shown)}-{max(shown)} fps, worst gap {gap} ms, {frz} freezes ({vt[-1].get('player')})" if shown else ""
    print(out)
t = d.get("turn") or {}
print(f"  relay (TURN) this month: {t.get('gb')} / {t.get('capGb')} GB" + ("" if t.get("minting") else " | relay OFF"))
