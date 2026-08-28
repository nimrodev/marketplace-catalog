#!/bin/bash
set -euo pipefail

REGION=eu-central-1

awslocal --region "$REGION" s3 mb s3://marketplace-catalog-photos

# Mirrors the real bucket's config (CLAUDE.md: CORS + public-read scoped to
# listings/*) — without it, the browser's direct PUT upload and the <img>
# GET both fail against LocalStack even though they work against prod.
awslocal --region "$REGION" s3api put-bucket-cors --bucket marketplace-catalog-photos --cors-configuration '{
  "CORSRules": [
    {
      "AllowedMethods": ["PUT", "GET"],
      "AllowedOrigins": ["*"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'

awslocal --region "$REGION" s3api put-bucket-policy --bucket marketplace-catalog-photos --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::marketplace-catalog-photos/listings/*"
    }
  ]
}'

awslocal --region "$REGION" sqs create-queue --queue-name marketplace-prescreen-dlq
DLQ_ARN=$(awslocal --region "$REGION" sqs get-queue-attributes \
  --queue-url "http://localhost:4566/000000000000/marketplace-prescreen-dlq" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal --region "$REGION" sqs create-queue --queue-name marketplace-prescreen \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}"
