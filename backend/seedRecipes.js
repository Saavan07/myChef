const seedRecipes = [
  {
    id: "r1",
    name: "Pasta",
    ingredients: ["8 oz pasta", "1 cup tomato sauce", "2 cloves garlic"],
    steps: [
      {
        instruction: "Fill a large pot with water and bring to a boil over high heat.",
        tip: "Salt the water generously so the pasta is seasoned from the start."
      },
      {
        instruction: "Add pasta and cook according to package directions.",
        tip: "Taste a piece near the end so it stays al dente."
      },
      {
        instruction: "Drain pasta, then add tomato sauce and minced garlic to the pot.",
        tip: "Save a splash of pasta water so the sauce coats the noodles better."
      }
    ],
    dietary_tags: ["vegetarian"],
    meal_type: "dinner",
    prep_time_minutes: 20
  },
  {
    id: "r2",
    name: "Grilled Chicken",
    ingredients: ["2 chicken breasts", "1 tbsp olive oil", "1 tsp salt", "1 tsp pepper"],
    steps: [
      {
        instruction: "Pat chicken dry, then coat with olive oil, salt, and pepper.",
        tip: "Dry chicken browns more cleanly than wet chicken."
      },
      {
        instruction: "Heat a grill pan or skillet over medium-high heat.",
        tip: "Wait until the pan is hot so the chicken sears instead of steaming."
      },
      {
        instruction: "Cook for about 6 minutes per side.",
        tip: "Do not move it too early or it will stick."
      },
      {
        instruction: "Rest for 5 minutes before slicing.",
        tip: "Resting keeps the juices inside the meat."
      }
    ],
    dietary_tags: ["gluten-free"],
    meal_type: "dinner",
    prep_time_minutes: 25
  },
  {
    id: "r3",
    name: "Caesar Salad",
    ingredients: ["1 head romaine lettuce", "1 cup croutons", "1/4 cup parmesan", "1/4 cup caesar dressing"],
    steps: [
      {
        instruction: "Chop and dry the romaine.",
        tip: "Dry lettuce keeps the dressing from sliding off."
      },
      {
        instruction: "Top with croutons and parmesan.",
        tip: "Add crunchy ingredients right before serving."
      },
      {
        instruction: "Dress and toss.",
        tip: "Add less dressing first, then adjust."
      }
    ],
    dietary_tags: ["vegetarian"],
    meal_type: "lunch",
    prep_time_minutes: 10
  },
  {
    id: "r4",
    name: "Stir Fry",
    ingredients: ["1 cup rice", "2 tbsp soy sauce", "2 cups broccoli", "2 carrots", "1 block tofu"],
    steps: [
      {
        instruction: "Cook the rice.",
        tip: "Rinse the rice before cooking for better texture."
      },
      {
        instruction: "Brown the tofu in a hot pan.",
        tip: "Dry tofu crisps much better."
      },
      {
        instruction: "Stir fry broccoli and carrots.",
        tip: "Keep ingredients moving so they cook evenly."
      },
      {
        instruction: "Add soy sauce and serve over rice.",
        tip: "Adding sauce at the edge of the pan gives more flavor."
      }
    ],
    dietary_tags: ["vegetarian", "vegan"],
    meal_type: "dinner",
    prep_time_minutes: 30
  },
  {
    id: "r5",
    name: "Tacos",
    ingredients: ["1 lb ground beef", "8 taco shells", "1 cup cheese", "1 cup lettuce", "1/2 cup salsa"],
    steps: [
      {
        instruction: "Cook and brown the beef.",
        tip: "Let the meat sit briefly so it browns instead of steaming."
      },
      {
        instruction: "Drain excess fat.",
        tip: "Too much grease makes the shells soggy."
      },
      {
        instruction: "Warm the taco shells.",
        tip: "Warm shells crack less."
      },
      {
        instruction: "Assemble with toppings.",
        tip: "Put cheese on the hot meat so it melts."
      }
    ],
    dietary_tags: [],
    meal_type: "dinner",
    prep_time_minutes: 25
  },
  {
    id: "r6",
    name: "Scrambled Eggs",
    ingredients: ["4 eggs", "1 tbsp butter", "1/2 tsp salt", "1/2 tsp pepper", "1/4 cup milk"],
    steps: [
      {
        instruction: "Whisk eggs with milk, salt, and pepper.",
        tip: "Do not over-whisk or the texture gets rubbery."
      },
      {
        instruction: "Melt butter over low heat.",
        tip: "Low heat keeps eggs soft."
      },
      {
        instruction: "Gently fold eggs until just set.",
        tip: "Carry-over heat finishes them."
      }
    ],
    dietary_tags: ["vegetarian", "gluten-free"],
    meal_type: "breakfast",
    prep_time_minutes: 10
  },
  {
    id: "r7",
    name: "Oatmeal",
    ingredients: ["1 cup oats", "1 cup milk", "1 banana", "1 tbsp honey"],
    steps: [
      {
        instruction: "Cook oats with milk over medium heat.",
        tip: "Milk makes oatmeal creamier."
      },
      {
        instruction: "Stir until thickened.",
        tip: "Watch closely so it does not boil over."
      },
      {
        instruction: "Top with banana and honey.",
        tip: "Add fruit at the end so it stays fresh."
      }
    ],
    dietary_tags: ["vegetarian", "vegan"],
    meal_type: "breakfast",
    prep_time_minutes: 10
  },
  {
    id: "r8",
    name: "Turkey Sandwich",
    ingredients: ["4 oz turkey", "2 slices bread", "2 leaves lettuce", "1 tomato", "1 tbsp mustard"],
    steps: [
      {
        instruction: "Spread mustard on one slice of bread.",
        tip: "This helps keep the sandwich balanced and not soggy."
      },
      {
        instruction: "Layer turkey, lettuce, and tomato.",
        tip: "Put lettuce next to tomato to protect the bread."
      },
      {
        instruction: "Close and slice.",
        tip: "Diagonal slices are easier to eat."
      }
    ],
    dietary_tags: [],
    meal_type: "lunch",
    prep_time_minutes: 5
  },
  {
    id: "r9",
    name: "Veggie Wrap",
    ingredients: ["1 tortilla", "1/4 cup hummus", "1/2 cucumber", "1 bell pepper", "1 cup spinach"],
    steps: [
      {
        instruction: "Spread hummus across the tortilla.",
        tip: "Leave space around the edges so it does not squeeze out."
      },
      {
        instruction: "Add spinach, cucumber, and bell pepper.",
        tip: "Keep heavier ingredients near the center."
      },
      {
        instruction: "Roll tightly and slice.",
        tip: "Foil helps it hold shape if packed to go."
      }
    ],
    dietary_tags: ["vegetarian", "vegan"],
    meal_type: "lunch",
    prep_time_minutes: 10
  }
];

module.exports = {
  seedRecipes
};
