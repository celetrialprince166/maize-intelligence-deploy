# Values here must match infra/bootstrap's outputs exactly (state_bucket,
# lock_table) — that bootstrap config is applied once, by hand, before this.
terraform {
  backend "s3" {
    bucket         = "maize-tfstate-183631301567-us-east-1"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "maize-tfstate-lock"
    encrypt        = true
  }
}
