# Metadata-only secret resources. The actual secret VALUE is never set here
# via a aws_secretsmanager_secret_version with a literal string — that would
# land the plaintext secret in Terraform state. The value is populated
# out-of-band via `aws secretsmanager put-secret-value` after apply.

resource "aws_secretsmanager_secret" "gee_key" {
  name        = "${var.name_prefix}/gee-service-account-key"
  description = "Google Earth Engine service account JSON key (value set out-of-band, never via Terraform)"
}
