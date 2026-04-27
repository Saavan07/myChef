from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
import random

from firebase_service import (
    get_db,
    user_ref,
    recipe_ref,
    users_col,
    recipes_col,
    seed_recipes_if_empty,
)

app = FastAPI()


@app.on_event("startup")
def startup_event():
    """Seed the recipes collection on first run."""
    seed_recipes_if_empty()


# ---------------------------------------------------------------------------
# Models (unchanged)
# ---------------------------------------------------------------------------

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

class SwapMeal(BaseModel):
    day_index: int
    new_recipe_id: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_user_or_404(user_id: str) -> dict:
    doc = user_ref(user_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="user not found")
    return doc.to_dict()


def _get_recipe_or_404(recipe_id: str) -> dict:
    doc = recipe_ref(recipe_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="recipe not found")
    return doc.to_dict()


def _find_user_by_username(username: str) -> Optional[dict]:
    results = users_col().where("username", "==", username).limit(1).stream()
    for doc in results:
        return doc.to_dict()
    return None


def _all_recipes() -> list[dict]:
    return [doc.to_dict() for doc in recipes_col().stream()]


# ---------------------------------------------------------------------------
# Recommendation engine (logic unchanged, now reads from Firestore)
# ---------------------------------------------------------------------------

def passes_restrictions(recipe, restrictions):
    restricted_ingredients = [r.lower().strip() for r in restrictions]
    for ingredient in recipe["ingredients"]:
        ingredient_lower = ingredient.lower()
        for restriction in restricted_ingredients:
            restriction_words = restriction.replace("no ", "").replace("without ", "").strip()
            if restriction_words in ingredient_lower:
                return False
    return True


def score_recipe(recipe, user, recently_used_ids, all_plan_ids):
    score = 0

    if recipe["id"] in user["favorites"]:
        score += 30

    pantry = [p.lower() for p in user.get("pantry", [])]
    pantry_hits = sum(1 for ing in recipe["ingredients"] if ing.lower() in pantry)
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


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/register")
def register(user: UserCreate):
    if _find_user_by_username(user.username):
        raise HTTPException(status_code=400, detail="username already taken")

    user_id = str(uuid.uuid4())
    user_data = {
        "id": user_id,
        "username": user.username,
        "password": user.password,  # TODO: hash with bcrypt before launch
        "dietary_preferences": user.dietary_preferences,
        "dietary_restrictions": user.dietary_restrictions,
        "pantry": [],
        "favorites": [],
        "meal_plans": [],
        "meal_history": [],
    }
    user_ref(user_id).set(user_data)
    return {"message": "user created", "user_id": user_id}


@app.post("/login")
def login(user: UserLogin):
    existing = _find_user_by_username(user.username)
    if existing and existing["password"] == user.password:
        # TODO: return a signed JWT here
        return {"message": "login successful", "user_id": existing["id"]}
    raise HTTPException(status_code=401, detail="invalid credentials")


# ---------------------------------------------------------------------------
# User preferences
# ---------------------------------------------------------------------------

@app.get("/users/{user_id}/preferences")
def get_preferences(user_id: str):
    user = _get_user_or_404(user_id)
    return {
        "dietary_preferences": user["dietary_preferences"],
        "dietary_restrictions": user.get("dietary_restrictions", []),
    }


@app.post("/users/{user_id}/preferences")
def update_preferences(user_id: str, prefs: PreferencesUpdate):
    _get_user_or_404(user_id)
    user_ref(user_id).update({
        "dietary_preferences": prefs.dietary_preferences,
        "dietary_restrictions": prefs.dietary_restrictions or [],
    })
    return {"message": "preferences updated"}


# ---------------------------------------------------------------------------
# Pantry
# ---------------------------------------------------------------------------

@app.get("/users/{user_id}/pantry")
def get_pantry(user_id: str):
    user = _get_user_or_404(user_id)
    return {"pantry": user.get("pantry", [])}


@app.post("/users/{user_id}/pantry")
def update_pantry(user_id: str, pantry: PantryUpdate):
    _get_user_or_404(user_id)
    user_ref(user_id).update({"pantry": pantry.items})
    return {"message": "pantry updated", "pantry": pantry.items}


@app.delete("/users/{user_id}/pantry/{item}")
def remove_from_pantry(user_id: str, item: str):
    user = _get_user_or_404(user_id)
    pantry = user.get("pantry", [])
    if item not in pantry:
        raise HTTPException(status_code=404, detail="item not in pantry")
    pantry.remove(item)
    user_ref(user_id).update({"pantry": pantry})
    return {"message": f"removed {item} from pantry"}


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------

@app.get("/recipes")
def get_recipes(tag: Optional[str] = None):
    query = recipes_col()
    if tag:
        # Firestore array-contains — no extra index needed
        query = query.where("dietary_tags", "array_contains", tag)
    return [doc.to_dict() for doc in query.stream()]


@app.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: str):
    return _get_recipe_or_404(recipe_id)


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------

@app.get("/users/{user_id}/favorites")
def get_favorites(user_id: str):
    user = _get_user_or_404(user_id)
    results = []
    for rid in user["favorites"]:
        doc = recipe_ref(rid).get()
        if doc.exists:
            results.append(doc.to_dict())
    return results


@app.post("/users/{user_id}/favorites/{recipe_id}")
def add_favorite(user_id: str, recipe_id: str):
    user = _get_user_or_404(user_id)
    _get_recipe_or_404(recipe_id)
    favorites = user["favorites"]
    if recipe_id in favorites:
        return {"message": "already in favorites"}
    favorites.append(recipe_id)
    user_ref(user_id).update({"favorites": favorites})
    return {"message": "added to favorites"}


