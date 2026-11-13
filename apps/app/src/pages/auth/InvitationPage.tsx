import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, FormField, Input } from '@roofing/ui';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { acceptInvitation } from '../../api/auth';
import { authErrorKey, type AuthErrorKey } from '../../api/errors';
import { invitationSchema, type InvitationValues } from '../../auth/schemas';
import { AuthCard, FormError, linkClass } from './shared';

/** El token llega en el fragmento (`#token=…`): no viaja al servidor. Se lee y se quita de la URL. */
function readToken(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  // La API exige 20-200 caracteres: fuera de ese rango el enlace está incompleto o dañado.
  return token && token.length >= 20 && token.length <= 200 ? token : null;
}

/** Errores tras los que reintentar no sirve: hace falta otra invitación o iniciar sesión. */
const finalErrors: readonly AuthErrorKey[] = [
  'invitationInvalid',
  'invitationUsed',
  'invitationExpired',
  'accountExists',
];

export function InvitationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { name: '', password: '', confirm: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  const title = t('app.auth.invitation.title');
  const final = errorKey !== null && finalErrors.includes(errorKey);

  if (!token || final) {
    return (
      <AuthCard title={title}>
        <Alert variant="danger" live>
          {errorKey ? t(`app.auth.errors.${errorKey}`) : t('app.auth.invitation.noToken')}
        </Alert>
        <Link to="/iniciar-sesion" className={linkClass}>
          {t('app.auth.backToSignIn')}
        </Link>
      </AuthCard>
    );
  }

  const err = (key: string | undefined) => (key ? t(key as 'validation.required') : undefined);

  const onSubmit = async (values: InvitationValues) => {
    setErrorKey(null);
    try {
      await acceptInvitation(token, values.name, values.password);
      void navigate('/iniciar-sesion', { replace: true, state: { notice: 'accountCreated' } });
    } catch (error) {
      setErrorKey(authErrorKey(error, { VALIDATION_ERROR: 'invitationInvalid' }));
    }
  };

  return (
    <AuthCard title={title} intro={t('app.auth.invitation.intro')}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
        <FormError errorKey={errorKey} />
        <FormField
          label={t('app.auth.invitation.name')}
          error={err(errors.name?.message)}
          required
          requiredLabel={t('common.required')}
        >
          {(c) => <Input {...c} autoComplete="name" {...register('name')} />}
        </FormField>
        <FormField
          label={t('app.auth.password')}
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
          loadingLabel={t('app.auth.invitation.submitting')}
        >
          {t('app.auth.invitation.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
