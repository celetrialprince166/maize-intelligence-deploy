provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  name_prefix = "maize-staging"
}

run "secret_is_metadata_only_no_value_resource" {
  command = plan

  assert {
    condition     = aws_secretsmanager_secret.gee_key.name == "maize-staging/gee-service-account-key"
    error_message = "Secret name must be derived from name_prefix, not a literal"
  }
}
