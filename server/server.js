const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : undefined;
// Log each completed request, then enable cross-origin calls and JSON request bodies.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json());

// Reuse pooled MySQL connections instead of opening one for every query.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ecommerce_db',
  waitForConnections: true,
  connectionLimit: 10,
});

const paymentMethods = new Set(['Credit Card', 'PayPal', 'Cash on Delivery']);
const orderStatuses = new Set(['Pending', 'Processing', 'Shipped', 'Delivered']);

// Treat incoming JSON as untrusted until it is confirmed to be a plain object.
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return process.env.JWT_SECRET;
}

// Log detailed failures on the server without exposing database or token internals to clients.
function reportServerError(res, context, error) {
  console.error(`${context}:`, error);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
}

// Verify the bearer token and make its signed-in user details available to protected routes.
function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Verify the token and ensure it contains the expected user fields.
  try {
    const user = jwt.verify(token, getJwtSecret());
    if (
      !isRecord(user) ||
      !Number.isInteger(user.id) ||
      typeof user.email !== 'string' ||
      typeof user.name !== 'string'
    ) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Attach the user details to the request object for downstream handlers.
    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    return reportServerError(res, 'Token verification failed', error);
  }
}

// Validate registration fields, hash the password, save the user, and issue a JWT.
async function signupHandler(req, res) {
  // Ensure the request body is a plain object and extract the expected fields.
  const body = isRecord(req.body) ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fields = {};


  // Validate the input fields and return errors for any that are invalid.
  if (name.length < 2 || name.length > 100) fields.name = 'Name must be between 2 and 100 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';
  if (password.length < 6) fields.password = 'Password must be at least 6 characters.';
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  // Hash the password and insert the new user into the database, then sign a JWT for the new account.
  try {
    const jwtSecret = getJwtSecret();
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword],
    );
    const user = { id: result.insertId, name, email };
    const token = jwt.sign(user, jwtSecret, { expiresIn: '1d' });
    return res.status(201).json({ token, user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        error: 'Please correct the highlighted fields.',
        fields: { email: 'An account with this email already exists.' },
      });
    }
    return reportServerError(res, 'Signup failed', error);
  }
}

// Match the submitted credentials against the stored password hash before issuing a JWT.
async function loginHandler(req, res) {
  const body = isRecord(req.body) ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fields = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address.';
  if (password.length < 1) fields.password = 'Enter your password.';
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  try {
    const jwtSecret = getJwtSecret();
    const [users] = await pool.execute(
      'SELECT id, name, email, password FROM users WHERE email = ?',
      [email],
    );
    const userRecord = users[0];
    if (!userRecord || !(await bcrypt.compare(password, userRecord.password))) {
      return res.status(400).json({ error: 'Email or password is incorrect.' });
    }

    const user = { id: userRecord.id, name: userRecord.name, email: userRecord.email };
    const token = jwt.sign(user, jwtSecret, { expiresIn: '1d' });
    return res.status(200).json({ token, user });
  } catch (error) {
    return reportServerError(res, 'Login failed', error);
  }
}

// Search the catalog and optionally constrain results to a price range.
async function listProductsHandler(req, res) {
  const fields = {};
  const search = req.query.search === undefined
    ? ''
    : typeof req.query.search === 'string' ? req.query.search.trim() : null;
  const minPrice = req.query.minPrice === undefined || req.query.minPrice === ''
    ? undefined
    : typeof req.query.minPrice === 'string' ? Number(req.query.minPrice) : NaN;
  const maxPrice = req.query.maxPrice === undefined || req.query.maxPrice === ''
    ? undefined
    : typeof req.query.maxPrice === 'string' ? Number(req.query.maxPrice) : NaN;

  if (search === null || (search !== null && search.length > 100)) {
    fields.search = 'Search must be text with at most 100 characters.';
  }
  if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
    fields.minPrice = 'Minimum price must be a non-negative number.';
  }
  if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
    fields.maxPrice = 'Maximum price must be a non-negative number.';
  }
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
    const conditions = [];
    const values = [];
    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      values.push(`%${search}%`, `%${search}%`);
    }
    if (minPrice !== undefined) {
      conditions.push('price >= ?');
      values.push(minPrice);
    }
    if (maxPrice !== undefined) {
      conditions.push('price <= ?');
      values.push(maxPrice);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [products] = await pool.execute(
      `SELECT * FROM products ${whereClause} ORDER BY id DESC`,
      values,
    );
    return res.status(200).json(products);
  } catch (error) {
    return reportServerError(res, 'Product listing failed', error);
  }
}

