# Learn This E-commerce App Step by Step

This guide is for someone who already knows HTML, CSS, and JavaScript and wants to understand the technologies and ideas used by this app. It follows the app's real code and feature flows. Work through the modules in order; each one gives you files to read, concepts to learn, and something small to try.

## What you are learning

This is a full-stack web app: the browser interface, API server, and database cooperate to deliver one product.

```text
Browser (React + TypeScript)
   | HTTP request / JSON response
   v
API server (Node.js + Express, JavaScript)
   | SQL query
   v
MySQL database
```

The browser runs the client. Express runs the server. MySQL stores durable records. The browser does not connect directly to MySQL.

## Before starting

1. Start MySQL and make sure the schema in [schema.sql](../server/schema.sql) has been loaded.
2. Configure the server's private `.env` file using [server/.env.example](../server/.env.example). Never share or publish the real file; it contains secrets.
3. In a terminal opened at the project root, run `npm run dev`.
4. Open the client URL printed by Vite (normally `http://localhost:5173`). The API normally runs at `http://localhost:5000`.
5. Keep the terminal open while using the app. The client and server print errors and request activity there.

`npm` is the Node.js package manager. Each `package.json` lists scripts and packages for that part of the project. The root `dev` script starts both programs together; see the root [package.json](../package.json), [client/package.json](../client/package.json), and [server/package.json](../server/package.json).

## Suggested study plan

| Stage | Topic | Goal |
| --- | --- | --- |
| 1 | Project map and React | Explain how the page starts and what a component is |
| 2 | TypeScript | Read the data shapes and understand compile-time checks |
| 3 | HTTP, Axios, and async JavaScript | Follow a browser request to the API |
| 4 | Forms and validation | Explain how a form is checked and submitted |
| 5 | Express and routes | Follow an API request through middleware to a handler |
| 6 | MySQL and data relationships | Explain where users, products, and orders are stored |
| 7 | Authentication | Explain password hashing, JWTs, and protected routes |
| 8 | App features as complete flows | Trace search, cart, checkout, and order history end-to-end |
| 9 | CSS and responsive presentation | Relate class names in JSX to visual styles |
| 10 | Practice and debugging | Make small changes and diagnose problems safely |

Take one stage at a time. Read the suggested files first, then follow a flow in the browser, and only then attempt the exercise.

---

## Stage 1 — Project map and how React starts

### New ideas

- **Node.js** lets JavaScript run outside the browser, such as on an API server.
- **React** builds a page from reusable UI functions called components.
- **Vite** runs the client development server and bundles the client for deployment.
- **JSX/TSX** lets a component describe HTML-like UI inside JavaScript/TypeScript.
- A **component** is a function that returns UI. Here, the main component is `App`.
- A **state value** is data React watches. When it changes, React renders the affected UI again.

### Read

