data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2_dynamodb_staging" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

resource "aws_iam_instance_profile" "ec2_dynamodb_staging" {
  name = var.role_name
  role = aws_iam_role.ec2_dynamodb_staging.name
}

# Least-privilege DynamoDB access — scoped to the two table ARNs and the
# users table's email-index GSI (needed by users.get_user_by_email). No
# dynamodb:* wildcard, no unscoped Resource = "*".
data "aws_iam_policy_document" "dynamodb_access" {
  statement {
    sid = "FarmsAndUsersTableCrud"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [
      var.farms_table_arn,
      var.users_table_arn,
      var.users_table_email_index_arn,
    ]
  }
}

resource "aws_iam_role_policy" "dynamodb_access" {
  name   = "dynamodb-access"
  role   = aws_iam_role.ec2_dynamodb_staging.id
  policy = data.aws_iam_policy_document.dynamodb_access.json
}

# Read-only access to the model artifacts bucket (backend/app/models.py's S3
# fallback path — s3:GetObject only, scoped to this bucket's objects).
data "aws_iam_policy_document" "s3_model_read" {
  statement {
    sid       = "ModelArtifactsReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${var.model_bucket_arn}/*"]
  }
}

resource "aws_iam_role_policy" "s3_model_read" {
  name   = "s3-model-read"
  role   = aws_iam_role.ec2_dynamodb_staging.id
  policy = data.aws_iam_policy_document.s3_model_read.json
}

# Read-only access to this project's own secrets only (GEE key, etc) — not
# secretsmanager:* and not Resource = "*".
data "aws_iam_policy_document" "secrets_read" {
  statement {
    sid       = "ProjectSecretsReadOnly"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }
}

resource "aws_iam_role_policy" "secrets_read" {
  name   = "secrets-read"
  role   = aws_iam_role.ec2_dynamodb_staging.id
  policy = data.aws_iam_policy_document.secrets_read.json
}

# ECR pull access so the instance can `docker compose pull` its own images.
# GetAuthorizationToken has no resource-level support in the IAM action
# (AWS requires Resource = "*" for it specifically); the actual image pull
# actions are scoped to just this project's two repo ARNs.
data "aws_iam_policy_document" "ecr_pull" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPullThisProjectsRepos"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = var.ecr_repository_arns
  }
}

resource "aws_iam_role_policy" "ecr_pull" {
  name   = "ecr-pull"
  role   = aws_iam_role.ec2_dynamodb_staging.id
  policy = data.aws_iam_policy_document.ecr_pull.json
}

# AWS-managed policies: SSM Session Manager (no SSH) and CloudWatch agent.
resource "aws_iam_role_policy_attachment" "ssm_managed_instance_core" {
  role       = aws_iam_role.ec2_dynamodb_staging.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.ec2_dynamodb_staging.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}
