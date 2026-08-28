#!/bin/bash
set -euo pipefail

REGION=eu-central-1

awslocal --region "$REGION" s3 mb s3://marketplace-catalog-photos

awslocal --region "$REGION" sqs create-queue --queue-name marketplace-prescreen-dlq
DLQ_ARN=$(awslocal --region "$REGION" sqs get-queue-attributes \
  --queue-url "http://localhost:4566/000000000000/marketplace-prescreen-dlq" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal --region "$REGION" sqs create-queue --queue-name marketplace-prescreen \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}"
