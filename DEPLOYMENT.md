# Maize Intelligence — Staging Deployment

## EC2 public IP address

**3.233.202.32** (Elastic IP `eipalloc-0396d44bfccab2c6d` — stable across instance
replacements; BigDataGhana can map DNS to this address at any time).

## Website URL served from the EC2 public IP

**https://3.233.202.32/** (HTTP on port 80 redirects to HTTPS on 443).

The certificate is self-signed (browsers will show a warning) — there is no
domain yet to issue a CA-signed certificate against. See *Security
recommendations* below for the upgrade path once DNS is mapped.

API health check: `https://3.233.202.32/health` (proxied through nginx to
the backend).

## Summary of the deployment approach

A single Amazon Linux 2023 EC2 instance runs two Docker containers behind
an nginx reverse proxy:

- **frontend** container: nginx serving the built React SPA on 80/443
  (only container with a host-published port)
- **backend** container: FastAPI/uvicorn on an internal-only Docker network
  port (never exposed to the host or the internet directly)

All infrastructure is defined in Terraform (`infra/`), built into Docker
images by GitHub Actions, pushed to two private ECR repositories, and
deployed to the instance via `aws ssm send-command` — there is no SSH key
anywhere in this deployment.

## Key technical decisions

| Decision | Why |
|---|---|
| Single EC2 + Docker Compose, no ALB/ASG | The instance's own public IP must be the thing DNS eventually points at — an ALB would front it with a different address. |
| Dedicated VPC (`10.60.0.0/16`), not the account's default VPC | This is a shared, multi-tenant lab AWS account. The "default" VPC was found to not exist at all when Terraform first ran (confirmed via `aws ec2 describe-vpcs` before and after — it had been deleted/recreated by other lab activity between checks). Depending on it was unreliable, so the network module creates its own VPC, subnet, IGW, and route table. |
| Elastic IP attached to the instance | The public IP must survive instance replacement (e.g. from a `user_data` change) so the team's future DNS mapping stays valid — `user_data_replace_on_change` forces a replace when the boot script changes, but the EIP re-attaches to whatever instance exists. |
| No SSH keypair, ever | Explicit requirement. All administrative access is via **AWS Systems Manager Session Manager** (IAM-authenticated, session-logged, no inbound port needed) and `aws ssm send-command` for deploys. |
| Security group: 80 + 443 inbound only, all egress | "No unnecessary ports." Verified live via `aws ec2 describe-security-groups` — nothing else, including port 22, is open. |
| IMDSv2 enforced, encrypted 30GB gp3 root volume | Baseline EC2 hardening. Root volume is 30GB, not the originally-planned 20GB — the AL2023 AMI's backing snapshot requires ≥30GB (a real `RunInstances` failure caught this). |
| Backend/frontend on a private Docker bridge network; only nginx's ports published | The backend is architecturally unreachable except through the reverse proxy. |
| GEE key fetched from Secrets Manager at deploy time, bind-mounted `:ro` into the backend container | Never baked into an image, never committed. Populated via `aws secretsmanager put-secret-value`, never via Terraform (the `aws_secretsmanager_secret` resource is metadata-only — no `_version` resource with a literal value exists anywhere in the Terraform, which would otherwise land the plaintext key in state). |
| GitHub Actions → AWS via OIDC federation, no static AWS keys | The deploy role's trust policy is scoped to `repo:celetrialprince166@*/maize-intelligence-deploy@*:*` — note the `@<numeric-id>` wildcards, required because GitHub's OIDC `sub` claim embeds immutable org/repo IDs (discovered via a real rejected `AssumeRoleWithWebIdentity` call, confirmed in CloudTrail). |
| `terraform apply` gated behind a GitHub Environment (`infra-approval`) with a required reviewer; image build/deploy is not gated | Infra changes get a human look; routine app deploys are fully automated. |
| Images tagged by git SHA, immutable ECR repos | No `:latest` reliance — every deploy is traceable to an exact commit; SHA tags can't be overwritten. |
| Terraform organized as 8 independent modules, each with its own `terraform test` suite | DRY, and every module's behavior (least-privilege IAM, no port 22, IMDSv2, GSI correctness) is asserted, not just visually reviewed. |
| No hardcoded environment-specific values anywhere | `backend/app/config.py` requires every region/table/Cognito/CORS/GEE-key-path value as an env var with **no fallback default** — it raises immediately at import if one is missing, rather than silently defaulting to a value that happened to be correct in one environment. |

