import { MotionProvider } from '@roofing/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './i18n';
import './index.css';
import { RoleProvider } from './role';
import { router } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

createRoot(root).render(
  <StrictMode>
    <MotionProvider>
      <RoleProvider>
        <RouterProvider router={router} />
      </RoleProvider>
    </MotionProvider>
  </StrictMode>,
);
