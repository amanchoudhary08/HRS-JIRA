/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AWS_PROFILE: string
  readonly VITE_AWS_REGION: string
  readonly VITE_BEDROCK_MODEL_ID: string
  readonly VITE_BEDROCK_INFERENCE_PROFILE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
