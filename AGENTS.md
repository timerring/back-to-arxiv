# Browser testing in Codex on macOS

Run commands that launch Chrome or Playwright with an approved execution context (`sandbox_permissions: "require_escalated"`). This includes integration tests, memory tests, store artwork generation, and local HTML screenshots. Request this context on the initial launch.

Use a fresh temporary browser profile for each test run and close it in `finally`. Keep the user's existing Chrome profile and windows intact.

The restricted execution context on this machine has caused Chrome to abort during macOS application registration, producing a system “Reopen” prompt before any extension code loads. Treat that failure as a browser-launch environment issue and inspect the launch log before retrying. Ordinary type checks, unit tests, builds, and ZIP packaging can run in the workspace sandbox.

# Release policy

The user confirmed on 2026-11-24 that future releases of this project must also be submitted to Chrome Web Store through the configured CI, using automatic publication after review approval. A release request authorizes GitHub release publication and Chrome Web Store upload/submission; do not stop after publishing only the GitHub release or ask for the same approval again. Follow the CI run through submission and report its actual outcome. Review approval and store publication are separate from CI success. Keep `CWS_ENABLED=true` and preserve the independent Back to arXiv authorization without changing COSE's release configuration.
