import { apiGet, apiPost } from '@/lib/api-client';
import type {
  AdminInquiryItemDto,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryStatus,
} from '@/types/inquiry';

export interface GetAdminInquiriesFilter {
  status?: InquiryStatus[];
  confidence?: InquiryConfidence[];
  matchedFunction?: InquiryFunctionName[];
}

export function getAdminInquiries(
  filter: GetAdminInquiriesFilter,
): Promise<AdminInquiryItemDto[]> {
  const params = new URLSearchParams();
  filter.status?.forEach((value) => params.append('status', value));
  filter.confidence?.forEach((value) => params.append('confidence', value));
  filter.matchedFunction?.forEach((value) =>
    params.append('matchedFunction', value),
  );
  const query = params.toString();
  return apiGet<AdminInquiryItemDto[]>(
    `/admin/inquiries${query ? `?${query}` : ''}`,
  );
}

export function approveInquiry(inquiryId: string): Promise<void> {
  return apiPost<void>(`/admin/inquiries/${inquiryId}/approve`);
}

export function rejectInquiry(inquiryId: string): Promise<void> {
  return apiPost<void>(`/admin/inquiries/${inquiryId}/reject`);
}
