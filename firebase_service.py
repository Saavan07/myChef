"""
firebase_service.py
-------------------
Initializes Firebase Admin SDK and exposes a Firestore client.

Setup:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key" — save the JSON file
3. Set the env var:
      export FIREBASE_CREDENTIALS_PATH=/path/to/serviceAccountKey.json
   OR put the JSON content directly in FIREBASE_CREDENTIALS_JSON (useful for
   hosted environments like Railway, Render, etc.)

Collections used:
  users/    — one doc per user (keyed by user_id UUID)
  recipes/  — one doc per recipe (keyed by recipe_id)
"""

import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

_db = None


def get_db() -> firestore.Client:
    """Return the Firestore client, initializing Firebase on first call."""
    global _db
    if _db is not None:
        return _db

    if firebase_admin._apps:
        _db = firestore.client()
        return _db

    creds_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
    creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")

    if creds_path:
        cred = credentials.Certificate(creds_path)
    elif creds_json:
        cred = credentials.Certificate(json.loads(creds_json))
    else:
        raise RuntimeError(
            "Firebase credentials not configured. "
            "Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON."
        )

    firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return _db


def users_col():
    return get_db().collection("users")

def recipes_col():
    return get_db().collection("recipes")

def user_ref(user_id: str):
    return users_col().document(user_id)

def recipe_ref(recipe_id: str):
    return recipes_col().document(recipe_id)


# ---------------------------------------------------------------------------
# Seed recipes (call once on startup if the collection is empty)
# ---------------------------------------------------------------------------

