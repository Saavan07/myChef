from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid

app = FastAPI()

# fake in-memory database for now, will replace with firebase later
users_db = {}
recipes_db = {
    "r1": {
        "id": "r1",
        "name": "Pasta",
        "ingredients": ["pasta", "tomato sauce", "garlic"],
        "steps": ["boil water", "cook pasta", "add sauce"],
        "dietary_tags": ["vegetarian"]
    },
    "r2": {
        "id": "r2",
        "name": "Grilled Chicken",
        "ingredients": ["chicken breast", "olive oil", "salt", "pepper"],
        "steps": ["season chicken", "heat grill", "cook 6 min each side"],
        "dietary_tags": ["gluten-free"]
    },
    "r3": {
        "id": "r3",
        "name": "Caesar Salad",
        "ingredients": ["romaine lettuce", "croutons", "parmesan", "caesar dressing"],
        "steps": ["chop lettuce", "add toppings", "toss with dressing"],
        "dietary_tags": ["vegetarian"]
    },
    "r4": {
        "id": "r4",
        "name": "Stir Fry",
        "ingredients": ["rice", "soy sauce", "broccoli", "carrots", "tofu"],
        "steps": ["cook rice", "stir fry veggies", "add tofu and sauce", "serve over rice"],
        "dietary_tags": ["vegetarian", "vegan"]
    },
    "r5": {
        "id": "r5",
        "name": "Tacos",
        "ingredients": ["ground beef", "taco shells", "cheese", "lettuce", "salsa"],
        "steps": ["cook beef", "warm shells", "assemble tacos"],
        "dietary_tags": []
    },
}


# --- models ---

class UserCreate(BaseModel):
    username: str
    password: str  # NOTE: not hashing this yet, will fix later
    dietary_preferences: Optional[List[str]] = []

class UserLogin(BaseModel):
    username: str
    password: str

class PreferencesUpdate(BaseModel):
    dietary_preferences: List[str]


# --- auth endpoints ---

@app.post("/register")
def register(user: UserCreate):
    for u in users_db.values():
        if u["username"] == user.username:
            raise HTTPException(status_code=400, detail="username already taken")
    
    user_id = str(uuid.uuid4())
    users_db[user_id] = {
        "id": user_id,
        "username": user.username,
        "password": user.password,  # storing plaintext for now, bad i know
        "dietary_preferences": user.dietary_preferences,
        "favorites": [],
        "meal_plans": []
    }
    return {"message": "user created", "user_id": user_id}


@app.post("/login")
def login(user: UserLogin):
    for u in users_db.values():
        if u["username"] == user.username and u["password"] == user.password:
            # TODO: return a real JWT token here later
            return {"message": "login successful", "user_id": u["id"]}
    raise HTTPException(status_code=401, detail="invalid credentials")


# --- user preferences ---

@app.get("/users/{user_id}/preferences")
def get_preferences(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    return {"dietary_preferences": users_db[user_id]["dietary_preferences"]}


@app.post("/users/{user_id}/preferences")
def update_preferences(user_id: str, prefs: PreferencesUpdate):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    users_db[user_id]["dietary_preferences"] = prefs.dietary_preferences
    return {"message": "preferences updated"}


# --- recipes ---

@app.get("/recipes")
def get_recipes(tag: Optional[str] = None):
    results = list(recipes_db.values())
    if tag:
        results = [r for r in results if tag in r["dietary_tags"]]
    return results


@app.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: str):
    if recipe_id not in recipes_db:
        raise HTTPException(status_code=404, detail="recipe not found")
    return recipes_db[recipe_id]


# --- meal plans (very basic, no real recommendation engine yet) ---

@app.post("/users/{user_id}/meal-plan/generate")
def generate_meal_plan(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    
    user = users_db[user_id]
    prefs = user["dietary_preferences"]

    # TODO: replace this with the actual recommendation engine
    # for now just filter by dietary tags and grab first 7 recipes we can find
    filtered = []
    for r in recipes_db.values():
        if not prefs or any(tag in r["dietary_tags"] for tag in prefs):
            filtered.append(r)
    
    if not filtered:
        filtered = list(recipes_db.values())  # fallback to all recipes if nothing matches

    # just cycle through them to fill 7 days
    plan = []
    for i in range(7):
        plan.append(filtered[i % len(filtered)]["id"])

    meal_plan = {
        "id": str(uuid.uuid4()),
        "recipe_ids": plan
    }
    users_db[user_id]["meal_plans"].append(meal_plan)
    return meal_plan


@app.get("/users/{user_id}/meal-plans")
def get_meal_plans(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    return users_db[user_id]["meal_plans"]


# --- shopping list ---

@app.get("/users/{user_id}/meal-plans/{plan_id}/shopping-list")
def get_shopping_list(user_id: str, plan_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")

    user = users_db[user_id]
    plan = next((p for p in user["meal_plans"] if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    # aggregate all ingredients from all recipes in the plan
    all_ingredients = []
    for recipe_id in plan["recipe_ids"]:
        if recipe_id in recipes_db:
            all_ingredients.extend(recipes_db[recipe_id]["ingredients"])

    # deduplicate
    unique_ingredients = list(set(all_ingredients))
    return {"shopping_list": unique_ingredients}
