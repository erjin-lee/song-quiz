#!/usr/bin/env bash
# Production 배포가 성공한 뒤에만 호출된다(deploy-api.yml/deploy-game.yml에서 SSH 배포
# 스텝 다음 스텝으로 실행 - 그 스텝이 실패하면 이 스크립트는 아예 실행되지 않는다).
#
# "직전 PR"은 GitHub에서 가장 최근 merge된 PR이 아니라, 지금 막 배포에 성공한
# commit과 실제로 연결된 PR이다 - commit -> PR 조회에
# "List pull requests associated with a commit" API를 쓴다.
#
# 사용법: write-deployment-metadata.sh <service: api|game> <ssm-parameter-name> <deployed-commit-sha>
# deployed-commit-sha는 GITHUB_SHA(이 워크플로우를 트리거한 push의 SHA)가 아니라, WAS 서버에서
# 실제로 git pull된 뒤의 HEAD(`git rev-parse HEAD`)를 호출부(deploy-*.yml)가 넘겨준 값이다 -
# GITHUB_SHA를 쓰면 같은 concurrency group에서 대기하던 다른 실행이 그 사이 더 최신 커밋을
# 먼저 pull했을 때 실제 서비스 중인 commit과 어긋날 수 있다.
#
# 필요한 환경변수: GH_TOKEN(gh api 인증), GITHUB_REPOSITORY, GITHUB_RUN_ID(모두 GitHub
#                Actions가 기본 제공), AWS 자격증명(이 스텝 이전에 configure-aws-credentials로 설정)
set -euo pipefail

SERVICE="$1"
PARAMETER_NAME="$2"
COMMIT_SHA="$3"

# PR body를 통째로 담지 않는다(§16, §33) - summary/changedFiles 상한.
MAX_SUMMARY_BYTES=800
MAX_CHANGED_FILES=30

DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# direct push(실제로 연결된 PR이 없음)와 gh api 호출 자체의 실패를 구분한다 - 동일하게
# "PR 정보 없음"으로만 뭉뚱그리면 Incident Analyzer가 "조회를 안 한 것"과 "조회했지만
# 없었던 것"을 구분하지 못한다.
#   FOUND: 연결된 merged PR을 찾아 상세 정보까지 가져왔다.
#   NOT_FOUND: API 조회는 성공했지만 연결된 merged PR이 없다(direct push).
#   FAILED: gh api 호출 자체(commit associated PR 조회, 또는 PR 상세/파일 목록 조회)가 실패했다.
PR_LOOKUP_STATUS="NOT_FOUND"
PR_JSON="null"

if COMMIT_PULLS_JSON="$(gh api "repos/${GITHUB_REPOSITORY}/commits/${COMMIT_SHA}/pulls" 2>/dev/null)"; then
  PR_NUMBER="$(printf '%s' "$COMMIT_PULLS_JSON" | jq -r '[.[] | select(.merged_at != null)] | sort_by(.merged_at) | last | .number // empty')"

  if [ -n "$PR_NUMBER" ]; then
    if PR_DETAIL_JSON="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" 2>/dev/null)" && CHANGED_FILES_JSON="$(
      gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files" --paginate --jq '.[].filename' 2>/dev/null \
        | head -n "$MAX_CHANGED_FILES" \
        | jq -R . \
        | jq -s .
    )"; then
      PR_TITLE="$(printf '%s' "$PR_DETAIL_JSON" | jq -r '.title')"
      PR_BODY="$(printf '%s' "$PR_DETAIL_JSON" | jq -r '.body // ""')"
      PR_SUMMARY="$(printf '%s' "$PR_BODY" | head -c "$MAX_SUMMARY_BYTES")"

      # 문자열 이어붙이기로 JSON을 만들지 않는다(§36) - PR title/body에 따옴표/줄바꿈/마크다운이
      # 있어도 jq --arg가 안전하게 escape한다.
      PR_JSON="$(
        jq -n \
          --argjson number "$PR_NUMBER" \
          --arg title "$PR_TITLE" \
          --arg summary "$PR_SUMMARY" \
          --argjson changedFiles "$CHANGED_FILES_JSON" \
          '{number: $number, title: $title, summary: $summary, changedFiles: $changedFiles}'
      )"
      PR_LOOKUP_STATUS="FOUND"
    else
      # PR 번호는 찾았지만 상세/파일 목록 조회가 실패했다 - "PR 없음"이 아니라 "조회 실패"다.
      PR_LOOKUP_STATUS="FAILED"
    fi
  fi
else
  # commit -> PR 조회 자체가 실패했다(네트워크/인증/rate limit 등).
  PR_LOOKUP_STATUS="FAILED"
fi

METADATA_JSON="$(
  jq -n \
    --arg service "$SERVICE" \
    --arg commitSha "$COMMIT_SHA" \
    --arg deployedAt "$DEPLOYED_AT" \
    --arg repository "$GITHUB_REPOSITORY" \
    --arg workflowRunId "$GITHUB_RUN_ID" \
    --arg pullRequestLookup "$PR_LOOKUP_STATUS" \
    --argjson pullRequest "$PR_JSON" \
    '{
      service: $service,
      commitSha: $commitSha,
      deployedAt: $deployedAt,
      repository: $repository,
      workflowRunId: $workflowRunId,
      pullRequestLookup: $pullRequestLookup,
      pullRequest: $pullRequest
    }'
)"

# PR 조회가 FAILED여도 commit/deployedAt은 이미 확정된 사실이므로 metadata 기록 자체는
# 계속한다(§4) - 조회 실패 때문에 "지금 무엇이 배포되어 있는지" 기록까지 놓치지 않는다.
aws ssm put-parameter \
  --name "$PARAMETER_NAME" \
  --type "String" \
  --overwrite \
  --value "$METADATA_JSON" \
  >/dev/null

echo "Deployment metadata written to ${PARAMETER_NAME} (service=${SERVICE}, commitSha=${COMMIT_SHA}, pullRequestLookup=${PR_LOOKUP_STATUS})"
