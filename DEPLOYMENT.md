# Maize Intelligence — Staging Deployment

Submission for the BigDataGhana Cloud Engineering practical assessment.

## EC2 public IP address

**3.235.89.135**

Instance `i-0b9eca46089b096ba` — t3.small, Amazon Linux 2023, in the
assessment account **711726112778** (`us-east-1`).

This is an auto-assigned public IP, not an Elastic IP: `ec2:AllocateAddress`
is not available to this account's user. It is stable while the instance
runs, but would change if the instance were stopped and started. If DNS is
going to be mapped to it, attaching an Elastic IP first is worth doing — see
*Security recommendations*.

## Website URL served from the EC2 public IP

**https://3.235.89.135/**

- `http://3.235.89.135/` returns a 301 redirect to HTTPS.
- The TLS certificate is **self-signed**, so browsers show a warning that
  must be clicked through. There is no domain yet to issue a CA-signed
  certificate against; the upgrade path is in *Security recommendations*.
- API health check: **https://3.235.89.135/health**

## Summary of the deployment approach

A single EC2 instance runs two Docker containers on a private Docker bridge
network:

- **frontend** — nginx serving the built React SPA, and the only container
  with host-published ports (80 and 443). It reverse-proxies `/api/*` to the
  backend.
- **backend** — FastAPI/uvicorn on port 8000, reachable only from inside the
  Docker network. It is never published to the host or the internet.

The instance carries the **`EC2-DynamoDB-StagingRole`** instance profile and
obtains all AWS credentials from the instance metadata service. There are no
AWS access keys anywhere on the instance, in the images, or in this
repository.

Both images are built on the instance itself from this public repository, so
the deployment needs no container registry and no credentials to pull from
one.

## Documentation of the deployment steps taken

1. Confirmed the target account already contained the DynamoDB tables the
   application expects — `maize-intelligence-farms` (PK `userId`, SK
   `farmId`) and `maize-intelligence-users` (PK `userId`) — matching the
   application's data access code exactly, so no schema work was needed.
2. Created an SSH key pair (`maize-staging-admin`) for administrative access.
3. Launched **one** EC2 instance via the console:
   - Amazon Linux 2023, t3.small, 30 GiB gp3 root volume
   - IAM instance profile: `EC2-DynamoDB-StagingRole`
   - Security group: HTTP (80) and HTTPS (443) from anywhere; SSH (22)
     restricted to the deploying workstation's IP only
   - IMDSv2 required (console default on this AMI)
4. Ran `ops/bootstrap-ec2.sh` on the instance over SSH. It adds swap,
   installs Docker + Compose + Buildx, clones this repository, writes a
   non-secret `.env`, builds both images, and starts the stack.
5. Copied the Google Earth Engine service-account key to
   `/opt/gee-key.json` over SSH (mode 644, bind-mounted read-only into the
   backend container) and restarted the backend.
6. Verified the deployment end to end (below).

### Verification performed

| Check | Result |
|---|---|
| `http://3.235.89.135/` | 301 redirect to HTTPS |
| `https://3.235.89.135/health` | `{"status":"ok","service":"maize-intelligence"}` |
| `https://3.235.89.135/` | HTTP 200, SPA served |
| `POST /api/analyze` with a Northern Ghana polygon | Real result from live Sentinel-2 imagery: `classification: maize`, `confidence: 0.618`, `yield_mt_ha: 2.049`, plus NDVI/EVI/NDMI time series |
| Instance identity | `arn:aws:sts::711726112778:assumed-role/EC2-DynamoDB-StagingRole/i-0b9eca46089b096ba` |
| DynamoDB via the role (AWS CLI on the instance) | `PutItem` → `Query` (read back) → `DeleteItem` all succeeded, test item removed |
| Cognito sign-in | `USER_PASSWORD_AUTH` with the supplied `admin@maizeintelligence.com` credentials returned a valid ID token |
| **Application** → DynamoDB via the role | `POST /api/farms/` created a record (server-computed area 121.56 ha), `GET /api/farms/` read it back, `DELETE /api/farms/{id}` removed it — proving the running app, not just the CLI, reaches DynamoDB with role-derived credentials |
| Credentials on the instance | No `~/.aws`; no `AKIA…` string anywhere in the app tree or key file |
| Host listening ports | 80, 443 (published by nginx) and 22 (SSH) only — backend 8000 is internal to the Docker network |

## Explanation of key technical decisions

