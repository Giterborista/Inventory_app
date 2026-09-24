# Evidence Ledger edition

The Inventory Builder uses one codebase and two build editions:

- `basic` is the existing product and remains the default.
- `evidence` adds the Evidence Ledger builder to activity documentation and to each input/output's Documentation step.

Both editions understand and preserve the same project JSON schema. This prevents Evidence Ledger data from being discarded when an advanced project is opened by the basic edition. Only the builder UI is feature-gated.

## Render deployment

Keep the existing Render web service unchanged, or explicitly set:

```text
NEXT_PUBLIC_APP_EDITION=basic
```

Create a second Render web service from the same repository and branch. Use the same build and start commands, then set:

```text
NEXT_PUBLIC_APP_EDITION=evidence
```

Render gives the second service its own `onrender.com` domain. A second custom domain is optional; use one only when a stable public name is needed.

Do not maintain a second branch or copied application for the advanced edition. Shared fixes should be deployed once to both services, while edition-specific features stay behind the typed feature registry in `app-features.ts`.

## Data flow

The builder writes a structured `evidenceLedger` record and its generated `code` into project JSON:

- `molecule.documentation.evidenceLedger` for activity-level evidence;
- `molecule.rows[].evidenceLedger` for one input or output.

The openLCA converter appends the activity code to the process description and each row code to that exchange's description.
