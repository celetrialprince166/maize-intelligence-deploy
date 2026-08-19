# aws_iam_policy_document is a pure local computation (no API call) so we
# use the real provider (with throwaway creds) rather than mock_provider —
# mocking the whole provider would also fake away this data source's JSON
# computation itself. override_resource/override_data give the two values
# that would otherwise stay unknown until apply (the OIDC provider's ARN,
# and the TLS cert fingerprint) a fixed value so the plan is fully known.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  github_org           = "celetrialprince166"
  github_repo          = "maize-intelligence-deploy"
  create_oidc_provider = true
}

run "trust_policy_is_scoped_to_this_repo_only" {
  command = plan

  override_data {
    target          = data.tls_certificate.github[0]
    override_during = plan
    values = {
      certificates = [{ sha1_fingerprint = "0000000000000000000000000000000000000000" }]
    }
  }

  override_resource {
    target          = aws_iam_openid_connect_provider.github[0]
    override_during = plan
    values = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  assert {
    condition     = jsondecode(data.aws_iam_policy_document.github_actions_trust.json).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] == "repo:celetrialprince166/maize-intelligence-deploy:*"
    error_message = "Trust policy sub condition must be scoped to this exact repo, not a wildcard across all repos"
  }

  assert {
    condition     = jsondecode(data.aws_iam_policy_document.github_actions_trust.json).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] != "repo:*"
    error_message = "Trust policy must never accept repo:* (any repo in the account)"
  }
}

run "iam_management_is_scoped_to_the_named_role_not_wildcard" {
  command = plan

  override_data {
    target          = data.tls_certificate.github[0]
    override_during = plan
    values = {
      certificates = [{ sha1_fingerprint = "0000000000000000000000000000000000000000" }]
    }
  }

  override_resource {
    target          = aws_iam_openid_connect_provider.github[0]
    override_during = plan
    values = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  assert {
    condition = alltrue([
      for r in jsondecode(data.aws_iam_policy_document.scoped_iam_management.json).Statement[0].Resource :
      strcontains(r, "EC2-DynamoDB-StagingRole")
    ])
    error_message = "The deploy role's own IAM permissions must be scoped to the EC2-DynamoDB-StagingRole resources only, not iam:* / Resource=*"
  }
}