1. [client/index.html](../client/index.html) — the browser's initial HTML document, including the element React mounts into.
2. [client/src/main.tsx](../client/src/main.tsx) — finds `#root` and mounts React.
3. [client/src/App.tsx](../client/src/App.tsx#L86) — the main storefront component and its state.
4. [client/vite.config.js](../client/vite.config.js) — Vite's React development/build configuration.

`main.tsx` starts the React tree. `App.tsx` describes the app UI. Most business flows currently live inside `App`, so it is a large file; the helper files split out reusable types, API access, validation, and list loading.

### Try it

- Find the `<h1>` for the sign-in screen in `App.tsx`. Change its text, save, and observe Vite refresh the page.
- Find `activeTab` in `App.tsx`. Follow the `tabs` array and the `activeTab === "shop"` check to see how navigation selects a section.
- Explain in your own words why the HTML page itself does not contain the product cards.

---

## Stage 2 — TypeScript: JavaScript plus checked data shapes

### New ideas

- **TypeScript** adds type checks before the browser code runs. It helps catch mistakes such as using a product's `price` as though it were always a number.
- Types and interfaces are development/build-time descriptions; they do not automatically validate data arriving over the network.
- `string | null` means the value can be either text or `null`.
- `number | string` is a **union type**: code must allow either possibility.
- `CartItem extends Product` means a cart item has all product fields plus a quantity.
- `type StoreTab = "shop" | "cart" | "orders" | "profile"` restricts a value to those exact strings.
- `T` in `useApiData<T>` is a **generic**: the hook can load a different data type depending on how it is used.

### Read

- [client/src/types.ts](../client/src/types.ts) — the application's data shapes.
- [client/src/vite-env.d.ts](../client/src/vite-env.d.ts) — Vite-specific client types.
- [client/tsconfig.json](../client/tsconfig.json) — TypeScript compiler options.
- The frontend uses TypeScript (`.ts`/`.tsx`), but the Express backend remains JavaScript (`server.js`). This project is not an all-TypeScript backend.

For example, `Product` says what the client expects from the API. It does not guarantee that a real API response matches. The server still validates incoming user data, and the client treats browser storage as untrusted when restoring it.

### Try it

- Read `Product`, `CartItem`, and `Order` in `types.ts`. Sketch their fields on paper.
- Temporarily change `Product.stock` from `number` to `string`, then run `npm run typecheck --prefix client`. Read the error and undo your experiment.
- Find one place where `Number(...)` converts a price before doing arithmetic. Why is conversion needed?

---

## Stage 3 — HTTP, JSON, Axios, and asynchronous JavaScript

### New ideas

- **HTTP** is the request/response protocol browsers use to communicate with servers.
- A request has a method (`GET`, `POST`, `PUT`, `DELETE`), a URL, optional headers, and sometimes a body.
- **JSON** is a text format commonly used to send data between client and server.
- An **API endpoint** is a server URL and method that performs an operation.
- **Axios** is a library that sends HTTP requests and exposes their responses to JavaScript.
- `async`/`await` is JavaScript syntax for waiting for **Promises**, values representing work that will finish later.
- `try`/`catch` handles a failed request; `finally` runs whether it succeeds or fails.
- **HTTP status codes** describe the result: `200` means success, `201` creation, `400` invalid input, `401` missing authentication, `403` invalid/expired access, `404` missing resource, and `500` unexpected server failure.

### Read

- [client/src/api/axios.ts](../client/src/api/axios.ts) — one shared Axios instance, its base URL, and API error helpers.
- [client/src/hooks/useApiData.ts](../client/src/hooks/useApiData.ts) — requests for lists, loading/error state, and refreshing.
- [client/src/App.tsx](../client/src/App.tsx#L212) — authentication request.
- [client/src/App.tsx](../client/src/App.tsx#L252) — order submission request.

The shared Axios client uses `VITE_API_URL`, or defaults to `http://localhost:5000/api`. A call such as `api.get("/products")` therefore requests `GET http://localhost:5000/api/products`.

The list hook runs a request in `useEffect`, which is React's way to run work after rendering. Its cleanup flag prevents an old request from overwriting newer results after the request inputs change or the component is cleaned up. `refresh()` changes a counter so the hook loads the same URL again.

### Follow one request

1. Open the storefront and look at the browser developer tools' **Network** tab.
2. Find `GET /api/products`.
3. Inspect its request URL and JSON response.
4. Compare the response fields with `Product` in `types.ts`.
5. Find the matching route in `server/server.js`.

### Try it

- Use the browser directly to visit `http://localhost:5000/api/products`.
- Compare that response with `http://localhost:5000/api/products?search=watch`.
- Turn off the server and reload the client. Find where the error appears and where the server/client logs it.

---

## Stage 4 — Forms, React Hook Form, and Zod

### New ideas

- A browser **form** collects user input and submits it.
- A **controlled input** gets its value from React state and notifies React when changed. Checkout currently uses this pattern.
- **React Hook Form** tracks input values, form submission, and field errors with less manual state wiring.
- **Zod** describes and checks data rules at runtime.
- `zodResolver` connects a Zod schema to React Hook Form.
- Client-side validation improves feedback but is not a security boundary. The server must validate again.

### Read

- [client/src/validation/schemas.ts](../client/src/validation/schemas.ts) — signup/login and profile rules.
- [client/src/App.tsx](../client/src/App.tsx#L106) — `useForm` setup.
- In the auth JSX, find `register`, `handleSubmit`, and `formState.errors`.
- [client/src/App.tsx](../client/src/App.tsx#L252) — checkout's controlled state, manual validation, and submit handler.

The login and signup form share fields, but the schema depends on whether the user is signing up. Login requires an email and non-empty password. Signup additionally checks the name and requires a longer password. Profile has its own name schema.

When the user submits, `handleSubmit` asks the resolver to validate values. On success, it calls the async handler; on failure, React Hook Form exposes the messages in `formState.errors`. The checkout form intentionally keeps a single state object and change handler.

### Try it

- Type an invalid email on login and submit. Find the error in the UI and then find its source in `schemas.ts`.
- Try a short signup password. Follow how a Zod message reaches the screen.
- Change the profile name to one character and save.
- Explain why the server has its own validation even though these checks run in the browser.

---

## Stage 5 — Express, middleware, routes, and request data

### New ideas

- **Express** is a Node.js framework for defining HTTP routes and middleware.
- **Middleware** runs during a request before (or after) the route handler. It can log, parse JSON, check authentication, and handle errors.
- In an Express handler, `req` is the request and `res` is the response. `next()` passes control to the next middleware.
- `req.body` contains parsed JSON sent by the client.
- `req.query` contains URL query values, such as `?search=watch`.
- `req.params` contains named path values, such as `:id` in `/api/orders/:id`.
- A route handler validates inputs, performs work, and chooses a response status and JSON body.

### Read

- [server/server.js](../server/server.js) — read top to bottom once to see setup, middleware, handlers, and route registration.
- Start with middleware and helper functions near the top.
- Then read `listProductsHandler` at line 158 and its route at line 486.
- Compare the `GET`, `POST`, `PUT`, and `DELETE` order routes near the bottom.

The product route is public. Order routes include `authenticateToken` before their handler, so authentication runs first. Route order matters: Express applies the middleware listed for a route in sequence.

The server returns JSON for both success and errors. Its error helper logs the detailed error server-side but sends a generic message to the browser rather than exposing database internals.

### Try it

- Call `GET /api/products?search=keyboard&minPrice=1&maxPrice=200` and note how the query string becomes `req.query`.
- Try `GET /api/orders` without logging in. Notice the status code and JSON message.
- In the server code, trace one invalid value to its `400` response.

---

## Stage 6 — MySQL and how the data is related

### New ideas

- A **database** stores app data so it survives page refreshes and server restarts.
- A **table** stores records with named columns; a **row** is one record.
- A **primary key** uniquely identifies a row. Here, `id` is an auto-incrementing primary key.
- A **foreign key** links a row to a row in another table and helps preserve valid relationships.
- `SELECT`, `INSERT`, `UPDATE`, and `DELETE` are SQL operations to read, add, change, and remove data.
- A **parameterized query** passes values separately from SQL text. This helps prevent SQL injection.

### Read

- [server/schema.sql](../server/schema.sql) — tables, columns, constraints, and sample products.
- In [server/server.js](../server/server.js), search for `pool.execute` and read the SQL alongside its values.

The main relationships are:

```text
users 1 ----- many checkout_orders
checkout_orders 1 ----- many order_items
products 1 ----- many order_items
```

`checkout_orders` stores order-level details such as address, phone, and total. `order_items` stores each product and quantity for an order, including the price at purchase time. A foreign key connects those rows. Product price can change later; the order item price represents what the customer was charged at checkout.

For example, this pattern separates query text from user-provided values:

```js
await pool.execute(
  "SELECT id, name FROM products WHERE id = ?",
  [productId],
);
```

Do not build a SQL statement by pasting untrusted input into its text.

### Try it

- In MySQL, run `SELECT id, name, price FROM products;`.
- Find the products insert in `schema.sql` and match one row to the storefront.
- Find the `user_id` condition in the order-list query. Why should one user not receive every user's order records?

---

## Stage 7 — Password hashing, JWT, and protected requests

### New ideas

- A **password hash** is a one-way result used to verify a password without storing the original password.
- **bcrypt** hashes passwords with a random salt and a configurable work factor. In `bcrypt.hash(password, 10)`, `10` is the work-factor setting; it is not the user's password or a JWT secret.
- `bcrypt.compare(typedPassword, storedHash)` checks a login attempt against the saved hash.
- A **JWT (JSON Web Token)** is a signed token the server issues after login. The client sends it later to prove it has an authenticated session.
- A signature lets the server detect changed token contents. A normal signed JWT is **not encrypted**; do not put secrets in its payload.
- `JWT_SECRET` is a private server-only key used to sign and verify tokens. It is not sent to the browser.
- `Authorization: Bearer <token>` is the request header used by this app for protected endpoints.

### Read

- [server/server.js](../server/server.js#L56) — `authenticateToken` checks a token.
- [server/server.js](../server/server.js#L87) — signup hashes a password and issues a token.
- [server/server.js](../server/server.js#L127) — login verifies the stored hash and issues a token.
- [client/src/App.tsx](../client/src/App.tsx#L212) — client saves the login response and changes state.
- [server/.env.example](../server/.env.example) — safe variable names/placeholders; the real `.env` remains private.

### Login sequence

1. The browser sends email and password to `POST /api/auth/login`.
2. The server looks up that email in MySQL.
3. bcrypt compares the submitted password with the stored hash.
4. If they match, the server signs a JWT and sends it with basic user information.
5. The client saves the token in browser storage and updates React state.
6. For an order request, the client sends the token in the `Authorization` header.
7. `authenticateToken` verifies the signature and expiry before the handler runs.

This project stores the token in `localStorage` for simplicity. Production apps often choose an `HttpOnly`, `Secure`, appropriately `SameSite` cookie and add CSRF protections as needed. Any script running in the page can potentially read local storage, so preventing cross-site scripting is important.

### Try it

- Use the browser Network tab to inspect a login request and then an authenticated order request. Never paste a real token into a public place.
- Find the bcrypt hash in the signup handler and the matching compare in login.
- Explain the difference between `JWT_SECRET`, the user's password, and the password hash.

---

## Stage 8 — Trace the main features end-to-end

### Product search and price filtering

1. The search inputs and applied filter values are React state in [App.tsx](../client/src/App.tsx#L86).
2. Submitting builds URL query parameters and reloads the product list.
3. The server reads `req.query`, validates the values, and creates SQL conditions with placeholders.
4. MySQL returns matching products; the client renders them.

Practice: search for `watch`, set a maximum price, then inspect the request URL in Network tools. The browser sends a query string; it does not filter the entire database itself.

### Cart persistence

The cart is React state while the app is open and is saved in `localStorage` under a key for the signed-in user's ID. The user/cart restore helpers are at the top of [App.tsx](../client/src/App.tsx#L20). This allows the same browser to restore the same account's cart after logout and login. It does **not** synchronize carts across devices or browsers, because the cart is not stored on the server.

Practice: add items, refresh, log out, log in again, then inspect browser Application/Storage tools. Use test data only on a machine you control.

### Checkout and database transaction

1. The client validates street address, city, state/province, postal code, phone number, payment method, and that the cart is not empty. `checkoutSchema` in `client/src/validation/schemas.ts` defines the field rules; the controlled checkout state remains in `App.tsx`.
2. It sends product IDs and quantities to `POST /api/orders`.
3. The server validates all values again and checks the token.
4. The server opens a MySQL transaction and locks each product row while checking stock and price.
5. It calculates totals using **database prices**, inserts the order and item rows, decreases stock, and commits.
6. If something fails, it rolls back so a partial order/stock update is not left behind.
7. On success the browser clears the cart and refreshes orders and products.

The street, city, province, and postal code are combined into the `address` value, while phone is sent and stored in its own `checkout_orders.phone` column. Existing databases need the migration in `server/migrations/20261019_add_order_phone.sql`. The total shown in the browser is useful for display, but it is not trusted for the saved order total. A user can change browser data; the server is the authority.

Read the client handler in [App.tsx](../client/src/App.tsx#L252) and the server handler in [server.js](../server/server.js#L251).

### Order history, updates, and profile

- The order list is requested only when a token exists.
- The server filters order rows by the authenticated user's ID.
- Status changes use `PUT`; deletion uses `DELETE` after a confirmation prompt.
- Profile editing saves a name and returns a replacement JWT because the token contains the user's display name.

Read order actions in [App.tsx](../client/src/App.tsx#L299) and their server handlers from [server.js](../server/server.js#L357) onward.

---

## Stage 9 — CSS and visual structure

### New ideas

- A **CSS selector** chooses which elements receive a style.
- A **class selector** such as `.product-card` matches elements with `className="product-card"` in JSX.
- **Flexbox** and **CSS Grid** arrange elements in rows/columns and adapt to available space.
- **Responsive CSS** changes layout at different screen sizes, often with media queries.

### Read

- [client/src/index.css](../client/src/index.css) — global/base styling.
- [client/src/App.css](../client/src/App.css) — storefront, cards, forms, and page-specific classes.
- In `App.tsx`, search for `className="product-card"` and find `.product-card` in `App.css`.

React uses `className` instead of HTML's `class` attribute because `class` is a JavaScript keyword.

### Try it

- Change a temporary color in `.product-card` or `.btn-add-cart`, save, and see which elements change.
- Resize the browser to inspect whether the grid wraps.
- Restore the original design after your experiment.

---

## Stage 10 — Build, type-check, lint, and debug

### Useful commands

Run these from the project root:

```sh
npm run dev
npm run build --prefix client
npm run typecheck --prefix client
npm run lint --prefix client
node --check server/server.js
```

- **Build** type-checks and creates optimized client files in `client/dist`.
- **Type-check** reports TypeScript errors without making the production bundle.
- **Lint** checks source code for common code-quality problems.
- `node --check` checks server JavaScript syntax; it does not test database behavior.

### A reliable debugging sequence

1. Reproduce the problem and write down the exact click/inputs.
2. Read the browser console for client errors.
3. Read the Network tab: URL, method, status, request body, response body.
4. Read the server terminal request log and error details.
5. Identify whether the failure is in the UI, HTTP request, route/validation, SQL, or configuration.
6. Make one small change and repeat the same steps.
7. Run the relevant build/type/lint check.

Do not put real passwords, JWTs, database credentials, or the private `.env` file into screenshots, chat messages, or source control.

---

## Beginner project exercises

Complete these in order, keeping each change small:

1. **UI text:** Change a heading and locate the corresponding React component.
2. **Display a field:** Show a product's stock on each card.
3. **Search behavior:** Explain which code builds the query string and which code turns it into SQL.
4. **Validation:** Change the minimum signup name length and observe the frontend error. Then update the matching server rule so the client and server agree.
5. **API response:** Find an endpoint's success status and JSON shape, then locate the client code that consumes it.
6. **Database:** Add a sample product using SQL and verify it appears in the catalog.
7. **Cart:** Explain what browser storage key is used and why the cart is not shared across devices.
8. **Order flow:** Draw the checkout request, server transaction, and success response as a sequence diagram.
9. **Type safety:** Add a `category` field to the database, API response type, and product card. This requires changing every relevant layer, not only `types.ts`.
10. **Error handling:** Cause a validation error intentionally and follow it from server response to the field message in the UI.

## Self-check

Before moving on, try to answer these without looking:

1. What is the difference between React state and MySQL data?
2. What does Axios do, and where is its base URL configured?
3. What is the difference between a route parameter and a query parameter?
4. Why does the server validate data even when the browser uses Zod?
5. What information does the client send to the server at checkout?
6. Why does the server reload product prices instead of trusting the browser total?
7. What does bcrypt store, and how does login check the password?
8. What does a JWT prove, and what does its signature not provide?
9. Why are SQL placeholders used?
10. What can make an order request return `401`, `400`, or `500`?

If you can trace a click from JSX to an HTTP request, to an Express handler, to SQL, and back to updated UI, you understand the core architecture of this app.
