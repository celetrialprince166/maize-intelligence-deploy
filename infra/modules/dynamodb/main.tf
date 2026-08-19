# PAY_PER_REQUEST — staging traffic doesn't warrant provisioned-capacity
# planning; this avoids over-engineering capacity units nobody has sized.

resource "aws_dynamodb_table" "farms" {
  name         = var.farms_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "farmId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "farmId"
    type = "S"
  }

  # No GSI: farms.py only ever queries by the userId partition key today.
  # The docstring-mentioned "userId-status-index" is unused dead code —
  # add it here only if/when list_farms actually queries it.

  tags = {
    Name = var.farms_table_name
  }
}

resource "aws_dynamodb_table" "users" {
  name         = var.users_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  # get_user_by_email (app/users.py) queries this GSI and returns the full
  # item as the user's profile, so the projection must be ALL.
  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  tags = {
    Name = var.users_table_name
  }
}
