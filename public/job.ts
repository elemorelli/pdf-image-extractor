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

const jobId = new URLSearchParams(location.search).get('id');

const renderGrid = (container: HTMLElement, subfolder: string, files: ImageMeta[]): void => {
  container.innerHTML = '';

  for (const file of files) {
    const src = `/jobs/${jobId}/files/${subfolder}/${file.filename}`;
    const dimensions = file.width && file.height ? `${file.width}×${file.height} · ` : '';
    const wrapper = document.createElement('div');

    wrapper.className = 'thumb-card';
    wrapper.dataset.filename = file.filename;
    wrapper.innerHTML = `
      <img src="${src}" loading="lazy" alt="${file.filename}" />
      <div class="thumb-meta">${dimensions}${formatBytes(file.size)}</div>
      <div class="thumb-overlay">
        <a href="${src}" download class="btn btn-icon" aria-label="Download">&#8595;</a>
        <button type="button" class="btn btn-icon delete-button" aria-label="Delete">&times;</button>
      </div>
    `;

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
