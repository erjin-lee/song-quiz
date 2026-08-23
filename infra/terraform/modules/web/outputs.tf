output "bucket_name" {
  description = "웹 정적 파일을 올릴 S3 버킷 이름"
  value       = aws_s3_bucket.web.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront 배포 ID (캐시 무효화 등에 사용)"
  value       = aws_cloudfront_distribution.web.id
}
