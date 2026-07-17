import { Modal } from '@/components/ui/Modal'

// A small yes/no confirmation dialog. Used before destructive actions (delete an event, etc.).
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}) {
  if (!open) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">{cancelLabel}</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`${danger ? 'btn-danger' : 'btn-primary'} px-4 py-1.5 text-sm`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body && <p className="text-sm text-slate-300">{body}</p>}
    </Modal>
  )
}
