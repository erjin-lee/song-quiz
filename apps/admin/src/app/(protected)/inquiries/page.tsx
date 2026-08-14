'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api-client';
import {
  approveInquiry,
  getAdminInquiries,
  rejectInquiry,
} from '@/lib/inquiries';
import { withStartSecParam } from '@/lib/youtube-url';
import type {
  AdminInquiryItemDto,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryStatus,
} from '@/types/inquiry';

const REQUEST_TYPE_LABELS: Record<InquiryFunctionName, string> = {
  ADD_ANSWER: '정답 추가',
  CHANGE_START_TIME: '시간 변경',
  CHANGE_LINK: '링크 변경',
};

const REQUEST_TYPE_OPTIONS = (
  Object.entries(REQUEST_TYPE_LABELS) as [InquiryFunctionName, string][]
).map(([value, label]) => ({ value, label }));

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ` +
    `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
  );
}

const STATUS_OPTIONS: { value: InquiryStatus; label: string }[] = [
  { value: 'RECEIVED', label: '접수됨' },
  { value: 'NO_MATCH', label: '판별 실패' },
  { value: 'REJECTED', label: '반려' },
  { value: 'PENDING_REVIEW', label: '검토 대기' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'FAILED', label: '처리 실패' },
];

const CONFIDENCE_OPTIONS: { value: InquiryConfidence; label: string }[] = [
  { value: 'HIGH', label: 'HIGH' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'LOW', label: 'LOW' },
];

const CONFIDENCE_BADGE_CLASSES: Record<InquiryConfidence, string> = {
  HIGH: 'border-green-300 bg-green-50 text-green-700',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-700',
  LOW: 'border-red-300 bg-red-50 text-red-700',
};

function toggleSetValue<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(set);
  if (checked) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}

/** 요청 타입이 링크/시간 변경일 때 클릭 시 열어줄 유튜브 URL. 그 외에는 null. */
function getRequestedYoutubeUrl(inquiry: AdminInquiryItemDto): string | null {
  if (inquiry.matchedFunction === 'CHANGE_LINK') {
    const youtubeUrl = inquiry.matchedArgs?.youtubeUrl;
    return typeof youtubeUrl === 'string' ? youtubeUrl : null;
  }

  if (inquiry.matchedFunction === 'CHANGE_START_TIME') {
    const startSec = inquiry.matchedArgs?.startSec;
    if (typeof startSec !== 'number' || !inquiry.youtubeUrl) {
      return null;
    }
    return withStartSecParam(inquiry.youtubeUrl, startSec);
  }

  return null;
}

export default function InquiryListPage() {
  const [inquiries, setInquiries] = useState<AdminInquiryItemDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<Set<InquiryStatus>>(
    new Set(),
  );
  const [confidenceFilter, setConfidenceFilter] = useState<
    Set<InquiryConfidence>
  >(new Set());
  const [requestTypeFilter, setRequestTypeFilter] = useState<
    Set<InquiryFunctionName>
  >(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminInquiries({
        status: Array.from(statusFilter),
        confidence: Array.from(confidenceFilter),
        matchedFunction: Array.from(requestTypeFilter),
      });
      setInquiries(data);
      setSelectedIds(new Set());
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : '문의 목록을 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, confidenceFilter, requestTypeFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        await fetchInquiries();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchInquiries]);

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    const isEligible =
      action === 'approve'
        ? (i: AdminInquiryItemDto) =>
            i.matchedFunction !== null &&
            !(i.matchedFunction === 'ADD_ANSWER' && i.status === 'COMPLETED')
        : (i: AdminInquiryItemDto) => i.status === 'PENDING_REVIEW';

    const targetIds = inquiries
      .filter((i) => selectedIds.has(i.inquiryId) && isEligible(i))
      .map((i) => i.inquiryId);

    if (targetIds.length === 0) {
      setErrorMessage(
        action === 'approve'
          ? '판별된 조치가 있는 문의를 선택해주세요.'
          : '검토 대기 상태인 문의를 선택해주세요.',
      );
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    const actionFn = action === 'approve' ? approveInquiry : rejectInquiry;
    const results = await Promise.allSettled(targetIds.map((id) => actionFn(id)));
    const failedCount = results.filter((r) => r.status === 'rejected').length;

    await fetchInquiries();
    setActionLoading(false);

    if (failedCount > 0) {
      setErrorMessage(
        `${targetIds.length}건 중 ${failedCount}건 처리에 실패했습니다.`,
      );
    }
  };

  const allSelected = inquiries.length > 0 && selectedIds.size === inquiries.length;

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(inquiries.map((i) => i.inquiryId)) : new Set());
  };

  const toggleOne = (inquiryId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(inquiryId);
      } else {
        next.delete(inquiryId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">문의 관리</h1>

      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">상태</span>
          <div className="flex flex-wrap gap-3">
            {STATUS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Checkbox
                  checked={statusFilter.has(option.value)}
                  onCheckedChange={(checked) =>
                    setStatusFilter((prev) =>
                      toggleSetValue(prev, option.value, checked === true),
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">신뢰도</span>
          <div className="flex flex-wrap gap-3">
            {CONFIDENCE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Checkbox
                  checked={confidenceFilter.has(option.value)}
                  onCheckedChange={(checked) =>
                    setConfidenceFilter((prev) =>
                      toggleSetValue(prev, option.value, checked === true),
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">요청 타입</span>
          <div className="flex flex-wrap gap-3">
            {REQUEST_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Checkbox
                  checked={requestTypeFilter.has(option.value)}
                  onCheckedChange={(checked) =>
                    setRequestTypeFilter((prev) =>
                      toggleSetValue(prev, option.value, checked === true),
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={selectedIds.size === 0 || actionLoading}
          onClick={() => handleBulkAction('reject')}
        >
          반려
        </Button>
        <Button
          size="sm"
          disabled={selectedIds.size === 0 || actionLoading}
          onClick={() => handleBulkAction('approve')}
        >
          승인
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="전체 선택"
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
              </TableHead>
              <TableHead>접수 시각</TableHead>
              <TableHead>요청 타입</TableHead>
              <TableHead>곡 정보</TableHead>
              <TableHead>문의 내용</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>신뢰도</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && inquiries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  문의 내역이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {inquiries.map((inquiry) => {
              const requestedYoutubeUrl = getRequestedYoutubeUrl(inquiry);
              return (
                <TableRow
                  key={inquiry.inquiryId}
                  onClick={() => {
                    if (requestedYoutubeUrl) {
                      window.open(
                        requestedYoutubeUrl,
                        '_blank',
                        'noopener,noreferrer',
                      );
                    }
                  }}
                  className={requestedYoutubeUrl ? 'cursor-pointer' : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label="문의 선택"
                      checked={selectedIds.has(inquiry.inquiryId)}
                      onCheckedChange={(checked) =>
                        toggleOne(inquiry.inquiryId, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(inquiry.crtDt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {inquiry.matchedFunction
                      ? REQUEST_TYPE_LABELS[inquiry.matchedFunction]
                      : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {inquiry.songNm
                      ? `${inquiry.songNm} - ${inquiry.atstNm}`
                      : `퀴즈 출제곡 #${inquiry.quizSongId}`}
                  </TableCell>
                  <TableCell className="max-w-xs">{inquiry.content}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{inquiry.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {inquiry.confidence ? (
                      <Badge
                        variant="outline"
                        className={CONFIDENCE_BADGE_CLASSES[inquiry.confidence]}
                      >
                        {inquiry.confidence}
                      </Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
