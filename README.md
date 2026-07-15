# Proxy Reconstruction Studio

UI-only browser application for proxy modelling of molecules missing from ecoinvent in pharmaceutical LCA.

## Current product shape

- Next.js frontend only
- JSON open/save is the primary project workflow
- automatic browser-local draft backup, with JSON open/export as the portable project workflow
- no server-side project storage
- molecule hierarchy, reconstruction rows, documentation, graph view, PubChem enrichment, PAS defaults, and PDF export are all handled in the client UI

## Local setup

1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` to enable the AI-guided ecoinvent search.
4. Run `npm run dev`.
5. Open [http://localhost:3000](http://localhost:3000).

## ecoinvent search beta

The row dataset picker opens with a direct ecoQuery search. `MARKET_ACTIVITY` is selected by default, while the activity-type menu also offers transforming activities, market groups, production mixes, and all activity types. Researchers can filter the literal activity/product query with the live sector, ISIC section, and ISIC class facets returned by ecoQuery. Before a query, these menus load the complete live catalogue; after a query, they update to the classifications relevant to that query. Results are grouped by activity name, reference product, unit, and activity type; expanding a group exposes every exact geography-specific dataset. Each geography row can load its public product information, general comment, included-activity descriptions, synonyms, identifiers, and sector before the researcher selects it. This manual path does not call OpenAI.

`Ask AI` is a separate, optional action with this autonomous pipeline:

1. OpenAI normalizes the researcher term and adds a small set of synonyms or technical names.
2. Every term is searched in live ecoQuery metadata with `MARKET_ACTIVITY` fixed.
3. Geography variants are aggregated before distinct candidate families are counted.
4. Up to 40 distinct candidate families are evaluated directly. Above 40, OpenAI selects one live ecoQuery ISIC class or, when a second class is needed to avoid a material miss, two classes. Every enriched term is searched in each selected class, the results are merged and deduplicated, and all remaining candidates are evaluated in batches of at most 10.
5. Only exact (Degree 0) and normalized (Degree 1) matches with a matching reference product, compatible unit, and no silent change of composition or function can be proposed. Up to three suitable candidates are shown.
6. If none is suitable, a defensibly single-material object is retried once using its inferred material. Chemicals receive unverified synonym/family/proxy ideas only. Equipment and multi-component objects are routed to foreground activity creation with possible components shown only as examples. Known materials remain unresolved for researcher-led proxy review.

During a search, the server streams each real pipeline transition and the dialog shows the current step in a compact progress row. The completed trace—including selected variables, enriched terms, live ISIC options, candidate names, batch membership, and per-candidate decisions—is available only under the collapsed reasoning disclosure.

After an AI search completes, the normal interface shows a compact interpretation/confidence summary and the recommended activity families first. The detailed pipeline variables remain available under a collapsed AI reasoning trace. Geography is not used for AI ranking: every recommendation retains the geography-specific dataset IDs returned by ecoQuery and requires the researcher to expand the family and choose an exact geography before selection.

There is no enriched-term approval, ISIC confirmation, proxy permission conversation, automatic multi-material decomposition, or case-specific material rule. The AI path remains fixed to market activities; only the manual path can remove that filter and expose transforming activities. The OpenAI key is read only by the server route and is never sent to the browser. The assistant evaluates only dataset IDs returned by ecoQuery and does not retrieve inventories, exchanges, or impact scores.

Geography is displayed as returned metadata but excluded from counting and AI suitability evaluation during this beta. A researcher must still verify the selected dataset documentation, reference product, technology, unit, and system boundary.

This beta searches ecoinvent 3.12 using the cut-off system model. It does not cache or redistribute inventories, exchanges, or impact scores. Before deploying it to multiple users or sending licensed metadata to an external model provider, confirm the intended integration and data-processing terms with ecoinvent and your institution.

## Working model

- Start with the studied product or process result and define its reference amount and unit
- Add physical inputs and outputs, then match each input to ecoinvent or model it as another activity
- Record the goal, functional unit, sources, calculations, assumptions, and limitations
- Open an existing project with `Open JSON`
- Edit the project in the browser session
- Export a portable copy with `Export JSON`

The current draft is backed up in the same browser automatically. Exported JSON remains the recommended format for sharing, archiving, and moving work between browsers.

Project data is intended to travel as JSON files shared internally by the team.
