import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, FormField, Input } from '@roofing/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { signIn } from '../../api/auth';
import { authErrorKey, type AuthErrorKey } from '../../api/errors';
import { signInSchema, type SignInValues } from '../../auth/schemas';
import { SessionLoading, useSession } from '../../session';
import { AuthCard, FormError, linkClass, readState, safeFrom, sessionHome } from './shared';

export function SignInPage() {
  const { t } = useTranslation();
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const state = readState(location.state);
  const from = safeFrom(state.from);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const home = sessionHome(session, from);
  if (home) return <Navigate to={home} replace />;
  if (session.status === 'loading') return <SessionLoading />;

  const err = (key: string | undefined) => (key ? t(key as 'validation.required') : undefined);

  const onSubmit = async (values: SignInValues) => {
    setErrorKey(null);
    try {
      const result = await signIn(values.email, values.password);
      if (result.twoFactorRequired) {
        void navigate('/verificacion', { replace: true, state: { from } });
        return;
      }
      // Al leer la sesión, esta pantalla redirige sola (a `from` o al alta de 2FA).
      await refresh();
    } catch (error) {
      setErrorKey(authErrorKey(error));
    }
  };

  return (
    <AuthCard title={t('app.auth.signIn.title')} intro={t('app.auth.signIn.intro')}>
      {state.notice ? (
        <Alert variant="success" live>
          {t(`app.auth.signIn.${state.notice}`)}
        </Alert>
      ) : null}
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
        <FormError errorKey={errorKey} />
        <FormField
          label={t('app.auth.email')}
          error={err(errors.email?.message)}
          required
          requiredLabel={t('common.required')}
        >
          {(c) => (
            <Input
              {...c}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              {...register('email')}
            />
          )}
        </FormField>
        <FormField
          label={t('app.auth.password')}
          error={err(errors.password?.message)}
          required
          requiredLabel={t('common.required')}
        >
          {(c) => (
            <Input
              {...c}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          )}
        </FormField>
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingLabel={t('app.auth.signIn.submitting')}
        >
          {t('app.auth.signIn.submit')}
        </Button>
      </form>
      <Link to="/recuperar" className={linkClass}>
        {t('app.auth.signIn.forgot')}
      </Link>
    </AuthCard>
  );
}
