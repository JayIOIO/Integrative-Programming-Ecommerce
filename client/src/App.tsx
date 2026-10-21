// React hooks for component state, side effects, and form event types
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
// Connects Zod validation schemas to React Hook Form
import { zodResolver } from "@hookform/resolvers/zod";
// Lightweight form management library for validation, errors, and input registration
import { useForm } from "react-hook-form";
// Our configured axios instance and error parsing helper functions
import { api, getApiErrorMessage, getApiFieldErrors } from "./api/axios";
// Reusable custom hook for fetching data (products, orders) with loading and error states
import { useApiData } from "./hooks/useApiData";
// Zod schemas defining rules for checkout, login/signup, and profile updates
import { checkoutSchema, createAuthSchema, profileSchema } from "./validation/schemas";
// TypeScript type definitions for all our data models and form values
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
// Main stylesheet containing Shopee-inspired colors, card layouts, and responsive styles
import "./App.css";

// Read and validate the saved user session from browser localStorage on startup.
// If the stored data is corrupted or missing required fields, wipe it and return null.
function readStoredUser(): User | null {
  // Check if there is a saved "user" key in localStorage
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null; // No user logged in previously

  try {
    // Parse the JSON string back into a JavaScript object
    const parsed: unknown = JSON.parse(storedUser);
    // Strict runtime check to ensure id, name, and email all exist with valid types
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
      return parsed as User; // Safe to cast and use as our User type
    }
  } catch (error) {
    // If JSON parsing fails (e.g. malformed data), log it for debugging
    console.error("Stored user data could not be read:", error);
  }

  // Clear corrupted data so it doesn't break future sessions
  localStorage.removeItem("user");
  return null;
}

// Generates a unique localStorage key per user account (e.g., "cart:1", "cart:2").
// This ensures that different users logging in on the same computer don't see each other's carts.
function getCartStorageKey(userId: number): string {
  return `cart:${userId}`;
}

