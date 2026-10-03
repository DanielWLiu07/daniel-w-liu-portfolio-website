# Shared by the deploy scripts: config, the aws wrapper, and per-server names.
# Server n (default 1) is the instance/Elastic IP tagged Name=$NAME-n.
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
source "$here/config.env"
SSH_KEY=${SSH_KEY/#\~/$HOME}
aws() { command aws --profile "$AWS_PROFILE" --region "$AWS_REGION" "$@"; }

server_name() { echo "$NAME-$1"; }
server_host() {
  [ -n "${STREAM_HOST_PATTERN:-}" ] || return 1
  local h="${STREAM_HOST_PATTERN//\{n\}/$1}"
  # {ip} → the server's Elastic IP with dashes (e.g. 35-182-211-74.sslip.io)
  if [[ "$h" == *"{ip}"* ]]; then local ip; ip=$(server_eip "$1"); h="${h//\{ip\}/${ip//./-}}"; fi
  echo "$h"
}
server_os() { local os_var="OS_$1"; echo "${!os_var:-${OS:-linux}}"; }
ssh_user() { [ "$(server_os "$1")" = windows ] && echo Administrator || echo ubuntu; }
server_eip() { aws ec2 describe-addresses --filters "Name=tag:Name,Values=$(server_name "$1")" --query 'Addresses[0].PublicIp' --output text; }
server_instance() {
  aws ec2 describe-instances --filters "Name=tag:Name,Values=$(server_name "$1")" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text
}
server_base() { local h; h=$(server_host "$1"); if [ -n "$h" ]; then echo "https://$h"; else echo "http://$(server_eip "$1")"; fi; }
