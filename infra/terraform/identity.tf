# Google Cloud Identity Platform, replacing Supabase Auth.
#
# Identity Platform is the managed identity service on GCP, and it keeps the architecture the
# app already has: an identity provider beside the application issuing tokens, rather than
# authentication code living inside it. Microsoft is a first-class provider, so Office 365
# sign-in works the same way it does through Supabase's Azure provider today.
#
# Why this rather than staying on Supabase Auth: after Phase D, Supabase's only remaining job
# is identity, and on 15 August 2026 an egress quota on a service this project no longer uses
# for data took the whole product down, login included. Identity Platform puts that inside the
# same project, billing account and quota boundary as everything else.
#
# What this file cannot do on its own: an Azure app registration has to trust the Identity
# Platform callback. That is a change in Entra, by someone with the rights to make it, and the
# URI is in the output at the bottom.

resource "google_project_service" "identity_apis" {
  for_each = toset([
    "identitytoolkit.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# Initialises Identity Platform on the project. Creating this is what turns the
# identitytoolkit API from "enabled" into "configured".
resource "google_identity_platform_config" "auth" {
  project = var.project_id

  # Sign-in is by Microsoft only. No anonymous users, and email/password is deliberately off:
  # of five identities on Supabase today, four are Azure and one is a password account with no
  # MFA factor enrolled. `lib/auth/mfa.ts` exists solely to force TOTP on password accounts,
  # exempting Office 365 identities because Entra already applies the tenant's MFA and
  # Conditional Access. Dropping password sign-in retires that whole module rather than
  # reimplementing it against a second provider.
  sign_in {
    allow_duplicate_emails = false

    anonymous {
      enabled = false
    }

    email {
      enabled           = false
      password_required = false
    }

    # Stated rather than left to the default. The API returns this block whether or not it is
    # set, so omitting it makes every future plan want to remove something it never created,
    # which is the phantom diff that teaches people to skim plans. It is also worth being
    # explicit about: SMS is a sign-in method nobody here should have, and it is the one that
    # costs money per message if someone ever enables it by accident.
    phone_number {
      enabled            = false
      test_phone_numbers = {}
    }
  }

  # Same reasoning, and also a real setting: multi-tenancy would let this Identity Platform
  # instance host separate isolated user pools. This app has one organization and its own
  # `Organization` model; tenancy here would be a second, competing notion of the same thing.
  multi_tenant {
    allow_tenants = false
  }

  # Only these domains may receive an OAuth redirect. The equivalent of Supabase's redirect
  # allow list, and the same trap: a missing entry does not error, it sends the browser
  # somewhere unexpected.
  authorized_domains = compact([
    "localhost",
    var.app_url != "" ? replace(replace(var.app_url, "https://", ""), "http://", "") : "",
  ])

  depends_on = [google_project_service.identity_apis]
}

# The Microsoft provider itself.
#
# Created only when the Azure credentials are supplied, because Terraform cannot invent them
# and an empty client id produces a provider that exists and rejects every sign-in, which is
# worse than one that is absent. Supply them and re-apply.
resource "google_identity_platform_default_supported_idp_config" "microsoft" {
  count = var.azure_client_id != "" && var.azure_client_secret != "" ? 1 : 0

  project       = var.project_id
  enabled       = true
  idp_id        = "microsoft.com"
  client_id     = var.azure_client_id
  client_secret = var.azure_client_secret

  depends_on = [google_identity_platform_config.auth]
}

output "identity_platform_callback" {
  description = <<-EOT
    The redirect URI to add to the Azure app registration, under Authentication, as a Web
    platform redirect URI. Nothing signs in until Entra trusts this exact string.

    This is the one step in the migration that cannot be done from here: it is a change in
    the Entra tenant, by someone with rights over that app registration.
  EOT
  value       = "https://${var.project_id}.firebaseapp.com/__/auth/handler"
}
