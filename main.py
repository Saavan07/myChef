from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
import random
import re

app = FastAPI()

users_db = {}
recipes_db = {
    "r1": {
        "id": "r1",
        "name": "Pasta",
        "ingredients": ["8 oz pasta", "1 cup tomato sauce", "2 cloves garlic"],
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
        "ingredients": ["2 chicken breasts", "1 tbsp olive oil", "1 tsp salt", "1 tsp pepper"],
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
        "ingredients": ["1 head romaine lettuce", "1 cup croutons", "1/4 cup parmesan", "1/4 cup caesar dressing"],
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
        "ingredients": ["1 cup rice", "2 tbsp soy sauce", "2 cups broccoli", "2 carrots", "1 block tofu"],
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
        "ingredients": ["1 lb ground beef", "8 taco shells", "1 cup cheese", "1 cup lettuce", "1/2 cup salsa"],
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
        "ingredients": ["4 eggs", "1 tbsp butter", "1/2 tsp salt", "1/2 tsp pepper", "1/4 cup milk"],
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
        "ingredients": ["1 cup oats", "1 cup milk", "1 banana", "1 tbsp honey"],
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
        "ingredients": ["4 oz turkey", "2 slices bread", "2 leaves lettuce", "1 tomato", "1 tbsp mustard"],
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
        "ingredients": ["1 tortilla", "1/4 cup hummus", "1/2 cucumber", "1 bell pepper", "1 cup spinach"],
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


class UserCreate(BaseModel):
    username: str
    password: str
    dietary_preferences: Optional[List[str]] = []
    dietary_restrictions: Optional[List[str]] = []

class UserLogin(BaseModel):
    username: str
    password: str

class PreferencesUpdate(BaseModel):
    dietary_preferences: List[str]
    dietary_restrictions: Optional[List[str]] = []

class PantryUpdate(BaseModel):
    items: List[str]

class ManualShoppingItem(BaseModel):
    name: str
    quantity: Optional[float] = 1
    unit: Optional[str] = ""

class SwapMeal(BaseModel):
    day_index: int
    new_recipe_id: str


UNIT_ALIASES = {
    "tablespoon": "tbsp",
    "tablespoons": "tbsp",
    "tbsp": "tbsp",
    "teaspoon": "tsp",
    "teaspoons": "tsp",
    "tsp": "tsp",
    "cup": "cup",
    "cups": "cup",
    "ounce": "oz",
    "ounces": "oz",
    "oz": "oz",
    "pound": "lb",
    "pounds": "lb",
    "lb": "lb",
    "lbs": "lb",
    "slice": "slice",
    "slices": "slice",
    "clove": "clove",
    "cloves": "clove",
    "head": "head",
    "heads": "head",
    "leaf": "leaf",
    "leaves": "leaf",
    "block": "block",
    "blocks": "block",
    "jar": "jar",
    "jars": "jar",
    "can": "can",
    "cans": "can",
}


def parse_quantity(value):
    value = value.strip()
    if not value:
        return None

    if "/" in value:
        numerator, denominator = value.split("/", 1)
        try:
            return float(numerator) / float(denominator)
        except ValueError:
            return None

    try:
        return float(value)
    except ValueError:
        return None


def singularize_word(word):
    if len(word) <= 3:
        return word
    if word.endswith("ies"):
        return f"{word[:-3]}y"
    if word.endswith("oes"):
        return word[:-2]
    if word.endswith("ves"):
        return f"{word[:-3]}f"
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def normalize_item_name(value):
    text = str(value).lower().strip()
    text = re.sub(r"[^a-z0-9/\.\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = text.split()

    if tokens and parse_quantity(tokens[0]) is not None:
        tokens = tokens[1:]

    if tokens and tokens[0] in UNIT_ALIASES:
        tokens = tokens[1:]

    return " ".join(singularize_word(token) for token in tokens)


def parse_ingredient(ingredient):
    text = str(ingredient).strip()
    tokens = text.split()
    quantity = 1.0
    unit = ""

    if tokens:
        parsed_quantity = parse_quantity(tokens[0])
        if parsed_quantity is not None:
            quantity = parsed_quantity
            tokens = tokens[1:]

    if tokens:
        normalized_unit = UNIT_ALIASES.get(tokens[0].lower())
        if normalized_unit:
            unit = normalized_unit
            tokens = tokens[1:]

    name = " ".join(tokens).strip() or text
    normalized_name = normalize_item_name(text)

    return {
        "name": name,
        "normalized_name": normalized_name,
        "quantity": quantity,
        "unit": unit,
    }


def format_quantity(quantity):
    if quantity == int(quantity):
        return str(int(quantity))
    return f"{quantity:.2f}".rstrip("0").rstrip(".")


def format_shopping_item(item):
    quantity = item["quantity"]
    unit = item["unit"]
    name = item["name"]
    if unit:
        return f"{format_quantity(quantity)} {unit} {name}"
    if quantity != 1:
        return f"{format_quantity(quantity)} {name}"
    return name


def pantry_contains_item(pantry_items, item):
    pantry_names = {normalize_item_name(pantry_item) for pantry_item in pantry_items}
    return item["normalized_name"] in pantry_names


def aggregate_ingredients(ingredients, source):
    aggregated = {}
    for ingredient in ingredients:
        item = parse_ingredient(ingredient)
        key = (item["normalized_name"], item["unit"])
        if key not in aggregated:
            aggregated[key] = {
                "name": item["name"],
                "normalized_name": item["normalized_name"],
                "quantity": 0,
                "unit": item["unit"],
                "sources": [],
                "manual": source == "manual",
            }
        aggregated[key]["quantity"] += item["quantity"]
        aggregated[key]["sources"].append(source)
    return aggregated


@app.post("/register")
def register(user: UserCreate):
    for u in users_db.values():
        if u["username"] == user.username:
            raise HTTPException(status_code=400, detail="username already taken")
    
    user_id = str(uuid.uuid4())
    users_db[user_id] = {
        "id": user_id,
        "username": user.username,
        "password": user.password,
        "dietary_preferences": user.dietary_preferences,
        "dietary_restrictions": user.dietary_restrictions,
        "pantry": [],
        "favorites": [],
        "shopping_list_items": [],
        "meal_plans": [],
        "meal_history": []
    }
    return {"message": "user created", "user_id": user_id}


@app.post("/login")
def login(user: UserLogin):
    for u in users_db.values():
        if u["username"] == user.username and u["password"] == user.password:
            return {"message": "login successful", "user_id": u["id"]}
    raise HTTPException(status_code=401, detail="invalid credentials")


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


@app.get("/users/{user_id}/pantry")
def get_pantry(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    return {"pantry": users_db[user_id].get("pantry", [])}


@app.post("/users/{user_id}/pantry")
def update_pantry(user_id: str, pantry: PantryUpdate):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    users_db[user_id]["pantry"] = pantry.items
    return {"message": "pantry updated", "pantry": pantry.items}


@app.delete("/users/{user_id}/pantry/{item}")
def remove_from_pantry(user_id: str, item: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    pantry = users_db[user_id].get("pantry", [])
    item_to_remove = next((pantry_item for pantry_item in pantry if normalize_item_name(pantry_item) == normalize_item_name(item)), None)
    if item_to_remove is None:
        raise HTTPException(status_code=404, detail="item not in pantry")
    pantry.remove(item_to_remove)
    users_db[user_id]["pantry"] = pantry
    return {"message": f"removed {item_to_remove} from pantry"}


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


@app.get("/users/{user_id}/favorites")
def get_favorites(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    favorite_ids = users_db[user_id]["favorites"]
    return [recipes_db[rid] for rid in favorite_ids if rid in recipes_db]


@app.post("/users/{user_id}/favorites/{recipe_id}")
def add_favorite(user_id: str, recipe_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    if recipe_id not in recipes_db:
        raise HTTPException(status_code=404, detail="recipe not found")
    favorites = users_db[user_id]["favorites"]
    if recipe_id in favorites:
        return {"message": "already in favorites"}
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


@app.get("/users/{user_id}/shopping-list/manual")
def get_manual_shopping_items(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    return {"items": users_db[user_id].get("shopping_list_items", [])}


@app.post("/users/{user_id}/shopping-list/manual")
def add_manual_shopping_item(user_id: str, item: ManualShoppingItem):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    if not item.name.strip():
        raise HTTPException(status_code=400, detail="item name is required")
    if item.quantity is not None and item.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be greater than 0")

    shopping_item = {
        "id": str(uuid.uuid4()),
        "name": item.name.strip(),
        "quantity": item.quantity or 1,
        "unit": (item.unit or "").strip(),
    }
    users_db[user_id].setdefault("shopping_list_items", []).append(shopping_item)
    return {"message": "item added", "item": shopping_item}


@app.delete("/users/{user_id}/shopping-list/manual/{item_id}")
def remove_manual_shopping_item(user_id: str, item_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")

    shopping_items = users_db[user_id].get("shopping_list_items", [])
    item_to_remove = next((item for item in shopping_items if item["id"] == item_id), None)
    if item_to_remove is None:
        raise HTTPException(status_code=404, detail="shopping list item not found")

    shopping_items.remove(item_to_remove)
    users_db[user_id]["shopping_list_items"] = shopping_items
    return {"message": "item removed"}


def passes_restrictions(recipe, restrictions):
    restricted_ingredients = [r.lower().strip() for r in restrictions]
    for ingredient in recipe["ingredients"]:
        ingredient_lower = normalize_item_name(ingredient)
        for restriction in restricted_ingredients:
            restriction_words = normalize_item_name(restriction.replace("no ", "").replace("without ", "").strip())
            if restriction_words in ingredient_lower:
                return False
    return True


def score_recipe(recipe, user, recently_used_ids, all_plan_ids):
    score = 0

    if recipe["id"] in user["favorites"]:
        score += 30

    pantry = user.get("pantry", [])
    pantry_hits = sum(1 for ing in recipe["ingredients"] if pantry_contains_item(pantry, parse_ingredient(ing)))
    score += pantry_hits * 10

    history = user.get("meal_history", [])
    if recipe["id"] in history:
        last_seen = len(history) - 1 - history[::-1].index(recipe["id"])
        weeks_ago = (len(history) - last_seen) // 7
        if weeks_ago == 0:
            score -= 50
        elif weeks_ago == 1:
            score -= 20
        elif weeks_ago == 2:
            score -= 5

    times_in_current_plan = all_plan_ids.count(recipe["id"])
    score -= times_in_current_plan * 40

    if recipe["id"] in recently_used_ids:
        score -= 25

    score += random.randint(0, 5)

    return score


def pick_recipe_for_slot(candidates, meal_type, user, recently_used_ids, current_plan_ids):
    typed = [r for r in candidates if r.get("meal_type") == meal_type]
    pool = typed if typed else candidates

    scored = [(r, score_recipe(r, user, recently_used_ids, current_plan_ids)) for r in pool]
    scored.sort(key=lambda x: x[1], reverse=True)

    top_n = max(1, len(scored) // 3)
    top_candidates = scored[:top_n]

    weights = [max(1, s + 100) for _, s in top_candidates]
    chosen = random.choices([r for r, _ in top_candidates], weights=weights, k=1)[0]
    return chosen


@app.post("/users/{user_id}/meal-plan/generate")
def generate_meal_plan(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")

    user = users_db[user_id]
    prefs = [p.lower() for p in user["dietary_preferences"]]
    restrictions = user.get("dietary_restrictions", [])

    all_recipes = list(recipes_db.values())

    filtered = []
    for r in all_recipes:
        if not passes_restrictions(r, restrictions):
            continue
        if prefs:
            tags = [t.lower() for t in r["dietary_tags"]]
            if not any(p in tags for p in prefs):
                continue
        filtered.append(r)

    if not filtered:
        filtered = [r for r in all_recipes if passes_restrictions(r, restrictions)]

    if not filtered:
        filtered = all_recipes

    meal_slots = [
        "breakfast", "lunch", "dinner",
        "breakfast", "lunch", "dinner",
        "dinner"
    ]

    plan_ids = []
    recently_used = []

    for slot in meal_slots:
        chosen = pick_recipe_for_slot(filtered, slot, user, recently_used, plan_ids)
        plan_ids.append(chosen["id"])
        recently_used.append(chosen["id"])

    user["meal_history"].extend(plan_ids)

    meal_plan = {
        "id": str(uuid.uuid4()),
        "recipe_ids": plan_ids
    }
    user["meal_plans"].append(meal_plan)
    return meal_plan


@app.get("/users/{user_id}/meal-plans")
def get_meal_plans(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    return users_db[user_id]["meal_plans"]


@app.post("/users/{user_id}/meal-plans/{plan_id}/swap")
def swap_meal(user_id: str, plan_id: str, swap: SwapMeal):
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


@app.post("/users/{user_id}/meal-plans/{plan_id}/swap-auto")
def swap_meal_auto(user_id: str, plan_id: str, day_index: int):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")
    if day_index < 0 or day_index > 6:
        raise HTTPException(status_code=400, detail="day_index must be 0-6")

    user = users_db[user_id]
    plan = next((p for p in user["meal_plans"] if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    prefs = [p.lower() for p in user["dietary_preferences"]]
    restrictions = user.get("dietary_restrictions", [])
    current_recipe_id = plan["recipe_ids"][day_index]
    current_meal_type = recipes_db.get(current_recipe_id, {}).get("meal_type", "dinner")

    all_recipes = list(recipes_db.values())

    filtered = []
    for r in all_recipes:
        if r["id"] == current_recipe_id:
            continue
        if not passes_restrictions(r, restrictions):
            continue
        if prefs:
            tags = [t.lower() for t in r["dietary_tags"]]
            if not any(p in tags for p in prefs):
                continue
        filtered.append(r)

    if not filtered:
        filtered = [r for r in all_recipes if r["id"] != current_recipe_id and passes_restrictions(r, restrictions)]

    if not filtered:
        raise HTTPException(status_code=400, detail="no other recipes available to swap in")

    chosen = pick_recipe_for_slot(filtered, current_meal_type, user, plan["recipe_ids"], plan["recipe_ids"])

    plan["recipe_ids"][day_index] = chosen["id"]
    return {
        "message": "meal swapped",
        "day": day_index,
        "old_recipe": current_recipe_id,
        "new_recipe": chosen["id"]
    }


@app.get("/users/{user_id}/meal-plans/{plan_id}/shopping-list")
def get_shopping_list(user_id: str, plan_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="user not found")

    user = users_db[user_id]
    plan = next((p for p in user["meal_plans"] if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    all_ingredients = []
    for recipe_id in plan["recipe_ids"]:
        if recipe_id in recipes_db:
            all_ingredients.extend(recipes_db[recipe_id]["ingredients"])

    aggregated = aggregate_ingredients(all_ingredients, "meal_plan")
    for manual_item in user.get("shopping_list_items", []):
        manual_text = " ".join(
            str(part).strip()
            for part in [manual_item.get("quantity", 1), manual_item.get("unit", ""), manual_item.get("name", "")]
            if str(part).strip()
        )
        manual_aggregated = aggregate_ingredients([manual_text], "manual")
        for key, item in manual_aggregated.items():
            if key not in aggregated:
                aggregated[key] = item
            else:
                aggregated[key]["quantity"] += item["quantity"]
                aggregated[key]["sources"].extend(item["sources"])
                aggregated[key]["manual"] = aggregated[key]["manual"] or item["manual"]

    pantry = user.get("pantry", [])
    need_to_buy = []
    already_have = []
    for item in aggregated.values():
        display = format_shopping_item(item)
        response_item = {
            "name": item["name"],
            "quantity": item["quantity"],
            "unit": item["unit"],
            "display": display,
            "sources": sorted(set(item["sources"])),
            "manual": item["manual"],
        }
        if pantry_contains_item(pantry, item):
            already_have.append(response_item)
        else:
            need_to_buy.append(response_item)

    return {
        "shopping_list": [item["display"] for item in need_to_buy],
        "already_have": [item["display"] for item in already_have],
        "shopping_list_items": need_to_buy,
        "already_have_items": already_have,
    }
