data "tls_certificate" "github" {
  count = var.create_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# Trust policy is scoped to THIS repo only (not repo:* across the account) —
# any GitHub Actions run outside celetrialprince166/<github_repo> cannot
# assume this role, no matter what workflow it runs.
data "aws_iam_policy_document" "github_actions_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # GitHub's OIDC sub claim now embeds immutable numeric org/repo IDs
      # (e.g. repo:org@12345/repo@67890:ref:...), confirmed via CloudTrail
      # on a real AssumeRoleWithWebIdentity rejection — the "@<id>" wildcards
      # below still scope this to exactly this org+repo, just tolerant of
      # the ID suffix GitHub inserts.
      values = ["repo:${var.github_org}@*/${var.github_repo}@*:*"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_trust.json
}

# PowerUserAccess covers ECR/EC2/DynamoDB/S3/SecretsManager/SSM for terraform
# apply and deploys, but deliberately excludes IAM — a narrow inline policy
# below grants only the specific IAM actions needed on this project's own
# named resources (the EC2-DynamoDB-StagingRole and its instance profile),
# not iam:* account-wide.
resource "aws_iam_role_policy_attachment" "power_user" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "scoped_iam_management" {
  statement {
    sid = "ManageTheAppEc2Role"
    actions = [
      "iam:CreateRole",
      "iam:GetRole",
      "iam:DeleteRole",
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:CreateInstanceProfile",
      "iam:DeleteInstanceProfile",
      "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:TagRole",
      "iam:PassRole",
    ]
    resources = [
      "arn:aws:iam::*:role/EC2-DynamoDB-StagingRole",
      "arn:aws:iam::*:instance-profile/EC2-DynamoDB-StagingRole",
    ]
  }

  # PowerUserAccess deliberately excludes all of IAM, so without this the
  # data "aws_iam_openid_connect_provider" lookup (used when
  # create_oidc_provider = false) can't even read the existing provider —
  # a real 403 hit running terraform plan in CI. Both actions require
  # Resource = "*" per AWS (OIDC provider IAM actions aren't resource-level
  # scopable), but they're read-only.
  statement {
    sid = "ReadOidcProviderForDataLookup"
    actions = [
      "iam:ListOpenIDConnectProviders",
      "iam:GetOpenIDConnectProvider",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "scoped_iam_management" {
  name   = "scoped-iam-management"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.scoped_iam_management.json
}

# Separate from scoped_iam_management above so that policy's test can
# assert every Resource is scoped to EC2-DynamoDB-StagingRole without this
# self-referencing ARN (which is unknown at plan time for a fresh test run,
# unlike in the real environment where the role already exists) muddying
# that assertion. PowerUserAccess excludes IAM entirely, so without this
# Terraform can't even refresh its own role/policy/attachment in state.
resource "aws_iam_role_policy" "self_management" {
  name = "self-management"
  role = aws_iam_role.github_actions_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ManageSelf"
      Effect = "Allow"
      Action = [
        "iam:GetRole",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:GetRolePolicy",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:TagRole",
      ]
      Resource = aws_iam_role.github_actions_deploy.arn
    }]
  })
}
