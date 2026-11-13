output "public_ip" {
  value       = aws_eip.app.public_ip
  description = "DNS A 레코드: @, judge, admin, rt 전부 이 IP"
}
output "deploy_role_arn" {
  value       = aws_iam_role.deploy.arn
  description = "GitHub secret AWS_ROLE_ARN"
}
output "instance_id" {
  value = aws_instance.app.id
}
output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.repo : k => r.repository_url }
}
