"""
HRS.AI Database Seed Script
Run: python seed.py
Uses synchronous SQLAlchemy for simplicity.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Load .env before importing anything else
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env", override=True)
for _var in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"):
    os.environ.pop(_var, None)

from passlib.context import CryptContext
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use sync SQLite URL
SYNC_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hrsai.db").replace(
    "sqlite+aiosqlite", "sqlite"
)

engine = create_engine(SYNC_DATABASE_URL, echo=False)
Session = sessionmaker(bind=engine)

from app.models.db import (
    ActionTemplate,
    Agent,
    AgentExecution,
    AgentStatus,
    AuditLog,
    Base,
    Department,
    DeptKPI,
    ExecutionStatus,
    ExecutionStep,
    Organization,
    Persona,
    ProcessDocument,
    RefreshToken,
    SkillFile,
    SkillFileStatus,
    SkillVersion,
    User,
    UserRole,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Skill file content templates
# ---------------------------------------------------------------------------

def make_skill_content(name: str, dept: str, responsibilities: list, data_access: list, processes: list) -> str:
    return f"""# {name} — AI Agent Skill File

## Role Overview
The **{name}** agent is a specialised AI persona embedded within the {dept} department at HRS Group Corporation. This agent is designed to autonomously handle a broad range of operational, analytical, and strategic tasks while maintaining strict compliance with organisational policies and human-in-the-loop governance requirements.

## Key Responsibilities
{chr(10).join(f"- {r}" for r in responsibilities[:6])}

## Data Sources & Access
The {name} agent has authorised read access to the following data sources:
{chr(10).join(f"- {d}" for d in data_access[:5])}

All data access is governed by role-based access controls and logged to the central audit trail.

## Key Processes
The agent participates in or owns the following core processes:
{chr(10).join(f"- {p}" for p in processes[:5])}

## Tools & Technologies
- Jira for issue tracking and backlog management
- Confluence for knowledge base and documentation
- Slack for team communications and alerts
- GitHub for code repository management (where applicable)
- Internal metrics dashboards and APM tooling
- Automated reporting pipelines

## Typical Agentic Actions
1. **Data retrieval**: Querying internal databases and APIs to gather context before taking action.
2. **Analysis**: Processing structured and unstructured data to surface insights.
3. **Document generation**: Drafting reports, proposals, and process documentation.
4. **Ticket management**: Creating and updating Jira issues based on system events or user requests.
5. **Stakeholder communication**: Drafting and posting messages to relevant Slack channels.
6. **Escalation**: Flagging high-risk decisions to human operators for approval.

## Human-in-the-Loop Checkpoints
The following actions always require explicit human approval before execution:
- Any action that modifies production data or infrastructure configurations
- Financial decisions exceeding pre-set thresholds
- Communications to external stakeholders
- Deployment of changes to live environments
- Deletion or archival of records

## KPIs & Success Metrics
| KPI | Target | Frequency |
|---|---|---|
| Task completion rate | ≥95% | Weekly |
| Human escalation rate | ≤10% | Weekly |
| Approval turnaround | ≤2 hours | Daily |
| Data accuracy score | ≥99% | Monthly |
| Stakeholder satisfaction | ≥4.2/5 | Quarterly |

