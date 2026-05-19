ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'closed';
