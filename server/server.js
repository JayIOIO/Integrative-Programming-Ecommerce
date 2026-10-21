// Pull in the libraries we need for the server.
// express handles routing, mysql2 talks to the database,
// cors lets our React frontend make requests to this server,
// bcryptjs hashes passwords, and jsonwebtoken creates login tokens.
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load environment variables from server/.env so we don't hardcode secrets in the code
require('dotenv').config();

// Create the Express application — this is the main object we attach routes to
const app = express();

// Read the allowed frontend URLs from .env (e.g., http://localhost:5173).
// If multiple origins are listed separated by commas, split them into an array.
// If nothing is set, allowedOrigins stays undefined and cors() allows all origins.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : undefined;

// --- Middleware ---
// Middleware runs on every request before the route handler gets it.

// Request logger — prints the method, URL, status code, and duration to the terminal.
// This runs after the response is sent (the 'finish' event) so we can include the status code.
app.use((req, res, next) => {
  const startedAt = Date.now(); // note when the request arrived
  res.on('finish', () => {
    // Log it once the response has fully been sent
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next(); // pass control to the next middleware
});

// Enable CORS — without this the browser blocks requests from the frontend to our API
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));

// Parse incoming JSON request bodies so we can read req.body as a plain object
app.use(express.json());

// --- Database connection pool ---
// A pool keeps several connections open and reuses them.
// Opening a new connection for every request is slow; the pool handles that for us.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',     // MySQL server address
  user: process.env.DB_USER || 'root',          // MySQL username
  password: process.env.DB_PASSWORD || '',       // MySQL password (empty string if none)
  database: process.env.DB_NAME || 'ecommerce_db', // which database to use
  waitForConnections: true,   // queue requests instead of throwing if all connections are busy
  connectionLimit: 10,        // keep at most 10 connections open at once
});

// Valid payment methods — using a Set makes the .has() lookup O(1) regardless of list size
const paymentMethods = new Set(['Credit Card', 'PayPal', 'Cash on Delivery']);

// Valid order statuses — any value outside this set will be rejected by the update handler
const orderStatuses = new Set(['Pending', 'Processing', 'Shipped', 'Delivered']);

// --- Helper functions ---

// isRecord checks that a value is a non-null plain object (not an array, not null).
// We use this before reading fields from req.body because JSON.parse could return anything.
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// getJwtSecret reads the secret from .env and throws if it hasn't been set.
// We throw rather than silently returning undefined because a missing secret would
// let anyone forge a valid token — that would be a serious security bug.
function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return process.env.JWT_SECRET;
}

// reportServerError logs the full error on the server terminal and sends a generic 500 to the client.
// We don't send the raw error to the browser because it can expose database details or stack traces.
function reportServerError(res, context, error) {
  console.error(`${context}:`, error); // full details printed for us to debug
  return res.status(500).json({ error: 'An unexpected server error occurred.' }); // safe message for the client
}

// authenticateToken is middleware that protects routes requiring a login.
// It reads the Bearer token from the Authorization header, verifies it, and attaches
// the decoded user object to req.user so route handlers can use it.
function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  // The header format is "Bearer <token>" — we strip the "Bearer " prefix to get the token string
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  // If there's no token at all, the user isn't logged in — reject with 401 Unauthorized
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // jwt.verify both checks the signature and decodes the payload
    const user = jwt.verify(token, getJwtSecret());

    // Make sure the decoded payload has the fields we expect.
    // A malformed or forged token might pass signature check but have wrong data.
    if (
      !isRecord(user) ||
      !Number.isInteger(user.id) ||
      typeof user.email !== 'string' ||
      typeof user.name !== 'string'
    ) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Attach the user data to the request so the next handler can use req.user.id etc.
    req.user = user;
    return next(); // token is valid — continue to the actual route handler
  } catch (error) {
    // jwt.verify throws JsonWebTokenError for bad signatures and TokenExpiredError for old tokens
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    // Any other error is unexpected — log it and return 500
    return reportServerError(res, 'Token verification failed', error);
  }
}

// --- Route handlers ---

