# Shopee Clone Client

The client uses React, Vite, and TypeScript. Copy `.env.example` to `.env` and set `VITE_API_URL` to the server API base URL (default: `http://localhost:5000/api`).

Install dependencies with `npm install`, then start the development server with `npm run dev`. Run `npm run typecheck` to check TypeScript types or `npm run build` to type-check and create a production build.

The shared Axios client is in `src/api/axios.ts`, and the reusable API-loading hook is in `src/hooks/useApiData.ts`.
