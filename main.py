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
        "steps": [
            {"instruction": "Fill a large pot with water and bring to a boil over high heat.", "tip": "Salt the water generously — it should taste like the sea. This is your only chance to season the pasta itself."},
            {"instruction": "Add pasta and cook according to package directions (usually 8-10 min).", "tip": "Stir in the first minute to prevent sticking. Taste a piece 1 min before the timer goes off — it should be tender but still have a tiny bit of bite (al dente)."},
            {"instruction": "Drain pasta, then add tomato sauce and minced garlic to the pot.", "tip": "Save a splash of the pasta water before draining — adding a little to the sauce helps it cling to the noodles."},
        ],
        "dietary_tags": ["vegetarian"]
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
        "dietary_tags": ["gluten-free"]
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
        "dietary_tags": ["vegetarian"]
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
        "dietary_tags": ["vegetarian", "vegan"]
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
        "dietary_tags": []
    },
}


# --- models ---

class UserCreate(BaseModel):
    username: str
    password: str  # NOTE: not hashing this yet, will fix later
    dietary_preferences: Optional[List[str]] = []
    dietary_restrictions: Optional[List[str]] = []  # e.g. ["no nuts", "no shellfish"]

class UserLogin(BaseModel):
    username: str
    password: str

class PreferencesUpdate(BaseModel):
    dietary_preferences: List[str]
    dietary_restrictions: Optional[List[str]] = []  # added restrictions here too

class PantryUpdate(BaseModel):
    # just a flat list of ingredient names the user has at home
    items: List[str]

class SwapMeal(BaseModel):
    day_index: int  # 0-6, which day to swap
    new_recipe_id: str


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
        "dietary_restrictions": user.dietary_restrictions,
        "pantry": [],  # ingredients the user already has
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
    return {
        "dietary_preferences": users_db[user_id]["dietary_preferences"],
        "dietary_restrictions": users_db[user_id].get("dietary_restrictions", [])
    }


@app.post("/users/{user_id}/preferences")
def update_preferences(user_id: str, prefs: PreferencesUpdate):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    users_db[user_id]["dietary_preferences"] = prefs.dietary_preferences
    users_db[user_id]["dietary_restrictions"] = prefs.dietary_restrictions or []
    return {"message": "preferences updated"}


# --- pantry ---
# lets users say what ingredients they already have at home
# used later to trim down the shopping list

@app.get("/users/{user_id}/pantry")
def get_pantry(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    return {"pantry": users_db[user_id].get("pantry", [])}


@app.post("/users/{user_id}/pantry")
def update_pantry(user_id: str, pantry: PantryUpdate):
    # just overwrites the whole pantry list, simple for now
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    users_db[user_id]["pantry"] = pantry.items
    return {"message": "pantry updated", "pantry": pantry.items}


@app.delete("/users/{user_id}/pantry/{item}")
def remove_from_pantry(user_id: str, item: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    pantry = users_db[user_id].get("pantry", [])
    if item not in pantry:
        raise HTTPException(status_code=404, detail="item not in pantry")
    pantry.remove(item)
    users_db[user_id]["pantry"] = pantry
    return {"message": f"removed {item} from pantry"}


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


# --- favorites ---

@app.get("/users/{user_id}/favorites")
def get_favorites(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    favorite_ids = users_db[user_id]["favorites"]
    # return the actual recipe objects, not just IDs
    return [recipes_db[rid] for rid in favorite_ids if rid in recipes_db]


@app.post("/users/{user_id}/favorites/{recipe_id}")
def add_favorite(user_id: str, recipe_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    if recipe_id not in recipes_db:
        raise HTTPException(status_code=404, detail="recipe not found")
    favorites = users_db[user_id]["favorites"]
    if recipe_id in favorites:
        return {"message": "already in favorites"}  # not an error, just a no-op
    favorites.append(recipe_id)
    return {"message": "added to favorites"}


@app.delete("/users/{user_id}/favorites/{recipe_id}")
def remove_favorite(user_id: str, recipe_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    favorites = users_db[user_id]["favorites"]
    if recipe_id not in favorites:
        raise HTTPException(status_code=404, detail="recipe not in favorites")
    favorites.remove(recipe_id)
    return {"message": "removed from favorites"}


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


@app.post("/users/{user_id}/meal-plans/{plan_id}/swap")
def swap_meal(user_id: str, plan_id: str, swap: SwapMeal):
    # lets you replace a single day's recipe without regenerating the whole plan
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    if swap.new_recipe_id not in recipes_db:
        raise HTTPException(status_code=404, detail="recipe not found")
    if swap.day_index < 0 or swap.day_index > 6:
        raise HTTPException(status_code=400, detail="day_index must be 0-6")

    user = users_db[user_id]
    plan = next((p for p in user["meal_plans"] if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    old_recipe_id = plan["recipe_ids"][swap.day_index]
    plan["recipe_ids"][swap.day_index] = swap.new_recipe_id
    return {
        "message": "meal swapped",
        "day": swap.day_index,
        "old_recipe": old_recipe_id,
        "new_recipe": swap.new_recipe_id
    }


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

    # subtract anything the user already has in their pantry
    pantry = user.get("pantry", [])
    need_to_buy = [i for i in unique_ingredients if i not in pantry]
    already_have = [i for i in unique_ingredients if i in pantry]

    return {
        "shopping_list": need_to_buy,
        "already_have": already_have  # nice to show what they can skip buying
    }