// signupHandler creates a new user account.
// It validates the fields, hashes the password, saves the user, and returns a JWT.
async function signupHandler(req, res) {
  // Make sure req.body is a plain object before we try to read from it
  const body = isRecord(req.body) ? req.body : {};

  // Extract each field, defaulting to an empty string if the field is missing or the wrong type
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // Collect any validation errors in this object
  const fields = {};

  // Validate name length — must be at least 2 characters and no more than 100
  if (name.length < 2 || name.length > 100) fields.name = 'Name must be between 2 and 100 characters.';

  // Simple email format check using a regex — must have something@something.something
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';

  // Password must be at least 6 characters for basic security
  if (password.length < 6) fields.password = 'Password must be at least 6 characters.';

  // If any field failed validation, return 400 with the field errors so the form can highlight them
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  try {
    const jwtSecret = getJwtSecret();

    // Hash the password with bcrypt before storing it.
    // The number 10 is the "salt rounds" — higher is more secure but slower.
    // 10 is a widely accepted balance for web apps.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database using parameterized values (the ? placeholders).
    // Parameterized queries prevent SQL injection — never concatenate user input directly into SQL.
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword],
    );

    // Build the user object we'll put inside the JWT (no password field — that stays private)
    const user = { id: result.insertId, name, email };

    // Sign a JWT that expires in 1 day — the client stores this and sends it with every request
    const token = jwt.sign(user, jwtSecret, { expiresIn: '1d' });

    // 201 Created — return the token and user so the frontend can log the user in immediately
    return res.status(201).json({ token, user });
  } catch (error) {
    // MySQL error code ER_DUP_ENTRY means the email is already registered
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        error: 'Please correct the highlighted fields.',
        fields: { email: 'An account with this email already exists.' },
      });
    }
    return reportServerError(res, 'Signup failed', error);
  }
}

// loginHandler checks the submitted credentials and issues a JWT if they're correct.
async function loginHandler(req, res) {
  const body = isRecord(req.body) ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // Collect field validation errors
  const fields = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';
  if (password.length < 1) fields.password = 'Enter your password.';
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  try {
    const jwtSecret = getJwtSecret();

    // Look up the user by email — we only need the columns required for auth
    const [users] = await pool.execute(
      'SELECT id, name, email, password FROM users WHERE email = ?',
      [email],
    );
    const userRecord = users[0]; // there's at most one because email has a UNIQUE constraint

    // bcrypt.compare checks the submitted password against the stored hash.
    // We do both checks in one condition so we never reveal whether the email exists.
    if (!userRecord || !(await bcrypt.compare(password, userRecord.password))) {
      return res.status(400).json({ error: 'Email or password is incorrect.' });
    }

    // Build the JWT payload — exclude the hashed password
    const user = { id: userRecord.id, name: userRecord.name, email: userRecord.email };

    // Sign and return the token
    const token = jwt.sign(user, jwtSecret, { expiresIn: '1d' });
    return res.status(200).json({ token, user });
  } catch (error) {
    return reportServerError(res, 'Login failed', error);
  }
}

// listProductsHandler returns all products, with optional search text and price filters.
// Filters are provided as query parameters: /api/products?search=laptop&minPrice=100&maxPrice=500
async function listProductsHandler(req, res) {
  const fields = {}; // will hold any validation errors

  // Parse the search parameter — undefined means no search, null means the value was invalid
  const search = req.query.search === undefined
    ? ''
    : typeof req.query.search === 'string' ? req.query.search.trim() : null;

  // Parse minPrice — undefined means the filter wasn't given, NaN means it was invalid
  const minPrice = req.query.minPrice === undefined || req.query.minPrice === ''
    ? undefined
    : typeof req.query.minPrice === 'string' ? Number(req.query.minPrice) : NaN;

  // Same for maxPrice
  const maxPrice = req.query.maxPrice === undefined || req.query.maxPrice === ''
    ? undefined
    : typeof req.query.maxPrice === 'string' ? Number(req.query.maxPrice) : NaN;

  // Validate search — null means the type was wrong, and we cap it at 100 chars to prevent abuse
  if (search === null || (search !== null && search.length > 100)) {
    fields.search = 'Search must be text with at most 100 characters.';
  }

  // Prices must be non-negative numbers
  if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
    fields.minPrice = 'Minimum price must be a non-negative number.';
  }
  if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
    fields.maxPrice = 'Maximum price must be a non-negative number.';
  }

  // If both prices are valid, make sure min <= max
  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    Number.isFinite(minPrice) &&
    Number.isFinite(maxPrice) &&
    minPrice > maxPrice
  ) {
    fields.maxPrice = 'Maximum price must be greater than or equal to minimum price.';
  }

  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Invalid product search or price filter.', fields });
  }

  try {
    // Build the WHERE clause dynamically — only add conditions for filters the user actually sent
    const conditions = [];
    const values = []; // the ? placeholder values, in the same order as the conditions

    if (search) {
      // Search both the product name and description with LIKE
      conditions.push('(name LIKE ? OR description LIKE ?)');
      values.push(`%${search}%`, `%${search}%`); // two ? placeholders, same value for both
    }
    if (minPrice !== undefined) {
      conditions.push('price >= ?');
      values.push(minPrice);
    }
    if (maxPrice !== undefined) {
      conditions.push('price <= ?');
      values.push(maxPrice);
    }

    // Join all conditions with AND, or use an empty string if there are no filters
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Fetch products — newest first so new listings appear at the top
    const [products] = await pool.execute(
      `SELECT * FROM products ${whereClause} ORDER BY id DESC`,
      values,
    );
    return res.status(200).json(products);
  } catch (error) {
    return reportServerError(res, 'Product listing failed', error);
  }
}

