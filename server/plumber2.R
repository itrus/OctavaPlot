# OctavaPlot statistics API (plumber2). The same file runs on Windows (development) and on the VPS.
#
# Windows, from the repository root (Rscript is in C:\Program Files\R\R-<version>\bin unless that folder is on PATH):
#   Rscript -e "plumber2::api('server/plumber2.R') |> plumber2::api_run(host = '127.0.0.1', port = 12501)"
# VPS: the systemd unit octava-stats.service runs the same call in /opt/octava-stats (see the plan, section 14).
#
# R listens on 127.0.0.1:12501 only. The browser calls /api/stats/<route> on its own origin; Vite (development) and
# Caddy (VPS) forward everything under /api/stats/ with that prefix removed, so this file alone decides what is served.

#* Server settings, applied before the API starts.
#* @plumber
function(api) {
  # No documentation page (/__docs__/) and no /openapi.json. Setting it here because plumber2 0.2.0 ignores
  # api(doc_type = NULL): Plumber2$new() only sets the type when it is not NULL, so the default "rapidoc" stays.
  api$doc_type <- NULL
  # No cookie: fiery's default client id sets a "fiery_id" cookie on every reply. Nothing here uses client ids.
  api$set_client_id_converter(function(request) "anonymous")
  api
}

#* Liveness: answers while R is running. Takes no input and returns only the status.
#* @get /health
#* @serializer unboxedJSON
function() {
  list(status = "ok")
}