// Retrieves and parses the user's cart from localStorage.
// Every item is validated to make sure it has valid id, name, price, and positive quantity.
function readStoredCart(userId: number): CartItem[] {
  // Grab the cart items specifically saved for this user's ID
  const storedCart = localStorage.getItem(getCartStorageKey(userId));
  if (!storedCart) return []; // Empty cart if nothing was saved

  try {
    const parsed: unknown = JSON.parse(storedCart);
    // Verify that the parsed data is an array and every element matches the CartItem shape
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

  // Remove bad cart data if validation fails
  localStorage.removeItem(getCartStorageKey(userId));
  return [];
}

// Main application component
function App() {
  // Authentication state: JWT token stored in localStorage, empty string if logged out
  const [token, setToken] = useState(() => localStorage.getItem("token") ?? "");
  // Current logged-in user profile, initialized from validated localStorage data
  const [user, setUser] = useState<User | null>(readStoredUser);
  // Toggle between Login form (false) and Sign-Up form (true)
  const [isSignup, setIsSignup] = useState(false);
  // Controls which tab is active: "shop" (products), "cart", "orders", or "profile"
  const [activeTab, setActiveTab] = useState<StoreTab>("shop");

  // Search input state for product name or description
  const [productSearch, setProductSearch] = useState("");
  // Filter input state for minimum price
  const [minProductPrice, setMinProductPrice] = useState("");
  // Filter input state for maximum price
  const [maxProductPrice, setMaxProductPrice] = useState("");
  // Applied filters that actually trigger the backend search when the user clicks "Search"
  const [appliedProductFilters, setAppliedProductFilters] = useState({
    search: "",
    minPrice: "",
    maxPrice: "",
  });

  // Shopping cart items list, initialized from the logged-in user's stored cart
  const [cart, setCart] = useState<CartItem[]>(() =>
    user ? readStoredCart(user.id) : [],
  );

  // Controlled form state for the shipping and payment checkout inputs
  const [checkoutData, setCheckoutData] = useState<CheckoutForm>({
    customerName: user?.name ?? "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    phone: "",
    payment_method: "Credit Card",
  });

  // React Hook Form for handling user sign-in and sign-up with dynamic Zod validation
  const authForm = useForm<AuthForm>({
    resolver: zodResolver(createAuthSchema(isSignup)),
    defaultValues: { name: "", email: "", password: "" },
    mode: "onBlur", // validate fields when the user clicks out of the input
  });

  // React Hook Form for updating account display name under settings
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "" },
    mode: "onBlur",
  });

  // Banner error message for API failures (e.g., server down, invalid login)
  const [actionError, setActionError] = useState<string | null>(null);
  // Temporary popup toast message for successful actions (e.g. "Added to cart", "Order placed")
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  // Per-field validation errors for the checkout form (address, phone, city, etc.)
  const [checkoutErrors, setCheckoutErrors] = useState<
    Partial<Record<keyof CheckoutForm | "cartItems", string>>
  >({});
  // Disables submit buttons and shows loading text while an API request is in progress
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatically dismiss the confirmation toast notification after ~2.8 seconds
  useEffect(() => {
    if (!confirmationMessage) return;

    const timeoutId = window.setTimeout(() => setConfirmationMessage(null), 2800);
    return () => window.clearTimeout(timeoutId); // Clean up timer if message changes or unmounts
  }, [confirmationMessage]);

  // Construct URL query parameters for product searching and price filtering
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

  // Fetch product catalog from GET /api/products (with any active search/price queries)
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refresh: refreshProducts,
  } = useApiData<Product>(`/products${productQuery.size ? `?${productQuery}` : ""}`);

  // Fetch orders for the current user from GET /api/orders (only when logged in with a token)
  const {
    data: orders,
    loading: ordersLoading,
    error: ordersError,
    refresh: refreshOrders,
  } = useApiData<Order>(token ? "/orders" : null, token, user?.id);

  // Whenever cart items change, synchronize and save them into localStorage under the user's ID
  useEffect(() => {
    if (user) {
      localStorage.setItem(getCartStorageKey(user.id), JSON.stringify(cart));
    }
  }, [cart, user]);

  // Calculate the total cost of all items currently in the shopping cart
  const cartTotal = cart.reduce(
    (total, item) => total + Number(item.price) * item.quantity,
    0,
  );

  // Authorization headers for protected backend endpoints requiring Bearer token
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  // Handles text changes in checkout inputs (name, address, phone, city, payment method)
  const handleCheckoutChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.currentTarget;
    // Update the field value in component state
    setCheckoutData((previous) => ({ ...previous, [name]: value }));
    // Clear the error on this specific field as soon as the user starts editing it
    setCheckoutErrors((previous) => ({
      ...previous,
      [name]: undefined,
      address: name === "address" ? undefined : previous.address,
    }));
    setActionError(null);
  };

  // Triggers catalog search and filtering when the search form is submitted
  const handleProductSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedProductFilters({
      search: productSearch.trim(),
      minPrice: minProductPrice,
      maxPrice: maxProductPrice,
    });
  };

  // Clears all search and filter input fields and restores the full product catalog view
  const clearProductFilters = () => {
    setProductSearch("");
    setMinProductPrice("");
    setMaxProductPrice("");
    setAppliedProductFilters({ search: "", minPrice: "", maxPrice: "" });
  };

  // Adds an item to the cart, or increments its quantity by 1 if it's already in the cart
  const addToCart = (product: Product) => {
    setCart((previous) => {
      const existingItem = previous.find((item) => item.id === product.id);
      return existingItem
        ? previous.map((item) =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
          )
        : [...previous, { ...product, quantity: 1 }];
    });
    // Trigger the bottom-right toast confirmation
    setConfirmationMessage(`${product.name} added to your cart.`);
  };

  // Completely removes a product from the shopping cart
  const removeFromCart = (productId: number) => {
    setCart((previous) => previous.filter((item) => item.id !== productId));
  };

  // Updates an item's quantity by a positive or negative delta (ensures minimum of 1)
  const updateQuantity = (productId: number, delta: number) => {
    setCart((previous) =>
      previous.map((item) =>
        item.id === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  };

  // Submits login or signup credentials to the Express backend
  const handleAuthSubmit = async (authData: AuthForm) => {
    setActionError(null);
    setIsSubmitting(true);

    try {
      // Pick the correct endpoint depending on whether the user is signing up or logging in
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const response = await api.post<{ token: string; user: User }>(endpoint, authData);

      // Save token and user details to localStorage so they persist across page refreshes
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));

      // Update React state with the authenticated session
      setToken(response.data.token);
      setUser(response.data.user);
      // Load any existing cart saved for this specific user
      setCart(readStoredCart(response.data.user.id));
      // Pre-fill the customer's name in checkout form
      setCheckoutData((previous) => ({ ...previous, customerName: response.data.user.name }));
      // Pre-fill profile settings with the user's name
      profileForm.reset({ name: response.data.user.name });
      authForm.reset();
    } catch (error: unknown) {
      // Extract field-specific errors returned from the server (e.g. duplicate email)
      const fields = getApiFieldErrors(error);
      for (const field of ["name", "email", "password"] as const) {
        if (fields[field]) authForm.setError(field, { message: fields[field] });
      }
      // If there are no specific field errors, display a general banner error message
      if (Object.keys(fields).length === 0) {
        setActionError(getApiErrorMessage(error, "Authentication failed."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Logs the user out by clearing tokens and resetting user-specific state
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    // Note: the cart remains safely saved under cart:<userId> in localStorage for next login
    setCart([]);
    setActiveTab("shop");
    setActionError(null);
  };

  // Validates checkout details with Zod and sends the order to POST /api/orders
  const handleCheckoutSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof CheckoutForm | "cartItems", string>> = {};

    // Validate form inputs (name, address, city, province, postal code, phone, payment) against Zod schema
    const validation = checkoutSchema.safeParse(checkoutData);
    if (!validation.success) {
      // Map Zod validation errors to our local state so red error messages appear under each field
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (
          (field === "customerName" ||
            field === "address" ||
            field === "city" ||
            field === "province" ||
            field === "postalCode" ||
            field === "phone" ||
            field === "payment_method") &&
          !errors[field]
        ) {
          errors[field] = issue.message;
        }
      }
    }

    // Ensure the cart actually has items before checking out
    if (cart.length === 0) errors.cartItems = "Add at least one item before checkout.";
    setCheckoutErrors(errors);

    // Stop submission if validation failed
    if (!validation.success || Object.keys(errors).length > 0) return;

    const shippingDetails = validation.data;
    // Format the full delivery address as a comma-separated string for the database
    const shippingAddress = [
      shippingDetails.address,
      shippingDetails.city,
      shippingDetails.province,
      shippingDetails.postalCode,
    ].join(", ");

    setActionError(null);
    setIsSubmitting(true);

    try {
      // Send the order to the backend API; backend verifies stock and calculates prices in a transaction
      await api.post(
        "/orders",
        {
          customer_name: shippingDetails.customerName,
          address: shippingAddress,
          phone: shippingDetails.phone,
          payment_method: shippingDetails.payment_method,
          total_amount: cartTotal.toFixed(2),
          cartItems: cart,
        },
        authConfig,
      );

      // Clear the local shopping cart now that order is confirmed
      setCart([]);
      // Reset checkout input fields
      setCheckoutData({
        customerName: user?.name ?? "",
        address: "",
        city: "",
        province: "",
        postalCode: "",
        phone: "",
        payment_method: "Credit Card",
      });
      // Refresh order history and product stock counts
      refreshOrders();
      refreshProducts();
      // Switch view to the "orders" tab to show the placed order
      setActiveTab("orders");
      setConfirmationMessage("Order placed successfully!");
    } catch (error: unknown) {
      // Handle server-side errors (e.g. out of stock, invalid inputs)
      const fields = getApiFieldErrors(error);
      setCheckoutErrors({
        customerName: fields.customer_name,
        address: fields.address,
        phone: fields.phone,
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

  // Sends PUT /api/orders/:id to change an order status (Pending, Processing, Shipped, Delivered)
  const handleUpdateOrderStatus = async (orderId: number, status: string) => {
    setActionError(null);
    try {
      await api.put(`/orders/${orderId}`, { status }, authConfig);
      refreshOrders(); // Re-fetch updated orders
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error, "Failed to update order status."));
    }
  };

  // Prompts user for confirmation, then sends DELETE /api/orders/:id to cancel an order
  const handleDeleteOrder = async (orderId: number) => {
    if (!window.confirm("Are you sure you want to cancel and delete this order?")) return;

    setActionError(null);
    try {
      await api.delete(`/orders/${orderId}`, authConfig);
      refreshOrders(); // Re-fetch orders after deletion
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error, "Failed to delete order."));
    }
  };

  // Sends PUT /api/auth/profile to update the user's name and receives a fresh JWT token
  const handleUpdateProfile = async (profileData: ProfileForm) => {
    setActionError(null);
    setIsSubmitting(true);
    try {
      const response = await api.put<{ token: string; user: User }>(
        "/auth/profile",
        { name: profileData.name },
        authConfig,
      );
      // Store the new JWT token containing the updated name in localStorage
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      // Update app state
      setToken(response.data.token);
      setUser(response.data.user);
      setCheckoutData((previous) => ({ ...previous, customerName: response.data.user.name }));
      profileForm.reset({ name: response.data.user.name });
    } catch (error: unknown) {
      const fields = getApiFieldErrors(error);
      if (fields.name) profileForm.setError("name", { message: fields.name });
      else setActionError(getApiErrorMessage(error, "Failed to update profile."));
    } finally {
      setIsSubmitting(false);
    }
  };

  // If there is no active JWT token, render the authentication view (Login / Register)
  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          {/* Header with Shopee branding and current mode title */}
          <div className="auth-header">
            <h1>🛍 Shopee Clone</h1>
            <p>{isSignup ? "Create your new account" : "Log in to start shopping"}</p>
          </div>

          {/* Login / Signup form handled by React Hook Form */}
          <form
            onSubmit={authForm.handleSubmit(handleAuthSubmit)}
            onChange={() => setActionError(null)}
            className="auth-form"
            noValidate
          >
            {/* Full Name input: only shown during sign up */}
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

            {/* Email input field */}
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

            {/* Password input field */}
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

            {/* Banner error display for invalid credentials or server errors */}
            {actionError && <p className="status-message error-message" role="alert">{actionError}</p>}

            {/* Submit button with loading state */}
            <button type="submit" className="auth-button" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : isSignup ? "Sign Up" : "Log In"}
            </button>
          </form>

          {/* Toggle between Sign In and Sign Up modes */}
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

  // Navigation tab definitions with live item count badges
  const tabs: { id: StoreTab; label: string }[] = [
    { id: "shop", label: "Mall Products" },
    { id: "cart", label: `My Cart (${cart.reduce((sum, item) => sum + item.quantity, 0)})` },
    { id: "orders", label: `My Orders (${orders.length})` },
    { id: "profile", label: "My Account Settings" },
  ];

  // Main authenticated application view
  return (
    <div>
      {/* Top navigation header with logo and user logout */}
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

      {/* Main navigation bar for switching between store tabs */}
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

      {/* Bottom-right toast notification for cart additions and orders */}
      {confirmationMessage && (
        <div className="confirmation-toast" role="status" aria-live="polite">
          <span className="confirmation-toast-icon" aria-hidden="true">✓</span>
          {confirmationMessage}
        </div>
      )}

      {/* Main content area */}
      <main className="main-container">
        {/* Banner error message if an action fails */}
        {actionError && <p className="status-message error-message" role="alert">{actionError}</p>}

        {/* TAB 1: PRODUCT CATALOG & SEARCH */}
        {activeTab === "shop" && (
          <>
            {/* Search and price filter controls */}
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

            {/* Loading and error feedback for products */}
            {productsLoading && <p className="status-message" role="status">Loading products...</p>}
            {productsError && <p className="status-message error-message" role="alert">{productsError}</p>}
            {!productsLoading && !productsError && products.length === 0 && (
              <p className="status-message">
                {appliedProductFilters.search || appliedProductFilters.minPrice || appliedProductFilters.maxPrice
                  ? "No products match your search or price range."
                  : "No products are available right now."}
              </p>
            )}

            {/* Responsive product cards grid */}
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

        {/* TAB 2: CART & CHECKOUT FORM */}
        {activeTab === "cart" && (
          <div>
            {cart.length === 0 ? (
              // Empty cart placeholder with a quick link back to shopping
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
              // Two-column layout: Cart items on the left, Checkout form on the right
              <div className="cart-layout">
                {/* List of items currently in the cart */}
                <div className="cart-card">
                  <h3 className="card-title">Cart Items</h3>
                  {cart.map((item) => (
                    <div key={item.id} className="cart-item">
                      <div style={{ flex: 2 }}>
                        <h4 style={{ fontSize: "14px" }}>{item.name}</h4>
                        <small style={{ color: "#888" }}>${Number(item.price).toFixed(2)}</small>
                      </div>
                      {/* Quantity stepper buttons (- and +) */}
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                        <button onClick={() => updateQuantity(item.id, -1)} className="qty-btn">-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="qty-btn">+</button>
                      </div>
                      {/* Item subtotal */}
                      <div style={{ flex: 1, textAlign: "right", fontWeight: "bold", color: "#ee4d2d" }}>
                        ${(Number(item.price) * item.quantity).toFixed(2)}
                      </div>
                      {/* Remove item button */}
                      <button onClick={() => removeFromCart(item.id)} className="btn-remove">✕</button>
                    </div>
                  ))}
                </div>

                {/* Checkout card with address, contact, and payment fields */}
                <div className="checkout-card">
                  <h3 className="card-title">Checkout</h3>
                  <div className="checkout-total">
                    <span>Total Pay:</span>
                    <span style={{ color: "#ee4d2d" }}>${cartTotal.toFixed(2)}</span>
                  </div>

                  <form onSubmit={handleCheckoutSubmit} className="checkout-form" noValidate>
                    <h4>Shipping details</h4>
                    <p className="checkout-hint">Delivery addresses must be in the Philippines.</p>

                    {/* Customer recipient name */}
                    <label className="form-label" htmlFor="checkout-customer-name">CUSTOMER NAME</label>
                    <input
                      id="checkout-customer-name"
                      name="customerName"
                      type="text"
                      aria-invalid={Boolean(checkoutErrors.customerName)}
                      className="form-input"
                      autoComplete="name"
                      value={checkoutData.customerName}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.customerName && (
                      <small className="field-error">{checkoutErrors.customerName}</small>
                    )}

                    {/* Street address */}
                    <label className="form-label" htmlFor="shipping-address">STREET ADDRESS</label>
                    <input
                      id="shipping-address"
                      name="address"
                      aria-invalid={Boolean(checkoutErrors.address)}
                      className="form-input"
                      autoComplete="street-address"
                      placeholder="123 Mabini St. or Block 2 Lot 5, Sampaguita"
                      value={checkoutData.address}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.address && (
                      <small className="field-error">{checkoutErrors.address}</small>
                    )}

                    {/* City / Municipality */}
                    <label className="form-label" htmlFor="shipping-city">CITY</label>
                    <input
                      id="shipping-city"
                      name="city"
                      type="text"
                      aria-invalid={Boolean(checkoutErrors.city)}
                      className="form-input"
                      autoComplete="address-level2"
                      placeholder="Quezon City"
                      value={checkoutData.city}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.city && (
                      <small className="field-error">{checkoutErrors.city}</small>
                    )}

                    {/* Province or Region */}
                    <label className="form-label" htmlFor="shipping-province">PROVINCE / REGION</label>
                    <input
                      id="shipping-province"
                      name="province"
                      type="text"
                      aria-invalid={Boolean(checkoutErrors.province)}
                      className="form-input"
                      autoComplete="address-level1"
                      placeholder="Cebu or Metro Manila"
                      value={checkoutData.province}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.province && (
                      <small className="field-error">{checkoutErrors.province}</small>
                    )}

                    {/* 4-digit Philippine Postal code */}
                    <label className="form-label" htmlFor="shipping-postal-code">POSTAL CODE</label>
                    <input
                      id="shipping-postal-code"
                      name="postalCode"
                      type="text"
                      aria-invalid={Boolean(checkoutErrors.postalCode)}
                      className="form-input"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="6000"
                      value={checkoutData.postalCode}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.postalCode && (
                      <small className="field-error">{checkoutErrors.postalCode}</small>
                    )}

                    {/* Contact Phone number */}
                    <label className="form-label" htmlFor="shipping-phone">PHONE NUMBER</label>
                    <input
                      id="shipping-phone"
                      name="phone"
                      type="tel"
                      aria-invalid={Boolean(checkoutErrors.phone)}
                      className="form-input"
                      autoComplete="tel"
                      placeholder="+1 415 555 0132 or 0917 123 4567"
                      value={checkoutData.phone}
                      onChange={handleCheckoutChange}
                      required
                    />
                    {checkoutErrors.phone && (
                      <small className="field-error">{checkoutErrors.phone}</small>
                    )}

                    {/* Payment method selection dropdown */}
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

                    {/* Submit order button */}
                    <button type="submit" className="btn-submit" disabled={isSubmitting}>
                      {isSubmitting ? "Placing order..." : "Place Order"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ORDER HISTORY & STATUS MANAGEMENT */}
        {activeTab === "orders" && (
          <div className="orders-card">
            <h3 className="card-title">Order History</h3>
            {/* Loading and empty states */}
            {ordersLoading && <p className="status-message" role="status">Loading orders...</p>}
            {ordersError && <p className="status-message error-message" role="alert">{ordersError}</p>}
            {!ordersLoading && !ordersError && orders.length === 0 && (
              <p style={{ color: "#888" }}>No order records found.</p>
            )}

            {/* List of user orders */}
            <div className="orders-list">
              {orders.map((order) => (
                <div key={order.id} className="order-item-card">
                  {/* Order summary info */}
                  <div>
                    <h4 style={{ margin: "0 0 5px 0" }}>Order #{order.id}</h4>
                    <p style={{ fontSize: "13px", color: "#555" }}>Customer: {order.customer_name}</p>
                    <p style={{ fontSize: "13px", color: "#555" }}>Address: {order.address}</p>
                    {order.phone && (
                      <p style={{ fontSize: "13px", color: "#555" }}>Phone: {order.phone}</p>
                    )}
                    <p style={{ fontSize: "13px", color: "#555" }}>Payment: {order.payment_method}</p>
                    <strong style={{ color: "#ee4d2d", fontSize: "16px" }}>
                      Total: ${Number(order.total_amount).toFixed(2)}
                    </strong>
                  </div>

                  {/* Order controls: status update dropdown and cancel/delete button */}
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

        {/* TAB 4: ACCOUNT PROFILE SETTINGS */}
        {activeTab === "profile" && (
          <div className="profile-card" style={{ maxWidth: "500px", margin: "0 auto" }}>
            <h3 className="card-title">Account Settings</h3>
            <form
              onSubmit={profileForm.handleSubmit(handleUpdateProfile)}
              className="checkout-form"
              noValidate
            >
              {/* Display user's email as read-only */}
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

              {/* Editable display name */}
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

              {/* Submit button for saving profile changes */}
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
