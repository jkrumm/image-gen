.DEFAULT_GOAL := help

.PHONY: help app app-run app-status app-logs dev check gateway-smoke

# The sources that determine what the built app IS. Anything listed here that
# changes makes the installed app stale — see scripts/codesum.ts.
APP_SOURCES := app/src app/src-tauri/src app/src-tauri/capabilities shared/src \
               app/index.html app/vite.config.ts \
               app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml

BUNDLE    := app/src-tauri/target/release/bundle/macos/ImageGen.app
INSTALLED := /Applications/ImageGen.app
STAMP     := $(INSTALLED)/Contents/Resources/.codesum
BUNDLE_ID := com.jkrumm.image-gen
APP_LOG   := $(HOME)/Library/Logs/$(BUNDLE_ID)/imagegen.log

help: ## Show this help (default target — a bare `make` runs it)
	@awk 'BEGIN {FS = ":.*##"; printf "\nimage-gen — run \033[36mmake <target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo ""

##@ The Mac app — this is how you actually use ImageGen

app: ## THE entrypoint: build the release bundle, install it to /Applications, prove it matches your working tree, then exit. Safe to re-run.
	cd app && bun run tauri build --bundles app
	@# Guard the overwrite. /Applications is shared with every other app on the
	@# machine and this target does `rm -rf` — so refuse unless what is already
	@# there is unmistakably a previous install of OURS. A stranger's app with
	@# the same name is a situation for a human, not for a Makefile.
	@if [ -e "$(INSTALLED)" ]; then \
	  ID=$$(plutil -extract CFBundleIdentifier raw "$(INSTALLED)/Contents/Info.plist" 2>/dev/null || echo "?"); \
	  if [ "$$ID" != "$(BUNDLE_ID)" ]; then \
	    echo "✗ $(INSTALLED) exists but its bundle id is '$$ID', not '$(BUNDLE_ID)' — refusing to overwrite something that isn't ours."; \
	    exit 1; \
	  fi; \
	fi
	@# Copying over a running app leaves it running the deleted bundle: the old
	@# code stays live in memory, so you would "verify" the new build by clicking
	@# around in the old one. Quit it first. Checked with `pgrep -x` on the exact
	@# executable name — never a broad `pkill -f` pattern, which SIGTERMs whatever
	@# else happens to match (see dotfiles rules/makefile-conventions.md).
	@if pgrep -x image-gen >/dev/null 2>&1; then \
	  echo "  quitting the running ImageGen before replacing it…"; \
	  osascript -e 'tell application id "$(BUNDLE_ID)" to quit' >/dev/null 2>&1 || true; \
	  for i in 1 2 3 4 5 6 7 8 9 10; do \
	    pgrep -x image-gen >/dev/null 2>&1 || break; \
	    sleep 1; \
	  done; \
	  if pgrep -x image-gen >/dev/null 2>&1; then \
	    echo "✗ ImageGen is still running after 10s — quit it by hand, then re-run. (Not force-killing: it owns writes to ~/Pictures/ImageGen.)"; \
	    exit 1; \
	  fi; \
	fi
	rm -rf "$(INSTALLED)"
	cp -R "$(BUNDLE)" "$(INSTALLED)"
	@bun scripts/codesum.ts $(APP_SOURCES) > "$(STAMP)"
	@# ASSERT, don't nuke. There is deliberately no CLEAN=1 / `cargo clean` escape
	@# hatch on this target: cargo and Vite both key their caches on content, so a
	@# nuclear rebuild cannot buy correctness — it can only hide which of "the build
	@# was stale" and "the build was fine and something else is wrong" you are
	@# actually looking at. Instead we PROVE it: the fingerprint recorded inside the
	@# installed bundle must equal a fresh fingerprint of the working tree. A
	@# mismatch here means the tree was edited mid-build, so the .app you just
	@# installed is already not what you have on disk.
	@$(MAKE) --no-print-directory app-status
	@echo "✓ installed → $(INSTALLED)   (launch it: make app-run)"

app-run: ## Launch the installed app — refuses if it is not built from your current working tree.
	@if [ ! -e "$(INSTALLED)" ]; then echo "✗ not installed. Run: make app"; exit 1; fi
	@$(MAKE) --no-print-directory app-status
	@open -a "$(INSTALLED)"
	@echo "✓ launched. Logs: make app-logs"

app-status: ## Is the app in /Applications actually built from your working tree? Exits non-zero if not.
	@if [ ! -e "$(INSTALLED)" ]; then echo "✗ $(INSTALLED) does not exist — run: make app"; exit 1; fi
	@printf "  verifying the installed app matches your working tree… "
	@HOST=$$(bun scripts/codesum.ts $(APP_SOURCES)); \
	INST=$$(cat "$(STAMP)" 2>/dev/null); \
	if [ -z "$$INST" ]; then \
	  echo "NO FINGERPRINT"; \
	  echo "✗ the installed app carries no fingerprint — it predates this Makefile, or was copied in by hand. Re-run: make app"; \
	  exit 1; \
	elif [ "$$HOST" = "$$INST" ]; then \
	  echo "ok ($$HOST)"; \
	else \
	  echo "MISMATCH"; \
	  echo "✗ the app in /Applications is NOT your working tree — what you see in it is code you no longer have."; \
	  echo "    working tree: $$HOST"; \
	  echo "    installed:    $$INST"; \
	  echo "  Rebuild with: make app"; \
	  exit 1; \
	fi

app-logs: ## Tail the running app's log (this one does not terminate — Ctrl-C to stop)
	@test -f "$(APP_LOG)" || { echo "no log yet at $(APP_LOG) — start the app first (make app-run)"; exit 1; }
	tail -f "$(APP_LOG)"

##@ Development — for changing the code, not for using the app

dev: ## Dev-server pair: gateway on :7716 (--watch) + `tauri dev` with HMR. For writing code; `make app` is how you actually use ImageGen.
	bun run dev

check: ## format:check + lint + typecheck across all workspaces, then the full test suite
	bun run pre
	bun test

##@ Gateway

gateway-smoke: ## Probe the deployed gateway: /health (unauthenticated) + an authenticated /enhance round trip.
	@BASE=$${IMAGE_GEN_BASE_URL:-$$(secrets-run read op://vps/image-gen-gateway/BASE_URL 2>/dev/null)}; \
	if [ -z "$$BASE" ]; then echo "✗ set IMAGE_GEN_BASE_URL=https://<host> or seed op://vps/image-gen-gateway/BASE_URL"; exit 1; fi; \
	echo "  GET $$BASE/health"; \
	curl -sS --max-time 10 "$$BASE/health" || { echo "✗ unreachable — the gateway is Tailscale-only, so check the tailnet first"; exit 1; }; \
	echo ""; \
	TOKEN=$$(secrets-run read op://vps/image-gen-gateway/API_SECRET 2>/dev/null); \
	if [ -z "$$TOKEN" ]; then echo "⚠ no API_SECRET in the offline cache — skipping the authenticated probe"; exit 0; fi; \
	echo "  POST $$BASE/enhance"; \
	curl -sS --max-time 60 -X POST "$$BASE/enhance" \
	  -H "Authorization: Bearer $$TOKEN" -H "Content-Type: application/json" \
	  -d '{"brief":"a small red fox icon, flat vector style"}' | head -c 400; \
	echo ""
