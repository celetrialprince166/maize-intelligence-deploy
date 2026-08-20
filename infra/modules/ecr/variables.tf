variable "name_prefix" {
  type = string
}

variable "force_delete" {
  description = "Allow `terraform destroy` to delete repositories that still contain images. True is appropriate for staging (images are rebuildable from a tagged commit); keep false in production so an accidental destroy cannot discard images."
  type        = bool
  default     = false
}
