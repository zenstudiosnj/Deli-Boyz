# Firestore Security Specification - Deli Boyz Online

## Data Invariants
1. **User Profiles**: Only the owner can read/write their own profile. Roles (admin) can only be set by the system during first-time login for the bootstrap email `zxymgmt@gmail.com`.
2. **Menu Items**: Publicly readable. Only admins can create, update, or delete.
3. **Orders**: Users can only see their own orders. Only admins can see all orders and update status/paymentStatus. Once an order is 'completed', it is immutable for regular users.

## The Dirty Dozen (Test Payloads)
1. **Identity Spoofing**: Attempting to create an order with another user's `customerId`.
2. **Role Escalation**: A regular user trying to update their role to 'admin'.
3. **Menu Poisoning**: A guest trying to delete a sandwich from the menu.
4. **Order Scraping**: User A trying to `list` orders belonging to User B.
5. **Terminal Bypass**: Trying to change the `total` of a 'completed' order.
6. **Shadow Field**: Adding a `discount: 1.0` field to an order creation.
7. **Junk ID**: Injecting a 2KB string as a `menuId`.
8. **Owner Hijack**: User B trying to change the `customerEmail` of User A's profile.
9. **Status Fast-track**: A customer trying to change their order status to 'ready' directly.
10. **Payment Spoof**: A customer trying to change `paymentStatus` to 'paid'.
11. **Negative Price**: Creating a menu item with a negative price.
12. **Anonymous Write**: Attempting to place an order while not signed in.
