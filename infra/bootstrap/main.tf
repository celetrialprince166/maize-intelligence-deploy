# Bootstraps the S3 bucket + DynamoDB lock table that infra/environments/*
# use as a Terraform remote state backend. First apply necessarily used
# local state (there was no backend to point to yet); once the bucket/table
# existed, this config's own state was migrated into them too via
# `terraform init -migrate-state`, so a lost local state file no longer
# makes these resources unmanaged. Naming follows the
# *-tfstate-<account>-<region> convention already used elsewhere in this
# AWS account.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "maize-tfstate-183631301567-us-east-1"
    key    = "bootstrap/terraform.tfstate"
    region = "us-east-1"
    # No dynamodb_table here on purpose: the lock table is one of the two
    # resources THIS config creates, so it can't depend on itself existing
    # for locking to work on the very first apply. Fine in practice —
    # bootstrap is applied rarely and by one person.
  }
}

provider "aws" {
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "tfstate" {
  bucket = "maize-tfstate-${data.aws_caller_identity.current.account_id}-us-east-1"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = "maize-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

output "state_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

output "lock_table" {
  value = aws_dynamodb_table.tfstate_lock.name
}
