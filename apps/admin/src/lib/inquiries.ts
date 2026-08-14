import { apiGet, apiPost } from '@/lib/api-client';
import type {
  AdminInquiryListDto,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryStatus,
} from '@/types/inquiry';

export interface GetAdminInquiriesFilter {
  status?: InquiryStatus[];
  confidence?: InquiryConfidence[];
  matchedFunction?: InquiryFunctionName[];
  page?: number;
  pageSize?: number;
}

export function getAdminInquiries(
  filter: GetAdminInquiriesFilter,
): Promise<AdminInquiryListDto> {
  const params = new URLSearchParams();
  filter.status?.forEach((value) => params.append('status', value));
  filter.confidence?.forEach((value) => params.append('confidence', value));
  filter.matchedFunction?.forEach((value) =>
    params.append('matchedFunction', value),
  );
  if (filter.page !== undefined) {
    params.set('page', String(filter.page));
  }
  if (filter.pageSize !== undefined) {
    params.set('pageSize', String(filter.pageSize));
  }
  const query = params.toString();
  return apiGet<AdminInquiryListDto>(
    `/admin/inquiries${query ? `?${query}` : ''}`,
  );
}

export function approveInquiry(inquiryId: string): Promise<void> {
  return apiPost<void>(`/admin/inquiries/${inquiryId}/approve`);
}

export function rejectInquiry(inquiryId: string): Promise<void> {
  return apiPost<void>(`/admin/inquiries/${inquiryId}/reject`);
}
