export type SkillStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'DEPLOYED' | 'ARCHIVED'
export type AgentStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'ERROR' | 'COMPLETED'
export type ExecutionStatus = 'PENDING' | 'AWAITING_APPROVAL' | 'APPROVED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'REJECTED'

export interface User {
  id: number
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER'
  persona_id: number | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface Organization {
  id: number
  name: string
  domain: string
  logo_url: string | null
}

export interface DeptKPI {
  id: number
  name: string
  value: number
  target: number
  unit: string
  trend: string
}

export interface Department {
  id: number
  name: string
  description: string
  color: string
  icon: string
  organization_id: number
  kpis: DeptKPI[]
  persona_count?: number
  agent_count?: number
}

export interface Persona {
  id: number
  name: string
  slug: string
  description: string
  responsibilities: string[]
  data_access: string[]
  processes: string[]
  avatar_initials: string
  avatar_color: string
  department_id: number
  skill_status?: string | null
  department?: Department
}

export interface SkillFile {
  id: number
  persona_id: number
  content: string | null
  version: number
  status: SkillStatus
  generated_by: string | null
  reviewed_by: string | null
  deployed_at: string | null
  created_at: string
  updated_at: string
}

export interface SkillVersion {
  id: number
  skill_file_id: number
  version: number
  changed_by: string | null
  changelog: string | null
  created_at: string
}

export interface Agent {
  id: number
  name: string
  persona_id: number
  status: AgentStatus
  last_active: string | null
  created_at: string
  persona_name?: string
  department_name?: string
}

export interface ExecutionStep {
  id: number
  execution_id: number
  step_number: number
  action: string
  reasoning: string
  result: string | null
  status: string
  duration_ms: number | null
  created_at: string
}

export interface AgentExecution {
  id: number
  agent_id: number
  task_name: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  status: ExecutionStatus
  started_at: string | null
  completed_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  steps: ExecutionStep[]
  agent_name?: string
  persona_name?: string
}

export interface ActionTemplate {
  id: number
  name: string
  description: string
  category: string
  input_schema: Record<string, unknown>
  is_global: boolean
  created_at: string
}

export interface ProcessDocument {
  id: number
  title: string
  department: string | null
  category: string
  content: string
  tags: string[]
  file_url: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface AnalyticsDashboard {
  total_agents: number
  active_agents: number
  executions_today: number
  skill_deployed_pct: number
  executions_by_day: Array<{ date: string; count: number }>
  skill_by_dept: Array<{ dept: string; deployed: number; review: number; draft: number }>
  execution_status_dist: Array<{ status: string; count: number }>
}

export interface OrgOverview {
  org_name: string
  domain: string
  total_departments: number
  total_personas: number
  total_agents: number
  active_agents: number
}

export interface OrgStats {
  active_agents: number
  skill_files_deployed: number
  executions_today: number
  avg_csat: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