// createProductHandler inserts a new product into the catalog.
// This route requires a valid login token (authenticateToken runs first).
async function createProductHandler(req, res) {
  const body = isRecord(req.body) ? req.body : {};

  // Extract and sanitize each field
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const price = Number(body.price); // convert to a number — if it's not numeric, this becomes NaN
  const stock = body.stock === undefined ? 10 : Number(body.stock); // default stock to 10 if not provided
  const imageUrl = body.image_url === null || body.image_url === undefined
    ? null                // null is allowed (no image)
    : typeof body.image_url === 'string' ? body.image_url.trim() : undefined; // undefined means invalid type

  const fields = {};

  // Product name is required and capped at 150 characters
  if (name.length < 1 || name.length > 150) fields.name = 'Product name is required (maximum 150 characters).';

  // Price must be a positive finite number — NaN and 0 are both rejected
  if (!Number.isFinite(price) || price <= 0) fields.price = 'Price must be a positive number.';

  // Stock must be a whole number (integer) — you can't have 1.5 units
  if (!Number.isInteger(stock) || stock < 0) fields.stock = 'Stock must be a non-negative whole number.';

  // If imageUrl is undefined it means an invalid type was sent (not null and not a string)
  if (imageUrl === undefined) fields.image_url = 'Image URL must be text.';

  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  try {
    // Insert the product — use null for description if it was empty, since empty string != missing
    const [result] = await pool.execute(
      'INSERT INTO products (name, description, price, image_url, stock) VALUES (?, ?, ?, ?, ?)',
      [name, description || null, price, imageUrl, stock],
    );
    return res.status(201).json({ message: 'Product created', productId: result.insertId });
  } catch (error) {
    return reportServerError(res, 'Product creation failed', error);
  }
}

