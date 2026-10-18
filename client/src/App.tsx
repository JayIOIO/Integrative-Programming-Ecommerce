import { useState, type ChangeEvent, type FormEvent } from "react";
import { api, getApiErrorMessage, getApiFieldErrors } from "./api/axios";
import { useApiData } from "./hooks/useApiData";
import type {
  AuthForm,
  CartItem,
  CheckoutForm,
  Order,
  Product,
  ProfileForm,
  StoreTab,
  User,
} from "./types";
import "./App.css";

function readStoredUser(): User | null {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    const parsed: unknown = JSON.parse(storedUser);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      "name" in parsed &&
      "email" in parsed &&
      typeof parsed.id === "number" &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed as User;
    }
  } catch (error) {
    console.error("Stored user data could not be read:", error);
  }

  localStorage.removeItem("user");
  return null;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [isSignup, setIsSignup] = useState(false);
  const [activeTab, setActiveTab] = useState<StoreTab>("shop");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [authData, setAuthData] = useState<AuthForm>({ name: "", email: "", password: "" });
  const [checkoutData, setCheckoutData] = useState<CheckoutForm>({
    address: "",
    payment_method: "Credit Card",
  });
  const [profileData, setProfileData] = useState<ProfileForm>({ name: "" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [authErrors, setAuthErrors] = useState<Partial<Record<keyof AuthForm, string>>>({});
  const [checkoutErrors, setCheckoutErrors] = useState<
    Partial<Record<keyof CheckoutForm | "cartItems", string>>
  >({});
  const [profileErrors, setProfileErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refresh: refreshProducts,
  } = useApiData<Product>("/products");
  const {
    data: orders,
    loading: ordersLoading,
    error: ordersError,
    refresh: refreshOrders,
  } = useApiData<Order>(token ? "/orders" : null, token, user?.id);

  const cartTotal = cart.reduce(
    (total, item) => total + Number(item.price) * item.quantity,
    0,
  );
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const handleAuthChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.currentTarget;
    setAuthData((previous) => ({ ...previous, [name]: value }));
    setAuthErrors((previous) => ({ ...previous, [name]: undefined }));
    setActionError(null);
  };

  const handleCheckoutChange = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.currentTarget;
    setCheckoutData((previous) => ({ ...previous, [name]: value }));
    setCheckoutErrors((previous) => ({ ...previous, [name]: undefined }));
    setActionError(null);
  };

  const handleProfileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.currentTarget;
    setProfileData((previous) => ({ ...previous, [name]: value }));
    setProfileErrors((previous) => ({ ...previous, [name]: undefined }));
    setActionError(null);
  };

  const addToCart = (product: Product) => {
    setCart((previous) => {
      const existingItem = previous.find((item) => item.id === product.id);
      return existingItem
        ? previous.map((item) =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
          )
        : [...previous, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((previous) => previous.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((previous) =>
      previous.map((item) =>
        item.id === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof AuthForm, string>> = {};
    if (isSignup && authData.name.trim().length < 2) {
      errors.name = "Enter a name with at least 2 characters.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authData.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (isSignup && authData.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    } else if (!authData.password) {
      errors.password = "Enter your password.";
    }
    setAuthErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setActionError(null);
    setIsSubmitting(true);

    try {
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const response = await api.post<{ token: string; user: User }>(endpoint, authData);
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      setToken(response.data.token);
      setUser(response.data.user);
      setProfileData({ name: response.data.user.name });
      setAuthData({ name: "", email: "", password: "" });
    } catch (error: unknown) {
      const fields = getApiFieldErrors(error);
      setAuthErrors({
        name: fields.name,
        email: fields.email,
        password: fields.password,
      });
      if (Object.keys(fields).length === 0) {
        setActionError(getApiErrorMessage(error, "Authentication failed."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setCart([]);
    setActiveTab("shop");
    setActionError(null);
  };

  const handleCheckoutSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof CheckoutForm | "cartItems", string>> = {};
    if (checkoutData.address.trim().length < 5) {
      errors.address = "Enter a shipping address with at least 5 characters.";
    }
    if (!["Credit Card", "PayPal", "Cash on Delivery"].includes(checkoutData.payment_method)) {
      errors.payment_method = "Choose a valid payment method.";
    }
    if (cart.length === 0) errors.cartItems = "Add at least one item before checkout.";
    setCheckoutErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setActionError(null);
    setIsSubmitting(true);
    try {
      await api.post(
        "/orders",
        {
          address: checkoutData.address,
          payment_method: checkoutData.payment_method,
          total_amount: cartTotal.toFixed(2),
          cartItems: cart,
        },
        authConfig,
      );
      setCart([]);
      setCheckoutData({ address: "", payment_method: "Credit Card" });
      refreshOrders();
      refreshProducts();
      setActiveTab("orders");
    } catch (error: unknown) {
      const fields = getApiFieldErrors(error);
      setCheckoutErrors({
        address: fields.address,
        payment_method: fields.payment_method,
        cartItems: fields.cartItems,
      });
      if (Object.keys(fields).length === 0) {
        setActionError(`Checkout failed: ${getApiErrorMessage(error, "Request failed.")}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, status: string) => {
    setActionError(null);
    try {
      await api.put(`/orders/${orderId}`, { status }, authConfig);
      refreshOrders();
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error, "Failed to update order status."));
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!window.confirm("Are you sure you want to cancel and delete this order?")) return;

    setActionError(null);
    try {
      await api.delete(`/orders/${orderId}`, authConfig);
      refreshOrders();
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error, "Failed to delete order."));
    }
  };

  const handleUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof ProfileForm, string>> = {};
    if (profileData.name.trim().length < 2 || profileData.name.trim().length > 100) {
      errors.name = "Name must be between 2 and 100 characters.";
    }
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setActionError(null);
    setIsSubmitting(true);
    try {
      const response = await api.put<{ token: string; user: User }>(
        "/auth/profile",
        { name: profileData.name },
        authConfig,
      );
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      setToken(response.data.token);
      setUser(response.data.user);
    } catch (error: unknown) {
      const fields = getApiFieldErrors(error);
      setProfileErrors({ name: fields.name });
      if (!fields.name) setActionError(getApiErrorMessage(error, "Failed to update profile."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <h1>🛍 Shopee Clone</h1>
            <p>{isSignup ? "Create your new account" : "Log in to start shopping"}</p>
          </div>
          <form onSubmit={handleAuthSubmit} className="auth-form" noValidate>
            {isSignup && (
              <input
                name="name"
                aria-invalid={Boolean(authErrors.name)}
                className="auth-input"
                placeholder="Full Name"
                value={authData.name}
                onChange={handleAuthChange}
                required
              />
            )}
            {isSignup && authErrors.name && <small className="field-error">{authErrors.name}</small>}
            <input
              name="email"
              type="email"
              aria-invalid={Boolean(authErrors.email)}
              className="auth-input"
              placeholder="Email Address"
              value={authData.email}
              onChange={handleAuthChange}
              required
            />
            {authErrors.email && <small className="field-error">{authErrors.email}</small>}
            <input
              name="password"
              type="password"
              aria-invalid={Boolean(authErrors.password)}
              className="auth-input"
              placeholder="Password"
              value={authData.password}
              onChange={handleAuthChange}
              required
            />
            {authErrors.password && <small className="field-error">{authErrors.password}</small>}
            {actionError && <p className="status-message error-message" role="alert">{actionError}</p>}
            <button type="submit" className="auth-button" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : isSignup ? "Sign Up" : "Log In"}
            </button>
          </form>
          <div className="auth-toggle-container">
            <button
              onClick={() => {
                setIsSignup((previous) => !previous);
                setAuthErrors({});
                setActionError(null);
              }}
              className="auth-toggle-btn"
              type="button"
            >
              {isSignup ? "Existing user? Log In" : "New to Shopee? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: StoreTab; label: string }[] = [
    { id: "shop", label: "Mall Products" },
    { id: "cart", label: `My Cart (${cart.reduce((sum, item) => sum + item.quantity, 0)})` },
    { id: "orders", label: `My Orders (${orders.length})` },
    { id: "profile", label: "My Account Settings" },
  ];

  return (
    <div>
      <header className="shopee-header">
        <div className="header-container">
          <h2 className="brand-title" onClick={() => setActiveTab("shop")}>
            🛍️ <span>Shopee</span>
          </h2>
          <div className="user-info">
            <span>Welcome, <strong>{user?.name}</strong></span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </header>

      <nav className="shopee-nav">
        <div className="nav-container">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-btn ${activeTab === tab.id ? "active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="main-container">
        {actionError && <p className="status-message error-message" role="alert">{actionError}</p>}

        {activeTab === "shop" && (
          <>
            {productsLoading && <p className="status-message" role="status">Loading products...</p>}
            {productsError && <p className="status-message error-message" role="alert">{productsError}</p>}
            {!productsLoading && !productsError && products.length === 0 && (
              <p className="status-message">No products are available right now.</p>
            )}
            <div className="product-grid">
              {products.map((product) => (
                <div key={product.id} className="product-card">
                  <img src={product.image_url ?? ""} alt={product.name} className="product-image" />
                  <div className="product-details">
                    <div>
                      <h4 className="product-title">{product.name}</h4>
                      <p className="product-desc">{product.description}</p>
                    </div>
                    <div className="product-footer">
                      <span className="product-price">${Number(product.price).toFixed(2)}</span>
                      <button onClick={() => addToCart(product)} className="btn-add-cart">
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "cart" && (
          <div>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <p>Your shopping cart is currently empty.</p>
                <button
                  onClick={() => setActiveTab("shop")}
                  className="btn-submit"
                  style={{ marginTop: "15px" }}
                >
                  Go Shopping Now
                </button>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-card">
                  <h3 className="card-title">Cart Items</h3>
                  {cart.map((item) => (
                    <div key={item.id} className="cart-item">
                      <div style={{ flex: 2 }}>
                        <h4 style={{ fontSize: "14px" }}>{item.name}</h4>
                        <small style={{ color: "#888" }}>${Number(item.price).toFixed(2)}</small>
                      </div>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                        <button onClick={() => updateQuantity(item.id, -1)} className="qty-btn">-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="qty-btn">+</button>
                      </div>
                      <div style={{ flex: 1, textAlign: "right", fontWeight: "bold", color: "#ee4d2d" }}>
                        ${(Number(item.price) * item.quantity).toFixed(2)}
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="btn-remove">✕</button>
                    </div>
                  ))}
                </div>

                <div className="checkout-card">
                  <h3 className="card-title">Checkout</h3>
                  <div className="checkout-total">
                    <span>Total Pay:</span>
                    <span style={{ color: "#ee4d2d" }}>${cartTotal.toFixed(2)}</span>
                  </div>
                  <form onSubmit={handleCheckoutSubmit} className="checkout-form" noValidate>
                    <label className="form-label" htmlFor="shipping-address">SHIPPING ADDRESS</label>
                    <textarea
                      id="shipping-address"
                      name="address"
                      aria-invalid={Boolean(checkoutErrors.address)}
                      rows={3}
                      className="form-textarea"
                      placeholder="Street, City, Zip Code..."
                      value={checkoutData.address}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.address && (
                      <small className="field-error">{checkoutErrors.address}</small>
                    )}
                    <label className="form-label" htmlFor="payment-method">PAYMENT METHOD</label>
                    <select
                      id="payment-method"
                      name="payment_method"
                      aria-invalid={Boolean(checkoutErrors.payment_method)}
                      className="form-select"
                      value={checkoutData.payment_method}
                      onChange={handleCheckoutChange}
                    >
                      <option value="Credit Card">Credit Card</option>
                      <option value="PayPal">PayPal</option>
                      <option value="Cash on Delivery">Cash on Delivery</option>
                    </select>
                    {checkoutErrors.payment_method && (
                      <small className="field-error">{checkoutErrors.payment_method}</small>
                    )}
                    {checkoutErrors.cartItems && (
                      <small className="field-error">{checkoutErrors.cartItems}</small>
                    )}
                    <button type="submit" className="btn-submit" disabled={isSubmitting}>
                      {isSubmitting ? "Placing order..." : "Place Order"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "orders" && (
          <div className="orders-card">
            <h3 className="card-title">Order History</h3>
            {ordersLoading && <p className="status-message" role="status">Loading orders...</p>}
            {ordersError && <p className="status-message error-message" role="alert">{ordersError}</p>}
            {!ordersLoading && !ordersError && orders.length === 0 && (
              <p style={{ color: "#888" }}>No order records found.</p>
            )}
            <div className="orders-list">
              {orders.map((order) => (
                <div key={order.id} className="order-item-card">
                  <div>
                    <h4 style={{ margin: "0 0 5px 0" }}>Order #{order.id}</h4>
                    <p style={{ fontSize: "13px", color: "#555" }}>Address: {order.address}</p>
                    <p style={{ fontSize: "13px", color: "#555" }}>Payment: {order.payment_method}</p>
                    <strong style={{ color: "#ee4d2d", fontSize: "16px" }}>
                      Total: ${Number(order.total_amount).toFixed(2)}
                    </strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    <div>
                      <label
                        htmlFor={`order-status-${order.id}`}
                        style={{ display: "block", fontSize: "11px", color: "#888", marginBottom: "2px" }}
                      >
                        STATUS (UPDATE)
                      </label>
                      <select
                        id={`order-status-${order.id}`}
                        value={order.status}
                        onChange={(event) => handleUpdateOrderStatus(order.id, event.currentTarget.value)}
                        className="order-select"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Processing">Processing</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{ display: "block", fontSize: "11px", color: "#888", marginBottom: "2px" }}
                      >
                        ACTION (DELETE)
                      </label>
                      <button onClick={() => handleDeleteOrder(order.id)} className="btn-danger">
                        Cancel / Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="profile-card" style={{ maxWidth: "500px", margin: "0 auto" }}>
            <h3 className="card-title">Account Settings</h3>
            <form onSubmit={handleUpdateProfile} className="checkout-form" noValidate>
              <div>
                <label className="form-label" htmlFor="profile-email">Email Address (Read-only)</label>
                <input
                  id="profile-email"
                  type="email"
                  value={user?.email ?? ""}
                  disabled
                  className="form-input"
                  style={{ background: "#f5f5f5", border: "1px solid #eee" }}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="profile-name">Full Name</label>
                <input
                  id="profile-name"
                  name="name"
                  type="text"
                  aria-invalid={Boolean(profileErrors.name)}
                  value={profileData.name}
                  onChange={handleProfileChange}
                  className="form-input"
                  required
                />
                {profileErrors.name && <small className="field-error">{profileErrors.name}</small>}
              </div>
              <button type="submit" className="btn-submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Profile Changes"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
