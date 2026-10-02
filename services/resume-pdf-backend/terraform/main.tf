terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
}
variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-east1"
}
variable "image" {
  type        = string
  description = "Immutable Artifact Registry image reference"
}
variable "api_domain" { type = string }
variable "service_name" {
  type    = string
  default = "resume-pdf-backend"
}
variable "r2_endpoint" { type = string }
variable "r2_bucket" { type = string }
variable "secrets" {
  description = "Existing secret names and pinned versions, never secret values"
  type        = map(object({ name = string, version = string }))
  validation {
    condition     = length(setsubtract(toset(["DATABASE_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "BACKEND_SERVICE_TOKEN"]), toset(keys(var.secrets)))) == 0
    error_message = "Provide all four backend secret references."
  }
}
resource "google_project_service" "apis" {
  for_each           = toset(["run.googleapis.com", "compute.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "iam.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}
resource "google_service_account" "backend" {
  account_id   = var.service_name
  display_name = "Rust resume PDF backend"
  depends_on   = [google_project_service.apis]
}
resource "google_secret_manager_secret_iam_member" "access" {
  for_each   = var.secrets
  secret_id  = each.value.name
  role       = "roles/secretmanager.secretAccessor"
  member     = "serviceAccount:${google_service_account.backend.email}"
  depends_on = [google_project_service.apis]
}
resource "google_cloud_run_v2_service" "api" {
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = true
  template {
    service_account                  = google_service_account.backend.email
    timeout                          = "180s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 4
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      resources {
        limits   = { cpu = "2", memory = "2Gi" }
        cpu_idle = true
      }
      env {
        name  = "MAX_COMPILATIONS"
        value = "2"
      }
      env {
        name  = "COMPILE_TIMEOUT_SECONDS"
        value = "45"
      }
      env {
        name  = "R2_ENDPOINT"
        value = var.r2_endpoint
      }
      env {
        name  = "R2_BUCKET"
        value = var.r2_bucket
      }
      dynamic "env" {
        for_each = var.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.name
              version = env.value.version
            }
          }
        }
      }
      startup_probe {
        initial_delay_seconds = 0
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 12
        http_get {
          path = "/health"
          port = 8080
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.access]
}
# The LB does not mint IAM invocation tokens. Mandatory service-token auth
# protects routes; ingress blocks direct public run.app requests.
resource "google_cloud_run_v2_service_iam_member" "lb_invocation" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "${var.service_name}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run { service = google_cloud_run_v2_service.api.name }
}
resource "google_compute_backend_service" "api" {
  name                  = "${var.service_name}-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  enable_cdn            = false
  backend { group = google_compute_region_network_endpoint_group.api.id }
  log_config {
    enable      = true
    sample_rate = 0.1
  }
}
resource "google_compute_url_map" "api" {
  name            = "${var.service_name}-map"
  default_service = google_compute_backend_service.api.id
}
resource "google_compute_managed_ssl_certificate" "api" {
  name = "${var.service_name}-cert"
  managed { domains = [var.api_domain] }
}
resource "google_compute_target_https_proxy" "api" {
  name             = "${var.service_name}-proxy"
  url_map          = google_compute_url_map.api.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api.id]
}
resource "google_compute_global_address" "api" { name = "${var.service_name}-ip" }
resource "google_compute_global_forwarding_rule" "api" {
  name                  = "${var.service_name}-https"
  target                = google_compute_target_https_proxy.api.id
  ip_address            = google_compute_global_address.api.address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
output "load_balancer_ip" { value = google_compute_global_address.api.address }
output "api_url" { value = "https://${var.api_domain}" }
