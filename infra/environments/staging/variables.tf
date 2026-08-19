variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  type    = string
  default = "maize-staging"
}

variable "vpc_cidr_block" {
  description = "This project's own dedicated VPC — not the account's shared default VPC (unreliable in this lab account)."
  type        = string
  default     = "10.60.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.60.1.0/24"
}

variable "create_oidc_provider" {
  description = "False if a GitHub OIDC provider already exists in this AWS account (only one is allowed per account)."
  type        = bool
  default     = true
}

variable "availability_zone" {
  type    = string
  default = "us-east-1a"
}

variable "github_org" {
  type = string
}

variable "github_repo" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "farms_table_name" {
  type    = string
  default = "maize-intelligence-farms"
}

variable "users_table_name" {
  type    = string
  default = "maize-intelligence-users"
}

variable "model_bucket_name" {
  type    = string
  default = "maize-intelligence-models-104702104957"
}

variable "cognito_user_pool_id" {
  type    = string
  default = "us-east-1_vfe6JbU6G"
}

variable "cognito_client_id" {
  type    = string
  default = "744ah7v7iddsshrm9mm02bnd9i"
}
