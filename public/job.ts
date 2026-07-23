import { formatBytes } from './lib/format';

interface ImageMeta {
  filename: string;
  size: number;
  width?: number;
  height?: number;
}

interface JobDetail {
  jobId: string;
  originalName: string;
  transparent: ImageMeta[];
  opaque: ImageMeta[];
}

interface LightboxState {
  subfolder: string;
  files: ImageMeta[];
  index: number;
}

const jobId = new URLSearchParams(location.search).get('id');

const lightbox = document.getElementById('lightbox') as HTMLDivElement;
const lightboxImage = document.getElementById('lightbox-image') as HTMLImageElement;
const lightboxDownload = document.getElementById('lightbox-download') as HTMLAnchorElement;
const lightboxDelete = document.getElementById('lightbox-delete') as HTMLButtonElement;
const lightboxClose = document.getElementById('lightbox-close') as HTMLButtonElement;
const lightboxPrev = document.getElementById('lightbox-prev') as HTMLButtonElement;
const lightboxNext = document.getElementById('lightbox-next') as HTMLButtonElement;
const jobToolbar = document.getElementById('job-toolbar') as HTMLDivElement;

let lightboxState: LightboxState | null = null;
let originalName = '';
let transparentFiles: ImageMeta[] = [];
let opaqueFiles: ImageMeta[] = [];
const selected = new Set<string>();

const selectionKey = (subfolder: string, filename: string): string => `${subfolder}::${filename}`;

const filesFor = (subfolder: string): ImageMeta[] =>
  subfolder === 'transparent' ? transparentFiles : opaqueFiles;

const totalFileCount = (): number => transparentFiles.length + opaqueFiles.length;

const deleteJob = async (): Promise<void> => {
  if (!confirm('Delete this job?')) {
    return;
  }

  await fetch(`/jobs/${jobId}`, { method: 'DELETE' });
  location.href = '/jobs.html';
};

const downloadSelected = async (): Promise<void> => {
  const files = [...selected].map((key) => {
    const [subfolder, filename] = key.split('::');

    return { subfolder, filename };
  });

  const res = await fetch(`/jobs/${jobId}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${originalName.replace(/\.pdf$/i, '')}-selected.zip`;
  link.click();
  URL.revokeObjectURL(url);
};

const deleteSelected = async (): Promise<void> => {
  if (selected.size === totalFileCount()) {
    await deleteJob();

    return;
  }

  if (!confirm(`Delete ${selected.size} selected image(s)?`)) {
    return;
  }

  const keys = [...selected];

  await Promise.all(
    keys.map((key) => {
      const [subfolder, filename] = key.split('::');

      return fetch(`/jobs/${jobId}/files/${subfolder}/${filename}`, { method: 'DELETE' });
    }),
  );

  for (const key of keys) {
    const [subfolder, filename] = key.split('::');

    removeCard(subfolder, filename);
  }

  renderToolbar();
};

const toggleSelectAll = (): void => {
  const checkboxes = document.querySelectorAll<HTMLInputElement>('.thumb-select');
  const shouldSelectAll = selected.size < checkboxes.length;

  checkboxes.forEach((checkbox) => {
    checkbox.checked = shouldSelectAll;
    checkbox.dispatchEvent(new Event('change'));
  });
};

const renderToolbar = (): void => {
  const total = totalFileCount();
  const count = selected.size;
  const allSelected = total > 0 && count === total;
  const toggleLabel = allSelected ? 'Clear selection' : 'Select all';

  document.body.classList.toggle('selecting', count > 0);

  if (count === 0) {
    jobToolbar.innerHTML = `
      <span class="toolbar-count">${total} image${total === 1 ? '' : 's'}</span>
      <div class="toolbar-actions">
        <button id="toggle-select-all" class="btn btn-secondary" type="button">${toggleLabel}</button>
        <a href="/jobs/${jobId}/download" class="btn btn-secondary">Download all</a>
        <button id="delete-job" class="btn btn-danger" type="button">Delete all</button>
      </div>
    `;

    const toggleSelectAllButton = document.getElementById('toggle-select-all') as HTMLButtonElement;
    const deleteJobButton = document.getElementById('delete-job') as HTMLButtonElement;

    toggleSelectAllButton.addEventListener('click', toggleSelectAll);
    deleteJobButton.addEventListener('click', deleteJob);

    return;
  }

  jobToolbar.innerHTML = `
    <span class="toolbar-count">${count} of ${total} selected</span>
    <div class="toolbar-actions">
      <button id="toggle-select-all" class="btn btn-secondary" type="button">${toggleLabel}</button>
      <button id="download-selected" class="btn btn-secondary" type="button">Download selected</button>
      <button id="delete-selected" class="btn btn-danger" type="button">Delete selected</button>
    </div>
  `;

  const toggleSelectAllButton = document.getElementById('toggle-select-all') as HTMLButtonElement;
  const downloadSelectedButton = document.getElementById('download-selected') as HTMLButtonElement;
  const deleteSelectedButton = document.getElementById('delete-selected') as HTMLButtonElement;

  toggleSelectAllButton.addEventListener('click', toggleSelectAll);
  downloadSelectedButton.addEventListener('click', downloadSelected);
  deleteSelectedButton.addEventListener('click', deleteSelected);
};

const removeCard = (subfolder: string, filename: string): void => {
  const list = filesFor(subfolder);
  const index = list.findIndex((file) => file.filename === filename);

  if (index !== -1) {
    list.splice(index, 1);
  }

  document.querySelector(`[data-filename="${filename}"]`)?.remove();
  selected.delete(selectionKey(subfolder, filename));
};

const renderLightbox = (): void => {
  if (!lightboxState) {
    return;
  }

  const file = lightboxState.files[lightboxState.index];
  const src = `/jobs/${jobId}/files/${lightboxState.subfolder}/${file.filename}`;

  lightboxImage.src = src;
  lightboxImage.alt = file.filename;
  lightboxDownload.href = src;
};

const openLightbox = (subfolder: string, files: ImageMeta[], index: number): void => {
  lightboxState = { subfolder, files, index };
  lightbox.hidden = false;
  renderLightbox();
};

const closeLightbox = (): void => {
  lightboxState = null;
  lightbox.hidden = true;
};

const stepLightbox = (delta: number): void => {
  if (!lightboxState) {
    return;
  }

  const count = lightboxState.files.length;

  lightboxState.index = (lightboxState.index + delta + count) % count;
  renderLightbox();
};

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => stepLightbox(-1));
lightboxNext.addEventListener('click', () => stepLightbox(1));

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (event) => {
  if (lightbox.hidden) {
    return;
  }

  if (event.key === 'Escape') {
    closeLightbox();
  } else if (event.key === 'ArrowLeft') {
    stepLightbox(-1);
  } else if (event.key === 'ArrowRight') {
    stepLightbox(1);
  }
});

