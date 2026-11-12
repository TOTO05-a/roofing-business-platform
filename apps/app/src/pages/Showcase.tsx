import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  fade,
  Skeleton,
  Spinner,
  stagger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@roofing/ui';
import { motion } from 'motion/react';
import { FolderPlus, HelpCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContactForm } from './ContactForm';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <motion.section
      aria-labelledby={id}
      variants={fade}
      className="rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <h2 id={id} className="mb-4 font-display text-2xl font-bold">
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function RetryDemo() {
  const { t } = useTranslation();
  const [state, setState] = useState<'error' | 'loading' | 'ok'>('error');
  const retry = () => {
    setState('loading');
    setTimeout(() => setState('ok'), 900);
  };
  if (state === 'ok') {
    return (
      <Alert variant="success" title={t('app.showcase.alertSuccessTitle')}>
        {t('app.showcase.retryDone')}
      </Alert>
    );
  }
  return (
    <ErrorState
      title={t('app.showcase.errorTitle')}
      description={t('app.showcase.errorText')}
      retryLabel={t('common.retry')}
      onRetry={retry}
      retrying={state === 'loading'}
    />
  );
}

export function ShowcasePage() {
  const { t } = useTranslation();
  const s = (k: string) => t(`app.showcase.${k}` as 'app.showcase.title');

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="visible" className="grid gap-6">
      <p className="max-w-prose text-lg text-fg-muted">{t('app.showcase.intro')}</p>

      <Section id="sec-buttons" title={t('app.showcase.buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('app.showcase.buttonPrimary')}</Button>
          <Button variant="secondary">{t('app.showcase.buttonSecondary')}</Button>
          <Button variant="ghost">{t('app.showcase.buttonGhost')}</Button>
          <Button variant="destructive">{t('app.showcase.buttonDestructive')}</Button>
          <Button loading loadingLabel={t('app.showcase.buttonLoading')}>
            {t('app.showcase.buttonLoading')}
          </Button>
          <Button disabled>{t('app.showcase.buttonDisabled')}</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">sm</Button>
          <Button size="md">md</Button>
          <Button size="lg">lg</Button>
        </div>
      </Section>

      <Section id="sec-badges" title={t('app.showcase.badges')}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{t('app.showcase.badgeNeutral')}</Badge>
          <Badge variant="success">{t('app.showcase.badgeSuccess')}</Badge>
          <Badge variant="warning">{t('app.showcase.badgeWarning')}</Badge>
          <Badge variant="danger">{t('app.showcase.badgeDanger')}</Badge>
          <Badge variant="info">{t('app.showcase.badgeInfo')}</Badge>
          <Avatar fallback="CR" />
        </div>
      </Section>

      <Section id="sec-alerts" title={t('app.showcase.alerts')}>
        <div className="grid gap-3">
          <Alert variant="info" title={t('app.showcase.alertInfoTitle')}>
            {t('app.showcase.alertInfo')}
          </Alert>
          <Alert variant="success" title={t('app.showcase.alertSuccessTitle')}>
            {t('app.showcase.alertSuccess')}
          </Alert>
          <Alert variant="warning" title={t('app.showcase.alertWarningTitle')}>
            {t('app.showcase.alertWarning')}
          </Alert>
          <Alert variant="danger" title={t('app.showcase.alertDangerTitle')}>
            {t('app.showcase.alertDanger')}
          </Alert>
        </div>
      </Section>

      <Section id="sec-overlays" title={t('app.showcase.overlays')}>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t('app.showcase.openDialog')}</Button>
            </DialogTrigger>
            <DialogContent closeLabel={t('common.close')}>
              <DialogTitle>{t('app.showcase.dialogTitle')}</DialogTitle>
              <DialogDescription>{t('app.showcase.dialogText')}</DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{t('common.cancel')}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>{t('app.showcase.confirm')}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">{t('app.showcase.openMenu')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>{t('app.showcase.menuOne')}</DropdownMenuItem>
              <DropdownMenuItem>{t('app.showcase.menuTwo')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('app.showcase.tooltipLabel')}>
                <HelpCircle aria-hidden="true" className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('app.showcase.tooltipText')}</TooltipContent>
          </Tooltip>
        </div>

        <Tabs defaultValue="one" className="mt-6">
          <TabsList aria-label={t('app.showcase.overlays')}>
            <TabsTrigger value="one">{t('app.showcase.tabOne')}</TabsTrigger>
            <TabsTrigger value="two">{t('app.showcase.tabTwo')}</TabsTrigger>
            <TabsTrigger value="three">{t('app.showcase.tabThree')}</TabsTrigger>
          </TabsList>
          <TabsContent value="one">{t('app.showcase.tabOneText')}</TabsContent>
          <TabsContent value="two">{t('app.showcase.tabTwoText')}</TabsContent>
          <TabsContent value="three">{t('app.showcase.tabThreeText')}</TabsContent>
        </Tabs>
      </Section>

      <Section id="sec-toasts" title={t('app.showcase.toasts')}>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => toast.success(t('app.showcase.toastSuccessText'))}
          >
            {t('app.showcase.toastSuccess')}
          </Button>
          <Button variant="secondary" onClick={() => toast.error(t('app.showcase.toastErrorText'))}>
            {t('app.showcase.toastError')}
          </Button>
        </div>
      </Section>

      <Section id="sec-states" title={t('app.showcase.states')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card aria-busy="true">
            <CardHeader>
              <CardTitle>{s('skeletonCard')}</CardTitle>
              <CardDescription>
                <Spinner label={t('app.showcase.spinnerLabel')} />
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          <EmptyState
            icon={<FolderPlus className="size-7" />}
            title={t('app.showcase.emptyTitle')}
            description={t('app.showcase.emptyText')}
            action={<Button variant="secondary">{t('app.showcase.emptyAction')}</Button>}
          />
          <div className="lg:col-span-2">
            <RetryDemo />
          </div>
        </div>
      </Section>

      <Section id="sec-form" title={t('app.showcase.form')}>
        <p className="mb-5 text-fg-muted">{t('app.showcase.formIntro')}</p>
        <ContactForm />
      </Section>
    </motion.div>
  );
}
