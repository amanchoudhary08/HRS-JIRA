export interface HandleConfig {
  id: string;
}

export interface InputNodeData {
  inputName?: string;
  inputType?: string;
}

export interface OutputNodeData {
  outputName?: string;
  outputType?: string;
}

export interface TextNodeData {
  text?: string;
  variables?: string[];
}

export interface TransformNodeData {
  operation?: string;
}

export interface FilterNodeData {
  condition?: string;
  value?: string;
}

export interface APINodeData {
  method?: string;
  endpoint?: string;
}

export interface DatabaseNodeData {
  operation?: string;
  table?: string;
}

export interface ConditionalNodeData {
  operator?: string;
}

export interface ValidationResult {
  hasInputs: boolean;
  hasOutputs: boolean;
  isConnected: boolean;
  cycles: boolean;
}

export interface PipelineResponse {
  num_nodes: number;
  num_edges: number;
  is_dag: boolean;
}
