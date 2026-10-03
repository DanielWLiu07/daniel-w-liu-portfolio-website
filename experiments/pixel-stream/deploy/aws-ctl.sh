#!/usr/bin/env bash
# Day-to-day control of render server n (default 1).
#   ./aws-ctl.sh status [n|all]   instance + spot state, IP, health, seats
#   ./aws-ctl.sh start [n]        start a stopped server (seats warm ~1-2 min later)
#   ./aws-ctl.sh stop [n]         stop it: compute billing stops, disk (EBS) stays
#   ./aws-ctl.sh ssh [n]          shell on the instance
#   ./aws-ctl.sh logs [n]         follow the pool's logs
#   ./aws-ctl.sh gpu [n]          check that Chrome sees the GPU (WebGPU adapter, Vulkan)
#   ./aws-ctl.sh teardown [n]     delete server n (and, after the last one, the shared pieces)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cmd=${1:-status}
n=${2:-1}

status_one() {
  local i=$1 iid
  iid=$(server_instance "$i")
  if [ "$iid" = "None" ]; then echo "$(server_name "$i"): no instance"; return; fi
  aws ec2 describe-instances --instance-ids "$iid" \
    --query 'Reservations[0].Instances[0].{name:Tags[?Key==`Name`]|[0].Value,id:InstanceId,state:State.Name,type:InstanceType,market:InstanceLifecycle,host:Tags[?Key==`StreamHost`]|[0].Value,ip:PublicIpAddress}' --output table
  local base; base=$(server_base "$i")
  echo "health: $(curl -fsS -m 3 "$base/healthz" 2>&1 || echo unreachable)"
  echo "seats:  $(curl -fsS -m 3 "$base/api/seat" 2>&1 || echo unreachable)"
}

if [ "$cmd" = status ] && [ "$n" = all ]; then
  for name in $(aws ec2 describe-instances --filters "Name=tag:StreamFleet,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
      --query 'Reservations[].Instances[].Tags[?Key==`Name`].Value' --output text); do
    status_one "${name##*-}"
  done
  exit 0
fi

iid=$(server_instance "$n")
eip=$(server_eip "$n")
ssh=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$eip")
case "$cmd" in
  status) status_one "$n" ;;
  start)
    # Right after a stop, the persistent Spot request needs ~1 min to settle
    # (IncorrectSpotRequestState "marked-for-stop"); keep trying.
    for _ in $(seq 1 30); do
      if aws ec2 start-instances --instance-ids "$iid" >/dev/null 2>&1; then break; fi
      echo "spot request still settling, retrying…"; sleep 10
    done
    aws ec2 wait instance-running --instance-ids "$iid"; echo "running at $eip (seats warm in ~1-2 min)" ;;
  stop)  aws ec2 stop-instances --instance-ids "$iid" --query 'StoppingInstances[0].CurrentState.Name' --output text ;;
  ssh)   exec "${ssh[@]}" ;;
  logs)  exec "${ssh[@]}" journalctl -u pixel-stream -f ;;
  gpu)
    "${ssh[@]}" 'nvidia-smi --query-gpu=name,driver_version,utilization.gpu --format=csv; vulkaninfo --summary 2>/dev/null | grep -E "deviceName|driverName" || echo "vulkan: none"'
    curl -fsS -m 3 "$(server_base "$n")/status?token=${LAB_TOKEN:-}" 2>/dev/null | jq -r '.seats[] | "seat \(.seat): \(.phase) gpu=\(.gpu)"' || echo "(per-seat GPU needs LAB_TOKEN exported)"
    ;;
  teardown)
    read -r -p "Delete $(server_name "$n") (instance, spot request, Elastic IP)? [y/N] " ok
    [ "$ok" = "y" ] || exit 1
    if [ "$iid" != "None" ]; then
      sir=$(aws ec2 describe-instances --instance-ids "$iid" --query 'Reservations[0].Instances[0].SpotInstanceRequestId' --output text)
      # Cancel the persistent request first, or AWS relaunches the instance.
      if [ "$sir" != "None" ]; then aws ec2 cancel-spot-instance-requests --spot-instance-request-ids "$sir" >/dev/null; fi
      aws ec2 terminate-instances --instance-ids "$iid" >/dev/null
      aws ec2 wait instance-terminated --instance-ids "$iid"
    fi
    alloc=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$(server_name "$n")" --query 'Addresses[0].AllocationId' --output text)
    if [ "$alloc" != "None" ]; then aws ec2 release-address --allocation-id "$alloc"; fi
    left=$(aws ec2 describe-instances --filters "Name=tag:StreamFleet,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'length(Reservations[].Instances[])' --output text)
    if [ "$left" = "0" ]; then
      sg=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME" --query 'SecurityGroups[0].GroupId' --output text)
      if [ "$sg" != "None" ]; then aws ec2 delete-security-group --group-id "$sg"; fi
      aws ec2 delete-key-pair --key-name "$NAME"
      echo "last server gone: security group and key pair deleted too (local key $SSH_KEY left in place)"
    fi
    ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
