interface ExtractResponse {
  jobId: string;
}

interface StageProgress {
  done: number;
  total: number;
}

interface StatusEvent {
  stage: string | null;
  progress: StageProgress | null;
  done: boolean;
  error: string | null;
}

const form = document.getElementById('upload-form') as HTMLFormElement;
const progressBox = document.getElementById('progress') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLParagraphElement;
const errorText = document.getElementById('error-text') as HTMLParagraphElement;
const cancelButton = document.getElementById('cancel-button') as HTMLButtonElement;

let currentJobId: string | null = null;
let eventSource: EventSource | null = null;

const closeStream = (): void => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const startStream = (jobId: string): void => {
  eventSource = new EventSource(`/status/${jobId}/stream`);

  eventSource.onmessage = (event) => {
    const status = JSON.parse(event.data) as StatusEvent;

    if (status.error) {
      errorText.textContent = `Failed: ${status.error}`;
      progressBox.hidden = true;
      closeStream();

      return;
    }

    if (status.done) {
      closeStream();
      location.href = `/job.html?id=${jobId}`;

      return;
    }

    const itemLabel = status.progress ? `${status.progress.done}/${status.progress.total}` : null;

    progressText.textContent = itemLabel
      ? `${status.stage}: ${itemLabel}`
      : status.stage || 'Working...';
  };

  eventSource.onerror = () => {
    closeStream();
  };
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
  startStream(jobId);
});

cancelButton.addEventListener('click', async () => {
  if (!currentJobId) {
    return;
  }

  closeStream();
  await fetch(`/jobs/${currentJobId}`, { method: 'DELETE' });
  location.reload();
});
