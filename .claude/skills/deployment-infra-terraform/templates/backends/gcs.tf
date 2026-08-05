terraform {
  backend "gcs" {
    bucket = "<PROJECT_NAME>-tfstate"
    prefix = "<PROJECT_NAME>/<ENVIRONMENT>"
  }
}