| Decision | Why |
|---|---|
| Single EC2 instance, Docker Compose, no load balancer | The brief requires exactly one instance and the app served from its public IP. A load balancer would front it with its own address. |
| Images built on the instance from the public repo | This account cannot push to ECR, and building locally removes any need for registry credentials on the box. Trade-off: a ~10 minute first build. |
| 2 GiB swap added before building | The frontend bundle (3,100+ modules) exhausts 2 GiB RAM on t3.small during `vite build`. Swap makes the build reliable without paying for a larger instance. |
| 30 GiB root volume | The Amazon Linux 2023 AMI snapshot requires ≥ 30 GiB; 20 GiB fails at launch. |
| Backend never published to the host | nginx is the single ingress. The API is only reachable through the reverse proxy, so there is no second public attack surface. |
| GEE key bind-mounted read-only from the host, never baked into an image | Keeps the credential out of image layers and out of git. Mode 644 rather than 600 because the backend container runs as a non-root user and a bind mount preserves host ownership. |
| All AWS access via the instance role | Satisfies "do not hardcode AWS access keys or secrets" structurally rather than by convention — there is nothing to leak. |
| SSH restricted to a single /32 | The brief asks not to expose unnecessary services. Port 22 is required for administration in this account (see below) but is not open to the internet. |
| Application config supplied as environment variables with no in-code defaults | `backend/app/config.py` raises at import if a required variable is missing, so a misconfigured deployment fails immediately and loudly instead of silently using a value that was only correct in another environment. |

## Issues encountered and how they were resolved

| Issue | Resolution |
|---|---|
| **Insufficient IAM permissions blocked the assessment initially.** `iam:ListRoles`, `iam:ListPolicies`, `iam:CreateRole` and `ec2:RunInstances` were all denied, so neither the required role nor an instance could be created. | Raised with the account administrator. Permissions were widened and `EC2-DynamoDB-StagingRole` was made available, at which point the deployment could proceed. |
| **AWS CLI could not authenticate**, and CloudShell could not start ("Unable to create the environment"), so no command-line access to the account was available. | Worked through the console, then used SSH to the instance for all command-line work. |
| **`iam:ListInstanceProfiles` denied**, so the launch wizard's IAM instance profile dropdown could not populate. | Used the wizard's "Specify a custom value" option to enter `EC2-DynamoDB-StagingRole` directly. |
| **The instance came up but served nothing, twice, with no diagnostic trail.** The provisioning script was supplied as EC2 user-data, but nothing was ever installed. | Launching with an SSH key pair made the cause visible in one command: `/var/lib/cloud/instance/user-data.txt` was **0 bytes** — the script had never reached the instance. The launch form had been populated programmatically rather than typed, and the value never registered with the form, so the launch request carried empty user-data. Resolved by running the identical script over SSH, which also streams build output live. Committed as `ops/bootstrap-ec2.sh` and valid as user-data too, but the SSH path is the one verified here. |
| **`docker compose build` failed:** `compose build requires buildx 0.17.0 or later`. Amazon Linux 2023's `docker` package ships without the Buildx plugin. | Installed Buildx v0.19.3 into the Docker CLI plugin directory. This is now part of `ops/bootstrap-ec2.sh`. |
| **`ssm:StartSession` denied**, so Session Manager could not be used for administration. | SSH is used instead, scoped to a single source IP. This is a deviation from the intended design — see *Deviations* below. |
| **Secrets Manager unusable in this account.** The user lacks `secretsmanager:ListSecrets`, and the instance role lacks `secretsmanager:GetSecretValue` (verified from the instance). | The GEE key is placed on the instance over SSH instead. The bootstrap script still attempts a Secrets Manager fetch first and falls back to a placeholder, so it will use Secrets Manager automatically once the permission exists. |
| A hardcoded Mapbox token in the frontend source was flagged by secret scanning. | Replaced with a `VITE_MAPBOX_TOKEN` build argument. Mapbox `pk.*` tokens are public by design; the real control is a domain restriction in the Mapbox dashboard. |
| **SSH access broke mid-deployment** when the administrator's ISP reassigned their public IP, because the security group is pinned to a single `/32`. | Expected behaviour of the restriction, not a fault — the application itself was unaffected (80/443 remain open). Re-establishing SSH means updating the inbound rule to the new address. This is the practical cost of IP-pinned SSH on a dynamic connection, and one more reason to move administration to SSM Session Manager, which needs no inbound rule at all. |
| nginx would have passed raw backend 5xx responses (including tracebacks) to clients. | Added `proxy_intercept_errors` with a generic JSON error page, scoped to 5xx only so genuine 4xx API error bodies still reach the frontend. |

### Deviations from the intended design, and why

Two things in this deployment are weaker than what I would ship with full
account access. Both are permission-driven, not preference:

1. **SSH is enabled (port 22, single-IP restricted).** The intended design
   used **no SSH key at all**, with administration via SSM Session Manager —
   IAM-authenticated, session-logged, and requiring no inbound port. That is
   not possible here because `ssm:StartSession` is denied. Once SSM access is
   granted, port 22 can be closed entirely and the key pair deleted.
2. **The GEE key sits on the instance filesystem** rather than being pulled
   from Secrets Manager at deploy time. The key is still absent from git and
   from all image layers, but it is not centrally rotatable. Granting
   `secretsmanager:GetSecretValue` to the instance role restores the intended
   behaviour with no code change — the bootstrap script already prefers it.

**The GEE service-account key currently on this instance should be rotated**,
as it was shared over email during this assessment.

## Security recommendations

**Access control**
- Close port 22 and move administration to SSM Session Manager once
  `ssm:StartSession` is available; delete the `maize-staging-admin` key pair.
