# Million Dollar App

A full-stack e-commerce checkout application built for the Full-Stack Form Application project. Customers can register or log in, browse a MySQL-backed product catalog, manage a cart, place an order, and review or update their order history.

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

## Requirements

- Node.js 20.19+ (required by the current Vite release)
- MySQL 8 or compatible

## Setup

1. Install root and app dependencies:

   ```sh
   npm install
   npm install --prefix server
   npm install --prefix client
   ```

2. Create the database and sample products by running [server/schema.sql](./server/schema.sql) in MySQL.

3. Copy `server/.env.example` to `server/.env` and set the database credentials and a long, random `JWT_SECRET`. Copy `client/.env.example` to `client/.env` if the API URL differs from its default. `.env` files are ignored by Git.

4. Start both services from the project root:

   ```sh
   npm run dev
   ```

   Or start them separately with `npm run dev --prefix server` and `npm run dev --prefix client`.

   The default client URL is http://localhost:5173 and the default API URL is http://localhost:5000.

## API

All order routes require `Authorization: Bearer <token>`. Order records are restricted to the signed-in user.

| Method | Endpoint | Purpose | Success / error statuses |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Create account and issue JWT | 201, 400 |
| POST | `/api/auth/login` | Authenticate and issue JWT | 200, 400 |
| PUT | `/api/auth/profile` | Update the signed-in user's name | 200, 400, 404 |
| GET | `/api/products` | List catalog products | 200, 500 |
| POST | `/api/products` | Create a product (authenticated) | 201, 400, 500 |
| POST | `/api/orders` | Create an order and decrement stock transactionally | 201, 400, 500 |
| GET | `/api/orders` | List the signed-in user's orders | 200, 500 |
| GET | `/api/orders/:id` | Get one of the signed-in user's orders | 200, 400, 404 |
| PUT | `/api/orders/:id` | Update an order status | 200, 400, 404 |
| DELETE | `/api/orders/:id` | Delete an order | 200, 400, 404 |

All database operations use parameter placeholders. Checkout totals and item prices are calculated from current database product prices; client-supplied prices and totals are not trusted. Invalid form input returns `400` with an explanatory error and, when applicable, field errors.

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

## Bonus features

- Order status updates (`PUT /api/orders/:id`, +3 rubric points).
- JWT authentication and protected API routes (+4 points if JWT was covered in class).

## Known issues and setup requirements

- MySQL must be running, and the schema must be loaded before using the catalog, registration, or checkout features.
- A non-empty `JWT_SECRET` must be configured in `server/.env`.
- Product creation is exposed as an authenticated API route but is not currently available in the customer interface.
