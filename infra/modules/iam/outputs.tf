output "role_name" {
  value = aws_iam_role.ec2_dynamodb_staging.name
}

output "role_arn" {
  value = aws_iam_role.ec2_dynamodb_staging.arn
}

output "instance_profile_name" {
  value = aws_iam_instance_profile.ec2_dynamodb_staging.name
}
