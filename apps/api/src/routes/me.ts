import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { requiresTwoFactor } from '../auth/roles.js';
import type { AppServices } from '../services.js';

export function meRouter({ auth }: AppServices): Router {
  const router = Router();

  // Accesible sin 2FA para que un administrador sepa que debe activarlo.
  router.get('/', requireAuth(auth, { allowPendingTwoFactor: true }), (req, res) => {
    const user = currentUser(req);
    res.json({
      user,
      twoFactorRequired: requiresTwoFactor(user.role) && !user.twoFactorEnabled,
    });
  });

  return router;
}
