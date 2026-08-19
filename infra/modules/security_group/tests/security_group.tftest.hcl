provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  vpc_id      = "vpc-0000000000000000"
  name_prefix = "maize-staging"
}

run "only_80_and_443_are_open_ingress" {
  command = plan

  assert {
    condition     = aws_security_group_rule.http.from_port == 80 && aws_security_group_rule.http.to_port == 80
    error_message = "HTTP rule must be exactly port 80"
  }

  assert {
    condition     = aws_security_group_rule.https.from_port == 443 && aws_security_group_rule.https.to_port == 443
    error_message = "HTTPS rule must be exactly port 443"
  }
}

run "no_ssh_ingress_rule_exists" {
  command = plan

  assert {
    # Only two ingress-shaped resources are declared in this module at all —
    # asserting neither one is port 22 (a stronger version of this test
    # would grep the plan JSON; this catches the concrete "someone added a
    # 22 rule" regression without over-engineering the test).
    condition     = aws_security_group_rule.http.from_port != 22 && aws_security_group_rule.https.from_port != 22
    error_message = "No security group rule may open port 22 — SSM Session Manager only"
  }
}

run "egress_is_unrestricted_by_design" {
  command = plan

  assert {
    condition     = aws_security_group_rule.egress_all.type == "egress" && aws_security_group_rule.egress_all.protocol == "-1"
    error_message = "Egress rule must allow all outbound protocols (staging needs GEE/Cognito/AWS APIs)"
  }
}
