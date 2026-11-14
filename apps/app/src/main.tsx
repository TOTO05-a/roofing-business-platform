import { MotionProvider } from '@roofing/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './i18n';
import './index.css';
import { createAppQueryClient } from './api/crm';
import { RoleProvider } from './role';
import { router } from './router';
import { SessionProvider } from './session';

const queryClient = createAppQueryClient();
const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

createRoot(root).render(
  <StrictMode>
    <MotionProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RoleProvider>
            <RouterProvider router={router} />
          </RoleProvider>
        </SessionProvider>
      </QueryClientProvider>
    </MotionProvider>
  </StrictMode>,
);
