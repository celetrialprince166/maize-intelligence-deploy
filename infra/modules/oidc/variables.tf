variable "github_org" {
  description = "GitHub org/user that owns the repo (e.g. celetrialprince166)."
  type        = string
}

variable "github_repo" {
  description = "Repo name only, no org prefix."
  type        = string
}

variable "role_name" {
  type    = string
  default = "maize-github-actions-deploy"
}

variable "create_oidc_provider" {
  description = "False if a GitHub OIDC provider already exists in this account (only one is allowed per account)."
  type        = bool
  default     = true
}
