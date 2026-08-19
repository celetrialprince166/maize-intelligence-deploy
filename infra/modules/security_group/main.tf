# Ingress: only 80/tcp and 443/tcp (80 exists solely to redirect to 443).
# No port 22 — admin access is via SSM Session Manager, not SSH.
resource "aws_security_group" "web" {
  name_prefix = "${var.name_prefix}-web-"
  description = "Public web ingress for the maize-intelligence EC2 instance"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${var.name_prefix}-web"
  }
}

resource "aws_security_group_rule" "http" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web.id
  description       = "HTTP - redirects to HTTPS"
}

resource "aws_security_group_rule" "https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web.id
  description       = "HTTPS (self-signed cert until DNS is mapped)"
}

resource "aws_security_group_rule" "egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web.id
  description       = "Outbound to ECR/S3/DynamoDB/Secrets Manager/Cognito/GEE/Open-Meteo/SoilGrids"
}
