variable "vpc_cidr_block" {
  description = "This project gets its own small VPC — the account's shared default VPC is unreliable (observed deleted/recreated between sessions in this lab account)."
  type        = string
}

variable "public_subnet_cidr" {
  description = "CIDR block for the new public subnet."
  type        = string
}

variable "availability_zone" {
  description = "AZ for the public subnet."
  type        = string
}

variable "name_prefix" {
  description = "Prefix applied to resource Name tags."
  type        = string
}
