from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Auth / User
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: str
    name: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    persona_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Organization & Department
# ---------------------------------------------------------------------------

class OrganizationOut(BaseModel):
    id: int
    name: str
    domain: str
    logo_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DeptKPIOut(BaseModel):
    id: int
    name: str
    value: float
    target: float
    unit: str
    trend: str

    model_config = ConfigDict(from_attributes=True)


class DepartmentOut(BaseModel):
    id: int
    name: str
    description: str
    color: str
    icon: str
    organization_id: int
    kpis: List[DeptKPIOut] = []

    model_config = ConfigDict(from_attributes=True)


class PersonaListItem(BaseModel):
    id: int
    name: str
    slug: str
    description: str
    avatar_initials: str
    avatar_color: str
    department_id: int

    model_config = ConfigDict(from_attributes=True)


class DepartmentDetail(DepartmentOut):
    personas: List[PersonaListItem] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Persona
# ---------------------------------------------------------------------------

class PersonaBase(BaseModel):
    name: str
    slug: str
    description: str
    responsibilities: List[str]
    data_access: List[str]
    processes: List[str]
    avatar_initials: str
    avatar_color: str
    department_id: int


class PersonaCreate(PersonaBase):
    pass


class PersonaOut(PersonaBase):
    id: int
    skill_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Skill Files
# ---------------------------------------------------------------------------

class SkillFileOut(BaseModel):
    id: int
    persona_id: int
    content: Optional[str] = None
    version: int
    status: str
    generated_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    deployed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SkillVersionOut(BaseModel):
    id: int
    skill_file_id: int
    version: int
    changed_by: Optional[str] = None
    changelog: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Agents & Executions
# ---------------------------------------------------------------------------

class AgentOut(BaseModel):
    id: int
    name: str
    persona_id: int
    status: str
    last_active: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentCreate(BaseModel):
    name: str
    persona_id: int


class ExecutionStepOut(BaseModel):
    id: int
    execution_id: int
    step_number: int
    action: str
    reasoning: str
    result: Optional[str] = None
    status: str
    duration_ms: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentExecutionOut(BaseModel):
    id: int
    agent_id: int
    task_name: str
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]] = None
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    steps: List[ExecutionStepOut] = []

    model_config = ConfigDict(from_attributes=True)


class ExecutionCreate(BaseModel):
    task_name: str
    input: Dict[str, Any]


# ---------------------------------------------------------------------------
# Action Templates
# ---------------------------------------------------------------------------

class ActionTemplateOut(BaseModel):
    id: int
    name: str
    description: str
    category: str
    input_schema: Dict[str, Any]
    is_global: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class ProcessDocumentOut(BaseModel):
    id: int
    title: str
    department: Optional[str] = None
    category: str
    content: str
    tags: List[str] = []
    file_url: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class AnalyticsDashboard(BaseModel):
    total_agents: int
    active_agents: int
    executions_today: int
    skill_deployed_pct: float
    executions_by_day: List[Dict[str, Any]]
    skill_by_dept: List[Dict[str, Any]]
    execution_status_dist: List[Dict[str, Any]]
