interface ExtractResponse {
  jobId: string;
}

interface StatusResponse {
  stage: string | null;
  item: string | null;
  done: boolean;
  error: string | null;
}

const form = document.getElementById('upload-form') as HTMLFormElement;
const progressBox = document.getElementById('progress') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLParagraphElement;
const errorText = document.getElementById('error-text') as HTMLParagraphElement;
const cancelButton = document.getElementById('cancel-button') as HTMLButtonElement;

let currentJobId: string | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const poll = (delay: number): void => {
  pollTimer = setTimeout(async () => {
    const res = await fetch(`/status/${currentJobId}`);
    const status = (await res.json()) as StatusResponse;

    if (status.error) {
      errorText.textContent = `Failed: ${status.error}`;
      progressBox.hidden = true;

      return;
    }

    if (status.done) {
      location.href = `/job.html?id=${currentJobId}`;

      return;
    }

    progressText.textContent = status.item
      ? `${status.stage}: ${status.item}`
      : status.stage || 'Working...';
    poll(Math.min(delay + 2000, 15000));
  }, delay);
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorText.textContent = '';
  const formData = new FormData(form);
  const webpCheckbox = form.elements.namedItem('webp') as HTMLInputElement;

  formData.set('webp', webpCheckbox.checked ? 'true' : 'false');

  const res = await fetch('/extract', { method: 'POST', body: formData });

  if (!res.ok) {
    errorText.textContent = 'Upload failed.';

    return;
  }

  const { jobId } = (await res.json()) as ExtractResponse;

  currentJobId = jobId;
  form.hidden = true;
  progressBox.hidden = false;
  poll(5000);
});

cancelButton.addEventListener('click', async () => {
  if (!currentJobId) {
    return;
  }

  if (pollTimer !== null) {
    clearTimeout(pollTimer);
  }

  await fetch(`/jobs/${currentJobId}`, { method: 'DELETE' });
  location.reload();
});
