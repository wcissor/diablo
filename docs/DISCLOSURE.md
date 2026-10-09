# Models, data and components used

Disclosure for the hackathon (rule 04). Versions are exactly those in `package.json`, `site/package.json` and `engine/requirements.txt`.

## Models

| Where | Model | Role |
|---|---|---|
| Live engine (`src/lib/live/`), default | Claude Opus 5.5 (`claude-opus-5-5`) | Investigator: designs the study, writes the answer |
| Live engine, default | Claude Haiku 4.5 (`claude-haiku-4-5`) | The model under test |
| Live engine, when an admin switches the system to Gemini | Gemini 3.8 Flash and Gemini 3.5 Flash-Lite | Investigator and model under test |
| Python engine (`engine/`) | Gemini via `google-genai` | Experimental; tests use a mocked client |
| Development | Claude Code (AI coding assistance) | Used by the team while building |

No model is trained or fine-tuned. No model output is ever used as a number or a score: every check and every statistic is computed by code (`src/lib/live/study.ts`, `src/lib/stats.ts`).

## Data

- Live investigations: test cases are written for each question by the investigator model and checked by code. No dataset is collected or stored.
- Default scenario (a run with no question): seeded synthetic arithmetic with exact answers computed by code.
- Benchmark: 45,000 seeded simulated scenarios (`src/lib/bench/`, `docs/BENCHMARK.md`).
- Unit and end-to-end tests use hand-written fixtures (`src/lib/data/mock/`).
- No personal, customer or scraped data. Google sign-in keeps only name and email in a signed cookie; there is no database.

## Components

### Web app (`package.json`)

| Package | Version |
|---|---|
| `@radix-ui/react-dialog` | ^1.2.0 |
| `@radix-ui/react-dropdown-menu` | ^2.1.25 |
| `@radix-ui/react-popover` | ^1.2.0 |
| `@radix-ui/react-tooltip` | ^1.3.0 |
| `cmdk` | ^1.1.1 |
| `jose` | ^6.2.12 |
| `lucide-react` | ^1.52.0 |
| `motion` | ^14.0.0 |
| `next` | 16.4.0 |
| `react` | 19.3.0 |
| `react-dom` | 19.3.0 |
| `server-only` | ^0.0.1 |
| `zod` | ^4.6.5 |

Development and test tooling:

| Package | Version |
|---|---|
| `@axe-core/playwright` | ^4.13.0 |
| `@playwright/test` | 1.56.1 |
| `@tailwindcss/turbopack` | ^4 |
| `@types/node` | ^22.20.5 |
| `@types/react` | ^19 |
| `@types/react-dom` | ^19 |
| `babel-plugin-react-compiler` | 1.0.0 |
| `eslint` | ^9 |
| `eslint-config-next` | 16.4.0 |
| `tailwindcss` | ^4 |
| `tsx` | 4.23.15 |
| `typescript` | ^5 |
| `vitest` | ^5.0.3 |

### Website (`site/package.json`)

| Package | Version |
|---|---|
| `@tailwindcss/turbopack` | ^4 |
| `@types/node` | ^22.20.5 |
| `@types/react` | ^19 |
| `@types/react-dom` | ^19 |
| `eslint` | ^9 |
| `eslint-config-next` | 16.4.0 |
| `motion` | ^14.0.0 |
| `next` | 16.4.0 |
| `react` | 19.3.0 |
| `react-dom` | 19.3.0 |
| `tailwindcss` | ^4 |
| `typescript` | ^5 |

### Python engine (`engine/requirements.txt`)

- `google-genai==2.29.0`
- `python-dotenv==1.2.4`
- `httpx==0.28.1`
- `pytest==9.1.1`

### Other

- Fonts: Geist and Geist Mono (SIL OFL), Newsreader (SIL OFL), self-hosted in the app; the website uses the system font.
- Sign-in: Google OAuth 2.0 / OpenID Connect.
- Hosting: Vercel.
- The logo was traced to vector paths with potrace.
- Statistics reference values in tests come from SciPy and statsmodels.
- No public UI templates or starter kits were used.
