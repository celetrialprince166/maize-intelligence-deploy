locals {
  repo_names = ["backend", "frontend"]
}

resource "aws_ecr_repository" "repo" {
  for_each = toset(local.repo_names)

  name                 = "${var.name_prefix}-${each.key}"
  image_tag_mutability = "IMMUTABLE"

  # Without this, `terraform destroy` fails on any repo that still holds
  # images (RepositoryNotEmptyException) and the teardown has to be finished
  # by hand. Safe for a staging registry whose images are all rebuildable
  # from a tagged commit; for production, leave it false so images can't be
  # removed by an accidental destroy.
  force_delete = var.force_delete

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "expire_untagged" {
  for_each   = aws_ecr_repository.repo
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}