## Behavioural Guidelines
- **Transparency**: Always explain reasoning before taking action.
- **Minimal footprint**: Request only the permissions needed for the current task.
- **Fail safely**: When uncertain, escalate to a human operator rather than guessing.
- **Audit trail**: Log all significant actions with timestamps and rationale.
- **Consistency**: Apply the same standards regardless of who initiated the request.
- **Data privacy**: Never surface personally identifiable information beyond what is strictly required.
"""


# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

DEPARTMENTS = [
    {
        "name": "Engineering",
        "description": "Software development, architecture, and technical infrastructure",
        "color": "#6366f1",
        "icon": "Code2",
        "kpis": [
            {"name": "Deployment Frequency", "value": 12.0, "target": 15.0, "unit": "deploys/week", "trend": "up"},
            {"name": "Mean Time to Recovery", "value": 2.3, "target": 2.0, "unit": "hours", "trend": "down"},
            {"name": "Code Coverage", "value": 84.0, "target": 90.0, "unit": "%", "trend": "up"},
            {"name": "Sprint Velocity", "value": 47.0, "target": 50.0, "unit": "points", "trend": "stable"},
        ],
        "personas": [
            {
                "name": "AI Engineer",
                "slug": "ai-engineer",
                "description": "Designs, builds and maintains AI/ML pipelines and model serving infrastructure for HRS products.",
                "responsibilities": [
                    "Design and implement ML pipelines for production use",
                    "Monitor model performance and detect drift",
                    "Evaluate and integrate new foundation models",
                    "Collaborate with data engineers on feature pipelines",
                    "Maintain model registries and versioning",
                    "Document AI architecture decisions",
                    "Conduct A/B experiments for model improvements",
                    "Ensure responsible AI practices and bias mitigation",
                ],
                "data_access": [
                    "ML experiment tracking database",
                    "Model performance metrics dashboard",
                    "Feature store",
                    "Training data warehouse",
                    "Inference latency logs",
                ],
                "processes": [
                    "ML model development lifecycle",
                    "Model deployment pipeline",
                    "Experiment design and evaluation",
                    "Model monitoring and alerting",
                    "Architecture review process",
                ],
                "avatar_initials": "AE",
                "avatar_color": "#6366f1",
                "deployed": True,
            },
            {
                "name": "Frontend Engineer",
                "slug": "frontend-engineer",
                "description": "Builds and maintains user-facing web applications, design systems, and frontend performance optimisation.",
                "responsibilities": [
                    "Develop responsive React/TypeScript components",
                    "Maintain the HRS design system and component library",
                    "Optimise Core Web Vitals and page load performance",
                    "Implement accessibility standards (WCAG 2.1 AA)",
                    "Write unit and integration tests for UI components",
                    "Collaborate with UX designers on implementation",
                    "Review frontend pull requests",
                    "Manage frontend build and CI/CD pipelines",
                ],
                "data_access": [
                    "GitHub repositories",
                    "Performance monitoring (Lighthouse CI)",
                    "Error tracking (Sentry)",
                    "Feature flag management system",
                    "Analytics event schema",
                ],
                "processes": [
                    "Component design and development",
                    "Design handoff and QA",
                    "Performance audit cycle",
                    "Accessibility review",
                    "Release and deployment process",
                ],
                "avatar_initials": "FE",
                "avatar_color": "#8b5cf6",
                "deployed": True,
            },
            {
                "name": "Java Developer",
                "slug": "java-developer",
                "description": "Develops and maintains Java-based microservices and backend APIs powering the HRS platform.",
                "responsibilities": [
                    "Design and implement RESTful APIs using Spring Boot",
                    "Write performant SQL queries and manage database migrations",
                    "Implement domain-driven design patterns",
                    "Conduct code reviews and enforce coding standards",
                    "Troubleshoot production incidents and reduce technical debt",
                    "Integrate with third-party services and APIs",
                    "Write comprehensive unit and integration tests",
                    "Maintain API documentation in OpenAPI format",
                ],
                "data_access": [
                    "PostgreSQL production database (read replica)",
                    "Redis cache cluster",
                    "Internal API gateway logs",
                    "Distributed tracing (Jaeger)",
                    "GitHub repositories",
                ],
                "processes": [
                    "Agile sprint ceremonies",
                    "API design review",
                    "Database migration management",
                    "Incident response",
                    "Code review process",
                ],
                "avatar_initials": "JD",
                "avatar_color": "#f59e0b",
                "deployed": False,
            },
            {
                "name": "QA Automation Engineer",
                "slug": "qa-automation-engineer",
                "description": "Designs and maintains automated test suites to ensure software quality across the HRS platform.",
                "responsibilities": [
                    "Design and implement end-to-end automated test suites",
                    "Maintain Playwright and Jest test frameworks",
                    "Integrate test automation into CI/CD pipelines",
                    "Perform exploratory and regression testing",
                    "Track and triage bug reports in Jira",
                    "Define and enforce quality gates",
                    "Report quality metrics to engineering leads",
                    "Champion test-driven development practices",
                ],
                "data_access": [
                    "Test results and coverage reports",
                    "CI/CD pipeline logs",
                    "Bug tracking system (Jira)",
                    "Test environment configurations",
                    "Staging and UAT environment access",
                ],
                "processes": [
                    "Test planning and strategy",
                    "Regression test cycle",
                    "Release sign-off process",
                    "Bug triage and prioritisation",
                    "Quality gate enforcement",
                ],
                "avatar_initials": "QA",
                "avatar_color": "#10b981",
                "deployed": False,
            },
        ],
    },
    {
        "name": "Data & Analytics",
        "description": "Data engineering, business intelligence, and analytics platforms",
        "color": "#0ea5e9",
        "icon": "BarChart3",
        "kpis": [
            {"name": "Data Pipeline Uptime", "value": 99.2, "target": 99.9, "unit": "%", "trend": "stable"},
            {"name": "Query Response Time", "value": 1.8, "target": 1.5, "unit": "seconds", "trend": "down"},
            {"name": "Data Quality Score", "value": 96.5, "target": 99.0, "unit": "%", "trend": "up"},
            {"name": "Active Dashboards", "value": 34.0, "target": 40.0, "unit": "count", "trend": "up"},
        ],
        "personas": [
            {
                "name": "Data Engineer",
                "slug": "data-engineer",
                "description": "Builds and maintains scalable data pipelines, data warehouses, and ETL processes.",
                "responsibilities": [
                    "Design and maintain ETL/ELT data pipelines",
                    "Manage the data warehouse and lake architecture",
                    "Ensure data quality and consistency across systems",
                    "Optimise query performance and storage costs",
                    "Implement data governance and lineage tracking",
                    "Collaborate with analysts on data modelling",
                    "Monitor pipeline health and SLA adherence",
                    "Build self-service data infrastructure for analysts",
                ],
                "data_access": [
                    "Data warehouse (Snowflake/BigQuery)",
                    "ETL pipeline monitoring",
                    "Data catalogue",
                    "Raw data lake (S3/GCS)",
                    "Pipeline orchestration (Airflow)",
                ],
                "processes": [
                    "Data pipeline development and testing",
                    "Data quality monitoring",
                    "Schema change management",
                    "Data warehouse optimisation",
                    "Incident response for data outages",
                ],
                "avatar_initials": "DE",
                "avatar_color": "#0ea5e9",
                "deployed": True,
            },
            {
                "name": "BI Analyst",
                "slug": "bi-analyst",
                "description": "Creates dashboards, reports, and data products that drive business decision-making.",
                "responsibilities": [
                    "Design and publish interactive dashboards",
                    "Translate business questions into analytical models",
                    "Define and maintain KPI definitions",
                    "Collaborate with stakeholders on data requirements",
                    "Conduct ad-hoc data analysis and investigations",
                    "Maintain self-service reporting infrastructure",
                    "Document data definitions in the business glossary",
                    "Present insights to leadership teams",
                ],
                "data_access": [
                    "BI platform (Tableau/Looker)",
                    "Data warehouse read access",
                    "Product analytics events",
                    "Financial reporting data",
                    "Marketing attribution data",
                ],
                "processes": [
                    "Dashboard design and review",
                    "KPI governance",
                    "Stakeholder requirements gathering",
                    "Monthly analytics review",
                    "Data catalogue maintenance",
                ],
                "avatar_initials": "BA",
                "avatar_color": "#38bdf8",
                "deployed": True,
            },
            {
                "name": "Data Scientist",
                "slug": "data-scientist",
                "description": "Develops predictive models and statistical analyses to support strategic business decisions.",
                "responsibilities": [
                    "Build and validate predictive and prescriptive models",
                    "Design experiments and analyse results",
                    "Translate model outputs into actionable recommendations",
                    "Collaborate with product teams on feature instrumentation",
                    "Maintain statistical rigour in analysis methodology",
                    "Present findings to non-technical stakeholders",
                    "Monitor deployed model accuracy and retrain as needed",
                    "Publish reproducible notebooks and documentation",
                ],
                "data_access": [
                    "Full data warehouse access",
                    "ML platform and experiment tracking",
                    "Customer behavioural data",
                    "Financial and operational datasets",
                    "External benchmark datasets",
                ],
                "processes": [
                    "Research and hypothesis definition",
                    "Experiment design and execution",
                    "Model development lifecycle",
                    "Stakeholder communication of insights",
                    "Knowledge sharing and peer review",
                ],
                "avatar_initials": "DS",
                "avatar_color": "#7dd3fc",
                "deployed": False,
            },
        ],
    },
    {
        "name": "Operations",
        "description": "Site reliability, infrastructure, and operational excellence",
        "color": "#f59e0b",
        "icon": "Settings",
        "kpis": [
            {"name": "System Uptime", "value": 99.95, "target": 99.99, "unit": "%", "trend": "stable"},
            {"name": "Incident Response Time", "value": 8.5, "target": 5.0, "unit": "minutes", "trend": "down"},
            {"name": "Infrastructure Cost", "value": 42000.0, "target": 40000.0, "unit": "$/month", "trend": "up"},
            {"name": "Change Success Rate", "value": 97.0, "target": 98.5, "unit": "%", "trend": "up"},
        ],
        "personas": [
            {
                "name": "Site Manager",
                "slug": "site-manager",
                "description": "Ensures the reliability, availability, and performance of HRS production infrastructure.",
                "responsibilities": [
                    "Monitor production system health and uptime",
                    "Coordinate incident response and post-mortems",
                    "Manage infrastructure provisioning and scaling",
                    "Implement SLOs and error budgets",
                    "Conduct capacity planning exercises",
                    "Maintain runbooks and operational documentation",
                    "Drive continuous improvement through blameless retrospectives",
                    "Ensure security patch compliance",
                ],
                "data_access": [
                    "Infrastructure monitoring (Datadog/Prometheus)",
                    "Log aggregation platform",
                    "Cloud provider console (AWS/GCP)",
                    "On-call scheduling system",
                    "Incident management tool (PagerDuty)",
                ],
                "processes": [
                    "Incident detection and response",
                    "Change management",
                    "Capacity planning",
                    "Post-mortem facilitation",
                    "SLO review and adjustment",
                ],
                "avatar_initials": "SM",
                "avatar_color": "#f59e0b",
                "deployed": True,
            },
            {
                "name": "DevOps Engineer",
                "slug": "devops-engineer",
                "description": "Designs and maintains CI/CD pipelines, infrastructure-as-code, and developer tooling.",
                "responsibilities": [
                    "Build and maintain CI/CD pipelines",
                    "Manage infrastructure-as-code (Terraform, Pulumi)",
                    "Implement container orchestration (Kubernetes)",
                    "Maintain developer tooling and internal platforms",
                    "Define and enforce security baseline configurations",
                    "Automate operational tasks and runbooks",
                    "Manage secrets and access control",
                    "Optimise build and deployment times",
                ],
                "data_access": [
                    "CI/CD pipeline metrics",
                    "Container registry",
                    "Cloud IAM configurations",
                    "GitHub Actions workflows",
                    "Kubernetes cluster metrics",
                ],
                "processes": [
                    "Pipeline design and maintenance",
                    "Infrastructure provisioning",
                    "Security baseline enforcement",
                    "Release management",
                    "Platform engineering reviews",
                ],
                "avatar_initials": "DV",
                "avatar_color": "#fbbf24",
                "deployed": True,
            },
            {
                "name": "Infrastructure Analyst",
                "slug": "infrastructure-analyst",
                "description": "Analyses infrastructure costs, performance trends, and capacity requirements to optimise operations.",
                "responsibilities": [
                    "Analyse cloud spend and identify optimisation opportunities",
                    "Generate infrastructure performance reports",
                    "Model capacity requirements for upcoming initiatives",
                    "Benchmark infrastructure configurations",
                    "Support procurement and vendor negotiations",
                    "Maintain asset inventory and lifecycle tracking",
                    "Document architecture decisions",
                    "Provide cost forecasts to finance teams",
                ],
                "data_access": [
                    "Cloud billing and cost explorer",
                    "Infrastructure inventory database",
                    "Performance benchmarking results",
                    "Contract and vendor management system",
                    "Capacity planning models",
                ],
                "processes": [
                    "Monthly cost review",
                    "Capacity planning process",
                    "Vendor review and selection",
                    "Asset lifecycle management",
                    "Architecture decision record (ADR) process",
                ],
                "avatar_initials": "IA",
                "avatar_color": "#fcd34d",
                "deployed": False,
            },
        ],
    },
    {
        "name": "Product",
        "description": "Product management, strategy, and roadmap execution",
        "color": "#ec4899",
        "icon": "Package",
        "kpis": [
            {"name": "Feature Adoption Rate", "value": 68.0, "target": 75.0, "unit": "%", "trend": "up"},
            {"name": "NPS Score", "value": 42.0, "target": 50.0, "unit": "points", "trend": "up"},
            {"name": "Time to Market", "value": 6.5, "target": 5.0, "unit": "weeks", "trend": "down"},
            {"name": "Roadmap Delivery Rate", "value": 81.0, "target": 90.0, "unit": "%", "trend": "stable"},
        ],
        "personas": [
            {
                "name": "Product Manager",
                "slug": "product-manager",
                "description": "Defines product strategy, manages the roadmap, and bridges business and engineering teams.",
                "responsibilities": [
                    "Define and prioritise product roadmap",
                    "Write detailed product requirements and user stories",
                    "Conduct user research and synthesise insights",
                    "Track feature adoption and success metrics",
                    "Facilitate sprint planning and backlog grooming",
                    "Communicate product decisions to stakeholders",
                    "Manage competing priorities and trade-offs",
                    "Coordinate launches and go-to-market activities",
                ],
                "data_access": [
                    "Product analytics platform",
                    "User research repository",
                    "Customer feedback and NPS data",
                    "Roadmap management tool",
                    "Sprint tracking in Jira",
                ],
                "processes": [
                    "Discovery and requirements definition",
                    "Roadmap planning and review",
                    "Sprint ceremonies",
                    "Feature launch process",
                    "OKR setting and tracking",
                ],
                "avatar_initials": "PM",
                "avatar_color": "#ec4899",
                "deployed": True,
            },
            {
                "name": "UX Designer",
                "slug": "ux-designer",
                "description": "Creates intuitive user experiences through research, wireframing, and high-fidelity design.",
                "responsibilities": [
                    "Conduct user research and usability testing",
                    "Create wireframes, prototypes, and high-fidelity mockups",
                    "Maintain and evolve the HRS design system",
                    "Collaborate with product managers on requirements",
                    "Perform design critiques and reviews",
                    "Advocate for accessibility in design decisions",
                    "Analyse user behaviour data to inform design",
                    "Document UX patterns and guidelines",
                ],
                "data_access": [
                    "Figma design files and components",
                    "User session recordings (Hotjar/FullStory)",
                    "Usability test results",
                    "Heatmaps and click analytics",
                    "Customer support tickets",
                ],
                "processes": [
                    "Design sprint process",
                    "Usability testing",
                    "Design handoff to engineering",
                    "Design system governance",
                    "Research synthesis",
                ],
                "avatar_initials": "UX",
                "avatar_color": "#f472b6",
                "deployed": True,
            },
            {
                "name": "Product Analyst",
                "slug": "product-analyst",
                "description": "Provides data-driven insights to guide product decisions and measure feature impact.",
                "responsibilities": [
                    "Define and track product KPIs and metrics",
                    "Analyse funnel performance and drop-off points",
                    "Design and evaluate A/B experiments",
                    "Build product analytics dashboards",
                    "Investigate anomalies in product metrics",
                    "Segment user cohorts for targeted analysis",
                    "Collaborate with PMs on success criteria",
                    "Produce weekly product performance reports",
                ],
                "data_access": [
                    "Product analytics event stream",
                    "Experiment platform results",
                    "User cohort data",
                    "Revenue and conversion metrics",
                    "Feature flag rollout data",
                ],
                "processes": [
                    "Metric definition and governance",
                    "Experiment design and analysis",
                    "Weekly product review",
                    "Funnel analysis",
                    "OKR tracking",
                ],
                "avatar_initials": "PA",
                "avatar_color": "#fb7185",
                "deployed": False,
            },
        ],
    },
    {
        "name": "People & HR",
        "description": "Talent acquisition, employee experience, and people operations",
        "color": "#10b981",
        "icon": "Users",
        "kpis": [
            {"name": "Employee NPS", "value": 38.0, "target": 45.0, "unit": "points", "trend": "up"},
            {"name": "Time to Hire", "value": 28.0, "target": 21.0, "unit": "days", "trend": "down"},
            {"name": "Retention Rate", "value": 91.5, "target": 93.0, "unit": "%", "trend": "stable"},
            {"name": "Training Completion", "value": 78.0, "target": 85.0, "unit": "%", "trend": "up"},
        ],
        "personas": [
            {
                "name": "HR & People Solutions",
                "slug": "hr-people-solutions",
                "description": "Manages talent acquisition, employee lifecycle, and people operations across HRS Group.",
                "responsibilities": [
                    "Manage end-to-end talent acquisition",
                    "Design and deliver onboarding programmes",
                    "Administer performance review cycles",
                    "Handle employee relations and HR policies",
                    "Coordinate learning and development programmes",
                    "Maintain HRIS accuracy and compliance",
                    "Analyse workforce data and produce HR reports",
                    "Support organisational design initiatives",
                ],
                "data_access": [
                    "HRIS (Workday/BambooHR)",
                    "Applicant tracking system",
                    "Employee engagement survey results",
                    "Training and LMS platform",
                    "Payroll reporting (aggregated)",
                ],
                "processes": [
                    "Recruitment and selection process",
                    "Employee onboarding and offboarding",
                    "Performance management cycle",
                    "L&D programme delivery",
                    "HR compliance reporting",
                ],
                "avatar_initials": "HR",
                "avatar_color": "#10b981",
                "deployed": True,
            },
            {
                "name": "Talent Acquisition Specialist",
                "slug": "talent-acquisition-specialist",
                "description": "Drives candidate sourcing, screening, and hiring across technical and non-technical roles.",
                "responsibilities": [
                    "Source and screen candidates through multiple channels",
                    "Coordinate interview processes and panel scheduling",
                    "Maintain talent pipeline and candidate database",
                    "Partner with hiring managers on job requirements",
                    "Track recruitment metrics and reporting",
                    "Manage relationships with recruitment agencies",
                    "Ensure positive candidate experience",
                    "Draft and publish job descriptions",
                ],
                "data_access": [
                    "Applicant tracking system",
                    "LinkedIn Recruiter",
                    "Job board analytics",
                    "Interview feedback database",
                    "Offer management system",
                ],
                "processes": [
                    "Job requisition approval",
                    "Candidate sourcing and screening",
                    "Interview scheduling and coordination",
                    "Offer management process",
                    "Recruitment reporting",
                ],
                "avatar_initials": "TA",
                "avatar_color": "#34d399",
                "deployed": True,
            },
            {
                "name": "L&D Coordinator",
                "slug": "ld-coordinator",
                "description": "Designs, delivers, and evaluates learning programmes that develop employee capabilities.",
                "responsibilities": [
                    "Design and deliver training programmes and workshops",
                    "Maintain the LMS and content library",
                    "Analyse skills gaps and recommend learning interventions",
                    "Coordinate external training and certifications",
                    "Track training completion and compliance",
                    "Evaluate learning effectiveness through assessments",
                    "Manage learning budgets and vendor relationships",
                    "Support leadership development programmes",
                ],
                "data_access": [
                    "Learning management system (LMS)",
                    "Training completion reports",
                    "Skills assessment results",
                    "Employee development plans",
                    "Training budget tracking",
                ],
                "processes": [
                    "Training needs analysis",
                    "Content design and development",
                    "Programme delivery and facilitation",
                    "Learning evaluation (Kirkpatrick model)",
                    "Certification and compliance tracking",
                ],
                "avatar_initials": "LD",
                "avatar_color": "#6ee7b7",
                "deployed": False,
            },
        ],
    },
    {
        "name": "Leadership",
        "description": "Executive leadership, strategy, and organisational governance",
        "color": "#ef4444",
        "icon": "Crown",
        "kpis": [
            {"name": "OKR Completion Rate", "value": 74.0, "target": 80.0, "unit": "%", "trend": "up"},
            {"name": "Strategic Initiative Progress", "value": 68.0, "target": 75.0, "unit": "%", "trend": "up"},
            {"name": "Board Satisfaction Score", "value": 4.1, "target": 4.5, "unit": "/5", "trend": "stable"},
            {"name": "Cross-dept Alignment Score", "value": 3.8, "target": 4.2, "unit": "/5", "trend": "up"},
        ],
        "personas": [
            {
                "name": "Team Lead",
                "slug": "team-lead",
                "description": "Leads cross-functional engineering teams, driving technical excellence and delivery outcomes.",
                "responsibilities": [
                    "Set technical direction and standards for the team",
                    "Facilitate agile ceremonies and remove blockers",
                    "Coach and mentor team members",
                    "Own team delivery metrics and reporting",
                    "Manage stakeholder expectations and communication",
                    "Conduct 1:1s and performance conversations",
                    "Drive continuous improvement initiatives",
                    "Recruit and onboard new team members",
                ],
                "data_access": [
                    "Team performance metrics",
                    "Sprint velocity and delivery reports",
                    "Jira project views",
                    "Employee engagement data (team level)",
                    "Budget and resource allocation",
                ],
                "processes": [
                    "Agile sprint management",
                    "1:1 and performance review process",
                    "Technical roadmap alignment",
                    "Hiring and onboarding",
                    "Stakeholder reporting",
                ],
                "avatar_initials": "TL",
                "avatar_color": "#ef4444",
                "deployed": True,
            },
            {
                "name": "Strategic Advisor",
                "slug": "strategic-advisor",
                "description": "Provides strategic analysis and recommendations to executive leadership on key business decisions.",
                "responsibilities": [
                    "Conduct competitive landscape analysis",
                    "Model strategic scenarios and financial impacts",
                    "Prepare executive briefings and board materials",
                    "Monitor industry trends and market signals",
                    "Facilitate strategy workshops with leadership",
                    "Track OKR progress and escalate risks",
                    "Coordinate cross-departmental strategic initiatives",
                    "Produce quarterly strategic review reports",
                ],
                "data_access": [
                    "Executive KPI dashboard",
                    "Financial planning and analysis data",
                    "Market intelligence platform",
                    "Board meeting minutes and materials",
                    "OKR management system",
                ],
                "processes": [
                    "Annual strategic planning process",
                    "Quarterly business review",
                    "Board reporting cycle",
                    "OKR setting and tracking",
                    "Competitive intelligence process",
                ],
                "avatar_initials": "SA",
                "avatar_color": "#f87171",
                "deployed": True,
            },
            {
                "name": "Operations Director",
                "slug": "operations-director",
                "description": "Oversees operational efficiency, cross-functional coordination, and business process improvement.",
                "responsibilities": [
                    "Drive operational excellence across departments",
                    "Identify and eliminate process inefficiencies",
                    "Manage cross-functional project portfolios",
                    "Define and track operational KPIs",
                    "Oversee vendor and partner relationships",
                    "Lead change management initiatives",
                    "Ensure regulatory compliance and risk management",
                    "Report operational performance to the executive team",
                ],
                "data_access": [
                    "Operational metrics and dashboards",
                    "Cross-departmental project tracking",
                    "Vendor contract management system",
                    "Risk register",
                    "Compliance and audit logs",
                ],
                "processes": [
                    "Operational planning and review",
                    "Process improvement methodology",
                    "Portfolio management",
                    "Risk and compliance review",
                    "Vendor management process",
                ],
                "avatar_initials": "OD",
                "avatar_color": "#fca5a5",
                "deployed": False,
            },
        ],
    },
]

ACTION_TEMPLATES = [
    {
        "name": "Generate Incident Report",
        "description": "Generates a structured incident post-mortem report from provided details.",
        "category": "operations",
        "input_schema": {
            "incident_id": {"type": "string", "description": "Incident identifier"},
            "severity": {"type": "string", "enum": ["P1", "P2", "P3"]},
            "description": {"type": "string"},
            "duration_minutes": {"type": "integer"},
        },
        "prompt": "You are a site reliability expert. Generate a detailed incident post-mortem report including: timeline, root cause analysis, impact assessment, action items, and preventive measures. Be thorough and actionable.",
        "is_global": True,
    },
    {
        "name": "Draft Jira Epic",
        "description": "Creates a detailed Jira epic with user stories and acceptance criteria.",
        "category": "engineering",
        "input_schema": {
            "epic_title": {"type": "string"},
            "objective": {"type": "string"},
            "team": {"type": "string"},
            "quarter": {"type": "string"},
        },
        "prompt": "You are a senior product manager and technical lead. Draft a comprehensive Jira epic including: epic summary, business objective, technical scope, success metrics, and 5-7 user stories with acceptance criteria.",
        "is_global": True,
    },
    {
        "name": "Analyse Skill Gap",
        "description": "Analyses team skill gaps and recommends learning interventions.",
        "category": "hr",
        "input_schema": {
            "team_name": {"type": "string"},
            "current_skills": {"type": "array", "items": {"type": "string"}},
            "required_skills": {"type": "array", "items": {"type": "string"}},
        },
        "prompt": "You are an experienced L&D professional and talent strategist. Analyse the skill gap between current and required competencies, then provide: gap analysis, prioritised learning recommendations, timeline, and success metrics.",
        "is_global": True,
    },
    {
        "name": "Summarise Data Pipeline Issues",
        "description": "Summarises recent data pipeline failures and recommends fixes.",
        "category": "data",
        "input_schema": {
            "pipeline_name": {"type": "string"},
            "error_logs": {"type": "string"},
            "frequency": {"type": "string"},
        },
        "prompt": "You are a senior data engineer. Analyse the provided pipeline failure information, identify root causes, assess business impact, and provide prioritised remediation steps with estimated effort.",
        "is_global": True,
    },
    {
        "name": "Generate Sprint Retrospective",
        "description": "Facilitates and documents a sprint retrospective with structured action items.",
        "category": "engineering",
        "input_schema": {
            "team": {"type": "string"},
            "sprint_number": {"type": "integer"},
            "went_well": {"type": "string"},
            "improvements": {"type": "string"},
            "velocity": {"type": "number"},
        },
        "prompt": "You are an experienced scrum master and agile coach. Facilitate a blameless sprint retrospective. Structure the output as: What went well (celebrate), What to improve (opportunities), Action items (concrete, assigned, time-boxed), and Team health indicators.",
        "is_global": True,
    },
]

PROCESS_DOCUMENTS = [
    {
        "title": "HRS Engineering Deployment Process",
        "department": "Engineering",
        "category": "process",
        "content": """# HRS Engineering Deployment Process

