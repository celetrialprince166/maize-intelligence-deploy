provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

variables {
  vpc_cidr_block     = "10.60.0.0/16"
  public_subnet_cidr = "10.60.1.0/24"
  availability_zone  = "us-east-1a"
  name_prefix        = "maize-staging"
}

run "creates_its_own_vpc_not_relying_on_an_external_one" {
  command = plan

  assert {
    condition     = aws_vpc.this.cidr_block == var.vpc_cidr_block
    error_message = "VPC CIDR must match the input variable, not a hardcoded value"
  }
}

run "creates_exactly_one_public_subnet_with_auto_assign_ip" {
  command = plan

  assert {
    condition     = aws_subnet.public.map_public_ip_on_launch == true
    error_message = "Public subnet must auto-assign public IPs"
  }

  assert {
    condition     = aws_subnet.public.cidr_block == var.public_subnet_cidr
    error_message = "Subnet CIDR must match the input variable, not a hardcoded value"
  }
}

run "route_table_routes_all_traffic_through_the_igw" {
  command = plan

  assert {
    condition     = length(aws_route_table.public.route) == 1
    error_message = "Exactly one route is expected (default route to the IGW)"
  }

  assert {
    condition     = contains([for r in aws_route_table.public.route : r.cidr_block], "0.0.0.0/0")
    error_message = "Default route must target 0.0.0.0/0"
  }
}
