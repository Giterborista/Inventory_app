# Proxy Reconstruction Studio

UI-only browser application for proxy modelling of molecules missing from ecoinvent in pharmaceutical LCA.

## Current product shape

- Next.js frontend only
- JSON open/save is the primary project workflow
- no browser autosave or server-side project storage
- molecule hierarchy, reconstruction rows, documentation, graph view, PubChem enrichment, PAS defaults, and PDF export are all handled in the client UI

## Local setup

1. Install Node.js 20+ and npm.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000).

## Working model

- Open an existing project with `Open JSON`
- Edit the project in the browser session
- Save the project with `Save JSON`
- Close the page when done

Project data is intended to travel as JSON files shared internally by the team.
