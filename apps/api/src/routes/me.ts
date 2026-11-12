import { Router } from 'express';
import { authContext, currentUser, requireAuth } from '../auth/middleware.js';
import { requiresTwoFactor } from '../auth/roles.js';
import type { AppServices } from '../services.js';

export function meRouter(services: AppServices): Router {
  const router = Router();

  // Accesible sin 2FA para que un administrador sepa que debe activarlo.
  router.get('/', requireAuth(services, { allowPendingTwoFactor: true }), (req, res) => {
    const user = currentUser(req);
    const context = authContext(req);
    res.json({
      user,
      customerId: context.customerId ?? null,
      employeeId: context.employeeId ?? null,
      twoFactorRequired: requiresTwoFactor(user.role) && !user.twoFactorEnabled,
    });
  });

  return router;
}
