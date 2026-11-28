The factory explicitly selects `gpt-5.6-sol`. A read-only authenticated model
inventory on 2026-11-28 reported it as this runtime's visible default model.
This is evidence for this runtime, not a general subscription availability claim.
The factory stops if that model is unavailable; it does not select an API-billed
fallback.

`model-catalog.json` contains only that model's capability fields, selected through
an explicit allowlist from the [official Codex 0.148.0 model catalog](https://github.com/openai/codex/blob/rust-v0.148.0/codex-rs/models-manager/models.json),
verified against Git blob `3b6d62393e40291e20f5c9dfb6fe80c986e1712f`.
No account fields, credentials, personalization, or downloaded instruction
templates are included. The base instruction is factory-owned text.

The image copies this catalog to `/opt/factory-model-catalog.json` as a read-only
file. All three phases explicitly use it. It disables the built-in shell, patch,
Node REPL, search, experimental and multi-agent capabilities and selects direct
tool mode. The fixed MCP server supplies bounded source/evidence reads, PNG
screenshots, and implementation-only source edits. This prevents the built-in
patch tool from moving CLI authentication files into the writable source snapshot.

Codex 0.148.0's [ModelInfo definition](https://github.com/openai/codex/blob/rust-v0.148.0/codex-rs/protocol/src/openai_models.rs)
defines the catalog format. Its [tool registration](https://github.com/openai/codex/blob/rust-v0.148.0/codex-rs/core/src/tools/spec_plan.rs)
adds the built-in patch tool only when `apply_patch_tool_type` is present. Offline
container checks deserialize the fixed catalog and validate CLI settings without
authenticating or invoking a model. Update the CLI and catalog deliberately, and
repeat these checks before a real job.
