// Reviewed ingredient amounts describe the base servings, not a single serving.
// Brand-specific allergens and cross-contact still require checking package labels.
const { normalizeName } = require("./meal-domain");
const allergens = {
  pasta: ["wheat"],
  "chicken breast": [],
  croutons: ["wheat"],
  parmesan: ["milk"],
  "caesar dressing": ["milk", "egg", "fish"],
  "soy sauce": ["soy", "wheat"],
  tofu: ["soy"],
  cheese: ["milk"],
  egg: ["egg"],
  butter: ["milk"],
  milk: ["milk"],
  oats: ["gluten"],
  bread: ["wheat"],
  tortilla: ["wheat"],
  hummus: ["sesame"],
  yogurt: ["milk"],
};
const ingredient = (name, quantity, unit = "count") => ({
  name: normalizeName(name),
  quantity,
  unit,
  allergens: allergens[name] || [],
});
const step = (instruction, tip = "", timer_minutes = null) => ({
  instruction,
  tip,
  timer_minutes,
});
function recipe(
  id,
  name,
  base_servings,
  minutes,
  ingredients,
  steps,
  tags = ["vegetarian", "vegan", "gluten-free"],
  meal_type = "dinner",
) {
  return {
    id,
    name,
    base_servings,
    ingredients,
    steps,
    dietary_tags: tags,
    meal_type,
    prep_time_minutes: minutes,
  };
}
const riceStep = step(
  "Cook the measured dry rice using the water ratio and cooking time on its package. Start this first while preparing the other ingredients.",
  "The ingredient amount is dry rice, before cooking.",
);
const seedRecipes = [
  recipe(
    "r1",
    "Garlic tomato pasta",
    2,
    20,
    [
      ingredient("pasta", 8, "oz"),
      ingredient("tomato sauce", 1, "cup"),
      ingredient("garlic", 2, "clove"),
      ingredient("olive oil", 1, "tbsp"),
    ],
    [
      step(
        "Bring a pot of water to a boil. Add the pasta and cook for the time on its package.",
      ),
      step(
        "Peel and mince the garlic. Warm the olive oil in a skillet over medium-low heat; stir in the garlic for 1 minute.",
        "Keep the garlic pale so it does not burn.",
        1,
      ),
      step(
        "Add the tomato sauce and simmer for 5 minutes. Drain the pasta, reserving a little cooking water, then toss with the sauce.",
        "Add a splash of the reserved water if needed.",
        5,
      ),
    ],
    ["vegetarian", "vegan"],
  ),
  recipe(
    "r2",
    "Chicken and rice bowls",
    2,
    30,
    [
      ingredient("chicken breast", 1, "lb"),
      ingredient("rice", 1, "cup"),
      ingredient("broccoli", 2, "cup"),
      ingredient("olive oil", 1, "tbsp"),
      ingredient("salt", 0.5, "tsp"),
      ingredient("pepper", 0.25, "tsp"),
    ],
    [
      riceStep,
      step(
        "Cut the broccoli into small florets. Steam in a covered pan with a splash of water until tender, about 6 minutes.",
        "",
        6,
      ),
      step(
        "Pat the chicken dry and season with salt and pepper. Heat the oil in a skillet over medium heat and cook the chicken, turning halfway, until its thickest part reaches 165 F (74 C).",
        "Use a food thermometer; thickness changes the cooking time.",
      ),
      step(
        "Rest the chicken for 5 minutes, then slice and serve with rice and broccoli.",
        "",
        5,
      ),
    ],
    ["gluten-free"],
  ),
  recipe(
    "r3",
    "Caesar salad",
    2,
    10,
    [
      ingredient("romaine lettuce", 1),
      ingredient("croutons", 1, "cup"),
      ingredient("parmesan", 0.25, "cup"),
      ingredient("caesar dressing", 0.25, "cup"),
    ],
    [
      step("Wash, dry, and chop the lettuce."),
      step(
        "Toss with the dressing, then add croutons and parmesan just before serving.",
        "Check the dressing label; traditional Caesar dressing contains fish.",
      ),
    ],
    [],
    "lunch",
  ),
  recipe(
    "r4",
    "Tofu vegetable stir fry",
    2,
    30,
    [
      ingredient("rice", 1, "cup"),
      ingredient("soy sauce", 2, "tbsp"),
      ingredient("broccoli", 2, "cup"),
      ingredient("carrot", 2),
      ingredient("tofu", 14, "oz"),
      ingredient("olive oil", 1, "tbsp"),
    ],
    [
      riceStep,
      step(
        "Drain and pat the tofu dry, then cut into cubes. Thinly slice the carrots and cut the broccoli into small florets.",
      ),
      step(
        "Heat the oil in a large skillet over medium-high heat. Add tofu and brown for about 8 minutes, turning occasionally.",
        "",
        8,
      ),
      step(
        "Add vegetables with a splash of water. Cover for 4 minutes, then uncover and stir until tender. Add soy sauce and serve over the rice.",
        "",
        4,
      ),
    ],
    ["vegetarian", "vegan"],
  ),
  recipe(
    "r5",
    "Beef tacos",
    4,
    25,
    [
      ingredient("ground beef", 1, "lb"),
      ingredient("corn taco shell", 8),
      ingredient("cheese", 1, "cup"),
      ingredient("lettuce", 1, "cup"),
      ingredient("salsa", 0.5, "cup"),
      ingredient("cumin", 1, "tsp"),
    ],
    [
      step(
        "Wash and shred the lettuce. Warm the taco shells following their package instructions.",
      ),
      step(
        "Cook the beef and cumin in a skillet over medium heat, breaking it into small pieces, until it reaches 160 F (71 C).",
        "Check with a food thermometer, then carefully drain excess fat.",
      ),
      step(
        "Fill the shells with beef, cheese, lettuce, and salsa. Serve two tacos per person.",
      ),
    ],
    ["gluten-free"],
  ),
  recipe(
    "r6",
    "Scrambled eggs",
    2,
    10,
    [
      ingredient("egg", 4),
      ingredient("butter", 1, "tbsp"),
      ingredient("salt", 0.25, "tsp"),
      ingredient("milk", 0.25, "cup"),
    ],
    [
      step("Whisk the eggs, milk, and salt together."),
      step(
        "Melt the butter in a nonstick pan over medium-low heat. Add the eggs and gently fold until firm with no visible liquid egg.",
        "Egg dishes should reach 160 F (71 C).",
      ),
    ],
    ["vegetarian", "gluten-free"],
    "breakfast",
  ),
  recipe(
    "r7",
    "Banana oatmeal",
    2,
    10,
    [
      ingredient("oats", 1, "cup"),
      ingredient("milk", 2, "cup"),
      ingredient("banana", 1),
      ingredient("honey", 1, "tbsp"),
    ],
    [
      step(
        "Combine oats and milk in a saucepan. Cook over medium-low heat for the time on the oat package, stirring frequently.",
      ),
      step("Divide into bowls and top with sliced banana and honey."),
    ],
    ["vegetarian"],
    "breakfast",
  ),
  recipe(
    "r8",
    "Turkey sandwich",
    1,
    5,
    [
      ingredient("turkey", 4, "oz"),
      ingredient("bread", 2, "slice"),
      ingredient("lettuce", 0.25, "cup"),
      ingredient("tomato", 0.5),
      ingredient("mustard", 1, "tbsp"),
    ],
    [
      step("Wash and slice the tomato and lettuce."),
      step(
        "Spread mustard on the bread. Add ready-to-eat turkey, lettuce, and tomato, then close the sandwich.",
      ),
    ],
    [],
    "lunch",
  ),
  recipe(
    "r9",
    "Hummus veggie wrap",
    1,
    10,
    [
      ingredient("tortilla", 1),
      ingredient("hummus", 0.25, "cup"),
      ingredient("cucumber", 0.5),
      ingredient("bell pepper", 0.5),
      ingredient("spinach", 1, "cup"),
    ],
    [
      step("Wash and thinly slice the cucumber and bell pepper."),
      step(
        "Spread hummus on the tortilla, add vegetables and spinach, then roll tightly.",
      ),
    ],
    ["vegetarian", "vegan"],
    "lunch",
  ),
  recipe(
    "d1",
    "Black bean rice bowls",
    2,
    25,
    [
      ingredient("rice", 1, "cup"),
      ingredient("black beans", 15, "oz"),
      ingredient("salsa", 0.5, "cup"),
      ingredient("spinach", 2, "cup"),
      ingredient("cumin", 1, "tsp"),
    ],
    [
      riceStep,
      step(
        "Drain and rinse canned black beans. Add to a saucepan with salsa, cumin, and a splash of water. Simmer for 5 minutes.",
        "",
        5,
      ),
      step(
        "Stir in washed spinach until wilted. Divide the rice between bowls and spoon the beans on top.",
      ),
    ],
  ),
  recipe(
    "d2",
    "Chickpea spinach skillet",
    2,
    20,
    [
      ingredient("chickpeas", 15, "oz"),
      ingredient("tomato sauce", 1, "cup"),
      ingredient("spinach", 3, "cup"),
      ingredient("garlic", 2, "clove"),
      ingredient("olive oil", 1, "tbsp"),
      ingredient("cumin", 0.5, "tsp"),
    ],
    [
      step(
        "Drain and rinse canned chickpeas. Wash the spinach and mince the garlic.",
      ),
      step(
        "Warm the oil in a skillet over medium-low heat. Stir in garlic and cumin for 1 minute.",
        "",
        1,
      ),
      step(
        "Add chickpeas and tomato sauce. Simmer for 8 minutes, stirring occasionally.",
        "",
        8,
      ),
      step("Fold in spinach and cook until wilted and everything is hot."),
    ],
  ),
  recipe(
    "d3",
    "Red lentil tomato soup",
    2,
    30,
    [
      ingredient("red lentils", 1, "cup"),
      ingredient("tomato sauce", 1, "cup"),
      ingredient("carrot", 2),
      ingredient("garlic", 2, "clove"),
      ingredient("olive oil", 1, "tbsp"),
      ingredient("cumin", 1, "tsp"),
    ],
    [
      step(
        "Rinse the dry red lentils. Peel and finely dice the carrots; mince the garlic.",
      ),
      step(
        "Heat the oil in a pot. Soften the carrots over medium heat for 5 minutes, then stir in garlic and cumin.",
        "",
        5,
      ),
      step(
        "Add lentils, tomato sauce, and 3 cups of water for each cup of dry lentils. Bring to a boil, then simmer for about 20 minutes until the lentils are tender.",
        "Add water as needed to keep a soup consistency.",
        20,
      ),
    ],
  ),
  recipe(
    "d4",
    "Chickpea cucumber rice bowls",
    2,
    25,
    [
      ingredient("rice", 1, "cup"),
      ingredient("chickpeas", 15, "oz"),
      ingredient("cucumber", 1),
      ingredient("tomato", 1),
      ingredient("lemon juice", 2, "tbsp"),
      ingredient("olive oil", 1, "tbsp"),
    ],
    [
      riceStep,
      step(
        "Drain and rinse canned chickpeas. Wash and dice cucumber and tomato.",
      ),
      step(
        "Mix chickpeas and vegetables with lemon juice and olive oil. Serve over the cooked rice.",
      ),
    ],
  ),
  recipe(
    "d5",
    "Spinach white bean pasta",
    2,
    20,
    [
      ingredient("pasta", 8, "oz"),
      ingredient("white beans", 15, "oz"),
      ingredient("spinach", 3, "cup"),
      ingredient("garlic", 2, "clove"),
      ingredient("olive oil", 1, "tbsp"),
      ingredient("lemon juice", 1, "tbsp"),
    ],
    [
      step(
        "Cook pasta according to its package. Drain, reserving some cooking water.",
      ),
      step(
        "Drain and rinse canned white beans. Mince garlic and wash spinach.",
      ),
      step(
        "Warm oil in a skillet; stir in garlic for 1 minute. Add beans, spinach, and a splash of pasta water. Stir until hot and wilted.",
        "",
        1,
      ),
      step(
        "Toss with pasta and lemon juice. Add more cooking water if needed.",
      ),
    ],
    ["vegetarian", "vegan"],
  ),
  recipe(
    "d6",
    "Black bean corn tacos",
    2,
    15,
    [
      ingredient("black beans", 15, "oz"),
      ingredient("corn", 1, "cup"),
      ingredient("corn taco shell", 6),
      ingredient("salsa", 0.5, "cup"),
      ingredient("lettuce", 1, "cup"),
      ingredient("cumin", 0.5, "tsp"),
    ],
    [
      step(
        "Drain and rinse canned black beans. Warm taco shells according to the package.",
      ),
      step(
        "Heat beans, drained canned corn, salsa, and cumin in a pan for 5 minutes, stirring and adding a splash of water as needed.",
        "",
        5,
      ),
      step(
        "Wash and shred lettuce. Fill the shells with beans and lettuce, serving three tacos per person.",
      ),
    ],
  ),
  recipe(
    "d7",
    "Sweet potato chickpea tray bake",
    2,
    40,
    [
      ingredient("sweet potato", 1, "lb"),
      ingredient("chickpeas", 15, "oz"),
      ingredient("broccoli", 2, "cup"),
      ingredient("olive oil", 2, "tbsp"),
      ingredient("cumin", 1, "tsp"),
    ],
    [
      step(
        "Heat the oven to 425 F (220 C). Wash and cut sweet potato into small cubes and broccoli into florets. Drain and rinse canned chickpeas.",
      ),
      step(
        "Toss sweet potato and chickpeas with oil and cumin on a baking tray. Roast for 15 minutes.",
        "",
        15,
      ),
      step(
        "Add broccoli, turn the vegetables, and roast for another 15 minutes or until the sweet potato is tender.",
        "Crowded trays cook more slowly; use two trays for a larger batch.",
        15,
      ),
    ],
  ),
  recipe(
    "d8",
    "Egg and vegetable rice",
    2,
    30,
    [
      ingredient("rice", 1, "cup"),
      ingredient("egg", 3),
      ingredient("carrot", 2),
      ingredient("peas", 1, "cup"),
      ingredient("soy sauce", 1, "tbsp"),
      ingredient("olive oil", 1, "tbsp"),
    ],
    [
      riceStep,
      step(
        "Finely dice carrots and whisk the eggs. Heat oil in a large skillet; cook carrots and frozen peas with a splash of water until tender.",
      ),
      step(
        "Push vegetables to the side, add eggs, and stir until firm. Mix in the cooked rice and soy sauce, cooking until the egg mixture reaches 160 F (71 C).",
        "Use a food thermometer.",
      ),
    ],
    ["vegetarian"],
  ),
];
module.exports = { seedRecipes };
