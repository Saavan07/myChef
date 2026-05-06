# MyChef 🍳
### Personalized Meal Planning for College Students

MyChef is a weekly meal planning web app built for college students cooking independently. Most students rely on takeout due to low cooking confidence, and existing apps don't teach real skills. MyChef combines meal planning, pantry tracking, smart shopping lists, and embedded cooking technique tips so students can learn while they cook.

---

## Features

- 7-day personalized meal plan generation
- Recipe filtering by dietary tags (vegan, gluten-free, etc.)
- Pantry tracking to avoid redundant shopping
- Smart shopping list generation with ingredient normalization and aggregation
- Favorites system with bonus scoring in meal plan generation
- Manual and automatic meal swapping
- Nearby grocery store search via Google Places API
- Store reviews from a nutritionist perspective
- Step-by-step recipes with embedded cooking tips

---

## Technical Architecture

```
Frontend (Vanilla JS, port 3000)
        |
        v
  API Gateway (Express/Node.js, port 4000)
        |
   +---------+-----------------+-----------------+
   v         v                 v                 v
Account   Meal Storage    Meal Plan          Grocery Store
Service   (MySQL)         Generation         Locator
(MySQL)                   (Node.js)          (Google Places API)
```

**Frontend** is a single-page app built with vanilla JavaScript served by an Express static server. A central state object controls the entire UI. Optimizations include recipe detail caching via `Map`, pagination, and `localStorage` session persistence.

**Backend** is a Node.js/Express API server that handles meal plan generation, ingredient parsing and normalization, shopping list aggregation, store search, reviews, and user data management.

**Database** uses MySQL with JSON fields for flexible data (preferences, pantry, favorites, plans) alongside a structured relational schema for users, recipes, grocery stores, and reviews.

**Google Places API** converts user location input to coordinates, queries nearby grocery stores, and computes distances.

**Meal Plan Algorithm** filters recipes by dietary restrictions and preferences, then scores candidates using favorites (+30), pantry overlap (+10 per ingredient), recency penalties, and random variation. Weighted random selection produces non-repetitive weekly plans.

**Shopping List Engine** parses ingredient strings, normalizes names and units, aggregates quantities, and compares against the pantry. Output is split into "need to buy" and "already have."

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [MySQL](https://dev.mysql.com/downloads/) v8 or higher
- A [Google Places API key](https://developers.google.com/maps/documentation/places/web-service/get-api-key)

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/<your-org>/mychef.git
cd mychef
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure environment variables**

Create a `.env` file in the project root:
```env
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=mychef
DB_PORT=3306
GOOGLE_PLACES_API_KEY=your_google_places_api_key
API_HOST=127.0.0.1
API_PORT=4000
BACKEND_URL=http://127.0.0.1:4000
```

**4. Set up the database**
```bash
mysql -u your_mysql_user -p < schema.sql
```

**5. Seed recipes (optional)**
```bash
node seedRecipes.js
```

**6. Start the backend**
```bash
node app.js
```

**7. Start the frontend**
```bash
node server.js
```

The app will be available at `http://127.0.0.1:3000`.

---

## Team

| Name | Role |
|------|------|
| **Ayush** | Frontend: UI components, state management |
| **Saavan** | Frontend: UI components, CSS design system |
| **Tanish** | Backend: meal plan generation, shopping list engine |
| **Sam** | Backend: store search, reviews, user data management |
