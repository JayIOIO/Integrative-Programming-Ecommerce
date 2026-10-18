-- Create and select the database
CREATE DATABASE IF NOT EXISTS ecommerce_db;
USE ecommerce_db;

-- 2. Users Table (Handles Authentication & Profile Updates)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Products Table (Stores Storefront Items)
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(255),
  stock INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Checkout Orders Table (Stores General Order Info Linked to Users)
CREATE TABLE IF NOT EXISTS checkout_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Order Items Table (Links Specific Purchased Products to an Order)
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES checkout_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 6. Insert Sample Products
INSERT INTO products (name, description, price, image_url, stock) VALUES
('Wireless Headphones', 'Noise-canceling over-ear headphones', 99.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 15),
('Smart Watch', 'Fitness tracker with heart rate monitor', 149.99, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500', 8),
('Mechanical Keyboard', 'RGB mechanical gaming keyboard', 79.99, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500', 20);