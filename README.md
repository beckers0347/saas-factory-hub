# saas-factory-hub

Control plane for the Autonomous Micro-SaaS Factory (blueprint v3, "mechanically enforced").

The rule behind everything here: **a prompt is a request, a credential is a control.**
Agents propose (patch files, drafts, queue files). Non-LLM scripts and CI apply. Only the
owner releases: merging, deploying, sending, charging and changing a gate all need a
credential the agent box never holds.

| Path | What it is |
|---|---|
| `plugins/saas-factory/` | The Claude Code plugin: agents, skills, commands, five scoped MCP servers |
| `portfolio/registry.json` | Product state machine. Status changes only through an owner-approved PR |
| `scripts/` | Non-LLM enforcement: status gate, patch applier, cron wrappers, review/send, kill switch |
| `agent-box/settings.json` | Deny list passed to every unattended run with `--settings` |
| `templates/product-repo/` | Files to copy into each product repo (agent-branch CI) |
| `docs/SETUP.md` | What is done, what was verified, and the steps only the owner can do |

Run the MCP server tests with `npm test` inside `plugins/saas-factory/mcp` (Node 22+, no dependencies).

Start with [docs/SETUP.md](docs/SETUP.md).
