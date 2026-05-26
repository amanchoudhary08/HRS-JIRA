# AWS Deployment — Technical Architecture

## Architecture Overview

```
Browser → CloudFront (Frontend) → S3 (static files)
Browser → CloudFront (API)      → EC2 port 4000 (Spring Boot)
EC2     → RDS PostgreSQL (private subnet)
EC2     → S3 (file attachments)
EC2     ← SSM Session Manager (no SSH needed)
```

### Key Resources

| Resource | ID / Value |
|----------|-----------|
| EC2 Instance | `i-04f43c45c2d63d215` |
| Elastic IP | `13.235.102.117` |
| RDS Endpoint | `taskflow-db.ctq688goac6m.ap-south-1.rds.amazonaws.com` |
| S3 Attachments Bucket | `taskflow-attachments-aman` |
| S3 Frontend Bucket | `taskflow-frontend-aman` |
| CloudFront Frontend | `E14Z40EZ2MT3MF` → `https://d3ali6aogtd8tr.cloudfront.net` |
| CloudFront API | `E1JRWWA1RH7DE2` → `https://d399hq42nmml06.cloudfront.net` |
| API Security Group | `sg-08590068486a54549` |
| DB Security Group | `sg-04d6aa1bb62a2818e` |
| VPC | `vpc-0e4809afdb6fc2825` |
| Region | `ap-south-1` (Mumbai) |

---

## 1. IAM (Identity & Access Management)

### IAM User `taskflow-app`
- Created with programmatic access (access key + secret key)
- Attached policy allowing only `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `taskflow-attachments-aman` bucket
- Used by Spring Boot to upload/download file attachments
- Principle of least privilege — can only touch S3, nothing else

### IAM Role `EC2-SSM-Role`
- Attached to EC2 instance as an **instance profile**
- Has `AmazonSSMManagedInstanceCore` policy — allows SSM agent on EC2 to register with AWS Systems Manager
- Has inline policy `EC2-S3-Deploy-Access` — allows EC2 to download the JAR from S3 during deployment
- Instance profiles are different from IAM users — the EC2 assumes this role automatically, no credentials needed on the instance

---

## 2. VPC & Security Groups

**Default VPC** (`vpc-0e4809afdb6fc2825`) was used. A VPC is a logically isolated virtual network inside AWS.

### Security Group `taskflow-api-sg` (`sg-08590068486a54549`)
- Acts as a virtual firewall for the EC2 instance
- Allows port 4000 **only** from CloudFront's managed prefix list (`pl-9aa247f3`)
- CloudFront edge servers can reach the backend; direct public internet access is blocked

### Security Group `taskflow-db-sg` (`sg-04d6aa1bb62a2818e`)
- Allows PostgreSQL port 5432 only from `taskflow-api-sg`
- RDS is never directly reachable from the internet — only EC2 can connect to it

---

## 3. S3 (Simple Storage Service)

### Bucket `taskflow-attachments-aman` — Private
- Stores task file attachments uploaded by users
- Spring Boot uses AWS SDK v2 `S3Client` with `PutObjectRequest` / `GetObjectRequest` / `DeleteObjectRequest`
- Credentials come from `taskflow-app` IAM user keys in the env file

### Bucket `taskflow-frontend-aman` — Public (Static Website)
- Hosts the compiled React app
- **Static website hosting** enabled — S3 serves `index.html` as root and error document (so React Router deep links work)
- **Public access block** disabled — required for static hosting
- **Bucket policy** grants `s3:GetObject` to `Principal: *` — makes all files publicly readable
- Vite builds React app into `dist/` → synced with `aws s3 sync dist/ s3://taskflow-frontend-aman --delete`

---

## 4. RDS (Relational Database Service)

- **Instance type:** `db.t3.micro` (2 vCPU, 1GB RAM)
- **Engine:** PostgreSQL 16.13
- **Endpoint:** `taskflow-db.ctq688goac6m.ap-south-1.rds.amazonaws.com:5432`
- **Database:** `taskflow`, **User:** `taskflow`
- Deployed in a **private subnet** — no public IP, not reachable from internet directly
- Only accessible from within the VPC (EC2 connects via the private endpoint)
- **Flyway** runs database migrations automatically on Spring Boot startup — creates all tables, runs V1–V16 migration scripts
- RDS handles automated backups, patching, and monitoring — fully managed service

