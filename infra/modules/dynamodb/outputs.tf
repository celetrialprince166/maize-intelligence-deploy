output "farms_table_arn" {
  value = aws_dynamodb_table.farms.arn
}

output "users_table_arn" {
  value = aws_dynamodb_table.users.arn
}

output "users_table_email_index_arn" {
  value = "${aws_dynamodb_table.users.arn}/index/email-index"
}
