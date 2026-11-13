import { zodResolver } from '@hookform/resolvers/zod';
import { Button, FormField, Input } from '@roofing/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { requestPasswordReset } from '../../api/auth';
import { authErrorKey, type AuthErrorKey } from '../../api/errors';
import { forgotSchema, type ForgotValues } from '../../auth/schemas';
import { AuthCard, FormError, LiveNotice, linkClass } from './shared';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });

  const onSubmit = async (values: ForgotValues) => {
    setErrorKey(null);
    try {
      await requestPasswordReset(values.email);
      // Misma respuesta exista o no la cuenta.
      setSent(true);
    } catch (error) {
      setErrorKey(authErrorKey(error));
    }
  };

  if (sent) {
    return (
      <AuthCard title={t('app.auth.forgot.sentTitle')}>
        <LiveNotice>{t('app.auth.forgot.sent')}</LiveNotice>
        <Link to="/iniciar-sesion" className={linkClass}>
          {t('app.auth.backToSignIn')}
        </Link>
      </AuthCard>
    );
  }

  const emailError = errors.email?.message;
  return (
    <AuthCard title={t('app.auth.forgot.title')} intro={t('app.auth.forgot.intro')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
        <FormError errorKey={errorKey} />
        <FormField
          label={t('app.auth.email')}
          error={emailError ? t(emailError as 'validation.required') : undefined}
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
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingLabel={t('app.auth.forgot.submitting')}
        >
          {t('app.auth.forgot.submit')}
        </Button>
      </form>
      <Link to="/iniciar-sesion" className={linkClass}>
        {t('app.auth.backToSignIn')}
      </Link>
    </AuthCard>
  );
}
