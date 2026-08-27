import { ListingCategory, ListingCondition } from '@marketplace/shared';

// Per-item (not per-category) price ranges and variant pools — a category
// price band shared across every item in it produces nonsense (a mountain
// bike priced like a car, headphones with a "128GB" storage variant). Each
// item carries its own plausible range and its own fitting variant pool.
interface CategoryItem {
  name: string;
  priceRange: [number, number];
  variants: string[];
}

interface CategoryProfile {
  items: CategoryItem[];
  descriptionTemplate: (item: string, condition: ListingCondition) => string;
}

const CONDITION_PHRASE: Record<ListingCondition, string> = {
  [ListingCondition.NEW]: 'brand new, never used',
  [ListingCondition.LIKE_NEW]: 'like new, barely used',
  [ListingCondition.GOOD]: 'good condition with light signs of wear',
  [ListingCondition.FAIR]: 'fair condition, fully functional but shows its age',
  [ListingCondition.FOR_PARTS]: 'sold for parts or repair only',
};

const GENERIC_VARIANTS = ['excellent shape', 'well maintained', 'from a smoke-free home'];

export const CATEGORY_PROFILES: Record<ListingCategory, CategoryProfile> = {
  [ListingCategory.ELECTRONICS]: {
    items: [
      { name: 'iPhone 13', priceRange: [300, 700], variants: ['128GB', '256GB', 'Space Gray', 'Silver'] },
      { name: 'Samsung 55" 4K TV', priceRange: [250, 600], variants: ['with wall mount', 'with remote', 'no stand'] },
      { name: 'Dell XPS 13 Laptop', priceRange: [400, 1100], variants: ['16GB RAM', '512GB SSD', 'touchscreen'] },
      { name: 'Sony WH-1000XM4 Headphones', priceRange: [80, 220], variants: ['black', 'silver', 'with case'] },
      { name: 'iPad Air', priceRange: [200, 500], variants: ['64GB', '256GB', 'with keyboard case'] },
      { name: 'Nintendo Switch OLED', priceRange: [150, 300], variants: ['with 2 games', 'with dock', 'neon'] },
      { name: 'Canon EOS Rebel Camera', priceRange: [200, 550], variants: ['with kit lens', 'with extra battery'] },
      { name: 'Bose SoundLink Speaker', priceRange: [40, 130], variants: ['blue', 'black', 'with charger'] },
      { name: 'LG Ultrawide Monitor', priceRange: [120, 350], variants: ['34-inch', '27-inch', 'with stand'] },
      { name: 'MacBook Air M1', priceRange: [450, 900], variants: ['8GB RAM', '256GB SSD', 'with charger'] },
    ],
    descriptionTemplate: (item, c) =>
      `${item}, ${CONDITION_PHRASE[c]}. Powers on and works as expected. Local pickup or can ship.`,
  },
  [ListingCategory.FURNITURE]: {
    items: [
      { name: 'IKEA MALM Dresser', priceRange: [40, 120], variants: GENERIC_VARIANTS },
      { name: 'Leather Sofa', priceRange: [150, 900], variants: ['3-seater', '2-seater', 'reclining'] },
      { name: 'Oak Dining Table', priceRange: [100, 600], variants: ['with 4 chairs', '6-seater', 'extendable'] },
      { name: 'Office Desk', priceRange: [40, 250], variants: ['standing', 'with drawers', 'L-shaped'] },
      { name: 'Bookshelf', priceRange: [20, 150], variants: ['5-tier', 'ladder style'] },
      { name: 'Queen Bed Frame', priceRange: [60, 400], variants: ['with headboard', 'platform style'] },
      { name: 'Recliner Armchair', priceRange: [50, 350], variants: ['leather', 'fabric'] },
      { name: 'Coffee Table', priceRange: [20, 150], variants: ['glass top', 'rustic wood'] },
      { name: 'TV Stand', priceRange: [25, 180], variants: ['with storage', 'floating style'] },
      { name: 'Bar Stools (Set of 2)', priceRange: [30, 150], variants: GENERIC_VARIANTS },
    ],
    descriptionTemplate: (item, c) =>
      `${item} in ${CONDITION_PHRASE[c]}. No pets, smoke-free home. Buyer arranges pickup.`,
  },
  [ListingCategory.CLOTHING]: {
    items: [
      { name: 'Nike Air Max Sneakers', priceRange: [25, 90], variants: ['size 9', 'size 10', 'size 11'] },
      { name: "Levi's 501 Jeans", priceRange: [15, 45], variants: ['32x32', '34x32', "women's"] },
      { name: 'Patagonia Fleece Jacket', priceRange: [20, 70], variants: ['size M', 'size L'] },
      { name: 'North Face Puffer Coat', priceRange: [40, 130], variants: ['size M', 'size L', "women's"] },
      { name: 'Wool Winter Coat', priceRange: [25, 90], variants: ['size S', 'size M'] },
      { name: 'Leather Boots', priceRange: [20, 100], variants: ['size 9', 'size 10'] },
      { name: 'Designer Handbag', priceRange: [30, 250], variants: ['black', 'tan', 'with dust bag'] },
      { name: 'Wedding Dress', priceRange: [80, 400], variants: ['size 6', 'size 8', 'altered'] },
      { name: 'Suit Jacket', priceRange: [25, 120], variants: ['size 40R', 'size 42R'] },
      { name: 'Running Shoes', priceRange: [15, 70], variants: ['size 9', 'size 10'] },
    ],
    descriptionTemplate: (item, c) => `${item}, ${CONDITION_PHRASE[c]}. Smoke-free home, true to size.`,
  },
  [ListingCategory.VEHICLES]: {
    items: [
      { name: '2015 Honda Civic', priceRange: [6000, 12000], variants: ['low mileage', 'one owner'] },
      { name: '2018 Toyota Corolla', priceRange: [8000, 15000], variants: ['low mileage', 'new tires'] },
      { name: 'Trek Mountain Bike', priceRange: [150, 700], variants: ['medium frame', 'with lock'] },
      { name: 'Vespa Scooter', priceRange: [1200, 3500], variants: ['low mileage', 'recently serviced'] },
      { name: 'Electric Scooter', priceRange: [150, 500], variants: ['with charger', 'foldable'] },
      { name: 'Road Bike', priceRange: [200, 900], variants: ['carbon frame', 'with pedals'] },
      { name: 'Kids Bicycle', priceRange: [30, 120], variants: ['with training wheels'] },
      { name: '2012 Ford Focus', priceRange: [4000, 8000], variants: ['recently serviced', 'new tires'] },
      { name: 'Motorcycle Helmet', priceRange: [40, 200], variants: ['size M', 'size L', 'with visor'] },
      { name: 'Roof Rack', priceRange: [80, 300], variants: ['universal fit'] },
    ],
    descriptionTemplate: (item, c) =>
      `${item}, ${CONDITION_PHRASE[c]}. Maintenance records available on request.`,
  },
  [ListingCategory.HOME_GARDEN]: {
    items: [
      { name: 'Weber Charcoal Grill', priceRange: [40, 250], variants: ['with cover', 'includes tools'] },
      { name: 'Patio Furniture Set', priceRange: [80, 600], variants: ['4-piece', '6-piece', 'with cushions'] },
      { name: 'Lawn Mower', priceRange: [60, 400], variants: ['gas-powered', 'electric', 'self-propelled'] },
      { name: 'Pressure Washer', priceRange: [40, 200], variants: ['electric', 'gas-powered'] },
      { name: 'Garden Tool Set', priceRange: [15, 80], variants: GENERIC_VARIANTS },
      { name: 'Outdoor Fire Pit', priceRange: [30, 200], variants: ['with cover', 'includes screen'] },
      { name: 'Ladder', priceRange: [20, 90], variants: ['6ft', '8ft', 'extension'] },
      { name: 'Leaf Blower', priceRange: [20, 120], variants: ['electric', 'gas-powered'] },
      { name: 'Garden Hose Reel', priceRange: [15, 60], variants: GENERIC_VARIANTS },
      { name: 'Greenhouse Kit', priceRange: [50, 300], variants: ['never assembled', 'includes shelving'] },
    ],
    descriptionTemplate: (item, c) => `${item}, ${CONDITION_PHRASE[c]}. Stored in a dry garage.`,
  },
  [ListingCategory.SPORTS_OUTDOORS]: {
    items: [
      { name: 'Wilson Tennis Racket', priceRange: [15, 60], variants: ['with case', 'grip size 4'] },
      { name: 'Camping Tent (4-person)', priceRange: [30, 150], variants: ['with footprint', 'waterproof'] },
      { name: 'Yoga Mat', priceRange: [10, 40], variants: GENERIC_VARIANTS },
      { name: 'Kayak', priceRange: [150, 600], variants: ['single seat', 'with paddle'] },
      { name: 'Fishing Rod Set', priceRange: [20, 100], variants: ['with tackle box'] },
      { name: 'Snowboard', priceRange: [80, 300], variants: ['with bindings', "men's", "women's"] },
      { name: 'Golf Club Set', priceRange: [60, 350], variants: ['with bag', 'right-handed'] },
      { name: 'Hiking Backpack', priceRange: [20, 90], variants: ['40L', '60L', 'with rain cover'] },
      { name: 'Weight Bench', priceRange: [40, 180], variants: ['with weights', 'adjustable'] },
      { name: 'Basketball Hoop', priceRange: [50, 250], variants: ['portable', 'wall-mounted'] },
    ],
    descriptionTemplate: (item, c) => `${item}, ${CONDITION_PHRASE[c]}. Great for weekend trips.`,
  },
  [ListingCategory.TOYS_GAMES]: {
    items: [
      { name: 'LEGO Star Wars Set', priceRange: [15, 80], variants: ['complete set', 'original box'] },
      { name: 'Board Game Bundle', priceRange: [10, 45], variants: ['5 games', '8 games'] },
      { name: 'Nintendo Switch Games (Lot)', priceRange: [15, 60], variants: ['3 games', '5 games'] },
      { name: 'Barbie Dreamhouse', priceRange: [20, 90], variants: ['with accessories'] },
      { name: 'RC Car', priceRange: [15, 70], variants: ['with charger', 'off-road'] },
      { name: 'Puzzle Collection', priceRange: [8, 30], variants: ['500-piece', '1000-piece'] },
      { name: 'Action Figure Set', priceRange: [10, 50], variants: ['original packaging'] },
      { name: 'Monopoly Board Game', priceRange: [5, 20], variants: GENERIC_VARIANTS },
      { name: 'Kids Play Kitchen', priceRange: [20, 90], variants: ['with accessories'] },
      { name: 'Chess Set', priceRange: [8, 40], variants: ['wooden', 'travel size'] },
    ],
    descriptionTemplate: (item, c) => `${item}, ${CONDITION_PHRASE[c]}. Smoke-free, pet-free home.`,
  },
  [ListingCategory.OTHER]: {
    items: [
      { name: 'Assorted Book Collection', priceRange: [10, 50], variants: ['20 books', '40 books'] },
      { name: 'Vinyl Record Collection', priceRange: [20, 150], variants: ['15 records', '30 records'] },
      { name: 'Antique Wall Clock', priceRange: [20, 150], variants: ['working condition'] },
      { name: 'Sewing Machine', priceRange: [30, 150], variants: ['with accessories'] },
      { name: 'Guitar (Acoustic)', priceRange: [40, 200], variants: ['with case', 'with tuner'] },
      { name: 'Keyboard Piano', priceRange: [40, 250], variants: ['61-key', '88-key', 'with stand'] },
      { name: 'Art Supplies Bundle', priceRange: [10, 60], variants: GENERIC_VARIANTS },
      { name: 'Vintage Camera', priceRange: [15, 120], variants: ['film tested', 'with case'] },
      { name: 'Collectible Coin Set', priceRange: [15, 200], variants: ['with album'] },
      { name: 'Framed Wall Art', priceRange: [10, 80], variants: ['set of 3', 'large format'] },
    ],
    descriptionTemplate: (item, c) => `${item}, ${CONDITION_PHRASE[c]}. Happy to answer questions.`,
  },
};