// Validate and insert a new product; the route requires a valid login token.
async function createProductHandler(req, res) {
  const body = isRecord(req.body) ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const price = Number(body.price);
  const stock = body.stock === undefined ? 10 : Number(body.stock);
  const imageUrl = body.image_url === null || body.image_url === undefined
    ? null
    : typeof body.image_url === 'string' ? body.image_url.trim() : undefined;
  const fields = {};

  if (name.length < 1 || name.length > 150) fields.name = 'Product name is required (maximum 150 characters).';
  if (!Number.isFinite(price) || price <= 0) fields.price = 'Price must be a positive number.';
  if (!Number.isInteger(stock) || stock < 0) fields.stock = 'Stock must be a non-negative whole number.';
  if (imageUrl === undefined) fields.image_url = 'Image URL must be text.';
  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO products (name, description, price, image_url, stock) VALUES (?, ?, ?, ?, ?)',
      [name, description || null, price, imageUrl, stock],
    );
    return res.status(201).json({ message: 'Product created', productId: result.insertId });
  } catch (error) {
    return reportServerError(res, 'Product creation failed', error);
  }
}

// Validate checkout input and create the order and stock changes as one transaction.
async function createOrderHandler(req, res) {
  const body = isRecord(req.body) ? req.body : {};
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const paymentMethod = body.payment_method;
  const cartItems = body.cartItems;
  const fields = {};

  if (address.length < 5 || address.length > 1000) {
    fields.address = 'Shipping address must be between 5 and 1000 characters.';
  }
  const phoneDigits = phone.replace(/\D/g, '').length;
  if (
    !/^\+?[0-9][0-9\s().-]*$/.test(phone) ||
    phoneDigits < 7 ||
    phoneDigits > 15
  ) {
    fields.phone = 'Enter a valid phone number containing 7 to 15 digits.';
  }
  if (typeof paymentMethod !== 'string' || !paymentMethods.has(paymentMethod)) {
    fields.payment_method = 'Choose a supported payment method.';
  }
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
    fields.cartItems = 'Each product may only appear once in the cart.';
  }

  if (Object.keys(fields).length > 0) {
    return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const orderItems = [];
    let totalAmount = 0;
    for (const item of cartItems) {
      // Lock each product while checking stock and price to prevent overselling.
      const [products] = await connection.execute(
        'SELECT id, price, stock FROM products WHERE id = ? FOR UPDATE',
        [item.id],
      );
      const product = products[0];
      if (!product) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Please correct the highlighted fields.',
          fields: { cartItems: `Product ${item.id} is no longer available.` },
        });
      }
      if (Number(product.stock) < item.quantity) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Please correct the highlighted fields.',
          fields: { cartItems: `There is not enough stock for product ${item.id}.` },
        });
      }

      const price = Number(product.price);
      // Use database prices instead of values sent by the browser.
      totalAmount += price * item.quantity;
      orderItems.push({ id: item.id, quantity: item.quantity, price });
    }

    const [orderResult] = await connection.execute(
      'INSERT INTO checkout_orders (customer_name, email, address, phone, payment_method, total_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.name, req.user.email, address, phone, paymentMethod, totalAmount.toFixed(2), req.user.id],
    );
    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.id, item.quantity, item.price],
      );
      await connection.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.id],
      );
    }

    await connection.commit();
    return res.status(201).json({ message: 'Order placed successfully', orderId });
  } catch (error) {
    if (connection) {
      try {
        // Keep the original failure as the response if rollback itself also fails.
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Order rollback failed:', rollbackError);
      }
    }
    return reportServerError(res, 'Order creation failed', error);
  } finally {
    if (connection) connection.release();
  }
}

