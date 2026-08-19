resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = var.instance_profile_name
  user_data              = var.user_data
  # AWS doesn't support live-applying user_data to a running instance —
  # without this, editing user_data.sh would silently update Terraform
  # state without ever reaching the real box. Replacing is fine here: the
  # EIP below re-attaches to whatever instance ID exists, so the public IP
  # this project promises stays stable across a user_data-driven replace.
  user_data_replace_on_change = true
  # No key_name — no SSH keypair is ever attached. Admin access is via SSM
  # Session Manager only (the instance profile carries
  # AmazonSSMManagedInstanceCore).

  metadata_options {
    http_tokens   = "required" # IMDSv2 enforced
    http_endpoint = "enabled"
  }

  root_block_device {
    encrypted   = true
    volume_size = 30 # AL2023 AMI's snapshot requires >= 30GB
    volume_type = "gp3"
  }

  tags = {
    Name = "${var.name_prefix}-app"
  }
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name = "${var.name_prefix}-app-eip"
  }
}
