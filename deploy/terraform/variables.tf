variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "domain" {
  type        = string
  description = "루트 도메인 (예: example.com). @, judge, admin, rt 모두 EIP 로 향한다."
}

variable "github_repo" {
  type    = string
  default = "miceplans/2026RoboticsChallenge"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "data_volume_size" {
  type    = number
  default = 10
}

variable "create_oidc_provider" {
  type        = bool
  default     = true
  description = "계정에 GitHub OIDC provider 가 이미 있으면 false"
}

variable "existing_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "create_oidc_provider=false 일 때 기존 provider ARN"
}

variable "auth_secret_parameter" {
  type        = string
  default     = "/robotics/auth-secret"
  description = "미리 만들어 둔 SecureString 파라미터 이름 (docs/deploy.md 참고)"
}