lightboxDelete.addEventListener('click', async () => {
  if (!lightboxState) {
    return;
  }

  const { subfolder, files, index } = lightboxState;
  const file = files[index];

  await fetch(`/jobs/${jobId}/files/${subfolder}/${file.filename}`, { method: 'DELETE' });
  removeCard(subfolder, file.filename);
  renderToolbar();

  if (files.length === 0) {
    closeLightbox();

    return;
  }

  lightboxState.index = index % files.length;
  renderLightbox();
});

const renderGrid = (container: HTMLElement, subfolder: string, files: ImageMeta[]): void => {
  container.innerHTML = '';

  for (const file of files) {
    const src = `/jobs/${jobId}/files/${subfolder}/${file.filename}`;
    const resolution = file.width && file.height ? `${file.width}×${file.height}` : null;
    const wrapper = document.createElement('div');

    wrapper.className = 'thumb-card';
    wrapper.dataset.filename = file.filename;
    wrapper.innerHTML = `
      <input type="checkbox" class="thumb-select" aria-label="Select ${file.filename}" />
      <img src="${src}" loading="lazy" alt="${file.filename}" />
      <div class="thumb-meta">
        ${resolution ? `<div class="thumb-meta-resolution">${resolution}</div>` : ''}
        <div class="thumb-meta-size">${formatBytes(file.size)}</div>
      </div>
      <div class="thumb-overlay">
        <a href="${src}" download class="btn btn-icon" aria-label="Download">&#8595;</a>
        <button type="button" class="btn btn-icon delete-button" aria-label="Delete">&times;</button>
      </div>
    `;

    const checkbox = wrapper.querySelector('.thumb-select') as HTMLInputElement;

    checkbox.addEventListener('change', () => {
      const key = selectionKey(subfolder, file.filename);

      if (checkbox.checked) {
        selected.add(key);
      } else {
        selected.delete(key);
      }

      renderToolbar();
    });

    const image = wrapper.querySelector('img') as HTMLImageElement;

    image.addEventListener('click', () => {
      if (selected.size > 0) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));

        return;
      }

      openLightbox(subfolder, files, files.indexOf(file));
    });

    const deleteButton = wrapper.querySelector('.delete-button') as HTMLButtonElement;

    deleteButton.addEventListener('click', async () => {
      await fetch(`/jobs/${jobId}/files/${subfolder}/${file.filename}`, { method: 'DELETE' });
      removeCard(subfolder, file.filename);
      renderToolbar();
    });
    container.appendChild(wrapper);
  }
};

const jobTitle = document.getElementById('job-title') as HTMLHeadingElement;
const transparentGrid = document.getElementById('transparent-grid') as HTMLDivElement;
const opaqueGrid = document.getElementById('opaque-grid') as HTMLDivElement;

const load = async (): Promise<void> => {
  const res = await fetch(`/jobs/${jobId}`);
  const job = (await res.json()) as JobDetail;

  originalName = job.originalName;
  jobTitle.textContent = job.originalName;
  transparentFiles = job.transparent || [];
  opaqueFiles = job.opaque || [];
  renderGrid(transparentGrid, 'transparent', transparentFiles);
  renderGrid(opaqueGrid, 'opaque', opaqueFiles);
  renderToolbar();
};

load();
