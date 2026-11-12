import { zodResolver } from '@hookform/resolvers/zod';
import { Button, FormField, Input } from '@roofing/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router';
import { verifyBackupCode, verifyTotp } from '../../api/auth';
import { authErrorKey, type AuthErrorKey } from '../../api/errors';
import {
  backupCodeSchema,
  totpSchema,
  type BackupCodeValues,
  type TotpValues,
} from '../../auth/schemas';
import { SessionLoading, useSession } from '../../session';
import { AuthCard, FormError, linkClass, readState, safeFrom, sessionHome } from './shared';

const verifyErrors = {
  INVALID_TWO_FACTOR_COOKIE: 'twoFactorExpired',
  INVALID_CODE: 'invalidCode',
  INVALID_BACKUP_CODE: 'invalidCode',
} as const satisfies Record<string, AuthErrorKey>;

/** Segundo paso del inicio de sesión: código TOTP o, sin el teléfono, uno de respaldo. */
export function VerifyTwoFactorPage() {
  const { t } = useTranslation();
  const { session, refresh } = useSession();
  const location = useLocation();
  const from = safeFrom(readState(location.state).from);
  const [useBackup, setUseBackup] = useState(false);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);

  const totp = useForm<TotpValues>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '' },
    mode: 'onTouched',
  });
  const backup = useForm<BackupCodeValues>({
    resolver: zodResolver(backupCodeSchema),
    defaultValues: { code: '' },
    mode: 'onTouched',
  });

  const home = sessionHome(session, from);
  if (home) return <Navigate to={home} replace />;
  if (session.status === 'loading') return <SessionLoading />;

  const err = (key: string | undefined) => (key ? t(key as 'validation.required') : undefined);

  const submit = (verify: (code: string) => Promise<void>) => async (values: { code: string }) => {
    setErrorKey(null);
    try {
      await verify(values.code.trim());
      await refresh();
    } catch (error) {
      setErrorKey(authErrorKey(error, verifyErrors));
    }
  };

  const mode = useBackup ? backup : totp;

  return (
    <AuthCard
      title={t('app.auth.twoFactor.verifyTitle')}
      intro={t('app.auth.twoFactor.verifyIntro')}
    >
      <form
        key={useBackup ? 'backup' : 'totp'}
        noValidate
        onSubmit={
          useBackup
            ? backup.handleSubmit(submit(verifyBackupCode))
            : totp.handleSubmit(submit(verifyTotp))
        }
        className="grid gap-5"
      >
        <FormError errorKey={errorKey} />
        <FormField
          label={useBackup ? t('app.auth.twoFactor.backupCode') : t('app.auth.twoFactor.code')}
          hint={useBackup ? t('app.auth.twoFactor.backupHint') : undefined}
          error={err(mode.formState.errors.code?.message)}
          required
          requiredLabel={t('common.required')}
        >
          {(c) =>
            useBackup ? (
              <Input
                {...c}
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                {...backup.register('code')}
              />
            ) : (
              <Input
                {...c}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                spellCheck={false}
                {...totp.register('code')}
              />
            )
          }
        </FormField>
        <Button
          type="submit"
          size="lg"
          loading={mode.formState.isSubmitting}
          loadingLabel={t('app.auth.twoFactor.submitting')}
        >
          {t('app.auth.twoFactor.submit')}
        </Button>
      </form>
      <Button
        variant="ghost"
        onClick={() => {
          setUseBackup((v) => !v);
          setErrorKey(null);
        }}
      >
        {useBackup ? t('app.auth.twoFactor.useApp') : t('app.auth.twoFactor.useBackup')}
      </Button>
      <Link to="/iniciar-sesion" replace className={linkClass}>
        {t('app.auth.twoFactor.cancel')}
      </Link>
    </AuthCard>
  );
}
