import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Checkbox, FormField, Input, Label } from '@roofing/ui';
import { QRCodeSVG } from 'qrcode.react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import {
  enableTwoFactor,
  secretFromTotpUri,
  verifyTotp,
  type TwoFactorEnrollment,
} from '../../api/auth';
import { authErrorKey, type AuthErrorKey } from '../../api/errors';
import {
  confirmPasswordSchema,
  totpSchema,
  type ConfirmPasswordValues,
  type TotpValues,
} from '../../auth/schemas';
import { useSession } from '../../session';
import { AuthCard, FormError } from './shared';

type Step = 'password' | 'scan' | 'backup';

function PasswordStep({ onDone }: { onDone: (enrollment: TwoFactorEnrollment) => void }) {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmPasswordValues>({
    resolver: zodResolver(confirmPasswordSchema),
    defaultValues: { password: '' },
    mode: 'onTouched',
  });
  const message = errors.password?.message;
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={handleSubmit(async ({ password }) => {
        setErrorKey(null);
        try {
          onDone(await enableTwoFactor(password));
        } catch (error) {
          setErrorKey(authErrorKey(error));
        }
      })}
    >
      <p className="text-fg-muted">{t('app.auth.twoFactor.setupPassword')}</p>
      <FormError errorKey={errorKey} />
      <FormField
        label={t('app.auth.password')}
        error={message ? t(message as 'validation.required') : undefined}
        required
        requiredLabel={t('common.required')}
      >
        {(c) => (
          <Input {...c} type="password" autoComplete="current-password" {...register('password')} />
        )}
      </FormField>
      <Button
        type="submit"
        size="lg"
        loading={isSubmitting}
        loadingLabel={t('app.auth.twoFactor.continuing')}
      >
        {t('app.auth.twoFactor.continue')}
      </Button>
    </form>
  );
}

function ScanStep({ enrollment, onDone }: { enrollment: TwoFactorEnrollment; onDone: () => void }) {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TotpValues>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '' },
    mode: 'onTouched',
  });
  const secret = secretFromTotpUri(enrollment.totpURI);
  const message = errors.code?.message;
  return (
    <div className="grid gap-5">
      <section aria-labelledby="scan-title" className="grid gap-3">
        <h2 id="scan-title" className="font-display text-lg font-bold">
          {t('app.auth.twoFactor.scanTitle')}
        </h2>
        <p className="text-fg-muted">{t('app.auth.twoFactor.scanIntro')}</p>
        <div
          role="img"
          aria-label={t('app.auth.twoFactor.qrLabel')}
          className="justify-self-center rounded-md bg-white p-3"
        >
          <QRCodeSVG
            value={enrollment.totpURI}
            size={176}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            aria-hidden="true"
          />
        </div>
        {secret ? (
          <>
            <p className="text-sm text-fg-muted">{t('app.auth.twoFactor.manualKey')}</p>
            <code className="max-w-full rounded-md bg-surface-alt px-3 py-2 font-mono text-base break-all select-all">
              {secret}
            </code>
          </>
        ) : null}
      </section>
      <form
        noValidate
        className="grid gap-5"
        onSubmit={handleSubmit(async ({ code }) => {
          setErrorKey(null);
          try {
            await verifyTotp(code);
            onDone();
          } catch (error) {
            setErrorKey(authErrorKey(error, { INVALID_CODE: 'invalidCode' }));
          }
        })}
      >
        <h2 className="font-display text-lg font-bold">{t('app.auth.twoFactor.enterCode')}</h2>
        <FormError errorKey={errorKey} />
        <FormField
          label={t('app.auth.twoFactor.code')}
          error={message ? t(message as 'validation.required') : undefined}
          required
          requiredLabel={t('common.required')}
        >
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              spellCheck={false}
              {...register('code')}
            />
          )}
        </FormField>
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingLabel={t('app.auth.twoFactor.activating')}
        >
          {t('app.auth.twoFactor.activate')}
        </Button>
      </form>
    </div>
  );
}

function BackupStep({ codes, onFinish }: { codes: string[]; onFinish: () => Promise<void> }) {
  const { t } = useTranslation();
  const savedId = useId();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false); // sin permiso de portapapeles: pueden copiarlos a mano
    }
  };
  return (
    <div className="grid gap-5">
      <h2 className="font-display text-lg font-bold">{t('app.auth.twoFactor.backupTitle')}</h2>
      <p className="text-fg-muted">{t('app.auth.twoFactor.backupIntro')}</p>
      <ul
        aria-label={t('app.auth.twoFactor.backupList')}
        className="grid grid-cols-2 gap-2 rounded-md bg-surface-alt p-4 font-mono"
      >
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => void copy()}>
        {t('app.auth.twoFactor.copy')}
      </Button>
      <p role="status" className="min-h-6 text-sm font-medium">
        {copied ? t('app.auth.twoFactor.copied') : ''}
      </p>
      <div className="flex items-start gap-3">
        <Checkbox id={savedId} checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        <Label htmlFor={savedId} className="pt-0.5">
          {t('app.auth.twoFactor.saved')}
        </Label>
      </div>
      <Button
        size="lg"
        disabled={!saved}
        loading={finishing}
        onClick={() => {
          setFinishing(true);
          void onFinish().finally(() => setFinishing(false));
        }}
      >
        {t('app.auth.twoFactor.finish')}
      </Button>
    </div>
  );
}

/** Alta del 2FA: contraseña → QR + código → códigos de respaldo. Obligatoria para ADMIN y SUPERADMIN. */
export function SetupTwoFactorPage() {
  const { t } = useTranslation();
  const { session, refresh, signOut } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('password');
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);

  // Quien ya lo tiene no pasa por aquí; durante el alta se espera al final para no cortar los códigos.
  if (session.status === 'authenticated' && session.user.twoFactorEnabled && step !== 'backup') {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthCard
      title={t('app.auth.twoFactor.setupTitle')}
      intro={step === 'password' ? t('app.auth.twoFactor.setupIntro') : undefined}
    >
      {step === 'password' && (
        <PasswordStep
          onDone={(next) => {
            setEnrollment(next);
            setStep('scan');
          }}
        />
      )}
      {step === 'scan' && enrollment && (
        <ScanStep enrollment={enrollment} onDone={() => setStep('backup')} />
      )}
      {step === 'backup' && enrollment && (
        <BackupStep
          codes={enrollment.backupCodes}
          onFinish={async () => {
            await refresh();
            void navigate('/', { replace: true });
          }}
        />
      )}
      {step !== 'backup' && (
        <Button variant="ghost" onClick={() => void signOut()}>
          {t('app.shell.signOut')}
        </Button>
      )}
    </AuthCard>
  );
}
