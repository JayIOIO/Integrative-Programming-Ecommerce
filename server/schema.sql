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

-- Orders belong to a user; deleting a user removes their associated orders.
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

-- Each row records a purchased product and its price at the time of the order.
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
INSERT INTO `products` (`name`, `description`, `price`, `image_url`, `stock`, `created_at`) VALUES
('Wireless Headphones', 'Noise-canceling over-ear headphones', 99.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 15, '2026-10-19 03:56:15'),
('Smart Watch', 'Fitness tracker with heart rate monitor', 149.99, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500', 8, '2026-10-19 03:56:15'),
('Mechanical Keyboard', 'RGB mechanical gaming keyboard', 79.99, 'https://images.unsplash.com/photo-1595225476474-87563907a212?w=500', 20, '2026-10-19 03:56:15'),
('Gaming Mouse', 'Ergonomic mouse with customizable weights', 49.99, 'https://images.unsplash.com/photo-1629429408209-1f912961dbd8?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D', 25, '2026-10-19 03:56:15'),
('4K Monitor', '32-inch ultra-high-definition display', 299.99, 'https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=500', 10, '2026-10-19 03:56:15'),
('Bluetooth Speaker', 'Waterproof portable speaker with 12h battery', 59.99, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=500', 30, '2026-10-19 03:56:15'),
('Laptop Stand', 'Adjustable aluminum stand for 13-17 inch laptops', 34.99, 'https://images.unsplash.com/photo-1575399545768-5f1840c1312d?q=80&w=765&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D', 50, '2026-10-19 03:56:15'),
('USB-C Hub', '7-in-1 multi-port adapter with HDMI and SD card reader', 29.99, 'https://images.unsplash.com/photo-1760376789487-994070337c76?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D', 40, '2026-10-19 03:56:15'),
('HD Webcam', '1080p HD webcam with built-in noise reducing microphone', 39.99, 'https://images.unsplash.com/photo-1623949556303-b0d17d198863?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D', 22, '2026-10-19 03:56:15'),
('Ergonomic Office Chair', 'Breathable mesh back with lumbar support', 199.99, 'https://images.unsplash.com/photo-1776548759455-310ef8cd49ec?q=80&w=764&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D', 5, '2026-10-19 03:56:15'),
('Portable Power Bank', '20000mAh fast-charging external battery', 45.99, 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=500', 60, '2026-10-19 03:56:15'),
('Wireless Charging Pad', '15W Qi-certified fast charger for smart devices', 24.99, 'https://images.unsplash.com/photo-1615526675159-e248c3021d3f?w=500', 35, '2026-10-19 03:56:15'),
('True Wireless Earbuds', 'Compact noise-isolating earbuds with charging case', 89.99, 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500', 18, '2026-10-19 03:56:15'),
('External SSD', '1TB portable solid state drive with USB 3.2', 129.99, 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=500', 12, '2026-10-19 03:56:15'),
('Leather Desk Mat', 'Spacious water-resistant desk protector and mouse pad', 22.99, 'https://plus.unsplash.com/premium_photo-1664699099309-afd82b75bd1a?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D', 45, '2026-10-19 03:58:24');