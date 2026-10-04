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
    print(out)
t = d.get("turn") or {}
print(f"  relay (TURN) this month: {t.get('gb')} / {t.get('capGb')} GB" + ("" if t.get("minting") else " | relay OFF"))
