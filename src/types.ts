import type { Timestamp } from 'firebase/firestore';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid';
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'customer';
  displayName?: string;
  points?: number;
  createdAt?: string;
}

export interface Reward {
  id: string;
  userId: string;
  title: string;
  qrCodeToken: string;
  status: 'active' | 'redeemed';
  createdAt: Timestamp;
  expiresAt: Timestamp;
}
