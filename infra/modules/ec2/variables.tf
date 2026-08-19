variable "name_prefix" {
  type = string
}

variable "ami_id" {
  description = "Amazon Linux 2023 x86_64 AMI ID."
  type        = string
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "subnet_id" {
  type = string
}

variable "security_group_id" {
  type = string
}

variable "instance_profile_name" {
  type = string
}

variable "user_data" {
  description = "Cloud-init/user-data script (installs Docker, writes the deploy script)."
  type        = string
}
