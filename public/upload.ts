import { formatBytes } from './lib/format';

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

interface Config {
  maxUploadBytes: number;
}

const form = document.getElementById('upload-form') as HTMLFormElement;
const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const dropzonePrompt = document.querySelector('.dropzone-prompt') as HTMLParagraphElement;
const dropzoneFile = document.querySelector('.dropzone-file') as HTMLDivElement;
const dropzoneFilename = document.getElementById('dropzone-filename') as HTMLSpanElement;
const dropzoneFilesize = document.getElementById('dropzone-filesize') as HTMLSpanElement;
const dropzoneClear = document.getElementById('dropzone-clear') as HTMLButtonElement;
const dropzoneError = document.getElementById('dropzone-error') as HTMLParagraphElement;
const pdfInput = document.getElementById('pdf-input') as HTMLInputElement;
const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
const progressBox = document.getElementById('progress') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLParagraphElement;
const errorText = document.getElementById('error-text') as HTMLParagraphElement;
const cancelButton = document.getElementById('cancel-button') as HTMLButtonElement;

let currentJobId: string | null = null;
let eventSource: EventSource | null = null;
let maxUploadBytes: number | null = null;

const loadConfig = async (): Promise<void> => {
  const res = await fetch('/config');
  const config = (await res.json()) as Config;

  maxUploadBytes = config.maxUploadBytes;
};

const setDropzoneError = (message: string | null): void => {
  dropzoneError.textContent = message ?? '';
  dropzoneError.hidden = !message;
};

const validateFile = (file: File): string | null => {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return 'Only PDF files are supported.';
  }

  if (maxUploadBytes !== null && file.size > maxUploadBytes) {
    return `File is too large (max ${formatBytes(maxUploadBytes)}).`;
  }

  return null;
};

const clearFile = (): void => {
  pdfInput.value = '';
  dropzonePrompt.hidden = false;
  dropzoneFile.hidden = true;
  submitButton.disabled = true;
  setDropzoneError(null);
};

const applyFile = (file: File | undefined): void => {
  if (!file) {
    clearFile();

    return;
  }

  const validationError = validateFile(file);

  if (validationError) {
    clearFile();
    setDropzoneError(validationError);

    return;
  }

  dropzonePrompt.hidden = true;
  dropzoneFile.hidden = false;
  dropzoneFilename.textContent = file.name;
  dropzoneFilesize.textContent = formatBytes(file.size);
  submitButton.disabled = false;
  setDropzoneError(null);
};

dropzone.addEventListener('click', () => {
  pdfInput.click();
});

dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    pdfInput.click();
  }
});

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('dropzone--active');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dropzone--active');
});

dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('dropzone--active');

  const file = event.dataTransfer?.files[0];

  if (file) {
    const transfer = new DataTransfer();

    transfer.items.add(file);
    pdfInput.files = transfer.files;
  }

  applyFile(file);
});

pdfInput.addEventListener('change', () => {
  applyFile(pdfInput.files?.[0]);
});

dropzoneClear.addEventListener('click', (event) => {
  event.stopPropagation();
  clearFile();
});

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
  submitButton.disabled = true;

  const formData = new FormData(form);
  const webpCheckbox = form.elements.namedItem('webp') as HTMLInputElement;

  formData.set('webp', webpCheckbox.checked ? 'true' : 'false');

  const res = await fetch('/extract', { method: 'POST', body: formData });

  if (!res.ok) {
    errorText.textContent = 'Upload failed.';
    submitButton.disabled = false;

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

loadConfig();