// createOrderHandler processes a checkout.
// It validates the input, then runs all database writes inside a single transaction
// so that if anything fails, none of the changes are saved (all or nothing).
async function createOrderHandler(req, res) {
  const body = isRecord(req.body) ? req.body : {};

  // Extract all checkout fields from the request body
  const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const paymentMethod = body.payment_method;
  const cartItems = body.cartItems; // array of { id, quantity }

  const fields = {};

  // Validate the customer's name
  if (customerName.length < 2 || customerName.length > 100) {
    fields.customer_name = 'Customer name must be between 2 and 100 characters.';
  }

  // Validate the shipping address
  if (address.length < 5 || address.length > 1000) {
    fields.address = 'Shipping address must be between 5 and 1000 characters.';
  }

  // Validate the phone number — strip non-digits to count only the actual digit characters
  const phoneDigits = phone.replace(/\D/g, '').length;
  if (
    !/^\+?[0-9][0-9\s().-]*$/.test(phone) || // format check
    phoneDigits < 7 ||                          // too few digits
    phoneDigits > 15                            // too many digits (international max)
  ) {
    fields.phone = 'Enter a valid phone number containing 7 to 15 digits.';
  }

  // Payment method must be one of the three values in our paymentMethods Set
  if (typeof paymentMethod !== 'string' || !paymentMethods.has(paymentMethod)) {
    fields.payment_method = 'Choose a supported payment method.';
  }

  // Validate the cart — must be an array of 1–100 items, each with a positive integer id and quantity
  if (
    !Array.isArray(cartItems) ||
    cartItems.length === 0 ||
    cartItems.length > 100 ||
    cartItems.some(
      (item) =>
        !isRecord(item) ||
        !Number.isInteger(item.id) ||
        item.id < 1 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100,
    )
  ) {
    fields.cartItems = 'Add between 1 and 100 valid cart items.';
  } else if (new Set(cartItems.map((item) => item.id)).size !== cartItems.length) {
    // Duplicate product IDs mean the same product appears twice — reject that
    fields.cartItems = 'Each product may only appear once in the cart.';
  }

  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  // We need a dedicated connection for the transaction so we can rollback on failure
  let connection;
  try {
    connection = await pool.getConnection(); // borrow a connection from the pool
    await connection.beginTransaction();     // start the transaction

    const orderItems = []; // will hold { id, quantity, price } for each validated item
    let totalAmount = 0;

    // Loop through each cart item and validate stock and price against the database.
    // We do NOT trust the price the browser sends — we always read it fresh from MySQL.
    for (const item of cartItems) {
      // FOR UPDATE locks the row so another request can't buy the same item simultaneously
      const [products] = await connection.execute(
        'SELECT id, price, stock FROM products WHERE id = ? FOR UPDATE',
        [item.id],
      );
      const product = products[0];

      // If the product doesn't exist anymore, cancel the whole transaction
      if (!product) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Please correct the highlighted fields.',
          fields: { cartItems: `Product ${item.id} is no longer available.` },
        });
      }

      // If there isn't enough stock for the requested quantity, cancel the transaction
      if (Number(product.stock) < item.quantity) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Please correct the highlighted fields.',
          fields: { cartItems: `There is not enough stock for product ${item.id}.` },
        });
      }

      // Use the database price, not the browser price — clients could tamper with the price otherwise
      const price = Number(product.price);
      totalAmount += price * item.quantity; // add this item's subtotal to the running total
      orderItems.push({ id: item.id, quantity: item.quantity, price });
    }

    // All items passed validation — insert the order header row
    const [orderResult] = await connection.execute(
      'INSERT INTO checkout_orders (customer_name, email, address, phone, payment_method, total_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [customerName, req.user.email, address, phone, paymentMethod, totalAmount.toFixed(2), req.user.id],
    );
    const orderId = orderResult.insertId; // the auto-generated ID for this order

    // Insert one row per item and decrement that product's stock
    for (const item of orderItems) {
      // Record the item with the price at the time of purchase (in case the price changes later)
      await connection.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.id, item.quantity, item.price],
      );

      // Reduce stock — this is why we needed the transaction: if this fails, we rollback everything
      await connection.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.id],
      );
    }

    // All queries succeeded — commit the transaction so the changes become permanent
    await connection.commit();
    return res.status(201).json({ message: 'Order placed successfully', orderId });
  } catch (error) {
    // Something went wrong — rollback all changes so we don't end up with partial data
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        // If even the rollback fails, log it so we know to check the database manually
        console.error('Order rollback failed:', rollbackError);
      }
    }
    return reportServerError(res, 'Order creation failed', error);
  } finally {
    // Always release the connection back to the pool, whether we succeeded or failed
    if (connection) connection.release();
  }
}

// listOrdersHandler returns all orders for the currently logged-in user.
// The user ID comes from req.user, which was set by authenticateToken.
async function listOrdersHandler(req, res) {
  try {
    // Only fetch orders that belong to this user — the WHERE clause is critical for privacy
    const [orders] = await pool.execute(
      'SELECT * FROM checkout_orders WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id], // use the ID from the verified JWT, not anything the client sent
    );
    return res.status(200).json(orders);
  } catch (error) {
    return reportServerError(res, 'Order listing failed', error);
  }
}

// getOrderHandler fetches a single order by its ID.
// It includes the user_id check so users can't look up each other's orders.
async function getOrderHandler(req, res) {
  // Convert the URL parameter to a number — req.params.id is always a string
  const orderId = Number(req.params.id);

  // Reject non-integer or negative IDs before hitting the database
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Order ID must be a positive integer.' });
  }

  try {
    // The AND user_id = ? clause prevents one user from reading another user's order
    const [orders] = await pool.execute(
      'SELECT * FROM checkout_orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id],
    );

    // If no rows came back, either the order doesn't exist or it belongs to someone else
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.status(200).json(orders[0]);
  } catch (error) {
    return reportServerError(res, 'Order lookup failed', error);
  }
}

