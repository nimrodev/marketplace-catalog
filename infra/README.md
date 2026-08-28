# Infrastructure (MAR-43)

Provisioned once, directly via the AWS CLI — not IaC. The instance is created once
and never changes, so what's committed here is the part with review value: the
policies, not a script re-run zero times.

Account `515048574975`, `eu-central-1` (matches Neon's region). A prior account was
blocked by AWS account verification, so this was (re-)provisioned here.

| Resource | Name / ID |
|---|---|
| S3 bucket | `marketplace-catalog-photos` |
| SQS queue / DLQ | `marketplace-prescreen` / `marketplace-prescreen-dlq` |
| IAM role / profile | `marketplace-ec2-role` / `marketplace-ec2-profile` |
| Security group | `marketplace-prod-sg` |
| Key pair | `marketplace-prod-key` (`.pem` gitignored) |
| EC2 instance | `i-0ea7f722cf2714c86`, t4g.micro, Ubuntu 24.04 arm64 |
| Elastic IP | `18.193.228.86` |

No static AWS credentials on the box — the instance role supplies short-lived,
auto-rotating credentials via instance metadata.

**Recreating:** `instance-role-policy.json`, `trust-policy.json`, and `user-data.sh`
in this directory are the actual artifacts used; wire them up with `iam create-role`
/ `create-instance-profile` / `ec2 run-instances --user-data file://user-data.sh`
against a fresh S3 bucket, SQS queue+DLQ, security group (22 restricted to your IP,
80/443 open), and key pair.

**Verifying:** `ssh -i ec2/marketplace-prod-key.pem ubuntu@<ELASTIC_IP> 'docker --version; docker compose version'`
