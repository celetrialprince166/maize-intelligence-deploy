provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  farms_table_arn             = "arn:aws:dynamodb:us-east-1:123456789012:table/maize-intelligence-farms"
  users_table_arn             = "arn:aws:dynamodb:us-east-1:123456789012:table/maize-intelligence-users"
  users_table_email_index_arn = "arn:aws:dynamodb:us-east-1:123456789012:table/maize-intelligence-users/index/email-index"
  model_bucket_arn            = "arn:aws:s3:::maize-intelligence-models-104702104957"
  secret_arns = [
    "arn:aws:secretsmanager:us-east-1:123456789012:secret:maize/gee-key-AbCdEf",
    "arn:aws:secretsmanager:us-east-1:123456789012:secret:maize/other-GhIjKl",
  ]
  ecr_repository_arns = [
    "arn:aws:ecr:us-east-1:123456789012:repository/maize-staging-backend",
    "arn:aws:ecr:us-east-1:123456789012:repository/maize-staging-frontend",
  ]
}

run "role_name_matches_the_required_literal" {
  command = plan

  assert {
    condition     = aws_iam_role.ec2_dynamodb_staging.name == "EC2-DynamoDB-StagingRole"
    error_message = "Role name must be exactly EC2-DynamoDB-StagingRole per the assessment scope"
  }
}

run "dynamodb_policy_has_no_wildcard_resource" {
  command = plan

  assert {
    condition = alltrue([
      for r in jsondecode(data.aws_iam_policy_document.dynamodb_access.json).Statement[0].Resource : r != "*"
    ])
    error_message = "DynamoDB policy must not grant access to Resource = \"*\""
  }

  assert {
    condition     = contains(jsondecode(data.aws_iam_policy_document.dynamodb_access.json).Statement[0].Resource, var.users_table_email_index_arn)
    error_message = "Policy must include the email-index GSI ARN — users.get_user_by_email depends on it"
  }
}

run "s3_policy_is_read_only_and_scoped" {
  command = plan

  assert {
    condition     = jsondecode(data.aws_iam_policy_document.s3_model_read.json).Statement[0].Action == "s3:GetObject"
    error_message = "S3 policy must grant only s3:GetObject, not a wildcard action"
  }
}

run "secrets_policy_is_scoped_not_wildcard" {
  command = plan

  assert {
    condition = alltrue([
      for r in jsondecode(data.aws_iam_policy_document.secrets_read.json).Statement[0].Resource : r != "*"
    ])
    error_message = "Secrets policy must not grant access to Resource = \"*\""
  }
}

run "ecr_pull_is_scoped_to_this_projects_repos" {
  command = plan

  assert {
    condition     = toset(jsondecode(data.aws_iam_policy_document.ecr_pull.json).Statement[1].Resource) == toset(var.ecr_repository_arns)
    error_message = "ECR pull (BatchGetImage etc) must be scoped to this project's repo ARNs, not account-wide"
  }
}

run "ssm_managed_policy_is_attached_for_no_ssh_access" {
  command = plan

  assert {
    condition     = aws_iam_role_policy_attachment.ssm_managed_instance_core.policy_arn == "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
    error_message = "SSM managed policy must be attached so Session Manager works without SSH"
  }
}
