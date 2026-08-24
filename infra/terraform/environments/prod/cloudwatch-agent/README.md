# CloudWatch Agent 설정 (app_a)

`amazon-cloudwatch-agent.json`이 `app_a` EC2 인스턴스에 설치된 CloudWatch Agent 설정의
source of truth다. Terraform 리소스가 아니라(Agent 설치/설정 자체는 EC2에서 수동으로 진행하는
범위라 `../scripts/`의 운영 스크립트들과 같은 성격), 이 디렉터리에 파일로만 관리하고 EC2에는
수동으로 복사해 적용한다.

`file_path`는 실제 배포 경로(`/home/ubuntu/song-quiz`, GitHub Actions secret `WAS_APP_DIR`과 동일한 값)를
그대로 하드코딩해뒀다 - 이 프로젝트는 환경이 prod 하나뿐이라 플레이스홀더를 유지할 이유가 없다.

파일을 바꾼 뒤에는 EC2에 복사하고 agent를 재시작해 새 설정을 반영한다. `fetch-config`에 `-s`를
같이 주면 JSON→내부 설정 변환과 재시작(이미 떠 있으면 재시작, 없으면 시작)이 한 번에 된다 -
`-a start`만 따로 실행하는 건 기존 설정으로 다시 켜는 것뿐이라 새 config가 반영되지 않는다.

```bash
scp amazon-cloudwatch-agent.json was:/tmp/amazon-cloudwatch-agent.json
ssh was '
  sudo mv /tmp/amazon-cloudwatch-agent.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config -m ec2 -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
'
```

이 파일에 있는 `logs.logs_collected.files.collect_list`(api/game 로그)와
`metrics.namespace`/`metrics.metrics_collected`(EC2 Memory/Disk)는 `infra/terraform`의 아래
리소스와 값이 맞아야 한다 - 어느 한쪽만 바꾸면 Agent가 엉뚱한 Log Group/namespace로 보내거나
IAM 권한 부족으로 조용히 실패한다.

| 이 파일의 값 | Terraform 리소스 |
|---|---|
| `logs_collected...log_group_name` | `modules/logging` → `aws_cloudwatch_log_group.api` / `.game` |
| `metrics.namespace` | `modules/iam` → `aws_iam_role_policy.app_cloudwatch_metrics`의 `var.ec2_metric_namespace` (기본값 `SongQuiz/EC2`) |
| `traces.traces_collected.otlp.http_endpoint` | `modules/iam` → `aws_iam_role_policy.app_xray_write` (X-Ray write 권한이 있어야 Agent가 수신한 trace를 X-Ray로 보낼 수 있다) |

## Trace(OTLP) 수신

`traces.traces_collected.otlp.http_endpoint`는 `apps/api`/`apps/game`(`packages/tracing`)이
`OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`로 보내는 OTLP/HTTP trace를 Agent가 받아
X-Ray/CloudWatch Traces로 전달하는 receiver다. `127.0.0.1`로만 바인딩하며, api/game과 같은 EC2
안에서만 접근하므로 Security Group에 4318을 열지 않는다.

적용 후 다음을 확인한다.

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status
sudo tail -f /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log
sudo ss -lntp | grep 4318   # 127.0.0.1:4318 LISTEN이어야 한다
```