@app.delete("/users/{user_id}/favorites/{recipe_id}")
def remove_favorite(user_id: str, recipe_id: str):
    user = _get_user_or_404(user_id)
    favorites = user["favorites"]
    if recipe_id not in favorites:
        raise HTTPException(status_code=404, detail="recipe not in favorites")
    favorites.remove(recipe_id)
    user_ref(user_id).update({"favorites": favorites})
    return {"message": "removed from favorites"}


# ---------------------------------------------------------------------------
# Meal plan generation
# ---------------------------------------------------------------------------

@app.post("/users/{user_id}/meal-plan/generate")
def generate_meal_plan(user_id: str):
    user = _get_user_or_404(user_id)
    prefs = [p.lower() for p in user["dietary_preferences"]]
    restrictions = user.get("dietary_restrictions", [])

    all_recipes = _all_recipes()

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

    meal_slots = ["breakfast", "lunch", "dinner", "breakfast", "lunch", "dinner", "dinner"]

    plan_ids = []
    recently_used = []

    for slot in meal_slots:
        chosen = pick_recipe_for_slot(filtered, slot, user, recently_used, plan_ids)
        plan_ids.append(chosen["id"])
        recently_used.append(chosen["id"])

    # Persist updated meal_history and the new plan atomically
    updated_history = user.get("meal_history", []) + plan_ids
    meal_plan = {"id": str(uuid.uuid4()), "recipe_ids": plan_ids}
    updated_plans = user.get("meal_plans", []) + [meal_plan]

    user_ref(user_id).update({
        "meal_history": updated_history,
        "meal_plans": updated_plans,
    })

    return meal_plan


@app.get("/users/{user_id}/meal-plans")
def get_meal_plans(user_id: str):
    user = _get_user_or_404(user_id)
    return user.get("meal_plans", [])


# ---------------------------------------------------------------------------
# Manual swap
# ---------------------------------------------------------------------------

@app.post("/users/{user_id}/meal-plans/{plan_id}/swap")
def swap_meal(user_id: str, plan_id: str, swap: SwapMeal):
    user = _get_user_or_404(user_id)
    _get_recipe_or_404(swap.new_recipe_id)

    if swap.day_index < 0 or swap.day_index > 6:
        raise HTTPException(status_code=400, detail="day_index must be 0-6")

    meal_plans = user.get("meal_plans", [])
    plan = next((p for p in meal_plans if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    old_recipe_id = plan["recipe_ids"][swap.day_index]
    plan["recipe_ids"][swap.day_index] = swap.new_recipe_id

    user_ref(user_id).update({"meal_plans": meal_plans})

    return {
        "message": "meal swapped",
        "day": swap.day_index,
        "old_recipe": old_recipe_id,
        "new_recipe": swap.new_recipe_id,
    }


# ---------------------------------------------------------------------------
# Auto swap
# ---------------------------------------------------------------------------

@app.post("/users/{user_id}/meal-plans/{plan_id}/swap-auto")
def swap_meal_auto(user_id: str, plan_id: str, day_index: int):
    user = _get_user_or_404(user_id)

    if day_index < 0 or day_index > 6:
        raise HTTPException(status_code=400, detail="day_index must be 0-6")

    meal_plans = user.get("meal_plans", [])
    plan = next((p for p in meal_plans if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    prefs = [p.lower() for p in user["dietary_preferences"]]
    restrictions = user.get("dietary_restrictions", [])
    current_recipe_id = plan["recipe_ids"][day_index]

    # Fetch the current recipe's meal_type from Firestore
    current_recipe_doc = recipe_ref(current_recipe_id).get()
    current_meal_type = (
        current_recipe_doc.to_dict().get("meal_type", "dinner")
        if current_recipe_doc.exists
        else "dinner"
    )

    all_recipes = _all_recipes()

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
        filtered = [
            r for r in all_recipes
            if r["id"] != current_recipe_id and passes_restrictions(r, restrictions)
        ]

    if not filtered:
        raise HTTPException(status_code=400, detail="no other recipes available to swap in")

    chosen = pick_recipe_for_slot(filtered, current_meal_type, user, plan["recipe_ids"], plan["recipe_ids"])

    plan["recipe_ids"][day_index] = chosen["id"]
    user_ref(user_id).update({"meal_plans": meal_plans})

    return {
        "message": "meal swapped",
        "day": day_index,
        "old_recipe": current_recipe_id,
        "new_recipe": chosen["id"],
    }


# ---------------------------------------------------------------------------
# Shopping list
# ---------------------------------------------------------------------------

@app.get("/users/{user_id}/meal-plans/{plan_id}/shopping-list")
def get_shopping_list(user_id: str, plan_id: str):
    user = _get_user_or_404(user_id)

    plan = next((p for p in user.get("meal_plans", []) if p["id"] == plan_id), None)
    if not plan:
        raise HTTPException(status_code=404, detail="meal plan not found")

    all_ingredients = []
    for recipe_id in plan["recipe_ids"]:
        doc = recipe_ref(recipe_id).get()
        if doc.exists:
            all_ingredients.extend(doc.to_dict().get("ingredients", []))

    unique_ingredients = list(set(all_ingredients))
    pantry = [p.lower() for p in user.get("pantry", [])]

    return {
        "shopping_list": [i for i in unique_ingredients if i.lower() not in pantry],
        "already_have": [i for i in unique_ingredients if i.lower() in pantry],
    }