export enum UserRole {
  CONTRIBUTOR = 'CONTRIBUTOR',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

// Ranked, not parallel — @Roles(MODERATOR) admits an ADMIN automatically.
export const USER_ROLE_RANK: Record<UserRole, number> = {
  [UserRole.CONTRIBUTOR]: 0,
  [UserRole.MODERATOR]: 1,
  [UserRole.ADMIN]: 2,
};

export enum ListingCondition {
  NEW = 'NEW',
  LIKE_NEW = 'LIKE_NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  FOR_PARTS = 'FOR_PARTS',
}

export enum ListingCategory {
  ELECTRONICS = 'ELECTRONICS',
  FURNITURE = 'FURNITURE',
  CLOTHING = 'CLOTHING',
  VEHICLES = 'VEHICLES',
  HOME_GARDEN = 'HOME_GARDEN',
  SPORTS_OUTDOORS = 'SPORTS_OUTDOORS',
  TOYS_GAMES = 'TOYS_GAMES',
  OTHER = 'OTHER',
}

export enum ListingOption {
  DELIVERY_AVAILABLE = 'DELIVERY_AVAILABLE',
  LOCAL_PICKUP = 'LOCAL_PICKUP',
  OPEN_TO_TRADES = 'OPEN_TO_TRADES',
  ORIGINAL_PACKAGING = 'ORIGINAL_PACKAGING',
  WARRANTY_INCLUDED = 'WARRANTY_INCLUDED',
  BUNDLE_DEAL = 'BUNDLE_DEAL',
}

export enum ListingStatus {
  PENDING = 'PENDING',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}
