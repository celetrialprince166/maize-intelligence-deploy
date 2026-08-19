output "public_ip" {
  description = "EC2 public IP (Elastic IP) — the deliverable for the assessment submission."
  value       = module.ec2.public_ip
}

output "instance_id" {
  value = module.ec2.instance_id
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "iam_role_arn" {
  value = module.iam.role_arn
}

output "iam_role_name" {
  value = module.iam.role_name
}

output "github_actions_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN GitHub Actions secret/variable."
  value       = module.oidc.deploy_role_arn
}

output "gee_key_secret_name" {
  description = "Populate this secret's value out-of-band via `aws secretsmanager put-secret-value` — never via Terraform."
  value       = module.secrets.gee_key_secret_name
}

output "farms_table_name" {
  value = var.farms_table_name
}

output "users_table_name" {
  value = var.users_table_name
}