## Documentation of deployment steps taken

1. **App code hardening** (test-first): rewrote `config.py` to require env
   vars with no hardcoded fallbacks; fixed `farms.py`/`users.py` to source
   region/table names from `config.py` instead of independently hardcoded
   literals; fixed `auth_middleware.py` to stop defaulting to a stale
   Cognito pool; fixed CORS to read from config instead of `["*"]`. 26
   pytest tests (`backend/tests/`), all passing.
2. **Containerization**: rewrote `backend/Dockerfile` for a long-running
   uvicorn server (the original was Lambda-shaped and baked the GEE key
   into the image — both fixed); added a multi-stage `frontend/Dockerfile`
   with nginx + self-signed TLS; generated the missing
   `frontend/package-lock.json`.
3. **Terraform bootstrap**: created the S3 state bucket + DynamoDB lock
   table (`infra/bootstrap/`), applied once by hand.
4. **Core infra apply**: network, security group, IAM role
   (`EC2-DynamoDB-StagingRole`), DynamoDB tables, ECR repos, Secrets
   Manager secret shell, GitHub OIDC deploy role.
5. **Secret population**: loaded the GEE service-account key into Secrets
   Manager directly via CLI — never through Terraform or git.
6. **EC2 launch**: instance + Elastic IP, verified reachable via SSM with
   **zero SSH key ever created**.
7. **First manual deploy**: built and pushed both images once by hand to
   validate the full path end-to-end before wiring CI/CD to it.
8. **GitHub Actions wiring**: pushed the repo to
   `celetrialprince166/maize-intelligence-deploy` (public), added
   `ci.yml`/`cd.yml`, configured the `infra-approval` GitHub Environment
   with a required reviewer, set the required repo variables
   (`AWS_DEPLOY_ROLE_ARN`, `ECR_REGISTRY`, `COGNITO_USER_POOL_ID`,
   `COGNITO_CLIENT_ID`, `GEE_SECRET_NAME`).
9. **Pipeline validation**: pushed real commits and watched the pipeline go
   red and back to green multiple times on genuine bugs (see *Issues
   encountered* below) — this was deliberate, not incidental: proving the
   gates actually catch things was part of the verification, not a
   shortcut skipped.
10. **End-to-end verification**: confirmed `/health` (200), the frontend
    (200), and a full `/analyze` call returning a real maize classification
    and yield estimate from live Sentinel-2/GEE data.

## Explanation of key technical decisions

See the table above — each row states the decision and the reasoning
together, rather than repeating it here.

## Issues encountered and how they were resolved

| Issue | Resolution |
|---|---|
| AL2023 AMI's snapshot required ≥30GB but the module requested 20GB | `RunInstances` failed with a clear error; bumped `root_block_device.volume_size` to 30. |
| The account's default VPC didn't exist at apply time | Network module now creates its own dedicated VPC instead of depending on an externally supplied ID. |
| A GitHub OIDC provider for `token.actions.githubusercontent.com` already existed account-wide | Set `create_oidc_provider = false`; the module references it via a data source instead of trying (and failing, with a 409) to recreate it. |
| GitHub's OIDC `sub` claim rejected the trust policy | CloudTrail showed the real claim includes immutable numeric org/repo IDs (`repo:org@12345/repo@67890:...`) not accounted for in the original pattern; fixed the `StringLike` condition to tolerate them. |
| Deploy role couldn't read the OIDC provider or even its own IAM role | `PowerUserAccess` deliberately excludes all of IAM; added two narrow, read/self-scoped statements rather than widening to `iam:*`. |
| Mounting a named Docker volume directly onto `prediction_log.jsonl` failed (`source ... is not directory`) | Dropped the volume — this debug log is now ephemeral across container restarts, which is an accepted limitation, not a broken workaround. |
| `user_data` changes silently didn't reach the running instance | AWS doesn't apply `user_data` edits live; added `user_data_replace_on_change = true` so Terraform properly replaces the instance (the EIP re-attaches, so the public IP is unaffected). |
| A fragile unquoted heredoc in the CI deploy script corrupted the remote shell command (`set -euo pipefailnaws: invalid option name`) | Rewrote using a quoted heredoc + placeholder substitution + Python JSON-encoding — the same pattern already proven correct in the manual first deploy. |
| `/analyze` returned `Permission denied` reading the mounted GEE key | The key file was root-owned `600`; the backend container runs as a non-root user and can't read a bind-mounted 600 file it doesn't own. Changed to `644`. |
| A hardcoded Mapbox demo token in the frontend source was caught by GitHub push protection *and* a local gitleaks scan | Removed the literal entirely in favor of an optional `VITE_MAPBOX_TOKEN` build arg — consistent with the "no hardcoded values" rule applied everywhere else in this project. |
| nginx would have passed a raw backend 500/traceback straight to the browser | Added `proxy_intercept_errors` + a generic JSON error page, scoped to 5xx only so real FastAPI 4xx error bodies still reach the frontend. |