// Return only orders owned by the authenticated user.
async function listOrdersHandler(req, res) {
  try {
    const [orders] = await pool.execute(
      'SELECT * FROM checkout_orders WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id],
    );
    return res.status(200).json(orders);
  } catch (error) {
    return reportServerError(res, 'Order listing failed', error);
  }
}

// Look up one order without revealing records that belong to another account.
async function getOrderHandler(req, res) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Order ID must be a positive integer.' });
  }

  try {
    const [orders] = await pool.execute(
      'SELECT * FROM checkout_orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id],
    );
    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.status(200).json(orders[0]);
  } catch (error) {
    return reportServerError(res, 'Order lookup failed', error);
  }
}

// Allow only known order statuses and update only the current user's order.
async function updateOrderHandler(req, res) {
  const orderId = Number(req.params.id);
  const status = isRecord(req.body) ? req.body.status : undefined;
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Order ID must be a positive integer.' });
  }
  if (typeof status !== 'string' || !orderStatuses.has(status)) {
    return res.status(400).json({ error: 'Choose a valid order status.' });
  }

  try {
    const [result] = await pool.execute(
      'UPDATE checkout_orders SET status = ? WHERE id = ? AND user_id = ?',
      [status, orderId, req.user.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.status(200).json({ message: 'Order status updated' });
  } catch (error) {
    return reportServerError(res, 'Order update failed', error);
  }
}

// Save the new display name and sign a replacement token with the updated name.
async function updateProfileHandler(req, res) {
  const name = isRecord(req.body) && typeof req.body.name === 'string'
    ? req.body.name.trim()
    : '';
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({
      error: 'Please correct the highlighted fields.',
      fields: { name: 'Name must be between 2 and 100 characters.' },
    });
  }

  try {
    const jwtSecret = getJwtSecret();
    const [result] = await pool.execute(
      'UPDATE users SET name = ? WHERE id = ?',
      [name, req.user.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = { id: req.user.id, name, email: req.user.email };
    const token = jwt.sign(user, jwtSecret, { expiresIn: '1d' });
    return res.status(200).json({ message: 'Profile updated successfully', token, user });
  } catch (error) {
    return reportServerError(res, 'Profile update failed', error);
  }
}

// Delete an order only when it belongs to the authenticated user.
async function deleteOrderHandler(req, res) {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Order ID must be a positive integer.' });
  }

  try {
    const [result] = await pool.execute(
      'DELETE FROM checkout_orders WHERE id = ? AND user_id = ?',
      [orderId, req.user.id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    return res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    return reportServerError(res, 'Order deletion failed', error);
  }
}

// Return consistent JSON errors for unknown API paths and malformed requests.
function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'API route not found.' });
}

function requestErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  return reportServerError(res, 'Request failed', error);
}

// Register named handlers so validation and route behavior stay easy to locate.
// Keep route paths grouped together so the API surface is easy to audit.
app.post('/api/auth/signup', signupHandler);
app.post('/api/auth/login', loginHandler);
app.get('/api/products', listProductsHandler);
app.post('/api/products', authenticateToken, createProductHandler);
app.post('/api/orders', authenticateToken, createOrderHandler);
app.get('/api/orders', authenticateToken, listOrdersHandler);
app.get('/api/orders/:id', authenticateToken, getOrderHandler);
app.put('/api/orders/:id', authenticateToken, updateOrderHandler);
app.put('/api/auth/profile', authenticateToken, updateProfileHandler);
app.delete('/api/orders/:id', authenticateToken, deleteOrderHandler);
app.use(notFoundHandler);
app.use(requestErrorHandler);

const port = Number(process.env.PORT) || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
