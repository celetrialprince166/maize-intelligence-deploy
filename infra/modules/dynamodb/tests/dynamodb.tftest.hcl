provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  farms_table_name = "maize-intelligence-farms"
  users_table_name = "maize-intelligence-users"
}

run "farms_table_uses_userid_farmid_composite_key" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.farms.hash_key == "userId" && aws_dynamodb_table.farms.range_key == "farmId"
    error_message = "Farms table key schema must match app/farms.py's Key={'userId':..., 'farmId':...}"
  }

  assert {
    condition     = aws_dynamodb_table.farms.billing_mode == "PAY_PER_REQUEST"
    error_message = "Staging should not require pre-sized provisioned capacity"
  }
}

run "users_table_has_email_index_gsi" {
  command = plan

  assert {
    condition     = length(aws_dynamodb_table.users.global_secondary_index) == 1
    error_message = "Users table must declare exactly the email-index GSI that app/users.py's get_user_by_email depends on"
  }

  assert {
    condition     = contains([for g in aws_dynamodb_table.users.global_secondary_index : g.name], "email-index")
    error_message = "GSI name must be exactly 'email-index' - this is a literal string in app/users.py's IndexName= argument"
  }

  assert {
    condition     = alltrue([for g in aws_dynamodb_table.users.global_secondary_index : g.projection_type == "ALL"])
    error_message = "get_user_by_email returns the full item from the GSI query, so projection must be ALL"
  }
}
