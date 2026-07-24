let dialog: HTMLDialogElement | null = null;

const ensureDialog = (): HTMLDialogElement => {
  if (dialog) {
    return dialog;
  }

  dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <p class="confirm-dialog-message"></p>
    <form method="dialog" class="confirm-dialog-actions">
      <button value="cancel" class="btn btn-secondary" type="submit">Cancel</button>
      <button value="confirm" class="btn btn-danger" type="submit">Confirm</button>
    </form>
  `;
  document.body.appendChild(dialog);

  return dialog;
};

export const confirmDialog = (message: string, confirmLabel = 'Confirm'): Promise<boolean> => {
  const el = ensureDialog();
  const messageEl = el.querySelector('.confirm-dialog-message') as HTMLParagraphElement;
  const confirmButton = el.querySelector('[value="confirm"]') as HTMLButtonElement;

  messageEl.textContent = message;
  confirmButton.textContent = confirmLabel;
  el.returnValue = '';

  return new Promise((resolve) => {
    const onClose = (): void => {
      el.removeEventListener('close', onClose);
      resolve(el.returnValue === 'confirm');
    };

    el.addEventListener('close', onClose);
    el.showModal();
  });
};
