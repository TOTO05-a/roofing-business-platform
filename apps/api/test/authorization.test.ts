import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireRole, type AuthContext, type RequestAuth } from '../src/auth/middleware.js';
import type { Role } from '../src/auth/roles.js';
import { scopedWhere, scopes, visibleOr404 } from '../src/auth/scope.js';
import { HttpError } from '../src/lib/http-error.js';

const NOTHING = { id: { in: [] } };
const customer: AuthContext = { userId: 'u-c', role: 'CUSTOMER', customerId: 'cust-1' };
const employee: AuthContext = { userId: 'u-e', role: 'EMPLOYEE', employeeId: 'emp-1' };
const admin: AuthContext = { userId: 'u-a', role: 'ADMIN' };
const superadmin: AuthContext = { userId: 'u-s', role: 'SUPERADMIN' };

describe('filtro de alcance centralizado', () => {
  it('ADMIN y SUPERADMIN ven todos los perfiles no borrados', () => {
    for (const context of [admin, superadmin]) {
      expect(scopes.customerProfile(context)).toEqual({ deletedAt: null });
      expect(scopes.employeeProfile(context)).toEqual({ deletedAt: null });
    }
  });

  it('un cliente solo ve su propio perfil y ningún empleado', () => {
    expect(scopes.customerProfile(customer)).toEqual({ deletedAt: null, id: 'cust-1' });
    expect(scopes.employeeProfile(customer)).toEqual(NOTHING);
  });

  it('un cliente sin perfil enlazado no ve nada', () => {
    expect(scopes.customerProfile({ userId: 'u', role: 'CUSTOMER' })).toEqual(NOTHING);
  });

  it('un empleado ve su perfil y, por ahora, ningún cliente', () => {
    expect(scopes.employeeProfile(employee)).toEqual({ deletedAt: null, id: 'emp-1' });
    expect(scopes.customerProfile(employee)).toEqual(NOTHING);
  });

  it('scopedWhere combina el alcance con el filtro de la consulta', () => {
    expect(scopedWhere('customerProfile', customer, { id: 'otro' })).toEqual({
      AND: [{ deletedAt: null, id: 'cust-1' }, { id: 'otro' }],
    });
  });

  it('visibleOr404 responde 404 cuando la fila no es visible', () => {
    expect(() => visibleOr404(null)).toThrow(HttpError);
    expect(() => visibleOr404(undefined)).toThrow(/no encontrado/);
    expect(visibleOr404({ id: 1 })).toEqual({ id: 1 });
  });
});

describe('requireRole', () => {
  function appWith(role: Role | null) {
    const app = express();
    app.use((req, _res, next) => {
      if (role) {
        const auth: RequestAuth = {
          sessionId: 's',
          context: { userId: 'u', role },
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
