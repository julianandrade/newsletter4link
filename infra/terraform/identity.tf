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
    # Needed to create the browser key below, and not enabled by default.
    "apikeys.googleapis.com",
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

# The browser API key the Identity Platform client SDK needs.
#
# Not a secret, and treating it as one causes more harm than it prevents: it is compiled into
# the JavaScript every visitor downloads, exactly like the Supabase anon key it replaces. What
# protects it is the restriction below, not concealment.
#
# Created here rather than by hand because the Firebase console's auto-created key arrives
# unrestricted, and an unrestricted key is one that works from anybody's page.
resource "google_apikeys_key" "browser" {
  name         = "${var.app_name}-browser"
  display_name = "${var.app_name} Identity Platform browser key"
  project      = var.project_id

  restrictions {
    # Identity Toolkit only. The default key can call every enabled API in the project, which
    # is a much larger thing to hand to a browser than sign-in.
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }

    browser_key_restrictions {
      allowed_referrers = compact([
        "http://localhost:3111/*",
        "http://localhost:3000/*",
        var.app_url != "" ? "${var.app_url}/*" : "",

        # The auth handler's own domain, and the reason it is easy to miss.
        #
        # Sign-in does not happen on the app's origin. The SDK opens a popup on
        # `<project>.firebaseapp.com/__/auth/handler`, and THAT page calls Identity Toolkit
        # with this key. So the app's origin being allowed is irrelevant to the call that
        # matters, and leaving this out blocks sign-in with:
        #
        #   API_KEY_HTTP_REFERRER_BLOCKED
        #   Requests from referer https://<project>.firebaseapp.com/ are blocked.
        #
        # Which is the restriction working correctly against the wrong list, not a
        # misconfigured provider. It cost one round trip to find and is worth the comment,
        # because the error names a domain nobody put in the configuration and the instinct is
        # to go looking at Entra.
        "https://${var.project_id}.firebaseapp.com/*",
      ])
    }
  }

  depends_on = [google_project_service.identity_apis]
}

output "gcip_api_key" {
  description = <<-EOT
    NEXT_PUBLIC_GCIP_API_KEY. Referrer-restricted to this app's origins and scoped to Identity
    Toolkit alone. Public by design: it ships in the client bundle, as the Supabase anon key
    does today, so it is a Terraform variable rather than a Secret Manager entry.

    Also a build-time value. Next.js inlines every NEXT_PUBLIC_ variable, so it has to reach
    `docker build` as a build argument, not only Cloud Run's environment.
  EOT
  value       = google_apikeys_key.browser.key_string
  sensitive   = true
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
