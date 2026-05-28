from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./hrsai.db"
    JWT_SECRET: str = "dev-secret-change-in-prod-32chars!!"
    JWT_REFRESH_SECRET: str = "dev-refresh-secret-change-in-prod!!"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_URL: str = "http://localhost:5173"
    AWS_PROFILE: str = "Developer-721906891174"
    AWS_REGION: str = "eu-central-1"
    BEDROCK_MODEL_ID: str = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
    BEDROCK_MODEL_SONNET: str = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
    BEDROCK_MODEL_HAIKU45: str = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
    BEDROCK_MODEL_HAIKU3: str = "eu.anthropic.claude-3-haiku-20240307-v1:0"
    PORT: int = 8000
    ENV: str = "development"
    JIRA_URL: str = "https://jira.hrs.io"
    CONFLUENCE_URL: str = "https://confluence.hrs.io"
    ATLASSIAN_USER: str = ""
    ATLASSIAN_PASSWORD: str = ""
    JIRA_TOKEN: str = ""
    CONFLUENCE_TOKEN: str = ""
    ADMIN_EMAIL: str = "admin@hrsai.com"
    ADMIN_PASSWORD: str = "admin123"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