SEED_RECIPES = {
    "r1": {
        "id": "r1",
        "name": "Pasta",
        "ingredients": ["pasta", "tomato sauce", "garlic"],
        "steps": [
            {"instruction": "Fill a large pot with water and bring to a boil over high heat.", "tip": "Salt the water generously — it should taste like the sea. This is your only chance to season the pasta itself."},
            {"instruction": "Add pasta and cook according to package directions (usually 8-10 min).", "tip": "Stir in the first minute to prevent sticking. Taste a piece 1 min before the timer goes off — it should be tender but still have a tiny bit of bite (al dente)."},
            {"instruction": "Drain pasta, then add tomato sauce and minced garlic to the pot.", "tip": "Save a splash of the pasta water before draining — adding a little to the sauce helps it cling to the noodles."},
        ],
        "dietary_tags": ["vegetarian"],
        "meal_type": "dinner",
        "prep_time_minutes": 20,
    },
    "r2": {
        "id": "r2",
        "name": "Grilled Chicken",
        "ingredients": ["chicken breast", "olive oil", "salt", "pepper"],
        "steps": [
            {"instruction": "Pat chicken dry with paper towels, then coat with olive oil, salt, and pepper.", "tip": "Drying the chicken first helps it actually sear instead of steam. Don't skip this."},
            {"instruction": "Heat a pan or grill over medium-high heat until hot.", "tip": "You can tell it's ready by holding your hand 3 inches above the surface — you should only be able to hold it there for about 2 seconds."},
            {"instruction": "Cook 6 minutes per side without moving it around.", "tip": "Resist the urge to poke or flip early. The chicken will release from the pan naturally when it's ready. If it's sticking, it needs more time."},
            {"instruction": "Let rest for 5 minutes before cutting.", "tip": "Resting lets the juices redistribute. Cut too early and they all run out onto the cutting board."},
        ],
        "dietary_tags": ["gluten-free"],
        "meal_type": "dinner",
        "prep_time_minutes": 25,
    },
    "r3": {
        "id": "r3",
        "name": "Caesar Salad",
        "ingredients": ["romaine lettuce", "croutons", "parmesan", "caesar dressing"],
        "steps": [
            {"instruction": "Chop romaine into bite-sized pieces and wash in cold water, then spin or pat dry.", "tip": "Wet lettuce = watery salad. Dressing won't stick to wet leaves, so drying is worth the extra step."},
            {"instruction": "Add croutons and shaved or grated parmesan on top.", "tip": "For extra flavor, rub the bowl with a cut garlic clove before adding the lettuce."},
            {"instruction": "Drizzle dressing and toss to coat evenly.", "tip": "Add less dressing than you think you need, toss, then taste. You can always add more but you can't take it away."},
        ],
        "dietary_tags": ["vegetarian"],
        "meal_type": "lunch",
        "prep_time_minutes": 10,
    },
    "r4": {
        "id": "r4",
        "name": "Stir Fry",
        "ingredients": ["rice", "soy sauce", "broccoli", "carrots", "tofu"],
        "steps": [
            {"instruction": "Cook rice according to package directions.", "tip": "For better texture, rinse the rice under cold water until it runs clear before cooking — removes excess starch."},
            {"instruction": "Cube tofu and pat it very dry, then cook in a hot oiled pan until golden on each side.", "tip": "Tofu browns best when it's dry and the pan is properly hot. Don't crowd the pan or it'll steam instead of crisp."},
            {"instruction": "Add broccoli and carrots to the same pan and stir fry for 4-5 minutes.", "tip": "Keep things moving! Stir frying is meant to be fast and hot. If you walk away, things will burn."},
            {"instruction": "Add soy sauce, toss everything together, and serve over rice.", "tip": "Add the soy sauce around the edge of the pan, not directly on the food — it hits the hot surface first and caramelizes slightly."},
        ],
        "dietary_tags": ["vegetarian", "vegan"],
        "meal_type": "dinner",
        "prep_time_minutes": 30,
    },
    "r5": {
        "id": "r5",
        "name": "Tacos",
        "ingredients": ["ground beef", "taco shells", "cheese", "lettuce", "salsa"],
        "steps": [
            {"instruction": "Cook ground beef in a pan over medium-high heat, breaking it apart as it cooks.", "tip": "Don't stir constantly — let it sit for 30 seconds at a time so it actually browns instead of steaming in its own liquid."},
            {"instruction": "Drain excess fat from the pan.", "tip": "Tip the pan and use a spoon to push the fat to one side, then soak it up with paper towels. Leaving too much fat makes soggy tacos."},
            {"instruction": "Warm taco shells in oven at 350°F for 3-4 minutes.", "tip": "Warming them makes a huge difference in texture. Cold hard shells crack and fall apart immediately."},
            {"instruction": "Assemble tacos with beef, cheese, lettuce, and salsa.", "tip": "Put the cheese on the hot meat first so it melts a little — way better than cold cheese on top."},
        ],
        "dietary_tags": [],
        "meal_type": "dinner",
        "prep_time_minutes": 25,
    },
    "r6": {
        "id": "r6",
        "name": "Scrambled Eggs",
        "ingredients": ["eggs", "butter", "salt", "pepper", "milk"],
        "steps": [
            {"instruction": "Crack eggs into a bowl, add a splash of milk, salt and pepper, and whisk until combined.", "tip": "Don't over-whisk — you just want the yolks and whites combined. Too much air makes them rubbery."},
            {"instruction": "Melt butter in a nonstick pan over low heat.", "tip": "Low and slow is the secret. High heat makes eggs tough and watery."},
            {"instruction": "Pour in egg mixture and gently fold with a spatula as they set.", "tip": "Pull the pan off heat while they still look slightly underdone — carry-over heat finishes them perfectly."},
        ],
        "dietary_tags": ["vegetarian", "gluten-free"],
        "meal_type": "breakfast",
        "prep_time_minutes": 10,
    },
    "r7": {
        "id": "r7",
        "name": "Oatmeal",
        "ingredients": ["oats", "milk", "banana", "honey"],
        "steps": [
            {"instruction": "Combine oats and milk in a pot over medium heat.", "tip": "Use milk instead of water for way creamier oatmeal. Totally worth it."},
            {"instruction": "Stir occasionally for 5 minutes until thick and creamy.", "tip": "Don't walk away — it can bubble up and make a mess fast."},
            {"instruction": "Top with sliced banana and a drizzle of honey.", "tip": "Add the banana at the end so it stays fresh and doesn't get mushy."},
        ],
        "dietary_tags": ["vegetarian", "vegan"],
        "meal_type": "breakfast",
        "prep_time_minutes": 10,
    },
    "r8": {
        "id": "r8",
        "name": "Turkey Sandwich",
        "ingredients": ["turkey", "bread", "lettuce", "tomato", "mustard"],
        "steps": [
            {"instruction": "Lay out two slices of bread and spread mustard on one side.", "tip": "Mustard on one slice, nothing on the other — this keeps the bread from getting soggy."},
            {"instruction": "Layer turkey, lettuce, and tomato.", "tip": "Put the lettuce between the turkey and tomato so the tomato moisture doesn't hit the bread directly."},
            {"instruction": "Press together and slice diagonally.", "tip": "Cutting diagonally isn't just aesthetic — it actually makes it easier to eat and gives you more surface area per bite."},
        ],
        "dietary_tags": [],
        "meal_type": "lunch",
        "prep_time_minutes": 5,
    },
    "r9": {
        "id": "r9",
        "name": "Veggie Wrap",
        "ingredients": ["tortilla", "hummus", "cucumber", "bell pepper", "spinach"],
        "steps": [
            {"instruction": "Spread a generous layer of hummus across the center of the tortilla.", "tip": "Leave about an inch on the edges so it doesn't squeeze out when you roll it."},
            {"instruction": "Layer spinach, sliced cucumber, and bell pepper strips on top.", "tip": "Put the heavier vegetables in the center so the wrap holds its shape better."},
            {"instruction": "Roll tightly, tucking in the sides as you go, then slice in half.", "tip": "Wrap in foil if you're taking it to go — it holds the shape way better than plastic wrap."},
        ],
        "dietary_tags": ["vegetarian", "vegan"],
        "meal_type": "lunch",
        "prep_time_minutes": 10,
    },
}


def seed_recipes_if_empty():
    """
    Write the built-in recipes to Firestore if the recipes collection is empty.
    Safe to call every startup — does nothing if recipes already exist.
    """
    col = recipes_col()
    existing = list(col.limit(1).stream())
    if existing:
        return

    batch = get_db().batch()
    for recipe_id, recipe_data in SEED_RECIPES.items():
        batch.set(col.document(recipe_id), recipe_data)
    batch.commit()
    print(f"[firebase] Seeded {len(SEED_RECIPES)} recipes.")