## Overview
This document outlines the standard deployment process for all services in the HRS platform. All deployments must follow this process to ensure stability and compliance.

## Pre-Deployment Checklist
1. All tests passing in CI/CD pipeline (unit, integration, e2e)
2. Code review approved by at least 2 engineers
3. Security scan completed with no critical findings
4. Database migration scripts reviewed and tested
5. Rollback plan documented
6. Staging environment deployment verified
7. Feature flags configured if applicable
8. Runbook updated

## Deployment Steps
1. Create deployment ticket in Jira with checklist completed
2. Notify #eng-deployments Slack channel
3. Trigger deployment pipeline via GitHub Actions
4. Monitor error rates and latency during deployment (first 15 minutes)
5. Verify smoke tests pass in production
6. Update deployment ticket status to COMPLETED
7. Announce in #releases channel

## Rollback Procedure
If error rate exceeds 1% or latency increases by >20%:
1. Immediately revert to previous deployment via pipeline
2. Page on-call engineer
3. Create P1 incident ticket
4. Notify stakeholders

## Deployment Windows
- Standard: Tuesday-Thursday, 10:00-16:00 CET
- Emergency: Any time with P1 approval
- Freeze periods: Last Friday of quarter, public holidays

## Contacts
- On-call rotation: See PagerDuty schedule
- DevOps team: #devops-support
""",
        "tags": ["deployment", "engineering", "process", "ci-cd"],
    },
    {
        "title": "Data Quality Management Framework",
        "department": "Data & Analytics",
        "category": "framework",
        "content": """# Data Quality Management Framework

