# Browser testing in Codex on macOS

Run commands that launch Chrome or Playwright with an approved execution context (`sandbox_permissions: "require_escalated"`). This includes integration tests, memory tests, store artwork generation, and local HTML screenshots. Request this context on the initial launch.

Use a fresh temporary browser profile for each test run and close it in `finally`. Keep the user's existing Chrome profile and windows intact.

The restricted execution context on this machine has caused Chrome to abort during macOS application registration, producing a system “Reopen” prompt before any extension code loads. Treat that failure as a browser-launch environment issue and inspect the launch log before retrying. Ordinary type checks, unit tests, builds, and ZIP packaging can run in the workspace sandbox.