// updateOrderHandler lets the user change the status of their order.
// Only the four statuses in our orderStatuses Set are accepted.
async function updateOrderHandler(req, res) {
  const orderId = Number(req.params.id);
  const status = isRecord(req.body) ? req.body.status : undefined;

  // Validate the order ID
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Order ID must be a positive integer.' });
  }

  // Reject any status value that's not in our accepted list
  if (typeof status !== 'string' || !orderStatuses.has(status)) {
    return res.status(400).json({ error: 'Choose a valid order status.' });
  }

  try {
    // Update only if the order belongs to this user (AND user_id = ?)
    const [result] = await pool.execute(
      'UPDATE checkout_orders SET status = ? WHERE id = ? AND user_id = ?',
      [status, orderId, req.user.id],
    );

    // affectedRows === 0 means nothing was updated — order not found or belongs to someone else
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.status(200).json({ message: 'Order status updated' });
  } catch (error) {
    return reportServerError(res, 'Order update failed', error);
  }
}

// updateProfileHandler saves a new display name for the logged-in user.
// Because the name is stored inside the JWT, we have to issue a new token after updating it.
async function updateProfileHandler(req, res) {
  // Extract the name from the request body — trim whitespace first
  const name = isRecord(req.body) && typeof req.body.name === 'string'
    ? req.body.name.trim()
    : '';

  // Name must be 2–100 characters
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({
      error: 'Please correct the highlighted fields.',
      fields: { name: 'Name must be between 2 and 100 characters.' },
    });
  }

  try {
    const jwtSecret = getJwtSecret();

    // Update the name in the database
    const [result] = await pool.execute(
      'UPDATE users SET name = ? WHERE id = ?',
      [name, req.user.id],
    );

    // If no rows were affected, the user account doesn't exist (shouldn't happen normally)
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Create a fresh JWT with the updated name so the UI shows the new name in the header
    const user = { id: req.user.id, name, email: req.user.email };
    const token = jwt.sign(user, jwtSecret, { expiresIn: '1d' });

    return res.status(200).json({ message: 'Profile updated successfully', token, user });
  } catch (error) {
    return reportServerError(res, 'Profile update failed', error);
  }
}

// deleteOrderHandler permanently removes an order.
// We confirm the order belongs to this user before deleting.
async function deleteOrderHandler(req, res) {
  const orderId = Number(req.params.id);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Order ID must be a positive integer.' });
  }

  try {
    // The AND user_id = ? check ensures users can only delete their own orders
    const [result] = await pool.execute(
      'DELETE FROM checkout_orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id],
    );

    // If nothing was deleted, the order wasn't found or didn't belong to this user
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    return reportServerError(res, 'Order deletion failed', error);
  }
}

// --- 404 and error handlers ---

// Catch-all for any route that doesn't match — sends a JSON 404 instead of Express's HTML page
function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'API route not found.' });
}

// Error handler for malformed or oversized request bodies (Express calls this with 4 args)
function requestErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error); // if the response already started, let Express handle it

  // The JSON body parser throws this when the request body isn't valid JSON
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  // This error fires when the request body is bigger than Express's limit
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }

  return reportServerError(res, 'Request failed', error);
}

// --- Route registration ---
// Each route maps an HTTP method + path to a handler function.
// Routes that need authentication list authenticateToken as middleware before the handler.

app.post('/api/auth/signup', signupHandler);                            // create account
app.post('/api/auth/login', loginHandler);                              // log in
app.get('/api/products', listProductsHandler);                          // browse catalog (public)
app.post('/api/products', authenticateToken, createProductHandler);     // add product (auth required)
app.post('/api/orders', authenticateToken, createOrderHandler);         // place order (auth required)
app.get('/api/orders', authenticateToken, listOrdersHandler);           // view my orders
app.get('/api/orders/:id', authenticateToken, getOrderHandler);         // view one order
app.put('/api/orders/:id', authenticateToken, updateOrderHandler);      // update order status
app.put('/api/auth/profile', authenticateToken, updateProfileHandler);  // update display name
app.delete('/api/orders/:id', authenticateToken, deleteOrderHandler);   // delete an order

// These two must be registered last — notFoundHandler catches anything that didn't match above,
// and requestErrorHandler catches any error thrown during request processing.
app.use(notFoundHandler);
app.use(requestErrorHandler);

// --- Start the server ---
// Read the port from .env, defaulting to 5000 for local development
const port = Number(process.env.PORT) || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