## Purpose
This framework establishes standards and processes for maintaining data quality across all HRS data assets. Data quality is critical for accurate reporting, model training, and business decision-making.

## Data Quality Dimensions
We measure quality across six dimensions:
1. **Completeness** — Are all required fields populated?
2. **Accuracy** — Do values reflect real-world facts?
3. **Consistency** — Are values consistent across systems?
4. **Timeliness** — Is data available within agreed SLAs?
5. **Validity** — Do values conform to business rules?
6. **Uniqueness** — Are there duplicate records?

## Quality Gates
All data pipelines must pass automated quality checks before loading to the warehouse:
- Null rate < 5% for critical fields
- Schema validation against registered schemas
- Referential integrity checks
- Statistical anomaly detection (>3σ triggers alert)

## Monitoring and Alerting
- Great Expectations runs on every pipeline execution
- Failures trigger Slack alerts to #data-quality-alerts
- Critical failures (completeness <90%) trigger P2 incident

## Remediation Process
1. Alert fires → on-call data engineer investigates
2. Root cause identified → fix applied to pipeline or source
3. Backfill run if historical data affected
4. Post-mortem document created for P1/P2 issues
5. Prevention measures implemented

## KPIs
- Overall data quality score target: ≥99%
- Pipeline SLA adherence: ≥99.5%
- Mean time to detect: <15 minutes
- Mean time to resolve: <4 hours
""",
        "tags": ["data-quality", "analytics", "framework", "governance"],
    },
    {
        "title": "Employee Onboarding Programme",
        "department": "People & HR",
        "category": "process",
        "content": """# HRS Employee Onboarding Programme

