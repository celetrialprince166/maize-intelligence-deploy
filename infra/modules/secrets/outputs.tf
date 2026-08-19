output "gee_key_secret_arn" {
  value = aws_secretsmanager_secret.gee_key.arn
}

output "gee_key_secret_name" {
  value = aws_secretsmanager_secret.gee_key.name
}
