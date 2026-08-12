import { apiPost } from './client';
import type {
  SubmitInquiryRequestDto,
  SubmitInquiryResponseDto,
} from '../types/inquiry';

export function submitInquiry(
  body: SubmitInquiryRequestDto,
): Promise<SubmitInquiryResponseDto> {
  return apiPost<SubmitInquiryResponseDto>('/inquiries', body);
}
