import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, FormField, Input } from '@roofing/ui';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { resetPassword } from '../../api/auth';
import { authErrorKey, type AuthErrorKey } from '../../api/errors';
import { newPasswordSchema, type NewPasswordValues } from '../../auth/schemas';
import { AuthCard, FormError, linkClass } from './shared';

/** El enlace del correo trae `?token=` (Better Auth). Se lee una vez y se quita de la URL. */
function readToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('error') ? null : params.get('token');
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  if (!token) {
    return (
      <AuthCard title={t('app.auth.reset.title')}>
        <Alert variant="danger" live>
          {t('app.auth.reset.invalidLink')}
        </Alert>
        <Link to="/recuperar" className={linkClass}>
          {t('app.auth.reset.requestNew')}
        </Link>
      </AuthCard>
    );
  }

  const err = (key: string | undefined) => (key ? t(key as 'validation.required') : undefined);

  const onSubmit = async (values: NewPasswordValues) => {
    setErrorKey(null);
    try {
      await resetPassword(token, values.password);
      void navigate('/iniciar-sesion', { replace: true, state: { notice: 'passwordReset' } });
    } catch (error) {
      setErrorKey(authErrorKey(error));
    }
  };

  return (
    <AuthCard title={t('app.auth.reset.title')} intro={t('app.auth.reset.intro')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
        <FormError errorKey={errorKey} />
        <FormField
          label={t('app.auth.newPassword')}
          hint={t('app.auth.passwordHint')}
          error={err(errors.password?.message)}
          required
          requiredLabel={t('common.required')}
        >
          {(c) => (
            <Input {...c} type="password" autoComplete="new-password" {...register('password')} />
          )}
        </FormField>
        <FormField
          label={t('app.auth.confirmPassword')}
          error={err(errors.confirm?.message)}
          required
          requiredLabel={t('common.required')}
        >
          {(c) => (
            <Input {...c} type="password" autoComplete="new-password" {...register('confirm')} />
          )}
        </FormField>
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingLabel={t('app.auth.reset.submitting')}
        >
          {t('app.auth.reset.submit')}
        </Button>
      </form>
      {errorKey === 'resetInvalid' ? (
        <Link to="/recuperar" className={linkClass}>
          {t('app.auth.reset.requestNew')}
        </Link>
      ) : null}
    </AuthCard>
  );
}
