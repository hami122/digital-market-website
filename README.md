# Digital Market — standalone website

This is a **separate** Node.js store, unrelated to any Telegram bot. Node >=18, no external packages. Russian storefront and password-protected `/admin`.

## Railway setup

1. Upload the contents of this folder to the **website's own GitHub repository**, not the Telegram bot repository.
2. In Railway, deploy that repository, with start command `npm start`.
3. Set `ADMIN_PASSWORD` to a unique strong password of at least 12 characters. Do not commit passwords to GitHub.
4. Attach a persistent Railway Volume mounted at `/data`; set `DATA_DIR=/data` in Variables **before accepting orders**. Without the volume, products, orders and customers may be lost on redeploy.
5. Generate a Railway public domain; visit `https://YOUR_DOMAIN/admin` to log in.
6. In the admin panel, configure **Настройки и оплата** (store title, currency, manager contact, manual payment instructions and whether orders are accepted).

## Included

- Admin: password login, product create/edit/delete, categories via product category field, stock and visibility, order statuses, customer list, payment instructions, accepting/pausing orders.
- Public: catalog, categories, search, cart, order submission and confirmation ID. Orders saved server-side. Total calculated on server, not trusted from browser.
- Data stored in `products.json` and `store.json` in `DATA_DIR`.

## Important limitations

- **No real online payment processor** or automatic delivery; admin manually confirms payment and fulfills orders. Never claim a customer paid merely because they submitted an order.
- No customer accounts/login; customer directory is based on order contact information. No standalone category editor; categories are derived from products.
- Admin session tokens are in server memory and reset on restart. Single-instance deployment recommended. Back up Railway Volume regularly.
- The website is independent of Telegram. No shared database or API.
- Before production, publish privacy/terms and configure operational protections, notification workflows and backups appropriate to your business.
