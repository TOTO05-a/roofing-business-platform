import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireRole, type RequestAuth } from '../src/auth/middleware.js';
import { assertCanAccess, canAccessResource } from '../src/auth/ownership.js';
import type { Role } from '../src/auth/roles.js';
import { HttpError } from '../src/lib/http-error.js';

const CLIENT = { id: 'cliente-1', role: 'CUSTOMER' as const };
const EMPLOYEE = { id: 'empleado-1', role: 'EMPLOYEE' as const };
const project = { ownerId: 'cliente-1', assigneeIds: ['empleado-1'] };

describe('canAccessResource', () => {
  it('ADMIN y SUPERADMIN acceden a todo', () => {
    expect(canAccessResource({ id: 'a', role: 'ADMIN' }, project)).toBe(true);
    expect(canAccessResource({ id: 's', role: 'SUPERADMIN' }, { ownerId: null })).toBe(true);
  });

  it('un cliente solo accede a lo suyo', () => {
    expect(canAccessResource(CLIENT, project)).toBe(true);
    expect(canAccessResource({ id: 'cliente-2', role: 'CUSTOMER' }, project)).toBe(false);
    expect(canAccessResource(CLIENT, { ownerId: null })).toBe(false);
  });

  it('un empleado solo accede a lo asignado', () => {
    expect(canAccessResource(EMPLOYEE, project)).toBe(true);
    expect(canAccessResource({ id: 'empleado-2', role: 'EMPLOYEE' }, project)).toBe(false);
    expect(canAccessResource(EMPLOYEE, { ownerId: 'empleado-1' })).toBe(false);
  });
});

describe('assertCanAccess', () => {
  it('responde 404 sin acceso o si el recurso no existe', () => {
    const intruder = { id: 'cliente-2', role: 'CUSTOMER' as const };
    expect(() => assertCanAccess(intruder, project)).toThrow(HttpError);
    expect(() => assertCanAccess(CLIENT, null)).toThrow(/no encontrado/);
    expect(() => assertCanAccess(CLIENT, project)).not.toThrow();
  });
});

describe('requireRole', () => {
  function appWith(role: Role | null) {
    const app = express();
    app.use((req, _res, next) => {
      if (role) {
        const auth: RequestAuth = {
          sessionId: 's',
          user: {
            id: 'u',
            email: 'u@example.com',
            name: 'U',
            role,
            emailVerified: true,
            twoFactorEnabled: true,
          },
        };
        req.auth = auth;
      }
      next();
    });
    app.get('/x', requireRole('ADMIN', 'SUPERADMIN'), (_req, res) => {
      res.json({ ok: true });
    });
    const onError: express.ErrorRequestHandler = (err, _req, res, _next) => {
      const isHttp = err instanceof HttpError;
      res.status(isHttp ? err.status : 500).json({ code: isHttp ? err.code : 'X' });
    };
    app.use(onError);
    return app;
  }

  it('deja pasar los roles permitidos', async () => {
    expect((await request(appWith('ADMIN')).get('/x')).status).toBe(200);
  });

  it('rechaza con 403 los demás roles', async () => {
    const res = await request(appWith('EMPLOYEE')).get('/x');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('rechaza con 401 si no hay sesión', async () => {
    expect((await request(appWith(null)).get('/x')).status).toBe(401);
  });
});
