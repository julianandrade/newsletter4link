terraform {
  backend "s3" {
    bucket         = "<PROJECT_NAME>-tfstate"
    key            = "<PROJECT_NAME>/<ENVIRONMENT>/terraform.tfstate"
    region         = "<AWS_REGION>"
    encrypt        = true
    dynamodb_table = "<PROJECT_NAME>-tfstate-lock"
  }
}