- Review `EC2-DynamoDB-StagingRole`'s policies against what the app actually
  calls. The application needs only `PutItem`, `GetItem`, `Query`,
  `UpdateItem` and `DeleteItem` on the two tables (plus the users table's
  `email-index`), so any broader grant can be trimmed.
- The application's own authentication is AWS Cognito; enforce MFA on the
  admin user before this holds real data.

**Network security**
- Attach an Elastic IP so the address survives a stop/start before DNS is
  mapped to it.
- Restrict 80/443 to known source ranges if this environment is only meant
  for internal review, rather than leaving it open to the internet.
- Outbound access is currently unrestricted because the app calls Google
  Earth Engine, Cognito, Open-Meteo and SoilGrids. Routing AWS API calls
  through VPC endpoints (DynamoDB, Secrets Manager) would let egress be
  tightened meaningfully.
- Put CloudFront or an ALB with an ACM certificate in front once a domain
  exists, which also removes the self-signed certificate warning.

**Secrets management**
- Rotate the GEE service-account key now, and scope its Google Cloud IAM
  permissions to only the Earth Engine assets the app reads.
- Store it in Secrets Manager and grant the instance role
  `secretsmanager:GetSecretValue` on that one secret ARN; enable rotation.
- Keep application config as environment variables and secrets as
  Secrets Manager references — never in the AMI, image layers, or git.

**Monitoring**
- The instance role already permits CloudWatch; install and configure the
  CloudWatch agent to ship container and nginx logs off the box.
- Add alarms on instance status checks, CPU, disk and the `/health`
  endpoint, so a failure is noticed without someone curling the IP.
- Enable CloudTrail in this account if it is not already on, for an audit
  trail of console and API activity.
- `prediction_log.jsonl` currently lives inside the container and is lost on
  restart; ship it to CloudWatch Logs or DynamoDB if it has analytical value.

**EC2 hardening**
- Enable SSM Patch Manager (or `dnf-automatic`) for unattended security
  patching, since there is otherwise no routine patch path.
- Enable EBS encryption on the root volume — this deployment's volume is
  unencrypted because the console default was used; encryption must be set
  at launch, so it requires a relaunch or a snapshot-and-restore.
- Keep IMDSv2 required (already the case).
- Set `docker` logging limits so container logs cannot fill the root volume.

## Proposed CI/CD approach

This deployment is deliberately manual, matching the brief. The path to an
automated release process is below. It is not hypothetical: it is
**implemented in this repository** and was proven end to end — including
several genuine red-to-green failures Those resources have since been torn
down with `terraform destroy` to avoid leaving cost or a stored credential
behind; the Terraform code, its `terraform test` suites, and the GitHub
Actions run history remain as the record.

**Tooling:** GitHub Actions, Terraform, Amazon ECR, AWS Systems Manager,
gitleaks.

**`.github/workflows/ci.yml`** — runs on every push and pull request. All
jobs are blocking:
1. `gitleaks` secret scan
2. Backend `pytest` suite (26 tests, DynamoDB mocked with `moto`)
3. Frontend production build
4. `terraform fmt`, `validate`, and `terraform test` across all eight
   infrastructure modules

**`.github/workflows/cd.yml`** — triggered by CI completing successfully, so
a failed build can never reach deployment:
1. Authenticate to AWS via **OIDC federation** — no long-lived access keys
   are stored in GitHub. The trust policy is scoped to this repository alone.
2. `terraform apply`, gated behind a GitHub Environment requiring **manual
   approval**, so infrastructure changes are always reviewed.
3. Build both images and push to ECR, tagged with the commit SHA, into
   immutable repositories.
4. Fail the deploy on any **fixable** CRITICAL vulnerability found by ECR
   image scanning. Unfixable base-OS findings are reported but do not block,
   so the gate stays meaningful instead of permanently red.
5. Deploy with `aws ssm send-command` — no SSH, and no inbound port needed.

**Infrastructure as code:** `infra/` contains eight Terraform modules
(network, security group, IAM, DynamoDB, secrets, ECR, OIDC, EC2), each with
its own `terraform test` assertions covering the properties that matter:
that no security group rule opens port 22, that IMDSv2 is required, that no
IAM policy uses a wildcard resource, and that the users table has the
`email-index` GSI the application queries.

**Note on the Terraform in this repository:** `infra/environments/staging`
is configured for the account it was proven in (S3 remote state bucket and
account-specific variables). To run it against account 711726112778, update
`infra/environments/staging/backend.tf` and `terraform.tfvars`, and grant
the deploying identity the IAM, EC2, ECR and Secrets Manager permissions the
modules require. It is included as the recommended automation path and as
working evidence of the approach, not as a description of how the instance
above was built — that was done manually, as documented in the steps.

**Recommended next steps**
1. Point the existing pipeline at this account once permissions allow, and
   retire the manual bootstrap.
2. Add automated rollback: keep the previous image tag and revert to it if
   the post-deploy health check fails.
3. Add `checkov`/`tflint` as blocking CI jobs alongside gitleaks.
4. Publish `terraform plan` output onto pull requests so infrastructure
   changes are reviewable before the approval gate.
