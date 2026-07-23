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

let lightboxState: LightboxState | null = null;

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

  const card = document.querySelector(`[data-filename="${file.filename}"]`);

  card?.remove();
  files.splice(index, 1);

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

    const image = wrapper.querySelector('img') as HTMLImageElement;

    image.addEventListener('click', () => {
      openLightbox(subfolder, files, files.indexOf(file));
    });

    const deleteButton = wrapper.querySelector('.delete-button') as HTMLButtonElement;

    deleteButton.addEventListener('click', async () => {
      await fetch(`/jobs/${jobId}/files/${subfolder}/${file.filename}`, { method: 'DELETE' });

      const index = files.indexOf(file);

      if (index !== -1) {
        files.splice(index, 1);
      }

      wrapper.remove();
    });
    container.appendChild(wrapper);
  }
};

const jobTitle = document.getElementById('job-title') as HTMLHeadingElement;
const downloadAll = document.getElementById('download-all') as HTMLAnchorElement;
const transparentGrid = document.getElementById('transparent-grid') as HTMLDivElement;
const opaqueGrid = document.getElementById('opaque-grid') as HTMLDivElement;
const deleteJobButton = document.getElementById('delete-job') as HTMLButtonElement;

const load = async (): Promise<void> => {
  const res = await fetch(`/jobs/${jobId}`);
  const job = (await res.json()) as JobDetail;

  jobTitle.textContent = job.originalName;
  downloadAll.href = `/jobs/${jobId}/download`;
  renderGrid(transparentGrid, 'transparent', job.transparent || []);
  renderGrid(opaqueGrid, 'opaque', job.opaque || []);
};

deleteJobButton.addEventListener('click', async () => {
  if (!confirm('Delete this job?')) {
    return;
  }

  await fetch(`/jobs/${jobId}`, { method: 'DELETE' });
  location.href = '/jobs.html';
});

load();
