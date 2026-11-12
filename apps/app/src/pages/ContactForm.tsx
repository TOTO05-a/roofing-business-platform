import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Label,
  Select,
  Textarea,
  toast,
} from '@roofing/ui';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

/**
 * Los mensajes del esquema son CLAVES de traducción (no texto):
 * así el error se muestra siempre en el idioma activo, incluso si cambia tras validar.
 */
export const contactSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').min(2, 'validation.minName'),
  email: z.string().trim().min(1, 'validation.required').pipe(z.email('validation.email')),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || v.replace(/\D/g, '').length === 10, 'validation.phone'),
  service: z.string().min(1, 'validation.service'),
  message: z.string().trim().min(1, 'validation.required').min(10, 'validation.minMessage'),
  consent: z.boolean().refine((v) => v, 'validation.consent'),
});

export type ContactValues = z.infer<typeof contactSchema>;

const defaults: ContactValues = {
  name: '',
  email: '',
  phone: '',
  service: '',
  message: '',
  consent: false,
};

export function ContactForm() {
  const { t } = useTranslation();
  const consentId = useId();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: defaults,
    mode: 'onTouched',
  });

  // Traduce una clave de error; si no hay error devuelve undefined.
  const err = (key: string | undefined) => (key ? t(key as 'validation.required') : undefined);

  const onSubmit = async (_values: ContactValues) => {
    await new Promise((resolve) => setTimeout(resolve, 900)); // simula el envío
    toast.success(t('app.form.success'));
    reset(defaults);
  };

  const hasErrors = Object.keys(errors).length > 0;
  const req = t('common.required');

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid max-w-2xl gap-5">
      {isSubmitted && hasErrors && <Alert variant="danger">{t('app.form.invalid')}</Alert>}

      <FormField
        label={t('app.form.name')}
        required
        requiredLabel={req}
        error={err(errors.name?.message)}
      >
        {(c) => <Input autoComplete="name" {...c} {...register('name')} />}
      </FormField>

      <FormField
        label={t('app.form.email')}
        required
        requiredLabel={req}
        error={err(errors.email?.message)}
      >
        {(c) => <Input type="email" autoComplete="email" {...c} {...register('email')} />}
      </FormField>

      <FormField
        label={t('app.form.phone')}
        hint={t('app.form.phoneHint')}
        error={err(errors.phone?.message)}
      >
        {(c) => (
          <Input type="tel" autoComplete="tel" inputMode="tel" {...c} {...register('phone')} />
        )}
      </FormField>

      <FormField
        label={t('app.form.service')}
        required
        requiredLabel={req}
        error={err(errors.service?.message)}
      >
        {(c) => (
          <Controller
            control={control}
            name="service"
            render={({ field }) => (
              <Select
                id={c.id}
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                placeholder={t('app.form.servicePlaceholder')}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                aria-required
                options={[
                  { value: 'repair', label: t('app.form.serviceRepair') },
                  { value: 'replacement', label: t('app.form.serviceReplacement') },
                  { value: 'inspection', label: t('app.form.serviceInspection') },
                ]}
              />
            )}
          />
        )}
      </FormField>

      <FormField
        label={t('app.form.message')}
        hint={t('app.form.messageHint')}
        required
        requiredLabel={req}
        error={err(errors.message?.message)}
      >
        {(c) => <Textarea {...c} {...register('message')} />}
      </FormField>

      <div className="flex flex-col gap-1.5">
        <div className="flex min-h-11 items-center gap-3">
          <Controller
            control={control}
            name="consent"
            render={({ field }) => (
              <Checkbox
                id={consentId}
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? `${consentId}-error` : undefined}
              />
            )}
          />
          <Label htmlFor={consentId} className="cursor-pointer text-base font-normal">
            {t('app.form.consent')}
          </Label>
        </div>
        {errors.consent && (
          <p
            id={`${consentId}-error`}
            aria-live="polite"
            className="text-sm font-medium text-danger"
          >
            {err(errors.consent.message)}
          </p>
        )}
      </div>

      <div>
        <Button type="submit" loading={isSubmitting} loadingLabel={t('app.form.submitting')}>
          {t('app.form.submit')}
        </Button>
      </div>
    </form>
  );
}
