aws_region         = "us-east-1"
name_prefix        = "maize-staging"
vpc_cidr_block     = "10.60.0.0/16"
public_subnet_cidr = "10.60.1.0/24"
availability_zone  = "us-east-1a"
github_org         = "celetrialprince166"
github_repo        = "maize-intelligence-deploy"
instance_type      = "t3.small"
# A GitHub OIDC provider for token.actions.githubusercontent.com already
# existed in this AWS account before this project touched it (confirmed via
# `aws iam list-open-id-connect-providers`) — reference it, don't recreate it.
create_oidc_provider = false
