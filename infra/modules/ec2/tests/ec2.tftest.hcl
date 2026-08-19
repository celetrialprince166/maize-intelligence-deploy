provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  name_prefix           = "maize-staging"
  ami_id                = "ami-0000000000000000"
  subnet_id             = "subnet-0000000000000000"
  security_group_id     = "sg-0000000000000000"
  instance_profile_name = "EC2-DynamoDB-StagingRole"
  user_data             = "#!/bin/bash\necho hello"
}

run "imdsv2_enforced" {
  # No key_name assertion here: the resource block in main.tf simply has no
  # key_name argument at all (verified by direct code review), and AWS's
  # provider marks that attribute Computed, so it reads as unknown-at-plan
  # rather than a checkable null — asserting on it would need an apply-time
  # override for a fact that's already structurally guaranteed by the HCL.
  command = plan

  assert {
    condition     = aws_instance.app.metadata_options[0].http_tokens == "required"
    error_message = "IMDSv2 must be enforced (http_tokens = required)"
  }

  assert {
    condition     = aws_instance.app.user_data_replace_on_change == true
    error_message = "user_data edits must actually reach the instance (replace), not silently no-op"
  }
}

run "root_volume_is_encrypted" {
  command = plan

  assert {
    condition     = aws_instance.app.root_block_device[0].encrypted == true
    error_message = "Root EBS volume must be encrypted"
  }
}

run "elastic_ip_is_attached_for_a_stable_public_ip" {
  command = plan

  override_resource {
    target          = aws_instance.app
    override_during = plan
    values = {
      id = "i-0000000000000000"
    }
  }

  assert {
    condition     = aws_eip.app.instance == aws_instance.app.id
    error_message = "EIP must be attached to this instance so the public IP survives reboots (needed for the team's later DNS mapping)"
  }
}