---

## 5. EC2 (Elastic Compute Cloud)

### Instance Details
- **Type:** `t3.micro` (2 vCPU, 1GB RAM, burstable performance)
- **AMI:** Amazon Linux 2023
- **Java:** Amazon Corretto 17.0.19 (installed manually)
- **Instance ID:** `i-04f43c45c2d63d215`
- **Elastic IP:** `13.235.102.117` (permanent, doesn't change on stop/start)

### Deployment Process
1. Build JAR locally: `mvn clean package -DskipTests`
2. Upload to S3: `aws s3 cp target/*.jar s3://taskflow-attachments-aman/deploy/`
3. Download on EC2 via SSM: `aws s3 cp s3://... ~/taskflow-api.jar`

### systemd Service (`/etc/systemd/system/taskflow.service`)
```ini
[Unit]
Description=Taskflow API
After=network.target

[Service]
User=ec2-user
EnvironmentFile=/home/ec2-user/taskflow.env
ExecStart=/usr/bin/java -Xms128m -Xmx320m -jar /home/ec2-user/taskflow-api.jar
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- `EnvironmentFile` — loads all env vars from `/home/ec2-user/taskflow.env` (chmod 600)
- `Restart=always` — auto-restarts if Spring Boot crashes
- `-Xms128m -Xmx320m` — JVM heap limited to 320MB to avoid OOM on 1GB RAM
- Starts automatically on EC2 reboot

### Environment File (`/home/ec2-user/taskflow.env`)
```
DATABASE_URL=jdbc:postgresql://<rds-endpoint>:5432/taskflow
POSTGRES_USER=taskflow
POSTGRES_PASSWORD=<password>
JWT_SECRET=<64-byte-base64-random>
API_PORT=4000
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI=https://d399hq42nmml06.cloudfront.net/login/oauth2/code/google
FRONTEND_URL=https://d3ali6aogtd8tr.cloudfront.net
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<taskflow-app-key>
AWS_SECRET_ACCESS_KEY=<taskflow-app-secret>
S3_BUCKET=taskflow-attachments-aman
MAIL_ENABLED=false
```

### Elastic IP
- Allocated and associated so the EC2 public IP never changes on stop/start
- Without this, CloudFront origin, nip.io DNS, and Google OAuth would all break after an EC2 restart

---

## 6. SSM Session Manager

SSH (port 22) was not used because it was blocked by ISP deep packet inspection (DPI) in India.

### How it works
- SSM agent (pre-installed on Amazon Linux) polls `ssm.ap-south-1.amazonaws.com` over HTTPS outbound
- `aws ssm start-session` command on Mac connects to this via the AWS API — no inbound port needed
- Requires `session-manager-plugin` installed on Mac (`brew install --cask session-manager-plugin`)
- Requires `EC2-SSM-Role` IAM role attached to the EC2 instance

### Connect command
```bash
aws ssm start-session --target i-04f43c45c2d63d215 --region ap-south-1
```

- Sessions sometimes start as `ssm-user` (not `ec2-user`) — use `sudo` to access files owned by `ec2-user`
- Sessions time out after ~20 minutes of inactivity

---

## 7. CloudFront (CDN)

### Distribution 1 — Frontend (`E14Z40EZ2MT3MF`)
- **URL:** `https://d3ali6aogtd8tr.cloudfront.net`
- **Origin:** `taskflow-frontend-aman.s3-website.ap-south-1.amazonaws.com`
- Serves React app over HTTPS globally via CloudFront edge locations
- **Custom error response:** 404 → `/index.html` with HTTP 200 — required for React Router (client-side routing). Without this, refreshing `/projects/123` would return S3's actual 404
- Cache invalidation (`/*`) run after each deployment to force fresh files

### Distribution 2 — API (`E1JRWWA1RH7DE2`)
- **URL:** `https://d399hq42nmml06.cloudfront.net`
- **Origin:** `13.235.102.117.nip.io` port 4000
- **nip.io** is a wildcard DNS service — `13.235.102.117.nip.io` always resolves to `13.235.102.117`. Used because CloudFront requires a domain name origin, not a raw IP
- `OriginProtocolPolicy: http-only` — CloudFront → EC2 uses HTTP (port 4000), browser → CloudFront uses HTTPS
- **Caching disabled** (`MinTTL=0, DefaultTTL=0`) — API responses must never be cached
- **All HTTP methods forwarded** (GET/POST/PUT/DELETE/PATCH/OPTIONS) — required for REST API
- **All headers forwarded** — required so `Authorization: Bearer <jwt>` reaches Spring Boot

### Why two CloudFront distributions?
The React frontend is served over HTTPS from CloudFront. Browsers block **mixed content** — HTTPS pages cannot make HTTP requests. The API was on `http://EC2-IP:4000` (plain HTTP). The API CloudFront distribution provides HTTPS termination, solving the mixed content problem without putting SSL on the EC2 directly.

---

## 8. Google OAuth 2.0 Flow

```
1. User clicks "Continue with Google"
   → browser navigates to:
     https://d399hq42nmml06.cloudfront.net/oauth2/authorization/google

2. Spring Boot (via Spring Security OAuth2) generates authorization URL:
   - client_id = Google OAuth client ID
   - redirect_uri = https://d399hq42nmml06.cloudfront.net/login/oauth2/code/google
   - scope = openid email profile
   → redirects browser to accounts.google.com

3. User authenticates with Google
   → Google redirects back to redirect_uri with ?code=<auth-code>&state=<csrf>

4. CloudFront forwards to EC2:4000
   → Spring Security exchanges auth code for tokens with Google
   → Fetches user profile (email, name, Google ID / "sub")
   → Creates or links user in PostgreSQL
   → Generates JWT
   → Redirects to FRONTEND_URL/oauth2/callback?token=<jwt>

5. React OAuth2CallbackPage:
   → Extracts token from URL query param
   → Stores in localStorage
   → Redirects to /projects
```

### Why `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI` env var?
Spring Boot auto-generates the redirect URI from the **incoming request's hostname**. Since requests arrive at EC2 from CloudFront with the internal EC2 hostname, Spring would send the wrong redirect URI to Google. Setting this env var explicitly overrides the auto-generated value with the correct CloudFront domain.

---

## 9. Data Flow Summary

```
User Browser (HTTPS)
    ↓
CloudFront Edge Location (global, HTTPS/TLS termination)
    ↓ (HTTP)
EC2 t3.micro — Spring Boot :4000 (ap-south-1)
    ├── JDBC:5432 → RDS PostgreSQL (private subnet, ap-south-1)
    ├── HTTPS    → S3 taskflow-attachments-aman (file uploads)
    └── HTTPS    → Google APIs (OAuth token exchange)
```

---

## 10. Redeployment Cheatsheet

### If you change backend code:
```bash
# Mac — build and upload
cd backend
mvn clean package -DskipTests
aws s3 cp target/taskflow-api-0.0.1-SNAPSHOT.jar s3://taskflow-attachments-aman/deploy/taskflow-api.jar --region ap-south-1

# SSM — download and restart
aws ssm start-session --target i-04f43c45c2d63d215 --region ap-south-1
# In SSM:
aws s3 cp s3://taskflow-attachments-aman/deploy/taskflow-api.jar ~/taskflow-api.jar
sudo systemctl restart taskflow
sudo journalctl -u taskflow -f --no-pager
```

### If you change frontend code:
```bash
cd frontend
VITE_API_URL=https://d399hq42nmml06.cloudfront.net npm run build
aws s3 sync dist/ s3://taskflow-frontend-aman --delete --region ap-south-1
aws cloudfront create-invalidation --distribution-id E14Z40EZ2MT3MF --paths "/*" --region us-east-1
```

### Check API health:
```bash
curl https://d399hq42nmml06.cloudfront.net/healthz
```

### View Spring Boot logs (in SSM):
```bash
sudo journalctl -u taskflow -n 100 --no-pager
sudo journalctl -u taskflow -f --no-pager  # live tail
```

### Check EC2 memory (in SSM):
```bash
free -m
```
