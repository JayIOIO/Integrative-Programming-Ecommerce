import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { api, getApiErrorMessage, getApiFieldErrors } from "./api/axios";
import { useApiData } from "./hooks/useApiData";
import { createAuthSchema, profileSchema } from "./validation/schemas";
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

// Restore a session only when the saved user record has the fields the UI relies on.
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

// Keep each account's cart separate when multiple people use the same browser.
function getCartStorageKey(userId: number): string {
  return `cart:${userId}`;
}

// Local storage is untyped, so validate saved cart data before using it in the UI.
function readStoredCart(userId: number): CartItem[] {
  const storedCart = localStorage.getItem(getCartStorageKey(userId));
  if (!storedCart) return [];

  try {
    const parsed: unknown = JSON.parse(storedCart);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          Number.isInteger(item.id) &&
          "name" in item &&
          typeof item.name === "string" &&
          "price" in item &&
          (typeof item.price === "number" || typeof item.price === "string") &&
          Number.isFinite(Number(item.price)) &&
          "quantity" in item &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      )
    ) {
      return parsed as CartItem[];
    }
  } catch (error) {
    console.error("Stored cart data could not be read:", error);
  }

  localStorage.removeItem(getCartStorageKey(userId));
  return [];
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") ?? "");
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [isSignup, setIsSignup] = useState(false);
  const [activeTab, setActiveTab] = useState<StoreTab>("shop");
  const [productSearch, setProductSearch] = useState("");
  const [minProductPrice, setMinProductPrice] = useState("");
  const [maxProductPrice, setMaxProductPrice] = useState("");
  const [appliedProductFilters, setAppliedProductFilters] = useState({
    search: "",
    minPrice: "",
    maxPrice: "",
  });
  const [cart, setCart] = useState<CartItem[]>(() =>
    user ? readStoredCart(user.id) : [],
  );
  const [checkoutData, setCheckoutData] = useState<CheckoutForm>({
    address: "",
    payment_method: "Credit Card",
  });
  const authForm = useForm<AuthForm>({
    resolver: zodResolver(createAuthSchema(isSignup)),
    defaultValues: { name: "", email: "", password: "" },
    mode: "onBlur",
  });
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "" },
    mode: "onBlur",
  });
  // Keep request, validation, and pending-submit feedback separate for each view.
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkoutErrors, setCheckoutErrors] = useState<
    Partial<Record<keyof CheckoutForm | "cartItems", string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keep the catalog and signed-in user's orders synchronized with the API.
  const productQuery = new URLSearchParams();
  if (appliedProductFilters.search) {
    productQuery.set("search", appliedProductFilters.search);
  }
  if (appliedProductFilters.minPrice) {
    productQuery.set("minPrice", appliedProductFilters.minPrice);
  }
  if (appliedProductFilters.maxPrice) {
    productQuery.set("maxPrice", appliedProductFilters.maxPrice);
  }
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refresh: refreshProducts,
  } = useApiData<Product>(`/products${productQuery.size ? `?${productQuery}` : ""}`);
  const {
    data: orders,
    loading: ordersLoading,
    error: ordersError,
    refresh: refreshOrders,
  } = useApiData<Order>(token ? "/orders" : null, token, user?.id);

  // Persist cart changes without clearing the saved copy during logout.
  useEffect(() => {
    if (user) {
      localStorage.setItem(getCartStorageKey(user.id), JSON.stringify(cart));
    }
  }, [cart, user]);

  const cartTotal = cart.reduce(
    (total, item) => total + Number(item.price) * item.quantity,
    0,
  );
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const handleCheckoutChange = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.currentTarget;
    setCheckoutData((previous) => ({ ...previous, [name]: value }));
    setCheckoutErrors((previous) => ({ ...previous, [name]: undefined }));
    setActionError(null);
  };

  const handleProductSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedProductFilters({
      search: productSearch.trim(),
      minPrice: minProductPrice,
      maxPrice: maxProductPrice,
    });
  };

  const clearProductFilters = () => {
    setProductSearch("");
    setMinProductPrice("");
    setMaxProductPrice("");
    setAppliedProductFilters({ search: "", minPrice: "", maxPrice: "" });
  };

  // Cart updates use functional state setters to avoid stale values between clicks.
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

  // Zod validates the form before the credentials are sent to the server.
  const handleAuthSubmit = async (authData: AuthForm) => {
    setActionError(null);
    setIsSubmitting(true);

    try {
      // Restore the cart belonging to the account that just authenticated.
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const response = await api.post<{ token: string; user: User }>(endpoint, authData);
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      setToken(response.data.token);
      setUser(response.data.user);
      setCart(readStoredCart(response.data.user.id));
      profileForm.reset({ name: response.data.user.name });
      authForm.reset();
    } catch (error: unknown) {
      const fields = getApiFieldErrors(error);
      for (const field of ["name", "email", "password"] as const) {
        if (fields[field]) authForm.setError(field, { message: fields[field] });
      }
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
    // The cart is already saved under this user's ID and will be restored on login.
    setCart([]);
    setActiveTab("shop");
    setActionError(null);
  };

  // The API recalculates prices and totals from MySQL before saving the order.
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
      // Clear the local cart only after the server confirms the order was saved.
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

  // Ask before the irreversible delete, then refresh the list after success.
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

  // The API returns a replacement JWT because the user's name is part of its claims.
  const handleUpdateProfile = async (profileData: ProfileForm) => {
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
      profileForm.reset({ name: response.data.user.name });
    } catch (error: unknown) {
      const fields = getApiFieldErrors(error);
      if (fields.name) profileForm.setError("name", { message: fields.name });
      else setActionError(getApiErrorMessage(error, "Failed to update profile."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    // Guests see the sign-in / registration form until authentication succeeds.
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <h1>🛍 Shopee Clone</h1>
            <p>{isSignup ? "Create your new account" : "Log in to start shopping"}</p>
          </div>
          <form
            onSubmit={authForm.handleSubmit(handleAuthSubmit)}
            onChange={() => setActionError(null)}
            className="auth-form"
            noValidate
          >
            {isSignup && (
              <input
                {...authForm.register("name")}
                aria-invalid={Boolean(authForm.formState.errors.name)}
                className="auth-input"
                placeholder="Full Name"
                required
              />
            )}
            {isSignup && authForm.formState.errors.name && (
              <small className="field-error">{authForm.formState.errors.name.message}</small>
            )}
            <input
              {...authForm.register("email")}
              type="email"
              aria-invalid={Boolean(authForm.formState.errors.email)}
              className="auth-input"
              placeholder="Email Address"
              required
            />
            {authForm.formState.errors.email && (
              <small className="field-error">{authForm.formState.errors.email.message}</small>
            )}
            <input
              {...authForm.register("password")}
              type="password"
              aria-invalid={Boolean(authForm.formState.errors.password)}
              className="auth-input"
              placeholder="Password"
              required
            />
            {authForm.formState.errors.password && (
              <small className="field-error">{authForm.formState.errors.password.message}</small>
            )}
            {actionError && <p className="status-message error-message" role="alert">{actionError}</p>}
            <button type="submit" className="auth-button" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : isSignup ? "Sign Up" : "Log In"}
            </button>
          </form>
          <div className="auth-toggle-container">
            <button
              onClick={() => {
                setIsSignup((previous) => !previous);
                authForm.clearErrors();
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

        {/* Product catalog loaded by the shared API data hook. */}
        {activeTab === "shop" && (
          <>
            <form className="product-filters" onSubmit={handleProductSearch}>
              <label>
                <span>Search products</span>
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.currentTarget.value)}
                  placeholder="Name or description"
                  maxLength={100}
                />
              </label>
              <label>
                <span>Minimum price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minProductPrice}
                  onChange={(event) => setMinProductPrice(event.currentTarget.value)}
                  placeholder="$0.00"
                />
              </label>
              <label>
                <span>Maximum price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxProductPrice}
                  onChange={(event) => setMaxProductPrice(event.currentTarget.value)}
                  placeholder="No limit"
                />
              </label>
              <button type="submit" className="btn-submit">Search / Filter</button>
              <button type="button" className="btn-filter-clear" onClick={clearProductFilters}>
                Clear
              </button>
            </form>
            {productsLoading && <p className="status-message" role="status">Loading products...</p>}
            {productsError && <p className="status-message error-message" role="alert">{productsError}</p>}
            {!productsLoading && !productsError && products.length === 0 && (
              <p className="status-message">
                {appliedProductFilters.search || appliedProductFilters.minPrice || appliedProductFilters.maxPrice
                  ? "No products match your search or price range."
                  : "No products are available right now."}
              </p>
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

        {/* Cart controls and checkout form. */}
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

        {/* Orders are scoped to the signed-in user by the server. */}
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

        {/* Profile updates return a new token containing the updated display name. */}
        {activeTab === "profile" && (
          <div className="profile-card" style={{ maxWidth: "500px", margin: "0 auto" }}>
            <h3 className="card-title">Account Settings</h3>
            <form
              onSubmit={profileForm.handleSubmit(handleUpdateProfile)}
              className="checkout-form"
              noValidate
            >
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
                  {...profileForm.register("name")}
                  type="text"
                  aria-invalid={Boolean(profileForm.formState.errors.name)}
                  className="form-input"
                  required
                />
                {profileForm.formState.errors.name && (
                  <small className="field-error">{profileForm.formState.errors.name.message}</small>
                )}
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
