# Deploying the render fleet

Read `../ARCHITECTURE.md` first. The scripts run on your machine with the AWS CLI
under the `portfolio-stream` profile. Servers are numbered: `./aws-launch.sh 2`
makes a second one.

## One-time account setup

1. **Admin IAM user** (yours) with `AmazonEC2FullAccess` + `ServiceQuotasFullAccess`.
   Then run `aws configure --profile portfolio-stream` (region `ca-central-1`).
2. **Spot GPU quota** in ca-central-1: *All G and VT Spot Instance Requests*
   (`L-3819A6DF`), 8 vCPUs per g4dn.2xlarge you want running at once. It defaults
   to 0.
   ```sh
   aws --profile portfolio-stream --region ca-central-1 service-quotas request-service-quota-increase \
     --service-code ec2 --quota-code L-3819A6DF --desired-value 8
   ```
3. **Front-door IAM user** (for Vercel). In IAM → Users → Create user
   `portfolio-stream-frontdoor`, with no console access. Attach an inline policy
   pasted from `front-door-policy.json`: describe instances, and start only
   instances tagged `StreamFleet=portfolio-stream`. Then Security credentials →
   Create access key → "Application running outside AWS".
4. **TURN relay (recommended before going public):** viewers on networks that block
   direct UDP (offices, schools, some carriers) can only connect through a relay.
   Cloudflare dashboard → Realtime → TURN Server → Create. Put the key's id and API
   token in `server-windows.env` as `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN` and
   redeploy. The pool mints short-lived credentials per viewer (at most
   `TURN_MINTS_PER_IP`, default 12, per IP per 10 min). Cloudflare includes
   1 TB/month free.
5. **HTTPS hosts:** one per server, e.g. `stream-1.<domain>`. Set
   `STREAM_HOST_PATTERN=stream-{n}.<domain>` in `config.env`, and after launching,
   add DNS A records pointing to each server's Elastic IP.

## Market: Spot or on-demand

`MARKET=spot` is cheapest (~$0.27–0.36/hr) but AWS can reclaim it and may have no
capacity (it happened on 2026-10-03). `MARKET=on-demand` is never reclaimed
(g4dn.xlarge $0.526/hr, ~$385/mo 24/7) and needs the separate *Running On-Demand
G and VT instances* quota (`L-DB2E81BA`). For 24/7 set `SELF_STOP=0` in
server.env; otherwise the keep-on window + self-stop applies.

## Launch → test

```sh
cd experiments/pixel-stream/deploy
cp config.env.example config.env     # fill in
cp server.env.example server.env     # SITE_URL, EMBED_ORIGINS, LAB_TOKEN, keep-on window…
./aws-launch.sh 1                    # key pair, firewall, Elastic IP, Spot instance (billing starts)
#   → DNS A record  stream-1.<domain> → <Elastic IP>
./site.sh 1                          # the server hosts the site itself (SITE_URL=http://localhost:3000/resume)
./deploy.sh 1                        # waits for first boot, pushes code, starts the pool
./aws-ctl.sh gpu 1                   # Chrome must see the T4 (nvidia/turing), not SwiftShader
./aws-ctl.sh status all
```

On your phone (LTE): `https://stream-1.<domain>/` (play mode) and `/?lab`
(latency, quality, codec and bitrate). Then watch a card section:
```sh
curl -s "https://stream-1.<domain>/status?token=$LAB_TOKEN&timeline" | jq '.seats[] | {seat, timeline}'
```

With `SELF_STOP=1` the server stops itself after 30 idle minutes outside the
keep-on window. `./aws-ctl.sh stop 1` stops it right away, and
`./aws-ctl.sh start 1` brings it back (seats warm in ~1–2 min).

## Turning it on for the site

Vercel → Project → Settings → Environment Variables, then redeploy:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_STREAM_MODE` | `opt-in` first (`/resume?stream=1`), then `weak` or `all` |
| `STREAM_AWS_ACCESS_KEY_ID` / `STREAM_AWS_SECRET_ACCESS_KEY` | the front-door user's key |
| `STREAM_AWS_REGION` | `ca-central-1` |
| `STREAM_FLEET` | `portfolio-stream` (matches `NAME` in config.env) |
| `STREAM_MIN_FREE_SEATS` | `2` (start another server below this) |
| `STREAM_MAX_SERVERS` | `1` (raise after `./aws-launch.sh 2`) |
| `STREAM_SEATS_PER_SERVER` | `SEATS` from server.env |

Also put your site's origin in `EMBED_ORIGINS` (server.env), then `./deploy.sh n`.

Local development without AWS: `STREAM_FLEET_STATIC=http://localhost:8787` plus
`NEXT_PUBLIC_STREAM_MODE=all` points the front door at a pool on your machine.

## Windows servers and the golden image

Windows is the default (`OS=windows` in config.env): Chrome there encodes WebRTC
H.264 on the T4 (NVENC). Chrome on Linux can only encode in software. Setting up
a fresh Windows server takes 10–15 min (GRID driver, Chrome, Node, Caddy, reboot)
plus `./deploy-windows.sh n` (site build, several minutes).

Once one server is good, snapshot it:
```sh
./aws-ctl.sh image 2      # reboots server 2 (~2 min down), ~20 min until the image is ready
```
After that, `./aws-launch.sh n` starts new servers from the newest image, with no
user data and no deploy. At boot, the server points Caddy at its own name (its
`StreamHost` tag, else `<ip>.sslip.io`, via task `pixel-stream-caddy`), auto-logs in
and starts the seats: first seat warm ~6 min after launch (measured 345 s; the
restored disk is slow on first read, the pool restarts until the site is up). A
stopped server is back in ~2.5 min (measured 151 s after a reboot). `FRESH=1 ./aws-launch.sh n` ignores the image.

**Re-image after deploying new code**, or servers launched later run the old
code. `image` keeps only the newest image per OS (~$1–3/month of snapshots).

## Removing things

`./aws-ctl.sh teardown n` cancels server n's Spot request, terminates it and
releases its Elastic IP. After the last server, the security group and key pair
go too.
