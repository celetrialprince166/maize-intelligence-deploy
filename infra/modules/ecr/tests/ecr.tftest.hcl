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

run "creates_exactly_backend_and_frontend_repos" {
  command = plan

  assert {
    condition     = length(aws_ecr_repository.repo) == 2
    error_message = "Expected exactly two repos: backend and frontend"
  }
}

run "images_are_scanned_and_immutable" {
  command = plan

  assert {
    condition     = alltrue([for r in aws_ecr_repository.repo : r.image_tag_mutability == "IMMUTABLE"])
    error_message = "SHA-tagged images should never be overwritable"
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.repo : r.image_scanning_configuration[0].scan_on_push == true])
    error_message = "Scan-on-push must be enabled for both repos"
  }
}

run "lifecycle_policy_expires_untagged_images" {
  command = plan

  assert {
    condition     = length(aws_ecr_lifecycle_policy.expire_untagged) == 2
    error_message = "Both repos must have an untagged-image expiry policy to avoid unbounded accumulation"
  }
}
