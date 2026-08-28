import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Opt-out of the global JwtAuthGuard. Default-deny is the point (MAR-14) —
// a new route is protected unless it explicitly says otherwise.
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