## Overview
A structured 90-day onboarding journey designed to integrate new employees into HRS culture, systems, and their specific role. Research shows effective onboarding increases retention by up to 82% and productivity by over 70%.

## Pre-Day 1 (Week before start)
- IT equipment ordered and configured
- System access provisioned (email, Slack, Jira, GitHub)
- Welcome email sent with first day instructions
- Buddy assigned from the same team
- Manager briefed on Day 1 agenda

## Week 1: Foundation
- Day 1: Welcome session, office tour, meet the team
- Day 2: HR admin (benefits, policies, payroll setup)
- Day 3: Role overview with manager, 90-day plan discussion
- Day 4: Department deep-dives and tool walkthroughs
- Day 5: Meet cross-functional stakeholders

## Month 1: Orientation
- Complete all mandatory compliance training
- Shadow key processes in your role
- Attend first sprint ceremonies (Engineering) or team rituals
- Set 30-day personal goals with manager
- First 1:1 check-in with HR

## Month 2: Contribution
- Take ownership of first tasks or projects
- Complete role-specific technical onboarding
- 60-day check-in with manager
- Peer feedback collection

## Month 3: Integration
- Full productivity expected
- 90-day review with manager
- Formal feedback from key stakeholders
- Updated development plan for next 6 months

## Success Metrics
- 90-day retention rate: ≥98%
- Onboarding satisfaction score: ≥4.5/5
- Time to first meaningful contribution: ≤2 weeks
- Compliance training completion: 100%
""",
        "tags": ["onboarding", "hr", "people", "process"],
    },
]


def main():
    print("[Seed] Creating database tables...")
    Base.metadata.create_all(engine)

    session = Session()
    try:
        # Check if already seeded
        existing = session.query(Organization).first()
        if existing:
            print("[Seed] Database already seeded. Skipping.")
            return

        print("[Seed] Creating organisation...")
        org = Organization(name="HRS Group", domain="hrs.ai")
        session.add(org)
        session.flush()

        print("[Seed] Creating departments and personas...")
        all_personas = []
        skill_files_created = []

        for dept_data in DEPARTMENTS:
            dept = Department(
                name=dept_data["name"],
                description=dept_data["description"],
                color=dept_data["color"],
                icon=dept_data["icon"],
                organization_id=org.id,
            )
            session.add(dept)
            session.flush()

            for kpi_data in dept_data["kpis"]:
                kpi = DeptKPI(
                    name=kpi_data["name"],
                    value=kpi_data["value"],
                    target=kpi_data["target"],
                    unit=kpi_data["unit"],
                    trend=kpi_data["trend"],
                    department_id=dept.id,
                )
                session.add(kpi)

            session.flush()

            for p_data in dept_data["personas"]:
                persona = Persona(
                    name=p_data["name"],
                    slug=p_data["slug"],
                    description=p_data["description"],
                    responsibilities=p_data["responsibilities"],
                    data_access=p_data["data_access"],
                    processes=p_data["processes"],
                    avatar_initials=p_data["avatar_initials"],
                    avatar_color=p_data["avatar_color"],
                    department_id=dept.id,
                )
                session.add(persona)
                session.flush()

                if p_data.get("deployed"):
                    skill_content = make_skill_content(
                        p_data["name"],
                        dept_data["name"],
                        p_data["responsibilities"],
                        p_data["data_access"],
                        p_data["processes"],
                    )
                    sf = SkillFile(
                        persona_id=persona.id,
                        content=skill_content,
                        version=1,
                        status=SkillFileStatus.DEPLOYED,
                        generated_by="system@hrs.ai",
                        reviewed_by=os.getenv("ADMIN_EMAIL", "admin@hrsai.com"),
                        deployed_at=datetime.utcnow() - timedelta(days=7),
                    )
                else:
                    sf = SkillFile(
                        persona_id=persona.id,
                        content=None,
                        version=1,
                        status=SkillFileStatus.DRAFT,
                    )

                session.add(sf)
                session.flush()
                skill_files_created.append(sf)
                all_personas.append(persona)

        print("[Seed] Creating agents (1 per persona)...")
        all_agents = []
        for persona in all_personas:
            agent = Agent(
                name=f"{persona.name} Agent",
                persona_id=persona.id,
                status=AgentStatus.IDLE,
            )
            session.add(agent)
            session.flush()
            all_agents.append(agent)

        print("[Seed] Creating sample executions...")

        # Execution 1: COMPLETED (3 steps)
        ex1 = AgentExecution(
            agent_id=all_agents[0].id,
            task_name="Analyse model performance degradation",
            input={"model": "recommendation-v3", "metric": "precision", "threshold": 0.85},
            output={"summary": "Identified data drift in user behaviour features. Retraining recommended.", "action_items": 3},
            status=ExecutionStatus.COMPLETED,
            started_at=datetime.utcnow() - timedelta(hours=2),
            completed_at=datetime.utcnow() - timedelta(hours=1, minutes=45),
        )
        session.add(ex1)
        session.flush()

        for i, step in enumerate([
            ("Retrieve model metrics", "Querying the ML metrics dashboard for precision, recall, and F1 scores over the past 30 days.", "Retrieved: precision=0.82 (below threshold 0.85), recall=0.91, F1=0.86. Degradation started 12 days ago.", "completed", 1240),
            ("Analyse feature distributions", "Comparing current feature distributions with training baseline to detect drift.", "Detected significant drift in 3 features: user_session_duration (KS=0.34), click_through_rate (KS=0.28), purchase_recency (KS=0.19). Root cause: seasonal behavioural shift.", "completed", 3420),
            ("Generate remediation plan", "Drafting a prioritised remediation plan based on drift analysis findings.", "Created Jira ticket ENG-4821: Retrain recommendation-v3 with last 90 days of data. Estimated effort: 2 days. Priority: HIGH.", "completed", 890),
        ], start=1):
            session.add(ExecutionStep(
                execution_id=ex1.id, step_number=i,
                action=step[0], reasoning=step[1], result=step[2],
                status=step[3], duration_ms=step[4],
            ))

        # Execution 2: COMPLETED (4 steps)
        ex2 = AgentExecution(
            agent_id=all_agents[6].id,
            task_name="Generate weekly data quality report",
            input={"pipeline": "customer-events", "date_range": "2026-05-12 to 2026-05-18"},
            output={"quality_score": 97.8, "issues_found": 2, "report_url": "confluence/data-quality/week-20"},
            status=ExecutionStatus.COMPLETED,
            started_at=datetime.utcnow() - timedelta(hours=24),
            completed_at=datetime.utcnow() - timedelta(hours=23),
        )
        session.add(ex2)
        session.flush()

        for i, step in enumerate([
            ("Query pipeline run history", "Fetching execution logs for the customer-events pipeline for the target date range.", "Retrieved 847 pipeline runs. Overall success rate: 99.2%. 7 runs with warnings, 0 failures.", "completed", 1100),
            ("Calculate quality dimensions", "Computing completeness, accuracy, consistency, and timeliness scores for each data domain.", "Completeness: 99.1%, Accuracy: 98.4%, Consistency: 97.2%, Timeliness: 96.6%. Overall score: 97.8%.", "completed", 2800),
            ("Identify quality issues", "Scanning for anomalies, null rate spikes, and schema violations in the reporting period.", "Found 2 issues: (1) event_timestamp null rate spiked to 8% on 2026-05-15 17:00-18:00 UTC — traced to SDK bug in mobile app v4.2.1, patched. (2) device_type field has 3.1% unknown values — acceptable.", "completed", 1950),
            ("Publish report to Confluence", "Compiling findings into a structured report and publishing to the Data Quality space in Confluence.", "Report published at confluence/data-quality/week-20. Slack notification sent to #data-quality-alerts. 4 stakeholders notified.", "completed", 740),
        ], start=1):
            session.add(ExecutionStep(
                execution_id=ex2.id, step_number=i,
                action=step[0], reasoning=step[1], result=step[2],
                status=step[3], duration_ms=step[4],
            ))

        # Execution 3: AWAITING_APPROVAL (3 steps, last needs approval)
        ex3 = AgentExecution(
            agent_id=all_agents[10].id,
            task_name="Initiate infrastructure cost optimisation",
            input={"target_savings_pct": 15, "scope": "compute", "timeframe": "Q3 2026"},
            output=None,
            status=ExecutionStatus.AWAITING_APPROVAL,
            started_at=datetime.utcnow() - timedelta(minutes=30),
        )
        session.add(ex3)
        session.flush()

        for i, step in enumerate([
            ("Audit current compute spend", "Querying AWS Cost Explorer for compute expenditure over the last 90 days, segmented by service and team.", "Total compute spend Q2: $126,400. EC2: $89,200 (71%), ECS: $24,600 (19%), Lambda: $12,600 (10%). Identified $18,700 in idle or over-provisioned resources.", "completed", 2100),
            ("Model optimisation scenarios", "Evaluating rightsizing opportunities, Reserved Instance coverage improvements, and Spot instance migration candidates.", "Scenario A (RI coverage 40%→70%): saves $11,200/month. Scenario B (Spot migration for batch jobs): saves $6,800/month. Combined: estimated $18,000/month savings (17% reduction).", "completed", 3600),
            ("Request approval to proceed", "The proposed changes involve modifying production compute configurations and committing to 1-year Reserved Instances totalling $134,400. This requires explicit authorisation from the Operations Director.", "Awaiting approval from Operations Director to proceed with RI purchase and Spot migration plan. Estimated implementation: 2 weeks.", "awaiting_approval", None),
        ], start=1):
            session.add(ExecutionStep(
                execution_id=ex3.id, step_number=i,
                action=step[0], reasoning=step[1], result=step[2],
                status=step[3], duration_ms=step[4],
            ))

        # Execution 4: RUNNING (2 steps so far)
        ex4 = AgentExecution(
            agent_id=all_agents[1].id,
            task_name="Audit frontend bundle size and performance",
            input={"app": "hrsai-web", "target_lcp": 2500, "target_fid": 100},
            output=None,
            status=ExecutionStatus.RUNNING,
            started_at=datetime.utcnow() - timedelta(minutes=5),
        )
        session.add(ex4)
        session.flush()

        for i, step in enumerate([
            ("Run Lighthouse CI analysis", "Executing Lighthouse CI against the production build to capture Core Web Vitals baseline.", "LCP: 3,840ms (target: 2,500ms ❌), FID: 87ms (target: 100ms ✅), CLS: 0.08 (target: 0.1 ✅). LCP is 54% above target. Main offenders: 2.1MB JavaScript bundle, unoptimised hero image (890KB).", "completed", 4200),
            ("Analyse bundle composition", "Running webpack-bundle-analyser to identify large dependencies and code splitting opportunities.", "Analysing bundle composition... In progress.", "running", None),
        ], start=1):
            session.add(ExecutionStep(
                execution_id=ex4.id, step_number=i,
                action=step[0], reasoning=step[1], result=step[2],
                status=step[3], duration_ms=step[4],
            ))

        # Update agent statuses to reflect running execution
        all_agents[1].status = AgentStatus.RUNNING

        print("[Seed] Creating admin user...")
        admin_email = os.getenv("ADMIN_EMAIL", "admin@hrsai.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        admin = User(
            email=admin_email,
            name="HRS Admin",
            password_hash=pwd_context.hash(admin_password),
            role=UserRole.SUPER_ADMIN,
        )
        session.add(admin)

        print("[Seed] Creating action templates...")
        for tmpl_data in ACTION_TEMPLATES:
            tmpl = ActionTemplate(
                name=tmpl_data["name"],
                description=tmpl_data["description"],
                category=tmpl_data["category"],
                input_schema=tmpl_data["input_schema"],
                prompt=tmpl_data["prompt"],
                is_global=tmpl_data["is_global"],
            )
            session.add(tmpl)

        print("[Seed] Creating process documents...")
        for doc_data in PROCESS_DOCUMENTS:
            doc = ProcessDocument(
                title=doc_data["title"],
                department=doc_data["department"],
                category=doc_data["category"],
                content=doc_data["content"],
                tags=doc_data["tags"],
                version=1,
            )
            session.add(doc)

        session.commit()
        print("\n[Seed] Database seeded successfully!")
        print(f"  - 1 organisation")
        print(f"  - {len(DEPARTMENTS)} departments")
        print(f"  - {sum(len(d['personas']) for d in DEPARTMENTS)} personas")
        print(f"  - {len(all_agents)} agents")
        print(f"  - 4 sample executions")
        print(f"  - 1 admin user ({admin_email} / {admin_password})")
        print(f"  - {len(ACTION_TEMPLATES)} action templates")
        print(f"  - {len(PROCESS_DOCUMENTS)} process documents")
        print("\n[Seed] Run: uvicorn main:app --reload --port 8000")

    except Exception as exc:
        session.rollback()
        print(f"[Seed] ERROR: {exc}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
