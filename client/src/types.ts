// Data shapes returned by the Express API and used by the storefront.
export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number | string;
  image_url: string | null;
  stock: number;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Order {
  id: number;
  address: string;
  payment_method: string;
  total_amount: number | string;
  status: string;
}

// Form value shapes shared with the authentication, checkout, and profile flows.
export interface AuthForm {
  name: string;
  email: string;
  password: string;
}

export interface CheckoutForm {
  address: string;
  payment_method: string;
}

export interface ProfileForm {
  name: string;
}

export type StoreTab = "shop" | "cart" | "orders" | "profile";
