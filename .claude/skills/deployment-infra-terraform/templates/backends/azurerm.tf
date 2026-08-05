terraform {
  backend "azurerm" {
    resource_group_name  = "<PROJECT_NAME>-tfstate-rg"
    storage_account_name = "<PROJECT_NAME_ALPHANUMERIC>tfstate"
    container_name       = "tfstate"
    key                  = "<PROJECT_NAME>/<ENVIRONMENT>/terraform.tfstate"
  }
}
