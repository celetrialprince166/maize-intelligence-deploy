variable "role_name" {
  description = "Exact IAM role name required by the assessment scope."
  type        = string
  default     = "EC2-DynamoDB-StagingRole"
}

variable "farms_table_arn" {
  type = string
}

variable "users_table_arn" {
  type = string
}

variable "users_table_email_index_arn" {
  type = string
}

variable "model_bucket_arn" {
  type = string
}

variable "secret_arns" {
  description = "ARNs of Secrets Manager secrets this role may read (GEE key, etc)."
  type        = list(string)
}

variable "ecr_repository_arns" {
  description = "ARNs of the ECR repos this instance must pull images from."
  type        = list(string)
}
