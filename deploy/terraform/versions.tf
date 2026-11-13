terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # 팀 공유가 필요하면 S3 backend 로 바꿀 것 (기본은 로컬 state)
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "robotics-challenge", ManagedBy = "terraform" }
  }
}
