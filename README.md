Solar ERP & Warehouse System

A professional Single Page Application (SPA) for managing solar inventory, warehouse operations, procurement, and finances.

🚀 Features

Role-Based Access Control: Admin, Staff, Warehouse, Finance.

Inventory Management: Real-time stock tracking with QR code support.

Voucher System: Purchase Orders, Goods Received Notes (GRN), and Stock Issue Requests.

Financial Overview: Asset valuation and potential sales calculations.

Responsive Design: Works on desktops, tablets, and mobile devices.

🛠 Deployment Guide (GitHub Pages)

This application is designed to run directly from GitHub Pages without any build steps (Webpack, Vite, etc.) required.

Step 1: Create Repository

Go to GitHub and create a new repository (e.g., solar-erp).

Clone the repository to your computer or use the GitHub web interface.

Step 2: Upload Files

Upload the index.html file provided here to the root of your repository.

Create an empty file named `.nojekyll` in the root. This tells GitHub Pages to skip the Jekyll build process, making deployment much faster.

Commit and push the changes.

Step 3: Enable GitHub Pages

Go to your repository Settings.

Click on Pages in the left sidebar.

Under Source, select Deploy from a branch.

Select main (or master) branch and / (root) folder.

Click Save.

Wait a few minutes, and GitHub will provide you with a live URL (e.g., https://yourusername.github.io/solar-erp/).

🔐 Security Note

This application uses Firebase client-side keys. While common for SPAs:

Restrict your API Keys: Go to Google Cloud Console > APIs & Services > Credentials. Restrict the API key to only accept requests from your specific GitHub Pages domain.

Firebase Security Rules: You MUST configure Firestore Security Rules in the Firebase Console to prevent unauthorized access. Do not rely solely on the frontend code for security.

Example Secure Rules:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId; // Users can only edit their own profile
    }
    match /inventory/{itemId} {
      allow read: if request.auth != null; // Any logged in user can view stock
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'warehouse'];
    }
    // ... add rules for vouchers and transactions
  }
}
