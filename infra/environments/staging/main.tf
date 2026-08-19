data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

module "network" {
  source             = "../../modules/network"
  vpc_cidr_block     = var.vpc_cidr_block
  public_subnet_cidr = var.public_subnet_cidr
  availability_zone  = var.availability_zone
  name_prefix        = var.name_prefix
}

module "security_group" {
  source      = "../../modules/security_group"
  vpc_id      = module.network.vpc_id
  name_prefix = var.name_prefix
}

module "dynamodb" {
  source           = "../../modules/dynamodb"
  farms_table_name = var.farms_table_name
  users_table_name = var.users_table_name
}

module "ecr" {
  source      = "../../modules/ecr"
  name_prefix = var.name_prefix
}

module "secrets" {
  source      = "../../modules/secrets"
  name_prefix = var.name_prefix
}

module "iam" {
  source                      = "../../modules/iam"
  farms_table_arn             = module.dynamodb.farms_table_arn
  users_table_arn             = module.dynamodb.users_table_arn
  users_table_email_index_arn = module.dynamodb.users_table_email_index_arn
  model_bucket_arn            = "arn:aws:s3:::${var.model_bucket_name}"
  secret_arns                 = [module.secrets.gee_key_secret_arn]
  ecr_repository_arns         = values(module.ecr.repository_arns)
}

module "oidc" {
  source               = "../../modules/oidc"
  github_org           = var.github_org
  github_repo          = var.github_repo
  create_oidc_provider = var.create_oidc_provider
}

module "ec2" {
  source                = "../../modules/ec2"
  name_prefix           = var.name_prefix
  ami_id                = data.aws_ami.al2023.id
  instance_type         = var.instance_type
  subnet_id             = module.network.public_subnet_id
  security_group_id     = module.security_group.security_group_id
  instance_profile_name = module.iam.instance_profile_name
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    aws_region           = var.aws_region
    model_bucket_name    = var.model_bucket_name
    farms_table_name     = var.farms_table_name
    users_table_name     = var.users_table_name
    cognito_user_pool_id = var.cognito_user_pool_id
    cognito_client_id    = var.cognito_client_id
  })
}