## Security recommendations for improving the deployment

- **Access control**: The `EC2-DynamoDB-StagingRole` and the GitHub Actions
  deploy role are both already scoped to least privilege (verified: no
  `dynamodb:*`, `s3:*`, or `secretsmanager:*` wildcards; ECR pull is scoped
  to the two project repos). Next step once real users exist: move beyond
  the account owner as the sole `infra-approval` reviewer to a small,
  named group.
- **Network security**: Egress is currently unrestricted (needed for
  GEE/Cognito/Open-Meteo/SoilGrids/AWS API calls to a mix of hosts).
  Tightening this to specific destinations, or routing AWS API calls
  through VPC endpoints (S3, DynamoDB, Secrets Manager, ECR), would remove
  the need for broad internet egress entirely. Ingress should be narrowed
  from `0.0.0.0/0` to the team's known IP ranges once those are known, and
  a real TLS certificate (ACM + a load balancer, or Let's Encrypt directly
  on the instance) should replace the self-signed one as soon as DNS is
  mapped.
- **Secrets management**: The GEE key currently deployed is the one shared
  during this assessment and should be **rotated** now that the engagement
  is ending (the user has already indicated they'll do this). Going
  forward, consider enabling automatic rotation on the Secrets Manager
  secret and scoping the GEE service account's GCP IAM permissions to only
  the Earth Engine assets this project actually reads.
- **Monitoring**: CloudWatch Agent is already installed via the IAM
  role's managed policy but not yet configured to ship logs/metrics —
  wiring up the agent config, plus CloudWatch alarms on CPU/disk/health
  check failures, and enabling CloudTrail (if not already on for the
  account) would close the observability gap.
- **Hardening**: Enable AWS Systems Manager Patch Manager (or
  `dnf-automatic`) for OS patching, since there's no SSH path to patch
  manually; consider a per-account CMK for EBS encryption instead of the
  default `aws/ebs` key; move `prediction_log.jsonl` off local ephemeral
  disk (e.g. to CloudWatch Logs or DynamoDB) if that data needs to survive
  restarts.

## Proposed CI/CD approach for future automated releases

This is already built and running, not just proposed — see
`.github/workflows/ci.yml` and `.github/workflows/cd.yml`.

**`ci.yml`** (every push/PR): gitleaks secret scan → backend `pytest` →
frontend `npm run build` → `terraform fmt`/`validate`/`test` across all 8
modules. All required; none are decorative (verified: no
`continue-on-error`, an explicit deploy-status check rather than relying on
a wait-timeout).

**`cd.yml`** (triggered by `ci.yml`'s completion, not by push directly —
this is the pattern GitHub recommends so a secrets-bearing deploy workflow
never runs against untrusted fork PR code):
1. OIDC-authenticate to AWS (no stored keys)
2. `terraform apply`, gated behind the `infra-approval` GitHub Environment
   (a human must approve infra changes)
3. Build both images, push to ECR tagged by git SHA
4. `aws ssm send-command` to the tagged instance: fetch the current GEE
   secret, log in to ECR, `docker compose pull && up -d` — no SSH at any
   point

**Recommended next steps for this pipeline**, in priority order:
1. Add a staging→production promotion step once a second environment
   exists (currently there's only `staging`).
2. Add automated rollback: keep the previous image tag and have the deploy
   step re-point to it if the post-deploy health check fails.
3. Add `checkov`/`tflint` as an explicit CI job (the terraform-aws-architect
   review that gated this project's infra used them ad hoc; wiring them
   into `ci.yml` makes that check continuous rather than one-off).
4. Consider Terraform Cloud/Atlantis for PR-based plan output instead of
   only running `terraform apply` inside GitHub Actions, to get a visible
   plan diff in the PR before the `infra-approval` gate.
