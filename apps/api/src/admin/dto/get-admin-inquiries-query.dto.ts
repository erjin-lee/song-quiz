import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  INQUIRY_FUNCTION_NAMES,
  InquiryConfidence,
  InquiryFunctionName,
  InquiryStatus,
} from '../../inquiry/inquiry.types';

const INQUIRY_STATUSES: InquiryStatus[] = [
  'RECEIVED',
  'NO_MATCH',
  'REJECTED',
  'PENDING_REVIEW',
  'COMPLETED',
  'FAILED',
];

const INQUIRY_CONFIDENCES: InquiryConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];

/** 쿼리 파라미터가 하나만 오면 문자열로, 여러 개 오면 배열로 파싱되는 express 기본 동작을 배열로 통일한다. */
function toArray({ value }: { value: unknown }): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

export class GetAdminInquiriesQueryDto {
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(INQUIRY_STATUSES, { each: true })
  status?: InquiryStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(INQUIRY_CONFIDENCES, { each: true })
  confidence?: InquiryConfidence[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(INQUIRY_FUNCTION_NAMES, { each: true })
  matchedFunction?: InquiryFunctionName[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;
}
