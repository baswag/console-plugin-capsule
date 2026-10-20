import { useTranslation } from 'react-i18next';
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';

interface ConfirmModalProps {
  title: string;
  body?: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  /** Shown above the body, e.g. when the confirmed action failed. */
  error?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  variant = 'primary',
  error,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  return (
    <Modal isOpen onClose={busy ? undefined : onCancel} variant="small">
      <ModalHeader title={title} />
      <ModalBody>
        {error && (
          <Alert
            variant="danger"
            title={t('Error')}
            isInline
            className="console-plugin-capsule__alert"
          >
            {error}
          </Alert>
        )}
        {body}
      </ModalBody>
      <ModalFooter>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          isDisabled={busy}
          isLoading={busy}
        >
          {confirmLabel ?? t('Confirm')}
        </Button>
        <Button variant="link" onClick={onCancel} isDisabled={busy}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
