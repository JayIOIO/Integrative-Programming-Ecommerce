# Million Dollar App

A full-stack e-commerce checkout application built for the Full-Stack Form Application project. Customers can register or log in, browse a MySQL-backed product catalog, manage a cart that is saved per account in the browser, place an order, and review or update their order history.

## Tech stack

- Client: React 19, TypeScript, Vite, Axios
- Server: Node.js, Express 5, CORS
- Database: MySQL with a `mysql2/promise` connection pool
- Authentication: JWT and bcryptjs

## Project structure

```text
client/     React + TypeScript application
server/     Express API, MySQL schema, and environment example
```

## Learning the codebase

If you are new to React, TypeScript, APIs, Express, or MySQL, follow the staged [learning guide](./docs/LEARNING_GUIDE.md). It explains the app's architecture, traces its main flows, and includes practice exercises.

## Requirements

- Node.js 20.19 or newer and npm (required by the current Vite release)
- MySQL 8 or a compatible MySQL server
- A MySQL account that can create/use the `ecommerce_db` database
- Git, if you are cloning the repository

## Setup

### 1. Get the project and install dependencies

If you have not already downloaded the project, clone it and move into the project folder:

```sh
git clone https://github.com/JayIOIO/Integrative-Programming-Ecommerce.git
cd Integrative-Programming-Ecommerce
```

Install the root, server, and client dependencies from the project root:

```sh
npm install
npm install --prefix server
npm install --prefix client
```

### 2. Create the database

Start MySQL, then open `server/schema.sql` in MySQL Workbench (or XAMPP PHPMyAdmin) and execute the whole file. It creates `ecommerce_db`, the application tables, and sample products. See [server/schema.sql](./server/schema.sql).

### 3. Configure environment files

Copy the example files:

```sh
cp server/.env.example server/.env
cp client/.env.example client/.env
```

On Windows PowerShell, use:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Edit `server/.env` and set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to match your MySQL installation. Keep `PORT=5000` and `CORS_ORIGIN=http://localhost:5173` for the default local setup. Replace `JWT_SECRET` with a long, random secret; for example, generate one with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `server/.env`. Do not put that value in the client environment file, source code, screenshots, or Git. The client `.env` can usually keep `VITE_API_URL=http://localhost:5000/api`; change it only if your API uses a different URL. Environment files are ignored by Git; only the example templates should be shared.

### 4. Start the application

From the project root:

```sh
npm run dev
```

This starts the Express API and Vite client in the same terminal. Keep the terminal open. Open the client URL printed by Vite (normally `http://localhost:5173`); the API is normally at `http://localhost:5000`.

You can also start each service in its own terminal from the project root:

```sh
npm run dev --prefix server
npm run dev --prefix client
```

To confirm the API is reachable, open `http://localhost:5000/api/products`. It should return a JSON list. If the browser reports “Network Error,” check that both services are running, the client API URL points to the server, and the CORS origin matches the browser URL.

### 5. Build and check the client

From the project root:

```sh
npm run build --prefix client
npm run lint --prefix client
```

## API

All order routes require `Authorization: Bearer <token>`. Order records are restricted to the signed-in user.

| Method | Endpoint | Purpose | Success / error statuses |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Create account and issue JWT | 201, 400 |
| POST | `/api/auth/login` | Authenticate and issue JWT | 200, 400 |
| PUT | `/api/auth/profile` | Update the signed-in user's name | 200, 400, 404 |
| GET | `/api/products` | List products; optional `search`, `minPrice`, and `maxPrice` query parameters | 200, 400, 500 |
| POST | `/api/products` | Create a product (authenticated) | 201, 400, 500 |
| POST | `/api/orders` | Create an order and decrement stock transactionally | 201, 400, 500 |
| GET | `/api/orders` | List the signed-in user's orders | 200, 500 |
| GET | `/api/orders/:id` | Get one of the signed-in user's orders | 200, 400, 404 |
| PUT | `/api/orders/:id` | Update an order status | 200, 400, 404 |
| DELETE | `/api/orders/:id` | Delete an order | 200, 400, 404 |

All database operations use parameter placeholders. Checkout totals and item prices are calculated from current database product prices; client-supplied prices and totals are not trusted. Invalid form input returns `400` with an explanatory error and, when applicable, field errors.

The catalog supports searching product names and descriptions and filtering by price. For example, `/api/products?search=headphones&minPrice=20&maxPrice=100` returns matching products within the requested price range. Search text is limited to 100 characters; prices must be non-negative numbers, with the minimum no greater than the maximum.

Checkout validates Philippine shipping addresses in the client: a numbered street/lot address, city or municipality, province or region, and four-digit ZIP code. Phone validation is country-independent: it accepts an optional leading `+`, standard separators, and 7–15 digits. Phone numbers are stored independently in `checkout_orders.phone`, not appended to the address. For an existing database, run [the order phone migration](./server/migrations/20261019_add_order_phone.sql) before using the updated checkout API. These format checks cannot confirm that an address or phone number exists or is serviceable.

## Screenshots

These UI captures use sample data from a temporary demo API; they do not create or alter MySQL records.

### Sign-in

![Sign-in screen](./client/docs/screenshots/sign-in.png)

### Product catalog

![Product catalog](./client/docs/screenshots/product-catalog.png)

### Checkout

![Checkout form](./client/docs/screenshots/checkout.png)

### Order history

![Order history](./client/docs/screenshots/order-history.png)

### Account Management

![Change name](./client/docs/screenshots/account-settings.png)

## Bonus features

- Order status updates (`PUT /api/orders/:id`, +3 rubric points).
- JWT authentication and protected API routes (+4 points).
- Product search and price filtering through API query strings (+2 rubric points).
- React Hook Form and Zod validation for login, signup, checkout form and profile updates.

## Known issues and setup requirements

- MySQL must be running, and the schema must be loaded before using the catalog, registration, or checkout features.
- A non-empty `JWT_SECRET` must be configured in `server/.env`.
- Product creation is exposed as an authenticated API route but is not currently available in the customer interface.
