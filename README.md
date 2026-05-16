# 💰 Casual Budget

A budget app built for casual workers with variable income. Log each pay as it arrives and the app splits it across your budget categories automatically.

## ✨ Features
- 💰 Log each pay as it hits your account
- 📊 See a live percentage split of every pay across categories
- ✅ Checklist to tick off payments with running balance
- 🛍️ Purchase tracker per pay period
- 💳 Debt tracker with paydown progress
- 📅 Full pay history with totals
- ⚙️ Configurable categories, percentages and header cards
- ☁️ Real-time Firebase sync across phone & computer

## 🚀 Setup

### 1. Firebase
1. Go to **https://console.firebase.google.com** → Add project
2. Click **Databases** → Add database → Standard → Test mode → australia-southeast1
3. Gear icon → Project settings → Your apps → `</>` web → NPM → copy firebaseConfig
4. Paste into `src/firebase.js`

### 2. Set unique DOC_ID
In `src/App.jsx` find:
```js
const DOC_ID = 'casual-budget'
```
Change to something unique per user e.g. `'casual-budget-sarah'`

### 3. Deploy
1. Upload to GitHub via GitHub Desktop
2. Import to Vercel → Deploy
3. Bookmark your URL on phone & computer

## 🛠 Local dev
```bash
npm install
npm run dev
```
