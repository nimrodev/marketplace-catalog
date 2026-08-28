import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@marketplace/shared';

export const ROLES_KEY = 'requiredRole';

// A single minimum rank, not a list to match against — roles are ranked
// (CONTRIBUTOR < MODERATOR < ADMIN), so @Roles(MODERATOR) already admits
// an ADMIN without naming it (MAR-14).
export const Roles = (role: UserRole): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, role);
