import { getSsmParameter } from "../get-ssm-parameter";
import {
  CollectionStatus,
  DeploymentContext,
  DeploymentPullRequest,
  PullRequestLookupStatus,
} from "./types";

// PR 전체 diff/review comment는 담지 않는다(§16, §33) - Deploy workflow가 이미 이 상한을
// 지켜 기록하지만, 외부(SSM) 값을 신뢰하지 않고 여기서도 한 번 더 방어적으로 자른다.
const MAX_SUMMARY_LENGTH = 1000;
const MAX_CHANGED_FILES = 30;

const VALID_LOOKUP_STATUSES: PullRequestLookupStatus[] = [
  "FOUND",
  "NOT_FOUND",
  "FAILED",
];

interface RawDeploymentMetadata {
  commitSha?: string;
  deployedAt?: string;
  pullRequestLookup?: string;
  pullRequest?: {
    number?: number;
    title?: string;
    summary?: string;
    changedFiles?: string[];
  } | null;
}

function isParameterNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "ParameterNotFound";
}

/**
 * direct push(PR 없음)와 gh api 조회 실패(§4)를 구분해 표현한다 - write-deployment-metadata.sh가
 * 이미 이 필드를 채워 쓰지만, 값이 없거나 알 수 없는 문자열이면(이전 포맷과의 호환 등)
 * pullRequest 유무로 최대한 안전하게 추론한다.
 */
function normalizeLookupStatus(
  raw: RawDeploymentMetadata,
): PullRequestLookupStatus {
  if (
    typeof raw.pullRequestLookup === "string" &&
    (VALID_LOOKUP_STATUSES as string[]).includes(raw.pullRequestLookup)
  ) {
    return raw.pullRequestLookup as PullRequestLookupStatus;
  }
  return raw.pullRequest ? "FOUND" : "NOT_FOUND";
}

function normalizePullRequest(
  raw: RawDeploymentMetadata["pullRequest"],
): DeploymentPullRequest | undefined {
  if (!raw || typeof raw.number !== "number" || typeof raw.title !== "string") {
    return undefined;
  }
  return {
    number: raw.number,
    title: raw.title,
    summary:
      typeof raw.summary === "string"
        ? raw.summary.slice(0, MAX_SUMMARY_LENGTH)
        : undefined,
    changedFiles: Array.isArray(raw.changedFiles)
      ? raw.changedFiles.slice(0, MAX_CHANGED_FILES)
      : [],
  };
}

/** Alarm triggeredAt 기준 몇 분 전에 배포됐는지 deterministic하게 계산한다(§20). */
function computeMinutesBeforeIncident(
  deployedAt: string,
  incidentAt: Date,
): number | undefined {
  const deployedAtMs = new Date(deployedAt).getTime();
  if (Number.isNaN(deployedAtMs)) {
    return undefined;
  }
  return Math.round((incidentAt.getTime() - deployedAtMs) / 60_000);
}

async function collectOne(
  service: "api" | "game",
  parameterName: string,
  incidentAt: Date,
): Promise<DeploymentContext | null> {
  let raw: string;
  try {
    raw = await getSsmParameter(parameterName);
  } catch (error) {
    // 아직 한 번도 배포 metadata가 기록되지 않은 정상적인 초기 상태다(§29) - 실패로
    // 취급하지 않고 조용히 "배포 정보 없음"으로 처리한다.
    if (isParameterNotFound(error)) {
      return null;
    }
    throw error;
  }

  let parsed: RawDeploymentMetadata;
  try {
    parsed = JSON.parse(raw) as RawDeploymentMetadata;
  } catch {
    return null;
  }

  if (
    typeof parsed.commitSha !== "string" ||
    typeof parsed.deployedAt !== "string"
  ) {
    return null;
  }

  return {
    service,
    commitSha: parsed.commitSha,
    deployedAt: parsed.deployedAt,
    minutesBeforeIncident: computeMinutesBeforeIncident(
      parsed.deployedAt,
      incidentAt,
    ),
    pullRequestLookup: normalizeLookupStatus(parsed),
    pullRequest: normalizePullRequest(parsed.pullRequest),
  };
}

export interface CollectDeploymentsConfig {
  apiDeploymentParameterName?: string;
  gameDeploymentParameterName?: string;
}

export interface CollectDeploymentsResult {
  status: CollectionStatus;
  deployments: DeploymentContext[];
}

/**
 * QuizSnapshotFailure는 Game -> API Quiz Snapshot 경로와 관련되므로 API/Game 둘 다
 * 최근 Production Deployment를 조회한다(§19). GitHub API를 직접 호출하지 않는다(§32) -
 * PR 정보는 Deploy workflow가 이미 commit -> PR 관계를 확정해 SSM에 기록해둔 것을 읽기만 한다.
 */
export async function collectDeployments(
  config: CollectDeploymentsConfig,
  incidentAt: Date,
): Promise<CollectDeploymentsResult> {
  const targets: Array<{ service: "api" | "game"; parameterName?: string }> = [
    { service: "api", parameterName: config.apiDeploymentParameterName },
    { service: "game", parameterName: config.gameDeploymentParameterName },
  ];

  const deployments: DeploymentContext[] = [];
  let hasUnexpectedFailure = false;

  for (const target of targets) {
    if (!target.parameterName) {
      continue;
    }
    try {
      const deployment = await collectOne(
        target.service,
        target.parameterName,
        incidentAt,
      );
      if (deployment) {
        deployments.push(deployment);
      }
    } catch {
      hasUnexpectedFailure = true;
    }
  }

  return { status: hasUnexpectedFailure ? "failed" : "success", deployments };
}
