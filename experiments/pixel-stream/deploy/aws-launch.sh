#!/usr/bin/env bash
# Create render server n (default 1) on EC2. Idempotent: reuses anything that exists.
#   shared:     key pair, security group        (tag Name=$NAME)
#   per server: Elastic IP, GPU instance        (tag Name=$NAME-n, StreamFleet=$NAME, StreamHost=<host>)
# The instance is Spot (persistent; AWS stops rather than terminates it on
# interruption) and an OS shutdown stops it too, which is how idle servers turn
# themselves off. Billing runs while it runs. Stop by hand: ./aws-ctl.sh stop n
#   ./aws-launch.sh        server 1
#   ./aws-launch.sh 2      a second server for the front door to scale onto
set -euo pipefail
source "$(dirname "$0")/lib.sh"
n=${1:-1}
srv=$(server_name "$n")
host=$(server_host "$n" || true)
UDP_RANGE_FROM=10000 UDP_RANGE_TO=10999 # matches bootstrap.sh
say() { printf '\n== %s\n' "$*"; }

say "identity"
aws sts get-caller-identity --query Arn --output text

say "key pair $NAME"
if ! aws ec2 describe-key-pairs --key-names "$NAME" >/dev/null 2>&1; then
  mkdir -p "$(dirname "$SSH_KEY")"
  aws ec2 create-key-pair --key-name "$NAME" --key-type ed25519 --query KeyMaterial --output text > "$SSH_KEY"
  chmod 600 "$SSH_KEY"
  echo "created, private key saved to $SSH_KEY"
else
  echo "exists"
fi

say "security group $NAME (default VPC)"
vpc=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
sg=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME" "Name=vpc-id,Values=$vpc" --query 'SecurityGroups[0].GroupId' --output text)
myip=$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')
if [ "$sg" = "None" ]; then
  sg=$(aws ec2 create-security-group --group-name "$NAME" --description "pixel-stream render servers" --vpc-id "$vpc" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$NAME}]" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$sg" --ip-permissions \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$myip/32,Description=ssh-from-launcher}]" \
    "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=http-acme}]" \
    "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=https-signaling}]" \
    "IpProtocol=udp,FromPort=$UDP_RANGE_FROM,ToPort=$UDP_RANGE_TO,IpRanges=[{CidrIp=0.0.0.0/0,Description=webrtc-media}]" >/dev/null
  echo "created $sg (ssh allowed from $myip only)"
else
  echo "exists $sg"
fi

say "elastic IP $srv"
alloc=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$srv" --query 'Addresses[0].AllocationId' --output text)
if [ "$alloc" = "None" ]; then
  alloc=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$srv}]" --query AllocationId --output text)
fi
eip=$(aws ec2 describe-addresses --allocation-ids "$alloc" --query 'Addresses[0].PublicIp' --output text)
echo "$eip"

say "instance $srv"
iid=$(server_instance "$n")
tags="{Key=Name,Value=$srv},{Key=StreamFleet,Value=$NAME},{Key=StreamOS,Value=$(server_os "$n")}"
if [ -n "$host" ]; then tags="$tags,{Key=StreamHost,Value=$host}"; fi
if [ "$iid" = "None" ]; then
  os=$(server_os "$n")
  userdata="$here/bootstrap.sh"
  disk=()
  if [ "$os" = windows ]; then
    # Windows Server 2022 + AWS's NVIDIA GRID driver (free for G4dn; Chrome on
    # Windows encodes WebRTC H.264 with NVENC). The driver comes from AWS's S3
    # bucket via a 2-hour pre-signed link, so the instance needs no AWS keys.
    ami=$(aws ec2 describe-images --owners amazon \
      --filters "Name=name,Values=Windows_Server-2022-English-Full-Base-*" "Name=state,Values=available" \
      --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
    key=$(command aws --profile "$AWS_PROFILE" --region us-east-1 s3 ls s3://ec2-windows-nvidia-drivers/latest/ --recursive \
      | awk '{print $4}' | grep -iE 'server2022.*\.exe$' | head -1)
    [ -n "$key" ] || { echo "no GRID driver found (needs s3 read: AmazonS3ReadOnlyAccess)"; exit 1; }
    url=$(command aws --profile "$AWS_PROFILE" --region us-east-1 s3 presign "s3://ec2-windows-nvidia-drivers/$key" --expires-in 7200)
    pub=$(ssh-keygen -y -f "$SSH_KEY")
    userdata=$(mktemp)
    sed -e "s#__PUBKEY__#$pub#" -e "s#__DRIVER_URL__#${url//&/\\&}#" "$here/bootstrap-windows.ps1" > "$userdata"
    disk=(--block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":60,"VolumeType":"gp3"}}]')
    echo "GRID driver $key"
  else
    # Latest Deep Learning Base OSS NVIDIA driver AMI (Ubuntu 24.04), found with EC2 permissions only.
    ami=$(aws ec2 describe-images --owners amazon \
      --filters "Name=name,Values=Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 24.04)*" "Name=state,Values=available" \
      --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
  fi
  echo "AMI $ami ($os)"
  market=()
  if [ "$MARKET" = "spot" ]; then
    market=(--instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"persistent","InstanceInterruptionBehavior":"stop"}}')
  fi
  # Windows gets our SSH key via its bootstrap (and EC2 rejects ED25519 key pairs
  # on Windows AMIs anyway), so only Linux uses the EC2 key pair.
  keyarg=(--key-name "$NAME"); [ "$os" = windows ] && keyarg=()
  iid=$(aws ec2 run-instances --image-id "$ami" --instance-type "$INSTANCE_TYPE" ${keyarg[@]+"${keyarg[@]}"} \
    --security-group-ids "$sg" ${market[@]+"${market[@]}"} \
    --instance-initiated-shutdown-behavior stop \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --user-data "file://$userdata" ${disk[@]+"${disk[@]}"} \
    --tag-specifications "ResourceType=instance,Tags=[$tags]" "ResourceType=volume,Tags=[{Key=Name,Value=$srv}]" \
    --query 'Instances[0].InstanceId' --output text)
  echo "launched $iid ($MARKET $INSTANCE_TYPE)"
else
  echo "exists $iid"
  # keep the front door's tags current (e.g. after setting STREAM_HOST_PATTERN)
  aws ec2 create-tags --resources "$iid" --tags "Key=Name,Value=$srv" "Key=StreamFleet,Value=$NAME" ${host:+"Key=StreamHost,Value=$host"} >/dev/null
fi

say "waiting for running"
aws ec2 wait instance-running --instance-ids "$iid"
aws ec2 associate-address --instance-id "$iid" --allocation-id "$alloc" >/dev/null
echo "running at $eip"
# A relaunched server reuses the Elastic IP with a new host key: forget the old one.
ssh-keygen -R "$eip" >/dev/null 2>&1 || true

cat <<NEXT

Next:
  1. First boot installs Chrome/Node/Caddy (~5 min). Watch it:
       ssh -i $SSH_KEY ubuntu@$eip 'tail -f /var/log/pixel-stream-bootstrap.log'
  2. HTTPS: DNS A record  ${host:-<stream host>} → $eip  (and STREAM_HOST_PATTERN in config.env)
  3. Push the code + config and start:  ./deploy.sh $n
NEXT
