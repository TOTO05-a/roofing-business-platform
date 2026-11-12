import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/AppShell';
import { placeholderItems } from './navigation';
import { HomePage, NotFoundPage, PlaceholderPage } from './pages/Basic';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'componentes',
        lazy: async () => ({ Component: (await import('./pages/Showcase')).ShowcasePage }),
      },
      ...placeholderItems.map((item) => ({
        path: item.to.slice(1),
        element: <PlaceholderPage />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
